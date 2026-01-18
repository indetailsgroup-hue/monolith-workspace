// src/factory/api/verifyApi.ts
/**
 * Verify API - Server-authoritative verification
 * Priority 2: Wire to real backend
 */

import { apiFetch } from "./client";
import type { VerifyApiResponse } from "../types/job";

// Try a few canonical paths; stop at first non-404 success.
// This keeps FE compatible across server route prefixes.
const VERIFY_PATHS = (jobId: string) => [
  `/factory/jobs/${encodeURIComponent(jobId)}/verify`,
  `/api/factory/jobs/${encodeURIComponent(jobId)}/verify`,
  `/api/jobs/${encodeURIComponent(jobId)}/verify`,
];

export async function verifyJobApi(jobId: string): Promise<VerifyApiResponse> {
  let lastErr: unknown = null;

  for (const path of VERIFY_PATHS(jobId)) {
    try {
      const { data } = await apiFetch<VerifyApiResponse>(path, { method: "POST" });
      return data;
    } catch (e: unknown) {
      lastErr = e;
      // Only continue on 404 (endpoint mismatch). Other errors are real.
      const err = e as { status?: number };
      if (err?.status === 404) continue;
      throw e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Verify endpoint not found");
}
