node -e "
const fs = require('fs');
function countSuite(file, suite) {
  const tap = fs.existsSync(file) ? fs.readFileSync(file,'utf8') : '';
  const ok = (tap.match(/^ok /gm)||[]).length;
  const notOk = (tap.match(/^not ok /gm)||[]).length;
  return { suite, tap: file, ok, notOk, pass: notOk === 0 && ok > 0 };
}
const suites = [
  'workflow_db_invariants', 'trust_kernel_tenancy', 'trust_kernel_governance',
  'trust_kernel_release', 'trust_kernel_bundles', 'trust_kernel_containment',
  'trust_kernel_safety', 'repair_phase0_organization', 'repair_phase0_containment',
  'line_outbound_claim_record', 'line_oa_client_write_revoke',
  'line_oa_client_write_revoke_fail_closed',
].map((s) => countSuite('tap/' + s + '.tap', s + '.sql'));
const mig = fs.existsSync('migrations_applied.txt') ? fs.readFileSync('migrations_applied.txt','utf8').trim() : 'unknown';
const ev = {
  evidenceTier: 'E0', workflow: 'db-verify',
  commit: process.env.GITHUB_SHA, ref: process.env.GITHUB_REF,
  runUrl: process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID,
  environment: 'ubuntu-latest / supabase local (ephemeral)',
  timestamp: new Date().toISOString(),
  migrationsApplied: Number(mig) || mig,
  pgtap: { suites, pass: suites.every(s => s.pass) },
};
fs.writeFileSync('db-verify-evidence.json', JSON.stringify(ev, null, 2));
console.log(JSON.stringify(ev, null, 2));
"
