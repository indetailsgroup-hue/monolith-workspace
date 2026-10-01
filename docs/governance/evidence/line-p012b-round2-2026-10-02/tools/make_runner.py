"""Derive run-p012b.sh from the reviewed run-p012.sh by exact, counted replacements.
usage: python make_runner.py <repo> <out-file>"""
import sys
from pathlib import Path

repo, dst = Path(sys.argv[1]), Path(sys.argv[2])
src = (repo / "docs/governance/evidence/line-p012-green-2026-09-30/run-p012.sh").read_text(encoding="utf-8")
BS = "\\"
NL = "\n"


def rep(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, (old[:80], n)
    src = src.replace(old, new)


rep("""# B12 / P0-12 evidence runner for migration 0199 (owner-approved 30 September
# 2026). Adapted from the reviewed P0-10 runners. Builds the migration chain
# from zero on a throwaway stack (cron off, DB on loopback only) and runs:
#   red-a = base WITHOUT 0199 (the file does not exist yet): the new matrix
#           suite plus all regression suites, to show what 0199 must change;
#   red-b = with the real 0199 applied: the 0199 fail-closed suite pointed at a
#           MUTANT copy whose post-revoke verification is removed (never part of
#           the migration chain; passed only with -v);
#   green = with 0199: every suite, the Python files, the claim race, the CI
#           harness tests and the modified CI suite runner, all locally.
# Synthetic data only; no edge runtime, so no LINE delivery. Run from repo root:
#   P012_MODE=red-a|red-b|green P012_OUT=<new dir> [P012_RED_BUNDLE=<red-a dir>] bash <this file>""",
    """# B12 / P0-12 round-2 evidence runner (owner-approved 2 October 2026): the
# pre-review fixes to the 0199 test suites. 0199 itself is unchanged. Derived
# from the reviewed run-p012.sh. Builds the migration chain from zero on a
# throwaway stack (cron off, DB on loopback only) and runs:
#   red-a       = the chain WITHOUT 0199 (the committed file is skipped and the
#                 skip is recorded): the matrix suite and all regression suites,
#                 to show what the strengthened assertions catch without 0199;
#   red-mutants = with the real 0199: the fail-closed suite against mutant B
#                 (post-revoke verification removed) and mutant C (missing-
#                 identity check removed); mutants are never in the chain;
#   green       = with 0199: every suite, the Python files, the claim race, the
#                 CI harness tests and the CI suite runner, all locally.
# Synthetic data only; no edge runtime, so no LINE delivery. Run from repo root:
#   P012_MODE=red-a|red-mutants|green P012_OUT=<new dir> [P012_RED_BUNDLE=<red-a dir>] bash <this file>""")
rep('MODE="${P012_MODE:?set P012_MODE=red-a, red-b or green}"',
    'MODE="${P012_MODE:?set P012_MODE=red-a, red-mutants or green}"')
rep('[[ "$MODE" = red-a || "$MODE" = red-b || "$MODE" = green ]]',
    '[[ "$MODE" = red-a || "$MODE" = red-mutants || "$MODE" = green ]]')
rep('BASE="5119396a7c66c3f0d33547b57902ddefa2aefe07"', 'BASE="48b72d4c7c3f0d3bab197cb19483ca973807add2"')
rep("""CHANGED=(
  scripts/line-ci-tap.mjs scripts/run-line-db-suites.sh
  supabase/tests/line_oa_client_write_revoke.sql supabase/tests/line_outbound_claim_record.sql
  supabase/tests/line_oa_definer_execute_fail_closed.sql supabase/tests/line_oa_definer_execute_matrix.sql
  tests/line-oa-commerce/ci/tap-evidence.test.mjs
)""", """CHANGED=(
  supabase/tests/line_oa_definer_execute_fail_closed.sql supabase/tests/line_oa_definer_execute_matrix.sql
  supabase/tests/line_outbound_claim_record.sql
)""")
rep('NET="line-p012-net"; DB="line-p012-db"; AUTH="line-p012-auth"; STORAGE="line-p012-storage"',
    'NET="line-p012b-net"; DB="line-p012b-db"; AUTH="line-p012b-auth"; STORAGE="line-p012b-storage"')
rep('PORT="55448"', 'PORT="55449"')
rep('VERIFIER="$HERE/verify-p012.py"' + NL + 'MUTANT_SRC="$HERE/mutant-0199-no-matrix-verification.sql"',
    'VERIFIER="$HERE/verify-p012b.py"' + NL + 'MUTANT_B_SRC="$HERE/mutant-0199-no-matrix-verification.sql"'
    + NL + 'MUTANT_C_SRC="$HERE/mutant-0199-no-identity-check.sql"')
old_expected = src[src.index('expected="$(printf'):src.index('actual="$(git status')]
new_expected = ('expected="$(printf \'%s' + BS + 'n\' " M supabase/tests/line_oa_definer_execute_fail_closed.sql" ' + BS + NL
                + '  " M supabase/tests/line_oa_definer_execute_matrix.sql" " M supabase/tests/line_outbound_claim_record.sql" | LC_ALL=C sort)"' + NL)
rep(old_expected, new_expected)
rep("""if [ "$MODE" = red-b ]; then
  [ -f "$MUTANT_SRC" ] || refuse "mutant not found next to the runner"
  ! grep -q "EXECUTE matrix not met after revoke" "$MUTANT_SRC" || refuse "mutant still contains the verification"
fi""", """[ -f "$MIG" ] || refuse "committed 0199 not found"
if [ "$MODE" = red-mutants ]; then
  [ -f "$MUTANT_B_SRC" ] && [ -f "$MUTANT_C_SRC" ] || refuse "mutants not found next to the runner"
  ! grep -q "EXECUTE matrix not met after revoke" "$MUTANT_B_SRC" || refuse "mutant B still contains the verification"
  ! grep -q "matrix identity missing" "$MUTANT_C_SRC" || refuse "mutant C still contains the identity check"
fi""")
rep("--filter name=^line-p012- --format", "--filter name=^line-p012b- --format")
rep('refuse "line-p012-* containers already exist (not removed)"', 'refuse "line-p012b-* containers already exist (not removed)"')
rep('iss:"line-p012"', 'iss:"line-p012b"')
rep('line-p012-hypothesis', 'line-p012b-hypothesis')
rep('cp "$0" "$OUT/run-p012.sh"', 'cp "$0" "$OUT/run-p012b.sh"')
rep('cp "$VERIFIER" "$OUT/verify-p012.py"', 'cp "$VERIFIER" "$OUT/verify-p012b.py"')
rep("""if [ "$MODE" = red-b ]; then
  cp "$MUTANT_SRC" "$OUT/mutant-0199-no-matrix-verification.sql"
  diff -u "$MIG" "$OUT/mutant-0199-no-matrix-verification.sql" > "$OUT/mutant-vs-0199.diff"
  echo "diff_exit=$? (1 = files differ, expected)" >> "$OUT/mutant-vs-0199.diff"
fi""", """if [ "$MODE" = red-mutants ]; then
  for m in b c; do
    src="$MUTANT_B_SRC"; [ "$m" = c ] && src="$MUTANT_C_SRC"
    cp "$src" "$OUT/$(basename "$src")"
    diff -u "$MIG" "$OUT/$(basename "$src")" > "$OUT/mutant-$m-vs-0199.diff"
    echo "diff_exit=$? (1 = files differ, expected)" >> "$OUT/mutant-$m-vs-0199.diff"
  done
fi""")
rep("(copy: run-p012.sh)", "(copy: run-p012b.sh)")
rep("(copy: verify-p012.py)", "(copy: verify-p012b.py)")
old_ctx = src[src.index('  if [ "$MODE" != red-a ]; then' + NL + '    echo "migration_0199_sha256'):src.index('  echo "core.autocrlf')]
new_ctx = ("""  echo "migration_0199_sha256: $(sha256sum "$MIG" | cut -d' ' -f1) (committed; $([ "$MODE" = red-a ] && echo 'SKIPPED in this run' || echo 'applied'))"
  [ "$MODE" != red-a ] && echo "sources_identical_to_red_a_bundle: yes ($RED_BUNDLE)"
  if [ "$MODE" = red-mutants ]; then
    echo "mutant_b_sha256: $(sha256sum "$MUTANT_B_SRC" | cut -d' ' -f1) (never in supabase/migrations)"
    echo "mutant_c_sha256: $(sha256sum "$MUTANT_C_SRC" | cut -d' ' -f1) (never in supabase/migrations)"
  fi
""")
rep(old_ctx, new_ctx)
rep('docker ps -a --filter "name=^line-p012-"', 'docker ps -a --filter "name=^line-p012b-"')
rep("""  sum=$(sha256sum "$f" | cut -d' ' -f1)
  if out=""", """  sum=$(sha256sum "$f" | cut -d' ' -f1)
  if [ "$MODE" = red-a ] && [ "$f" = "$MIG" ]; then echo "skip $sum  $f (red-a: chain without 0199)" >> "$MIGS"; continue; fi
  if out=""")
old_tap = src[src.index('if [ "$MODE" = red-b ]; then' + NL + '  tap 04-fc0199-vs-mutant.tap'):src.index('else' + NL + '  tap 04a-matrix.tap')]
new_tap = ("""if [ "$MODE" = red-mutants ]; then
  tap 04f-fc0199-vs-mutant-b.tap supabase/tests/line_oa_definer_execute_fail_closed.sql """ + BS + """
    -v p012_migration="$(cygpath -m "$(cd "$OUT" && pwd)")/mutant-0199-no-matrix-verification.sql"
  tap 04g-fc0199-vs-mutant-c.tap supabase/tests/line_oa_definer_execute_fail_closed.sql """ + BS + """
    -v p012_migration="$(cygpath -m "$(cd "$OUT" && pwd)")/mutant-0199-no-identity-check.sql"
""")
rep(old_tap, new_tap)
rep('LINE_DB_RUN_ID="p012-green-local"', 'LINE_DB_RUN_ID="p012b-green-local"')
rep('"$PY" "$OUT/verify-p012.py" "$OUT" "$MODE"', '"$PY" "$OUT/verify-p012b.py" "$OUT" "$MODE"')
dst.write_text(src, encoding="utf-8", newline="\n")
print("written", dst)
