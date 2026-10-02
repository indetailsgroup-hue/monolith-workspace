-- Service bootstrap for the throwaway step 1 stack (attempt 2).
-- Mirrors the role-password part of Supabase's docker roles.sql so the auth
-- (GoTrue) and storage-api containers can connect and run their OWN migrations.
-- No schema object is created here. The password arrives as the psql variable
-- :pw at run time and is never written to disk.
alter role supabase_auth_admin with login password :'pw';
alter role supabase_storage_admin with login password :'pw';
