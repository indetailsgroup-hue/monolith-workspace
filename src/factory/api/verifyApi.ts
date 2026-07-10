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
      const { data } = await apiFetch<Record<string, unknown>>(path, { method: "POST" });
      // ADR-061 packet store: backend คืน {ok, verdict PASS|FAIL, expected, computed, bytes}
      if (typeof data?.verdict === 'string' && ('computed' in data || 'expected' in data)) {
        const pass = data.verdict === 'PASS';
        return {
          verdict: pass ? 'PASS' : 'FAIL',
          code: pass ? 'OK' : 'HASH_MISMATCH',
          summary: pass
            ? `แพ็คเก็ตตรง anchor (${String(data.bytes ?? '?')} bytes)`
            : 'hash ไม่ตรง anchor — ห้ามผลิต',
          message: `expected ${String(data.expected ?? '')} computed ${String(data.computed ?? '')}`,
          log: JSON.stringify(data),
        } as VerifyApiResponse;
      }
      return data as unknown as VerifyApiResponse;
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
