#!/usr/bin/env node
// Repair Intelligence Phase 0 — owner exit-review builder (Task 9).
//
// Reads MACHINE REPORTS ONLY and emits the aligned EN/TH exit review. The
// builder is total and deny-biased: complete green evidence yields
// `Phase 0 implementation evidence: VERIFIED`; anything missing, failed,
// empty, or unreadable yields `EVIDENCE_INCOMPLETE`. The exit decision is
// ALWAYS `PENDING_OWNER_APPROVAL` — no input state can produce an owner
// approval, a production claim, or a GA claim. Only the owner, reading the
// evidence, may approve the Phase 0 exit outside this tool.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const REQUIRED_PHASE0_REPORTS = [
  'workflow_db_invariants.tap',
  'trust_kernel_tenancy.tap',
  'trust_kernel_governance.tap',
  'trust_kernel_release.tap',
  'trust_kernel_bundles.tap',
  'trust_kernel_containment.tap',
  'trust_kernel_safety.tap',
  'repair_phase0_organization.tap',
  'repair_phase0_containment.tap',
  'repair-phase0-ledger.json',
  // CI-only legs: without a real CI run (shadow E2E + separately signed
  // evidence attestation) the review records EVIDENCE_INCOMPLETE — the gate is
  // never downgraded or bypassed when secrets/endpoints are absent.
  'e2e.json',
  'evidence-attestation.json',
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function inspectReport(reportsDir, name) {
  // Local/db-verify evidence uses <suite>.tap, while trust-kernel-verify uploads
  // pgtap-<suite>.tap. Keep one logical report name in the exit review and accept
  // either producer's basename at the filesystem boundary.
  const candidates = name.endsWith('.tap') ? [name, `pgtap-${name}`] : [name];
  const file = candidates.map((candidate) => join(reportsDir, candidate)).find(existsSync)
    ?? join(reportsDir, name);
  if (!existsSync(file)) {
    return { name, present: false, ok: false, detail: 'PENDING_CI_RUN — produced only by the CI workflow', hash: '-', assertions: 0 };
  }
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    return { name, present: true, ok: false, detail: `unreadable: ${String(error)}`, hash: '-', assertions: 0 };
  }
  const hash = sha256(text);
  if (name.endsWith('.tap')) {
    const ok = (text.match(/^ok /gm) ?? []).length;
    const notOk = (text.match(/^not ok /gm) ?? []).length;
    if (ok === 0) return { name, present: true, ok: false, detail: 'empty suite (zero assertions)', hash, assertions: 0 };
    if (notOk > 0) return { name, present: true, ok: false, detail: `${notOk} failing assertion(s)`, hash, assertions: ok };
    return { name, present: true, ok: true, detail: `${ok} assertions ok`, hash, assertions: ok };
  }
  if (name === 'e2e.json') {
    try {
      const stats = JSON.parse(text).stats ?? {};
      const ok = (stats.expected ?? 0) > 0 && (stats.unexpected ?? 1) === 0 && (stats.skipped ?? 1) === 0;
      return { name, present: true, ok, detail: `expected=${stats.expected ?? 0} unexpected=${stats.unexpected ?? '?'} skipped=${stats.skipped ?? '?'}`, hash, assertions: stats.expected ?? 0 };
    } catch {
      return { name, present: true, ok: false, detail: 'unparseable JSON', hash, assertions: 0 };
    }
  }
  if (name === 'evidence-attestation.json') {
    try {
      const attestation = JSON.parse(text);
      return { name, present: true, ok: attestation.verified === true, detail: `verified=${String(attestation.verified)}`, hash, assertions: 0 };
    } catch {
      return { name, present: true, ok: false, detail: 'unparseable JSON', hash, assertions: 0 };
    }
  }
  if (name === 'repair-phase0-ledger.json') {
    try {
      const ledger = JSON.parse(text);
      if (ledger.pass !== true) return { name, present: true, ok: false, detail: `ledger pass=${String(ledger.pass)}`, hash, assertions: 0 };
      return { name, present: true, ok: true, detail: `${ledger.surfaceCount} surfaces`, hash, assertions: ledger.surfaceCount ?? 0 };
    } catch {
      return { name, present: true, ok: false, detail: 'unparseable JSON', hash, assertions: 0 };
    }
  }
  return { name, present: true, ok: text.includes('PASS'), detail: 'text report', hash, assertions: 0 };
}

const STATUS_BLOCK = (evidence) => [
  `Phase 0 implementation evidence: ${evidence}`,
  'Phase 0 exit decision: PENDING_OWNER_APPROVAL',
  'Phase 1A authority: DISABLED',
  'Expert Label Protocol: PROPOSED / NOT RUN',
  'Gate B: NOT PASSED',
  'Immutable infrastructure: NOT CLAIMED',
].join('\n');

const RESIDUAL_RISKS_EN = [
  '- The GitHub Actions workflows are authored but have not executed on CI infrastructure; the CI evidence legs remain to be produced on a real run.',
  '- Shadow E2E and the signed evidence attestation require CI secrets (user JWTs, evidence signer/verify endpoints); absent secrets keep the gate at EVIDENCE_INCOMPLETE.',
  '- The shared local Supabase stack was never reset; migration-chain verification relies on the ephemeral CI database.',
];
const RESIDUAL_RISKS_TH = [
  '- Workflow ของ GitHub Actions ถูกเขียนแล้วแต่ยังไม่เคยรันบนโครงสร้าง CI จริง; หลักฐานฝั่ง CI ต้องมาจากการรันจริง',
  '- Shadow E2E และ evidence attestation แบบลงนามต้องใช้ CI secrets (user JWT, endpoint ของ signer/verify); เมื่อ secrets ยังไม่ครบ สถานะคงเป็น EVIDENCE_INCOMPLETE',
  '- Local Supabase stack ที่ใช้ร่วมกันไม่ถูก reset; การตรวจ migration chain เต็มรูปแบบอาศัยฐานข้อมูล ephemeral ใน CI',
];

function evidenceTable(rows, lang) {
  const header = lang === 'th'
    ? '| รายงาน | สถานะ | รายละเอียด | SHA-256 |\n|---|---|---|---|'
    : '| Report | Status | Detail | SHA-256 |\n|---|---|---|---|';
  const okWord = lang === 'th' ? 'ผ่าน' : 'OK';
  const badWord = 'INCOMPLETE';
  // Full sha256 — a report hash in an evidence document must be independently
  // verifiable, not a truncated prefix. Owner re-checks with `sha256sum`.
  return [header, ...rows.map((r) =>
    `| \`${r.name}\` | ${r.ok ? okWord : badWord} | ${r.detail} | \`${r.hash}\` |`,
  )].join('\n');
}

export function buildRepairPhase0ExitReview({ reportsDir, outDir, meta }) {
  const rows = REQUIRED_PHASE0_REPORTS.map((name) => inspectReport(reportsDir, name));
  const evidence = rows.every((r) => r.ok) ? 'VERIFIED' : 'EVIDENCE_INCOMPLETE';

  const commits = [
    ['Canonical product `main`', meta.productMain],
    ['Governance baseline (pinned linters)', meta.governanceBaseline],
    ['Trust Kernel series head', meta.trustKernelHead],
    ['Execution branch head', meta.branchHead],
  ];
  const commitTable = (lang) => [
    lang === 'th' ? '| จุดอ้างอิง | Commit |\n|---|---|' : '| Reference | Commit |\n|---|---|',
    ...commits.map(([k, v]) => `| ${k} | \`${v}\` |`),
  ].join('\n');

  const en = `# MONOLITH Repair Intelligence — Phase 0 Exit Review (EN)

${STATUS_BLOCK(evidence)}

## 1. Baseline commits

${commitTable('en')}

## 2. Evidence table (machine reports)

${evidenceTable(rows, 'en')}

## 3. Verification commands

The evidence above is produced by: the nine pgTAP suites under \`supabase/tests/\` (via \`psql -tA -v ON_ERROR_STOP=1\`), \`npm run tk:repair-ledger\`, \`npm run tk:repair-docs\`, \`npm run tk:route-ledger\`, \`npm run tk:containment\`, \`npm run tk:server\`, \`npm run tk:verifier\`, \`npm run test:node\`, \`npm run test:run\`, \`npm run typecheck:all\`, and \`npm run build\`.

## 4. Residual risks

${RESIDUAL_RISKS_EN.join('\n')}

## 5. Rollback status

Rollback plan: documented in \`repair-intelligence-phase0-migration-rollback.en.md\` / \`.th.md\`. Recovery test: NOT RUN. Rollback execution: NOT REQUIRED so far.

## 6. Owner gate

${STATUS_BLOCK(evidence)}

The owner reviews the commit list, report hashes, CI run, residual risks, and the rollback pack before deciding. No automated step may change the exit decision.
`;

  const th = `# MONOLITH Repair Intelligence — บันทึกทบทวนการออกจาก Phase 0 (TH)

${STATUS_BLOCK(evidence)}

## 1. Commit ฐานอ้างอิง

${commitTable('th')}

## 2. ตารางหลักฐาน (รายงานจากเครื่องเท่านั้น)

${evidenceTable(rows, 'th')}

## 3. คำสั่งตรวจสอบ

หลักฐานข้างต้นมาจาก: ชุด pgTAP ทั้งเก้าภายใต้ \`supabase/tests/\` (ผ่าน \`psql -tA -v ON_ERROR_STOP=1\`), \`npm run tk:repair-ledger\`, \`npm run tk:repair-docs\`, \`npm run tk:route-ledger\`, \`npm run tk:containment\`, \`npm run tk:server\`, \`npm run tk:verifier\`, \`npm run test:node\`, \`npm run test:run\`, \`npm run typecheck:all\`, และ \`npm run build\`

## 4. ความเสี่ยงคงเหลือ

${RESIDUAL_RISKS_TH.join('\n')}

## 5. สถานะการย้อนกลับ

แผนย้อนกลับ: บันทึกใน \`repair-intelligence-phase0-migration-rollback.en.md\` / \`.th.md\` การทดสอบกู้คืน: NOT RUN การใช้แผนย้อนกลับ: NOT REQUIRED จนถึงปัจจุบัน

## 6. ประตูอนุมัติของเจ้าของ

${STATUS_BLOCK(evidence)}

เจ้าของทบทวนรายการ commit, hash ของรายงาน, ผลการรัน CI, ความเสี่ยงคงเหลือ และแผนย้อนกลับก่อนตัดสินใจ ขั้นตอนอัตโนมัติเปลี่ยนคำตัดสินนี้ไม่ได้
`;

  mkdirSync(outDir, { recursive: true });
  const enPath = join(outDir, 'repair-intelligence-phase0-exit-review.en.md');
  const thPath = join(outDir, 'repair-intelligence-phase0-exit-review.th.md');
  writeFileSync(enPath, en, 'utf8');
  writeFileSync(thPath, th, 'utf8');

  return { evidence, exitDecision: 'PENDING_OWNER_APPROVAL', rows, files: [enPath, thPath] };
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'UNKNOWN';
  }
}

function main() {
  const reportsDir = resolve(repoRoot, process.argv[2] ?? 'reports/phase0');
  const meta = {
    productMain: 'dd1119af6d0bcba0e38d38516ed1b11125bcf19f',
    governanceBaseline: '55557d7f178dcbe00fec15cffb3061df668eaff8',
    trustKernelHead: '8dfe0cc02e6cbbe8f4cefb3893d80a758fc8d49b',
    branchHead: gitHead(),
  };
  const outDir = join(repoRoot, 'docs', 'governance');
  const { evidence, exitDecision } = buildRepairPhase0ExitReview({ reportsDir, outDir, meta });
  console.log(`Phase 0 implementation evidence: ${evidence}`);
  console.log(`Phase 0 exit decision: ${exitDecision}`);
}

if (process.argv[1] && process.argv[1].endsWith('build-repair-phase0-exit-review.mjs')) {
  main();
}
