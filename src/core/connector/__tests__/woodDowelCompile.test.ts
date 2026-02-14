/**
 * Connector OS v1.1 - Wood Dowel Compilation Tests
 *
 * Tests standalone Wood Dowel 8×30mm compilation through the
 * Digital Joinery Compiler. Verifies bore geometry, CNC coordinates,
 * and NCenterPolicy compliance for reinforcement joints.
 *
 * @see DowelCatalog.ts D8x30 for physical spec
 * @see catalog.ts HAFELE_WOOD_DOWEL_8x30 for ConnectorSpec
 */

import { describe, it, expect } from 'vitest';
import { compileConnectorOps } from '../compiler';
import {
  HAFELE_WOOD_DOWEL_8x30,
  HMR18_HPL08x2_PVC1,
} from '../catalog';
import type { AdjacencyContext } from '../types';

const TEST_CONTEXT: AdjacencyContext = {
  id: 'J_DOWEL_1',
  jointLength: 600,
  panelA: { panelId: 'SIDE_L', role: 'SIDE' },
  panelB: { panelId: 'BOTTOM', role: 'HORIZONTAL' },
};

describe('Wood Dowel 8×30 Compilation', () => {
  // ──────────────────────────────────────────────────────────────────────
  // Feature count: 2 features per S-position (EDGE + FACE)
  // ──────────────────────────────────────────────────────────────────────
  it('produces 2 features per S-position (DOWEL_EDGE + DOWEL_FACE)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_WOOD_DOWEL_8x30,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    expect(ops.length).toBe(2);
    const featureIds = ops.map((op) => op.meta.featureId);
    expect(featureIds).toContain('DOWEL_EDGE');
    expect(featureIds).toContain('DOWEL_FACE');
  });

  // ──────────────────────────────────────────────────────────────────────
  // DRILL_ON_FINISHED: V=37.0 (no PVC deduction)
  // ──────────────────────────────────────────────────────────────────────
  it('DRILL_ON_FINISHED → V=37.0 for both bore features', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_WOOD_DOWEL_8x30,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    for (const op of ops) {
      expect(op.params.v).toBe(37.0);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // N-axis: core center = 9.0 (legacy path, no NCenterPolicy)
  // ──────────────────────────────────────────────────────────────────────
  it('N=9.0 (core center 18.0/2) for both features', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_WOOD_DOWEL_8x30,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    for (const op of ops) {
      expect(op.params.n).toBe(9.0);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Diameter: Ø8mm for both bores
  // ──────────────────────────────────────────────────────────────────────
  it('diameter = 8mm for both EDGE and FACE bores', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_WOOD_DOWEL_8x30,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    for (const op of ops) {
      expect(op.params.dia).toBe(8);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Depth: 15mm per side (30mm total, half per panel)
  // ──────────────────────────────────────────────────────────────────────
  it('depth = 15mm per side (holeDepthPerSide for D8×30)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_WOOD_DOWEL_8x30,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    for (const op of ops) {
      expect(op.params.depth).toBe(15);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // DOWEL_EDGE: U=0 (at join edge, no offset)
  // ──────────────────────────────────────────────────────────────────────
  it('DOWEL_EDGE U=0 (bore at join edge)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_WOOD_DOWEL_8x30,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    const edgeOp = ops.find((op) => op.meta.featureId === 'DOWEL_EDGE')!;
    expect(edgeOp.params.u).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // DOWEL_FACE: U=0 (face bore, centered on joint axis)
  // ──────────────────────────────────────────────────────────────────────
  it('DOWEL_FACE U=0 (face bore at join edge reference)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_WOOD_DOWEL_8x30,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    const faceOp = ops.find((op) => op.meta.featureId === 'DOWEL_FACE')!;
    expect(faceOp.params.u).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Multiple S-positions: 2 positions × 2 features = 4 ops
  // ──────────────────────────────────────────────────────────────────────
  it('2 S-positions × 2 features = 4 ops', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_WOOD_DOWEL_8x30,
      [37, 69],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    expect(ops.length).toBe(4);
  });

  // ──────────────────────────────────────────────────────────────────────
  // V differs per S-position (S=37 → V=37, S=69 → V=69)
  // ──────────────────────────────────────────────────────────────────────
  it('V tracks S-position (37.0 and 69.0)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_WOOD_DOWEL_8x30,
      [37, 69],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    const vValues = [...new Set(ops.map((op) => op.params.v))].sort();
    expect(vValues).toEqual([37.0, 69.0]);
  });

  // ──────────────────────────────────────────────────────────────────────
  // DRILL_ON_CORE: V deducts PVC (37-1.0=36.0, 69-1.0=68.0)
  // ──────────────────────────────────────────────────────────────────────
  it('DRILL_ON_CORE → V deducts PVC (36.0 and 68.0)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_WOOD_DOWEL_8x30,
      [37, 69],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_CORE',
    );

    const vValues = [...new Set(ops.map((op) => op.params.v))].sort();
    expect(vValues).toEqual([36.0, 68.0]);
  });

  // ──────────────────────────────────────────────────────────────────────
  // PairId format consistency
  // ──────────────────────────────────────────────────────────────────────
  it('pairId follows PAIR_{jointId}_{index} format', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_WOOD_DOWEL_8x30,
      [37, 69],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    expect(ops[0].meta.pairId).toBe('PAIR_J_DOWEL_1_0');
    expect(ops[1].meta.pairId).toBe('PAIR_J_DOWEL_1_0');
    expect(ops[2].meta.pairId).toBe('PAIR_J_DOWEL_1_1');
    expect(ops[3].meta.pairId).toBe('PAIR_J_DOWEL_1_1');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Tags include CONN=HAFELE_WOOD_DOWEL_8x30
  // ──────────────────────────────────────────────────────────────────────
  it('tags include CONN=HAFELE_WOOD_DOWEL_8x30', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_WOOD_DOWEL_8x30,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    for (const op of ops) {
      expect(op.tags).toContain('CONN=HAFELE_WOOD_DOWEL_8x30');
    }
  });
});
