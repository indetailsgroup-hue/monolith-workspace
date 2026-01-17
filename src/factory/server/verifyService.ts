/**
 * Verify Service - Main Orchestrator
 * PR-P1.1-B.3 Real Verifier Integration
 *
 * Orchestrates the complete verification flow:
 * 1. Resolve packet path (with security validation)
 * 2. Resolve verifier binary and keys paths
 * 3. Run verifier process
 * 4. Normalize output (golden-first)
 * 5. Return VerifyApiResponse
 *
 * @version 0.12.0
 */

import { getVerifyConfig, isVerifyMockMode } from "./verifyConfig";
import {
  resolveVerifierBin,
  resolveProdKeys,
  getValidatedPacketPath,
  validateJobId,
  InvalidJobIdError,
  PacketNotFoundError,
  VerifierMissingError,
  KeysMissingError,
  PathTraversalError,
} from "./verifierPaths";
import {
  runVerifier,
  combineOutput,
  isTimeout,
  isVerifierMissing,
  EXIT_CODE_TIMEOUT,
  EXIT_CODE_EXEC_ERROR,
} from "./runVerifier";
import {
  buildTimeoutGolden,
  buildExecErrorGolden,
  buildPacketMissingGolden,
  buildCrashGolden,
} from "./syntheticGolden";
import { normalizeVerifyResult } from "../utils/verifyNormalizer";
import { recordVerifyRun } from "./verifyAudit";
import type { VerifyApiResponse } from "../types/job";

// ============================================================================
// Service Errors
// ============================================================================

export class VerifyServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly jobId: string
  ) {
    super(message);
    this.name = "VerifyServiceError";
  }
}

// ============================================================================
// Mock Mode Support
// ============================================================================

/**
 * Get mock verify response for development
 */
async function getMockVerifyResponse(jobId: string): Promise<VerifyApiResponse> {
  // Simulate delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Return mock PASS response
  return {
    verdict: "PASS",
    code: "OK",
    summary: "ตรวจสอบผ่าน พร้อมผลิต",
    log: `[mock-verifier] Job ${jobId} verified successfully (mock mode)`,
    timestamp: new Date().toISOString(),
    checks: [
      { name: "Trust Chain", status: "PASS" },
      { name: "Audit Trail", status: "PASS" },
      { name: "Gate Checks", status: "PASS" },
      { name: "Packet Integrity", status: "PASS" },
    ],
    details: {
      mockMode: true,
      jobId,
    },
  };
}

// ============================================================================
// Main Service Function
// ============================================================================

/**
 * Verify a job's packet.
 *
 * This is the main entry point for verification.
 * Always returns a VerifyApiResponse - never throws for verification errors.
 *
 * @param jobId - Job ID to verify
 * @returns Normalized VerifyApiResponse
 */
export async function verifyJob(jobId: string): Promise<VerifyApiResponse> {
  const startTime = Date.now();

  // Check mock mode first
  if (isVerifyMockMode()) {
    const response = await getMockVerifyResponse(jobId);
    await recordVerifyRun({
      jobId,
      verdict: response.verdict,
      code: response.code,
      durationMs: Date.now() - startTime,
      mockMode: true,
    });
    return response;
  }

  // Validate job ID format (security)
  try {
    validateJobId(jobId);
  } catch (err) {
    if (err instanceof InvalidJobIdError) {
      const synthetic = buildCrashGolden(
        jobId,
        `Invalid job ID format: ${jobId}`
      );
      const response = normalizeVerifyResult({
        exitCode: synthetic.exitCode,
        stdout: synthetic.stdout,
        stderr: "",
      });
      await recordVerifyRun({
        jobId,
        verdict: response.verdict,
        code: response.code,
        durationMs: Date.now() - startTime,
        error: "INVALID_JOB_ID",
      });
      return response;
    }
    throw err;
  }

  // Get config
  const config = getVerifyConfig();

  // Step 1: Resolve and validate packet path
  let packetPath: string;
  try {
    packetPath = await getValidatedPacketPath(jobId);
  } catch (err) {
    const durationMs = Date.now() - startTime;

    if (err instanceof PacketNotFoundError) {
      const synthetic = buildPacketMissingGolden(jobId, err.expectedPath);
      const response = normalizeVerifyResult({
        exitCode: synthetic.exitCode,
        stdout: synthetic.stdout,
        stderr: "",
      });
      await recordVerifyRun({
        jobId,
        verdict: response.verdict,
        code: response.code,
        durationMs,
        error: "PACKET_NOT_FOUND",
      });
      return response;
    }

    if (err instanceof PathTraversalError) {
      const synthetic = buildCrashGolden(
        jobId,
        "Path traversal attempt blocked (security)"
      );
      const response = normalizeVerifyResult({
        exitCode: synthetic.exitCode,
        stdout: synthetic.stdout,
        stderr: "",
      });
      await recordVerifyRun({
        jobId,
        verdict: response.verdict,
        code: response.code,
        durationMs,
        error: "PATH_TRAVERSAL",
        securityAlert: true,
      });
      return response;
    }

    throw err;
  }

  // Step 2: Resolve verifier binary and keys
  let verifierBin: string;
  let prodKeysPath: string;

  try {
    verifierBin = resolveVerifierBin();
  } catch (err) {
    const durationMs = Date.now() - startTime;

    if (err instanceof VerifierMissingError) {
      const synthetic = buildExecErrorGolden(
        jobId,
        "Verifier binary not found",
        durationMs
      );
      const response = normalizeVerifyResult({
        exitCode: synthetic.exitCode,
        stdout: synthetic.stdout,
        stderr: "",
      });
      await recordVerifyRun({
        jobId,
        verdict: response.verdict,
        code: response.code,
        durationMs,
        error: "VERIFIER_MISSING",
      });
      return response;
    }

    throw err;
  }

  try {
    prodKeysPath = resolveProdKeys();
  } catch (err) {
    const durationMs = Date.now() - startTime;

    if (err instanceof KeysMissingError) {
      const synthetic = buildExecErrorGolden(
        jobId,
        "Production keys file not found",
        durationMs
      );
      const response = normalizeVerifyResult({
        exitCode: synthetic.exitCode,
        stdout: synthetic.stdout,
        stderr: "",
      });
      await recordVerifyRun({
        jobId,
        verdict: response.verdict,
        code: response.code,
        durationMs,
        error: "KEYS_MISSING",
      });
      return response;
    }

    throw err;
  }

  // Step 3: Run verifier process
  let result;
  try {
    result = await runVerifier({
      packetPath,
      verifierBin,
      prodKeysPath,
      timeoutMs: config.timeoutMs,
      workdir: config.workdir,
      maxLogBytes: config.maxLogBytes,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;

    const synthetic = buildCrashGolden(
      jobId,
      err instanceof Error ? err.message : "Unknown spawn error",
      durationMs
    );
    const response = normalizeVerifyResult({
      exitCode: synthetic.exitCode,
      stdout: synthetic.stdout,
      stderr: "",
    });
    await recordVerifyRun({
      jobId,
      verdict: response.verdict,
      code: response.code,
      durationMs,
      error: "SPAWN_ERROR",
    });
    return response;
  }

  // Step 4: Handle timeout
  if (isTimeout(result)) {
    const synthetic = buildTimeoutGolden(
      jobId,
      config.timeoutMs,
      result.durationMs
    );
    const response = normalizeVerifyResult({
      exitCode: EXIT_CODE_TIMEOUT,
      stdout: synthetic.stdout,
      stderr: result.stderr,
    });
    await recordVerifyRun({
      jobId,
      verdict: response.verdict,
      code: response.code,
      durationMs: result.durationMs,
      error: "TIMEOUT",
    });
    return response;
  }

  // Step 5: Handle verifier missing (runtime check)
  if (isVerifierMissing(result)) {
    const synthetic = buildExecErrorGolden(
      jobId,
      "Verifier binary not executable",
      result.durationMs
    );
    const response = normalizeVerifyResult({
      exitCode: EXIT_CODE_EXEC_ERROR,
      stdout: synthetic.stdout,
      stderr: result.stderr,
    });
    await recordVerifyRun({
      jobId,
      verdict: response.verdict,
      code: response.code,
      durationMs: result.durationMs,
      error: "VERIFIER_NOT_EXECUTABLE",
    });
    return response;
  }

  // Step 6: Normalize verifier output (golden-first)
  const response = normalizeVerifyResult({
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  });

  // Step 7: Record audit log
  await recordVerifyRun({
    jobId,
    verdict: response.verdict,
    code: response.code,
    durationMs: result.durationMs,
    truncated: result.truncated,
  });

  return response;
}

// ============================================================================
// Batch Verification (Future)
// ============================================================================

/**
 * Verify multiple jobs in sequence.
 * Useful for batch operations.
 */
export async function verifyJobs(
  jobIds: string[]
): Promise<Map<string, VerifyApiResponse>> {
  const results = new Map<string, VerifyApiResponse>();

  for (const jobId of jobIds) {
    const response = await verifyJob(jobId);
    results.set(jobId, response);
  }

  return results;
}
