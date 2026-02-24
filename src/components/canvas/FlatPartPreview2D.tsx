/**
 * FlatPartPreview2D.tsx - 2D Preview Visualization
 *
 * Renders the FlatPart preview on the construction plane:
 * - Outline polygon (green)
 * - Cutout polygons (red)
 * - Paths (orange dashed)
 *
 * @version 1.0.0
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useCPlane } from '../../core/cplane';
import {
  useFlatPartPreviewOutline,
  useFlatPartPreviewCutouts,
  useFlatPartPreviewPaths,
  useIsPreviewMode,
} from '../../core/flatpart/useFlatPartPreview';
import { plane2DToWorld } from '../../core/sketch/threePlane';
import type { Poly2, Path2D, Point2D } from '../../core/flatpart/previewTypes';

// ============================================================================
// Constants
// ============================================================================

const OUTLINE_COLOR = '#22c55e';       // Green
const OUTLINE_WIDTH = 3;
const CUTOUT_COLOR = '#ef4444';        // Red
const CUTOUT_WIDTH = 2;
const PATH_COLOR = '#f59e0b';          // Amber
const PATH_WIDTH = 2;

// ============================================================================
// Main Component
// ============================================================================

export function FlatPartPreview2D() {
  const outline = useFlatPartPreviewOutline();
  const cutouts = useFlatPartPreviewCutouts();
  const paths = useFlatPartPreviewPaths();
  const isPreviewMode = useIsPreviewMode();
  const cplane = useCPlane((s) => s.plane);

  // Don't render if not in preview mode or no content
  if (!isPreviewMode) {
    return null;
  }

  if (!outline && cutouts.length === 0 && paths.length === 0) {
    return null;
  }

  return (
    <group name="flatpart-preview-2d">
      {/* Outline polygon */}
      {outline && (
        <PreviewPolygon
          poly={outline}
          cplane={cplane}
          color={OUTLINE_COLOR}
          lineWidth={OUTLINE_WIDTH}
        />
      )}

      {/* Cutout polygons */}
      {cutouts.map((cutout) => (
        <PreviewPolygon
          key={cutout.id}
          poly={cutout}
          cplane={cplane}
          color={CUTOUT_COLOR}
          lineWidth={CUTOUT_WIDTH}
        />
      ))}

      {/* Paths */}
      {paths.map((path) => (
        <PreviewPath
          key={path.id}
          path={path}
          cplane={cplane}
          color={PATH_COLOR}
          lineWidth={PATH_WIDTH}
        />
      ))}
    </group>
  );
}

// ============================================================================
// Polygon Sub-component
// ============================================================================

interface PreviewPolygonProps {
  poly: Poly2;
  cplane: any;
  color: string;
  lineWidth: number;
}

function PreviewPolygon({ poly, cplane, color, lineWidth }: PreviewPolygonProps) {
  const worldPoints = useMemo(() => {
    if (!poly.points || poly.points.length < 2) return null;

    const points = poly.points.map((p) =>
      plane2DToWorld(p as [number, number], cplane)
    );

    // Close the polygon if needed
    if (poly.closed && points.length >= 3) {
      points.push(points[0].clone());
    }

    return points;
  }, [poly, cplane]);

  if (!worldPoints || worldPoints.length < 2) return null;

  return (
    <Line
      points={worldPoints}
      color={color}
      lineWidth={lineWidth}
      depthTest={false}
    />
  );
}

// ============================================================================
// Path Sub-component
// ============================================================================

interface PreviewPathProps {
  path: Path2D;
  cplane: any;
  color: string;
  lineWidth: number;
}

function PreviewPath({ path, cplane, color, lineWidth }: PreviewPathProps) {
  const worldPoints = useMemo(() => {
    if (!path.points || path.points.length < 2) return null;

    const points = path.points.map((p) =>
      plane2DToWorld(p as [number, number], cplane)
    );

    // Close if specified
    if (path.closed && points.length >= 3) {
      points.push(points[0].clone());
    }

    return points;
  }, [path, cplane]);

  if (!worldPoints || worldPoints.length < 2) return null;

  return (
    <Line
      points={worldPoints}
      color={color}
      lineWidth={lineWidth}
      dashed
      dashSize={15}
      gapSize={8}
      depthTest={false}
    />
  );
}

// ============================================================================
// Exports
// ============================================================================

export default FlatPartPreview2D;
