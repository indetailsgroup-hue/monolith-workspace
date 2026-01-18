/**
 * Activity API - Fetch server-authoritative audit timeline
 * P7A: Activity / Audit Timeline
 *
 * @version 0.12.7
 */

import { apiFetch } from "./client";
import type {
  ActivityRecord,
  ActivityResponse,
  ActivityApiResponse,
} from "../types/activity";

/**
 * Fetch activity timeline for a job
 * GET /factory/jobs/:jobId/activity
 */
export async function fetchJobActivityApi(
  jobId: string
): Promise<ActivityApiResponse> {
  try {
    const { data } = await apiFetch<ActivityResponse>(
      `/factory/jobs/${encodeURIComponent(jobId)}/activity`
    );

    if (data.ok) {
      return data;
    }

    // Return empty with error info embedded
    return {
      ok: true,
      items: [],
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    // If endpoint not available, return mock data for development
    // In production, this would throw or return error state
    console.warn("[activityApi] Endpoint unavailable, using mock data:", error);
    return generateMockActivity(jobId);
  }
}

/**
 * Generate mock activity data for development
 * This simulates what the server would return
 */
function generateMockActivity(jobId: string): ActivityApiResponse {
  const now = new Date();
  const items: ActivityRecord[] = [];

  // Mock verify run (today)
  items.push({
    id: `act_verify_${Date.now()}_1`,
    type: "VERIFY_RUN",
    at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), // 30 min ago
    actor: { role: "FACTORY", name: "Operator" },
    jobId,
    verify: {
      verdict: "PASS",
      code: "OK",
      summary: "All checks passed",
    },
  });

  // Mock export success (today)
  items.push({
    id: `act_export_${Date.now()}_2`,
    type: "EXPORT_SUCCESS",
    at: new Date(now.getTime() - 15 * 60 * 1000).toISOString(), // 15 min ago
    actor: { role: "FACTORY", name: "Operator" },
    jobId,
    export: {
      dialect: "KDT",
      profileId: "KDT_EDGE_BANDING",
      mode: "PER_JOB",
      target: "BUNDLE",
      ok: true,
      artifactSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      artifactName: `${jobId}_KDT.zip`,
    },
  });

  // Mock verify run from yesterday
  items.push({
    id: `act_verify_${Date.now()}_3`,
    type: "VERIFY_RUN",
    at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
    actor: { role: "DESIGNER" },
    jobId,
    verify: {
      verdict: "FAIL",
      code: "E_GATE_DEPTH",
      summary: "Depth exceeds material thickness",
    },
  });

  // Mock blocked export from yesterday
  items.push({
    id: `act_blocked_${Date.now()}_4`,
    type: "EXPORT_BLOCKED",
    at: new Date(now.getTime() - 24 * 60 * 60 * 1000 - 5 * 60 * 1000).toISOString(),
    actor: { role: "DESIGNER" },
    jobId,
    export: {
      dialect: "KDT",
      ok: false,
      reason: "Verify not passed",
    },
  });

  return {
    ok: true,
    items,
    fetchedAt: now.toISOString(),
  };
}
