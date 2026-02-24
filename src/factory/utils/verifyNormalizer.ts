/**
 * Verify Result Normalizer
 * P1.1 Factory Ops UX - PR-P1.1-B.1
 *
 * Golden-first normalization from monolith-verify output to VerifyApiResponse.
 *
 * Algorithm:
 * 1. Try golden format (MONOLITH_VERIFY_V1 header) first
 * 2. If golden but invalid keys → E_VERIFY_UNKNOWN (safe fallback)
 * 3. If not golden → legacy normalization (exit code + pattern match)
 *
 * Rules:
 * - exitCode is primary signal (legacy)
 * - Golden KV takes precedence
 * - log is VERBATIM (never rewrite)
 * - details extracted deterministically
 *
 * @version 0.12.0
 */

import type {
  VerifyVerdict,
  VerifyErrorCode,
  VerifyApiResponse,
  VerifyCheck,
} from "../types/job";

import {
  parseGoldenOutput,
  validateGoldenKV,
  extractGoldenDetails,
} from "./goldenParser";

// ============================================================================
// Types
// ============================================================================

export interface VerifyRawResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface NormalizationRule {
  verdict: VerifyVerdict;
  code: VerifyErrorCode;
  summary: string;
}

// ============================================================================
// Canonical Exit Code Mapping
// ============================================================================

const EXIT_CODE_MAP: Record<number, NormalizationRule> = {
  // Success
  0: {
    verdict: "PASS",
    code: "OK",
    summary: "ผ่านการตรวจ (ผลิตได้)",
  },

  // TRUST errors - Key/Signature (31-34)
  31: {
    verdict: "FAIL",
    code: "E_KEY_NOT_ALLOWED",
    summary: "คีย์ไม่อยู่ในรายการอนุญาต (ต้องอัปเดต keyset)",
  },
  32: {
    verdict: "FAIL",
    code: "E_SIGNATURE_INVALID",
    summary: "ลายเซ็นไม่ถูกต้อง (ห้ามผลิต)",
  },
  33: {
    verdict: "FAIL",
    code: "E_ROOT_HASH_MISMATCH",
    summary: "ข้อมูลถูกแก้ไขหลังเซ็น (ห้ามผลิต)",
  },
  34: {
    verdict: "FAIL",
    code: "E_COUNT_MISMATCH",
    summary: "แพ็กเกจไม่ครบ/จำนวนไม่ตรง (ห้ามผลิต)",
  },

  // TRUST errors - Audit Proof (40-43)
  40: {
    verdict: "FAIL",
    code: "E_PROOF_SCHEMA_INVALID",
    summary: "หลักฐาน audit รูปแบบผิด (ตรวจไม่ได้)",
  },
  41: {
    verdict: "FAIL",
    code: "E_PROOF_ROOT_MISMATCH",
    summary: "หลักฐาน audit ไม่ตรงกับ root (ห้ามผลิต)",
  },
  42: {
    verdict: "FAIL",
    code: "E_PROOF_SIGNATURE_INVALID",
    summary: "ลายเซ็น audit ไม่ถูกต้อง (ห้ามผลิต)",
  },
  43: {
    verdict: "FAIL",
    code: "E_PROOF_KEY_NOT_ALLOWED",
    summary: "คีย์ audit ไม่อนุญาต",
  },

  // GATE errors (50)
  50: {
    verdict: "FAIL",
    code: "E_GATE_FAIL",
    summary: "ไม่ผ่านกฎโรงงาน (Gate Fail)",
  },

  // PACKET errors (60-61)
  60: {
    verdict: "FAIL",
    code: "E_PACKET_SCHEMA",
    summary: "ไฟล์งานรูปแบบไม่ถูกต้อง/ฟิลด์หาย",
  },
  61: {
    verdict: "FAIL",
    code: "E_PACKET_PARSE",
    summary: "ไฟล์งานเสีย/อ่านไม่ได้ (JSON ผิด)",
  },

  // SYSTEM errors (70-71)
  70: {
    verdict: "FAIL",
    code: "E_VERIFY_EXEC",
    summary: "เรียก verifier ไม่ได้ (ต้องซ่อมระบบ)",
  },
  71: {
    verdict: "FAIL",
    code: "E_VERIFY_TIMEOUT",
    summary: "ตรวจนานเกินกำหนด (timeout)",
  },

  // Warnings (80)
  80: {
    verdict: "PASS_WITH_WARN",
    code: "W_AUDIT_UNKNOWN",
    summary: "ผ่าน แต่ตรวจ audit ไม่สำเร็จ (ยังผลิตได้)",
  },

  // Unknown (90)
  90: {
    verdict: "FAIL",
    code: "E_VERIFY_UNKNOWN",
    summary: "ตรวจไม่สำเร็จ (unknown)",
  },
};

// ============================================================================
// Pattern Matching Rules (for non-canonical exit codes)
// ============================================================================

interface PatternRule {
  patterns: RegExp[];
  rule: NormalizationRule;
}

const PATTERN_RULES: PatternRule[] = [
  // Key not allowed
  {
    patterns: [/KEY_NOT_ALLOWED/i, /not allowed key/i, /AUDIT_KEY_NOT_ALLOWED/i],
    rule: {
      verdict: "FAIL",
      code: "E_KEY_NOT_ALLOWED",
      summary: "คีย์ไม่อยู่ในรายการอนุญาต (ต้องอัปเดต keyset)",
    },
  },
  // Signature invalid
  {
    patterns: [/SIGNATURE_INVALID/i, /SIG_INVALID/i, /AUDIT_SIGNATURE_INVALID/i],
    rule: {
      verdict: "FAIL",
      code: "E_SIGNATURE_INVALID",
      summary: "ลายเซ็นไม่ถูกต้อง (ห้ามผลิต)",
    },
  },
  // Root/manifest hash mismatch
  {
    patterns: [/ROOT_HASH_MISMATCH/i, /MANIFEST_HASH_MISMATCH/i, /HASH_MISMATCH/i],
    rule: {
      verdict: "FAIL",
      code: "E_ROOT_HASH_MISMATCH",
      summary: "ข้อมูลถูกแก้ไขหลังเซ็น (ห้ามผลิต)",
    },
  },
  // Gate fail
  {
    patterns: [/GATE_FAIL/i, /E_GATE_FAIL/i, /verdict:\s*FAIL/i],
    rule: {
      verdict: "FAIL",
      code: "E_GATE_FAIL",
      summary: "ไม่ผ่านกฎโรงงาน (Gate Fail)",
    },
  },
  // Packet parse errors
  {
    patterns: [/Unexpected token/i, /JSON\.parse/i, /invalid json/i, /SyntaxError/i],
    rule: {
      verdict: "FAIL",
      code: "E_PACKET_PARSE",
      summary: "ไฟล์งานเสีย/อ่านไม่ได้ (JSON ผิด)",
    },
  },
  // Packet schema errors
  {
    patterns: [/SCHEMA_INVALID/i, /missing required/i, /E_PACKET_SCHEMA/i],
    rule: {
      verdict: "FAIL",
      code: "E_PACKET_SCHEMA",
      summary: "ไฟล์งานรูปแบบไม่ถูกต้อง/ฟิลด์หาย",
    },
  },
  // Verifier exec errors
  {
    patterns: [
      /ENOENT/i,
      /EACCES/i,
      /spawn .* ENOENT/i,
      /not recognized as an internal or external command/i,
      /command not found/i,
    ],
    rule: {
      verdict: "FAIL",
      code: "E_VERIFY_EXEC",
      summary: "เรียก verifier ไม่ได้ (ต้องซ่อมระบบ)",
    },
  },
  // Timeout
  {
    patterns: [/ETIMEDOUT/i, /timeout/i, /killed after/i, /process exceeded/i],
    rule: {
      verdict: "FAIL",
      code: "E_VERIFY_TIMEOUT",
      summary: "ตรวจนานเกินกำหนด (timeout)",
    },
  },
];

// Default fallback rule
const UNKNOWN_RULE: NormalizationRule = {
  verdict: "FAIL",
  code: "E_VERIFY_UNKNOWN",
  summary: "ตรวจไม่สำเร็จ (unknown)",
};

// ============================================================================
// Details Extraction (Deterministic)
// ============================================================================

interface ExtractedDetails {
  exitCode: number;
  publicKeyId?: string;
  manifestHash?: string;
  jobId?: string;
  [key: string]: unknown;
}

function extractDetails(log: string, exitCode: number): ExtractedDetails {
  const details: ExtractedDetails = { exitCode };

  // Extract publicKeyId
  const keyMatch = log.match(/publicKeyId[:=]\s*(\S+)/i);
  if (keyMatch) {
    details.publicKeyId = keyMatch[1];
  }

  // Extract manifestHash / rootHash (64 hex chars)
  const hashMatch = log.match(/(manifestHash|rootHash)[:=]\s*([a-f0-9]{64})/i);
  if (hashMatch) {
    details.manifestHash = hashMatch[2];
  }

  // Extract jobId
  const jobMatch = log.match(/jobId[:=]\s*([A-Z0-9\-_]+)/i);
  if (jobMatch) {
    details.jobId = jobMatch[1];
  }

  return details;
}

// ============================================================================
// Check Generation
// ============================================================================

function generateChecks(code: VerifyErrorCode, verdict: VerifyVerdict): VerifyCheck[] {
  if (verdict === "PASS") {
    return [
      { name: "Signature verification", status: "PASS" },
      { name: "Manifest integrity", status: "PASS" },
      { name: "Gate checks", status: "PASS" },
      { name: "Audit verification", status: "PASS" },
    ];
  }

  if (verdict === "PASS_WITH_WARN") {
    return [
      { name: "Signature verification", status: "PASS" },
      { name: "Manifest integrity", status: "PASS" },
      { name: "Gate checks", status: "PASS" },
      { name: "Audit verification", status: "WARN", message: "Unavailable" },
    ];
  }

  // FAIL - determine which check failed based on code
  const checks: VerifyCheck[] = [];

  // Signature check
  if (code.startsWith("E_SIGNATURE_") || code.startsWith("E_KEY_")) {
    checks.push({ name: "Signature verification", status: "FAIL" });
  } else {
    checks.push({ name: "Signature verification", status: "PASS" });
  }

  // Manifest check
  if (code.startsWith("E_ROOT_") || code.startsWith("E_COUNT_") || code.startsWith("E_PACKET_")) {
    checks.push({ name: "Manifest integrity", status: "FAIL" });
  } else {
    checks.push({ name: "Manifest integrity", status: "PASS" });
  }

  // Gate check
  if (code.startsWith("E_GATE_")) {
    checks.push({ name: "Gate checks", status: "FAIL" });
  } else {
    checks.push({ name: "Gate checks", status: "PASS" });
  }

  // Audit check
  if (code.startsWith("E_PROOF_")) {
    checks.push({ name: "Audit verification", status: "FAIL" });
  }

  return checks;
}

// ============================================================================
// Main Normalizer Function
// ============================================================================

/**
 * Normalize verifier raw output to structured VerifyApiResponse
 *
 * Algorithm (Golden-First):
 * 1. Try golden format (MONOLITH_VERIFY_V1 header) first
 * 2. If golden and valid → use golden KV directly
 * 3. If golden but invalid → E_VERIFY_UNKNOWN (safe fallback)
 * 4. If not golden → legacy normalization (exit code + pattern match)
 *
 * @param raw - Raw verifier result (exit code + stdout + stderr)
 * @returns Structured API response for frontend rendering
 */
export function normalizeVerifyResult(raw: VerifyRawResult): VerifyApiResponse {
  const { exitCode, stdout, stderr } = raw;
  const log = [stdout, stderr].filter(Boolean).join("\n");

  // 1) Try golden format first
  const parsed = parseGoldenOutput(log);

  if (parsed) {
    // Golden format detected - validate required keys
    const validation = validateGoldenKV(parsed.kv);

    if (validation.ok) {
      // Golden and valid → use golden KV directly
      const verdict = parsed.kv["VERDICT"] as VerifyVerdict;
      const code = parsed.kv["CODE"] as VerifyErrorCode;
      const summary = parsed.kv["SUMMARY_TH"];

      // Extract details from golden KV (includes exitCode)
      const details = extractGoldenDetails(parsed.kv);

      // Generate checks based on code and verdict
      const checks = generateChecks(code, verdict);

      return {
        verdict,
        code,
        summary,
        log: parsed.log, // Use verbatim log section
        timestamp: new Date().toISOString(),
        details,
        checks,
      };
    }

    // Golden but invalid → E_VERIFY_UNKNOWN (safe fallback)
    return {
      verdict: "FAIL",
      code: "E_VERIFY_UNKNOWN",
      summary: `Golden format invalid: ${validation.reason}`,
      log,
      timestamp: new Date().toISOString(),
      details: { exitCode, goldenValidationError: validation.reason },
      checks: generateChecks("E_VERIFY_UNKNOWN", "FAIL"),
    };
  }

  // 2) Not golden → legacy normalization
  return normalizeLegacy(raw);
}

/**
 * Legacy normalization (exit code + pattern matching)
 * Used when output is not in golden format
 */
function normalizeLegacy(raw: VerifyRawResult): VerifyApiResponse {
  const { exitCode, stdout, stderr } = raw;
  const log = [stdout, stderr].filter(Boolean).join("\n");

  // 1) Try canonical exit code mapping
  let rule = EXIT_CODE_MAP[exitCode];

  // 2) If not found, try pattern matching
  if (!rule) {
    for (const patternRule of PATTERN_RULES) {
      if (patternRule.patterns.some((p) => p.test(log))) {
        rule = patternRule.rule;
        break;
      }
    }
  }

  // 3) Fallback to unknown
  if (!rule) {
    rule = UNKNOWN_RULE;
  }

  // 4) Extract details
  const details = extractDetails(log, exitCode);

  // 5) Generate checks
  const checks = generateChecks(rule.code, rule.verdict);

  return {
    verdict: rule.verdict,
    code: rule.code,
    summary: rule.summary,
    log,
    timestamp: new Date().toISOString(),
    details,
    checks,
  };
}

/**
 * Normalize from error object (for frontend use)
 */
export function normalizeError(error: Error, timeoutMs?: number): VerifyApiResponse {
  const message = error.message.toLowerCase();
  const log = error.message + (error.stack ? `\n\n${error.stack}` : "");

  // Map error message to exit code equivalent
  let exitCode = 90; // Unknown

  if (message.includes("timeout")) {
    exitCode = 71;
  } else if (message.includes("enoent") || message.includes("eacces") || message.includes("not found")) {
    exitCode = 70;
  } else if (message.includes("json") || message.includes("parse") || message.includes("syntax")) {
    exitCode = 61;
  } else if (message.includes("schema") || message.includes("missing")) {
    exitCode = 60;
  } else if (message.includes("signature")) {
    exitCode = 32;
  } else if (message.includes("key")) {
    exitCode = 31;
  }

  return normalizeVerifyResult({
    exitCode,
    stdout: "",
    stderr: log,
  });
}

// ============================================================================
// Exports
// ============================================================================

export { EXIT_CODE_MAP, PATTERN_RULES };
