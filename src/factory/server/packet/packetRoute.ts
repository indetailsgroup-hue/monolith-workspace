/**
 * Packet Route - Read packet endpoint
 * P2.1 Packet Viewer
 *
 * GET /factory/jobs/:jobId/packet
 * Returns sanitized packet JSON for viewer display.
 *
 * @version 0.12.0
 */

import { readFile, stat } from "fs/promises";
import {
  getValidatedPacketPath,
  validateJobId,
  InvalidJobIdError,
  PacketNotFoundError,
  PathTraversalError,
} from "../verifierPaths";
import { computePacketHash } from "./packetHash";
import {
  validatePacketSchema,
  parsePacketJson,
  extractPacketSnippet,
} from "./packetSchemaLite";

// ============================================================================
// Configuration
// ============================================================================

/** Maximum packet size to read (2MB) */
const MAX_PACKET_SIZE = 2 * 1024 * 1024;

// ============================================================================
// Response Types
// ============================================================================

export interface PacketRouteResponseSuccess {
  ok: true;
  packet: unknown;
  packetSha256: string;
  sizeBytes: number;
}

export interface PacketRouteResponseError {
  ok: false;
  code: string;
  message: string;
  snippet?: string;
}

export type PacketRouteResponse =
  | PacketRouteResponseSuccess
  | PacketRouteResponseError;

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Read and validate packet for a job.
 *
 * @param jobId - Job identifier
 * @returns Packet response (success or error)
 */
export async function readPacket(jobId: string): Promise<PacketRouteResponse> {
  // 1. Validate job ID format
  try {
    validateJobId(jobId);
  } catch (err) {
    if (err instanceof InvalidJobIdError) {
      return {
        ok: false,
        code: "E_PACKET_INVALID_JOB",
        message: `Invalid job ID format: ${jobId}`,
      };
    }
    throw err;
  }

  // 2. Get validated packet path
  let packetPath: string;
  try {
    packetPath = await getValidatedPacketPath(jobId);
  } catch (err) {
    if (err instanceof PacketNotFoundError) {
      return {
        ok: false,
        code: "E_PACKET_MISSING",
        message: `Packet not found for job ${jobId}`,
      };
    }
    if (err instanceof PathTraversalError) {
      return {
        ok: false,
        code: "E_PACKET_SECURITY",
        message: "Path traversal attempt blocked",
      };
    }
    throw err;
  }

  // 3. Check file size
  let fileStats;
  try {
    fileStats = await stat(packetPath);
  } catch {
    return {
      ok: false,
      code: "E_PACKET_MISSING",
      message: `Cannot read packet file for job ${jobId}`,
    };
  }

  if (fileStats.size > MAX_PACKET_SIZE) {
    return {
      ok: false,
      code: "E_PACKET_TOO_LARGE",
      message: `Packet too large: ${fileStats.size} bytes (max ${MAX_PACKET_SIZE})`,
    };
  }

  // 4. Read file
  let rawData: Buffer;
  try {
    rawData = await readFile(packetPath);
  } catch {
    return {
      ok: false,
      code: "E_PACKET_READ",
      message: `Failed to read packet file for job ${jobId}`,
    };
  }

  // 5. Compute hash
  const packetSha256 = computePacketHash(rawData);

  // 6. Parse JSON
  const rawString = rawData.toString("utf-8");
  const parseResult = parsePacketJson(rawString);

  if (!parseResult.success) {
    return {
      ok: false,
      code: "E_PACKET_PARSE",
      message: `Invalid JSON: ${parseResult.error}`,
      snippet: extractPacketSnippet(rawString),
    };
  }

  // 7. Validate schema
  const schemaResult = validatePacketSchema(parseResult.data, jobId);

  if (!schemaResult.valid) {
    return {
      ok: false,
      code: "E_PACKET_SCHEMA",
      message: schemaResult.errors.join("; "),
      snippet: extractPacketSnippet(rawString),
    };
  }

  // 8. Return success
  return {
    ok: true,
    packet: parseResult.data,
    packetSha256,
    sizeBytes: fileStats.size,
  };
}

// ============================================================================
// Mock Mode Support
// ============================================================================

/**
 * Get mock packet for development.
 */
export function getMockPacket(jobId: string): PacketRouteResponseSuccess {
  return {
    ok: true,
    packet: {
      version: "1.0.0",
      jobId,
      createdAt: new Date().toISOString(),
      signedAt: new Date().toISOString(),
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
        machine: "SCM_MORBIDELLI",
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
        passed: true,
        checks: [
          { name: "Tool Availability", status: "PASS" },
          { name: "Material Thickness", status: "PASS" },
          { name: "Depth Limits", status: "PASS" },
        ],
        timestamp: new Date().toISOString(),
      },
    },
    packetSha256:
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    sizeBytes: 4567,
  };
}
