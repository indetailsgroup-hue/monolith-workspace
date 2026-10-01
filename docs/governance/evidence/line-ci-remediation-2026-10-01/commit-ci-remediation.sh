#!/usr/bin/env bash
# CI remediation commit wrapper: stage the explicit approved list, run the gate
# on the staged blobs, and commit ONLY if the gate exits 0. On success it writes
# a transcript (gate output + the tree hash the gate checked) and adds it to the
# same commit. Run from the repository root:
#   bash docs/governance/evidence/line-ci-remediation-2026-10-01/commit-ci-remediation.sh <commit-message-file>
# Verify afterwards that the commit minus the transcript directory is the gated tree:
#   GIT_INDEX_FILE=<temp file> sh -c 'git read-tree <commit> && git rm -q --cached -r docs/governance/evidence/line-ci-remediation-commit-2026-10-01 && git write-tree'
set -u
set -o pipefail
MSG="${1:?commit message file}"
BASE="a97c3c8479a5fcbff9fb134e0e661f7f0d828a8e"
EV="docs/governance/evidence"
B="$EV/line-ci-remediation-2026-10-01"
T="$EV/line-ci-remediation-commit-2026-10-01"
FILES=(
  .github/workflows/trust-kernel-verify.yml supabase/config.toml
  docs/governance/repair-intelligence-phase0-push-checklist.md
  "$B"
)
for stem in line-b12-permission-matrix line-outbound-phase0-session-report line-p010-execute-survey line-p010-integration-b12-followup; do
  for f in en.md th.md en.html th.html; do FILES+=("docs/governance/$stem.$f"); done
done
for b in line-b12-catalog-fixture-2026-09-30 line-b12-monolith-catalog-attempt2-2026-09-30 line-ci-source-2026-09-30 \
         line-p010-catalog-2026-09-30 line-p010-ci-hardening-green-2026-09-30 line-p010-evidence-followup-2026-09-30 \
         line-p010-failclosed-green-2026-09-30 line-p012-green-2026-09-30; do
  for f in REPORT.en.md REPORT.th.md REPORT.en.html REPORT.th.html SHA256SUMS; do FILES+=("$EV/$b/$f"); done
done
if [ -n "${PYTHON_BIN:-}" ]; then PY="$PYTHON_BIN"
elif command -v py >/dev/null 2>&1; then PY="py"
else PY="python3"; fi
refuse() { echo "REFUSED: $1" >&2; exit 2; }
[ -f "$MSG" ] || refuse "message file not found"
[ "$(git rev-parse HEAD)" = "$BASE" ] || refuse "HEAD is not the base"
[ -z "$(git diff --cached --name-only)" ] || refuse "index already has staged changes"
[ ! -e "$T" ] || refuse "transcript directory already exists"

git add -- "${FILES[@]}" || refuse "git add failed"
gate_out="$("$PY" "$B/gate-ci-remediation.py" 2>&1)"
gate_exit=$?
if [ "$gate_exit" -ne 0 ]; then
  printf '%s\n' "$gate_out"
  git reset -q -- "${FILES[@]}"
  echo "GATE FAILED (exit $gate_exit): nothing committed, index restored" >&2
  exit 1
fi

tree="$(git write-tree)"
mkdir -p "$T"
printf '* -text\n' > "$T/.gitattributes"
{
  echo "CI remediation commit gate transcript (written by commit-ci-remediation.sh only after the gate exited 0)"
  echo "written_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "base_head: $(git rev-parse HEAD)"
  echo "wrapper: $B/commit-ci-remediation.sh sha256 $(sha256sum "$0" | cut -d' ' -f1)"
  echo "gate: $B/gate-ci-remediation.py sha256 $(sha256sum "$B/gate-ci-remediation.py" | cut -d' ' -f1)"
  echo "gate_exit: $gate_exit"
  echo "gated_tree: $tree"
  echo "check: the commit tree without $T must equal gated_tree (command in the wrapper header)"
  echo "staged_changes:"
  git diff --cached --name-status | sed 's/^/  /'
  echo "gate_output:"
  printf '%s\n' "$gate_out" | sed 's/^/  /'
} > "$T/gate-transcript.txt"
(cd "$T" && sha256sum .gitattributes gate-transcript.txt > SHA256SUMS)
git add -- "$T" || { echo "could not stage the transcript; nothing committed" >&2; exit 1; }
git commit -q -F "$MSG"
commit_exit=$?
echo "gate_exit=$gate_exit gated_tree=$tree commit_exit=$commit_exit commit=$(git rev-parse HEAD)"
exit "$commit_exit"
