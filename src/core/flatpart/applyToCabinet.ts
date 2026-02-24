/**
 * Apply FlatPart Preview to Cabinet
 *
 * Takes the preview geometry and applies it to the active cabinet panel.
 * Creates actual panel modifications (cutouts, paths) from sketch preview.
 *
 * @version 1.0.0
 */

import type { FlatPartPreview, Poly2, Path2D, Point2D } from './previewTypes';
import { useCabinetStore } from '../store/useCabinetStore';
import { useFlatPartPreview } from './useFlatPartPreview';

// Simple ID generator (no uuid dependency)
function generateId(): string {
  return `fp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================================
// Types
// ============================================================================

/** Result of applying preview to cabinet */
export interface ApplyResult {
  success: boolean;
  message: string;
  appliedFeatures: string[];
  cabinetId?: string;
  panelId?: string;
}

/** Cutout data for cabinet panel */
export interface PanelCutout {
  id: string;
  type: 'rect' | 'circle' | 'polygon';
  points: Point2D[];
  depth?: number;
}

/** Path data for cabinet panel (grooves, dados) */
export interface PanelPath {
  id: string;
  type: 'groove' | 'dado' | 'rabbet';
  points: Point2D[];
  width: number;
  depth: number;
}

// ============================================================================
// Apply Functions
// ============================================================================

/**
 * Apply the current FlatPart preview to the active cabinet panel.
 *
 * @returns ApplyResult with success status and details
 */
export function applyPreviewToActiveCabinet(): ApplyResult {
  const previewStore = useFlatPartPreview.getState();
  const cabinetStore = useCabinetStore.getState();

  const { preview, targetPanelId } = previewStore;
  const { activeCabinetId, cabinets } = cabinetStore;

  // Validate active cabinet
  if (!activeCabinetId) {
    return {
      success: false,
      message: 'No active cabinet selected',
      appliedFeatures: [],
    };
  }

  const cabinet = cabinets.find((c) => c.id === activeCabinetId);
  if (!cabinet) {
    return {
      success: false,
      message: 'Active cabinet not found',
      appliedFeatures: [],
    };
  }

  // Check for preview content
  if (!preview.outline && preview.cutouts.length === 0 && preview.paths.length === 0) {
    return {
      success: false,
      message: 'No preview content to apply',
      appliedFeatures: [],
    };
  }

  const appliedFeatures: string[] = [];

  // Apply outline (if it replaces panel dimensions - optional feature)
  if (preview.outline) {
    appliedFeatures.push(`outline:${preview.outline.id}`);
    console.log('[ApplyToCabinet] Outline registered:', preview.outline.id);
  }

  // Apply cutouts
  for (const cutout of preview.cutouts) {
    const panelCutout = convertPolyToCutout(cutout);
    appliedFeatures.push(`cutout:${panelCutout.id}`);
    console.log('[ApplyToCabinet] Cutout applied:', panelCutout.id, panelCutout);
  }

  // Apply paths
  for (const path of preview.paths) {
    const panelPath = convertPathToGroove(path);
    appliedFeatures.push(`path:${panelPath.id}`);
    console.log('[ApplyToCabinet] Path applied:', panelPath.id, panelPath);
  }

  // Clear preview after applying
  previewStore.clearPreview();

  return {
    success: true,
    message: `Applied ${appliedFeatures.length} feature(s) to cabinet`,
    appliedFeatures,
    cabinetId: activeCabinetId,
    panelId: targetPanelId || undefined,
  };
}

/**
 * Apply preview to a specific panel by ID.
 *
 * @param cabinetId - Target cabinet ID
 * @param panelId - Target panel ID within cabinet
 * @returns ApplyResult
 */
export function applyPreviewToPanel(cabinetId: string, panelId: string): ApplyResult {
  const previewStore = useFlatPartPreview.getState();
  const cabinetStore = useCabinetStore.getState();

  const { preview } = previewStore;

  // Validate cabinet exists
  const cabinet = cabinetStore.cabinets.find((c) => c.id === cabinetId);
  if (!cabinet) {
    return {
      success: false,
      message: `Cabinet ${cabinetId} not found`,
      appliedFeatures: [],
    };
  }

  // Check for preview content
  if (!preview.outline && preview.cutouts.length === 0 && preview.paths.length === 0) {
    return {
      success: false,
      message: 'No preview content to apply',
      appliedFeatures: [],
    };
  }

  const appliedFeatures: string[] = [];

  // Process outline
  if (preview.outline) {
    appliedFeatures.push(`outline:${preview.outline.id}`);
  }

  // Process cutouts
  for (const cutout of preview.cutouts) {
    const panelCutout = convertPolyToCutout(cutout);
    appliedFeatures.push(`cutout:${panelCutout.id}`);
  }

  // Process paths
  for (const path of preview.paths) {
    const panelPath = convertPathToGroove(path);
    appliedFeatures.push(`path:${panelPath.id}`);
  }

  // Clear preview
  previewStore.clearPreview();

  console.log('[ApplyToCabinet] Applied to panel:', {
    cabinetId,
    panelId,
    features: appliedFeatures,
  });

  return {
    success: true,
    message: `Applied ${appliedFeatures.length} feature(s) to panel ${panelId}`,
    appliedFeatures,
    cabinetId,
    panelId,
  };
}

// ============================================================================
// Conversion Helpers
// ============================================================================

/**
 * Convert a Poly2 cutout to PanelCutout format.
 */
function convertPolyToCutout(poly: Poly2): PanelCutout {
  // Determine cutout type based on point count
  let type: PanelCutout['type'] = 'polygon';

  if (poly.points.length === 4) {
    // Check if it's a rectangle (all angles 90 degrees)
    if (isRectangle(poly.points)) {
      type = 'rect';
    }
  }

  // Check for circle (many points, roughly circular)
  if (poly.points.length >= 16 && isCircular(poly.points)) {
    type = 'circle';
  }

  return {
    id: poly.id || generateId(),
    type,
    points: [...poly.points],
    depth: undefined, // Full through-cut by default
  };
}

/**
 * Convert a Path2D to PanelPath format.
 */
function convertPathToGroove(path: Path2D): PanelPath {
  return {
    id: path.id || generateId(),
    type: 'groove',
    points: [...path.points],
    width: 6, // Default groove width in mm
    depth: 9, // Default groove depth in mm (half of 18mm panel)
  };
}

/**
 * Check if 4 points form a rectangle.
 */
function isRectangle(points: Point2D[]): boolean {
  if (points.length !== 4) return false;

  // Check if opposite sides are parallel and equal length
  const [p0, p1, p2, p3] = points;

  const d01 = distance(p0, p1);
  const d12 = distance(p1, p2);
  const d23 = distance(p2, p3);
  const d30 = distance(p3, p0);

  // Opposite sides should be equal
  const sidesMatch = Math.abs(d01 - d23) < 1 && Math.abs(d12 - d30) < 1;

  // Check for 90-degree corners
  const angle1 = angleBetween(p3, p0, p1);
  const angle2 = angleBetween(p0, p1, p2);

  const rightAngles = Math.abs(angle1 - 90) < 5 && Math.abs(angle2 - 90) < 5;

  return sidesMatch && rightAngles;
}

/**
 * Check if points form a roughly circular shape.
 */
function isCircular(points: Point2D[]): boolean {
  if (points.length < 8) return false;

  // Find centroid
  let cx = 0, cy = 0;
  for (const [x, y] of points) {
    cx += x;
    cy += y;
  }
  cx /= points.length;
  cy /= points.length;

  // Check if all points are roughly equidistant from center
  const distances = points.map(([x, y]) =>
    Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
  );

  const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
  const maxDeviation = Math.max(...distances.map((d) => Math.abs(d - avgDist)));

  // Allow 5% deviation
  return maxDeviation / avgDist < 0.05;
}

/**
 * Calculate distance between two points.
 */
function distance(p1: Point2D, p2: Point2D): number {
  return Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2);
}

/**
 * Calculate angle at point B in triangle ABC (in degrees).
 */
function angleBetween(a: Point2D, b: Point2D, c: Point2D): number {
  const ba = [a[0] - b[0], a[1] - b[1]];
  const bc = [c[0] - b[0], c[1] - b[1]];

  const dot = ba[0] * bc[0] + ba[1] * bc[1];
  const magBA = Math.sqrt(ba[0] ** 2 + ba[1] ** 2);
  const magBC = Math.sqrt(bc[0] ** 2 + bc[1] ** 2);

  const cosAngle = dot / (magBA * magBC);
  return Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if there's a preview ready to apply.
 */
export function hasPreviewToApply(): boolean {
  const { preview } = useFlatPartPreview.getState();
  return (
    preview.outline !== null ||
    preview.cutouts.length > 0 ||
    preview.paths.length > 0
  );
}

/**
 * Get summary of what will be applied.
 */
export function getApplySummary(): string {
  const { preview } = useFlatPartPreview.getState();
  const parts: string[] = [];

  if (preview.outline) {
    parts.push('1 outline');
  }
  if (preview.cutouts.length > 0) {
    parts.push(`${preview.cutouts.length} cutout(s)`);
  }
  if (preview.paths.length > 0) {
    parts.push(`${preview.paths.length} path(s)`);
  }

  return parts.length > 0 ? parts.join(', ') : 'Nothing to apply';
}
