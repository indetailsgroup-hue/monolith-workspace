// Semantic cross-file governance status gate (FS-2026-07-18 B1-01).
//
// Byte-exact manifests prove each bundle's internal integrity, but they cannot
// see when two bundles on the SAME checkout tell different stories (the
// split-brain that Full-System Scrutiny 2026-07-18 found: spec APPROVED while
// the checklist next to it still said PENDING). This test reads the actual
// status surfaces — spec, sign-off checklist, task ledger, anchor file — and
// asserts they agree, so a checkout is either consistently pre-approval or
// consistently post-approval, never a mix.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const SPEC = 'docs/specs/s17-canonical-packet-spec-v1.th.md';
const CHECKLIST = 'docs/governance/ct-dec-002-signoff-checklist.th.md';
const LEDGER = '.kiro/specs/installation-pm/tasks.md';
const ANCHOR_FILE = 'monolith-s17-v041-review-input.sha256';
// anchor v3 — the exact manifest the Security Owner signed (43 files)
const ANCHOR_V3 = 'f7b35734bc3283e7fcc8a27b1842119178f79d2179fcfde1983e44e3e6381a16';

async function read(rel) {
  return readFile(join(repoRoot, rel), 'utf8');
}

test('CT-DEC-002 status surfaces agree on one story per checkout', async () => {
  const spec = await read(SPEC);
  const checklist = await read(CHECKLIST);
  const ledger = await read(LEDGER);

  const specApproved = /สถานะ:\s*\*\*APPROVED/u.test(spec);
  const signedRoles = (checklist.match(/\|\s*SIGNED/gu) ?? []).length;
  const checklistSigned = signedRoles >= 3;
  const ledgerRow = (id) => ledger.split('\n').find((l) => new RegExp(`^-\\s*\\[[ x~]\\]\\s*${id}\\b`, 'u').test(l));
  const s17_3Line = ledgerRow('S17-3');
  assert.ok(s17_3Line, 'ledger must contain an S17-3 checkbox row');
  const ledgerApproved = s17_3Line.includes('[x]') && s17_3Line.includes('APPROVED');
  const trackBUnlocked = /UNLOCKED/u.test(ledgerRow('S17-4') ?? '') && /UNLOCKED/u.test(ledgerRow('S17-5') ?? '');

  if (specApproved || checklistSigned || ledgerApproved || trackBUnlocked) {
    // post-approval story: every surface must say so
    assert.ok(specApproved, 'spec must be APPROVED when any surface claims approval');
    assert.ok(
      checklistSigned,
      `sign-off checklist must show 3 SIGNED roles (found ${signedRoles}) when spec/ledger claim approval — split-brain (B1-01)`,
    );
    assert.ok(ledgerApproved, 'ledger S17-3 must be closed [x] APPROVED when spec/checklist claim approval');
    assert.ok(trackBUnlocked, 'ledger S17-4/S17-5 must be UNLOCKED when CT-DEC-002 is approved');
  }
  // pre-approval story (all false) is also self-consistent — nothing to assert
});

test('anchor file in tree is the signed anchor v3 the approval record cites', async () => {
  const spec = await read(SPEC);
  if (!/สถานะ:\s*\*\*APPROVED/u.test(spec)) return; // pre-approval checkout
  assert.ok(
    spec.includes(ANCHOR_V3),
    'approved spec must embed the anchor v3 hash in its approval record',
  );
  const anchorBytes = await readFile(join(repoRoot, ANCHOR_FILE));
  const actual = createHash('sha256').update(anchorBytes).digest('hex');
  assert.equal(
    actual,
    ANCHOR_V3,
    `${ANCHOR_FILE} must be the signed anchor v3 manifest, not a stale pre-signing version`,
  );
});

test('signed checklist cites the same anchor v3 as the spec approval record', async () => {
  const checklist = await read(CHECKLIST);
  if (!(checklist.match(/\|\s*SIGNED/gu) ?? []).length) return; // pre-signing checkout
  assert.ok(
    checklist.includes(ANCHOR_V3),
    'signed checklist must reference anchor v3 (Security Owner signing surface)',
  );
});
