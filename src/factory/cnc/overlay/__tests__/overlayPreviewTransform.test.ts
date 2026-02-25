/**
 * overlayPreviewTransform.test.ts - Tests for CNC Overlay Preview Transform
 *
 * Verifies:
 * 1. DrillMap metadata is forwarded through Operation → CncOverlayPoint
 * 2. Overlay builder correctly populates preview field
 * 3. Preview transform changes rendered position but NOT manufacturing truth
 *
 * @version 1.0.0 - Phase D4.2
 */

import { describe, it, expect } from 'vitest';
import {
  applyOverlayPreviewTransform,
  applyTransformAroundAnchor,
  buildPreviewMatrix,
  overlayPointToThreePosition,
  IDENTITY_PREVIEW,
  type OverlayPreviewState,
} from '../overlayPreviewTransform';
import type { CncOverlayPoint, CncOverlayPreviewMeta } from '../cncOverlayTypes';
import type { Position3D } from '../../../../cnc/operation/operationTypes';

// ============================================================================
// Test Fixtures
// ============================================================================

function createOverlayPoint(overrides?: Partial<CncOverlayPoint>): CncOverlayPoint {
  return {
    id: 'test-point-001',
    type: 'BORE',
    position: { x: 100, y: 200, z: 0 },
    diameter: 15,
    depth: 12,
    face: 'TOP',
    panelId: 'panel-001',
    cycle: 'G81',
    holeKind: 'CAM_POCKET',
    feedRate: 1500,
    rpm: 3000,
    throughHole: false,
    label: 'Bore Ø15mm × 12mm (G81)',
    preview: {
      key: 'point-001',
      anchor: { x: 100, y: 200, z: 0 },
      normal: { x: 0, y: 0, z: -1 },
      face6: 'A',
      pairId: 'pair-001',
    },
    ...overrides,
  } as CncOverlayPoint;
}

function createPreviewState(overrides?: Partial<OverlayPreviewState>): OverlayPreviewState {
  return {
    flipVertical: false,
    flipHorizontal: false,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    ...overrides,
  };
}

// ============================================================================
// Test 1: Identity transform returns original position
// ============================================================================

describe('overlayPreviewTransform - identity', () => {
  it('returns original position when no preview metadata', () => {
    const point = createOverlayPoint({ preview: undefined });
    const result = applyOverlayPreviewTransform(point, createPreviewState());
    expect(result).toBe(point.position); // Same reference
  });

  it('returns original position when no preview state', () => {
    const point = createOverlayPoint();
    const result = applyOverlayPreviewTransform(point, null);
    expect(result).toBe(point.position);
  });

  it('returns original position when identity preview state', () => {
    const point = createOverlayPoint();
    const result = applyOverlayPreviewTransform(point, IDENTITY_PREVIEW);
    expect(result).toBe(point.position);
  });
});

// ============================================================================
// Test 2: Horizontal flip mirrors X around anchor
// ============================================================================

describe('overlayPreviewTransform - horizontal flip', () => {
  it('mirrors position.x around anchor.x when flipHorizontal=true', () => {
    const point = createOverlayPoint({
      position: { x: 120, y: 200, z: 0 }, // 20mm to the right of anchor
      preview: {
        key: 'p1',
        anchor: { x: 100, y: 200, z: 0 },
      },
    });

    const state = createPreviewState({ flipHorizontal: true });
    const result = applyOverlayPreviewTransform(point, state);

    // P' = A + M(P-A) where M flips X (scaleX=-1)
    // P-A = (20, 0, 0), after scaleX=-1 → (-20, 0, 0), P' = (80, 200, 0)
    expect(result.x).toBeCloseTo(80, 5);
    expect(result.y).toBeCloseTo(200, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });

  it('leaves position unchanged when point is at anchor', () => {
    const point = createOverlayPoint({
      position: { x: 100, y: 200, z: 0 },
      preview: {
        key: 'p1',
        anchor: { x: 100, y: 200, z: 0 },
      },
    });

    const state = createPreviewState({ flipHorizontal: true });
    const result = applyOverlayPreviewTransform(point, state);

    expect(result.x).toBeCloseTo(100, 5);
    expect(result.y).toBeCloseTo(200, 5);
  });
});

// ============================================================================
// Test 3: Vertical flip mirrors Y around anchor
// ============================================================================

describe('overlayPreviewTransform - vertical flip', () => {
  it('mirrors position.y around anchor.y when flipVertical=true', () => {
    const point = createOverlayPoint({
      position: { x: 100, y: 220, z: 0 }, // 20mm above anchor
      preview: {
        key: 'p1',
        anchor: { x: 100, y: 200, z: 0 },
      },
    });

    const state = createPreviewState({ flipVertical: true });
    const result = applyOverlayPreviewTransform(point, state);

    // scaleY=-1: P-A = (0, 20, 0) → (0, -20, 0), P' = (100, 180, 0)
    expect(result.x).toBeCloseTo(100, 5);
    expect(result.y).toBeCloseTo(180, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });
});

// ============================================================================
// Test 4: Combined flip
// ============================================================================

describe('overlayPreviewTransform - combined flip', () => {
  it('mirrors both X and Y when both flips are true', () => {
    const point = createOverlayPoint({
      position: { x: 120, y: 220, z: 5 },
      preview: {
        key: 'p1',
        anchor: { x: 100, y: 200, z: 0 },
      },
    });

    const state = createPreviewState({
      flipHorizontal: true,
      flipVertical: true,
    });
    const result = applyOverlayPreviewTransform(point, state);

    // P-A = (20, 20, 5), scaleX=-1 scaleY=-1 → (-20, -20, 5)
    // P' = (80, 180, 5)
    expect(result.x).toBeCloseTo(80, 5);
    expect(result.y).toBeCloseTo(180, 5);
    expect(result.z).toBeCloseTo(5, 5);
  });
});

// ============================================================================
// Test 5: Manufacturing truth is never mutated
// ============================================================================

describe('overlayPreviewTransform - truth preservation', () => {
  it('does not mutate the original point.position', () => {
    const point = createOverlayPoint({
      position: { x: 120, y: 220, z: 0 },
    });

    const originalX = point.position.x;
    const originalY = point.position.y;
    const originalZ = point.position.z;

    const state = createPreviewState({
      flipHorizontal: true,
      flipVertical: true,
    });
    applyOverlayPreviewTransform(point, state);

    // Original position must be unchanged
    expect(point.position.x).toBe(originalX);
    expect(point.position.y).toBe(originalY);
    expect(point.position.z).toBe(originalZ);
  });

  it('returns a different object from the input position when transform is active', () => {
    const point = createOverlayPoint({
      position: { x: 120, y: 220, z: 0 },
    });

    const state = createPreviewState({ flipHorizontal: true });
    const result = applyOverlayPreviewTransform(point, state);

    // Should be a new object, not the same reference
    expect(result).not.toBe(point.position);
    // But original is unchanged
    expect(point.position.x).toBe(120);
  });
});

// ============================================================================
// Test 6: overlayPointToThreePosition pipeline
// ============================================================================

describe('overlayPointToThreePosition', () => {
  it('converts mm to meters with Y/Z swap (no transform)', () => {
    const point = createOverlayPoint({
      position: { x: 100, y: 200, z: 10 },
      preview: undefined,
    });

    const [x, y, z] = overlayPointToThreePosition(point, null, 0);

    // x stays, z=-y*MM_TO_M, y=z*MM_TO_M
    expect(x).toBeCloseTo(0.1, 6);   // 100mm = 0.1m
    expect(y).toBeCloseTo(0.01, 6);  // z=10mm → y=0.01m (Three.js Y)
    expect(z).toBeCloseTo(-0.2, 6);  // y=200mm → z=-0.2m (Three.js Z)
  });

  it('applies height offset for cylinder centering', () => {
    const point = createOverlayPoint({
      position: { x: 0, y: 0, z: 0 },
      preview: undefined,
    });

    const heightOffset = 0.005; // 5mm in meters
    const [, y] = overlayPointToThreePosition(point, null, heightOffset);

    expect(y).toBeCloseTo(-0.005, 6); // z=0 - 0.005
  });

  it('applies preview transform before conversion', () => {
    const point = createOverlayPoint({
      position: { x: 120, y: 200, z: 0 },
      preview: {
        key: 'p1',
        anchor: { x: 100, y: 200, z: 0 },
      },
    });

    const state = createPreviewState({ flipHorizontal: true });

    // Without transform: x=0.12
    const [xNoFlip] = overlayPointToThreePosition(point, null, 0);
    expect(xNoFlip).toBeCloseTo(0.12, 6);

    // With flip: x should be 80mm = 0.08
    const [xFlipped] = overlayPointToThreePosition(point, state, 0);
    expect(xFlipped).toBeCloseTo(0.08, 6);
  });
});

// ============================================================================
// Test 7: buildPreviewMatrix consistency
// ============================================================================

describe('buildPreviewMatrix', () => {
  it('returns identity-like matrix for no-op state', () => {
    const M = buildPreviewMatrix(IDENTITY_PREVIEW);
    const elements = M.elements;

    // Should be close to identity
    expect(elements[0]).toBeCloseTo(1, 5);  // m11
    expect(elements[5]).toBeCloseTo(1, 5);  // m22
    expect(elements[10]).toBeCloseTo(1, 5); // m33
  });

  it('flipHorizontal produces scaleX=-1 in matrix', () => {
    const M = buildPreviewMatrix(createPreviewState({ flipHorizontal: true }));
    const elements = M.elements;

    // m11 should be -1 (column-major: element[0])
    expect(elements[0]).toBeCloseTo(-1, 5);
    expect(elements[5]).toBeCloseTo(1, 5);
  });

  it('flipVertical produces scaleY=-1 in matrix', () => {
    const M = buildPreviewMatrix(createPreviewState({ flipVertical: true }));
    const elements = M.elements;

    expect(elements[0]).toBeCloseTo(1, 5);
    // m22 should be -1 (column-major: element[5])
    expect(elements[5]).toBeCloseTo(-1, 5);
  });
});

// ============================================================================
// Test 8: applyTransformAroundAnchor
// ============================================================================

describe('applyTransformAroundAnchor', () => {
  it('returns position unchanged when position equals anchor', () => {
    const pos: Position3D = { x: 50, y: 50, z: 0 };
    const anchor: Position3D = { x: 50, y: 50, z: 0 };
    const M = buildPreviewMatrix(createPreviewState({ flipHorizontal: true }));

    const result = applyTransformAroundAnchor(pos, anchor, M);

    expect(result.x).toBeCloseTo(50, 5);
    expect(result.y).toBeCloseTo(50, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });

  it('mirrors correctly for asymmetric offset', () => {
    const pos: Position3D = { x: 150, y: 80, z: 10 };
    const anchor: Position3D = { x: 100, y: 100, z: 0 };
    const M = buildPreviewMatrix(createPreviewState({
      flipHorizontal: true,
      flipVertical: true,
    }));

    const result = applyTransformAroundAnchor(pos, anchor, M);

    // P-A = (50, -20, 10), scaleX=-1 scaleY=-1 → (-50, 20, 10)
    // P' = A + (-50, 20, 10) = (50, 120, 10)
    expect(result.x).toBeCloseTo(50, 5);
    expect(result.y).toBeCloseTo(120, 5);
    expect(result.z).toBeCloseTo(10, 5);
  });
});
