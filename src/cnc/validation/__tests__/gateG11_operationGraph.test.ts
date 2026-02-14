/**
 * Gate G11 OperationGraph Tests
 *
 * @module cnc/validation/__tests__/gateG11_operationGraph.test
 * @version 1.0.0
 *
 * Tests for G11 validation at the OperationGraph (canonical) layer.
 */

import { describe, it, expect } from 'vitest';
import {
  validateG11Operations,
  validateG11OperationGraph,
  G11_OP_CONSTANTS,
  type G11OperationMeta,
  type G11Purpose,
} from '../gateG11_operationGraph';
import type {
  Operation,
  DrillOperation,
  BoreOperation,
  OperationGraph,
} from '../../operation/operationTypes';

// ============================================
// TEST FIXTURES
// ============================================

/**
 * Create a base operation with defaults.
 */
function baseOp(id: string): Omit<Operation, 'type'> {
  return {
    id,
    sourceId: `source-${id}`,
    toolId: 'tool-1',
    position: { x: 0, y: 0, z: 0 },
  };
}

/**
 * Create a DRILL operation with G11 metadata.
 */
function drillOp(
  id: string,
  diameter: number,
  depth: number,
  direction: 'V' | 'H',
  meta: G11OperationMeta
): DrillOperation {
  return {
    ...baseOp(id),
    type: 'DRILL',
    diameter,
    depth,
    direction,
    throughHole: false,
    g11Meta: meta,
  } as DrillOperation & { g11Meta: G11OperationMeta };
}

/**
 * Create a BORE operation with G11 metadata.
 */
function boreOp(
  id: string,
  diameter: number,
  depth: number,
  direction: 'V' | 'H',
  meta: G11OperationMeta
): BoreOperation {
  return {
    ...baseOp(id),
    type: 'BORE',
    diameter,
    depth,
    direction,
    flatBottom: true,
    g11Meta: meta,
  } as BoreOperation & { g11Meta: G11OperationMeta };
}

/**
 * Create a valid CAM housing operation.
 */
function validCamHousing(id = 'cam-1'): BoreOperation {
  return boreOp(id, 15, 12.5, 'V', {
    panelRole: 'TOP',
    purpose: 'CAM_HOUSING',
    distanceFromMatingEdge: 24,
  });
}

/**
 * Create a valid bolt sleeve operation.
 */
function validBoltSleeve(id = 'bolt-1'): DrillOperation {
  return drillOp(id, 10, 17.5, 'H', {
    panelRole: 'LEFT_SIDE',
    purpose: 'BOLT_SLEEVE',
  });
}

/**
 * Create a valid dowel side operation.
 */
function validDowelSide(id = 'dowel-side-1'): DrillOperation {
  return drillOp(id, 8, 18, 'H', {
    panelRole: 'LEFT_SIDE',
    purpose: 'DOWEL_SIDE',
  });
}

/**
 * Create a valid dowel horizontal operation.
 */
function validDowelHorizontal(id = 'dowel-horiz-1'): DrillOperation {
  return drillOp(id, 8, 12, 'V', {
    panelRole: 'TOP',
    purpose: 'DOWEL_HORIZONTAL',
  });
}

// ============================================
// CONSTANTS TESTS
// ============================================

describe('G11_OP_CONSTANTS', () => {
  it('should have correct Häfele standard values', () => {
    expect(G11_OP_CONSTANTS.CAM_DIAMETER).toBe(15);
    expect(G11_OP_CONSTANTS.BOLT_SLEEVE_DIAMETER).toBe(10);
    expect(G11_OP_CONSTANTS.DOWEL_DIAMETER).toBe(8);
    expect(G11_OP_CONSTANTS.DOWEL_DEPTH_EDGE).toBe(18);
    expect(G11_OP_CONSTANTS.DOWEL_DEPTH_FACE).toBe(12);
    expect(G11_OP_CONSTANTS.DIMENSION_B_STANDARD).toBe(24);
    expect(G11_OP_CONSTANTS.DIMENSION_B_ALTERNATE).toBe(34);
  });
});

// ============================================
// CAM HOUSING TESTS (G11-OP.1)
// ============================================

describe('G11-OP.1 CAM Housing Validation', () => {
  it('should PASS for valid CAM housing', () => {
    const ops = [validCamHousing()];
    const result = validateG11Operations(ops);

    expect(result.status).toBe('PASS');
    expect(result.summary.blockers).toBe(0);
  });

  it('should FAIL for wrong diameter (Ø14 instead of Ø15)', () => {
    const ops = [boreOp('cam-1', 14, 12.5, 'V', {
      panelRole: 'TOP',
      purpose: 'CAM_HOUSING',
      distanceFromMatingEdge: 24,
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_CAM_DIAMETER');
    expect(result.issues[0].message).toContain('Ø15');
  });

  it('should FAIL for wrong direction (H instead of V)', () => {
    const ops = [boreOp('cam-1', 15, 12.5, 'H', {
      panelRole: 'TOP',
      purpose: 'CAM_HOUSING',
      distanceFromMatingEdge: 24,
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_CAM_DIRECTION');
    expect(result.issues[0].message).toContain('FACE_BORE');
  });

  it('should FAIL for wrong panel (SIDE instead of TOP/BOTTOM)', () => {
    const ops = [boreOp('cam-1', 15, 12.5, 'V', {
      panelRole: 'LEFT_SIDE',
      purpose: 'CAM_HOUSING',
      distanceFromMatingEdge: 24,
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_CAM_PANEL');
    expect(result.issues[0].message).toContain('TOP/BOTTOM');
  });

  it('should FAIL for missing Dimension B', () => {
    const ops = [boreOp('cam-1', 15, 12.5, 'V', {
      panelRole: 'TOP',
      purpose: 'CAM_HOUSING',
      // No distanceFromMatingEdge
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_CAM_NO_DIM_B');
  });

  it('should WARN for incorrect Dimension B', () => {
    const ops = [boreOp('cam-1', 15, 12.5, 'V', {
      panelRole: 'TOP',
      purpose: 'CAM_HOUSING',
      distanceFromMatingEdge: 37, // Wrong - looks like measured from FRONT
    })];

    const result = validateG11Operations(ops);

    expect(result.summary.warnings).toBe(1);
    expect(result.issues[0].code).toBe('W_G11_OP_CAM_DIM_B');
  });

  it('should PASS for alternate Dimension B (34mm)', () => {
    const ops = [boreOp('cam-1', 15, 12.5, 'V', {
      panelRole: 'TOP',
      purpose: 'CAM_HOUSING',
      distanceFromMatingEdge: 34,
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('PASS');
    expect(result.summary.blockers).toBe(0);
    expect(result.summary.warnings).toBe(0);
  });

  it('should FAIL for DRILL type instead of BORE', () => {
    const ops = [drillOp('cam-1', 15, 12.5, 'V', {
      panelRole: 'TOP',
      purpose: 'CAM_HOUSING',
      distanceFromMatingEdge: 24,
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_CAM_TYPE');
    expect(result.issues[0].message).toContain('BORE');
  });
});

// ============================================
// BOLT SLEEVE TESTS (G11-OP.2)
// ============================================

describe('G11-OP.2 Bolt Sleeve Validation', () => {
  it('should PASS for valid bolt sleeve', () => {
    const ops = [validBoltSleeve()];
    const result = validateG11Operations(ops);

    expect(result.status).toBe('PASS');
    expect(result.summary.blockers).toBe(0);
  });

  it('should FAIL for wrong diameter (Ø8 instead of Ø10)', () => {
    const ops = [drillOp('bolt-1', 8, 17.5, 'H', {
      panelRole: 'LEFT_SIDE',
      purpose: 'BOLT_SLEEVE',
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_BOLT_DIAMETER');
    expect(result.issues[0].message).toContain('Ø10');
  });

  it('should FAIL for wrong direction (V instead of H)', () => {
    const ops = [drillOp('bolt-1', 10, 17.5, 'V', {
      panelRole: 'LEFT_SIDE',
      purpose: 'BOLT_SLEEVE',
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_BOLT_DIRECTION');
    expect(result.issues[0].message).toContain('EDGE_BORE');
  });

  it('should FAIL for wrong panel (TOP instead of SIDE)', () => {
    const ops = [drillOp('bolt-1', 10, 17.5, 'H', {
      panelRole: 'TOP',
      purpose: 'BOLT_SLEEVE',
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_BOLT_PANEL');
    expect(result.issues[0].message).toContain('SIDE');
  });
});

// ============================================
// DOWEL SIDE TESTS (G11-OP.3)
// ============================================

describe('G11-OP.3 Dowel Side Validation', () => {
  it('should PASS for valid dowel side', () => {
    const ops = [validDowelSide()];
    const result = validateG11Operations(ops);

    expect(result.status).toBe('PASS');
    expect(result.summary.blockers).toBe(0);
  });

  it('should FAIL for wrong diameter (Ø10 instead of Ø8)', () => {
    const ops = [drillOp('dowel-1', 10, 18, 'H', {
      panelRole: 'LEFT_SIDE',
      purpose: 'DOWEL_SIDE',
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_DOWEL_SIDE_DIA');
    expect(result.issues[0].message).toContain('Ø8');
  });

  it('should FAIL for wrong depth (30mm instead of 18mm)', () => {
    const ops = [drillOp('dowel-1', 8, 30, 'H', {
      panelRole: 'LEFT_SIDE',
      purpose: 'DOWEL_SIDE',
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_DOWEL_SIDE_DEPTH');
    expect(result.issues[0].message).toContain('18mm');
  });

  it('should FAIL for wrong direction (V instead of H)', () => {
    const ops = [drillOp('dowel-1', 8, 18, 'V', {
      panelRole: 'LEFT_SIDE',
      purpose: 'DOWEL_SIDE',
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_DOWEL_SIDE_DIR');
    expect(result.issues[0].message).toContain('EDGE_BORE');
  });

  it('should FAIL for wrong panel (TOP instead of SIDE)', () => {
    const ops = [drillOp('dowel-1', 8, 18, 'H', {
      panelRole: 'TOP',
      purpose: 'DOWEL_SIDE',
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_DOWEL_SIDE_PANEL');
    expect(result.issues[0].message).toContain('SIDE');
  });
});

// ============================================
// DOWEL HORIZONTAL TESTS (G11-OP.4)
// ============================================

describe('G11-OP.4 Dowel Horizontal Validation', () => {
  it('should PASS for valid dowel horizontal', () => {
    const ops = [validDowelHorizontal()];
    const result = validateG11Operations(ops);

    expect(result.status).toBe('PASS');
    expect(result.summary.blockers).toBe(0);
  });

  it('should FAIL for wrong diameter (Ø10 instead of Ø8)', () => {
    const ops = [drillOp('dowel-1', 10, 12, 'V', {
      panelRole: 'TOP',
      purpose: 'DOWEL_HORIZONTAL',
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_DOWEL_HORIZ_DIA');
  });

  it('should FAIL for wrong depth (18mm instead of 12mm)', () => {
    const ops = [drillOp('dowel-1', 8, 18, 'V', {
      panelRole: 'TOP',
      purpose: 'DOWEL_HORIZONTAL',
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_DOWEL_HORIZ_DEPTH');
    expect(result.issues[0].message).toContain('12mm');
  });

  it('should FAIL for wrong direction (H instead of V)', () => {
    const ops = [drillOp('dowel-1', 8, 12, 'H', {
      panelRole: 'TOP',
      purpose: 'DOWEL_HORIZONTAL',
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_DOWEL_HORIZ_DIR');
    expect(result.issues[0].message).toContain('FACE_BORE');
  });

  it('should FAIL for wrong panel (SIDE instead of TOP/BOTTOM)', () => {
    const ops = [drillOp('dowel-1', 8, 12, 'V', {
      panelRole: 'LEFT_SIDE',
      purpose: 'DOWEL_HORIZONTAL',
    })];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('B_G11_OP_DOWEL_HORIZ_PANEL');
  });
});

// ============================================
// INTEGRATED TESTS
// ============================================

describe('validateG11Operations (Integrated)', () => {
  it('should PASS for complete valid minifix assembly', () => {
    const ops = [
      validCamHousing('cam-1'),
      validBoltSleeve('bolt-1'),
      validDowelSide('dowel-side-1'),
      validDowelHorizontal('dowel-horiz-1'),
    ];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('PASS');
    expect(result.summary.blockers).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.summary.operationsValidated).toBe(4);
  });

  it('should FAIL and report multiple issues for invalid assembly', () => {
    const ops = [
      // CAM with wrong diameter
      boreOp('cam-1', 14, 12.5, 'V', {
        panelRole: 'TOP',
        purpose: 'CAM_HOUSING',
        distanceFromMatingEdge: 24,
      }),
      // Dowel with wrong depth
      drillOp('dowel-1', 8, 30, 'H', {
        panelRole: 'LEFT_SIDE',
        purpose: 'DOWEL_SIDE',
      }),
    ];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('FAIL');
    expect(result.summary.blockers).toBe(2);
    expect(result.issues.some(i => i.code === 'B_G11_OP_CAM_DIAMETER')).toBe(true);
    expect(result.issues.some(i => i.code === 'B_G11_OP_DOWEL_SIDE_DEPTH')).toBe(true);
  });

  it('should skip operations without G11 purpose', () => {
    const ops: Operation[] = [
      {
        ...baseOp('shelf-pin-1'),
        type: 'DRILL',
        diameter: 5,
        depth: 13,
        throughHole: false,
        // No g11Meta
      } as DrillOperation,
    ];

    const result = validateG11Operations(ops);

    expect(result.status).toBe('PASS');
    expect(result.summary.blockers).toBe(0);
  });
});

// ============================================
// OPERATION GRAPH TESTS
// ============================================

describe('validateG11OperationGraph', () => {
  it('should validate entire OperationGraph', () => {
    const graph: OperationGraph = {
      machineId: 'machine-1',
      safeZ: 10,
      rapidZ: 50,
      operations: [
        validCamHousing('cam-1'),
        validBoltSleeve('bolt-1'),
        validDowelSide('dowel-1'),
        validDowelHorizontal('dowel-2'),
      ],
      metadata: {
        jobId: 'job-1',
        sourceContentHash: 'abc123',
        builtAt: '2026-02-04T00:00:00Z',
        toolVersion: '1.0.0',
      },
      toolsUsed: ['tool-1'],
    };

    const result = validateG11OperationGraph(graph);

    expect(result.gate).toBe('G11_OPERATION_GRAPH');
    expect(result.status).toBe('PASS');
  });
});
