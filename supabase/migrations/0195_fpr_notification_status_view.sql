-- =============================================================================
-- Migration 0195 — v_fpr_notification_status
--
-- Read-optimised view joining line_oa_outbound_messages with
-- field_purchase_request so the dashboard (and any RPC consumer) can query
-- LINE delivery status per request server-side, rather than relying on the
-- client-side Map built from the bulk-approve response.
--
-- Join key:
--   line_oa_outbound_messages.slot_values->>'request_id'  = field_purchase_request.id
--
-- Scope:
--   Only FPR notification templates are included:
--     tpl_fpr_approval_flex_card  (0177 — action card sent to approver)
--     tpl_fpr_approved_flex_card  (0194 — confirmation card sent to requester)
--
-- Security model:
--   • security_invoker = true (PG 15+) — underlying RLS on both base tables
--     is inherited automatically.
--   • WHERE role gate — fail-closed: only project_manager, managing_director,
--     and governance roles can read rows.  Technicians must query
--     field_purchase_request directly.
--   • Depends on: 0176 (field_purchase_request), 0177 (line_oa_outbound_messages),
--                 0194 (tpl_fpr_approved_flex_card template key constant)
--
-- Notes on NULL rows:
--   Because of LEFT JOIN, requests that have never triggered a notification
--   will appear with all outbound_* columns as NULL.  The dashboard uses
--   COALESCE(line_status, '—') to render these gracefully.
--
-- Dashboard usage pattern:
--   SELECT * FROM v_fpr_notification_status
--   WHERE request_id = ANY($1::uuid[]);
--
-- Idempotent: DROP VIEW IF EXISTS before CREATE.
-- =============================================================================

BEGIN;

-- ─── Drop prior version ────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_fpr_notification_status;

-- ─── View ─────────────────────────────────────────────────────────────────────
CREATE VIEW public.v_fpr_notification_status
WITH (security_invoker = true)
AS
SELECT
    -- ── Core request identity ────────────────────────────────────────────────
    r.id                                        AS request_id,
    r.project_id,
    r.site_code,
    r.requester,
    r.amount,
    r.reason,
    r.status                                    AS request_status,
    r.approval_level,
    r.approver,
    r.approved_at,
    r.rejection_note,
    r.created_at                                AS request_created_at,
    r.updated_at                                AS request_updated_at,

    -- ── Outbound message identity ────────────────────────────────────────────
    -- NULL when no notification has been queued for this request yet
    oum.id                                      AS outbound_message_id,
    oum.send_type,

    -- 'pending' | 'sent' | 'failed' — NULL if no message row exists
    oum.status                                  AS line_status,

    -- Which template was used (approver card vs requester confirmation card)
    oum.template_key                            AS notification_template,

    -- LINE target (user or group)
    oum.target_type                             AS line_target_type,
    oum.target_id                               AS line_target_id,

    -- Full slot_values for debugging / flex card preview
    oum.slot_values                             AS notification_slot_values,

    -- When the notification was dispatched (sent_at; NULL while status = 'pending')
    oum.sent_at                                 AS notification_queued_at,

    -- ── Derived convenience column ───────────────────────────────────────────
    -- 'sent'    → delivered
    -- 'pending' → queued, not yet dispatched
    -- 'failed'  → dispatch attempted and failed
    -- 'none'    → no outbound row exists for this request (LEFT JOIN miss)
    COALESCE(oum.status::text, 'none')                AS line_delivery_status

FROM public.field_purchase_request r

-- ── Outbound message: join on slot_values->request_id ─────────────────────────
-- rpc_route_fpr_approval_notification (0177) and any consumer of that RPC
-- populate slot_values with at minimum:
--   {"request_id": "<uuid>", "amount": "...", ...}
-- We cast the JSONB text field to uuid for type-safe equality.
LEFT JOIN public.line_oa_outbound_messages oum
    ON  (oum.slot_values ->> 'request_id')::uuid = r.id
    AND oum.template_key IN (
            'tpl_fpr_approval_flex_card',   -- 0177: to approver
            'tpl_fpr_approved_flex_card'    -- 0194: to requester
        )

-- ── Role gate — fail-closed ────────────────────────────────────────────────────
-- Technicians read their own rows on field_purchase_request directly.
-- This view is PM / MD / governance oversight only.
WHERE
    public.is_governance_role()
    OR public.has_any_app_role(ARRAY['project_manager', 'managing_director']);

-- ─── Object documentation ─────────────────────────────────────────────────────
COMMENT ON VIEW public.v_fpr_notification_status IS
'Server-side LINE delivery status view for field purchase requests. '
'Joins line_oa_outbound_messages (FPR notification templates only) to '
'field_purchase_request via slot_values->>''request_id''. '
'line_delivery_status column: ''sent'' | ''pending'' | ''failed'' | ''none'' (no message). '
'Uses security_invoker=true — underlying RLS on both base tables is inherited. '
'Access restricted to project_manager, managing_director, and governance roles. '
'Depends on: 0176 (field_purchase_request), 0177 (line_oa_outbound_messages, '
'rpc_route_fpr_approval_notification), 0194 (tpl_fpr_approved_flex_card). '
'Migration: 0195.';

-- ─── Privileges ───────────────────────────────────────────────────────────────
REVOKE ALL ON public.v_fpr_notification_status
    FROM PUBLIC, anon, authenticated;

-- Authenticated role — row visibility still enforced by the view WHERE clause
-- and the underlying base-table RLS.
GRANT SELECT ON public.v_fpr_notification_status
    TO authenticated;

-- service_role may bypass RLS for cron/admin use (already has superuser-like grants)
GRANT SELECT ON public.v_fpr_notification_status
    TO service_role;

COMMIT;
