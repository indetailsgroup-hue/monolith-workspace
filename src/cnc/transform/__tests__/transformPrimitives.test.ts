/**
 * transformPrimitives.test.ts - Transform Primitives Tests
 *
 * Comprehensive tests for workpiece coordinate mapping.
 *
 * @version 1.0.0 - Phase D4.1
 */

import { describe, it, expect } from 'vitest';
import {
  // Position arithmetic
  addPositions,
  subtractPositions,
  scalePosition,
  negatePosition,
  positionsEqual,
  // Translation
  applyOffset,
  removeOffset,
  // Rotation
  rotateAroundZ,
  snapAngleTo90,
  // Mirror
  mirrorAlongX,
  mirrorAlongY,
  mirrorAlongZ,
  // Face transforms
  transformForBottomFace,
  getFaceSurfaceZ,
  // Datum transforms
  getDatumOffset,
  transformDatum,
  // Complete transforms
  transformToMachine,
  transformFromMachine,
  transformBatchToMachine,
  // Validation
  isWithinWorkpiece,
  clampToWorkpiece,
} from '../transformPrimitives';

import type {
  WorkpieceTransformContext,
  WorkpieceFrame,
  WorkpieceOffset,
} from '../workpieceTypes';

import type { Position3D } from '../../operation/operationTypes';

// ============================================================================
// POSITION ARITHMETIC
// ============================================================================

describe('Position Arithmetic', () => {
  describe('addPositions', () => {
    it('should add two positions correctly', () => {
      const a: Position3D = { x: 100, y: 200, z: -10 };
      const b: Position3D = { x: 50, y: -50, z: 5 };

      expect(addPositions(a, b)).toEqual({ x: 150, y: 150, z: -5 });
    });

    it('should handle zero values', () => {
      const a: Position3D = { x: 100, y: 0, z: 0 };
      const b: Position3D = { x: 0, y: 200, z: 0 };

      expect(addPositions(a, b)).toEqual({ x: 100, y: 200, z: 0 });
    });
  });

  describe('subtractPositions', () => {
    it('should subtract positions correctly', () => {
      const a: Position3D = { x: 100, y: 200, z: -10 };
      const b: Position3D = { x: 50, y: 100, z: -5 };

      expect(subtractPositions(a, b)).toEqual({ x: 50, y: 100, z: -5 });
    });
  });

  describe('scalePosition', () => {
    it('should scale position by factor', () => {
      const pos: Position3D = { x: 100, y: 200, z: -10 };

      expect(scalePosition(pos, 2)).toEqual({ x: 200, y: 400, z: -20 });
      expect(scalePosition(pos, 0.5)).toEqual({ x: 50, y: 100, z: -5 });
    });
  });

  describe('negatePosition', () => {
    it('should negate all coordinates', () => {
      const pos: Position3D = { x: 100, y: -200, z: 10 };

      expect(negatePosition(pos)).toEqual({ x: -100, y: 200, z: -10 });
    });
  });

  describe('positionsEqual', () => {
    it('should return true for equal positions', () => {
      const a: Position3D = { x: 100, y: 200, z: -10 };
      const b: Position3D = { x: 100, y: 200, z: -10 };

      expect(positionsEqual(a, b)).toBe(true);
    });

    it('should return false for different positions', () => {
      const a: Position3D = { x: 100, y: 200, z: -10 };
      const b: Position3D = { x: 100.1, y: 200, z: -10 };

      expect(positionsEqual(a, b)).toBe(false);
    });

    it('should respect tolerance', () => {
      const a: Position3D = { x: 100, y: 200, z: -10 };
      const b: Position3D = { x: 100.0005, y: 200.0005, z: -10.0005 };

      expect(positionsEqual(a, b, 0.001)).toBe(true);
      expect(positionsEqual(a, b, 0.0001)).toBe(false);
    });
  });
});

// ============================================================================
// TRANSLATION TRANSFORMS
// ============================================================================

describe('Translation Transforms', () => {
  describe('applyOffset', () => {
    it('should translate from workpiece to machine coordinates', () => {
      const workpiecePos: Position3D = { x: 50, y: 30, z: 0 };
      const offset: Position3D = { x: 100, y: 200, z: 0 };

      const machinePos = applyOffset(workpiecePos, offset);

      expect(machinePos).toEqual({ x: 150, y: 230, z: 0 });
    });

    it('should handle negative offsets', () => {
      const workpiecePos: Position3D = { x: 150, y: 230, z: 0 };
      const offset: Position3D = { x: -100, y: -200, z: 0 };

      const machinePos = applyOffset(workpiecePos, offset);

      expect(machinePos).toEqual({ x: 50, y: 30, z: 0 });
    });
  });

  describe('removeOffset', () => {
    it('should translate from machine to workpiece coordinates', () => {
      const machinePos: Position3D = { x: 150, y: 230, z: 0 };
      const offset: Position3D = { x: 100, y: 200, z: 0 };

      const workpiecePos = removeOffset(machinePos, offset);

      expect(workpiecePos).toEqual({ x: 50, y: 30, z: 0 });
    });

    it('should be inverse of applyOffset', () => {
      const original: Position3D = { x: 50, y: 30, z: -5 };
      const offset: Position3D = { x: 100, y: 200, z: 10 };

      const applied = applyOffset(original, offset);
      const removed = removeOffset(applied, offset);

      expect(positionsEqual(removed, original)).toBe(true);
    });
  });
});

// ============================================================================
// ROTATION TRANSFORMS
// ============================================================================

describe('Rotation Transforms', () => {
  describe('rotateAroundZ', () => {
    it('should not change position for zero rotation', () => {
      const pos: Position3D = { x: 100, y: 50, z: -10 };

      expect(rotateAroundZ(pos, 0)).toEqual(pos);
    });

    it('should rotate 90 degrees counter-clockwise', () => {
      const pos: Position3D = { x: 100, y: 0, z: -10 };
      const rotated = rotateAroundZ(pos, Math.PI / 2);

      // After 90° CCW: x -> -y, y -> x
      expect(rotated.x).toBeCloseTo(0, 5);
      expect(rotated.y).toBeCloseTo(100, 5);
      expect(rotated.z).toBe(-10);
    });

    it('should rotate 180 degrees', () => {
      const pos: Position3D = { x: 100, y: 50, z: -10 };
      const rotated = rotateAroundZ(pos, Math.PI);

      expect(rotated.x).toBeCloseTo(-100, 5);
      expect(rotated.y).toBeCloseTo(-50, 5);
      expect(rotated.z).toBe(-10);
    });

    it('should rotate 90 degrees clockwise (negative)', () => {
      const pos: Position3D = { x: 100, y: 0, z: -10 };
      const rotated = rotateAroundZ(pos, -Math.PI / 2);

      // After 90° CW: x -> y, y -> -x
      expect(rotated.x).toBeCloseTo(0, 5);
      expect(rotated.y).toBeCloseTo(-100, 5);
      expect(rotated.z).toBe(-10);
    });

    it('should preserve Z coordinate', () => {
      const pos: Position3D = { x: 100, y: 50, z: -13 };
      const rotated = rotateAroundZ(pos, Math.PI / 4);

      expect(rotated.z).toBe(-13);
    });
  });

  describe('snapAngleTo90', () => {
    it('should snap 0 to 0', () => {
      expect(snapAngleTo90(0)).toBeCloseTo(0, 5);
    });

    it('should snap 45 degrees to 90 (banker rounding)', () => {
      // 45° / 90° = 0.5, Math.round(0.5) = 1
      expect(snapAngleTo90(Math.PI / 4)).toBeCloseTo(Math.PI / 2, 5);
    });

    it('should snap 44 degrees to 0', () => {
      // 44° / 90° = 0.488..., Math.round = 0
      expect(snapAngleTo90((44 * Math.PI) / 180)).toBeCloseTo(0, 5);
    });

    it('should snap 46 degrees to 90', () => {
      expect(snapAngleTo90((46 * Math.PI) / 180)).toBeCloseTo(Math.PI / 2, 5);
    });

    it('should snap 135 degrees to 180', () => {
      expect(snapAngleTo90((135 * Math.PI) / 180)).toBeCloseTo(Math.PI, 5);
    });
  });
});

// ============================================================================
// MIRROR TRANSFORMS
// ============================================================================

describe('Mirror Transforms', () => {
  describe('mirrorAlongX', () => {
    it('should mirror Y coordinate around origin', () => {
      const pos: Position3D = { x: 100, y: 50, z: -10 };
      const mirrored = mirrorAlongX(pos, 0);

      expect(mirrored).toEqual({ x: 100, y: -50, z: -10 });
    });

    it('should mirror Y coordinate around axis', () => {
      const pos: Position3D = { x: 100, y: 50, z: -10 };
      const mirrored = mirrorAlongX(pos, 100);

      // 2 * 100 - 50 = 150
      expect(mirrored).toEqual({ x: 100, y: 150, z: -10 });
    });
  });

  describe('mirrorAlongY', () => {
    it('should mirror X coordinate around origin', () => {
      const pos: Position3D = { x: 100, y: 50, z: -10 };
      const mirrored = mirrorAlongY(pos, 0);

      expect(mirrored).toEqual({ x: -100, y: 50, z: -10 });
    });

    it('should mirror X coordinate around axis', () => {
      const pos: Position3D = { x: 100, y: 50, z: -10 };
      const mirrored = mirrorAlongY(pos, 200);

      // 2 * 200 - 100 = 300
      expect(mirrored).toEqual({ x: 300, y: 50, z: -10 });
    });
  });

  describe('mirrorAlongZ', () => {
    it('should mirror Z coordinate around origin', () => {
      const pos: Position3D = { x: 100, y: 50, z: -10 };
      const mirrored = mirrorAlongZ(pos, 0);

      expect(mirrored).toEqual({ x: 100, y: 50, z: 10 });
    });

    it('should mirror Z coordinate around axis', () => {
      const pos: Position3D = { x: 100, y: 50, z: -10 };
      const mirrored = mirrorAlongZ(pos, -18);

      // 2 * (-18) - (-10) = -36 + 10 = -26
      expect(mirrored).toEqual({ x: 100, y: 50, z: -26 });
    });
  });
});

// ============================================================================
// FACE TRANSFORMS
// ============================================================================

describe('Face Transforms', () => {
  describe('transformForBottomFace', () => {
    it('should transform position for bottom face machining', () => {
      // Panel: 600mm x 400mm x 18mm
      const panelWidth = 400;
      const panelThickness = 18;

      // Point at (100, 50, 0) on TOP face
      const topFacePos: Position3D = { x: 100, y: 50, z: 0 };

      const bottomFacePos = transformForBottomFace(topFacePos, panelWidth, panelThickness);

      // When flipped:
      // - X stays same: 100
      // - Y mirrors: 400 - 50 = 350
      // - Z inverts: -18 - 0 = -18
      expect(bottomFacePos).toEqual({ x: 100, y: 350, z: -18 });
    });

    it('should handle point with depth into material', () => {
      const panelWidth = 400;
      const panelThickness = 18;

      // Point at (100, 50, -5) - 5mm into the TOP face
      const topFacePos: Position3D = { x: 100, y: 50, z: -5 };

      const bottomFacePos = transformForBottomFace(topFacePos, panelWidth, panelThickness);

      // Z = -18 - (-5) = -18 + 5 = -13
      expect(bottomFacePos.z).toBe(-13);
    });

    it('should be consistent with physical flip', () => {
      // A point at center of panel should remain at center after flip
      const panelWidth = 400;
      const panelThickness = 18;

      // Center of panel surface
      const centerTop: Position3D = { x: 300, y: 200, z: 0 };

      const centerBottom = transformForBottomFace(centerTop, panelWidth, panelThickness);

      // Y should be mirrored: 400 - 200 = 200 (still center!)
      expect(centerBottom.y).toBe(200);
    });
  });

  describe('getFaceSurfaceZ', () => {
    it('should return 0 for TOP face', () => {
      expect(getFaceSurfaceZ('TOP', 18)).toBe(0);
    });

    it('should return -thickness for BOTTOM face', () => {
      expect(getFaceSurfaceZ('BOTTOM', 18)).toBe(-18);
    });
  });
});

// ============================================================================
// DATUM TRANSFORMS
// ============================================================================

describe('Datum Transforms', () => {
  describe('getDatumOffset', () => {
    const length = 600;
    const width = 400;

    it('should return zero offset for FRONT_LEFT', () => {
      expect(getDatumOffset('FRONT_LEFT', length, width)).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('should return (length, 0, 0) for FRONT_RIGHT', () => {
      expect(getDatumOffset('FRONT_RIGHT', length, width)).toEqual({ x: 600, y: 0, z: 0 });
    });

    it('should return (0, width, 0) for BACK_LEFT', () => {
      expect(getDatumOffset('BACK_LEFT', length, width)).toEqual({ x: 0, y: 400, z: 0 });
    });

    it('should return (length, width, 0) for BACK_RIGHT', () => {
      expect(getDatumOffset('BACK_RIGHT', length, width)).toEqual({ x: 600, y: 400, z: 0 });
    });

    it('should return center for CENTER', () => {
      expect(getDatumOffset('CENTER', length, width)).toEqual({ x: 300, y: 200, z: 0 });
    });
  });

  describe('transformDatum', () => {
    const length = 600;
    const width = 400;

    it('should return same position for same datum', () => {
      const pos: Position3D = { x: 100, y: 50, z: 0 };

      expect(transformDatum(pos, 'FRONT_LEFT', 'FRONT_LEFT', length, width)).toEqual(pos);
    });

    it('should transform from FRONT_LEFT to CENTER', () => {
      // Point at (100, 50) in FL coordinates
      const pos: Position3D = { x: 100, y: 50, z: 0 };

      const transformed = transformDatum(pos, 'FRONT_LEFT', 'CENTER', length, width);

      // In CENTER coords: (100 - 300, 50 - 200) = (-200, -150)
      expect(transformed).toEqual({ x: -200, y: -150, z: 0 });
    });

    it('should transform from CENTER to FRONT_LEFT', () => {
      // Point at (0, 0) in CENTER coordinates (center of panel)
      const pos: Position3D = { x: 0, y: 0, z: 0 };

      const transformed = transformDatum(pos, 'CENTER', 'FRONT_LEFT', length, width);

      // In FL coords: (0 + 300, 0 + 200) = (300, 200)
      expect(transformed).toEqual({ x: 300, y: 200, z: 0 });
    });

    it('should transform from FRONT_LEFT to FRONT_RIGHT', () => {
      // Point at origin of FL
      const pos: Position3D = { x: 0, y: 0, z: 0 };

      const transformed = transformDatum(pos, 'FRONT_LEFT', 'FRONT_RIGHT', length, width);

      // In FR coords: (0 - 600, 0) = (-600, 0)
      expect(transformed).toEqual({ x: -600, y: 0, z: 0 });
    });
  });
});

// ============================================================================
// COMPLETE TRANSFORMS
// ============================================================================

describe('Complete Transforms', () => {
  const baseContext: WorkpieceTransformContext = {
    panelId: 'panel-001',
    frame: {
      datum: 'FRONT_LEFT',
      face: 'TOP',
      dimensions: { length: 600, width: 400, thickness: 18 },
    },
    placement: {
      offset: { x: 100, y: 200, z: 0 },
      rotationZ: 0,
    },
  };

  describe('transformToMachine', () => {
    it('should apply placement offset for TOP face', () => {
      const workpiecePos: Position3D = { x: 50, y: 30, z: 0 };

      const result = transformToMachine(workpiecePos, baseContext);

      expect(result.machinePosition).toEqual({ x: 150, y: 230, z: 0 });
      expect(result.workpiecePosition).toEqual(workpiecePos);
      expect(result.context.panelId).toBe('panel-001');
      expect(result.context.face).toBe('TOP');
    });

    it('should apply rotation', () => {
      const context: WorkpieceTransformContext = {
        ...baseContext,
        placement: {
          offset: { x: 0, y: 0, z: 0 },
          rotationZ: Math.PI / 2, // 90° CCW
        },
      };

      const workpiecePos: Position3D = { x: 100, y: 0, z: 0 };
      const result = transformToMachine(workpiecePos, context);

      // 90° CCW: (100, 0) -> (0, 100)
      expect(result.machinePosition.x).toBeCloseTo(0, 5);
      expect(result.machinePosition.y).toBeCloseTo(100, 5);
    });

    it('should apply rotation then offset', () => {
      const context: WorkpieceTransformContext = {
        ...baseContext,
        placement: {
          offset: { x: 100, y: 200, z: 0 },
          rotationZ: Math.PI / 2, // 90° CCW
        },
      };

      const workpiecePos: Position3D = { x: 100, y: 0, z: 0 };
      const result = transformToMachine(workpiecePos, context);

      // Rotate first: (100, 0) -> (0, 100)
      // Then offset: (0 + 100, 100 + 200) = (100, 300)
      expect(result.machinePosition.x).toBeCloseTo(100, 5);
      expect(result.machinePosition.y).toBeCloseTo(300, 5);
    });

    it('should handle BOTTOM face with offset', () => {
      const context: WorkpieceTransformContext = {
        panelId: 'panel-001',
        frame: {
          datum: 'FRONT_LEFT',
          face: 'BOTTOM',
          dimensions: { length: 600, width: 400, thickness: 18 },
        },
        placement: {
          offset: { x: 100, y: 200, z: 0 },
          rotationZ: 0,
        },
      };

      // Point at (100, 50, 0) on TOP face
      const workpiecePos: Position3D = { x: 100, y: 50, z: 0 };
      const result = transformToMachine(workpiecePos, context);

      // After face transform: (100, 350, -18)
      // After offset: (200, 550, -18)
      expect(result.machinePosition).toEqual({ x: 200, y: 550, z: -18 });
      expect(result.context.face).toBe('BOTTOM');
    });

    it('should handle non-FRONT_LEFT datum', () => {
      const context: WorkpieceTransformContext = {
        panelId: 'panel-001',
        frame: {
          datum: 'CENTER',
          face: 'TOP',
          dimensions: { length: 600, width: 400, thickness: 18 },
        },
        placement: {
          offset: { x: 100, y: 200, z: 0 },
          rotationZ: 0,
        },
      };

      // Point at center (0, 0) in CENTER coordinates
      const workpiecePos: Position3D = { x: 0, y: 0, z: 0 };
      const result = transformToMachine(workpiecePos, context);

      // Transform to FL: (300, 200, 0)
      // Apply offset: (400, 400, 0)
      expect(result.machinePosition).toEqual({ x: 400, y: 400, z: 0 });
    });
  });

  describe('transformFromMachine', () => {
    it('should be inverse of transformToMachine for TOP face', () => {
      const original: Position3D = { x: 50, y: 30, z: -5 };

      const machinePos = transformToMachine(original, baseContext).machinePosition;
      const recovered = transformFromMachine(machinePos, baseContext);

      expect(positionsEqual(recovered, original)).toBe(true);
    });

    it('should be inverse of transformToMachine with rotation', () => {
      const context: WorkpieceTransformContext = {
        ...baseContext,
        placement: {
          offset: { x: 100, y: 200, z: 0 },
          rotationZ: Math.PI / 4, // 45° CCW
        },
      };

      const original: Position3D = { x: 50, y: 30, z: -5 };

      const machinePos = transformToMachine(original, context).machinePosition;
      const recovered = transformFromMachine(machinePos, context);

      expect(positionsEqual(recovered, original, 0.0001)).toBe(true);
    });

    it('should be inverse of transformToMachine for BOTTOM face', () => {
      const context: WorkpieceTransformContext = {
        ...baseContext,
        frame: {
          ...baseContext.frame,
          face: 'BOTTOM',
        },
      };

      const original: Position3D = { x: 50, y: 30, z: -5 };

      const machinePos = transformToMachine(original, context).machinePosition;
      const recovered = transformFromMachine(machinePos, context);

      expect(positionsEqual(recovered, original, 0.0001)).toBe(true);
    });
  });

  describe('transformBatchToMachine', () => {
    it('should transform multiple positions', () => {
      const positions: Position3D[] = [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 0, z: 0 },
        { x: 100, y: 100, z: 0 },
      ];

      const results = transformBatchToMachine(positions, baseContext);

      expect(results).toHaveLength(3);
      expect(results[0].machinePosition).toEqual({ x: 100, y: 200, z: 0 });
      expect(results[1].machinePosition).toEqual({ x: 200, y: 200, z: 0 });
      expect(results[2].machinePosition).toEqual({ x: 200, y: 300, z: 0 });
    });
  });
});

// ============================================================================
// VALIDATION
// ============================================================================

describe('Validation', () => {
  const context: WorkpieceTransformContext = {
    panelId: 'panel-001',
    frame: {
      datum: 'FRONT_LEFT',
      face: 'TOP',
      dimensions: { length: 600, width: 400, thickness: 18 },
    },
    placement: {
      offset: { x: 100, y: 200, z: 0 },
      rotationZ: 0,
    },
  };

  describe('isWithinWorkpiece', () => {
    it('should return true for position within bounds', () => {
      // Workpiece position (300, 200, -5) is within bounds
      // Machine position = (400, 400, -5)
      const machinePos: Position3D = { x: 400, y: 400, z: -5 };

      expect(isWithinWorkpiece(machinePos, context)).toBe(true);
    });

    it('should return true for position at origin', () => {
      // Workpiece position (0, 0, 0)
      const machinePos: Position3D = { x: 100, y: 200, z: 0 };

      expect(isWithinWorkpiece(machinePos, context)).toBe(true);
    });

    it('should return true for position at max corner', () => {
      // Workpiece position (600, 400, -18)
      const machinePos: Position3D = { x: 700, y: 600, z: -18 };

      expect(isWithinWorkpiece(machinePos, context)).toBe(true);
    });

    it('should return false for position outside X bounds', () => {
      // Workpiece X = 700 - 100 = 600, but max is 600 (boundary is OK)
      // Workpiece X = 750 - 100 = 650, exceeds 600
      const machinePos: Position3D = { x: 750, y: 400, z: 0 };

      expect(isWithinWorkpiece(machinePos, context)).toBe(false);
    });

    it('should return false for negative workpiece position', () => {
      // Workpiece X = 50 - 100 = -50, negative is out of bounds
      const machinePos: Position3D = { x: 50, y: 200, z: 0 };

      expect(isWithinWorkpiece(machinePos, context)).toBe(false);
    });

    it('should return false for Z above surface', () => {
      // Workpiece Z = 1, above surface (Z > 0)
      const machinePos: Position3D = { x: 200, y: 300, z: 1 };

      expect(isWithinWorkpiece(machinePos, context)).toBe(false);
    });

    it('should return false for Z below panel', () => {
      // Workpiece Z = -20, below panel (Z < -thickness)
      const machinePos: Position3D = { x: 200, y: 300, z: -20 };

      expect(isWithinWorkpiece(machinePos, context)).toBe(false);
    });
  });

  describe('clampToWorkpiece', () => {
    const dimensions = { length: 600, width: 400, thickness: 18 };

    it('should not change position within bounds', () => {
      const pos: Position3D = { x: 300, y: 200, z: -9 };

      expect(clampToWorkpiece(pos, dimensions)).toEqual(pos);
    });

    it('should clamp X to [0, length]', () => {
      expect(clampToWorkpiece({ x: -50, y: 200, z: 0 }, dimensions).x).toBe(0);
      expect(clampToWorkpiece({ x: 700, y: 200, z: 0 }, dimensions).x).toBe(600);
    });

    it('should clamp Y to [0, width]', () => {
      expect(clampToWorkpiece({ x: 300, y: -50, z: 0 }, dimensions).y).toBe(0);
      expect(clampToWorkpiece({ x: 300, y: 500, z: 0 }, dimensions).y).toBe(400);
    });

    it('should clamp Z to [-thickness, 0]', () => {
      expect(clampToWorkpiece({ x: 300, y: 200, z: 5 }, dimensions).z).toBe(0);
      expect(clampToWorkpiece({ x: 300, y: 200, z: -25 }, dimensions).z).toBe(-18);
    });
  });
});

// ============================================================================
// REAL-WORLD SCENARIOS
// ============================================================================

describe('Real-World Scenarios', () => {
  it('should handle standard cabinet side panel drilling', () => {
    // Cabinet side panel: 600mm high x 500mm deep x 18mm thick
    // Placed at machine position (100, 50, 0)
    const context: WorkpieceTransformContext = {
      panelId: 'side-left',
      frame: {
        datum: 'FRONT_LEFT',
        face: 'TOP',
        dimensions: { length: 600, width: 500, thickness: 18 },
      },
      placement: {
        offset: { x: 100, y: 50, z: 0 },
        rotationZ: 0,
      },
    };

    // System 32 hole at 37mm from front edge, 9.5mm from bottom
    const sys32Hole: Position3D = { x: 9.5, y: 37, z: 0 };

    const result = transformToMachine(sys32Hole, context);

    // Machine position = (9.5 + 100, 37 + 50, 0) = (109.5, 87, 0)
    expect(result.machinePosition).toEqual({ x: 109.5, y: 87, z: 0 });
  });

  it('should handle rotated panel (90° for horizontal placement)', () => {
    // Panel needs to be rotated 90° for horizontal machine bed
    const context: WorkpieceTransformContext = {
      panelId: 'shelf-001',
      frame: {
        datum: 'FRONT_LEFT',
        face: 'TOP',
        dimensions: { length: 500, width: 400, thickness: 18 },
      },
      placement: {
        offset: { x: 100, y: 100, z: 0 },
        rotationZ: Math.PI / 2, // 90° CCW
      },
    };

    // Hole at panel position (250, 200, 0) = center of panel
    const centerHole: Position3D = { x: 250, y: 200, z: 0 };

    const result = transformToMachine(centerHole, context);

    // After 90° rotation: (250, 200) -> (-200, 250)
    // After offset: (-200 + 100, 250 + 100) = (-100, 350)
    expect(result.machinePosition.x).toBeCloseTo(-100, 5);
    expect(result.machinePosition.y).toBeCloseTo(350, 5);
  });

  it('should handle back panel with BOTTOM face machining', () => {
    // Back panel needs drilling from both sides
    // Cam housing on TOP, bolt holes on BOTTOM
    const context: WorkpieceTransformContext = {
      panelId: 'back-panel',
      frame: {
        datum: 'FRONT_LEFT',
        face: 'BOTTOM',
        dimensions: { length: 700, width: 500, thickness: 3 },
      },
      placement: {
        offset: { x: 50, y: 50, z: 0 },
        rotationZ: 0,
      },
    };

    // Hole at (100, 100) from what was the TOP face
    const holePos: Position3D = { x: 100, y: 100, z: 0 };

    const result = transformToMachine(holePos, context);

    // After BOTTOM face transform:
    // Y mirrors: 500 - 100 = 400
    // Z inverts: -3 - 0 = -3
    // After offset: (100 + 50, 400 + 50, -3) = (150, 450, -3)
    expect(result.machinePosition).toEqual({ x: 150, y: 450, z: -3 });
    expect(result.context.face).toBe('BOTTOM');
  });
});
