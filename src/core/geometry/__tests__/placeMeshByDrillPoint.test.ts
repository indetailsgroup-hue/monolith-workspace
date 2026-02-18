/**
 * placeMeshByDrillPoint.test.ts — Golden alignment tests for anchor-based placement
 *
 * Verifies that hardware meshes are positioned correctly when placed
 * using AnchorSpec + DrillMap points.
 *
 * Tolerance: ±0.01mm (manufacturing precision) for positions,
 *            ±0.001 rad for angles.
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  placeMeshByDrillPoint,
  placeMeshByDrillPointQuat,
  _internals,
  type Quat4,
} from '../placeMeshByDrillPoint';
import type { AnchorSpec, Vec3Tuple } from '../anchorTypes';
import {
  createCamAnchor,
  createCamPocketCenterAnchor,
  createBoltEntryAnchor,
  createDowelAnchor,
  DEFAULT_MINIFIX_ANCHORS,
} from '../../manufacturing/hardware/anchors/minifixAnchors';

// ============================================================================
// Helpers
// ============================================================================

const POS_TOL = 0.01;   // mm position tolerance
const ANG_TOL = 0.001;  // rad angle tolerance
const QUAT_TOL = 1e-6;  // quaternion component tolerance

function expectVec3Close(actual: Vec3Tuple, expected: Vec3Tuple, tol = POS_TOL) {
  expect(actual[0]).toBeCloseTo(expected[0], -Math.log10(tol));
  expect(actual[1]).toBeCloseTo(expected[1], -Math.log10(tol));
  expect(actual[2]).toBeCloseTo(expected[2], -Math.log10(tol));
}

function expectQuatClose(actual: Quat4, expected: Quat4, tol = QUAT_TOL) {
  // Quaternions q and -q represent the same rotation
  const sign = Math.sign(actual[3]) === Math.sign(expected[3]) ? 1 : -1;
  expect(actual[0] * sign).toBeCloseTo(expected[0], -Math.log10(tol));
  expect(actual[1] * sign).toBeCloseTo(expected[1], -Math.log10(tol));
  expect(actual[2] * sign).toBeCloseTo(expected[2], -Math.log10(tol));
  expect(actual[3] * sign).toBeCloseTo(expected[3], -Math.log10(tol));
}

/** Length of a vector */
function vecLen(v: Vec3Tuple): number {
  return Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
}

// ============================================================================
// Internal Math Tests
// ============================================================================

describe('_internals: vector math', () => {
  it('dot product', () => {
    expect(_internals.dot([1, 0, 0], [0, 1, 0])).toBe(0);
    expect(_internals.dot([1, 0, 0], [1, 0, 0])).toBe(1);
    expect(_internals.dot([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it('cross product', () => {
    expectVec3Close(_internals.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
    expectVec3Close(_internals.cross([0, 1, 0], [1, 0, 0]), [0, 0, -1]);
    expectVec3Close(_internals.cross([1, 0, 0], [1, 0, 0]), [0, 0, 0]);
  });

  it('normalize', () => {
    const n = _internals.normalize([3, 0, 0]);
    expectVec3Close(n, [1, 0, 0]);
    expect(vecLen(n)).toBeCloseTo(1, 6);
  });

  it('normalize zero vector returns [0,1,0]', () => {
    expectVec3Close(_internals.normalize([0, 0, 0]), [0, 1, 0]);
  });
});

describe('_internals: quaternion math', () => {
  it('identity rotation (same vectors)', () => {
    const q = _internals.quatFromUnitVectors([0, 1, 0], [0, 1, 0]);
    expectQuatClose(q, [0, 0, 0, 1]);
  });

  it('90° rotation: +Y → +X', () => {
    const q = _internals.quatFromUnitVectors([0, 1, 0], [1, 0, 0]);
    // Rotating [0,1,0] by q should give [1,0,0]
    const rotated = _internals.rotateByQuat([0, 1, 0], q);
    expectVec3Close(rotated, [1, 0, 0]);
  });

  it('90° rotation: +Y → +Z', () => {
    const q = _internals.quatFromUnitVectors([0, 1, 0], [0, 0, 1]);
    const rotated = _internals.rotateByQuat([0, 1, 0], q);
    expectVec3Close(rotated, [0, 0, 1]);
  });

  it('180° rotation: +Y → -Y (anti-parallel)', () => {
    const q = _internals.quatFromUnitVectors([0, 1, 0], [0, -1, 0]);
    const rotated = _internals.rotateByQuat([0, 1, 0], q);
    expectVec3Close(rotated, [0, -1, 0]);
  });

  it('rotation: -Y → +X', () => {
    const q = _internals.quatFromUnitVectors([0, -1, 0], [1, 0, 0]);
    const rotated = _internals.rotateByQuat([0, -1, 0], q);
    expectVec3Close(rotated, [1, 0, 0]);
  });

  it('rotateByQuat preserves vector length', () => {
    const v: Vec3Tuple = [3, 4, 5];
    const q = _internals.quatFromUnitVectors([0, 1, 0], [1, 0, 0]);
    const rotated = _internals.rotateByQuat(v, q);
    expect(vecLen(rotated)).toBeCloseTo(vecLen(v), 6);
  });

  it('quatToEulerXYZ: identity gives zero Euler', () => {
    const euler = _internals.quatToEulerXYZ([0, 0, 0, 1]);
    expectVec3Close(euler, [0, 0, 0], ANG_TOL);
  });
});

// ============================================================================
// CAM Housing Placement (Golden Tests)
// ============================================================================

describe('placeMeshByDrillPoint: CAM Housing', () => {
  const camAnchor = DEFAULT_MINIFIX_ANCHORS.cam; // depth=13.5

  it('drill into +X face: anchor point lands at drill position', () => {
    // Drill entry at [100, 400, 37], normal into +X (left side panel inner face)
    const drillPos: Vec3Tuple = [100, 400, 37];
    const drillNormal: Vec3Tuple = [1, 0, 0];

    const result = placeMeshByDrillPoint(drillPos, drillNormal, camAnchor);

    // The anchor point (rim of cam) should be at drillPos
    // localAnchor = [0, 6.75, 0] (depth/2 = 13.5/2)
    // After rotation from -Y → +X:
    //   [0, 6.75, 0] rotated to align -Y→+X ≈ [-6.75, 0, 0]
    // worldPos = drillPos - rotatedAnchor = [100+6.75, 400, 37] = [106.75, 400, 37]
    // The cam center should be 6.75mm deeper into the material

    // Verify: drill entry is at drillPos
    // Cam center = worldPos, which is offset from drill entry
    // Most importantly, verify the anchor point maps correctly
    const q = _internals.quatFromUnitVectors(
      _internals.normalize(camAnchor.localAxis),
      _internals.normalize(drillNormal),
    );
    const anchorRotated = _internals.rotateByQuat(camAnchor.localAnchor, q);
    const reconstructedDrillPos: Vec3Tuple = [
      result.worldPos[0] + anchorRotated[0],
      result.worldPos[1] + anchorRotated[1],
      result.worldPos[2] + anchorRotated[2],
    ];
    expectVec3Close(reconstructedDrillPos, drillPos);
  });

  it('drill into -X face: cam placed correctly', () => {
    const drillPos: Vec3Tuple = [500, 400, 37];
    const drillNormal: Vec3Tuple = [-1, 0, 0];

    const result = placeMeshByDrillPoint(drillPos, drillNormal, camAnchor);

    // Reconstruct: anchor point should land at drillPos
    const q = _internals.quatFromUnitVectors(
      _internals.normalize(camAnchor.localAxis),
      _internals.normalize(drillNormal),
    );
    const anchorRotated = _internals.rotateByQuat(camAnchor.localAnchor, q);
    const reconstructed: Vec3Tuple = [
      result.worldPos[0] + anchorRotated[0],
      result.worldPos[1] + anchorRotated[1],
      result.worldPos[2] + anchorRotated[2],
    ];
    expectVec3Close(reconstructed, drillPos);
  });

  it('drill into +Y face (top): cam placed correctly', () => {
    const drillPos: Vec3Tuple = [300, 720, 37];
    const drillNormal: Vec3Tuple = [0, 1, 0];

    const result = placeMeshByDrillPoint(drillPos, drillNormal, camAnchor);

    const q = _internals.quatFromUnitVectors(
      _internals.normalize(camAnchor.localAxis),
      [0, 1, 0],
    );
    const anchorRotated = _internals.rotateByQuat(camAnchor.localAnchor, q);
    const reconstructed: Vec3Tuple = [
      result.worldPos[0] + anchorRotated[0],
      result.worldPos[1] + anchorRotated[1],
      result.worldPos[2] + anchorRotated[2],
    ];
    expectVec3Close(reconstructed, drillPos);
  });

  it('cam pocket center anchor: worldPos = drillPos (zero anchor offset)', () => {
    const pocketAnchor = DEFAULT_MINIFIX_ANCHORS.camPocketCenter;
    const drillPos: Vec3Tuple = [100, 400, 37];
    const drillNormal: Vec3Tuple = [1, 0, 0];

    const result = placeMeshByDrillPoint(drillPos, drillNormal, pocketAnchor);

    // localAnchor = [0,0,0] → rotatedAnchor = [0,0,0]
    // So worldPos = drillPos exactly
    expectVec3Close(result.worldPos, drillPos);
  });

  it('cam center is halfDepth from drill entry along normal', () => {
    const drillPos: Vec3Tuple = [100, 400, 37];
    const drillNormal: Vec3Tuple = [1, 0, 0];
    const depth = 13.5;
    const halfDepth = depth / 2;

    const surfaceResult = placeMeshByDrillPoint(drillPos, drillNormal, camAnchor);

    // The mesh center should be halfDepth along the normal from drillPos
    const expectedCenter: Vec3Tuple = [
      drillPos[0] + halfDepth,
      drillPos[1],
      drillPos[2],
    ];
    expectVec3Close(surfaceResult.worldPos, expectedCenter);
  });
});

// ============================================================================
// Bolt Placement (Golden Tests)
// ============================================================================

describe('placeMeshByDrillPoint: Bolt Entry', () => {
  const boltAnchor = DEFAULT_MINIFIX_ANCHORS.bolt;

  it('bolt entry at drillPos: worldPos = drillPos (zero anchor)', () => {
    const drillPos: Vec3Tuple = [9, 0, 37];
    const drillNormal: Vec3Tuple = [0, 1, 0]; // bolt direction toward cam

    const result = placeMeshByDrillPoint(drillPos, drillNormal, boltAnchor);

    // localAnchor = [0,0,0] → worldPos = drillPos
    expectVec3Close(result.worldPos, drillPos);
  });

  it('bolt axis aligns with drill normal', () => {
    const drillPos: Vec3Tuple = [9, 0, 37];
    const drillNormal: Vec3Tuple = [0, 1, 0];

    const resultQ = placeMeshByDrillPointQuat(drillPos, drillNormal, boltAnchor);

    // localAxis = [0,1,0], drillNormal = [0,1,0] → identity rotation
    expectQuatClose(resultQ.worldQuat, [0, 0, 0, 1]);
  });

  it('bolt into +X direction', () => {
    const drillPos: Vec3Tuple = [0, 400, 37];
    const drillNormal: Vec3Tuple = [1, 0, 0];

    const resultQ = placeMeshByDrillPointQuat(drillPos, drillNormal, boltAnchor);

    // Verify: rotating model +Y by quat gives +X (drill normal)
    const modelY: Vec3Tuple = [0, 1, 0];
    const rotated = _internals.rotateByQuat(modelY, resultQ.worldQuat);
    expectVec3Close(rotated, [1, 0, 0]);
  });
});

// ============================================================================
// Dowel Placement (Golden Tests)
// ============================================================================

describe('placeMeshByDrillPoint: Dowel', () => {
  it('face bore dowel: top of dowel at drill entry', () => {
    const dowelFace = DEFAULT_MINIFIX_ANCHORS.dowelFace; // insertionDepth=12
    const drillPos: Vec3Tuple = [100, 400, 37];
    const drillNormal: Vec3Tuple = [1, 0, 0]; // into face

    const result = placeMeshByDrillPoint(drillPos, drillNormal, dowelFace);

    // localAnchor = [0, 6, 0] (12/2 = 6)
    // After rotation -Y → +X, anchor rotates to [-6, 0, 0]
    // worldPos = [100 - (-6), 400, 37] = [106, 400, 37]
    // Dowel center is 6mm inside the material
    const expectedCenter: Vec3Tuple = [106, 400, 37];
    expectVec3Close(result.worldPos, expectedCenter);

    // Verify anchor point reconstruction
    const q = _internals.quatFromUnitVectors(
      _internals.normalize(dowelFace.localAxis),
      _internals.normalize(drillNormal),
    );
    const anchorRotated = _internals.rotateByQuat(dowelFace.localAnchor, q);
    const reconstructed: Vec3Tuple = [
      result.worldPos[0] + anchorRotated[0],
      result.worldPos[1] + anchorRotated[1],
      result.worldPos[2] + anchorRotated[2],
    ];
    expectVec3Close(reconstructed, drillPos);
  });

  it('edge bore dowel: deeper insertion than face bore', () => {
    const dowelEdge = DEFAULT_MINIFIX_ANCHORS.dowelEdge; // insertionDepth=18
    const drillPos: Vec3Tuple = [0, 720, 37];
    const drillNormal: Vec3Tuple = [0, -1, 0]; // into top edge

    const result = placeMeshByDrillPoint(drillPos, drillNormal, dowelEdge);

    // localAnchor = [0, 9, 0] (18/2)
    // After rotation -Y → -Y (identity for localAxis -Y → drillNormal -Y):
    // Actually: localAxis = [0,-1,0], drillNormal = [0,-1,0] → identity
    // rotatedAnchor = [0, 9, 0]
    // worldPos = [0 - 0, 720 - 9, 37 - 0] = [0, 711, 37]
    expectVec3Close(result.worldPos, [0, 711, 37]);
  });
});

// ============================================================================
// Axis Alignment Invariants (Critical for Manufacturing)
// ============================================================================

describe('axis alignment invariants', () => {
  const testDirections: Vec3Tuple[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  for (const dir of testDirections) {
    it(`cam localAxis aligns with drill normal [${dir}]`, () => {
      const camAnchor = DEFAULT_MINIFIX_ANCHORS.cam;
      const resultQ = placeMeshByDrillPointQuat([0, 0, 0], dir, camAnchor);

      // cam localAxis = [0, -1, 0]
      // After rotation, it should align with drillNormal
      const rotatedAxis = _internals.rotateByQuat(camAnchor.localAxis, resultQ.worldQuat);
      expectVec3Close(rotatedAxis, dir);
    });

    it(`bolt localAxis aligns with drill normal [${dir}]`, () => {
      const boltAnchor = DEFAULT_MINIFIX_ANCHORS.bolt;
      const resultQ = placeMeshByDrillPointQuat([0, 0, 0], dir, boltAnchor);

      const rotatedAxis = _internals.rotateByQuat(boltAnchor.localAxis, resultQ.worldQuat);
      expectVec3Close(rotatedAxis, dir);
    });
  }

  it('anchor point invariant: reconstructed drill pos matches input', () => {
    // For any drillPos, normal, and anchor:
    // worldPos + rotate(localAnchor, quat) === drillPos
    const anchors = [
      DEFAULT_MINIFIX_ANCHORS.cam,
      DEFAULT_MINIFIX_ANCHORS.camPocketCenter,
      DEFAULT_MINIFIX_ANCHORS.bolt,
      DEFAULT_MINIFIX_ANCHORS.dowelFace,
      DEFAULT_MINIFIX_ANCHORS.dowelEdge,
    ];

    const testCases: { pos: Vec3Tuple; normal: Vec3Tuple }[] = [
      { pos: [100, 400, 37], normal: [1, 0, 0] },
      { pos: [500, 400, 37], normal: [-1, 0, 0] },
      { pos: [300, 720, 69], normal: [0, -1, 0] },
      { pos: [300, 0, 69], normal: [0, 1, 0] },
      { pos: [300, 400, 0], normal: [0, 0, 1] },
      { pos: [300, 400, 560], normal: [0, 0, -1] },
    ];

    for (const anchor of anchors) {
      for (const { pos, normal } of testCases) {
        const resultQ = placeMeshByDrillPointQuat(pos, normal, anchor);
        const anchorRotated = _internals.rotateByQuat(anchor.localAnchor, resultQ.worldQuat);
        const reconstructed: Vec3Tuple = [
          resultQ.worldPos[0] + anchorRotated[0],
          resultQ.worldPos[1] + anchorRotated[1],
          resultQ.worldPos[2] + anchorRotated[2],
        ];
        expectVec3Close(reconstructed, pos);
      }
    }
  });
});

// ============================================================================
// Euler ↔ Quaternion Consistency
// ============================================================================

describe('placeMeshByDrillPoint vs placeMeshByDrillPointQuat consistency', () => {
  const cases: { pos: Vec3Tuple; normal: Vec3Tuple }[] = [
    { pos: [100, 400, 37], normal: [1, 0, 0] },
    { pos: [500, 400, 37], normal: [-1, 0, 0] },
    { pos: [300, 720, 69], normal: [0, -1, 0] },
  ];

  for (const { pos, normal } of cases) {
    it(`worldPos matches for normal [${normal}]`, () => {
      const anchor = DEFAULT_MINIFIX_ANCHORS.cam;
      const euler = placeMeshByDrillPoint(pos, normal, anchor);
      const quat = placeMeshByDrillPointQuat(pos, normal, anchor);

      expectVec3Close(euler.worldPos, quat.worldPos);
    });
  }
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  it('zero localAnchor: worldPos equals drillPos', () => {
    const anchor: AnchorSpec = {
      label: 'TEST_ZERO',
      localAxis: [0, 1, 0],
      localAnchor: [0, 0, 0],
    };
    const result = placeMeshByDrillPoint([100, 200, 300], [0, 0, 1], anchor);
    expectVec3Close(result.worldPos, [100, 200, 300]);
  });

  it('same localAxis as drillNormal: no rotation needed', () => {
    const anchor: AnchorSpec = {
      label: 'TEST_SAME_DIR',
      localAxis: [0, 1, 0],
      localAnchor: [0, 5, 0],
    };
    const result = placeMeshByDrillPoint([100, 200, 300], [0, 1, 0], anchor);
    // No rotation, so anchor [0,5,0] stays [0,5,0]
    // worldPos = [100, 200-5, 300] = [100, 195, 300]
    expectVec3Close(result.worldPos, [100, 195, 300]);
  });

  it('anti-parallel: 180° flip', () => {
    const anchor: AnchorSpec = {
      label: 'TEST_FLIP',
      localAxis: [0, 1, 0],
      localAnchor: [0, 5, 0],
    };
    const result = placeMeshByDrillPoint([100, 200, 300], [0, -1, 0], anchor);

    // After 180° rotation, [0,5,0] → [0,-5,0]
    // worldPos = [100, 200-(-5), 300] = [100, 205, 300]
    expectVec3Close(result.worldPos, [100, 205, 300]);
  });

  it('custom anchor with non-standard values', () => {
    const anchor: AnchorSpec = {
      label: 'CUSTOM',
      localAxis: [0, 0, -1], // model's -Z aligns with drill
      localAnchor: [0, 0, -10], // 10mm from origin along -Z
    };
    const drillPos: Vec3Tuple = [200, 300, 400];
    const drillNormal: Vec3Tuple = [0, 0, 1]; // into +Z

    const resultQ = placeMeshByDrillPointQuat(drillPos, drillNormal, anchor);

    // Verify axis alignment
    const rotatedAxis = _internals.rotateByQuat(anchor.localAxis, resultQ.worldQuat);
    expectVec3Close(rotatedAxis, [0, 0, 1]);

    // Verify anchor point reconstruction
    const anchorRotated = _internals.rotateByQuat(anchor.localAnchor, resultQ.worldQuat);
    const reconstructed: Vec3Tuple = [
      resultQ.worldPos[0] + anchorRotated[0],
      resultQ.worldPos[1] + anchorRotated[1],
      resultQ.worldPos[2] + anchorRotated[2],
    ];
    expectVec3Close(reconstructed, drillPos);
  });
});
