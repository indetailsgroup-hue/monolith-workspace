-- ============================================================================
-- Migration 0197: pg_notify trigger on line_oa_outbound_messages
-- ============================================================================
--
-- PURPOSE
-- -------
-- Adds a PostgreSQL NOTIFY trigger so that any listener (e.g. a Deno LINE
-- dispatch worker using `LISTEN line_oa_outbound`) is woken up immediately
-- whenever a row transitions to status='pending' — either on fresh INSERT or
-- when rpc_retry_fpr_notifications resets a failed row back to pending.
--
-- This replaces any polling loop in the worker with an event-driven model:
--
--   Worker pseudocode:
--   ──────────────────
--   const client = new postgres.Client(DATABASE_URL);
--   await client.connect();
--   await client.queryArray("LISTEN line_oa_outbound");
--   for await (const notification of client.notifications) {
--     const payload = JSON.parse(notification.payload);
--     // payload: { id, send_type, template_key, target_type, target_id, created_at }
--     await dispatchLineMessage(payload.id);   // fetch full row + slot_values by id
--   }
--
-- WHY slot_values IS EXCLUDED FROM THE PAYLOAD
-- ---------------------------------------------
-- slot_values can be large (holds form state, flex card data, etc.).  The
-- channel payload is limited to 8 KB and we never need slot_values in the
-- routing decision — the worker fetches the full row by id.  Keeping the
-- payload small also prevents 8-KB truncation silently dropping messages.
--
-- TRIGGER COVERAGE
-- ----------------
-- AFTER INSERT                — handles fresh outbound rows (status starts as 'pending')
-- AFTER UPDATE OF status      — handles rpc_retry_fpr_notifications (failed → pending)
--                               and any future worker retry path
-- WHEN (NEW.status = 'pending') — fires only on the relevant transition; suppresses
--                               noise from sent/failed writes
--
-- IDEMPOTENCY
-- -----------
-- Uses DROP TRIGGER IF EXISTS before CREATE so the migration is safe to
-- re-run (e.g. during CI reset or re-apply after a failed deployment).
--
-- SECURITY
-- --------
-- The trigger function runs as SECURITY INVOKER (default) under the role of
-- the writing session (service_role for RPCs using SECURITY DEFINER).
-- pg_notify is a non-privileged built-in; no extra GRANT is required.
-- The channel name 'line_oa_outbound' is not secret — it carries only
-- non-sensitive routing metadata.  Sensitive data (slot_values) stays in DB.
--
-- DEPENDS ON
-- ----------
-- 0177 (line_oa_outbound_messages table)
-- 0193 / 0196 (writers that produce pending rows / reset failed → pending)
-- ============================================================================

BEGIN;

-- ── 1. Trigger function ───────────────────────────────────────────────────────
--
-- Fires on every qualifying INSERT or UPDATE.  Builds a compact JSON payload
-- and sends it on the 'line_oa_outbound' channel.
--
-- Payload structure:
--   {
--     "id":          <bigint>   — primary key; worker fetches full row by this
--     "send_type":   <text>     — 'push' | 'multicast' | 'broadcast'
--     "template_key":<text>     — template identifier for routing/logging
--     "target_type": <text>     — 'user' | 'group'
--     "target_id":   <text>     — LINE user/group id
--     "created_at":  <timestamptz> — ISO timestamp of original row creation
--   }
--
-- slot_values intentionally excluded (can be large; worker fetches by id).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_line_outbound_notify()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default) — runs under the role of the writing transaction.
-- pg_notify requires no elevated privileges.
AS $$
BEGIN
    PERFORM pg_notify(
        'line_oa_outbound',
        jsonb_build_object(
            'id',           NEW.id,
            'send_type',    NEW.send_type,
            'template_key', NEW.template_key,
            'target_type',  NEW.target_type,
            'target_id',    NEW.target_id,
            'created_at',   NEW.created_at
        )::text
    );
    RETURN NULL;  -- AFTER trigger; return value is ignored
END;
$$;

COMMENT ON FUNCTION public.fn_line_outbound_notify() IS
'AFTER INSERT OR UPDATE OF status trigger on line_oa_outbound_messages. '
'Fires pg_notify(''line_oa_outbound'', payload) whenever a row enters '
'status=''pending''.  Payload carries routing metadata only (no slot_values). '
'Enables event-driven LINE dispatch workers to replace polling loops. '
'Added by migration 0197.';

-- ── 2. Attach trigger (idempotent) ───────────────────────────────────────────

-- Drop first so re-running the migration is safe
DROP TRIGGER IF EXISTS trg_line_outbound_notify
    ON public.line_oa_outbound_messages;

CREATE TRIGGER trg_line_outbound_notify
    AFTER INSERT OR UPDATE OF status
    ON public.line_oa_outbound_messages
    FOR EACH ROW
    WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.fn_line_outbound_notify();

COMMENT ON TRIGGER trg_line_outbound_notify ON public.line_oa_outbound_messages IS
'Fires fn_line_outbound_notify() after any INSERT or status UPDATE that '
'results in status=''pending''.  Covers: new outbound rows (0193, 0177) and '
'rpc_retry_fpr_notifications resets (failed → pending, 0196). '
'Channel: line_oa_outbound.  Added by migration 0197.';

-- ── 3. Verify trigger is registered ──────────────────────────────────────────
DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT COUNT(*)
      INTO v_count
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'line_oa_outbound_messages'
       AND t.tgname  = 'trg_line_outbound_notify'
       AND NOT t.tgisinternal;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'migration 0197: trigger trg_line_outbound_notify was not created';
    END IF;

    RAISE NOTICE 'migration 0197: trigger trg_line_outbound_notify verified on line_oa_outbound_messages';
END;
$$;

COMMIT;

-- ============================================================================
-- Post-migration notes
-- ============================================================================
--
-- WORKER INTEGRATION (recommended pattern)
-- -----------------------------------------
-- The LINE dispatch worker should LISTEN on 'line_oa_outbound' using a
-- persistent PG connection.  On each notification:
--
--   1. Parse payload.id.
--   2. SELECT * FROM line_oa_outbound_messages WHERE id = $1 AND status = 'pending'
--      FOR UPDATE SKIP LOCKED;   -- claim the row atomically
--   3. Build and send LINE API call using template_key + slot_values.
--   4. UPDATE line_oa_outbound_messages SET status = 'sent'   WHERE id = $1;
--      (or 'failed' on error, then rpc_retry_fpr_notifications can reset it)
--
-- STARTUP DRAIN
-- -------------
-- On worker startup (or reconnect), drain any rows with status='pending' that
-- arrived before the LISTEN was active — the trigger fires only on live writes,
-- so missed rows need a one-time backfill query:
--
--   SELECT id FROM line_oa_outbound_messages
--    WHERE status = 'pending'
--    ORDER BY created_at
--    FOR UPDATE SKIP LOCKED;
--
-- CHANNEL SECURITY
-- ----------------
-- pg_notify payloads are visible to any DB session that issues LISTEN on the
-- same channel name.  The payload contains only non-sensitive routing metadata
-- (id, template_key, target_type, target_id).  slot_values (which may include
-- amounts, item hints, or approver tokens) is intentionally excluded.
--
-- ============================================================================
