/**
 * Factory Packet Type Definitions
 *
 * Defines the structure of factory data packets used for
 * CNC operation mapping and factory production.
 *
 * @version 1.0.0
 */

// ============================================================================
// Drill Map Types
// ============================================================================

/**
 * Face identifier for drill points.
 * 'A' = front face, 'B' = back face, 'E' = edge faces
 */
export type DrillFace = 'A' | 'B' | 'E';

/**
 * Purpose classification for drill points.
 */
export type DrillPurpose =
  | 'shelf_pin'
  | 'cam_housing'
  | 'bolt'
  | 'dowel'
  | 'hinge'
  | 'system'
  | 'custom'
  | 'unknown';

/**
 * Single drill point in a panel.
 */
export interface PacketDrillPoint {
  /** Unique point identifier */
  id: string;
  /** Panel this point belongs to */
  panelId: string;
  /** Position [x, y, z] in panel-local coordinates (mm) */
  position: [number, number, number];
  /** Surface normal [nx, ny, nz] */
  normal: [number, number, number];
  /** Hole diameter (mm) */
  diameter: number;
  /** Hole depth (mm) */
  depth: number;
  /** Face identifier */
  face: DrillFace;
  /** Purpose classification */
  purpose: DrillPurpose;
  /** Whether this is a through-hole */
  throughHole: boolean;
}

/**
 * Panel in the drill map.
 */
export interface PacketDrillPanel {
  /** Panel identifier */
  panelId: string;
  /** Cabinet this panel belongs to */
  cabinetId: string;
  /** Panel role in cabinet */
  role: string;
  /** Dimensions [width, height, thickness] in mm */
  dimensions: [number, number, number];
  /** Drill points on this panel */
  points: PacketDrillPoint[];
}

/**
 * Drill map summary statistics.
 */
export interface DrillMapSummary {
  /** Total number of drill points */
  totalDrills: number;
  /** Total number of bore points */
  totalBores?: number;
  /** Count by purpose */
  byPurpose?: Record<string, number>;
  /** Count by face */
  byFace?: Record<string, number>;
  /** Additional summary fields */
  [key: string]: number | Record<string, number> | undefined;
}

/**
 * Complete drill map from a factory packet.
 */
export interface PacketDrillMap {
  /** Schema version */
  version: string;
  /** Panels with drill points */
  panels: PacketDrillPanel[];
  /** Summary statistics */
  summary: DrillMapSummary;
  /** Tools used (optional, for reference) */
  tools?: unknown[];
}

// ============================================================================
// Connector Types
// ============================================================================

/**
 * Minifix connector point (cam or bolt).
 */
export interface MinifixPoint {
  /** Point identifier */
  pointId: string;
  /** Panel this point belongs to (optional for bolt points in test fixtures) */
  panelId?: string;
  /** Position [x, y, z] in panel-local coordinates (mm) */
  position: [number, number, number];
  /** Hole diameter (mm) (optional for bolt points where diameter is implicit) */
  diameter?: number;
  /** Hole depth (mm) */
  depth: number;
}

/**
 * Validation status for a minifix pair.
 */
export type MinifixPairStatus = 'VALID' | 'WARNING' | 'ERROR';

/**
 * Minifix connector pair (cam + bolt).
 */
export interface PacketMinifixPair {
  /** Pair identifier */
  id: string;
  /** Validation status */
  status: MinifixPairStatus;
  /** Cam housing point (15mm bore) */
  cam: MinifixPoint;
  /** Bolt hole point (5mm or 8mm drill) */
  bolt: MinifixPoint;
  /** Validation issues (if any) */
  issues?: string[];
}

/**
 * Connectors summary statistics.
 */
export interface ConnectorsSummary {
  /** Total minifix pairs */
  totalPairs: number;
  /** Valid pairs */
  validPairs: number;
  /** Pairs with warnings */
  warningPairs: number;
  /** Pairs with errors */
  errorPairs: number;
}

/**
 * Complete connectors data from a factory packet.
 */
export interface PacketConnectors {
  /** Schema version */
  version?: string;
  /** Minifix connector pairs */
  minifix: PacketMinifixPair[];
  /** Summary statistics */
  summary?: ConnectorsSummary;
}

// ============================================================================
// Packet Manifest
// ============================================================================

/**
 * File entry in packet manifest.
 */
export interface PacketManifestFile {
  /** File path within packet */
  path: string;
  /** SHA-256 hash of file contents */
  hash?: string;
  /** File size in bytes */
  size?: number;
}

/**
 * Packet manifest metadata.
 */
export interface PacketManifest {
  /** Schema identifier */
  schema?: string;
  /** Packet version */
  version: string;
  /** Job identifier */
  jobId: string;
  /** Project identifier */
  projectId?: string;
  /** Content hash of the entire packet */
  contentHash: string;
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Tool version that created this packet */
  toolVersion?: string;
  /** Files included in the packet */
  files?: PacketManifestFile[];
}

// ============================================================================
// Factory Packet (Top-Level)
// ============================================================================

/**
 * Complete factory packet structure.
 *
 * Contains all data needed for factory production:
 * - manifest: metadata and file listing
 * - drillMap: all drill points per panel
 * - connectors: minifix pairs (optional)
 * - gateReport: gate verification results (optional)
 */
export interface FactoryPacket {
  /** Packet manifest */
  manifest: PacketManifest;
  /** Drill map with all panel drill points */
  drillMap: PacketDrillMap;
  /** Connector pairs (optional) */
  connectors?: PacketConnectors;
  /** Gate verification report (optional) */
  gateReport?: unknown;
  /** Additional metadata (optional) */
  metadata?: Record<string, unknown>;
}
