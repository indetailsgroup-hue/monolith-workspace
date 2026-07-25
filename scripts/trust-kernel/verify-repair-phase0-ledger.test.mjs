import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRepairPhase0Ledger } from './verify-repair-phase0-ledger.mjs';

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
