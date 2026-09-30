"""B12 / P0-12 (0199) expectation check over one captured bundle.

Usage: verify-p012.py <bundle> red-a|red-b|green
Reads only captured files. Exit 0 only when every expectation for the mode holds.
"""
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

out = pathlib.Path(sys.argv[1])
mode = sys.argv[2]
assert mode in ("red-a", "red-b", "green")
failures = []


def check(ok, message):
    print(("PASS: " if ok else "FAIL: ") + message)
    if not ok:
        failures.append(message)


def text(name):
    return (out / name).read_text(encoding="utf-8", errors="replace")


def tap(name, plan=None):
    t = text(name)
    results = {int(n): (s, d) for s, n, d in re.findall(r"^(not ok|ok) (\d+) - (.*)$", t, re.M)}
    m = re.search(r"^1\.\.(\d+)$", t, re.M)
    n = int(m.group(1)) if m else -1
    check(m is not None and (plan is None or n == plan) and sorted(results) == list(range(1, n + 1))
          and "Looks like you planned" not in t, f"{name}: plan 1..{n} with {n} ordered results and no plan mismatch")
    return t, results


def failed(results):
    return {k for k, (s, _) in results.items() if s == "not ok"}


ctx = text("00-context.txt")
migs = [l for l in text("02-migrations-applied.txt").splitlines() if l.strip()]
with_0199 = mode != "red-a"
check(len(migs) == (194 if with_0199 else 193) and all(l.startswith("ok ") for l in migs),
      f"{len(migs)} migrations applied from zero, none failed")
check(migs[-1].endswith("0199_line_oa_restrict_definer_execute.sql") == with_0199,
      f"0199 applied as the last migration only when it exists (mode {mode})")
check(not any("mutant" in l for l in migs), "no mutant in the migration chain")
check("cron_launch_active_jobs: off" in ctx, "cron scheduler disabled")
check(re.search(r"cron_job_run_details_rows: 0\b", text("08-baseline-after-tests.txt")) is not None, "no cron job ran")
check("catalog_fingerprint_unchanged_by_tests: yes" in ctx, "schema/ACL/owner/trigger/membership fingerprint unchanged by the tests")
check("roles_named_p01x: 0" in text("08-baseline-after-tests.txt"), "no throwaway p01x role left")

if mode == "red-b":
    diff = text("mutant-vs-0199.diff")
    body = [l for l in diff.splitlines() if l and not l.startswith(("---", "+++", "@@", " ", "diff_exit="))]
    check(body and all(l.startswith("-") for l in body) and any("EXECUTE matrix not met after revoke" in l for l in body),
          f"mutant diff only removes lines, including the post-revoke verification and its raise ({len(body)} lines)")
    t, r = tap("04-fc0199-vs-mutant.tap", 23)
    check(failed(r) == {3, 4, 5, 6, 8, 9, 10, 11, 13, 14, 15, 16},
          f"RED-B: exactly the 12 rejection/rollback assertions of cases A-C fail ({sorted(failed(r))})")
    check(len(re.findall(r"#\s+have: 00000\s*\n#\s+want: 42501", t)) == 3,
          "RED-B: the three expected rejections show SQLSTATE 00000 (the mutant completed instead of refusing)")
    check(all(r[k][0] == "ok" for k in (17, 18, 19, 20, 21, 22, 23)),
          "RED-B: case D (overload guard kept in the mutant) and case E pass, so the mutant applies cleanly")
    check("fc0199-vs-mutant_exit=0" in ctx or "04-fc0199-vs-mutant_exit=0" in ctx, "RED-B: psql exit 0")
else:
    t, r = tap("04a-matrix.tap", 82)
    expected_red = set(range(4, 9)) | set(range(10, 25)) | set(range(25, 35)) | set(range(37, 46)) | set(range(47, 54))
    if mode == "red-a":
        check(failed(r) == expected_red,
              f"RED-A: exactly the 46 matrix, PUBLIC and denial assertions fail ({sorted(failed(r) ^ expected_red)} differ)")
        check(all(r[k][0] == "ok" for k in range(54, 83)),
              "RED-A: side-effect, retained-RPC, owner-chain, sender, sweep and field-app assertions already pass")
    else:
        check(not failed(r), f"GREEN: matrix suite 82/82 ({sorted(failed(r))})")
    _, r107 = tap("04c-original.tap", 107)
    want107 = {23} if mode == "red-a" else set()
    check(failed(r107) == want107, f"original suite: failures {sorted(failed(r107))} (expected {sorted(want107)}: the service-only recorder check needs 0199)")
    _, r133 = tap("04d-p010.tap", 133)
    check(not failed(r133), "P0-10 suite 133/133 (fn_prod_curated reached through an owner chain)")
    _, r98 = tap("04e-fc0198.tap")
    check(not failed(r98), "0198 fail-closed suite passes")
    if mode == "green":
        t99, r99 = tap("04b-fc0199.tap", 23)
        check(not failed(r99), "GREEN: 0199 fail-closed suite 23/23 against the real 0199")
        check(t99.count("ERROR:  B12: EXECUTE matrix not met after revoke") == 3 and t99.count("ERROR:  B12: unclassified overload") == 1,
              "GREEN: the real 0199 refused cases A-C with the matrix error and case D with the overload error")
    check(re.search(r"PASS claim-race: client_a=\d+ client_b=\d+ overlap=0", text("05-claim-race-output.txt")) is not None,
          "claim race zero overlap")
    root = ET.parse(out / "06-pytest-junit.xml").getroot()
    cases = root.findall(".//testcase")
    bad = [c for c in cases if c.find("skipped") is not None or c.find("failure") is not None or c.find("error") is not None]
    check(len(cases) == 72 and not bad, f"12 required Python files 72/72, none skipped ({len(cases)} cases, {len(bad)} not passing)")
    if mode == "green":
        check("ci_harness_tests_exit=0" in ctx and re.search(r"^# fail 0$", text("07a-ci-harness-tests.txt"), re.M) is not None,
              "CI harness tests (TAP/source evidence) pass with the fourteen-suite list")
        runner = text("07b-ci-suite-runner.txt")
        m = re.search(r"FAILED: (\d+) of (\d+) suites:(.*)$", runner, re.M)
        print("OBSERVED: CI suite runner:", m.group(0) if m else runner.strip().splitlines()[-1])
        check(m is not None and m.group(2) == "14" and m.group(3).split() == ["repair_phase0_containment"],
              "CI suite runner (local): all 14 suites ran; the only failing suite is the existing repair_phase0_containment")
        results = {}
        for p in sorted((out / "07b-ci-suite-runner").glob("*.result.json")):
            results[p.name[:-len(".result.json")]] = json.loads(p.read_text(encoding="utf-8"))
        line = ["line_outbound_claim_record", "line_oa_client_write_revoke", "line_oa_client_write_revoke_fail_closed",
                "line_oa_definer_execute_matrix", "line_oa_definer_execute_fail_closed"]
        check(all(results.get(s, {}).get("pass") is True for s in line),
              f"CI suite runner (local): the five LINE suites pass the strict TAP check ({[s for s in line if results.get(s, {}).get('pass') is not True]})")

teardown = text("09-teardown.txt")
check("containers_present_after_removal: []" in teardown and "network_present_after_removal: []" in teardown,
      "owned containers and network removed")
scan = text("10a-credential-scan.txt")
check("PASS: positive control" in scan and "PASS: no generated credential bytes" in scan, "in-run credential scan passed")

print("RESULT:", f"P0-12 {mode.upper()} expectations met" if not failures else f"{len(failures)} expectation(s) not met")
print("Scope: local throwaway stack only; not GitHub Actions and not production. Phase A remains EVIDENCE_INCOMPLETE.")
sys.exit(1 if failures else 0)
