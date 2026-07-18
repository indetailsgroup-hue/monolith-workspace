#!/usr/bin/env node
// DOGFOOD-START stamping tool — turns a filled started.template.json into the
// immutable redacted start evidence (first-house-runbook.md §0/§5).
//
// Usage: node scripts/dogfood-start.mjs <filled-started.json>
//
// What it enforces before any byte lands in git:
//   1. schema/acceptance completeness (§0) — no placeholder remnants
//   2. PDPA redaction lint (§PDPA) — refuses values that look like raw PII
//      (phone / LINE / email / address keywords / long Thai free text)
//   3. immutability — refuses to overwrite an existing started.json
// Then writes docs/evidence/dogfood/<houseId>/started.json + a byte-exact
// .sha256 manifest, and prints the commit step (the commit itself stays a
// human-reviewed action).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function validateStarted(doc) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  need(doc && typeof doc === 'object' && !Array.isArray(doc), 'root must be an object');
  if (errors.length) return errors;

  need(doc.schema === 'monolith.dogfood.started@1', 'schema must be monolith.dogfood.started@1');
  need(/^house-\d{2}$/.test(doc.houseId ?? ''), 'houseId must match house-NN (e.g. house-01)');
  need(typeof doc.projectId === 'string' && doc.projectId.length >= 8, 'projectId required (from rpc_field_create_project)');
  need(/^[A-Z]{2,4}-[A-Z0-9]{2,6}-\d{2}$/.test(doc.siteCode ?? ''), 'siteCode must look like BKK-HQ-01');
  for (const role of ['owner', 'operator', 'designer', 'finance']) {
    need(typeof doc.roles?.[role] === 'string' && doc.roles[role].length > 0, `roles.${role} required (staff-ref/role-label)`);
  }
  need(['line_order', 'contract_draft'].includes(doc.firstEvent?.type), 'firstEvent.type must be line_order|contract_draft');
  need(typeof doc.firstEvent?.ref === 'string' && doc.firstEvent.ref.length >= 4, 'firstEvent.ref required (id/ref, not content)');
  need(!Number.isNaN(Date.parse(doc.firstEvent?.at ?? '')), 'firstEvent.at must be ISO8601');
  need(doc.status === 'STARTED', 'status must be STARTED');
  need(doc.shadowPacketEnabled === true, 'shadowPacketEnabled must be true');
  need(doc.realCutAllowed === false, 'realCutAllowed must be false — the real-cut gate is not this file');
  need(!Number.isNaN(Date.parse(doc.recordedAt ?? '')), 'recordedAt must be ISO8601');

  // placeholder remnants from the template
  const raw = JSON.stringify(doc);
  if (/<[^>]{3,}>/.test(raw)) errors.push('template placeholder <...> still present — fill every field');

  return errors;
}

/** PDPA redaction lint — reject values that look like raw PII (runbook §PDPA). */
export function piiLint(doc) {
  const findings = [];
  const checks = [
    { re: /(\+66|0)\d[\d\s-]{7,}\d/, why: 'phone-number-like value' },
    { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, why: 'email-like value' },
    { re: /line\s*id|@line|line:\/\//i, why: 'LINE-identifier-like value' },
    { re: /บ้านเลขที่|ถนน|ซอย|หมู่\s*\d|ตำบล|แขวง|อำเภอ|เขต|จังหวัด|รหัสไปรษณีย์/, why: 'address keyword (Thai)' },
    { re: /\b(road|soi|district|subdistrict|province|postal)\b/i, why: 'address keyword (EN)' },
    { re: /[฀-๿]{25,}/, why: 'long Thai free text (likely a name/address, not a ref)' },
  ];
  const walk = (value, path) => {
    if (typeof value === 'string') {
      for (const { re, why } of checks) {
        if (re.test(value)) findings.push(`${path}: ${why}`);
      }
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    }
  };
  walk(doc, '$');
  return findings;
}

export function stampStarted(doc, { root = repoRoot } = {}) {
  const schemaErrors = validateStarted(doc);
  if (schemaErrors.length) {
    throw new Error('started.json not acceptable:\n  - ' + schemaErrors.join('\n  - '));
  }
  const pii = piiLint(doc);
  if (pii.length) {
    throw new Error('PDPA redaction lint failed — raw PII must never enter git:\n  - ' + pii.join('\n  - '));
  }
  const dir = join(root, 'docs', 'evidence', 'dogfood', doc.houseId);
  const target = join(dir, 'started.json');
  if (existsSync(target)) {
    throw new Error(`${target} already exists — the start event is immutable; a correction is a NEW record, not an overwrite`);
  }
  mkdirSync(dir, { recursive: true });
  const bytes = Buffer.from(JSON.stringify(doc, null, 2) + '\n', 'utf8');
  writeFileSync(target, bytes);
  const digest = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(join(dir, 'started.sha256'), `${digest}  started.json\n`);
  return { target, digest };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const input = process.argv[2];
  if (!input) {
    console.error('usage: node scripts/dogfood-start.mjs <filled-started.json>');
    process.exit(2);
  }
  try {
    const doc = JSON.parse(readFileSync(input, 'utf8'));
    const { target, digest } = stampStarted(doc);
    console.log('STARTED evidence written (immutable):');
    console.log('  ' + target);
    console.log('  sha256 ' + digest);
    console.log('');
    console.log('next (human-reviewed):');
    console.log(`  git add docs/evidence/dogfood/${doc.houseId}/ && git commit -m "evidence(dogfood): ${doc.houseId} STARTED (first event ${doc.firstEvent.type} @ ${doc.firstEvent.at})"`);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  }
}
