-- Fail closed unless the target is a schema at migration 0161 (before 0162).
-- This file MUST run inside a disposable/non-production transaction.

do $preflight$
begin
  if to_regclass('public.factory_jobs') is null
     or to_regclass('public.factory_job_events') is null then
    raise exception 'S17_PREFLIGHT_FAIL: factory tables are missing; target is not at 0161';
  end if;

  if to_regprocedure('public.rpc_factory_job_transition(text,text,text,text,text,text)') is null
     or to_regprocedure('public.rpc_factory_job_record_packet(text,text,text,text,text,text)') is null
     or to_regprocedure('public.rpc_factory_job_verify_result(text,text,text,text,text)') is null then
    raise exception 'S17_PREFLIGHT_FAIL: one or more legacy 0161 RPC signatures are missing';
  end if;

  if to_regprocedure('public.rpc_factory_job_transition(text,text,text,text[],text[],text,text,text,text,text)') is not null
     or exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'factory_jobs'
         and column_name = 'actor_subject_id'
     ) then
    raise exception 'S17_PREFLIGHT_FAIL: 0162 appears applied or partially applied';
  end if;
end
$preflight$;
