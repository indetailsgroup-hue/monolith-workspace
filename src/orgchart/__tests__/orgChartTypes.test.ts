// =============================================================================
// orgChartTypes.test.ts — v18.0 Interactive OrgChart
// Covers: canAccessOrgChart, OrgChartPlanGateError, mapOcNodeRow,
//         buildOcTree, flattenOcTree, DEFAULT_OC_FILTERS, label constants
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  canAccessOrgChart,
  OrgChartPlanGateError,
  mapOcNodeRow,
  buildOcTree,
  flattenOcTree,
  DEFAULT_OC_FILTERS,
  OC_NODE_TYPE_LABEL_TH,
  OC_LINE_TYPE_LABEL_TH,
} from '../orgChartTypes';
import type { OcNodeRow } from '../orgChartTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<OcNodeRow> & { id: string }): OcNodeRow {
  return {
    id: overrides.id,
    org_id: overrides.org_id ?? 'org-1',
    parent_id: overrides.parent_id ?? null,
    employee_id: overrides.employee_id ?? null,
    node_type: overrides.node_type ?? 'EMPLOYEE',
    title: overrides.title ?? `Node ${overrides.id}`,
    department: overrides.department ?? null,
    position_x: overrides.position_x ?? 0,
    position_y: overrides.position_y ?? 0,
    hierarchy_level: overrides.hierarchy_level ?? 0,
    is_active: overrides.is_active ?? true,
    metadata: overrides.metadata ?? null,
    created_at: overrides.created_at ?? '2027-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2027-01-01T00:00:00Z',
  };
}

// ─── canAccessOrgChart ────────────────────────────────────────────────────────

describe('canAccessOrgChart', () => {
  it('returns false for FREE plan', () => {
    expect(canAccessOrgChart('FREE')).toBe(false);
  });

  it('returns false for STARTER plan', () => {
    expect(canAccessOrgChart('STARTER')).toBe(false);
  });

  it('returns true for PROFESSIONAL plan', () => {
    expect(canAccessOrgChart('PROFESSIONAL')).toBe(true);
  });

  it('returns true for ENTERPRISE plan', () => {
    expect(canAccessOrgChart('ENTERPRISE')).toBe(true);
  });
});

// ─── OrgChartPlanGateError ────────────────────────────────────────────────────

describe('OrgChartPlanGateError', () => {
  it('has name OrgChartPlanGateError', () => {
    const err = new OrgChartPlanGateError('FREE');
    expect(err.name).toBe('OrgChartPlanGateError');
  });

  it('message includes the plan name', () => {
    const err = new OrgChartPlanGateError('STARTER');
    expect(err.message).toContain('STARTER');
  });

  it('message mentions PROFESSIONAL or ENTERPRISE requirement', () => {
    const err = new OrgChartPlanGateError('FREE');
    expect(err.message).toContain('PROFESSIONAL');
    expect(err.message).toContain('ENTERPRISE');
  });

  it('is an instanceof Error', () => {
    expect(new OrgChartPlanGateError('FREE')).toBeInstanceOf(Error);
  });

  it('is an instanceof OrgChartPlanGateError', () => {
    expect(new OrgChartPlanGateError('FREE')).toBeInstanceOf(OrgChartPlanGateError);
  });
});

// ─── mapOcNodeRow ─────────────────────────────────────────────────────────────

describe('mapOcNodeRow', () => {
  it('initialises children as empty array', () => {
    const node = mapOcNodeRow(makeRow({ id: 'n1' }));
    expect(node.children).toEqual([]);
  });

  it('sets depth from hierarchy_level', () => {
    const node = mapOcNodeRow(makeRow({ id: 'n2', hierarchy_level: 3 }));
    expect(node.depth).toBe(3);
  });

  it('initialises path as empty array', () => {
    const node = mapOcNodeRow(makeRow({ id: 'n3' }));
    expect(node.path).toEqual([]);
  });

  it('preserves all original row fields', () => {
    const row = makeRow({
      id: 'n4',
      title: 'CEO',
      department: 'Executive',
      node_type: 'EMPLOYEE',
      position_x: 100,
      position_y: 200,
      is_active: false,
      hierarchy_level: 0,
    });
    const node = mapOcNodeRow(row);
    expect(node.id).toBe('n4');
    expect(node.title).toBe('CEO');
    expect(node.department).toBe('Executive');
    expect(node.node_type).toBe('EMPLOYEE');
    expect(node.position_x).toBe(100);
    expect(node.position_y).toBe(200);
    expect(node.is_active).toBe(false);
  });

  it('preserves null parent_id', () => {
    const node = mapOcNodeRow(makeRow({ id: 'n5', parent_id: null }));
    expect(node.parent_id).toBeNull();
  });
});

// ─── buildOcTree ──────────────────────────────────────────────────────────────

describe('buildOcTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildOcTree([])).toEqual([]);
  });

  it('returns single root node for one row with no parent', () => {
    const tree = buildOcTree([makeRow({ id: 'root' })]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('root');
  });

  it('root node has depth 0 and empty path', () => {
    const tree = buildOcTree([makeRow({ id: 'root' })]);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].path).toEqual([]);
  });

  it('wires child to parent children array', () => {
    const rows = [
      makeRow({ id: 'parent' }),
      makeRow({ id: 'child', parent_id: 'parent' }),
    ];
    const tree = buildOcTree(rows);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('child');
  });

  it('child has depth 1', () => {
    const rows = [
      makeRow({ id: 'parent' }),
      makeRow({ id: 'child', parent_id: 'parent' }),
    ];
    const tree = buildOcTree(rows);
    expect(tree[0].children[0].depth).toBe(1);
  });

  it('child path contains parent id', () => {
    const rows = [
      makeRow({ id: 'parent' }),
      makeRow({ id: 'child', parent_id: 'parent' }),
    ];
    const tree = buildOcTree(rows);
    expect(tree[0].children[0].path).toEqual(['parent']);
  });

  it('grandchild has depth 2 and path [parent, child]', () => {
    const rows = [
      makeRow({ id: 'root' }),
      makeRow({ id: 'child', parent_id: 'root' }),
      makeRow({ id: 'grand', parent_id: 'child' }),
    ];
    const tree = buildOcTree(rows);
    const grandchild = tree[0].children[0].children[0];
    expect(grandchild.depth).toBe(2);
    expect(grandchild.path).toEqual(['root', 'child']);
  });

  it('handles multiple roots', () => {
    const rows = [
      makeRow({ id: 'r1' }),
      makeRow({ id: 'r2' }),
    ];
    const tree = buildOcTree(rows);
    expect(tree).toHaveLength(2);
  });

  it('orphan (unknown parent) is promoted to root', () => {
    const rows = [
      makeRow({ id: 'orphan', parent_id: 'nonexistent' }),
    ];
    const tree = buildOcTree(rows);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('orphan');
    expect(tree[0].depth).toBe(0);
  });

  it('siblings are all children of same parent', () => {
    const rows = [
      makeRow({ id: 'parent' }),
      makeRow({ id: 'sib1', parent_id: 'parent' }),
      makeRow({ id: 'sib2', parent_id: 'parent' }),
      makeRow({ id: 'sib3', parent_id: 'parent' }),
    ];
    const tree = buildOcTree(rows);
    expect(tree[0].children).toHaveLength(3);
  });

  it('siblings all have depth 1', () => {
    const rows = [
      makeRow({ id: 'parent' }),
      makeRow({ id: 'sib1', parent_id: 'parent' }),
      makeRow({ id: 'sib2', parent_id: 'parent' }),
    ];
    const tree = buildOcTree(rows);
    for (const sib of tree[0].children) {
      expect(sib.depth).toBe(1);
    }
  });

  it('deep tree preserves depth at each level', () => {
    const rows = [
      makeRow({ id: 'a' }),
      makeRow({ id: 'b', parent_id: 'a' }),
      makeRow({ id: 'c', parent_id: 'b' }),
      makeRow({ id: 'd', parent_id: 'c' }),
    ];
    const tree = buildOcTree(rows);
    const d = tree[0].children[0].children[0].children[0];
    expect(d.depth).toBe(3);
    expect(d.path).toEqual(['a', 'b', 'c']);
  });
});

// ─── flattenOcTree ────────────────────────────────────────────────────────────

describe('flattenOcTree', () => {
  it('returns empty array for empty input', () => {
    expect(flattenOcTree([])).toEqual([]);
  });

  it('returns single node for single root', () => {
    const tree = buildOcTree([makeRow({ id: 'root' })]);
    const flat = flattenOcTree(tree);
    expect(flat).toHaveLength(1);
    expect(flat[0].id).toBe('root');
  });

  it('depth-first order: parent before children', () => {
    const rows = [
      makeRow({ id: 'root' }),
      makeRow({ id: 'child', parent_id: 'root' }),
    ];
    const tree = buildOcTree(rows);
    const flat = flattenOcTree(tree);
    expect(flat[0].id).toBe('root');
    expect(flat[1].id).toBe('child');
  });

  it('depth-first order for deep tree (A > B > C before siblings)', () => {
    const rows = [
      makeRow({ id: 'root' }),
      makeRow({ id: 'b', parent_id: 'root' }),
      makeRow({ id: 'c', parent_id: 'b' }),
      makeRow({ id: 'sibling', parent_id: 'root' }),
    ];
    const tree = buildOcTree(rows);
    const flat = flattenOcTree(tree);
    const ids = flat.map(n => n.id);
    // root first
    expect(ids[0]).toBe('root');
    // b before sibling (depth-first visits b's subtree before sibling)
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('sibling'));
    // c comes after b and before sibling
    expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('sibling'));
  });

  it('total count equals number of input rows', () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      makeRow({ id: `n${i}`, parent_id: i === 0 ? null : `n${i - 1}` })
    );
    const tree = buildOcTree(rows);
    expect(flattenOcTree(tree)).toHaveLength(6);
  });

  it('multiple roots are all included', () => {
    const rows = [makeRow({ id: 'r1' }), makeRow({ id: 'r2' })];
    const tree = buildOcTree(rows);
    const flat = flattenOcTree(tree);
    expect(flat).toHaveLength(2);
  });

  it('siblings: all children appear after their parent', () => {
    const rows = [
      makeRow({ id: 'parent' }),
      makeRow({ id: 's1', parent_id: 'parent' }),
      makeRow({ id: 's2', parent_id: 'parent' }),
    ];
    const tree = buildOcTree(rows);
    const flat = flattenOcTree(tree);
    const parentIdx = flat.findIndex(n => n.id === 'parent');
    const s1Idx = flat.findIndex(n => n.id === 's1');
    const s2Idx = flat.findIndex(n => n.id === 's2');
    expect(parentIdx).toBeLessThan(s1Idx);
    expect(parentIdx).toBeLessThan(s2Idx);
  });
});

// ─── DEFAULT_OC_FILTERS ───────────────────────────────────────────────────────

describe('DEFAULT_OC_FILTERS', () => {
  it('nodeType defaults to ALL', () => {
    expect(DEFAULT_OC_FILTERS.nodeType).toBe('ALL');
  });

  it('department defaults to null', () => {
    expect(DEFAULT_OC_FILTERS.department).toBeNull();
  });

  it('isActive defaults to true', () => {
    expect(DEFAULT_OC_FILTERS.isActive).toBe(true);
  });
});

// ─── Label constants ──────────────────────────────────────────────────────────

describe('OC_NODE_TYPE_LABEL_TH', () => {
  it('has Thai label for EMPLOYEE', () => {
    expect(OC_NODE_TYPE_LABEL_TH['EMPLOYEE']).toBe('พนักงาน');
  });

  it('has Thai label for ROLE', () => {
    expect(OC_NODE_TYPE_LABEL_TH['ROLE']).toBe('ตำแหน่ง');
  });

  it('has Thai label for DEPARTMENT', () => {
    expect(OC_NODE_TYPE_LABEL_TH['DEPARTMENT']).toBe('แผนก');
  });

  it('has Thai label for TEAM', () => {
    expect(OC_NODE_TYPE_LABEL_TH['TEAM']).toBe('ทีม');
  });
});

describe('OC_LINE_TYPE_LABEL_TH', () => {
  it('has Thai label for SOLID', () => {
    expect(OC_LINE_TYPE_LABEL_TH['SOLID']).toBe('สายงานหลัก');
  });

  it('has Thai label for DOTTED', () => {
    expect(OC_LINE_TYPE_LABEL_TH['DOTTED']).toBe('สายงานเสริม (matrix)');
  });
});
