-- Issue the top-level org_id required by the existing 0180 identity guard.
-- Supabase Auth invokes this hook before issuing or refreshing access tokens.
-- Hosted projects must separately enable this function as their Custom Access
-- Token hook; config.toml enables the same implementation for local Supabase.
BEGIN;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claims jsonb := (event -> 'claims') - 'org_id';
  selected_org uuid;
  event_user uuid;
  token_subject uuid;
BEGIN
  -- Always remove a prior claim, including when a refreshed selection is no
  -- longer valid. Preserve login for users without an eligible organization;
  -- org-scoped RPCs will continue to reject their missing claim.
  BEGIN
    selected_org := (claims #>> '{app_metadata,org_id}')::uuid;
    event_user := (event ->> 'user_id')::uuid;
    token_subject := (claims ->> 'sub')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_set(event, '{claims}', claims);
  END;

  IF event_user = token_subject AND selected_org IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.org_members AS member
    JOIN public.organizations AS organization ON organization.org_id = member.org_id
    WHERE member.user_id = event_user
      AND member.org_id = selected_org
      AND member.is_active = true
  ) THEN
    claims := jsonb_set(claims, '{org_id}', to_jsonb(selected_org::text));
  END IF;

  -- No role changes, user_metadata authority, or automatic tenant selection.
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

COMMIT;
