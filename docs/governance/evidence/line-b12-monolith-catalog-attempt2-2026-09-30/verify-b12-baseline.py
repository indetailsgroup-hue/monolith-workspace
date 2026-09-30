"""Read-only verification of raw baseline evidence and optional committed blobs."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

parser=argparse.ArgumentParser()
group=parser.add_mutually_exclusive_group()
group.add_argument('--rev')
group.add_argument('--index',action='store_true')
args=parser.parse_args()
names=['line-b12-monolith-catalog-2026-09-30','line-b12-monolith-catalog-attempt2-2026-09-30']
base=Path('docs/governance/evidence')
def read(p):
    p=Path(p)
    return subprocess.check_output(['git','show',(args.rev or '')+':'+p.as_posix()]) if args.rev or args.index else p.read_bytes()
def check(ok,label):
    if not ok: raise SystemExit('FAIL: '+label)
    print('PASS:',label)
for name in names:
    b=base/name
    for sums in ('SHA256SUMS.run','SHA256SUMS'):
        lines=read(b/sums).decode().splitlines()
        for line in lines:
            h,f=line.split(maxsplit=1);f=f.lstrip('*')
            check(hashlib.sha256(read(b/f)).hexdigest()==h, name+'/'+f+' checksum')
    for p in sorted(b.iterdir()):
        if not p.is_file(): continue
        content=re.sub(rb"\$\{[A-Z_][A-Z_0-9]*\}", b"[VARIABLE]", read(p))
        check(not re.search(rb'eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}|sb_secret_[A-Za-z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(?:ql)?://[^\s:@]+:[^\s@\[\]]+@',content),p.name+' credential patterns')
    teardown=read(b/'06-teardown.txt').decode()
    check('containers_present_after_removal: []' in teardown and 'network_present_after_removal: []' in teardown,name+' cleanup')
    check('PASS: no generated credential bytes' in read(b/'07-credential-scan.txt').decode(),name+' run-time credential scan')
b=base/names[1]
ctx=read(b/'00-context.txt').decode()
check('runner_exit=0' in ctx and 'migrations_applied_ok: 193 of 193' in ctx and 'failed: 0' in ctx,'full migration chain and runner exit')
check('cron_launch_active_jobs: off' in ctx,'cron disabled')
check('cron_job_run_details_rows: 0' in read(b/'03-baseline-after-migrations.txt').decode(),'zero cron executions')
check('catalog_fingerprint_unchanged_by_checklist: yes' in ctx,'captured catalog fingerprint unchanged')
check(read(b/'catalog-checklist.sql').replace(b'\r\n',b'\n')==read('scripts/line-b12-catalog.sql').replace(b'\r\n',b'\n'),'reader source identity')
a=json.loads(read(b/'04a-catalog.json'))
check(a==json.loads(read(b/'04b-catalog-repeat.json')),'two catalog captures equal')
check(len(a['targets'])==20 and all(r['exists'] and r['security_definer'] and r['owner']=='postgres' for r in a['targets']),'20 expected owner/definer identities')
check(a['missing_roles']==[] and a['unexpected_overloads']==[],'no missing roles or extra overloads')
rows=json.loads(read(b/'08-matrix-comparison.json'))['comparisons']
check(len(rows)==60,'60 matrix cells')
matrix=read('docs/governance/line-b12-permission-matrix.en.md').decode()
expected={}
for line in matrix.splitlines():
    if line.startswith('| B12-'):
        identity,signature,prior,anon,auth,service,group=[v.strip() for v in line.strip('|').split('|')]
        for role,target in zip(('anon','authenticated','service_role'),(anon,auth,service)):
            expected[(identity,role)]=(signature.strip('`'),target)
check(len({(r['id'],r['role']) for r in rows})==60,'unique matrix cells')
for row in rows:
    t=next(t for t in a['targets'] if t['id']==row['id'])
    actual=next(e['execute'] for e in t['effective'] if e['role']==row['role'])
    signature,target=expected[(row['id'],row['role'])]
    state='OPEN_DECISION' if target=='DECIDE' else 'REVOKE_NEEDED' if target=='DENY' and actual else 'ALREADY_DENIED' if target=='DENY' else 'KEEP_PRESENT' if actual else 'KEEP_MISSING'
    check(row['signature']==t['signature']=='public.'+signature and row['proposed']==target and row['effective_execute']==actual and row['comparison']==state,row['id']+'/'+row['role']+' comparison')
print('RESULT: PASS — reconstructed pre-0199 baseline only')
