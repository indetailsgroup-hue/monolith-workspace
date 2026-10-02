"""Write the P0-9 mutants of migration 0200 for the evidence runner.

usage: line-p009-mutants.py <0200 migration> <output dir> <old race harness>

Each suite mutant is a full copy of 0200 with one deliberate defect; the
evidence run applies it inside a rolled-back transaction before the P0-9 suite
and expects at least the listed assertions to fail. Each race mutant replaces
only the sweep's claim clause; the run commits it and expects the two-client
race to fail. Every replacement must match exactly once, so a mutant can never
silently equal the real migration. Writes <name>.sql, <name>.diff and
mutants.json.
"""
from pathlib import Path
import difflib
import json
import sys

src = Path(sys.argv[1])
out = Path(sys.argv[2])
old_race = sys.argv[3]
real = src.read_bytes().decode('utf-8').replace('\r\n', '\n')

SUITE = [
    ('no_retry_dedupe', [8],
     'a redelivery of a queued event re-runs the handler',
     [("\n         or exists (select 1 from public.line_oa_inbound_retry q\n"
       "                    where q.webhook_event_id = v_webhook_event_id) then", " then")]),
    ('exit_after_queue', [30],
     'events after a failed one in the same delivery are dropped',
     [("            format('webhook_event_id:%s|line_group_id:%s|attempt:1', v_webhook_event_id, v_group_id),\n"
       "            v_actor\n          );\n",
       "            format('webhook_event_id:%s|line_group_id:%s|attempt:1', v_webhook_event_id, v_group_id),\n"
       "            v_actor\n          );\n          exit;\n")]),
    ('no_expiry', [31],
     'a stale row is replayed late',
     [("if v_row.created_at < now() - interval '10 minutes' then", "if false then")]),
    ('unique_violation_only', [32],
     'an uncaught error aborts the whole batch',
     [("      when others then\n        v_result := 'sweep_error:' || sqlstate || ' ' || sqlerrm;\n", "")]),
    ('no_already_ingested_check', [27],
     'the handler re-runs for an event another delivery already ingested',
     [("      if exists (select 1 from public.line_oa_inbound_messages m\n"
       "                 where m.webhook_event_id = v_row.webhook_event_id) then", "      if false then")]),
    ('utc_wall_time', [33],
     'received_at is shifted in a non-UTC session',
     [("v_row.payload, now(), 'group'", "v_row.payload, timezone('utc', now()), 'group'")]),
    ('keep_last_error', [19],
     'the old error text survives success',
     [("last_result = v_result, last_error = null, payload", "last_result = v_result, payload")]),
    ('no_fail_closed_check', [43, 46],
     'a privilege leaked through role membership is accepted',
     [("  if cardinality(v_problems) > 0 then", "  if false then")]),
    ('service_role_keeps_defaults', [38],
     'service_role keeps its default table privileges (fail-closed check also removed)',
     [("  foreach r in array array['anon', 'authenticated', 'service_role'] loop\n"
       "    if exists (select 1 from pg_roles where rolname = r) then\n"
       "      execute format('revoke all on public.line_oa_inbound_retry from %I', r);",
       "  foreach r in array array['anon', 'authenticated'] loop\n"
       "    if exists (select 1 from pg_roles where rolname = r) then\n"
       "      execute format('revoke all on public.line_oa_inbound_retry from %I', r);"),
      ("  if cardinality(v_problems) > 0 then", "  if false then")]),
]

start = real.index('create or replace function public.rpc_line_inbound_retry_sweep(')
end = real.index('$$;\n', start) + len('$$;\n')
sweep = real[start:end]
RACE = [
    ('race_for_update_only', 'new', 'fail', "     for update skip locked\n", "     for update\n"),
    ('race_no_claim_lock', 'new', 'fail', "     for update skip locked\n", ""),
    ('race_for_update_only_old_harness', 'old', 'pass', "     for update skip locked\n", "     for update\n"),
]


def mutate(text, edits, name):
    for old, new in edits:
        count = text.count(old)
        if count != 1:
            raise SystemExit(f'{name}: expected exactly one match, found {count}: {old[:60]!r}')
        text = text.replace(old, new)
    if text == real:
        raise SystemExit(f'{name}: mutant equals the real migration')
    return text


def write(name, text, base, base_name):
    (out / f'{name}.sql').write_bytes(text.encode('utf-8'))
    diff = difflib.unified_diff(base.splitlines(True), text.splitlines(True), base_name, f'{name}.sql')
    (out / f'{name}.diff').write_bytes(''.join(diff).encode('utf-8'))


out.mkdir(parents=True, exist_ok=False)
manifest = {'suite': [], 'race': []}
for name, killers, meaning, edits in SUITE:
    write(name, mutate(real, edits, name), real, src.name)
    manifest['suite'].append({'name': name, 'killers': killers, 'meaning': meaning})
for name, harness, expect, old, new in RACE:
    if sweep.count(old) != 1:
        raise SystemExit(f'{name}: claim clause not found exactly once')
    write(name, sweep.replace(old, new), sweep, 'rpc_line_inbound_retry_sweep (real)')
    manifest['race'].append({'name': name, 'harness': harness if harness == 'new' else old_race, 'expect': expect})
(out / 'real-sweep.sql').write_bytes(sweep.encode('utf-8'))
(out / 'mutants.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(f"wrote {len(SUITE)} suite mutants and {len(RACE)} race mutants to {out}")
