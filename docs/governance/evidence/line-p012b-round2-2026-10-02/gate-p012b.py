"""Round-2 (0199 pre-review fixes) change-set gate. Exit 0 only when every check passes.
Run from the repository root.

Index mode (before commit):   py <bundle>/gate-p012b.py
Commit mode (after commit):   py <bundle>/gate-p012b.py --rev <commit>

Blobs are read with `git cat-file blob` and core.longpaths, so long evidence paths
work on Windows. Checks: the change set is exactly the approved paths and touches
no migration or application source; the three runner bundles are sealed, keep
their runner outputs, pass their verifier again and used the committed test bytes;
the CI-remediation bundle keeps SHA256SUMS.run as at the base; the round-2 bundle
is sealed; the pinned governance linters exit 0 on the gated tree with the
allowlist unchanged; every changed HTML equals the renderer output; the workflow
change is comment-only; and no blob carries a new credential-shaped value.
"""
import hashlib
import io
import os
import pathlib
import re
import subprocess
import sys
import tarfile
import tempfile

BASE = "48b72d4c7c3f0d3bab197cb19483ca973807add2"
PINNED = "55557d7f178dcbe00fec15cffb3061df668eaff8"
EV = "docs/governance/evidence"
ROUND2 = f"{EV}/line-p012b-round2-2026-10-02"
TRANSCRIPT = f"{EV}/line-p012b-commit-2026-10-02"
REMED = f"{EV}/line-ci-remediation-2026-10-01"
RUNNERS = [(f"{EV}/line-p012b-red-a-2026-10-02", "red-a"),
           (f"{EV}/line-p012b-red-mutants-2026-10-02", "red-mutants"),
           (f"{EV}/line-p012b-green-2026-10-02", "green")]
MIG = "supabase/migrations/0199_line_oa_restrict_definer_execute.sql"
TESTS = ["supabase/tests/line_oa_definer_execute_fail_closed.sql", "supabase/tests/line_oa_definer_execute_matrix.sql",
         "supabase/tests/line_outbound_claim_record.sql"]
DOCS = [f"docs/governance/{stem}.{lang}.{ext}" for stem in ("line-b12-permission-matrix", "line-p010-execute-survey")
        for lang in ("en", "th") for ext in ("md", "html")]
DOCS += [f"docs/PRD-LINE-OA.{lang}.{ext}" for lang in ("en", "th") for ext in ("md", "html")]
DOCS += [f"{REMED}/REPORT.{lang}.{ext}" for lang in ("en", "th") for ext in ("md", "html")]
MODIFIED = set(TESTS) | set(DOCS) | {f"{REMED}/SHA256SUMS", ".github/workflows/trust-kernel-verify.yml"}
REMED_ADDED = {f"{REMED}/12-pre-amendment-hashes.txt", f"{REMED}/tools/pre_amendment_hashes.py"}

rev = sys.argv[2] if len(sys.argv) == 3 and sys.argv[1] == "--rev" else None
failures = []


def git(*args, check=True):
    return subprocess.run(["git", "-c", "core.longpaths=true", *args], capture_output=True, check=check).stdout


def check(ok, message):
    print(("PASS: " if ok else "FAIL: ") + message)
    if not ok:
        failures.append(message)


def blob(path):
    return git("cat-file", "blob", f"{rev}:{path}" if rev else f":{path}")


def base_blob(path):
    return git("cat-file", "blob", f"{BASE}:{path}")


def lf(data):
    return data.replace(b"\r\n", b"\n")


def sums(data):
    out = {}
    for line in data.decode("utf-8").splitlines():
        digest, name = line.split(maxsplit=1)
        out[name.lstrip("*")] = digest
    return out


def bundle_files(d):
    return sorted(p.as_posix() for p in pathlib.Path(d).rglob("*") if p.is_file())


# 1. Base and change set.
if rev:
    parents = git("rev-list", "--parents", "-n", "1", rev).decode().split()
    check(parents[1:] == [BASE], f"{rev} has exactly one parent, the base {BASE[:9]}")
    status = git("diff-tree", "--no-commit-id", "--name-status", "-r", rev).decode().splitlines()
    tree = git("rev-parse", f"{rev}^{{tree}}").decode().strip()
else:
    check(git("rev-parse", "HEAD").decode().strip() == BASE, f"HEAD is the base {BASE[:9]}")
    status = git("diff", "--cached", "--name-status").decode().splitlines()
    tree = git("write-tree").decode().strip()
changes = dict(reversed(line.split("\t", 1)) for line in status)
added = REMED_ADDED | set(bundle_files(ROUND2)) | {f for d, _ in RUNNERS for f in bundle_files(d)}
if rev:
    added |= set(bundle_files(TRANSCRIPT))
expected = MODIFIED | added
check(set(changes) == expected, f"change set is exactly the approved {len(expected)} paths "
      f"(unexpected={sorted(set(changes) - expected)}, missing={sorted(expected - set(changes))})")
bad = {p: s for p, s in changes.items() if not ((s == "M" and p in MODIFIED) or (s == "A" and p in added))}
check(not bad, f"listed files are modified and the new bundle files are added, nothing else ({bad})")
check(not [p for p in changes if p.startswith(("supabase/migrations/", "src/", "server/"))],
      "no migration or application source is touched (0199 unchanged)")

# 2. Runner bundles.
for d, mode in RUNNERS:
    own = sums(blob(f"{d}/SHA256SUMS"))
    files = [f[len(d) + 1:] for f in bundle_files(d)]
    check(sorted(own) == sorted(f for f in files if f != "SHA256SUMS"), f"{d}: SHA256SUMS lists every file except itself ({len(own)})")
    wrong = [n for n, h in own.items() if hashlib.sha256(blob(f"{d}/{n}")).hexdigest() != h]
    check(not wrong, f"{d}: SHA256SUMS matches the {'commit' if rev else 'staged'} blobs ({wrong})")
    run = sums(blob(f"{d}/SHA256SUMS.run"))
    changed = [n for n, h in run.items() if own.get(n) != h]
    check(not changed and len(run) == len(own) - 1, f"{d}: all {len(run)} runner outputs unchanged since the run ({changed})")
    scan = blob(f"{d}/10a-credential-scan.txt").decode("utf-8")
    check("PASS: positive control" in scan and "PASS: no generated credential bytes" in scan, f"{d}: in-run credential scan passed")
    v = subprocess.run([sys.executable, f"{d}/verify-p012b.py", d, mode], capture_output=True, text=True)
    check(v.returncode == 0, f"{d}: verifier re-run over the captured files exits 0 ({mode})")
    for src in TESTS:
        check(lf(blob(src)) == lf(blob(f"{d}/source/{src}")), f"{src} equals the copy used by {d.rsplit('/', 1)[1]}")
    if mode != "red-a":
        check(lf(blob(MIG)) == lf(blob(f"{d}/source/{MIG}")), f"{MIG} equals the copy used by {d.rsplit('/', 1)[1]}")
check(lf(blob(MIG)) == lf(base_blob(MIG)), "0199 is byte-identical to the base")

# 3. CI-remediation bundle and the round-2 bundle.
check(blob(f"{REMED}/SHA256SUMS.run") == base_blob(f"{REMED}/SHA256SUMS.run"), f"{REMED}: SHA256SUMS.run identical to the base")
for d in (REMED, ROUND2):
    own = sums(blob(f"{d}/SHA256SUMS"))
    files = [f[len(d) + 1:] for f in bundle_files(d)]
    check(sorted(own) == sorted(f for f in files if f != "SHA256SUMS"), f"{d}: SHA256SUMS lists every file except itself ({len(own)})")
    wrong = [n for n, h in own.items() if hashlib.sha256(blob(f"{d}/{n}")).hexdigest() != h]
    check(not wrong, f"{d}: SHA256SUMS matches the blobs ({wrong})")
pre = blob(f"{REMED}/12-pre-amendment-hashes.txt").decode("utf-8")
check("entries: 32; problems: 0" in pre and re.search(r"^exit: 0$", pre, re.M) is not None,
      "pre-amendment hash list: 32 entries, no problem, exit 0")
excerpt = blob(f"{ROUND2}/01-github-actions-excerpt.txt").decode("utf-8")
check(re.search(r"^exit: 0$", excerpt, re.M) is not None and excerpt.count("== run ") == 3,
      "GitHub Actions excerpt covers three runs and exited 0")

# 4. Pinned linters on the gated tree, allowlist unchanged.
check(blob("tools/.lint_allowlist") == base_blob("tools/.lint_allowlist"), "tools/.lint_allowlist is unchanged")
with tempfile.TemporaryDirectory() as tmp:
    tarfile.open(fileobj=io.BytesIO(git("archive", tree, "docs/governance", "tools/.lint_allowlist"))).extractall(tmp, filter="data")
    for f in ("lint_claims", "lint_certifications", "lint_allowlist", "claim_detect", "verify_absence"):
        pathlib.Path(tmp, "tools", f"{f}.py").write_bytes(git("show", f"{PINNED}:tools/{f}.py"))
    for tool in ("lint_claims", "lint_certifications"):
        r = subprocess.run([sys.executable, f"tools/{tool}.py", "docs/governance", "--allowlist", "tools/.lint_allowlist"],
                           cwd=tmp, capture_output=True, text=True, encoding="utf-8",
                           env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8"))
        tail = (r.stdout + r.stderr).strip().splitlines()[-1:] or [""]
        check(r.returncode == 0, f"pinned {tool} on the gated tree exits 0 ({tail[0]})")

# 5. HTML equals the renderer output of its Markdown.
with tempfile.TemporaryDirectory() as tmp:
    for html in sorted(p for p in changes if p.endswith(".html")):
        page = blob(html).decode("utf-8")
        title = re.search(r"<title>(.*?)</title>", page, re.S).group(1)
        lang = re.search(r'<html lang="([^"]+)"', page).group(1)
        for a, b2 in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'")):
            title = title.replace(a, b2)
        md = pathlib.Path(tmp, "in.md")
        md.write_bytes(blob(html[:-5] + ".md"))
        out = pathlib.Path(tmp, "out.html")
        subprocess.run(["node", "scripts/render-standalone-markdown.mjs", str(md), str(out), lang, title],
                       capture_output=True, check=True)
        check(lf(out.read_bytes()) == lf(blob(html)), f"{html} equals the renderer output of its Markdown")

# 6. Workflow: comment-only change.
try:
    import yaml
    check(yaml.safe_load(blob(".github/workflows/trust-kernel-verify.yml")) == yaml.safe_load(base_blob(".github/workflows/trust-kernel-verify.yml")),
          "trust-kernel-verify.yml parses identical to the base (comment-only change)")
    new_lines = [l for l in lf(blob(".github/workflows/trust-kernel-verify.yml")).decode().splitlines() if not l.lstrip().startswith("#")]
    old_lines = [l for l in lf(base_blob(".github/workflows/trust-kernel-verify.yml")).decode().splitlines() if not l.lstrip().startswith("#")]
    check(new_lines == old_lines, "every non-comment line of trust-kernel-verify.yml is unchanged")
except ImportError:
    check(False, "PyYAML is available for the workflow check")

# 7. Credential-shaped values in every blob of the change set.
patterns = {
    "jwt": re.compile(rb"eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"),
    "private_key": re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "supabase_secret_key": re.compile(rb"sb_secret_[A-Za-z0-9_-]{16,}"),
    "uri_password": re.compile(rb"[a-z][a-z0-9+.-]*://[^/\s:@'\"]+:([^@\s/'\"]+)@"),
    "assigned_secret": re.compile(rb"(?i)(?:password|passwd|secret|api[_-]?key|token)[\"']?\s*[=:]\s*[\"']?([A-Za-z0-9+/_.-]{16,})"),
}
placeholder = re.compile(rb"^(\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\[REDACTED\])$")
local = re.compile(rb"@(?:127\.0\.0\.1|localhost)[:/]")
accepted = []


def findings(data, path=None):
    out, base_lines = [], None
    for name, rx in patterns.items():
        for m in rx.finditer(data):
            value = m.group(1) if m.groups() else m.group(0)
            if placeholder.match(value):
                continue
            if name == "uri_password" and path and local.match(data, m.end() - 1):
                if base_lines is None:
                    r = subprocess.run(["git", "-c", "core.longpaths=true", "cat-file", "blob", f"{BASE}:{path}"], capture_output=True)
                    base_lines = set(r.stdout.splitlines()) if r.returncode == 0 else set()
                s = data.rfind(b"\n", 0, m.start()) + 1
                e = data.find(b"\n", m.end())
                if data[s:e if e != -1 else len(data)].rstrip(b"\r") in base_lines:
                    accepted.append(path)
                    continue
            out.append(name)
    return sorted(set(out))


seg = "Aa0" * 4
controls = [("eyJ" + seg + ".eyJ" + seg + "." + seg).encode(), ("-----BEGIN " + "RSA PRIVATE KEY-----").encode(),
            ("sb_" + "secret_" + seg * 2).encode(), ("postgres://u:" + seg + "@h").encode(), ("pass" + "word=" + seg * 2).encode()]
check(all(findings(c) for c in controls), "pattern scanner positive controls all detected")
hits = {p: h for p in sorted(changes) if (h := findings(blob(p), p))}
for p in sorted(set(accepted)):
    print(f"NOTE: {p}: pre-existing local-only URI credential, line identical in the base (reported, not new)")
check(not hits, f"no new credential-shaped value in {len(changes)} Git blobs ({hits})")

print("RESULT:", "GATE PASS" if not failures else f"GATE FAIL ({len(failures)} check(s))")
sys.exit(1 if failures else 0)
