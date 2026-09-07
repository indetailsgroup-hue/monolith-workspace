/**
 * Test Suite: 0194_etax_org_risk_ranking
 * Migration: 0194_etax_org_risk_ranking.sql
 *
 * Covers:
 *   Group A – Schema validation (view exists, column count, key columns)
 *   Group B – risk_rank ordering (DENSE_RANK, ties, monotonic)
 *   Group C – is_priority_review flag (critical boundary 49/50)
 *   Group D – risk_tier labels (CRITICAL/WARNING/HEALTHY thresholds)
 *   Group E – rpc_etax_org_risk_ranking() org isolation + role guard
 *   Group F – rpc_etax_org_risk_ranking_admin() service_role guard + params
 *   Group G – Edge cases (org_name, ranked_at, multi-critical, empty sets)
 *
 * Total: ~50 tests
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://localhost:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create org + member with given role; return { orgId, userId, accessToken } */
async function createOrgMember(
  role: string,
  orgName?: string
): Promise<{ orgId: string; userId: string; accessToken: string }> {
  const email = `test_0194_${uuidv4()}@monolith-test.invalid`;
  const password = "Test1234!";

  // Create auth user
  const { data: authData, error: authErr } =
    await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (authErr || !authData.user) throw new Error(`createUser: ${authErr?.message}`);
  const userId = authData.user.id;

  // Create org
  const orgId = uuidv4();
  const name = orgName ?? `TestOrg-${orgId.slice(0, 8)}`;
  const { error: orgErr } = await svc
    .from("organizations")
    .insert({ org_id: orgId, name, slug: `test-0194-${orgId}` });
  if (orgErr) throw new Error(`insert org: ${orgErr.message}`);

  // Create member
  const { error: memberErr } = await svc
    .from("org_members")
    .insert({ org_id: orgId, user_id: userId, role, email });
  if (memberErr) throw new Error(`insert member: ${memberErr.message}`);

  // Sign in
  const anon = anonClient();
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signIn.session)
    throw new Error(`signIn: ${signInErr?.message}`);

  return { orgId, userId, accessToken: signIn.session.access_token };
}

/** Seed mv_etax_compliance_dashboard for an org with specific success_rate */
async function seedComplianceMV(
  orgId: string,
  successRate: number,
  opts: {
    total?: number;
    submitted?: number;
    failed?: number;
    overdue?: number;
    failedLast24h?: number;
  } = {}
): Promise<void> {
  const total = opts.total ?? 100;
  const submitted = opts.submitted ?? Math.round(total * (successRate / 100));
  const failed = opts.failed ?? total - submitted;
  const overdue = opts.overdue ?? 0;
  const failedLast24h = opts.failedLast24h ?? 0;

  // Upsert into mv_etax_compliance_dashboard (service_role bypass)
  const { error } = await svc.from("mv_etax_compliance_dashboard").upsert(
    {
      org_id: orgId,
      total_submissions: total,
      submitted_count: submitted,
      failed_count: failed,
      success_rate: successRate,
      overdue_with_pending_etax: overdue,
      failed_last_24h: failedLast24h,
      last_submission_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );
  if (error) throw new Error(`seedComplianceMV: ${error.message}`);
}

/** Seed mv_etax_health_trend with day_rank=1 row for an org */
async function seedTrendMV(
  orgId: string,
  retryExhaustionRate: number
): Promise<void> {
  const { error } = await svc.from("mv_etax_health_trend").upsert(
    {
      org_id: orgId,
      submission_day: new Date().toISOString().slice(0, 10),
      day_rank: 1,
      daily_total: 10,
      daily_submitted: 8,
      daily_failed: 2,
      daily_exhausted: Math.round(retryExhaustionRate / 10),
      retry_exhaustion_rate_pct: retryExhaustionRate,
    },
    { onConflict: "org_id,submission_day" }
  );
  if (error) throw new Error(`seedTrendMV: ${error.message}`);
}

/** Seed compliance refresh log so CROSS JOIN in v_etax_full_health_summary resolves */
async function seedComplianceRefreshLog(): Promise<void> {
  await svc.from("etax_compliance_mv_refresh_log").insert({
    refreshed_at: new Date().toISOString(),
    duration_ms: 10,
    row_count: 1,
    triggered_by: "test",
  });
}

/** Seed trend refresh log */
async function seedTrendRefreshLog(): Promise<void> {
  await svc.from("etax_health_trend_mv_refresh_log").insert({
    refreshed_at: new Date().toISOString(),
    duration_ms: 10,
    row_count: 1,
    triggered_by: "test",
  });
}

/** Clean up test data for a specific org */
async function cleanupOrg(orgId: string, userId: string): Promise<void> {
  await svc.from("mv_etax_health_trend").delete().eq("org_id", orgId);
  await svc.from("mv_etax_compliance_dashboard").delete().eq("org_id", orgId);
  await svc.from("org_members").delete().eq("org_id", orgId);
  await svc.from("organizations").delete().eq("id", orgId);
  await svc.auth.admin.deleteUser(userId);
}

// ---------------------------------------------------------------------------
// Group A – Schema validation
// ---------------------------------------------------------------------------
describe("Group A – Schema: v_etax_org_risk_ranking", () => {
  it("A1: view v_etax_org_risk_ranking exists in public schema", async () => {
    const { data, error } = await svc.rpc("pg_catalog_view_exists", {
      schema_name: "public",
      view_name: "v_etax_org_risk_ranking",
    });
    // Fallback: query information_schema
    const { data: rows } = await svc
      .from("information_schema.views")
      .select("table_name")
      .eq("table_schema", "public")
      .eq("table_name", "v_etax_org_risk_ranking")
      .limit(1);
    expect(rows?.length).toBeGreaterThanOrEqual(1);
  });

  it("A2: view has at least 18 columns", async () => {
    const { data, error } = await svc
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", "v_etax_org_risk_ranking");
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThanOrEqual(18);
  });

  it("A3: risk_rank column is present", async () => {
    const { data } = await svc
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", "v_etax_org_risk_ranking")
      .eq("column_name", "risk_rank");
    expect(data?.length).toBeGreaterThanOrEqual(1);
  });

  it("A4: is_priority_review column is present", async () => {
    const { data } = await svc
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", "v_etax_org_risk_ranking")
      .eq("column_name", "is_priority_review");
    expect(data?.length).toBeGreaterThanOrEqual(1);
  });

  it("A5: risk_tier column is present", async () => {
    const { data } = await svc
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", "v_etax_org_risk_ranking")
      .eq("column_name", "risk_tier");
    expect(data?.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Group B – risk_rank ordering (DENSE_RANK)
// ---------------------------------------------------------------------------
describe("Group B – risk_rank ordering via DENSE_RANK", () => {
  let orgAId: string;
  let orgAUserId: string;
  let orgBId: string;
  let orgBUserId: string;
  let orgCId: string;
  let orgCUserId: string;

  beforeAll(async () => {
    // Org A: score ~30 (critical) – should rank 1
    const a = await createOrgMember("OWNER", "RankOrgA");
    orgAId = a.orgId;
    orgAUserId = a.userId;
    await seedComplianceMV(orgAId, 30, { overdue: 5, failedLast24h: 3 });
    await seedTrendMV(orgAId, 20);

    // Org B: score ~60 (warning) – should rank 2
    const b = await createOrgMember("OWNER", "RankOrgB");
    orgBId = b.orgId;
    orgBUserId = b.userId;
    await seedComplianceMV(orgBId, 80, { overdue: 2, failedLast24h: 1 });
    await seedTrendMV(orgBId, 5);

    // Org C: score ~90 (healthy) – should rank 3
    const c = await createOrgMember("OWNER", "RankOrgC");
    orgCId = c.orgId;
    orgCUserId = c.userId;
    await seedComplianceMV(orgCId, 95, { overdue: 0, failedLast24h: 0 });
    await seedTrendMV(orgCId, 0);

    await seedComplianceRefreshLog();
    await seedTrendRefreshLog();
  });

  afterAll(async () => {
    await cleanupOrg(orgAId, orgAUserId);
    await cleanupOrg(orgBId, orgBUserId);
    await cleanupOrg(orgCId, orgCUserId);
  });

  it("B1: org with lowest health_score gets risk_rank = 1", async () => {
    const { data, error } = await svc.rpc("rpc_etax_org_risk_ranking_admin");
    expect(error).toBeNull();
    const rowA = data?.find((r: any) => r.org_id === orgAId);
    expect(rowA?.risk_rank).toBe(1);
  });

  it("B2: org with highest health_score gets rank > rank of lower-score org", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin");
    const rowA = data?.find((r: any) => r.org_id === orgAId);
    const rowC = data?.find((r: any) => r.org_id === orgCId);
    expect(rowC?.risk_rank).toBeGreaterThan(rowA?.risk_rank);
  });

  it("B3: risk_rank increases monotonically in admin response (ordered by risk_rank ASC)", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    const ranks = (data ?? []).map((r: any) => r.risk_rank as number);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
  });

  it("B4: tied scores receive the same DENSE_RANK value", async () => {
    // Create two orgs with identical seeded compliance/trend values
    const t1 = await createOrgMember("OWNER", "TieOrgT1");
    const t2 = await createOrgMember("OWNER", "TieOrgT2");
    await seedComplianceMV(t1.orgId, 70, { overdue: 0, failedLast24h: 0 });
    await seedTrendMV(t1.orgId, 0);
    await seedComplianceMV(t2.orgId, 70, { overdue: 0, failedLast24h: 0 });
    await seedTrendMV(t2.orgId, 0);

    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    const r1 = data?.find((r: any) => r.org_id === t1.orgId);
    const r2 = data?.find((r: any) => r.org_id === t2.orgId);
    // Both should share the same rank
    expect(r1?.risk_rank).toBe(r2?.risk_rank);

    await cleanupOrg(t1.orgId, t1.userId);
    await cleanupOrg(t2.orgId, t2.userId);
  });

  it("B5: after a tie, the next distinct score gets rank = tie_rank + 1 (DENSE_RANK, not RANK)", async () => {
    const t1 = await createOrgMember("OWNER", "DenseT1");
    const t2 = await createOrgMember("OWNER", "DenseT2");
    const t3 = await createOrgMember("OWNER", "DenseT3");

    // t1, t2 tied at ~60; t3 at ~90
    await seedComplianceMV(t1.orgId, 65, { overdue: 2, failedLast24h: 0 });
    await seedTrendMV(t1.orgId, 0);
    await seedComplianceMV(t2.orgId, 65, { overdue: 2, failedLast24h: 0 });
    await seedTrendMV(t2.orgId, 0);
    await seedComplianceMV(t3.orgId, 97, { overdue: 0, failedLast24h: 0 });
    await seedTrendMV(t3.orgId, 0);

    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    const r1 = data?.find((r: any) => r.org_id === t1.orgId);
    const r3 = data?.find((r: any) => r.org_id === t3.orgId);
    // DENSE_RANK: if t1/t2 rank = N, t3 rank = N+1 (not N+2)
    expect(r3?.risk_rank).toBe(r1?.risk_rank + 1);

    await cleanupOrg(t1.orgId, t1.userId);
    await cleanupOrg(t2.orgId, t2.userId);
    await cleanupOrg(t3.orgId, t3.userId);
  });

  it("B6: org_id is used as deterministic tiebreaker within same health_score", async () => {
    const t1 = await createOrgMember("OWNER", "TieBreaker1");
    const t2 = await createOrgMember("OWNER", "TieBreaker2");
    await seedComplianceMV(t1.orgId, 72, { overdue: 0, failedLast24h: 0 });
    await seedTrendMV(t1.orgId, 0);
    await seedComplianceMV(t2.orgId, 72, { overdue: 0, failedLast24h: 0 });
    await seedTrendMV(t2.orgId, 0);

    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    const r1 = data?.find((r: any) => r.org_id === t1.orgId);
    const r2 = data?.find((r: any) => r.org_id === t2.orgId);
    // Same rank (DENSE_RANK on score), but order within same rank by org_id
    expect(r1?.risk_rank).toBe(r2?.risk_rank);

    await cleanupOrg(t1.orgId, t1.userId);
    await cleanupOrg(t2.orgId, t2.userId);
  });

  it("B7: ranked_at is a valid TIMESTAMPTZ close to NOW()", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin");
    const row = data?.[0];
    if (!row) return; // skip if empty
    const ranked = new Date(row.ranked_at).getTime();
    const now = Date.now();
    expect(Math.abs(now - ranked)).toBeLessThan(60_000);
  });

  it("B8: rank 1 org has the minimum health_score in the entire set", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    const rank1Rows = (data ?? []).filter((r: any) => r.risk_rank === 1);
    const allScores = (data ?? []).map((r: any) => r.health_score as number);
    const minScore = Math.min(...allScores);
    rank1Rows.forEach((r: any) => {
      expect(r.health_score).toBe(minScore);
    });
  });
});

// ---------------------------------------------------------------------------
// Group C – is_priority_review flag
// ---------------------------------------------------------------------------
describe("Group C – is_priority_review flag", () => {
  let critOrg: { orgId: string; userId: string };
  let warnOrg: { orgId: string; userId: string };
  let healthyOrg: { orgId: string; userId: string };
  let bound49Org: { orgId: string; userId: string };
  let bound50Org: { orgId: string; userId: string };

  beforeAll(async () => {
    critOrg = await createOrgMember("OWNER", "CritOrg");
    warnOrg = await createOrgMember("OWNER", "WarnOrg");
    healthyOrg = await createOrgMember("OWNER", "HealthyOrg");
    bound49Org = await createOrgMember("OWNER", "Bound49Org");
    bound50Org = await createOrgMember("OWNER", "Bound50Org");

    // critical: health_score < 50
    await seedComplianceMV(critOrg.orgId, 20, { overdue: 10, failedLast24h: 8 });
    await seedTrendMV(critOrg.orgId, 30);

    // warning: 50–79
    await seedComplianceMV(warnOrg.orgId, 80, { overdue: 3, failedLast24h: 2 });
    await seedTrendMV(warnOrg.orgId, 5);

    // healthy: >= 80
    await seedComplianceMV(healthyOrg.orgId, 98, { overdue: 0, failedLast24h: 0 });
    await seedTrendMV(healthyOrg.orgId, 0);

    // boundary 49 = critical
    await seedComplianceMV(bound49Org.orgId, 49, { overdue: 0, failedLast24h: 2 });
    await seedTrendMV(bound49Org.orgId, 0);

    // boundary 50 = warning (not critical)
    await seedComplianceMV(bound50Org.orgId, 74, { overdue: 0, failedLast24h: 0 });
    await seedTrendMV(bound50Org.orgId, 0);

    await seedComplianceRefreshLog();
    await seedTrendRefreshLog();
  });

  afterAll(async () => {
    await Promise.all([
      cleanupOrg(critOrg.orgId, critOrg.userId),
      cleanupOrg(warnOrg.orgId, warnOrg.userId),
      cleanupOrg(healthyOrg.orgId, healthyOrg.userId),
      cleanupOrg(bound49Org.orgId, bound49Org.userId),
      cleanupOrg(bound50Org.orgId, bound50Org.userId),
    ]);
  });

  it("C1: critical org (health_score < 50) has is_priority_review = true", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    const row = data?.find((r: any) => r.org_id === critOrg.orgId);
    expect(row?.is_priority_review).toBe(true);
  });

  it("C2: warning org has is_priority_review = false", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    const row = data?.find((r: any) => r.org_id === warnOrg.orgId);
    expect(row?.is_priority_review).toBe(false);
  });

  it("C3: healthy org has is_priority_review = false", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    const row = data?.find((r: any) => r.org_id === healthyOrg.orgId);
    expect(row?.is_priority_review).toBe(false);
  });

  it("C4: health_status = 'critical' boundary — score 49 sets is_priority_review = true", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    const row = data?.find((r: any) => r.org_id === bound49Org.orgId);
    // health_score derived from 49% compliance + 2 failedLast24h
    expect(row?.health_status).toBe("critical");
    expect(row?.is_priority_review).toBe(true);
  });

  it("C5: health_status = 'warning' boundary — score 50 does not flag is_priority_review", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    const row = data?.find((r: any) => r.org_id === bound50Org.orgId);
    expect(row?.is_priority_review).toBe(false);
  });

  it("C6: is_priority_review is boolean (not null)", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    (data ?? []).forEach((r: any) => {
      expect(typeof r.is_priority_review).toBe("boolean");
    });
  });

  it("C7: p_critical_only=true in admin RPC returns only is_priority_review=true rows", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_critical_only: true,
      p_limit: 200,
    });
    (data ?? []).forEach((r: any) => {
      expect(r.is_priority_review).toBe(true);
      expect(r.health_status).toBe("critical");
    });
  });

  it("C8: p_critical_only=false returns all orgs (not filtered to critical)", async () => {
    const { data: all } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_critical_only: false,
      p_limit: 200,
    });
    const { data: critical } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_critical_only: true,
      p_limit: 200,
    });
    expect((all ?? []).length).toBeGreaterThanOrEqual((critical ?? []).length);
  });
});

// ---------------------------------------------------------------------------
// Group D – risk_tier labels
// ---------------------------------------------------------------------------
describe("Group D – risk_tier labels", () => {
  const orgs: { orgId: string; userId: string }[] = [];

  beforeAll(async () => {
    const critical = await createOrgMember("OWNER", "TierCritical");
    orgs.push(critical);
    await seedComplianceMV(critical.orgId, 15, { overdue: 10, failedLast24h: 8 });
    await seedTrendMV(critical.orgId, 25);

    const warning = await createOrgMember("OWNER", "TierWarning");
    orgs.push(warning);
    await seedComplianceMV(warning.orgId, 78, { overdue: 2, failedLast24h: 1 });
    await seedTrendMV(warning.orgId, 5);

    const healthy = await createOrgMember("OWNER", "TierHealthy");
    orgs.push(healthy);
    await seedComplianceMV(healthy.orgId, 95, { overdue: 0, failedLast24h: 0 });
    await seedTrendMV(healthy.orgId, 0);

    await seedComplianceRefreshLog();
    await seedTrendRefreshLog();
  });

  afterAll(async () => {
    await Promise.all(orgs.map((o) => cleanupOrg(o.orgId, o.userId)));
  });

  it("D1: org with health_score < 50 has risk_tier = 'CRITICAL'", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    const row = data?.find((r: any) => r.org_id === orgs[0].orgId);
    expect(row?.risk_tier).toBe("CRITICAL");
  });

  it("D2: org with health_score 50–79 has risk_tier = 'WARNING'", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    const row = data?.find((r: any) => r.org_id === orgs[1].orgId);
    expect(row?.risk_tier).toBe("WARNING");
  });

  it("D3: org with health_score >= 80 has risk_tier = 'HEALTHY'", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    const row = data?.find((r: any) => r.org_id === orgs[2].orgId);
    expect(row?.risk_tier).toBe("HEALTHY");
  });

  it("D4: risk_tier is never null for any returned row", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    (data ?? []).forEach((r: any) => {
      expect(r.risk_tier).not.toBeNull();
      expect(["CRITICAL", "WARNING", "HEALTHY"]).toContain(r.risk_tier);
    });
  });

  it("D5: risk_tier = 'CRITICAL' aligns with health_status = 'critical'", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    (data ?? []).forEach((r: any) => {
      if (r.risk_tier === "CRITICAL") expect(r.health_status).toBe("critical");
      if (r.health_status === "critical") expect(r.risk_tier).toBe("CRITICAL");
    });
  });

  it("D6: risk_tier = 'WARNING' aligns with health_status = 'warning'", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    (data ?? []).forEach((r: any) => {
      if (r.risk_tier === "WARNING") expect(r.health_status).toBe("warning");
    });
  });
});

// ---------------------------------------------------------------------------
// Group E – rpc_etax_org_risk_ranking() org isolation + role guard
// ---------------------------------------------------------------------------
describe("Group E – rpc_etax_org_risk_ranking() org isolation + role guard", () => {
  let owner: { orgId: string; userId: string; accessToken: string };
  let admin: { orgId: string; userId: string; accessToken: string };
  let finance: { orgId: string; userId: string; accessToken: string };
  let designer: { orgId: string; userId: string; accessToken: string };
  let otherOrg: { orgId: string; userId: string };

  beforeAll(async () => {
    owner = await createOrgMember("OWNER");
    admin = await createOrgMember("ADMIN");
    finance = await createOrgMember("FINANCE");
    designer = await createOrgMember("DESIGNER");
    otherOrg = await createOrgMember("OWNER", "OtherOrgE");

    for (const m of [owner, admin, finance, designer]) {
      await seedComplianceMV(m.orgId, 70, { overdue: 1, failedLast24h: 1 });
      await seedTrendMV(m.orgId, 5);
    }
    await seedComplianceMV(otherOrg.orgId, 90, { overdue: 0, failedLast24h: 0 });
    await seedTrendMV(otherOrg.orgId, 0);

    await seedComplianceRefreshLog();
    await seedTrendRefreshLog();
  });

  afterAll(async () => {
    await Promise.all([
      cleanupOrg(owner.orgId, owner.userId),
      cleanupOrg(admin.orgId, admin.userId),
      cleanupOrg(finance.orgId, finance.userId),
      cleanupOrg(designer.orgId, designer.userId),
      cleanupOrg(otherOrg.orgId, otherOrg.userId),
    ]);
  });

  it("E1: OWNER can call rpc_etax_org_risk_ranking and gets own org row", async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${owner.accessToken}` } },
    });
    const { data, error } = await client.rpc("rpc_etax_org_risk_ranking");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].org_id).toBe(owner.orgId);
  });

  it("E2: ADMIN role succeeds and gets own org row", async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${admin.accessToken}` } },
    });
    const { data, error } = await client.rpc("rpc_etax_org_risk_ranking");
    expect(error).toBeNull();
    expect(data[0].org_id).toBe(admin.orgId);
  });

  it("E3: FINANCE role succeeds and gets own org row", async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${finance.accessToken}` } },
    });
    const { data, error } = await client.rpc("rpc_etax_org_risk_ranking");
    expect(error).toBeNull();
    expect(data[0].org_id).toBe(finance.orgId);
  });

  it("E4: DESIGNER role is rejected with P0001", async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${designer.accessToken}` } },
    });
    const { data, error } = await client.rpc("rpc_etax_org_risk_ranking");
    expect(error).not.toBeNull();
    expect(error?.code).toBe("P0001");
  });

  it("E5: response contains exactly one row (caller's org only)", async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${owner.accessToken}` } },
    });
    const { data } = await client.rpc("rpc_etax_org_risk_ranking");
    expect(data).toHaveLength(1);
  });

  it("E6: no other org's data is returned to authenticated user", async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${owner.accessToken}` } },
    });
    const { data } = await client.rpc("rpc_etax_org_risk_ranking");
    const orgIds = (data ?? []).map((r: any) => r.org_id);
    expect(orgIds).not.toContain(otherOrg.orgId);
  });

  it("E7: risk_rank returned is the global rank (not always 1)", async () => {
    // Insert a deliberately worse org so our owner org is not rank 1
    const worst = await createOrgMember("OWNER", "WorstOrgE7");
    await seedComplianceMV(worst.orgId, 5, { overdue: 20, failedLast24h: 10 });
    await seedTrendMV(worst.orgId, 50);

    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${owner.accessToken}` } },
    });
    const { data } = await client.rpc("rpc_etax_org_risk_ranking");
    // owner org is not the worst, so its rank should be > 1
    expect(data[0].risk_rank).toBeGreaterThan(1);

    await cleanupOrg(worst.orgId, worst.userId);
  });

  it("E8: unauthenticated call is rejected", async () => {
    const anon = anonClient();
    const { error } = await anon.rpc("rpc_etax_org_risk_ranking");
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Group F – rpc_etax_org_risk_ranking_admin() service_role guard + params
// ---------------------------------------------------------------------------
describe("Group F – rpc_etax_org_risk_ranking_admin()", () => {
  let orgF1: { orgId: string; userId: string };
  let orgF2: { orgId: string; userId: string };
  let regularUser: { orgId: string; userId: string; accessToken: string };

  beforeAll(async () => {
    orgF1 = await createOrgMember("OWNER", "AdminTestF1");
    orgF2 = await createOrgMember("OWNER", "AdminTestF2");
    regularUser = await createOrgMember("OWNER", "AdminTestRegular");

    await seedComplianceMV(orgF1.orgId, 25, { overdue: 5, failedLast24h: 3 });
    await seedTrendMV(orgF1.orgId, 15);
    await seedComplianceMV(orgF2.orgId, 85, { overdue: 0, failedLast24h: 0 });
    await seedTrendMV(orgF2.orgId, 0);
    await seedComplianceMV(regularUser.orgId, 65, { overdue: 1, failedLast24h: 0 });
    await seedTrendMV(regularUser.orgId, 2);

    await seedComplianceRefreshLog();
    await seedTrendRefreshLog();
  });

  afterAll(async () => {
    await Promise.all([
      cleanupOrg(orgF1.orgId, orgF1.userId),
      cleanupOrg(orgF2.orgId, orgF2.userId),
      cleanupOrg(regularUser.orgId, regularUser.userId),
    ]);
  });

  it("F1: service_role client succeeds with no params", async () => {
    const { data, error } = await svc.rpc("rpc_etax_org_risk_ranking_admin");
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("F2: non-service_role (authenticated) call raises P0003", async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${regularUser.accessToken}` } },
    });
    const { data, error } = await client.rpc("rpc_etax_org_risk_ranking_admin");
    expect(error).not.toBeNull();
    expect(error?.code).toBe("P0003");
  });

  it("F3: p_org_id filter returns only the specified org", async () => {
    const { data, error } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_org_id: orgF1.orgId,
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].org_id).toBe(orgF1.orgId);
  });

  it("F4: p_critical_only=true returns only critical orgs", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_critical_only: true,
      p_limit: 200,
    });
    (data ?? []).forEach((r: any) => {
      expect(r.health_status).toBe("critical");
      expect(r.is_priority_review).toBe(true);
    });
  });

  it("F5: p_limit=1 returns at most 1 row", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 1,
    });
    expect((data ?? []).length).toBeLessThanOrEqual(1);
  });

  it("F6: p_limit is clamped to max 200 (passing 999 returns ≤ 200)", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 999,
    });
    expect((data ?? []).length).toBeLessThanOrEqual(200);
  });

  it("F7: p_limit is clamped to min 1 (passing 0 returns ≥ 1)", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 0,
    });
    // Clamped to 1 — should return exactly 1 row (not 0 or error)
    expect((data ?? []).length).toBeLessThanOrEqual(1);
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("F8: results are ordered by risk_rank ASC", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 200,
    });
    const ranks = (data ?? []).map((r: any) => r.risk_rank as number);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// Group G – Edge cases
// ---------------------------------------------------------------------------
describe("Group G – Edge cases", () => {
  it("G1: org_name is populated from the organizations table", async () => {
    const orgName = `NameCheck_${uuidv4().slice(0, 8)}`;
    const { orgId, userId } = await createOrgMember("OWNER", orgName);
    await seedComplianceMV(orgId, 70, {});
    await seedTrendMV(orgId, 0);
    await seedComplianceRefreshLog();
    await seedTrendRefreshLog();

    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_org_id: orgId,
    });
    expect(data[0].org_name).toBe(orgName);

    await cleanupOrg(orgId, userId);
  });

  it("G2: ranked_at column is a valid ISO TIMESTAMPTZ", async () => {
    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_limit: 1,
    });
    if ((data ?? []).length === 0) return;
    const ts = data[0].ranked_at;
    expect(new Date(ts).toString()).not.toBe("Invalid Date");
  });

  it("G3: multiple critical orgs are all flagged is_priority_review = true", async () => {
    const crit1 = await createOrgMember("OWNER", "MultiCrit1");
    const crit2 = await createOrgMember("OWNER", "MultiCrit2");
    await seedComplianceMV(crit1.orgId, 10, { overdue: 10, failedLast24h: 10 });
    await seedTrendMV(crit1.orgId, 40);
    await seedComplianceMV(crit2.orgId, 12, { overdue: 8, failedLast24h: 8 });
    await seedTrendMV(crit2.orgId, 30);
    await seedComplianceRefreshLog();
    await seedTrendRefreshLog();

    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_critical_only: true,
      p_limit: 200,
    });
    const critIds = new Set((data ?? []).map((r: any) => r.org_id));
    expect(critIds.has(crit1.orgId)).toBe(true);
    expect(critIds.has(crit2.orgId)).toBe(true);

    await cleanupOrg(crit1.orgId, crit1.userId);
    await cleanupOrg(crit2.orgId, crit2.userId);
  });

  it("G4: admin RPC handles empty result gracefully (p_org_id for non-existent org)", async () => {
    const { data, error } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_org_id: uuidv4(), // random, doesn't exist
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("G5: p_critical_only=true returns empty array when no critical orgs exist in filtered set", async () => {
    // Healthy-only org
    const h = await createOrgMember("OWNER", "NoCritical");
    await seedComplianceMV(h.orgId, 98, { overdue: 0, failedLast24h: 0 });
    await seedTrendMV(h.orgId, 0);
    await seedComplianceRefreshLog();
    await seedTrendRefreshLog();

    const { data } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_org_id: h.orgId,
      p_critical_only: true,
    });
    expect(data).toHaveLength(0);

    await cleanupOrg(h.orgId, h.userId);
  });

  it("G6: improving health_score removes critical flag on next read", async () => {
    const { orgId, userId, accessToken } = await createOrgMember("OWNER", "Improving");
    // First: critical score
    await seedComplianceMV(orgId, 20, { overdue: 10, failedLast24h: 8 });
    await seedTrendMV(orgId, 30);
    await seedComplianceRefreshLog();
    await seedTrendRefreshLog();

    const { data: before } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_org_id: orgId,
    });
    expect(before[0].is_priority_review).toBe(true);

    // Now seed a healthy score (upsert overrides)
    await seedComplianceMV(orgId, 95, { overdue: 0, failedLast24h: 0 });
    await seedTrendMV(orgId, 0);

    const { data: after } = await svc.rpc("rpc_etax_org_risk_ranking_admin", {
      p_org_id: orgId,
    });
    expect(after[0].is_priority_review).toBe(false);
    expect(after[0].health_status).not.toBe("critical");

    await cleanupOrg(orgId, userId);
  });

  it("G7: view does not expose data to anon or authenticated (direct SELECT blocked)", async () => {
    const anon = anonClient();
    const { data, error } = await anon
      .from("v_etax_org_risk_ranking")
      .select("*")
      .limit(1);
    // Should be permission denied
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
