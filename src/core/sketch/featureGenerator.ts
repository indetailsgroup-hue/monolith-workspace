/**
 * Feature Generator - Sketch to Manufacturing Features
 *
 * Converts sketch entities into manufacturing features:
 * - Panel outlines (rect → panel boundary)
 * - Cutouts (rect/line → routing/drilling paths)
 *
 * @version 1.0.0
 */

import type {
  SketchEntity,
  SketchLine,
  SketchRect,
  SketchArc,
  SketchCircle,
  SketchPoint,
} from './types';
import { getRectCorners } from './projectionUtils';

// ============================================================================
// Types
// ============================================================================

export type FeatureMode = 'outline' | 'cutout';

export interface GeneratedFeature {
  /** Unique feature ID */
  id: string;
  /** Feature type */
  type: 'panel_outline' | 'cutout_rect' | 'cutout_path' | 'cutout_circle' | 'cutout_arc';
  /** Source entity ID */
  sourceEntityId: string;
  /** Feature geometry */
  geometry: FeatureGeometry;
  /** Additional parameters */
  params?: Record<string, number | string | boolean>;
}

export type FeatureGeometry =
  | { type: 'polygon'; points: SketchPoint[] }
  | { type: 'path'; points: SketchPoint[] }
  | { type: 'circle'; center: SketchPoint; radius: number }
  | { type: 'arc'; start: SketchPoint; mid: SketchPoint; end: SketchPoint };

export interface GenerateOptions {
  /** Generation mode */
  mode: FeatureMode;
  /** Cutout depth (mm), only for cutout mode */
  cutoutDepth?: number;
  /** Cutout offset from edge (mm) */
  offset?: number;
  /** Tool diameter for compensation (mm) */
  toolDiameter?: number;
}

// ============================================================================
// Generator
// ============================================================================

let featureCounter = 0;

function generateFeatureId(): string {
  return `feat_${Date.now()}_${++featureCounter}`;
}

/**
 * Generate manufacturing features from sketch entities.
 *
 * @param entities - Sketch entities to convert
 * @param options - Generation options
 * @returns Array of generated features
 */
export function generateFeatures(
  entities: SketchEntity[],
  options: GenerateOptions
): GeneratedFeature[] {
  const features: GeneratedFeature[] = [];

  for (const entity of entities) {
    // Skip construction entities for panel outlines
    if (options.mode === 'outline' && entity.construction) {
      continue;
    }

    const generated = generateFeatureFromEntity(entity, options);
    if (generated) {
      features.push(generated);
    }
  }

  return features;
}

/**
 * Generate a feature from a single entity.
 */
function generateFeatureFromEntity(
  entity: SketchEntity,
  options: GenerateOptions
): GeneratedFeature | null {
  switch (entity.type) {
    case 'rect':
      return generateFromRect(entity as SketchRect, options);
    case 'line':
      return generateFromLine(entity as SketchLine, options);
    case 'circle':
      return generateFromCircle(entity as SketchCircle, options);
    case 'arc':
      return generateFromArc(entity as SketchArc, options);
    default:
      return null;
  }
}

// ============================================================================
// Entity-specific Generators
// ============================================================================

/**
 * Generate feature from rectangle.
 */
function generateFromRect(
  rect: SketchRect,
  options: GenerateOptions
): GeneratedFeature {
  const corners = getRectCorners(rect.corner1, rect.corner2);

  if (options.mode === 'outline') {
    // Panel outline - closed polygon
    return {
      id: generateFeatureId(),
      type: 'panel_outline',
      sourceEntityId: rect.id,
      geometry: {
        type: 'polygon',
        points: corners,
      },
      params: {
        width: Math.abs(rect.corner2[0] - rect.corner1[0]),
        height: Math.abs(rect.corner2[1] - rect.corner1[1]),
      },
    };
  } else {
    // Cutout - rectangular pocket
    return {
      id: generateFeatureId(),
      type: 'cutout_rect',
      sourceEntityId: rect.id,
      geometry: {
        type: 'polygon',
        points: applyOffset(corners, options.offset || 0),
      },
      params: {
        depth: options.cutoutDepth || 10,
        toolDiameter: options.toolDiameter || 6,
        width: Math.abs(rect.corner2[0] - rect.corner1[0]),
        height: Math.abs(rect.corner2[1] - rect.corner1[1]),
      },
    };
  }
}

/**
 * Generate feature from line.
 */
function generateFromLine(
  line: SketchLine,
  options: GenerateOptions
): GeneratedFeature | null {
  if (options.mode === 'outline') {
    // Lines don't create outlines
    return null;
  }

  // Cutout path (slot/groove)
  return {
    id: generateFeatureId(),
    type: 'cutout_path',
    sourceEntityId: line.id,
    geometry: {
      type: 'path',
      points: [line.start, line.end],
    },
    params: {
      depth: options.cutoutDepth || 10,
      toolDiameter: options.toolDiameter || 6,
      length: Math.sqrt(
        Math.pow(line.end[0] - line.start[0], 2) +
        Math.pow(line.end[1] - line.start[1], 2)
      ),
    },
  };
}

/**
 * Generate feature from circle.
 */
function generateFromCircle(
  circle: SketchCircle,
  options: GenerateOptions
): GeneratedFeature {
  if (options.mode === 'outline') {
    // Circle as panel outline (round panel)
    return {
      id: generateFeatureId(),
      type: 'panel_outline',
      sourceEntityId: circle.id,
      geometry: {
        type: 'circle',
        center: circle.center,
        radius: circle.radius,
      },
      params: {
        diameter: circle.radius * 2,
      },
    };
  } else {
    // Circular cutout (hole/pocket)
    return {
      id: generateFeatureId(),
      type: 'cutout_circle',
      sourceEntityId: circle.id,
      geometry: {
        type: 'circle',
        center: circle.center,
        radius: Math.max(0, circle.radius - (options.offset || 0)),
      },
      params: {
        depth: options.cutoutDepth || 10,
        toolDiameter: options.toolDiameter || 6,
        diameter: circle.radius * 2,
      },
    };
  }
}

/**
 * Generate feature from arc.
 */
function generateFromArc(
  arc: SketchArc,
  options: GenerateOptions
): GeneratedFeature | null {
  if (options.mode === 'outline') {
    // Arcs alone don't create closed outlines
    return null;
  }

  // Arc cutout path
  return {
    id: generateFeatureId(),
    type: 'cutout_arc',
    sourceEntityId: arc.id,
    geometry: {
      type: 'arc',
      start: arc.start,
      mid: arc.mid,
      end: arc.end,
    },
    params: {
      depth: options.cutoutDepth || 10,
      toolDiameter: options.toolDiameter || 6,
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Apply inward offset to polygon points.
 * (Simplified - proper offset would use polygon offset algorithms)
 */
function applyOffset(points: SketchPoint[], offset: number): SketchPoint[] {
  if (offset === 0) return points;

  // Simple center-based shrink (not geometrically correct for complex shapes)
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;

  return points.map((p) => {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return p;

    const scale = Math.max(0, (dist - offset) / dist);
    return [cx + dx * scale, cy + dy * scale] as SketchPoint;
  });
}

/**
 * Format feature summary for display/logging.
 */
export function formatFeatureSummary(features: GeneratedFeature[]): string {
  const counts = features.reduce(
    (acc, f) => {
      acc[f.type] = (acc[f.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const parts = Object.entries(counts).map(
    ([type, count]) => `${count}x ${type.replace('_', ' ')}`
  );

  return parts.length > 0 ? parts.join(', ') : 'No features generated';
}
