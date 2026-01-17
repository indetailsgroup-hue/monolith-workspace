/**
 * Verify Service Tests
 * PR-P1.1-B.3 Real Verifier Integration
 *
 * Tests for the server-side verification service.
 *
 * @version 0.12.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  validateJobId,
  isValidJobId,
  InvalidJobIdError,
  getJobPacketPath,
} from "../verifierPaths";
import {
  buildSyntheticGolden,
  buildTimeoutGolden,
  buildExecErrorGolden,
  buildPacketMissingGolden,
} from "../syntheticGolden";
import {
  recordVerifyRun,
  clearAuditLog,
  getRecentAuditEntries,
  getAuditStats,
} from "../verifyAudit";
import { GOLDEN_HEADER, LOG_SEPARATOR } from "../../utils/goldenParser";

// ============================================================================
// Job ID Validation Tests
// ============================================================================

describe("validateJobId", () => {
  it("should accept valid job IDs", () => {
    expect(() => validateJobId("JOB-2024-001")).not.toThrow();
    expect(() => validateJobId("JOB_2024_001")).not.toThrow();
    expect(() => validateJobId("ABC123")).not.toThrow();
    expect(() => validateJobId("ABCDEF")).not.toThrow();
    expect(() => validateJobId("A".repeat(64))).not.toThrow();
  });

  it("should reject invalid job IDs", () => {
    // Too short
    expect(() => validateJobId("ABC")).toThrow(InvalidJobIdError);
    expect(() => validateJobId("12345")).toThrow(InvalidJobIdError);

    // Too long
    expect(() => validateJobId("A".repeat(65))).toThrow(InvalidJobIdError);

    // Invalid characters
    expect(() => validateJobId("job-2024-001")).toThrow(InvalidJobIdError); // lowercase
    expect(() => validateJobId("JOB/2024/001")).toThrow(InvalidJobIdError); // slash
    expect(() => validateJobId("JOB 2024 001")).toThrow(InvalidJobIdError); // space
    expect(() => validateJobId("JOB..2024")).toThrow(InvalidJobIdError); // dots
    expect(() => validateJobId("../../../etc")).toThrow(InvalidJobIdError); // path traversal
  });
});

describe("isValidJobId", () => {
  it("should return true for valid job IDs", () => {
    expect(isValidJobId("JOB-2024-001")).toBe(true);
    expect(isValidJobId("JOB_2024_001")).toBe(true);
  });

  it("should return false for invalid job IDs", () => {
    expect(isValidJobId("abc")).toBe(false);
    expect(isValidJobId("job-2024")).toBe(false);
    expect(isValidJobId("../..")).toBe(false);
  });
});

// ============================================================================
// Packet Path Tests
// ============================================================================

describe("getJobPacketPath", () => {
  beforeEach(() => {
    // Set up mock config
    process.env.IIMOS_JOB_STORAGE_ROOT = "/mock/jobs";
    process.env.IIMOS_VERIFIER_BIN_PATH = "/mock/bin";
    process.env.IIMOS_PROD_KEYS_PATH = "/mock/keys";
  });

  afterEach(() => {
    delete process.env.IIMOS_JOB_STORAGE_ROOT;
    delete process.env.IIMOS_VERIFIER_BIN_PATH;
    delete process.env.IIMOS_PROD_KEYS_PATH;
  });

  it("should throw for invalid job ID", () => {
    expect(() => getJobPacketPath("../../../etc/passwd")).toThrow(InvalidJobIdError);
  });
});

// ============================================================================
// Synthetic Golden Builder Tests
// ============================================================================

describe("buildSyntheticGolden", () => {
  it("should build valid golden output for timeout", () => {
    const result = buildTimeoutGolden("JOB-2024-001", 25000, 25123);

    expect(result.exitCode).toBe(71);
    expect(result.stdout).toContain(GOLDEN_HEADER);
    expect(result.stdout).toContain("VERDICT=FAIL");
    expect(result.stdout).toContain("CODE=E_VERIFY_TIMEOUT");
    expect(result.stdout).toContain("JOB_ID=JOB-2024-001");
    expect(result.stdout).toContain(LOG_SEPARATOR);
  });

  it("should build valid golden output for exec error", () => {
    const result = buildExecErrorGolden("JOB-2024-002", "Binary not found");

    expect(result.exitCode).toBe(70);
    expect(result.stdout).toContain(GOLDEN_HEADER);
    expect(result.stdout).toContain("VERDICT=FAIL");
    expect(result.stdout).toContain("CODE=E_VERIFY_EXEC");
    expect(result.stdout).toContain("Binary not found");
  });

  it("should build valid golden output for packet missing", () => {
    const result = buildPacketMissingGolden("JOB-2024-003", "/jobs/JOB-2024-003/packet.json");

    expect(result.exitCode).toBe(60);
    expect(result.stdout).toContain(GOLDEN_HEADER);
    expect(result.stdout).toContain("VERDICT=FAIL");
    expect(result.stdout).toContain("CODE=E_PACKET_MISSING");
  });

  it("should include Thai summary message", () => {
    const result = buildSyntheticGolden({
      code: "E_VERIFY_TIMEOUT",
      errorMessage: "Test timeout",
      jobId: "JOB-2024-001",
    });

    expect(result.stdout).toContain("SUMMARY_TH=");
    expect(result.stdout).toContain("ห้ามผลิต");
  });
});

// ============================================================================
// Audit Logging Tests
// ============================================================================

describe("verifyAudit", () => {
  beforeEach(() => {
    clearAuditLog();
  });

  it("should record verify run", async () => {
    const entry = await recordVerifyRun({
      jobId: "JOB-2024-001",
      verdict: "PASS",
      code: "OK",
      durationMs: 1234,
    });

    expect(entry.id).toMatch(/^audit_/);
    expect(entry.jobId).toBe("JOB-2024-001");
    expect(entry.verdict).toBe("PASS");
    expect(entry.code).toBe("OK");
    expect(entry.durationMs).toBe(1234);
    expect(entry.timestamp).toBeDefined();
  });

  it("should retrieve recent entries", async () => {
    await recordVerifyRun({
      jobId: "JOB-001",
      verdict: "PASS",
      code: "OK",
      durationMs: 100,
    });
    await recordVerifyRun({
      jobId: "JOB-002",
      verdict: "FAIL",
      code: "E_GATE_FAIL",
      durationMs: 200,
    });

    const entries = getRecentAuditEntries();

    expect(entries).toHaveLength(2);
    expect(entries[0].jobId).toBe("JOB-002"); // Most recent first
    expect(entries[1].jobId).toBe("JOB-001");
  });

  it("should compute audit stats", async () => {
    await recordVerifyRun({
      jobId: "JOB-001",
      verdict: "PASS",
      code: "OK",
      durationMs: 100,
    });
    await recordVerifyRun({
      jobId: "JOB-002",
      verdict: "FAIL",
      code: "E_GATE_FAIL",
      durationMs: 200,
    });
    await recordVerifyRun({
      jobId: "JOB-003",
      verdict: "PASS_WITH_WARN",
      code: "E_VERIFY_WARN",
      durationMs: 300,
    });

    const stats = getAuditStats();

    expect(stats.total).toBe(3);
    expect(stats.passed).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.warnings).toBe(1);
    expect(stats.avgDurationMs).toBe(200);
  });

  it("should flag security alerts", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await recordVerifyRun({
      jobId: "JOB-001",
      verdict: "FAIL",
      code: "E_VERIFY_CRASH",
      durationMs: 100,
      error: "PATH_TRAVERSAL",
      securityAlert: true,
    });

    const stats = getAuditStats();
    expect(stats.securityAlerts).toBe(1);

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// Integration Tests (Mock Mode)
// ============================================================================

describe("verifyService integration (mock mode)", () => {
  beforeEach(() => {
    process.env.IIMOS_VERIFY_MOCK = "true";
    clearAuditLog();
  });

  afterEach(() => {
    delete process.env.IIMOS_VERIFY_MOCK;
  });

  // Note: Full integration tests require actual verifier binary
  // These tests verify the mock mode works correctly

  it("should return mock PASS response", async () => {
    // Import dynamically to get fresh module with env var
    const { verifyJob } = await import("../verifyService");

    const response = await verifyJob("JOB-2024-001");

    expect(response.verdict).toBe("PASS");
    expect(response.code).toBe("OK");
    expect(response.checks).toHaveLength(4);
    expect(response.details?.mockMode).toBe(true);
  });
});
