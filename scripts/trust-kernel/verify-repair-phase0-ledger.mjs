#!/usr/bin/env node
// Repair Intelligence Phase 0 — capability disposition ledger verifier.
//
// Enforces the exhaustive two-root disposition contract (plan Task 3): every
// auth/data/storage/AI/workflow/finance/export/mobile/BIM/Repair surface in the
// inspected roots carries exactly one RETAIN/ADAPT/RETIRE/BLOCK disposition, an
// accountable owner, a target phase, and a load-bearing negative test. A BLOCK
// without enforcement, a missing category, a missing PRODUCT file, or any claim
// that Phase 0 enables a later-phase capability fails the run (fail closed).

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_CATEGORIES = [
  'AUTH', 'TENANCY', 'DATA', 'STORAGE', 'AI', 'HUMAN_REVIEW',
  'WORKFLOW', 'FINANCE', 'EXPORT_DOWNLOAD', 'MOBILE', 'BIM', 'REPAIR_EXECUTION',
];
export const DISPOSITIONS = new Set(['RETAIN', 'ADAPT', 'RETIRE', 'BLOCK']);

const KNOWN_ROOTS = new Set(['PRODUCT', 'GOVERNANCE', 'SPECIFICATION']);
const APPROVED_PHASES = new Set(['PHASE_0', 'PHASE_1A', 'PHASE_1B', 'PHASE_2', 'PHASE_3']);
const REQUIRED_FIELDS = [
  'id', 'category', 'root', 'path', 'disposition', 'owner', 'targetPhase', 'authority', 'negativeTestId',
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Validate a Repair Phase 0 disposition ledger object.
 * Returns an array of error strings; empty array means the ledger is valid.
 */
export function validateRepairPhase0Ledger(ledger, options = {}) {
  const errors = [];
  const readFile = options.readFile ?? ((p) => readFileSync(resolve(repoRoot, p), 'utf8'));
  const fileExists = options.fileExists ?? ((p) => existsSync(resolve(repoRoot, p)));

  if (!ledger || typeof ledger !== 'object') return ['ledger is not an object'];
  if (ledger.phase !== 'PHASE_0') errors.push(`ledger phase must be PHASE_0, got ${String(ledger.phase)}`);
  if (!Array.isArray(ledger.surfaces)) return [...errors, 'ledger.surfaces is not an array'];

  const seenIds = new Set();
  const seenCategories = new Set();

  for (const surface of ledger.surfaces) {
    const id = typeof surface.id === 'string' ? surface.id : '<missing id>';

    for (const field of REQUIRED_FIELDS) {
      if (typeof surface[field] !== 'string' || surface[field].length === 0) {
        errors.push(`surface ${id}: missing required field ${field}`);
      }
    }

    if (seenIds.has(id)) errors.push(`duplicate surface id ${id}`);
    seenIds.add(id);

    if (surface.category && !REQUIRED_CATEGORIES.includes(surface.category)) {
      errors.push(`surface ${id}: unrecognized category ${surface.category}`);
    }
    if (surface.category) seenCategories.add(surface.category);

    if (surface.root && !KNOWN_ROOTS.has(surface.root)) {
      errors.push(`surface ${id}: unrecognized root ${surface.root}`);
    }

    if (!DISPOSITIONS.has(surface.disposition)) {
      errors.push(`surface ${id}: invalid disposition ${String(surface.disposition)}`);
    }

    if (surface.targetPhase && !APPROVED_PHASES.has(surface.targetPhase)) {
      errors.push(`surface ${id}: targetPhase ${surface.targetPhase} is not an approved phase`);
    }

    if (surface.disposition === 'BLOCK') {
      if (typeof surface.enforcement !== 'string' || surface.enforcement.length === 0
        || typeof surface.negativeTestId !== 'string' || surface.negativeTestId.length === 0) {
        errors.push(`surface ${id}: BLOCK requires enforcement and a negative test`);
      }
    }

    if (surface.disposition === 'ADAPT' && surface.targetPhase && !APPROVED_PHASES.has(surface.targetPhase)) {
      errors.push(`surface ${id}: ADAPT must target an approved phase`);
    }

    // Phase 0 can only deny later-phase capabilities; it can never enable one.
    if (surface.enabledInPhase0 === true && surface.targetPhase && surface.targetPhase !== 'PHASE_0') {
      errors.push(`surface ${id}: Phase 0 cannot enable a ${surface.targetPhase} capability`);
    }

    // Only PRODUCT paths are runtime-scanned; GOVERNANCE and SPECIFICATION
    // entries are frozen evidence references pinned by commit in ledger.roots.
    if (surface.root === 'PRODUCT' && typeof surface.path === 'string' && surface.path.length > 0) {
      if (typeof surface.requiredMarker !== 'string' || surface.requiredMarker.length === 0) {
        errors.push(`surface ${id}: PRODUCT surface requires requiredMarker`);
      } else if (!fileExists(surface.path)) {
        errors.push(`surface ${id}: missing file ${surface.path}`);
      } else {
        let content = '';
        try {
          content = readFile(surface.path);
        } catch (error) {
          errors.push(`surface ${id}: unreadable file ${surface.path} (${String(error)})`);
        }
        if (content && !content.includes(surface.requiredMarker)) {
          errors.push(`surface ${id}: marker "${surface.requiredMarker}" not found in ${surface.path}`);
        }
      }
    }
  }

  for (const category of REQUIRED_CATEGORIES) {
    if (!seenCategories.has(category)) {
      errors.push(`ledger missing category ${category}`);
    }
  }

  return errors;
}

function main() {
  const args = process.argv.slice(2);
  let reportPath = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--report') reportPath = args[i + 1] ?? null;
  }

  const ledgerPath = resolve(repoRoot, 'docs/governance/repair-intelligence-phase0-capability-disposition.json');
  let ledger;
  try {
    ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  } catch (error) {
    console.error(`REPAIR PHASE 0 LEDGER: FAIL — cannot read ledger: ${String(error)}`);
    process.exit(1);
  }

  const errors = validateRepairPhase0Ledger(ledger);
  const categories = [...new Set((ledger.surfaces ?? []).map((s) => s.category).filter(Boolean))].sort();
  const roots = [...new Set((ledger.surfaces ?? []).map((s) => s.root).filter(Boolean))].sort();
  const report = {
    pass: errors.length === 0,
    errors,
    surfaceCount: Array.isArray(ledger.surfaces) ? ledger.surfaces.length : 0,
    categories,
    roots,
  };

  if (reportPath) {
    const target = resolve(repoRoot, reportPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (errors.length > 0) {
    console.error('REPAIR PHASE 0 LEDGER: FAIL');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`REPAIR PHASE 0 LEDGER: PASS — ${report.surfaceCount} surfaces, ${categories.length} categories, roots: ${roots.join(', ')}.`);
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  main();
} else if (process.argv[1] && process.argv[1].endsWith('verify-repair-phase0-ledger.mjs')) {
  main();
}
