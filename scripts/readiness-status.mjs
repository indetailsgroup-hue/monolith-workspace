#!/usr/bin/env node
// Real-cut readiness reporter — reads the FOUR gate conditions of ADR-065 Q5
// (mirrored in src/core/config/shadowMode.ts) from their real evidence
// surfaces and prints "เหลืออะไร" as a table:
//
//   ① S17-1..5 ปิดครบ        ← .kiro/specs/installation-pm/tasks.md (checkbox ledger)
//   ② ADR-064 ลงชื่อครบ 4     ← docs/governance/adr-064-signoff-checklist.th.md
//   ③ dogfood เต็มสาย ≥1 งาน  ← docs/evidence/dogfood/house-NN/ (chainStatus)
//   ④ machine profile calibrated ← docs/evidence/machines/<id>/ (ADR-070 catalog;
//        calibrated = activation record ของ gate หน้าเครื่องมีอยู่จริงเท่านั้น)
//
// Usage:
//   node scripts/readiness-status.mjs          human-readable table
//   node scripts/readiness-status.mjs --json   machine-readable JSON
//
// ADVISORY ONLY (non-authoritative): everything here fails closed — a missing
// file/dir/row is PENDING, never PASS — and even ready=true is a status report,
// NOT a cut authorization. Closing SHADOW_MODE_NOT_FOR_PRODUCTION stays a
// human flag-closure ceremony (ADR-066); this script must never gate or block.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chainStatus } from './dogfood-record.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const S17_TASKS = ['S17-1', 'S17-2', 'S17-3', 'S17-4', 'S17-5'];
export const ADR064_ROLES = ['Product Owner', 'Tech Lead', 'Security Owner', 'Factory Owner'];

const LEDGER = join('.kiro', 'specs', 'installation-pm', 'tasks.md');
const CHECKLIST = join('docs', 'governance', 'adr-064-signoff-checklist.th.md');
const DOGFOOD_DIR = join('docs', 'evidence', 'dogfood');
const MACHINES_DIR = join('docs', 'evidence', 'machines');

/** ① S17 ledger: `- [x|~| ] S17-N ...` rows — CLOSED only on [x]; anything unreadable = fail closed */
export async function readS17Ledger({ root = repoRoot } = {}) {
  const path = join(root, LEDGER);
  if (!existsSync(path)) {
    return { found: false, allClosed: false, tasks: S17_TASKS.map((id) => ({ id, state: 'MISSING' })) };
  }
  const lines = readFileSync(path, 'utf8').split('\n');
  const tasks = S17_TASKS.map((id) => {
    const row = lines.find((l) => new RegExp(`^-\\s*\\[[ x~]\\]\\s*${id}\\b`, 'u').test(l));
    if (!row) return { id, state: 'MISSING' };
    const mark = row.match(/^-\s*\[([ x~])\]/u)[1];
    return { id, state: mark === 'x' ? 'CLOSED' : mark === '~' ? 'IN_PROGRESS' : 'OPEN' };
  });
  return { found: true, allClosed: tasks.every((t) => t.state === 'CLOSED'), tasks };
}

/** ② ADR-064 checklist: signature-block rows `| <role> | ... | <status> |` — signed = สถานะขึ้นต้น SIGNED */
export async function readAdr064Checklist({ root = repoRoot } = {}) {
  const path = join(root, CHECKLIST);
  if (!existsSync(path)) {
    return { found: false, signed: 0, allSigned: false, roles: [] };
  }
  const lines = readFileSync(path, 'utf8').split('\n');
  const roles = ADR064_ROLES.map((role) => {
    const row = lines.find((l) => new RegExp(`^\\|\\s*${role}\\s*\\|`, 'u').test(l));
    if (!row) return { role, status: 'MISSING' };
    const cells = row.split('|').map((c) => c.trim());
    // | role | name | commit | anchor | date | status |  → last non-empty cell
    const status = cells.filter(Boolean).at(-1) ?? 'MISSING';
    return { role, status };
  });
  const signed = roles.filter((r) => r.status.startsWith('SIGNED')).length;
  return { found: true, signed, allSigned: signed === ADR064_ROLES.length, roles };
}

/** ③ dogfood: every house-NN dir, core chain via dogfood-record.mjs chainStatus (single source of truth) */
export async function readDogfoodStatus({ root = repoRoot } = {}) {
  const dir = join(root, DOGFOOD_DIR);
  const houseIds = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && /^house-\d{2}$/.test(e.name))
        .map((e) => e.name)
        .sort()
    : [];
  const houses = houseIds.map((houseId) => {
    const s = chainStatus(houseId, { root });
    return { houseId, started: s.started, coreComplete: s.coreComplete };
  });
  return { houses, anyComplete: houses.some((h) => h.coreComplete) };
}

/**
 * ④ machines: ADR-070 catalog dirs. A machine counts as calibrated ONLY when a
 * front-of-machine activation record exists (file named `activation…`) — a
 * documented profile alone stays PROHIBITED/NOT_ASSESSED by design.
 */
export async function readMachineStatus({ root = repoRoot } = {}) {
  const dir = join(root, MACHINES_DIR);
  const machines = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => ({
          id: e.name,
          hasActivationRecord: readdirSync(join(dir, e.name)).some((f) => /^activation/iu.test(f)),
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  return { machines, anyCalibrated: machines.some((m) => m.hasActivationRecord) };
}

export async function readinessStatus({ root = repoRoot } = {}) {
  const [s17, adr064, dogfood, machines] = await Promise.all([
    readS17Ledger({ root }),
    readAdr064Checklist({ root }),
    readDogfoodStatus({ root }),
    readMachineStatus({ root }),
  ]);

  const conditions = [
    {
      id: 1,
      title: 'S17-1..5 ปิดครบ (ledger)',
      status: s17.allClosed ? 'PASS' : 'PENDING',
      detail: s17.found
        ? s17.tasks.map((t) => `${t.id}=${t.state}`).join(' · ')
        : `ledger ไม่พบ (${LEDGER})`,
      remaining: s17.tasks.filter((t) => t.state !== 'CLOSED').map((t) => `${t.id} ยัง ${t.state}`),
    },
    {
      id: 2,
      title: 'ADR-064 ลงชื่อครบ 4 (PO/TL/SO/FO)',
      status: adr064.allSigned ? 'PASS' : 'PENDING',
      detail: adr064.found
        ? `SIGNED ${adr064.signed}/${ADR064_ROLES.length}`
        : `checklist ไม่พบ (${CHECKLIST})`,
      remaining: adr064.found
        ? adr064.roles.filter((r) => !r.status.startsWith('SIGNED')).map((r) => `${r.role} ยัง ${r.status}`)
        : ['สร้าง + pin checklist แล้วเปิดรอบเซ็น 4 บทบาท'],
    },
    {
      id: 3,
      title: 'dogfood เต็มสาย ≥1 งาน',
      status: dogfood.anyComplete ? 'PASS' : 'PENDING',
      detail: dogfood.houses.length
        ? dogfood.houses.map((h) => `${h.houseId}: ${h.coreComplete ? 'core chain COMPLETE' : h.started ? 'STARTED (chain ยังไม่ครบ)' : 'ยังไม่ start'}`).join(' · ')
        : 'ยังไม่มีบ้าน dogfood ใน evidence',
      remaining: dogfood.anyComplete
        ? []
        : dogfood.houses.length
          ? dogfood.houses.map((h) => `${h.houseId}: เดิน chain ให้ครบ (ดู dogfood-record.mjs --status)`)
          : ['เริ่มบ้านแรกด้วย dogfood-start.mjs แล้วเดิน chain ขั้น 3-8'],
    },
    {
      id: 4,
      title: 'machine profile calibrated (ADR-070)',
      status: machines.anyCalibrated ? 'PASS' : 'PENDING',
      detail: machines.machines.length
        ? machines.machines.map((m) => `${m.id}: ${m.hasActivationRecord ? 'activation record มีแล้ว' : 'documented เท่านั้น (ยังไม่ bench)'}`).join(' · ')
        : `ยังไม่มี machine ใน catalog (${MACHINES_DIR})`,
      remaining: machines.anyCalibrated
        ? []
        : machines.machines.length
          ? machines.machines.map((m) => `${m.id}: bench + activation record โดยวิศวกรหน้าเครื่อง`)
          : ['นำเข้า machine evidence + bench verification ตาม pattern ADR-070'],
    },
  ];

  return { conditions, ready: conditions.every((c) => c.status === 'PASS') };
}

export function renderReport(status) {
  const lines = [];
  lines.push('Real-cut gate readiness (ADR-065 Q5 — สี่เงื่อนไข):');
  lines.push('');
  for (const c of status.conditions) {
    lines.push(`  [${c.status === 'PASS' ? 'PASS   ' : 'PENDING'}] ${c.id}. ${c.title}`);
    lines.push(`            ${c.detail}`);
  }
  lines.push('');
  const remaining = status.conditions.flatMap((c) => c.remaining.map((r) => `  - (${c.id}) ${r}`));
  if (remaining.length) {
    lines.push(`เหลืออะไร (${remaining.length} รายการ):`);
    lines.push(...remaining);
  } else {
    lines.push('เหลืออะไร: ครบทั้งสี่เงื่อนไขแล้ว — ขั้นถัดไปคือ flag closure ceremony โดยมนุษย์');
  }
  lines.push('');
  lines.push(
    status.ready
      ? 'READY (advisory): เงื่อนไขครบสี่ — รายงานนี้ไม่ใช่การอนุญาตตัดจริง; ปิด flag = ceremony มนุษย์เท่านั้น (ADR-066)'
      : 'NOT READY (advisory): รายงานสถานะเท่านั้น ไม่ใช่การอนุญาตตัดจริง และไม่ block งานใด',
  );
  return lines.join('\n');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const status = await readinessStatus({});
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(renderReport(status));
    }
    process.exit(0); // report-only: readiness state never fails the command
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  }
}
