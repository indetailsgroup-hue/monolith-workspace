"""P0-10 follow-up change-set gate. Exit 0 only when every check passes. Run from the repository root.

Index mode (before commit):   py <green bundle>/gate-p010-followup.py
Commit mode (after commit):   py <green bundle>/gate-p010-followup.py --rev <commit>

Checks: the change set is exactly the approved list plus the two evidence
bundles (plus, in commit mode, the gate transcript); 0198 itself is untouched;
each bundle's SHA256SUMS matches disk bytes and Git blobs, raw run outputs are
unchanged since the runner, the in-run credential scan passed and the bundle
verifier still passes; the committed suite and workflow equal the bytes the runs
used (CRLF/LF aside); every HTML file equals the repository renderer's output
for its Markdown; and no Git blob contains a credential-shaped value.
"""
import hashlib
import pathlib
import re
import subprocess
import sys
import tempfile

BASE = "87930836a87852cac32efd80920b1d19f62b48f2"
RED = "docs/governance/evidence/line-p010-failclosed-red-2026-09-30"
GREEN = "docs/governance/evidence/line-p010-failclosed-green-2026-09-30"
TRANSCRIPT = "docs/governance/evidence/line-p010-followup-commit-2026-09-30"
SUITE = "supabase/tests/line_oa_client_write_revoke_fail_closed.sql"
WORKFLOW = ".github/workflows/db-verify.yml"
MIG_0198 = "supabase/migrations/0198_line_oa_revoke_client_write_grants.sql"
DOCS = [
    "docs/PRD-LINE-OA.en.md", "docs/PRD-LINE-OA.th.md", "docs/PRD-LINE-OA.en.html", "docs/PRD-LINE-OA.th.html",
    f"{GREEN}/REPORT.en.md", f"{GREEN}/REPORT.th.md", f"{GREEN}/REPORT.en.html", f"{GREEN}/REPORT.th.html",
]
MODIFIED_OK = {WORKFLOW, "docs/PRD-LINE-OA.en.md", "docs/PRD-LINE-OA.th.md", "docs/PRD-LINE-OA.en.html", "docs/PRD-LINE-OA.th.html"}
rev = sys.argv[2] if len(sys.argv) == 3 and sys.argv[1] == "--rev" else None
failures = []


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, check=True).stdout


def check(ok, message):
    print(("PASS: " if ok else "FAIL: ") + message)
    if not ok:
        failures.append(message)


def blob(path):
    return git("show", f"{rev}:{path}" if rev else f":{path}")


def lf(data):
    return data.replace(b"\r\n", b"\n")


def bundle_files(bundle):
    return sorted(p.as_posix() for p in pathlib.Path(bundle).rglob("*") if p.is_file())


# 1. Base and change set.
if rev:
    parents = git("rev-list", "--parents", "-n", "1", rev).decode().split()
    check(parents[1:] == [BASE], f"{rev} has exactly one parent, the accepted base {BASE[:9]}")
    status = git("diff-tree", "--no-commit-id", "--name-status", "-r", rev).decode().splitlines()
else:
    check(git("rev-parse", "HEAD").decode().strip() == BASE, f"HEAD is the accepted base {BASE[:9]}")
    status = git("diff", "--cached", "--name-status").decode().splitlines()
changes = dict(reversed(line.split("\t", 1)) for line in status)
expected = set([SUITE, WORKFLOW, *DOCS, *bundle_files(RED), *bundle_files(GREEN)])
if rev:
    expected |= set(bundle_files(TRANSCRIPT))
check(set(changes) == expected, f"change set is exactly the approved {len(expected)} paths "
      f"(unexpected={sorted(set(changes) - expected)}, missing={sorted(expected - set(changes))})")
bad_status = {p: s for p, s in changes.items() if not (s == "A" or (s == "M" and p in MODIFIED_OK))}
check(not bad_status, f"only additions, plus modifications of the workflow and the four PRD files ({bad_status})")
check(MIG_0198 not in changes and lf(blob(MIG_0198)) == lf(git("show", f"{BASE}:{MIG_0198}")), "0198 itself is unchanged")

# 2. Evidence bundles.
for bundle, mode in ((RED, "red"), (GREEN, "green")):
    files = [f[len(bundle) + 1:] for f in bundle_files(bundle)]
    sums = {}
    for line in pathlib.Path(bundle, "SHA256SUMS").read_text(encoding="utf-8").splitlines():
        digest, name = line.split(maxsplit=1)
        sums[name.lstrip("*")] = digest
    check(sorted(sums) == sorted(f for f in files if f != "SHA256SUMS"), f"{bundle}: SHA256SUMS lists every file except itself ({len(sums)})")
    bad = [n for n, d in sums.items() if hashlib.sha256(pathlib.Path(bundle, n).read_bytes()).hexdigest() != d]
    check(not bad, f"{bundle}: SHA256SUMS matches working-tree bytes ({bad})")
    bad = [n for n, d in sums.items() if hashlib.sha256(blob(f"{bundle}/{n}")).hexdigest() != d]
    check(not bad, f"{bundle}: SHA256SUMS matches {'commit' if rev else 'staged'} Git blobs byte-for-byte ({bad})")
    run = {}
    for line in pathlib.Path(bundle, "SHA256SUMS.run").read_text(encoding="utf-8").splitlines():
        digest, name = line.split(maxsplit=1)
        run[name.lstrip("*")] = digest
    changed = [n for n, d in run.items() if sums.get(n) != d]
    check(not changed, f"{bundle}: {len(run)} raw run outputs unchanged since the runner ({changed})")
    scan = pathlib.Path(bundle, "10a-credential-scan.txt").read_text(encoding="utf-8")
    check("PASS: positive control" in scan and "PASS: no generated credential bytes" in scan, f"{bundle}: in-run credential scan passed")
    v = subprocess.run([sys.executable, f"{bundle}/verify-p010-failclosed.py", bundle, mode], capture_output=True, text=True)
    check(v.returncode == 0, f"{bundle}: verifier re-run over the captured files exits 0 ({mode})")
    check(lf(blob(SUITE)) == lf(pathlib.Path(bundle, "source-line_oa_client_write_revoke_fail_closed.sql").read_bytes()),
          f"{SUITE} equals the copy used by {bundle.rsplit('/', 1)[1]}")
    check(lf(blob(WORKFLOW)) == lf(pathlib.Path(bundle, "source-db-verify.yml").read_bytes()),
          f"{WORKFLOW} equals the copy recorded by {bundle.rsplit('/', 1)[1]}")
drift = [p for p in (SUITE, WORKFLOW, *DOCS) if lf(blob(p)) != lf(pathlib.Path(p).read_bytes())]
check(not drift, f"Git blobs of the non-bundle files equal the working tree ({drift})")

# 3. HTML equals the repository renderer output for its Markdown.
with tempfile.TemporaryDirectory() as tmp:
    for html in [d for d in DOCS if d.endswith(".html")]:
        page = blob(html).decode("utf-8")
        title = re.search(r"<title>(.*?)</title>", page).group(1)
        lang = re.search(r'<html lang="([^"]+)"', page).group(1)
        title = title.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&#39;", "'")
        out = pathlib.Path(tmp, "r.html")
        subprocess.run(["node", "scripts/render-standalone-markdown.mjs", html[:-5] + ".md", str(out), lang, title],
                       capture_output=True, check=True)
        check(lf(out.read_bytes()) == lf(blob(html)), f"{html} equals the renderer output of its Markdown")

# 4. Credential-shaped values in every Git blob of the change set.
patterns = {
    "jwt": re.compile(rb"eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"),
    "private_key": re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "supabase_secret_key": re.compile(rb"sb_secret_[A-Za-z0-9_-]{16,}"),
    "uri_password": re.compile(rb"[a-z][a-z0-9+.-]*://[^/\s:@'\"]+:([^@\s/'\"]+)@"),
    "assigned_secret": re.compile(rb"(?i)(?:password|passwd|secret|api[_-]?key|token)[\"']?\s*[=:]\s*[\"']?([A-Za-z0-9+/_.-]{16,})"),
}
placeholder = re.compile(rb"^(\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\[REDACTED\])$")
seg = "Aa0" * 4
controls = [("eyJ" + seg + ".eyJ" + seg + "." + seg).encode(), ("-----BEGIN " + "RSA PRIVATE KEY-----").encode(),
            ("sb_" + "secret_" + seg * 2).encode(), ("postgres://u:" + seg + "@h").encode(), ("pass" + "word=" + seg * 2).encode()]


# Known non-secret: the Supabase CLI's documented local-only default DSN, used by
# the existing CI step "Capture DB URL" (db-verify.yml) and its recorded copies.
# (split so this source line does not itself look like a credential)
LOCAL_DEFAULT = b"postgresql://postgres:" + b"postgres@127.0.0.1:54322/"
LOCAL_DEFAULT_FILES = {WORKFLOW, f"{RED}/source-db-verify.yml", f"{GREEN}/source-db-verify.yml"}


def findings(data, path=None):
    out = []
    for name, rx in patterns.items():
        for m in rx.finditer(data):
            value = m.group(1) if m.groups() else m.group(0)
            if name == "uri_password" and path in LOCAL_DEFAULT_FILES and data.startswith(LOCAL_DEFAULT, m.start()):
                continue
            if not placeholder.match(value):
                out.append(name)
    return sorted(set(out))


check(all(findings(c) for c in controls), "pattern scanner positive controls all detected")
hits = {p: findings(blob(p), p) for p in sorted(changes)}
hits = {p: h for p, h in hits.items() if h}
check(not hits, f"no credential-shaped value in {len(changes)} Git blobs ({hits})")

print("RESULT:", "GATE PASS" if not failures else f"GATE FAIL ({len(failures)} check(s))")
sys.exit(1 if failures else 0)
