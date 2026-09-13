-- R1 local review branch: organization attribution repair.
-- Regression baseline 5565e9c, ephemeral CI run 34705445001: 60 field tests ran,
-- 49 failed; existing migration/test suites retained. Hosted application requires
-- its separate release process. This change is staged for draft PR review only.
-- R1 field writes: derive ownership from existing parents, without backfill,
-- sentinel/default tenant, RLS/grant expansion, routing change, or disabled triggers.
BEGIN;

CREATE FUNCTION public.fn_field_owner_work_item(p_id uuid, p_site text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row record;
BEGIN
  SELECT org_id,site_code INTO v_row FROM public.work_item WHERE id=p_id FOR SHARE;
  IF NOT FOUND OR v_row.org_id IS NULL OR v_row.org_id='00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'field ownership: work item has no established organization' USING ERRCODE='23514';
  END IF;
  IF p_site IS NOT NULL AND p_site IS DISTINCT FROM v_row.site_code THEN
    RAISE EXCEPTION 'field ownership: work item and site disagree' USING ERRCODE='23514';
  END IF;
  RETURN v_row.org_id;
END $$;

CREATE FUNCTION public.fn_field_owner_project(p_id uuid, p_site text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row record;
BEGIN
  SELECT org_id,site_code,work_item_id INTO v_row
  FROM public.installation_projects WHERE id=p_id FOR SHARE;
  IF NOT FOUND OR v_row.org_id IS NULL OR v_row.org_id='00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'field ownership: project has no established organization' USING ERRCODE='23514';
  END IF;
  IF p_site IS NOT NULL AND p_site IS DISTINCT FROM v_row.site_code THEN
    RAISE EXCEPTION 'field ownership: project and site disagree' USING ERRCODE='23514';
  END IF;
  IF v_row.work_item_id IS NOT NULL AND
     public.fn_field_owner_work_item(v_row.work_item_id) IS DISTINCT FROM v_row.org_id THEN
    RAISE EXCEPTION 'field ownership: project and linked work item disagree' USING ERRCODE='23514';
  END IF;
  RETURN v_row.org_id;
END $$;

CREATE FUNCTION public.fn_field_owner_site(p_site text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_project record; v_owner uuid; v_next uuid;
BEGIN
  -- Multiple houses can share one org. No JWT/first-row/sentinel fallback.
  FOR v_project IN SELECT id FROM public.installation_projects
    WHERE site_code=p_site ORDER BY id FOR SHARE
  LOOP
    v_next := public.fn_field_owner_project(v_project.id,p_site);
    IF v_owner IS NOT NULL AND v_owner IS DISTINCT FROM v_next THEN
      RAISE EXCEPTION 'field ownership: site has multiple organizations' USING ERRCODE='23514';
    END IF;
    v_owner := v_next;
  END LOOP;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'field ownership: site has no established organization' USING ERRCODE='23514';
  END IF;
  RETURN v_owner;
END $$;

CREATE FUNCTION public.fn_field_project_write_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_owner uuid; v_room uuid; v_room_row record;
BEGIN
  IF TG_OP='UPDATE' AND NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'field ownership: existing organization cannot be reassigned' USING ERRCODE='23514';
  END IF;
  -- installation_audit_log also supports already-owned non-project events.
  -- Preserve that existing write contract; do not manufacture a tenant.
  IF NEW.project_id IS NULL AND (to_jsonb(NEW)->>'room_id') IS NULL
    AND NEW.org_id IS NOT NULL AND NEW.org_id<>'00000000-0000-0000-0000-000000000000'::uuid THEN
    RETURN NEW;
  END IF;
  v_owner := public.fn_field_owner_project(NEW.project_id,NEW.site_code);
  v_room := (to_jsonb(NEW)->>'room_id')::uuid;
  IF v_room IS NOT NULL THEN
    SELECT project_id,org_id INTO v_room_row FROM public.installation_rooms WHERE id=v_room FOR SHARE;
    IF NOT FOUND OR v_room_row.project_id IS DISTINCT FROM NEW.project_id OR v_room_row.org_id IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION 'field ownership: room and project disagree' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.org_id IS NOT NULL AND NEW.org_id IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'field ownership: explicit organization conflicts with project' USING ERRCODE='23514';
  END IF;
  NEW.org_id := v_owner;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_field_issue_org BEFORE INSERT OR UPDATE OF org_id,project_id,site_code,room_id
 ON public.installation_issues FOR EACH ROW EXECUTE FUNCTION public.fn_field_project_write_org();
CREATE TRIGGER trg_field_approval_org BEFORE INSERT OR UPDATE OF org_id,project_id,site_code,room_id
 ON public.installation_approvals FOR EACH ROW EXECUTE FUNCTION public.fn_field_project_write_org();
CREATE TRIGGER trg_field_qc_org BEFORE INSERT OR UPDATE OF org_id,project_id,site_code
 ON public.qc_inspections FOR EACH ROW EXECUTE FUNCTION public.fn_field_project_write_org();
-- Required by the normal customer welcome trigger, which issues three links.
CREATE TRIGGER trg_field_document_link_org BEFORE INSERT OR UPDATE OF org_id,project_id,site_code
 ON public.document_links FOR EACH ROW EXECUTE FUNCTION public.fn_field_project_write_org();
CREATE TRIGGER trg_field_installation_audit_org BEFORE INSERT
 ON public.installation_audit_log FOR EACH ROW EXECUTE FUNCTION public.fn_field_project_write_org();

CREATE FUNCTION public.fn_field_capture_write_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_payload jsonb; v_project uuid; v_owner uuid; v_link_owner uuid; v_project_work_item uuid;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'field ownership: capture organization cannot be reassigned' USING ERRCODE='23514';
    END IF;
    IF NEW.site_code IS NOT DISTINCT FROM OLD.site_code
      AND NEW.linked_entity_type IS NOT DISTINCT FROM OLD.linked_entity_type
      AND NEW.linked_entity_id IS NOT DISTINCT FROM OLD.linked_entity_id
      AND (coalesce(NEW.ai_payload,'{}'::jsonb)||coalesce(NEW.corrected_fields,'{}'::jsonb))->'project_id'
          IS NOT DISTINCT FROM
          (coalesce(OLD.ai_payload,'{}'::jsonb)||coalesce(OLD.corrected_fields,'{}'::jsonb))->'project_id' THEN
      RETURN NEW; -- Unrelated lifecycle/OCR updates do not reinterpret ownership.
    END IF;
  END IF;
  v_payload := coalesce(NEW.ai_payload,'{}'::jsonb)||coalesce(NEW.corrected_fields,'{}'::jsonb);
  BEGIN
    v_project := nullif(v_payload->>'project_id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'field ownership: capture project identifier is invalid' USING ERRCODE='23514';
  END;
  IF v_project IS NOT NULL THEN
    v_owner := public.fn_field_owner_project(v_project,NEW.site_code);
  END IF;
  IF NEW.linked_entity_type='installation_project' AND NEW.linked_entity_id IS NOT NULL THEN
    IF v_project IS NOT NULL AND v_project IS DISTINCT FROM NEW.linked_entity_id THEN
      RAISE EXCEPTION 'field ownership: capture project references disagree' USING ERRCODE='23514';
    END IF;
    v_link_owner := public.fn_field_owner_project(NEW.linked_entity_id,NEW.site_code);
  ELSIF NEW.linked_entity_type='work_item' AND NEW.linked_entity_id IS NOT NULL THEN
    v_link_owner := public.fn_field_owner_work_item(NEW.linked_entity_id,NEW.site_code);
    IF v_project IS NOT NULL THEN
      SELECT work_item_id INTO v_project_work_item FROM public.installation_projects WHERE id=v_project;
      IF v_project_work_item IS DISTINCT FROM NEW.linked_entity_id THEN
        RAISE EXCEPTION 'field ownership: capture project and work item references disagree' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  IF v_owner IS NOT NULL AND v_link_owner IS NOT NULL AND v_owner IS DISTINCT FROM v_link_owner THEN
    RAISE EXCEPTION 'field ownership: capture parents have different organizations' USING ERRCODE='23514';
  END IF;
  v_owner := coalesce(v_owner,v_link_owner);
  IF v_owner IS NULL THEN
    -- Other capture producers can already provide their own nonzero org.
    -- Validate known project/work-item parents above, but do not reinterpret
    -- a parentless explicit owner as an installation site attribution request.
    -- rpc_capture_ingest still resolves its site before passing org_id here.
    IF TG_OP='INSERT' AND NEW.org_id IS NOT NULL
      AND NEW.org_id<>'00000000-0000-0000-0000-000000000000'::uuid THEN
      RETURN NEW;
    ELSIF TG_OP='UPDATE' AND NEW.site_code IS NOT DISTINCT FROM OLD.site_code THEN
      v_owner := OLD.org_id;
    ELSE
      v_owner := public.fn_field_owner_site(NEW.site_code);
    END IF;
  END IF;
  IF NEW.org_id IS NOT NULL AND NEW.org_id IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'field ownership: capture organization conflicts with provenance' USING ERRCODE='23514';
  END IF;
  NEW.org_id := v_owner;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_field_capture_org BEFORE INSERT OR UPDATE OF org_id,site_code,linked_entity_type,linked_entity_id,ai_payload,corrected_fields
 ON public.capture_artifact FOR EACH ROW EXECUTE FUNCTION public.fn_field_capture_write_org();

CREATE FUNCTION public.fn_field_capture_audit_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_owner uuid;
BEGIN
  -- The capture audit schema intentionally permits failures before an artifact
  -- exists. Preserve an explicit existing owner; never infer it from a JWT.
  IF NEW.capture_artifact_id IS NULL AND NEW.org_id IS NOT NULL
    AND NEW.org_id<>'00000000-0000-0000-0000-000000000000'::uuid THEN
    RETURN NEW;
  END IF;
  SELECT org_id INTO v_owner FROM public.capture_artifact WHERE id=NEW.capture_artifact_id FOR SHARE;
  IF v_owner IS NULL OR v_owner='00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'field ownership: capture audit requires an owned artifact' USING ERRCODE='23514';
  END IF;
  IF NEW.org_id IS NOT NULL AND NEW.org_id IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'field ownership: capture audit organization conflicts with artifact' USING ERRCODE='23514';
  END IF;
  NEW.org_id := v_owner;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_field_capture_audit_org BEFORE INSERT
 ON public.capture_audit_log FOR EACH ROW EXECUTE FUNCTION public.fn_field_capture_audit_org();

CREATE FUNCTION public.fn_field_workflow_audit_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_owner uuid;
BEGIN
  -- Existing non-field events can be explicitly owned without a work item.
  -- Site-only derivation is required only when that owner was omitted.
  IF NEW.work_item_id IS NULL AND NEW.org_id IS NOT NULL
    AND NEW.org_id<>'00000000-0000-0000-0000-000000000000'::uuid THEN
    RETURN NEW;
  END IF;
  IF NEW.work_item_id IS NOT NULL THEN
    v_owner := public.fn_field_owner_work_item(NEW.work_item_id,NEW.site_code);
  ELSE
    v_owner := public.fn_field_owner_site(NEW.site_code);
  END IF;
  IF NEW.org_id IS NOT NULL AND NEW.org_id IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'field ownership: workflow audit organization conflicts with parent' USING ERRCODE='23514';
  END IF;
  NEW.org_id := v_owner;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_field_workflow_audit_org BEFORE INSERT
 ON public.workflow_audit_log FOR EACH ROW EXECUTE FUNCTION public.fn_field_workflow_audit_org();

CREATE FUNCTION public.fn_field_group_outbound_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_group record; v_old_group record; v_owner uuid; v_old_owner uuid; v_conversation_owner uuid;
BEGIN
  -- Preserve established installation ownership even when the target changes
  -- to a user/factory path that this repair otherwise leaves alone.
  IF TG_OP='UPDATE' AND OLD.target_type='group' THEN
    SELECT project_id,group_type,org_id,site_code INTO v_old_group FROM public.line_groups
      WHERE line_group_id=OLD.target_id FOR SHARE;
    IF FOUND AND v_old_group.group_type IN ('customer','internal') THEN
      v_old_owner := public.fn_field_owner_project(v_old_group.project_id,v_old_group.site_code);
      IF v_old_group.org_id IS DISTINCT FROM v_old_owner OR OLD.org_id IS DISTINCT FROM v_old_owner THEN
        RAISE EXCEPTION 'field ownership: existing outbound group and project disagree' USING ERRCODE='23514';
      END IF;
      IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
        RAISE EXCEPTION 'field ownership: outbound organization cannot be reassigned' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  -- The existing audience/unbound guard remains separate and active.
  IF NEW.target_type<>'group' THEN RETURN NEW; END IF;
  SELECT project_id,group_type,org_id,site_code INTO v_group FROM public.line_groups
    WHERE line_group_id=NEW.target_id FOR SHARE;
  IF NOT FOUND OR v_group.group_type='factory' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'field ownership: outbound organization cannot be reassigned' USING ERRCODE='23514';
  END IF;
  v_owner := public.fn_field_owner_project(v_group.project_id,v_group.site_code);
  IF v_group.org_id IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'field ownership: group organization conflicts with project' USING ERRCODE='23514';
  END IF;
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT org_id INTO v_conversation_owner FROM public.line_oa_conversations
      WHERE id=NEW.conversation_id FOR SHARE;
    IF v_conversation_owner IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION 'field ownership: outbound group and conversation disagree' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.org_id IS NOT NULL AND NEW.org_id IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'field ownership: outbound organization conflicts with group project' USING ERRCODE='23514';
  END IF;
  NEW.org_id := v_owner;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_field_group_outbound_org BEFORE INSERT OR UPDATE OF org_id,target_type,target_id,conversation_id
 ON public.line_oa_outbound_messages FOR EACH ROW EXECUTE FUNCTION public.fn_field_group_outbound_org();

-- Preserve signature/key format/actor check, but never return another org's ID.
CREATE OR REPLACE FUNCTION public.rpc_capture_ingest(
  p_capture_type text,p_source text,p_raw_uri text,p_idempotency_key text,p_site_code text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_principal text; v_id uuid; v_owner uuid; v_existing_owner uuid;
BEGIN
  v_principal := public.resolve_actor();
  IF v_principal IS NULL THEN
    RAISE EXCEPTION 'capture: unauthenticated principal' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.capture_type_config WHERE capture_type=p_capture_type AND active) THEN
    RAISE EXCEPTION 'capture: unknown/inactive capture_type %',p_capture_type USING ERRCODE='no_data_found';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key)=0 THEN
    RAISE EXCEPTION 'capture: idempotency_key required' USING ERRCODE='check_violation';
  END IF;
  v_owner := public.fn_field_owner_site(p_site_code);
  INSERT INTO public.capture_artifact(capture_type,status,source,principal,site_code,raw_uri,idempotency_key,org_id)
    VALUES(p_capture_type,'proposed',p_source::public.capture_source,v_principal,p_site_code,p_raw_uri,p_idempotency_key,v_owner)
    ON CONFLICT(idempotency_key) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id,org_id INTO v_id,v_existing_owner FROM public.capture_artifact
      WHERE idempotency_key=p_idempotency_key FOR SHARE;
    IF v_id IS NULL OR v_existing_owner IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION 'capture: idempotency key conflicts with organization' USING ERRCODE='23514';
    END IF;
    RETURN v_id;
  END IF;
  INSERT INTO public.capture_audit_log(capture_artifact_id,capture_type,event_type,actor,prev_status,next_status)
    VALUES(v_id,p_capture_type,'ingest',v_principal,NULL,'proposed');
  RETURN v_id;
END $$;

-- Default ACLs may grant roles explicitly as well as PUBLIC. Trigger/RPC owner
-- invokes these helpers; no new client-callable SECURITY DEFINER surface.
REVOKE ALL ON FUNCTION public.fn_field_owner_work_item(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_field_owner_project(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_field_owner_site(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_field_project_write_org() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_field_capture_write_org() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_field_capture_audit_org() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_field_workflow_audit_org() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_field_group_outbound_org() FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
