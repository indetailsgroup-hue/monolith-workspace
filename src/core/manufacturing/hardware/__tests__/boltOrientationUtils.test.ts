/**
 * Tests for boltOrientationUtils.ts
 *
 * These tests verify the unified bolt orientation calculation that uses:
 * - boltDir = drilling axis (NOT bolt→cam vector)
 * - boltPanelNormal = SIDE panel normal (±X), NOT TOP/BOTTOM (±Y)
 * - seamDir = cross(boltPanelNormal, boltDir) → joint edge direction
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  safeNormalize,
  isZeroVector,
  projectOntoPlane,
  signedAngleAroundAxis,
  selectBoltPanelNormalWorld,
  computeSeamDirWorld,
  computeSeamPerpWorld,
  computeBoltQuatBase,
  computeBoltQuatWithTwist,
  assertOrientation,
  getDrillingAxis,
  validateFrontViewOrientation,
  validateSideViewOrientation,
  WORLD,
  BOLT_MODEL,
  type Corner,
  type MountType,
} from '../boltOrientationUtils';

describe('boltOrientationUtils', () => {
  describe('safeNormalize', () => {
    it('normalizes non-zero vectors', () => {
      const v = new THREE.Vector3(3, 0, 4);
      const result = safeNormalize(v);
      expect(result.length()).toBeCloseTo(1, 5);
      expect(result.x).toBeCloseTo(0.6, 5);
      expect(result.z).toBeCloseTo(0.8, 5);
    });

    it('throws on zero-length vector', () => {
      const v = new THREE.Vector3(0, 0, 0);
      expect(() => safeNormalize(v, 'test')).toThrow('zero-length vector');
    });
  });

  describe('isZeroVector', () => {
    it('returns true for zero vector', () => {
      expect(isZeroVector(new THREE.Vector3(0, 0, 0))).toBe(true);
    });

    it('returns true for very small vector', () => {
      expect(isZeroVector(new THREE.Vector3(1e-8, 1e-8, 1e-8))).toBe(true);
    });

    it('returns false for non-zero vector', () => {
      expect(isZeroVector(new THREE.Vector3(1, 0, 0))).toBe(false);
    });
  });

  describe('projectOntoPlane', () => {
    it('projects vector onto XY plane (perpendicular to Z)', () => {
      const v = new THREE.Vector3(1, 2, 3);
      const zAxis = new THREE.Vector3(0, 0, 1);
      const result = projectOntoPlane(v, zAxis);
      expect(result.x).toBeCloseTo(1, 5);
      expect(result.y).toBeCloseTo(2, 5);
      expect(result.z).toBeCloseTo(0, 5);
    });

    it('returns zero for vector parallel to axis', () => {
      const v = new THREE.Vector3(0, 0, 5);
      const zAxis = new THREE.Vector3(0, 0, 1);
      const result = projectOntoPlane(v, zAxis);
      expect(isZeroVector(result)).toBe(true);
    });
  });

  describe('signedAngleAroundAxis', () => {
    it('returns 0 for identical vectors', () => {
      const a = new THREE.Vector3(1, 0, 0);
      const b = new THREE.Vector3(1, 0, 0);
      const axis = new THREE.Vector3(0, 1, 0);
      expect(signedAngleAroundAxis(a, b, axis)).toBeCloseTo(0, 5);
    });

    it('returns PI/2 for 90° rotation (counter-clockwise)', () => {
      const a = new THREE.Vector3(1, 0, 0);
      const b = new THREE.Vector3(0, 0, -1);
      const axis = new THREE.Vector3(0, 1, 0);
      expect(signedAngleAroundAxis(a, b, axis)).toBeCloseTo(Math.PI / 2, 4);
    });

    it('returns -PI/2 for 90° rotation (clockwise)', () => {
      const a = new THREE.Vector3(1, 0, 0);
      const b = new THREE.Vector3(0, 0, 1);
      const axis = new THREE.Vector3(0, 1, 0);
      expect(signedAngleAroundAxis(a, b, axis)).toBeCloseTo(-Math.PI / 2, 4);
    });

    it('returns 0 for degenerate case (vectors parallel to axis)', () => {
      const a = new THREE.Vector3(0, 1, 0);
      const b = new THREE.Vector3(0, 1, 0);
      const axis = new THREE.Vector3(0, 1, 0);
      expect(signedAngleAroundAxis(a, b, axis)).toBe(0);
    });
  });

  describe('selectBoltPanelNormalWorld', () => {
    it('returns +X for TOP_LEFT (left side panel)', () => {
      const result = selectBoltPanelNormalWorld('TOP_LEFT');
      expect(result.x).toBe(1);
      expect(result.y).toBe(0);
      expect(result.z).toBe(0);
    });

    it('returns +X for BOTTOM_LEFT (left side panel)', () => {
      const result = selectBoltPanelNormalWorld('BOTTOM_LEFT');
      expect(result.x).toBe(1);
      expect(result.y).toBe(0);
      expect(result.z).toBe(0);
    });

    it('returns -X for TOP_RIGHT (right side panel)', () => {
      const result = selectBoltPanelNormalWorld('TOP_RIGHT');
      expect(result.x).toBe(-1);
      expect(result.y).toBe(0);
      expect(result.z).toBe(0);
    });

    it('returns -X for BOTTOM_RIGHT (right side panel)', () => {
      const result = selectBoltPanelNormalWorld('BOTTOM_RIGHT');
      expect(result.x).toBe(-1);
      expect(result.y).toBe(0);
      expect(result.z).toBe(0);
    });
  });

  describe('getDrillingAxis', () => {
    describe('OVERLAY mode (default) - vertical Y-axis drilling', () => {
      it('returns -Y for TOP_LEFT (drill down)', () => {
        const result = getDrillingAxis('TOP_LEFT', 'OVERLAY');
        expect(result.x).toBe(0);
        expect(result.y).toBe(-1);
        expect(result.z).toBe(0);
      });

      it('returns -Y for TOP_RIGHT (drill down)', () => {
        const result = getDrillingAxis('TOP_RIGHT', 'OVERLAY');
        expect(result.y).toBe(-1);
      });

      it('returns +Y for BOTTOM_LEFT (drill up)', () => {
        const result = getDrillingAxis('BOTTOM_LEFT', 'OVERLAY');
        expect(result.y).toBe(1);
      });

      it('returns +Y for BOTTOM_RIGHT (drill up)', () => {
        const result = getDrillingAxis('BOTTOM_RIGHT', 'OVERLAY');
        expect(result.y).toBe(1);
      });

      it('defaults to OVERLAY when jointType not specified', () => {
        const result = getDrillingAxis('TOP_LEFT');
        expect(result.y).toBe(-1);
      });
    });

    describe('INSET mode - horizontal X-axis drilling', () => {
      // INSET: Origin at Cam (Shelf) → bolt head points OUT toward Side Panel
      it('returns -X for TOP_LEFT (bolt head points toward left panel)', () => {
        const result = getDrillingAxis('TOP_LEFT', 'INSET');
        expect(result.x).toBe(-1);
        expect(result.y).toBe(0);
        expect(result.z).toBe(0);
      });

      it('returns -X for BOTTOM_LEFT (bolt head points toward left panel)', () => {
        const result = getDrillingAxis('BOTTOM_LEFT', 'INSET');
        expect(result.x).toBe(-1);
        expect(result.y).toBe(0);
        expect(result.z).toBe(0);
      });

      it('returns +X for TOP_RIGHT (bolt head points toward right panel)', () => {
        const result = getDrillingAxis('TOP_RIGHT', 'INSET');
        expect(result.x).toBe(1);
        expect(result.y).toBe(0);
        expect(result.z).toBe(0);
      });

      it('returns +X for BOTTOM_RIGHT (bolt head points toward right panel)', () => {
        const result = getDrillingAxis('BOTTOM_RIGHT', 'INSET');
        expect(result.x).toBe(1);
        expect(result.y).toBe(0);
        expect(result.z).toBe(0);
      });
    });
  });

  describe('computeSeamDirWorld', () => {
    it('computes seam direction from panel normal and bolt direction', () => {
      // LEFT side panel (+X normal), drilling down (-Y)
      // cross((1,0,0), (0,-1,0)) = (0*0 - 0*(-1), 0*0 - 1*0, 1*(-1) - 0*0) = (0, 0, -1) = -Z
      const panelN = new THREE.Vector3(1, 0, 0);
      const boltDir = new THREE.Vector3(0, -1, 0);
      const result = computeSeamDirWorld(panelN, boltDir);

      expect(result).not.toBeNull();
      expect(result!.x).toBeCloseTo(0, 5);
      expect(result!.y).toBeCloseTo(0, 5);
      expect(result!.z).toBeCloseTo(-1, 5); // -Z, not +Z
    });

    it('computes seam for RIGHT side panel', () => {
      // RIGHT side panel (-X normal), drilling down (-Y)
      // cross((-1,0,0), (0,-1,0)) = (0, 0, (-1)*(-1)) = (0, 0, 1) = +Z
      const panelN = new THREE.Vector3(-1, 0, 0);
      const boltDir = new THREE.Vector3(0, -1, 0);
      const result = computeSeamDirWorld(panelN, boltDir);

      expect(result).not.toBeNull();
      expect(result!.z).toBeCloseTo(1, 5); // +Z, not -Z
    });

    it('returns null for degenerate case (parallel vectors)', () => {
      const panelN = new THREE.Vector3(0, 1, 0);
      const boltDir = new THREE.Vector3(0, 1, 0);
      const result = computeSeamDirWorld(panelN, boltDir);
      expect(result).toBeNull();
    });
  });

  describe('computeSeamPerpWorld', () => {
    it('computes perpendicular to seam in plane around bolt axis', () => {
      const seamDir = new THREE.Vector3(0, 0, 1);
      const boltDir = new THREE.Vector3(0, -1, 0);
      const result = computeSeamPerpWorld(seamDir, boltDir);

      // boltDir × seamDir = (0,-1,0) × (0,0,1) = (-1*1 - 0*0, 0*0 - 0*1, 0*0 - (-1)*0) = (-1, 0, 0) = -X
      expect(result.x).toBeCloseTo(-1, 5);
      expect(result.y).toBeCloseTo(0, 5);
      expect(result.z).toBeCloseTo(0, 5);
    });
  });

  describe('computeBoltQuatBase', () => {
    it('returns identity for -Y direction (shaft already points down)', () => {
      // SHAFT_AXIS = -Y, so aligning -Y to -Y = identity
      const result = computeBoltQuatBase(new THREE.Vector3(0, -1, 0));
      expect(result.x).toBeCloseTo(0, 5);
      expect(result.y).toBeCloseTo(0, 5);
      expect(result.z).toBeCloseTo(0, 5);
      expect(result.w).toBeCloseTo(1, 5);
    });

    it('returns 180° X rotation for +Y direction (shaft needs to point up)', () => {
      // SHAFT_AXIS = -Y, aligning -Y to +Y = 180° flip around X
      const result = computeBoltQuatBase(new THREE.Vector3(0, 1, 0));
      // 180° around X: quaternion = (1, 0, 0, 0) or close to it
      expect(Math.abs(result.x)).toBeCloseTo(1, 4);
      expect(result.y).toBeCloseTo(0, 5);
      expect(result.z).toBeCloseTo(0, 5);
      expect(Math.abs(result.w)).toBeCloseTo(0, 4);
    });

    it('aligns shaft (-Y) to arbitrary direction', () => {
      const targetDir = new THREE.Vector3(1, 0, 0).normalize();
      const result = computeBoltQuatBase(targetDir);

      // Verify: -Y (shaft) transformed by quat should equal targetDir
      const transformed = new THREE.Vector3(0, -1, 0).applyQuaternion(result);
      expect(transformed.x).toBeCloseTo(targetDir.x, 4);
      expect(transformed.y).toBeCloseTo(targetDir.y, 4);
      expect(transformed.z).toBeCloseTo(targetDir.z, 4);
    });
  });

  describe('computeBoltQuatWithTwist', () => {
    describe('INSET mode (fins align with seam)', () => {
      it('TOP_LEFT: fins align with -Z (seam direction)', () => {
        const corner = 'TOP_LEFT';
        const boltDirWorld = getDrillingAxis(corner);
        const boltPanelNormalWorld = selectBoltPanelNormalWorld(corner);

        const result = computeBoltQuatWithTwist({
          boltDirWorld,
          boltPanelNormalWorld,
          mountType: 'INSET',
        });

        // Seam for TOP_LEFT: cross((+X), (-Y)) = -Z
        expect(result.seamDirWorld).not.toBeNull();
        expect(result.seamDirWorld!.z).toBeCloseTo(-1, 4);

        // Fins after twist should be parallel to seam (-Z)
        expect(Math.abs(result.finsWorldAfterTwist.z)).toBeCloseTo(1, 3);
      });

      it('TOP_RIGHT: fins align with +Z (seam direction)', () => {
        const corner = 'TOP_RIGHT';
        const boltDirWorld = getDrillingAxis(corner);
        const boltPanelNormalWorld = selectBoltPanelNormalWorld(corner);

        const result = computeBoltQuatWithTwist({
          boltDirWorld,
          boltPanelNormalWorld,
          mountType: 'INSET',
        });

        // Seam for TOP_RIGHT: cross((-X), (-Y)) = +Z
        expect(result.seamDirWorld).not.toBeNull();
        expect(result.seamDirWorld!.z).toBeCloseTo(1, 4);

        // Fins after twist should be parallel to seam (+Z)
        expect(Math.abs(result.finsWorldAfterTwist.z)).toBeCloseTo(1, 3);
      });

      it('BOTTOM_LEFT: fins align with +Z (seam direction)', () => {
        const corner = 'BOTTOM_LEFT';
        const boltDirWorld = getDrillingAxis(corner);
        const boltPanelNormalWorld = selectBoltPanelNormalWorld(corner);

        const result = computeBoltQuatWithTwist({
          boltDirWorld,
          boltPanelNormalWorld,
          mountType: 'INSET',
        });

        // Seam for BOTTOM_LEFT: cross((+X), (+Y)) = +Z
        expect(result.seamDirWorld).not.toBeNull();
        expect(result.seamDirWorld!.z).toBeCloseTo(1, 4);

        // Fins after twist should be parallel to seam
        expect(Math.abs(result.finsWorldAfterTwist.z)).toBeCloseTo(1, 3);
      });
    });

    describe('OVERLAY mode (fins perpendicular to seam)', () => {
      it('TOP_LEFT: fins align with ±X (perpendicular to seam)', () => {
        const corner = 'TOP_LEFT';
        const boltDirWorld = getDrillingAxis(corner);
        const boltPanelNormalWorld = selectBoltPanelNormalWorld(corner);

        const result = computeBoltQuatWithTwist({
          boltDirWorld,
          boltPanelNormalWorld,
          mountType: 'OVERLAY',
        });

        // For TOP_LEFT:
        // - seamDir = -Z
        // - seamPerp = boltDir × seamDir = (-Y) × (-Z) = Y × Z = +X
        expect(result.targetDirWorld).not.toBeNull();
        expect(Math.abs(result.targetDirWorld!.x)).toBeCloseTo(1, 3);

        // Fins after twist should be parallel to target (±X)
        expect(Math.abs(result.finsWorldAfterTwist.x)).toBeCloseTo(1, 3);
      });
    });

    describe('orientation validation', () => {
      const corners: Array<'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT'> = [
        'TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'
      ];
      const mountTypes: Array<'INSET' | 'OVERLAY'> = ['INSET', 'OVERLAY'];

      for (const corner of corners) {
        for (const mountType of mountTypes) {
          it(`${corner} ${mountType}: passes orientation assertions`, () => {
            const boltDirWorld = getDrillingAxis(corner);
            const boltPanelNormalWorld = selectBoltPanelNormalWorld(corner);

            const result = computeBoltQuatWithTwist({
              boltDirWorld,
              boltPanelNormalWorld,
              mountType,
            });

            // Should not throw
            expect(() => assertOrientation(result, boltDirWorld)).not.toThrow();
          });

          it(`${corner} ${mountType}: fins perpendicular to boltDir`, () => {
            const boltDirWorld = getDrillingAxis(corner);
            const boltPanelNormalWorld = selectBoltPanelNormalWorld(corner);

            const result = computeBoltQuatWithTwist({
              boltDirWorld,
              boltPanelNormalWorld,
              mountType,
            });

            // Fins should be in plane around boltDir (perpendicular)
            const dotFB = result.finsWorldAfterTwist.dot(boltDirWorld);
            expect(Math.abs(dotFB)).toBeLessThan(0.01);
          });
        }
      }
    });

    describe('symmetry', () => {
      it('LEFT and RIGHT sides have mirrored fin directions for INSET', () => {
        const leftResult = computeBoltQuatWithTwist({
          boltDirWorld: getDrillingAxis('TOP_LEFT'),
          boltPanelNormalWorld: selectBoltPanelNormalWorld('TOP_LEFT'),
          mountType: 'INSET',
        });

        const rightResult = computeBoltQuatWithTwist({
          boltDirWorld: getDrillingAxis('TOP_RIGHT'),
          boltPanelNormalWorld: selectBoltPanelNormalWorld('TOP_RIGHT'),
          mountType: 'INSET',
        });

        // Seam directions should be opposite (mirrored)
        expect(leftResult.seamDirWorld!.z * rightResult.seamDirWorld!.z).toBeLessThan(0);
      });
    });

    describe('INSET with X-axis drilling (singularity case)', () => {
      // When jointType = INSET, drilling is HORIZONTAL (X-axis) into the FACE of side panels
      // This causes DrillDir || PanelNormal (both are X-axis), requiring singularity handling

      it('TOP_LEFT INSET: handles X-axis singularity, fins align with Z', () => {
        const corner = 'TOP_LEFT';
        // INSET drilling: +X for left panels
        const boltDirWorld = getDrillingAxis(corner, 'INSET');
        // Panel normal is also +X for left panels
        const boltPanelNormalWorld = selectBoltPanelNormalWorld(corner);

        // Verify singularity condition: both are X-axis
        expect(Math.abs(boltDirWorld.x)).toBeCloseTo(1, 4);
        expect(Math.abs(boltPanelNormalWorld.x)).toBeCloseTo(1, 4);

        const result = computeBoltQuatWithTwist({
          boltDirWorld,
          boltPanelNormalWorld,
          mountType: 'INSET',
        });

        // Singularity handling should force seamDir = Z-axis
        expect(result.seamDirWorld).not.toBeNull();
        expect(Math.abs(result.seamDirWorld!.z)).toBeCloseTo(1, 4);

        // Fins should align with Z (seam direction) for INSET
        expect(Math.abs(result.finsWorldAfterTwist.z)).toBeCloseTo(1, 3);
      });

      it('TOP_RIGHT INSET: handles X-axis singularity, fins align with Z', () => {
        const corner = 'TOP_RIGHT';
        // INSET drilling: -X for right panels
        const boltDirWorld = getDrillingAxis(corner, 'INSET');
        // Panel normal is also -X for right panels
        const boltPanelNormalWorld = selectBoltPanelNormalWorld(corner);

        // Verify singularity condition
        expect(Math.abs(boltDirWorld.x)).toBeCloseTo(1, 4);
        expect(Math.abs(boltPanelNormalWorld.x)).toBeCloseTo(1, 4);

        const result = computeBoltQuatWithTwist({
          boltDirWorld,
          boltPanelNormalWorld,
          mountType: 'INSET',
        });

        // Singularity handling should force seamDir = Z-axis
        expect(result.seamDirWorld).not.toBeNull();
        expect(Math.abs(result.seamDirWorld!.z)).toBeCloseTo(1, 4);

        // Fins should align with Z for INSET
        expect(Math.abs(result.finsWorldAfterTwist.z)).toBeCloseTo(1, 3);
      });

      it('INSET X-axis drilling: fins perpendicular to boltDir (X)', () => {
        const corners: Array<'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT'> = [
          'TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'
        ];

        for (const corner of corners) {
          const boltDirWorld = getDrillingAxis(corner, 'INSET');
          const boltPanelNormalWorld = selectBoltPanelNormalWorld(corner);

          const result = computeBoltQuatWithTwist({
            boltDirWorld,
            boltPanelNormalWorld,
            mountType: 'INSET',
          });

          // Fins should be perpendicular to boltDir (X-axis)
          const dotFB = result.finsWorldAfterTwist.dot(boltDirWorld);
          expect(Math.abs(dotFB)).toBeLessThan(0.01);
        }
      });

      it('OVERLAY X-axis drilling: fins perpendicular to seam (Y direction)', () => {
        const corner = 'TOP_LEFT';
        // Force X-axis drilling even for OVERLAY to test the singularity with OVERLAY mode
        const boltDirWorld = getDrillingAxis(corner, 'INSET');
        const boltPanelNormalWorld = selectBoltPanelNormalWorld(corner);

        const result = computeBoltQuatWithTwist({
          boltDirWorld,
          boltPanelNormalWorld,
          mountType: 'OVERLAY', // OVERLAY wants fins perpendicular to seam
        });

        // Singularity handling gives seamDir = Z
        // OVERLAY wants seamPerp = boltDir × seamDir = X × Z = Y
        // So fins should align with Y
        expect(Math.abs(result.finsWorldAfterTwist.y)).toBeCloseTo(1, 3);
      });
    });
  });

  // ============================================
  // FRONT VIEW & SIDE VIEW VALIDATION
  // Chief Geometry Architect spec compliance tests
  // ============================================
  describe('validateFrontViewOrientation', () => {
    // Standard cabinet bounding box for testing
    const cabinetBox = new THREE.Box3(
      new THREE.Vector3(-500, 0, -300),
      new THREE.Vector3(500, 1000, 300)
    );

    // Helper to compute bolt state for a given corner and joint type
    function computeBoltState(corner: Corner, jointType: MountType) {
      const boltDirWorld = getDrillingAxis(corner, jointType);
      const boltPanelNormalWorld = selectBoltPanelNormalWorld(corner);

      const result = computeBoltQuatWithTwist({
        boltDirWorld,
        boltPanelNormalWorld,
        mountType: jointType,
      });

      // Position inside cabinet (center for simplicity)
      const position = new THREE.Vector3(0, 500, 0);

      return {
        position,
        quaternion: result.boltQuat,
        jointType,
        corner,
      };
    }

    describe('INSET joints - fins should point toward Z (depth)', () => {
      const corners: Corner[] = ['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'];

      for (const corner of corners) {
        it(`${corner} INSET: passes front view validation`, () => {
          const boltState = computeBoltState(corner, 'INSET');

          // Should not throw
          expect(() =>
            validateFrontViewOrientation(boltState, cabinetBox)
          ).not.toThrow();
        });
      }
    });

    describe('OVERLAY joints - fins should point toward X (width)', () => {
      const corners: Corner[] = ['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'];

      for (const corner of corners) {
        it(`${corner} OVERLAY: passes front view validation`, () => {
          const boltState = computeBoltState(corner, 'OVERLAY');

          // Should not throw
          expect(() =>
            validateFrontViewOrientation(boltState, cabinetBox)
          ).not.toThrow();
        });
      }
    });

    describe('boundary checks', () => {
      it('fails when bolt is outside cabinet bounds', () => {
        const boltState = computeBoltState('TOP_LEFT', 'INSET');
        // Move bolt outside cabinet
        boltState.position = new THREE.Vector3(1000, 500, 0);

        expect(() =>
          validateFrontViewOrientation(boltState, cabinetBox)
        ).toThrow(/Boundary Fail/);
      });

      it('passes when bolt is inside cabinet bounds', () => {
        const boltState = computeBoltState('TOP_LEFT', 'INSET');
        boltState.position = new THREE.Vector3(0, 500, 0);

        expect(() =>
          validateFrontViewOrientation(boltState, cabinetBox)
        ).not.toThrow();
      });
    });

    describe('wrong orientation detection', () => {
      it('detects INSET bolt with fins pointing wrong direction (X instead of Z)', () => {
        const boltState = computeBoltState('TOP_LEFT', 'INSET');
        // Manually set quaternion to point fins in X direction (wrong for INSET)
        // Identity quaternion keeps local X as world X
        boltState.quaternion = new THREE.Quaternion();

        expect(() =>
          validateFrontViewOrientation(boltState, cabinetBox)
        ).toThrow(/Orientation Fail.*INSET/);
      });

      it('detects OVERLAY bolt with fins pointing wrong direction (Z instead of X)', () => {
        const boltState = computeBoltState('TOP_LEFT', 'OVERLAY');
        // Rotate 90° around Y to point local X toward Z (wrong for OVERLAY)
        boltState.quaternion = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.PI / 2
        );

        expect(() =>
          validateFrontViewOrientation(boltState, cabinetBox)
        ).toThrow(/Orientation Fail.*OVERLAY/);
      });
    });
  });

  describe('validateSideViewOrientation', () => {
    function computeBoltState(corner: Corner, jointType: MountType) {
      const boltDirWorld = getDrillingAxis(corner, jointType);
      const boltPanelNormalWorld = selectBoltPanelNormalWorld(corner);

      const result = computeBoltQuatWithTwist({
        boltDirWorld,
        boltPanelNormalWorld,
        mountType: jointType,
      });

      return {
        position: new THREE.Vector3(0, 500, 0),
        quaternion: result.boltQuat,
        jointType,
        corner,
      };
    }

    describe('INSET joints - fins extend in Z', () => {
      const corners: Corner[] = ['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'];

      for (const corner of corners) {
        it(`${corner} INSET: passes side view validation`, () => {
          const boltState = computeBoltState(corner, 'INSET');
          expect(() => validateSideViewOrientation(boltState)).not.toThrow();
        });
      }
    });

    describe('OVERLAY joints - fins extend in X', () => {
      const corners: Corner[] = ['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'];

      for (const corner of corners) {
        it(`${corner} OVERLAY: passes side view validation`, () => {
          const boltState = computeBoltState(corner, 'OVERLAY');
          expect(() => validateSideViewOrientation(boltState)).not.toThrow();
        });
      }
    });
  });

  // ============================================
  // COMPREHENSIVE ALL-CORNER ALL-JOINTTYPE VALIDATION
  // ============================================
  describe('comprehensive orientation validation (all corners × all joint types)', () => {
    const corners: Corner[] = ['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'];
    const jointTypes: MountType[] = ['INSET', 'OVERLAY'];
    const cabinetBox = new THREE.Box3(
      new THREE.Vector3(-500, 0, -300),
      new THREE.Vector3(500, 1000, 300)
    );

    for (const corner of corners) {
      for (const jointType of jointTypes) {
        it(`${corner} ${jointType}: passes all validations`, () => {
          const boltDirWorld = getDrillingAxis(corner, jointType);
          const boltPanelNormalWorld = selectBoltPanelNormalWorld(corner);

          const result = computeBoltQuatWithTwist({
            boltDirWorld,
            boltPanelNormalWorld,
            mountType: jointType,
          });

          const boltState = {
            position: new THREE.Vector3(0, 500, 0),
            quaternion: result.boltQuat,
            jointType,
            corner,
          };

          // All validations should pass
          expect(() => assertOrientation(result, boltDirWorld)).not.toThrow();
          expect(() => validateFrontViewOrientation(boltState, cabinetBox)).not.toThrow();
          expect(() => validateSideViewOrientation(boltState)).not.toThrow();
        });
      }
    }
  });
});
