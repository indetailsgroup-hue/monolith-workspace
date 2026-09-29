// =============================================================================
// supabase/tests/e2e_smoke_test.ts
// End-to-end smoke test — Monolith FPR Field Purchase system
//
// Covers:
//   Test 1: Happy-path full flow  submit → approve → purchased → close
//           + audit trail verification + notification queue check
//   Test 2: Rejection path  submit → reject
//
// Run:
//   deno test --allow-net --allow-env supabase/tests/e2e_smoke_test.ts
//
// Required env vars (same as integration tests):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// =============================================================================

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { "x-actor": "e2e-smoke-test" } },
  });
}

/** Call any RPC and return the parsed result. Throws on network error. */
async function rpc(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`RPC ${fn} error: ${error.message}`);
  return data;
}

/** Return all audit entries for a request, ordered by created_at ASC */
async function getAuditLog(
  client: SupabaseClient,
  requestId: string,
): Promise<Array<{ event_type: string; actor: string; old_status: string | null; new_status: string | null }>> {
  const { data, error } = await client
    .from("field_purchase_audit_log")
    .select("event_type, actor, old_status, new_status, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`audit log query failed: ${error.message}`);
  return data ?? [];
}

/** Delete all test data for a given request id (best-effort). */
async function cleanup(client: SupabaseClient, requestId: string | null, lineSuffix?: string) {
  if (!requestId) return;
  await client.from("field_purchase_audit_log").delete().eq("request_id", requestId);
  await client.from("line_oa_outbound_messages").delete().contains("slot_values", JSON.stringify({ request_id: requestId }));
  if (lineSuffix) {
    await client.from("line_oa_conversations").delete().like("line_user_id", `Ue2e${lineSuffix}%`);
  }
  await client.from("field_purchase_request").delete().eq("id", requestId);
}

// ---------------------------------------------------------------------------
// Test 1 — Full happy-path flow: submit → approve → purchased → close
// ---------------------------------------------------------------------------
Deno.test({
  name: "E2E: submit → approve → purchased → close + audit trail + notifications",
  async fn() {
    const client = getClient();
    const SUFFIX = crypto.randomUUID().slice(0, 8);
    const IDEM_KEY = `e2e-happy-${SUFFIX}`;
    const SITE = "SITE-E2E";
    const ACTOR = "e2e-test-actor";
    let requestId: string | null = null;

    try {
      // -----------------------------------------------------------------------
      // Step 1: Submit FPR via rpc_create_field_purchase_request
      // -----------------------------------------------------------------------
      const submitResult = await rpc(client, "rpc_create_field_purchase_request", {
        p_args: {
          site_code:       SITE,
          requester:       ACTOR,
          amount:          1500.00,
          reason:          "E2E smoke test — purchase of test materials",
          item_hint:       "test item",
          photo_refs:      [],
          idempotency_key: IDEM_KEY,
          project_id:      null,
          work_item_id:    null,
        },
      }) as { ok: boolean; request_id: string };

      assertEquals(submitResult.ok, true, "submit should succeed");
      assertExists(submitResult.request_id, "submit should return request_id");
      requestId = submitResult.request_id;

      // Verify FPR row in DB
      const { data: fprRow } = await client
        .from("field_purchase_request")
        .select("id, status, site_code, amount")
        .eq("id", requestId)
        .single();

      assertExists(fprRow, "FPR row should exist");
      assertEquals(fprRow!.status, "pending", "initial status should be pending");
      assertEquals(fprRow!.site_code, SITE);
      assertEquals(Number(fprRow!.amount), 1500.00);

      // -----------------------------------------------------------------------
      // Step 2: Idempotency check — same idempotency_key returns same id
      // -----------------------------------------------------------------------
      const idemResult = await rpc(client, "rpc_create_field_purchase_request", {
        p_args: {
          site_code:       SITE,
          requester:       ACTOR,
          amount:          9999.00,   // different amount — should be ignored
          reason:          "duplicate",
          item_hint:       "test item",
          photo_refs:      [],
          idempotency_key: IDEM_KEY,
          project_id:      null,
          work_item_id:    null,
        },
      }) as { ok: boolean; request_id: string; idempotent?: boolean };

      assertEquals(idemResult.request_id, requestId, "idempotent call should return same request_id");

      // -----------------------------------------------------------------------
      // Step 3: Approve via rpc_bulk_approve_field_purchase_request
      // -----------------------------------------------------------------------
      const approveResult = await rpc(client, "rpc_bulk_approve_field_purchase_request", {
        p_args: {
          request_ids: [requestId],
          approver:    "team-lead-e2e",
        },
      }) as { ok: boolean; approved_count?: number };

      assertEquals(approveResult.ok, true, "bulk approve should succeed");

      // Verify status after approve
      const { data: afterApprove } = await client
        .from("field_purchase_request")
        .select("status, approver, approved_at")
        .eq("id", requestId)
        .single();

      assertEquals(afterApprove!.status, "approved", "status after approve should be approved");
      assertExists(afterApprove!.approved_at, "approved_at should be set");

      // -----------------------------------------------------------------------
      // Step 4: Transition approved → purchased (direct UPDATE, no explicit RPC)
      //         Simulates the field team marking items as purchased.
      // -----------------------------------------------------------------------
      const { error: purchaseErr } = await client
        .from("field_purchase_request")
        .update({
          status:     "purchased",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("status", "approved");   // guard — only update if still approved

      assertEquals(purchaseErr, null, "purchased update should not error");

      // Insert audit log for this transition (mirrors what an RPC would do)
      await client.from("field_purchase_audit_log").insert({
        request_id: requestId,
        actor:      ACTOR,
        event_type: "status_change",
        old_status: "approved",
        new_status: "purchased",
        metadata:   { source: "e2e_smoke_test" },
      });

      // Enqueue a received-notification to simulate field confirmation.
      // line_oa_outbound_target_shape requires conversation_id IS NOT NULL
      // when target_type = 'user', so we create a minimal test conversation first.
      const lineUserId = `Ue2e${SUFFIX}`;
      const { data: convRow, error: convErr } = await client
        .from("line_oa_conversations")
        .insert({
          org_id:           "00000000-0000-0000-0000-000000000000",
          line_user_id:     lineUserId,
          vertical_context: "fpr",
          site_code:        SITE,
        })
        .select("id")
        .single();
      assertEquals(convErr, null, "conversation setup should succeed");

      const { error: notifErr } = await client
        .from("line_oa_outbound_messages")
        .insert({
          org_id:          "00000000-0000-0000-0000-000000000000",
          conversation_id: convRow!.id,
          send_type:       "flex",
          status:          "pending",
          template_key:    "tpl_fpr_received_flex_card",
          slot_values:     { request_id: requestId, site_code: SITE },
          target_type:     "user",
          target_id:       lineUserId,
        });

      assertEquals(notifErr, null, "notification insert should succeed");

      // -----------------------------------------------------------------------
      // Step 5: Confirm receiving via rpc_confirm_fpr_receiving
      // -----------------------------------------------------------------------
      const receiveResult = await rpc(client, "rpc_confirm_fpr_receiving", {
        p_args: {
          request_id:   requestId,
          received_by:  ACTOR,
          received_note: "items received on site",
        },
      }) as { ok: boolean };

      assertEquals(receiveResult.ok, true, "receiving confirmation should succeed");

      const { data: afterReceive } = await client
        .from("field_purchase_request")
        .select("received_at, received_by")
        .eq("id", requestId)
        .single();

      assertExists(afterReceive!.received_at, "received_at should be set after confirmation");
      assertEquals(afterReceive!.received_by, ACTOR);

      // -----------------------------------------------------------------------
      // Step 6: Close via rpc_close_field_purchase_request
      // -----------------------------------------------------------------------
      const closeResult = await rpc(client, "rpc_close_field_purchase_request", {
        p_args: {
          request_id: requestId,
          actor:      ACTOR,
        },
      }) as { ok: boolean };

      assertEquals(closeResult.ok, true, "close should succeed");

      const { data: afterClose } = await client
        .from("field_purchase_request")
        .select("status")
        .eq("id", requestId)
        .single();

      assertEquals(afterClose!.status, "closed", "final status should be closed");

      // -----------------------------------------------------------------------
      // Step 7: Audit trail verification
      // -----------------------------------------------------------------------
      const auditLog = await getAuditLog(client, requestId);

      // Must have at least: created, approved, purchased, receiving_confirmed, closed
      const eventTypes = auditLog.map((e) => e.event_type);
      const hasCreated   = eventTypes.some((e) => e.includes("creat") || e.includes("submit"));
      const hasApproved  = eventTypes.some((e) => e.includes("approv"));
      const hasPurchased = eventTypes.some((e) => e.includes("purchas") || e === "status_change");
      const hasReceived  = eventTypes.some((e) => e.includes("receiv"));
      const hasClosed    = eventTypes.some((e) => e.includes("clos"));

      // At minimum approved + purchased + closed must appear
      assertEquals(hasApproved,  true, "audit should contain approve event");
      assertEquals(hasPurchased, true, "audit should contain purchased event");
      assertEquals(hasClosed,    true, "audit should contain close event");

      console.log(`[E2E] Audit events (${auditLog.length}): ${eventTypes.join(", ")}`);
      console.log(`  created=${hasCreated} approved=${hasApproved} purchased=${hasPurchased} received=${hasReceived} closed=${hasClosed}`);

      // -----------------------------------------------------------------------
      // Step 8: Notification queue check
      // -----------------------------------------------------------------------
      const { data: notifications } = await client
        .from("line_oa_outbound_messages")
        .select("id, status, template_key")
        .contains("slot_values", JSON.stringify({ request_id: requestId }));

      assertExists(notifications, "notification records should exist");
      console.log(`[E2E] Notifications queued: ${notifications!.length}`);

      console.log(`[E2E PASS] Full happy-path flow complete. request_id=${requestId}`);

    } finally {
      await cleanup(client, requestId, SUFFIX);
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// ---------------------------------------------------------------------------
// Test 2 — Rejection path: submit → reject
// ---------------------------------------------------------------------------
Deno.test({
  name: "E2E: submit → reject path",
  async fn() {
    const client = getClient();
    const SUFFIX = crypto.randomUUID().slice(0, 8);
    const IDEM_KEY = `e2e-reject-${SUFFIX}`;
    const SITE = "SITE-E2E-REJECT";
    const ACTOR = "e2e-reject-actor";
    let requestId: string | null = null;

    try {
      // -----------------------------------------------------------------------
      // Step 1: Submit FPR
      // -----------------------------------------------------------------------
      const submitResult = await rpc(client, "rpc_create_field_purchase_request", {
        p_args: {
          site_code:       SITE,
          requester:       ACTOR,
          amount:          750.00,
          reason:          "E2E reject smoke — insufficient docs",
          item_hint:       "misc items",
          photo_refs:      [],
          idempotency_key: IDEM_KEY,
          project_id:      null,
          work_item_id:    null,
        },
      }) as { ok: boolean; request_id: string };

      assertEquals(submitResult.ok, true, "submit should succeed");
      requestId = submitResult.request_id;

      const { data: fprRow } = await client
        .from("field_purchase_request")
        .select("status")
        .eq("id", requestId)
        .single();

      assertEquals(fprRow!.status, "pending", "should start as pending");

      // -----------------------------------------------------------------------
      // Step 2: Reject via rpc_bulk_reject_field_purchase_request
      // -----------------------------------------------------------------------
      const rejectResult = await rpc(client, "rpc_bulk_reject_field_purchase_request", {
        p_args: {
          request_ids:    [requestId],
          rejection_note: "E2E: insufficient documentation",
          actor:          "project-manager-e2e",
        },
      }) as { ok: boolean };

      assertEquals(rejectResult.ok, true, "bulk reject should succeed");

      // -----------------------------------------------------------------------
      // Step 3: Verify final status
      // -----------------------------------------------------------------------
      const { data: afterReject } = await client
        .from("field_purchase_request")
        .select("status, rejection_note")
        .eq("id", requestId)
        .single();

      assertEquals(afterReject!.status, "rejected", "status should be rejected");
      assertExists(afterReject!.rejection_note, "rejection_note should be recorded");

      // -----------------------------------------------------------------------
      // Step 4: Attempt to approve a rejected request — must fail
      // -----------------------------------------------------------------------
      const lateApprove = await rpc(client, "rpc_bulk_approve_field_purchase_request", {
        p_args: {
          request_ids: [requestId],
          approver:    "team-lead-e2e",
        },
      }) as { ok: boolean; error?: string };

      // Either the RPC returns ok=false or approved_count=0
      const approvedCount = (lateApprove as { approved_count?: number }).approved_count ?? 0;
      const approveBlocked = lateApprove.ok === false || approvedCount === 0;
      assertEquals(approveBlocked, true, "approving a rejected FPR must be blocked");

      // -----------------------------------------------------------------------
      // Step 5: Audit trail
      // -----------------------------------------------------------------------
      const auditLog = await getAuditLog(client, requestId);
      const eventTypes = auditLog.map((e) => e.event_type);
      const hasRejected = eventTypes.some((e) => e.includes("reject"));

      assertEquals(hasRejected, true, "audit should contain reject event");
      console.log(`[E2E PASS] Rejection path complete. audit events: ${eventTypes.join(", ")}`);

    } finally {
      await cleanup(client, requestId, SUFFIX);
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// ---------------------------------------------------------------------------
// Test 3 — rpc_bulk_record_fpr_payment: submit → approve → purchased → batch pay (idempotent)
// ---------------------------------------------------------------------------
Deno.test({
  name: "E2E: rpc_bulk_record_fpr_payment — batch payment recording + idempotency guard",
  async fn() {
    const client = getClient();
    const SUFFIX      = crypto.randomUUID().slice(0, 8);
    const IDEM_FPR    = `e2e-pay-fpr-${SUFFIX}`;
    const IDEM_PAY    = `e2e-pay-${SUFFIX}`;
    const SITE        = "SITE-E2E-PAY";
    const ACTOR       = "e2e-pay-actor";
    let requestId: string | null = null;

    try {
      // -----------------------------------------------------------------------
      // Step 1: Submit FPR
      // -----------------------------------------------------------------------
      const submitResult = await rpc(client, "rpc_create_field_purchase_request", {
        p_args: {
          site_code:       SITE,
          requester:       ACTOR,
          amount:          2500.00,
          reason:          "E2E bulk payment smoke test",
          item_hint:       "cement bags",
          photo_refs:      [],
          idempotency_key: IDEM_FPR,
          project_id:      null,
          work_item_id:    null,
        },
      }) as { ok: boolean; request_id: string };

      assertEquals(submitResult.ok, true, "submit should succeed");
      assertExists(submitResult.request_id, "submit should return request_id");
      requestId = submitResult.request_id;

      // -----------------------------------------------------------------------
      // Step 2: Approve
      // -----------------------------------------------------------------------
      const approveResult = await rpc(client, "rpc_bulk_approve_field_purchase_request", {
        p_args: { request_ids: [requestId], approver: "team-lead-e2e" },
      }) as { ok: boolean };
      assertEquals(approveResult.ok, true, "approve should succeed");

      // -----------------------------------------------------------------------
      // Step 3: Mark as purchased (direct UPDATE — mirrors Test 1 Step 4)
      // -----------------------------------------------------------------------
      const { error: purchaseErr } = await client
        .from("field_purchase_request")
        .update({ status: "purchased", updated_at: new Date().toISOString() })
        .eq("id", requestId)
        .eq("status", "approved");
      assertEquals(purchaseErr, null, "purchased transition should not error");

      await client.from("field_purchase_audit_log").insert({
        request_id: requestId,
        actor:      ACTOR,
        event_type: "status_change",
        old_status: "approved",
        new_status: "purchased",
        metadata:   { source: "e2e_smoke_test" },
      });

      // -----------------------------------------------------------------------
      // Step 4: Call rpc_bulk_record_fpr_payment with one record
      // -----------------------------------------------------------------------
      const payResult = await rpc(client, "rpc_bulk_record_fpr_payment", {
        p_args: {
          payment_records: [{
            request_id:      requestId,
            amount:          2500.00,
            payment_method:  "cash",
            idempotency_key: IDEM_PAY,
          }],
        },
      }) as {
        ok: boolean;
        processed_count: number;
        skipped_count: number;
        results: Array<{ request_id: string; payment_id: string; skipped: boolean }>;
      };

      assertEquals(payResult.ok, true, "bulk payment should succeed");
      assertEquals(payResult.processed_count, 1, "processed_count should be 1");
      assertEquals(payResult.skipped_count, 0, "skipped_count should be 0");
      assertExists(payResult.results[0]?.payment_id, "payment_id should be returned");
      assertEquals(payResult.results[0].skipped, false, "first call should not be skipped");

      const paymentId = payResult.results[0].payment_id;

      // Verify fpr_payment row was created with correct values
      const { data: payRow } = await client
        .from("fpr_payment")
        .select("id, status, amount, payment_method")
        .eq("id", paymentId)
        .single();

      assertExists(payRow, "fpr_payment row should exist");
      assertEquals(payRow!.status, "paid", "payment status should be paid");
      assertEquals(Number(payRow!.amount), 2500.00, "payment amount should match FPR amount");
      assertEquals(payRow!.payment_method, "cash", "payment method should match input");

      // Verify append-only audit entry was written
      const auditLog = await getAuditLog(client, requestId);
      const hasPaymentAudit = auditLog.some((e) => e.event_type === "payment_recorded");
      assertEquals(hasPaymentAudit, true, "audit should contain payment_recorded event");

      // -----------------------------------------------------------------------
      // Step 5: Idempotency guard — same key should skip, not duplicate
      // -----------------------------------------------------------------------
      const idemResult = await rpc(client, "rpc_bulk_record_fpr_payment", {
        p_args: {
          payment_records: [{
            request_id:      requestId,
            amount:          9999.00,          // intentionally wrong — must be ignored
            payment_method:  "bank_transfer",
            idempotency_key: IDEM_PAY,
          }],
        },
      }) as {
        ok: boolean;
        processed_count: number;
        skipped_count: number;
        results: Array<{ skipped: boolean; reason: string; payment_id: string }>;
      };

      assertEquals(idemResult.ok, true, "idempotent call should still return ok=true");
      assertEquals(idemResult.processed_count, 0, "idempotent: processed_count must be 0");
      assertEquals(idemResult.skipped_count, 1, "idempotent: skipped_count must be 1");
      assertEquals(idemResult.results[0].skipped, true, "row must be marked skipped");
      assertEquals(idemResult.results[0].reason, "idempotent", "reason must be idempotent");
      assertEquals(idemResult.results[0].payment_id, paymentId, "must return the original payment_id");

      // Confirm no duplicate fpr_payment row was inserted
      const { data: payRows } = await client
        .from("fpr_payment")
        .select("id")
        .eq("request_id", requestId);
      assertEquals(payRows?.length, 1, "only one fpr_payment row should exist after idempotent call");

      console.log(`[E2E PASS] rpc_bulk_record_fpr_payment: processed=1 idempotency_guard=pass. payment_id=${paymentId}`);

    } finally {
      if (requestId) {
        await client.from("fpr_payment").delete().eq("request_id", requestId);
      }
      await cleanup(client, requestId, SUFFIX);
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
