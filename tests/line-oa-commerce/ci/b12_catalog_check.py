"""Synthetic offline PostgreSQL contract tests; never connects to an existing DB."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[3]
SQL = ROOT / 'scripts/line-b12-catalog.sql'

def run(args, data=None, check=True):
    result = subprocess.run(args, input=data, text=True, encoding='utf-8', capture_output=True)
    if check and result.returncode:
        raise RuntimeError(f'{args[0]} failed: {result.stderr[:500]}')
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--image', default='postgres:18')
    args = parser.parse_args()
    source = SQL.read_text(encoding='utf-8')  # RED: absent implementation.
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=False)
    image = run(['docker', 'image', 'inspect', args.image, '--format', '{{.Id}}']).stdout.strip()
    name = 'line-b12-fixture-' + uuid.uuid4().hex[:12]
    container = None
    results = []
    def check(ok, label):
        if not ok:
            raise AssertionError(label)
        results.append(label)
        print('PASS:', label, flush=True)
    def psql(text):
        return run(['docker','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'], text).stdout
    def snapshot(label):
        value = psql(source)
        parsed = json.loads(value)
        (output / (label+'.json')).write_text(value, encoding='utf-8')
        return parsed
    try:
        container = run(['docker','run','-d','--pull=never','--network=none',
            '--label','line.b12.fixture='+name,'--name',name,
            '-e','POSTGRES_HOST_AUTH_METHOD=trust', image]).stdout.strip()
        for _ in range(60):
            if run(['docker','exec',container,'pg_isready','-U','postgres'],check=False).returncode == 0:
                break
            time.sleep(0.5)
        else:
            raise RuntimeError('isolated database startup timed out')
        meta = json.loads(run(['docker','inspect',container]).stdout)[0]
        check(meta['HostConfig']['NetworkMode']=='none' and not meta['HostConfig']['PortBindings'], 'no network or published ports')
        empty = snapshot('empty')
        check(len(empty['targets'])==20 and all(not r['exists'] for r in empty['targets']), 'missing targets remain visible')
        check(set(empty['missing_roles'])=={'anon','authenticated','service_role','authenticator'}, 'missing named roles remain visible')
        md=(ROOT/'docs/governance/line-b12-permission-matrix.en.md').read_text(encoding='utf-8')
        signatures=re.findall(r'^\| B12-\d+ \| `([^`]+)`',md,re.M)
        check(len(signatures)==20, 'fixture covers exact twenty matrix identities')
        setup=['create role anon; create role authenticated; create role service_role; create role authenticator; create role inherited_writer; grant inherited_writer to anon;']
        for signature in signatures:
            returns = "trigger" if signature == "fn_welcome_on_group_bind()" else "void"
            setup.append(f"create function public.{signature} returns {returns} language plpgsql security definer as $$ begin raise exception 'AUDIT MUST NOT CALL TARGET'; end $$;")
        setup += [
            'alter default privileges in schema public grant execute on functions to service_role;',
            'create table public.fixture_binding(id integer);',
            'create trigger fixture_welcome after insert on public.fixture_binding for each row execute function public.fn_welcome_on_group_bind();',
            'revoke execute on function public.fn_prod_curated(uuid,text,jsonb) from public;',
            'grant execute on function public.fn_prod_curated(uuid,text,jsonb) to inherited_writer;',
            "create function public.fn_prod_curated(integer) returns void language sql as 'select';",
        ]
        psql('\n'.join(setup))
        before=psql("select md5(string_agg(oid::text||coalesce(proacl::text,'NULL'),'|' order by oid)) from pg_proc;")
        data=snapshot('populated')
        check(all(r['exists'] for r in data['targets']), 'all expected targets resolved')
        check(data['missing_roles']==[], 'all named roles found')
        check(any(r['creator']=='postgres' and r['schema']=='public' and 'service_role' in r['acl'] for r in data['default_function_acl']), 'future function grants captured')
        check(any(r['name']=='fixture_welcome' and r['function']=='fn_welcome_on_group_bind()' for r in data['triggers']), 'trigger dependency captured')
        target=next(r for r in data['targets'] if r['name']=='fn_prod_curated')
        check(target['owner']=='postgres' and target['security_definer'], 'owner and definer are captured')
        check(any(r['role']=='anon' and r['execute'] for r in target['effective']), 'inherited effective EXECUTE captured')
        check(any(r['grantee']=='inherited_writer' and r['grantor']=='postgres' for r in target['acl']), 'direct grantee and grantor captured')
        check(any(r['member']=='anon' and r['granted_role']=='inherited_writer' and r['inherit_option'] for r in data['memberships']), 'inheritance edge and option captured')
        check(any(r['identity']=='fn_prod_curated(integer)' for r in data['unexpected_overloads']), 'unexpected overload captured')
        default=next(r for r in data['targets'] if r['name']=='fn_lead_followup_sweep')
        check(any(r['grantee']=='PUBLIC' and r['privilege']=='EXECUTE' for r in default['acl']), 'NULL ACL interpreted with defaults')
        after=psql("select md5(string_agg(oid::text||coalesce(proacl::text,'NULL'),'|' order by oid)) from pg_proc;")
        check(before==after, 'catalog ACL fingerprint unchanged')
        check(data['read_only']=='on', 'query transaction is read only')
        psql('drop role authenticated;')
        partial=snapshot('missing-one-role')
        check(partial['missing_roles']==['authenticated'], 'single missing role is not a false pass')
        check('AUDIT MUST NOT CALL TARGET' not in json.dumps(data), 'target bodies neither executed nor exported')
    finally:
        if container:
            meta=json.loads(run(['docker','inspect',container]).stdout)[0]
            if meta['Config']['Labels'].get('line.b12.fixture') != name:
                raise RuntimeError('cleanup ownership mismatch')
            run(['docker','rm','-f','-v',container])
            check(run(['docker','container','inspect',container],check=False).returncode != 0, 'owned container removed')
        (output/'result.json').write_text(json.dumps({'scope':'SYNTHETIC ONLY; not MONOLITH or production','image':image,'source_sha256':hashlib.sha256(SQL.read_bytes()).hexdigest(),'checks':results},indent=2)+'\n',encoding='utf-8')
    print('RESULT: PASS',len(results),flush=True)

if __name__=='__main__':
    main()
