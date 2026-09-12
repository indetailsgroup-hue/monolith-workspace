-- Minimal dependency fixture for the real TPC migrations in an EMPTY test DB.
-- This does not replace full Supabase migration-chain acceptance.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;

CREATE TABLE public.organizations (org_id uuid PRIMARY KEY, plan text NOT NULL);
CREATE TABLE public.org_members (
  org_id uuid NOT NULL REFERENCES public.organizations(org_id),
  user_id uuid NOT NULL, role text NOT NULL, is_active boolean NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
GRANT SELECT ON public.organizations, public.org_members TO authenticated;

INSERT INTO public.organizations VALUES
 ('10000000-0000-0000-0000-000000000001', 'PROFESSIONAL'),
 ('20000000-0000-0000-0000-000000000001', 'PROFESSIONAL');
INSERT INTO public.org_members VALUES
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000011','ADMIN',true),
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000012','MEMBER',true),
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000013','MEMBER',false),
 ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000011','ADMIN',true),
 ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000012','MEMBER',true);
