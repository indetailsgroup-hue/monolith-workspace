/**
 * gate10_2DxfSemantic.test.ts - DXF Semantic Validation Tests
 *
 * GATE 10.2: Semantic validation for manufacturing safety
 *
 * Test Categories:
 * 1. DRILL_INSIDE_OUTLINE - Drills within panel bounds
 * 2. NO_ORPHAN_DRILL - All drills have workpiece context
 * 3. DRILL_DEPTH_SAFE - Depth doesn't exceed panel thickness
 * 4. MINIFIX_DISTANCE_B - Distance B = 24mm (±0.1mm)
 * 5. MINIFIX_PAIR_MUTUAL - Paired holes reference each other
 * 6. NO_OVERLAPPING_DRILLS - No drill collisions
 * 7. TOOL_RADIUS_VALID - Reasonable tool dimensions
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  validateDxfSemantic,
  isDxfSemanticValid,
  getBlockingIssues,
  formatSemanticReport,
  TOLERANCES,
  MINIFIX_SPEC,
  type SemanticValidationOptions,
  type PanelContext,
} from '../gate10_2DxfSemantic';
import type { OperationGraph, DrillOperation, BoreOperation } from '../../../cnc/operation/operationTypes';

// ============================================
// TEST HELPERS
// ============================================

// Test operation with optional metadata for minifix pair testing
interface TestOperation extends Omit<Partial<DrillOperation | BoreOperation>, 'workpieceContext'> {
  metadata?: { purpose?: string; pairedHoleId?: string };
  workpieceContext?: { panelId: string; face?: 'TOP' | 'BOTTOM'; appliedOffset?: { x: number; y: number; z: number } };
}

function createTestGraph(operations: Array<TestOperation>): OperationGraph {
  return {
    machineId: 'TEST-CNC',
    safeZ: 50,
    rapidZ: 100,
    operations: operations.map((op, i) => ({
      id: op.id || `op-${i}`,
      sourceId: 'test-source',
      toolId: `T${(op as DrillOperation).diameter ?? 5}`,
      type: op.type || 'DRILL',
      position: op.position || { x: 100, y: 100, z: 0 },
      diameter: (op as DrillOperation).diameter ?? 5,
      depth: (op as DrillOperation).depth ?? 10,
      direction: (op as DrillOperation).direction || 'V',
      throughHole: false,
      flatBottom: true,
      workpieceContext: op.workpieceContext ? {
        panelId: op.workpieceContext.panelId,
        face: op.workpieceContext.face || 'TOP',
        appliedOffset: op.workpieceContext.appliedOffset || { x: 0, y: 0, z: 0 },
      } : {
        panelId: 'panel-001',
        face: 'TOP' as const,
        appliedOffset: { x: 0, y: 0, z: 0 },
      },
      ...(op.metadata ? { metadata: op.metadata } : {}),
    })) as (DrillOperation | BoreOperation)[],
    toolsUsed: ['T5', 'T10', 'T15'],
    metadata: {
      jobId: 'test-job',
      panelId: 'panel-001',
      sourceContentHash: 'test-hash-0000',
      builtAt: new Date().toISOString(),
      toolVersion: '1.0.0-test',
    },
  };
}

const DEFAULT_PANEL: PanelContext = {
  panelId: 'panel-001',
  width: 800,
  height: 400,
  thickness: 18,
};

// ============================================
// DRILL_INSIDE_OUTLINE TESTS
// ============================================

describe('GATE 10.2: DRILL_INSIDE_OUTLINE', () => {
  it('should pass for drill inside panel bounds', () => {
    const graph = createTestGraph([
      { position: { x: 100, y: 200, z: 0 }, diameter: 5, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.valid).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  it('should pass for drill at panel edge (within tolerance)', () => {
    const graph = createTestGraph([
      // Drill at x=2.5 with radius=2.5 touches x=0 (edge)
      { position: { x: 2.5, y: 200, z: 0 }, diameter: 5, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.valid).toBe(true);
    expect(result.blocked).toBe(false);
  });

  it('should BLOCK drill outside panel bounds (left)', () => {
    const graph = createTestGraph([
      // Drill at x=-5 with radius=2.5 extends to x=-7.5 (outside)
      { position: { x: -5, y: 200, z: 0 }, diameter: 5, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.valid).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].rule).toBe('DRILL_INSIDE_OUTLINE');
    expect(result.issues[0].severity).toBe('BLOCK');
  });

  it('should BLOCK drill outside panel bounds (right)', () => {
    const graph = createTestGraph([
      // Drill at x=805 with radius=2.5 extends to x=807.5 (outside 800)
      { position: { x: 805, y: 200, z: 0 }, diameter: 5, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.blocked).toBe(true);
    expect(result.issues[0].rule).toBe('DRILL_INSIDE_OUTLINE');
  });

  it('should BLOCK drill outside panel bounds (top)', () => {
    const graph = createTestGraph([
      { position: { x: 100, y: 405, z: 0 }, diameter: 5, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.blocked).toBe(true);
    expect(result.issues[0].rule).toBe('DRILL_INSIDE_OUTLINE');
  });

  it('should BLOCK drill outside panel bounds (bottom)', () => {
    const graph = createTestGraph([
      { position: { x: 100, y: -5, z: 0 }, diameter: 5, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.blocked).toBe(true);
    expect(result.issues[0].rule).toBe('DRILL_INSIDE_OUTLINE');
  });

  it('should detect multiple out-of-bounds drills', () => {
    const graph = createTestGraph([
      { id: 'drill-1', position: { x: -10, y: 200, z: 0 }, diameter: 5, depth: 10 },
      { id: 'drill-2', position: { x: 810, y: 200, z: 0 }, diameter: 5, depth: 10 },
      { id: 'drill-3', position: { x: 100, y: 410, z: 0 }, diameter: 5, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.blocked).toBe(true);
    expect(result.issues.filter(i => i.rule === 'DRILL_INSIDE_OUTLINE')).toHaveLength(3);
  });
});

// ============================================
// NO_ORPHAN_DRILL TESTS
// ============================================

describe('GATE 10.2: NO_ORPHAN_DRILL', () => {
  it('should pass for drill with workpiece context', () => {
    const graph = createTestGraph([
      { position: { x: 100, y: 200, z: 0 }, workpieceContext: { panelId: 'panel-001' } },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const orphanIssues = result.issues.filter(i => i.rule === 'NO_ORPHAN_DRILL');
    expect(orphanIssues).toHaveLength(0);
  });

  it('should BLOCK drill without workpiece context', () => {
    const graph: OperationGraph = {
      machineId: 'TEST-CNC',
      safeZ: 50,
      rapidZ: 100,
      operations: [
        {
          id: 'orphan-drill',
          sourceId: 'test-source',
          toolId: 'T5',
          type: 'DRILL',
          position: { x: 100, y: 200, z: 0 },
          diameter: 5,
          depth: 10,
          direction: 'V',
          throughHole: false,
          workpieceContext: undefined as any,
        },
      ],
      toolsUsed: ['T5'],
      metadata: {
        jobId: 'test',
        panelId: 'panel-001',
        sourceContentHash: 'test-hash',
        builtAt: new Date().toISOString(),
        toolVersion: '1.0.0-test',
      },
    };

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.blocked).toBe(true);
    expect(result.issues.some(i => i.rule === 'NO_ORPHAN_DRILL')).toBe(true);
  });

  it('should BLOCK drill with empty panelId', () => {
    const graph: OperationGraph = {
      machineId: 'TEST-CNC',
      safeZ: 50,
      rapidZ: 100,
      operations: [
        {
          id: 'orphan-drill',
          sourceId: 'test-source',
          toolId: 'T5',
          type: 'DRILL',
          position: { x: 100, y: 200, z: 0 },
          diameter: 5,
          depth: 10,
          direction: 'V',
          throughHole: false,
          workpieceContext: {
            panelId: '',
            face: 'TOP' as const,
            appliedOffset: { x: 0, y: 0, z: 0 },
          },
        },
      ],
      toolsUsed: ['T5'],
      metadata: {
        jobId: 'test',
        panelId: 'panel-001',
        sourceContentHash: 'test-hash',
        builtAt: new Date().toISOString(),
        toolVersion: '1.0.0-test',
      },
    };

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.blocked).toBe(true);
    expect(result.issues.some(i => i.rule === 'NO_ORPHAN_DRILL')).toBe(true);
  });
});

// ============================================
// DRILL_DEPTH_SAFE TESTS
// ============================================

describe('GATE 10.2: DRILL_DEPTH_SAFE', () => {
  it('should pass for blind hole within panel thickness', () => {
    const graph = createTestGraph([
      { position: { x: 100, y: 200, z: 0 }, diameter: 5, depth: 10 }, // 10mm in 18mm panel
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const depthIssues = result.issues.filter(i => i.rule === 'DRILL_DEPTH_SAFE');
    expect(depthIssues).toHaveLength(0);
  });

  it('should pass for drill at exact panel thickness + tolerance', () => {
    const graph = createTestGraph([
      // 18mm panel + 0.5mm tolerance = 18.5mm max
      { position: { x: 100, y: 200, z: 0 }, diameter: 5, depth: 18.5 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const depthIssues = result.issues.filter(i => i.rule === 'DRILL_DEPTH_SAFE');
    expect(depthIssues).toHaveLength(0);
  });

  it('should BLOCK drill exceeding safe depth', () => {
    const graph = createTestGraph([
      // 20mm depth in 18mm panel (exceeds 18.5mm limit)
      { position: { x: 100, y: 200, z: 0 }, diameter: 5, depth: 20 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.blocked).toBe(true);
    expect(result.issues.some(i => i.rule === 'DRILL_DEPTH_SAFE')).toBe(true);
  });

  it('should BLOCK through-hole in unexpected context', () => {
    const graph = createTestGraph([
      // 25mm depth in 18mm panel
      { position: { x: 100, y: 200, z: 0 }, diameter: 5, depth: 25 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.blocked).toBe(true);
    const issue = result.issues.find(i => i.rule === 'DRILL_DEPTH_SAFE');
    expect(issue).toBeDefined();
    expect(issue!.details?.drillDepth).toBe(25);
    expect(issue!.details?.panelThickness).toBe(18);
  });
});

// ============================================
// MINIFIX_DISTANCE_B TESTS
// ============================================

describe('GATE 10.2: MINIFIX_DISTANCE_B', () => {
  it('should pass for bolt at exact Distance B (24mm)', () => {
    const graph = createTestGraph([
      {
        type: 'DRILL',
        id: 'bolt-001',
        position: { x: 200, y: 24, z: 0 }, // y = Distance B
        diameter: 10, // Bolt sleeve Ø10
        depth: 17.5,
        direction: 'H', // Horizontal
      },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const distBIssues = result.issues.filter(i => i.rule === 'MINIFIX_DISTANCE_B');
    expect(distBIssues).toHaveLength(0);
  });

  it('should pass for bolt within Distance B tolerance (±0.1mm)', () => {
    const graph = createTestGraph([
      {
        type: 'DRILL',
        position: { x: 200, y: 24.09, z: 0 }, // 24.09mm (within 0.1mm)
        diameter: 10,
        depth: 17.5,
        direction: 'H',
      },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const distBIssues = result.issues.filter(i => i.rule === 'MINIFIX_DISTANCE_B');
    expect(distBIssues).toHaveLength(0);
  });

  it('should BLOCK bolt outside Distance B tolerance', () => {
    const graph = createTestGraph([
      {
        type: 'DRILL',
        id: 'bad-bolt',
        position: { x: 200, y: 34, z: 0 }, // 34mm (wrong!)
        diameter: 10,
        depth: 17.5,
        direction: 'H',
      },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.blocked).toBe(true);
    const issue = result.issues.find(i => i.rule === 'MINIFIX_DISTANCE_B');
    expect(issue).toBeDefined();
    expect(issue!.details?.actualDistanceB).toBe(34);
    expect(issue!.details?.expectedDistanceB).toBe(24);
  });

  it('should not check Distance B for vertical drills', () => {
    const graph = createTestGraph([
      {
        type: 'DRILL',
        position: { x: 200, y: 37, z: 0 }, // System 32 position
        diameter: 10,
        depth: 17.5,
        direction: 'V', // Vertical - not a bolt sleeve
      },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const distBIssues = result.issues.filter(i => i.rule === 'MINIFIX_DISTANCE_B');
    expect(distBIssues).toHaveLength(0);
  });

  it('should not check Distance B for non-10mm diameter', () => {
    const graph = createTestGraph([
      {
        type: 'DRILL',
        position: { x: 200, y: 34, z: 0 }, // Wrong Distance B but...
        diameter: 5, // ...not a bolt (Ø5, not Ø10)
        depth: 10,
        direction: 'H',
      },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const distBIssues = result.issues.filter(i => i.rule === 'MINIFIX_DISTANCE_B');
    expect(distBIssues).toHaveLength(0); // Not checked for non-bolt operations
  });
});

// ============================================
// MINIFIX_PAIR_MUTUAL TESTS
// ============================================

describe('GATE 10.2: MINIFIX_PAIR_MUTUAL', () => {
  it('should pass for correctly paired cam and bolt', () => {
    const graph = createTestGraph([
      {
        id: 'cam-001',
        type: 'BORE',
        position: { x: 200, y: 37, z: 9 },
        diameter: 15,
        depth: 12.5,
        direction: 'V',
        metadata: { purpose: 'CAM_HOUSING', pairedHoleId: 'bolt-001' },
      } as any,
      {
        id: 'bolt-001',
        type: 'DRILL',
        position: { x: 200, y: 24, z: 0 },
        diameter: 10,
        depth: 17.5,
        direction: 'H',
        metadata: { purpose: 'BOLT_SLEEVE', pairedHoleId: 'cam-001' },
      } as any,
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const pairIssues = result.issues.filter(i => i.rule === 'MINIFIX_PAIR_MUTUAL');
    expect(pairIssues).toHaveLength(0);
  });

  it('should BLOCK if paired hole does not exist', () => {
    const graph = createTestGraph([
      {
        id: 'cam-001',
        type: 'BORE',
        position: { x: 200, y: 37, z: 9 },
        diameter: 15,
        depth: 12.5,
        direction: 'V',
        metadata: { purpose: 'CAM_HOUSING', pairedHoleId: 'nonexistent-bolt' },
      } as any,
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.blocked).toBe(true);
    const issue = result.issues.find(i => i.rule === 'MINIFIX_PAIR_MUTUAL');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('nonexistent-bolt');
  });

  it('should BLOCK if pair reference is not mutual', () => {
    const graph = createTestGraph([
      {
        id: 'cam-001',
        type: 'BORE',
        position: { x: 200, y: 37, z: 9 },
        diameter: 15,
        depth: 12.5,
        direction: 'V',
        metadata: { purpose: 'CAM_HOUSING', pairedHoleId: 'bolt-001' },
      } as any,
      {
        id: 'bolt-001',
        type: 'DRILL',
        position: { x: 200, y: 24, z: 0 },
        diameter: 10,
        depth: 17.5,
        direction: 'H',
        metadata: { purpose: 'BOLT_SLEEVE', pairedHoleId: 'wrong-cam' }, // Mismatch!
      } as any,
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.blocked).toBe(true);
    const issue = result.issues.find(i => i.rule === 'MINIFIX_PAIR_MUTUAL');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('mismatch');
  });

  it('should pass for one-way reference (cam references bolt, bolt has no back-ref)', () => {
    const graph = createTestGraph([
      {
        id: 'cam-001',
        type: 'BORE',
        position: { x: 200, y: 37, z: 9 },
        diameter: 15,
        depth: 12.5,
        direction: 'V',
        metadata: { purpose: 'CAM_HOUSING', pairedHoleId: 'bolt-001' },
      } as any,
      {
        id: 'bolt-001',
        type: 'DRILL',
        position: { x: 200, y: 24, z: 0 },
        diameter: 10,
        depth: 17.5,
        direction: 'H',
        metadata: { purpose: 'BOLT_SLEEVE' }, // No pairedHoleId
      } as any,
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    // One-way reference is allowed (back-ref is optional if null/undefined)
    const pairIssues = result.issues.filter(i => i.rule === 'MINIFIX_PAIR_MUTUAL');
    expect(pairIssues).toHaveLength(0);
  });
});

// ============================================
// NO_OVERLAPPING_DRILLS TESTS
// ============================================

describe('GATE 10.2: NO_OVERLAPPING_DRILLS', () => {
  it('should pass for drills with sufficient spacing', () => {
    const graph = createTestGraph([
      { id: 'drill-1', position: { x: 100, y: 200, z: 0 }, diameter: 5, depth: 10 },
      { id: 'drill-2', position: { x: 200, y: 200, z: 0 }, diameter: 5, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const overlapIssues = result.issues.filter(i => i.rule === 'NO_OVERLAPPING_DRILLS');
    expect(overlapIssues).toHaveLength(0);
  });

  it('should WARN for overlapping drills', () => {
    const graph = createTestGraph([
      { id: 'drill-1', position: { x: 100, y: 200, z: 0 }, diameter: 10, depth: 10 },
      { id: 'drill-2', position: { x: 105, y: 200, z: 0 }, diameter: 10, depth: 10 },
      // Distance = 5mm, but min required = 5 + 5 + 0.5 = 10.5mm
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.valid).toBe(false);
    expect(result.blocked).toBe(false); // WARN doesn't block
    const issue = result.issues.find(i => i.rule === 'NO_OVERLAPPING_DRILLS');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('WARN');
  });

  it('should WARN for touching drills (edge-to-edge)', () => {
    const graph = createTestGraph([
      { id: 'drill-1', position: { x: 100, y: 200, z: 0 }, diameter: 10, depth: 10 },
      { id: 'drill-2', position: { x: 110, y: 200, z: 0 }, diameter: 10, depth: 10 },
      // Distance = 10mm, but min required = 5 + 5 + 0.5 = 10.5mm
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const issue = result.issues.find(i => i.rule === 'NO_OVERLAPPING_DRILLS');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('WARN');
  });

  it('should pass for drills at minimum safe distance', () => {
    const graph = createTestGraph([
      { id: 'drill-1', position: { x: 100, y: 200, z: 0 }, diameter: 10, depth: 10 },
      { id: 'drill-2', position: { x: 110.6, y: 200, z: 0 }, diameter: 10, depth: 10 },
      // Distance = 10.6mm, min required = 5 + 5 + 0.5 = 10.5mm
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const overlapIssues = result.issues.filter(i => i.rule === 'NO_OVERLAPPING_DRILLS');
    expect(overlapIssues).toHaveLength(0);
  });

  it('should detect multiple overlaps', () => {
    const graph = createTestGraph([
      { id: 'drill-1', position: { x: 100, y: 200, z: 0 }, diameter: 10, depth: 10 },
      { id: 'drill-2', position: { x: 105, y: 200, z: 0 }, diameter: 10, depth: 10 },
      { id: 'drill-3', position: { x: 108, y: 200, z: 0 }, diameter: 10, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const overlapIssues = result.issues.filter(i => i.rule === 'NO_OVERLAPPING_DRILLS');
    expect(overlapIssues.length).toBeGreaterThan(1);
  });
});

// ============================================
// TOOL_RADIUS_VALID TESTS
// ============================================

describe('GATE 10.2: TOOL_RADIUS_VALID', () => {
  it('should pass for standard drill sizes', () => {
    const graph = createTestGraph([
      { diameter: 5, depth: 10 },
      { diameter: 8, depth: 10 },
      { diameter: 10, depth: 10 },
      { diameter: 15, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const radiusIssues = result.issues.filter(i => i.rule === 'TOOL_RADIUS_VALID');
    expect(radiusIssues).toHaveLength(0);
  });

  it('should WARN for zero diameter', () => {
    const graph = createTestGraph([
      { diameter: 0, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const issue = result.issues.find(i => i.rule === 'TOOL_RADIUS_VALID');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('WARN');
  });

  it('should WARN for negative diameter', () => {
    const graph = createTestGraph([
      { diameter: -5, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const issue = result.issues.find(i => i.rule === 'TOOL_RADIUS_VALID');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('WARN');
  });

  it('should WARN for unusually large diameter', () => {
    const graph = createTestGraph([
      { diameter: 100, depth: 10 }, // 100mm is very large
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    const issue = result.issues.find(i => i.rule === 'TOOL_RADIUS_VALID');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('WARN');
    expect(issue!.message).toContain('unusually large');
  });
});

// ============================================
// OPTIONS TESTS
// ============================================

describe('GATE 10.2: Options', () => {
  it('should skip specified rules', () => {
    const graph = createTestGraph([
      { position: { x: -50, y: 200, z: 0 }, diameter: 5, depth: 10 }, // Outside bounds
    ]);

    const result = validateDxfSemantic(graph, {
      panel: DEFAULT_PANEL,
      skipRules: ['DRILL_INSIDE_OUTLINE'],
    });

    const boundsIssues = result.issues.filter(i => i.rule === 'DRILL_INSIDE_OUTLINE');
    expect(boundsIssues).toHaveLength(0);
  });

  it('should block on warnings in strict mode', () => {
    const graph = createTestGraph([
      { id: 'drill-1', position: { x: 100, y: 200, z: 0 }, diameter: 10, depth: 10 },
      { id: 'drill-2', position: { x: 105, y: 200, z: 0 }, diameter: 10, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, {
      panel: DEFAULT_PANEL,
      strictMode: true,
    });

    expect(result.blocked).toBe(true); // WARN becomes BLOCK in strict mode
  });

  it('should work without panel context (limited checks)', () => {
    const graph = createTestGraph([
      { position: { x: 100, y: 200, z: 0 }, diameter: 5, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph); // No panel

    // Should still run non-panel checks
    expect(result.summary.totalChecks).toBeGreaterThan(0);
    expect(result.valid).toBe(true);
  });
});

// ============================================
// CONVENIENCE FUNCTION TESTS
// ============================================

describe('GATE 10.2: Convenience Functions', () => {
  it('isDxfSemanticValid returns boolean', () => {
    const validGraph = createTestGraph([
      { position: { x: 100, y: 200, z: 0 }, diameter: 5, depth: 10 },
    ]);
    const invalidGraph = createTestGraph([
      { position: { x: -100, y: 200, z: 0 }, diameter: 5, depth: 10 },
    ]);

    expect(isDxfSemanticValid(validGraph, { panel: DEFAULT_PANEL })).toBe(true);
    expect(isDxfSemanticValid(invalidGraph, { panel: DEFAULT_PANEL })).toBe(false);
  });

  it('getBlockingIssues filters correctly', () => {
    const graph = createTestGraph([
      { id: 'out-of-bounds', position: { x: -100, y: 200, z: 0 }, diameter: 5, depth: 10 },
      { id: 'overlap-1', position: { x: 200, y: 200, z: 0 }, diameter: 10, depth: 10 },
      { id: 'overlap-2', position: { x: 205, y: 200, z: 0 }, diameter: 10, depth: 10 },
    ]);

    const blocking = getBlockingIssues(graph, { panel: DEFAULT_PANEL });

    // Only DRILL_INSIDE_OUTLINE should be BLOCK
    expect(blocking.every(i => i.severity === 'BLOCK')).toBe(true);
    expect(blocking.some(i => i.rule === 'DRILL_INSIDE_OUTLINE')).toBe(true);
    expect(blocking.some(i => i.rule === 'NO_OVERLAPPING_DRILLS')).toBe(false);
  });

  it('formatSemanticReport produces readable output', () => {
    const graph = createTestGraph([
      { id: 'bad-drill', position: { x: -100, y: 200, z: 0 }, diameter: 5, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });
    const report = formatSemanticReport(result);

    expect(report).toContain('DXF Semantic Validation Report');
    expect(report).toContain('DRILL_INSIDE_OUTLINE');
    expect(report).toContain('BLOCKED');
    expect(report).toContain('bad-drill');
  });

  it('formatSemanticReport handles clean result', () => {
    const graph = createTestGraph([
      { position: { x: 100, y: 200, z: 0 }, diameter: 5, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });
    const report = formatSemanticReport(result);

    expect(report).toContain('All semantic checks passed');
    expect(report).toContain('PASSED');
  });
});

// ============================================
// INTEGRATION TESTS
// ============================================

describe('GATE 10.2: Integration', () => {
  it('should validate complete Minifix assembly', () => {
    const graph = createTestGraph([
      // Cam housing (vertical, Ø15)
      {
        id: 'cam-001',
        type: 'BORE',
        position: { x: 200, y: 37, z: 9 },
        diameter: 15,
        depth: 12.5,
        direction: 'V',
        metadata: { purpose: 'CAM_HOUSING', pairedHoleId: 'bolt-001' },
      } as any,
      // Bolt sleeve (horizontal, Ø10, Distance B = 24mm)
      {
        id: 'bolt-001',
        type: 'DRILL',
        position: { x: 200, y: 24, z: 0 },
        diameter: 10,
        depth: 17.5,
        direction: 'H',
        metadata: { purpose: 'BOLT_SLEEVE', pairedHoleId: 'cam-001' },
      } as any,
      // Shelf pin holes (vertical, Ø5)
      {
        id: 'pin-001',
        type: 'DRILL',
        position: { x: 100, y: 37, z: 0 },
        diameter: 5,
        depth: 10,
        direction: 'V',
      },
      {
        id: 'pin-002',
        type: 'DRILL',
        position: { x: 100, y: 69, z: 0 }, // 37 + 32 = 69 (System 32)
        diameter: 5,
        depth: 10,
        direction: 'V',
      },
    ]);

    const panel: PanelContext = {
      panelId: 'side-panel-001',
      width: 600,
      height: 800,
      thickness: 18,
    };

    const result = validateDxfSemantic(graph, { panel });

    expect(result.valid).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.summary.blockCount).toBe(0);
  });

  it('should catch multiple issues in complex assembly', () => {
    const graph = createTestGraph([
      // Out of bounds
      { id: 'bad-1', position: { x: -10, y: 200, z: 0 }, diameter: 5, depth: 10 },
      // Too deep
      { id: 'bad-2', position: { x: 100, y: 200, z: 0 }, diameter: 5, depth: 25 },
      // Wrong Distance B
      {
        id: 'bad-bolt',
        type: 'DRILL',
        position: { x: 200, y: 34, z: 0 }, // Should be 24mm!
        diameter: 10,
        depth: 17.5,
        direction: 'H',
      },
      // Overlapping drills
      { id: 'overlap-1', position: { x: 300, y: 200, z: 0 }, diameter: 10, depth: 10 },
      { id: 'overlap-2', position: { x: 305, y: 200, z: 0 }, diameter: 10, depth: 10 },
    ]);

    const result = validateDxfSemantic(graph, { panel: DEFAULT_PANEL });

    expect(result.valid).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.summary.blockCount).toBeGreaterThanOrEqual(3); // At least 3 BLOCK issues
    expect(result.summary.warnCount).toBeGreaterThanOrEqual(1); // At least 1 WARN
  });
});

// ============================================
// TOLERANCE CONSTANTS TESTS
// ============================================

describe('GATE 10.2: Tolerance Constants', () => {
  it('should have correct tolerance values', () => {
    expect(TOLERANCES.DRILL_INSIDE_OUTLINE).toBe(0.1);
    expect(TOLERANCES.NO_OVERLAPPING_DRILLS).toBe(0.5);
    expect(TOLERANCES.DRILL_DEPTH_SAFE).toBe(0.5);
    expect(TOLERANCES.MINIFIX_DISTANCE_B).toBe(0.1);
  });

  it('should have correct Minifix spec values', () => {
    expect(MINIFIX_SPEC.DISTANCE_B).toBe(24);
    expect(MINIFIX_SPEC.CAM_DIAMETER).toBe(15);
    expect(MINIFIX_SPEC.BOLT_DIAMETER).toBe(10);
    expect(MINIFIX_SPEC.FIRST_HOLE_Z).toBe(37);
  });
});
