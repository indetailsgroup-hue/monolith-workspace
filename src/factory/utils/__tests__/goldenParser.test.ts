/**
 * Golden Parser Unit Tests
 * PR-P1.1-B.1 - Golden Output Support
 *
 * @version 0.12.0
 */

import { describe, it, expect } from "vitest";
import {
  parseGoldenOutput,
  validateGoldenKV,
  isGoldenFormat,
  extractGoldenDetails,
  buildGoldenOutput,
  buildTimeoutGolden,
  GOLDEN_HEADER,
  LOG_SEPARATOR,
  REQUIRED_KEYS,
  VALID_VERDICTS,
} from "../goldenParser";
import {
  GOLDEN_PASS,
  GOLDEN_FAIL_SIGNATURE,
  GOLDEN_FAIL_GATE,
  GOLDEN_PASS_WITH_WARN,
  GOLDEN_INVALID_MISSING_VERDICT,
  GOLDEN_INVALID_MISSING_CODE,
  GOLDEN_INVALID_MISSING_EXIT_CODE,
  GOLDEN_INVALID_BAD_VERDICT,
  GOLDEN_INVALID_BAD_EXIT_CODE,
  GOLDEN_CRLF,
  GOLDEN_EMPTY_LOG,
  GOLDEN_EXTRA_KEYS,
} from "./fixtures";

// ============================================================================
// parseGoldenOutput Tests
// ============================================================================

describe("parseGoldenOutput", () => {
  it("should parse valid PASS output", () => {
    const result = parseGoldenOutput(GOLDEN_PASS);
    expect(result).not.toBeNull();
    expect(result!.kv["VERDICT"]).toBe("PASS");
    expect(result!.kv["CODE"]).toBe("OK");
    expect(result!.kv["EXIT_CODE"]).toBe("0");
    expect(result!.kv["TOOL"]).toBe("monolith-verify");
    expect(result!.kv["JOB_ID"]).toBe("JOB-2024-001");
    expect(result!.log).toContain("[monolith-verify] Starting verification");
  });

  it("should parse valid FAIL (signature) output", () => {
    const result = parseGoldenOutput(GOLDEN_FAIL_SIGNATURE);
    expect(result).not.toBeNull();
    expect(result!.kv["VERDICT"]).toBe("FAIL");
    expect(result!.kv["CODE"]).toBe("E_SIGNATURE_INVALID");
    expect(result!.kv["EXIT_CODE"]).toBe("32");
    expect(result!.log).toContain("Signature verification failed");
  });

  it("should parse valid FAIL (gate) output", () => {
    const result = parseGoldenOutput(GOLDEN_FAIL_GATE);
    expect(result).not.toBeNull();
    expect(result!.kv["VERDICT"]).toBe("FAIL");
    expect(result!.kv["CODE"]).toBe("E_GATE_FAIL");
    expect(result!.kv["EXIT_CODE"]).toBe("50");
    expect(result!.kv["GATE_VERDICT"]).toBe("FAIL");
  });

  it("should parse valid PASS_WITH_WARN output", () => {
    const result = parseGoldenOutput(GOLDEN_PASS_WITH_WARN);
    expect(result).not.toBeNull();
    expect(result!.kv["VERDICT"]).toBe("PASS_WITH_WARN");
    expect(result!.kv["CODE"]).toBe("W_AUDIT_UNKNOWN");
    expect(result!.kv["EXIT_CODE"]).toBe("80");
  });

  it("should return null for non-golden output", () => {
    const result = parseGoldenOutput("Some random output\nwithout golden header");
    expect(result).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(parseGoldenOutput("")).toBeNull();
  });

  it("should return null for null/undefined", () => {
    expect(parseGoldenOutput(null as unknown as string)).toBeNull();
    expect(parseGoldenOutput(undefined as unknown as string)).toBeNull();
  });

  it("should handle CRLF line endings (Windows)", () => {
    const result = parseGoldenOutput(GOLDEN_CRLF);
    expect(result).not.toBeNull();
    expect(result!.kv["VERDICT"]).toBe("PASS");
    expect(result!.kv["CODE"]).toBe("OK");
  });

  it("should handle empty log section", () => {
    const result = parseGoldenOutput(GOLDEN_EMPTY_LOG);
    expect(result).not.toBeNull();
    expect(result!.log).toBe("");
  });

  it("should ignore unknown KV keys (tolerant parsing)", () => {
    const result = parseGoldenOutput(GOLDEN_EXTRA_KEYS);
    expect(result).not.toBeNull();
    expect(result!.kv["CUSTOM_KEY"]).toBe("custom_value");
    expect(result!.kv["ANOTHER_KEY"]).toBe("another_value");
  });

  it("should preserve verbatim log content", () => {
    const result = parseGoldenOutput(GOLDEN_PASS);
    expect(result).not.toBeNull();
    expect(result!.log).toContain("[monolith-verify] All checks passed");
  });
});

// ============================================================================
// validateGoldenKV Tests
// ============================================================================

describe("validateGoldenKV", () => {
  it("should validate complete KV as ok", () => {
    const result = parseGoldenOutput(GOLDEN_PASS);
    const validation = validateGoldenKV(result!.kv);
    expect(validation.ok).toBe(true);
  });

  it("should fail for missing VERDICT", () => {
    const result = parseGoldenOutput(GOLDEN_INVALID_MISSING_VERDICT);
    const validation = validateGoldenKV(result!.kv);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.reason).toBe("MISSING_VERDICT");
    }
  });

  it("should fail for missing CODE", () => {
    const result = parseGoldenOutput(GOLDEN_INVALID_MISSING_CODE);
    const validation = validateGoldenKV(result!.kv);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.reason).toBe("MISSING_CODE");
    }
  });

  it("should fail for missing EXIT_CODE", () => {
    const result = parseGoldenOutput(GOLDEN_INVALID_MISSING_EXIT_CODE);
    const validation = validateGoldenKV(result!.kv);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.reason).toBe("MISSING_EXIT_CODE");
    }
  });

  it("should fail for invalid VERDICT value", () => {
    const result = parseGoldenOutput(GOLDEN_INVALID_BAD_VERDICT);
    const validation = validateGoldenKV(result!.kv);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.reason).toBe("BAD_VERDICT");
    }
  });

  it("should fail for non-numeric EXIT_CODE", () => {
    const result = parseGoldenOutput(GOLDEN_INVALID_BAD_EXIT_CODE);
    const validation = validateGoldenKV(result!.kv);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.reason).toBe("BAD_EXIT_CODE");
    }
  });

  it("should validate all required keys", () => {
    // Ensure REQUIRED_KEYS constant has expected keys
    expect(REQUIRED_KEYS).toContain("VERDICT");
    expect(REQUIRED_KEYS).toContain("CODE");
    expect(REQUIRED_KEYS).toContain("EXIT_CODE");
    expect(REQUIRED_KEYS).toContain("TOOL");
    expect(REQUIRED_KEYS).toContain("TOOL_VERSION");
    expect(REQUIRED_KEYS).toContain("SUMMARY_TH");
  });
});

// ============================================================================
// isGoldenFormat Tests
// ============================================================================

describe("isGoldenFormat", () => {
  it("should return true for golden output", () => {
    expect(isGoldenFormat(GOLDEN_PASS)).toBe(true);
    expect(isGoldenFormat(GOLDEN_FAIL_SIGNATURE)).toBe(true);
    expect(isGoldenFormat(GOLDEN_FAIL_GATE)).toBe(true);
  });

  it("should return false for non-golden output", () => {
    expect(isGoldenFormat("Some random output")).toBe(false);
    expect(isGoldenFormat("[verifier] Starting...")).toBe(false);
  });

  it("should return false for empty/null input", () => {
    expect(isGoldenFormat("")).toBe(false);
    expect(isGoldenFormat(null as unknown as string)).toBe(false);
  });

  it("should handle whitespace around header", () => {
    expect(isGoldenFormat("  MONOLITH_VERIFY_V1  \nVERDICT=PASS")).toBe(true);
  });
});

// ============================================================================
// extractGoldenDetails Tests
// ============================================================================

describe("extractGoldenDetails", () => {
  it("should extract required details", () => {
    const result = parseGoldenOutput(GOLDEN_PASS);
    const details = extractGoldenDetails(result!.kv);

    expect(details.exitCode).toBe(0);
    expect(details.tool).toBe("monolith-verify");
    expect(details.toolVersion).toBe("1.2.0");
  });

  it("should extract optional details with camelCase conversion", () => {
    const result = parseGoldenOutput(GOLDEN_PASS);
    const details = extractGoldenDetails(result!.kv);

    expect(details.jobId).toBe("JOB-2024-001");
    expect(details.packetPath).toBe("/jobs/JOB-2024-001.packet.json");
    expect(details.packetSha256).toBe("abc123def456");
    expect(details.manifestHash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(details.publicKeyId).toBe("factory-key-001");
    expect(details.signedAt).toBe("2024-01-15T10:30:00Z");
  });

  it("should extract gate-related details", () => {
    const result = parseGoldenOutput(GOLDEN_FAIL_GATE);
    const details = extractGoldenDetails(result!.kv);

    expect(details.gateVerdict).toBe("FAIL");
    expect(details.gateReportHash).toBe("abc123");
  });

  it("should handle missing optional fields gracefully", () => {
    const result = parseGoldenOutput(GOLDEN_EMPTY_LOG);
    const details = extractGoldenDetails(result!.kv);

    expect(details.exitCode).toBe(0);
    expect(details.jobId).toBeUndefined();
    expect(details.packetPath).toBeUndefined();
  });
});

// ============================================================================
// buildGoldenOutput Tests
// ============================================================================

describe("buildGoldenOutput", () => {
  it("should build valid golden output string", () => {
    const output = buildGoldenOutput({
      verdict: "PASS",
      code: "OK",
      exitCode: 0,
      tool: "monolith-verify",
      toolVersion: "1.2.0",
      summaryTh: "ผ่านการตรวจ (ผลิตได้)",
    });

    expect(output).toContain(GOLDEN_HEADER);
    expect(output).toContain("VERDICT=PASS");
    expect(output).toContain("CODE=OK");
    expect(output).toContain("EXIT_CODE=0");
    expect(output).toContain("TOOL=monolith-verify");
    expect(output).toContain("TOOL_VERSION=1.2.0");
    expect(output).toContain("SUMMARY_TH=ผ่านการตรวจ (ผลิตได้)");
    expect(output).toContain(LOG_SEPARATOR);
  });

  it("should include optional details", () => {
    const output = buildGoldenOutput({
      verdict: "FAIL",
      code: "E_GATE_FAIL",
      exitCode: 50,
      tool: "monolith-verify",
      toolVersion: "1.2.0",
      summaryTh: "ไม่ผ่านกฎโรงงาน (Gate Fail)",
      details: {
        JOB_ID: "JOB-001",
        GATE_VERDICT: "FAIL",
      },
    });

    expect(output).toContain("JOB_ID=JOB-001");
    expect(output).toContain("GATE_VERDICT=FAIL");
  });

  it("should include log lines", () => {
    const output = buildGoldenOutput({
      verdict: "PASS",
      code: "OK",
      exitCode: 0,
      tool: "monolith-verify",
      toolVersion: "1.2.0",
      summaryTh: "ผ่านการตรวจ (ผลิตได้)",
      logLines: ["[verify] Starting...", "[verify] Done"],
    });

    expect(output).toContain("[verify] Starting...");
    expect(output).toContain("[verify] Done");
  });

  it("should be parseable by parseGoldenOutput", () => {
    const output = buildGoldenOutput({
      verdict: "PASS",
      code: "OK",
      exitCode: 0,
      tool: "monolith-verify",
      toolVersion: "1.2.0",
      summaryTh: "ผ่านการตรวจ (ผลิตได้)",
    });

    const parsed = parseGoldenOutput(output);
    expect(parsed).not.toBeNull();
    expect(parsed!.kv["VERDICT"]).toBe("PASS");

    const validation = validateGoldenKV(parsed!.kv);
    expect(validation.ok).toBe(true);
  });
});

// ============================================================================
// buildTimeoutGolden Tests
// ============================================================================

describe("buildTimeoutGolden", () => {
  it("should build timeout golden output", () => {
    const output = buildTimeoutGolden("JOB-001", 30000, "monolith-verify", "1.2.0");

    expect(output).toContain(GOLDEN_HEADER);
    expect(output).toContain("VERDICT=FAIL");
    expect(output).toContain("CODE=E_VERIFY_TIMEOUT");
    expect(output).toContain("EXIT_CODE=71");
    expect(output).toContain("JOB_ID=JOB-001");
    expect(output).toContain("30s timeout");
  });

  it("should handle missing jobId", () => {
    const output = buildTimeoutGolden("", 60000, "monolith-verify", "1.2.0");

    expect(output).toContain("VERDICT=FAIL");
    expect(output).toContain("60s timeout");
    expect(output).not.toContain("JOB_ID=");
  });

  it("should be parseable and valid", () => {
    const output = buildTimeoutGolden("JOB-002", 45000, "monolith-verify", "1.2.0");

    const parsed = parseGoldenOutput(output);
    expect(parsed).not.toBeNull();

    const validation = validateGoldenKV(parsed!.kv);
    expect(validation.ok).toBe(true);
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe("Constants", () => {
  it("should have correct GOLDEN_HEADER", () => {
    expect(GOLDEN_HEADER).toBe("MONOLITH_VERIFY_V1");
  });

  it("should have correct LOG_SEPARATOR", () => {
    expect(LOG_SEPARATOR).toBe("---LOG---");
  });

  it("should have correct VALID_VERDICTS", () => {
    expect(VALID_VERDICTS).toContain("PASS");
    expect(VALID_VERDICTS).toContain("FAIL");
    expect(VALID_VERDICTS).toContain("PASS_WITH_WARN");
    expect(VALID_VERDICTS).toHaveLength(3);
  });
});
