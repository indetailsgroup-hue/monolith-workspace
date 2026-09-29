#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const [hostedPath, manifestPath, duplicateMapPath, outputJson, outputMarkdown] =
  process.argv.slice(2);

if (!outputMarkdown) {
  console.error(
    'usage: compare_hosted_migration_inventory.mjs HOSTED_JSON MANIFEST_TSV DUPLICATE_MAP_TSV OUTPUT_JSON OUTPUT_MD'
  );
  process.exit(2);
}

const hosted = JSON.parse(readFileSync(hostedPath, 'utf8'));

const parseTsv = (path) => {
  const [header, ...rows] = readFileSync(path, 'utf8').trim().split('\n');
  const keys = header.split('\t');
  return rows.filter(Boolean).map((row) => {
    const values = row.split('\t');
    return Object.fromEntries(keys.map((key, index) => [key, values[index] ?? '']));
  });
};

const canonical = parseTsv(manifestPath).map((row) => ({
  order: Number(row.order),
  version: row.version,
  file: row.file,
  sha256: row.sha256,
}));
const duplicateGroups = parseTsv(duplicateMapPath).map((row) => ({
  version: row.version,
  sourceFileCount: Number(row.source_file_count),
  sourceFiles: row.source_files.split(',').filter(Boolean),
}));

const hostedVersions = (hosted.migrationHistoryVersions ?? []).map(String);
const hostedSet = new Set(hostedVersions);
const canonicalSet = new Set(canonical.map((entry) => entry.version));

const duplicateHostedVersions = hostedVersions.filter(
  (version, index) => hostedVersions.indexOf(version) !== index
);
const missingFromHosted = canonical.filter((entry) => !hostedSet.has(entry.version));
const hostedNotCanonical = hostedVersions.filter((version) => !canonicalSet.has(version));
const presentCanonical = canonical.filter((entry) => hostedSet.has(entry.version));
const highestHostedCanonicalOrder = presentCanonical.reduce(
  (highest, entry) => Math.max(highest, entry.order),
  0
);
const historicalGaps = missingFromHosted.filter(
  (entry) => entry.order <= highestHostedCanonicalOrder
);
const mergedVersionsAlreadyRecorded = duplicateGroups.filter((group) =>
  hostedSet.has(group.version)
);

const coreTablesReady = Object.values(hosted.coreTables ?? {}).every(Boolean);
const historyOrderingCandidate =
  hostedNotCanonical.length === 0 &&
  duplicateHostedVersions.length === 0 &&
  historicalGaps.length === 0;
const mergedSourceProvenanceUnambiguous =
  mergedVersionsAlreadyRecorded.length === 0;
const historyAppendOnlyCandidate =
  historyOrderingCandidate && mergedSourceProvenanceUnambiguous;
const appendOnlyCandidate = historyAppendOnlyCandidate && coreTablesReady;

const report = {
  formatVersion: 1,
  hostedMigrationHistoryCount: hostedVersions.length,
  canonicalMigrationCount: canonical.length,
  canonicalVersionsPresent: presentCanonical.length,
  canonicalVersionsMissing: missingFromHosted.length,
  hostedVersionsNotCanonical: hostedNotCanonical,
  duplicateHostedVersions: [...new Set(duplicateHostedVersions)],
  highestHostedCanonicalOrder,
  historicalGapCount: historicalGaps.length,
  historicalGaps,
  missingFromHosted,
  mergedVersionRiskCount: mergedVersionsAlreadyRecorded.length,
  mergedVersionsAlreadyRecorded,
  coreTablesReady,
  historyOrderingCandidate,
  mergedSourceProvenanceUnambiguous,
  historyAppendOnlyCandidate,
  appendOnlyCandidate,
  schemaCloneSimulationRequired:
    historyOrderingCandidate && missingFromHosted.length > 0,
  requiresReconciliation: !appendOnlyCandidate,
  productionWritesPerformed: false,
};

writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`);

const list = (entries, render) =>
  entries.length ? entries.map((entry) => `- ${render(entry)}`).join('\n') : '- None';

const markdown = `# Hosted migration reconciliation

This report compares read-only hosted migration history with the exact canonical bundle. It does not authorize or perform production writes.

## Decision

- Append-only candidate: **${appendOnlyCandidate}**
- Migration ordering candidate: **${historyOrderingCandidate}**
- Append-only migration history: **${historyAppendOnlyCandidate}**
- Merged-source provenance unambiguous: **${mergedSourceProvenanceUnambiguous}**
- Requires reconciliation: **${!appendOnlyCandidate}**
- Core tables ready: **${coreTablesReady}**
- Hosted history: **${hostedVersions.length}** versions
- Canonical bundle: **${canonical.length}** versions
- Canonical versions missing from hosted: **${missingFromHosted.length}**
- Historical gaps at or before the hosted tail: **${historicalGaps.length}**
- Already-recorded versions built from duplicate source files: **${mergedVersionsAlreadyRecorded.length}**
- Hosted versions not represented canonically: **${hostedNotCanonical.length}**

## Historical gaps

${list(historicalGaps, (entry) => `\`${entry.version}\` — ${entry.file}`)}

## Recorded versions with merged-source risk

${list(
  mergedVersionsAlreadyRecorded,
  (group) =>
    `\`${group.version}\` — ${group.sourceFileCount} source files: ${group.sourceFiles
      .map((file) => `\`${file}\``)
      .join(', ')}`
)}

## Missing canonical versions after the hosted tail

${list(
  missingFromHosted.filter((entry) => entry.order > highestHostedCanonicalOrder),
  (entry) => `\`${entry.version}\` — ${entry.file}`
)}

## Hosted versions not in the canonical bundle

${list(hostedNotCanonical, (version) => `\`${version}\``)}
`;

writeFileSync(outputMarkdown, markdown);
console.log(JSON.stringify(report, null, 2));
