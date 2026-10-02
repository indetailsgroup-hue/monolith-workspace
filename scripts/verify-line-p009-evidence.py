"""Verify one P0-9 evidence bundle written by scripts/run-line-p009-evidence.sh.

usage: verify-line-p009-evidence.py <out> <red|green|mutants> [--recheck]
Exit codes are read from the name=value lines of <out>/00-context.txt.
Generated credentials arrive only through P009_SCAN_* environment variables.

The runner calls it once, at the commit that produced the bundle, with the
generated credentials (10-verification.txt records that run). --recheck lets a
reviewer repeat every other check later: the bundle head_sha must be an
ancestor of HEAD, SHA256SUMS must hold, and source-SHA256SUMS must match the
blobs at head_sha; the credential scan is skipped because the per-run
credentials no longer exist.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

out = Path(sys.argv[1])
mode = sys.argv[2]
recheck = '--recheck' in sys.argv[3:]
PLAN = 53
PY_CASES = 106
SUITE_MUTANTS = 14
RED_PASSING = {7, 39, 40, 41, 48}
KNOWN_SKIPS = ('public.resolve_actor() is not installed', 'public.record_input_sync(')


def require(value, message):
    if not value:
        raise AssertionError(message)
    print('PASS:', message)


def read(name):
    return (out / name).read_text(encoding='utf-8')


context = read('00-context.txt')
codes = dict(re.findall(r'^([a-z0-9_]+)=(-?\d+)$', context, re.M))


def code(name):
    if name not in codes:
        raise AssertionError(f'exit code {name} not recorded')
    return codes[name]


# --- provenance and credentials -------------------------------------------------
head = subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
bundle_head = re.search(r'^head_sha: ([0-9a-f]{40})$', context, re.M).group(1)
require('uncommitted_changes_in_code_under_test: [] (empty = clean)' in context, 'code under test was clean')
if not recheck:
    require(bundle_head == head, f'bundle was produced at the current HEAD {head[:9]}')
    secrets = [os.environ[k].encode() for k in ('P009_SCAN_PW', 'P009_SCAN_JWT', 'P009_SCAN_ANON', 'P009_SCAN_SERVICE')]
    require(all(len(s) > 20 for s in secrets), 'generated credential inputs supplied')

    def hits(data):
        return any(s in data for s in secrets)

    require(hits(b'control=' + secrets[0]), 'credential scanner positive control detects a generated credential')
    files = [p for p in out.rglob('*') if p.is_file()]
    found = [str(p.relative_to(out)) for p in files if hits(p.read_bytes())]
    require(not found, f'no generated credential bytes in {len(files)} captured files (findings={found!r})')
else:
    ancestor = subprocess.run(['git', 'merge-base', '--is-ancestor', bundle_head, 'HEAD']).returncode == 0
    require(ancestor, f'recheck: bundle head {bundle_head[:9]} is an ancestor of HEAD {head[:9]}')
    sums = [line.split('  ', 1) for line in read('SHA256SUMS').splitlines() if line]
    require(all(hashlib.sha256((out / name).read_bytes()).hexdigest() == digest for digest, name in sums),
            f'recheck: all {len(sums)} SHA256SUMS entries match')
    sources = [line.split('  ', 1) for line in read('source-SHA256SUMS').splitlines() if line]
    mismatched = [name for digest, name in sources
                  if hashlib.sha256(subprocess.run(['git', '-c', 'core.longpaths=true', 'show', f'{bundle_head}:{name}'],
                                                   capture_output=True, check=True).stdout).hexdigest() != digest]
    require(not mismatched, f'recheck: all {len(sources)} source hashes match the blobs at {bundle_head[:9]} ({mismatched})')
    print('SKIP: credential scan (the per-run generated credentials no longer exist; recorded in 10-verification.txt)')

migrations = read('02-migrations-applied.txt').splitlines()
skipped = [line for line in migrations if line.startswith('skip ')]
require(not any(line.startswith('FAIL') for line in migrations), 'every applied migration succeeded')
if mode == 'green':
    require(not skipped and migrations[-1].endswith('0200_line_inbound_handler_retry.sql'),
            'GREEN applied the whole chain ending at 0200')
else:
    require(len(skipped) == 1 and '0200_line_inbound_handler_retry.sql' in skipped[0],
            f'{mode.upper()} skipped exactly 0200')


# --- TAP helpers ----------------------------------------------------------------
def tap_results(name):
    tap = read(name)
    results = [(state, int(n)) for state, n in re.findall(r'^(not ok|ok) (\d+)(?:\s|$)', tap, re.M)]
    complete = bool(re.search(rf'^1\.\.{PLAN}$', tap, re.M)) and [n for _, n in results] == list(range(1, PLAN + 1))
    return tap, complete, {n for state, n in results if state == 'not ok'}


def outcomes(path):
    tree = ET.parse(path).getroot()
    result = {}
    for c in tree.findall('.//testcase'):
        if c.find('failure') is not None or c.find('error') is not None:
            state = 'failed'
        elif c.find('skipped') is not None:
            state = 'skipped'
        else:
            state = 'passed'
        result[(c.get('classname'), c.get('name'))] = state
    return result


if mode in ('red', 'green'):
    require(code('p009_pgtap_exit') == '0', 'P0-9 suite psql exit 0 (failures are reported in TAP, not by psql)')
    tap, complete, failed = tap_results('05-p009-pgtap.tap')
    require(complete, f'TAP plan 1..{PLAN} with {PLAN} results in order')
    if mode == 'red':
        require(failed == set(range(1, PLAN + 1)) - RED_PASSING,
                f'RED: every assertion fails except {sorted(RED_PASSING)} (failed={sorted(failed)})')
        first = tap.split('not ok 1 - ', 1)[1].split('\nnot ok 2 - ', 1)[0]
        require('"events_processed": 1' in first,
                'RED assertion 1 reproduces B8: the failed handler was counted as processed')
    else:
        require(not failed, f'GREEN: all {PLAN} assertions pass')

    verdicts = {}
    for res in sorted((out / '06-suite-loop').glob('*.result.json')):
        data = json.loads(res.read_text(encoding='utf-8'))
        verdicts[data['suite']] = data['pass']
    require(len(verdicts) == 15, f'fifteen suite verdicts recorded ({len(verdicts)})')
    loop_failed = sorted(s for s, ok in verdicts.items() if not ok)
    expected_failed = (['line_inbound_handler_retry', 'repair_phase0_containment'] if mode == 'red'
                       else ['repair_phase0_containment'])
    require(loop_failed == expected_failed,
            f'suite loop fails exactly {expected_failed} (known 0170 dependency; failed={loop_failed})')
    require(code('suite_loop_exit') == '1', 'suite loop exit 1 agrees with the recorded failures')

    race = read('07a-inbound-retry-race.txt')
    race_required = read('07a-inbound-retry-race-required.txt')
    if mode == 'red':
        require(code('inbound_retry_race_exit') == '0'
                and 'SKIP inbound-retry-race: requires pre-applied migration 0200' in race,
                'RED: the inbound race skips by default because 0200 is absent')
        require(code('inbound_retry_race_required_exit') != '0'
                and 'migration 0200 is required (LINE_RACE_REQUIRE=1) but absent' in race_required,
                'RED: with LINE_RACE_REQUIRE=1 (as in CI) the missing sweep fails the race')
    else:
        for label, text, name in (('default', race, 'inbound_retry_race_exit'),
                                  ('required', race_required, 'inbound_retry_race_required_exit')):
            require(code(name) == '0'
                    and 'PASS inbound-retry-race: client_a=10 client_b=10 final=succeeded:members_ignored_unbound:20 overlap=proven' in text
                    and 'CLEANUP inbound-retry-race: verified 0 retry rows' in text,
                    f'GREEN ({label}): B swept 10 other rows while A held its 10 locks, without waiting; cleanup verified')
    claim = read('07b-claim-race.txt')
    require(code('claim_race_exit') == '0' and 'overlap=0 claimed=20' in claim, 'outbound claim race unchanged: overlap 0')

    ci = read('07c-ci-harness-tests.txt')
    require(code('ci_harness_tests_exit') == '0' and re.search(r'^# fail 0$', ci, re.M), 'CI harness node tests pass')

    py = outcomes(out / '08-pytest-junit.xml')
    py_failed = [k for k, v in py.items() if v == 'failed']
    require(len(py) == PY_CASES and not py_failed and code('pytest_exit') == '0',
            f'Python: all {PY_CASES} cases ran with no failure or error ({len(py)} cases)')
    root = ET.parse(out / '08-pytest-junit.xml').getroot()
    skips = [c.find('skipped').get('message') or '' for c in root.findall('.//testcase') if c.find('skipped') is not None]
    require(all(any(k in m for k in KNOWN_SKIPS) for m in skips),
            f'Python: every skip ({len(skips)}) is a known pre-existing probe gap {KNOWN_SKIPS}')
    print(f'Python counts: {sum(v == "passed" for v in py.values())} passed, {len(skips)} skipped, 0 failed')
    if mode == 'green':
        compare = re.search(r'^compare_red: (.+)$', context, re.M)
        require(compare is not None, 'GREEN names the RED bundle to compare with')
        red_context = (Path(compare.group(1)) / '00-context.txt').read_text(encoding='utf-8')
        require('verification_exit=0' in red_context, 'the RED bundle compared with was itself verified')
        red = outcomes(Path(compare.group(1)) / '08-pytest-junit.xml')
        require(red == py, f'Python: every test has the same outcome as {Path(compare.group(1)).name} (no regression)')

if mode == 'mutants':
    require(code('mutants_generator_exit') == '0', 'mutant generator succeeded')
    manifest = json.loads(read('mutants/mutants.json'))
    require(len(manifest['suite']) == SUITE_MUTANTS and len(manifest['race']) == 3,
            f'{SUITE_MUTANTS} suite mutants and three race mutants')
    require(code('suite_real_exit') == '0', 'control: suite psql exit 0 with the real 0200')
    _, complete, failed = tap_results('06-suite-real.tap')
    require(complete and not failed, f'control: the real 0200 passes all {PLAN} assertions')
    for m in manifest['suite']:
        name, killers = m['name'], set(m['killers'])
        _, complete, failed = tap_results(f'06-suite-{name}.tap')
        require(code(f'suite_{name}_exit') == '0' and complete, f'{name}: suite ran to completion')
        require(killers <= failed,
                f'{name} ({m["meaning"]}) is killed by {sorted(killers)} (all failing: {sorted(failed)})')
    require(code('apply_real_0200_exit') == '0', 'real 0200 committed for the race section')
    for m in manifest['race']:
        name = m['name']
        text = read(f'07-race-{name}.txt')
        require(code(f'apply_{name}_exit') == '0', f'{name}: sweep mutant applied')
        if m['expect'] == 'fail':
            require(code(f'race_{name}_exit') != '0' and 'lock timeout' in text,
                    f'{name}: the race fails with a lock timeout (client B would have waited for A)')
        else:
            require(code(f'race_{name}_exit') == '0' and 'PASS inbound-retry-race' in text,
                    f'{name}: the earlier harness (0a355e29b) still passes this mutant - the weakness fixed here')
    real = read('07-race-real.txt')
    require(code('apply_real_sweep_exit') == '0' and code('race_real_exit') == '0' and 'overlap=proven' in real,
            'control: the real sweep passes the race with proven overlap')

# --- pre/post state, cron, teardown --------------------------------------------
def counters(name):
    lines = [l for l in read(name).splitlines() if '|' in l]
    return dict(l.split('|', 1) for l in lines)


pre, post = counters('04-precheck.txt'), counters('04b-postcheck.txt')
schema_keys = {'fn_rpc_line_inbound_retry_sweep', 'tbl_line_oa_inbound_retry', 'rows_line_oa_inbound_retry'}
require(len(pre) == 16 and pre.keys() == post.keys(), 'sixteen pre/post counters captured')
if mode == 'mutants':
    require({k: v for k, v in pre.items() if k not in schema_keys} == {k: v for k, v in post.items() if k not in schema_keys},
            'pre/post counters match except the 0200 objects committed for the race section')
else:
    require(pre == post, 'pre/post counters match')
require(post.get('cron_jobs_inbound_retry') == '0' and post.get('cron_job_runs') == '0',
        'no cron job schedules the sweep and no cron job ran')
if mode != 'red':
    require(post.get('fn_rpc_line_inbound_retry_sweep') == '1' and post.get('rows_line_oa_inbound_retry') == '0',
            'sweep present and retry table empty after the run')

teardown = read('09-teardown.txt')
require('containers_present_after_removal: []' in teardown and 'network_present_after_removal: []' in teardown,
        'owned containers and network removed')
print(f'RESULT: P0-9 {mode.upper()} stage verified; Phase A remains EVIDENCE_INCOMPLETE; independent review pending')
