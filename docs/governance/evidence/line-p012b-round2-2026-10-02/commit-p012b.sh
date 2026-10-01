#!/usr/bin/env bash
# Round-2 commit wrapper: stage the explicit approved list, run the gate on the
# staged blobs, and commit ONLY if the gate exits 0. On success it writes a
# transcript (gate output + the tree hash the gate checked) and adds it to the
# same commit. Run from the repository root:
#   bash docs/governance/evidence/line-p012b-round2-2026-10-02/commit-p012b.sh <commit-message-file>
# Verify afterwards that the commit minus the transcript directory is the gated tree:
#   GIT_INDEX_FILE=<temp file> sh -c 'git read-tree <commit> && git rm -q --cached -r docs/governance/evidence/line-p012b-commit-2026-10-02 && git write-tree'
set -u
set -o pipefail
MSG="${1:?commit message file}"
BASE="48b72d4c7c3f0d3bab197cb19483ca973807add2"
EV="docs/governance/evidence"
B="$EV/line-p012b-round2-2026-10-02"
T="$EV/line-p012b-commit-2026-10-02"
REMED="$EV/line-ci-remediation-2026-10-01"
FILES=(
  supabase/tests/line_oa_definer_execute_fail_closed.sql supabase/tests/line_oa_definer_execute_matrix.sql
  supabase/tests/line_outbound_claim_record.sql .github/workflows/trust-kernel-verify.yml
  "$EV/line-p012b-red-a-2026-10-02" "$EV/line-p012b-red-mutants-2026-10-02" "$EV/line-p012b-green-2026-10-02" "$B"
  "$REMED/12-pre-amendment-hashes.txt" "$REMED/tools/pre_amendment_hashes.py" "$REMED/SHA256SUMS"
)
for f in en.md th.md en.html th.html; do
  FILES+=("docs/governance/line-b12-permission-matrix.$f" "docs/governance/line-p010-execute-survey.$f" "docs/PRD-LINE-OA.$f" "$REMED/REPORT.$f")
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
gate_out="$("$PY" "$B/gate-p012b.py" 2>&1)"
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
  echo "Round-2 commit gate transcript (written by commit-p012b.sh only after the gate exited 0)"
  echo "written_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "base_head: $(git rev-parse HEAD)"
  echo "wrapper: $B/commit-p012b.sh sha256 $(sha256sum "$0" | cut -d' ' -f1)"
  echo "gate: $B/gate-p012b.py sha256 $(sha256sum "$B/gate-p012b.py" | cut -d' ' -f1)"
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
