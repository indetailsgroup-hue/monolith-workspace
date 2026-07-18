// Tests for the real-cut readiness reporter: it must read the four gate
// conditions (ADR-065 Q5 / shadowMode.ts) from the real evidence surfaces —
// S17 ledger, ADR-064 sign-off checklist, dogfood chain, machine catalog —
// fail closed on anything missing, and never claim readiness it cannot see.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ADR064_ROLES,
  readAdr064Checklist,
  readDogfoodStatus,
  readMachineStatus,
  readS17Ledger,
  readinessStatus,
  renderReport,
} from './readiness-status.mjs';

const LEDGER_REL = join('.kiro', 'specs', 'installation-pm');
const CHECKLIST_REL = join('docs', 'governance');

async function fixtureRoot() {
  return mkdtemp(join(tmpdir(), 'readiness-status-'));
}

async function writeLedger(root, lines) {
  await mkdir(join(root, LEDGER_REL), { recursive: true });
  await writeFile(join(root, LEDGER_REL, 'tasks.md'), lines.join('\n') + '\n');
}

async function writeChecklist(root, statuses) {
  await mkdir(join(root, CHECKLIST_REL), { recursive: true });
  const rows = ADR064_ROLES.map(
    (role, i) => `| ${role} | — | \`<PENDING>\` | \`<PENDING>\` | — | ${statuses[i]} |`,
  );
  const doc = [
    '# ADR-064 / Real-Cut Gate ② — Human Role Sign-Off Checklist',
    '',
    '## 5. Signature Block',
    '',
    '| บทบาท | ชื่อ | Reviewed artifact commit | Review anchor SHA-256 | วันที่ | สถานะ |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
  await writeFile(join(root, CHECKLIST_REL, 'adr-064-signoff-checklist.th.md'), doc);
}

async function writeDogfoodChain(root, houseId, files) {
  const dir = join(root, 'docs', 'evidence', 'dogfood', houseId);
  await mkdir(dir, { recursive: true });
  for (const f of files) await writeFile(join(dir, f), '{}\n');
}

const FULL_CHAIN = [
  'started.json',
  'step-3-contract.json',
  'step-4-payment.json',
  'step-5-install-plan.json',
  'step-7-production.json',
  'step-8-acceptance.json',
];

test('S17 ledger: mixed checkbox states map to per-task states and the condition stays open', async () => {
  const root = await fixtureRoot();
  try {
    await writeLedger(root, [
      '- [~] S17-1 **Server-owned identity** — impl + staging-E0',
      '- [~] S17-2 **RELEASED-only invariant** — impl + staging-E0',
      '- [x] S17-3 **Canonical packet specification — APPROVED**',
      '- [ ] S17-4 **Deterministic packet generation** — UNLOCKED',
      '- [~] S17-5 **Full verifier** — UNLOCKED',
    ]);
    const s17 = await readS17Ledger({ root });
    assert.equal(s17.found, true);
    assert.deepEqual(
      s17.tasks.map((t) => [t.id, t.state]),
      [
        ['S17-1', 'IN_PROGRESS'],
        ['S17-2', 'IN_PROGRESS'],
        ['S17-3', 'CLOSED'],
        ['S17-4', 'OPEN'],
        ['S17-5', 'IN_PROGRESS'],
      ],
    );
    assert.equal(s17.allClosed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('S17 ledger: all five closed passes; a missing row or missing ledger fails closed', async () => {
  const root = await fixtureRoot();
  try {
    await writeLedger(root, [
      '- [x] S17-1 done',
      '- [x] S17-2 done',
      '- [x] S17-3 done',
      '- [x] S17-4 done',
      '- [x] S17-5 done',
    ]);
    assert.equal((await readS17Ledger({ root })).allClosed, true);

    await writeLedger(root, ['- [x] S17-1 done', '- [x] S17-2 done', '- [x] S17-3 done']);
    const partial = await readS17Ledger({ root });
    assert.equal(partial.allClosed, false);
    assert.equal(partial.tasks.find((t) => t.id === 'S17-4').state, 'MISSING');

    const empty = await fixtureRoot();
    try {
      const missing = await readS17Ledger({ root: empty });
      assert.equal(missing.found, false);
      assert.equal(missing.allClosed, false);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ADR-064 checklist: missing file fails closed, partial signatures stay open, 4/4 SIGNED passes', async () => {
  const root = await fixtureRoot();
  try {
    const missing = await readAdr064Checklist({ root });
    assert.equal(missing.found, false);
    assert.equal(missing.signed, 0);
    assert.equal(missing.allSigned, false);

    await writeChecklist(root, ['SIGNED', 'PENDING', 'PENDING', 'SIGNED']);
    const partial = await readAdr064Checklist({ root });
    assert.equal(partial.found, true);
    assert.equal(partial.signed, 2);
    assert.equal(partial.allSigned, false);
    assert.deepEqual(
      partial.roles.map((r) => [r.role, r.status]),
      [
        ['Product Owner', 'SIGNED'],
        ['Tech Lead', 'PENDING'],
        ['Security Owner', 'PENDING'],
        ['Factory Owner', 'SIGNED'],
      ],
    );

    await writeChecklist(root, ['SIGNED', 'SIGNED', 'SIGNED', 'SIGNED']);
    assert.equal((await readAdr064Checklist({ root })).allSigned, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('dogfood: core-complete house counts, incomplete or absent houses do not', async () => {
  const root = await fixtureRoot();
  try {
    assert.equal((await readDogfoodStatus({ root })).anyComplete, false);

    await writeDogfoodChain(root, 'house-01', ['started.json', 'step-3-contract.json']);
    const partial = await readDogfoodStatus({ root });
    assert.equal(partial.anyComplete, false);
    assert.equal(partial.houses.length, 1);
    assert.equal(partial.houses[0].coreComplete, false);

    await writeDogfoodChain(root, 'house-02', FULL_CHAIN);
    const complete = await readDogfoodStatus({ root });
    assert.equal(complete.anyComplete, true);
    assert.deepEqual(
      complete.houses.map((h) => [h.houseId, h.coreComplete]),
      [
        ['house-01', false],
        ['house-02', true],
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('machines: catalog without an activation record is not calibrated (ADR-070 fail-closed)', async () => {
  const root = await fixtureRoot();
  try {
    assert.equal((await readMachineStatus({ root })).anyCalibrated, false);

    const machineDir = join(root, 'docs', 'evidence', 'machines', 'kdt-kn-2409lp');
    await mkdir(machineDir, { recursive: true });
    await writeFile(join(machineDir, 'assessment.html'), '<html></html>\n');
    await writeFile(join(machineDir, 'machine-profile.html'), '<html></html>\n');
    const documented = await readMachineStatus({ root });
    assert.equal(documented.anyCalibrated, false);
    assert.deepEqual(documented.machines, [{ id: 'kdt-kn-2409lp', hasActivationRecord: false }]);

    await writeFile(join(machineDir, 'activation-record.json'), '{}\n');
    const activated = await readMachineStatus({ root });
    assert.equal(activated.anyCalibrated, true);
    assert.equal(activated.machines[0].hasActivationRecord, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readinessStatus: empty evidence tree reports all four conditions PENDING and ready=false', async () => {
  const root = await fixtureRoot();
  try {
    const status = await readinessStatus({ root });
    assert.equal(status.ready, false);
    assert.equal(status.conditions.length, 4);
    for (const c of status.conditions) assert.equal(c.status, 'PENDING');

    const report = renderReport(status);
    assert.match(report, /S17/u);
    assert.match(report, /ADR-064/u);
    assert.match(report, /dogfood/iu);
    assert.match(report, /machine/iu);
    assert.match(report, /เหลือ/u);
    // advisory tool: readiness output must never read as a cut authorization
    assert.match(report, /ไม่ใช่การอนุญาตตัดจริง/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readinessStatus: all four surfaces green flips ready=true but stays advisory', async () => {
  const root = await fixtureRoot();
  try {
    await writeLedger(root, [
      '- [x] S17-1 done',
      '- [x] S17-2 done',
      '- [x] S17-3 done',
      '- [x] S17-4 done',
      '- [x] S17-5 done',
    ]);
    await writeChecklist(root, ['SIGNED', 'SIGNED', 'SIGNED', 'SIGNED']);
    await writeDogfoodChain(root, 'house-01', FULL_CHAIN);
    const machineDir = join(root, 'docs', 'evidence', 'machines', 'kdt-kn-2409lp');
    await mkdir(machineDir, { recursive: true });
    await writeFile(join(machineDir, 'activation-record.json'), '{}\n');

    const status = await readinessStatus({ root });
    assert.equal(status.ready, true);
    for (const c of status.conditions) assert.equal(c.status, 'PASS');
    assert.match(renderReport(status), /ไม่ใช่การอนุญาตตัดจริง/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('real repo surfaces parse: ledger has all five S17 rows and the ADR-064 checklist has 4 roles', async () => {
  const s17 = await readS17Ledger({});
  assert.equal(s17.found, true);
  for (const t of s17.tasks) {
    assert.notEqual(t.state, 'MISSING', `${t.id} must exist in the real ledger`);
  }

  const adr = await readAdr064Checklist({});
  assert.equal(adr.found, true, 'docs/governance/adr-064-signoff-checklist.th.md must exist');
  assert.equal(adr.roles.length, 4);
  for (const r of adr.roles) {
    assert.match(r.status, /^(PENDING|SIGNED)/u, `${r.role} status must be PENDING or SIGNED`);
  }
});
