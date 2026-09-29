import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useOrgChartStore } from '../orgChartStore';
import { OrgChartPlanGateError, DEFAULT_OC_FILTERS } from '../orgChartTypes';
import type { OcNodeRow, OcNode, OcReportingLine } from '../orgChartTypes';
import type { OrgPlan } from '../../tenant/types';

// ---------------------------------------------------------------------------
// Supabase mock — vi.hoisted so the factory runs before vi.mock() hoisting
// ---------------------------------------------------------------------------
const { mockSupabase, setResult, resetMock } = vi.hoisted(() => {
  type ResultKey = string; // `${table}:${op}`
  const tableResults: Record<ResultKey, { data: unknown; error: unknown }> = {};

  function setResult(
    table: string,
    op: string,
    data: unknown,
    error: unknown = null,
  ) {
    tableResults[`${table}:${op}`] = { data, error };
  }

  function resetMock() {
    for (const key of Object.keys(tableResults)) {
      delete tableResults[key];
    }
  }

  /**
   * Creates a fresh chainable query object for one supabase.from(table) call.
   * op starts as 'unknown'; select() only sets it to 'select' when still
   * unknown (preserving 'insert' through .insert().select().single() chains).
   */
  function makeChain(table: string) {
    let op = 'unknown';
    const getResult = () =>
      tableResults[`${table}:${op}`] ?? { data: null, error: null };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: (..._a: unknown[]) => {
        if (op === 'unknown') op = 'select';
        return chain;
      },
      insert: (_a: unknown) => {
        op = 'insert';
        return chain;
      },
      update: (_a: unknown) => {
        op = 'update';
        return chain;
      },
      delete: () => {
        op = 'delete';
        return chain;
      },
      eq: (..._a: unknown[]) => chain,
      neq: (..._a: unknown[]) => chain,
      is: (..._a: unknown[]) => chain,
      in: (..._a: unknown[]) => chain,
      order: (..._a: unknown[]) => chain,
      // .single() terminates the chain and resolves a single-row result
      single: () => ({
        then: (
          onFulfilled: (v: unknown) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) => Promise.resolve(getResult()).then(onFulfilled, onRejected),
      }),
      // chain itself is thenable (for .select() without .single())
      then: (
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => Promise.resolve(getResult()).then(onFulfilled, onRejected),
    };

    return chain;
  }

  const mockSupabase = {
    from: vi.fn((table: string) => makeChain(table)),
  };

  return { mockSupabase, setResult, resetMock };
});

vi.mock('../../core/supabase', () => ({ supabase: mockSupabase }));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function makeNodeRow(overrides: Partial<OcNodeRow> = {}): OcNodeRow {
  const id = overrides.id ?? 'node-1';
  return {
    id,
    org_id: 'org-1',
    parent_id: null,
    employee_id: null,
    node_type: 'EMPLOYEE',
    title: 'CEO',
    department: 'Management',
    position_x: 0,
    position_y: 0,
    hierarchy_level: 1,
    is_active: true,
    metadata: {},
    created_at: '2027-01-01T00:00:00Z',
    updated_at: '2027-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeNode(
  overrides: Partial<OcNodeRow> & {
    children?: OcNode[];
    depth?: number;
    path?: string[];
  } = {},
): OcNode {
  const id = overrides.id ?? 'node-1';
  return {
    id,
    org_id: 'org-1',
    parent_id: null,
    employee_id: null,
    node_type: 'EMPLOYEE',
    title: 'CEO',
    department: 'Management',
    position_x: 0,
    position_y: 0,
    hierarchy_level: 1,
    is_active: true,
    metadata: {},
    created_at: '2027-01-01T00:00:00Z',
    updated_at: '2027-01-01T00:00:00Z',
    children: [],
    depth: 0,
    path: [id],
    ...overrides,
  };
}

/** Minimal data to create/update a node (org_id embedded) */
const minNodeData = {
  org_id: 'org-1',
  parent_id: null as string | null,
  employee_id: null as string | null,
  node_type: 'EMPLOYEE' as const,
  title: 'New Node',
  department: 'Engineering',
  position_x: 0,
  position_y: 0,
  hierarchy_level: 1,
  is_active: true,
  metadata: {},
};

/** Minimal line data */
const minLineData = {
  org_id: 'org-1',
  from_node_id: 'node-1',
  to_node_id: 'node-2',
  line_type: 'SOLID' as const,
  label: null as string | null,
};

/** Seed store + DB mocks so fetchChart won't fail in non-gate tests */
function seedEmptyChart() {
  setResult('org_chart_nodes', 'select', []);
  setResult('org_reporting_lines', 'select', []);
}

// ---------------------------------------------------------------------------
// beforeEach: reset mock results AND store state
// ---------------------------------------------------------------------------
beforeEach(() => {
  resetMock();
  mockSupabase.from.mockClear();

  useOrgChartStore.setState({
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
  });
});

// ===========================================================================
// Plan gate
// ===========================================================================
describe('plan gate', () => {
  // --- gated plans: FREE and STARTER ---
  it.each<OrgPlan>(['FREE', 'STARTER'])(
    'createNode throws OrgChartPlanGateError on %s',
    async (plan) => {
      await expect(
        useOrgChartStore.getState().createNode('org-1', plan, { node_type: 'EMPLOYEE' as const, title: 'New Node' }),
      ).rejects.toBeInstanceOf(OrgChartPlanGateError);
    },
  );

  it.each<OrgPlan>(['FREE', 'STARTER'])(
    'updateNode throws OrgChartPlanGateError on %s',
    async (plan) => {
      await expect(
        useOrgChartStore
          .getState()
          .updateNode('org-1', plan, 'node-1', { title: 'Updated' }),
      ).rejects.toBeInstanceOf(OrgChartPlanGateError);
    },
  );

  it.each<OrgPlan>(['FREE', 'STARTER'])(
    'moveNode throws OrgChartPlanGateError on %s',
    async (plan) => {
      await expect(
        useOrgChartStore.getState().moveNode('org-1', plan, { nodeId: 'node-1', parentId: null, position_x: 10, position_y: 20 }),
      ).rejects.toBeInstanceOf(OrgChartPlanGateError);
    },
  );

  it.each<OrgPlan>(['FREE', 'STARTER'])(
    'deleteNode throws OrgChartPlanGateError on %s',
    async (plan) => {
      await expect(
        useOrgChartStore.getState().deleteNode('node-1', plan, 'org-1'),
      ).rejects.toBeInstanceOf(OrgChartPlanGateError);
    },
  );

  it.each<OrgPlan>(['FREE', 'STARTER'])(
    'addReportingLine throws OrgChartPlanGateError on %s',
    async (plan) => {
      await expect(
        useOrgChartStore.getState().addReportingLine('org-1', plan, { from_node_id: 'node-1', to_node_id: 'node-2', line_type: 'SOLID' as const, label: null }),
      ).rejects.toBeInstanceOf(OrgChartPlanGateError);
    },
  );

  it.each<OrgPlan>(['FREE', 'STARTER'])(
    'removeReportingLine throws OrgChartPlanGateError on %s',
    async (plan) => {
      await expect(
        useOrgChartStore.getState().removeReportingLine('org-1', plan, 'line-1'),
      ).rejects.toBeInstanceOf(OrgChartPlanGateError);
    },
  );

  // --- PROFESSIONAL: write actions resolve ---
  it('moveNode resolves without gate error for PROFESSIONAL plan', async () => {
    const node = makeNode({ id: 'node-1' });
    useOrgChartStore.setState({ flatNodes: [node] });
    setResult('org_chart_nodes', 'update', makeNodeRow({ id: 'node-1' }));
    setResult('org_chart_nodes', 'select', [makeNodeRow({ id: 'node-1' })]);
    setResult('org_reporting_lines', 'select', []);

    // Must not throw OrgChartPlanGateError
    await useOrgChartStore
      .getState()
      .moveNode('org-1', 'PROFESSIONAL', { nodeId: 'node-1', parentId: null, position_x: 10, position_y: 20 });
  });

  // --- fetchChart has NO plan gate ---
  it('fetchChart resolves without error for FREE plan', async () => {
    seedEmptyChart();
    await useOrgChartStore.getState().fetchChart('org-1', 'FREE');
    expect(useOrgChartStore.getState().error).toBeNull();
  });
});

// ===========================================================================
// fetchChart
// ===========================================================================
describe('fetchChart', () => {
  it('builds tree and populates nodes, flatNodes, reportingLines', async () => {
    const parentRow = makeNodeRow({
      id: 'parent',
      parent_id: null,
      hierarchy_level: 1,
    });
    const childRow = makeNodeRow({
      id: 'child',
      parent_id: 'parent',
      hierarchy_level: 2,
    });
    const lineRow: OcReportingLine = {
      id: 'line-1',
      org_id: 'org-1',
      from_node_id: 'parent',
      to_node_id: 'child',
      line_type: 'SOLID',
      label: null,
      created_at: '2027-01-01T00:00:00Z',
    };

    setResult('org_chart_nodes', 'select', [parentRow, childRow]);
    setResult('org_reporting_lines', 'select', [lineRow]);

    await useOrgChartStore.getState().fetchChart('org-1', 'PROFESSIONAL');

    const { nodes, flatNodes, reportingLines } = useOrgChartStore.getState();

    // Tree structure: one root with one child
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('parent');
    expect(nodes[0].children).toHaveLength(1);
    expect(nodes[0].children[0].id).toBe('child');

    // flatNodes includes both nodes
    expect(flatNodes).toHaveLength(2);
    expect(flatNodes.map((n) => n.id)).toContain('parent');
    expect(flatNodes.map((n) => n.id)).toContain('child');

    // Reporting lines
    expect(reportingLines).toHaveLength(1);
    expect(reportingLines[0].id).toBe('line-1');
  });

  it('flattens tree in depth-first order: parent before child', async () => {
    const root = makeNodeRow({ id: 'root', parent_id: null });
    const child = makeNodeRow({ id: 'child', parent_id: 'root' });
    const grandchild = makeNodeRow({ id: 'grandchild', parent_id: 'child' });

    setResult('org_chart_nodes', 'select', [root, child, grandchild]);
    setResult('org_reporting_lines', 'select', []);

    await useOrgChartStore.getState().fetchChart('org-1', 'PROFESSIONAL');

    const ids = useOrgChartStore.getState().flatNodes.map((n) => n.id);
    expect(ids.indexOf('root')).toBeLessThan(ids.indexOf('child'));
    expect(ids.indexOf('child')).toBeLessThan(ids.indexOf('grandchild'));
  });

  it('sets error and leaves nodes empty on DB failure', async () => {
    setResult('org_chart_nodes', 'select', null, {
      message: 'DB connection failed',
    });
    setResult('org_reporting_lines', 'select', []);

    await useOrgChartStore.getState().fetchChart('org-1', 'PROFESSIONAL');

    const { error, nodes } = useOrgChartStore.getState();
    expect(error).toBeTruthy();
    expect(nodes).toHaveLength(0);
  });

  it('sets isLoading=false after completion', async () => {
    seedEmptyChart();
    await useOrgChartStore.getState().fetchChart('org-1', 'PROFESSIONAL');
    expect(useOrgChartStore.getState().isLoading).toBe(false);
  });
});

// ===========================================================================
// moveNode
// ===========================================================================
describe('moveNode', () => {
  it('applies optimistic position update synchronously before first await', async () => {
    const node = makeNode({ id: 'node-1', position_x: 0, position_y: 0 });
    useOrgChartStore.setState({ flatNodes: [node] });

    setResult('org_chart_nodes', 'update', makeNodeRow({ id: 'node-1', position_x: 100, position_y: 200 }));
    setResult('org_chart_nodes', 'select', [makeNodeRow({ id: 'node-1', position_x: 100, position_y: 200 })]);
    setResult('org_reporting_lines', 'select', []);

    // Do NOT await — synchronous code runs up to the first `await` in the action
    const promise = useOrgChartStore
      .getState()
      .moveNode('org-1', 'PROFESSIONAL', { nodeId: 'node-1', parentId: null, position_x: 100, position_y: 200 });

    // Optimistic update should already be in store
    const { flatNodes } = useOrgChartStore.getState();
    expect(flatNodes[0].position_x).toBe(100);
    expect(flatNodes[0].position_y).toBe(200);

    await promise;
  });

  it('rolls back position via re-fetch when DB update fails', async () => {
    const node = makeNode({ id: 'node-1', position_x: 0, position_y: 0 });
    useOrgChartStore.setState({ flatNodes: [node] });

    // DB update fails
    setResult('org_chart_nodes', 'update', null, {
      message: 'update error',
    });
    // fetchChart (rollback re-fetch) returns original row
    setResult('org_chart_nodes', 'select', [
      makeNodeRow({ id: 'node-1', position_x: 0, position_y: 0 }),
    ]);
    setResult('org_reporting_lines', 'select', []);

    await useOrgChartStore
      .getState()
      .moveNode('org-1', 'PROFESSIONAL', { nodeId: 'node-1', parentId: null, position_x: 100, position_y: 200 });

    const state = useOrgChartStore.getState();
    expect(state.error).toBeTruthy();
    // flatNodes restored to original position by re-fetch
    expect(state.flatNodes[0].position_x).toBe(0);
    expect(state.flatNodes[0].position_y).toBe(0);
  });
});

// ===========================================================================
// deleteNode
// ===========================================================================
describe('deleteNode', () => {
  it('removes the deleted node and re-fetches chart after DB delete', async () => {
    const node1 = makeNode({ id: 'node-1' });
    const node2 = makeNode({ id: 'node-2' });
    useOrgChartStore.setState({ flatNodes: [node1, node2] });

    // DB delete succeeds (null data, null error)
    setResult('org_chart_nodes', 'delete', null);
    // fetchChart returns only node2
    setResult('org_chart_nodes', 'select', [makeNodeRow({ id: 'node-2' })]);
    setResult('org_reporting_lines', 'select', []);

    await useOrgChartStore
      .getState()
      .deleteNode('node-1', 'PROFESSIONAL', 'org-1');

    const { flatNodes } = useOrgChartStore.getState();
    expect(flatNodes).toHaveLength(1);
    expect(flatNodes[0].id).toBe('node-2');
  });

  it('sets error when DB delete fails', async () => {
    const node = makeNode({ id: 'node-1' });
    useOrgChartStore.setState({ flatNodes: [node] });

    setResult('org_chart_nodes', 'delete', null, {
      message: 'delete forbidden',
    });
    // fetchChart after error
    setResult('org_chart_nodes', 'select', [makeNodeRow({ id: 'node-1' })]);
    setResult('org_reporting_lines', 'select', []);

    await useOrgChartStore
      .getState()
      .deleteNode('node-1', 'PROFESSIONAL', 'org-1');

    expect(useOrgChartStore.getState().error).toBeTruthy();
  });

  it('delete does NOT optimistically remove node before DB call', async () => {
    const node = makeNode({ id: 'node-1' });
    useOrgChartStore.setState({ flatNodes: [node] });

    setResult('org_chart_nodes', 'delete', null);
    setResult('org_chart_nodes', 'select', []);
    setResult('org_reporting_lines', 'select', []);

    // Call without await to inspect synchronous state
    const promise = useOrgChartStore
      .getState()
      .deleteNode('node-1', 'PROFESSIONAL', 'org-1');

    // Node should still be present (deleteNode is NOT optimistic)
    expect(useOrgChartStore.getState().flatNodes).toHaveLength(1);

    await promise;

    // After resolve, fetchChart has cleared the list
    expect(useOrgChartStore.getState().flatNodes).toHaveLength(0);
  });
});

// ===========================================================================
// UI helpers
// ===========================================================================
describe('UI helpers', () => {
  it('selectNode sets selectedNodeId', () => {
    const { selectNode } = useOrgChartStore.getState();
    selectNode('node-42');
    expect(useOrgChartStore.getState().selectedNodeId).toBe('node-42');
  });

  it('selectNode(null) clears selectedNodeId', () => {
    useOrgChartStore.setState({ selectedNodeId: 'node-1' });
    useOrgChartStore.getState().selectNode(null);
    expect(useOrgChartStore.getState().selectedNodeId).toBeNull();
  });

  it('toggleExpand adds nodeId to expandedNodeIds when absent', () => {
    const { toggleExpand } = useOrgChartStore.getState();
    toggleExpand('node-1');
    expect(useOrgChartStore.getState().expandedNodeIds.has('node-1')).toBe(true);
  });

  it('toggleExpand removes nodeId from expandedNodeIds when present', () => {
    useOrgChartStore.setState({
      expandedNodeIds: new Set(['node-1']),
    });
    useOrgChartStore.getState().toggleExpand('node-1');
    expect(useOrgChartStore.getState().expandedNodeIds.has('node-1')).toBe(false);
  });

  it('toggleExpand does not affect other ids in the set', () => {
    useOrgChartStore.setState({
      expandedNodeIds: new Set(['node-1', 'node-2']),
    });
    useOrgChartStore.getState().toggleExpand('node-1');
    expect(useOrgChartStore.getState().expandedNodeIds.has('node-2')).toBe(true);
  });

  it('setDragging sets isDragging to true', () => {
    useOrgChartStore.getState().setDragging(true);
    expect(useOrgChartStore.getState().isDragging).toBe(true);
  });

  it('setDragging sets isDragging to false', () => {
    useOrgChartStore.setState({ isDragging: true });
    useOrgChartStore.getState().setDragging(false);
    expect(useOrgChartStore.getState().isDragging).toBe(false);
  });

  it('setFilters merges partial filters without clobbering other fields', () => {
    const { setFilters } = useOrgChartStore.getState();
    setFilters({ department: 'Engineering' });

    const { filters } = useOrgChartStore.getState();
    expect(filters.department).toBe('Engineering');
    expect(filters.nodeType).toBe(DEFAULT_OC_FILTERS.nodeType); // not clobbered
    expect(filters.isActive).toBe(DEFAULT_OC_FILTERS.isActive); // not clobbered
  });

  it('setFilters can update multiple fields at once', () => {
    useOrgChartStore.getState().setFilters({ isActive: false, nodeType: 'ROLE' });
    const { filters } = useOrgChartStore.getState();
    expect(filters.isActive).toBe(false);
    expect(filters.nodeType).toBe('ROLE');
  });

  it('clearError resets error to null', () => {
    useOrgChartStore.setState({ error: 'something went wrong' });
    useOrgChartStore.getState().clearError();
    expect(useOrgChartStore.getState().error).toBeNull();
  });

  it('clearError is idempotent when error is already null', () => {
    useOrgChartStore.setState({ error: null });
    expect(() => useOrgChartStore.getState().clearError()).not.toThrow();
    expect(useOrgChartStore.getState().error).toBeNull();
  });
});
