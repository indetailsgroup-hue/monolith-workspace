/**
 * verifyApi.ts - Verification API Client
 *
 * Priority 2: Wire validation to real backend
 *
 * ENDPOINTS:
 * - POST /api/bundle/upload - Upload bundle for verification
 * - GET /api/bundle/:id/verify - Get verification status
 */

import { apiPost, apiGet, USE_MOCK } from './client';

// ============================================================================
// Types
// ============================================================================

export type IssueSeverity = 'ERROR' | 'WARNING' | 'INFO';
export type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'WAIVED';

export interface VerifyIssue {
  code: string;
  domain: string;
  message: string;
  severity: IssueSeverity;
  path?: string;
  expected?: string;
  actual?: string;
}

export interface VerifyReport {
  ok: boolean;
  bundleId: string;
  timestamp: string;
  issues: VerifyIssue[];
  summary: {
    total: number;
    errors: number;
    warnings: number;
    info: number;
  };
  hash?: {
    manifest: string;
    signature?: string;
  };
}

export interface UploadBundleRequest {
  manifest: unknown;
  signature?: unknown;
  artifacts?: unknown[];
}

export interface UploadBundleResponse {
  ok: boolean;
  bundleId: string;
  verify: VerifyReport;
}

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_VERIFY_REPORT: VerifyReport = {
  ok: true,
  bundleId: 'mock_bundle_001',
  timestamp: new Date().toISOString(),
  issues: [
    {
      code: 'DIM_001',
      domain: 'DIMENSION',
      message: 'Panel thickness outside optimal range (18mm recommended)',
      severity: 'WARNING',
    },
  ],
  summary: {
    total: 1,
    errors: 0,
    warnings: 1,
    info: 0,
  },
};

// ============================================================================
// API Functions
// ============================================================================

/**
 * Upload a bundle for verification.
 */
export async function uploadBundle(
  bundle: UploadBundleRequest
): Promise<UploadBundleResponse> {
  if (USE_MOCK) {
    console.log('[MOCK] uploadBundle', bundle);
    return {
      ok: true,
      bundleId: 'mock_bundle_' + Date.now().toString(36),
      verify: MOCK_VERIFY_REPORT,
    };
  }

  return apiPost<UploadBundleResponse>('/api/bundle/upload', bundle);
}

/**
 * Get verification report for a bundle.
 */
export async function getVerifyReport(bundleId: string): Promise<VerifyReport> {
  if (USE_MOCK) {
    console.log('[MOCK] getVerifyReport', bundleId);
    return MOCK_VERIFY_REPORT;
  }

  return apiGet<VerifyReport>(`/api/bundle/${bundleId}/verify`);
}

/**
 * Run verification on current cabinet data.
 * This is a convenience function that packages cabinet data and uploads.
 */
export async function verifyCurrentSpec(
  manifest: unknown,
  signature?: unknown
): Promise<VerifyReport> {
  const response = await uploadBundle({
    manifest,
    signature,
  });

  return response.verify;
}

// ============================================================================
// Verify Status Helpers
// ============================================================================

export type VerifyStatus = 'PASS' | 'PASS_WITH_WARN' | 'FAIL' | 'PENDING';

/**
 * Determine overall verify status from report.
 */
export function getVerifyStatus(report: VerifyReport | null): VerifyStatus {
  if (!report) return 'PENDING';
  if (report.summary.errors > 0) return 'FAIL';
  if (report.summary.warnings > 0) return 'PASS_WITH_WARN';
  return 'PASS';
}

/**
 * Check if verification allows proceeding to next state.
 */
export function canProceedWithVerify(report: VerifyReport | null): boolean {
  const status = getVerifyStatus(report);
  return status === 'PASS' || status === 'PASS_WITH_WARN';
}
