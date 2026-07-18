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
      // ADR-061 packet store + FS-B1-02: backend ตรวจแค่ storage integrity
      // (whole-ZIP hash เทียบ digest ที่บันทึก) — verdict ฝั่ง client ต้องไม่
      // กลายเป็น PASS เพราะไม่มีการตรวจ signature/authority/gate/NFP ใด ๆ
      // รองรับทั้ง response ใหม่ (STORAGE_HASH_MATCH) และเก่า (PASS) ระหว่างรอ
      // hosted deploy — ทั้งคู่คือ storage check จึง map เข้าคำเดียวกัน
      if (typeof data?.verdict === 'string' && ('computed' in data || 'expected' in data)) {
        const match = data.verdict === 'STORAGE_HASH_MATCH' || data.verdict === 'PASS';
        // Build the COMPLETE contract — VerifyConsole renders checks/timestamp
        // unconditionally. An `as VerifyApiResponse` cast here previously hid
        // the missing fields and crashed the console on the success path
        // (found by the live local-stack run, 2026-07-18).
        const response: VerifyApiResponse = {
          verdict: match ? 'STORAGE_HASH_MATCH' : 'FAIL',
          // E_PACKET_CHECKSUM is the real code for a digest mismatch — the old
          // 'HASH_MISMATCH' string was not in VerifyErrorCode at all (the cast hid
          // it, so ERROR_MESSAGES[code] resolved to undefined in the console)
          code: match ? 'OK' : 'E_PACKET_CHECKSUM',
          summary: match
            ? `ไบต์ตรงกับที่บันทึกไว้ (${String(data.bytes ?? '?')} bytes) — ตรวจ storage integrity เท่านั้น ไม่ใช่การ verify packet เต็มรูป`
            : 'hash ไม่ตรงกับที่บันทึก — ห้ามใช้ไฟล์นี้',
          message: `expected ${String(data.expected ?? '')} computed ${String(data.computed ?? '')}`,
          log: JSON.stringify(data),
          timestamp: new Date().toISOString(),
          // one honest row — this path never ran signature/manifest/gate/audit
          checks: [
            {
              name: 'Storage hash (stored ZIP bytes vs recorded digest)',
              status: match ? 'PASS' : 'FAIL',
              message: match ? undefined : 'computed digest differs from the recorded packet digest',
            },
          ],
        };
        return response;
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
