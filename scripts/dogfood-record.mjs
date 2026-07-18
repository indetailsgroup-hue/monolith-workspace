#!/usr/bin/env node
// DOGFOOD chain recorder — redacted, immutable evidence for runbook steps 3–8
// and the Designer's shadow-packet comparisons (first-house-runbook.md §2/§3).
//
// Usage:
//   node scripts/dogfood-record.mjs <houseId> <step> <filled.json>   record a step
//   node scripts/dogfood-record.mjs <houseId> --status               chain progress
//
// Steps: contract | payment | install-plan | variation | production |
//        acceptance | shadow-compare
//
// Same guarantees as dogfood-start.mjs:
//   - CLOSED schemas per step (unknown keys rejected — amounts, names, or any
//     operational detail can never sneak into git)
//   - PDPA redaction lint on every string value
//   - immutability: a recorded step is never overwritten (shadow-compare is
//     repeatable and auto-numbers -01, -02, …)
//   - byte-exact sha256 manifest per record

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { piiLint } from './dogfood-start.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ISO = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const REF = (v) => typeof v === 'string' && v.length >= 4 && v.length <= 120;
const NFP_FILENAME =
  /^NFP-factory-packet-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[0-9a-f]{12}\.zip$/;

// Closed schema per runbook §2 evidence column: field -> validator.
// Records carry refs/ids/timestamps ONLY — never amounts, names, or content.
export const STEP_SCHEMAS = {
  contract: {
    file: 'step-3-contract.json',
    fields: {
      contractId: REF,
      signed: (v) => v === true,
      signedAt: ISO,
    },
  },
  payment: {
    file: 'step-4-payment.json',
    fields: {
      paymentPlanId: REF,
      firstInstallmentSlipRef: REF, // slip reference only — ยอดเงินห้ามลง git
      recordedAt: ISO,
    },
  },
  'install-plan': {
    file: 'step-5-install-plan.json',
    fields: {
      installPlanId: REF,
      siteSurveyZoneRef: REF, // วัดหน้างานจริงโดย human
      draftedAt: ISO,
    },
  },
  variation: {
    file: 'step-6-variation.json',
    optional: true,
    fields: {
      variationId: REF,
      submittedSignedAt: ISO,
    },
  },
  production: {
    file: 'step-7-production.json',
    fields: {
      milestoneRef: REF,
      // hard invariant: the factory cuts from the LEGACY work order — a packet
      // source is structurally unrepresentable in this record
      source: (v) => v === 'legacy_work_order',
      notedAt: ISO,
    },
  },
  acceptance: {
    file: 'step-8-acceptance.json',
    fields: {
      acceptanceRef: REF,
      handoverAt: ISO,
    },
  },
  'shadow-compare': {
    file: null, // repeatable: shadow-compare-NN.json (auto-numbered)
    fields: {
      packetFilename: (v) => NFP_FILENAME.test(v ?? ''), // NFP shape enforced
      packetSha256: (v) => /^[0-9a-f]{64}$/.test(v ?? ''),
      legacyOrderRef: REF,
      comparedAt: ISO,
      partsCompared: (v) => Number.isInteger(v) && v >= 0,
      diffs: (v) =>
        Array.isArray(v) &&
        v.every(
          (d) =>
            d && typeof d === 'object' &&
            Object.keys(d).every((k) => ['ref', 'field', 'packet', 'actual', 'unit'].includes(k)) &&
            REF(d.ref) && typeof d.field === 'string' &&
            (typeof d.packet === 'number' || typeof d.packet === 'string') &&
            (typeof d.actual === 'number' || typeof d.actual === 'string'),
        ),
    },
  },
};

/** core chain = runbook steps that must all exist for "ครบสาย" (variation is optional) */
export const CORE_CHAIN = ['contract', 'payment', 'install-plan', 'production', 'acceptance'];

export function validateRecord(step, doc) {
  const schema = STEP_SCHEMAS[step];
  if (!schema) return [`unknown step "${step}" — one of: ${Object.keys(STEP_SCHEMAS).join(', ')}`];
  const errors = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['record must be an object'];
  for (const [field, check] of Object.entries(schema.fields)) {
    if (!check(doc[field])) errors.push(`${field}: missing or invalid`);
  }
  for (const key of Object.keys(doc)) {
    if (!(key in schema.fields)) errors.push(`${key}: unknown field — schemas are closed (PDPA/no-amounts)`);
  }
  if (/<[^>]{3,}>/.test(JSON.stringify(doc))) errors.push('template placeholder <...> still present');
  return errors;
}

export function recordStep(houseId, step, doc, { root = repoRoot } = {}) {
  if (!/^house-\d{2}$/.test(houseId)) throw new Error('houseId must match house-NN');
  const dir = join(root, 'docs', 'evidence', 'dogfood', houseId);
  if (!existsSync(join(dir, 'started.json'))) {
    throw new Error(`${houseId} has no started.json — the chain begins with dogfood-start.mjs`);
  }
  const errors = validateRecord(step, doc);
  if (errors.length) throw new Error(`record not acceptable:\n  - ${errors.join('\n  - ')}`);
  const pii = piiLint(doc);
  if (pii.length) throw new Error(`PDPA redaction lint failed:\n  - ${pii.join('\n  - ')}`);

  const schema = STEP_SCHEMAS[step];
  let filename = schema.file;
  if (filename === null) {
    const existing = readdirSync(dir).filter((f) => /^shadow-compare-\d{2}\.json$/.test(f));
    filename = `shadow-compare-${String(existing.length + 1).padStart(2, '0')}.json`;
  }
  const target = join(dir, filename);
  if (existsSync(target)) {
    throw new Error(`${target} already exists — chain records are immutable; a correction is a new record`);
  }
  const bytes = Buffer.from(JSON.stringify({ schema: `monolith.dogfood.${step}@1`, houseId, ...doc }, null, 2) + '\n', 'utf8');
  writeFileSync(target, bytes);
  const digest = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(target.replace(/\.json$/, '.sha256'), `${digest}  ${filename}\n`);
  return { target, filename, digest };
}

export function chainStatus(houseId, { root = repoRoot } = {}) {
  const dir = join(root, 'docs', 'evidence', 'dogfood', houseId);
  const has = (f) => existsSync(join(dir, f));
  const steps = Object.entries(STEP_SCHEMAS).map(([name, s]) => ({
    name,
    optional: s.optional === true || s.file === null,
    recorded: s.file === null
      ? (existsSync(dir) ? readdirSync(dir).filter((f) => /^shadow-compare-\d{2}\.json$/.test(f)).length : 0)
      : has(s.file),
  }));
  const started = has('started.json');
  const coreComplete = started && CORE_CHAIN.every((name) => steps.find((s) => s.name === name)?.recorded === true);
  return { started, steps, coreComplete };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [houseId, stepOrFlag, inputPath] = process.argv.slice(2);
  try {
    if (!houseId || !stepOrFlag) {
      console.error('usage: node scripts/dogfood-record.mjs <houseId> <step|--status> [filled.json]');
      process.exit(2);
    }
    if (stepOrFlag === '--status') {
      const s = chainStatus(houseId);
      console.log(`${houseId}: started=${s.started}`);
      for (const st of s.steps) {
        const mark = typeof st.recorded === 'number' ? `${st.recorded} record(s)` : st.recorded ? 'RECORDED' : (st.optional ? '(optional)' : 'PENDING');
        console.log(`  ${st.name.padEnd(15)} ${mark}`);
      }
      console.log(s.coreComplete
        ? '✔ core chain COMPLETE — บ้านนี้นับเป็น dogfood≥1 ใน real-cut gate (ตาม runbook §4)'
        : 'core chain not yet complete');
      process.exit(0);
    }
    if (!inputPath) throw new Error('missing filled.json');
    const doc = JSON.parse(readFileSync(inputPath, 'utf8'));
    const { target, digest } = recordStep(houseId, stepOrFlag, doc);
    console.log('chain record written (immutable):');
    console.log('  ' + target);
    console.log('  sha256 ' + digest);
    console.log('');
    console.log(`next (human-reviewed): git add docs/evidence/dogfood/${houseId}/ && git commit`);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  }
}
