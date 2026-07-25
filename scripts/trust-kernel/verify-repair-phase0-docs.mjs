#!/usr/bin/env node
// Repair Intelligence Phase 0 — bilingual document-set verifier (Task 7).
//
// The Phase 0 control pack and migration/rollback pack must exist as aligned
// EN/TH Markdown AND standalone EN/TH HTML, must carry PENDING_OWNER_REVIEW,
// must contain a threat table, and must never make a positive Gate B /
// approval / production claim. Missing or violating files fail closed.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_DOC_BASES = [
  'repair-intelligence-phase0-control-pack',
  'repair-intelligence-phase0-migration-rollback',
];

const REQUIRED_STATUS_LINES = [
  'PENDING_OWNER_REVIEW',
  'Expert Label Protocol: PROPOSED / NOT RUN',
  'Gate B: NOT PASSED',
  'Immutable infrastructure: NOT CLAIMED',
];

// A Gate B sentence claiming completion without negation is forbidden anywhere.
const FORBIDDEN_CLAIMS = [
  { id: 'Gate B completion claim', re: /Gate B[^\n]*\b(PASSED|PASSES|COMPLETE|COMPLETED|APPROVED)\b/gi, negation: /\bNOT\b|ไม่/i },
  { id: 'production/GA claim', re: /Phase 0[^\n]*\b(PRODUCTION|GA)\b/g, negation: /\bNOT\b|ไม่/i },
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function validateRepairPhase0Docs(dir = join(repoRoot, 'docs', 'governance')) {
  const errors = [];

  for (const base of REQUIRED_DOC_BASES) {
    for (const lang of ['en', 'th']) {
      const mdPath = join(dir, `${base}.${lang}.md`);
      const htmlPath = join(dir, `${base}.${lang}.html`);

      if (!existsSync(htmlPath)) {
        errors.push(`missing standalone HTML: ${base}.${lang}.html`);
      }
      if (!existsSync(mdPath)) {
        errors.push(`missing Markdown edition: ${base}.${lang}.md`);
        continue;
      }

      const text = readFileSync(mdPath, 'utf8');

      for (const line of REQUIRED_STATUS_LINES) {
        if (!text.includes(line)) {
          errors.push(`${base}.${lang}.md: missing required status "${line}"`);
        }
      }

      // Threat table: a Markdown table row must appear under a threat heading.
      const hasThreatTable = /threat[^\n]*\n+[^\n]*\n?\|[^\n]+\|\n\|[-| :]+\|/i.test(text)
        || (/threat/i.test(text) && /\|[^\n]*\|\n\|[-| :]+\|/.test(text));
      if (!hasThreatTable) {
        errors.push(`${base}.${lang}.md: missing threat table`);
      }

      for (const claim of FORBIDDEN_CLAIMS) {
        for (const match of text.matchAll(claim.re)) {
          if (!(claim.negation && claim.negation.test(match[0]))) {
            errors.push(`${base}.${lang}.md: forbidden ${claim.id}: "${match[0].slice(0, 80)}"`);
          }
        }
      }
    }
  }

  return errors;
}

function main() {
  const errors = validateRepairPhase0Docs();
  if (errors.length > 0) {
    console.error('REPAIR PHASE 0 DOCS: FAIL');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log('REPAIR PHASE 0 DOCS: PASS — aligned EN/TH Markdown + standalone HTML, statuses intact.');
}

if (process.argv[1] && process.argv[1].endsWith('verify-repair-phase0-docs.mjs')) {
  main();
}
