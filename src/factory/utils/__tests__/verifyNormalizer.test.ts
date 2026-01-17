/**
 * Verify Normalizer Unit Tests
 * PR-P1.1-B.1 - Golden Output Support
 *
 * Tests golden-first normalization:
 * 1. Golden valid → use golden KV
 * 2. Golden invalid → E_VERIFY_UNKNOWN
 * 3. Non-golden → legacy normalization
 *
 * @version 0.12.0
 */

import { describe, it, expect } from "vitest";
import {
  normalizeVerifyResult,
  normalizeError,
  EXIT_CODE_MAP,
  PATTERN_RULES,
} from "../verifyNormalizer";
import type { VerifyRawResult } from "../verifyNormalizer";
import {
  GOLDEN_PASS,
  GOLDEN_FAIL_SIGNATURE,
  GOLDEN_FAIL_GATE,
  GOLDEN_PASS_WITH_WARN,
  GOLDEN_INVALID_MISSING_VERDICT,
  GOLDEN_INVALID_BAD_VERDICT,
  GOLDEN_CRLF,
  LEGACY_PASS,
  LEGACY_FAIL_SIGNATURE,
  LEGACY_FAIL_GATE,
  LEGACY_TIMEOUT,
  LEGACY_ENOENT,
  LEGACY_JSON_ERROR,
  LEGACY_UNKNOWN_EXIT_WITH_PATTERN,
  LEGACY_UNKNOWN,
  EXPECTED_GOLDEN_PASS,
  EXPECTED_GOLDEN_FAIL_SIGNATURE,
  EXPECTED_GOLDEN_FAIL_GATE,
  EXPECTED_GOLDEN_INVALID,
  EXPECTED_LEGACY_PASS,
  EXPECTED_LEGACY_FAIL_SIGNATURE,
} from "./fixtures";

// ============================================================================
// Golden Format Tests
// ============================================================================

describe("normalizeVerifyResult - Golden Format", () => {
  describe("Valid Golden Output", () => {
    it("should normalize golden PASS output", () => {
      const raw: VerifyRawResult = {
        exitCode: 0,
        stdout: GOLDEN_PASS,
        stderr: "",
      };

      const result = normalizeVerifyResult(raw);

      expect(result.verdict).toBe(EXPECTED_GOLDEN_PASS.verdict);
      expect(result.code).toBe(EXPECTED_GOLDEN_PASS.code);
      expect(result.summary).toBe(EXPECTED_GOLDEN_PASS.summary);
      expect(result.log).toContain("[iimos-verify] Starting verification");
      expect(result.details?.exitCode).toBe(0);
      expect(result.details?.jobId).toBe("JOB-2024-001");
      expect(result.timestamp).toBeDefined();
      expect(result.checks).toHaveLength(4);
    });

    it("should normalize golden FAIL (signature) output", () => {
      const raw: VerifyRawResult = {
        exitCode: 32,
        stdout: GOLDEN_FAIL_SIGNATURE,
        stderr: "",
      };

      const result = normalizeVerifyResult(raw);

      expect(result.verdict).toBe(EXPECTED_GOLDEN_FAIL_SIGNATURE.verdict);
      expect(result.code).toBe(EXPECTED_GOLDEN_FAIL_SIGNATURE.code);
      expect(result.summary).toBe(EXPECTED_GOLDEN_FAIL_SIGNATURE.summary);
      expect(result.details?.publicKeyId).toBe("factory-key-001");
    });

    it("should normalize golden FAIL (gate) output", () => {
      const raw: VerifyRawResult = {
        exitCode: 50,
        stdout: GOLDEN_FAIL_GATE,
        stderr: "",
      };

      const result = normalizeVerifyResult(raw);

      expect(result.verdict).toBe(EXPECTED_GOLDEN_FAIL_GATE.verdict);
      expect(result.code).toBe(EXPECTED_GOLDEN_FAIL_GATE.code);
      expect(result.summary).toBe(EXPECTED_GOLDEN_FAIL_GATE.summary);
      expect(result.details?.gateVerdict).toBe("FAIL");
    });

    it("should normalize golden PASS_WITH_WARN output", () => {
      const raw: VerifyRawResult = {
        exitCode: 80,
        stdout: GOLDEN_PASS_WITH_WARN,
        stderr: "",
      };

      const result = normalizeVerifyResult(raw);

      expect(result.verdict).toBe("PASS_WITH_WARN");
      expect(result.code).toBe("W_AUDIT_UNKNOWN");
    });

    it("should handle CRLF line endings", () => {
      const raw: VerifyRawResult = {
        exitCode: 0,
        stdout: GOLDEN_CRLF,
        stderr: "",
      };

      const result = normalizeVerifyResult(raw);

      expect(result.verdict).toBe("PASS");
      expect(result.code).toBe("OK");
    });

    it("should use verbatim log from golden output", () => {
      const raw: VerifyRawResult = {
        exitCode: 0,
        stdout: GOLDEN_PASS,
        stderr: "",
      };

      const result = normalizeVerifyResult(raw);

      // Log should be the verbatim content after ---LOG---
      expect(result.log).toContain("[iimos-verify] All checks passed");
      expect(result.log).not.toContain("IIMOS_VERIFY_V1");
      expect(result.log).not.toContain("VERDICT=");
    });
  });

  describe("Invalid Golden Output", () => {
    it("should return E_VERIFY_UNKNOWN for missing VERDICT", () => {
      const raw: VerifyRawResult = {
        exitCode: 0,
        stdout: GOLDEN_INVALID_MISSING_VERDICT,
        stderr: "",
      };

      const result = normalizeVerifyResult(raw);

      expect(result.verdict).toBe(EXPECTED_GOLDEN_INVALID.verdict);
      expect(result.code).toBe(EXPECTED_GOLDEN_INVALID.code);
      expect(result.summary).toContain("MISSING_VERDICT");
      expect(result.details?.goldenValidationError).toBe("MISSING_VERDICT");
    });

    it("should return E_VERIFY_UNKNOWN for invalid VERDICT value", () => {
      const raw: VerifyRawResult = {
        exitCode: 0,
        stdout: GOLDEN_INVALID_BAD_VERDICT,
        stderr: "",
      };

      const result = normalizeVerifyResult(raw);

      expect(result.verdict).toBe("FAIL");
      expect(result.code).toBe("E_VERIFY_UNKNOWN");
      expect(result.summary).toContain("BAD_VERDICT");
    });
  });
});

// ============================================================================
// Legacy Format Tests
// ============================================================================

describe("normalizeVerifyResult - Legacy Format", () => {
  describe("Exit Code Mapping", () => {
    it("should normalize legacy PASS (exit 0)", () => {
      const result = normalizeVerifyResult(LEGACY_PASS);

      expect(result.verdict).toBe(EXPECTED_LEGACY_PASS.verdict);
      expect(result.code).toBe(EXPECTED_LEGACY_PASS.code);
      expect(result.summary).toBe(EXPECTED_LEGACY_PASS.summary);
    });

    it("should normalize legacy FAIL signature (exit 32)", () => {
      const result = normalizeVerifyResult(LEGACY_FAIL_SIGNATURE);

      expect(result.verdict).toBe(EXPECTED_LEGACY_FAIL_SIGNATURE.verdict);
      expect(result.code).toBe(EXPECTED_LEGACY_FAIL_SIGNATURE.code);
      expect(result.details?.publicKeyId).toBe("factory-key-001");
    });

    it("should normalize legacy FAIL gate (exit 50)", () => {
      const result = normalizeVerifyResult(LEGACY_FAIL_GATE);

      expect(result.verdict).toBe("FAIL");
      expect(result.code).toBe("E_GATE_FAIL");
    });

    it("should normalize legacy timeout (exit 71)", () => {
      const result = normalizeVerifyResult(LEGACY_TIMEOUT);

      expect(result.verdict).toBe("FAIL");
      expect(result.code).toBe("E_VERIFY_TIMEOUT");
    });

    it("should normalize legacy ENOENT (exit 70)", () => {
      const result = normalizeVerifyResult(LEGACY_ENOENT);

      expect(result.verdict).toBe("FAIL");
      expect(result.code).toBe("E_VERIFY_EXEC");
    });

    it("should normalize legacy JSON error (exit 61)", () => {
      const result = normalizeVerifyResult(LEGACY_JSON_ERROR);

      expect(result.verdict).toBe("FAIL");
      expect(result.code).toBe("E_PACKET_PARSE");
    });
  });

  describe("Pattern Matching Fallback", () => {
    it("should use pattern match for unknown exit code", () => {
      const result = normalizeVerifyResult(LEGACY_UNKNOWN_EXIT_WITH_PATTERN);

      // Exit code 99 is unknown, but pattern matches KEY_NOT_ALLOWED
      expect(result.verdict).toBe("FAIL");
      expect(result.code).toBe("E_KEY_NOT_ALLOWED");
    });

    it("should return E_VERIFY_UNKNOWN for completely unknown output", () => {
      const result = normalizeVerifyResult(LEGACY_UNKNOWN);

      expect(result.verdict).toBe("FAIL");
      expect(result.code).toBe("E_VERIFY_UNKNOWN");
    });
  });

  describe("Detail Extraction", () => {
    it("should extract publicKeyId from log", () => {
      const result = normalizeVerifyResult(LEGACY_FAIL_SIGNATURE);

      expect(result.details?.publicKeyId).toBe("factory-key-001");
    });

    it("should include exitCode in details", () => {
      const result = normalizeVerifyResult(LEGACY_PASS);

      expect(result.details?.exitCode).toBe(0);
    });
  });
});

// ============================================================================
// normalizeError Tests
// ============================================================================

describe("normalizeError", () => {
  it("should normalize timeout error", () => {
    const error = new Error("Process timeout after 30s");
    const result = normalizeError(error);

    expect(result.verdict).toBe("FAIL");
    expect(result.code).toBe("E_VERIFY_TIMEOUT");
  });

  it("should normalize ENOENT error", () => {
    const error = new Error("spawn iimos-verify ENOENT");
    const result = normalizeError(error);

    expect(result.verdict).toBe("FAIL");
    expect(result.code).toBe("E_VERIFY_EXEC");
  });

  it("should normalize JSON parse error", () => {
    const error = new Error("SyntaxError: Unexpected token in JSON");
    const result = normalizeError(error);

    expect(result.verdict).toBe("FAIL");
    expect(result.code).toBe("E_PACKET_PARSE");
  });

  it("should normalize signature error", () => {
    const error = new Error("Signature verification failed");
    const result = normalizeError(error);

    expect(result.verdict).toBe("FAIL");
    expect(result.code).toBe("E_SIGNATURE_INVALID");
  });

  it("should normalize key error", () => {
    const error = new Error("Key not in allowed list");
    const result = normalizeError(error);

    expect(result.verdict).toBe("FAIL");
    expect(result.code).toBe("E_KEY_NOT_ALLOWED");
  });

  it("should fallback to E_VERIFY_UNKNOWN for unknown errors", () => {
    const error = new Error("Something completely unexpected");
    const result = normalizeError(error);

    expect(result.verdict).toBe("FAIL");
    expect(result.code).toBe("E_VERIFY_UNKNOWN");
  });

  it("should include error message in log", () => {
    const error = new Error("Test error message");
    const result = normalizeError(error);

    expect(result.log).toContain("Test error message");
  });

  it("should include stack trace if available", () => {
    const error = new Error("Test error");
    error.stack = "Error: Test error\n    at test.js:1:1";
    const result = normalizeError(error);

    expect(result.log).toContain("at test.js:1:1");
  });
});

// ============================================================================
// Check Generation Tests
// ============================================================================

describe("Check Generation", () => {
  it("should generate all PASS checks for PASS verdict", () => {
    const result = normalizeVerifyResult(LEGACY_PASS);

    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((c) => c.status === "PASS")).toBe(true);
  });

  it("should generate WARN check for PASS_WITH_WARN verdict", () => {
    const raw: VerifyRawResult = {
      exitCode: 80,
      stdout: "",
      stderr: "",
    };
    const result = normalizeVerifyResult(raw);

    expect(result.checks.some((c) => c.status === "WARN")).toBe(true);
  });

  it("should generate FAIL check for signature failure", () => {
    const result = normalizeVerifyResult(LEGACY_FAIL_SIGNATURE);

    const sigCheck = result.checks.find((c) => c.name === "Signature verification");
    expect(sigCheck?.status).toBe("FAIL");
  });

  it("should generate FAIL check for gate failure", () => {
    const result = normalizeVerifyResult(LEGACY_FAIL_GATE);

    const gateCheck = result.checks.find((c) => c.name === "Gate checks");
    expect(gateCheck?.status).toBe("FAIL");
  });
});

// ============================================================================
// Exit Code Map Tests
// ============================================================================

describe("EXIT_CODE_MAP", () => {
  it("should have mapping for exit code 0 (OK)", () => {
    expect(EXIT_CODE_MAP[0]).toBeDefined();
    expect(EXIT_CODE_MAP[0].verdict).toBe("PASS");
    expect(EXIT_CODE_MAP[0].code).toBe("OK");
  });

  it("should have mappings for TRUST errors (31-34)", () => {
    expect(EXIT_CODE_MAP[31].code).toBe("E_KEY_NOT_ALLOWED");
    expect(EXIT_CODE_MAP[32].code).toBe("E_SIGNATURE_INVALID");
    expect(EXIT_CODE_MAP[33].code).toBe("E_ROOT_HASH_MISMATCH");
    expect(EXIT_CODE_MAP[34].code).toBe("E_COUNT_MISMATCH");
  });

  it("should have mappings for AUDIT errors (40-43)", () => {
    expect(EXIT_CODE_MAP[40].code).toBe("E_PROOF_SCHEMA_INVALID");
    expect(EXIT_CODE_MAP[41].code).toBe("E_PROOF_ROOT_MISMATCH");
    expect(EXIT_CODE_MAP[42].code).toBe("E_PROOF_SIGNATURE_INVALID");
    expect(EXIT_CODE_MAP[43].code).toBe("E_PROOF_KEY_NOT_ALLOWED");
  });

  it("should have mapping for GATE error (50)", () => {
    expect(EXIT_CODE_MAP[50].code).toBe("E_GATE_FAIL");
  });

  it("should have mappings for PACKET errors (60-61)", () => {
    expect(EXIT_CODE_MAP[60].code).toBe("E_PACKET_SCHEMA");
    expect(EXIT_CODE_MAP[61].code).toBe("E_PACKET_PARSE");
  });

  it("should have mappings for SYSTEM errors (70-71)", () => {
    expect(EXIT_CODE_MAP[70].code).toBe("E_VERIFY_EXEC");
    expect(EXIT_CODE_MAP[71].code).toBe("E_VERIFY_TIMEOUT");
  });

  it("should have mapping for WARNING (80)", () => {
    expect(EXIT_CODE_MAP[80].verdict).toBe("PASS_WITH_WARN");
    expect(EXIT_CODE_MAP[80].code).toBe("W_AUDIT_UNKNOWN");
  });

  it("should have mapping for UNKNOWN (90)", () => {
    expect(EXIT_CODE_MAP[90].code).toBe("E_VERIFY_UNKNOWN");
  });
});

// ============================================================================
// Pattern Rules Tests
// ============================================================================

describe("PATTERN_RULES", () => {
  it("should have pattern rules defined", () => {
    expect(PATTERN_RULES.length).toBeGreaterThan(0);
  });

  it("should match KEY_NOT_ALLOWED patterns", () => {
    const keyRule = PATTERN_RULES.find((r) => r.rule.code === "E_KEY_NOT_ALLOWED");
    expect(keyRule).toBeDefined();
    expect(keyRule!.patterns.some((p) => p.test("KEY_NOT_ALLOWED"))).toBe(true);
    expect(keyRule!.patterns.some((p) => p.test("not allowed key"))).toBe(true);
  });

  it("should match SIGNATURE_INVALID patterns", () => {
    const sigRule = PATTERN_RULES.find((r) => r.rule.code === "E_SIGNATURE_INVALID");
    expect(sigRule).toBeDefined();
    expect(sigRule!.patterns.some((p) => p.test("SIGNATURE_INVALID"))).toBe(true);
  });

  it("should match timeout patterns", () => {
    const timeoutRule = PATTERN_RULES.find((r) => r.rule.code === "E_VERIFY_TIMEOUT");
    expect(timeoutRule).toBeDefined();
    expect(timeoutRule!.patterns.some((p) => p.test("ETIMEDOUT"))).toBe(true);
    expect(timeoutRule!.patterns.some((p) => p.test("timeout"))).toBe(true);
  });

  it("should match ENOENT patterns", () => {
    const execRule = PATTERN_RULES.find((r) => r.rule.code === "E_VERIFY_EXEC");
    expect(execRule).toBeDefined();
    expect(execRule!.patterns.some((p) => p.test("ENOENT"))).toBe(true);
    expect(execRule!.patterns.some((p) => p.test("command not found"))).toBe(true);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration", () => {
  it("should prefer golden format over exit code", () => {
    // Golden says FAIL, but exit code is 0
    const mixedGolden = `IIMOS_VERIFY_V1
VERDICT=FAIL
CODE=E_GATE_FAIL
EXIT_CODE=50
TOOL=iimos-verify
TOOL_VERSION=1.2.0
SUMMARY_TH=ไม่ผ่านกฎโรงงาน (Gate Fail)
---LOG---
Test log`;

    const raw: VerifyRawResult = {
      exitCode: 0, // Exit code says pass, but golden says fail
      stdout: mixedGolden,
      stderr: "",
    };

    const result = normalizeVerifyResult(raw);

    // Should use golden, not exit code
    expect(result.verdict).toBe("FAIL");
    expect(result.code).toBe("E_GATE_FAIL");
  });

  it("should combine stdout and stderr for log", () => {
    const raw: VerifyRawResult = {
      exitCode: 32,
      stdout: "[verifier] Starting...",
      stderr: "[verifier] ERROR: Signature failed",
    };

    const result = normalizeVerifyResult(raw);

    expect(result.log).toContain("[verifier] Starting...");
    expect(result.log).toContain("[verifier] ERROR: Signature failed");
  });

  it("should handle empty stdout and stderr", () => {
    const raw: VerifyRawResult = {
      exitCode: 0,
      stdout: "",
      stderr: "",
    };

    const result = normalizeVerifyResult(raw);

    expect(result.verdict).toBe("PASS");
    expect(result.log).toBe("");
  });

  it("should generate valid timestamp", () => {
    const raw: VerifyRawResult = {
      exitCode: 0,
      stdout: "",
      stderr: "",
    };

    const result = normalizeVerifyResult(raw);

    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).not.toBeNaN();
  });
});
