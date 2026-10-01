"""Verify one P0-9 evidence bundle written by scripts/run-line-p009-evidence.sh.

usage: verify-line-p009-evidence.py <out> <red|green> <p009_exit> <loop_exit>
         <inbound_race_exit> <claim_race_exit> <ci_tests_exit> <py_exit>
Generated credentials arrive only through P009_SCAN_* environment variables.
"""
from pathlib import Path
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

out = Path(sys.argv[1])
mode = sys.argv[2]
p009_exit, loop_exit, inbound_exit, claim_exit, ci_exit, py_exit = sys.argv[3:9]
CONTROLS = {7, 33, 34, 35}


def require(value, message):
    if not value:
        raise AssertionError(message)
    print('PASS:', message)


secrets = [os.environ[k].encode() for k in ('P009_SCAN_PW', 'P009_SCAN_JWT', 'P009_SCAN_ANON', 'P009_SCAN_SERVICE')]
require(all(len(s) > 20 for s in secrets), 'generated credential inputs supplied')


def hits(data):
    return any(s in data for s in secrets)


require(hits(b'control=' + secrets[0]), 'credential scanner positive control detects a generated credential')
files = [p for p in out.rglob('*') if p.is_file()]
found = [str(p.relative_to(out)) for p in files if hits(p.read_bytes())]
require(not found, f'no generated credential bytes in {len(files)} captured files (findings={found!r})')

migrations = (out / '02-migrations-applied.txt').read_text(encoding='utf-8').splitlines()
skipped = [line for line in migrations if line.startswith('skip ')]
require(not any(line.startswith('FAIL') for line in migrations), 'every applied migration succeeded')
if mode == 'red':
    require(len(skipped) == 1 and skipped[0].endswith('0200_line_inbound_handler_retry.sql (RED: schema before P0-9)'),
            'RED skipped exactly 0200')
else:
    require(not skipped and migrations[-1].endswith('0200_line_inbound_handler_retry.sql'),
            'GREEN applied the whole chain ending at 0200')

require(p009_exit == '0', 'P0-9 suite psql exit 0 (failures are reported in TAP, not by psql)')
tap = (out / '05-p009-pgtap.tap').read_text(encoding='utf-8')
results = [(state, int(n)) for state, n in re.findall(r'^(not ok|ok) (\d+)(?:\s|$)', tap, re.M)]
require(re.search(r'^1\.\.35$', tap, re.M) and [n for _, n in results] == list(range(1, 36)),
        'TAP plan 1..35 with 35 results in order')
failed = {n for state, n in results if state == 'not ok'}
if mode == 'red':
    require(failed == set(range(1, 36)) - CONTROLS,
            f'RED: every assertion fails except controls {sorted(CONTROLS)} (failed={sorted(failed)})')
    first = tap.split('not ok 1 - ', 1)[1].split('\nnot ok 2 - ', 1)[0]
    require('"events_processed": 1' in first,
            'RED assertion 1 reproduces B8: the failed handler was counted as processed')
else:
    require(not failed, 'GREEN: all 35 assertions pass')

loop_dir = out / '06-suite-loop'
verdicts = {}
for res in sorted(loop_dir.glob('*.result.json')):
    data = json.loads(res.read_text(encoding='utf-8'))
    verdicts[data['suite']] = data['pass']
require(len(verdicts) == 15, f'fifteen suite verdicts recorded ({len(verdicts)})')
loop_failed = sorted(s for s, ok in verdicts.items() if not ok)
expected_failed = ['line_inbound_handler_retry', 'repair_phase0_containment'] if mode == 'red' else ['repair_phase0_containment']
require(loop_failed == expected_failed,
        f'suite loop fails exactly {expected_failed} (known 0170 dependency; failed={loop_failed})')
require(loop_exit == '1', 'suite loop exit 1 agrees with the recorded failures')

inbound = (out / '07a-inbound-retry-race.txt').read_text(encoding='utf-8')
require(inbound_exit == '0', 'inbound retry race exit 0')
if mode == 'red':
    require('SKIP inbound-retry-race: requires pre-applied migration 0200' in inbound,
            'RED: inbound race skips because 0200 is absent')
else:
    require('PASS inbound-retry-race: client_a=10 client_b=10 claimed=20 final=succeeded:members_ignored_unbound:20' in inbound
            and 'CLEANUP inbound-retry-race: verified 0 retry rows' in inbound,
            'GREEN: two concurrent sweeps claim 20 rows once each and clean up')
claim = (out / '07b-claim-race.txt').read_text(encoding='utf-8')
require(claim_exit == '0' and 'overlap=0 claimed=20' in claim, 'outbound claim race unchanged: overlap 0')

ci = (out / '07c-ci-harness-tests.txt').read_text(encoding='utf-8')
require(ci_exit == '0' and re.search(r'^# fail 0$', ci, re.M), 'CI harness node tests pass')

root = ET.parse(out / '08-pytest-junit.xml').getroot()
cases = root.findall('.//testcase')
py_failed = [c.get('name') for c in cases if c.find('failure') is not None or c.find('error') is not None]
py_skipped = [c for c in cases if c.find('skipped') is not None]
require(not py_failed and py_exit == '0', f'Python: no failure or error ({len(cases)} cases)')
require(all('resolve_actor() is not installed' in (c.find('skipped').get('message') or '') for c in py_skipped),
        f'Python: every skip ({len(py_skipped)}) is the known resolve_actor() probe drift')
print(f'Python counts: {len(cases) - len(py_skipped)} passed, {len(py_skipped)} skipped, 0 failed')

clean = lambda name: '\n'.join(l for l in (out / name).read_text(encoding='utf-8').splitlines()
                               if not l.startswith('captured_utc:'))
require(clean('04-precheck.txt') == clean('04b-postcheck.txt'),
        'listed pre/post counters match excluding capture timestamp')
post = dict(line.split('|', 1) for line in clean('04b-postcheck.txt').splitlines()[1:] if '|' in line)
require(post.get('cron_jobs_inbound_retry') == '0' and post.get('cron_job_runs') == '0',
        'no cron job schedules the sweep and no cron job ran')
if mode == 'green':
    require(post.get('fn_rpc_line_inbound_retry_sweep') == '1' and post.get('rows_line_oa_inbound_retry') == '0',
            'GREEN: sweep present, retry table empty after the run')

teardown = (out / '09-teardown.txt').read_text(encoding='utf-8')
require('containers_present_after_removal: []' in teardown and 'network_present_after_removal: []' in teardown,
        'owned containers and network removed')
print(f'RESULT: P0-9 {mode.upper()} stage verified; Phase A remains EVIDENCE_INCOMPLETE; independent review pending')
