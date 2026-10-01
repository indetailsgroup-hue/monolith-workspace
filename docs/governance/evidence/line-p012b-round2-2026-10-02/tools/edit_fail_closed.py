"""Apply the round-2 edits to supabase/tests/line_oa_definer_execute_fail_closed.sql.
Each replacement must match exactly once. usage: python edit_fail_closed.py <repo>"""
import sys
from pathlib import Path

p = Path(sys.argv[1]) / "supabase/tests/line_oa_definer_execute_fail_closed.sql"
s = p.read_text(encoding="utf-8")
BS = "\\"


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (old[:70], n)
    s = s.replace(old, new)


rep("own revokes must not persist. It never grants or changes memberships.",
    "own revokes must not persist. It never grants or changes memberships.\n"
    "-- Atomicity of the failing DO block is PostgreSQL statement semantics; the\n"
    "-- \"after the error\" assertions confirm that, once the case savepoint is\n"
    "-- rolled back, every privilege fact equals the pre-state (no change escapes\n"
    "-- the failed statement), not the atomicity itself.")
rep("select plan(23);", "select plan(27);")
rep("coalesce(p.proacl::text, '<default>'), E'" + BS + "n' order by 1)",
    "coalesce(p.proacl::text, '<default>'), E'" + BS + "n'\n"
    "                       order by p.oid::regprocedure::text)")
rep("m.roleid::regrole::text, E'" + BS + "n' order by 1)",
    "m.roleid::regrole::text, E'" + BS + "n'\n"
    "                       order by m.member::regrole::text, m.roleid::regrole::text)")
for C in "ABCD":
    rep(f"'case {C}: after the error every function ACL and membership is exactly as before'",
        f"'case {C}: after the error and the case savepoint rollback, every function ACL and membership equals the pre-state'")
for C in "ABC":
    rep(f"'case {C}: the direct EXECUTE that 0199 revoked on rpc_sync_line_forecast is back after the error'",
        f"'case {C}: after the savepoint rollback the direct anon EXECUTE on rpc_sync_line_forecast is present again'")
rep("'case D: the direct anon EXECUTE on rpc_sync_line_forecast is untouched'",
    "'case D: after the savepoint rollback the direct anon EXECUTE on rpc_sync_line_forecast is present'")

CASE_F = """-- ---------------------------------------------------------------------------
-- Case F (22-25): a matrix identity is missing (renamed away), so 0199 stops
-- with 55000 before it revokes anything.
-- ---------------------------------------------------------------------------
savepoint p012_case_f;
alter function public.rpc_sync_line_forecast(text, text, text) rename to rpc_sync_line_forecast_p012_hidden;
select pg_temp.p012_state() as case_f_before,
       to_regprocedure('public.rpc_sync_line_forecast(text,text,text)') is null
       and to_regprocedure('public.rpc_sync_line_forecast_p012_hidden(text,text,text)') is not null as case_f_pre @gset
savepoint p012_case_f_migration;
@set ON_ERROR_STOP off
@ir :p012_migration
@set case_f_error :ERROR
@set case_f_sqlstate :SQLSTATE
@if :case_f_error
  @set case_f_message :LAST_ERROR_MESSAGE
  rollback to savepoint p012_case_f_migration;
@else
  @set case_f_message ''
@endif
@set ON_ERROR_STOP on
select pg_temp.p012_state() as case_f_after @gset
rollback to savepoint p012_case_f;
release savepoint p012_case_f;

select ok(:'case_f_pre'::boolean,
  'case F precondition: rpc_sync_line_forecast(text,text,text) is renamed away, so one matrix identity is missing');
select is(:'case_f_sqlstate'::text, '55000'::text, 'case F: the migration raises SQLSTATE 55000 for a missing matrix identity');
select ok(:'case_f_message' like 'B12: matrix identity missing%' and :'case_f_message' like '%rpc_sync_line_forecast(text,text,text)%',
  'case F: the message starts with "B12: matrix identity missing" and names rpc_sync_line_forecast(text,text,text)');
select is(:'case_f_after'::text, :'case_f_before'::text,
  'case F: after the error and the case savepoint rollback, every function ACL and membership equals the pre-state');

-- ---------------------------------------------------------------------------
-- Case E (26-27): nothing blocks, so the migration completes and restores the""".replace("@", BS)
rep("""-- ---------------------------------------------------------------------------
-- Case E (22-23): nothing blocks, so the migration completes and restores the""", CASE_F)
p.write_text(s, encoding="utf-8", newline="\n")
print("edited", p)
