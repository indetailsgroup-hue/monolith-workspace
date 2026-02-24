/**
 * dxfR12Writer.test.ts - Unit tests for DXF R12 Writer
 *
 * Tests deterministic DXF R12 generation from FlatPart data.
 *
 * @version 0.14.3
 */

import { describe, it, expect } from 'vitest';
import {
  flatPartToDxfR12,
  exportFlatPartToDxf,
  exportFlatPartsToDxf,
  DEFAULT_DXF_CONFIG,
} from '../dxfR12Writer';
import type { FlatPart, DrillFeature, PocketFeature, GrooveFeature, InnerContour } from '../../types/FlatPart';

// ============================================
// FIXTURES
// ============================================

function createMinimalFlatPart(overrides: Partial<FlatPart> = {}): FlatPart {
  return {
    id: 'test-part-001',
    partNumber: 'P001',
    name: 'Test Panel',
    cutWidth: 600,
    cutHeight: 400,
    outer: {
      type: 'rectangle',
      width: 600,
      height: 400,
    },
    inners: [],
    drills: [],
    pockets: [],
    grooves: [],
    composite: {
      core: {
        materialId: 'mat-mel-white',
        materialName: 'Melamine White',
        thickness: 18,
      },
    },
    ...overrides,
  } as FlatPart;
}

let drillCounter = 0;
function createDrill(overrides: Partial<DrillFeature> = {}): DrillFeature {
  return {
    id: `drill-${++drillCounter}`,
    x: 50,
    y: 50,
    diameter: 5,
    depth: 10,
    isThrough: false,
    face: 'A',
    ...overrides,
  };
}

let pocketCounter = 0;
function createPocket(overrides: Partial<PocketFeature> = {}): PocketFeature {
  return {
    id: `pocket-${++pocketCounter}`,
    x: 100,
    y: 100,
    width: 50,
    height: 30,
    depth: 5,
    cornerRadius: 0,
    face: 'A',
    ...overrides,
  };
}

let grooveCounter = 0;
function createGroove(overrides: Partial<GrooveFeature> = {}): GrooveFeature {
  return {
    id: `groove-${++grooveCounter}`,
    axis: 'x',
    position: 200,
    start: 0,
    length: 600,
    width: 3,
    depth: 5,
    face: 'A',
    ...overrides,
  };
}

// ============================================
// TESTS: DXF Header
// ============================================

describe('flatPartToDxfR12', () => {
  describe('DXF header', () => {
    it('generates valid R12 header', () => {
      const part = createMinimalFlatPart();
      const dxf = flatPartToDxfR12(part);

      expect(dxf).toContain('0\nSECTION');
      expect(dxf).toContain('2\nHEADER');
      expect(dxf).toContain('$ACADVER');
      expect(dxf).toContain('AC1009'); // R12 version
    });

    it('includes EXTMIN and EXTMAX', () => {
      const part = createMinimalFlatPart();
      const dxf = flatPartToDxfR12(part);

      expect(dxf).toContain('$EXTMIN');
      expect(dxf).toContain('$EXTMAX');
    });

    it('ends with EOF', () => {
      const part = createMinimalFlatPart();
      const dxf = flatPartToDxfR12(part);

      expect(dxf).toContain('0\nEOF');
    });
  });

  describe('layer table', () => {
    it('includes CUT_OUT layer', () => {
      const part = createMinimalFlatPart();
      const dxf = flatPartToDxfR12(part);

      expect(dxf).toContain('2\nCUT_OUT');
    });

    it('includes ANNOTATION layer', () => {
      const part = createMinimalFlatPart();
      const dxf = flatPartToDxfR12(part);

      expect(dxf).toContain('2\nANNOTATION');
    });

    it('includes drill layers', () => {
      const part = createMinimalFlatPart({
        drills: [createDrill({ diameter: 5, depth: 10 })],
      });
      const dxf = flatPartToDxfR12(part);

      expect(dxf).toContain('DRILL_V_5_D10');
    });

    it('includes pocket layers', () => {
      const part = createMinimalFlatPart({
        pockets: [createPocket({ depth: 5 })],
      });
      const dxf = flatPartToDxfR12(part);

      expect(dxf).toContain('POCKET_D5');
    });

    it('includes groove layers', () => {
      const part = createMinimalFlatPart({
        grooves: [createGroove({ depth: 5 })],
      });
      const dxf = flatPartToDxfR12(part);

      expect(dxf).toContain('SAW_GROOVE_D5');
    });

    it('sorts layers alphabetically for determinism', () => {
      const part = createMinimalFlatPart({
        drills: [
          createDrill({ diameter: 8, depth: 10 }),
          createDrill({ diameter: 5, depth: 10 }),
        ],
      });
      const dxf = flatPartToDxfR12(part);

      // ANNOTATION, CUT_OUT, DRILL_V_5_D10, DRILL_V_8_D10 (alphabetical)
      const annotationIdx = dxf.indexOf('ANNOTATION');
      const cutOutIdx = dxf.indexOf('CUT_OUT');
      const drill5Idx = dxf.indexOf('DRILL_V_5_D10');
      const drill8Idx = dxf.indexOf('DRILL_V_8_D10');

      expect(annotationIdx).toBeLessThan(cutOutIdx);
      expect(cutOutIdx).toBeLessThan(drill5Idx);
      expect(drill5Idx).toBeLessThan(drill8Idx);
    });
  });

  describe('outer contour', () => {
    it('generates 4 LINE entities for rectangle', () => {
      const part = createMinimalFlatPart({
        outer: { type: 'rectangle', width: 600, height: 400 },
      });
      const dxf = flatPartToDxfR12(part);

      // Count LINE entities on CUT_OUT layer
      const lines = dxf.split('0\nLINE').length - 1;
      expect(lines).toBeGreaterThanOrEqual(4);

      // Check corner coordinates
      expect(dxf).toContain('0.000'); // origin
      expect(dxf).toContain('600.000'); // width
      expect(dxf).toContain('400.000'); // height
    });
  });

  describe('inner contours - rectangles', () => {
    it('generates rectangle cutout as 4 LINE entities', () => {
      const part = createMinimalFlatPart({
        inners: [
          {
            id: 'cutout-rect-1',
            type: 'rectangle',
            rect: { x: 100, y: 100, width: 200, height: 150 },
          },
        ],
      });
      const dxf = flatPartToDxfR12(part);

      // Check cutout coordinates
      expect(dxf).toContain('100.000');
      expect(dxf).toContain('300.000'); // 100 + 200
      expect(dxf).toContain('250.000'); // 100 + 150
    });
  });

  describe('inner contours - circles', () => {
    it('generates circle cutout as CIRCLE entity', () => {
      const part = createMinimalFlatPart({
        inners: [
          {
            id: 'cutout-circle-1',
            type: 'circle',
            circle: { cx: 300, cy: 200, radius: 50 },
          },
        ],
      });
      const dxf = flatPartToDxfR12(part);

      expect(dxf).toContain('0\nCIRCLE');
      expect(dxf).toContain('300.000'); // cx
      expect(dxf).toContain('200.000'); // cy
      expect(dxf).toContain('50.000'); // radius
    });
  });

  describe('inner contours - polylines (P1 feature)', () => {
    it('generates triangle cutout as 3 LINE entities', () => {
      const part = createMinimalFlatPart({
        inners: [
          {
            id: 'cutout-triangle-1',
            type: 'polyline',
            polyline: {
              points: [
                { x: 100, y: 100 },
                { x: 200, y: 100 },
                { x: 150, y: 200 },
              ],
              closed: true,
            },
          },
        ],
      });
      const dxf = flatPartToDxfR12(part);

      // Should contain LINE entities forming a closed triangle
      expect(dxf).toContain('0\nLINE');

      // Check triangle vertices are present
      expect(dxf).toContain('100.000'); // First vertex x
      expect(dxf).toContain('200.000'); // Second vertex x
      expect(dxf).toContain('150.000'); // Third vertex x
    });

    it('generates pentagon cutout as 5 LINE entities', () => {
      const part = createMinimalFlatPart({
        inners: [
          {
            id: 'cutout-pentagon-1',
            type: 'polyline',
            polyline: {
              points: [
                { x: 150, y: 100 },
                { x: 250, y: 100 },
                { x: 280, y: 180 },
                { x: 200, y: 250 },
                { x: 120, y: 180 },
              ],
              closed: true,
            },
          },
        ],
      });
      const dxf = flatPartToDxfR12(part);

      // Should have at least 5 LINE entities for pentagon (plus outer rectangle)
      const lineCount = (dxf.match(/0\nLINE/g) || []).length;
      expect(lineCount).toBeGreaterThanOrEqual(9); // 4 outer + 5 pentagon
    });

    it('places polyline on CUT_OUT layer', () => {
      const part = createMinimalFlatPart({
        inners: [
          {
            id: 'cutout-poly-layer-1',
            type: 'polyline',
            polyline: {
              points: [
                { x: 100, y: 100 },
                { x: 200, y: 100 },
                { x: 150, y: 200 },
              ],
              closed: true,
            },
          },
        ],
      });
      const dxf = flatPartToDxfR12(part);

      // LINE entities should be on CUT_OUT layer
      const linesSection = dxf.slice(dxf.indexOf('ENTITIES'));
      const lineBlocks = linesSection.split('0\nLINE').slice(1);

      for (const block of lineBlocks) {
        expect(block).toContain('8\nCUT_OUT');
      }
    });

    it('ignores polylines with less than 3 points', () => {
      const part = createMinimalFlatPart({
        inners: [
          {
            id: 'cutout-invalid-1',
            type: 'polyline',
            polyline: {
              points: [
                { x: 100, y: 100 },
                { x: 200, y: 100 },
              ],
              closed: true,
            },
          },
        ],
      });
      const dxf = flatPartToDxfR12(part);

      // Should only have 4 LINE entities for outer rectangle
      const lineCount = (dxf.match(/0\nLINE/g) || []).length;
      expect(lineCount).toBe(4);
    });
  });

  describe('drills', () => {
    it('generates CIRCLE entities for drills', () => {
      const part = createMinimalFlatPart({
        drills: [createDrill({ x: 50, y: 50, diameter: 5 })],
      });
      const dxf = flatPartToDxfR12(part);

      expect(dxf).toContain('0\nCIRCLE');
      expect(dxf).toContain('50.000'); // x, y
      expect(dxf).toContain('2.500'); // radius = diameter / 2
    });

    it('sorts drills by layer then position', () => {
      const part = createMinimalFlatPart({
        drills: [
          createDrill({ x: 200, y: 50, diameter: 8, depth: 10 }),
          createDrill({ x: 50, y: 50, diameter: 5, depth: 10 }),
          createDrill({ x: 100, y: 50, diameter: 5, depth: 10 }),
        ],
      });
      const dxf = flatPartToDxfR12(part);

      // DRILL_V_5_D10 comes before DRILL_V_8_D10 alphabetically
      const drill5Idx = dxf.indexOf('DRILL_V_5_D10');
      const drill8Idx = dxf.indexOf('DRILL_V_8_D10');
      expect(drill5Idx).toBeLessThan(drill8Idx);
    });
  });

  describe('pockets', () => {
    it('generates rectangle for pocket (centered)', () => {
      const part = createMinimalFlatPart({
        pockets: [createPocket({ x: 100, y: 100, width: 50, height: 30 })],
      });
      const dxf = flatPartToDxfR12(part);

      // Pocket centered at (100, 100) with size 50x30
      // Corner at (75, 85)
      expect(dxf).toContain('75.000');
      expect(dxf).toContain('85.000');
    });
  });

  describe('grooves', () => {
    it('generates horizontal groove rectangle', () => {
      const part = createMinimalFlatPart({
        grooves: [createGroove({ axis: 'x', position: 200, start: 0, length: 600, width: 3 })],
      });
      const dxf = flatPartToDxfR12(part);

      expect(dxf).toContain('SAW_GROOVE_D5');
    });

    it('generates vertical groove rectangle', () => {
      const part = createMinimalFlatPart({
        grooves: [createGroove({ axis: 'y', position: 300, start: 0, length: 400, width: 3 })],
      });
      const dxf = flatPartToDxfR12(part);

      expect(dxf).toContain('SAW_GROOVE_D5');
    });
  });

  describe('annotations', () => {
    it('includes part info when annotation enabled', () => {
      const part = createMinimalFlatPart({
        partNumber: 'LEFT-SIDE-001',
      });
      const dxf = flatPartToDxfR12(part);

      expect(dxf).toContain('0\nTEXT');
      expect(dxf).toContain('LEFT-SIDE-001');
    });

    it('excludes annotation when disabled', () => {
      const part = createMinimalFlatPart();
      const dxf = flatPartToDxfR12(part, {
        ...DEFAULT_DXF_CONFIG,
        includeAnnotation: false,
      });

      expect(dxf).not.toContain('0\nTEXT');
    });
  });

  describe('determinism', () => {
    it('generates identical output for same input', () => {
      const part = createMinimalFlatPart({
        drills: [
          createDrill({ x: 50, y: 50 }),
          createDrill({ x: 100, y: 50 }),
        ],
        pockets: [createPocket()],
        grooves: [createGroove()],
      });

      const dxf1 = flatPartToDxfR12(part);
      const dxf2 = flatPartToDxfR12(part);

      expect(dxf1).toBe(dxf2);
    });
  });
});

// ============================================
// TESTS: exportFlatPartToDxf
// ============================================

describe('exportFlatPartToDxf', () => {
  it('returns filename and content', () => {
    const part = createMinimalFlatPart({ partNumber: 'LEFT-SIDE' });
    const result = exportFlatPartToDxf(part);

    expect(result.filename).toBe('LEFT-SIDE.dxf');
    expect(result.content).toContain('AC1009');
  });

  it('uses id when partNumber is missing', () => {
    const part = createMinimalFlatPart({ partNumber: undefined, id: 'panel-001' });
    const result = exportFlatPartToDxf(part);

    expect(result.filename).toBe('panel-001.dxf');
  });
});

// ============================================
// TESTS: exportFlatPartsToDxf
// ============================================

describe('exportFlatPartsToDxf', () => {
  it('exports multiple parts', () => {
    const parts = [
      createMinimalFlatPart({ partNumber: 'LEFT-SIDE' }),
      createMinimalFlatPart({ partNumber: 'RIGHT-SIDE' }),
    ];
    const results = exportFlatPartsToDxf(parts);

    expect(results).toHaveLength(2);
    expect(results[0].filename).toBe('LEFT-SIDE.dxf');
    expect(results[1].filename).toBe('RIGHT-SIDE.dxf');
  });
});
