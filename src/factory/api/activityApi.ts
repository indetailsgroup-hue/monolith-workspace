/**
 * Activity API - Fetch server-authoritative audit timeline
 * P7A: Activity / Audit Timeline
 * S18 L2: honest errors — no mock fallback. A fabricated "VERIFY PASS" in an
 * audit trail is worse than an error banner; failures must surface as errors
 * so the store can render ERROR state and the operator can retry.
 *
 * @version 0.12.8
 */

import { apiFetch } from "./client";
import type {
  ActivityResponse,
  ActivityApiResponse,
} from "../types/activity";

/**
 * Fetch activity timeline for a job
 * GET /factory/jobs/:jobId/activity
 *
 * Throws on transport failure AND on server ok:false — the caller
 * (factoryStore.fetchServerActivity) turns both into a retryable ERROR
 * cache entry. Never resolves with data the server did not send.
 */
export async function fetchJobActivityApi(
  jobId: string
): Promise<ActivityApiResponse> {
  const { data } = await apiFetch<ActivityResponse>(
    `/factory/jobs/${encodeURIComponent(jobId)}/activity`
  );

  if (!data.ok) {
    throw new Error(
      `Activity fetch failed (${data.code}): ${data.message}`
    );
  }

  return data;
}
