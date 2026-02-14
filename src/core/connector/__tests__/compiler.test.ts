/**
 * Connector OS v1.1 - Compiler Unit Tests
 *
 * Tests drill operation compilation with manufacturing modes.
 *
 * @see docs/connector-os/compiler-pipeline.md
 */

import { describe, it, expect } from 'vitest';
import { compileConnectorOps } from '../compiler';
import {
  HAFELE_MINIFIX_15_B24,
  IF_TARGET_J10,
  HMR18_HPL08x2_PVC1,
} from '../catalog';
import type { AdjacencyContext } from '../types';

const TEST_CONTEXT: AdjacencyContext = {
  id: 'J1',
  jointLength: 600,
  panelA: { panelId: 'SIDE_L', role: 'SIDE' },
  panelB: { panelId: 'TOP', role: 'HORIZONTAL' },
};

describe('compileConnectorOps', () => {
  // ──────────────────────────────────────────────────────────────────────
  // Minifix 15 DRILL_ON_FINISHED: V=37.0, N=9.0
  // ──────────────────────────────────────────────────────────────────────
  it('Minifix 15 DRILL_ON_FINISHED → V=37.0, N=9.0', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_MINIFIX_15_B24,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    const camOp = ops.find((op) => op.meta.featureId === 'CAM');
    expect(camOp).toBeDefined();
    expect(camOp!.params.v).toBe(37.0);
    expect(camOp!.params.n).toBe(9.0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Minifix 15 DRILL_ON_CORE: V=36.0, N=9.0
  // ──────────────────────────────────────────────────────────────────────
  it('Minifix 15 DRILL_ON_CORE → V=36.0, N=9.0', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_MINIFIX_15_B24,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_CORE',
    );

    const camOp = ops.find((op) => op.meta.featureId === 'CAM');
    expect(camOp).toBeDefined();
    expect(camOp!.params.v).toBe(36.0);
    expect(camOp!.params.n).toBe(9.0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Target J10 transform: U = 9.5 + (-25) = -15.5
  // ──────────────────────────────────────────────────────────────────────
  it('Target J10 PINION transform → U = B + deltaMm', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      IF_TARGET_J10,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    const pinionOp = ops.find((op) => op.meta.featureId === 'PINION');
    expect(pinionOp).toBeDefined();
    // PINION: offsetPrimaryMm=9.5, transform.deltaMm=-25 → finalB = -15.5
    expect(pinionOp!.params.u).toBe(-15.5);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Two features per S-position (CAM + BOLT)
  // ──────────────────────────────────────────────────────────────────────
  it('produces 2 features per S-position for Minifix', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_MINIFIX_15_B24,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    expect(ops.length).toBe(2);
    const featureIds = ops.map((op) => op.meta.featureId);
    expect(featureIds).toContain('CAM');
    expect(featureIds).toContain('BOLT');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Multiple S-positions → multiplied ops
  // ──────────────────────────────────────────────────────────────────────
  it('3 S-positions × 2 features = 6 ops', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_MINIFIX_15_B24,
      [37, 69, 101],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    expect(ops.length).toBe(6);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Metadata structure: pairId format
  // ──────────────────────────────────────────────────────────────────────
  it('pairId follows PAIR_{jointId}_{index} format', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_MINIFIX_15_B24,
      [37, 69],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    expect(ops[0].meta.pairId).toBe('PAIR_J1_0');
    expect(ops[1].meta.pairId).toBe('PAIR_J1_0');
    expect(ops[2].meta.pairId).toBe('PAIR_J1_1');
    expect(ops[3].meta.pairId).toBe('PAIR_J1_1');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Tags present
  // ──────────────────────────────────────────────────────────────────────
  it('ops have CONN=, ROLE=, MODE= tags', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_MINIFIX_15_B24,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    for (const op of ops) {
      expect(op.tags).toContainEqual(expect.stringMatching(/^CONN=/));
      expect(op.tags).toContainEqual(expect.stringMatching(/^ROLE=/));
      expect(op.tags).toContainEqual(expect.stringMatching(/^MODE=/));
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // CAM diameter and depth match catalog
  // ──────────────────────────────────────────────────────────────────────
  it('CAM dia=15mm, depth=13.5mm per Häfele FF 3.10', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_MINIFIX_15_B24,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    const camOp = ops.find((op) => op.meta.featureId === 'CAM')!;
    expect(camOp.params.dia).toBe(15);
    expect(camOp.params.depth).toBe(13.5);
  });

  // ──────────────────────────────────────────────────────────────────────
  // BOLT U-coordinate = 0 (edge bore, no offset)
  // ──────────────────────────────────────────────────────────────────────
  it('BOLT U=0 (edge bore at join edge)', () => {
    const ops = compileConnectorOps(
      TEST_CONTEXT,
      HAFELE_MINIFIX_15_B24,
      [37],
      HMR18_HPL08x2_PVC1,
      'DRILL_ON_FINISHED',
    );

    const boltOp = ops.find((op) => op.meta.featureId === 'BOLT')!;
    expect(boltOp.params.u).toBe(0);
  });
});
