test -f supabase/migrations/0189_repair_phase0_organization_scope.sql
test -f supabase/migrations/0190_repair_phase0_legacy_containment.sql
test -f supabase/migrations/0191_repair_phase0_revoke_legacy_mutation_authority.sql
test -f supabase/migrations/0192_repair_phase0_consume_org_recheck.sql
psql "postgresql://postgres@127.0.0.1:55450/postgres" -tAc "select 1 from pg_tables where schemaname='public' and tablename='monolith_organization'" | grep -q 1
# The legacy state-transition authority must not be executable by service_role.
psql "postgresql://postgres@127.0.0.1:55450/postgres" -tAc "select has_function_privilege('service_role','public.rpc_factory_job_transition(text,text,text,text[],text[],text,text,text,text,text)','EXECUTE')" | grep -qx f
