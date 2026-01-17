/**
 * Mock Data for Factory Ops Development
 * P1.1 Factory Ops UX
 *
 * Use this during development before backend is ready.
 * Exit codes follow canonical mapping from verifyNormalizer.
 *
 * @version 0.11.3
 */

import type {
  JobSummary,
  JobDetailData,
  VerifyResponse,
  VerifyApiResponse,
  VerifyErrorCode,
  ExportResponse,
  MachineType,
} from "../types/job";
import type { PacketResponseSuccess } from "../components/packet/packetTypes";
import type {
  ExportOptionsResponse,
  ExportRequest,
  ExportResponse as GatedExportResponse,
} from "../components/export/exportTypes";
import { getMockExportResponse as getMockGatedExportResponse } from "../server/export/exportRoute";

// ============================================================================
// Sample Jobs
// ============================================================================

export const mockJobSummaries: JobSummary[] = [
  {
    jobId: "JOB-2026-0012",
    projectName: "Penthouse A - Kitchen",
    customerName: "Bangkok Luxury Homes",
    status: "SIGNED",
    trust: {
      gate: "PASS",
      signature: "VALID",
      audit: "OK",
    },
    panelCount: 24,
    sheetCount: 6,
    machineSupport: ["KDT", "BIESSE"],
    createdAt: "2026-01-17T08:00:00Z",
    updatedAt: "2026-01-17T09:21:00Z",
  },
  {
    jobId: "JOB-2026-0013",
    projectName: "Condo B - Wardrobes",
    customerName: "Premium Interiors",
    status: "VERIFIED",
    trust: {
      gate: "PASS",
      signature: "VALID",
      audit: "OK",
    },
    panelCount: 18,
    sheetCount: 4,
    machineSupport: ["KDT", "BIESSE", "HOMAG"],
    createdAt: "2026-01-16T14:00:00Z",
    updatedAt: "2026-01-17T10:15:00Z",
  },
  {
    jobId: "JOB-2026-0014",
    projectName: "Office C - Storage",
    customerName: "Corporate Solutions",
    status: "IN_PRODUCTION",
    trust: {
      gate: "PASS",
      signature: "VALID",
      audit: "OK",
    },
    panelCount: 32,
    sheetCount: 8,
    machineSupport: ["HOMAG"],
    createdAt: "2026-01-15T09:00:00Z",
    updatedAt: "2026-01-17T07:30:00Z",
  },
  {
    jobId: "JOB-2026-0015",
    projectName: "Villa D - Bathroom",
    customerName: "Elite Homes",
    status: "BLOCKED",
    trust: {
      gate: "FAIL",
      signature: "VALID",
      audit: "OK",
    },
    panelCount: 12,
    sheetCount: 3,
    machineSupport: ["KDT"],
    createdAt: "2026-01-17T06:00:00Z",
    updatedAt: "2026-01-17T06:30:00Z",
  },
  {
    jobId: "JOB-2026-0011",
    projectName: "House E - Kitchen",
    customerName: "Home Sweet Home",
    status: "ARCHIVED",
    trust: {
      gate: "PASS",
      signature: "VALID",
      audit: "OK",
    },
    panelCount: 20,
    sheetCount: 5,
    machineSupport: ["KDT", "BIESSE"],
    createdAt: "2026-01-10T10:00:00Z",
    updatedAt: "2026-01-14T16:00:00Z",
  },
];

// ============================================================================
// Sample Job Details
// ============================================================================

export function getMockJobDetail(jobId: string): JobDetailData | null {
  const summary = mockJobSummaries.find((j) => j.jobId === jobId);
  if (!summary) return null;

  return {
    ...summary,
    packetUrl: `/api/factory/packets/${jobId}.zip`,
    materials: [
      {
        code: "MDF18",
        name: "MDF White",
        thickness: 18,
        sheetCount: Math.ceil(summary.sheetCount * 0.6),
      },
      {
        code: "PLY15",
        name: "Plywood Birch",
        thickness: 15,
        sheetCount: Math.ceil(summary.sheetCount * 0.4),
      },
    ],
    estimatedRuntime: {
      KDT: summary.panelCount * 2.5,
      BIESSE: summary.panelCount * 2.2,
      HOMAG: summary.panelCount * 2.0,
    },
    toolCount: {
      KDT: 4,
      BIESSE: 5,
      HOMAG: 6,
    },
    verifyLog: summary.status !== "SIGNED" ? getMockVerifyLog(true) : undefined,
    lastVerifiedAt:
      summary.status !== "SIGNED"
        ? new Date(Date.now() - 3600000).toISOString()
        : undefined,
    lastExportedAt:
      summary.status === "IN_PRODUCTION" || summary.status === "ARCHIVED"
        ? new Date(Date.now() - 7200000).toISOString()
        : undefined,
    lastExportedMachine:
      summary.status === "IN_PRODUCTION" || summary.status === "ARCHIVED"
        ? summary.machineSupport[0]
        : undefined,
  };
}

// ============================================================================
// Mock Verify Response
// ============================================================================

function getMockVerifyLog(pass: boolean): string {
  if (pass) {
    return `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Packet: JOB-2026-0012.zip
[verify] Job ID: JOB-2026-0012
[verify]
[verify] Contents:
[verify]   toolpaths/sheet_001.nc (verified)
[verify]   toolpaths/sheet_002.nc (verified)
[verify]   drawings/assembly.dxf (verified)
[verify]
[verify] Manifest hash: a1b2c3d4e5f6...
[verify] Signature: VALID
[verify] Signed by: arn:aws:kms:ap-southeast-1:123456789012:key/xxx
[verify] Signed at: 2026-01-17T09:00:00Z
[verify]
[verify] Gate status: PASS
[verify]   ✓ Geometry valid
[verify]   ✓ Tools available
[verify]   ✓ Depths within limits
[verify]   ✓ Clearances OK
[verify]

================================================================================
RESULT: PASS
================================================================================
This packet is safe to execute.

Exit code: 0`;
  }

  return `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Packet: JOB-2026-0015.zip
[verify] Job ID: JOB-2026-0015
[verify]
[verify] ERROR: Gate check failed
[verify] Detail: Tool T3 (8mm ball nose) not available
[verify]

================================================================================
RESULT: FAIL
================================================================================
DO NOT EXECUTE THIS PACKET.

Possible reasons:
- Required tool not available on machine
- Contact designer to resolve

Exit code: 20`;
}

export function getMockVerifyResponse(jobId: string): VerifyResponse {
  const job = mockJobSummaries.find((j) => j.jobId === jobId);
  const shouldPass = job?.status !== "BLOCKED";

  return {
    result: shouldPass ? "PASS" : "FAIL",
    verifierLog: getMockVerifyLog(shouldPass),
    timestamp: new Date().toISOString(),
    checks: [
      { name: "Signature verification", status: "PASS" },
      { name: "Manifest integrity", status: "PASS" },
      { name: "Gate: Geometry", status: shouldPass ? "PASS" : "FAIL", message: shouldPass ? undefined : "Tool not available" },
      { name: "Gate: Tools", status: shouldPass ? "PASS" : "FAIL" },
      { name: "Gate: Depths", status: "PASS" },
      { name: "Gate: Clearances", status: "PASS" },
    ],
  };
}

/**
 * Get mock VerifyApiResponse with factory-grade error codes
 * Use errorCode parameter to simulate specific error scenarios
 */
export function getMockVerifyApiResponse(
  jobId: string,
  errorCode?: VerifyErrorCode
): VerifyApiResponse {
  const job = mockJobSummaries.find((j) => j.jobId === jobId);

  // If specific error code requested, return that scenario
  if (errorCode && errorCode !== "OK") {
    return getMockErrorResponse(jobId, errorCode);
  }

  // Default behavior based on job status
  const shouldPass = job?.status !== "BLOCKED";

  if (shouldPass) {
    return {
      verdict: "PASS",
      code: "OK",
      summary: "ผ่านทุกการตรวจสอบ",
      log: getMockVerifyLog(true),
      timestamp: new Date().toISOString(),
      details: {
        publicKeyId: "key-prod-2026-001",
        manifestHash: "sha256:a1b2c3d4e5f6789...",
        exitCode: 0,
        verifierVersion: "1.2.0",
      },
      checks: [
        { name: "Signature verification", status: "PASS" },
        { name: "Manifest integrity", status: "PASS" },
        { name: "Gate: Geometry", status: "PASS" },
        { name: "Gate: Tools", status: "PASS" },
        { name: "Gate: Depths", status: "PASS" },
        { name: "Gate: Clearances", status: "PASS" },
      ],
    };
  }

  // BLOCKED job - return gate fail
  return getMockErrorResponse(jobId, "E_GATE_TOOL");
}

/**
 * Generate mock error responses for testing
 */
function getMockErrorResponse(jobId: string, code: VerifyErrorCode): VerifyApiResponse {
  // Canonical exit codes from verifyNormalizer.ts
  const errorScenarios: Record<VerifyErrorCode, Partial<VerifyApiResponse>> = {
    // ========================================================================
    // SYSTEM errors (70-71, 90)
    // ========================================================================
    E_VERIFY_TIMEOUT: {
      summary: "ตรวจนานเกินกำหนด (timeout)",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Starting verification for ${jobId}...
[verify] Processing packet...
[verify] ERROR: Process exceeded 60 second timeout

================================================================================
RESULT: FAIL
================================================================================

Exit code: 71`,
      details: { exitCode: 71, timeoutMs: 60000 },
    },
    E_VERIFY_EXEC: {
      summary: "เรียก verifier ไม่ได้ (ต้องซ่อมระบบ)",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

ERROR: Cannot execute verifier
spawn iimos-verify ENOENT
Command not found: iimos-verify

Please ensure the verifier is installed and in PATH.

Exit code: 70`,
      details: { exitCode: 70 },
    },
    E_VERIFY_CRASH: {
      summary: "โปรแกรม Verifier หยุดทำงาน",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Starting verification...
Segmentation fault (core dumped)

Exit code: 139`,
      details: { exitCode: 139 },
    },
    E_VERIFY_UNKNOWN: {
      summary: "ตรวจไม่สำเร็จ (unknown)",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Starting verification for ${jobId}...
[verify] ERROR: Unknown error occurred
[verify] Please contact IT support with this log.

Exit code: 90`,
      details: { exitCode: 90 },
    },

    // ========================================================================
    // PACKET errors (60-61)
    // ========================================================================
    E_PACKET_PARSE: {
      summary: "ไฟล์งานเสีย/อ่านไม่ได้ (JSON ผิด)",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Loading packet...
ERROR: JSON parse error at line 42, column 15
Unexpected token '}'
SyntaxError: Unexpected token } in JSON at position 1234

Exit code: 61`,
      details: { exitCode: 61, line: 42, column: 15 },
    },
    E_PACKET_SCHEMA: {
      summary: "ไฟล์งานรูปแบบไม่ถูกต้อง/ฟิลด์หาย",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Validating packet schema...
ERROR: SCHEMA_INVALID
ERROR: Missing required field 'toolpaths'
ERROR: Missing required field 'manifest.signature'

Exit code: 60`,
      details: { exitCode: 60, missingFields: ["toolpaths", "manifest.signature"] },
    },
    E_PACKET_CHECKSUM: {
      summary: "Checksum ไม่ตรง",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Verifying checksums...
ERROR: Checksum mismatch for toolpaths/sheet_001.nc
  Expected: abc123def456...
  Got: 789xyz000...

Exit code: 60`,
      details: { exitCode: 60, file: "toolpaths/sheet_001.nc" },
    },
    E_PACKET_MISSING: {
      summary: "ไฟล์ใน Packet ไม่ครบ",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Checking packet contents...
ERROR: Missing file: toolpaths/sheet_003.nc
ERROR: Missing file: drawings/assembly.dxf

Exit code: 60`,
      details: { exitCode: 60, missingFiles: ["toolpaths/sheet_003.nc", "drawings/assembly.dxf"] },
    },

    // ========================================================================
    // TRUST errors - Key/Signature (31-34)
    // ========================================================================
    E_KEY_NOT_ALLOWED: {
      summary: "คีย์ไม่อยู่ในรายการอนุญาต (ต้องอัปเดต keyset)",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Verifying signature...
ERROR: KEY_NOT_ALLOWED
  publicKeyId: key-dev-2025-999
  Allowed keys: key-prod-2026-001, key-prod-2026-002

Exit code: 31`,
      details: { exitCode: 31, publicKeyId: "key-dev-2025-999", allowedKeys: ["key-prod-2026-001", "key-prod-2026-002"] },
    },
    E_SIGNATURE_INVALID: {
      summary: "ลายเซ็นไม่ถูกต้อง (ห้ามผลิต)",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Verifying signature...
ERROR: SIGNATURE_INVALID
  publicKeyId: key-prod-2026-001
  manifestHash: a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890
  Signature does not match

WARNING: This file may have been tampered with!

Exit code: 32`,
      details: { exitCode: 32, publicKeyId: "key-prod-2026-001", manifestHash: "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890" },
    },
    E_ROOT_HASH_MISMATCH: {
      summary: "ข้อมูลถูกแก้ไขหลังเซ็น (ห้ามผลิต)",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Verifying manifest integrity...
ERROR: ROOT_HASH_MISMATCH
  Expected rootHash: a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890
  Computed rootHash: 9999999999999999999999999999999999999999999999999999999999999999

WARNING: Packet contents have been modified after signing!

Exit code: 33`,
      details: { exitCode: 33, expectedHash: "a1b2c3d4...", computedHash: "99999999..." },
    },
    E_COUNT_MISMATCH: {
      summary: "แพ็กเกจไม่ครบ/จำนวนไม่ตรง (ห้ามผลิต)",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Verifying panel count...
ERROR: COUNT_MISMATCH
  Expected panels: 24
  Found panels: 22
  Missing: 2 panels

Exit code: 34`,
      details: { exitCode: 34, expected: 24, found: 22 },
    },
    E_KEY_REVOKED: {
      summary: "Key ถูกเพิกถอนแล้ว",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Verifying signature...
ERROR: KEY_REVOKED
  publicKeyId: key-prod-2025-old
  Revoked at: 2026-01-01T00:00:00Z
  Reason: Key rotation

Exit code: 31`,
      details: { exitCode: 31, publicKeyId: "key-prod-2025-old", revokedAt: "2026-01-01T00:00:00Z" },
    },
    E_KEY_EXPIRED: {
      summary: "Key หมดอายุแล้ว",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Verifying signature...
ERROR: KEY_EXPIRED
  publicKeyId: key-prod-2025-001
  Expired at: 2025-12-31T23:59:59Z

Exit code: 31`,
      details: { exitCode: 31, publicKeyId: "key-prod-2025-001", expiredAt: "2025-12-31T23:59:59Z" },
    },

    // ========================================================================
    // TRUST errors - Audit Proof (40-43)
    // ========================================================================
    E_PROOF_SCHEMA_INVALID: {
      summary: "หลักฐาน audit รูปแบบผิด (ตรวจไม่ได้)",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Verifying audit proof...
ERROR: E_PROOF_SCHEMA_INVALID
  Proof schema validation failed
  Missing field: merkleRoot

Exit code: 40`,
      details: { exitCode: 40, missingField: "merkleRoot" },
    },
    E_PROOF_ROOT_MISMATCH: {
      summary: "หลักฐาน audit ไม่ตรงกับ root (ห้ามผลิต)",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Verifying audit proof...
ERROR: E_PROOF_ROOT_MISMATCH
  Expected root: abc123...
  Proof root: def456...

Exit code: 41`,
      details: { exitCode: 41, expectedRoot: "abc123...", proofRoot: "def456..." },
    },
    E_PROOF_SIGNATURE_INVALID: {
      summary: "ลายเซ็น audit ไม่ถูกต้อง (ห้ามผลิต)",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Verifying audit proof signature...
ERROR: AUDIT_SIGNATURE_INVALID
  Audit proof signature does not match

Exit code: 42`,
      details: { exitCode: 42 },
    },
    E_PROOF_KEY_NOT_ALLOWED: {
      summary: "คีย์ audit ไม่อนุญาต",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Verifying audit proof...
ERROR: AUDIT_KEY_NOT_ALLOWED
  publicKeyId: audit-key-unknown
  Not in allowed audit keyset

Exit code: 43`,
      details: { exitCode: 43, publicKeyId: "audit-key-unknown" },
    },

    // ========================================================================
    // GATE errors (50)
    // ========================================================================
    E_GATE_FAIL: {
      summary: "ไม่ผ่านกฎโรงงาน (Gate Fail)",
      log: getMockVerifyLog(false),
      details: { exitCode: 50 },
    },
    E_GATE_DEPTH: {
      summary: "ความลึกเกินความหนาวัสดุ",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Checking gate rules...
ERROR: GATE_FAIL - Cut depth exceeds material thickness
  Panel: side_left
  Material thickness: 18mm
  Cut depth: 20mm
  Excess: 2mm

Exit code: 50`,
      details: { exitCode: 50, panel: "side_left", thickness: 18, cutDepth: 20 },
    },
    E_GATE_TOOL: {
      summary: "ไม่มี tool ที่ต้องใช้",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Checking gate rules...
ERROR: GATE_FAIL - Required tool not available
  Tool: T3 (8mm ball nose)
  Required for: pocket operations
  Available tools: T1, T2, T4, T5

Exit code: 50`,
      details: { exitCode: 50, tool: "T3", toolName: "8mm ball nose" },
    },
    E_GATE_CLEARANCE: {
      summary: "ระยะห่างไม่เพียงพอ",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] Checking gate rules...
ERROR: GATE_FAIL - Insufficient clearance between cuts
  Panel: bottom
  Required clearance: 5mm
  Actual clearance: 2.5mm

Exit code: 50`,
      details: { exitCode: 50, panel: "bottom", required: 5, actual: 2.5 },
    },

    // ========================================================================
    // Warnings (80)
    // ========================================================================
    W_AUDIT_UNKNOWN: {
      summary: "ผ่าน แต่ตรวจ audit ไม่สำเร็จ (ยังผลิตได้)",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] All core checks passed
[verify] Signature: VALID
[verify] Manifest: OK
[verify] Gate: PASS

[verify] Checking audit trail...
WARNING: W_AUDIT_UNKNOWN - Audit verification unavailable (offline mode)

================================================================================
RESULT: PASS (with warning)
================================================================================

Exit code: 80`,
      details: { exitCode: 80, auditStatus: "unavailable" },
    },
    W_AUDIT_PENDING: {
      summary: "Audit กำลังประมวลผล",
      log: `================================================================================
IIMOS PACKET VERIFICATION
================================================================================

[verify] All core checks passed
[verify] Signature: VALID
[verify] Manifest: OK
[verify] Gate: PASS

[verify] Checking audit trail...
WARNING: W_AUDIT_PENDING - Audit verification pending (processing)

================================================================================
RESULT: PASS (with warning)
================================================================================

Exit code: 80`,
      details: { exitCode: 80, auditStatus: "pending" },
    },

    // ========================================================================
    // Success (0)
    // ========================================================================
    OK: {
      summary: "ผ่านการตรวจ (ผลิตได้)",
      log: getMockVerifyLog(true),
      details: { exitCode: 0 },
    },
  };

  const scenario = errorScenarios[code] || errorScenarios.E_GATE_FAIL;
  const isWarning = code.startsWith("W_");

  // Determine which check failed based on error code
  const isTrustSignatureError = code.startsWith("E_SIGNATURE") || code.startsWith("E_KEY") || code === "E_ROOT_HASH_MISMATCH" || code === "E_COUNT_MISMATCH";
  const isTrustProofError = code.startsWith("E_PROOF");
  const isPacketError = code.startsWith("E_PACKET");
  const isGateError = code.startsWith("E_GATE");

  return {
    verdict: isWarning ? "PASS_WITH_WARN" : "FAIL",
    code,
    summary: scenario.summary || "เกิดข้อผิดพลาด",
    log: scenario.log || `Error: ${code}`,
    timestamp: new Date().toISOString(),
    details: scenario.details,
    checks: isWarning
      ? [
          { name: "Signature verification", status: "PASS" },
          { name: "Manifest integrity", status: "PASS" },
          { name: "Gate checks", status: "PASS" },
          { name: "Audit verification", status: "WARN", message: scenario.summary },
        ]
      : [
          { name: "Signature verification", status: isTrustSignatureError ? "FAIL" : "PASS" },
          { name: "Manifest integrity", status: isPacketError || code === "E_ROOT_HASH_MISMATCH" || code === "E_COUNT_MISMATCH" ? "FAIL" : "PASS" },
          { name: "Gate checks", status: isGateError ? "FAIL" : "PASS", message: isGateError ? scenario.summary : undefined },
          ...(isTrustProofError ? [{ name: "Audit verification", status: "FAIL" as const }] : []),
        ],
  };
}

// ============================================================================
// Mock Packet Response (P2.1)
// ============================================================================

export function getMockPacketResponse(jobId: string): PacketResponseSuccess {
  const job = mockJobSummaries.find((j) => j.jobId === jobId);

  return {
    ok: true,
    packet: {
      version: "1.0.0",
      jobId,
      createdAt: job?.createdAt || new Date().toISOString(),
      signedAt: job?.updatedAt || new Date().toISOString(),
      toolVersion: "IIMOS Designer 0.12.0",
      manifest: {
        hash: "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
        publicKeyId: "key_prod_001",
        algorithm: "Ed25519",
      },
      materials: [
        { id: "mat_001", code: "MDF18", name: "MDF 18mm", thickness: 18 },
        { id: "mat_002", code: "PLY15", name: "Plywood 15mm", thickness: 15 },
      ],
      sheets: [
        {
          id: "sheet_001",
          name: "Sheet 1",
          materialId: "mat_001",
          width: 2440,
          height: 1220,
          parts: [
            { partId: "part_001", x: 10, y: 10, rotation: 0, width: 600, height: 400 },
            { partId: "part_002", x: 620, y: 10, rotation: 0, width: 600, height: 400 },
            { partId: "part_003", x: 10, y: 420, rotation: 90, width: 400, height: 600 },
          ],
        },
        {
          id: "sheet_002",
          name: "Sheet 2",
          materialId: "mat_002",
          width: 2440,
          height: 1220,
          parts: [
            { partId: "part_004", x: 10, y: 10, rotation: 0, width: 800, height: 500 },
          ],
        },
      ],
      parts: [
        {
          id: "part_001",
          name: "Side Panel L",
          width: 600,
          height: 400,
          thickness: 18,
          materialId: "mat_001",
          operations: [
            { type: "PROFILE", toolId: "tool_001", depth: 18, tabs: 4 },
            { type: "DRILL", toolId: "tool_002", depth: 10 },
          ],
        },
        {
          id: "part_002",
          name: "Side Panel R",
          width: 600,
          height: 400,
          thickness: 18,
          materialId: "mat_001",
          operations: [
            { type: "PROFILE", toolId: "tool_001", depth: 18, tabs: 4 },
            { type: "DRILL", toolId: "tool_002", depth: 10 },
          ],
        },
        {
          id: "part_003",
          name: "Bottom Panel",
          width: 400,
          height: 600,
          thickness: 18,
          materialId: "mat_001",
          operations: [
            { type: "PROFILE", toolId: "tool_001", depth: 18, tabs: 4 },
            { type: "GROOVE", toolId: "tool_003", depth: 8 },
          ],
        },
        {
          id: "part_004",
          name: "Back Panel",
          width: 800,
          height: 500,
          thickness: 15,
          materialId: "mat_002",
          operations: [
            { type: "PROFILE", toolId: "tool_001", depth: 15, tabs: 6 },
          ],
        },
      ],
      toolpathPlan: {
        totalOps: 8,
        opsByType: {
          PROFILE: 4,
          DRILL: 2,
          GROOVE: 1,
        },
        machine: job?.machineSupport?.[0] || "KDT",
        estimatedRuntime: 12.5,
        tools: [
          { id: "tool_001", name: "6mm Flat End Mill", diameter: 6, type: "FLAT" },
          { id: "tool_002", name: "5mm Drill Bit", diameter: 5, type: "DRILL" },
          { id: "tool_003", name: "3mm V-Groove", diameter: 3, type: "V_GROOVE" },
        ],
        gcodeSnippets: {
          header: "G21 ; Metric units\nG90 ; Absolute positioning\nG17 ; XY plane\n",
          part_001_profile:
            "T1 M6 ; Tool change\nS18000 M3 ; Spindle on\nG0 X10 Y10 Z5\nG1 Z-18 F1000\n...",
        },
      },
      gateResults: {
        passed: job?.trust?.gate === "PASS",
        checks: [
          { name: "Tool Availability", status: "PASS" },
          { name: "Material Thickness", status: "PASS" },
          { name: "Depth Limits", status: job?.trust?.gate === "PASS" ? "PASS" : "FAIL" },
        ],
        timestamp: new Date().toISOString(),
      },
    },
    packetSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    sizeBytes: 4567,
  };
}

// ============================================================================
// Mock Export Response (Legacy)
// ============================================================================

export function getMockExportResponse(
  jobId: string,
  machine: MachineType
): ExportResponse {
  const job = mockJobSummaries.find((j) => j.jobId === jobId);

  return {
    downloadUrl: `/api/factory/export/${jobId}_${machine}.zip`,
    filename: `${jobId}_${machine}.zip`,
    machine,
    sheetCount: job?.sheetCount || 1,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Mock Gated Export Options (P2.2)
// ============================================================================

export function getMockExportOptions(): ExportOptionsResponse {
  return {
    dialects: [
      {
        id: "KDT",
        name: "KDT",
        profiles: [
          {
            id: "kdt_mvp_v1",
            name: "KDT MVP",
            dialect: "KDT",
            description: "Basic KDT G-code output",
            enabled: true,
          },
          {
            id: "kdt_pro_v1",
            name: "KDT Pro",
            dialect: "KDT",
            description: "Advanced KDT with optimization",
            enabled: true,
          },
        ],
      },
      {
        id: "BIESSE",
        name: "BIESSE",
        profiles: [
          {
            id: "biesse_iso_v1",
            name: "Biesse ISO",
            dialect: "BIESSE",
            description: "Biesse ISO standard",
            enabled: true,
          },
        ],
      },
      {
        id: "HOMAG",
        name: "HOMAG",
        profiles: [
          {
            id: "homag_iso_v1",
            name: "Homag ISO",
            dialect: "HOMAG",
            description: "Homag ISO standard",
            enabled: true,
          },
          {
            id: "homag_weeke_v1",
            name: "Homag Weeke",
            dialect: "HOMAG",
            description: "Weeke-specific format",
            enabled: true,
          },
        ],
      },
    ],
    modes: [
      {
        id: "PER_JOB",
        name: "Per Job",
        description: "All sheets in one bundle",
      },
      {
        id: "PER_SHEET",
        name: "Per Sheet",
        description: "Separate file per sheet",
      },
    ],
    targets: [
      {
        id: "BUNDLE",
        name: "Bundle",
        description: "ZIP archive with G-code + manifest",
        enabled: true,
      },
      {
        id: "GCODE",
        name: "G-Code",
        description: "Raw G-code files only",
        enabled: true,
      },
      {
        id: "DXF",
        name: "DXF",
        description: "DXF drawing files",
        enabled: true,
      },
      {
        id: "MANIFEST",
        name: "Manifest",
        description: "Signed manifest only",
        enabled: true,
      },
    ],
  };
}

// ============================================================================
// Mock API Handler (for MSW or fetch mock)
// ============================================================================

export async function mockFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));

  const method = options?.method || "GET";

  // GET /api/factory/jobs
  if (url === "/api/factory/jobs" && method === "GET") {
    return new Response(JSON.stringify(mockJobSummaries), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // GET /api/factory/jobs/:jobId
  const jobDetailMatch = url.match(/\/api\/factory\/jobs\/([^/]+)$/);
  if (jobDetailMatch && method === "GET") {
    const jobId = jobDetailMatch[1];
    const detail = getMockJobDetail(jobId);
    if (detail) {
      return new Response(JSON.stringify(detail), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Job not found" }), {
      status: 404,
    });
  }

  // POST /api/factory/jobs/:jobId/verify
  const verifyMatch = url.match(/\/api\/factory\/jobs\/([^/]+)\/verify$/);
  if (verifyMatch && method === "POST") {
    const jobId = verifyMatch[1];
    const response = getMockVerifyResponse(jobId);
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // GET /api/factory/jobs/:jobId/packet (P2.1)
  const packetMatch = url.match(/\/api\/factory\/jobs\/([^/]+)\/packet$/);
  if (packetMatch && method === "GET") {
    const jobId = packetMatch[1];
    const job = mockJobSummaries.find((j) => j.jobId === jobId);
    if (job) {
      const response = getMockPacketResponse(jobId);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ ok: false, code: "E_PACKET_MISSING", message: "Packet not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // GET /api/factory/export/options (P2.2 Gated Export)
  if (url === "/api/factory/export/options" && method === "GET") {
    const response = getMockExportOptions();
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // POST /api/factory/jobs/:jobId/export (P2.2 Gated Export)
  const exportMatch = url.match(/\/api\/factory\/jobs\/([^/]+)\/export$/);
  if (exportMatch && method === "POST") {
    const jobId = exportMatch[1];
    const body = options?.body ? JSON.parse(options.body as string) : {};

    // Check if this is a gated export request (has dialect field)
    if (body.dialect) {
      const response: GatedExportResponse = getMockGatedExportResponse(jobId, body as ExportRequest);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Legacy export (has machine field)
    const response = getMockExportResponse(jobId, body.machine as MachineType);
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fallback
  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
}

// ============================================================================
// Enable Mock API
// ============================================================================

let mockEnabled = false;

export function enableMockApi(): void {
  if (mockEnabled) return;

  const originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.startsWith("/api/factory")) {
      return mockFetch(url, init);
    }

    return originalFetch(input, init);
  };

  mockEnabled = true;
  console.log("[Factory Mock API] Enabled");
}

export function disableMockApi(): void {
  // Note: This doesn't actually restore fetch, would need to save reference
  mockEnabled = false;
  console.log("[Factory Mock API] Disabled");
}
