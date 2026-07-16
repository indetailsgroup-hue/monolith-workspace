-- Disposable bootstrap for the S17 0162 migration dry-run.
-- This file creates only the Supabase roles/helper required by migrations 0155-0161.
-- It MUST run inside the transaction opened by dry-run-bootstrap.sql.

do $bootstrap$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$bootstrap$;

create or replace function public.fn_is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
    or current_user = 'postgres';
$$;
