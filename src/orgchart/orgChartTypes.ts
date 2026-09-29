// =============================================================================
// orgChartTypes.ts — v18.0 Interactive OrgChart
// Plan gate: PROFESSIONAL+
// =============================================================================

import type { OrgPlan } from '../tenant/types';

// ─── Union Types ─────────────────────────────────────────────────────────────

/** Represents the kind of entity a chart node models. */
export type OrgNodeType = 'EMPLOYEE' | 'ROLE' | 'DEPARTMENT' | 'TEAM';

/** Visual style of a reporting-line edge. */
export type OcLineType = 'SOLID' | 'DOTTED';

// ─── DB Row Types ─────────────────────────────────────────────────────────────

export interface OcNodeRow {
  id: string;
  org_id: string;
  parent_id: string | null;
  employee_id: string | null;
  node_type: OrgNodeType;
  title: string;
  department: string | null;
  position_x: number;
  position_y: number;
  hierarchy_level: number;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface OcReportingLineRow {
  id: string;
  org_id: string;
  from_node_id: string;
  to_node_id: string;
  line_type: OcLineType;
  label: string | null;
  created_at: string;
}

// ─── App-Layer Types ──────────────────────────────────────────────────────────

/** OcNode extends OcNodeRow with computed tree fields. */
export interface OcNode extends OcNodeRow {
  /** Direct children in the hierarchy tree. */
  children: OcNode[];
  /** Distance from root (0 = root). */
  depth: number;
  /** Ordered ancestor IDs from root to this node. */
  path: string[];
}

export type OcReportingLine = OcReportingLineRow;

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface CreateOcNodePayload {
  parent_id?: string | null;
  employee_id?: string | null;
  node_type: OrgNodeType;
  title: string;
  department?: string | null;
  position_x?: number;
  position_y?: number;
  hierarchy_level?: number;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateOcNodePayload {
  title?: string;
  department?: string | null;
  is_active?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface MoveOcNodePayload {
  nodeId: string;
  /** New parent node ID, or null to make root. */
  parentId: string | null;
  position_x: number;
  position_y: number;
}

export interface AddReportingLinePayload {
  from_node_id: string;
  to_node_id: string;
  line_type: OcLineType;
  label?: string | null;
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export const DEFAULT_OC_FILTERS = {
  nodeType: 'ALL' as OrgNodeType | 'ALL',
  department: null as string | null,
  isActive: true as boolean,
};

export type OcFilters = typeof DEFAULT_OC_FILTERS;

// ─── Plan Gate ────────────────────────────────────────────────────────────────

export function canAccessOrgChart(orgPlan: OrgPlan): boolean {
  return orgPlan === 'PROFESSIONAL' || orgPlan === 'ENTERPRISE';
}

export class OrgChartPlanGateError extends Error {
  constructor(orgPlan: string) {
    super(
      `Interactive OrgChart requires PROFESSIONAL or ENTERPRISE plan. Current plan: ${orgPlan}`
    );
    this.name = 'OrgChartPlanGateError';
  }
}

// ─── Label Constants (Thai) ───────────────────────────────────────────────────

export const OC_NODE_TYPE_LABEL_TH: Record<OrgNodeType, string> = {
  EMPLOYEE:   'พนักงาน',
  ROLE:       'ตำแหน่ง',
  DEPARTMENT: 'แผนก',
  TEAM:       'ทีม',
};

export const OC_LINE_TYPE_LABEL_TH: Record<OcLineType, string> = {
  SOLID:  'สายงานหลัก',
  DOTTED: 'สายงานเสริม (matrix)',
};

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function mapOcNodeRow(row: OcNodeRow): OcNode {
  return {
    ...row,
    children: [],
    depth: row.hierarchy_level,
    path: [],
  };
}

export function mapOcReportingLineRow(row: OcReportingLineRow): OcReportingLine {
  return { ...row };
}

/**
 * Build a hierarchical tree structure from a flat list of DB rows.
 * Nodes not found in the map (orphans) are attached to roots.
 */
export function buildOcTree(rows: OcNodeRow[]): OcNode[] {
  const nodeMap = new Map<string, OcNode>();
  const roots: OcNode[] = [];

  // First pass — instantiate all nodes
  for (const row of rows) {
    nodeMap.set(row.id, mapOcNodeRow(row));
  }

  // Second pass — wire parent→child and compute path
  for (const node of Array.from(nodeMap.values())) {
    if (node.parent_id && nodeMap.has(node.parent_id)) {
      const parent = nodeMap.get(node.parent_id)!;
      node.depth = parent.depth + 1;
      node.path  = [...parent.path, parent.id];
      parent.children.push(node);
    } else {
      node.depth = 0;
      node.path  = [];
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Flatten a tree of OcNodes back to an ordered array (depth-first).
 */
export function flattenOcTree(nodes: OcNode[]): OcNode[] {
  const result: OcNode[] = [];
  const visit = (n: OcNode) => {
    result.push(n);
    n.children.forEach(visit);
  };
  nodes.forEach(visit);
  return result;
}
