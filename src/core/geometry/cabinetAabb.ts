/**
 * Cabinet AABB (Axis-Aligned Bounding Box) Geometry Module
 *
 * @module core/geometry/cabinetAabb
 * @version 1.0.0
 *
 * Provides AABB computation for panels and cabinets.
 * Used by Gate G4 rules for:
 * - G4.1 OD Budget validation (cabinet fits within declared dimensions)
 * - G4.2 Panel overlap detection (no two panels occupy same space)
 *
 * ## Coordinate System
 * - X: Left(-) to Right(+)
 * - Y: Bottom(-) to Top(+)
 * - Z: Back(-) to Front(+)
 *
 * ## Panel Role Axis Mapping
 * - Side panels: [thickness, height, depth]
 * - Top/Bottom/Shelf: [width, thickness, depth]
 * - Back: [width, height, thickness]
 * - Divider: [thickness, height, depth]
 * - Kickboard: [width, height, thickness]
 */

// ============================================
// TYPES
// ============================================

/**
 * Axis-Aligned Bounding Box
 *
 * Represents a 3D box aligned with world axes.
 * min/max corners define the extents in each axis.
 */
export interface Aabb {
  /** Minimum corner (most negative x, y, z) */
  min: [number, number, number];
  /** Maximum corner (most positive x, y, z) */
  max: [number, number, number];
}

/**
 * Minimal panel interface for AABB calculation
 */
export interface PanelForAabb {
  id: string;
  role: string;
  finishWidth: number;
  finishHeight: number;
  position: [number, number, number];
  rotation: [number, number, number];
  computed: {
    realThickness: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Minimal cabinet interface for AABB calculation
 */
export interface CabinetForAabb {
  id: string;
  dimensions: {
    width: number;
    height: number;
    depth: number;
    toeKickHeight: number;
  };
  panels: PanelForAabb[];
  [key: string]: unknown;
}

/**
 * Panel AABB with metadata
 */
export interface PanelAabbResult {
  panelId: string;
  role: string;
  aabb: Aabb;
}

/**
 * Cabinet AABB computation result
 */
export interface CabinetAabbResult {
  /** AABB of entire cabinet (OD budget) */
  cabinetAabb: Aabb;
  /** AABB for each panel */
  panelAabbs: PanelAabbResult[];
}

// ============================================
// PANEL AXIS MAPPING
// ============================================

/**
 * Get panel half-extents in world coordinates based on role.
 *
 * Each panel role maps its local dimensions to world axes differently:
 * - Side panels: thickness→X, height→Y, finishWidth(depth)→Z
 * - Horizontal panels: finishWidth→X, thickness→Y, finishHeight(depth)→Z
 * - Back panel: finishWidth→X, finishHeight→Y, thickness→Z
 *
 * @param panel - Panel to compute extents for
 * @returns [halfX, halfY, halfZ] in world coordinates
 */
export function getPanelHalfExtents(panel: PanelForAabb): [number, number, number] {
  const t = panel.computed.realThickness;
  const w = panel.finishWidth;
  const h = panel.finishHeight;

  switch (panel.role) {
    case 'LEFT_SIDE':
    case 'RIGHT_SIDE':
    case 'DIVIDER':
      // Side panels: thickness in X, height in Y, depth(finishWidth) in Z
      return [t / 2, h / 2, w / 2];

    case 'TOP':
    case 'BOTTOM':
    case 'SHELF':
      // Horizontal panels: width in X, thickness in Y, depth(finishHeight) in Z
      return [w / 2, t / 2, h / 2];

    case 'BACK':
    case 'KICKBOARD':
      // Vertical XY panels: width in X, height in Y, thickness in Z.
      // KICKBOARD must be listed explicitly — the default: below is the
      // HORIZONTAL mapping and would silently give the plinth a wrong AABB.
      return [w / 2, h / 2, t / 2];

    default:
      // Default: treat as horizontal panel
      return [w / 2, t / 2, h / 2];
  }
}

// ============================================
// AABB COMPUTATION
// ============================================

/**
 * Compute AABB for a single panel.
 *
 * Uses panel position (center) and role-based half-extents to
 * compute the axis-aligned bounding box.
 *
 * Note: Rotation is ignored for AABB (assumes panels are axis-aligned).
 * This is valid for standard cabinet construction where all panels
 * are perpendicular to world axes.
 *
 * @param panel - Panel to compute AABB for
 * @returns AABB with min/max corners
 *
 * @example
 * const panel = { role: 'LEFT_SIDE', position: [9, 360, 280], finishWidth: 560, finishHeight: 720, computed: { realThickness: 18 } };
 * const aabb = computePanelAabb(panel);
 * // aabb.min = [0, 0, 0]
 * // aabb.max = [18, 720, 560]
 */
export function computePanelAabb(panel: PanelForAabb): Aabb {
  const [cx, cy, cz] = panel.position;
  const [hx, hy, hz] = getPanelHalfExtents(panel);

  return {
    min: [cx - hx, cy - hy, cz - hz],
    max: [cx + hx, cy + hy, cz + hz],
  };
}

/**
 * Compute AABBs for all panels in a cabinet.
 *
 * Also computes the overall cabinet AABB by unioning all panel AABBs.
 *
 * @param cabinet - Cabinet to compute AABBs for
 * @returns Cabinet AABB and array of panel AABBs
 *
 * @example
 * const result = computeCabinetAabbs(cabinet);
 * console.log(result.cabinetAabb); // Overall bounding box
 * console.log(result.panelAabbs);  // Per-panel bounding boxes
 */
export function computeCabinetAabbs(cabinet: CabinetForAabb): CabinetAabbResult {
  const panelAabbs: PanelAabbResult[] = [];

  // Initialize cabinet AABB with extreme values
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const panel of cabinet.panels) {
    const aabb = computePanelAabb(panel);
    panelAabbs.push({
      panelId: panel.id,
      role: panel.role,
      aabb,
    });

    // Expand cabinet AABB to include this panel
    minX = Math.min(minX, aabb.min[0]);
    minY = Math.min(minY, aabb.min[1]);
    minZ = Math.min(minZ, aabb.min[2]);
    maxX = Math.max(maxX, aabb.max[0]);
    maxY = Math.max(maxY, aabb.max[1]);
    maxZ = Math.max(maxZ, aabb.max[2]);
  }

  // Handle empty cabinet case
  if (panelAabbs.length === 0) {
    return {
      cabinetAabb: { min: [0, 0, 0], max: [0, 0, 0] },
      panelAabbs: [],
    };
  }

  return {
    cabinetAabb: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    },
    panelAabbs,
  };
}

// ============================================
// AABB UTILITIES
// ============================================

/**
 * Get AABB dimensions (width, height, depth).
 *
 * @param aabb - Bounding box to measure
 * @returns [width, height, depth] in mm
 */
export function getAabbDimensions(aabb: Aabb): [number, number, number] {
  return [
    aabb.max[0] - aabb.min[0],
    aabb.max[1] - aabb.min[1],
    aabb.max[2] - aabb.min[2],
  ];
}

/**
 * Check if two AABBs overlap.
 *
 * Uses separating axis theorem - if there's a gap in any axis,
 * the boxes don't overlap.
 *
 * @param a - First bounding box
 * @param b - Second bounding box
 * @returns true if boxes overlap, false otherwise
 *
 * @example
 * const overlaps = aabbsOverlap(panelA.aabb, panelB.aabb);
 * if (overlaps) {
 *   console.error('Panel collision detected!');
 * }
 */
export function aabbsOverlap(a: Aabb, b: Aabb): boolean {
  // Check for separation in each axis
  // If separated in any axis, no overlap
  if (a.max[0] <= b.min[0] || b.max[0] <= a.min[0]) return false;
  if (a.max[1] <= b.min[1] || b.max[1] <= a.min[1]) return false;
  if (a.max[2] <= b.min[2] || b.max[2] <= a.min[2]) return false;
  return true;
}

/**
 * Compute overlap volume between two AABBs.
 *
 * Returns 0 if no overlap, otherwise returns the volume
 * of the intersection region.
 *
 * @param a - First bounding box
 * @param b - Second bounding box
 * @returns Overlap volume in mm³
 */
export function aabbOverlapVolume(a: Aabb, b: Aabb): number {
  const overlapX = Math.max(0, Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]));
  const overlapY = Math.max(0, Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]));
  const overlapZ = Math.max(0, Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]));
  return overlapX * overlapY * overlapZ;
}

/**
 * Check if an AABB fits within declared OD (Outer Dimensions) budget.
 *
 * Validates that computed cabinet geometry doesn't exceed the
 * declared cabinet dimensions.
 *
 * @param aabb - Computed cabinet bounding box
 * @param odWidth - Declared outer width (mm)
 * @param odHeight - Declared outer height (mm)
 * @param odDepth - Declared outer depth (mm)
 * @param tolerance - Allowed tolerance (mm), default 0.1mm
 * @returns Object with pass/fail and deltas for each axis
 *
 * @example
 * const result = checkOdBudget(cabinetAabb, 600, 720, 560);
 * if (!result.pass) {
 *   console.error(`Width exceeded by ${result.deltaWidth}mm`);
 * }
 */
export function checkOdBudget(
  aabb: Aabb,
  odWidth: number,
  odHeight: number,
  odDepth: number,
  tolerance: number = 0.1
): {
  pass: boolean;
  deltaWidth: number;
  deltaHeight: number;
  deltaDepth: number;
  computedWidth: number;
  computedHeight: number;
  computedDepth: number;
} {
  const [w, h, d] = getAabbDimensions(aabb);

  const deltaWidth = w - odWidth;
  const deltaHeight = h - odHeight;
  const deltaDepth = d - odDepth;

  const pass =
    deltaWidth <= tolerance &&
    deltaHeight <= tolerance &&
    deltaDepth <= tolerance;

  return {
    pass,
    deltaWidth,
    deltaHeight,
    deltaDepth,
    computedWidth: w,
    computedHeight: h,
    computedDepth: d,
  };
}

/**
 * Find all overlapping panel pairs in a cabinet.
 *
 * Used by G4.2 to detect panel collisions.
 *
 * @param panelAabbs - Array of panel AABBs
 * @returns Array of overlapping pairs with overlap volume
 */
export function findOverlappingPanels(
  panelAabbs: PanelAabbResult[]
): Array<{
  panelA: string;
  panelB: string;
  roleA: string;
  roleB: string;
  overlapVolume: number;
}> {
  const overlaps: Array<{
    panelA: string;
    panelB: string;
    roleA: string;
    roleB: string;
    overlapVolume: number;
  }> = [];

  // Check all pairs
  for (let i = 0; i < panelAabbs.length; i++) {
    for (let j = i + 1; j < panelAabbs.length; j++) {
      const a = panelAabbs[i];
      const b = panelAabbs[j];

      const volume = aabbOverlapVolume(a.aabb, b.aabb);
      if (volume > 0) {
        overlaps.push({
          panelA: a.panelId,
          panelB: b.panelId,
          roleA: a.role,
          roleB: b.role,
          overlapVolume: volume,
        });
      }
    }
  }

  return overlaps;
}
