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

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

  const summary = {
    enforcedFiles: enforcedGlobs.length,
    enforcedRoutes: enforcedRoutes.length,
    inventoryOnly: (ledger.inventoryOnly ?? []).length,
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
