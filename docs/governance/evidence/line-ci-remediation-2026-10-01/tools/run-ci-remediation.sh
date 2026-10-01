#!/usr/bin/env bash
# CI remediation evidence runner (1 Oct 2026, owner-approved option A).
# Read-only against the repository: it compares the working tree with the base
# commit, runs the pinned claim/certification linters before and after, proves
# the sealed-bundle amendments are reproducible from the base, checks every
# resealed SHA256SUMS and HTML render, parses the changed workflow/config,
# simulates the new shadow-E2E preflight with placeholder values only, runs the
# Repair Phase 0 document checks, and scans for credential-shaped values.
# It writes only into OUT (which must not exist) and a private temp dir.
#   OUT=<new dir> TOOLS=<dir with the helper scripts> bash run-ci-remediation.sh
set -u
set -o pipefail
BASE="a97c3c8479a5fcbff9fb134e0e661f7f0d828a8e"
PINNED="55557d7f178dcbe00fec15cffb3061df668eaff8"
OUT="${OUT:?OUT must name a new directory}"
TOOLS="${TOOLS:?TOOLS must name the helper directory}"
PY="${PYTHON_BIN:-python}"
export PYTHONDONTWRITEBYTECODE=1 PYTHONIOENCODING=utf-8
refuse() { echo "REFUSED: $1" >&2; exit 2; }
ROOT="$(git rev-parse --show-toplevel)" || refuse "not in a git work tree"
cd "$ROOT" || refuse "cannot enter the repository root"
[ "$(git rev-parse HEAD)" = "$BASE" ] || refuse "HEAD is not the base $BASE"
[ ! -e "$OUT" ] || refuse "OUT already exists: $OUT"
[ -z "$(git diff --cached --name-only)" ] || refuse "index has staged changes"
mkdir -p "$OUT/tools" || refuse "cannot create OUT"
OUT="$(cd "$OUT" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -r -- "$TMP"' EXIT
printf '* -text\n' > "$OUT/.gitattributes"
for f in amend_bundles.py expand_survey.py reseal.py render_check.py lint-explain.py targets.txt; do
  cp "$TOOLS/$f" "$OUT/tools/$f" || refuse "missing helper $f"
done
cp "$0" "$OUT/tools/run-ci-remediation.sh"
T="$OUT/tools"
BUNDLES="line-b12-catalog-fixture-2026-09-30 line-b12-monolith-catalog-attempt2-2026-09-30 line-ci-source-2026-09-30 line-p010-catalog-2026-09-30 line-p010-ci-hardening-green-2026-09-30 line-p010-evidence-followup-2026-09-30 line-p010-failclosed-green-2026-09-30 line-p012-green-2026-09-30"
FLAGGED="docs/governance/evidence/line-b12-catalog-fixture-2026-09-30/REPORT.th.md
docs/governance/evidence/line-b12-monolith-catalog-attempt2-2026-09-30/REPORT.th.md
docs/governance/evidence/line-ci-source-2026-09-30/REPORT.th.md
docs/governance/evidence/line-p010-catalog-2026-09-30/REPORT.th.md
docs/governance/evidence/line-p010-ci-hardening-green-2026-09-30/REPORT.th.md
docs/governance/evidence/line-p010-evidence-followup-2026-09-30/REPORT.th.md
docs/governance/evidence/line-p010-failclosed-green-2026-09-30/REPORT.en.md
docs/governance/evidence/line-p010-failclosed-green-2026-09-30/REPORT.th.md
docs/governance/evidence/line-p012-green-2026-09-30/REPORT.th.md
docs/governance/line-b12-permission-matrix.th.md
docs/governance/line-outbound-phase0-session-report.en.md
docs/governance/line-outbound-phase0-session-report.th.md
docs/governance/line-p010-execute-survey.th.md
docs/governance/line-p010-integration-b12-followup.th.md"

# run <file> <command...>: record command, UTC start/end and exit code.
run() {
  local file="$1"; shift
  {
    echo "\$ $*"
    echo "utc_start: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    "$@"
    local ec=$?
    echo "utc_end: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "exit: $ec"
  } >> "$OUT/$file" 2>&1
}
pinned_tools() {  # $1 = tree root to receive the pinned linters
  mkdir -p "$1/tools"
  for f in lint_claims lint_certifications lint_allowlist claim_detect verify_absence; do
    git show "$PINNED:tools/$f.py" > "$1/tools/$f.py"
  done
}
lint_pair() {  # $1 = tree root; linters run exactly as the CI job runs them
  (cd "$1" && "$PY" tools/lint_claims.py docs/governance --allowlist tools/.lint_allowlist)
  echo "lint_claims exit: $?"
  (cd "$1" && "$PY" tools/lint_certifications.py docs/governance --allowlist tools/.lint_allowlist)
  echo "lint_certifications exit: $?"
}

# 00 context
{
  echo "CI remediation evidence run"
  echo "utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "base_head: $(git rev-parse HEAD)"
  echo "branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "pinned_governance_linters: $PINNED"
  echo "python: $("$PY" --version 2>&1)"; echo "node: $(node --version)"; echo "git: $(git --version)"
  echo "pinned linter sha256 (and whether tools/ copies equal them, CRLF/LF aside):"
  for f in lint_claims lint_certifications lint_allowlist claim_detect verify_absence; do
    p="$(git show "$PINNED:tools/$f.py" | sha256sum | cut -d' ' -f1)"
    if [ -f "tools/$f.py" ] && diff -q --strip-trailing-cr <(git show "$PINNED:tools/$f.py") "tools/$f.py" >/dev/null; then s=equal; else s=differs-or-absent; fi
    echo "  $f.py $p local_copy=$s"
  done
  echo "helper sha256:"; (cd "$T" && sha256sum -- *) | sed 's/^/  /'
  echo "tracked changes against base (git status --short, untracked excluded):"
  git status --short --untracked-files=no | sed 's/^/  /'
} > "$OUT/00-context.txt" 2>&1

# 01 before: the base tree with the pinned linters (what CI run 36748427202 ran)
mkdir -p "$TMP/before"
git archive "$BASE" docs/governance tools/.lint_allowlist | tar -x -C "$TMP/before"
pinned_tools "$TMP/before"
run 01a-linters-before.txt lint_pair "$TMP/before"
# shellcheck disable=SC2086
run 01b-findings-before.txt "$PY" "$T/lint-explain.py" "$TMP/before" "$TMP/before" $FLAGGED

# 02 after: the working tree (this bundle excluded) with the pinned linters
mkdir -p "$TMP/after/docs" "$TMP/after/tools"
cp -r docs/governance "$TMP/after/docs/"
rm -r -- "$TMP/after/docs/governance/evidence/$(basename "$OUT")"
cp tools/.lint_allowlist "$TMP/after/tools/"
pinned_tools "$TMP/after"
run 02a-linters-after.txt lint_pair "$TMP/after"
run 02b-allowlist-unchanged.txt git diff --exit-code --stat "$BASE" -- tools/.lint_allowlist

# 03 the sealed-bundle amendments are reproducible from the base bytes
reproduce() {
  mkdir -p "$TMP/repro"
  git archive "$BASE" docs/governance/evidence | tar -x -C "$TMP/repro"
  "$PY" "$T/amend_bundles.py" "$TMP/repro" --write || return 1
  local n=0 bad=0
  for b in $BUNDLES; do
    for l in th en; do
      f="docs/governance/evidence/$b/REPORT.$l.md"
      if cmp -s "$TMP/repro/$f" "$f"; then n=$((n+1)); echo "identical: $f"; else bad=$((bad+1)); echo "DIFFERS: $f"; fi
    done
  done
  echo "reproduced byte-identical: $n/16"
  mkdir -p "$TMP/survey"
  for l in th en; do
    git show "$BASE:docs/governance/line-p010-execute-survey.$l.md" > "$TMP/survey/s.$l.md"
  done
  "$PY" - "$ROOT" "$T/expand_survey.py" "$TMP/survey" <<'EOF' || bad=$((bad+1))
import re, runpy, shutil, sys
from pathlib import Path
root, script, tmp = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
fails = 0
for lang in ("th", "en"):
    work = tmp / f"repo-{lang}"
    (work / "docs/governance").mkdir(parents=True)
    (work / "supabase").mkdir()
    shutil.copytree(root / "supabase/migrations", work / "supabase/migrations")
    target = work / f"docs/governance/line-p010-execute-survey.{lang}.md"
    shutil.copy(tmp / f"s.{lang}.md", target)
    sys.argv = [script, str(work), f"docs/governance/line-p010-execute-survey.{lang}.md", "| Routine |", "--write"]
    runpy.run_path(script, run_name="__main__")
    def table(p):
        lines = p.read_text(encoding="utf-8").split("\n")
        s = next(i for i, l in enumerate(lines) if l.startswith("| Routine |"))
        e = next(i for i in range(s, len(lines)) if not lines[i].strip())
        return lines[s:e]
    same = table(target) == table(root / f"docs/governance/line-p010-execute-survey.{lang}.md")
    print(f"survey {lang}: routine table rows equal the script-expanded base rows: {same}")
    fails += not same
sys.exit(1 if fails else 0)
EOF
  [ "$bad" -eq 0 ]
}
run 03-reproduce-amendments.txt reproduce

# 04 reseal: only REPORT lines changed, .run untouched, every listed hash verifies
reseal_check() {
  "$PY" "$T/reseal.py" "$ROOT" "$BASE" || return 1
  local bad=0
  for b in $BUNDLES; do
    d="docs/governance/evidence/$b"
    echo "== $d"
    (cd "$d" && sha256sum -c --quiet SHA256SUMS) && echo "SHA256SUMS: all OK" || bad=$((bad+1))
    if [ -f "$d/SHA256SUMS.run" ]; then
      (cd "$d" && sha256sum -c --quiet SHA256SUMS.run) && echo "SHA256SUMS.run: all OK" || bad=$((bad+1))
    fi
    echo "SHA256SUMS lines changed vs base: $(git diff --numstat "$BASE" -- "$d/SHA256SUMS" | cut -f1,2)"
  done
  [ "$bad" -eq 0 ]
}
run 04-reseal-check.txt reseal_check

# 05 every changed HTML equals the repository renderer output of its Markdown
run 05-render-check.txt "$PY" "$T/render_check.py" check "$ROOT"

# 06 workflow and config parse; the E2E job order and the one-line storage change
run 06-workflow-config.txt "$PY" - <<'EOF'
import tomllib, yaml
wf = yaml.safe_load(open(".github/workflows/trust-kernel-verify.yml", encoding="utf-8"))
yaml.safe_load(open(".github/workflows/db-verify.yml", encoding="utf-8"))
steps = wf["jobs"]["e2e"]["steps"]
names = [s.get("name") or s.get("uses") for s in steps]
print("trust-kernel-verify.yml and db-verify.yml parse as YAML")
print("e2e steps:", names)
assert names[0] == "Require the shadow E2E environment (names only)", "preflight is not the first step"
run_step = next(s for s in steps if s.get("name") == "Run trust-kernel shadow E2E (JSON report)")
assert "mkdir -p reports" in run_step["run"], "reports/ is not created before the redirect"
env = steps[0]["env"]
assert sorted(env) == sorted(run_step["env"]), "preflight and run step read different secrets"
print("preflight first, reports/ created before the redirect, same five secret names:", sorted(env))
cfg = tomllib.load(open("supabase/config.toml", "rb"))
print("supabase/config.toml [storage].enabled =", cfg["storage"]["enabled"])
assert cfg["storage"]["enabled"] is True
EOF
run 06-workflow-config.txt git diff --numstat "$BASE" -- supabase/config.toml
run 06-workflow-config.txt git diff -U0 "$BASE" -- supabase/config.toml

# 07 the preflight step, extracted from the YAML, run with placeholder values only
run 07-preflight-simulation.txt "$PY" - "$TMP" <<'EOF'
import os, shutil, subprocess, sys, yaml
tmp = sys.argv[1]
# Resolve bash through PATH explicitly: on Windows, CreateProcess searches the
# system directory first and finds the WSL bash, which cannot see C:/ paths
# (runs 1 and 2 of this round failed with exit 127 for this reason).
BASH = shutil.which("bash")
print("bash:", BASH)
steps = yaml.safe_load(open(".github/workflows/trust-kernel-verify.yml", encoding="utf-8"))["jobs"]["e2e"]["steps"]
script = steps[0]["run"]
names = list(steps[0]["env"])
# Forward slashes keep the path portable between Windows and POSIX shells.
path = os.path.join(tmp, "preflight.sh").replace("\\", "/")
open(path, "w", newline="\n").write(script)
cases = [("all five unset", {}, 1), ("all five set to a placeholder", {n: "placeholder" for n in names}, 0),
         ("only E2E_TENANT_002_JWT unset", {n: "placeholder" for n in names if n != "E2E_TENANT_002_JWT"}, 1)]
fails = 0
for label, values, want in cases:
    env = {k: v for k, v in os.environ.items() if k not in names}
    env.update(values)
    r = subprocess.run([BASH, path], env=env, capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip()
    ok = r.returncode == want and "placeholder" not in out
    fails += not ok
    print(f"{'PASS' if ok else 'FAIL'}: {label}: exit {r.returncode} (want {want}); output: {out or '<none>'}")
sys.exit(1 if fails else 0)
EOF

# 08 Repair Phase 0 document and gate checks touched by the checklist edit
run 08-repair-phase0-checks.txt node scripts/trust-kernel/verify-repair-phase0-docs.mjs
run 08-repair-phase0-checks.txt node --test scripts/trust-kernel/verify-repair-phase0-docs.test.mjs
run 08-repair-phase0-checks.txt node scripts/trust-kernel/final-gate-check.selftest.mjs

# 09 change set against the base
run 09-diff.txt git diff --stat "$BASE"
run 09-diff.txt git diff --numstat "$BASE"

# 10 credential-shaped values in every changed file and in this bundle
run 10-credential-scan.txt "$PY" - "$OUT" "$BASE" <<'EOF'
import pathlib, re, subprocess, sys
out, base = pathlib.Path(sys.argv[1]), sys.argv[2]
patterns = {
    "jwt": re.compile(rb"eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"),
    "private_key": re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "supabase_secret_key": re.compile(rb"sb_secret_[A-Za-z0-9_-]{16,}"),
    "uri_password": re.compile(rb"[a-z][a-z0-9+.-]*://[^/\s:@'\"]+:([^@\s/'\"]+)@"),
    "assigned_secret": re.compile(rb"(?i)(?:password|passwd|secret|api[_-]?key|token)[\"']?\s*[=:]\s*[\"']?([A-Za-z0-9+/_.-]{16,})"),
}
placeholder = re.compile(rb"^(\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\[REDACTED\])$")
LOCAL = re.compile(rb"://[^/\s:@'\"]+:[^@\s/'\"]+@(?:127\.0\.0\.1|localhost)[:/]")
accepted = []
def base_lines(path):
    r = subprocess.run(["git", "show", f"{base}:{path.as_posix()}"], capture_output=True)
    return set(r.stdout.splitlines()) if r.returncode == 0 else set()
def hits(data, path=None):
    # One narrow exception, always reported: a URI credential on 127.0.0.1 or
    # localhost whose whole line already exists byte-identically in the base
    # commit (the pre-existing Supabase CLI local default), so nothing new passes.
    found = []
    for name, rx in patterns.items():
        for m in rx.finditer(data):
            v = m.group(1) if m.groups() else m.group(0)
            if placeholder.match(v):
                continue
            if name == "uri_password" and path is not None and LOCAL.search(m.group(0) + data[m.end():m.end() + 20]):
                start = data.rfind(b"\n", 0, m.start()) + 1
                end = data.find(b"\n", m.end())
                line = data[start:end if end != -1 else len(data)].rstrip(b"\r")
                if line in base_lines(path):
                    accepted.append(f"{path.as_posix()}: pre-existing local-only URI credential, line unchanged since base")
                    continue
            found.append(name)
    return sorted(set(found))
seg = "Aa0" * 4
controls = [("eyJ" + seg + ".eyJ" + seg + "." + seg).encode(), ("-----BEGIN " + "RSA PRIVATE KEY-----").encode(),
            ("sb_" + "secret_" + seg * 2).encode(), ("postgres://u:" + seg + "@h").encode(), ("pass" + "word=" + seg * 2).encode()]
ok_controls = all(hits(c) for c in controls)
print(("PASS" if ok_controls else "FAIL") + ": positive controls detected")
changed = subprocess.run(["git", "diff", "--name-only", base], capture_output=True, text=True, check=True).stdout.split()
files = [pathlib.Path(p) for p in changed] + [p for p in out.rglob("*") if p.is_file() and p.name != "10-credential-scan.txt"]
bad = {p.as_posix(): h for p in files if (h := hits(p.read_bytes(), p if not p.is_absolute() else None))}
for a in sorted(set(accepted)):
    print("ACCEPTED (reported): " + a)
print(("PASS" if not bad else "FAIL") + f": no new credential-shaped value in {len(files)} files {bad or ''}")
sys.exit(0 if ok_controls and not bad else 1)
EOF

(cd "$OUT" && find . -type f ! -name SHA256SUMS.run -printf '%P\n' | LC_ALL=C sort | xargs sha256sum) > "$OUT/SHA256SUMS.run"
echo "runner finished: $(date -u +%Y-%m-%dT%H:%M:%SZ) OUT=$OUT"
grep -h "^exit: " "$OUT"/0*.txt "$OUT"/10-*.txt | sort | uniq -c
