#!/usr/bin/env bash
# Negative controls for gate-ci-remediation.py. Each control builds a private
# index (GIT_INDEX_FILE) = HEAD + the approved staged list + ONE deliberate
# violation, runs the gate against it, and expects GATE FAIL. The working tree
# and the real index are never modified; violating content is written only as
# loose blobs (git hash-object -w) referenced from the private index.
set -u
EV=docs/governance/evidence
B=$EV/line-ci-remediation-2026-10-01
GATE="$B/gate-ci-remediation.py"
PY="${PYTHON_BIN:-python}"
FILES=(.github/workflows/trust-kernel-verify.yml supabase/config.toml docs/governance/repair-intelligence-phase0-push-checklist.md "$B")
for stem in line-b12-permission-matrix line-outbound-phase0-session-report line-p010-execute-survey line-p010-integration-b12-followup; do
  for f in en.md th.md en.html th.html; do FILES+=("docs/governance/$stem.$f"); done
done
for b in line-b12-catalog-fixture-2026-09-30 line-b12-monolith-catalog-attempt2-2026-09-30 line-ci-source-2026-09-30 \
         line-p010-catalog-2026-09-30 line-p010-ci-hardening-green-2026-09-30 line-p010-evidence-followup-2026-09-30 \
         line-p010-failclosed-green-2026-09-30 line-p012-green-2026-09-30; do
  for f in REPORT.en.md REPORT.th.md REPORT.en.html REPORT.th.html SHA256SUMS; do FILES+=("$EV/$b/$f"); done
done
TMPD="$(mktemp -d)"
trap 'rm -r -- "$TMPD"' EXIT
fresh() { export GIT_INDEX_FILE="$TMPD/index"; git read-tree HEAD && git add -- "${FILES[@]}"; }
put() {  # put <path> <file with new content>
  local h; h="$(git hash-object -w -- "$2")"; git update-index --add --cacheinfo "100644,$h,$1"
}
expect_fail() {
  local label="$1" out ec
  out="$("$PY" "$GATE" 2>&1)"; ec=$?
  if [ "$ec" -ne 0 ]; then echo "PASS (gate rejected, exit $ec): $label"; else echo "FAIL (gate accepted): $label"; fails=$((fails+1)); fi
  printf '%s\n' "$out" | grep -E '^FAIL' | head -4 | sed 's/^/    /'
}
fails=0
echo "utc: $(date -u +%Y-%m-%dT%H:%M:%SZ) head: $(git rev-parse HEAD)"

fresh
"$PY" "$GATE" >/dev/null 2>&1 && echo "PASS (gate accepted): control 0, the approved change set unmodified" || { echo "FAIL: control 0 rejected"; fails=$((fails+1)); }

fresh; printf 'x\n' > "$TMPD/extra"; put "docs/governance/unapproved-extra.md" "$TMPD/extra"
expect_fail "control 1, an unapproved extra path"

fresh; git show "HEAD:$EV/line-p010-catalog-2026-09-30/SHA256SUMS.run" > "$TMPD/run"; printf '\n' >> "$TMPD/run"
put "$EV/line-p010-catalog-2026-09-30/SHA256SUMS.run" "$TMPD/run"
expect_fail "control 2, an amended bundle's SHA256SUMS.run changed"

fresh; git show ":$EV/line-p010-catalog-2026-09-30/08-analysis.txt" > "$TMPD/raw"; printf 'tampered\n' >> "$TMPD/raw"
put "$EV/line-p010-catalog-2026-09-30/08-analysis.txt" "$TMPD/raw"
expect_fail "control 3, a raw output of an amended bundle changed"

fresh; git show ":docs/governance/line-p010-execute-survey.th.md" > "$TMPD/doc"
printf '\n`probeArtifactName` ไม่มีในโค้ด\n' >> "$TMPD/doc"
put "docs/governance/line-p010-execute-survey.th.md" "$TMPD/doc"
expect_fail "control 4, an unevidenced absence claim added to a governance document"

fresh; git show ":supabase/config.toml" | sed 's/^enabled = true$/enabled = false/' > "$TMPD/cfg"
printf '[extra]\nkey = 1\n' >> "$TMPD/cfg"; put "supabase/config.toml" "$TMPD/cfg"
expect_fail "control 5, a config change beyond the storage line"

# The probe is assembled at run time so this source never holds the shape itself
# (the first commit attempt was blocked by the gate on exactly that literal).
fresh; seg="Aa0Aa0Aa0Aa0"; sep=":"; printf 'url: postgres%s//u%s%s%s@db.example.invalid:5432/x\n' "$sep" "$sep" "$seg" "$seg" > "$TMPD/cred"
cat "$B/REPORT.en.md" >> "$TMPD/cred"; put "$B/REPORT.en.md" "$TMPD/cred"
expect_fail "control 6, a credential-shaped URI added to a changed file"

echo "negative controls failed to be rejected: $fails"
[ "$fails" -eq 0 ]
