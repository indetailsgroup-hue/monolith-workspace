#!/usr/bin/env bash
# Negative controls for gate-p012b.py. Each control builds a private index
# (GIT_INDEX_FILE) = HEAD + the approved staged list + ONE deliberate violation,
# runs the gate against it, and requires both a non-zero exit AND a FAIL line
# containing the check that the violation targets. The working tree and the real
# index are never modified; violating content exists only as loose blobs
# (git hash-object -w) referenced from the private index. Probe values are
# assembled at run time so this source holds no credential-shaped literal.
set -u
EV=docs/governance/evidence
B=$EV/line-p012b-round2-2026-10-02
REMED=$EV/line-ci-remediation-2026-10-01
GATE="$B/gate-p012b.py"
PY="${PYTHON_BIN:-python}"
FILES=(
  supabase/tests/line_oa_definer_execute_fail_closed.sql supabase/tests/line_oa_definer_execute_matrix.sql
  supabase/tests/line_outbound_claim_record.sql .github/workflows/trust-kernel-verify.yml
  "$EV/line-p012b-red-a-2026-10-02" "$EV/line-p012b-red-mutants-2026-10-02" "$EV/line-p012b-green-2026-10-02" "$B"
  "$REMED/12-pre-amendment-hashes.txt" "$REMED/tools/pre_amendment_hashes.py" "$REMED/SHA256SUMS"
)
for f in en.md th.md en.html th.html; do
  FILES+=("docs/governance/line-b12-permission-matrix.$f" "docs/governance/line-p010-execute-survey.$f" "docs/PRD-LINE-OA.$f" "$REMED/REPORT.$f")
done
TMPD="$(mktemp -d)"
trap 'rm -r -- "$TMPD"' EXIT
fresh() { export GIT_INDEX_FILE="$TMPD/index"; git read-tree HEAD && git add -- "${FILES[@]}"; }
put() { local h; h="$(git hash-object -w -- "$2")"; git update-index --add --cacheinfo "100644,$h,$1"; }
show() { git -c core.longpaths=true cat-file blob ":$1"; }
fails=0
expect_fail() {  # expect_fail <label> <substring that a FAIL line must contain>
  local out ec
  out="$("$PY" "$GATE" 2>&1)"; ec=$?
  if [ "$ec" -ne 0 ] && printf '%s\n' "$out" | grep -E '^FAIL' | grep -qF -- "$2"; then
    echo "PASS (rejected by the targeted check, exit $ec): $1"
  else
    echo "FAIL (exit $ec; targeted check \"$2\" not among the failures): $1"; fails=$((fails+1))
  fi
  printf '%s\n' "$out" | grep -E '^FAIL' | head -4 | sed 's/^/    /'
}
echo "utc: $(date -u +%Y-%m-%dT%H:%M:%SZ) head: $(git rev-parse HEAD)"

fresh
if "$PY" "$GATE" >/dev/null 2>&1; then echo "PASS (gate accepted): control 0, the approved change set unmodified"; else echo "FAIL: control 0 rejected"; fails=$((fails+1)); fi

fresh; printf 'x\n' > "$TMPD/extra"; put "docs/governance/unapproved-extra.md" "$TMPD/extra"
expect_fail "control 1, an unapproved extra path" "change set is exactly"

fresh; show "$EV/line-p012b-green-2026-10-02/04a-matrix.tap" > "$TMPD/tap"; printf 'ok 999 - forged\n' >> "$TMPD/tap"
put "$EV/line-p012b-green-2026-10-02/04a-matrix.tap" "$TMPD/tap"
expect_fail "control 2, a raw runner output changed" "line-p012b-green-2026-10-02: SHA256SUMS matches the staged blobs"

fresh; show "supabase/migrations/0199_line_oa_restrict_definer_execute.sql" > "$TMPD/mig"; printf -- '-- probe\n' >> "$TMPD/mig"
put "supabase/migrations/0199_line_oa_restrict_definer_execute.sql" "$TMPD/mig"
expect_fail "control 3, migration 0199 changed" "0199 is byte-identical to the base"

fresh; show "docs/governance/line-p010-execute-survey.th.md" > "$TMPD/doc"; printf '\n`probeArtifactName` ไม่มีในโค้ด\n' >> "$TMPD/doc"
put "docs/governance/line-p010-execute-survey.th.md" "$TMPD/doc"
expect_fail "control 4, an unevidenced absence claim added to a governance document" "pinned lint_claims on the gated tree exits 0"

fresh; show ".github/workflows/trust-kernel-verify.yml" | sed 's/timeout-minutes: 10/timeout-minutes: 11/' > "$TMPD/wf"
put ".github/workflows/trust-kernel-verify.yml" "$TMPD/wf"
expect_fail "control 5, a non-comment workflow change" "every non-comment line of trust-kernel-verify.yml is unchanged"

fresh; show "$REMED/SHA256SUMS.run" > "$TMPD/run"; printf '\n' >> "$TMPD/run"; put "$REMED/SHA256SUMS.run" "$TMPD/run"
expect_fail "control 6, the remediation bundle's SHA256SUMS.run changed" "SHA256SUMS.run identical to the base"

fresh; seg="Aa0Aa0Aa0Aa0"; sep=":"; printf 'url: postgres%s//u%s%s%s@db.example.invalid:5432/x\n' "$sep" "$sep" "$seg" "$seg" > "$TMPD/cred"
show "docs/governance/line-p010-execute-survey.en.md" >> "$TMPD/cred"; put "docs/governance/line-p010-execute-survey.en.md" "$TMPD/cred"
expect_fail "control 7, a credential-shaped URI added to a changed file" "no new credential-shaped value"

echo "negative controls not rejected by their targeted check: $fails"
[ "$fails" -eq 0 ]
