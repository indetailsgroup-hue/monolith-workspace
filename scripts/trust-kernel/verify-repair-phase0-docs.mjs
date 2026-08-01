#!/usr/bin/env node
// Repair Intelligence Phase 0 — bilingual document-set verifier (Task 7).
//
// The four Phase 0 governance packs must exist as aligned EN/TH Markdown AND
// standalone EN/TH HTML. The English-only first-push operations checklist must
// also exist. Every document is scanned for positive Gate B / approval /
// production claims; class-specific status and threat-table rules fail closed.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_DOC_BASES = [
  'repair-intelligence-phase0-control-pack',
  'repair-intelligence-phase0-migration-rollback',
  'repair-intelligence-phase0-accepted-risks',
  'repair-intelligence-phase0-exit-review',
];

export const REQUIRED_STANDALONE_DOCS = [
  'repair-intelligence-phase0-push-checklist.md',
];

const COMMON_STATUS_LINES = [
  'Expert Label Protocol: PROPOSED / NOT RUN',
  'Gate B: NOT PASSED',
  'Immutable infrastructure: NOT CLAIMED',
];

const DOC_REQUIREMENTS = new Map([
  ['repair-intelligence-phase0-control-pack', { pending: 'PENDING_OWNER_REVIEW', threatTable: true }],
  ['repair-intelligence-phase0-migration-rollback', { pending: 'PENDING_OWNER_REVIEW', threatTable: true }],
  ['repair-intelligence-phase0-accepted-risks', { pending: 'PENDING_OWNER_REVIEW', threatTable: false }],
  ['repair-intelligence-phase0-exit-review', { pending: 'PENDING_OWNER_APPROVAL', threatTable: false }],
]);

// A Gate B / release sentence claiming completion without negation is forbidden
// anywhere (Markdown OR the rendered HTML). The verb list is broadened beyond
// PASSED to the ways an approval is actually phrased (review #4).
const COMPLETION_VERBS = 'PASSED|PASSES|COMPLETE|COMPLETED|APPROVED|CLEARED|SIGNED[ -]?OFF|SATISFIED|ACHIEVED';
// The claim window is bounded (no greedy cross-clause span) so a negation
// elsewhere on the line cannot excuse a positive claim (htmlToText also keeps
// block boundaries as newlines so a match never crosses HTML elements).
const FORBIDDEN_CLAIMS = [
  { id: 'Gate B completion claim', re: new RegExp(String.raw`Gate B[^\n]{0,30}?\b(${COMPLETION_VERBS})\b`, 'gi'), negation: /\b(NOT|NO|NEVER)\b|without|ไม่/i },
  { id: 'production/GA claim', re: /Phase 0[^\n]{0,30}?\b(PRODUCTION|GA(?:\s+release)?)\b/gi, negation: /\b(NOT|NO|NEVER)\b|without|ไม่/i },
  { id: 'exit-approval claim', re: /Phase 0 exit[^\n]{0,30}?\bAPPROVED\b/gi, negation: /\b(NOT|NO|NEVER)\b|PENDING|ไม่/i },
];

// Strip HTML tags/entities to plain text so a claim hidden in markup is caught.
// Block-level element boundaries become newlines so a per-line forbidden-claim
// scan cannot leak a negation across two separate blocks.
function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|li|td|tr|div|h[1-6]|section|article|main)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ');
}

function scanForbidden(errors, label, text) {
  for (const claim of FORBIDDEN_CLAIMS) {
    for (const match of text.matchAll(claim.re)) {
      if (!(claim.negation && claim.negation.test(match[0]))) {
        errors.push(`${label}: forbidden ${claim.id}: "${match[0].slice(0, 80)}"`);
      }
    }
  }
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function validateRepairPhase0Docs(dir = join(repoRoot, 'docs', 'governance')) {
  const errors = [];

  for (const base of REQUIRED_DOC_BASES) {
    const requirements = DOC_REQUIREMENTS.get(base);
    const requiredStatusLines = [requirements.pending, ...COMMON_STATUS_LINES];
    for (const lang of ['en', 'th']) {
      const mdPath = join(dir, `${base}.${lang}.md`);
      const htmlPath = join(dir, `${base}.${lang}.html`);

      if (!existsSync(mdPath)) {
        errors.push(`missing Markdown edition: ${base}.${lang}.md`);
        continue;
      }

      const text = readFileSync(mdPath, 'utf8');

      for (const line of requiredStatusLines) {
        if (!text.includes(line)) {
          errors.push(`${base}.${lang}.md: missing required status "${line}"`);
        }
      }

      // Threat table: a Markdown table row must appear under a threat heading.
      if (requirements.threatTable) {
        const hasThreatTable = /threat[^\n]*\n+[^\n]*\n?\|[^\n]+\|\n\|[-| :]+\|/i.test(text)
          || (/threat/i.test(text) && /\|[^\n]*\|\n\|[-| :]+\|/.test(text));
        if (!hasThreatTable) {
          errors.push(`${base}.${lang}.md: missing threat table`);
        }
      }

      scanForbidden(errors, `${base}.${lang}.md`, text);

      // The rendered HTML edition must exist, be non-trivial, carry the same
      // status lines as the Markdown, and contain no forbidden claim hidden in
      // markup — checking existence alone let an empty or hostile HTML pass.
      if (!existsSync(htmlPath)) {
        errors.push(`missing standalone HTML: ${base}.${lang}.html`);
      } else {
        const rawHtml = readFileSync(htmlPath, 'utf8');
        const htmlText = htmlToText(rawHtml);
        if (rawHtml.trim().length < 200) {
          errors.push(`${base}.${lang}.html: HTML edition is empty or too small to be a rendered document`);
        }
        for (const line of requiredStatusLines) {
          if (!htmlText.includes(line)) {
            errors.push(`${base}.${lang}.html: rendered HTML is missing required status "${line}"`);
          }
        }
        scanForbidden(errors, `${base}.${lang}.html`, htmlText);
      }
    }
  }

  for (const file of REQUIRED_STANDALONE_DOCS) {
    const filePath = join(dir, file);
    if (!existsSync(filePath)) {
      errors.push(`missing required governance document: ${file}`);
      continue;
    }
    const text = readFileSync(filePath, 'utf8');
    if (text.trim().length < 200) {
      errors.push(`${file}: document is empty or too small to be the operations runbook`);
    }
    scanForbidden(errors, file, text);
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
  console.log('REPAIR PHASE 0 DOCS: PASS — required EN/TH Markdown + HTML and push checklist, statuses intact.');
}

if (process.argv[1] && process.argv[1].endsWith('verify-repair-phase0-docs.mjs')) {
  main();
}
