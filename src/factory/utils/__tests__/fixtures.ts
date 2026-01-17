/**
 * Test Fixtures for Golden Parser & Verify Normalizer
 * PR-P1.1-B.1 - Golden Output Support
 *
 * @version 0.12.0
 */

// ============================================================================
// Golden Format Fixtures
// ============================================================================

/** Valid golden output - PASS */
export const GOLDEN_PASS = `IIMOS_VERIFY_V1
VERDICT=PASS
CODE=OK
EXIT_CODE=0
TOOL=iimos-verify
TOOL_VERSION=1.2.0
JOB_ID=JOB-2024-001
PACKET_PATH=/jobs/JOB-2024-001.packet.json
PACKET_SHA256=abc123def456
MANIFEST_HASH=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
PUBLIC_KEY_ID=factory-key-001
SIGNED_AT=2024-01-15T10:30:00Z
SUMMARY_TH=ผ่านการตรวจ (ผลิตได้)
---LOG---
[iimos-verify] Starting verification...
[iimos-verify] Signature valid
[iimos-verify] Manifest hash matches
[iimos-verify] Gate checks passed
[iimos-verify] All checks passed`;

/** Valid golden output - FAIL (signature) */
export const GOLDEN_FAIL_SIGNATURE = `IIMOS_VERIFY_V1
VERDICT=FAIL
CODE=E_SIGNATURE_INVALID
EXIT_CODE=32
TOOL=iimos-verify
TOOL_VERSION=1.2.0
JOB_ID=JOB-2024-002
PUBLIC_KEY_ID=factory-key-001
SUMMARY_TH=ลายเซ็นไม่ถูกต้อง (ห้ามผลิต)
---LOG---
[iimos-verify] Starting verification...
[iimos-verify] ERROR: Signature verification failed
[iimos-verify] Expected: abc123
[iimos-verify] Got: def456`;

/** Valid golden output - FAIL (gate) */
export const GOLDEN_FAIL_GATE = `IIMOS_VERIFY_V1
VERDICT=FAIL
CODE=E_GATE_FAIL
EXIT_CODE=50
TOOL=iimos-verify
TOOL_VERSION=1.2.0
JOB_ID=JOB-2024-003
GATE_VERDICT=FAIL
GATE_REPORT_HASH=abc123
SUMMARY_TH=ไม่ผ่านกฎโรงงาน (Gate Fail)
---LOG---
[iimos-verify] Starting verification...
[iimos-verify] Signature valid
[iimos-verify] Manifest hash matches
[iimos-verify] ERROR: Gate check failed - maxPanelSize exceeded`;

/** Valid golden output - PASS_WITH_WARN */
export const GOLDEN_PASS_WITH_WARN = `IIMOS_VERIFY_V1
VERDICT=PASS_WITH_WARN
CODE=W_AUDIT_UNKNOWN
EXIT_CODE=80
TOOL=iimos-verify
TOOL_VERSION=1.2.0
JOB_ID=JOB-2024-004
SUMMARY_TH=ผ่าน แต่ตรวจ audit ไม่สำเร็จ (ยังผลิตได้)
---LOG---
[iimos-verify] Starting verification...
[iimos-verify] Signature valid
[iimos-verify] Manifest hash matches
[iimos-verify] Gate checks passed
[iimos-verify] WARNING: Audit service unavailable`;

/** Invalid golden - missing VERDICT */
export const GOLDEN_INVALID_MISSING_VERDICT = `IIMOS_VERIFY_V1
CODE=OK
EXIT_CODE=0
TOOL=iimos-verify
TOOL_VERSION=1.2.0
SUMMARY_TH=ผ่านการตรวจ (ผลิตได้)
---LOG---
Some log content`;

/** Invalid golden - missing CODE */
export const GOLDEN_INVALID_MISSING_CODE = `IIMOS_VERIFY_V1
VERDICT=PASS
EXIT_CODE=0
TOOL=iimos-verify
TOOL_VERSION=1.2.0
SUMMARY_TH=ผ่านการตรวจ (ผลิตได้)
---LOG---
Some log content`;

/** Invalid golden - missing EXIT_CODE */
export const GOLDEN_INVALID_MISSING_EXIT_CODE = `IIMOS_VERIFY_V1
VERDICT=PASS
CODE=OK
TOOL=iimos-verify
TOOL_VERSION=1.2.0
SUMMARY_TH=ผ่านการตรวจ (ผลิตได้)
---LOG---
Some log content`;

/** Invalid golden - bad VERDICT value */
export const GOLDEN_INVALID_BAD_VERDICT = `IIMOS_VERIFY_V1
VERDICT=MAYBE
CODE=OK
EXIT_CODE=0
TOOL=iimos-verify
TOOL_VERSION=1.2.0
SUMMARY_TH=ผ่านการตรวจ (ผลิตได้)
---LOG---
Some log content`;

/** Invalid golden - non-numeric EXIT_CODE */
export const GOLDEN_INVALID_BAD_EXIT_CODE = `IIMOS_VERIFY_V1
VERDICT=PASS
CODE=OK
EXIT_CODE=abc
TOOL=iimos-verify
TOOL_VERSION=1.2.0
SUMMARY_TH=ผ่านการตรวจ (ผลิตได้)
---LOG---
Some log content`;

/** Golden with Windows line endings (CRLF) */
export const GOLDEN_CRLF = `IIMOS_VERIFY_V1\r
VERDICT=PASS\r
CODE=OK\r
EXIT_CODE=0\r
TOOL=iimos-verify\r
TOOL_VERSION=1.2.0\r
SUMMARY_TH=ผ่านการตรวจ (ผลิตได้)\r
---LOG---\r
Log with CRLF endings`;

/** Golden with empty log section */
export const GOLDEN_EMPTY_LOG = `IIMOS_VERIFY_V1
VERDICT=PASS
CODE=OK
EXIT_CODE=0
TOOL=iimos-verify
TOOL_VERSION=1.2.0
SUMMARY_TH=ผ่านการตรวจ (ผลิตได้)
---LOG---`;

/** Golden with extra unknown keys (should be ignored) */
export const GOLDEN_EXTRA_KEYS = `IIMOS_VERIFY_V1
VERDICT=PASS
CODE=OK
EXIT_CODE=0
TOOL=iimos-verify
TOOL_VERSION=1.2.0
SUMMARY_TH=ผ่านการตรวจ (ผลิตได้)
CUSTOM_KEY=custom_value
ANOTHER_KEY=another_value
---LOG---
Log content`;

// ============================================================================
// Legacy Format Fixtures
// ============================================================================

/** Legacy output - PASS (exit code 0) */
export const LEGACY_PASS = {
  exitCode: 0,
  stdout: `[verifier] Starting verification...
[verifier] Signature valid
[verifier] Manifest hash matches
[verifier] All checks passed`,
  stderr: "",
};

/** Legacy output - FAIL signature (exit code 32) */
export const LEGACY_FAIL_SIGNATURE = {
  exitCode: 32,
  stdout: "",
  stderr: `[verifier] ERROR: Signature verification failed
publicKeyId: factory-key-001
Expected hash: abc123
Got hash: def456`,
};

/** Legacy output - FAIL gate (exit code 50) */
export const LEGACY_FAIL_GATE = {
  exitCode: 50,
  stdout: "",
  stderr: `[verifier] ERROR: Gate check failed
verdict: FAIL
Reason: maxPanelSize exceeded`,
};

/** Legacy output - timeout (exit code 71) */
export const LEGACY_TIMEOUT = {
  exitCode: 71,
  stdout: "",
  stderr: "[verifier] Process killed after 30s timeout",
};

/** Legacy output - ENOENT (exit code 70) */
export const LEGACY_ENOENT = {
  exitCode: 70,
  stdout: "",
  stderr: "spawn iimos-verify ENOENT",
};

/** Legacy output - JSON parse error (exit code 61) */
export const LEGACY_JSON_ERROR = {
  exitCode: 61,
  stdout: "",
  stderr: "SyntaxError: Unexpected token < in JSON at position 0",
};

/** Legacy output - unknown exit code with pattern match */
export const LEGACY_UNKNOWN_EXIT_WITH_PATTERN = {
  exitCode: 99, // Unknown exit code
  stdout: "",
  stderr: "ERROR: KEY_NOT_ALLOWED - key xyz not in allowed list",
};

/** Legacy output - completely unknown */
export const LEGACY_UNKNOWN = {
  exitCode: 123,
  stdout: "",
  stderr: "Something unexpected happened",
};

// ============================================================================
// Expected Results
// ============================================================================

export const EXPECTED_GOLDEN_PASS = {
  verdict: "PASS",
  code: "OK",
  summary: "ผ่านการตรวจ (ผลิตได้)",
};

export const EXPECTED_GOLDEN_FAIL_SIGNATURE = {
  verdict: "FAIL",
  code: "E_SIGNATURE_INVALID",
  summary: "ลายเซ็นไม่ถูกต้อง (ห้ามผลิต)",
};

export const EXPECTED_GOLDEN_FAIL_GATE = {
  verdict: "FAIL",
  code: "E_GATE_FAIL",
  summary: "ไม่ผ่านกฎโรงงาน (Gate Fail)",
};

export const EXPECTED_GOLDEN_INVALID = {
  verdict: "FAIL",
  code: "E_VERIFY_UNKNOWN",
};

export const EXPECTED_LEGACY_PASS = {
  verdict: "PASS",
  code: "OK",
  summary: "ผ่านการตรวจ (ผลิตได้)",
};

export const EXPECTED_LEGACY_FAIL_SIGNATURE = {
  verdict: "FAIL",
  code: "E_SIGNATURE_INVALID",
  summary: "ลายเซ็นไม่ถูกต้อง (ห้ามผลิต)",
};
