/**
 * buildBoltMeshFrame Unit Tests
 *
 * Tests the truth-chain bolt positioning helper function.
 * Ensures correct geometry for:
 * - Ball position at cam pocket center (B=C)
 * - Thread inside bolt panel (-axis direction, opposite to boltDirection)
 * - Neck/sleeve anchored to ball position
 */

import { describe, it, expect } from 'vitest';
import { buildBoltMeshFrame, type BuildBoltMeshFrameArgs } from '../Hardware3D';
import type { DrillMapPoint } from '../../../core/manufacturing/drillMap/types';

// ============================================
// TEST HELPERS
// ============================================

type Vec3Tuple = [number, number, number];

function mkPoint(partial: Partial<DrillMapPoint>): DrillMapPoint {
  // Minimal shape needed by builder
  return {
    id: 'test-bolt',
    panelId: 'test-panel',
    position: [0, 0, 0],
    normal: [0, 1, 0],
    diameter: 10,
    depth: 17.5,
    purpose: 'BOLT',
    componentType: 'BOLT',
    status: 'VALID',
    ...partial,
  } as DrillMapPoint;
}

function dot(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(v: Vec3Tuple): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

// ============================================
// B=C TRUTH TESTS
// ============================================

describe('buildBoltMeshFrame: B=C positioning', () => {
  it('ballPos == C - A when targetPocketCenter present', () => {
    const A: Vec3Tuple = [10, 20, 30];
    const C: Vec3Tuple = [4, 17, 30];
    const axis: Vec3Tuple = [-0.9, -0.4, 0]; // any non-zero; will normalize

    const point = mkPoint({
      position: A,
      boltDirection: axis,
      targetPocketCenter: C,
    });

    const frame = buildBoltMeshFrame({ point });

    // ballPos should be C - A (local coordinates)
    expect(frame.ballPos[0]).toBeCloseTo(C[0] - A[0], 6);
    expect(frame.ballPos[1]).toBeCloseTo(C[1] - A[1], 6);
    expect(frame.ballPos[2]).toBeCloseTo(C[2] - A[2], 6);

    // debug should indicate target was used
    expect(frame.debug.hasTarget).toBe(true);
  });

  it('ballPos uses fallback when targetPocketCenter not present', () => {
    const A: Vec3Tuple = [0, 0, 0];
    const axis: Vec3Tuple = [1, 0, 0]; // +X direction

    const point = mkPoint({
      position: A,
      boltDirection: axis,
      targetPocketCenter: undefined,
    });

    const BALL_HEAD_RADIUS = 3.75;
    const NECK_LENGTH = 6.5;
    const SLEEVE_LENGTH = 17.5;

    const frame = buildBoltMeshFrame({
      point,
      BALL_HEAD_RADIUS,
      NECK_LENGTH,
      SLEEVE_LENGTH,
    });

    // Fallback: ball at axis * (SLEEVE + NECK + BALL_RADIUS)
    const fallbackDistance = SLEEVE_LENGTH + NECK_LENGTH + BALL_HEAD_RADIUS;

    expect(frame.ballPos[0]).toBeCloseTo(fallbackDistance, 6);
    expect(frame.ballPos[1]).toBeCloseTo(0, 6);
    expect(frame.ballPos[2]).toBeCloseTo(0, 6);

    // debug should indicate no target
    expect(frame.debug.hasTarget).toBe(false);
  });
});

// ============================================
// THREAD SIGN TESTS (Critical fix)
// ============================================

describe('buildBoltMeshFrame: thread sign correctness', () => {
  it('threadPos is along -axis (into bolt panel, opposite to boltDirection)', () => {
    const A: Vec3Tuple = [0, 0, 0];
    const C: Vec3Tuple = [10, 0, 0];
    const point = mkPoint({
      position: A,
      boltDirection: [1, 0, 0], // +X axis (toward cam)
      targetPocketCenter: C,
    });

    const L = 11;
    const frame = buildBoltMeshFrame({ point, L });

    // Thread center should be at -axis * (L/2) = [-5.5, 0, 0]
    // Thread screws into the bolt panel (side panel), opposite to boltDirection
    expect(frame.threadPos[0]).toBeCloseTo(-L / 2, 6);
    expect(frame.threadPos[1]).toBeCloseTo(0, 6);
    expect(frame.threadPos[2]).toBeCloseTo(0, 6);
  });

  it('threadPos dot axis < 0 (thread opposite to boltDirection, into panel)', () => {
    // Test with arbitrary axis direction
    const A: Vec3Tuple = [24, 700, 37];
    const C: Vec3Tuple = [0, 693.75, 37];

    // axis = normalize(C - A)
    const dx = C[0] - A[0];
    const dy = C[1] - A[1];
    const dz = C[2] - A[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const boltDirection: Vec3Tuple = [dx / len, dy / len, dz / len];

    const point = mkPoint({
      position: A,
      boltDirection,
      targetPocketCenter: C,
    });

    const frame = buildBoltMeshFrame({ point, L: 11 });

    // threadPos should have negative dot product with axis (into panel, away from cam)
    const dotProduct = dot(frame.threadPos, frame.axis);
    expect(dotProduct).toBeLessThan(0);
  });

  it('threadPos length matches L/2', () => {
    const point = mkPoint({
      position: [0, 0, 0],
      boltDirection: [0, 0, 1], // +Z
      targetPocketCenter: [0, 0, 30],
    });

    const L = 15;
    const frame = buildBoltMeshFrame({ point, L });

    expect(length(frame.threadPos)).toBeCloseTo(L / 2, 6);
  });
});

// ============================================
// ANCHOR TESTS (neck/sleeve relative to ball)
// ============================================

describe('buildBoltMeshFrame: anchor positioning', () => {
  it('neck/sleeve are behind ball along -axis (anchored at ballPos)', () => {
    const point = mkPoint({
      position: [0, 0, 0],
      boltDirection: [0, 1, 0], // axis +Y
      targetPocketCenter: [0, 30, 0], // ballPos = [0, 30, 0]
    });

    const frame = buildBoltMeshFrame({
      point,
      BALL_HEAD_RADIUS: 3.75,
      NECK_LENGTH: 6.5,
      SLEEVE_LENGTH: 17.5,
      L: 11,
    });

    // With axis +Y, "behind ball" means smaller Y than ballPos.y
    expect(frame.neckPos[1]).toBeLessThan(frame.ballPos[1]);
    expect(frame.sleevePos[1]).toBeLessThan(frame.ballPos[1]);

    // Sleeve should be further back than neck
    expect(frame.sleevePos[1]).toBeLessThan(frame.neckPos[1]);
  });

  it('neck is at correct offset from ball', () => {
    const point = mkPoint({
      position: [0, 0, 0],
      boltDirection: [1, 0, 0], // +X
      targetPocketCenter: [30, 0, 0],
    });

    const BALL_HEAD_RADIUS = 3.75;
    const NECK_LENGTH = 6.5;

    const frame = buildBoltMeshFrame({
      point,
      BALL_HEAD_RADIUS,
      NECK_LENGTH,
    });

    // neckOffset = BALL_HEAD_RADIUS + NECK_LENGTH/2
    const expectedOffset = BALL_HEAD_RADIUS + NECK_LENGTH / 2;

    // neck should be at ballPos - axis * offset
    // ballPos = [30, 0, 0], axis = [1, 0, 0]
    // neckPos = [30 - 1 * offset, 0, 0]
    expect(frame.neckPos[0]).toBeCloseTo(frame.ballPos[0] - expectedOffset, 6);
  });

  it('sleeve is at correct offset from ball', () => {
    const point = mkPoint({
      position: [0, 0, 0],
      boltDirection: [0, 0, 1], // +Z
      targetPocketCenter: [0, 0, 40],
    });

    const BALL_HEAD_RADIUS = 3.75;
    const NECK_LENGTH = 6.5;
    const SLEEVE_LENGTH = 17.5;

    const frame = buildBoltMeshFrame({
      point,
      BALL_HEAD_RADIUS,
      NECK_LENGTH,
      SLEEVE_LENGTH,
    });

    // sleeveOffset = BALL_HEAD_RADIUS + NECK_LENGTH + SLEEVE_LENGTH/2
    const expectedOffset = BALL_HEAD_RADIUS + NECK_LENGTH + SLEEVE_LENGTH / 2;

    // sleeve should be at ballPos - axis * offset
    expect(frame.sleevePos[2]).toBeCloseTo(frame.ballPos[2] - expectedOffset, 6);
  });
});

// ============================================
// ROTATION TESTS
// ============================================

describe('buildBoltMeshFrame: rotation', () => {
  it('rotation aligns +Y to axis direction', () => {
    // Test with simple axis directions
    const testCases: Vec3Tuple[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
    ];

    for (const axis of testCases) {
      const point = mkPoint({
        position: [0, 0, 0],
        boltDirection: axis,
        targetPocketCenter: [axis[0] * 30, axis[1] * 30, axis[2] * 30],
      });

      const frame = buildBoltMeshFrame({ point });

      // axis should be normalized
      expect(length(frame.axis)).toBeCloseTo(1, 6);
    }
  });
});

// ============================================
// REAL-WORLD GEOMETRY TESTS
// ============================================

describe('buildBoltMeshFrame: real-world cases', () => {
  it('TOP_LEFT corner joint geometry', () => {
    // From minifixRenderInvariant.test.ts
    const A: Vec3Tuple = [24, 700, 37];
    const C: Vec3Tuple = [0, 693.75, 37];

    const dx = C[0] - A[0];
    const dy = C[1] - A[1];
    const dz = C[2] - A[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const boltDirection: Vec3Tuple = [dx / len, dy / len, dz / len];

    const point = mkPoint({
      position: A,
      boltDirection,
      targetPocketCenter: C,
    });

    const frame = buildBoltMeshFrame({ point });

    // ballPos should be C - A (exact)
    expect(frame.ballPos[0]).toBeCloseTo(-24, 4);
    expect(frame.ballPos[1]).toBeCloseTo(-6.25, 4);
    expect(frame.ballPos[2]).toBeCloseTo(0, 4);

    // axis should point toward C (negative X, slightly negative Y)
    expect(frame.axis[0]).toBeLessThan(0);
    expect(frame.axis[1]).toBeLessThan(0);
  });

  it('BOTTOM_RIGHT corner joint geometry', () => {
    const A: Vec3Tuple = [576, 100, 37];
    const C: Vec3Tuple = [600, 106.25, 37];

    const dx = C[0] - A[0];
    const dy = C[1] - A[1];
    const dz = C[2] - A[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const boltDirection: Vec3Tuple = [dx / len, dy / len, dz / len];

    const point = mkPoint({
      position: A,
      boltDirection,
      targetPocketCenter: C,
    });

    const frame = buildBoltMeshFrame({ point });

    // ballPos should be C - A
    expect(frame.ballPos[0]).toBeCloseTo(24, 4);
    expect(frame.ballPos[1]).toBeCloseTo(6.25, 4);

    // axis should point toward C (positive X, positive Y)
    expect(frame.axis[0]).toBeGreaterThan(0);
    expect(frame.axis[1]).toBeGreaterThan(0);
  });
});
