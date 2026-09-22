-- Isolated contract fixture only: NOT a production schema or signature verification test.
BEGIN;
CREATE TABLE public.line_oa_message_templates (
 org_id uuid NOT NULL, template_key text, vertical_context text, body text,
 is_active boolean, audience text, message_kind text,
 CONSTRAINT line_oa_message_templates_key_vertical_uniq UNIQUE NULLS NOT DISTINCT(template_key, vertical_context));
CREATE TABLE public.line_groups (id uuid PRIMARY KEY, org_id uuid NOT NULL, line_group_id text UNIQUE,
 project_id uuid, group_type text, status text, site_code text);
CREATE TABLE public.line_oa_outbound_messages (org_id uuid NOT NULL, send_type text, status text,
 template_key text, slot_values jsonb, target_type text, target_id text);
CREATE TABLE public.line_oa_inbound_messages (org_id uuid NOT NULL, conversation_id uuid,
 webhook_event_id text UNIQUE, payload jsonb, received_at timestamptz, source_type text, line_group_id text);
CREATE TABLE public.line_oa_audit_log (org_id uuid NOT NULL, event_type text, vertical_context text,
 site_code text, entity_ref text, performed_by text);
CREATE TABLE public.fpr_line_session (id uuid, project_id uuid, site_code text, photo_ref text,
 webhook_event_id text, line_group_id text, line_user_id text, state text, expires_at timestamptz);
CREATE FUNCTION public.line_oa_resolve_channel(text) RETURNS TABLE(vertical_context text,channel_access_token_ref text)
 LANGUAGE sql AS $$SELECT 'installation'::text, 'fixture-only'::text$$;
CREATE FUNCTION public.resolve_actor() RETURNS text LANGUAGE sql AS $$SELECT 'fixture'::text$$;
CREATE FUNCTION public.line_oa_verify_signature(text,text,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
SET check_function_bodies = off;
