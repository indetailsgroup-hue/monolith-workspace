#!/usr/bin/env bash
set -euo pipefail
MSG="${1:?commit message file}"
BASE=e7e2c52ce169b07978802c026255f08f71221d39
GREEN=docs/governance/evidence/line-ci-source-2026-09-30
T=docs/governance/evidence/line-ci-source-commit-2026-09-30
PY="${PYTHON_BIN:-py}"
FILES=(.github/workflows/db-verify.yml scripts/line-ci-source.mjs tests/line-oa-commerce/ci/source-evidence.test.mjs docs/PRD-LINE-OA.en.md docs/PRD-LINE-OA.en.html docs/PRD-LINE-OA.th.md docs/PRD-LINE-OA.th.html docs/governance/line-rpc-caller-register.en.md docs/governance/line-rpc-caller-register.en.html docs/governance/line-rpc-caller-register.th.md docs/governance/line-rpc-caller-register.th.html "$GREEN")
[ "$(git rev-parse HEAD)" = "$BASE" ]
[ -z "$(git diff --cached --name-only)" ]
[ ! -e "$T" ]
[ -f "$MSG" ]
git add -- "${FILES[@]}"
if gate_out="$("$PY" "$GREEN/gate-ci-source.py" 2>&1)"; then :; else
  printf '%s\n' "$gate_out"
  git reset -q -- "${FILES[@]}"
  exit 1
fi
tree="$(git write-tree)" || exit 1
wrapper_hash="$(git show ":$GREEN/commit-ci-source.sh" | sha256sum | cut -d' ' -f1)"
gate_hash="$(git show ":$GREEN/gate-ci-source.py" | sha256sum | cut -d' ' -f1)"
[ "$(git write-tree)" = "$tree" ] || exit 1
mkdir "$T"
printf '* -text\n' > "$T/.gitattributes"
{
  echo "written_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "base: $BASE"
  echo "gated_tree: $tree"
  echo "wrapper_staged_sha256: $wrapper_hash"
  echo "gate_staged_sha256: $gate_hash"
  printf '%s\n' "$gate_out"
} > "$T/gate-transcript.txt"
(cd "$T" && sha256sum .gitattributes gate-transcript.txt > SHA256SUMS)
[ "$(git write-tree)" = "$tree" ] || exit 1
git add -- "$T"
# Recheck the entire final index, including transcript, before commit.
"$PY" "$GREEN/gate-ci-source.py" --with-transcript
git commit -F "$MSG"
