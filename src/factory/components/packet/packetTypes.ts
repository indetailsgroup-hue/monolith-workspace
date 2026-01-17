/**
 * Packet Types - Type definitions for packet viewer
 * P2.1 Packet Viewer (Read-only)
 *
 * @version 0.12.0
 */

// ============================================================================
// API Response Types
// ============================================================================

export interface PacketResponseSuccess {
  ok: true;
  packet: PacketData;
  packetSha256: string;
  sizeBytes: number;
}

export interface PacketResponseError {
  ok: false;
  code: PacketErrorCode;
  message: string;
  snippet?: string;
}

export type PacketResponse = PacketResponseSuccess | PacketResponseError;

export type PacketErrorCode =
  | "E_PACKET_MISSING"
  | "E_PACKET_PARSE"
  | "E_PACKET_SCHEMA"
  | "E_PACKET_TOO_LARGE"
  | "E_PACKET_FETCH";

// ============================================================================
// Packet Data Structure (Minimal for viewer)
// ============================================================================

export interface PacketData {
  /** Packet format version */
  version: string;
  /** Job identifier */
  jobId: string;
  /** Creation timestamp */
  createdAt?: string;
  /** Signing timestamp */
  signedAt?: string;
  /** Tool/software version that created the packet */
  toolVersion?: string;

  /** Manifest information */
  manifest?: PacketManifest;

  /** Material definitions */
  materials?: PacketMaterial[];

  /** Sheet definitions (nesting) */
  sheets?: PacketSheet[];

  /** Part definitions */
  parts?: PacketPart[];

  /** Toolpath plan */
  toolpathPlan?: PacketToolpathPlan;

  /** Gate check results (if included) */
  gateResults?: PacketGateResults;

  /** Raw additional data (for extensibility) */
  [key: string]: unknown;
}

// ============================================================================
// Manifest
// ============================================================================

export interface PacketManifest {
  /** Manifest hash */
  hash?: string;
  /** Public key ID used for signing */
  publicKeyId?: string;
  /** Signature */
  signature?: string;
  /** Algorithm used */
  algorithm?: string;
}

// ============================================================================
// Materials
// ============================================================================

export interface PacketMaterial {
  id: string;
  code?: string;
  name?: string;
  thickness?: number;
  type?: string;
}

// ============================================================================
// Sheets (Nesting)
// ============================================================================

export interface PacketSheet {
  id: string;
  name?: string;
  materialId?: string;
  width?: number;
  height?: number;
  parts?: PacketSheetPart[];
}

export interface PacketSheetPart {
  partId: string;
  x: number;
  y: number;
  rotation?: number;
  width?: number;
  height?: number;
}

// ============================================================================
// Parts
// ============================================================================

export interface PacketPart {
  id: string;
  name?: string;
  width?: number;
  height?: number;
  thickness?: number;
  materialId?: string;
  operations?: PacketOperation[];
}

// ============================================================================
// Toolpath Plan
// ============================================================================

export interface PacketToolpathPlan {
  /** Total operations count */
  totalOps?: number;
  /** Operations by type */
  opsByType?: Record<string, number>;
  /** Machine target */
  machine?: string;
  /** Estimated runtime (minutes) */
  estimatedRuntime?: number;
  /** Tool list */
  tools?: PacketTool[];
  /** Operations list */
  operations?: PacketOperation[];
  /** G-code snippets (if included) */
  gcodeSnippets?: Record<string, string>;
}

export interface PacketTool {
  id: string;
  name?: string;
  diameter?: number;
  type?: string;
}

export interface PacketOperation {
  id?: string;
  type: OperationType;
  partId?: string;
  toolId?: string;
  depth?: number;
  feedRate?: number;
  spindleSpeed?: number;
  tabs?: number;
  params?: Record<string, unknown>;
}

export type OperationType =
  | "PROFILE"
  | "GROOVE"
  | "DRILL"
  | "POCKET"
  | "ENGRAVE"
  | "CUTOUT"
  | "OTHER";

// ============================================================================
// Gate Results
// ============================================================================

export interface PacketGateResults {
  passed: boolean;
  checks?: PacketGateCheck[];
  timestamp?: string;
}

export interface PacketGateCheck {
  name: string;
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
  message?: string;
}

// ============================================================================
// Store Types
// ============================================================================

export type PacketFetchStatus = "IDLE" | "LOADING" | "DONE" | "ERROR";

export interface PacketCacheEntry {
  status: PacketFetchStatus;
  data?: PacketResponseSuccess;
  error?: PacketResponseError;
  fetchedAt?: string;
}

// ============================================================================
// Helpers
// ============================================================================

export function isPacketSuccess(
  response: PacketResponse
): response is PacketResponseSuccess {
  return response.ok === true;
}

export function isPacketError(
  response: PacketResponse
): response is PacketResponseError {
  return response.ok === false;
}

/**
 * Get summary counts from packet data
 */
export function getPacketCounts(packet: PacketData): {
  sheets: number;
  parts: number;
  operations: number;
  opsByType: Record<string, number>;
} {
  const sheets = packet.sheets?.length ?? 0;
  const parts = packet.parts?.length ?? 0;

  // Count operations from toolpathPlan or parts
  let operations = packet.toolpathPlan?.totalOps ?? 0;
  const opsByType: Record<string, number> = { ...packet.toolpathPlan?.opsByType };

  // If not in toolpathPlan, count from parts
  if (operations === 0 && packet.parts) {
    for (const part of packet.parts) {
      if (part.operations) {
        operations += part.operations.length;
        for (const op of part.operations) {
          opsByType[op.type] = (opsByType[op.type] ?? 0) + 1;
        }
      }
    }
  }

  return { sheets, parts, operations, opsByType };
}
