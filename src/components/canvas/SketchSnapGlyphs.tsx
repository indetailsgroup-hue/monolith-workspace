/**
 * SketchSnapGlyphs.tsx - Snap Point Visualization
 *
 * Renders visual indicators for snap points:
 * - Endpoints: Green circles at line/rect corners
 * - Midpoints: Smaller blue circles at segment centers
 * - (Future) Intersections: Orange X markers
 *
 * @version 1.0.0
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import {
  useSketchEnabled,
  useSketchTool,
  useSketchTempPoints,
  useSketchEntities,
} from '../../core/sketch';
import { useCPlane } from '../../core/cplane';
import { plane2DToWorld } from '../../core/sketch/threePlane';
import type { SketchPoint, SketchEntity, SketchLine, SketchRect, SketchArc, SketchCircle } from '../../core/sketch/types';

// ============================================================================
// Constants
// ============================================================================

const ENDPOINT_COLOR = '#22c55e';    // Green
const ENDPOINT_SIZE = 6;
const MIDPOINT_COLOR = '#3b82f6';    // Blue
const MIDPOINT_SIZE = 4;
const TEMPPOINT_COLOR = '#f59e0b';   // Amber
const TEMPPOINT_SIZE = 5;

// ============================================================================
// Component
// ============================================================================

export function SketchSnapGlyphs() {
  const enabled = useSketchEnabled();
  const tool = useSketchTool();
  const tempPoints = useSketchTempPoints();
  const entities = useSketchEntities();
  const cplane = useCPlane((s) => s.plane);

  // Collect all snap points from entities
  const { endpoints, midpoints } = useMemo(() => {
    const eps: SketchPoint[] = [];
    const mps: SketchPoint[] = [];

    for (const entity of entities) {
      const { endpoints: entityEps, midpoints: entityMps } = getEntitySnapPoints(entity);
      eps.push(...entityEps);
      mps.push(...entityMps);
    }

    return { endpoints: eps, midpoints: mps };
  }, [entities]);

  // Don't render if sketch mode disabled
  if (!enabled || tool === 'select') {
    return null;
  }

  return (
    <group name="sketch-snap-glyphs">
      {/* Temp points (currently being placed) */}
      {tempPoints.map((point, index) => {
        const worldPos = plane2DToWorld(point, cplane);
        return (
          <mesh key={`temp-${index}`} position={worldPos}>
            <sphereGeometry args={[TEMPPOINT_SIZE, 16, 16]} />
            <meshBasicMaterial
              color={TEMPPOINT_COLOR}
              depthTest={false}
              transparent
              opacity={0.9}
            />
          </mesh>
        );
      })}

      {/* Entity endpoints - using sphere for consistent visibility from all angles */}
      {/* Spheres render correctly from any camera angle (no edge-on line artifacts) */}
      {endpoints.map((point, index) => {
        const worldPos = plane2DToWorld(point, cplane);
        return (
          <mesh key={`ep-${index}`} position={worldPos}>
            <sphereGeometry args={[ENDPOINT_SIZE * 0.5, 8, 6]} />
            <meshBasicMaterial
              color={ENDPOINT_COLOR}
              depthTest={false}
              transparent
              opacity={0.7}
            />
          </mesh>
        );
      })}

      {/* Entity midpoints - using sphere for consistent visibility */}
      {midpoints.map((point, index) => {
        const worldPos = plane2DToWorld(point, cplane);
        return (
          <mesh key={`mp-${index}`} position={worldPos}>
            <sphereGeometry args={[MIDPOINT_SIZE * 0.5, 8, 6]} />
            <meshBasicMaterial
              color={MIDPOINT_COLOR}
              depthTest={false}
              transparent
              opacity={0.6}
            />
          </mesh>
        );
      })}

      {/* Future: Intersection points would go here */}
    </group>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract snap points from a sketch entity.
 */
function getEntitySnapPoints(entity: SketchEntity): {
  endpoints: SketchPoint[];
  midpoints: SketchPoint[];
} {
  const endpoints: SketchPoint[] = [];
  const midpoints: SketchPoint[] = [];

  switch (entity.type) {
    case 'line': {
      const line = entity as SketchLine;
      endpoints.push(line.start, line.end);
      midpoints.push(getMidpoint(line.start, line.end));
      break;
    }

    case 'rect': {
      const rect = entity as SketchRect;
      const [u1, v1] = rect.corner1;
      const [u2, v2] = rect.corner2;

      // Four corners
      endpoints.push(
        [u1, v1],
        [u2, v1],
        [u2, v2],
        [u1, v2]
      );

      // Four edge midpoints
      midpoints.push(
        getMidpoint([u1, v1], [u2, v1]), // Bottom
        getMidpoint([u2, v1], [u2, v2]), // Right
        getMidpoint([u2, v2], [u1, v2]), // Top
        getMidpoint([u1, v2], [u1, v1])  // Left
      );

      // Center point
      midpoints.push(getMidpoint(rect.corner1, rect.corner2));
      break;
    }

    case 'arc': {
      const arc = entity as SketchArc;
      endpoints.push(arc.start, arc.end);
      midpoints.push(arc.mid);
      break;
    }

    case 'circle': {
      const circle = entity as SketchCircle;
      endpoints.push(circle.center);

      // Quadrant points
      const r = circle.radius;
      const [cx, cy] = circle.center;
      midpoints.push(
        [cx + r, cy],  // Right
        [cx - r, cy],  // Left
        [cx, cy + r],  // Top
        [cx, cy - r]   // Bottom
      );
      break;
    }
  }

  return { endpoints, midpoints };
}

/**
 * Calculate midpoint between two points.
 */
function getMidpoint(a: SketchPoint, b: SketchPoint): SketchPoint {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

// ============================================================================
// Exports
// ============================================================================

export default SketchSnapGlyphs;
