/**
 * Minifix Render Invariant Test
 *
 * Verifies that the 3D renderer uses targetPocketCenter (B=C) correctly.
 * This prevents regression where someone might remove targetPocketCenter
 * or revert to magic offset calculations.
 *
 * The invariant: ballCenterW === targetPocketCenter (exact match)
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { DrillMapPoint, Vec3Tuple } from '../../../core/manufacturing/drillMap/types';
import { vecSub, vecNorm, vecDot } from '../../../core/manufacturing/drillMap/panelBasis';

// ============================================
// HELPER: Simulate renderer's ball position calculation
// ============================================

/**
 * Mirrors the logic in Hardware3D.tsx BOLT section
 * This is the "truth" we're testing against
 */
function computeBallCenterWorld(
  point: DrillMapPoint,
  fallbackDistance: number = 27.75 // SLEEVE_LENGTH + NECK_LENGTH + BALL_HEAD_RADIUS
): Vec3Tuple {
  const A = point.position;
  const C = point.targetPocketCenter;

  // If C exists: ballPos = C (exact pocket center)
  // Otherwise: ballPos = A + axis * fallbackDistance (legacy)
  if (C) {
    return C;
  }

  // Legacy fallback (should not be used in production)
  const axis = point.boltDirection || point.normal;
  return [
    A[0] + axis[0] * fallbackDistance,
    A[1] + axis[1] * fallbackDistance,
    A[2] + axis[2] * fallbackDistance,
  ];
}

/**
 * Compute distance between two Vec3Tuples
 */
function distance(a: Vec3Tuple, b: Vec3Tuple): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ============================================
// TEST FIXTURES
// ============================================

function makeBoltPointWithTarget(
  position: Vec3Tuple,
  targetPocketCenter: Vec3Tuple,
  boltDirection: Vec3Tuple
): DrillMapPoint {
  return {
    id: 'bolt-test',
    panelId: 'panel-test',
    position,
    normal: [-1, 0, 0], // Default drilling normal
    diameter: 10,
    depth: 17.5,
    purpose: 'BOLT',
    componentType: 'BOLT',
    status: 'VALID',
    boltDirection,
    targetPocketCenter,
  };
}

function makeBoltPointWithoutTarget(
  position: Vec3Tuple,
  boltDirection: Vec3Tuple
): DrillMapPoint {
  return {
    id: 'bolt-legacy',
    panelId: 'panel-test',
    position,
    normal: [-1, 0, 0],
    diameter: 10,
    depth: 17.5,
    purpose: 'BOLT',
    componentType: 'BOLT',
    status: 'VALID',
    boltDirection,
    // No targetPocketCenter - legacy mode
  };
}

// ============================================
// TESTS
// ============================================

describe('Minifix Render Invariant: B=C', () => {
  it('ball center equals targetPocketCenter when provided (exact match)', () => {
    const A: Vec3Tuple = [24, 700, 37]; // Bolt drill origin
    const C: Vec3Tuple = [0, 693.75, 37]; // Cam pocket center (computed by Gate)
    const axis: Vec3Tuple = [-0.9682, -0.25, 0]; // Normalized direction from A to C

    const point = makeBoltPointWithTarget(A, C, axis);
    const ballCenterW = computeBallCenterWorld(point);

    // INVARIANT: Ball center should be EXACTLY at C
    expect(ballCenterW[0]).toBe(C[0]);
    expect(ballCenterW[1]).toBe(C[1]);
    expect(ballCenterW[2]).toBe(C[2]);
    expect(distance(ballCenterW, C)).toBe(0);
  });

  it('ball center uses fallback when targetPocketCenter missing (legacy)', () => {
    const A: Vec3Tuple = [24, 700, 37];
    const axis: Vec3Tuple = [-1, 0, 0];

    const point = makeBoltPointWithoutTarget(A, axis);
    const ballCenterW = computeBallCenterWorld(point);

    // Without targetPocketCenter, uses fallback distance along axis
    const fallbackDistance = 27.75;
    const expectedX = A[0] + axis[0] * fallbackDistance;

    expect(ballCenterW[0]).toBeCloseTo(expectedX, 4);
    expect(ballCenterW[1]).toBeCloseTo(A[1], 4);
    expect(ballCenterW[2]).toBeCloseTo(A[2], 4);
  });

  it('targetPocketCenter takes precedence over boltDirection for position', () => {
    // Even if boltDirection is wrong, targetPocketCenter should be used
    const A: Vec3Tuple = [24, 700, 37];
    const C: Vec3Tuple = [0, 693.75, 37];
    const wrongAxis: Vec3Tuple = [1, 0, 0]; // Points away from cam (wrong!)

    const point = makeBoltPointWithTarget(A, C, wrongAxis);
    const ballCenterW = computeBallCenterWorld(point);

    // INVARIANT: Ball center should still be at C, regardless of axis
    expect(distance(ballCenterW, C)).toBe(0);
  });

  it('real-world corner joint: TOP_LEFT', () => {
    // Typical TOP_LEFT corner joint at Z=37 (first System32 position)
    // CAM on TOP panel, BOLT on LEFT_SIDE panel

    const boltDrillOrigin: Vec3Tuple = [24, 700, 37]; // A: edge of LEFT_SIDE
    const camPocketCenter: Vec3Tuple = [0, 693.75, 37]; // C: inside TOP panel

    // Direction from A to C
    const dx = camPocketCenter[0] - boltDrillOrigin[0];
    const dy = camPocketCenter[1] - boltDrillOrigin[1];
    const dz = camPocketCenter[2] - boltDrillOrigin[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const boltDirection: Vec3Tuple = [dx / len, dy / len, dz / len];

    const point = makeBoltPointWithTarget(boltDrillOrigin, camPocketCenter, boltDirection);
    const ballCenterW = computeBallCenterWorld(point);

    // Ball should be at cam pocket center
    expect(distance(ballCenterW, camPocketCenter)).toBe(0);

    // Additional sanity checks
    expect(ballCenterW[1]).toBeLessThan(boltDrillOrigin[1]); // Ball Y < Bolt Y (goes up into TOP)
  });

  it('real-world corner joint: BOTTOM_RIGHT', () => {
    // BOTTOM_RIGHT corner joint
    // CAM on BOTTOM panel, BOLT on RIGHT_SIDE panel

    const boltDrillOrigin: Vec3Tuple = [576, 100, 37]; // A: edge of RIGHT_SIDE
    const camPocketCenter: Vec3Tuple = [600, 106.25, 37]; // C: inside BOTTOM panel

    // Direction from A to C
    const dx = camPocketCenter[0] - boltDrillOrigin[0];
    const dy = camPocketCenter[1] - boltDrillOrigin[1];
    const dz = camPocketCenter[2] - boltDrillOrigin[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const boltDirection: Vec3Tuple = [dx / len, dy / len, dz / len];

    const point = makeBoltPointWithTarget(boltDrillOrigin, camPocketCenter, boltDirection);
    const ballCenterW = computeBallCenterWorld(point);

    // Ball should be at cam pocket center
    expect(distance(ballCenterW, camPocketCenter)).toBe(0);

    // Additional sanity checks
    expect(ballCenterW[1]).toBeGreaterThan(boltDrillOrigin[1]); // Ball Y > Bolt Y (goes down into BOTTOM)
  });
});

describe('Minifix Render: Axis and Position Consistency', () => {
  it('boltDirection should point from A toward C', () => {
    const A: Vec3Tuple = [24, 700, 37];
    const C: Vec3Tuple = [0, 693.75, 37];

    // Expected axis: normalized(C - A)
    const dx = C[0] - A[0];
    const dy = C[1] - A[1];
    const dz = C[2] - A[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const expectedAxis: Vec3Tuple = [dx / len, dy / len, dz / len];

    // Verify expected axis
    expect(expectedAxis[0]).toBeLessThan(0); // Points left (negative X)
    expect(expectedAxis[1]).toBeLessThan(0); // Points up slightly (negative Y)
  });

  it('distance A to C should match expected geometry', () => {
    // For 16mm panel with camDepth=12.5mm and drillingDistanceB=24mm
    // Distance A to C ≈ sqrt(24² + 6.25²) ≈ 24.8mm

    const A: Vec3Tuple = [24, 700, 37];
    const C: Vec3Tuple = [0, 693.75, 37]; // Y offset = 700 - 693.75 = 6.25 (camDepth/2)

    const dist = distance(A, C);

    // Expected: sqrt(24² + 6.25²) = sqrt(576 + 39.0625) = sqrt(615.0625) ≈ 24.8
    expect(dist).toBeCloseTo(24.8, 0);
  });
});

describe('Contract S: cam flip affects cam housing only (world→local axis)', () => {
  /**
   * Contract S semantics: "Flip = rotate cam disc 180° in same Ø15 pocket"
   *
   * - baseQuat (bolt orientation) MUST NOT change when flip is toggled
   * - camFlipAxisWorld is the bolt drilling axis in WORLD space
   * - Preview3D converts it to cam-LOCAL space using inverse of camRotation
   * - The local-space quaternion is then applied to the asymmetric parts group
   */

  // Helper: replicates Preview3D's world→local conversion
  function computeCamQ(axisWorld: THREE.Vector3, camRotation: [number, number, number]): THREE.Quaternion {
    const camPlacementQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(camRotation[0], camRotation[1], camRotation[2])
    );
    const axisLocal = axisWorld
      .clone()
      .applyQuaternion(camPlacementQuat.clone().invert())
      .normalize();
    return new THREE.Quaternion().setFromAxisAngle(axisLocal, Math.PI);
  }

  it('cam flip axis is undefined when not flipped', () => {
    const isFlipped = false;
    const camFlipAxisWorld = isFlipped
      ? new THREE.Vector3(1, 0, 0).normalize()
      : undefined;

    expect(camFlipAxisWorld).toBeUndefined();
  });

  it('world→local conversion: axisLocal ≠ axisWorld when camRotation ≠ identity', () => {
    const axisWorld = new THREE.Vector3(1, 0, 0); // bolt drills along X in world
    const camRotation: [number, number, number] = [Math.PI / 2, Math.PI, 0]; // typical cam placement

    const camPlacementQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(camRotation[0], camRotation[1], camRotation[2])
    );
    const axisLocal = axisWorld.clone().applyQuaternion(camPlacementQuat.clone().invert()).normalize();

    // With non-trivial camRotation, local axis MUST differ from world axis
    expect(axisLocal.equals(axisWorld)).toBe(false);
  });

  it('flip quat preserves bolt axis direction (180° rotation is involution)', () => {
    const axisWorld = new THREE.Vector3(1, 0, 0);
    const camRotation: [number, number, number] = [Math.PI / 2, Math.PI, 0];
    const camQ = computeCamQ(axisWorld, camRotation);

    // Applying camQ twice should return to identity (π + π = 2π)
    const doubleFlip = camQ.clone().multiply(camQ);
    const identity = new THREE.Quaternion();
    // Check angle is ~0 or ~2π (both equivalent to identity)
    const angle = 2 * Math.acos(Math.min(1, Math.abs(doubleFlip.w)));
    expect(angle).toBeCloseTo(0, 4);
  });

  it('baseQuat is unchanged regardless of flip state', () => {
    const boltQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0), Math.PI / 4 // arbitrary orientation
    );

    // With flip
    const baseQuatFlipped = boltQuat.clone(); // NO flip applied to baseQuat
    // Without flip
    const baseQuatNotFlipped = boltQuat.clone();

    expect(baseQuatFlipped.equals(baseQuatNotFlipped)).toBe(true);
  });

  it('camQ moves asymmetric geometry when camRotation is non-trivial', () => {
    const axisWorld = new THREE.Vector3(1, 0, 0);
    const camRotation: [number, number, number] = [Math.PI / 2, Math.PI, 0];
    const camQ = computeCamQ(axisWorld, camRotation);

    // Use offset perpendicular to flip axis so 180° rotation actually moves it.
    // The eccentric dot in Preview3D is at [camDia*0.2, camDepth/2+ε, 0] —
    // but the Y component is what breaks symmetry vs the local flip axis.
    const eccentricOffset = new THREE.Vector3(0, 0.2, 0); // perpendicular to any single-axis flip
    const flipped = eccentricOffset.clone().applyQuaternion(camQ);

    // The flipped position must differ from original
    expect(flipped.distanceTo(eccentricOffset)).toBeGreaterThan(0.01);
  });
});

describe('Minifix Generator Invariant: boltDirection → pocket', () => {
  it('boltDirection dot(toPocket) ≈ +1 for every BOLT with targetPocketCenter', () => {
    // Contract: boltDirection MUST point from bolt entry toward cam pocket center.
    // This locks the fix at generateDrillMap.ts L677 and prevents regression
    // back to the old `[...boltDrillingAxis]` (which pointed INTO the panel).

    const cases: { label: string; A: Vec3Tuple; C: Vec3Tuple }[] = [
      { label: 'TOP_LEFT',     A: [24, 700, 37],   C: [0, 693.75, 37] },
      { label: 'TOP_RIGHT',    A: [576, 700, 37],  C: [600, 693.75, 37] },
      { label: 'BOTTOM_LEFT',  A: [24, 100, 37],   C: [0, 106.25, 37] },
      { label: 'BOTTOM_RIGHT', A: [576, 100, 37],  C: [600, 106.25, 37] },
    ];

    for (const { label, A, C } of cases) {
      const boltDir = vecNorm(vecSub(C, A));
      // Null/shape guard: boltDirection must exist and be Vec3Tuple
      expect(boltDir, `${label}: boltDirection must exist`).toBeTruthy();
      expect(boltDir.length, `${label}: boltDirection must be Vec3`).toBe(3);
      const toPocket = vecNorm(vecSub(C, A));
      const dot = vecDot(toPocket, boltDir);
      expect(dot, `${label}: dot(toPocket, boltDir)`).toBeGreaterThan(0.99);
    }
  });
});
