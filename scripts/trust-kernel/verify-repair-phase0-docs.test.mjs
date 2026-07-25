import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateRepairPhase0Docs, REQUIRED_DOC_BASES } from './verify-repair-phase0-docs.mjs';

const THREAT_TABLE = [
  '## 4. Threat model',
  '',
  '| Threat | Control | Negative test |',
  '|---|---|---|',
  '| Identity spoofing | verified bearer | t1 |',
].join('\n');

function goodDoc(extra = '') {
  return [
    '# Repair Intelligence Phase 0',
    '',
    'Phase 0 exit: PENDING_OWNER_REVIEW',
    'Expert Label Protocol: PROPOSED / NOT RUN',
    'Gate B: NOT PASSED',
    'Immutable infrastructure: NOT CLAIMED',
    'Phase 1A-3 capabilities: DISABLED',
    '',
    THREAT_TABLE,
    extra,
    '',
  ].join('\n');
}

function writeCompleteSet(dir, mutate = () => {}) {
  const files = {};
  for (const base of REQUIRED_DOC_BASES) {
    for (const lang of ['en', 'th']) {
      files[`${base}.${lang}.md`] = goodDoc();
      files[`${base}.${lang}.html`] = '<!doctype html><html><body>rendered</body></html>';
    }
  }
  mutate(files);
  for (const [name, content] of Object.entries(files)) {
    if (content !== null) writeFileSync(join(dir, name), content, 'utf8');
  }
  return dir;
}

function inTemp(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'repair-docs-'));
  try {
    writeCompleteSet(dir, mutate);
    return validateRepairPhase0Docs(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('accepts a complete bilingual set', () => {
  assert.deepEqual(inTemp(() => {}), []);
});

test('rejects a missing Thai file', () => {
  const errors = inTemp((files) => {
    files[`${REQUIRED_DOC_BASES[0]}.th.md`] = null;
  });
  assert.ok(errors.some((e) => e.includes('.th.md') && e.includes('missing')));
});

test('rejects a missing HTML file', () => {
  const errors = inTemp((files) => {
    files[`${REQUIRED_DOC_BASES[1]}.en.html`] = null;
  });
  assert.ok(errors.some((e) => e.includes('.en.html') && e.includes('missing')));
});

test('rejects a document without PENDING_OWNER_REVIEW', () => {
  const errors = inTemp((files) => {
    files[`${REQUIRED_DOC_BASES[0]}.en.md`] = goodDoc().replace('PENDING_OWNER_REVIEW', 'APPROVED');
  });
  assert.ok(errors.some((e) => e.includes('PENDING_OWNER_REVIEW')));
});

test('rejects a control pack without a threat table', () => {
  const errors = inTemp((files) => {
    files[`${REQUIRED_DOC_BASES[0]}.en.md`] = goodDoc().replace(THREAT_TABLE, '## 4. Threat model\n(none)');
  });
  assert.ok(errors.some((e) => e.toLowerCase().includes('threat')));
});

test('rejects any positive Gate B completion claim', () => {
  const errors = inTemp((files) => {
    files[`${REQUIRED_DOC_BASES[0]}.en.md`] = goodDoc('Gate B: PASSED');
  });
  assert.ok(errors.some((e) => e.includes('Gate B')));
});
