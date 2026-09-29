-- The hook issues only the existing top-level org claim; it never adds roles
-- or chooses a tenant when the server-managed selection is missing/invalid.
BEGIN;
SELECT plan(15);

INSERT INTO public.organizations (org_id, name, slug) VALUES
 ('a0250000-0000-0000-0000-000000000001', 'Hook A', 'pgtap-hook-a'),
 ('b0250000-0000-0000-0000-000000000002', 'Hook B', 'pgtap-hook-b');
INSERT INTO auth.users (id, email) VALUES
 ('a0250000-0000-0000-0000-000000000011', 'active@hook.test'),
 ('a0250000-0000-0000-0000-000000000012', 'inactive@hook.test');
INSERT INTO public.org_members (user_id, org_id, email, role, is_active) VALUES
 ('a0250000-0000-0000-0000-000000000011', 'a0250000-0000-0000-0000-000000000001', 'active@hook.test', 'FINANCE', true),
 ('a0250000-0000-0000-0000-000000000012', 'a0250000-0000-0000-0000-000000000001', 'inactive@hook.test', 'VIEWER', false);

CREATE FUNCTION public._t20270325_event(p_user text, p_org text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('user_id', p_user, 'authentication_method', 'password',
    'claims', jsonb_build_object('sub', p_user, 'role', 'authenticated',
      'iss', 'http://local-test/auth/v1', 'aud', 'authenticated', 'aal', 'aal1',
      'iat', 1789170000, 'exp', 1789173600,
      'session_id', 'a0250000-0000-0000-0000-000000000031',
      'email', 'synthetic@hook.test', 'phone', '', 'is_anonymous', false,
      'app_metadata', jsonb_build_object('org_id', p_org, 'roles', jsonb_build_array('finance')),
      'user_metadata', jsonb_build_object('display_name', 'Synthetic fixture')));
$$;
GRANT EXECUTE ON FUNCTION public._t20270325_event(text, text) TO supabase_auth_admin;

SELECT ok(NOT has_function_privilege('anon', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'), 'Anonymous cannot execute the hook');
SELECT ok(NOT has_function_privilege('authenticated', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'), 'Authenticated clients cannot execute the hook');
SELECT ok(NOT has_function_privilege('service_role', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'), 'Service-role clients do not inherit hook execution from default privileges');
SELECT ok(has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'), 'Auth service can execute the hook');

SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.custom_access_token_hook('{}'::jsonb) $$, '42501', NULL, 'Anonymous direct call is denied');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.custom_access_token_hook('{}'::jsonb) $$, '42501', NULL, 'Authenticated direct call is denied');
RESET ROLE;
SET LOCAL ROLE supabase_auth_admin;

SELECT is(public.custom_access_token_hook(public._t20270325_event('a0250000-0000-0000-0000-000000000011', 'a0250000-0000-0000-0000-000000000001')) #>> '{claims,org_id}',
  'a0250000-0000-0000-0000-000000000001', 'Active selected membership receives the top-level org claim');
SELECT is(public.custom_access_token_hook(public._t20270325_event('a0250000-0000-0000-0000-000000000011', 'a0250000-0000-0000-0000-000000000001')) #- '{claims,org_id}',
  public._t20270325_event('a0250000-0000-0000-0000-000000000011', 'a0250000-0000-0000-0000-000000000001'), 'All other claims and event fields are preserved, including role metadata');
SELECT is(public.custom_access_token_hook(public._t20270325_event('a0250000-0000-0000-0000-000000000011', 'b0250000-0000-0000-0000-000000000002')) #>> '{claims,org_id}',
  NULL, 'Foreign organization without membership receives no claim');
SELECT is(public.custom_access_token_hook(public._t20270325_event('a0250000-0000-0000-0000-000000000012', 'a0250000-0000-0000-0000-000000000001')) #>> '{claims,org_id}',
  NULL, 'Inactive membership receives no claim');
SELECT is(public.custom_access_token_hook(public._t20270325_event('a0250000-0000-0000-0000-000000000011', 'malformed-org')) #>> '{claims,org_id}',
  NULL, 'Malformed org selection does not interrupt sign-in and receives no claim');
SELECT is(public.custom_access_token_hook(jsonb_set(public._t20270325_event('a0250000-0000-0000-0000-000000000011', 'a0250000-0000-0000-0000-000000000001'), '{claims,sub}', '"a0250000-0000-0000-0000-000000000012"')) #>> '{claims,org_id}',
  NULL, 'Event user must match the token subject');
SELECT is(public.custom_access_token_hook(jsonb_set(public._t20270325_event('a0250000-0000-0000-0000-000000000011', NULL), '{claims,user_metadata,org_id}', '"a0250000-0000-0000-0000-000000000001"')) #>> '{claims,org_id}',
  NULL, 'User-editable metadata cannot supply tenant authority or trigger a fallback');
SELECT is(public.custom_access_token_hook(jsonb_set(public._t20270325_event('a0250000-0000-0000-0000-000000000011', 'b0250000-0000-0000-0000-000000000002'), '{claims,org_id}', '"a0250000-0000-0000-0000-000000000001"')) #>> '{claims,org_id}',
  NULL, 'A stale top-level claim is removed when the selected membership is invalid');
SELECT is(public.custom_access_token_hook(jsonb_set(public._t20270325_event('a0250000-0000-0000-0000-000000000011', 'a0250000-0000-0000-0000-000000000001'), '{authentication_method}', '"token_refresh"')) #>> '{claims,org_id}',
  'a0250000-0000-0000-0000-000000000001', 'Token refresh revalidates and retains an active selection');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
