/**
 * types.ts - Tool Wear & Cost Intelligence Types
 *
 * Type definitions for D6 tool usage tracking system.
 * Observes CNC operations without modifying G-code output.
 *
 * @version 1.0.0 - Phase D6-A
 * @schema monolith.factory.tool-usage@1.0
 */

// Schema tag for forward compatibility (IndexedDB / exports / migrations)
export const TOOL_USAGE_SCHEMA = 'monolith.factory.tool-usage@1.0' as const;

// Prefer reusing existing MaterialClass if available.
// If your repo already exports MaterialClass from src/cnc/policy/materialTypes.ts,
// you can replace this union with an import to avoid duplication:
//
// import type { MaterialClass } from '../../cnc/policy';
//
export type MaterialClass = 'MDF' | 'MELAMINE' | 'PLYWOOD' | 'HPL' | 'HMR' | 'UNKNOWN';

export type ToolId = string;

export type ToolIdentity = {
  toolId: ToolId;          // e.g. "DRILL_5", "BORE_35", "DRILL_15"
  diameterMm?: number;     // optional metadata (not used in D6-A wear math)
  vendorSku?: string;      // optional metadata for purchasing/ERP later
};

export type ToolUsageEvent = {
  // Provenance (bind to CNC artifacts; read-only analytics)
  jobId: string;
  machineId: string;
  dialect: string;
  postVersion: string;

  // Integrity linkage (from cnc-manifest / checksums)
  programHash: string;      // SHA-256 of nc/PROG.nc (or equivalent)
  packetContentHash: string;

  // Event payload
  tool: ToolIdentity;

  material: MaterialClass;
  holeKind: 'DRILL' | 'BORE'; // conservative: only these two kinds in D6 scope
  diameterMm: number;
  depthMm: number;

  count: number;            // number of holes represented by this event
  occurredAt: number;       // epoch ms
};

export type ToolUsageMaterialAggregate = {
  holes: number;
  depthMm: number;
  wearUnits: number;
};

export type ToolUsageRecord = {
  toolId: ToolId;

  totalHoles: number;
  totalDepthMm: number;
  wearUnits: number;

  byMaterial: Partial<Record<MaterialClass, ToolUsageMaterialAggregate>>;

  // Convenience pointers for UI
  lastJobId?: string;
  lastOccurredAt?: number;

  updatedAt: number; // epoch ms
};

export type ToolWearThreshold = {
  toolId: ToolId;
  maxWearUnits: number; // calibratable per tool
};

// Derived health summary for UI / alerts
export type ToolHealth = {
  toolId: ToolId;
  wearUnits: number;
  maxWearUnits: number;
  healthPct: number; // 0..100
  status: 'OK' | 'NEARING_LIMIT' | 'OVER_LIMIT';
};

// D6.2: Wear trend data point
export type WearDataPoint = {
  timestamp: number;     // epoch ms
  wearUnits: number;     // cumulative wear at this point
  jobId?: string;        // associated job (optional)
};

// D6.2: Tool health with trend information
export type ToolHealthTrend = ToolHealth & {
  /** Recent wear history (last N data points) */
  wearHistory: WearDataPoint[];
  /** Trend direction based on recent wear rate */
  trend: 'STABLE' | 'INCREASING' | 'RAPID';
  /** Average wear units per job (recent) */
  avgWearPerJob: number;
};
