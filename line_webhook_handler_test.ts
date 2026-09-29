// Unit tests for line-webhook Edge Function (pure transport logic)
// Run: deno test --allow-env --no-check line_webhook_handler_test.ts
//
// NOTE: The module entrypoint calls Deno.serve when `typeof Deno !== 'undefined'`
// (always true in Deno). We patch Deno.serve to a no-op before the dynamic
// import so tests run without --allow-net.

// Patch Deno.serve before module import to prevent port binding
const _origServe = (Deno as any).serve;
(Deno as any).serve = () => undefined;

const { handleLineWebhook, deriveChannelIdentifier } = await import(
  "./supabase/functions/line-webhook/index.ts"
);

// Restore
(Deno as any).serve = _origServe;

// ---------------------------------------------------------------------------
// Minimal assertion helper — avoids remote std lib import (no --allow-net)
// ---------------------------------------------------------------------------
function assertEquals<T>(actual: T, expected: T, label?: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label ?? "assertEquals"} failed\n` +
        `  expected: ${JSON.stringify(expected)}\n` +
        `  actual:   ${JSON.stringify(actual)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRequest(
  method: string,
  url: string,
  body?: string,
  headers?: Record<string, string>,
): Request {
  return new Request(url, {
    method,
    body: body !== undefined ? body : null,
    headers: headers ?? {},
  });
}

/** Stub IngestFn — returns a preset result without touching the network */
function stubIngest(preset: { data?: unknown; error?: unknown }) {
  return async (_args: unknown) => ({
    data: (preset.data ?? null) as any,
    error: (preset.error ?? null) as any,
  });
}

// ---------------------------------------------------------------------------
// deriveChannelIdentifier
// ---------------------------------------------------------------------------

Deno.test("deriveChannelIdentifier: path segment after 'line-webhook'", () => {
  const req = makeRequest("POST", "https://fn.example.com/line-webhook/ch_abc");
  assertEquals(deriveChannelIdentifier(req, "{}"), "ch_abc");
});

Deno.test("deriveChannelIdentifier: ?channel= query param", () => {
  const req = makeRequest("POST", "https://fn.example.com/line-webhook?channel=my_ch");
  assertEquals(deriveChannelIdentifier(req, "{}"), "my_ch");
});

Deno.test("deriveChannelIdentifier: ?channel_identifier= query param", () => {
  const req = makeRequest("POST", "https://fn.example.com/?channel_identifier=ci_99");
  assertEquals(deriveChannelIdentifier(req, "{}"), "ci_99");
});

Deno.test("deriveChannelIdentifier: destination field in JSON body", () => {
  const req = makeRequest("POST", "https://fn.example.com/line-webhook");
  const body = JSON.stringify({ destination: "Uabc123", events: [] });
  assertEquals(deriveChannelIdentifier(req, body), "Uabc123");
});

Deno.test("deriveChannelIdentifier: returns null when no identifier available", () => {
  const req = makeRequest("POST", "https://fn.example.com/line-webhook");
  assertEquals(deriveChannelIdentifier(req, "{}"), null);
});

Deno.test("deriveChannelIdentifier: URL-decodes path segment", () => {
  const req = makeRequest("POST", "https://fn.example.com/line-webhook/ch%20test");
  assertEquals(deriveChannelIdentifier(req, "{}"), "ch test");
});

Deno.test("deriveChannelIdentifier: path segment takes priority over query param", () => {
  const req = makeRequest(
    "POST",
    "https://fn.example.com/line-webhook/from_path?channel=from_query",
  );
  assertEquals(deriveChannelIdentifier(req, "{}"), "from_path");
});

// ---------------------------------------------------------------------------
// handleLineWebhook
// ---------------------------------------------------------------------------

Deno.test("handleLineWebhook: 405 for non-POST method", async () => {
  const req = makeRequest("GET", "https://fn.example.com/line-webhook/ch1");
  const res = await handleLineWebhook(req, stubIngest({}));
  assertEquals(res.status, 405);
  const body = await res.json();
  assertEquals(body.error, "method_not_allowed");
});

Deno.test("handleLineWebhook: 400 when channel identifier cannot be derived", async () => {
  // URL has no path segment, no query param, body is empty object (no destination)
  const req = makeRequest("POST", "https://fn.example.com/functions/v1/", "{}");
  const res = await handleLineWebhook(req, stubIngest({ data: { accepted: true, reason: null } }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "unresolved_channel_identifier");
});

Deno.test("handleLineWebhook: 200 when ingest accepts delivery", async () => {
  const req = makeRequest(
    "POST",
    "https://fn.example.com/line-webhook/ch1",
    "{}",
    { "x-line-signature": "sha256=abc123" },
  );
  const res = await handleLineWebhook(
    req,
    stubIngest({ data: { accepted: true, reason: null } }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "accepted");
});

Deno.test("handleLineWebhook: 401 when ingest returns signature_invalid", async () => {
  const req = makeRequest("POST", "https://fn.example.com/line-webhook/ch1", "{}");
  const res = await handleLineWebhook(
    req,
    stubIngest({ data: { accepted: false, reason: "signature_invalid" } }),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "signature_invalid");
});

Deno.test("handleLineWebhook: 404 when ingest returns P0002 error code", async () => {
  const req = makeRequest("POST", "https://fn.example.com/line-webhook/ch1", "{}");
  const res = await handleLineWebhook(
    req,
    stubIngest({ error: { code: "P0002", message: "channel not found" } }),
  );
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.error, "channel_not_found");
});

Deno.test("handleLineWebhook: 400 when ingest returns non-P0002 error", async () => {
  const req = makeRequest("POST", "https://fn.example.com/line-webhook/ch1", "{}");
  const res = await handleLineWebhook(
    req,
    stubIngest({ error: { code: "42P01", message: "relation not found" } }),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "ingest_error");
});

Deno.test("handleLineWebhook: 400 when ingest rejects with non-signature reason", async () => {
  const req = makeRequest("POST", "https://fn.example.com/line-webhook/ch1", "{}");
  const res = await handleLineWebhook(
    req,
    stubIngest({ data: { accepted: false, reason: "payload_malformed" } }),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "payload_malformed");
});

Deno.test("handleLineWebhook: forwards signature and channel_identifier to ingest", async () => {
  let captured: any = null;
  const req = makeRequest(
    "POST",
    "https://fn.example.com/line-webhook/fpr_ch",
    `{"destination":"Uignored","events":[]}`,
    { "x-line-signature": "sha256=testsig" },
  );
  await handleLineWebhook(req, async (args) => {
    captured = args;
    return { data: { accepted: true, reason: null }, error: null };
  });
  assertEquals(captured?.signature, "sha256=testsig");
  assertEquals(captured?.channel_identifier, "fpr_ch");
});
