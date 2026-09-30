#!/usr/bin/env bash
# P0-10 follow-up commit wrapper: stage the explicit approved list, run the gate
# on the staged blobs, and commit ONLY if the gate exits 0. On success it writes
# a transcript (gate output + the tree hash the gate checked) and adds it to the
# same commit. Run from the repository root:
#   bash docs/governance/evidence/line-p010-failclosed-green-2026-09-30/commit-p010-followup.sh <commit-message-file>
# Verify afterwards that the commit minus the transcript directory is the gated tree:
#   GIT_INDEX_FILE=<temp file> sh -c 'git read-tree <commit> && git rm -q --cached -r docs/governance/evidence/line-p010-followup-commit-2026-09-30 && git write-tree'
set -u
set -o pipefail
MSG="${1:?commit message file}"
BASE="87930836a87852cac32efd80920b1d19f62b48f2"
RED="docs/governance/evidence/line-p010-failclosed-red-2026-09-30"
GREEN="docs/governance/evidence/line-p010-failclosed-green-2026-09-30"
T="docs/governance/evidence/line-p010-followup-commit-2026-09-30"
FILES=(
  supabase/tests/line_oa_client_write_revoke_fail_closed.sql
  .github/workflows/db-verify.yml
  docs/PRD-LINE-OA.en.md docs/PRD-LINE-OA.th.md docs/PRD-LINE-OA.en.html docs/PRD-LINE-OA.th.html
  "$RED" "$GREEN"
)
if [ -n "${PYTHON_BIN:-}" ]; then PY="$PYTHON_BIN"
elif command -v py >/dev/null 2>&1; then PY="py"
else PY="python3"; fi
refuse() { echo "REFUSED: $1" >&2; exit 2; }
[ -f "$MSG" ] || refuse "message file not found"
[ "$(git rev-parse HEAD)" = "$BASE" ] || refuse "HEAD is not the accepted base"
[ -z "$(git diff --cached --name-only)" ] || refuse "index already has staged changes"
[ ! -e "$T" ] || refuse "transcript directory already exists"

git add -- "${FILES[@]}" || refuse "git add failed"
gate_out="$("$PY" "$GREEN/gate-p010-followup.py" 2>&1)"
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
  echo "P0-10 follow-up commit gate transcript (written by commit-p010-followup.sh only after the gate exited 0)"
  echo "written_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "base_head: $(git rev-parse HEAD)"
  echo "wrapper: $GREEN/commit-p010-followup.sh sha256 $(sha256sum "$0" | cut -d' ' -f1)"
  echo "gate: $GREEN/gate-p010-followup.py sha256 $(sha256sum "$GREEN/gate-p010-followup.py" | cut -d' ' -f1)"
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
