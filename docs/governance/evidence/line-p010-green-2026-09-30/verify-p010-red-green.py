"""P0-10 RED/GREEN expectation check over one captured bundle.

Usage: verify-p010-red-green.py <bundle> red|green
Reads only captured files. Exit 0 only when every expectation for the mode holds.
RED  (no 0198): the new write-denial assertions fail, everything else passes.
GREEN (0198):   every suite passes and the catalog shows zero client write rights.
"""
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


ctx = text("00-context.txt")
migs = [l for l in text("02-migrations-applied.txt").splitlines() if l.strip()]
ok_migs = [l for l in migs if l.startswith("ok ")]
has_0198 = any(l.endswith("0198_line_oa_revoke_client_write_grants.sql") for l in ok_migs)
check(len(ok_migs) == len(migs) and not any(l.startswith("FAIL") for l in migs), f"all {len(migs)} migrations applied from zero, none failed")
check(len(ok_migs) == (193 if mode == "green" else 192), f"migration count matches the mode ({len(ok_migs)})")
check(has_0198 == (mode == "green"), f"0198 applied only in GREEN (applied={has_0198})")
check("cron_launch_active_jobs: off" in ctx, "cron scheduler disabled")
check(re.search(r"cron_job_run_details_rows: 0\b", text("08-baseline-after-tests.txt")) is not None, "no cron job ran")
check("catalog_fingerprint_unchanged_by_tests_and_catalog: yes" in ctx, "schema/ACL/ownership fingerprint unchanged by tests and catalog")


def tap(name, plan):
    t = text(name)
    results = [(s, int(n), d) for s, n, d in re.findall(r"^(not ok|ok) (\d+) - (.*)$", t, re.M)]
    check(f"1..{plan}" in t and len(results) == plan and [n for _, n, _ in results] == list(range(1, plan + 1)),
          f"{name}: plan 1..{plan} with {plan} ordered results")
    return {n: (s, d) for s, n, d in results}


orig = tap("04a-pgtap-original.tap", 107)
check(all(s == "ok" for s, _ in orig.values()), "original 107 pgTAP assertions all pass")
check("pgtap_original_exit=0" in ctx and "pgtap_p010_exit=0" in ctx, "both pgTAP psql runs exit 0")

new = tap("04b-pgtap-p010.tap", 133)
failed = {n for n, (s, _) in new.items() if s == "not ok"}
audit_update_delete = {58, 59, 90, 91, 122, 123}
expected_red_failures = set(range(5, 125)) - audit_update_delete
if mode == "red":
    check(failed == expected_red_failures,
          f"RED: exactly the 114 write-privilege assertions fail (unexpected={sorted(failed - expected_red_failures)}, "
          f"missing={sorted(expected_red_failures - failed)})")
    check(all(new[n][1].endswith("line_oa_audit_log is refused by the table privilege (42501 permission denied for table)")
              for n in audit_update_delete), "RED: the 6 passing probes are audit-log UPDATE/DELETE already revoked by 0005")
else:
    check(not failed, f"GREEN: all 133 P0-10 pgTAP assertions pass (failed={sorted(failed)})")

race = text("05-claim-race-output.txt")
check("claim_race_exit=0" in ctx and re.search(r"PASS claim-race: client_a=\d+ client_b=\d+ overlap=0", race) is not None,
      "two-client claim race passes with zero overlap")

root = ET.parse(out / "06-pytest-junit.xml").getroot()
cases = root.findall(".//testcase")
skipped = [c for c in cases if c.find("skipped") is not None]
fails = [c for c in cases if c.find("failure") is not None or c.find("error") is not None]
check(len(cases) == 72 and not skipped, f"12 required Python suites: 72 cases, 0 skipped (cases={len(cases)}, skipped={len(skipped)})")
if mode == "red":
    check(len(fails) == 8 and all(c.get("name", "").startswith("test_clients_hold_no_write_grants[") for c in fails),
          f"RED: only the 8 test_clients_hold_no_write_grants cases fail ({len(fails)} failures)")
    check("pytest_exit=1" in ctx, "RED: pytest exit 1 agrees with the recorded failures")
else:
    check(not fails, f"GREEN: 72 of 72 Python cases pass ({len(fails)} failures)")
    check("pytest_exit=0" in ctx, "GREEN: pytest exit 0")

check("catalog_aligned_exit=0 · catalog_unaligned_exit=0" in ctx and "catalog_analysis_exit=0" in ctx,
      "catalog checklist (both formats) and analysis exit 0")
ana = text("07c-catalog-analysis.txt")
writes = dict(re.findall(r"effective write on target tables \S+ (\w+): (\d)/8", ana))
want_client = "0" if mode == "green" else "8"
check(all(writes.get(r) == want_client for r in ("anon", "authenticated", "service_role")),
      f"catalog: anon/authenticated/service_role effective writes {want_client}/8 ({writes})")
check(writes.get("postgres") == "8" and "definer write rights that depend only on role membership: none" in ana
      and "definer owners lacking INSERT/UPDATE on a target table: none" in ana,
      "catalog: owner keeps all rights; no DEFINER right depends on membership")
sel = re.findall(r"^service_role\s+line_oa_\w+\s+(\w)\s", ana, re.M)
check(len(sel) == 8 and set(sel) == {"t"}, "catalog: service_role keeps SELECT on all 8 tables")
check("identities (incl. overloads) for the 20 names: 20" in ana and "SECURITY DEFINER: 20/20" in ana,
      "catalog: 20 DEFINER identities unchanged")
execs = dict(re.findall(r"EXECUTE on the 20 \S+ (\w+): (\d+)/20", ana))
check(execs.get("anon") == "18" and execs.get("authenticated") == "19" and execs.get("service_role") == "20",
      f"catalog: EXECUTE on the 20 unchanged (anon 18, authenticated 19, service_role 20) ({execs})")
check("PUBLIC holds a direct write grant on: none" in ana and "none (no attacl set" in ana,
      "catalog: no PUBLIC write grant and no column ACL")

teardown = text("09-teardown.txt")
check("containers_present_after_removal: []" in teardown and "network_present_after_removal: []" in teardown,
      "owned containers and network removed")
scan = text("10a-credential-scan.txt")
check("PASS: positive control" in scan and "PASS: no generated credential bytes" in scan, "in-run credential scan passed")

print("RESULT:", f"P0-10 {mode.upper()} expectations met" if not failures else f"{len(failures)} expectation(s) not met")
print("Scope: reconstructed migration chain on a throwaway stack only; not production. Phase A remains EVIDENCE_INCOMPLETE.")
sys.exit(1 if failures else 0)
