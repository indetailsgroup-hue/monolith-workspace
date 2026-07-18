// Tests for the DOGFOOD chain recorder: closed schemas, PDPA lint, the
// legacy-work-order invariant, NFP packet shape, immutability, chain status.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { chainStatus, recordStep, validateRecord } from './dogfood-record.mjs';

async function houseRoot() {
  const root = await mkdtemp(join(tmpdir(), 'dogfood-record-'));
  const dir = join(root, 'docs', 'evidence', 'dogfood', 'house-01');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'started.json'), '{"status":"STARTED"}\n');
  return root;
}

const NFP_NAME =
  'NFP-factory-packet-4f9be2a7-33c1-4d68-9b21-5f0e8d7a6c15-813ab601dcf7.zip';

test('closed schema rejects unknown fields (amounts can never enter git)', () => {
  const errors = validateRecord('payment', {
    paymentPlanId: 'pp-001',
    firstInstallmentSlipRef: 'slip-001',
    recordedAt: '2026-07-19T10:00:00.000Z',
    amountTHB: 150000,
  });
  assert.ok(errors.some((e) => e.includes('amountTHB')));
});

test('production record structurally cannot cite a packet source', () => {
  const errors = validateRecord('production', {
    milestoneRef: 'ms-001',
    source: 'nfp_packet',
    notedAt: '2026-07-19T10:00:00.000Z',
  });
  assert.ok(errors.some((e) => e.includes('source')));
  assert.deepEqual(
    validateRecord('production', {
      milestoneRef: 'ms-001',
      source: 'legacy_work_order',
      notedAt: '2026-07-19T10:00:00.000Z',
    }),
    [],
  );
});

test('shadow-compare requires a real NFP filename and well-formed diffs', () => {
  const bad = validateRecord('shadow-compare', {
    packetFilename: 'packet.zip',
    packetSha256: 'a'.repeat(64),
    legacyOrderRef: 'wo-001',
    comparedAt: '2026-07-19T10:00:00.000Z',
    partsCompared: 12,
    diffs: [],
  });
  assert.ok(bad.some((e) => e.includes('packetFilename')));

  const good = validateRecord('shadow-compare', {
    packetFilename: NFP_NAME,
    packetSha256: 'a'.repeat(64),
    legacyOrderRef: 'wo-001',
    comparedAt: '2026-07-19T10:00:00.000Z',
    partsCompared: 12,
    diffs: [{ ref: 'part-07', field: 'cutWidthUm', packet: 600000, actual: 600500, unit: 'um' }],
  });
  assert.deepEqual(good, []);
});

test('recording requires started.json, is immutable, and shadow-compare auto-numbers', async () => {
  const root = await houseRoot();
  try {
    assert.throws(
      () => recordStep('house-02', 'contract', { contractId: 'contract-001', signed: true, signedAt: '2026-07-19T10:00:00.000Z' }, { root }),
      /no started\.json/,
    );
    const contract = { contractId: 'contract-001', signed: true, signedAt: '2026-07-19T10:00:00.000Z' };
    const first = recordStep('house-01', 'contract', contract, { root });
    assert.match(first.digest, /^[0-9a-f]{64}$/);
    assert.throws(() => recordStep('house-01', 'contract', contract, { root }), /immutable/);

    const cmp = {
      packetFilename: NFP_NAME,
      packetSha256: 'a'.repeat(64),
      legacyOrderRef: 'wo-001',
      comparedAt: '2026-07-19T10:00:00.000Z',
      partsCompared: 3,
      diffs: [],
    };
    assert.equal(recordStep('house-01', 'shadow-compare', cmp, { root }).filename, 'shadow-compare-01.json');
    assert.equal(recordStep('house-01', 'shadow-compare', cmp, { root }).filename, 'shadow-compare-02.json');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('PDPA lint blocks PII in chain records', async () => {
  const root = await houseRoot();
  try {
    assert.throws(
      () =>
        recordStep(
          'house-01',
          'acceptance',
          { acceptanceRef: 'รับมอบโดยคุณสมชาย โทร 0812345678', handoverAt: '2026-07-19T10:00:00.000Z' },
          { root },
        ),
      /PDPA/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('chain status reports core completion only when steps 3-8 are all recorded', async () => {
  const root = await houseRoot();
  try {
    const at = '2026-07-19T10:00:00.000Z';
    assert.equal(chainStatus('house-01', { root }).coreComplete, false);
    recordStep('house-01', 'contract', { contractId: 'contract-001', signed: true, signedAt: at }, { root });
    recordStep('house-01', 'payment', { paymentPlanId: 'plan-001', firstInstallmentSlipRef: 'slip-001', recordedAt: at }, { root });
    recordStep('house-01', 'install-plan', { installPlanId: 'install-001', siteSurveyZoneRef: 'zone-001', draftedAt: at }, { root });
    recordStep('house-01', 'production', { milestoneRef: 'milestone-001', source: 'legacy_work_order', notedAt: at }, { root });
    assert.equal(chainStatus('house-01', { root }).coreComplete, false);
    recordStep('house-01', 'acceptance', { acceptanceRef: 'accept-001', handoverAt: at }, { root });
    assert.equal(chainStatus('house-01', { root }).coreComplete, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
