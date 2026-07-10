/**
 * Factory Packet Types - B2 MVP
 *
 * Defines the structure of factory packets for manufacturing.
 * All data is deterministic: same input → same output.
 *
 * @version 1.0.0 - Phase B2: Factory Packet Generator MVP
 */

// ============================================
// VERSION & SCHEMA
// ============================================

export const FACTORY_PACKET_VERSION = '1.0.0' as const;
export const FACTORY_PACKET_SCHEMA = 'monolith.factory.packet@1.0' as const;

// ============================================
// DRILL MAP TYPES (Subset for Packet)
// ============================================

/**
 * Drill point in packet (simplified from DrillMapPoint)
 */
export interface PacketDrillPoint {
  /** Unique point ID */
  id: string;
  /** Panel ID this point belongs to */
  panelId: string;
  /** Position [x, y, z] in mm (world coordinates) */
  position: [number, number, number];
  /** Normal direction [nx, ny, nz] (unit vector) */
  normal: [number, number, number];
  /** Hole diameter in mm */
  diameter: number;
  /** Hole depth in mm */
  depth: number;
  /** Through hole? */
  throughHole: boolean;
  /** Purpose code */
  purpose: string;
  /** Face being drilled */
  face: string;
  /** Paired hole ID (for minifix cam↔bolt) */
  pairedHoleId?: string;
}

/**
 * Panel drill summary in packet
 */
export interface PacketDrillPanel {
  /** Panel ID */
  panelId: string;
  /** Cabinet ID */
  cabinetId: string;
  /** Panel role */
  role: string;
  /** Panel dimensions [w, h, t] in mm */
  dimensions: [number, number, number];
  /** Drill points on this panel */
  points: PacketDrillPoint[];
}

/**
 * DrillMap section of packet
 */
export interface PacketDrillMap {
  /** Schema version */
  version: 'drillmap.v1';
  /** Panels with drill data */
  panels: PacketDrillPanel[];
  /** Summary counts */
  summary: {
    totalDrills: number;
    totalBores: number;
    byPurpose: Record<string, number>;
    byDiameter: Record<string, number>;
  };
  /** Required tools */
  tools: Array<{
    toolId: string;
    name: string;
    diameter: number;
    type: string;
    usageCount: number;
  }>;
}

// ============================================
// CONNECTOR TYPES (Minifix)
// ============================================

/**
 * Minifix connector pair in packet
 */
export interface PacketMinifixPair {
  /** Pair ID */
  id: string;
  /** Cam housing info */
  cam: {
    pointId: string;
    panelId: string;
    position: [number, number, number];
    diameter: number;
    depth: number;
  };
  /** Bolt info */
  bolt: {
    pointId: string;
    panelId: string;
    position: [number, number, number];
    diameter: number;
    depth: number;
  };
  /** Validation status */
  status: 'VALID' | 'WARNING' | 'ERROR';
  /** Issues if any */
  issues?: string[];
}

/**
 * Connectors section of packet
 */
export interface PacketConnectors {
  /** Schema version */
  version: 'connectors.v1';
  /** Minifix pairs */
  minifix: PacketMinifixPair[];
  /** Summary */
  summary: {
    totalPairs: number;
    validPairs: number;
    warningPairs: number;
    errorPairs: number;
  };
}

// ============================================
// CUT LIST TYPES
// ============================================

/**
 * Cut list row in packet
 */
export interface PacketCutListRow {
  /** Row number (1-based) */
  rowNo: number;
  /** Part ID */
  partId: string;
  /** Cabinet ID */
  cabinetId: string;
  /** Material ID */
  materialId: string;
  /** Quantity */
  qty: number;
  /** Finish width mm */
  finishW: number;
  /** Finish height mm */
  finishH: number;
  /** Edge banding [L, R, T, B] in mm */
  edgeBanding: [number, number, number, number];
  /** Premill [L, R, T, B] in mm */
  premill: [number, number, number, number];
  /** Cut width mm */
  cutW: number;
  /** Cut height mm */
  cutH: number;
  /** Grain direction */
  grain: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  /** Notes */
  note?: string;
}

/**
 * CutList section of packet
 */
export interface PacketCutList {
  /** Schema version */
  version: 'cutlist.v1';
  /** Cut list rows */
  rows: PacketCutListRow[];
  /** Summary */
  summary: {
    totalRows: number;
    totalParts: number;
    byMaterial: Record<string, { rows: number; parts: number }>;
  };
}

// ============================================
// GATE RESULT TYPES
// ============================================

/**
 * Gate finding in packet
 */
export interface PacketGateFinding {
  /** Finding key */
  key: string;
  /** Rule code */
  code: string;
  /** Severity */
  severity: 'BLOCKER' | 'WARNING' | 'INFO';
  /** Message */
  message: string;
  /** Affected entity IDs */
  entityIds: string[];
}

/**
 * Gate result section of packet
 */
export interface PacketGateResult {
  /** Schema version */
  version: 'gate.v1';
  /** Policy version */
  policyVersion: string;
  /** Gate passed? */
  passed: boolean;
  /** Run timestamp */
  runAt: string;
  /** Findings */
  findings: {
    blockers: PacketGateFinding[];
    warnings: PacketGateFinding[];
    info: PacketGateFinding[];
  };
  /** Summary counts */
  summary: {
    blockerCount: number;
    warningCount: number;
    infoCount: number;
  };
}

// ============================================
// MANIFEST TYPES
// ============================================

/**
 * File entry in manifest
 */
export interface ManifestFileEntry {
  /** Relative path */
  path: string;
  /** SHA-256 hash of content */
  sha256: string;
  /** File size in bytes */
  sizeBytes: number;
}

/**
 * Manifest structure
 */
export interface PacketManifest {
  /** Schema version */
  schema: typeof FACTORY_PACKET_SCHEMA;
  /** Packet version */
  version: typeof FACTORY_PACKET_VERSION;
  /** Job ID */
  jobId: string;
  /** Project ID */
  projectId: string;
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Tool version */
  toolVersion: string;
  /** Files in packet */
  files: ManifestFileEntry[];
  /** Content hash (SHA-256 of sorted file hashes) */
  contentHash: string;
  /** Signature (if signed) */
  signature?: {
    keyId: string;
    algorithm: 'Ed25519';
    value: string;
  };
}

// ============================================
// FACTORY PACKET (Complete)
// ============================================

/**
 * Complete Factory Packet
 *
 * Contains all manufacturing data in a single bundle.
 * Can be serialized to ZIP for download.
 */
export interface FactoryPacket {
  /** Manifest */
  manifest: PacketManifest;
  /** Drill map data */
  drillMap: PacketDrillMap;
  /** Connector data (minifix pairs) */
  connectors: PacketConnectors;
  /** Cut list data */
  cutList: PacketCutList;
  /** Gate validation result */
  gateResult: PacketGateResult;
  /** ADR-061(c): Connector OS compiler ops — artifact คู่ขนาน (ยังไม่แทน drillMap) */
  connectorOps?: import('./builders/buildConnectorOps').PacketConnectorOps;
}

// ============================================
// BUILDER INPUT TYPES
// ============================================

/**
 * Input for building a factory packet
 */
export interface BuildFactoryPacketInput {
  /** Job ID */
  jobId: string;
  /** Project ID */
  projectId: string;
  /** Tool version string */
  toolVersion: string;
  /** Optional: signing key ID */
  signingKeyId?: string;
}

/**
 * Output from building a factory packet
 */
export interface BuildFactoryPacketOutput {
  /** The built packet */
  packet: FactoryPacket;
  /** JSON strings for each file */
  files: {
    'manifest.json': string;
    'drillmap.json': string;
    'connectors.minifix.json': string;
    'cutlist.json': string;
    'gate-result.json': string;
    'connector-ops.json': string;
  };
  /** Combined content hash */
  contentHash: string;
}
