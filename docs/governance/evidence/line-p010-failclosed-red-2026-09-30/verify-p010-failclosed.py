"""P0-10 follow-up expectation check over one captured bundle.

Usage: verify-p010-failclosed.py <bundle> red|green
Reads only captured files. Exit 0 only when every expectation for the mode holds.
RED:   the fail-closed suite, pointed at the mutant, fails exactly on the eight
       rejection/rollback assertions because the mutant completes (SQLSTATE
       00000), not because of syntax or environment.
GREEN: the same suite against the real 0198 passes, the P0-10, original and
       Python suites pass, and the modified workflow's database steps are run
       locally with their outcome recorded as observed.
"""
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

out = pathlib.Path(sys.argv[1])
mode = sys.argv[2]
assert mode in ("red", "green")
failures = []


def check(ok, message):
    print(("PASS: " if ok else "FAIL: ") + message)
    if not ok:
        failures.append(message)


def text(name):
    return (out / name).read_text(encoding="utf-8", errors="replace")


def tap(name, plan):
    t = text(name)
    results = {int(n): (s, d) for s, n, d in re.findall(r"^(not ok|ok) (\d+) - (.*)$", t, re.M)}
    check(re.search(rf"^1\.\.{plan}$", t, re.M) is not None and sorted(results) == list(range(1, plan + 1))
          and "Looks like you planned" not in t, f"{name}: plan 1..{plan} with {plan} ordered results and no plan mismatch")
    return t, results


ctx = text("00-context.txt")
migs = [l for l in text("02-migrations-applied.txt").splitlines() if l.strip()]
check(len(migs) == 193 and all(l.startswith("ok ") for l in migs)
      and migs[-1].endswith("0198_line_oa_revoke_client_write_grants.sql"),
      f"193 migrations from zero including the real 0198 as the last, none failed ({len(migs)})")
check(not any("mutant" in l for l in migs), "the mutant is not part of the applied migration chain")
check("identical to HEAD: yes" in ctx, "the real 0198 on disk is identical to the committed file")
check("cron_launch_active_jobs: off" in ctx, "cron scheduler disabled")
check(re.search(r"cron_job_run_details_rows: 0\b", text("08-baseline-after-tests.txt")) is not None, "no cron job ran")
check("catalog_fingerprint_unchanged_by_tests: yes" in ctx, "schema/ACL/ownership/membership fingerprint unchanged by the tests")
check("roles_named_p010: 0" in text("08-baseline-after-tests.txt"), "no throwaway p010 role left after the tests")

rejection = {3, 4, 5, 6, 8, 9, 10, 11}
if mode == "red":
    diff = text("mutant-vs-0198.diff")
    body = [l for l in diff.splitlines() if l and not l.startswith(("---", "+++", "@@", " ", "diff_exit="))]
    removed = [l for l in body if l.startswith("-")]
    check(body and all(l.startswith("-") for l in body) and any("raise exception 'P0-10: write privileges remain after revoke" in l for l in removed)
          and any("has_any_column_privilege" in l for l in removed),
          f"mutant diff only removes lines, and the removed lines are the residual check and its raise ({len(removed)} lines)")
    check("write privileges remain after revoke" not in text("mutant-0198-no-residual-check.sql"), "mutant no longer contains the rejection")
    t, r = tap("04-fail-closed-vs-mutant.tap", 13)
    failed = {n for n, (s, _) in r.items() if s == "not ok"}
    check(failed == rejection, f"RED: exactly the 8 rejection/rollback assertions fail (failed={sorted(failed)})")
    check(len(re.findall(r"#\s+have: 00000\s*\n#\s+want: 42501", t)) == 2,
          "RED: both expected rejections show SQLSTATE 00000 — the mutant completed instead of refusing")
    check(r.get(12, ("",))[0] == "ok" and r.get(13, ("",))[0] == "ok",
          "RED: case C passes, so the mutant itself applies without syntax or environment error")
    check("ERROR:  P0-10: write privileges remain" not in t, "RED: no rejection error was produced by the mutant")
    check("fail_closed_vs_mutant_exit=0" in ctx, "RED: psql exit 0 (failures are assertion results, not a crash)")
else:
    t, r = tap("04a-fail-closed-vs-0198.tap", 13)
    check(all(s == "ok" for s, _ in r.values()), "GREEN: all 13 fail-closed assertions pass against the real 0198")
    check(t.count("ERROR:  P0-10: write privileges remain after revoke: anon:line_oa_orders") == 1
          and t.count("ERROR:  P0-10: write privileges remain after revoke: anon:line_oa_message_templates") == 1,
          "GREEN: the real 0198 raised the rejection once for each surviving privilege case")
    _, r2 = tap("04b-pgtap-p010.tap", 133)
    check(all(s == "ok" for s, _ in r2.values()), "GREEN: P0-10 suite 133/133")
    _, r3 = tap("04c-pgtap-original.tap", 107)
    check(all(s == "ok" for s, _ in r3.values()), "GREEN: original suite 107/107")
    check(all(f"{k}=0" in ctx for k in ("fail_closed_vs_0198_exit", "pgtap_p010_exit", "pgtap_original_exit", "claim_race_exit", "pytest_exit")),
          "GREEN: all direct runs exit 0")
    check(re.search(r"PASS claim-race: client_a=\d+ client_b=\d+ overlap=0", text("05-claim-race-output.txt")) is not None,
          "GREEN: claim race zero overlap")
    root = ET.parse(out / "06-pytest-junit.xml").getroot()
    cases = root.findall(".//testcase")
    bad = [c for c in cases if c.find("skipped") is not None or c.find("failure") is not None or c.find("error") is not None]
    check(len(cases) == 72 and not bad, f"GREEN: 12 required Python files 72/72, none skipped ({len(cases)} cases, {len(bad)} not passing)")

    # Local run of the modified workflow's database steps: record what happened.
    full = text("07-ci-local/full/summary.txt")
    steps = dict(re.findall(r"^step (\S+) exit=(\d+) ::", full, re.M))
    check(set(steps) == {"1", "2", "3", "4", "5"}, f"local CI run executed the 5 database steps ({sorted(steps)})")
    log1 = text("07-ci-local/full/ci-step-1.log")
    stopped = re.search(r'psql:supabase/tests/(\w+)\.sql:\d+: ERROR:\s+(.*)', log1)
    print("OBSERVED: full pgTAP step exit", steps.get("1"), "| first error:", stopped.group(0) if stopped else "none")
    passed_before = re.findall(r"^(\w+): all ok \((\d+) assertions\)$", log1, re.M)
    print("OBSERVED: suites reported all ok before the stop:", passed_before)
    check(all(steps.get(k) == "0" for k in ("2", "3", "4", "5")),
          "local CI: claim race, 0192 check, the new 0198 check and evidence assembly exit 0")
    ev = json.loads(text("07-ci-local/full/db-verify-evidence.json"))
    print("OBSERVED: assembled evidence pgtap.pass =", ev["pgtap"]["pass"],
          "| suites not passing:", [s["suite"] for s in ev["pgtap"]["suites"] if not s["pass"]])
    only = text("07-ci-local/line-suites-only/summary.txt")
    log_only = text("07-ci-local/line-suites-only/ci-step-1-line-suites-only.log")
    check("step 1-line-suites-only exit=0" in only
          and "line_outbound_claim_record: all ok (107 assertions)" in log_only
          and "line_oa_client_write_revoke: all ok (133 assertions)" in log_only
          and "line_oa_client_write_revoke_fail_closed: all ok (13 assertions)" in log_only,
          "local CI loop body with the three LINE suites: wrapper applied, all ok 107 / 133 / 13")

teardown = text("09-teardown.txt")
check("containers_present_after_removal: []" in teardown and "network_present_after_removal: []" in teardown
      and "ci_workdir_present_after_removal: []" in teardown, "owned containers, network and CI work directory removed")
scan = text("10a-credential-scan.txt")
check("PASS: positive control" in scan and "PASS: no generated credential bytes" in scan, "in-run credential scan passed")

print("RESULT:", f"P0-10 follow-up {mode.upper()} expectations met" if not failures else f"{len(failures)} expectation(s) not met")
print("Scope: local throwaway stack only; not GitHub Actions and not production. Phase A remains EVIDENCE_INCOMPLETE.")
sys.exit(1 if failures else 0)
