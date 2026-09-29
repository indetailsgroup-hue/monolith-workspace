/**
 * line_oa_dispatch_worker_test.ts
 * Deno unit tests for supabase/functions/line-oa-dispatch-worker/index.ts
 *
 * Run: deno test --allow-env --no-check line_oa_dispatch_worker_test.ts
 *
 * All test paths return before any DB or network call, so --allow-net is not
 * needed. Static import is safe because the source file guards Deno.serve
 * with `if (import.meta.main)`.
 */

import {
  clearTemplateCache,
  handleDispatch,
} from "./supabase/functions/line-oa-dispatch-worker/index.ts";

// ---------------------------------------------------------------------------
// Minimal assertion helper — avoids remote std-lib imports entirely
// ---------------------------------------------------------------------------
function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(
      `${msg ? msg + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(
        actual
      )}`
    );
  }
}

// ---------------------------------------------------------------------------
// Env var helpers
// ---------------------------------------------------------------------------
const REQUIRED_VARS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LINE_CHANNEL_ACCESS_TOKEN",
] as const;

function setFakeEnv(): void {
  Deno.env.set("SUPABASE_URL", "https://fake.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "fake_service_role_key");
  Deno.env.set("LINE_CHANNEL_ACCESS_TOKEN", "fake_line_token");
}

function clearFakeEnv(): void {
  for (const v of REQUIRED_VARS) {
    Deno.env.delete(v);
  }
}

// ---------------------------------------------------------------------------
// clearTemplateCache tests
// ---------------------------------------------------------------------------

Deno.test("clearTemplateCache — runs without error on cold cache", () => {
  clearTemplateCache();
  // Must not throw — no assertion needed beyond reaching this line
});

Deno.test("clearTemplateCache — can be called multiple times without error", () => {
  clearTemplateCache();
  clearTemplateCache();
  clearTemplateCache();
  // Idempotent — must not throw on repeated calls
});

// ---------------------------------------------------------------------------
// handleDispatch — missing env vars → 500
// ---------------------------------------------------------------------------

Deno.test(
  "handleDispatch — returns 500 when required env vars are absent",
  async () => {
    // Save current values and delete them
    const saved: Record<string, string | undefined> = {};
    for (const v of REQUIRED_VARS) {
      saved[v] = Deno.env.get(v);
      Deno.env.delete(v);
    }

    try {
      const req = new Request("https://example.com/dispatch", {
        method: "POST",
      });
      const res = await handleDispatch(req);
      assertEquals(res.status, 500, "status must be 500");
      const body = await res.json();
      assertEquals(body.ok, false, "body.ok must be false");
    } finally {
      // Always restore
      for (const v of REQUIRED_VARS) {
        if (saved[v] !== undefined) Deno.env.set(v, saved[v]!);
      }
    }
  }
);

// ---------------------------------------------------------------------------
// handleDispatch — auth failures → 401
// ---------------------------------------------------------------------------

Deno.test(
  "handleDispatch — returns 401 when env vars set but no auth header provided",
  async () => {
    setFakeEnv();
    try {
      const req = new Request("https://example.com/dispatch", {
        method: "POST",
      });
      const res = await handleDispatch(req);
      assertEquals(res.status, 401, "status must be 401");
      const body = await res.json();
      assertEquals(body.ok, false, "body.ok must be false");
    } finally {
      clearFakeEnv();
    }
  }
);

Deno.test(
  "handleDispatch — returns 401 when wrong Bearer token provided",
  async () => {
    setFakeEnv();
    try {
      const req = new Request("https://example.com/dispatch", {
        method: "POST",
        headers: { Authorization: "Bearer definitely_wrong_token" },
      });
      const res = await handleDispatch(req);
      assertEquals(res.status, 401, "status must be 401");
      const body = await res.json();
      assertEquals(body.ok, false, "body.ok must be false");
    } finally {
      clearFakeEnv();
    }
  }
);

// ---------------------------------------------------------------------------
// handleDispatch — method gate → 405
// Bearer must equal SUPABASE_SERVICE_ROLE_KEY to pass auth before method check
// ---------------------------------------------------------------------------

Deno.test(
  "handleDispatch — returns 405 for GET request with correct Bearer token",
  async () => {
    setFakeEnv();
    try {
      // serviceKey = "fake_service_role_key" (set by setFakeEnv above)
      const req = new Request("https://example.com/dispatch", {
        method: "GET",
        headers: { Authorization: "Bearer fake_service_role_key" },
      });
      const res = await handleDispatch(req);
      assertEquals(res.status, 405, "status must be 405");
      const body = await res.json();
      assertEquals(body.ok, false, "body.ok must be false");
    } finally {
      clearFakeEnv();
    }
  }
);
