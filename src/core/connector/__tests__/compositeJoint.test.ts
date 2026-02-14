/**
 * Connector OS v1.1 - Composite Joint Tests (Minifix + Wood Dowel)
 *
 * Tests the production pattern where Minifix provides structural lock
 * and Wood Dowel provides shear resistance + alignment.
 *
 * Joint layout (System 32 grid):
 *   S=37  → Minifix (CAM + BOLT)
 *   S=69  → Wood Dowel (DOWEL_EDGE + DOWEL_FACE)
 *   S=101 → Minifix (CAM + BOLT)
 *
 * All holes share N=9.0 (core center) for flush assembly.
 *
 * @see Master Specification v1.1 §4
 */

import { describe, it, expect } from 'vitest';
import { compileConnectorOps } from '../compiler';
import {
  HAFELE_MINIFIX_15_B24,
  HAFELE_WOOD_DOWEL_8x30,
  HMR18_HPL08x2_PVC1,
} from '../catalog';
import type { AdjacencyContext, ConnectorDrillOp } from '../types';

const JOINT_CONTEXT: AdjacencyContext = {
  id: 'J_COMPOSITE',
  jointLength: 600,
  panelA: { panelId: 'SIDE_L', role: 'SIDE' },
  panelB: { panelId: 'BOTTOM', role: 'HORIZONTAL' },
};

/**
 * Compile a composite joint: Minifix at some S-positions,
 * Wood Dowel at interleaved S-positions.
 */
function compileCompositeJoint(): {
  minifixOps: ConnectorDrillOp[];
  dowelOps: ConnectorDrillOp[];
  allOps: ConnectorDrillOp[];
} {
  const minifixOps = compileConnectorOps(
    JOINT_CONTEXT,
    HAFELE_MINIFIX_15_B24,
    [37, 101],  // Minifix at S=37 and S=101
    HMR18_HPL08x2_PVC1,
    'DRILL_ON_FINISHED',
  );

  const dowelOps = compileConnectorOps(
    { ...JOINT_CONTEXT, id: 'J_COMPOSITE_DWL' },
    HAFELE_WOOD_DOWEL_8x30,
    [69],  // Wood Dowel at S=69 (between the two Minifix)
    HMR18_HPL08x2_PVC1,
    'DRILL_ON_FINISHED',
  );

  return {
    minifixOps,
    dowelOps,
    allOps: [...minifixOps, ...dowelOps],
  };
}

describe('Composite Joint: Minifix + Wood Dowel', () => {
  // ──────────────────────────────────────────────────────────────────────
  // Total ops: 2 Minifix × 2 features + 1 Dowel × 2 features = 6
  // ──────────────────────────────────────────────────────────────────────
  it('produces 6 total ops (2×Minifix + 1×Dowel)', () => {
    const { allOps } = compileCompositeJoint();
    expect(allOps.length).toBe(6);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Minifix ops: 4 (2 S-positions × 2 features)
  // ──────────────────────────────────────────────────────────────────────
  it('Minifix produces 4 ops (CAM+BOLT at S=37 and S=101)', () => {
    const { minifixOps } = compileCompositeJoint();
    expect(minifixOps.length).toBe(4);

    const features = minifixOps.map((op) => op.meta.featureId);
    expect(features.filter((f) => f === 'CAM').length).toBe(2);
    expect(features.filter((f) => f === 'BOLT').length).toBe(2);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Dowel ops: 2 (1 S-position × 2 features)
  // ──────────────────────────────────────────────────────────────────────
  it('Dowel produces 2 ops (DOWEL_EDGE + DOWEL_FACE at S=69)', () => {
    const { dowelOps } = compileCompositeJoint();
    expect(dowelOps.length).toBe(2);

    const features = dowelOps.map((op) => op.meta.featureId);
    expect(features).toContain('DOWEL_EDGE');
    expect(features).toContain('DOWEL_FACE');
  });

  // ──────────────────────────────────────────────────────────────────────
  // ALL holes share N=9.0 (critical for flush assembly)
  // ──────────────────────────────────────────────────────────────────────
  it('all 6 ops share N=9.0 (core center for flush joint)', () => {
    const { allOps } = compileCompositeJoint();

    for (const op of allOps) {
      expect(op.params.n).toBe(9.0);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // V-axis matches System 32 positions
  // ──────────────────────────────────────────────────────────────────────
  it('V values match System 32 positions (37, 69, 101)', () => {
    const { allOps } = compileCompositeJoint();

    const vValues = [...new Set(allOps.map((op) => op.params.v))].sort((a, b) => a - b);
    expect(vValues).toEqual([37.0, 69.0, 101.0]);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Minifix CAM diameter = 15mm (larger than dowel)
  // ──────────────────────────────────────────────────────────────────────
  it('Minifix CAM uses Ø15mm bore, Dowel uses Ø8mm bore', () => {
    const { minifixOps, dowelOps } = compileCompositeJoint();

    const camOps = minifixOps.filter((op) => op.meta.featureId === 'CAM');
    for (const op of camOps) {
      expect(op.params.dia).toBe(15);
    }

    for (const op of dowelOps) {
      expect(op.params.dia).toBe(8);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Minifix BOLT depth (34mm) ≠ Dowel depth (15mm)
  // ──────────────────────────────────────────────────────────────────────
  it('Minifix BOLT depth=34mm, Dowel depth=15mm', () => {
    const { minifixOps, dowelOps } = compileCompositeJoint();

    const boltOps = minifixOps.filter((op) => op.meta.featureId === 'BOLT');
    for (const op of boltOps) {
      expect(op.params.depth).toBe(34);
    }

    for (const op of dowelOps) {
      expect(op.params.depth).toBe(15);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Dowel V=69.0 sits exactly between Minifix V=37.0 and V=101.0
  // (32mm pitch × 2 = 64mm gap, centered)
  // ──────────────────────────────────────────────────────────────────────
  it('Dowel S=69 is exactly one System 32 pitch from both Minifix', () => {
    const pitch = 32;
    const dowelS = 69;
    const minifixS1 = 37;
    const minifixS2 = 101;

    expect(dowelS - minifixS1).toBe(pitch);
    expect(minifixS2 - dowelS).toBe(pitch);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Connector tags distinguish Minifix from Dowel
  // ──────────────────────────────────────────────────────────────────────
  it('tags distinguish CONN= for Minifix vs Dowel', () => {
    const { minifixOps, dowelOps } = compileCompositeJoint();

    for (const op of minifixOps) {
      expect(op.tags).toContain('CONN=HAFELE_MINIFIX_15_B24');
    }

    for (const op of dowelOps) {
      expect(op.tags).toContain('CONN=HAFELE_WOOD_DOWEL_8x30');
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Edge bore ops: BOLT(U=0) + DOWEL_EDGE(U=0) — both at join edge
  // ──────────────────────────────────────────────────────────────────────
  it('all edge bores have U=0 (at join edge)', () => {
    const { allOps } = compileCompositeJoint();

    const edgeBoreOps = allOps.filter(
      (op) => op.meta.featureId === 'BOLT' || op.meta.featureId === 'DOWEL_EDGE'
    );

    for (const op of edgeBoreOps) {
      expect(op.params.u).toBe(0);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Face bore ops: CAM(U=24) + DOWEL_FACE(U=0) — different offsets
  // ──────────────────────────────────────────────────────────────────────
  it('Minifix CAM U=24 (Distance B), Dowel face U=0', () => {
    const { minifixOps, dowelOps } = compileCompositeJoint();

    const camOps = minifixOps.filter((op) => op.meta.featureId === 'CAM');
    for (const op of camOps) {
      expect(op.params.u).toBe(24);
    }

    const dowelFace = dowelOps.find((op) => op.meta.featureId === 'DOWEL_FACE')!;
    expect(dowelFace.params.u).toBe(0);
  });
});
