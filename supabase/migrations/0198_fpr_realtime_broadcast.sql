-- ============================================================================
-- Migration 0198: Supabase Realtime broadcast for FPR approval queue
-- ============================================================================
--
-- PURPOSE
-- -------
-- Enables live auto-refresh of the FPR Dashboard approval queue panel by
-- broadcasting field_purchase_request INSERT/UPDATE events over the Supabase
-- Realtime WebSocket channel.
--
-- Two complementary mechanisms are wired together:
--
--   1. supabase_realtime PUBLICATION  (postgres_changes)
--      ─────────────────────────────────────────────────
--      The table is added to the built-in Supabase Realtime publication so the
--      dashboard can subscribe using the Supabase JS client:
--
--        const sb = supabase.createClient(url, anonKey, {
--          global: { headers: { Authorization: `Bearer ${jwt}` } }
--        });
--        sb.channel('fpr-queue-realtime')
--          .on('postgres_changes', {
--            event: '*', schema: 'public', table: 'field_purchase_request'
--          }, () => loadApprovalQueue(getConfig()))
--          .subscribe();
--
--      REPLICA IDENTITY FULL is set so the channel receives both old and new
--      row values on UPDATE (needed for status-change diffing on the client).
--
--   2. realtime.send() Broadcast trigger  (Supabase ≥ 2.28)
--      ──────────────────────────────────────────────────────
--      A TRIGGER fires on relevant INSERTs and on status/approval_level UPDATE
--      and calls realtime.send() to push a lightweight JSON event to:
--
--        fpr:queue:<site_code>  — site-scoped channel (per-site dashboard view)
--        fpr:queue              — wildcard channel   (all-sites dashboard view)
--
--      The function silently skips this step on older Supabase versions where
--      realtime.send() is not installed (EXCEPTION WHEN undefined_function).
--
--   3. pg_notify fallback  (always fires)
--      ─────────────────────────────────────
--      pg_notify('fpr_queue_refresh', payload) is emitted unconditionally so
--      that server-side workers or future dashboard builds using LISTEN can
--      receive the same wake-up signal.
--
-- PAYLOAD STRUCTURE (lightweight — no PII, no large blobs)
-- ─────────────────────────────────────────────────────────
--   {
--     "event":          "INSERT" | "UPDATE",
--     "id":             "<uuid>",
--     "site_code":      "BKK-01",
--     "status":         "pending" | "approved" | "rejected" | "purchased" | "closed",
--     "approval_level": "team_lead" | "project_manager" | "managing_director",
--     "updated_at":     "<timestamptz>"
--   }
--
-- TRIGGER COVERAGE
-- ────────────────
--   AFTER INSERT                             — new FPR enters the system
--   AFTER UPDATE OF status, approval_level,
--          approver, rejection_note          — any approval-flow state change
--
-- IDEMPOTENCY
-- ───────────
--   • Publication membership guarded by pg_publication_tables check.
--   • DROP TRIGGER IF EXISTS before CREATE TRIGGER.
--   • Verification DO block confirms trigger exists post-create.
--
-- SECURITY
-- ────────
--   • SECURITY DEFINER so the trigger function can always call realtime.send()
--     regardless of the invoking role.
--   • No data modification inside the trigger function — only PERFORM calls.
--   • Channel names are not secret; payload contains only status metadata.
--
-- ROLLBACK
-- ────────
--   DROP TRIGGER  IF EXISTS trg_fpr_realtime_broadcast ON public.field_purchase_request;
--   DROP FUNCTION IF EXISTS public.fn_fpr_realtime_broadcast();
--   ALTER TABLE public.field_purchase_request REPLICA IDENTITY DEFAULT;
--   -- Note: removing from supabase_realtime publication requires:
--   --   ALTER PUBLICATION supabase_realtime DROP TABLE public.field_purchase_request;
--   --   (run outside a transaction block)
-- ============================================================================

BEGIN;

-- ── 1. REPLICA IDENTITY FULL ──────────────────────────────────────────────────
-- Required so postgres_changes subscribers receive old + new row values on UPDATE.
-- Without this, UPDATE events deliver only the changed columns (not the full row).
ALTER TABLE public.field_purchase_request REPLICA IDENTITY FULL;

-- ── 2. supabase_realtime publication  (idempotent) ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_publication_tables
    WHERE  pubname    = 'supabase_realtime'
      AND  schemaname = 'public'
      AND  tablename  = 'field_purchase_request'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.field_purchase_request;
    RAISE NOTICE 'migration 0198: field_purchase_request added to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'migration 0198: field_purchase_request already in supabase_realtime publication — skipped';
  END IF;
END;
$$;

-- ── 3. Broadcast trigger function ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_fpr_realtime_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  -- Build a minimal payload — no PII, no large blobs, no slot_values.
  -- The client re-fetches the full queue via rpc_get_fpr_approval_queue on receipt.
  v_payload := jsonb_build_object(
    'event',          TG_OP,
    'id',             NEW.id,
    'site_code',      NEW.site_code,
    'status',         NEW.status,
    'approval_level', NEW.approval_level,
    'updated_at',     NEW.updated_at
  );

  -- ── realtime.send() broadcast  (Supabase ≥ 2.28) ─────────────────────────
  -- Wrapped in BEGIN/EXCEPTION so the trigger never blocks the originating
  -- transaction on older Supabase versions or transient realtime errors.
  BEGIN
    -- Site-scoped channel — dashboard subscribes per-site for filtered views
    PERFORM realtime.send(
      v_payload,
      'fpr_queue_changed',              -- event name
      'fpr:queue:' || NEW.site_code,    -- topic (site-scoped)
      false                              -- not private: any authenticated sub can read
    );
    -- Wildcard channel — dashboard all-sites view subscribes here
    PERFORM realtime.send(
      v_payload,
      'fpr_queue_changed',
      'fpr:queue',
      false
    );
  EXCEPTION
    WHEN undefined_function THEN
      -- realtime.send() not available on this Supabase version.
      -- postgres_changes (publication-based) subscription remains active.
      NULL;
    WHEN OTHERS THEN
      -- Non-fatal: log to pg_log but never abort the originating write.
      RAISE WARNING
        'fn_fpr_realtime_broadcast: realtime.send() error SQLSTATE=% MSG=%',
        SQLSTATE, SQLERRM;
  END;

  -- ── pg_notify fallback  (always fires) ───────────────────────────────────
  -- Wakes up any server-side LISTEN fpr_queue_refresh connection
  -- (e.g. older dashboard builds, monitoring scripts).
  -- Payload is truncated to 7 800 bytes to stay safely below the 8 KB pg_notify limit.
  PERFORM pg_notify(
    'fpr_queue_refresh',
    LEFT(v_payload::text, 7800)
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_fpr_realtime_broadcast() IS
  '0198: AFTER INSERT/UPDATE trigger on field_purchase_request. '
  'Broadcasts via realtime.send() (fpr:queue and fpr:queue:<site_code> channels) '
  'and pg_notify(fpr_queue_refresh). Drives live auto-refresh of FPR Dashboard '
  'approval queue panel. SECURITY DEFINER — no data modification.';

-- ── 4. Attach trigger ─────────────────────────────────────────────────────────
-- Fires on INSERT and on the specific columns that drive approval-flow state
-- changes.  Suppresses noise from unrelated column writes (e.g. updated_at
-- heartbeat refreshes that don't change approval state).
DROP TRIGGER IF EXISTS trg_fpr_realtime_broadcast
  ON public.field_purchase_request;

CREATE TRIGGER trg_fpr_realtime_broadcast
  AFTER INSERT
     OR UPDATE OF status, approval_level, approver, rejection_note
  ON public.field_purchase_request
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_fpr_realtime_broadcast();

-- ── 5. Verification ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM   pg_trigger     t
  JOIN   pg_class       c ON c.oid  = t.tgrelid
  JOIN   pg_namespace   n ON n.oid  = c.relnamespace
  WHERE  n.nspname = 'public'
    AND  c.relname = 'field_purchase_request'
    AND  t.tgname  = 'trg_fpr_realtime_broadcast'
    AND  NOT t.tgisinternal;

  IF v_count = 0 THEN
    RAISE EXCEPTION
      'migration 0198: trigger trg_fpr_realtime_broadcast was not created';
  END IF;

  RAISE NOTICE
    'migration 0198: trigger trg_fpr_realtime_broadcast verified on field_purchase_request';
END;
$$;

COMMIT;

-- ============================================================================
-- Post-migration notes
-- ============================================================================
--
-- CHANNEL REFERENCE
-- ─────────────────
--   Broadcast channels (realtime.send):
--     fpr:queue                  — all-sites wildcard (dashboard global view)
--     fpr:queue:<site_code>      — per-site (e.g. fpr:queue:BKK-01)
--
--   pg_notify channels:
--     fpr_queue_refresh          — server-side LISTEN listeners
--     line_oa_outbound           — LINE dispatch worker (migration 0197)
--
-- RLS NOTE
-- ────────
-- postgres_changes subscriptions honour RLS policies.  A dashboard user will
-- only receive events for rows they can SELECT — consistent with the authority
-- gate inside rpc_get_fpr_approval_queue.  The trigger fires for ALL writes but
-- Supabase Realtime filters delivery per subscriber based on their JWT claims.
--
-- REPLICA IDENTITY NOTE
-- ─────────────────────
-- Setting REPLICA IDENTITY FULL causes every UPDATE to write the full old-row
-- image to the WAL.  On a high-write table this increases WAL volume.
-- field_purchase_request is an approval-flow table with low write frequency
-- (one row per purchase request lifecycle), so the overhead is negligible.
--
-- BROWSER SUBSCRIPTION EXAMPLE
-- ─────────────────────────────
-- See fpr_dashboard.html → initRealtime() for the dashboard implementation.
--
-- SERVER-SIDE SUBSCRIPTION EXAMPLE (Deno)
-- ─────────────────────────────────────────
--   const sb = createClient(SUPABASE_URL, SERVICE_KEY);
--   sb.channel('fpr-server')
--     .on('broadcast', { event: 'fpr_queue_changed' }, (payload) => {
--       console.log('FPR changed:', payload);
--     })
--     .subscribe();
-- ============================================================================
