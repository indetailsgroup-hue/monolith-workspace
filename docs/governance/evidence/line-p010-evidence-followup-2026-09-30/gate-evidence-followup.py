"""Check the P0-10 hardening index or commit without mutating Git."""
import hashlib
import html
import pathlib
import re
import subprocess
import sys
import tempfile

BASE = '3bdd6f3e5217f3252292cd11c858be151c01f977'
GREEN = 'docs/governance/evidence/line-p010-evidence-followup-2026-09-30'
TRANSCRIPT = 'docs/governance/evidence/line-p010-evidence-followup-commit-2026-09-30'
SOURCES = ['scripts/line-ci-tap.mjs', 'tests/line-oa-commerce/ci/tap-evidence.test.mjs']
DOCS = [base + '.' + lang + ext for base in ('docs/PRD-LINE-OA', 'docs/governance/line-p010-integration-b12-followup') for lang in ('en','th') for ext in ('.md','.html')]
rev = sys.argv[2] if len(sys.argv) == 3 and sys.argv[1] == '--rev' else None
with_transcript = bool(rev or '--with-transcript' in sys.argv)

def git(*args):
    return subprocess.check_output(['git', *args])

def blob(path):
    return git('show', (rev or '') + ':' + path)

def check(ok, label):
    if not ok:
        raise SystemExit('FAIL: ' + label)
    print('PASS: ' + label)

def lf(data):
    return data.replace(b'\r\n', b'\n')

def files(directory):
    return {p.as_posix() for p in pathlib.Path(directory).rglob('*') if p.is_file()}

if rev:
    check(git('rev-list', '--parents', '-n', '1', rev).decode().split()[1:] == [BASE], 'single expected parent')
    changed = set(git('diff-tree', '--no-commit-id', '--name-only', '-r', rev).decode().splitlines())
else:
    check(git('rev-parse', 'HEAD').decode().strip() == BASE, 'expected base HEAD')
    changed = set(git('diff', '--cached', '--name-only').decode().splitlines())
expected = set(SOURCES + DOCS) | files(GREEN)
if with_transcript:
    expected |= files(TRANSCRIPT)
check(changed == expected, 'exact authorized change set')
migration = 'supabase/migrations/0198_line_oa_revoke_client_write_grants.sql'
check(blob(migration) == git('show', BASE + ':' + migration), '0198 remains unchanged')
for directory in [GREEN] + ([TRANSCRIPT] if with_transcript else []):
    sums = {}
    for line in blob(directory + '/SHA256SUMS').decode().splitlines():
        digest, name = line.split(maxsplit=1)
        sums[name.lstrip('*')] = digest
    check({directory + '/' + n for n in sums} == files(directory) - {directory + '/SHA256SUMS'}, directory + ': complete checksums')
    check(all(hashlib.sha256(blob(directory + '/' + n)).hexdigest() == digest and hashlib.sha256(pathlib.Path(directory, n).read_bytes()).hexdigest() == digest for n, digest in sums.items()), directory + ': Git and disk checksum match')
    if directory != TRANSCRIPT:
        subprocess.run([sys.executable, directory + '/verify-p010-failclosed.py', directory, 'green'], check=True, stdout=subprocess.PIPE)
        print('PASS: ' + directory + ': fresh evidence verification')
# Bind the tested source snapshot to current index/commit, without touching old runs.
import json
manifest = json.loads(blob(GREEN + '/tested-source-manifest.json'))
check(manifest['format'] == 'sha256-lf-v1', 'tested source manifest format')
check(all(hashlib.sha256(lf(blob(item['path']))).hexdigest() == item['sha256'] for item in manifest['files']), 'entire tested source manifest matches Git')
for line in blob(GREEN + '/SHA256SUMS.run').decode().splitlines():
    digest, name = line.split(maxsplit=1)
    check(hashlib.sha256(blob(GREEN + '/' + name.lstrip('*'))).hexdigest() == digest, 'raw run unchanged: ' + name)
for source in SOURCES + DOCS:
    check(lf(blob(source)) == lf(pathlib.Path(source).read_bytes()), source + ': source identity')
copies = {SOURCES[0]: 'source-line-ci-tap.mjs', SOURCES[1]: 'source-tap-evidence.test.mjs'}
for source, copy in copies.items():
    for directory in (GREEN,):
        check(lf(blob(source)) == lf(blob(directory + '/' + copy)), source + ': identical to tested ' + directory)
subprocess.run(['node', '--test', 'tests/line-oa-commerce/ci/tap-evidence.test.mjs'], check=True, stdout=subprocess.PIPE)
print('PASS: fresh TAP validator tests')
for lang in ('en', 'th'):
    for base in ('docs/PRD-LINE-OA', 'docs/governance/line-p010-integration-b12-followup', GREEN + '/REPORT'):
        page = base + '.' + lang + '.html'
        title = html.unescape(re.search(r'<title>(.*?)</title>', blob(page).decode())[1])
        with tempfile.TemporaryDirectory() as temporary:
            output = pathlib.Path(temporary, 'render.html')
            subprocess.run(['node', 'scripts/render-standalone-markdown.mjs', page[:-5] + '.md', str(output), lang, title], check=True, stdout=subprocess.PIPE)
            check(lf(output.read_bytes()) == lf(blob(page)), page + ': renderer matches')

patterns = [rb'eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}', rb'sb_secret_[A-Za-z0-9_-]{16,}', rb'-----BEGIN [A-Z ]*PRIVATE KEY-----', rb'[a-z][a-z0-9+.-]*://[^/\s:@\x22\x27]+:([^@\s/\x22\x27]+)@', rb'(?i)(?:password|passwd|api[_-]?key|secret|token)[\x22\x27]?\s*[=:]\s*[\x22\x27]?([A-Za-z0-9+/_.-]{16,})']
def secret_hits(data):
    hits = []
    for index, pattern in enumerate(patterns):
        for match in re.finditer(pattern, data):
            value = match.group(1) if match.groups() else match.group(0)
            if re.fullmatch(rb'\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\[REDACTED\]', value):
                continue
            hits.append(index)
    return hits
segment = b'Abc123xyz' * 3
controls = [b'eyJ' + segment + b'.eyJ' + segment + b'.' + segment, b'sb_' + b'secret_' + segment, b'-----BEGIN ' + b'RSA PRIVATE KEY-----', b'postgres://u:' + segment + b'@h', b'pass' + b'word=' + segment]
check(all(secret_hits(c) for c in controls), 'secret scanner positive controls')
default = b'postgresql://postgres:' + b'postgres@127.0.0.1:54322/'
for path in changed:
    data = blob(path)
    if path == SOURCES[0] or path.endswith('/source-db-verify.yml'):
        data = data.replace(default, b'postgresql://[REDACTED]@127.0.0.1:54322/')
    check(not secret_hits(data), path + ': credential-shaped scan')

if with_transcript:
    transcript = blob(TRANSCRIPT + '/gate-transcript.txt').decode()
    expected_tree = re.search(r'^gated_tree: ([0-9a-f]{40})$', transcript, re.M)[1]
    # Hash a tree from the index/commit entries entirely in memory.
    records = git('ls-tree', '-rz', rev) if rev else git('ls-files', '--stage', '-z')
    root = {}
    for entry in records.split(b'\0'):
        if not entry:
            continue
        meta, path = entry.split(b'\t', 1)
        if path.decode().startswith(TRANSCRIPT + '/'):
            continue
        fields = meta.split()
        mode, sha = fields[0], fields[2] if rev else fields[1]
        node = root
        components = path.split(b'/')
        for component in components[:-1]:
            node = node.setdefault(component, {})
        node[components[-1]] = (mode.lstrip(b'0'), bytes.fromhex(sha.decode()))
    def tree_hash(node):
        data = b''
        for name in sorted(node, key=lambda n: n + (b'/' if isinstance(node[n], dict) else b'')):
            value = node[name]
            mode, digest = (b'40000', tree_hash(value)) if isinstance(value, dict) else value
            data += mode + b' ' + name + b'\0' + digest
        return hashlib.sha1(b'tree ' + str(len(data)).encode() + b'\0' + data).digest()
    check(tree_hash(root).hex() == expected_tree, 'final tree excluding transcript equals gated tree')
print('RESULT: GATE PASS (local evidence; full CI remains separately reported)')
