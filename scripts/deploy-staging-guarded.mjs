#!/usr/bin/env node
/**
 * deploy-staging-guarded.mjs — hard-allowlisted Supabase function deploy for MONOLITH s17-staging.
 *
 * เกิดหลัง incident 2026-07-12: agent เผลอ link+deploy factory-api ตัวใหม่ทับ PROD
 * (kqzjqqvbrukxpjseqvua) และเกือบ deploy เข้า Thai Curry Kitchen (xkprmxtzomjckgketszw)
 * เพราะ pattern-match ชื่อ "staging" ผิด. guardrail นี้กันทั้งสองกรณี:
 *
 *   - allowlist: อนุญาต ref เดียวเท่านั้น = wlivqsdgvwcjlbqqtcwt (MONOLITH s17-staging branch)
 *   - hard-reject: prod และทุก project ของ TCCK โดยระบุชื่อชัด
 *   - ไม่ใช้ `supabase link` (ตัวที่ทำให้ incident) — pass --project-ref ตรง ๆ
 *   - ต้อง CONFIRM_STAGING_DEPLOY=yes จึงจะยิงจริง
 *   - ตรวจว่า cwd มี source ของ function ที่จะ deploy (กัน deploy ผิด worktree)
 *
 * ใช้:
 *   CONFIRM_STAGING_DEPLOY=yes node scripts/deploy-staging-guarded.mjs wlivqsdgvwcjlbqqtcwt factory-api
 * (รันจาก root ของ worktree track-a ที่มี supabase/functions/factory-api/ เวอร์ชันใหม่)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const STAGING_REF = 'wlivqsdgvwcjlbqqtcwt'; // MONOLITH s17-staging — ref เดียวที่อนุญาต

const FORBIDDEN = {
  kqzjqqvbrukxpjseqvua: 'MONOLITH PRODUCTION (daph-iimos-prod) — ห้าม deploy ด้วยสคริปต์นี้',
  xkprmxtzomjckgketszw: 'Thai Curry Kitchen staging — คนละผลิตภัณฑ์',
  xsgkciwpdpfvddornnbl: 'Thai Curry Kitchen production — คนละผลิตภัณฑ์',
};

const ref = process.argv[2];
const fn = process.argv[3];

function die(code, msg) {
  console.error(`[guardrail] ${msg}`);
  process.exit(code);
}

if (!ref || !fn) {
  die(2, `usage: node scripts/deploy-staging-guarded.mjs <project-ref> <function-name>\n` +
         `           อนุญาต ref เดียว: ${STAGING_REF} (MONOLITH s17-staging)`);
}
if (FORBIDDEN[ref]) {
  die(3, `REFUSED: ref ${ref} = ${FORBIDDEN[ref]}. สคริปต์นี้ deploy ได้เฉพาะ staging ${STAGING_REF}`);
}
if (ref !== STAGING_REF) {
  die(3, `REFUSED: ${ref} ไม่ใช่ staging ref ที่อนุมัติ. อนุญาตเฉพาะ ${STAGING_REF}`);
}

const fnSource = path.resolve(process.cwd(), 'supabase', 'functions', fn, 'index.ts');
if (!existsSync(fnSource)) {
  die(5, `ไม่พบ source ${fnSource} — คุณต้องรันจาก root ของ worktree ที่มี function ${fn} (track-a)`);
}

if (process.env.CONFIRM_STAGING_DEPLOY !== 'yes') {
  console.error(`[guardrail] จะ deploy: supabase functions deploy ${fn} --project-ref ${ref}`);
  console.error(`[guardrail] source: ${fnSource}`);
  die(4, `ยังไม่ยืนยัน — ตั้ง CONFIRM_STAGING_DEPLOY=yes เพื่อ deploy จริง`);
}

console.log(`[guardrail] deploy ${fn} -> ${ref} (s17-staging) · ไม่ใช้ link · --project-ref ตรง`);
const r = spawnSync('npx', ['supabase', 'functions', 'deploy', fn, '--project-ref', ref], {
  stdio: 'inherit',
  env: process.env,
  shell: true, // Windows: ให้ resolve npx.cmd ได้ (ไม่งั้น spawn ล้มเงียบ ENOENT)
});
if (r.error) {
  console.error(`[guardrail] spawn ล้มเหลว: ${r.error.message} — npx/supabase CLI พร้อมไหม? ลอง 'npx supabase --version'`);
  process.exit(1);
}
if (r.status !== 0) {
  console.error(`[guardrail] supabase deploy จบด้วย exit ${r.status} — ดู error ด้านบน`);
}
process.exit(r.status ?? 1);
