/**
 * gate10_3MachineDialect.test.ts - Machine Dialect Gate Tests
 *
 * Tests the G10.3 invariant: No OperationGraph may be exported unless
 * it is valid for the selected machine dialect.
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  validateMachineDialect,
  assertMachineDialect,
  G10_3_CODES,
  G10_3Error,
  isG10_3Error,
  hasBlockingIssues,
  getBlockingIssues,
  formatMachineDialectResult,
  validateMachineProfileStructure,
  assertMachineProfile,
  TRUSTED_EXPORT_PATHS,
  type MachineDialectCapabilities,
} from '../gate10_3MachineDialect';
import type { OperationGraph, DrillOperation, ProfileOperation } from '../../../cnc/operation/operationTypes';
import type { MachineProfile, ToolCapability } from '../../../cnc/machine/machineProfile';

// ============================================
// TEST FIXTURES
// ============================================

function createTestTool(overrides?: Partial<ToolCapability>): ToolCapability {
  return {
    toolId: 'DRILL_5',
    type: 'DRILL',
    diameter: 5,
    maxDepth: 30,
    supportsPeck: true,
    supportsBore: false,
    defaultFeedRate: 1000,
    defaultPlungeRate: 500,
    ...overrides,
  };
}

function createTestMachine(overrides?: Partial<MachineProfile>): MachineProfile {
  return {
    id: 'GENERIC',
    name: 'Test Machine',
    manufacturer: 'Test',
    units: 'mm',
    axis: {
      x: { min: 0, max: 3000 },
      y: { min: 0, max: 1500 },
      z: { min: -100, max: 0 },
    },
    spindle: {
      maxRpm: 24000,
      minRpm: 6000,
      defaultRpm: 18000,
    },
    tools: [
      createTestTool({ toolId: 'DRILL_5', diameter: 5, maxDepth: 30 }),
      createTestTool({ toolId: 'DRILL_8', diameter: 8, maxDepth: 40 }),
      createTestTool({ toolId: 'DRILL_10', diameter: 10, maxDepth: 50 }),
      createTestTool({ toolId: 'BORE_15', type: 'BORE', diameter: 15, maxDepth: 12.5, supportsBore: true }),
      createTestTool({ toolId: 'ROUTER_6', type: 'ROUTER', diameter: 6, maxDepth: 25 }),
    ],
    defaultSafeZ: 5,
    coordinateSystem: 'Y_UP',
    dialect: 'FANUC',
    supportsToolChange: true,
    toolMagazineSize: 12,
    ...overrides,
  };
}

function createTestDrillOp(overrides?: Partial<DrillOperation>): DrillOperation {
  return {
    id: 'op-1',
    type: 'DRILL',
    sourceId: 'src-1',
    toolId: 'DRILL_5',
    position: { x: 100, y: 50, z: 0 },
    depth: 15,
    throughHole: false,
    ...overrides,
  };
}

function createTestProfileOp(overrides?: Partial<ProfileOperation>): ProfileOperation {
  return {
    id: 'op-profile-1',
    type: 'PROFILE',
    sourceId: 'src-profile-1',
    toolId: 'ROUTER_6',
    position: { x: 0, y: 0, z: 0 },
    path: [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 100, y: 100, z: 0 },
      { x: 0, y: 100, z: 0 },
    ],
    depth: 10,
    side: 'OUTSIDE',
    ...overrides,
  };
}

function createTestGraph(
  operations: OperationGraph['operations'],
  overrides?: Partial<OperationGraph>
): OperationGraph {
  return {
    machineId: 'GENERIC',
    safeZ: 5,
    rapidZ: 10,
    operations,
    metadata: {
      jobId: 'test-job-123',
      sourceContentHash: 'abc123',
      builtAt: new Date().toISOString(),
      toolVersion: 'test@1.0.0',
    },
    toolsUsed: [...new Set(operations.map((op) => op.toolId))],
    ...overrides,
  };
}

// ============================================
// TEST 1: Tool too large → BLOCK
// ============================================

describe('G10.3: Tool Diameter Validation', () => {
  it('should BLOCK when tool diameter exceeds machine maximum', () => {
    const machine = createTestMachine();
    const caps: MachineDialectCapabilities = {
      maxToolDiameter: 8, // Max 8mm allowed
    };

    // Use DRILL_10 which has 10mm diameter (exceeds 8mm max)
    const graph = createTestGraph([
      createTestDrillOp({ toolId: 'DRILL_10', depth: 20 }),
    ]);

    const result = validateMachineDialect(graph, machine, caps);

    expect(result.ok).toBe(false);
    expect(result.summary.blockingIssues).toBe(1);
    expect(result.issues[0].code).toBe(G10_3_CODES.TOOL_DIAMETER_RANGE);
    expect(result.issues[0].severity).toBe('BLOCK');
    expect(result.issues[0].message).toContain('exceeds machine maximum');
    expect(result.issues[0].diameter).toBe(10);
  });

  // ============================================
  // TEST 2: Tool too small → BLOCK
  // ============================================

  it('should BLOCK when tool diameter is below machine minimum', () => {
    const machine = createTestMachine({
      tools: [
        createTestTool({ toolId: 'DRILL_3', diameter: 3, maxDepth: 20 }),
      ],
    });
    const caps: MachineDialectCapabilities = {
      minToolDiameter: 4, // Min 4mm required
    };

    // Use DRILL_3 which has 3mm diameter (below 4mm min)
    const graph = createTestGraph([
      createTestDrillOp({ toolId: 'DRILL_3', depth: 10 }),
    ]);

    const result = validateMachineDialect(graph, machine, caps);

    expect(result.ok).toBe(false);
    expect(result.summary.blockingIssues).toBe(1);
    expect(result.issues[0].code).toBe(G10_3_CODES.TOOL_DIAMETER_RANGE);
    expect(result.issues[0].severity).toBe('BLOCK');
    expect(result.issues[0].message).toContain('below machine minimum');
    expect(result.issues[0].diameter).toBe(3);
  });
});

// ============================================
// TEST 3: Depth > maxDepth → BLOCK
// ============================================

describe('G10.3: Depth Validation', () => {
  it('should BLOCK when operation depth exceeds tool max depth', () => {
    const machine = createTestMachine();
    // DRILL_5 has maxDepth of 30mm
    const graph = createTestGraph([
      createTestDrillOp({ toolId: 'DRILL_5', depth: 35 }), // 35mm > 30mm max
    ]);

    const result = validateMachineDialect(graph, machine);

    expect(result.ok).toBe(false);
    expect(result.summary.blockingIssues).toBe(1);
    expect(result.issues[0].code).toBe(G10_3_CODES.TOOL_DEPTH_RANGE);
    expect(result.issues[0].severity).toBe('BLOCK');
    expect(result.issues[0].message).toContain('exceeds tool max depth');
    expect(result.issues[0].depth).toBe(35);
  });

  it('should BLOCK when operation depth exceeds machine max operation depth', () => {
    const machine = createTestMachine({
      tools: [
        createTestTool({ toolId: 'DRILL_LONG', diameter: 5, maxDepth: 100 }),
      ],
    });
    const caps: MachineDialectCapabilities = {
      maxOperationDepth: 50, // Machine can only do 50mm deep
    };

    const graph = createTestGraph([
      createTestDrillOp({ toolId: 'DRILL_LONG', depth: 60 }), // 60mm > 50mm machine max
    ]);

    const result = validateMachineDialect(graph, machine, caps);

    expect(result.ok).toBe(false);
    expect(result.summary.blockingIssues).toBe(1);
    expect(result.issues[0].code).toBe(G10_3_CODES.TOOL_DEPTH_RANGE);
    expect(result.issues[0].message).toContain('exceeds machine max operation depth');
  });
});

// ============================================
// TEST 4: Arc op on machine without arc support → BLOCK
// ============================================

describe('G10.3: Arc Support Validation', () => {
  it('should BLOCK when profile has arc lead-in but machine does not support arcs', () => {
    const machine = createTestMachine();
    const caps: MachineDialectCapabilities = {
      supportsArcs: false, // Machine does NOT support arcs
    };

    // Profile with leadRadius implies arc lead-in/lead-out
    const graph = createTestGraph([
      createTestProfileOp({
        toolId: 'ROUTER_6',
        leadRadius: 5, // Arc lead-in requested
        depth: 10,
      }),
    ]);

    const result = validateMachineDialect(graph, machine, caps);

    expect(result.ok).toBe(false);
    expect(result.summary.blockingIssues).toBe(1);
    expect(result.issues[0].code).toBe(G10_3_CODES.ARC_UNSUPPORTED);
    expect(result.issues[0].severity).toBe('BLOCK');
    expect(result.issues[0].message).toContain('does not support arcs');
  });

  it('should PASS when profile has no arc lead-in on non-arc machine', () => {
    const machine = createTestMachine();
    const caps: MachineDialectCapabilities = {
      supportsArcs: false,
    };

    // Profile WITHOUT leadRadius - no arc needed
    const graph = createTestGraph([
      createTestProfileOp({
        toolId: 'ROUTER_6',
        leadRadius: undefined, // No arc lead-in
        depth: 10,
      }),
    ]);

    const result = validateMachineDialect(graph, machine, caps);

    expect(result.ok).toBe(true);
    expect(result.summary.blockingIssues).toBe(0);
  });
});

// ============================================
// TEST 5: G83 on machine without support → BLOCK
// ============================================

describe('G10.3: G83 Peck Drilling Validation', () => {
  it('should BLOCK when peck drilling requested but machine does not support G83', () => {
    const machine = createTestMachine();
    const caps: MachineDialectCapabilities = {
      supportsG83: false, // Machine does NOT support G83 peck
    };

    const graph = createTestGraph([
      createTestDrillOp({
        toolId: 'DRILL_5',
        depth: 25,
        peckDepth: 5, // Peck drilling requested
      }),
    ]);

    const result = validateMachineDialect(graph, machine, caps);

    expect(result.ok).toBe(false);
    expect(result.summary.blockingIssues).toBe(1);
    expect(result.issues[0].code).toBe(G10_3_CODES.G83_UNSUPPORTED);
    expect(result.issues[0].severity).toBe('BLOCK');
    expect(result.issues[0].message).toContain('machine does not support');
  });

  it('should BLOCK when tool does not support peck but peck is requested', () => {
    const machine = createTestMachine({
      tools: [
        createTestTool({
          toolId: 'DRILL_NO_PECK',
          diameter: 5,
          maxDepth: 30,
          supportsPeck: false, // Tool does NOT support peck
        }),
      ],
    });

    const graph = createTestGraph([
      createTestDrillOp({
        toolId: 'DRILL_NO_PECK',
        depth: 25,
        peckDepth: 5, // Peck drilling requested
      }),
    ]);

    const result = validateMachineDialect(graph, machine);

    expect(result.ok).toBe(false);
    expect(result.summary.blockingIssues).toBe(1);
    expect(result.issues[0].code).toBe(G10_3_CODES.G83_UNSUPPORTED);
    expect(result.issues[0].message).toContain('tool');
    expect(result.issues[0].message).toContain('does not support peck');
  });

  it('should PASS when peck drilling is supported by both machine and tool', () => {
    const machine = createTestMachine();
    // Default capabilities support G83

    const graph = createTestGraph([
      createTestDrillOp({
        toolId: 'DRILL_5', // Tool supports peck
        depth: 25,
        peckDepth: 5,
      }),
    ]);

    const result = validateMachineDialect(graph, machine);

    expect(result.ok).toBe(true);
    expect(result.summary.blockingIssues).toBe(0);
  });
});

// ============================================
// TEST 6: Unsupported op type → BLOCK
// ============================================

describe('G10.3: Supported Operations Validation', () => {
  it('should BLOCK when operation type is not in supportedOps list', () => {
    const machine = createTestMachine();
    const caps: MachineDialectCapabilities = {
      supportedOps: ['DRILL', 'BORE'], // Only DRILL and BORE allowed
    };

    const graph = createTestGraph([
      createTestDrillOp({ toolId: 'DRILL_5', depth: 15 }), // OK
      createTestProfileOp({ toolId: 'ROUTER_6', depth: 10 }), // NOT in supportedOps
    ]);

    const result = validateMachineDialect(graph, machine, caps);

    expect(result.ok).toBe(false);
    expect(result.summary.blockingIssues).toBe(1);
    expect(result.issues[0].code).toBe(G10_3_CODES.OPERATION_UNSUPPORTED);
    expect(result.issues[0].severity).toBe('BLOCK');
    expect(result.issues[0].message).toContain('PROFILE');
    expect(result.issues[0].message).toContain('not supported');
    expect(result.issues[0].opType).toBe('PROFILE');
  });

  it('should PASS when all operations are in supportedOps list', () => {
    const machine = createTestMachine();
    const caps: MachineDialectCapabilities = {
      supportedOps: ['DRILL', 'BORE', 'PROFILE'],
    };

    const graph = createTestGraph([
      createTestDrillOp({ toolId: 'DRILL_5', depth: 15 }),
      createTestProfileOp({ toolId: 'ROUTER_6', depth: 10 }),
    ]);

    const result = validateMachineDialect(graph, machine, caps);

    expect(result.ok).toBe(true);
  });
});

// ============================================
// TEST 7: Forbidden op list → BLOCK
// ============================================

describe('G10.3: Forbidden Operations Validation', () => {
  it('should BLOCK when operation type is in forbiddenOps list', () => {
    const machine = createTestMachine();
    const caps: MachineDialectCapabilities = {
      forbiddenOps: ['SLOT', 'POCKET'], // These ops are explicitly forbidden
    };

    const graph = createTestGraph([
      createTestDrillOp({ toolId: 'DRILL_5', depth: 15 }), // OK
      {
        id: 'op-slot-1',
        type: 'SLOT' as const,
        sourceId: 'src-slot-1',
        toolId: 'ROUTER_6',
        position: { x: 0, y: 0, z: 0 },
        endPosition: { x: 100, y: 0, z: 0 },
        width: 6,
        depth: 10,
      }, // FORBIDDEN
    ]);

    const result = validateMachineDialect(graph, machine, caps);

    expect(result.ok).toBe(false);
    expect(result.summary.blockingIssues).toBe(1);
    expect(result.issues[0].code).toBe(G10_3_CODES.FORBIDDEN_OPERATION);
    expect(result.issues[0].severity).toBe('BLOCK');
    expect(result.issues[0].message).toContain('SLOT');
    expect(result.issues[0].message).toContain('forbidden');
    expect(result.issues[0].opType).toBe('SLOT');
  });

  it('should PASS when no forbidden ops are present', () => {
    const machine = createTestMachine();
    const caps: MachineDialectCapabilities = {
      forbiddenOps: ['SLOT', 'POCKET'], // Forbidden, but we're not using them
    };

    const graph = createTestGraph([
      createTestDrillOp({ toolId: 'DRILL_5', depth: 15 }),
      createTestProfileOp({ toolId: 'ROUTER_6', depth: 10 }),
    ]);

    const result = validateMachineDialect(graph, machine, caps);

    expect(result.ok).toBe(true);
    expect(result.summary.blockingIssues).toBe(0);
  });
});

// ============================================
// TEST 8: Valid graph on valid machine → PASS
// ============================================

describe('G10.3: Valid Graph on Valid Machine', () => {
  it('should PASS when all operations are valid for the machine', () => {
    const machine = createTestMachine();

    const graph = createTestGraph([
      createTestDrillOp({ toolId: 'DRILL_5', depth: 15 }),
      createTestDrillOp({ id: 'op-2', toolId: 'DRILL_8', depth: 20, sourceId: 'src-2' }),
    ]);

    const result = validateMachineDialect(graph, machine);

    expect(result.ok).toBe(true);
    expect(result.summary.blockingIssues).toBe(0);
    expect(result.summary.warningIssues).toBe(0);
    expect(result.summary.totalOperations).toBe(2);
    expect(result.summary.checkedOperations).toBe(2);
    expect(result.issues).toHaveLength(0);
  });

  it('should PASS with assertMachineDialect for valid graph', () => {
    const machine = createTestMachine();
    const graph = createTestGraph([
      createTestDrillOp({ toolId: 'DRILL_5', depth: 15 }),
    ]);

    // Should not throw
    expect(() => assertMachineDialect(graph, machine)).not.toThrow();
  });
});

// ============================================
// ADDITIONAL: Tool Not Found
// ============================================

describe('G10.3: Tool Not Found', () => {
  it('should BLOCK when tool is not found in machine tool table', () => {
    const machine = createTestMachine();

    const graph = createTestGraph([
      createTestDrillOp({ toolId: 'NONEXISTENT_TOOL', depth: 15 }),
    ]);

    const result = validateMachineDialect(graph, machine);

    expect(result.ok).toBe(false);
    expect(result.summary.blockingIssues).toBe(1);
    expect(result.issues[0].code).toBe(G10_3_CODES.TOOL_NOT_FOUND);
    expect(result.issues[0].severity).toBe('BLOCK');
    expect(result.issues[0].message).toContain('not found');
    expect(result.issues[0].toolId).toBe('NONEXISTENT_TOOL');
  });
});

// ============================================
// ERROR TYPE AND HELPERS
// ============================================

describe('G10.3: Error and Helper Functions', () => {
  it('assertMachineDialect should throw G10_3Error for invalid graph', () => {
    const machine = createTestMachine();
    const caps: MachineDialectCapabilities = {
      maxToolDiameter: 8,
    };

    const graph = createTestGraph([
      createTestDrillOp({ toolId: 'DRILL_10', depth: 20 }), // 10mm > 8mm max
    ]);

    expect(() => assertMachineDialect(graph, machine, caps)).toThrow(G10_3Error);

    try {
      assertMachineDialect(graph, machine, caps);
    } catch (e) {
      expect(isG10_3Error(e)).toBe(true);
      expect((e as G10_3Error).code).toBe('MONO_G10_3_MACHINE_DIALECT_FAILED');
      expect((e as G10_3Error).result.summary.blockingIssues).toBe(1);
    }
  });

  it('hasBlockingIssues should return correct value', () => {
    const resultWithBlocking: ReturnType<typeof validateMachineDialect> = {
      ok: false,
      issues: [{ code: G10_3_CODES.TOOL_NOT_FOUND, severity: 'BLOCK', message: 'test' }],
      summary: { totalOperations: 1, checkedOperations: 1, blockingIssues: 1, warningIssues: 0 },
    };

    const resultWithoutBlocking: ReturnType<typeof validateMachineDialect> = {
      ok: true,
      issues: [],
      summary: { totalOperations: 1, checkedOperations: 1, blockingIssues: 0, warningIssues: 0 },
    };

    expect(hasBlockingIssues(resultWithBlocking)).toBe(true);
    expect(hasBlockingIssues(resultWithoutBlocking)).toBe(false);
  });

  it('getBlockingIssues should filter blocking issues only', () => {
    const result: ReturnType<typeof validateMachineDialect> = {
      ok: false,
      issues: [
        { code: G10_3_CODES.TOOL_NOT_FOUND, severity: 'BLOCK', message: 'block1' },
        { code: G10_3_CODES.TOOL_DIAMETER_RANGE, severity: 'WARNING', message: 'warn1' },
        { code: G10_3_CODES.TOOL_DEPTH_RANGE, severity: 'BLOCK', message: 'block2' },
      ],
      summary: { totalOperations: 3, checkedOperations: 3, blockingIssues: 2, warningIssues: 1 },
    };

    const blocking = getBlockingIssues(result);
    expect(blocking).toHaveLength(2);
    expect(blocking[0].message).toBe('block1');
    expect(blocking[1].message).toBe('block2');
  });

  it('formatMachineDialectResult should produce readable output', () => {
    const machine = createTestMachine();
    const graph = createTestGraph([
      createTestDrillOp({ toolId: 'DRILL_5', depth: 15 }),
    ]);

    const result = validateMachineDialect(graph, machine);
    const formatted = formatMachineDialectResult(result);

    expect(formatted).toContain('G10.3 Machine Dialect Validation');
    expect(formatted).toContain('Status: PASS');
    expect(formatted).toContain('Operations: 1/1');
  });

  it('isG10_3Error should correctly identify G10.3 errors', () => {
    const g10Error = new G10_3Error({
      ok: false,
      issues: [],
      summary: { totalOperations: 0, checkedOperations: 0, blockingIssues: 1, warningIssues: 0 },
    });

    expect(isG10_3Error(g10Error)).toBe(true);
    expect(isG10_3Error(new Error('regular error'))).toBe(false);
    expect(isG10_3Error(null)).toBe(false);
    expect(isG10_3Error(undefined)).toBe(false);
  });
});

// ============================================
// CANARY TESTS: BYPASS DETECTION
// ============================================

describe('G10.3 Canary Tests - Bypass Detection', () => {
  describe('Machine profile validation catches invalid profiles', () => {
    it('should reject null machine profile', () => {
      const issues = validateMachineProfileStructure(null);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].code).toBe('INVALID_PROFILE');
    });

    it('should reject non-object machine profile', () => {
      const issues = validateMachineProfileStructure('not an object');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].code).toBe('INVALID_PROFILE');
    });

    it('should reject machine profile without id', () => {
      const issues = validateMachineProfileStructure({ tools: [] });
      expect(issues.some(i => i.code === 'MISSING_ID')).toBe(true);
    });

    it('should reject machine profile without tools', () => {
      const issues = validateMachineProfileStructure({ id: 'TEST' });
      expect(issues.some(i => i.code === 'MISSING_TOOLS')).toBe(true);
    });

    it('should reject machine profile with empty tools array', () => {
      const issues = validateMachineProfileStructure({ id: 'TEST', tools: [] });
      expect(issues.some(i => i.code === 'EMPTY_TOOLS')).toBe(true);
    });

    it('should reject machine profile without axis config', () => {
      const issues = validateMachineProfileStructure({
        id: 'TEST',
        tools: [{ toolId: 'T1', diameter: 5, maxDepth: 30 }],
      });
      expect(issues.some(i => i.code === 'MISSING_AXIS')).toBe(true);
    });

    it('assertMachineProfile should throw for invalid profile', () => {
      expect(() => assertMachineProfile(null)).toThrow('MONO_G10_3_INVALID_MACHINE_PROFILE');
      expect(() => assertMachineProfile({ id: 'TEST' })).toThrow('MONO_G10_3_INVALID_MACHINE_PROFILE');
    });

    it('assertMachineProfile should pass for valid profile', () => {
      const validProfile = createTestMachine();
      expect(() => assertMachineProfile(validProfile)).not.toThrow();
    });
  });

  describe('Runtime guard catches bypass attempts', () => {
    it('should BLOCK graph with cast bypass on invalid machine', () => {
      // Simulating: machine as unknown as MachineProfile (with empty tools)
      const invalidMachine = { id: 'FAKE', tools: [], axis: {} } as unknown as ReturnType<typeof createTestMachine>;
      const graph = createTestGraph([
        createTestDrillOp({ toolId: 'DRILL_5', depth: 15 }),
      ]);

      // Even with the cast, runtime guard should catch missing tool
      const result = validateMachineDialect(graph, invalidMachine);
      expect(result.ok).toBe(false);
      expect(result.issues[0].code).toBe(G10_3_CODES.TOOL_NOT_FOUND);
    });

    it('should handle machine without toolTable gracefully', () => {
      // Some machines use tools, some use toolTable
      const machineWithToolTable = {
        ...createTestMachine(),
        toolTable: createTestMachine().tools,
      };

      const graph = createTestGraph([
        createTestDrillOp({ toolId: 'DRILL_5', depth: 15 }),
      ]);

      const result = validateMachineDialect(graph, machineWithToolTable);
      expect(result.ok).toBe(true);
    });
  });
});

// ============================================
// TRUSTED EXPORT PATHS ALLOWLIST
// ============================================

describe('G10.3 Trusted Export Paths', () => {
  it('should export TRUSTED_EXPORT_PATHS', () => {
    expect(TRUSTED_EXPORT_PATHS).toBeDefined();
    expect(Array.isArray(TRUSTED_EXPORT_PATHS)).toBe(true);
  });

  it('should include dxfExportFromOperationGraph.ts', () => {
    expect(TRUSTED_EXPORT_PATHS.some(p => p.includes('dxfExportFromOperationGraph'))).toBe(true);
  });

  it('should include generateGcodeForJob.ts', () => {
    expect(TRUSTED_EXPORT_PATHS.some(p => p.includes('generateGcodeForJob'))).toBe(true);
  });

  it('should include test files', () => {
    expect(TRUSTED_EXPORT_PATHS.some(p => p.includes('__tests__'))).toBe(true);
    expect(TRUSTED_EXPORT_PATHS.some(p => p.includes('.test.ts'))).toBe(true);
  });
});
