import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/billing-report.yml', import.meta.url), 'utf8');

test('billing conditions use contexts allowed by GitHub Actions', () => {
  const conditions = workflow.split(/\r?\n/).filter((line) => /^\s*if:/.test(line));
  assert.equal(conditions.some((line) => /\bsecrets\./.test(line)), false,
    'secrets cannot be referenced directly in if expressions: the workflow cannot start');
});

test('billing uses the existing job summary instead of the retired LINE Notify service', () => {
  assert.ok(!/LINE_NOTIFY_TOKEN|notify-api\.line\.me/.test(workflow), 'retired notification service must be removed');
  assert.ok(/gh_billing_summary\.py/.test(workflow), 'report must publish a credential-independent summary');
  assert.ok(/contents:\s*read/.test(workflow), 'checkout needs contents: read');
});

test('report diagnostics and CSV are retained even when report generation fails', () => {
  const upload = workflow.match(/- name: Upload billing[\s\S]*?(?=\n {6}- name:|$)/)?.[0];
  assert.ok(upload, 'billing artifact step exists');
  assert.ok(/if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(upload), 'retain diagnostics after a failed report');
  assert.ok(/billing-report\.log/.test(upload), 'artifact includes diagnostics');
  assert.ok(/\.csv/.test(upload), 'artifact includes CSV');
  assert.ok(/pipefail/.test(workflow), 'logging must preserve collector failure exit status');
});

test('billing regression checks have a pull-request lane without executing a live report', () => {
  assert.ok(/pull_request:/.test(workflow), 'billing changes need offline PR validation');
  assert.ok(/node --test scripts\/billing-workflow\.test\.mjs/.test(workflow));
  assert.ok(/unittest[\s\S]*test_gh_billing_report/.test(workflow));
  const reportJob = workflow.slice(workflow.indexOf('\n  report:'));
  assert.ok(/if:.*github\.event_name == 'schedule'.*github\.event_name == 'workflow_dispatch'/.test(reportJob),
    'PR validation must not fetch account billing or send messages');
});
