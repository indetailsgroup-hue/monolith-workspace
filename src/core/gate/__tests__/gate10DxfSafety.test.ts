/**
 * G10 DXF Safety Gate Tests
 *
 * NORTH STAR: "No unsafe DXF leaves the system"
 *
 * These tests verify the G10 boundary correctly validates DXF provenance
 * and blocks unsafe DXF from bypassing OperationGraph.
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  assertDxfSafety,
  guardFactoryDxf,
  createOperationGraphProvenance,
  createCabinetProvenance,
  createNestingProvenance,
  createUnknownProvenance,
  hasCncOperations,
  isSafeDxf,
  isOperationGraphProvenance,
  isG10Error,
  G10Error,
  G10_ERROR_CODES,
  type DxfProvenance,
  type DxfProvenanceOperationGraph,
  type SafeDxf,
} from '../gate10DxfSafety';

// ============================================
// TEST FIXTURES
// ============================================

const VALID_DXF_CONTENT = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
0
ENDSEC
0
SECTION
2
ENTITIES
0
CIRCLE
8
DRILL_5_D10
10
100.0000
20
50.0000
30
0.0
40
2.5000
0
ENDSEC
0
EOF
`;

const MINIMAL_DXF_CONTENT = `0
SECTION
2
ENTITIES
0
ENDSEC
0
EOF
`;

const INVALID_DXF_CONTENT = 'This is not valid DXF content';

const EMPTY_DXF_CONTENT = '';

// Mock FactoryPacket
const mockPacket = {
  manifest: {
    jobId: 'packet-001',
    projectId: 'project-001',
    schema: 'monolith.factory.packet@1.0',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    toolVersion: '1.0.0',
    files: [],
    contentHash: '',
  },
  cabinetId: 'cabinet-001',
  drillMap: { panels: [] },
} as any;

// Mock OperationGraph
const mockGraph = {
  machineId: 'KDT-6000',
  operations: [{ type: 'DRILL' }, { type: 'BORE' }],
  toolsUsed: ['D5', 'D8'],
  metadata: { panelId: 'panel-001' },
} as any;

// ============================================
// PROVENANCE CREATION TESTS
// ============================================

describe('Provenance Builders', () => {
  it('should create OperationGraph provenance', () => {
    const provenance = createOperationGraphProvenance(mockPacket, mockGraph, 'panel-001');

    expect(provenance.source).toBe('OPERATION_GRAPH');
    expect(provenance.packetId).toBe('packet-001');
    expect(provenance.machineId).toBe('KDT-6000');
    expect(provenance.panelId).toBe('panel-001');
    expect(provenance.operationCount).toBe(2);
    expect(provenance.timestamp).toBeDefined();
  });

  it('should create Cabinet provenance', () => {
    const provenance = createCabinetProvenance('cabinet-001', 'panel-001');

    expect(provenance.source).toBe('CABINET_GEOMETRY');
    expect(provenance.cabinetId).toBe('cabinet-001');
    expect(provenance.panelId).toBe('panel-001');
  });

  it('should create Nesting provenance', () => {
    const provenance = createNestingProvenance(1);

    expect(provenance.source).toBe('NESTING_LAYOUT');
    expect(provenance.sheetIndex).toBe(1);
  });

  it('should create Unknown provenance', () => {
    const provenance = createUnknownProvenance();

    expect(provenance.source).toBe('UNKNOWN');
  });
});

// ============================================
// assertDxfSafety TESTS
// ============================================

describe('assertDxfSafety', () => {
  describe('Valid OperationGraph Source', () => {
    it('should PASS DXF from OperationGraph with valid provenance', () => {
      const provenance = createOperationGraphProvenance(mockPacket, mockGraph, 'panel-001');
      const result = assertDxfSafety(VALID_DXF_CONTENT, provenance);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.dxf).toBe(VALID_DXF_CONTENT);
        expect(result.warnings).toHaveLength(0);
      }
    });

    it('should PASS minimal valid DXF format', () => {
      const provenance = createOperationGraphProvenance(mockPacket, mockGraph, 'panel-001');
      const result = assertDxfSafety(MINIMAL_DXF_CONTENT, provenance);

      expect(result.ok).toBe(true);
    });
  });

  describe('Invalid Sources', () => {
    it('should BLOCK DXF from Cabinet geometry', () => {
      const provenance = createCabinetProvenance('cabinet-001', 'panel-001');
      const result = assertDxfSafety(VALID_DXF_CONTENT, provenance);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues[0].code).toBe(G10_ERROR_CODES.INVALID_SOURCE);
        expect(result.issues[0].severity).toBe('BLOCK');
      }
    });

    it('should BLOCK DXF from Unknown source', () => {
      const provenance = createUnknownProvenance();
      const result = assertDxfSafety(VALID_DXF_CONTENT, provenance);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0].code).toBe(G10_ERROR_CODES.MISSING_PROVENANCE);
      }
    });

    it('should BLOCK DXF from Nesting by default', () => {
      const provenance = createNestingProvenance(1);
      const result = assertDxfSafety(VALID_DXF_CONTENT, provenance);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0].code).toBe(G10_ERROR_CODES.INVALID_SOURCE);
      }
    });

    it('should ALLOW Nesting DXF when allowNesting option is true', () => {
      const provenance = createNestingProvenance(1);
      const result = assertDxfSafety(VALID_DXF_CONTENT, provenance, { allowNesting: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should have a warning
        expect(result.warnings.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Content Validation', () => {
    it('should BLOCK empty DXF content', () => {
      const provenance = createOperationGraphProvenance(mockPacket, mockGraph, 'panel-001');
      const result = assertDxfSafety(EMPTY_DXF_CONTENT, provenance);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0].code).toBe(G10_ERROR_CODES.INVALID_CONTENT);
      }
    });

    it('should BLOCK invalid DXF format', () => {
      const provenance = createOperationGraphProvenance(mockPacket, mockGraph, 'panel-001');
      const result = assertDxfSafety(INVALID_DXF_CONTENT, provenance);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0].code).toBe(G10_ERROR_CODES.INVALID_CONTENT);
      }
    });
  });

  describe('Provenance Validation', () => {
    it('should BLOCK missing provenance', () => {
      const result = assertDxfSafety(VALID_DXF_CONTENT, null as any);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0].code).toBe(G10_ERROR_CODES.MISSING_PROVENANCE);
      }
    });

    it('should BLOCK incomplete OperationGraph provenance in strict mode', () => {
      const incompleteProvenance: DxfProvenanceOperationGraph = {
        source: 'OPERATION_GRAPH',
        packetId: '', // Empty - invalid
        machineId: 'KDT-6000',
        panelId: 'panel-001',
        operationCount: 2,
        timestamp: Date.now(),
      };

      const result = assertDxfSafety(VALID_DXF_CONTENT, incompleteProvenance, { strictMode: true });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0].code).toBe(G10_ERROR_CODES.MISSING_PROVENANCE);
      }
    });

    it('should WARN on zero operations but allow', () => {
      const zeroOpsProvenance: DxfProvenanceOperationGraph = {
        source: 'OPERATION_GRAPH',
        packetId: 'packet-001',
        machineId: 'KDT-6000',
        panelId: 'panel-001',
        operationCount: 0, // Zero operations
        timestamp: Date.now(),
      };

      const result = assertDxfSafety(VALID_DXF_CONTENT, zeroOpsProvenance);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0].code).toBe(G10_ERROR_CODES.INVALID_CONTENT);
        expect(result.warnings[0].severity).toBe('WARN');
      }
    });
  });
});

// ============================================
// guardFactoryDxf TESTS
// ============================================

describe('guardFactoryDxf', () => {
  it('should return SafeDxf for valid OperationGraph DXF', () => {
    const provenance = createOperationGraphProvenance(mockPacket, mockGraph, 'panel-001');
    const safeDxf = guardFactoryDxf(VALID_DXF_CONTENT, provenance, 'FACTORY');

    expect(safeDxf).toBe(VALID_DXF_CONTENT);
  });

  it('should throw G10Error in FACTORY mode for Cabinet DXF', () => {
    const provenance = createCabinetProvenance('cabinet-001', 'panel-001');

    expect(() => {
      guardFactoryDxf(VALID_DXF_CONTENT, provenance, 'FACTORY');
    }).toThrow(G10Error);
  });

  it('should NOT throw in DESIGNER mode for Cabinet DXF (allows preview)', () => {
    const provenance = createCabinetProvenance('cabinet-001', 'panel-001');

    // Should not throw - just warn
    const result = guardFactoryDxf(VALID_DXF_CONTENT, provenance, 'DESIGNER');
    expect(result).toBe(VALID_DXF_CONTENT);
  });

  it('should throw G10Error with correct structure', () => {
    const provenance = createCabinetProvenance('cabinet-001', 'panel-001');

    try {
      guardFactoryDxf(VALID_DXF_CONTENT, provenance, 'FACTORY');
      expect.fail('Should have thrown G10Error');
    } catch (error) {
      expect(isG10Error(error)).toBe(true);
      if (isG10Error(error)) {
        expect(error.gateId).toBe('G10');
        expect(error.issues.length).toBeGreaterThan(0);
        expect(error.issues[0].code).toBe(G10_ERROR_CODES.INVALID_SOURCE);
      }
    }
  });
});

// ============================================
// HELPER FUNCTION TESTS
// ============================================

describe('hasCncOperations', () => {
  it('should detect CNC layers in DXF', () => {
    expect(hasCncOperations(VALID_DXF_CONTENT)).toBe(true);
  });

  it('should return false for DXF without CNC layers', () => {
    expect(hasCncOperations(MINIMAL_DXF_CONTENT)).toBe(false);
  });

  it('should detect various CNC layer patterns', () => {
    const patterns = [
      'DRILL_5_D10',
      'BORE_15D12',
      'POCKET_D8',
      'PROFILE_LEFT',
      'SLOT_6D10',
      'DRILL_V_5_D8',
      'DRILL_H_8_Z10_D20',
      'SAW_GROOVE_D8',
      'HINGE_CUP_35',
    ];

    for (const pattern of patterns) {
      const dxf = `0\nSECTION\n2\nENTITIES\n8\n${pattern}\n0\nENDSEC\n0\nEOF`;
      expect(hasCncOperations(dxf)).toBe(true);
    }
  });
});

describe('isSafeDxf', () => {
  it('should return true for valid string', () => {
    expect(isSafeDxf(VALID_DXF_CONTENT)).toBe(true);
  });

  it('should return false for empty string', () => {
    expect(isSafeDxf('')).toBe(false);
  });
});

describe('isOperationGraphProvenance', () => {
  it('should return true for OperationGraph provenance', () => {
    const provenance = createOperationGraphProvenance(mockPacket, mockGraph, 'panel-001');
    expect(isOperationGraphProvenance(provenance)).toBe(true);
  });

  it('should return false for other provenances', () => {
    expect(isOperationGraphProvenance(createCabinetProvenance('a', 'b'))).toBe(false);
    expect(isOperationGraphProvenance(createNestingProvenance(1))).toBe(false);
    expect(isOperationGraphProvenance(createUnknownProvenance())).toBe(false);
  });
});

// ============================================
// CI GATE ASSERTIONS
// ============================================

describe('CI Gate Assertions', () => {
  it('[G10-CI] should PASS well-formed OperationGraph DXF', () => {
    const provenance = createOperationGraphProvenance(mockPacket, mockGraph, 'panel-001');
    const result = assertDxfSafety(VALID_DXF_CONTENT, provenance);
    expect(result.ok).toBe(true);
  });

  it('[G10-CI] should BLOCK Cabinet geometry bypass attempt', () => {
    const provenance = createCabinetProvenance('cabinet-001', 'panel-001');
    const result = assertDxfSafety(VALID_DXF_CONTENT, provenance);
    expect(result.ok).toBe(false);
  });

  it('[G10-CI] should BLOCK unknown source DXF', () => {
    const provenance = createUnknownProvenance();
    const result = assertDxfSafety(VALID_DXF_CONTENT, provenance);
    expect(result.ok).toBe(false);
  });

  it('[G10-CI] should enforce provenance in FACTORY mode', () => {
    const cabinetProvenance = createCabinetProvenance('cabinet-001', 'panel-001');

    // FACTORY mode MUST throw
    expect(() => {
      guardFactoryDxf(VALID_DXF_CONTENT, cabinetProvenance, 'FACTORY');
    }).toThrow(G10Error);

    // OperationGraph provenance MUST pass
    const opGraphProvenance = createOperationGraphProvenance(mockPacket, mockGraph, 'panel-001');
    expect(() => {
      guardFactoryDxf(VALID_DXF_CONTENT, opGraphProvenance, 'FACTORY');
    }).not.toThrow();
  });

  it('[G10-CI] should validate all error codes are unique', () => {
    const codes = Object.values(G10_ERROR_CODES);
    const uniqueCodes = new Set(codes);
    expect(codes.length).toBe(uniqueCodes.size);
  });

  it('[G10-CI] should ensure G10Error is instanceof Error', () => {
    const error = new G10Error('Test', []);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('G10Error');
    expect(error.gateId).toBe('G10');
  });
});

// ============================================
// INTEGRATION TESTS
// ============================================

describe('Integration', () => {
  it('should support full export flow', () => {
    // Simulate export flow: Packet → Graph → DXF → G10 → SafeDxf
    const packet = mockPacket;
    const graph = mockGraph;
    const panelId = 'panel-001';

    // Step 1: Generate DXF (simulated)
    const dxfContent = VALID_DXF_CONTENT;

    // Step 2: Create provenance
    const provenance = createOperationGraphProvenance(packet, graph, panelId);

    // Step 3: Validate through G10
    const result = assertDxfSafety(dxfContent, provenance);

    // Step 4: Use SafeDxf
    expect(result.ok).toBe(true);
    if (result.ok) {
      // SafeDxf is now ready for factory use
      const safeDxf: SafeDxf = result.dxf;
      expect(safeDxf).toBeTruthy();
    }
  });

  it('should block unsafe Cabinet → DXF flow', () => {
    // Simulate unsafe flow: Cabinet → DXF (bypassing OperationGraph)
    const cabinetId = 'cabinet-001';
    const panelId = 'panel-001';

    // Step 1: Generate DXF from cabinet (unsafe)
    const dxfContent = VALID_DXF_CONTENT;

    // Step 2: Create provenance (Cabinet source)
    const provenance = createCabinetProvenance(cabinetId, panelId);

    // Step 3: G10 MUST block this
    const result = assertDxfSafety(dxfContent, provenance);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].severity).toBe('BLOCK');
    }
  });
});
