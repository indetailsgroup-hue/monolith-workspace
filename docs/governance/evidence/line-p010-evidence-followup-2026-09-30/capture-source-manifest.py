from pathlib import Path
import hashlib,json,sys
paths=set()
for folder in ('supabase/migrations','supabase/tests','tests/line-oa-commerce/py','tests/line-oa-commerce/concurrency'):
 for p in Path(folder).rglob('*'):
  if p.is_file() and p.suffix in ('.sql','.py','.mjs','.ini') and '__pycache__' not in p.parts:
   paths.add(p.as_posix())
paths.update(['.github/workflows/db-verify.yml','scripts/line-ci-tap.mjs','scripts/run-line-db-suites.sh','tests/line-oa-commerce/ci/tap-evidence.test.mjs'])
rows=[{'path':p,'sha256':hashlib.sha256(Path(p).read_bytes().replace(b'\r\n',b'\n')).hexdigest()} for p in sorted(paths)]
Path(sys.argv[1]).write_text(json.dumps({'format':'sha256-lf-v1','files':rows},indent=2)+'\n',encoding='utf-8',newline='\n')
