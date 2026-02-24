/**
 * Export Service - Core export logic with verify-on-export
 * P2.2 Export UX (Gated)
 *
 * @version 0.12.0
 */

import type {
  ExportRequest,
  ExportResponse,
  ExportResponseSuccess,
  ExportResponseError,
  ExportDialect,
  ExportProfileId,
} from "./exportTypes";
import { isValidDialect, isValidProfileId } from "./exportTypes";
import { validateDialectProfile, getProfileById } from "./exportOptions";
import { createAuditBuilder } from "./exportAudit";
import { createMockGcodeBundle, calculateSha256 } from "./zipBundle";
import { verifyJob } from "../verifyService";

// ============================================================================
// Configuration
// ============================================================================

/** Simulated verify check (in production, call actual verifier) */
const MOCK_VERIFY_ENABLED = true;

// ============================================================================
// Export Service
// ============================================================================

/**
 * Execute an export for a job.
 *
 * This function implements verify-on-export:
 * 1. Validate request parameters
 * 2. Run verification check
 * 3. If PASS, generate export
 * 4. Log audit entry
 * 5. Return result
 */
export async function executeExport(
  jobId: string,
  request: ExportRequest,
  options?: {
    /** Actor performing the export */
    exportedBy?: string;
    /** Client IP for audit */
    clientIp?: string;
  }
): Promise<ExportResponse> {
  const { exportedBy = "factory-operator", clientIp } = options || {};

  // Start audit builder
  const audit = createAuditBuilder(jobId, exportedBy);

  try {
    // 1. Validate request
    const validationResult = validateExportRequest(request);
    if (!validationResult.valid) {
      return {
        ok: false,
        code: validationResult.code!,
        message: validationResult.message!,
      };
    }

    // 2. Run verify-on-export
    const verifyResult = await runVerifyOnExport(jobId);
    if (!verifyResult.passed) {
      return {
        ok: false,
        code: "E_EXPORT_LOCKED",
        message: "Export blocked: verification did not pass",
        details: {
          verifyVerdict: verifyResult.verdict,
          verifyCode: verifyResult.code,
        },
      };
    }

    // 3. Generate export bundle
    const bundleResult = await generateExportBundle(jobId, request);
    if (!bundleResult.success) {
      return {
        ok: false,
        code: "E_EXPORT_GENERATION_FAILED",
        message: bundleResult.error || "Failed to generate export",
      };
    }

    // 4. Log audit
    audit.complete({
      dialect: request.dialect,
      profileId: request.profileId,
      target: request.target,
      mode: request.mode,
      sha256: bundleResult.sha256!,
      sizeBytes: bundleResult.sizeBytes!,
      clientIp,
    });

    // 5. Return success
    const response: ExportResponseSuccess = {
      ok: true,
      exportId: audit.exportId,
      sha256: bundleResult.sha256!,
      sizeBytes: bundleResult.sizeBytes!,
      filename: bundleResult.filename!,
      downloadPath: `/api/factory/jobs/${jobId}/export/${audit.exportId}/download`,
      exportedAt: new Date().toISOString(),
      dialect: request.dialect,
      profileId: request.profileId,
      contents: {
        sheets: bundleResult.sheetCount || 0,
        files: bundleResult.fileCount || 0,
        hasManifest: request.include?.manifest !== false,
        hasPacket: request.include?.packet === true,
      },
    };

    return response;
  } catch (error) {
    console.error("[Export Service] Error:", error);
    return {
      ok: false,
      code: "E_EXPORT_INTERNAL",
      message: error instanceof Error ? error.message : "Internal export error",
    };
  }
}

// ============================================================================
// Validation
// ============================================================================

interface ValidationResult {
  valid: boolean;
  code?: "E_EXPORT_DIALECT_INVALID" | "E_EXPORT_PROFILE_INVALID";
  message?: string;
}

function validateExportRequest(request: ExportRequest): ValidationResult {
  // Validate dialect
  if (!isValidDialect(request.dialect)) {
    return {
      valid: false,
      code: "E_EXPORT_DIALECT_INVALID",
      message: `Invalid dialect: ${request.dialect}`,
    };
  }

  // Validate profile
  if (!isValidProfileId(request.profileId)) {
    return {
      valid: false,
      code: "E_EXPORT_PROFILE_INVALID",
      message: `Invalid profile: ${request.profileId}`,
    };
  }

  // Validate dialect-profile combination
  const profileCheck = validateDialectProfile(request.dialect, request.profileId);
  if (!profileCheck.valid) {
    return {
      valid: false,
      code: "E_EXPORT_PROFILE_INVALID",
      message: profileCheck.error,
    };
  }

  return { valid: true };
}

// ============================================================================
// Verify-on-Export
// ============================================================================

interface VerifyOnExportResult {
  passed: boolean;
  verdict: string;
  code?: string;
}

/**
 * Run verification before export.
 * In production, this calls the actual verifier.
 * For MVP, we use mock logic.
 */
async function runVerifyOnExport(jobId: string): Promise<VerifyOnExportResult> {
  if (MOCK_VERIFY_ENABLED) {
    return runMockVerify(jobId);
  }

  // Call actual verifier service
  const result = await verifyJob(jobId);

  // Map VerifyApiResponse to VerifyOnExportResult
  // PASS and PASS_WITH_WARN both allow export; only FAIL blocks
  const passed = result.verdict === "PASS" || result.verdict === "PASS_WITH_WARN";

  return {
    passed,
    verdict: result.verdict,
    code: result.code,
  };
}

/**
 * Mock verify logic for development.
 */
async function runMockVerify(jobId: string): Promise<VerifyOnExportResult> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 100));

  // Mock: BLOCKED jobs fail verification
  if (jobId.includes("BLOCKED") || jobId.includes("0015")) {
    return {
      passed: false,
      verdict: "FAIL",
      code: "E_GATE_TOOL",
    };
  }

  // All other jobs pass
  return {
    passed: true,
    verdict: "PASS",
    code: "OK",
  };
}

// ============================================================================
// Bundle Generation
// ============================================================================

interface GenerateBundleResult {
  success: boolean;
  error?: string;
  sha256?: string;
  sizeBytes?: number;
  filename?: string;
  sheetCount?: number;
  fileCount?: number;
  data?: string | Uint8Array;
}

/**
 * Generate the export bundle.
 */
async function generateExportBundle(
  jobId: string,
  request: ExportRequest
): Promise<GenerateBundleResult> {
  try {
    // For MVP, use mock G-code generation
    // In production, this would:
    // 1. Load packet from storage
    // 2. Run post-processor for dialect/profile
    // 3. Bundle outputs

    const sheetCount = getSheetCountForJob(jobId);
    const bundle = await createMockGcodeBundle(jobId, request.dialect, sheetCount);

    return {
      success: true,
      sha256: bundle.sha256,
      sizeBytes: bundle.sizeBytes,
      filename: bundle.filename,
      sheetCount,
      fileCount: bundle.manifest.length,
      data: bundle.data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Bundle generation failed",
    };
  }
}

/**
 * Get sheet count for a job (mock).
 */
function getSheetCountForJob(jobId: string): number {
  // Mock: derive from job ID
  if (jobId.includes("0012")) return 6;
  if (jobId.includes("0013")) return 4;
  if (jobId.includes("0014")) return 8;
  return 2;
}

// ============================================================================
// Export File Retrieval
// ============================================================================

/** In-memory export cache (for MVP) */
const exportCache = new Map<string, { data: string | Uint8Array; filename: string }>();

/**
 * Store export data for later download.
 */
export function storeExportData(exportId: string, data: string | Uint8Array, filename: string): void {
  exportCache.set(exportId, { data, filename });

  // Clean up old entries (keep last 100)
  if (exportCache.size > 100) {
    const keys = Array.from(exportCache.keys());
    for (let i = 0; i < keys.length - 100; i++) {
      exportCache.delete(keys[i]);
    }
  }
}

/**
 * Get export data for download.
 */
export function getExportData(exportId: string): { data: string | Uint8Array; filename: string } | undefined {
  return exportCache.get(exportId);
}

/**
 * Execute export and store data for download.
 */
export async function executeAndStoreExport(
  jobId: string,
  request: ExportRequest,
  options?: { exportedBy?: string; clientIp?: string }
): Promise<ExportResponse> {
  const response = await executeExport(jobId, request, options);

  if (response.ok) {
    // Generate and store the actual bundle
    const sheetCount = getSheetCountForJob(jobId);
    const bundle = await createMockGcodeBundle(jobId, request.dialect, sheetCount);
    storeExportData(response.exportId, bundle.data, bundle.filename);
  }

  return response;
}
