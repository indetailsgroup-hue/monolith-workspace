-- =============================================================================
-- 0192_rollback.sql
-- CI idempotency rollback for 0192_capture_documents_domain_rls.sql
-- NEVER apply to production — for forward-and-back CI testing only
-- =============================================================================

-- 7. form_templates (restore SELECT-only; ins/upd stay untouched)
drop policy if exists form_templates_tenant_isolation on public.form_templates;
alter table public.form_templates drop column if exists org_id;
create policy form_templates_sel on public.form_templates
  for select to authenticated using (true);

-- 6. document_links
drop policy if exists document_links_tenant_isolation on public.document_links;
alter table public.document_links drop column if exists org_id;
create policy document_links_sel on public.document_links
  for select to authenticated
  using (exists (
    select 1 from public.installation_projects p where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code))));

-- 5. customer_docs
drop policy if exists customer_docs_tenant_isolation on public.customer_docs;
alter table public.customer_docs drop column if exists org_id;
create policy customer_docs_sel on public.customer_docs
  for select to authenticated using (true);

-- 4. contract_documents
drop policy if exists contract_documents_tenant_isolation on public.contract_documents;
alter table public.contract_documents drop column if exists org_id;
create policy contract_documents_sel on public.contract_documents
  for select to authenticated
  using (exists (
    select 1 from public.installation_projects p where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

-- 3. capture_type_config
drop policy if exists capture_type_config_tenant_isolation on public.capture_type_config;
alter table public.capture_type_config drop column if exists org_id;
create policy capture_type_config_sel on public.capture_type_config
  for select to authenticated using (true);

-- 2. capture_audit_log
drop policy if exists capture_audit_log_tenant_isolation on public.capture_audit_log;
alter table public.capture_audit_log drop column if exists org_id;
create policy capture_audit_log_sel on public.capture_audit_log
  for select to authenticated
  using (
    public.is_governance_role()
    or exists (
      select 1 from public.capture_artifact a
      where a.id = capture_audit_log.capture_artifact_id
        and public.has_site_access(a.site_code)
    )
  );

-- 1. capture_artifact
drop policy if exists capture_artifact_tenant_isolation on public.capture_artifact;
alter table public.capture_artifact drop column if exists org_id;
create policy capture_artifact_sel on public.capture_artifact
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code));
