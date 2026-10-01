"""CI remediation change-set gate (1 Oct 2026). Exit 0 only when every check passes.
Run from the repository root.

Index mode (before commit):   py <bundle>/gate-ci-remediation.py
Commit mode (after commit):   py <bundle>/gate-ci-remediation.py --rev <commit>

Checks: the change set is exactly the approved paths; the eight amended bundles
keep SHA256SUMS.run byte-identical to the base and change only REPORT lines of
SHA256SUMS, which verify against the Git blobs; this bundle's SHA256SUMS covers
every file, matches the blobs and keeps the runner outputs; the pinned governance
linters exit 0 on the gated tree with the allowlist unchanged; every changed HTML
equals the repository renderer output; the config change is the one storage
line; the workflow change is confined to the shadow E2E job; and no Git blob
carries a new credential-shaped value.
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

BASE = "a97c3c8479a5fcbff9fb134e0e661f7f0d828a8e"
PINNED = "55557d7f178dcbe00fec15cffb3061df668eaff8"
EV = "docs/governance/evidence"
BUNDLE = f"{EV}/line-ci-remediation-2026-10-01"
TRANSCRIPT = f"{EV}/line-ci-remediation-commit-2026-10-01"
AMENDED = [
    "line-b12-catalog-fixture-2026-09-30", "line-b12-monolith-catalog-attempt2-2026-09-30",
    "line-ci-source-2026-09-30", "line-p010-catalog-2026-09-30", "line-p010-ci-hardening-green-2026-09-30",
    "line-p010-evidence-followup-2026-09-30", "line-p010-failclosed-green-2026-09-30", "line-p012-green-2026-09-30",
]
DOC_STEMS = ["line-b12-permission-matrix", "line-outbound-phase0-session-report",
             "line-p010-execute-survey", "line-p010-integration-b12-followup"]
MODIFIED = set()
for stem in DOC_STEMS:
    for lang in ("en", "th"):
        for ext in ("md", "html"):
            MODIFIED.add(f"docs/governance/{stem}.{lang}.{ext}")
for b in AMENDED:
    MODIFIED.add(f"{EV}/{b}/SHA256SUMS")
    for lang in ("en", "th"):
        for ext in ("md", "html"):
            MODIFIED.add(f"{EV}/{b}/REPORT.{lang}.{ext}")
MODIFIED |= {"docs/governance/repair-intelligence-phase0-push-checklist.md",
             ".github/workflows/trust-kernel-verify.yml", "supabase/config.toml"}
REPORTS = {f"REPORT.{l}.{e}" for l in ("en", "th") for e in ("md", "html")}

rev = sys.argv[2] if len(sys.argv) == 3 and sys.argv[1] == "--rev" else None
failures = []


def git(*args, check=True):
    return subprocess.run(["git", *args], capture_output=True, check=check).stdout


def check(ok, message):
    print(("PASS: " if ok else "FAIL: ") + message)
    if not ok:
        failures.append(message)


def blob(path):
    return git("show", f"{rev}:{path}" if rev else f":{path}")


def base_blob(path):
    return git("show", f"{BASE}:{path}")


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
added = set(bundle_files(BUNDLE)) | (set(bundle_files(TRANSCRIPT)) if rev else set())
expected = MODIFIED | added
check(set(changes) == expected, f"change set is exactly the approved {len(expected)} paths "
      f"(unexpected={sorted(set(changes) - expected)}, missing={sorted(expected - set(changes))})")
bad = {p: s for p, s in changes.items() if not ((s == "M" and p in MODIFIED) or (s == "A" and p in added))}
check(not bad, f"listed files are modified and the bundle files are added, nothing else ({bad})")
check(not [p for p in changes if p.startswith(("supabase/migrations/", "supabase/tests/", "src/", "server/"))],
      "no migration, test or application source is touched")

# 2. Amended sealed bundles.
for b in AMENDED:
    d = f"{EV}/{b}"
    new, old = sums(blob(f"{d}/SHA256SUMS")), sums(base_blob(f"{d}/SHA256SUMS"))
    check(sorted(new) == sorted(old), f"{b}: SHA256SUMS lists the same {len(new)} files as the base")
    diff = sorted(n for n in new if new[n] != old.get(n))
    check(set(diff) <= REPORTS, f"{b}: SHA256SUMS changes only REPORT lines ({diff})")
    wrong = [n for n, h in new.items() if hashlib.sha256(blob(f"{d}/{n}")).hexdigest() != h]
    check(not wrong, f"{b}: every SHA256SUMS entry matches the {'commit' if rev else 'staged'} blob ({wrong})")
    if subprocess.run(["git", "cat-file", "-e", f"{BASE}:{d}/SHA256SUMS.run"], capture_output=True).returncode == 0:
        check(blob(f"{d}/SHA256SUMS.run") == base_blob(f"{d}/SHA256SUMS.run"), f"{b}: SHA256SUMS.run identical to the base")
    for lang in ("en", "th"):
        text = blob(f"{d}/REPORT.{lang}.md").decode("utf-8")
        head = "## การแก้ไขหลังปิดผนึก (1 ตุลาคม 2026)" if lang == "th" else "## Post-seal amendment (1 October 2026)"
        check(text.count(head) == 1, f"{b}: REPORT.{lang}.md carries exactly one amendment section")

# 3. This bundle.
own = sums(blob(f"{BUNDLE}/SHA256SUMS"))
files = [f[len(BUNDLE) + 1:] for f in bundle_files(BUNDLE)]
check(sorted(own) == sorted(f for f in files if f != "SHA256SUMS"), f"{BUNDLE}: SHA256SUMS lists every file except itself ({len(own)})")
wrong = [n for n, h in own.items() if hashlib.sha256(blob(f"{BUNDLE}/{n}")).hexdigest() != h]
check(not wrong, f"{BUNDLE}: SHA256SUMS matches the blobs ({wrong})")
run = sums(blob(f"{BUNDLE}/SHA256SUMS.run"))
changed = [n for n, h in run.items() if own.get(n) != h]
check(not changed, f"{BUNDLE}: {len(run)} runner outputs unchanged since the run ({changed})")
STEP_FILES = ["01a-linters-before.txt", "01b-findings-before.txt", "02a-linters-after.txt", "02b-allowlist-unchanged.txt",
              "03-reproduce-amendments.txt", "04-reseal-check.txt", "05-render-check.txt", "06-workflow-config.txt",
              "07-preflight-simulation.txt", "08-repair-phase0-checks.txt", "09-diff.txt", "10-credential-scan.txt"]
for name in STEP_FILES:
    exits = re.findall(r"^exit: (\d+)$", blob(f"{BUNDLE}/{name}").decode("utf-8"), re.M)
    check(exits and all(e == "0" for e in exits), f"{BUNDLE}/{name}: every recorded step exits 0 ({exits})")
scan = blob(f"{BUNDLE}/10-credential-scan.txt").decode("utf-8")
check("PASS: positive controls detected" in scan and "PASS: no new credential-shaped value" in scan, "runner credential scan passed")

# 4. Pinned linters on the gated tree, allowlist unchanged.
check(blob("tools/.lint_allowlist") == base_blob("tools/.lint_allowlist"), "tools/.lint_allowlist is unchanged")
with tempfile.TemporaryDirectory() as tmp:
    archive = git("archive", tree, "docs/governance", "tools/.lint_allowlist")
    tarfile.open(fileobj=io.BytesIO(archive)).extractall(tmp, filter="data")
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
        check(out.read_bytes() == blob(html), f"{html} equals the renderer output of its Markdown")

# 6. Config: the one storage line. Workflow: only the shadow E2E job differs.
cfg_new, cfg_old = blob("supabase/config.toml").decode().splitlines(), base_blob("supabase/config.toml").decode().splitlines()
delta = [(i, a, b2) for i, (a, b2) in enumerate(zip(cfg_old, cfg_new)) if a != b2]
check(len(cfg_new) == len(cfg_old) and len(delta) == 1 and delta[0][1:] == ("enabled = false", "enabled = true")
      and cfg_old[delta[0][0] - 1] == "[storage]", f"supabase/config.toml differs only in [storage] enabled ({delta})")
try:
    import yaml
    wf_new = yaml.safe_load(blob(".github/workflows/trust-kernel-verify.yml"))
    wf_old = yaml.safe_load(base_blob(".github/workflows/trust-kernel-verify.yml"))
    e2e_new, e2e_old = wf_new["jobs"].pop("e2e"), wf_old["jobs"].pop("e2e")
    check(wf_new == wf_old, "trust-kernel-verify.yml: every job other than the shadow E2E job is unchanged")
    names = [s.get("name") or s.get("uses") for s in e2e_new["steps"]]
    check(names[0] == "Require the shadow E2E environment (names only)", "the E2E preflight is the first step")
    old_rest = [s for s in e2e_old["steps"] if s.get("name") != "Run trust-kernel shadow E2E (JSON report)"]
    new_rest = [s for s in e2e_new["steps"][1:] if s.get("name") != "Run trust-kernel shadow E2E (JSON report)"]
    check(old_rest == new_rest, "the E2E job's other steps are unchanged")
    run_step = next(s for s in e2e_new["steps"] if s.get("name") == "Run trust-kernel shadow E2E (JSON report)")
    old_run = next(s for s in e2e_old["steps"] if s.get("name") == "Run trust-kernel shadow E2E (JSON report)")
    check(run_step["env"] == old_run["env"] and "mkdir -p reports" in run_step["run"]
          and "npx playwright test e2e/trust-kernel --reporter=json > reports/e2e.json" in run_step["run"],
          "the run step keeps its command and secrets and creates reports/ first")
    check(not re.search(r"echo[^\n]*\$\{?(E2E_[A-Z0-9_]+)", e2e_new["steps"][0]["run"]) and "${!name}" in e2e_new["steps"][0]["run"],
          "the preflight never echoes a secret value (indirect test only)")
except ImportError:
    check(False, "PyYAML is available for the workflow checks")

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
    out = []
    base_lines = None
    for name, rx in patterns.items():
        for m in rx.finditer(data):
            value = m.group(1) if m.groups() else m.group(0)
            if placeholder.match(value):
                continue
            if name == "uri_password" and path and local.match(data, m.end() - 1):
                if base_lines is None:
                    r = subprocess.run(["git", "show", f"{BASE}:{path}"], capture_output=True)
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
