// =============================================================================
// orgChartStore.ts — v18.0 Interactive OrgChart Zustand store
// Plan gate: PROFESSIONAL+ (canAccessOrgChart)
// Actions: fetchChart, createNode, updateNode, moveNode, deleteNode,
//          addReportingLine, removeReportingLine, + UI helpers
// =============================================================================

import { create } from 'zustand';
import { supabase } from '../core/supabase';
import type { OrgPlan } from '../tenant/types';
import {
  OcNode,
  OcNodeRow,
  OcReportingLine,
  OcReportingLineRow,
  OcFilters,
  CreateOcNodePayload,
  UpdateOcNodePayload,
  MoveOcNodePayload,
  AddReportingLinePayload,
  DEFAULT_OC_FILTERS,
  canAccessOrgChart,
  OrgChartPlanGateError,
  mapOcNodeRow,
  mapOcReportingLineRow,
  buildOcTree,
} from './orgChartTypes';

// ─── State ───────────────────────────────────────────────────────────────────

interface OrgChartState {
  /** Hierarchical tree (root nodes with nested children). Used by the canvas. */
  nodes: OcNode[];
  /** Flat list of all nodes for quick ID-based lookups. */
  flatNodes: OcNode[];
  /** Explicit reporting lines (dotted / matrix relationships). */
  reportingLines: OcReportingLine[];
  /** Currently selected node ID in the canvas. */
  selectedNodeId: string | null;
  /** IDs of expanded nodes in the tree sidebar. */
  expandedNodeIds: Set<string>;
  /** True while a drag operation is in flight. */
  isDragging: boolean;
  /** True while nodes or lines are loading. */
  isLoading: boolean;
  /** True while a reporting-line mutation is in flight. */
  isLineLoading: boolean;
  /** Active display filters. */
  filters: OcFilters;
  /** Last error message, or null. */
  error: string | null;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

interface OrgChartActions {
  /** Fetch all nodes + reporting lines for the org. */
  fetchChart: (orgId: string, orgPlan: OrgPlan) => Promise<void>;

  /** Create a new node. Throws OrgChartPlanGateError if plan is insufficient. */
  createNode: (
    orgId: string,
    orgPlan: OrgPlan,
    payload: CreateOcNodePayload
  ) => Promise<void>;

  /** Update node metadata (title, department, is_active, metadata). */
  updateNode: (
    orgId: string,
    orgPlan: OrgPlan,
    nodeId: string,
    payload: UpdateOcNodePayload
  ) => Promise<void>;

  /**
   * Move a node to a new parent + canvas position.
   * Applies an optimistic local update for smooth drag UX; rolls back on error.
   */
  moveNode: (orgId: string, orgPlan: OrgPlan, payload: MoveOcNodePayload) => Promise<void>;

  /** Delete a node (children are re-parented to null by DB cascade). */
  deleteNode: (orgId: string, orgPlan: OrgPlan, nodeId: string) => Promise<void>;

  /** Add a SOLID or DOTTED reporting line between two nodes. */
  addReportingLine: (
    orgId: string,
    orgPlan: OrgPlan,
    payload: AddReportingLinePayload
  ) => Promise<void>;

  /** Remove a reporting line by ID. */
  removeReportingLine: (orgId: string, orgPlan: OrgPlan, lineId: string) => Promise<void>;

  // ─── UI helpers ────────────────────────────────────────────────────────

  /** Select a node on the canvas (pass null to deselect). */
  selectNode: (nodeId: string | null) => void;

  /** Expand / collapse a node in the tree sidebar. */
  toggleExpand: (nodeId: string) => void;

  /** Set drag state (used by canvas DnD controller). */
  setDragging: (isDragging: boolean) => void;

  /** Merge partial filter updates. */
  setFilters: (filters: Partial<OcFilters>) => void;

  /** Clear the last error. */
  clearError: () => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useOrgChartStore = create<OrgChartState & OrgChartActions>(
  (set, get) => ({
    // ── Initial state ──────────────────────────────────────────────────────
    nodes: [],
    flatNodes: [],
    reportingLines: [],
    selectedNodeId: null,
    expandedNodeIds: new Set<string>(),
    isDragging: false,
    isLoading: false,
    isLineLoading: false,
    filters: { ...DEFAULT_OC_FILTERS },
    error: null,

    // ── fetchChart ─────────────────────────────────────────────────────────
    fetchChart: async (orgId, orgPlan) => {
      set({ isLoading: true, error: null });
      try {
        const [nodesRes, linesRes] = await Promise.all([
          supabase
            .from('org_chart_nodes')
            .select('*')
            .eq('org_id', orgId)
            .order('hierarchy_level', { ascending: true })
            .order('created_at', { ascending: true }),
          supabase
            .from('org_reporting_lines')
            .select('*')
            .eq('org_id', orgId)
            .order('created_at', { ascending: true }),
        ]);

        if (nodesRes.error) throw nodesRes.error;
        if (linesRes.error) throw linesRes.error;

        const flat = (nodesRes.data as OcNodeRow[]).map(mapOcNodeRow);
        const tree = buildOcTree(nodesRes.data as OcNodeRow[]);

        set({
          flatNodes: flat,
          nodes: tree,
          reportingLines: (linesRes.data as OcReportingLineRow[]).map(
            mapOcReportingLineRow
          ),
          isLoading: false,
        });
      } catch (err: unknown) {
        set({ isLoading: false, error: (err as Error).message });
      }
    },

    // ── createNode ─────────────────────────────────────────────────────────
    createNode: async (orgId, orgPlan, payload) => {
      if (!canAccessOrgChart(orgPlan)) throw new OrgChartPlanGateError(orgPlan);
      set({ error: null });
      try {
        const { data, error } = await supabase
          .from('org_chart_nodes')
          .insert({ ...payload, org_id: orgId })
          .select()
          .single();
        if (error) throw error;
        const newNode = mapOcNodeRow(data as OcNodeRow);
        // Append to flatNodes then rebuild tree
        set(s => ({ flatNodes: [...s.flatNodes, newNode] }));
        await get().fetchChart(orgId, orgPlan);
      } catch (err: unknown) {
        set({ error: (err as Error).message });
      }
    },

    // ── updateNode ─────────────────────────────────────────────────────────
    updateNode: async (orgId, orgPlan, nodeId, payload) => {
      if (!canAccessOrgChart(orgPlan)) throw new OrgChartPlanGateError(orgPlan);
      set({ error: null });
      try {
        const { data, error } = await supabase
          .from('org_chart_nodes')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', nodeId)
          .eq('org_id', orgId)
          .select()
          .single();
        if (error) throw error;
        const updated = mapOcNodeRow(data as OcNodeRow);
        set(s => ({
          flatNodes: s.flatNodes.map(n => (n.id === nodeId ? updated : n)),
        }));
        await get().fetchChart(orgId, orgPlan);
      } catch (err: unknown) {
        set({ error: (err as Error).message });
      }
    },

    // ── moveNode ───────────────────────────────────────────────────────────
    moveNode: async (orgId, orgPlan, { nodeId, parentId, position_x, position_y }) => {
      if (!canAccessOrgChart(orgPlan)) throw new OrgChartPlanGateError(orgPlan);
      // Optimistic update — keeps canvas responsive during drag
      set(s => ({
        flatNodes: s.flatNodes.map(n =>
          n.id === nodeId ? { ...n, parent_id: parentId, position_x, position_y } : n
        ),
      }));
      try {
        const { error } = await supabase
          .from('org_chart_nodes')
          .update({
            parent_id: parentId,
            position_x,
            position_y,
            updated_at: new Date().toISOString(),
          })
          .eq('id', nodeId)
          .eq('org_id', orgId);
        if (error) throw error;
        await get().fetchChart(orgId, orgPlan); // reconcile tree
      } catch (err: unknown) {
        const errMsg = (err as Error).message;
        await get().fetchChart(orgId, orgPlan); // rollback via re-fetch
        set({ error: errMsg }); // re-set after fetchChart clears it
      }
    },

    // ── deleteNode ─────────────────────────────────────────────────────────
    deleteNode: async (orgId, orgPlan, nodeId) => {
      if (!canAccessOrgChart(orgPlan)) throw new OrgChartPlanGateError(orgPlan);
      set({ error: null });
      try {
        const { error } = await supabase
          .from('org_chart_nodes')
          .delete()
          .eq('id', nodeId)
          .eq('org_id', orgId);
        if (error) throw error;
        set(s => ({ flatNodes: s.flatNodes.filter(n => n.id !== nodeId) }));
        await get().fetchChart(orgId, orgPlan);
      } catch (err: unknown) {
        set({ error: (err as Error).message });
      }
    },

    // ── addReportingLine ───────────────────────────────────────────────────
    addReportingLine: async (orgId, orgPlan, payload) => {
      if (!canAccessOrgChart(orgPlan)) throw new OrgChartPlanGateError(orgPlan);
      set({ isLineLoading: true, error: null });
      try {
        const { data, error } = await supabase
          .from('org_reporting_lines')
          .insert({ ...payload, org_id: orgId })
          .select()
          .single();
        if (error) throw error;
        set(s => ({
          reportingLines: [
            ...s.reportingLines,
            mapOcReportingLineRow(data as OcReportingLineRow),
          ],
          isLineLoading: false,
        }));
      } catch (err: unknown) {
        set({ isLineLoading: false, error: (err as Error).message });
      }
    },

    // ── removeReportingLine ────────────────────────────────────────────────
    removeReportingLine: async (orgId, orgPlan, lineId) => {
      if (!canAccessOrgChart(orgPlan)) throw new OrgChartPlanGateError(orgPlan);
      set({ error: null });
      try {
        const { error } = await supabase
          .from('org_reporting_lines')
          .delete()
          .eq('id', lineId)
          .eq('org_id', orgId);
        if (error) throw error;
        set(s => ({
          reportingLines: s.reportingLines.filter(l => l.id !== lineId),
        }));
      } catch (err: unknown) {
        set({ error: (err as Error).message });
      }
    },

    // ── UI helpers ─────────────────────────────────────────────────────────
    selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

    toggleExpand: (nodeId) =>
      set(s => {
        const next = new Set(s.expandedNodeIds);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return { expandedNodeIds: next };
      }),

    setDragging: (isDragging) => set({ isDragging }),

    setFilters: (filters) =>
      set(s => ({ filters: { ...s.filters, ...filters } })),

    clearError: () => set({ error: null }),
  })
);
