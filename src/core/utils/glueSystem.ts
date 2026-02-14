/**
 * Glue System - Cabinet Alignment Calculator
 *
 * Computes target cabinet position when gluing two cabinet faces together.
 * Used by App.tsx in the glue confirmation effect.
 */

// ============================================
// TYPES
// ============================================

export interface CabinetBounds {
  id: string;
  /** Center position [x, y, z] in mm */
  position: [number, number, number];
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  /** Y-axis rotation in radians */
  rotation: number;
  toeKickHeight: number;
}

interface GlueFaceRef {
  cabinet: CabinetBounds;
  face: string;
}

interface AlignmentOptions {
  alignFronts: boolean;
  alignBottoms: boolean;
}

interface AlignmentResult {
  newPosition: [number, number, number];
}

// ============================================
// FACE NORMAL MAPPING
// ============================================

function getFaceNormal(face: string): [number, number, number] {
  switch (face) {
    case 'left':   return [-1, 0, 0];
    case 'right':  return [1, 0, 0];
    case 'front':  return [0, 0, 1];
    case 'back':   return [0, 0, -1];
    case 'top':    return [0, 1, 0];
    case 'bottom': return [0, -1, 0];
    default:       return [1, 0, 0];
  }
}

function getFaceOffset(face: string, dims: { width: number; height: number; depth: number }): number {
  switch (face) {
    case 'left':
    case 'right':  return dims.width / 2;
    case 'front':
    case 'back':   return dims.depth / 2;
    case 'top':
    case 'bottom': return dims.height / 2;
    default:       return dims.width / 2;
  }
}

// ============================================
// ALIGNMENT CALCULATOR
// ============================================

/**
 * Calculate new position for target cabinet when glued to source face.
 *
 * Positions the target cabinet so its selected face touches the source's selected face.
 * Optionally aligns fronts and bottoms.
 */
export function calculateGlueAlignment(
  source: GlueFaceRef,
  target: GlueFaceRef,
  gap: number,
  options: AlignmentOptions
): AlignmentResult {
  const srcPos = source.cabinet.position;
  const srcDims = source.cabinet.dimensions;
  const tgtDims = target.cabinet.dimensions;

  // Get face normals and offsets
  const srcNormal = getFaceNormal(source.face);
  const srcOffset = getFaceOffset(source.face, srcDims);
  const tgtOffset = getFaceOffset(target.face, tgtDims);

  // New position starts at source center
  const newPos: [number, number, number] = [...srcPos];

  // Move along source normal by source offset + gap + target offset
  for (let i = 0; i < 3; i++) {
    newPos[i] += srcNormal[i] * (srcOffset + gap + tgtOffset);
  }

  // Align fronts (z-axis)
  if (options.alignFronts) {
    const srcFront = srcPos[2] - srcDims.depth / 2;
    newPos[2] = srcFront + tgtDims.depth / 2;
  }

  // Align bottoms (y-axis)
  if (options.alignBottoms) {
    const srcBottom = srcPos[1] - srcDims.height / 2;
    newPos[1] = srcBottom + tgtDims.height / 2;
  }

  return { newPosition: newPos };
}
