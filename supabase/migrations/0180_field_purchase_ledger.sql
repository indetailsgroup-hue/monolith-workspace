-- Migration: 0180_field_purchase_ledger
-- Depends on: 0176 (field_purchase_request, rpc_mark_field_purchase_purchased,
--                    field_purchase_audit_log, resolve_actor, is_governance_role)
--             0066 (journal_entry, journal_line, ledger_account COA)
--
-- Extends rpc_mark_field_purchase_purchased to post a balanced double-entry journal
-- entry immediately when a field purchase receipt is uploaded (status → 'purchased').
--
-- ┌─ Template G-4  (field purchase cash disbursement) ──────────────────────┐
-- │  Dr 5050  ค่าวัสดุสิ้นเปลือง       = amount   (expense ↑)               │
-- │  Cr 1010  เงินสดและเงินฝากธนาคาร    = amount   (cash ↓)                 │
-- │  Balanced: Σdebit = Σcredit = amount. No VAT / WHT complexity.           │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Why direct INSERT instead of rpc_post_journal_entry:
--   rpc_post_journal_entry (0066) requires is_governance_role() — a check that
--   intentionally fails for technician actors who call rpc_mark_field_purchase_purchased
--   after uploading their receipt.  The SECURITY DEFINER elevation of this RPC provides
--   sufficient authority to write directly into journal_entry / journal_line (bypasses
--   RLS), replicating the G-4 template inline without routing through the governance
--   gate.  This is the same pattern used by rpc_capture_promote in 0068 (direct insert
--   block labelled "replicates G-4 template").
--
-- Changes from 0176 version:
--   1. Declares v_journal_id uuid.
--   2. After UPDATE field_purchase_request → INSERT journal_entry RETURNING id.
--   3. INSERT two journal_line rows (Dr 5050, Cr 1010).
--   4. Audit log metadata now includes journal_entry_id for traceability.
--   5. RETURN payload extended with journal_entry_id.
--   All guard clauses, RLS, REVOKE/GRANT, and other RPCs are unchanged.

-- ─────────────────────────────────────────────────────────────────────────────
-- Replace rpc_mark_field_purchase_purchased with ledger-integrated version
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rpc_mark_field_purchase_purchased(
  p_request_id    uuid,
  p_receipt_refs  jsonb   -- [{url, storage_key, mime_type}]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor      text;
  v_req        field_purchase_request%ROWTYPE;
  v_journal_id uuid;
BEGIN
  v_actor := resolve_actor();

  -- ── Load & lock request ──────────────────────────────────────────────────
  SELECT * INTO v_req
  FROM   field_purchase_request
  WHERE  id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_mark_purchased_fpr: request % not found', p_request_id;
  END IF;

  IF v_req.status <> 'approved' THEN
    RAISE EXCEPTION
      'rpc_mark_purchased_fpr: request % is %, expected approved',
      p_request_id, v_req.status;
  END IF;

  -- Only the original requester or a governance role may upload the receipt.
  IF v_actor <> v_req.requester AND NOT is_governance_role() THEN
    RAISE EXCEPTION
      'rpc_mark_purchased_fpr: actor % is not the requester for request %',
      v_actor, p_request_id;
  END IF;

  PERFORM set_config('app.actor', v_actor, true);

  -- ── Advance status ───────────────────────────────────────────────────────
  UPDATE field_purchase_request
  SET    status     = 'purchased',
         photo_refs = photo_refs || p_receipt_refs  -- append receipt refs
  WHERE  id = p_request_id;

  -- ── G-4 double-entry journal entry (direct insert — see header comment) ──
  --
  -- Direct insert replicates G-4 template from 0068;
  -- rpc_post_journal_entry not called due to governance gate mismatch.
  --
  INSERT INTO journal_entry
    (book_id, entry_date, description, status, currency,
     site_code, source_ref, created_by)
  VALUES (
    'internal',
    (timezone('utc', now()))::date,
    format('field purchase %s — %s', p_request_id, v_req.reason),
    'posted',
    'THB',
    v_req.site_code,
    jsonb_build_object(
      'field_purchase_request_id', p_request_id,
      'capture_type',              'field_purchase'
    ),
    v_actor
  )
  RETURNING id INTO v_journal_id;

  -- Balanced debit / credit (ACC-1: Σdebit = Σcredit = v_req.amount)
  INSERT INTO journal_line
    (journal_entry_id, account_code, debit, credit, base_debit, base_credit)
  VALUES
    -- Dr 5050 ค่าวัสดุสิ้นเปลือง  (consumable materials expense ↑)
    (v_journal_id, '5050', v_req.amount, 0,              v_req.amount, 0),
    -- Cr 1010 เงินสดและเงินฝากธนาคาร (cash out ↓)
    (v_journal_id, '1010', 0,            v_req.amount,   0,            v_req.amount);

  -- ── Append-only audit log (includes journal_entry_id for traceability) ───
  INSERT INTO field_purchase_audit_log
    (request_id, actor, event_type, old_status, new_status, metadata)
  VALUES (
    p_request_id,
    v_actor,
    'receipt_uploaded',
    'approved',
    'purchased',
    jsonb_build_object(
      'receipt_refs',     p_receipt_refs,
      'journal_entry_id', v_journal_id    -- links audit trail → ledger
    )
  );

  RETURN jsonb_build_object(
    'request_id',       p_request_id,
    'status',           'purchased',
    'journal_entry_id', v_journal_id
  );
END;
$$;

-- Re-assert execution grant (idempotent; original REVOKE/GRANT block in 0176).
GRANT EXECUTE ON FUNCTION rpc_mark_field_purchase_purchased TO authenticated;
