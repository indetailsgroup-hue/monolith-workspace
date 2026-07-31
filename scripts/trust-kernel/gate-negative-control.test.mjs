import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertInjectionTargetAbsent,
  suiteHasMinimumPasses,
} from './gate-negative-control-lib.mjs';

test('suite result rejects vacuous output without the required pass floor', () => {
  assert.equal(suiteHasMinimumPasses({ code: 0, out: '# fail 0\n' }, 7), false);
  assert.equal(suiteHasMinimumPasses({ code: 0, out: '# pass 6\n# fail 0\n' }, 7), false);
  assert.equal(suiteHasMinimumPasses({ code: 0, out: '# pass 7\n# fail 0\n' }, 7), true);
});

test('route injection aborts without deleting a pre-existing directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'monolith-negctl-'));
  const leakDir = join(root, 'server', 'src', '__negctl__');
  const marker = join(leakDir, 'user-data.txt');
  mkdirSync(leakDir, { recursive: true });
  writeFileSync(marker, 'preserve me\n', 'utf8');

  try {
    assert.throws(
      () => assertInjectionTargetAbsent(leakDir),
      /refusing to run/i,
    );
    assert.equal(existsSync(marker), true, 'pre-existing user data must remain untouched');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
