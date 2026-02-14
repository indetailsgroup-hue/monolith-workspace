/**
 * Snap System - Cabinet-to-Cabinet and Grid Snapping
 *
 * Features:
 * - Edge-to-edge snapping (cabinets align side-by-side)
 * - Grid snapping (10mm increments)
 * - Snap threshold detection
 * - Visual guide generation
 */

// ============================================
// TYPES
// ============================================

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerY: number;
  centerZ: number;
}

export interface SnapTarget {
  id: string;
  position: [number, number, number];  // mm
  dimensions: { width: number; height: number; depth: number };
  rotation: number;  // Y-axis rotation in radians
}

export interface SnapGuide {
  type: 'edge' | 'center' | 'grid' | 'wall' | 'vertex';
  axis: 'x' | 'y' | 'z';
  position: number;  // Position along the axis (mm)
  start: [number, number, number];  // Line start point (mm)
  end: [number, number, number];    // Line end point (mm)
  targetId?: string;  // ID of cabinet being snapped to
  vertexIndex?: number;  // For vertex snap, which corner (0-3)
}

export interface VertexSnapResult {
  snapped: boolean;
  movingCorner: number;  // 0-3 index
  targetCorner: number;  // 0-3 index
  targetId: string;
  offset: [number, number];  // X, Z offset to apply
}

export interface SnapResult {
  snapped: boolean;
  position: [number, number, number];  // Final snapped position (mm)
  guides: SnapGuide[];
  snappedAxes: { x: boolean; y: boolean; z: boolean };
}

// ============================================
// CONSTANTS
// ============================================

export const DEFAULT_SNAP_THRESHOLD = 50;  // mm - distance to trigger snap
export const DEFAULT_GRID_SIZE = 10;       // mm - grid snap increment
export const DEFAULT_VERTEX_THRESHOLD = 80; // mm - larger threshold for vertex snap

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Calculate bounding box for a cabinet considering rotation
 */
export function calculateBoundingBox(target: SnapTarget): BoundingBox {
  const { position, dimensions, rotation } = target;
  const [px, py, pz] = position;
  const { width, height, depth } = dimensions;

  // For 90° rotations, swap width and depth
  const isRotated90 = Math.abs(Math.sin(rotation)) > 0.5;
  const effectiveWidth = isRotated90 ? depth : width;
  const effectiveDepth = isRotated90 ? width : depth;

  const halfW = effectiveWidth / 2;
  const halfD = effectiveDepth / 2;

  return {
    minX: px - halfW,
    maxX: px + halfW,
    minY: py,
    maxY: py + height,
    minZ: pz - halfD,
    maxZ: pz + halfD,
    centerX: px,
    centerY: py + height / 2,
    centerZ: pz,
  };
}

/**
 * Snap a value to grid
 */
export function snapToGrid(value: number, gridSize: number = DEFAULT_GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Check if two values are within snap threshold
 */
export function isWithinThreshold(a: number, b: number, threshold: number = DEFAULT_SNAP_THRESHOLD): boolean {
  return Math.abs(a - b) <= threshold;
}

/**
 * Get the 4 bottom corners of a bounding box (floor level for cabinets)
 * Returns array of [x, z] coordinates in order: front-left, front-right, back-right, back-left
 */
export function getBottomVertices(box: BoundingBox): [number, number][] {
  return [
    [box.minX, box.maxZ],  // 0: front-left
    [box.maxX, box.maxZ],  // 1: front-right
    [box.maxX, box.minZ],  // 2: back-right
    [box.minX, box.minZ],  // 3: back-left
  ];
}

/**
 * Calculate distance between two 2D points
 */
export function distance2D(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dz = a[1] - b[1];
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Find the closest vertex snap between moving and target cabinets
 */
export function findVertexSnap(
  movingBox: BoundingBox,
  targetBox: BoundingBox,
  targetId: string,
  threshold: number = DEFAULT_VERTEX_THRESHOLD
): VertexSnapResult | null {
  const movingVertices = getBottomVertices(movingBox);
  const targetVertices = getBottomVertices(targetBox);

  let bestSnap: VertexSnapResult | null = null;
  let bestDistance = threshold;

  // Check each moving vertex against each target vertex
  for (let mi = 0; mi < movingVertices.length; mi++) {
    for (let ti = 0; ti < targetVertices.length; ti++) {
      const dist = distance2D(movingVertices[mi], targetVertices[ti]);
      if (dist < bestDistance) {
        bestDistance = dist;
        // Calculate offset to align vertices
        const offsetX = targetVertices[ti][0] - movingVertices[mi][0];
        const offsetZ = targetVertices[ti][1] - movingVertices[mi][1];
        bestSnap = {
          snapped: true,
          movingCorner: mi,
          targetCorner: ti,
          targetId,
          offset: [offsetX, offsetZ],
        };
      }
    }
  }

  return bestSnap;
}

/**
 * Check if two bounding boxes overlap on XZ plane (ignore Y for floor cabinets)
 */
export function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  // Check X overlap
  const xOverlap = a.maxX > b.minX && a.minX < b.maxX;
  // Check Z overlap
  const zOverlap = a.maxZ > b.minZ && a.minZ < b.maxZ;
  // Both must overlap for collision
  return xOverlap && zOverlap;
}

/**
 * Calculate minimum translation to resolve collision
 * Returns the axis and distance to push the moving box out
 */
export function resolveCollision(
  movingBox: BoundingBox,
  targetBox: BoundingBox
): { axis: 'x' | 'z'; distance: number } | null {
  if (!boxesOverlap(movingBox, targetBox)) {
    return null;
  }

  // Calculate penetration depth on each axis
  const xPenRight = movingBox.maxX - targetBox.minX; // Moving is to the left, push left
  const xPenLeft = targetBox.maxX - movingBox.minX;  // Moving is to the right, push right
  const zPenFront = movingBox.maxZ - targetBox.minZ; // Moving is behind, push back
  const zPenBack = targetBox.maxZ - movingBox.minZ;  // Moving is in front, push forward

  // Find minimum penetration (shortest way out)
  const xMin = Math.min(xPenRight, xPenLeft);
  const zMin = Math.min(zPenFront, zPenBack);

  if (xMin < zMin) {
    // Push on X axis
    if (xPenRight < xPenLeft) {
      return { axis: 'x', distance: -xPenRight }; // Push left
    } else {
      return { axis: 'x', distance: xPenLeft }; // Push right
    }
  } else {
    // Push on Z axis
    if (zPenFront < zPenBack) {
      return { axis: 'z', distance: -zPenFront }; // Push back
    } else {
      return { axis: 'z', distance: zPenBack }; // Push forward
    }
  }
}

// ============================================
// MAIN SNAP CALCULATION
// ============================================

/**
 * Calculate snap position for a moving cabinet
 *
 * @param moving - The cabinet being moved
 * @param targets - Other cabinets in the scene
 * @param options - Snap configuration
 * @returns SnapResult with final position and visual guides
 */
export function calculateSnap(
  moving: SnapTarget,
  targets: SnapTarget[],
  options: {
    gridSize?: number;
    snapThreshold?: number;
    vertexThreshold?: number;
    enableEdgeSnap?: boolean;
    enableGridSnap?: boolean;
    enableCenterSnap?: boolean;
    enableWallSnap?: boolean;
    enableVertexSnap?: boolean;
    wallPositions?: { x?: number[]; z?: number[] };
  } = {}
): SnapResult {
  const {
    gridSize = DEFAULT_GRID_SIZE,
    snapThreshold = DEFAULT_SNAP_THRESHOLD,
    vertexThreshold = DEFAULT_VERTEX_THRESHOLD,
    enableEdgeSnap = true,
    enableGridSnap = true,
    enableCenterSnap = true,
    enableWallSnap = true,
    enableVertexSnap = false,  // Off by default, enabled with P key
    wallPositions = { x: [0], z: [0] },  // Default walls at X=0 and Z=0
  } = options;

  const movingBox = calculateBoundingBox(moving);
  const guides: SnapGuide[] = [];
  const snappedAxes = { x: false, y: false, z: false };

  let [snapX, snapY, snapZ] = moving.position;

  // Filter out the moving cabinet from targets (moved up for vertex snap)
  const otherTargets = targets.filter(t => t.id !== moving.id);

  // Calculate bounding boxes for all other cabinets
  const targetBoxes = otherTargets.map(t => ({
    target: t,
    box: calculateBoundingBox(t),
  }));

  // ========== VERTEX SNAPPING (HIGHEST priority when enabled) ==========
  // When P key is pressed, vertex snap takes precedence over everything
  // This snaps corner-to-corner for precise alignment
  if (enableVertexSnap) {
    let bestVertexSnap: VertexSnapResult | null = null;
    let bestDistance = vertexThreshold;

    for (const { target, box } of targetBoxes) {
      const vertexSnap = findVertexSnap(movingBox, box, target.id, vertexThreshold);
      if (vertexSnap) {
        // Calculate actual distance for comparison
        const movingVertices = getBottomVertices(movingBox);
        const targetVertices = getBottomVertices(box);
        const dist = distance2D(
          movingVertices[vertexSnap.movingCorner],
          targetVertices[vertexSnap.targetCorner]
        );
        if (dist < bestDistance) {
          bestDistance = dist;
          bestVertexSnap = vertexSnap;
        }
      }
    }

    if (bestVertexSnap) {
      // Apply vertex snap offset
      snapX += bestVertexSnap.offset[0];
      snapZ += bestVertexSnap.offset[1];
      snappedAxes.x = true;
      snappedAxes.z = true;

      // Get the snapped vertex positions for guide visualization
      const targetBox = targetBoxes.find(t => t.target.id === bestVertexSnap!.targetId)!.box;
      const targetVertices = getBottomVertices(targetBox);
      const snapVertex = targetVertices[bestVertexSnap.targetCorner];

      // Add vertex snap guide (vertical line at snap point)
      guides.push({
        type: 'vertex',
        axis: 'y',
        position: snapVertex[0],
        start: [snapVertex[0], 0, snapVertex[1]],
        end: [snapVertex[0], movingBox.maxY, snapVertex[1]],
        targetId: bestVertexSnap.targetId,
        vertexIndex: bestVertexSnap.targetCorner,
      });
    }
  }

  // ========== WALL SNAPPING ==========
  // Skip if vertex snap already triggered
  if (enableWallSnap && !snappedAxes.x && !snappedAxes.z) {
    // X-axis wall snap (cabinet's left edge to wall)
    for (const wallX of wallPositions.x || []) {
      // Snap cabinet's left edge (minX) to wall
      if (isWithinThreshold(movingBox.minX, wallX, snapThreshold)) {
        const offset = movingBox.centerX - movingBox.minX;
        snapX = wallX + offset;
        snappedAxes.x = true;
        guides.push({
          type: 'wall',
          axis: 'x',
          position: wallX,
          start: [wallX, movingBox.minY, movingBox.minZ],
          end: [wallX, movingBox.maxY, movingBox.maxZ],
        });
        break;
      }
      // Snap cabinet's right edge (maxX) to wall
      if (isWithinThreshold(movingBox.maxX, wallX, snapThreshold)) {
        const offset = movingBox.maxX - movingBox.centerX;
        snapX = wallX - offset;
        snappedAxes.x = true;
        guides.push({
          type: 'wall',
          axis: 'x',
          position: wallX,
          start: [wallX, movingBox.minY, movingBox.minZ],
          end: [wallX, movingBox.maxY, movingBox.maxZ],
        });
        break;
      }
    }

    // Z-axis wall snap (cabinet's back edge to wall)
    for (const wallZ of wallPositions.z || []) {
      // Snap cabinet's back edge (minZ) to wall
      if (isWithinThreshold(movingBox.minZ, wallZ, snapThreshold)) {
        const offset = movingBox.centerZ - movingBox.minZ;
        snapZ = wallZ + offset;
        snappedAxes.z = true;
        guides.push({
          type: 'wall',
          axis: 'z',
          position: wallZ,
          start: [movingBox.minX, movingBox.minY, wallZ],
          end: [movingBox.maxX, movingBox.maxY, wallZ],
        });
        break;
      }
      // Snap cabinet's front edge (maxZ) to wall
      if (isWithinThreshold(movingBox.maxZ, wallZ, snapThreshold)) {
        const offset = movingBox.maxZ - movingBox.centerZ;
        snapZ = wallZ - offset;
        snappedAxes.z = true;
        guides.push({
          type: 'wall',
          axis: 'z',
          position: wallZ,
          start: [movingBox.minX, movingBox.minY, wallZ],
          end: [movingBox.maxX, movingBox.maxY, wallZ],
        });
        break;
      }
    }
  }

  // ========== X-AXIS SNAPPING (Left-Right) ==========
  // Skip if already wall-snapped on X
  if (enableEdgeSnap && !snappedAxes.x) {
    for (const { target, box } of targetBoxes) {
      // Moving's right edge -> Target's left edge
      if (isWithinThreshold(movingBox.maxX, box.minX, snapThreshold)) {
        const snapValue = box.minX - (movingBox.maxX - movingBox.centerX);
        snapX = snapValue;
        snappedAxes.x = true;
        guides.push({
          type: 'edge',
          axis: 'x',
          position: box.minX,
          start: [box.minX, movingBox.minY, movingBox.centerZ],
          end: [box.minX, movingBox.maxY, movingBox.centerZ],
          targetId: target.id,
        });
        break;
      }

      // Moving's left edge -> Target's right edge
      if (isWithinThreshold(movingBox.minX, box.maxX, snapThreshold)) {
        const snapValue = box.maxX + (movingBox.centerX - movingBox.minX);
        snapX = snapValue;
        snappedAxes.x = true;
        guides.push({
          type: 'edge',
          axis: 'x',
          position: box.maxX,
          start: [box.maxX, movingBox.minY, movingBox.centerZ],
          end: [box.maxX, movingBox.maxY, movingBox.centerZ],
          targetId: target.id,
        });
        break;
      }

      // Center alignment (X)
      if (enableCenterSnap && isWithinThreshold(movingBox.centerX, box.centerX, snapThreshold / 2)) {
        snapX = box.centerX;
        snappedAxes.x = true;
        // Vertical line at the center X position, spanning cabinet height
        guides.push({
          type: 'center',
          axis: 'x',
          position: box.centerX,
          start: [box.centerX, movingBox.minY, movingBox.centerZ],
          end: [box.centerX, movingBox.maxY, movingBox.centerZ],
          targetId: target.id,
        });
        break;
      }
    }
  }

  // ========== Z-AXIS SNAPPING (Front-Back) ==========
  // Skip if already wall-snapped on Z
  if (enableEdgeSnap && !snappedAxes.z) {
    for (const { target, box } of targetBoxes) {
      // Moving's front edge -> Target's back edge
      if (isWithinThreshold(movingBox.maxZ, box.minZ, snapThreshold)) {
        const snapValue = box.minZ - (movingBox.maxZ - movingBox.centerZ);
        snapZ = snapValue;
        snappedAxes.z = true;
        guides.push({
          type: 'edge',
          axis: 'z',
          position: box.minZ,
          start: [movingBox.centerX, movingBox.minY, box.minZ],
          end: [movingBox.centerX, movingBox.maxY, box.minZ],
          targetId: target.id,
        });
        break;
      }

      // Moving's back edge -> Target's front edge
      if (isWithinThreshold(movingBox.minZ, box.maxZ, snapThreshold)) {
        const snapValue = box.maxZ + (movingBox.centerZ - movingBox.minZ);
        snapZ = snapValue;
        snappedAxes.z = true;
        guides.push({
          type: 'edge',
          axis: 'z',
          position: box.maxZ,
          start: [movingBox.centerX, movingBox.minY, box.maxZ],
          end: [movingBox.centerX, movingBox.maxY, box.maxZ],
          targetId: target.id,
        });
        break;
      }

      // Center alignment (Z)
      if (enableCenterSnap && isWithinThreshold(movingBox.centerZ, box.centerZ, snapThreshold / 2)) {
        snapZ = box.centerZ;
        snappedAxes.z = true;
        // Vertical line at the center Z position, spanning cabinet height
        guides.push({
          type: 'center',
          axis: 'z',
          position: box.centerZ,
          start: [movingBox.centerX, movingBox.minY, box.centerZ],
          end: [movingBox.centerX, movingBox.maxY, box.centerZ],
          targetId: target.id,
        });
        break;
      }
    }
  }

  // ========== GRID SNAPPING (Fallback) ==========
  if (enableGridSnap) {
    // Only grid snap if not edge snapped
    if (!snappedAxes.x) {
      const gridX = snapToGrid(snapX, gridSize);
      if (isWithinThreshold(snapX, gridX, gridSize / 2)) {
        snapX = gridX;
        snappedAxes.x = true;
        guides.push({
          type: 'grid',
          axis: 'x',
          position: gridX,
          start: [gridX, 0, snapZ - 500],
          end: [gridX, 0, snapZ + 500],
        });
      }
    }

    if (!snappedAxes.z) {
      const gridZ = snapToGrid(snapZ, gridSize);
      if (isWithinThreshold(snapZ, gridZ, gridSize / 2)) {
        snapZ = gridZ;
        snappedAxes.z = true;
        guides.push({
          type: 'grid',
          axis: 'z',
          position: gridZ,
          start: [snapX - 500, 0, gridZ],
          end: [snapX + 500, 0, gridZ],
        });
      }
    }
  }

  // Y-axis (height) - usually stays at floor level (0)
  // Could add floor/shelf snapping here if needed

  // ========== COLLISION DETECTION ==========
  // After snap calculation, check if position causes overlap
  // and push cabinet out to prevent collision
  const proposedPosition: [number, number, number] = [snapX, snapY, snapZ];
  const proposedTarget: SnapTarget = { ...moving, position: proposedPosition };
  let proposedBox = calculateBoundingBox(proposedTarget);

  // Check collision with each target and resolve
  for (const { target, box } of targetBoxes) {
    const resolution = resolveCollision(proposedBox, box);
    if (resolution) {
      if (resolution.axis === 'x') {
        snapX += resolution.distance;
      } else {
        snapZ += resolution.distance;
      }
      // Recalculate box after resolution
      proposedTarget.position = [snapX, snapY, snapZ];
      proposedBox = calculateBoundingBox(proposedTarget);

      // Generate edge guide at collision boundary
      if (resolution.axis === 'x') {
        const edgeX = resolution.distance < 0 ? box.minX : box.maxX;
        guides.push({
          type: 'edge',
          axis: 'x',
          position: edgeX,
          start: [edgeX, proposedBox.minY, proposedBox.centerZ],
          end: [edgeX, proposedBox.maxY, proposedBox.centerZ],
          targetId: target.id,
        });
        snappedAxes.x = true;
      } else {
        const edgeZ = resolution.distance < 0 ? box.minZ : box.maxZ;
        guides.push({
          type: 'edge',
          axis: 'z',
          position: edgeZ,
          start: [proposedBox.centerX, proposedBox.minY, edgeZ],
          end: [proposedBox.centerX, proposedBox.maxY, edgeZ],
          targetId: target.id,
        });
        snappedAxes.z = true;
      }
    }
  }

  return {
    snapped: snappedAxes.x || snappedAxes.y || snappedAxes.z,
    position: [snapX, snapY, snapZ],
    guides,
    snappedAxes,
  };
}

/**
 * Get snap guides for visualization (filtered by relevance)
 */
export function getActiveSnapGuides(
  moving: SnapTarget,
  targets: SnapTarget[],
  options?: Parameters<typeof calculateSnap>[2]
): SnapGuide[] {
  const result = calculateSnap(moving, targets, options);
  return result.guides;
}

/**
 * Apply snap to a position (for use with TransformControls)
 */
export function applySnap(
  currentPosition: [number, number, number],
  moving: Omit<SnapTarget, 'position'>,
  targets: SnapTarget[],
  options?: Parameters<typeof calculateSnap>[2]
): [number, number, number] {
  const movingTarget: SnapTarget = {
    ...moving,
    position: currentPosition,
  };

  const result = calculateSnap(movingTarget, targets, options);
  return result.position;
}
