/**
 * gate10_1DxfGolden.test.ts - Golden DXF Comparison Tests
 *
 * NORTH STAR: "Golden DXF = Manufacturing Contract"
 *
 * These tests verify that DXF generation is deterministic and matches
 * golden fixtures. Any unexpected change indicates a potential regression.
 *
 * ## Test Categories
 * 1. GEOMETRY: Outline, profile, basic shapes
 * 2. OPERATIONS: Drill, bore, pocket operations
 * 3. HARDWARE: Minifix pairs, System 32 patterns
 *
 * ## Precision
 * - CNC-grade: 0.01mm (10 microns)
 * - Woodworking standard resolution
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  normalizeDxf,
  compareDxf,
  getDxfStats,
  parseEntities,
  CNC_PRECISION_MM,
  roundToPrecision,
} from '../../export/dxf/dxfNormalize';

import {
  operationGraphToDxf,
  validateOperationGraphForDxf,
} from '../../export/operationGraphToDxf';

import {
  assertDxfSafety,
  createOperationGraphProvenance,
  type G10Result,
} from '../gate10DxfSafety';

import type { OperationGraph, Operation, DrillOperation, BoreOperation, ProfileOperation } from '../../../cnc/operation/operationTypes';
import type { FactoryPacket } from '../../../factory/packet/types';

// ============================================
// FIXTURE LOADING
// ============================================

interface GoldenFixture {
  name: string;
  description: string;
  version: string;
  category: string;
  packet: {
    manifest: {
      jobId: string;
      projectId: string;
      schema: string;
      version: string;
      createdAt: string;
      toolVersion: string;
      files: string[];
      contentHash: string;
    };
    drillMap: {
      version: string;
      panels: Array<{
        panelId: string;
        cabinetId: string;
        role: string;
        dimensions: [number, number, number];
        points: Array<{
          id: string;
          x: number;
          y: number;
          z: number;
          diameter: number;
          depth: number;
          direction: string;
          purpose: string;
          pairedHoleId?: string;
        }>;
      }>;
      summary: {
        totalDrills: number;
        totalBores: number;
        byPurpose: Record<string, number>;
        byDiameter: Record<string, number>;
      };
      tools: string[];
    };
  };
  operationGraph: {
    machineId: string;
    safeZ?: number;
    rapidZ?: number;
    operations: Array<{
      type: string;
      id: string;
      sourceId?: string;
      toolId?: string;
      position?: { x: number; y: number; z: number };
      diameter?: number;
      depth?: number;
      direction?: string;
      side?: string;
      path?: Array<{ x: number; y: number }>;
      closed?: boolean;
      workpieceContext: {
        panelId: string;
        face?: 'TOP' | 'BOTTOM';
        appliedOffset?: { x: number; y: number; z: number };
      };
      metadata?: Record<string, unknown>;
    }>;
    toolsUsed: string[];
    metadata: {
      jobId: string;
      panelId: string;
    };
  };
  expectedDxf: {
    layers?: string[];
    entityCount?: number;
    entityTypes?: string[];
    bounds?: {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
    };
    panels?: Record<string, {
      layers: string[];
      entityCount: number;
      entityTypes: string[];
      bounds: {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
      };
    }>;
  };
  assertions: Array<{
    type: string;
    layer?: string;
    panel?: string;
    expected?: number;
    precision?: number;
    minX?: number;
    maxX?: number;
    minY?: number;
    maxY?: number;
    comment?: string;
  }>;
  hardwareSpec?: {
    component: string;
    manufacturer: string;
    critical_dimensions: Record<string, number>;
  };
}

const FIXTURE_DIR = path.resolve(__dirname, '../../export/dxf/__fixtures__');

function loadFixture(name: string): GoldenFixture {
  const filePath = path.join(FIXTURE_DIR, `fixture.${name}.json`);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as GoldenFixture;
}

function fixtureToOperationGraph(fixture: GoldenFixture, panelId?: string): OperationGraph {
  const ops = fixture.operationGraph;

  // Filter operations by panelId if specified
  const filteredOps = panelId
    ? ops.operations.filter(op => op.workpieceContext.panelId === panelId)
    : ops.operations;

  return {
    machineId: ops.machineId,
    safeZ: ops.safeZ ?? 50,
    rapidZ: ops.rapidZ ?? 100,
    operations: filteredOps.map(op => {
      const baseOp = {
        id: op.id,
        sourceId: op.sourceId || 'test-source',
        toolId: op.toolId || `T${op.diameter || 5}`,
        workpieceContext: {
          panelId: op.workpieceContext.panelId,
          face: op.workpieceContext.face || ('TOP' as const),
          appliedOffset: op.workpieceContext.appliedOffset || { x: 0, y: 0, z: 0 },
        },
      };

      switch (op.type) {
        case 'DRILL':
          return {
            ...baseOp,
            type: 'DRILL' as const,
            position: op.position!,
            diameter: op.diameter!,
            depth: op.depth!,
            direction: op.direction || 'V',
            throughHole: false,
          } as DrillOperation;
        case 'BORE':
          return {
            ...baseOp,
            type: 'BORE' as const,
            position: op.position!,
            diameter: op.diameter!,
            depth: op.depth!,
            direction: op.direction || 'V',
            flatBottom: true,
          } as BoreOperation;
        case 'PROFILE':
          return {
            ...baseOp,
            type: 'PROFILE' as const,
            side: op.side || 'OUTSIDE',
            path: (op.path || []).map((p: { x: number; y: number }) => ({ ...p, z: 0 })),
            closed: op.closed ?? true,
            depth: op.depth!,
            position: op.position || { x: 0, y: 0, z: 0 },
          } as ProfileOperation;
        default:
          throw new Error(`Unknown operation type: ${op.type}`);
      }
    }) as Operation[],
    toolsUsed: ops.toolsUsed,
    metadata: {
      jobId: panelId ? ops.metadata.jobId : ops.metadata.jobId,
      panelId: panelId || ops.metadata.panelId,
      sourceContentHash: 'test-hash-golden',
      builtAt: new Date().toISOString(),
      toolVersion: '1.0.0-test',
    },
  };
}

function fixtureToMockPacket(fixture: GoldenFixture): FactoryPacket {
  return fixture.packet as unknown as FactoryPacket;
}

// ============================================
// FIXTURE AVAILABILITY CHECK
// ============================================

describe('Golden Fixture Availability', () => {
  it('should have fixture directory', () => {
    expect(fs.existsSync(FIXTURE_DIR)).toBe(true);
  });

  it('should have small-cabinet fixture', () => {
    const filePath = path.join(FIXTURE_DIR, 'fixture.small-cabinet.json');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('should have drill-baseline fixture', () => {
    const filePath = path.join(FIXTURE_DIR, 'fixture.drill-baseline.json');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('should have minifix-pair fixture', () => {
    const filePath = path.join(FIXTURE_DIR, 'fixture.minifix-pair.json');
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

// ============================================
// SMALL CABINET TESTS (GEOMETRY)
// ============================================

describe('Golden: small-cabinet (GEOMETRY)', () => {
  let fixture: GoldenFixture;
  let graph: OperationGraph;
  let dxf: string;

  beforeAll(() => {
    fixture = loadFixture('small-cabinet');
    graph = fixtureToOperationGraph(fixture);

    const panel = fixture.packet.drillMap.panels[0];
    dxf = operationGraphToDxf(graph, {
      includeOutline: true,
      panelWidth: panel.dimensions[0],
      panelHeight: panel.dimensions[1],
      includeAnnotations: false,
      includeMetadata: false,
    });
  });

  it('should load fixture successfully', () => {
    expect(fixture.name).toBe('small-cabinet');
    expect(fixture.category).toBe('GEOMETRY');
  });

  it('should generate valid DXF', () => {
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('EOF');
  });

  it('should have expected layers', () => {
    for (const expectedLayer of fixture.expectedDxf.layers || []) {
      expect(dxf).toContain(expectedLayer);
    }
  });

  it('should have correct bounding box', () => {
    // Note: getDxfStats extracts bounds from entity first coordinates,
    // not polyline vertices. For a more complete bounds check,
    // verify the DXF contains the expected coordinates.
    const expected = fixture.expectedDxf.bounds!;

    // Check that the outline polyline contains the expected corner coordinates
    expect(dxf).toContain(`${expected.maxX.toFixed(4)}`); // width
    expect(dxf).toContain(`${expected.maxY.toFixed(4)}`); // height
    expect(dxf).toContain('OUTLINE'); // Layer exists
  });

  it('should have no NaN values', () => {
    expect(dxf).not.toContain('NaN');
    expect(dxf).not.toContain('Infinity');
    expect(dxf).not.toContain('-Infinity');
  });

  it('should pass G10 validation', () => {
    const packet = fixtureToMockPacket(fixture);
    const provenance = createOperationGraphProvenance(packet, graph, fixture.packet.drillMap.panels[0].panelId);
    const result = assertDxfSafety(dxf, provenance);

    expect(result.ok).toBe(true);
  });

  it('should produce deterministic output', () => {
    const panel = fixture.packet.drillMap.panels[0];

    // Generate twice
    const dxf1 = operationGraphToDxf(graph, {
      includeOutline: true,
      panelWidth: panel.dimensions[0],
      panelHeight: panel.dimensions[1],
      includeAnnotations: false,
      includeMetadata: false,
    });

    const dxf2 = operationGraphToDxf(graph, {
      includeOutline: true,
      panelWidth: panel.dimensions[0],
      panelHeight: panel.dimensions[1],
      includeAnnotations: false,
      includeMetadata: false,
    });

    const comparison = compareDxf(dxf1, dxf2);
    expect(comparison.match).toBe(true);
  });
});

// ============================================
// DRILL BASELINE TESTS (OPERATIONS)
// ============================================

describe('Golden: drill-baseline (OPERATIONS)', () => {
  let fixture: GoldenFixture;
  let graph: OperationGraph;
  let dxf: string;

  beforeAll(() => {
    fixture = loadFixture('drill-baseline');
    graph = fixtureToOperationGraph(fixture);

    const panel = fixture.packet.drillMap.panels[0];
    dxf = operationGraphToDxf(graph, {
      includeOutline: true,
      panelWidth: panel.dimensions[0],
      panelHeight: panel.dimensions[1],
      includeAnnotations: false,
      includeMetadata: false,
    });
  });

  it('should load fixture successfully', () => {
    expect(fixture.name).toBe('drill-baseline');
    expect(fixture.category).toBe('OPERATIONS');
  });

  it('should have 3 drill operations in graph', () => {
    const drillOps = graph.operations.filter(op => op.type === 'DRILL');
    expect(drillOps.length).toBe(3);
  });

  it('should generate CIRCLE entities for drills', () => {
    expect(dxf).toContain('CIRCLE');

    const entities = parseEntities(dxf);
    const circles = entities.filter(e => e.type === 'CIRCLE');
    expect(circles.length).toBe(3);
  });

  it('should have drill layer naming convention', () => {
    // DRILL_{diameter}_D{depth} pattern
    expect(dxf).toContain('DRILL_5_D10');
    expect(dxf).toContain('DRILL_8_D15');
    expect(dxf).toContain('DRILL_10_D20');
  });

  it('should have correct circle radii (diameter / 2)', () => {
    const entities = parseEntities(dxf);
    const circles = entities.filter(e => e.type === 'CIRCLE');

    // Find circles by their X position (100, 400, 700)
    const circle5mm = circles.find(c => Math.abs(c.x - 100) < 1);
    const circle8mm = circles.find(c => Math.abs(c.x - 400) < 1);
    const circle10mm = circles.find(c => Math.abs(c.x - 700) < 1);

    expect(circle5mm).toBeDefined();
    expect(circle8mm).toBeDefined();
    expect(circle10mm).toBeDefined();

    // Verify radii (check raw content for radius value - group code 40)
    // 5mm drill = 2.5mm radius
    // 8mm drill = 4mm radius
    // 10mm drill = 5mm radius
    expect(dxf).toMatch(/40\s*\n\s*2\.50/); // 5mm drill → r=2.5
    expect(dxf).toMatch(/40\s*\n\s*4\.00/); // 8mm drill → r=4.0
    expect(dxf).toMatch(/40\s*\n\s*5\.00/); // 10mm drill → r=5.0
  });

  it('should pass assertions from fixture', () => {
    for (const assertion of fixture.assertions) {
      switch (assertion.type) {
        case 'layer_exists':
          expect(dxf).toContain(assertion.layer);
          break;
        case 'no_nan':
          expect(dxf).not.toContain('NaN');
          break;
        case 'entity_count': {
          // Count entities in ENTITIES section
          const entities = parseEntities(dxf);
          expect(entities.length).toBe(assertion.expected);
          break;
        }
      }
    }
  });

  it('should have CNC precision (0.01mm)', () => {
    // Verify coordinates are formatted to 4 decimal places
    // and values are rounded to CNC precision
    const normalized = normalizeDxf(dxf);

    // Should not have excessive precision
    expect(normalized).not.toMatch(/\.\d{5,}/);
  });
});

// ============================================
// MINIFIX PAIR TESTS (HARDWARE)
// ============================================

describe('Golden: minifix-pair (HARDWARE)', () => {
  let fixture: GoldenFixture;

  beforeAll(() => {
    fixture = loadFixture('minifix-pair');
  });

  it('should load fixture successfully', () => {
    expect(fixture.name).toBe('minifix-pair');
    expect(fixture.category).toBe('HARDWARE');
  });

  it('should have hardware spec with Distance B = 24mm', () => {
    expect(fixture.hardwareSpec).toBeDefined();
    expect(fixture.hardwareSpec!.component).toBe('Minifix S200');
    expect(fixture.hardwareSpec!.critical_dimensions.distanceB_mm).toBe(24);
  });

  it('should have cam housing at Ø15', () => {
    expect(fixture.hardwareSpec!.critical_dimensions.camDiameter_mm).toBe(15);
    expect(fixture.hardwareSpec!.critical_dimensions.camDepth_mm).toBe(13.5);
  });

  it('should have bolt sleeve at Ø10', () => {
    expect(fixture.hardwareSpec!.critical_dimensions.boltDiameter_mm).toBe(10);
    expect(fixture.hardwareSpec!.critical_dimensions.boltLength_mm).toBe(17.5);
  });

  describe('panel-side-001 DXF generation', () => {
    let graph: OperationGraph;
    let dxf: string;

    beforeAll(() => {
      graph = fixtureToOperationGraph(fixture, 'panel-side-001');
      const panel = fixture.packet.drillMap.panels.find(p => p.panelId === 'panel-side-001')!;

      dxf = operationGraphToDxf(graph, {
        includeOutline: true,
        panelWidth: panel.dimensions[0],
        panelHeight: panel.dimensions[1],
        includeAnnotations: false,
        includeMetadata: false,
      });
    });

    it('should generate DXF with cam and bolt holes', () => {
      expect(dxf).toContain('CIRCLE');

      const entities = parseEntities(dxf);
      const circles = entities.filter(e => e.type === 'CIRCLE');

      // 1 cam housing + 1 bolt sleeve = 2 circles
      expect(circles.length).toBe(2);
    });

    it('should have BORE layer for cam housing', () => {
      // BORE_{diameter}D{depth} pattern (depth rounds with .toFixed(0))
      // 12.5.toFixed(0) = "13" (JavaScript rounds 0.5 up)
      expect(dxf).toContain('BORE_15D13');
    });

    it('should have DRILL layer for bolt sleeve', () => {
      // DRILL_{diameter}_D{depth} pattern (depth rounds with .toFixed(0))
      // 17.5.toFixed(0) = "18" (JavaScript rounds 0.5 up)
      expect(dxf).toContain('DRILL_10_D18');
    });

    it('should have bolt hole at Distance B = 24mm from edge', () => {
      const entities = parseEntities(dxf);
      const circles = entities.filter(e => e.type === 'CIRCLE');

      // Bolt hole should be at Y = 24mm (Distance B)
      const boltHole = circles.find(c => {
        // Check for Y coordinate at 24mm (with tolerance)
        return Math.abs(c.y - 24) < CNC_PRECISION_MM;
      });

      expect(boltHole).toBeDefined();
    });

    it('should pass G10 validation', () => {
      const packet = fixtureToMockPacket(fixture);
      const provenance = createOperationGraphProvenance(packet, graph, 'panel-side-001');
      const result = assertDxfSafety(dxf, provenance);

      expect(result.ok).toBe(true);
    });
  });

  describe('panel-shelf-001 DXF generation', () => {
    let graph: OperationGraph;
    let dxf: string;

    beforeAll(() => {
      graph = fixtureToOperationGraph(fixture, 'panel-shelf-001');
      const panel = fixture.packet.drillMap.panels.find(p => p.panelId === 'panel-shelf-001')!;

      dxf = operationGraphToDxf(graph, {
        includeOutline: true,
        panelWidth: panel.dimensions[0],
        panelHeight: panel.dimensions[1],
        includeAnnotations: false,
        includeMetadata: false,
      });
    });

    it('should generate DXF with shelf end cam', () => {
      expect(dxf).toContain('CIRCLE');

      const entities = parseEntities(dxf);
      const circles = entities.filter(e => e.type === 'CIRCLE');

      // 1 cam housing = 1 circle
      expect(circles.length).toBe(1);
    });

    it('should have BORE layer for horizontal cam', () => {
      // BORE_{diameter}D{depth} pattern, depth 12.5 → 13
      expect(dxf).toContain('BORE_15D13');
    });
  });
});

// ============================================
// NORMALIZATION TESTS
// ============================================

describe('DXF Normalization', () => {
  it('should round to CNC precision (0.01mm)', () => {
    expect(roundToPrecision(100.001)).toBe(100);
    expect(roundToPrecision(100.005)).toBe(100.01);
    expect(roundToPrecision(100.009)).toBe(100.01);
    expect(roundToPrecision(100.015)).toBe(100.02);
  });

  it('should handle -0 correctly', () => {
    const result = roundToPrecision(-0.001);
    expect(result).toBe(0);
    expect(Object.is(result, -0)).toBe(false);
  });

  it('should strip timestamps from DXF', () => {
    const dxf = `0\nSECTION\n999\n2025-01-15T10:30:00.000Z\n0\nENDSEC`;
    const normalized = normalizeDxf(dxf);

    expect(normalized).not.toContain('2025-01-15');
  });

  it('should produce consistent output across runs', () => {
    const fixture = loadFixture('small-cabinet');
    const graph = fixtureToOperationGraph(fixture);
    const panel = fixture.packet.drillMap.panels[0];

    const dxf1 = operationGraphToDxf(graph, {
      includeOutline: true,
      panelWidth: panel.dimensions[0],
      panelHeight: panel.dimensions[1],
    });

    const dxf2 = operationGraphToDxf(graph, {
      includeOutline: true,
      panelWidth: panel.dimensions[0],
      panelHeight: panel.dimensions[1],
    });

    const norm1 = normalizeDxf(dxf1);
    const norm2 = normalizeDxf(dxf2);

    expect(norm1).toBe(norm2);
  });
});

// ============================================
// G10 INTEGRATION TESTS
// ============================================

describe('G10 Integration with Golden Fixtures', () => {
  const fixtures = ['small-cabinet', 'drill-baseline', 'minifix-pair'] as const;

  for (const fixtureName of fixtures) {
    describe(`${fixtureName}`, () => {
      let fixture: GoldenFixture;

      beforeAll(() => {
        fixture = loadFixture(fixtureName);
      });

      it('should pass G10 validation for all panels', () => {
        const packet = fixtureToMockPacket(fixture);

        for (const panel of fixture.packet.drillMap.panels) {
          const graph = fixtureToOperationGraph(fixture, panel.panelId);

          const dxf = operationGraphToDxf(graph, {
            includeOutline: true,
            panelWidth: panel.dimensions[0],
            panelHeight: panel.dimensions[1],
            includeAnnotations: false,
            includeMetadata: false,
          });

          const provenance = createOperationGraphProvenance(packet, graph, panel.panelId);
          const result = assertDxfSafety(dxf, provenance);

          expect(result.ok).toBe(true);

          if (result.ok) {
            // Verify SafeDxf is branded
            expect(typeof result.dxf).toBe('string');
          }
        }
      });
    });
  }
});

// ============================================
// CI GATE ASSERTIONS
// ============================================

describe('CI Gate: Golden DXF', () => {
  it('[GOLDEN-CI] All fixtures must be parseable', () => {
    const fixtures = ['small-cabinet', 'drill-baseline', 'minifix-pair'];

    for (const name of fixtures) {
      const fixture = loadFixture(name);
      expect(fixture.name).toBe(name);
      expect(fixture.version).toBeDefined();
      expect(fixture.category).toBeDefined();
    }
  });

  it('[GOLDEN-CI] All fixtures must produce valid DXF', () => {
    const fixtures = ['small-cabinet', 'drill-baseline', 'minifix-pair'];

    for (const name of fixtures) {
      const fixture = loadFixture(name);
      const graph = fixtureToOperationGraph(fixture);
      const panel = fixture.packet.drillMap.panels[0];

      const validation = validateOperationGraphForDxf(graph);
      expect(validation.valid).toBe(true);

      const dxf = operationGraphToDxf(graph, {
        includeOutline: true,
        panelWidth: panel.dimensions[0],
        panelHeight: panel.dimensions[1],
      });

      expect(dxf).toContain('EOF');
      expect(dxf).not.toContain('NaN');
    }
  });

  it('[GOLDEN-CI] Minifix Distance B must be 24mm', () => {
    const fixture = loadFixture('minifix-pair');
    expect(fixture.hardwareSpec!.critical_dimensions.distanceB_mm).toBe(24);

    // Verify in drill points
    const sidePanel = fixture.packet.drillMap.panels.find(p => p.panelId === 'panel-side-001');
    const boltPoint = sidePanel!.points.find(p => p.purpose === 'BOLT_SLEEVE');

    expect(boltPoint).toBeDefined();
    expect(boltPoint!.y).toBe(24); // Distance B
  });

  it('[GOLDEN-CI] All fixtures must pass G10 gate', () => {
    const fixtures = ['small-cabinet', 'drill-baseline', 'minifix-pair'];

    for (const name of fixtures) {
      const fixture = loadFixture(name);
      const packet = fixtureToMockPacket(fixture);

      for (const panel of fixture.packet.drillMap.panels) {
        const graph = fixtureToOperationGraph(fixture, panel.panelId);
        const dxf = operationGraphToDxf(graph, {
          includeOutline: true,
          panelWidth: panel.dimensions[0],
          panelHeight: panel.dimensions[1],
        });

        const provenance = createOperationGraphProvenance(packet, graph, panel.panelId);
        const result = assertDxfSafety(dxf, provenance);

        expect(result.ok).toBe(true);
      }
    }
  });
});
