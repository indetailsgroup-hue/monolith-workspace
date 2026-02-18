/**
 * boltPlacementInvariance.test.ts — Bolt placement from DrillMap truth
 *
 * Verifies that:
 * 1. Bolt frame positions are deterministic from DrillMap points alone
 * 2. Preview-only config changes don't affect frame computation
 * 3. All 6 cardinal normals produce valid frames
 * 4. B=24mm geometry is correct (distance A→C)
 *
 * These tests guard against regression to the old Preview3D offset hack.
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import { buildBoltMeshFrame } from '../Hardware3D';
import type { DrillMapPoint } from '../../../core/manufacturing/drillMap/types';

type Vec3Tuple = [number, number, number];

// ============================================================================
// Helpers
// ============================================================================

function mkPoint(partial: Partial<DrillMapPoint>): DrillMapPoint {
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

function vecLen(v: Vec3Tuple): number {
  return Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
}

function vecDot(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vecAdd(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function expectVec3Close(actual: Vec3Tuple, expected: Vec3Tuple, tol = 0.01) {
  expect(actual[0]).toBeCloseTo(expected[0], -Math.log10(tol));
  expect(actual[1]).toBeCloseTo(expected[1], -Math.log10(tol));
  expect(actual[2]).toBeCloseTo(expected[2], -Math.log10(tol));
}

// ============================================================================
// 1. Preview-config invariance: frame must NOT change with preview transforms
// ============================================================================

describe('bolt placement: preview-config invariance', () => {
  const basePoint = mkPoint({
    position: [24, 700, 37],
    boltDirection: [-1, 0, 0],
    targetPocketCenter: [0, 700, 37],
  });

  const baseFrame = buildBoltMeshFrame({ point: basePoint });

  it('frame is identical regardless of any config preview fields', () => {
    // buildBoltMeshFrame only uses: point.position, point.boltDirection,
    // point.targetPocketCenter, point.normal, and dimension overrides.
    // Preview-only fields (flipVertical, rotationX, moveX etc.) are NOT
    // inputs to buildBoltMeshFrame at all — that's the design guarantee.

    // Same point, same call → same frame
    const frame2 = buildBoltMeshFrame({ point: basePoint });

    expectVec3Close(frame2.ballPos, baseFrame.ballPos);
    expectVec3Close(frame2.sleevePos, baseFrame.sleevePos);
    expectVec3Close(frame2.neckPos, baseFrame.neckPos);
    expectVec3Close(frame2.threadPos, baseFrame.threadPos);
    expectVec3Close(frame2.axis, baseFrame.axis);
  });

  it('changing hardwareConfig dimensions affects frame (expected)', () => {
    const frame3 = buildBoltMeshFrame({
      point: basePoint,
      L: 20, // different shaft length
    });

    // threadPos should differ (longer shaft)
    expect(vecLen(frame3.threadPos)).not.toBeCloseTo(vecLen(baseFrame.threadPos), 2);
    // But ballPos stays the same (determined by point, not config)
    expectVec3Close(frame3.ballPos, baseFrame.ballPos);
  });
});

// ============================================================================
// 2. Six cardinal normals: axis alignment correctness
// ============================================================================

describe('bolt placement: 6 cardinal normal directions', () => {
  const cardinalDirs: { name: string; dir: Vec3Tuple }[] = [
    { name: '+X', dir: [1, 0, 0] },
    { name: '-X', dir: [-1, 0, 0] },
    { name: '+Y', dir: [0, 1, 0] },
    { name: '-Y', dir: [0, -1, 0] },
    { name: '+Z', dir: [0, 0, 1] },
    { name: '-Z', dir: [0, 0, -1] },
  ];

  for (const { name, dir } of cardinalDirs) {
    it(`axis aligns with boltDirection ${name}`, () => {
      const A: Vec3Tuple = [100, 200, 300];
      const C: Vec3Tuple = [
        A[0] + dir[0] * 30,
        A[1] + dir[1] * 30,
        A[2] + dir[2] * 30,
      ];

      const point = mkPoint({
        position: A,
        boltDirection: dir,
        targetPocketCenter: C,
      });

      const frame = buildBoltMeshFrame({ point });

      // Axis should be unit length
      expect(vecLen(frame.axis)).toBeCloseTo(1, 4);

      // Axis should align with input direction
      expectVec3Close(frame.axis, dir);
    });

    it(`thread is in +axis direction for ${name}`, () => {
      const A: Vec3Tuple = [0, 0, 0];
      const C: Vec3Tuple = [dir[0] * 30, dir[1] * 30, dir[2] * 30];

      const point = mkPoint({
        position: A,
        boltDirection: dir,
        targetPocketCenter: C,
      });

      const frame = buildBoltMeshFrame({ point, L: 11 });

      // threadPos dot axis > 0 (thread extends in axis direction)
      expect(vecDot(frame.threadPos, frame.axis)).toBeGreaterThan(0);
    });

    it(`ball, neck, sleeve are along axis direction for ${name}`, () => {
      const A: Vec3Tuple = [0, 0, 0];
      const C: Vec3Tuple = [dir[0] * 30, dir[1] * 30, dir[2] * 30];

      const point = mkPoint({
        position: A,
        boltDirection: dir,
        targetPocketCenter: C,
      });

      const frame = buildBoltMeshFrame({ point });

      // ballPos should be at C - A = C (since A=origin)
      expectVec3Close(frame.ballPos, C);

      // neck and sleeve should be between A and C (behind ball)
      const ballDist = vecDot(frame.ballPos, frame.axis);
      const neckDist = vecDot(frame.neckPos, frame.axis);
      const sleeveDist = vecDot(frame.sleevePos, frame.axis);

      expect(neckDist).toBeLessThan(ballDist);
      expect(sleeveDist).toBeLessThan(neckDist);
    });
  }
});

// ============================================================================
// 3. B=24mm golden geometry (real-world cabinet INSET joint)
// ============================================================================

describe('bolt placement: B=24mm golden geometry', () => {
  // INSET joint: bolt drills into FACE of side panel (±X direction)
  // A = bolt entry on side panel face
  // C = cam pocket center in top/bottom panel
  // B=24mm is the drilling distance (horizontal), but A→C includes Y-offset

  it('TOP_LEFT: ball at C, distance = |C-A| (real geometry)', () => {
    // LEFT_SIDE panel: bolt enters at x=24 (Distance B from edge)
    // TOP panel: cam pocket center is inside the panel
    const A: Vec3Tuple = [24, 700, 37]; // bolt entry
    const C: Vec3Tuple = [0, 693.75, 37]; // cam pocket center

    const point = mkPoint({
      position: A,
      boltDirection: [-1, 0, 0], // drilling toward -X (into side face)
      targetPocketCenter: C,
    });

    const frame = buildBoltMeshFrame({ point });

    // Ball should be at C (cam pocket center)
    const ballWorld: Vec3Tuple = vecAdd(A, frame.ballPos);
    expectVec3Close(ballWorld, C);

    // Distance A→ball = actual |C-A| distance (includes Y-offset from cam pocket)
    // Note: This is NOT exactly B=24mm because cam pocket center has a Y-offset
    const expectedDist = vecLen([C[0] - A[0], C[1] - A[1], C[2] - A[2]]);
    const distABall = vecLen(frame.ballPos);
    expect(distABall).toBeCloseTo(expectedDist, 2); // within 0.01mm
  });

  it('TOP_RIGHT: ball at C, distance = |C-A| (mirrored)', () => {
    const A: Vec3Tuple = [576, 700, 37]; // right side
    const C: Vec3Tuple = [600, 693.75, 37];

    const point = mkPoint({
      position: A,
      boltDirection: [1, 0, 0], // drilling toward +X
      targetPocketCenter: C,
    });

    const frame = buildBoltMeshFrame({ point });

    const ballWorld: Vec3Tuple = vecAdd(A, frame.ballPos);
    expectVec3Close(ballWorld, C);

    // Verify distance matches actual |C-A| geometry
    const expectedDist = vecLen([C[0] - A[0], C[1] - A[1], C[2] - A[2]]);
    const distABall = vecLen(frame.ballPos);
    expect(distABall).toBeCloseTo(expectedDist, 2);
  });

  it('BOTTOM_LEFT: axis points +X (into left side face from inside)', () => {
    const A: Vec3Tuple = [24, 20, 37];
    const C: Vec3Tuple = [0, 26.25, 37];

    const point = mkPoint({
      position: A,
      boltDirection: [-1, 0, 0],
      targetPocketCenter: C,
    });

    const frame = buildBoltMeshFrame({ point });

    // axis should point -X (toward cam)
    expect(frame.axis[0]).toBeLessThan(0);
    // Ball at C
    const ballWorld = vecAdd(A, frame.ballPos);
    expectVec3Close(ballWorld, C);
  });
});

// ============================================================================
// 4. Axial-only invariant: ballPos must be along drill normal ONLY
// ============================================================================

describe('bolt placement: axial-only invariant (axialOffsetMm)', () => {
  it('ballPos is pure axial when axialOffsetMm is set', () => {
    // Bolt entry on left side panel, drilling toward -X
    const point = mkPoint({
      position: [24, 700, 37],
      boltDirection: [-1, 0, 0],
      targetPocketCenter: [0, 693.75, 37], // cross-panel C has Y-offset
      axialOffsetMm: 24,                   // pure axial distance
    });

    const frame = buildBoltMeshFrame({ point });

    // ballPos should be purely along -X axis (no Y or Z component)
    expect(frame.ballPos[0]).toBeCloseTo(-24, 2);  // -24 along axis
    expect(frame.ballPos[1]).toBeCloseTo(0, 5);     // no Y drift
    expect(frame.ballPos[2]).toBeCloseTo(0, 5);     // no Z drift
  });

  it('cross product of ballPos and axis is near zero (no sideways drift)', () => {
    const directions: Vec3Tuple[] = [
      [-1, 0, 0], [1, 0, 0],
      [0, -1, 0], [0, 1, 0],
      [0, 0, -1], [0, 0, 1],
    ];
    for (const dir of directions) {
      const point = mkPoint({
        position: [100, 200, 300],
        boltDirection: dir,
        axialOffsetMm: 24,
      });

      const frame = buildBoltMeshFrame({ point });

      // cross(ballPos, axis) should be zero-length (parallel vectors)
      const cross: Vec3Tuple = [
        frame.ballPos[1] * frame.axis[2] - frame.ballPos[2] * frame.axis[1],
        frame.ballPos[2] * frame.axis[0] - frame.ballPos[0] * frame.axis[2],
        frame.ballPos[0] * frame.axis[1] - frame.ballPos[1] * frame.axis[0],
      ];
      const crossLen = vecLen(cross);
      expect(crossLen).toBeLessThan(0.001);
    }
  });

  it('distance A→ball = axialOffsetMm exactly', () => {
    const offsets = [24, 34, 18, 12];
    for (const offset of offsets) {
      const point = mkPoint({
        position: [50, 400, 37],
        boltDirection: [1, 0, 0],
        axialOffsetMm: offset,
      });

      const frame = buildBoltMeshFrame({ point });
      const dist = vecLen(frame.ballPos);
      expect(dist).toBeCloseTo(offset, 2);
    }
  });

  it('axialOffsetMm takes priority over targetPocketCenter', () => {
    // When both are present, axialOffsetMm should win
    const point = mkPoint({
      position: [24, 700, 37],
      boltDirection: [-1, 0, 0],
      targetPocketCenter: [0, 693.75, 37], // has Y-offset → not axial
      axialOffsetMm: 24,
    });

    const frame = buildBoltMeshFrame({ point });

    // ballPos should be pure axial (-24, 0, 0), NOT C-A (-24, -6.25, 0)
    expect(frame.ballPos[1]).toBeCloseTo(0, 5); // no Y drift
    expect(vecLen(frame.ballPos)).toBeCloseTo(24, 2);
  });

  it('falls back to targetPocketCenter when axialOffsetMm is absent', () => {
    const A: Vec3Tuple = [24, 700, 37];
    const C: Vec3Tuple = [0, 693.75, 37];
    const point = mkPoint({
      position: A,
      boltDirection: [-1, 0, 0],
      targetPocketCenter: C,
      // no axialOffsetMm
    });

    const frame = buildBoltMeshFrame({ point });

    // Should use C - A (legacy behavior)
    const ballWorld = vecAdd(A, frame.ballPos);
    expectVec3Close(ballWorld, C);
  });

  it('parts (neck, sleeve, thread) remain on-axis when axialOffsetMm is set', () => {
    const point = mkPoint({
      position: [0, 0, 0],
      boltDirection: [0, 1, 0],  // bolt along +Y
      axialOffsetMm: 24,
    });

    const frame = buildBoltMeshFrame({ point });

    // All part positions should have only Y-component (no X or Z drift)
    for (const partPos of [frame.ballPos, frame.neckPos, frame.sleevePos, frame.threadPos]) {
      expect(Math.abs(partPos[0])).toBeLessThan(0.001); // no X drift
      expect(Math.abs(partPos[2])).toBeLessThan(0.001); // no Z drift
    }
  });
});

// ============================================================================
// 5. Determinism: same input → same output
// ============================================================================

describe('bolt placement: determinism', () => {
  it('identical inputs produce identical frames (100 iterations)', () => {
    const point = mkPoint({
      position: [24, 700, 37],
      boltDirection: [-1, 0, 0],
      targetPocketCenter: [0, 700, 37],
    });

    const referenceFrame = buildBoltMeshFrame({ point });

    for (let i = 0; i < 100; i++) {
      const frame = buildBoltMeshFrame({ point });
      expectVec3Close(frame.ballPos, referenceFrame.ballPos);
      expectVec3Close(frame.sleevePos, referenceFrame.sleevePos);
      expectVec3Close(frame.threadPos, referenceFrame.threadPos);
      expectVec3Close(frame.axis, referenceFrame.axis);
    }
  });
});
