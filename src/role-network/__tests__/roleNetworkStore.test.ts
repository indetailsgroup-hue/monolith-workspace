import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRoleNetworkStore } from '../roleNetworkStore';
import { RoleNetworkPlanGateError, DEFAULT_RNV_FILTERS } from '../roleNetworkTypes';
import type {
  RnvRoleNetworkRow,
  RnvRoleRelationshipRow,
  RnvEmployeeRoleRow,
} from '../roleNetworkTypes';
import type { OrgPlan } from '../../tenant/types';

// ---------------------------------------------------------------------------
// Supabase mock — vi.hoisted so factory runs before vi.mock() hoisting
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
      insert: (_a: unknown) => { op = 'insert'; return chain; },
      update: (_a: unknown) => { op = 'update'; return chain; },
      delete: ()           => { op = 'delete'; return chain; },
      eq:     (..._a: unknown[]) => chain,
      neq:    (..._a: unknown[]) => chain,
      is:     (..._a: unknown[]) => chain,
      in:     (..._a: unknown[]) => chain,
      order:  (..._a: unknown[]) => chain,
      // .single() — terminates the chain; resolves single-row result
      single: () => ({
        then: (
          onFulfilled: (v: unknown) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) => Promise.resolve(getResult()).then(onFulfilled, onRejected),
      }),
      // chain itself is thenable (for plain .select() without .single())
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
function makeRoleRow(overrides: Partial<RnvRoleNetworkRow> = {}): RnvRoleNetworkRow {
  return {
    id: 'role-1',
    org_id: 'org-1',
    name: 'Principal Engineer',
    description: null,
    seniority: 'PRINCIPAL',
    is_active: true,
    metadata: null,
    created_at: '2027-01-01T00:00:00Z',
    updated_at: '2027-01-01T00:00:00Z',
    current_headcount: 1,
    relationship_count: 0,
    ...overrides,
  };
}

function makeRelRow(overrides: Partial<RnvRoleRelationshipRow> = {}): RnvRoleRelationshipRow {
  return {
    id: 'rel-1',
    org_id: 'org-1',
    from_role_id: 'role-1',
    to_role_id: 'role-2',
    relationship_type: 'COLLABORATES_WITH',
    notes: null,
    created_at: '2027-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeErRow(overrides: Partial<RnvEmployeeRoleRow> = {}): RnvEmployeeRoleRow {
  return {
    id: 'er-1',
    org_id: 'org-1',
    employee_id: 'emp-1',
    role_id: 'role-1',
    is_primary: true,
    started_at: '2027-01-01T00:00:00Z',
    ended_at: null,
    created_at: '2027-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Seed all three network tables with empty arrays (no-op fetch). */
function seedEmptyNetwork() {
  setResult('rnv_role_network_v',   'select', []);
  setResult('rnv_role_relationships', 'select', []);
  setResult('rnv_employee_roles',   'select', []);
}

/** Seed all mutation tables with success nulls + empty fetch. */
function seedAllMutations() {
  seedEmptyNetwork();
  setResult('rnv_roles',               'insert', null);
  setResult('rnv_roles',               'update', null);
  setResult('rnv_roles',               'delete', null);
  setResult('rnv_role_relationships',  'insert', makeRelRow({ id: 'rel-new' }));
  setResult('rnv_role_relationships',  'delete', null);
  setResult('rnv_employee_roles',      'insert', makeErRow({ id: 'er-new' }));
  setResult('rnv_employee_roles',      'delete', null);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
const ORG = 'org-1';
const NON_ENTERPRISE: OrgPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL'];

describe('useRoleNetworkStore', () => {
  const { getState, setState } = useRoleNetworkStore;

  beforeEach(() => {
    resetMock();
    setState({
      roles: [],
      relationships: [],
      employeeRoles: [],
      selectedRoleId: null,
      isLoading: false,
      isRelationshipLoading: false,
      filters: { ...DEFAULT_RNV_FILTERS },
      error: null,
    });
  });

  // ─── Plan gate — 8 write actions × 3 non-ENTERPRISE plans ────────────────

  describe('plan gate — 8 write actions', () => {
    type ActionFn = (plan: OrgPlan) => Promise<void>;

    const ACTIONS: [string, ActionFn][] = [
      [
        'fetchNetwork',
        (p) => getState().fetchNetwork(ORG, p),
      ],
      [
        'createRole',
        (p) => getState().createRole(ORG, p, { name: 'New Role' }),
      ],
      [
        'updateRole',
        (p) => getState().updateRole(ORG, p, 'role-1', { name: 'Updated' }),
      ],
      [
        'deleteRole',
        (p) => getState().deleteRole(ORG, p, 'role-1'),
      ],
      [
        'addRelationship',
        (p) =>
          getState().addRelationship(ORG, p, {
            from_role_id: 'role-1',
            to_role_id: 'role-2',
            relationship_type: 'COLLABORATES_WITH',
          }),
      ],
      [
        'removeRelationship',
        (p) => getState().removeRelationship(ORG, p, 'rel-1'),
      ],
      [
        'assignEmployeeRole',
        (p) =>
          getState().assignEmployeeRole(ORG, p, {
            employee_id: 'emp-1',
            role_id: 'role-1',
          }),
      ],
      [
        'unassignEmployeeRole',
        (p) => getState().unassignEmployeeRole(ORG, p, 'er-1'),
      ],
    ];

    describe.each(ACTIONS)('%s', (_actionName, action) => {
      it.each(NON_ENTERPRISE)(
        'throws RoleNetworkPlanGateError on plan %s',
        async (plan) => {
          await expect(action(plan)).rejects.toThrow(RoleNetworkPlanGateError);
        },
      );

      it('does not throw RoleNetworkPlanGateError on ENTERPRISE', async () => {
        seedAllMutations();
        const caught = await action('ENTERPRISE').catch((e) => e);
        expect(caught).not.toBeInstanceOf(RoleNetworkPlanGateError);
      });
    });
  });

  // ─── fetchNetwork ─────────────────────────────────────────────────────────

  describe('fetchNetwork', () => {
    it('loads roles, relationships, and employeeRoles in parallel', async () => {
      setResult('rnv_role_network_v',   'select', [makeRoleRow({ id: 'role-1' })]);
      setResult('rnv_role_relationships', 'select', [makeRelRow({ id: 'rel-1' })]);
      setResult('rnv_employee_roles',   'select', [makeErRow({ id: 'er-1' })]);

      await getState().fetchNetwork(ORG, 'ENTERPRISE');

      const { roles, relationships, employeeRoles } = getState();
      expect(roles).toHaveLength(1);
      expect(roles[0].id).toBe('role-1');
      expect(relationships).toHaveLength(1);
      expect(relationships[0].id).toBe('rel-1');
      expect(employeeRoles).toHaveLength(1);
      expect(employeeRoles[0].id).toBe('er-1');
    });

    it('enriches each role with relationships from BOTH directions', async () => {
      const role1 = makeRoleRow({ id: 'role-1', name: 'Principal' });
      const role2 = makeRoleRow({ id: 'role-2', name: 'Senior Dev' });
      const rel1  = makeRelRow({ id: 'rel-1', from_role_id: 'role-1', to_role_id: 'role-2' });
      const rel2  = makeRelRow({ id: 'rel-2', from_role_id: 'role-2', to_role_id: 'role-1', relationship_type: 'MENTORS' });

      setResult('rnv_role_network_v',   'select', [role1, role2]);
      setResult('rnv_role_relationships', 'select', [rel1, rel2]);
      setResult('rnv_employee_roles',   'select', []);

      await getState().fetchNetwork(ORG, 'ENTERPRISE');

      const { roles } = getState();
      const r1 = roles.find((r) => r.id === 'role-1')!;
      const r2 = roles.find((r) => r.id === 'role-2')!;

      // role-1 is from in rel-1 and to in rel-2 → sees both
      expect(r1.relationships.map((r) => r.id).sort()).toEqual(
        ['rel-1', 'rel-2'].sort(),
      );
      // role-2 is to in rel-1 and from in rel-2 → sees both
      expect(r2.relationships.map((r) => r.id).sort()).toEqual(
        ['rel-1', 'rel-2'].sort(),
      );
    });

    it('enriches each role with only its own employeeRoles', async () => {
      const role1 = makeRoleRow({ id: 'role-1' });
      const role2 = makeRoleRow({ id: 'role-2', name: 'Lead QA' });
      const er1   = makeErRow({ id: 'er-1', role_id: 'role-1', employee_id: 'emp-1' });
      const er2   = makeErRow({ id: 'er-2', role_id: 'role-1', employee_id: 'emp-2' });
      const er3   = makeErRow({ id: 'er-3', role_id: 'role-2', employee_id: 'emp-3' });

      setResult('rnv_role_network_v',   'select', [role1, role2]);
      setResult('rnv_role_relationships', 'select', []);
      setResult('rnv_employee_roles',   'select', [er1, er2, er3]);

      await getState().fetchNetwork(ORG, 'ENTERPRISE');

      const { roles } = getState();
      const r1 = roles.find((r) => r.id === 'role-1')!;
      const r2 = roles.find((r) => r.id === 'role-2')!;
      expect(r1.employeeRoles).toHaveLength(2);
      expect(r2.employeeRoles).toHaveLength(1);
      expect(r2.employeeRoles[0].id).toBe('er-3');
    });

    it('sets isLoading: true during fetch, false after', async () => {
      seedEmptyNetwork();
      const promise = getState().fetchNetwork(ORG, 'ENTERPRISE');
      expect(getState().isLoading).toBe(true);
      await promise;
      expect(getState().isLoading).toBe(false);
    });

    it('sets error and clears isLoading on supabase failure', async () => {
      setResult('rnv_role_network_v', 'select', null, { message: 'DB timeout' });
      setResult('rnv_role_relationships', 'select', []);
      setResult('rnv_employee_roles',   'select', []);

      await getState().fetchNetwork(ORG, 'ENTERPRISE');

      expect(getState().isLoading).toBe(false);
      expect(getState().error).toBe('DB timeout');
      expect(getState().roles).toHaveLength(0);
    });
  });

  // ─── deleteRole cascade ───────────────────────────────────────────────────

  describe('deleteRole', () => {
    it('removes the role and all relationships where it appears (from OR to)', async () => {
      setState({
        roles: [
          { ...makeRoleRow({ id: 'role-1' }), relationships: [], employeeRoles: [] },
          { ...makeRoleRow({ id: 'role-2', name: 'Lead QA' }), relationships: [], employeeRoles: [] },
        ],
        relationships: [
          makeRelRow({ id: 'rel-1', from_role_id: 'role-1', to_role_id: 'role-2' }),
          makeRelRow({ id: 'rel-2', from_role_id: 'role-2', to_role_id: 'role-1' }),
          makeRelRow({ id: 'rel-3', from_role_id: 'role-2', to_role_id: 'role-2' }), // unrelated
        ],
        employeeRoles: [
          makeErRow({ id: 'er-1', role_id: 'role-1' }),
          makeErRow({ id: 'er-2', role_id: 'role-2' }),
        ],
      });
      setResult('rnv_roles', 'delete', null);

      await getState().deleteRole(ORG, 'ENTERPRISE', 'role-1');

      const { roles, relationships, employeeRoles } = getState();
      expect(roles.map((r) => r.id)).not.toContain('role-1');
      expect(roles).toHaveLength(1);

      // rel-1 and rel-2 both reference role-1 → removed; rel-3 stays
      expect(relationships.map((r) => r.id)).not.toContain('rel-1');
      expect(relationships.map((r) => r.id)).not.toContain('rel-2');
      expect(relationships).toHaveLength(1);
      expect(relationships[0].id).toBe('rel-3');

      // er-1 removed; er-2 stays
      expect(employeeRoles.map((er) => er.id)).not.toContain('er-1');
      expect(employeeRoles).toHaveLength(1);
      expect(employeeRoles[0].id).toBe('er-2');
    });

    it('resets selectedRoleId to null when the deleted role was selected', async () => {
      setState({
        roles: [
          { ...makeRoleRow({ id: 'role-1' }), relationships: [], employeeRoles: [] },
        ],
        relationships: [],
        employeeRoles: [],
        selectedRoleId: 'role-1',
      });
      setResult('rnv_roles', 'delete', null);

      await getState().deleteRole(ORG, 'ENTERPRISE', 'role-1');

      expect(getState().selectedRoleId).toBeNull();
    });

    it('preserves selectedRoleId when a different role is deleted', async () => {
      setState({
        roles: [
          { ...makeRoleRow({ id: 'role-1' }), relationships: [], employeeRoles: [] },
          { ...makeRoleRow({ id: 'role-2', name: 'Lead' }), relationships: [], employeeRoles: [] },
        ],
        relationships: [],
        employeeRoles: [],
        selectedRoleId: 'role-2',
      });
      setResult('rnv_roles', 'delete', null);

      await getState().deleteRole(ORG, 'ENTERPRISE', 'role-1');

      expect(getState().selectedRoleId).toBe('role-2');
    });

    it('leaves roles untouched and sets error on supabase failure', async () => {
      setState({
        roles: [
          { ...makeRoleRow({ id: 'role-1' }), relationships: [], employeeRoles: [] },
        ],
      });
      setResult('rnv_roles', 'delete', null, { message: 'Foreign key violation' });

      await getState().deleteRole(ORG, 'ENTERPRISE', 'role-1');

      expect(getState().roles).toHaveLength(1);
      expect(getState().roles[0].id).toBe('role-1');
      expect(getState().error).toBe('Foreign key violation');
    });
  });

  // ─── addRelationship — optimistic state ───────────────────────────────────

  describe('addRelationship', () => {
    const ADD_PAYLOAD = {
      from_role_id: 'role-1',
      to_role_id: 'role-2',
      relationship_type: 'COLLABORATES_WITH',
    } as const;

    it('sets isRelationshipLoading: true synchronously before first await', async () => {
      setResult('rnv_role_relationships', 'insert', makeRelRow({ id: 'rel-new' }));

      // Start — do NOT await yet
      const promise = getState().addRelationship(ORG, 'ENTERPRISE', ADD_PAYLOAD);
      // Synchronous check: set() runs before the first await
      expect(getState().isRelationshipLoading).toBe(true);
      await promise;
    });

    it('appends the new relationship to state after success', async () => {
      const newRel = makeRelRow({ id: 'rel-new', from_role_id: 'role-1', to_role_id: 'role-2' });
      setResult('rnv_role_relationships', 'insert', newRel);

      await getState().addRelationship(ORG, 'ENTERPRISE', ADD_PAYLOAD);

      const { relationships } = getState();
      expect(relationships).toHaveLength(1);
      expect(relationships[0].id).toBe('rel-new');
    });

    it('clears isRelationshipLoading: false after success', async () => {
      setResult('rnv_role_relationships', 'insert', makeRelRow({ id: 'rel-new' }));

      await getState().addRelationship(ORG, 'ENTERPRISE', ADD_PAYLOAD);

      expect(getState().isRelationshipLoading).toBe(false);
    });

    it('sets error and clears isRelationshipLoading on failure without appending', async () => {
      setState({ relationships: [makeRelRow({ id: 'rel-existing' })] });
      setResult('rnv_role_relationships', 'insert', null, { message: 'Duplicate edge' });

      await getState().addRelationship(ORG, 'ENTERPRISE', ADD_PAYLOAD);

      expect(getState().isRelationshipLoading).toBe(false);
      expect(getState().error).toBe('Duplicate edge');
      expect(getState().relationships).toHaveLength(1);
      expect(getState().relationships[0].id).toBe('rel-existing');
    });
  });

  // ─── removeRelationship ───────────────────────────────────────────────────

  describe('removeRelationship', () => {
    it('removes relationship by id from local state', async () => {
      setState({
        relationships: [
          makeRelRow({ id: 'rel-1' }),
          makeRelRow({ id: 'rel-2', from_role_id: 'role-2', to_role_id: 'role-3' }),
        ],
      });
      setResult('rnv_role_relationships', 'delete', null);

      await getState().removeRelationship(ORG, 'ENTERPRISE', 'rel-1');

      const { relationships } = getState();
      expect(relationships).toHaveLength(1);
      expect(relationships[0].id).toBe('rel-2');
    });

    it('sets error and leaves state untouched on supabase failure', async () => {
      setState({ relationships: [makeRelRow({ id: 'rel-1' })] });
      setResult('rnv_role_relationships', 'delete', null, { message: 'Not found' });

      await getState().removeRelationship(ORG, 'ENTERPRISE', 'rel-1');

      expect(getState().relationships).toHaveLength(1);
      expect(getState().relationships[0].id).toBe('rel-1');
      expect(getState().error).toBe('Not found');
    });
  });

  // ─── UI helpers ───────────────────────────────────────────────────────────

  describe('selectRole', () => {
    it('sets selectedRoleId', () => {
      getState().selectRole('role-42');
      expect(getState().selectedRoleId).toBe('role-42');
    });

    it('accepts null to deselect', () => {
      setState({ selectedRoleId: 'role-1' });
      getState().selectRole(null);
      expect(getState().selectedRoleId).toBeNull();
    });
  });

  describe('setFilters', () => {
    it('merges a partial filter without overwriting unrelated fields', () => {
      setState({
        filters: { seniority: 'ALL', relationshipType: 'ALL', isActive: true },
      });
      getState().setFilters({ seniority: 'SENIOR' });

      const { filters } = getState();
      expect(filters.seniority).toBe('SENIOR');
      expect(filters.relationshipType).toBe('ALL');
      expect(filters.isActive).toBe(true);
    });

    it('can update multiple filter fields at once', () => {
      getState().setFilters({ seniority: 'LEAD', isActive: false });

      const { filters } = getState();
      expect(filters.seniority).toBe('LEAD');
      expect(filters.isActive).toBe(false);
    });
  });

  describe('clearError', () => {
    it('resets error to null', () => {
      setState({ error: 'Something went wrong' });
      getState().clearError();
      expect(getState().error).toBeNull();
    });
  });
});
