-- Rollback: 0189_line_oa_domain_rls
-- CI idempotency testing ONLY. DATA LOSS: drops org_id columns.
-- NEVER apply to production.
--
-- Reverses 0189 in four steps:
--   (1) DROP *_tenant_isolation SELECT policies (the 11 policies added by 0189)
--   (2) RE-CREATE old site_code/is_governance_role/using-true SELECT policies
--       (restored from 00000000000004_line_oa_rls.sql and 0095_line_groups_identity.sql)
--       Including SELECT + INSERT + UPDATE policies for line_groups and line_bind_codes.
--   (3) DROP NOT NULL constraints on org_id columns
--   (4) DROP org_id columns — DATA LOSS, CI only
-- Note: does NOT reverse ALTER TABLE ENABLE ROW LEVEL SECURITY;
--       RLS was already enabled on these tables before 0189.

-- =============================================================================
-- (1) DROP *_tenant_isolation SELECT policies
-- =============================================================================
DROP POLICY IF EXISTS line_groups_tenant_isolation               ON public.line_groups;
DROP POLICY IF EXISTS line_group_members_tenant_isolation        ON public.line_group_members;
DROP POLICY IF EXISTS line_bind_codes_tenant_isolation           ON public.line_bind_codes;
DROP POLICY IF EXISTS line_oa_conversations_tenant_isolation     ON public.line_oa_conversations;
DROP POLICY IF EXISTS line_oa_inbound_messages_tenant_isolation  ON public.line_oa_inbound_messages;
DROP POLICY IF EXISTS line_oa_outbound_messages_tenant_isolation ON public.line_oa_outbound_messages;
DROP POLICY IF EXISTS line_oa_customer_identity_tenant_isolation ON public.line_oa_customer_identity;
DROP POLICY IF EXISTS line_oa_message_templates_tenant_isolation ON public.line_oa_message_templates;
DROP POLICY IF EXISTS line_oa_channels_tenant_isolation          ON public.line_oa_channels;
DROP POLICY IF EXISTS line_oa_orders_tenant_isolation            ON public.line_oa_orders;
DROP POLICY IF EXISTS line_oa_audit_log_tenant_isolation         ON public.line_oa_audit_log;

-- =============================================================================
-- (2) RESTORE old policies
--     Mirrors original policies from source migrations
-- =============================================================================

-- From 00000000000004_line_oa_rls.sql ─────────────────────────────────────────
CREATE POLICY line_oa_channels_select ON public.line_oa_channels
  FOR SELECT TO authenticated
  USING (public.is_governance_role());

CREATE POLICY line_oa_conversations_select ON public.line_oa_conversations
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY line_oa_inbound_messages_select ON public.line_oa_inbound_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.line_oa_conversations c
       WHERE c.id = conversation_id
         AND (public.is_governance_role() OR public.has_site_access(c.site_code))
    )
  );

CREATE POLICY line_oa_outbound_messages_select ON public.line_oa_outbound_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.line_oa_conversations c
       WHERE c.id = conversation_id
         AND (public.is_governance_role() OR public.has_site_access(c.site_code))
    )
  );

CREATE POLICY line_oa_customer_identity_select ON public.line_oa_customer_identity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.line_oa_conversations c
       WHERE c.line_user_id = line_user_id
         AND (public.is_governance_role() OR public.has_site_access(c.site_code))
    )
  );

CREATE POLICY line_oa_message_templates_select ON public.line_oa_message_templates
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY line_oa_orders_select ON public.line_oa_orders
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY line_oa_audit_log_select ON public.line_oa_audit_log
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

-- From 0095_line_groups_identity.sql ──────────────────────────────────────────
CREATE POLICY line_groups_sel ON public.line_groups
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY line_groups_ins ON public.line_groups
  FOR INSERT TO authenticated
  WITH CHECK (public.is_governance_role() OR public.has_site_access(
    (SELECT ip.site_code FROM public.installation_projects ip WHERE ip.id = project_id)
  ));

CREATE POLICY line_groups_upd ON public.line_groups
  FOR UPDATE TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY line_group_members_sel ON public.line_group_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.line_groups lg
       WHERE lg.id = group_id
         AND (public.is_governance_role() OR public.has_site_access(lg.site_code))
    )
  );

CREATE POLICY line_bind_codes_sel ON public.line_bind_codes
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(
    (SELECT ip.site_code FROM public.installation_projects ip WHERE ip.id = project_id)
  ));

CREATE POLICY line_bind_codes_ins ON public.line_bind_codes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_governance_role() OR public.has_site_access(
    (SELECT ip.site_code FROM public.installation_projects ip WHERE ip.id = project_id)
  ));

-- =============================================================================
-- (3) DROP NOT NULL constraints on org_id
-- =============================================================================
ALTER TABLE public.line_groups               ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.line_group_members        ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.line_bind_codes           ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.line_oa_conversations     ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.line_oa_inbound_messages  ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.line_oa_outbound_messages ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.line_oa_customer_identity ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.line_oa_message_templates ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.line_oa_channels          ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.line_oa_orders            ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.line_oa_audit_log         ALTER COLUMN org_id DROP NOT NULL;

-- =============================================================================
-- (4) DROP org_id columns — DATA LOSS; CI idempotency only
-- =============================================================================
ALTER TABLE public.line_groups               DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.line_group_members        DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.line_bind_codes           DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.line_oa_conversations     DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.line_oa_inbound_messages  DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.line_oa_outbound_messages DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.line_oa_customer_identity DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.line_oa_message_templates DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.line_oa_channels          DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.line_oa_orders            DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.line_oa_audit_log         DROP COLUMN IF EXISTS org_id;
