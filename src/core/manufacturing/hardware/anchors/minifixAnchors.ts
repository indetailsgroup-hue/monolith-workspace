/**
 * minifixAnchors.ts — Anchor specs for Minifix S200 hardware parts
 *
 * Defines localAxis and localAnchor for each Minifix part so that
 * placeMeshByDrillPoint() can position them correctly in the Designer scene.
 *
 * All values are in mm and correspond to the mesh geometry defined in
 * Hardware3D.tsx (CamHousing3D, S200Bolt3D, Dowel3D).
 *
 * Mesh geometry conventions (from Hardware3D.tsx):
 * - CamHousing3D: cylinderGeometry centered at origin, Y = cylinder axis
 *   Rim at Y = +depth/2, bottom at Y = -depth/2
 * - S200Bolt3D: assembled along -Y direction from ball head
 * - Dowel3D: cylinderGeometry centered at origin, Y = dowel axis
 *
 * @version 1.0.0
 */

import type { AnchorSpec, Vec3Tuple } from '../../../geometry/anchorTypes';

// ============================================================================
// CAM Housing Anchor
// ============================================================================

/**
 * Create anchor spec for CamHousing3D mesh.
 *
 * DrillMap CAM_LOCK point = drill entry on panel surface.
 * Drill normal = into material (toward pocket center).
 *
 * CamHousing3D geometry:
 * - Cylinder centered at origin, Y axis
 * - Rim (entry side) at Y = +depth/2
 * - Bottom at Y = -depth/2
 *
 * → localAxis = [0, -1, 0]: model's -Y should align with drill normal
 *   (because the housing goes INTO the material from the rim side)
 * → localAnchor = [0, depth/2, 0]: the rim (entry surface) sits at
 *   the DrillMap point (panel surface)
 */
export function createCamAnchor(depth: number): AnchorSpec {
  return {
    label: 'CAM_HOUSING',
    localAxis: [0, -1, 0],
    localAnchor: [0, depth / 2, 0],
  };
}

/**
 * Create anchor spec for CamHousing3D positioned at pocket center.
 *
 * Some use cases (like the Hardware3DOverlay) want to place the cam
 * at the pocket center (halfDepth into the material) rather than
 * at the surface entry point.
 *
 * → localAnchor = [0, 0, 0]: geometric center of cylinder = pocket center
 */
export function createCamPocketCenterAnchor(): AnchorSpec {
  return {
    label: 'CAM_HOUSING_POCKET_CENTER',
    localAxis: [0, -1, 0],
    localAnchor: [0, 0, 0],
  };
}

// ============================================================================
// Bolt Assembly Anchor (S200 Bolt)
// ============================================================================

/**
 * Create anchor spec for the full bolt assembly at the BOLT drill entry.
 *
 * DrillMap BOLT point = drill entry on panel surface (where bolt enters).
 * Drill normal = into material.
 * boltDirection = from bolt entry (A) toward cam pocket center (C).
 *
 * S200Bolt3D / buildBoltMeshFrame convention:
 * - Model assembled along +Y direction (ball head at top, thread at bottom)
 * - Bolt entry (threaded shaft tip) is at local Y = 0 when using
 *   buildBoltMeshFrame (group origin at point A)
 *
 * For standalone placement (not using buildBoltMeshFrame):
 * → localAxis = [0, 1, 0]: model's +Y aligns with bolt direction
 *   (from bolt entry toward cam)
 * → localAnchor = [0, 0, 0]: origin = bolt entry point
 */
export function createBoltEntryAnchor(): AnchorSpec {
  return {
    label: 'BOLT_ENTRY',
    localAxis: [0, 1, 0],
    localAnchor: [0, 0, 0],
  };
}

// ============================================================================
// Dowel Anchor
// ============================================================================

/**
 * Create anchor spec for Dowel3D mesh.
 *
 * DrillMap DOWEL point = drill entry on panel surface.
 * Drill normal = into material.
 *
 * Dowel3D geometry:
 * - Cylinder centered at origin, Y axis
 * - Length along Y: [-length/2, +length/2]
 *
 * For face bore (into panel face):
 * → localAxis = [0, -1, 0]: -Y points into material
 * → localAnchor = [0, length/2, 0]: top of dowel sits at panel surface
 *
 * @param insertionDepth - How deep the dowel goes into THIS panel (mm)
 *                         e.g., 12mm for face bore, 18mm for edge bore
 */
export function createDowelAnchor(insertionDepth: number): AnchorSpec {
  return {
    label: 'DOWEL',
    localAxis: [0, -1, 0],
    localAnchor: [0, insertionDepth / 2, 0],
  };
}

// ============================================================================
// Default Minifix S200 Anchor Set
// ============================================================================

/**
 * Standard Häfele Minifix S200 anchor set for 18mm wood.
 *
 * Usage:
 * ```typescript
 * const anchors = DEFAULT_MINIFIX_ANCHORS;
 * const placement = placeMeshByDrillPoint(
 *   camDrillPoint.position,
 *   camDrillPoint.normal,
 *   anchors.cam,
 * );
 * ```
 */
export const DEFAULT_MINIFIX_ANCHORS = {
  /** Cam housing at drill entry point (surface) */
  cam: createCamAnchor(13.5),

  /** Cam housing at pocket center (inside material) */
  camPocketCenter: createCamPocketCenterAnchor(),

  /** Bolt assembly at drill entry */
  bolt: createBoltEntryAnchor(),

  /** Dowel for face bore (12mm into side panel) */
  dowelFace: createDowelAnchor(12),

  /** Dowel for edge bore (18mm into horizontal panel) */
  dowelEdge: createDowelAnchor(18),
} as const;
