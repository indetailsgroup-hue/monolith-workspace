/**
 * OperationGraph Types - Factory-Readable Operations
 *
 * Machine-level operations derived from DesignIntent.
 * These are deterministic, auditable, and factory-safe.
 *
 * v1.0: Initial operation graph types
 */

export type OpId = string;

export type OpKind =
  | 'ROUTE_PROFILE'    // Edge profile routing
  | 'POCKET_GROOVE'    // Groove/dado pocketing
  | 'ROUTE_REVEAL'     // Reveal step routing
  | 'DRILL_HOLE'       // Hole drilling
  | 'EDGE_BAND'        // Edge banding application
  | 'KERF_BEND';       // Kerf cuts for bending

export type TargetKind = 'EDGE' | 'FACE' | 'PANEL';

export interface OpTarget {
  kind: TargetKind;
  id: string;
  /** Edge index for EDGE targets */
  edgeIndex?: number;
  /** Face name for FACE targets */
  face?: 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Single operation node in the graph.
 * Each node represents one CNC/factory operation.
 */
export interface OpNode {
  /** Unique operation ID */
  id: OpId;
  /** Operation kind */
  kind: OpKind;
  /** Target panel ID */
  panelId: string;
  /** Target specification */
  target: OpTarget;
  /** Machine-relevant parameters (deterministic) */
  params: Record<string, number | string>;
  /** Dependencies - operations that must complete first */
  dependsOn?: OpId[];
  /** Source design intent ID (for traceability) */
  sourceIntentId?: string;
}

/**
 * Complete operation graph for manufacturing.
 * This is the "factory contract" - what the machine will execute.
 */
export interface OperationGraph {
  /** Schema version for compatibility */
  version: 'opgraph.v1';
  /** All operation nodes */
  nodes: OpNode[];
  /** Creation timestamp */
  createdAt: string;
  /** Hash of the source intents (for verification) */
  sourceHash?: string;
}

/**
 * Operation summary for UI display.
 */
export interface OpSummary {
  totalOps: number;
  byKind: Record<OpKind, number>;
  byPanel: Record<string, number>;
  estimatedTime?: number; // seconds
}

/**
 * Calculate summary statistics for an operation graph.
 */
export function getOpSummary(graph: OperationGraph): OpSummary {
  const byKind: Partial<Record<OpKind, number>> = {};
  const byPanel: Record<string, number> = {};

  for (const node of graph.nodes) {
    byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
    byPanel[node.panelId] = (byPanel[node.panelId] ?? 0) + 1;
  }

  return {
    totalOps: graph.nodes.length,
    byKind: byKind as Record<OpKind, number>,
    byPanel,
  };
}
