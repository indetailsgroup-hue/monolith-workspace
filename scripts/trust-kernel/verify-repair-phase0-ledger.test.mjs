import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRepairPhase0Ledger } from './verify-repair-phase0-ledger.mjs';

const REQUIRED_CATEGORIES_STUB = [
  'AUTH', 'TENANCY', 'DATA', 'STORAGE', 'AI', 'HUMAN_REVIEW',
  'WORKFLOW', 'FINANCE', 'EXPORT_DOWNLOAD', 'MOBILE', 'BIM', 'REPAIR_EXECUTION',
];

const validSurface = {
  id: 'auth.browser-role',
  category: 'AUTH',
  root: 'PRODUCT',
  path: 'src/core/auth/roles.ts',
  disposition: 'BLOCK',
  owner: 'Security/IAM',
  targetPhase: 'PHASE_0',
  authority: 'UI_ONLY',
  requiredMarker: 'localStorage',
  enforcement: 'server identity ignores browser role',
  negativeTestId: 'ledger:no-browser-authority',
};

test('rejects a missing required category', () => {
  const errors = validateRepairPhase0Ledger({
    phase: 'PHASE_0',
    roots: [],
    surfaces: [validSurface],
  });
  assert.ok(errors.some((e) => e.includes('missing category STORAGE')));
});

test('rejects a BLOCK without enforcement and negative test', () => {
  const errors = validateRepairPhase0Ledger({
    phase: 'PHASE_0',
    roots: [],
    surfaces: [{ ...validSurface, enforcement: '', negativeTestId: '' }],
  });
  assert.ok(errors.some((e) => e.includes('BLOCK requires enforcement')));
});

test('rejects dispositions outside RETAIN ADAPT RETIRE BLOCK', () => {
  const errors = validateRepairPhase0Ledger({
    phase: 'PHASE_0',
    roots: [],
    surfaces: [{ ...validSurface, disposition: 'REUSE' }],
  });
  assert.ok(errors.some((e) => e.includes('invalid disposition')));
});

test('rejects a PRODUCT BLOCK whose negativeTestId names no resolvable file', () => {
  const errors = validateRepairPhase0Ledger(
    { phase: 'PHASE_0', roots: [], surfaces: [{ ...validSurface, negativeTestId: 'trust me it is tested' }] },
    { fileExists: () => true, readFile: () => 'localStorage' },
  );
  assert.ok(errors.some((e) => e.includes('resolvable negative-test file')));
});

test('rejects a negativeTestId pointing at a missing file', () => {
  const errors = validateRepairPhase0Ledger(
    { phase: 'PHASE_0', roots: [], surfaces: [{ ...validSurface, negativeTestId: 'server/src/does/not/exist.test.ts' }] },
    { fileExists: (p) => p === 'src/core/auth/roles.ts', readFile: () => 'localStorage' },
  );
  assert.ok(errors.some((e) => e.includes('references a missing file')));
});

test('rejects a RETAIN surface bound to a later phase (would enable it)', () => {
  const errors = validateRepairPhase0Ledger(
    { phase: 'PHASE_0', roots: [], surfaces: [{ ...validSurface, disposition: 'RETAIN', targetPhase: 'PHASE_2', requiredMarker: 'localStorage' }] },
    { fileExists: () => true, readFile: () => 'localStorage' },
  );
  assert.ok(errors.some((e) => e.includes('later-phase capability may only be ADAPT or BLOCK')));
});

test('rejects a ledger that omits a required security-critical surface', () => {
  // A ledger with all categories present but no factory-api entry must fail.
  const surfaces = REQUIRED_CATEGORIES_STUB.map((category, i) => ({
    id: `s${i}`, category, root: 'GOVERNANCE', path: `docs/x${i}.md`,
    disposition: 'BLOCK', owner: 'o', targetPhase: 'PHASE_0', authority: 'NONE',
    enforcement: 'e', negativeTestId: 'docs/x.md',
  }));
  const errors = validateRepairPhase0Ledger({ phase: 'PHASE_0', roots: [], surfaces });
  assert.ok(errors.some((e) => e.includes('omits a required security-critical surface')));
});
