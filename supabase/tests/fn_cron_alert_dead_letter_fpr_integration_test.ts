// =============================================================================
// Integration test: fn_cron_alert_dead_letter_fpr
// Migration: 0210
//
// Covers:
//   Step 1 — no dead rows in the last hour → summary pg_notify payload has
//             new_dead_count = 0
//   Step 2 — one dead row seeded → per-row pg_notify payload contains the
//             correct message_id and site_code; summary has new_dead_count ≥ 1
//
// Assumptions:
//   • The integration DB is a fresh local Supabase instance with no
//     pre-existing dead-letter rows created in the last hour (standard CI).
//   • Step 1 runs before Step 2 (Deno executes tests in declaration order).
//
// Env (required):
//   SUPABASE_URL              e.g. http://localhost:54321
//   SUPABASE_SERVICE_ROLE_KEY service-role JWT
//   SUPABASE_DB_URL           e.g. postgresql://postgres:postgres@localhost:54322/postgres
//
// deno-postgres notifications:
//   deno-postgres delivers PostgreSQL NotificationResponse messages via an
//   EventEmitter on client.notifications. All notifications queued by the
//   server are dispatched during the readMessage() loop that processes the
//   query response, so payloads are fully available once queryArray() resolves.
// =============================================================================

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

// ─── Env ─────────────────────────────────────────────────────────────────────

const BASE   = Deno.env.get("SUPABASE_URL")              ?? "http://localhost:54321";
const SRK    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Direct Postgres connection — Supabase local dev exposes the DB on port 54322
const DB_URL = Deno.env.get("SUPABASE_DB_URL")           ?? "postgresql://postgres:postgres@localhost:54322/postgres";

// Unique site suffix per run prevents cross-test interference
const SITE    = `inttest-dl-${crypto.randomUUID().slice(0, 8)}`;
const CHANNEL = "fpr_dead_letter_alert";

// ─── REST helpers (service-role, for seeding / teardown) ─────────────────────

async function rest(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey:        SRK,
      Authorization: `Bearer ${SRK}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: unknown;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/**
 * Insert a minimal pending FPR for the test site and return its id.
 */
async function seedFpr(): Promise<string> {
  const { status, data } = await rest(
    "POST",
    "/rest/v1/field_purchase_request?select=id",
    {
      site_code:       SITE,
      requester:       "emp-dl-alert-tester",
      amount:          150,
      reason:          "dead letter alert integration test",
      item_hint:       "test item",
      status:          "pending",
      idempotency_key: crypto.randomUUID(),
    },
  );
  assertEquals(
    status,
    201,
    `seedFpr: expected HTTP 201, got ${status} — ${JSON.stringify(data)}`,
  );
  const rows = data as Array<{ id: string }>;
  assertExists(rows[0]?.id, "seedFpr: missing id in response");
  return rows[0].id;
}

/**
 * Insert a dead-letter outbound message that references the given FPR id.
 * created_at defaults to now() so the row falls within the last-hour window
 * that fn_cron_alert_dead_letter_fpr scans.
 */
async function seedDeadMessage(requestId: string): Promise<string> {
  const { status, data } = await rest(
    "POST",
    "/rest/v1/line_oa_outbound_messages?select=id",
    {
      send_type:     "push",
      status:        "dead",
      template_key:  "tpl_fpr_approved_flex_card",
      slot_values:   { request_id: requestId },
      target_type:   "user",
      target_id:     "U_dl_alert_tester",
      retried_count: 3,
      // created_at intentionally omitted → defaults to now()
    },
  );
  assertEquals(
    status,
    201,
    `seedDeadMessage: expected HTTP 201, got ${status} — ${JSON.stringify(data)}`,
  );
  const rows = data as Array<{ id: string }>;
  assertExists(rows[0]?.id, "seedDeadMessage: missing id in response");
  return rows[0].id;
}

// ─── Notification collector ───────────────────────────────────────────────────
//
// Opens a direct Postgres connection, LISTENs on CHANNEL, invokes
// fn_cron_alert_dead_letter_fpr() via SQL (same session), then flushes
// buffered server messages and returns all parsed JSON payloads.
//
// Implementation notes:
//  • LISTEN must be issued before the function call so no notifications are
//    missed if the server delivers them inline with the ReadyForQuery message.
//  • A second SELECT 1 round-trip flushes any notification messages that the
//    server buffered between the two ReadyForQuery boundaries.
//  • setTimeout(200ms) yields to the Deno microtask queue so that the
//    EventEmitter dispatch (which is synchronous inside readMessage) has
//    settled before we read the payloads array.

async function runAndCollect(): Promise<Array<Record<string, unknown>>> {
  const client = new Client(DB_URL);
  await client.connect();

  const payloads: Array<Record<string, unknown>> = [];

  try {
    // 1. Register LISTEN
    await client.queryArray(`LISTEN ${CHANNEL}`);

    // 2. Attach notification handler
    client.notifications.addListener(
      CHANNEL,
      (n: { payload?: string }) => {
        try {
          payloads.push(
            JSON.parse(n.payload ?? "{}") as Record<string, unknown>,
          );
        } catch { /* non-JSON notification — skip */ }
      },
    );

    // 3. Invoke the cron function.
    //    SECURITY DEFINER executes with definer privileges; the direct DB
    //    connection (postgres role) has sufficient rights to call it.
    //    pg_notify() inside the function queues notifications that the server
    //    includes in the ReadyForQuery response stream — deno-postgres
    //    dispatches them via the EventEmitter during readMessage().
    await client.queryArray("SELECT public.fn_cron_alert_dead_letter_fpr()");

    // 4. Flush any notification messages buffered after the previous response
    await client.queryArray("SELECT 1");

    // 5. Yield to settle the EventEmitter dispatch
    await new Promise((r) => setTimeout(r, 200));
  } finally {
    await client.end();
  }

  return payloads;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// ── Step 1: no dead rows ──────────────────────────────────────────────────────
//
// On a fresh integration DB (standard CI) there are no dead-status outbound
// messages in line_oa_outbound_messages.  The function always emits a summary
// notification; we verify its new_dead_count = 0.

Deno.test({
  name: "fn_cron_alert_dead_letter_fpr: no dead rows → summary new_dead_count = 0",
  async fn() {
    const payloads = await runAndCollect();

    // fn_cron_alert_dead_letter_fpr emits a summary notification regardless of
    // whether any dead rows were found (see 0210_fpr_dead_letter_monitoring.sql).
    const summary = payloads.find(
      (p) => p["alert"] === "fpr_dead_letter_summary",
    );
    assertExists(
      summary,
      `No summary payload received on channel '${CHANNEL}'. ` +
        `All payloads: ${JSON.stringify(payloads)}`,
    );
    assertEquals(
      summary["new_dead_count"],
      0,
      `Expected new_dead_count=0 on a clean DB, got ${summary["new_dead_count"]}`,
    );
    assertEquals(
      summary["window"],
      "1 hour",
      `Expected window='1 hour', got ${summary["window"]}`,
    );
  },
});

// ── Step 2: one dead row ──────────────────────────────────────────────────────
//
// Seed one FPR + one dead-letter outbound message that references it.
// Verify:
//   a) A per-row notification arrives on the channel with the correct
//      message_id (UUID of the seeded outbound row) and site_code (SITE).
//   b) The summary notification reports new_dead_count ≥ 1.
// Teardown removes the seeded rows in a finally block.

Deno.test({
  name: "fn_cron_alert_dead_letter_fpr: one dead row → per-row notify with correct message_id and site_code",
  async fn() {
    const fprId = await seedFpr();
    const msgId = await seedDeadMessage(fprId);

    try {
      const payloads = await runAndCollect();

      // ── a) Per-row alert ────────────────────────────────────────────────────
      // The function loops over dead rows and calls pg_notify once per row with
      // alert='fpr_dead_letter'.  We locate the payload that matches our seeded
      // message_id so the assertion is not sensitive to other dead rows that may
      // already exist.
      const rowAlert = payloads.find(
        (p) =>
          p["alert"] === "fpr_dead_letter" &&
          p["message_id"] === msgId,
      );
      assertExists(
        rowAlert,
        `No per-row payload found for message_id=${msgId}. ` +
          `Received payloads: ${JSON.stringify(payloads)}`,
      );
      assertEquals(
        rowAlert["message_id"],
        msgId,
        `message_id mismatch: expected ${msgId}, got ${rowAlert["message_id"]}`,
      );
      assertEquals(
        rowAlert["site_code"],
        SITE,
        `site_code mismatch: expected ${SITE}, got ${rowAlert["site_code"]}`,
      );

      // ── b) Summary alert ────────────────────────────────────────────────────
      // After the per-row loop, the function always emits a summary with the
      // total dead count for the last hour.
      const summary = payloads.find(
        (p) => p["alert"] === "fpr_dead_letter_summary",
      );
      assertExists(
        summary,
        `No summary payload received on channel '${CHANNEL}'. ` +
          `All payloads: ${JSON.stringify(payloads)}`,
      );
      const deadCount = summary["new_dead_count"] as number;
      assertEquals(
        typeof deadCount,
        "number",
        `new_dead_count should be a number, got ${typeof deadCount}`,
      );
      assertEquals(
        deadCount >= 1,
        true,
        `Expected new_dead_count ≥ 1 (at least our seeded row), got ${deadCount}`,
      );
    } finally {
      // Teardown — runs even if assertions above throw
      const { status: mDel } = await rest(
        "DELETE",
        `/rest/v1/line_oa_outbound_messages?id=eq.${msgId}`,
      );
      assertEquals(
        mDel,
        204,
        `Cleanup outbound message ${msgId}: expected HTTP 204, got ${mDel}`,
      );
      const { status: fDel } = await rest(
        "DELETE",
        `/rest/v1/field_purchase_request?id=eq.${fprId}`,
      );
      assertEquals(
        fDel,
        204,
        `Cleanup FPR ${fprId}: expected HTTP 204, got ${fDel}`,
      );
    }
  },
});
