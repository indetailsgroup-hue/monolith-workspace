// Tests for the DOGFOOD-START stamping tool: acceptance completeness, PDPA
// redaction lint, and start-event immutability (first-house-runbook.md).

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { piiLint, stampStarted, validateStarted } from './dogfood-start.mjs';

function validDoc() {
  return {
    _note: 'redacted',
    schema: 'monolith.dogfood.started@1',
    houseId: 'house-01',
    projectId: 'proj_01J8ZK3W9',
    siteCode: 'BKK-HQ-01',
    roles: { owner: 'staff-owner-1', operator: 'staff-op-1', designer: 'staff-des-1', finance: 'staff-fin-1' },
    firstEvent: { type: 'line_order', ref: 'evt_7f3a2c', at: '2026-07-19T09:00:00.000Z' },
    status: 'STARTED',
    shadowPacketEnabled: true,
    realCutAllowed: false,
    recordedAt: '2026-07-19T09:05:00.000Z',
  };
}

test('valid redacted document passes validation and lint', () => {
  assert.deepEqual(validateStarted(validDoc()), []);
  assert.deepEqual(piiLint(validDoc()), []);
});

test('template placeholder remnants are rejected', () => {
  const doc = validDoc();
  doc.projectId = '<project_id จาก rpc_field_create_project>';
  assert.ok(validateStarted(doc).length > 0);
});

test('realCutAllowed=true is rejected — this file can never open real cut', () => {
  const doc = validDoc();
  doc.realCutAllowed = true;
  assert.ok(validateStarted(doc).some((e) => e.includes('realCutAllowed')));
});

test('PDPA lint rejects phone numbers, LINE ids, and Thai address keywords', () => {
  const phone = validDoc();
  phone.roles.owner = 'โทร 081-234-5678';
  assert.ok(piiLint(phone).length > 0, 'phone must be flagged');

  const line = validDoc();
  line.firstEvent.ref = 'LINE id @somchai';
  assert.ok(piiLint(line).length > 0, 'LINE id must be flagged');

  const addr = validDoc();
  addr._note = 'บ้านเลขที่ 99 ถนนสุขุมวิท';
  assert.ok(piiLint(addr).length > 0, 'address must be flagged');
});

test('stamp writes evidence + sha256 once and refuses overwrite (immutability)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dogfood-start-'));
  try {
    const { target, digest } = stampStarted(validDoc(), { root });
    const bytes = await readFile(target);
    assert.match(digest, /^[0-9a-f]{64}$/);
    const manifest = await readFile(join(root, 'docs', 'evidence', 'dogfood', 'house-01', 'started.sha256'), 'utf8');
    assert.ok(manifest.includes(digest) && manifest.includes('started.json'));
    assert.ok(bytes.length > 0);
    assert.throws(() => stampStarted(validDoc(), { root }), /immutable/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
