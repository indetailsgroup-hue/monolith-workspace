// src/factory/api/exportApi.ts
/**
 * Export API - fetch options, export job, download zip
 * Priority 2: Wire to real backend with X-MONOLITH-ZIP-SHA256 header support
 */

import { apiFetch } from "./client";
import type {
  ExportOptionsResponse,
  ExportRequest,
  ExportResponse as GatedExportResponse,
} from "../components/export/exportTypes";

// ============================================================================
// Fetch Export Options
// ============================================================================

export async function fetchExportOptionsApi(): Promise<{
  data: ExportOptionsResponse;
  headers: Headers;
}> {
  return apiFetch<ExportOptionsResponse>("/factory/export/options", {
    method: "GET",
  });
}

// ============================================================================
// Run Gated Export (with SHA256 header)
// ============================================================================

export async function runGatedExportApi(
  jobId: string,
  req: ExportRequest
): Promise<{
  response: GatedExportResponse;
  sha256?: string;
}> {
  // ADR-061 packet store: export = GET signed URL (packet ที่ freeze แล้ว hash-anchored)
  void req; // dialect/profile เดิมไม่ใช้ — packet เป็นก้อนเดียวจาก Designer
  const { data } = await apiFetch<{ ok: boolean; url?: string; sha256?: string; revisionId?: string; error?: string; reason?: string }>(
    `/factory/jobs/${encodeURIComponent(jobId)}/export`,
    { method: "GET" }
  );
  if (!data.ok || !data.url) {
    throw new Error(data.reason ?? data.error ?? 'export not available');
  }
  const response = {
    ok: true,
    downloadPath: data.url,
    revisionId: data.revisionId,
  } as unknown as GatedExportResponse;
  return { response, sha256: data.sha256 };
}

// ============================================================================
// Download Export ZIP
// ============================================================================

export async function downloadExportApi(
  downloadPath: string
): Promise<{ blob: Blob; headers: Headers; sha256?: string }> {
  const res = await fetch(downloadPath); // signed URL — ไม่ต้องแนบ credentials

  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`);
  }

  const blob = await res.blob();
  const sha256 = res.headers.get("X-MONOLITH-ZIP-SHA256") ?? undefined;

  return { blob, headers: res.headers, sha256 };
}

// ============================================================================
// Trigger Browser Download
// ============================================================================

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ============================================================================
// Get Filename from Headers
// ============================================================================

export function getFilenameFromHeaders(headers: Headers, fallback: string): string {
  const cd = headers.get("content-disposition") ?? "";
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
  const raw = decodeURIComponent(m?.[1] ?? m?.[2] ?? "");
  return raw || fallback;
}
