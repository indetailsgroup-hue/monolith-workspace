/**
 * CNC Spec Validation — Red Flag Guard Tests
 *
 * These tests pin safety-critical CNC parameters from the Connector OS
 * catalog and compiler output. They exist because three bugs were found
 * where 3D preview labels showed wrong values:
 *
 *   BUG 1: Bolt bore dia showed Ø10 (assembly sleeve) instead of Ø7.5 (S200 sleeve)
 *   BUG 2: Bolt bore depth showed 17.5mm (drillMap domain) instead of 24mm (Distance B)
 *   BUG 3: CAM depth showed 12.5mm (16mm wood) instead of 13.5mm (18mm default)
 *
 * ARCHITECTURE NOTE — Two Domains:
 *   Connector OS catalog (catalog.ts) → CNC drilling truth (Ø7.5, 24mm)
 *   DrillMap manufacturing (minifixDefaults.ts) → panel bore depth (17.5mm)
 *   These are DIFFERENT domains with different correct values.
 *
 * @see catalog.ts HAFELE_MINIFIX_15_B24, HAFELE_WOOD_DOWEL_8x30
 * @see MinifixConfigPanel.tsx CNC_BOLT_BORE_DIA, CNC_BOLT_BORE_DEPTH
 */

import { describe, it, expect } from 'vitest';
import { compileConnectorOps } from '../compiler';
import {
  HAFELE_MINIFIX_15_B24,
  HAFELE_WOOD_DOWEL_8x30,
  IF_TARGET_J10,
  HMR18_HPL08x2_PVC1,
} from '../catalog';
import type { AdjacencyContext } from '../types';

// ──────────────────────────────────────────────────────────────────────────────
// Shared test context
// ──────────────────────────────────────────────────────────────────────────────

const TEST_CONTEXT: AdjacencyContext = {
  id: 'J_CNC_GUARD',
  jointLength: 600,
  panelA: { panelId: 'SIDE_L', role: 'SIDE' },
  panelB: { panelId: 'BOTTOM', role: 'HORIZONTAL' },
};

// ──────────────────────────────────────────────────────────────────────────────
// 1. Catalog Spec Pinning: HAFELE_MINIFIX_15_B24
// ──────────────────────────────────────────────────────────────────────────────

describe('Catalog Spec Pinning: HAFELE_MINIFIX_15_B24', () => {
  it('has exactly 2 features: CAM + BOLT', () => {
    expect(HAFELE_MINIFIX_15_B24.features.length).toBe(2);
    const ids = HAFELE_MINIFIX_15_B24.features.map(f => f.id);
    expect(ids).toContain('CAM');
    expect(ids).toContain('BOLT');
  });

  // --- CAM feature pinning ---
  it('CAM: dia=15mm (Ø15 housing per Häfele FF 3.10)', () => {
    const cam = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'CAM')!;
    expect(cam.diaMm).toBe(15);
  });

  it('CAM: depth=13.5mm (for 18mm wood per Häfele FF 3.10)', () => {
    const cam = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'CAM')!;
    expect(cam.depthMm).toBe(13.5);
  });

  it('CAM: kind=FACE_BORE (housing drills into panel face)', () => {
    const cam = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'CAM')!;
    expect(cam.kind).toBe('FACE_BORE');
  });

  it('CAM: Distance B = 24mm (offsetPrimaryMm)', () => {
    const cam = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'CAM')!;
    expect(cam.offsetPrimaryMm).toBe(24);
  });

  // --- BOLT feature pinning ---
  it('BOLT: dia=7.5mm — Ø7.5 sleeve per Häfele S200 catalog', () => {
    const bolt = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'BOLT')!;
    expect(bolt.diaMm).toBe(7.5);
  });

  it('BOLT: dia must NOT be 10 (assembly sleeve diameter confusion)', () => {
    const bolt = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'BOLT')!;
    expect(bolt.diaMm).not.toBe(10);
  });

  it('BOLT: depth=24mm — Distance B for B=24 variant per Häfele S200', () => {
    const bolt = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'BOLT')!;
    expect(bolt.depthMm).toBe(24);
  });

  it('BOLT: depth must NOT be 17.5 (drillMap domain confusion)', () => {
    const bolt = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'BOLT')!;
    expect(bolt.depthMm).not.toBe(17.5);
  });

  it('BOLT: kind=EDGE_BORE (bolt enters from panel edge)', () => {
    const bolt = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'BOLT')!;
    expect(bolt.kind).toBe('EDGE_BORE');
  });

  it('BOLT: U offset = 0 (bore at join edge, no inset)', () => {
    const bolt = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'BOLT')!;
    expect(bolt.offsetPrimaryMm).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Catalog Spec Pinning: HAFELE_WOOD_DOWEL_8x30
// ──────────────────────────────────────────────────────────────────────────────

describe('Catalog Spec Pinning: HAFELE_WOOD_DOWEL_8x30', () => {
  it('has exactly 2 features: DOWEL_EDGE + DOWEL_FACE', () => {
    expect(HAFELE_WOOD_DOWEL_8x30.features.length).toBe(2);
    const ids = HAFELE_WOOD_DOWEL_8x30.features.map(f => f.id);
    expect(ids).toContain('DOWEL_EDGE');
    expect(ids).toContain('DOWEL_FACE');
  });

  it('DOWEL_EDGE: dia=8mm, depth=15mm, kind=EDGE_BORE', () => {
    const edge = HAFELE_WOOD_DOWEL_8x30.features.find(f => f.id === 'DOWEL_EDGE')!;
    expect(edge.diaMm).toBe(8);
    expect(edge.depthMm).toBe(15);
    expect(edge.kind).toBe('EDGE_BORE');
  });

  it('DOWEL_FACE: dia=8mm, depth=15mm, kind=FACE_BORE', () => {
    const face = HAFELE_WOOD_DOWEL_8x30.features.find(f => f.id === 'DOWEL_FACE')!;
    expect(face.diaMm).toBe(8);
    expect(face.depthMm).toBe(15);
    expect(face.kind).toBe('FACE_BORE');
  });

  it('Both features have matching diameter (same drill bit)', () => {
    const edge = HAFELE_WOOD_DOWEL_8x30.features.find(f => f.id === 'DOWEL_EDGE')!;
    const face = HAFELE_WOOD_DOWEL_8x30.features.find(f => f.id === 'DOWEL_FACE')!;
    expect(edge.diaMm).toBe(face.diaMm);
  });

  it('Both features have matching depth (15mm per side, 30mm total)', () => {
    const edge = HAFELE_WOOD_DOWEL_8x30.features.find(f => f.id === 'DOWEL_EDGE')!;
    const face = HAFELE_WOOD_DOWEL_8x30.features.find(f => f.id === 'DOWEL_FACE')!;
    expect(edge.depthMm).toBe(face.depthMm);
    expect(edge.depthMm + face.depthMm).toBe(30); // Total dowel length
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Compiler Output: BOLT diameter and depth validation
// ──────────────────────────────────────────────────────────────────────────────

describe('Compiler Output: BOLT diameter and depth validation', () => {
  it('BOLT output dia=7.5mm after compilation (S200 sleeve, not assembly sleeve)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT, HAFELE_MINIFIX_15_B24, [37],
      HMR18_HPL08x2_PVC1, 'DRILL_ON_FINISHED',
    );
    const boltOp = ops.find(op => op.meta.featureId === 'BOLT')!;
    expect(boltOp).toBeDefined();
    expect(boltOp.params.dia).toBe(7.5);
  });

  it('BOLT output dia must NOT be 10 (regression: assembly sleeve contamination)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT, HAFELE_MINIFIX_15_B24, [37],
      HMR18_HPL08x2_PVC1, 'DRILL_ON_FINISHED',
    );
    const boltOp = ops.find(op => op.meta.featureId === 'BOLT')!;
    expect(boltOp.params.dia).not.toBe(10);
  });

  it('BOLT output depth=24mm after compilation (Distance B)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT, HAFELE_MINIFIX_15_B24, [37],
      HMR18_HPL08x2_PVC1, 'DRILL_ON_FINISHED',
    );
    const boltOp = ops.find(op => op.meta.featureId === 'BOLT')!;
    expect(boltOp.params.depth).toBe(24);
  });

  it('BOLT output depth must NOT be 17.5 (regression: drillMap domain leak)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT, HAFELE_MINIFIX_15_B24, [37],
      HMR18_HPL08x2_PVC1, 'DRILL_ON_FINISHED',
    );
    const boltOp = ops.find(op => op.meta.featureId === 'BOLT')!;
    expect(boltOp.params.depth).not.toBe(17.5);
  });

  it('CAM output dia=15mm, depth=13.5mm (confirms existing behavior)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT, HAFELE_MINIFIX_15_B24, [37],
      HMR18_HPL08x2_PVC1, 'DRILL_ON_FINISHED',
    );
    const camOp = ops.find(op => op.meta.featureId === 'CAM')!;
    expect(camOp.params.dia).toBe(15);
    expect(camOp.params.depth).toBe(13.5);
  });

  it('CAM depth must NOT be 12.5 (regression: 16mm wood preset on 18mm default)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT, HAFELE_MINIFIX_15_B24, [37],
      HMR18_HPL08x2_PVC1, 'DRILL_ON_FINISHED',
    );
    const camOp = ops.find(op => op.meta.featureId === 'CAM')!;
    expect(camOp.params.depth).not.toBe(12.5);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Compiler Output: N-center for ALL feature types
// ──────────────────────────────────────────────────────────────────────────────

describe('Compiler Output: N-center for all feature types', () => {
  it('Minifix CAM: N=9.0 (core center 18.0/2)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT, HAFELE_MINIFIX_15_B24, [37],
      HMR18_HPL08x2_PVC1, 'DRILL_ON_FINISHED',
    );
    const camOp = ops.find(op => op.meta.featureId === 'CAM')!;
    expect(camOp.params.n).toBe(9.0);
  });

  it('Minifix BOLT: N=9.0 (core center — same as CAM for flush assembly)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT, HAFELE_MINIFIX_15_B24, [37],
      HMR18_HPL08x2_PVC1, 'DRILL_ON_FINISHED',
    );
    const boltOp = ops.find(op => op.meta.featureId === 'BOLT')!;
    expect(boltOp.params.n).toBe(9.0);
  });

  it('Wood Dowel DOWEL_EDGE: N=9.0', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT, HAFELE_WOOD_DOWEL_8x30, [37],
      HMR18_HPL08x2_PVC1, 'DRILL_ON_FINISHED',
    );
    const edgeOp = ops.find(op => op.meta.featureId === 'DOWEL_EDGE')!;
    expect(edgeOp.params.n).toBe(9.0);
  });

  it('Wood Dowel DOWEL_FACE: N=9.0', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT, HAFELE_WOOD_DOWEL_8x30, [37],
      HMR18_HPL08x2_PVC1, 'DRILL_ON_FINISHED',
    );
    const faceOp = ops.find(op => op.meta.featureId === 'DOWEL_FACE')!;
    expect(faceOp.params.n).toBe(9.0);
  });

  it('Target J10 PINION: N=9.0', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT, IF_TARGET_J10, [37],
      HMR18_HPL08x2_PVC1, 'DRILL_ON_FINISHED',
    );
    const pinionOp = ops.find(op => op.meta.featureId === 'PINION')!;
    expect(pinionOp.params.n).toBe(9.0);
  });

  it('All Minifix features share identical N value (flush alignment)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT, HAFELE_MINIFIX_15_B24, [37],
      HMR18_HPL08x2_PVC1, 'DRILL_ON_FINISHED',
    );
    const nValues = ops.map(op => op.params.n);
    expect(new Set(nValues).size).toBe(1);
    expect(nValues[0]).toBe(9.0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Cross-Domain Consistency Guards
// ──────────────────────────────────────────────────────────────────────────────

describe('Cross-Domain Consistency: Catalog vs Assembly vs DrillMap', () => {
  /** Assembly sleeve Ø10mm from MinifixConfigPanel.sleeveDia */
  const ASSEMBLY_SLEEVE_DIA = 10;
  /** DrillMap manufacturing boltBoreDepth from minifixDefaults.ts */
  const DRILLMAP_BOLT_BORE_DEPTH = 17.5;
  /** Wrong CAM depth for 16mm wood (not 18mm default) */
  const WRONG_CAM_DEPTH_16MM = 12.5;

  it('Catalog BOLT dia (7.5mm) differs from assembly sleeve dia (10mm)', () => {
    const bolt = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'BOLT')!;
    expect(bolt.diaMm).not.toBe(ASSEMBLY_SLEEVE_DIA);
    expect(bolt.diaMm).toBe(7.5);
  });

  it('Catalog BOLT depth (24mm) differs from drillMap boltBoreDepth (17.5mm)', () => {
    const bolt = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'BOLT')!;
    expect(bolt.depthMm).not.toBe(DRILLMAP_BOLT_BORE_DEPTH);
    expect(bolt.depthMm).toBe(24);
  });

  it('Catalog CAM depth (13.5mm) is for 18mm wood — NOT 12.5mm (16mm wood)', () => {
    const cam = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'CAM')!;
    expect(cam.depthMm).not.toBe(WRONG_CAM_DEPTH_16MM);
    expect(cam.depthMm).toBe(13.5);
  });

  it('Catalog BOLT dia (7.5) < CAM dia (15) — bolt is always smaller bore', () => {
    const bolt = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'BOLT')!;
    const cam = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'CAM')!;
    expect(bolt.diaMm).toBeLessThan(cam.diaMm);
  });

  it('Wood Dowel dia (8mm) differs from BOLT dia (7.5mm) — different drill bits', () => {
    const bolt = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'BOLT')!;
    const dowelEdge = HAFELE_WOOD_DOWEL_8x30.features.find(f => f.id === 'DOWEL_EDGE')!;
    expect(bolt.diaMm).not.toBe(dowelEdge.diaMm);
    expect(bolt.diaMm).toBe(7.5);
    expect(dowelEdge.diaMm).toBe(8);
  });

  it('BOLT depth (24mm) > Wood Dowel depth (15mm) — bolt bores deeper', () => {
    const bolt = HAFELE_MINIFIX_15_B24.features.find(f => f.id === 'BOLT')!;
    const dowelEdge = HAFELE_WOOD_DOWEL_8x30.features.find(f => f.id === 'DOWEL_EDGE')!;
    expect(bolt.depthMm).toBeGreaterThan(dowelEdge.depthMm);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Full Compilation Round-Trip: Minifix at 3 S-positions
// ──────────────────────────────────────────────────────────────────────────────

describe('Full Compilation Round-Trip: Minifix at 3 S-positions', () => {
  const ops = compileConnectorOps(
    TEST_CONTEXT, HAFELE_MINIFIX_15_B24, [37, 69, 101],
    HMR18_HPL08x2_PVC1, 'DRILL_ON_FINISHED',
  );

  it('produces 6 ops total (3 positions x 2 features)', () => {
    expect(ops.length).toBe(6);
  });

  it('every CAM op has dia=15, depth=13.5, U=24', () => {
    const camOps = ops.filter(op => op.meta.featureId === 'CAM');
    expect(camOps.length).toBe(3);
    for (const op of camOps) {
      expect(op.params.dia).toBe(15);
      expect(op.params.depth).toBe(13.5);
      expect(op.params.u).toBe(24);
    }
  });

  it('every BOLT op has dia=7.5, depth=24, U=0', () => {
    const boltOps = ops.filter(op => op.meta.featureId === 'BOLT');
    expect(boltOps.length).toBe(3);
    for (const op of boltOps) {
      expect(op.params.dia).toBe(7.5);
      expect(op.params.depth).toBe(24);
      expect(op.params.u).toBe(0);
    }
  });

  it('every op has N=9.0 (core center)', () => {
    for (const op of ops) {
      expect(op.params.n).toBe(9.0);
    }
  });

  it('V values match S-positions (37, 69, 101) for DRILL_ON_FINISHED', () => {
    const vValues = [...new Set(ops.map(op => op.params.v))].sort((a, b) => a - b);
    expect(vValues).toEqual([37.0, 69.0, 101.0]);
  });
});
