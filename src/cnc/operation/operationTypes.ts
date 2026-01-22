/**
 * operationTypes.ts - CNC Operation Types
 *
 * Defines normalized CNC operations that are machine-agnostic.
 * These represent "what to do" not "how to write G-code".
 *
 * @version 1.0.0 - Phase D1: Machine Profile + Operation Mapping
 */

// ============================================
// POSITION
// ============================================

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

// ============================================
// BASE OPERATION
// ============================================

export interface BaseOperation {
  /** Unique operation ID */
  id: string;
  /** Source entity ID (e.g., drill point ID, panel ID) */
  sourceId: string;
  /** Tool ID to use */
  toolId: string;
  /** Position in machine coordinates (mm) */
  position: Position3D;
  /** Feed rate override (optional, uses tool default if not set) */
  feedRate?: number;
  /** Spindle RPM override (optional, uses tool default if not set) */
  spindleRpm?: number;
  /** Comment/note for this operation */
  comment?: string;
}

// ============================================
// DRILL OPERATION
// ============================================

export interface DrillOperation extends BaseOperation {
  type: 'DRILL';
  /** Drill depth in mm */
  depth: number;
  /** Peck depth for deep holes (mm per peck) */
  peckDepth?: number;
  /** Dwell time at bottom (ms) */
  dwellTime?: number;
  /** Through hole flag */
  throughHole: boolean;
}

// ============================================
// BORE OPERATION
// ============================================

export interface BoreOperation extends BaseOperation {
  type: 'BORE';
  /** Bore diameter in mm */
  diameter: number;
  /** Bore depth in mm */
  depth: number;
  /** Flat bottom (true) or pointed (false) */
  flatBottom: boolean;
}

// ============================================
// POCKET OPERATION
// ============================================

export interface PocketOperation extends BaseOperation {
  type: 'POCKET';
  /** Pocket width in mm */
  width: number;
  /** Pocket height in mm */
  height: number;
  /** Pocket depth in mm */
  depth: number;
  /** Corner radius in mm */
  cornerRadius: number;
  /** Stepover percentage (0-1) */
  stepover: number;
}

// ============================================
// PROFILE OPERATION
// ============================================

export type ProfileSide = 'INSIDE' | 'OUTSIDE' | 'ON_LINE';

export interface ProfileOperation extends BaseOperation {
  type: 'PROFILE';
  /** Profile path points (closed polygon) */
  path: Position3D[];
  /** Cut depth in mm */
  depth: number;
  /** Cut side relative to path */
  side: ProfileSide;
  /** Lead-in/lead-out radius */
  leadRadius?: number;
  /** Tab positions for holding parts */
  tabs?: Array<{
    position: number; // 0-1 along path
    width: number;
    height: number;
  }>;
}

// ============================================
// SLOT OPERATION
// ============================================

export interface SlotOperation extends BaseOperation {
  type: 'SLOT';
  /** Slot end position */
  endPosition: Position3D;
  /** Slot width (tool diameter) */
  width: number;
  /** Slot depth in mm */
  depth: number;
}

// ============================================
// UNION TYPE
// ============================================

export type Operation =
  | DrillOperation
  | BoreOperation
  | PocketOperation
  | ProfileOperation
  | SlotOperation;

export type OperationType = Operation['type'];

// ============================================
// OPERATION GRAPH
// ============================================

export interface OperationGraphMetadata {
  /** Source job ID */
  jobId: string;
  /** Source panel ID (for per-panel graphs) */
  panelId?: string;
  /** Content hash of source packet */
  sourceContentHash: string;
  /** Timestamp when graph was built */
  builtAt: string;
  /** Tool version used */
  toolVersion: string;
}

export interface OperationGraph {
  /** Machine ID this graph is built for */
  machineId: string;
  /** Safe Z height for rapid moves */
  safeZ: number;
  /** Rapid Z height (usually higher than safeZ) */
  rapidZ: number;
  /** All operations in execution order */
  operations: Operation[];
  /** Graph metadata */
  metadata: OperationGraphMetadata;
  /** Total estimated run time (seconds) */
  estimatedTimeSeconds?: number;
  /** Tool IDs used in this graph */
  toolsUsed: string[];
}

// ============================================
// TYPE GUARDS
// ============================================

export function isDrillOperation(op: Operation): op is DrillOperation {
  return op.type === 'DRILL';
}

export function isBoreOperation(op: Operation): op is BoreOperation {
  return op.type === 'BORE';
}

export function isPocketOperation(op: Operation): op is PocketOperation {
  return op.type === 'POCKET';
}

export function isProfileOperation(op: Operation): op is ProfileOperation {
  return op.type === 'PROFILE';
}

export function isSlotOperation(op: Operation): op is SlotOperation {
  return op.type === 'SLOT';
}

// ============================================
// HELPERS
// ============================================

/**
 * Get unique tool IDs from operations
 */
export function getToolsUsed(operations: Operation[]): string[] {
  const toolSet = new Set<string>();
  for (const op of operations) {
    toolSet.add(op.toolId);
  }
  return Array.from(toolSet);
}

/**
 * Group operations by tool ID (for tool change optimization)
 */
export function groupByTool(operations: Operation[]): Map<string, Operation[]> {
  const groups = new Map<string, Operation[]>();
  for (const op of operations) {
    const existing = groups.get(op.toolId) || [];
    existing.push(op);
    groups.set(op.toolId, existing);
  }
  return groups;
}

/**
 * Count operations by type
 */
export function countByType(operations: Operation[]): Record<OperationType, number> {
  const counts: Record<OperationType, number> = {
    DRILL: 0,
    BORE: 0,
    POCKET: 0,
    PROFILE: 0,
    SLOT: 0,
  };
  for (const op of operations) {
    counts[op.type]++;
  }
  return counts;
}
