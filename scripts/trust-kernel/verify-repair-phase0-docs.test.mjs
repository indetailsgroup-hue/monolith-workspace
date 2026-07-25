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

// A non-trivial HTML edition: the verifier requires the HTML to carry the same
// status lines as the Markdown (a rendered edition, not an empty placeholder).
function goodHtml() {
  return `<!doctype html><html><body><main>${goodDoc()
    .split('\n').map((l) => `<p>${l}</p>`).join('')}</main></body></html>`;
}

function writeCompleteSet(dir, mutate = () => {}) {
  const files = {};
  for (const base of REQUIRED_DOC_BASES) {
    for (const lang of ['en', 'th']) {
      files[`${base}.${lang}.md`] = goodDoc();
      files[`${base}.${lang}.html`] = goodHtml();
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

test('rejects an empty HTML edition (not a rendered document)', () => {
  const errors = inTemp((files) => {
    files[`${REQUIRED_DOC_BASES[0]}.en.html`] = '';
  });
  assert.ok(errors.some((e) => e.toLowerCase().includes('html')));
});

test('rejects an HTML edition missing the Markdown status lines', () => {
  const errors = inTemp((files) => {
    files[`${REQUIRED_DOC_BASES[0]}.en.html`] = '<!doctype html><html><body>unrelated content</body></html>';
  });
  assert.ok(errors.some((e) => e.toLowerCase().includes('html')));
});

test('rejects a hostile Gate B claim hidden only in the HTML edition', () => {
  const errors = inTemp((files) => {
    files[`${REQUIRED_DOC_BASES[0]}.en.html`] = goodHtml().replace('</main>', '<p>Gate B: PASSED</p></main>');
  });
  assert.ok(errors.some((e) => e.includes('Gate B')));
});

test('rejects widened forbidden verbs (cleared / GA release / signed off)', () => {
  for (const phrase of ['Gate B cleared', 'Phase 0 GA release', 'Gate B signed off']) {
    const errors = inTemp((files) => {
      files[`${REQUIRED_DOC_BASES[0]}.en.md`] = goodDoc(phrase);
    });
    assert.ok(errors.length > 0, `expected rejection for "${phrase}"`);
  }
});
