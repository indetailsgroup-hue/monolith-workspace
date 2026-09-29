import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scopes = {
  workflow: 'tests/workflow/ts',
  'line-oa-commerce': 'tests/line-oa-commerce/ts',
  edge: 'supabase/functions',
  entitlement: 'entitlement-db/supabase/functions',
};
const normalize = name => resolve(name.replaceAll('\\', '/'));

export function verifyTransportReport(report, expectedFiles) {
  if (!expectedFiles.length) throw new Error('no expected test files');
  if (report?.success !== true || report.numFailedTests !== 0) {
    throw new Error('transport run did not succeed');
  }
  const results = new Map((report.testResults ?? []).map(result => [normalize(result.name), result]));
  let passed = 0;
  for (const file of expectedFiles) {
    const result = results.get(normalize(file));
    if (!result) throw new Error(`missing expected test file: ${file}`);
    const assertions = result.assertionResults ?? [];
    if (!assertions.length) throw new Error(`zero assertions: ${file}`);
    if (assertions.some(assertion => assertion.status !== 'passed')) {
      throw new Error(`assertions did not pass (failed/skipped/todo): ${file}`);
    }
    passed += assertions.length;
  }
  return { files: expectedFiles.length, passed };
}

function testFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return testFiles(path);
    return /\.(test|spec)\.ts$/.test(entry.name) ? [path] : [];
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [reportPath, ...names] = process.argv.slice(2);
    if (!reportPath || !names.length) throw new Error('usage: check-transport-test-report.mjs report.json scope [...]');
    const expected = names.flatMap(name => {
      if (!Object.hasOwn(scopes, name)) throw new Error(`unknown transport scope: ${name}`);
      const files = testFiles(scopes[name]);
      if (!files.length) throw new Error(`no expected test files for scope: ${name}`);
      return files;
    });
    const result = verifyTransportReport(JSON.parse(readFileSync(reportPath, 'utf8')), expected);
    console.log(`transport coverage: ${result.files} expected files, ${result.passed} passed assertions (${names.join(', ')})`);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
