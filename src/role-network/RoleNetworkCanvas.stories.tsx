/**
 * src/role-network/RoleNetworkCanvas.stories.tsx
 *
 * MONOLITH v18.0 — Storybook CSF3 stories for RoleNetworkCanvas
 *
 * 10 stories:
 *   PlanGateWallFree                  — FREE plan  → rnv-plan-gate-wall visible, canvas absent
 *   PlanGateWallProfessional          — PROFESSIONAL → rnv-plan-gate-wall visible
 *   LoadingState                      — ENTERPRISE + isLoading → rnv-loading
 *   EmptyState                        — ENTERPRISE + no roles  → rnv-empty
 *   StoreError                        — ENTERPRISE + error     → rnv-error
 *   WithNodes                         — ENTERPRISE + 4 roles (mixed seniority); node cards + badges
 *   RelationshipEdgeRendering         — ENTERPRISE + roles + relationships; rnv-edges-svg present
 *   RoleDetailPanelOpen               — pre-selected role → panel open; close btn → panel gone
 *   RoleDetailPanelAddInteraction     — admin: select target role → click add → addRelationship spy
 *   RoleDetailPanelRemoveInteraction  — admin: existing relationship → click remove → spy called
 *
 * Additional:
 *   NodeClickSelectsRole              — click node card → panel opens
 *   AdminView                         — admin controls visible in panel
 *   ReadOnlyView                      — non-admin: no add/remove controls
 *
 * Mock strategy:
 *   withRoleNetworkStore decorator calls useRoleNetworkStore.setState(…) to seed
 *   state + replace async actions with no-ops/spies before each story.
 *   fetchNetwork always overridden to no-op so useEffect never hits Supabase.
 */

import React from 'react';
import type { Meta, StoryFn, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';

import RoleNetworkCanvas from './RoleNetworkCanvas';
import { useRoleNetworkStore } from './roleNetworkStore';
import type { RnvRole, RnvRoleRelationship } from './roleNetworkTypes';
import { DEFAULT_RNV_FILTERS } from './roleNetworkTypes';

// =============================================================================
// Module-level spies (reset per story via decorator)
// =============================================================================

const addRelationshipSpy    = fn();
const removeRelationshipSpy = fn();

// =============================================================================
// Sample data helpers
// =============================================================================

function makeRole(overrides: Partial<RnvRole>): RnvRole {
  const id = overrides.id ?? 'role-1';
  return {
    id,
    org_id: 'org-1',
    name: 'Role',
    description: null,
    seniority: 'MID',
    is_active: true,
    metadata: null,
    current_headcount: 0,
    relationship_count: 0,
    created_at: '2027-02-10T00:00:00Z',
    updated_at: '2027-02-10T00:00:00Z',
    relationships: [],
    employeeRoles: [],
    ...overrides,
  };
}

// ─── Roles ───────────────────────────────────────────────────────────────────

const ROLE_PRINCIPAL = makeRole({
  id: 'role-principal',
  name: 'Director of Product',
  seniority: 'PRINCIPAL',
  current_headcount: 1,
  relationship_count: 1,
});

const ROLE_LEAD = makeRole({
  id: 'role-lead',
  name: 'Tech Lead Frontend',
  seniority: 'LEAD',
  current_headcount: 2,
  relationship_count: 1,
});

const ROLE_SENIOR = makeRole({
  id: 'role-senior',
  name: 'Senior QC Engineer',
  seniority: 'SENIOR',
  current_headcount: 3,
  relationship_count: 1,
});

const ROLE_MID = makeRole({
  id: 'role-mid',
  name: 'Full Stack Developer',
  seniority: 'MID',
  current_headcount: 5,
  relationship_count: 0,
});

// ─── Relationships ────────────────────────────────────────────────────────────

const REL_COLLABORATES: RnvRoleRelationship = {
  id: 'rel-1',
  org_id: 'org-1',
  from_role_id: 'role-principal',
  to_role_id: 'role-lead',
  relationship_type: 'COLLABORATES_WITH',
  notes: null,
  created_at: '2027-02-10T00:00:00Z',
};

const REL_DEPENDS_ON: RnvRoleRelationship = {
  id: 'rel-2',
  org_id: 'org-1',
  from_role_id: 'role-lead',
  to_role_id: 'role-senior',
  relationship_type: 'DEPENDS_ON',
  notes: null,
  created_at: '2027-02-10T00:00:00Z',
};

const REL_MENTORS: RnvRoleRelationship = {
  id: 'rel-3',
  org_id: 'org-1',
  from_role_id: 'role-senior',
  to_role_id: 'role-mid',
  relationship_type: 'MENTORS',
  notes: null,
  created_at: '2027-02-10T00:00:00Z',
};

const ALL_ROLES           = [ROLE_PRINCIPAL, ROLE_LEAD, ROLE_SENIOR, ROLE_MID];
const ALL_RELATIONSHIPS   = [REL_COLLABORATES, REL_DEPENDS_ON, REL_MENTORS];

// Principal with its COLLABORATES_WITH relationship pre-populated
const ROLE_PRINCIPAL_WITH_REL = makeRole({
  ...ROLE_PRINCIPAL,
  relationships: [REL_COLLABORATES],
});
const ALL_ROLES_WITH_RELS = [ROLE_PRINCIPAL_WITH_REL, ROLE_LEAD, ROLE_SENIOR, ROLE_MID];

// =============================================================================
// Store decorator
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withRoleNetworkStore = (state: Record<string, any>) =>
  (Story: StoryFn) => {
    addRelationshipSpy.mockReset();
    removeRelationshipSpy.mockReset();
    useRoleNetworkStore.setState({
      // ── Default state ────────────────────────────────────────────────────
      roles: [],
      relationships: [],
      employeeRoles: [],
      selectedRoleId: null,
      isLoading: false,
      isRelationshipLoading: false,
      filters: { ...DEFAULT_RNV_FILTERS },
      error: null,
      // ── Default no-op actions (prevent Supabase calls) ───────────────────
      fetchNetwork: async () => {},
      createRole: async () => {},
      updateRole: async () => {},
      deleteRole: async () => {},
      addRelationship: addRelationshipSpy,
      removeRelationship: removeRelationshipSpy,
      assignEmployeeRole: async () => {},
      unassignEmployeeRole: async () => {},
      selectRole: (roleId: string | null) =>
        useRoleNetworkStore.setState({ selectedRoleId: roleId }),
      setFilters: () => {},
      clearError: () => useRoleNetworkStore.setState({ error: null }),
      // ── Story-specific overrides ─────────────────────────────────────────
      ...state,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return <Story />;
  };

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof RoleNetworkCanvas> = {
  title: 'RoleNetwork/RoleNetworkCanvas',
  component: RoleNetworkCanvas,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    orgId: 'org-1',
    orgPlan: 'ENTERPRISE',
    isAdmin: false,
  },
};

export default meta;
type Story = StoryObj<typeof RoleNetworkCanvas>;

// =============================================================================
// 1. Plan gate walls
// =============================================================================

export const PlanGateWallFree: Story = {
  name: 'Plan Gate Wall — FREE',
  args: { orgPlan: 'FREE' },
  decorators: [withRoleNetworkStore({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const wall = canvas.getByTestId('rnv-plan-gate-wall');
    await expect(wall).toBeInTheDocument();
    await expect(wall.textContent).toContain('ENTERPRISE');
    await expect(canvas.queryByTestId('rnv-canvas')).not.toBeInTheDocument();
  },
};

export const PlanGateWallProfessional: Story = {
  name: 'Plan Gate Wall — PROFESSIONAL',
  args: { orgPlan: 'PROFESSIONAL' },
  decorators: [withRoleNetworkStore({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const wall = canvas.getByTestId('rnv-plan-gate-wall');
    await expect(wall).toBeInTheDocument();
    // Shows current plan name
    await expect(wall.textContent).toContain('PROFESSIONAL');
    await expect(canvas.queryByTestId('rnv-canvas')).not.toBeInTheDocument();
  },
};

// =============================================================================
// 2. Loading / Error / Empty states
// =============================================================================

export const LoadingState: Story = {
  name: 'Loading State',
  decorators: [withRoleNetworkStore({ isLoading: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('rnv-loading')).toBeInTheDocument();
    await expect(canvas.queryByTestId('rnv-canvas')).not.toBeInTheDocument();
  },
};

export const EmptyState: Story = {
  name: 'Empty State',
  decorators: [withRoleNetworkStore({ roles: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('rnv-empty')).toBeInTheDocument();
    await expect(canvas.queryByTestId('rnv-canvas')).not.toBeInTheDocument();
  },
};

export const StoreError: Story = {
  name: 'Store Error',
  decorators: [withRoleNetworkStore({ error: 'เชื่อมต่อฐานข้อมูลล้มเหลว' })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const errEl = canvas.getByTestId('rnv-error');
    await expect(errEl).toBeInTheDocument();
    await expect(errEl.textContent).toContain('เชื่อมต่อฐานข้อมูลล้มเหลว');
  },
};

// =============================================================================
// 3. Node graph layout — 4 roles across 4 seniority levels
// =============================================================================

export const WithNodes: Story = {
  name: 'With Nodes — Graph Layout',
  decorators: [withRoleNetworkStore({ roles: ALL_ROLES, relationships: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('rnv-canvas')).toBeInTheDocument();
    await expect(canvas.getByTestId('rnv-canvas-area')).toBeInTheDocument();

    const nodes = canvas.getAllByTestId('rnv-role-node');
    await expect(nodes).toHaveLength(4);

    // Each node exposes data-role-id
    const roleIds = nodes.map(el => el.getAttribute('data-role-id'));
    await expect(roleIds).toContain('role-principal');
    await expect(roleIds).toContain('role-lead');
    await expect(roleIds).toContain('role-senior');
    await expect(roleIds).toContain('role-mid');

    // Seniority and headcount badges present for every node
    await expect(canvas.getAllByTestId('rnv-seniority-badge')).toHaveLength(4);
    await expect(canvas.getAllByTestId('rnv-headcount-badge')).toHaveLength(4);
  },
};

// =============================================================================
// 4. Relationship edge rendering — includes DEPENDS_ON (dashed) edge
// =============================================================================

export const RelationshipEdgeRendering: Story = {
  name: 'Relationship Edge Rendering',
  decorators: [
    withRoleNetworkStore({
      roles: ALL_ROLES,
      relationships: ALL_RELATIONSHIPS,
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Canvas present
    await expect(canvas.getByTestId('rnv-canvas')).toBeInTheDocument();
    // SVG edges group rendered
    await expect(canvas.getByTestId('rnv-edges-svg')).toBeInTheDocument();
    // All 4 role nodes visible
    await expect(canvas.getAllByTestId('rnv-role-node')).toHaveLength(4);
  },
};

// =============================================================================
// 5. Role detail panel — open via pre-selected role + close
// =============================================================================

export const RoleDetailPanelOpen: Story = {
  name: 'Role Detail Panel — Open and Close',
  decorators: [
    withRoleNetworkStore({
      roles: ALL_ROLES_WITH_RELS,
      relationships: [REL_COLLABORATES],
      selectedRoleId: 'role-principal',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Panel visible for pre-selected role
    const panel = canvas.getByTestId('rnv-role-detail-panel');
    await expect(panel).toBeInTheDocument();
    await expect(panel.textContent).toContain('Director of Product');

    // Click close button — panel should disappear
    const closeBtn = canvas.getByTestId('rnv-close-detail-btn');
    await userEvent.click(closeBtn);
    await expect(canvas.queryByTestId('rnv-role-detail-panel')).not.toBeInTheDocument();
  },
};

// =============================================================================
// 6. Role detail panel — admin add relationship interaction
// =============================================================================

export const RoleDetailPanelAddInteraction: Story = {
  name: 'Role Detail Panel — Admin Add Relationship',
  args: { isAdmin: true },
  decorators: [
    withRoleNetworkStore({
      roles: ALL_ROLES_WITH_RELS,
      relationships: [REL_COLLABORATES],
      selectedRoleId: 'role-principal',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const panel = canvas.getByTestId('rnv-role-detail-panel');
    await expect(panel).toBeInTheDocument();

    // Add button disabled when no target selected
    const addBtn = canvas.getByTestId('rnv-add-relationship-btn');
    await expect(addBtn).toBeDisabled();

    // Select target role via accessible label
    const targetSelect = within(panel).getByRole('combobox', {
      name: 'เลือกตำแหน่งปลายทาง',
    });
    await userEvent.selectOptions(targetSelect, 'role-lead');

    // Now enabled
    await expect(addBtn).not.toBeDisabled();

    // Click add
    await userEvent.click(addBtn);
    await expect(addRelationshipSpy).toHaveBeenCalledOnce();

    // Verify payload: from_role_id and to_role_id correct
    const [, , payload] = addRelationshipSpy.mock.calls[0] as [
      string,
      string,
      { from_role_id: string; to_role_id: string },
    ];
    await expect(payload.from_role_id).toBe('role-principal');
    await expect(payload.to_role_id).toBe('role-lead');
  },
};

// =============================================================================
// 7. Role detail panel — admin remove relationship interaction
// =============================================================================

export const RoleDetailPanelRemoveInteraction: Story = {
  name: 'Role Detail Panel — Admin Remove Relationship',
  args: { isAdmin: true },
  decorators: [
    withRoleNetworkStore({
      roles: ALL_ROLES_WITH_RELS,
      relationships: [REL_COLLABORATES],
      selectedRoleId: 'role-principal',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const panel = canvas.getByTestId('rnv-role-detail-panel');

    // Remove button present for the one existing relationship
    const removeBtns = within(panel).getAllByTestId('rnv-remove-relationship-btn');
    await expect(removeBtns).toHaveLength(1);
    await expect(removeBtns[0]).not.toBeDisabled();

    // Click remove
    await userEvent.click(removeBtns[0]);
    await expect(removeRelationshipSpy).toHaveBeenCalledOnce();

    // Verify the correct relationship ID was passed
    const [, , relId] = removeRelationshipSpy.mock.calls[0] as [string, string, string];
    await expect(relId).toBe('rel-1');
  },
};

// =============================================================================
// 8. Node click selects role → detail panel opens
// =============================================================================

export const NodeClickSelectsRole: Story = {
  name: 'Node Click — Opens Detail Panel',
  decorators: [
    withRoleNetworkStore({
      roles: ALL_ROLES_WITH_RELS,
      relationships: [REL_COLLABORATES],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // No panel initially
    await expect(canvas.queryByTestId('rnv-role-detail-panel')).not.toBeInTheDocument();

    // Click the PRINCIPAL node (aria-label = role name)
    const principalNode = canvas.getByRole('button', {
      name: 'Director of Product',
    });
    await userEvent.click(principalNode);

    // Panel should now be open
    await expect(canvas.getByTestId('rnv-role-detail-panel')).toBeInTheDocument();
  },
};

// =============================================================================
// 9. Admin view — add + remove controls visible in panel
// =============================================================================

export const AdminView: Story = {
  name: 'Admin View — ENTERPRISE',
  args: { isAdmin: true },
  decorators: [
    withRoleNetworkStore({
      roles: ALL_ROLES_WITH_RELS,
      relationships: [REL_COLLABORATES],
      selectedRoleId: 'role-principal',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('rnv-canvas')).toBeInTheDocument();
    // Add relationship button present
    await expect(canvas.getByTestId('rnv-add-relationship-btn')).toBeInTheDocument();
    // Remove button for existing relationship
    await expect(canvas.getAllByTestId('rnv-remove-relationship-btn')).toHaveLength(1);
  },
};

// =============================================================================
// 10. Read-only view — no add/remove controls
// =============================================================================

export const ReadOnlyView: Story = {
  name: 'Read-Only View — Non-Admin',
  args: { isAdmin: false },
  decorators: [
    withRoleNetworkStore({
      roles: ALL_ROLES_WITH_RELS,
      relationships: [REL_COLLABORATES],
      selectedRoleId: 'role-principal',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Panel present
    await expect(canvas.getByTestId('rnv-role-detail-panel')).toBeInTheDocument();
    // Admin controls absent
    await expect(canvas.queryByTestId('rnv-add-relationship-btn')).not.toBeInTheDocument();
    await expect(canvas.queryByTestId('rnv-remove-relationship-btn')).not.toBeInTheDocument();
  },
};
