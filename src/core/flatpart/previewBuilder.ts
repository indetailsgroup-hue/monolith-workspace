/**
 * Preview Builder
 *
 * Converts sketch features (from featureGenerator) into FlatPart preview.
 *
 * @version 1.0.0
 */

import type { GeneratedFeature } from '../sketch/featureGenerator';
import {
  FlatPartPreview,
  Poly2,
  Path2D,
  Point2D,
  createEmptyPreview,
  createPoly2,
  createPath2D,
} from './previewTypes';

// ============================================================================
// Builder Functions
// ============================================================================

/**
 * Build a FlatPart preview from generated sketch features.
 *
 * @param features - Array of generated features from sketch
 * @returns FlatPartPreview with outline and cutouts populated
 */
export function buildPreviewFromSketch(features: GeneratedFeature[]): FlatPartPreview {
  const preview = createEmptyPreview();

  for (const feature of features) {
    switch (feature.type) {
      case 'panel_outline':
        handlePanelOutline(preview, feature);
        break;

      case 'cutout_rect':
        handleCutoutRect(preview, feature);
        break;

      case 'cutout_path':
        handleCutoutPath(preview, feature);
        break;

      case 'cutout_circle':
        handleCutoutCircle(preview, feature);
        break;

      case 'cutout_arc':
        handleCutoutArc(preview, feature);
        break;
    }
  }

  return preview;
}

// ============================================================================
// Feature Handlers
// ============================================================================

/**
 * Handle panel_outline feature - sets the main outline polygon.
 */
function handlePanelOutline(preview: FlatPartPreview, feature: GeneratedFeature): void {
  const geometry = feature.geometry;

  if (geometry.type === 'polygon' && geometry.points) {
    // Only use the first outline (panels should have one outline)
    if (!preview.outline) {
      preview.outline = createPoly2(
        feature.id,
        geometry.points as Point2D[],
        true // closed
      );

      preview.features.push({
        id: feature.id,
        type: 'outline',
        sourceEntityId: feature.sourceEntityId,
      });
    }
  } else if (geometry.type === 'circle') {
    // Convert circle to polygon approximation
    const points = circleToPolygon(
      geometry.center as Point2D,
      geometry.radius,
      32 // segments
    );

    if (!preview.outline) {
      preview.outline = createPoly2(feature.id, points, true);
      preview.features.push({
        id: feature.id,
        type: 'outline',
        sourceEntityId: feature.sourceEntityId,
      });
    }
  }
}

/**
 * Handle cutout_rect feature - adds a rectangular cutout.
 */
function handleCutoutRect(preview: FlatPartPreview, feature: GeneratedFeature): void {
  const geometry = feature.geometry;

  if (geometry.type === 'polygon' && geometry.points) {
    const cutout = createPoly2(
      feature.id,
      geometry.points as Point2D[],
      true
    );

    preview.cutouts.push(cutout);
    preview.features.push({
      id: feature.id,
      type: 'cutout_rect',
      sourceEntityId: feature.sourceEntityId,
    });
  }
}

/**
 * Handle cutout_path feature - adds an open path (groove/slot).
 */
function handleCutoutPath(preview: FlatPartPreview, feature: GeneratedFeature): void {
  const geometry = feature.geometry;

  if (geometry.type === 'path' && geometry.points) {
    const path = createPath2D(
      feature.id,
      geometry.points as Point2D[],
      false // open path
    );

    preview.paths.push(path);
    preview.features.push({
      id: feature.id,
      type: 'cutout_path',
      sourceEntityId: feature.sourceEntityId,
    });
  }
}

/**
 * Handle cutout_circle feature - adds a circular cutout (hole).
 */
function handleCutoutCircle(preview: FlatPartPreview, feature: GeneratedFeature): void {
  const geometry = feature.geometry;

  if (geometry.type === 'circle') {
    const points = circleToPolygon(
      geometry.center as Point2D,
      geometry.radius,
      32
    );

    const cutout = createPoly2(feature.id, points, true);
    preview.cutouts.push(cutout);
    preview.features.push({
      id: feature.id,
      type: 'cutout_circle',
      sourceEntityId: feature.sourceEntityId,
    });
  }
}

/**
 * Handle cutout_arc feature - adds an arc path.
 */
function handleCutoutArc(preview: FlatPartPreview, feature: GeneratedFeature): void {
  const geometry = feature.geometry;

  if (geometry.type === 'arc') {
    const points = arcToPoints(
      geometry.start as Point2D,
      geometry.mid as Point2D,
      geometry.end as Point2D,
      16 // segments
    );

    const path = createPath2D(feature.id, points, false);
    preview.paths.push(path);
    preview.features.push({
      id: feature.id,
      type: 'cutout_path', // Treat arcs as paths
      sourceEntityId: feature.sourceEntityId,
    });
  }
}

// ============================================================================
// Geometry Helpers
// ============================================================================

/**
 * Convert a circle to a polygon approximation.
 */
function circleToPolygon(
  center: Point2D,
  radius: number,
  segments: number
): Point2D[] {
  const points: Point2D[] = [];

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([
      center[0] + radius * Math.cos(angle),
      center[1] + radius * Math.sin(angle),
    ]);
  }

  return points;
}

/**
 * Convert an arc (3 points) to a series of points.
 */
function arcToPoints(
  start: Point2D,
  mid: Point2D,
  end: Point2D,
  segments: number
): Point2D[] {
  // Find circle center from 3 points
  const center = findCircleCenter(start, mid, end);

  if (!center) {
    // Points are collinear, return straight line
    return [start, mid, end];
  }

  const radius = Math.sqrt(
    Math.pow(start[0] - center[0], 2) + Math.pow(start[1] - center[1], 2)
  );

  // Calculate angles
  const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
  const endAngle = Math.atan2(end[1] - center[1], end[0] - center[0]);

  // Generate arc points
  const points: Point2D[] = [];
  let angleDelta = endAngle - startAngle;

  // Normalize angle delta
  if (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
  if (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = startAngle + angleDelta * t;
    points.push([
      center[0] + radius * Math.cos(angle),
      center[1] + radius * Math.sin(angle),
    ]);
  }

  return points;
}

/**
 * Find circle center from 3 points.
 */
function findCircleCenter(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D
): Point2D | null {
  const [ax, ay] = p1;
  const [bx, by] = p2;
  const [cx, cy] = p3;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

  if (Math.abs(d) < 0.0001) {
    // Points are collinear
    return null;
  }

  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) / d;

  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) / d;

  return [ux, uy];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get summary of preview content.
 */
export function getPreviewSummary(preview: FlatPartPreview): string {
  const parts: string[] = [];

  if (preview.outline) {
    parts.push(`1 outline`);
  }

  if (preview.cutouts.length > 0) {
    parts.push(`${preview.cutouts.length} cutout(s)`);
  }

  if (preview.paths.length > 0) {
    parts.push(`${preview.paths.length} path(s)`);
  }

  return parts.length > 0 ? parts.join(', ') : 'Empty preview';
}
