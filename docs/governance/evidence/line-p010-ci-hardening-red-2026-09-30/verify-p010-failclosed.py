"""P0-10 follow-up expectation check over one captured bundle.

Usage: verify-p010-failclosed.py <bundle> red|green
Reads only captured files. Exit 0 only when every expectation for the mode holds.
RED:   the fail-closed suite, pointed at the mutant, fails exactly on the twenty
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

rejection = {3, 4, 5, 6, 8, 9, 10, 11, 15, 16, 17, 18, 20, 21, 22, 23, 25, 26, 27, 28}
if mode == "red":
    diff = text("mutant-vs-0198.diff")
    body = [l for l in diff.splitlines() if l and not l.startswith(("---", "+++", "@@", " ", "diff_exit="))]
    removed = [l for l in body if l.startswith("-")]
    check(body and all(l.startswith("-") for l in body) and any("raise exception 'P0-10: write privileges remain after revoke" in l for l in removed)
          and any("has_any_column_privilege" in l for l in removed),
          f"mutant diff only removes lines, and the removed lines are the residual check and its raise ({len(removed)} lines)")
    check("write privileges remain after revoke" not in text("mutant-0198-no-residual-check.sql"), "mutant no longer contains the rejection")
    t, r = tap("04-fail-closed-vs-mutant.tap", 28)
    failed = {n for n, (s, _) in r.items() if s == "not ok"}
    check(failed == rejection, f"RED: exactly the 20 rejection/rollback assertions fail (failed={sorted(failed)})")
    check(len(re.findall(r"#\s+have: 00000\s*\n#\s+want: 42501", t)) == 5,
          "RED: all five expected rejections show SQLSTATE 00000 — the mutant completed instead of refusing")
    check(r.get(12, ("",))[0] == "ok" and r.get(13, ("",))[0] == "ok",
          "RED: case C passes, so the mutant itself applies without syntax or environment error")
    check("ERROR:  P0-10: write privileges remain" not in t, "RED: no rejection error was produced by the mutant")
    check("fail_closed_vs_mutant_exit=0" in ctx, "RED: psql exit 0 (failures are assertion results, not a crash)")
else:
    t, r = tap("04a-fail-closed-vs-0198.tap", 28)
    check(all(s == "ok" for s, _ in r.values()), "GREEN: all 28 fail-closed assertions pass against the real 0198")
    errors = re.findall(r'ERROR:  P0-10: write privileges remain after revoke: ([^\r\n]+)', t)
    check(sorted(errors) == sorted(['anon:line_oa_orders','anon:line_oa_message_templates','authenticated:line_oa_orders','service_role:line_oa_orders','anon:line_oa_message_templates']),
          'GREEN: exactly the five targeted residual-privilege errors')
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

    full = text("07-ci-local/full/summary.txt")
    steps = dict(re.findall(r"^step (\S+) exit=(\d+) ::", full, re.M))
    check(steps == {'1':'1','2':'0','3':'0','4':'0','5':'1'}, 'full local steps have exact expected statuses (known containment failure remains)')
    ev = json.loads(text('07-ci-local/full/db-verify-evidence.json'))
    rows=ev['pgtap']['suites']
    check(len(rows)==12 and not ev['missingSuites'], 'all twelve suites ran and have evidence')
    check(ev['linePass'] is True and ev['fullPass'] is False and ev['pass'] is False,
          'LINE passes separately; full pgTAP remains FAILED, never masked')
    failed=[r for r in rows if not r['pass']]
    check(len(failed)==1 and failed[0]['suite']=='repair_phase0_containment'
          and failed[0]['exitCode']==3 and failed[0]['plan']==8 and failed[0]['ok']==6 and failed[0]['notOk']==0,
          'only the known containment suite fails: SQL exit3, six of eight, zero not-ok')
    error=text('07-ci-local/full/tap/repair_phase0_containment.stderr')
    expected='function "public.rpc_factory_job_record_packet(text,text,text,text,text,text[],text[],text,text,text,text,integer)" does not exist'
    check(error.count('ERROR:')==1 and expected in error and 'repair_phase0_containment.sql:74:' in error,
          'known failure is pinned to exact file, line and missing signature; no new SQL failure allowed')
    for name,n in [('line_outbound_claim_record',107),('line_oa_client_write_revoke',133),('line_oa_client_write_revoke_fail_closed',28)]:
        item=next(r for r in rows if r['suite']==name)
        check(item['pass'] and item['plan']==n and item['ok']==n and item['exitCode']==0,
              name+': full-loop result is complete and passes')
    check(ev['origin']=='local' and ev['runUrl'] is None and 'ubuntu-latest' not in ev['environment'],
          'local metadata cannot claim a GitHub Actions run')
    check('ci_local_full_exit=1' in ctx, 'full local CI result remains nonzero and is explicitly reported')

teardown = text("09-teardown.txt")
check("containers_present_after_removal: []" in teardown and "network_present_after_removal: []" in teardown
      and "ci_workdir_present_after_removal: []" in teardown, "owned containers, network and CI work directory removed")
scan = text("10a-credential-scan.txt")
check("PASS: positive control" in scan and "PASS: no generated credential bytes" in scan, "in-run credential scan passed")

print("RESULT:", f"P0-10 follow-up {mode.upper()} expectations met" if not failures else f"{len(failures)} expectation(s) not met")
print("Scope: local throwaway stack only; not GitHub Actions and not production. Phase A remains EVIDENCE_INCOMPLETE.")
sys.exit(1 if failures else 0)
