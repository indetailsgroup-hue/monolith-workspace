-- =============================================================================
-- 0192_capture_documents_domain_rls.sql
-- Phase 2 RLS — Capture / Documents domain — 7 tables (batch 6)
-- Tables: capture_artifact, capture_audit_log, capture_type_config,
--         contract_documents, customer_docs, document_links, form_templates
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. capture_artifact  (site_code → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists capture_artifact_sel on public.capture_artifact;

alter table public.capture_artifact
  add column if not exists org_id uuid;

update public.capture_artifact ca
set org_id = (
  select ip.org_id
  from public.installation_projects ip
  where ip.site_code = ca.site_code
  limit 1
)
where site_code is not null;
update public.capture_artifact
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.capture_artifact alter column org_id set not null;

create policy capture_artifact_tenant_isolation on public.capture_artifact
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 2. capture_audit_log  (backfill via capture_artifact_id → capture_artifact
--                         → site_code → installation_projects.org_id)
--    Governance sees all rows including those with null capture_artifact_id.
-- ---------------------------------------------------------------------------
drop policy if exists capture_audit_log_sel on public.capture_audit_log;

alter table public.capture_audit_log
  add column if not exists org_id uuid;

-- Temporarily suspend only the append-only trigger for this one-time schema
-- backfill. The table lock prevents concurrent application writes, and the
-- exception path restores immutability before propagating any failure.
do $capture_audit_org_backfill$
begin
  execute 'alter table public.capture_audit_log '
       || 'disable trigger trg_capture_audit_immutable';

  update public.capture_audit_log cal
  set org_id = (
    select ip.org_id
    from public.capture_artifact ca
    join public.installation_projects ip on ip.site_code = ca.site_code
    where ca.id = cal.capture_artifact_id
    limit 1
  )
  where capture_artifact_id is not null;

  update public.capture_audit_log
    set org_id = '00000000-0000-0000-0000-000000000000'::uuid
    where org_id is null;

  execute 'alter table public.capture_audit_log '
       || 'enable trigger trg_capture_audit_immutable';
exception
  when others then
    execute 'alter table public.capture_audit_log '
         || 'enable trigger trg_capture_audit_immutable';
    raise;
end
$capture_audit_org_backfill$;
alter table public.capture_audit_log alter column org_id set not null;

create policy capture_audit_log_tenant_isolation on public.capture_audit_log
  for select to authenticated
  using (org_id = public.get_user_org_id()
      or public.is_governance_role());

-- ---------------------------------------------------------------------------
-- 3. capture_type_config  (SENTINEL CONFIG — system-wide capture type registry)
-- ---------------------------------------------------------------------------
drop policy if exists capture_type_config_sel on public.capture_type_config;

alter table public.capture_type_config
  add column if not exists org_id uuid;

update public.capture_type_config
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.capture_type_config alter column org_id set not null;

create policy capture_type_config_tenant_isolation on public.capture_type_config
  for select to authenticated
  using (org_id = public.get_user_org_id()
      or org_id = '00000000-0000-0000-0000-000000000000'::uuid);

-- ---------------------------------------------------------------------------
-- 4. contract_documents  (project_id → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists contract_documents_sel on public.contract_documents;

alter table public.contract_documents
  add column if not exists org_id uuid;

update public.contract_documents cd
set org_id = (
  select ip.org_id
  from public.installation_projects ip
  where ip.id = cd.project_id
);
update public.contract_documents
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.contract_documents alter column org_id set not null;

create policy contract_documents_tenant_isolation on public.contract_documents
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 5. customer_docs  (SENTINEL CONFIG — static content / help docs)
-- ---------------------------------------------------------------------------
drop policy if exists customer_docs_sel on public.customer_docs;

alter table public.customer_docs
  add column if not exists org_id uuid;

update public.customer_docs
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.customer_docs alter column org_id set not null;

create policy customer_docs_tenant_isolation on public.customer_docs
  for select to authenticated
  using (org_id = public.get_user_org_id()
      or org_id = '00000000-0000-0000-0000-000000000000'::uuid);

-- ---------------------------------------------------------------------------
-- 6. document_links  (project_id → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists document_links_sel on public.document_links;

alter table public.document_links
  add column if not exists org_id uuid;

update public.document_links dl
set org_id = (
  select ip.org_id
  from public.installation_projects ip
  where ip.id = dl.project_id
);
update public.document_links
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.document_links alter column org_id set not null;

create policy document_links_tenant_isolation on public.document_links
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 7. form_templates  (SENTINEL CONFIG — shared form definitions)
--    Only replace the SELECT policy; ins/upd governance policies remain.
-- ---------------------------------------------------------------------------
drop policy if exists form_templates_sel on public.form_templates;

alter table public.form_templates
  add column if not exists org_id uuid;

-- Published templates are immutable for application traffic. Suspend only
-- that business trigger for the tenant-key backfill; keep constraint and
-- unrelated triggers active, and restore immutability on every exit path.
do $form_templates_org_backfill$
begin
  execute 'alter table public.form_templates '
       || 'disable trigger trg_form_templates_immutable';

  update public.form_templates
    set org_id = '00000000-0000-0000-0000-000000000000'::uuid
    where org_id is null;

  execute 'alter table public.form_templates '
       || 'enable trigger trg_form_templates_immutable';
exception
  when others then
    execute 'alter table public.form_templates '
         || 'enable trigger trg_form_templates_immutable';
    raise;
end
$form_templates_org_backfill$;
alter table public.form_templates alter column org_id set not null;

create policy form_templates_tenant_isolation on public.form_templates
  for select to authenticated
  using (org_id = public.get_user_org_id()
      or org_id = '00000000-0000-0000-0000-000000000000'::uuid);
