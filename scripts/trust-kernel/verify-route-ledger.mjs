#!/usr/bin/env node
/**
 * verify-route-ledger.mjs — enforce the route disposition ledger (design §15.2,
 * plan Task 11). Exits NON-ZERO when:
 *   - the discovered surface files and the ledgered surface files differ
 *     (an undeclared reachable surface, or a stale ledger entry);
 *   - mutable release authority is duplicated (more than one holder);
 *   - a forbidden pattern is reachable: a client actor-role header, a reusable
 *     signed URL for P2, a client packet upload, or a client-side P2 download;
 *   - a required containment marker is missing.
 *
 * It scans only the DECLARED enforced globs (the surfaces this task governs). The
 * `inventoryOnly` entries record dispositions for surfaces outside Task 11's file
 * scope (carried to Task 12) and are not scanned.
 *
 * Usage:  node scripts/trust-kernel/verify-route-ledger.mjs
 * Exit:   0 on a complete, contained ledger; 1 on any violation; 2 on a load error.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ledgerPath = join(repoRoot, 'docs', 'governance', 'trust-kernel-route-disposition.json');

function loadLedger() {
  try {
    return JSON.parse(readFileSync(ledgerPath, 'utf-8'));
  } catch (e) {
    process.stderr.write(`route-ledger: cannot load ${ledgerPath}: ${e.message}\n`);
    process.exit(2);
  }
}

function readFile(rel) {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf-8');
}

function main() {
  const ledger = loadLedger();
  const violations = [];
  const enforcedRoutes = (ledger.routes ?? []).filter((r) => r.enforced);
  const enforcedGlobs = ledger.enforcedGlobs ?? [];
  const surfaceSignatures = (ledger.surfaceSignatures ?? []).map((s) => new RegExp(s));

  // Cache the source of every declared enforced file.
  const source = new Map();
  for (const file of enforcedGlobs) {
    const text = readFile(file);
    if (text === null) {
      violations.push(`declared enforced file is missing from disk: ${file}`);
      continue;
    }
    source.set(file, text);
  }

  // (1) Presence: every enforced route's marker must exist in its declared file.
  for (const r of enforcedRoutes) {
    const text = source.get(r.file);
    if (text === undefined) {
      violations.push(`route "${r.id}" targets a file not in enforcedGlobs: ${r.file}`);
      continue;
    }
    if (r.presenceMarker && !text.includes(r.presenceMarker)) {
      violations.push(`stale ledger entry: route "${r.id}" marker not found in ${r.file}: ${r.presenceMarker}`);
    }
    if (!r.owner) violations.push(`route "${r.id}" is missing an owner`);
    if (!['REUSE', 'ADAPT', 'READ_ONLY', 'BLOCK'].includes(r.disposition)) {
      violations.push(`route "${r.id}" has an invalid disposition: ${r.disposition}`);
    }
    if (!r.negativeTestId) violations.push(`route "${r.id}" is missing a negativeTestId`);
  }

  // (2) Coverage: discovered surface files == ledgered surface files.
  const ledgeredFiles = new Set(enforcedRoutes.map((r) => r.file));
  const discoveredFiles = new Set();
  for (const [file, text] of source) {
    if (surfaceSignatures.some((re) => re.test(text))) discoveredFiles.add(file);
  }
  for (const f of discoveredFiles) {
    if (!ledgeredFiles.has(f)) violations.push(`discovered surface has no enforced ledger entry: ${f}`);
  }
  for (const f of ledgeredFiles) {
    if (!discoveredFiles.has(f)) violations.push(`ledgered surface exposes no discoverable signature (stale): ${f}`);
  }

  // (3) Forbidden tripwires: a matching pattern is a reachable containment breach.
  for (const fb of ledger.forbidden ?? []) {
    const re = new RegExp(fb.pattern, fb.flags ?? '');
    for (const file of fb.files ?? []) {
      const text = source.get(file) ?? readFile(file);
      if (text === null || text === undefined) continue;
      if (re.test(text)) {
        violations.push(`FORBIDDEN "${fb.id}" reachable in ${file} (/${fb.pattern}/): ${fb.description}`);
      }
    }
  }

  // (4) Required markers: a missing marker means containment was not applied.
  for (const rm of ledger.requiredMarkers ?? []) {
    const text = source.get(rm.file) ?? readFile(rm.file);
    if (text === null || text === undefined) {
      violations.push(`required-marker file missing: ${rm.file}`);
      continue;
    }
    if (!new RegExp(rm.pattern).test(text)) {
      violations.push(`required containment marker "${rm.id}" absent from ${rm.file}: ${rm.pattern}`);
    }
  }

  // (5) Duplicate mutable authority: at most one enforced holder of RELEASE_MUTABLE.
  const mutable = [...new Set(enforcedRoutes.filter((r) => r.authority === 'RELEASE_MUTABLE').map((r) => r.file))];
  if (mutable.length > 1) {
    violations.push(`duplicate mutable release authority across: ${mutable.join(', ')}`);
  }
  if (mutable.length === 0) {
    violations.push('no route holds the mutable release authority (RELEASE_MUTABLE) — the single authority must be declared');
  }

  // (6) No deferred containment may remain (Task 12 closure). An inventoryOnly BLOCK
  // surface whose negativeTestId is still "deferred:*" is a carried-forward P2 surface
  // that was never actively contained. Task 12 closed the src/core/api export
  // subsystem deferral, so any remaining deferral is a coverage gap and fails closed.
  for (const io of ledger.inventoryOnly ?? []) {
    if (typeof io.negativeTestId === 'string' && io.negativeTestId.startsWith('deferred:')) {
      violations.push(
        `unclosed deferred containment: inventoryOnly "${io.id}" (${io.file}) is still deferred (${io.negativeTestId}); it must be promoted to an enforced route`,
      );
    }
  }

  // (7) OPEN-WORLD egress sweep (C13). The checks above are CLOSED-WORLD — they only see
  // files declared in enforcedGlobs, so a NEW reachable browser-download egress file is
  // invisible. Scan the WHOLE src tree for the byte-to-human download signature (a blob
  // object URL + an anchor `download` + a `.click()`) and FAIL if any such file is not
  // accounted for: enforced, inventoried, or recorded in the reviewed knownEgressFiles
  // baseline. A brand-new egress file appears in none of those and is caught.
  const srcRoot = join(repoRoot, 'src');
  const accountedEgress = new Set([
    ...enforcedGlobs,
    ...(ledger.knownEgressFiles ?? []),
    ...(ledger.inventoryOnly ?? []).map((io) => io.file),
  ]);
  const isEgressSource = (text) =>
    /URL\.createObjectURL\s*\(/.test(text) && /\.download\s*=/.test(text) && /\.click\s*\(\s*\)/.test(text);
  const collectSources = (dir) => {
    let out = [];
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'dist' || e.name === '__tests__') continue;
        out = out.concat(collectSources(abs));
      } else if (/\.[tj]sx?$/.test(e.name) && !/\.(test|spec)\.[tj]sx?$/.test(e.name)) {
        out.push(abs);
      }
    }
    return out;
  };
  for (const abs of collectSources(srcRoot)) {
    const rel = relative(repoRoot, abs).split(sep).join('/');
    let text;
    try {
      text = readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    if (!isEgressSource(text)) continue;
    if (!accountedEgress.has(rel)) {
      violations.push(
        `open-world egress: reachable browser-download egress in ${rel} is not in the route ledger ` +
          '(enforce it with a containment guard, or record it in knownEgressFiles after review)',
      );
    }
  }

  // (8) OPEN-WORLD Repair Phase 0 sweep. A NEW /repair route, a client-selected
  // raw_uri, or a direct /artifacts/:sha256 byte surface must never appear
  // without a disposition: every matching non-test source file must be
  // enforced, inventoried, or consciously recorded in the reviewed
  // reviewedRepairSurfaceFiles baseline (fail closed otherwise).
  const repairPatterns = [
    { id: 'repair-route', re: /['"`]\/repair\b/ },
    { id: 'raw-uri', re: /raw_uri/ },
    { id: 'artifact-hash-route', re: /\/artifacts\/:sha256/ },
  ];
  // A server-side Express byte route is any non-test source that both defines an
  // HTTP route (router.get/app.get/…) AND writes raw bytes back (res.send with a
  // non-JSON payload). Such a file must be either phase0-guarded (contains the
  // shared guard marker) or consciously recorded in the reviewed baseline —
  // otherwise it is a reachable, un-dispositioned client byte egress (review #2).
  const definesHttpRoute = (t) => /\b(?:router|app)\.(?:get|post|put|patch|delete|head)\s*\(/.test(t);
  const sendsRawBytes = (t) => /\bres\.send\s*\(/.test(t);
  const hasPhase0Guard = (t) => /phase0LegacyBlocked|phase0Blocked|REPAIR_PHASE_NOT_ENABLED/.test(t);
  const accountedRepair = new Set([
    ...enforcedGlobs,
    ...(ledger.reviewedRepairSurfaceFiles ?? []),
    ...(ledger.inventoryOnly ?? []).map((io) => io.file),
    ...(ledger.knownEgressFiles ?? []),
  ]);
  const repairRoots = [join(repoRoot, 'src'), join(repoRoot, 'server', 'src'), join(repoRoot, 'supabase', 'functions')];
  for (const root of repairRoots) {
    for (const abs of collectSources(root)) {
      const rel = relative(repoRoot, abs).split(sep).join('/');
      let text;
      try {
        text = readFileSync(abs, 'utf-8');
      } catch {
        continue;
      }
      for (const p of repairPatterns) {
        if (p.re.test(text) && !accountedRepair.has(rel)) {
          violations.push(
            `open-world repair surface: ${rel} matches "${p.id}" but has no route disposition ` +
              '(enforce it with a containment guard, or record it in reviewedRepairSurfaceFiles after review)',
          );
        }
      }
      // Server byte-route sweep: an HTTP route that sends raw bytes must carry
      // the Phase 0 guard or be recorded, unless it is already an enforced route.
      if (rel.startsWith('server/src/') && definesHttpRoute(text) && sendsRawBytes(text)
        && !hasPhase0Guard(text) && !accountedRepair.has(rel)) {
        violations.push(
          `open-world server byte route: ${rel} defines an HTTP route that returns raw bytes (res.send) ` +
            'without the Phase 0 containment guard and without a ledger disposition',
        );
      }
    }
  }

  const summary = {
    enforcedFiles: enforcedGlobs.length,
    enforcedRoutes: enforcedRoutes.length,
    inventoryOnly: (ledger.inventoryOnly ?? []).length,
    knownEgressFiles: (ledger.knownEgressFiles ?? []).length,
    discoveredFiles: discoveredFiles.size,
    mutableAuthorityHolders: mutable,
  };

  if (violations.length > 0) {
    process.stderr.write('ROUTE LEDGER: FAIL\n');
    for (const v of violations) process.stderr.write(`  - ${v}\n`);
    process.stderr.write(`summary: ${JSON.stringify(summary)}\n`);
    process.exit(1);
  }

  process.stdout.write('ROUTE LEDGER: PASS — discovered == ledgered, single authority, no reachable P2/actor breach.\n');
  process.stdout.write(`summary: ${JSON.stringify(summary)}\n`);
  process.exit(0);
}

main();
