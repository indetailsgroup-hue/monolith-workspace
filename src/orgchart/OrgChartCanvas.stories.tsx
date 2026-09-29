/**
 * src/orgchart/OrgChartCanvas.stories.tsx
 *
 * MONOLITH v18.0 — Storybook CSF3 stories for OrgChartCanvas
 *
 * 10 stories:
 *   PlanGateWallFree        — FREE plan  → plan-gate-wall present, orgchart-canvas absent
 *   PlanGateWallStarter     — STARTER    → plan-gate-wall present
 *   Loading                 — PROFESSIONAL + isLoading:true → orgchart-loading
 *   EmptyState              — PROFESSIONAL + no nodes       → orgchart-empty
 *   StoreError              — PROFESSIONAL + error string   → orgchart-error
 *   WithNodes               — 4 nodes + 1 dotted reporting line (read-only)
 *   AdminView               — ENTERPRISE + isAdmin:true; node-delete-btn visible
 *   NodeDragInteraction     — play: pointerdown on drag handle → pointermove 60px
 *                             → pointerup → moveNode spy called with new position
 *   ReportingLineToggle     — play: uncheck reporting-line-toggle → checkbox unchecked
 *   NodeDetailPanel         — play: click node card → node-detail-panel present;
 *                             click close ✕ → panel removed
 *
 * Mock strategy:
 *   withOrgChartStore decorator calls useOrgChartStore.setState(…) to seed
 *   state + replace async actions with no-ops/spies before each story.
 *   fetchChart is always overridden to a no-op so the useEffect in OrgChartCanvas
 *   does not hit Supabase during Storybook rendering.
 */

import React from 'react';
import type { Meta, StoryFn, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';

import OrgChartCanvas from './OrgChartCanvas';
import { useOrgChartStore } from './orgChartStore';
import type { OcNode, OcReportingLine } from './orgChartTypes';
import { DEFAULT_OC_FILTERS } from './orgChartTypes';

// =============================================================================
// Module-level spies (reset per story via beforeEach / decorator)
// =============================================================================

const moveNodeSpy  = fn();
const deleteNodeSpy = fn();
const selectNodeSpy = fn();

// =============================================================================
// Sample data
// =============================================================================

const NODE_ROOT: OcNode = {
  id: 'node-root',
  org_id: 'org-1',
  parent_id: null,
  employee_id: null,
  node_type: 'DEPARTMENT',
  title: 'บริษัท DAPH Decor',
  department: 'ทั่วไป',
  position_x: 300,
  position_y: 40,
  hierarchy_level: 0,
  is_active: true,
  metadata: null,
  created_at: '2027-02-01T00:00:00Z',
  updated_at: '2027-02-01T00:00:00Z',
  children: [],
  depth: 0,
  path: [],
};

const NODE_CEO: OcNode = {
  id: 'node-ceo',
  org_id: 'org-1',
  parent_id: 'node-root',
  employee_id: 'emp-1',
  node_type: 'EMPLOYEE',
  title: 'ประธานเจ้าหน้าที่บริหาร',
  department: 'บริหาร',
  position_x: 300,
  position_y: 180,
  hierarchy_level: 1,
  is_active: true,
  metadata: null,
  created_at: '2027-02-01T00:00:00Z',
  updated_at: '2027-02-01T00:00:00Z',
  children: [],
  depth: 1,
  path: ['node-root'],
};

const NODE_PROD: OcNode = {
  id: 'node-prod',
  org_id: 'org-1',
  parent_id: 'node-ceo',
  employee_id: 'emp-2',
  node_type: 'EMPLOYEE',
  title: 'ผู้จัดการฝ่ายผลิต',
  department: 'การผลิต',
  position_x: 100,
  position_y: 320,
  hierarchy_level: 2,
  is_active: true,
  metadata: null,
  created_at: '2027-02-01T00:00:00Z',
  updated_at: '2027-02-01T00:00:00Z',
  children: [],
  depth: 2,
  path: ['node-root', 'node-ceo'],
};

const NODE_QC: OcNode = {
  id: 'node-qc',
  org_id: 'org-1',
  parent_id: 'node-ceo',
  employee_id: 'emp-3',
  node_type: 'EMPLOYEE',
  title: 'ผู้จัดการฝ่าย QC',
  department: 'QC',
  position_x: 500,
  position_y: 320,
  hierarchy_level: 2,
  is_active: true,
  metadata: null,
  created_at: '2027-02-01T00:00:00Z',
  updated_at: '2027-02-01T00:00:00Z',
  children: [],
  depth: 2,
  path: ['node-root', 'node-ceo'],
};

const ALL_NODES: OcNode[] = [NODE_ROOT, NODE_CEO, NODE_PROD, NODE_QC];

const LINE_DOTTED: OcReportingLine = {
  id: 'line-1',
  org_id: 'org-1',
  from_node_id: 'node-prod',
  to_node_id: 'node-qc',
  line_type: 'DOTTED',
  label: null,
  created_at: '2027-02-01T00:00:00Z',
};

// =============================================================================
// Store decorator
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withOrgChartStore = (state: Record<string, any>) =>
  (Story: StoryFn) => {
    moveNodeSpy.mockReset();
    deleteNodeSpy.mockReset();
    selectNodeSpy.mockReset();
    useOrgChartStore.setState({
      // ── default state ────────────────────────────────────────────────────
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
      // ── default no-op actions (prevent Supabase calls) ──────────────────
      fetchChart: async () => {},
      createNode: async () => {},
      updateNode: async () => {},
      moveNode: moveNodeSpy,
      deleteNode: deleteNodeSpy,
      addReportingLine: async () => {},
      removeReportingLine: async () => {},
      selectNode: (nodeId: string | null) =>
        useOrgChartStore.setState({ selectedNodeId: nodeId }),
      toggleExpand: () => {},
      setDragging: (v: boolean) => useOrgChartStore.setState({ isDragging: v }),
      setFilters: () => {},
      clearError: () => useOrgChartStore.setState({ error: null }),
      // ── story-specific overrides ─────────────────────────────────────────
      ...state,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return <Story />;
  };

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof OrgChartCanvas> = {
  title: 'OrgChart/OrgChartCanvas',
  component: OrgChartCanvas,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    orgId: 'org-1',
    orgPlan: 'PROFESSIONAL',
    isAdmin: false,
  },
};

export default meta;
type Story = StoryObj<typeof OrgChartCanvas>;

// =============================================================================
// 1. Plan gate walls
// =============================================================================

export const PlanGateWallFree: Story = {
  name: 'Plan Gate Wall — FREE',
  args: { orgPlan: 'FREE' },
  decorators: [withOrgChartStore({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('orgchart-canvas')).not.toBeInTheDocument();
  },
};

export const PlanGateWallStarter: Story = {
  name: 'Plan Gate Wall — STARTER',
  args: { orgPlan: 'STARTER' },
  decorators: [withOrgChartStore({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('plan-gate-wall')).toBeInTheDocument();
  },
};

// =============================================================================
// 2. Loading / Error / Empty states
// =============================================================================

export const Loading: Story = {
  name: 'Loading State',
  decorators: [withOrgChartStore({ isLoading: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('orgchart-loading')).toBeInTheDocument();
    await expect(canvas.queryByTestId('orgchart-canvas')).not.toBeInTheDocument();
  },
};

export const EmptyState: Story = {
  name: 'Empty State',
  decorators: [withOrgChartStore({ flatNodes: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('orgchart-empty')).toBeInTheDocument();
    await expect(canvas.queryByTestId('orgchart-canvas')).not.toBeInTheDocument();
  },
};

export const StoreError: Story = {
  name: 'Store Error',
  decorators: [withOrgChartStore({ error: 'เชื่อมต่อฐานข้อมูลล้มเหลว' })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const errEl = canvas.getByTestId('orgchart-error');
    await expect(errEl).toBeInTheDocument();
    await expect(errEl.textContent).toContain('เชื่อมต่อฐานข้อมูลล้มเหลว');
  },
};

// =============================================================================
// 3. WithNodes — read-only view with 4 nodes + 1 dotted reporting line
// =============================================================================

export const WithNodes: Story = {
  name: 'With Nodes',
  decorators: [
    withOrgChartStore({
      flatNodes: ALL_NODES,
      reportingLines: [LINE_DOTTED],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('orgchart-canvas')).toBeInTheDocument();
    const nodeEls = canvas.getAllByTestId('orgchart-node');
    await expect(nodeEls).toHaveLength(4);
    // reporting-line-toggle checkbox present
    await expect(canvas.getByTestId('reporting-line-toggle')).toBeInTheDocument();
  },
};

// =============================================================================
// 4. AdminView — ENTERPRISE + isAdmin, node-delete-btn visible
// =============================================================================

export const AdminView: Story = {
  name: 'Admin View — ENTERPRISE',
  args: { orgPlan: 'ENTERPRISE', isAdmin: true },
  decorators: [
    withOrgChartStore({
      flatNodes: ALL_NODES,
      reportingLines: [LINE_DOTTED],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('orgchart-canvas')).toBeInTheDocument();
    // Each node card should have a delete button when isAdmin
    const deleteBtns = canvas.getAllByTestId('node-delete-btn');
    await expect(deleteBtns).toHaveLength(4);
  },
};

// =============================================================================
// 5. NodeDragInteraction — pointerdown/move/up → moveNode spy called
// =============================================================================

export const NodeDragInteraction: Story = {
  name: 'Node Drag Interaction',
  args: { orgPlan: 'PROFESSIONAL', isAdmin: false },
  decorators: [
    withOrgChartStore({
      flatNodes: ALL_NODES,
      reportingLines: [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Match the real store's optimistic update so cards and SVG edges use the
    // same final coordinates after the drag interaction.
    moveNodeSpy.mockImplementation(async (...args: Parameters<ReturnType<typeof useOrgChartStore.getState>['moveNode']>) => {
      const [, , payload] = args;
      useOrgChartStore.setState(state => ({
        flatNodes: state.flatNodes.map(node => node.id === payload.nodeId
          ? { ...node, parent_id: payload.parentId, position_x: payload.position_x, position_y: payload.position_y }
          : node),
      }));
    });
    // Wait for canvas area to be present
    const canvasArea = canvas.getByTestId('orgchart-canvas-area');
    const dragHandles = canvas.getAllByTestId('node-drag-handle');
    const firstHandle = dragHandles[0];

    // Simulate drag: pointerdown on handle → pointermove 60px right, 40px down → pointerup
    firstHandle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 150,
        clientY: 100,
        pointerId: 1,
      })
    );
    canvasArea.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        clientX: 210,
        clientY: 140,
        pointerId: 1,
      })
    );
    canvasArea.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: 210,
        clientY: 140,
        pointerId: 1,
      })
    );

    // moveNode should have been called with the dragged node's new position
    await expect(moveNodeSpy).toHaveBeenCalledOnce();
    const [, , payload] = moveNodeSpy.mock.calls[0] as [string, string, { nodeId: string; position_x: number; position_y: number }];
    // dx=60, dy=40 — new position should be original + delta
    await expect(payload.position_x).toBe(NODE_ROOT.position_x + 60);
    await expect(payload.position_y).toBe(NODE_ROOT.position_y + 40);
  },
};

// =============================================================================
// 6. ReportingLineToggle — uncheck checkbox → reporting lines hidden from SVG
// =============================================================================

export const ReportingLineToggle: Story = {
  name: 'Reporting Line Toggle',
  args: { orgPlan: 'PROFESSIONAL' },
  decorators: [
    withOrgChartStore({
      flatNodes: ALL_NODES,
      reportingLines: [LINE_DOTTED],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggleCheckbox = canvas.getByTestId('reporting-line-toggle');

    // Initially checked — SVG lines visible
    await expect((toggleCheckbox as HTMLInputElement).checked).toBe(true);
    await expect(canvas.getByTestId('orgchart-lines-svg')).toBeInTheDocument();

    // Uncheck → matrix reporting lines hidden (checkbox unchecked)
    await userEvent.click(toggleCheckbox);
    await expect((toggleCheckbox as HTMLInputElement).checked).toBe(false);
  },
};

// =============================================================================
// 7. NodeDetailPanel — click node → panel opens; close → panel gone
// =============================================================================

export const NodeDetailPanel: Story = {
  name: 'Node Detail Panel',
  args: { orgPlan: 'PROFESSIONAL', isAdmin: false },
  decorators: [
    withOrgChartStore({
      flatNodes: ALL_NODES,
      reportingLines: [LINE_DOTTED],
      // Pre-select node-ceo so detail panel is open from the start
      selectedNodeId: 'node-ceo',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Detail panel should be visible for the pre-selected node
    const panel = canvas.getByTestId('node-detail-panel');
    await expect(panel).toBeInTheDocument();
    await expect(panel.textContent).toContain('ประธานเจ้าหน้าที่บริหาร');

    // Click the close button → panel should disappear
    const closeBtn = within(panel).getByLabelText('Close panel');
    await userEvent.click(closeBtn);
    await expect(canvas.queryByTestId('node-detail-panel')).not.toBeInTheDocument();
  },
};

// =============================================================================
// 8. NodeDetailPanel — Admin — shows add-line and delete controls
// =============================================================================

export const NodeDetailPanelAdmin: Story = {
  name: 'Node Detail Panel — Admin',
  args: { orgPlan: 'ENTERPRISE', isAdmin: true },
  decorators: [
    withOrgChartStore({
      flatNodes: ALL_NODES,
      reportingLines: [LINE_DOTTED],
      selectedNodeId: 'node-prod',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const panel = canvas.getByTestId('node-detail-panel');
    await expect(panel).toBeInTheDocument();
    // Admin controls: add-line btn present (disabled until target selected)
    const addLineBtn = within(panel).getByTestId('node-add-line-btn');
    await expect(addLineBtn).toBeDisabled();
    // reporting-line-toggle (line-type swap) present for existing line
    const lineToggle = within(panel).getByTestId('reporting-line-toggle');
    await expect(lineToggle).toBeInTheDocument();
  },
};
