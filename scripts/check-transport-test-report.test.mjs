import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyTransportReport } from './check-transport-test-report.mjs';

const expected = ['tests/workflow/ts/a.test.ts', 'tests/workflow/ts/b.test.ts'];
const suite = (name, statuses = ['passed']) => ({
  name,
  assertionResults: statuses.map(status => ({ status })),
});
const report = testResults => ({ success: true, numFailedTests: 0, testResults });

test('accepts a nonempty passing assertion set for every expected file', () => {
  assert.doesNotThrow(() => verifyTransportReport(report(expected.map(name => suite(name))), expected));
});

test('rejects a partial collection even when the reported tests passed', () => {
  assert.throws(() => verifyTransportReport(report([suite(expected[0])]), expected), /missing.*b\.test\.ts/);
});

test('rejects a zero-assertion file and an empty expected inventory', () => {
  assert.throws(() => verifyTransportReport(report([suite(expected[0], [])]), [expected[0]]), /zero assertions/);
  assert.throws(() => verifyTransportReport(report([]), []), /no expected test files/);
});

test('rejects skipped, todo and failed assertions instead of counting them as coverage', () => {
  for (const status of ['pending', 'todo', 'failed']) {
    assert.throws(() => verifyTransportReport(report([suite(expected[0], ['passed', status])]), [expected[0]]), /did not pass/);
  }
});

test('rejects collection/startup failure despite any passing assertions', () => {
  assert.throws(() => verifyTransportReport({ ...report([suite(expected[0])]), success: false }, [expected[0]]), /run did not succeed/);
});

test('matches Windows report separators to portable inventory paths', () => {
  assert.doesNotThrow(() => verifyTransportReport(report([suite(expected[0].replaceAll('/', '\\'))]), [expected[0]]));
});
