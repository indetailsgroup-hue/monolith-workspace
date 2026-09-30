"""Local wiring test only. Synthetic TAP; no database or GitHub Actions run."""
from pathlib import Path
import os,sys,subprocess,json,hashlib,tempfile,re
import yaml
root=Path.cwd();bundle=Path(sys.argv[1]).resolve();bundle.mkdir(exist_ok=False,parents=True)
(bundle/'.gitattributes').write_text('* -text\n',encoding='utf-8')
checks=[]
def check(value,label):
 if not value:raise AssertionError(label)
 checks.append(label)
 print('PASS:',label)
workflow=yaml.safe_load((root/'.github/workflows/db-verify.yml').read_text(encoding='utf-8'))
job=workflow['jobs']['db-verify'];steps=job['steps']; names=[s.get('name','') for s in steps]
source=next(s for s in steps if s.get('id')=='source')
check(source['run']=='node scripts/line-ci-source.mjs source-manifest.json','reviewed manifest command is wired')
check(names.index('Capture tested source manifest')<names.index('Start local Supabase (applies migration chain)'),'source capture precedes database startup')
check(job['env']['LINE_DB_RUN_ID']=='${{ github.run_id }}-${{ github.run_attempt }}','shared run ID includes attempt')
check(next(s for s in steps if s.get('name')=='Test TAP evidence validation')['run']=='node --test tests/line-oa-commerce/ci/tap-evidence.test.mjs tests/line-oa-commerce/ci/source-evidence.test.mjs','both validator suites registered')
triggers=workflow.get('on',workflow.get(True))
check(all('scripts/line-ci-source.mjs' in triggers[k]['paths'] for k in ('push','pull_request')),'both triggers include helper')
paths=next(s for s in steps if s.get('name')=='Upload DB evidence')['with']['path'].splitlines()
check('source-manifest.json' in paths and 'migrations_applied.txt' in paths,'artifact upload includes manifest and migration count')
env=dict(os.environ);env['GITHUB_ENV']=str(bundle/'github-env.txt')
command=['node','scripts/line-ci-source.mjs',str(bundle/'source-manifest.json')]
r=subprocess.run(command,cwd=root,env=env,capture_output=True,text=True,encoding='utf-8')
(bundle/'capture-stdout.txt').write_text(r.stdout,encoding='utf-8');(bundle/'capture-stderr.txt').write_text(r.stderr,encoding='utf-8')
check(r.returncode==0,'actual helper capture exit zero')
manifest_bytes=(bundle/'source-manifest.json').read_bytes();digest=hashlib.sha256(manifest_bytes).hexdigest();manifest=json.loads(manifest_bytes)
export=(bundle/'github-env.txt').read_text().strip();check(export=='LINE_DB_EVIDENCE_SOURCE_SHA256='+digest,'GITHUB_ENV exports exact artifact digest')
check(r.stdout.splitlines()==[digest,'files='+str(len(manifest['files']))],'stdout is digest and file count only')
check(all(hashlib.sha256((root/x['path']).read_bytes().replace(b'\r\n',b'\n')).hexdigest()==x['sha256'] for x in manifest['files']),'all source rows match current bytes')
commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
check(manifest['commit']==commit,'manifest binds current base SHA')
# Isolated synthetic TAP proves only env handoff and parser integration.
with tempfile.TemporaryDirectory(prefix='line-source-wiring-') as temporary:
 t=Path(temporary);assert t.resolve().parent==Path(tempfile.gettempdir()).resolve() and t.name.startswith('line-source-wiring-');tap=t/'tap';tap.mkdir(); migrations=t/'synthetic-migrations.txt';migrations.write_text('1\n')
 env.update(GITHUB_ACTIONS='false',LINE_DB_EVIDENCE_ORIGIN='local',LINE_DB_RUN_ID='local-synthetic-wiring',LINE_DB_EVIDENCE_COMMIT=commit,LINE_DB_EVIDENCE_REF='local-synthetic-wiring',LINE_DB_EVIDENCE_SOURCE_SHA256=digest,LINE_DB_MIGRATIONS_FILE=str(migrations))
 suites=['workflow_db_invariants','trust_kernel_tenancy','trust_kernel_governance','trust_kernel_release','trust_kernel_bundles','trust_kernel_containment','trust_kernel_safety','repair_phase0_organization','repair_phase0_containment','line_outbound_claim_record','line_oa_client_write_revoke','line_oa_client_write_revoke_fail_closed']
 parser=str(root/'scripts/line-ci-tap.mjs')
 for suite in suites:
  f=tap/(suite+'.tap');f.write_text('1..1\nok 1 - SYNTHETIC WIRING ONLY\n');err=tap/(suite+'.stderr');err.write_text('')
  r=subprocess.run(['node',parser,'check',str(f),'0',suite,str(tap/(suite+'.result.json')),str(err)],env=env,capture_output=True,text=True)
  check(r.returncode==0,'synthetic fixture checked: '+suite)
 r=subprocess.run(['node',parser,'assemble',str(tap),str(t/'summary.json')],env=env,capture_output=True,text=True)
 check(r.returncode==0,'synthetic assembly exit zero')
 ev=json.loads((t/'summary.json').read_text())
 check(ev['testedSourceSha256']==digest and ev['provenanceComplete'] and not ev['missingProvenance'],'exported digest reaches complete synthetic metadata')
 check(ev['origin']=='local' and ev['runUrl'] is None and ev['workflowPass'] is None and ev['verdictScope']=='pgtap-only','synthetic assembly cannot claim actual CI')
 check(ev['fullPgTapPass'] and ev['migrationsApplied']==1 and ev['runId']=='local-synthetic-wiring','synthetic fixtures remain explicitly scoped')
context={'base':commit,'commands':[command], 'sourceRows':len(manifest['files']),'sourceDigest':digest,'captureExit':0,'wiringExit':0,'checks':checks,'scope':'LOCAL SYNTHETIC WIRING ONLY; no database or GitHub Actions run','workflowCommandAdjustment':'Only output path redirected to bundle; actual helper invoked from repo root'}
(bundle/'wiring-result.json').write_text(json.dumps(context,indent=2)+'\n',encoding='utf-8')
print('RESULT: local wiring checks passed; no DB/Actions result claimed')
