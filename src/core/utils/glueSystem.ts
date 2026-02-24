/**
 * Glue System - Cabinet-to-cabinet alignment calculations
 *
 * Features:
 * - Face-to-face alignment (6 faces)
 * - Automatic position calculation
 * - Support for offset/gap between cabinets
 * - Front alignment constraint (Z alignment)
 * - Bottom alignment constraint (Y = 0 for floor cabinets)
 */

import { CabinetFace, FaceSelection, FACE_INFO } from '../store/useGlueStore';

// ============================================
// TYPES
// ============================================

export interface CabinetBounds {
  id: string;
  position: [number, number, number]; // Center position in mm
  dimensions: {
    width: number;  // X
    height: number; // Y
    depth: number;  // Z
  };
  rotation: number; // Y-axis rotation in radians
  toeKickHeight: number; // Leg height
}

export interface AlignmentResult {
  newPosition: [number, number, number];
  alignedAxes: {
    x: boolean;
    y: boolean;
    z: boolean;
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get the position of a specific face on a cabinet
 * Returns the center point of that face
 */
export function getFacePosition(
  cabinet: CabinetBounds,
  face: CabinetFace
): [number, number, number] {
  const [cx, cy, cz] = cabinet.position;
  const { width, height, depth } = cabinet.dimensions;
  const halfW = width / 2;
  const halfH = height / 2;
  const halfD = depth / 2;

  // Handle 90-degree rotations
  const isRotated90 = Math.abs(Math.sin(cabinet.rotation)) > 0.5;
  const effectiveHalfW = isRotated90 ? halfD : halfW;
  const effectiveHalfD = isRotated90 ? halfW : halfD;

  switch (face) {
    case 'left':
      return [cx - effectiveHalfW, cy + halfH, cz];
    case 'right':
      return [cx + effectiveHalfW, cy + halfH, cz];
    case 'front':
      return [cx, cy + halfH, cz + effectiveHalfD];
    case 'back':
      return [cx, cy + halfH, cz - effectiveHalfD];
    case 'top':
      return [cx, cy + height, cz];
    case 'bottom':
      return [cx, cy, cz];
    default:
      return [cx, cy, cz];
  }
}

/**
 * Get the edge coordinate of a face (the actual surface position)
 */
export function getFaceEdge(
  cabinet: CabinetBounds,
  face: CabinetFace
): number {
  const [cx, cy, cz] = cabinet.position;
  const { width, height, depth } = cabinet.dimensions;

  // Handle 90-degree rotations
  const isRotated90 = Math.abs(Math.sin(cabinet.rotation)) > 0.5;
  const effectiveW = isRotated90 ? depth : width;
  const effectiveD = isRotated90 ? width : depth;

  switch (face) {
    case 'left':
      return cx - effectiveW / 2;
    case 'right':
      return cx + effectiveW / 2;
    case 'front':
      return cz + effectiveD / 2;
    case 'back':
      return cz - effectiveD / 2;
    case 'top':
      return cy + height;
    case 'bottom':
      return cy;
    default:
      return 0;
  }
}

/**
 * Get opposite face (for alignment)
 */
export function getOppositeFace(face: CabinetFace): CabinetFace {
  const opposites: Record<CabinetFace, CabinetFace> = {
    left: 'right',
    right: 'left',
    front: 'back',
    back: 'front',
    top: 'bottom',
    bottom: 'top',
  };
  return opposites[face];
}

// ============================================
// MAIN ALIGNMENT FUNCTION
// ============================================

/**
 * Calculate the new position for target cabinet to align with source cabinet
 *
 * @param source - Source cabinet and face (stays in place)
 * @param target - Target cabinet and face (will be moved)
 * @param offset - Gap between faces (mm)
 * @param constraints - Additional alignment constraints
 * @returns New position for target cabinet
 */
export function calculateGlueAlignment(
  source: { cabinet: CabinetBounds; face: CabinetFace },
  target: { cabinet: CabinetBounds; face: CabinetFace },
  offset: number = 0,
  constraints: {
    alignFronts?: boolean; // Align front faces (Z)
    alignBottoms?: boolean; // Align bottoms (Y = floor)
  } = { alignFronts: true, alignBottoms: true }
): AlignmentResult {
  const sourceFaceInfo = FACE_INFO[source.face];
  const targetFaceInfo = FACE_INFO[target.face];

  // Get current positions
  const [srcX, srcY, srcZ] = source.cabinet.position;
  let [tgtX, tgtY, tgtZ] = target.cabinet.position;

  const alignedAxes = { x: false, y: false, z: false };

  // Get source face edge position
  const sourceFaceEdge = getFaceEdge(source.cabinet, source.face);

  // Handle 90-degree rotations for target
  const isTargetRotated90 = Math.abs(Math.sin(target.cabinet.rotation)) > 0.5;
  const targetEffectiveW = isTargetRotated90 ? target.cabinet.dimensions.depth : target.cabinet.dimensions.width;
  const targetEffectiveD = isTargetRotated90 ? target.cabinet.dimensions.width : target.cabinet.dimensions.depth;

  // Calculate alignment based on face axis
  if (sourceFaceInfo.axis === 'x' && targetFaceInfo.axis === 'x') {
    // X-axis alignment (left-right)
    // Source right → Target left: target.minX = source.maxX + offset
    // Source left → Target right: target.maxX = source.minX - offset

    if (source.face === 'right' && target.face === 'left') {
      // Target's left face touches source's right face
      // target.position.x - halfW = sourceFaceEdge + offset
      tgtX = sourceFaceEdge + offset + targetEffectiveW / 2;
    } else if (source.face === 'left' && target.face === 'right') {
      // Target's right face touches source's left face
      // target.position.x + halfW = sourceFaceEdge - offset
      tgtX = sourceFaceEdge - offset - targetEffectiveW / 2;
    } else if (source.face === 'right' && target.face === 'right') {
      // Both right faces align
      tgtX = sourceFaceEdge + offset - targetEffectiveW / 2;
    } else if (source.face === 'left' && target.face === 'left') {
      // Both left faces align
      tgtX = sourceFaceEdge - offset + targetEffectiveW / 2;
    }
    alignedAxes.x = true;
  } else if (sourceFaceInfo.axis === 'z' && targetFaceInfo.axis === 'z') {
    // Z-axis alignment (front-back)
    if (source.face === 'front' && target.face === 'back') {
      // Target's back face touches source's front face
      tgtZ = sourceFaceEdge + offset + targetEffectiveD / 2;
    } else if (source.face === 'back' && target.face === 'front') {
      // Target's front face touches source's back face
      tgtZ = sourceFaceEdge - offset - targetEffectiveD / 2;
    } else if (source.face === 'front' && target.face === 'front') {
      // Both front faces align
      tgtZ = sourceFaceEdge + offset - targetEffectiveD / 2;
    } else if (source.face === 'back' && target.face === 'back') {
      // Both back faces align
      tgtZ = sourceFaceEdge - offset + targetEffectiveD / 2;
    }
    alignedAxes.z = true;
  } else if (sourceFaceInfo.axis === 'y' && targetFaceInfo.axis === 'y') {
    // Y-axis alignment (top-bottom) - stacking
    if (source.face === 'top' && target.face === 'bottom') {
      // Target's bottom on source's top (stack on top)
      tgtY = sourceFaceEdge + offset;
    } else if (source.face === 'bottom' && target.face === 'top') {
      // Target's top under source's bottom (stack below)
      tgtY = sourceFaceEdge - offset - target.cabinet.dimensions.height;
    }
    alignedAxes.y = true;
  }

  // Apply constraints
  if (constraints.alignFronts && !alignedAxes.z) {
    // Align front faces (Z position)
    const sourceFront = getFaceEdge(source.cabinet, 'front');
    const sourceBack = getFaceEdge(source.cabinet, 'back');
    const sourceDepth = sourceFront - sourceBack;

    // Align target's front with source's front
    tgtZ = sourceFront - targetEffectiveD / 2;
    alignedAxes.z = true;
  }

  if (constraints.alignBottoms && !alignedAxes.y) {
    // Align bottoms (both on floor)
    // Since we use CENTER position, Y should be height/2 for cabinet sitting on floor
    // (center at half-height means bottom at Y=0)
    tgtY = target.cabinet.dimensions.height / 2;
    alignedAxes.y = true;
  }

  // If X wasn't aligned by face selection, align centers
  if (!alignedAxes.x && sourceFaceInfo.axis !== 'x' && targetFaceInfo.axis !== 'x') {
    // Keep X position or align centers based on context
    // For now, keep original X position
  }

  return {
    newPosition: [tgtX, tgtY, tgtZ],
    alignedAxes,
  };
}

/**
 * Calculate face bounds for highlighting (in local cabinet coordinates)
 * Returns position and size for the face indicator mesh
 */
export function getFaceHighlightBounds(
  dimensions: { width: number; height: number; depth: number },
  face: CabinetFace,
  padding: number = 5 // Small padding to prevent z-fighting
): {
  position: [number, number, number];
  size: [number, number];
  rotation: [number, number, number];
} {
  const { width, height, depth } = dimensions;
  const halfW = width / 2;
  const halfH = height / 2;
  const halfD = depth / 2;

  switch (face) {
    case 'left':
      return {
        position: [-halfW - padding, halfH, 0],
        size: [depth, height],
        rotation: [0, Math.PI / 2, 0],
      };
    case 'right':
      return {
        position: [halfW + padding, halfH, 0],
        size: [depth, height],
        rotation: [0, -Math.PI / 2, 0],
      };
    case 'front':
      return {
        position: [0, halfH, halfD + padding],
        size: [width, height],
        rotation: [0, 0, 0],
      };
    case 'back':
      return {
        position: [0, halfH, -halfD - padding],
        size: [width, height],
        rotation: [0, Math.PI, 0],
      };
    case 'top':
      return {
        position: [0, height + padding, 0],
        size: [width, depth],
        rotation: [-Math.PI / 2, 0, 0],
      };
    case 'bottom':
      return {
        position: [0, -padding, 0],
        size: [width, depth],
        rotation: [Math.PI / 2, 0, 0],
      };
    default:
      return {
        position: [0, 0, 0],
        size: [100, 100],
        rotation: [0, 0, 0],
      };
  }
}

/**
 * Detect which face was clicked based on click position relative to cabinet
 */
export function detectFaceFromClick(
  clickPoint: [number, number, number],
  cabinetPosition: [number, number, number],
  dimensions: { width: number; height: number; depth: number }
): CabinetFace {
  const [cx, cy, cz] = cabinetPosition;
  const [px, py, pz] = clickPoint;
  const { width, height, depth } = dimensions;

  // Calculate relative position
  const relX = px - cx;
  const relY = py - cy;
  const relZ = pz - cz;

  // Calculate distance to each face
  const distToLeft = Math.abs(relX + width / 2);
  const distToRight = Math.abs(relX - width / 2);
  const distToFront = Math.abs(relZ - depth / 2);
  const distToBack = Math.abs(relZ + depth / 2);
  const distToTop = Math.abs(relY - height);
  const distToBottom = Math.abs(relY);

  // Find minimum distance
  const distances = [
    { face: 'left' as CabinetFace, dist: distToLeft },
    { face: 'right' as CabinetFace, dist: distToRight },
    { face: 'front' as CabinetFace, dist: distToFront },
    { face: 'back' as CabinetFace, dist: distToBack },
    { face: 'top' as CabinetFace, dist: distToTop },
    { face: 'bottom' as CabinetFace, dist: distToBottom },
  ];

  distances.sort((a, b) => a.dist - b.dist);
  return distances[0].face;
}
