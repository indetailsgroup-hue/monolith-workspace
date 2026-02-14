/**
 * SketchPreview.tsx - Sketch Drawing Preview
 *
 * Renders preview geometry while drawing:
 * - Line: Shows preview line from last point to cursor
 * - Rect: Shows preview rectangle outline
 * - Arc: Shows preview arc through points
 * - Circle: Shows preview circle
 *
 * @version 1.0.0
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Line, Html } from '@react-three/drei';
import {
  useSketchStore,
  useSketchTool,
  useSketchTempPoints,
  useSketchCursorPos,
  useSketchEntities,
} from '../../core/sketch';
import type {
  SketchLine,
  SketchRect,
  SketchArc,
  SketchCircle,
  SketchPolyline,
} from '../../core/sketch/types';
import { useCPlane } from '../../core/cplane';
import { plane2DToWorld } from '../../core/sketch/threePlane';
import { getRectCorners } from '../../core/sketch/projectionUtils';
import type { SketchPoint } from '../../core/sketch/types';

// ============================================================================
// Constants
// ============================================================================

const PREVIEW_COLOR = '#8b5cf6'; // Purple
const PREVIEW_LINE_WIDTH = 2;
const CONSTRUCTION_COLOR = '#f59e0b'; // Amber for construction mode
const POINT_SIZE = 6;

// ============================================================================
// Main Component
// ============================================================================

interface SketchPreviewProps {
  showDimensions?: boolean;
}

export function SketchPreview({ showDimensions = true }: SketchPreviewProps) {
  const tool = useSketchTool();
  const tempPoints = useSketchTempPoints();
  const cursorPos = useSketchCursorPos();
  const constructionMode = useSketchStore((s) => s.constructionMode);
  const cplane = useCPlane((s) => s.plane);

  const color = constructionMode ? CONSTRUCTION_COLOR : PREVIEW_COLOR;

  // Don't render if no points or cursor
  if (tempPoints.length === 0 && !cursorPos) {
    return null;
  }

  return (
    <group name="sketch-preview">
      {/* Render existing temp points */}
      {tempPoints.map((point, index) => (
        <TempPointMarker key={index} point={point} cplane={cplane} color={color} />
      ))}

      {/* Tool-specific previews */}
      {tool === 'line' && (
        <LinePreview
          tempPoints={tempPoints}
          cursorPos={cursorPos}
          cplane={cplane}
          color={color}
        />
      )}

      {tool === 'rect' && (
        <RectPreview
          tempPoints={tempPoints}
          cursorPos={cursorPos}
          cplane={cplane}
          color={color}
          showDimensions={showDimensions}
        />
      )}

      {tool === 'arc' && (
        <ArcPreview
          tempPoints={tempPoints}
          cursorPos={cursorPos}
          cplane={cplane}
          color={color}
        />
      )}

      {tool === 'circle' && (
        <CirclePreview
          tempPoints={tempPoints}
          cursorPos={cursorPos}
          cplane={cplane}
          color={color}
        />
      )}

      {tool === 'polyline' && (
        <PolylinePreview
          tempPoints={tempPoints}
          cursorPos={cursorPos}
          cplane={cplane}
          color={color}
        />
      )}
    </group>
  );
}

// ============================================================================
// Temp Point Marker
// ============================================================================

interface TempPointMarkerProps {
  point: SketchPoint;
  cplane: any;
  color: string;
}

function TempPointMarker({ point, cplane, color }: TempPointMarkerProps) {
  const worldPos = plane2DToWorld(point, cplane);

  return (
    <mesh position={worldPos}>
      <sphereGeometry args={[POINT_SIZE, 16, 16]} />
      <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.8} />
    </mesh>
  );
}

// ============================================================================
// Line Preview
// ============================================================================

interface LinePreviewProps {
  tempPoints: SketchPoint[];
  cursorPos: SketchPoint | null;
  cplane: any;
  color: string;
}

function LinePreview({ tempPoints, cursorPos, cplane, color }: LinePreviewProps) {
  const linePoints = useMemo(() => {
    if (tempPoints.length === 0 || !cursorPos) return null;

    // Line from last point to cursor
    const start = plane2DToWorld(tempPoints[tempPoints.length - 1], cplane);
    const end = plane2DToWorld(cursorPos, cplane);

    return [start, end];
  }, [tempPoints, cursorPos, cplane]);

  if (!linePoints) return null;

  return (
    <Line
      points={linePoints}
      color={color}
      lineWidth={PREVIEW_LINE_WIDTH}
      dashed
      dashSize={10}
      gapSize={5}
    />
  );
}

// ============================================================================
// Rectangle Preview
// ============================================================================

interface RectPreviewProps {
  tempPoints: SketchPoint[];
  cursorPos: SketchPoint | null;
  cplane: any;
  color: string;
  showDimensions?: boolean;
}

function RectPreview({ tempPoints, cursorPos, cplane, color, showDimensions = true }: RectPreviewProps) {
  const setCursorPos = useSketchStore((s) => s.setCursorPos);
  const [editingDim, setEditingDim] = useState<'width' | 'height' | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Calculate rect data
  const rectData = useMemo(() => {
    if (tempPoints.length === 0 || !cursorPos) return null;

    const p1 = tempPoints[0];
    const p2 = cursorPos;

    // Get rectangle corners
    const corners = getRectCorners(p1, p2);

    // Convert to world coordinates and close the loop
    const worldCorners = corners.map((c) => plane2DToWorld(c, cplane));
    worldCorners.push(worldCorners[0]); // Close the rectangle

    // Calculate dimensions
    const width = Math.abs(p2[0] - p1[0]);
    const height = Math.abs(p2[1] - p1[1]);

    // Calculate midpoints for dimension labels (in 2D plane coordinates)
    const minX = Math.min(p1[0], p2[0]);
    const maxX = Math.max(p1[0], p2[0]);
    const minY = Math.min(p1[1], p2[1]);
    const maxY = Math.max(p1[1], p2[1]);

    // Width label position (bottom edge midpoint)
    const widthLabelPos: SketchPoint = [(minX + maxX) / 2, minY];
    // Height label position (right edge midpoint)
    const heightLabelPos: SketchPoint = [maxX, (minY + maxY) / 2];

    return {
      worldCorners,
      width,
      height,
      widthLabelWorld: plane2DToWorld(widthLabelPos, cplane),
      heightLabelWorld: plane2DToWorld(heightLabelPos, cplane),
      p1,
      p2,
    };
  }, [tempPoints, cursorPos, cplane]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingDim && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingDim]);

  // Handle dimension edit
  const handleDimClick = (dim: 'width' | 'height', currentValue: number) => {
    setEditingDim(dim);
    setInputValue(currentValue.toFixed(0));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers and decimal point
    const value = e.target.value.replace(/[^0-9.]/g, '');
    setInputValue(value);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      applyDimensionChange();
    } else if (e.key === 'Escape') {
      setEditingDim(null);
      setInputValue('');
    }
    e.stopPropagation();
  };

  const handleInputBlur = () => {
    if (editingDim) {
      applyDimensionChange();
    }
  };

  const applyDimensionChange = () => {
    if (!rectData || !editingDim) return;

    const newValue = parseFloat(inputValue);
    if (isNaN(newValue) || newValue <= 0) {
      setEditingDim(null);
      setInputValue('');
      return;
    }

    const { p1, p2 } = rectData;

    // Calculate new cursor position based on the edited dimension
    let newCursorPos: SketchPoint;

    if (editingDim === 'width') {
      // Adjust X coordinate to achieve desired width
      const signX = p2[0] >= p1[0] ? 1 : -1;
      newCursorPos = [p1[0] + signX * newValue, p2[1]];
    } else {
      // Adjust Y coordinate to achieve desired height
      const signY = p2[1] >= p1[1] ? 1 : -1;
      newCursorPos = [p2[0], p1[1] + signY * newValue];
    }

    // Update cursor position in store
    setCursorPos(newCursorPos, 'none');

    setEditingDim(null);
    setInputValue('');
  };

  if (!rectData) return null;

  const { worldCorners, width, height, widthLabelWorld, heightLabelWorld } = rectData;

  return (
    <group name="rect-preview">
      {/* Rectangle outline */}
      <Line
        points={worldCorners}
        color={color}
        lineWidth={PREVIEW_LINE_WIDTH}
        dashed
        dashSize={10}
        gapSize={5}
      />

      {/* Width dimension label - only show when showDimensions is true */}
      {showDimensions && (
        <Html position={widthLabelWorld} center style={{ pointerEvents: 'auto' }}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              handleDimClick('width', width);
            }}
            style={{
              backgroundColor: editingDim === 'width' ? '#1a1a2e' : 'rgba(139, 92, 246, 0.9)',
              color: '#fff',
              padding: editingDim === 'width' ? '2px' : '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: 'pointer',
              border: editingDim === 'width' ? '2px solid #8b5cf6' : '1px solid transparent',
              minWidth: 50,
              textAlign: 'center',
              transform: 'translateY(15px)',
            }}
          >
            {editingDim === 'width' ? (
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                onBlur={handleInputBlur}
                style={{
                  width: 60,
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
            ) : (
              `${width.toFixed(0)} mm`
            )}
          </div>
        </Html>
      )}

      {/* Height dimension label - only show when showDimensions is true */}
      {showDimensions && (
        <Html position={heightLabelWorld} center style={{ pointerEvents: 'auto' }}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              handleDimClick('height', height);
            }}
            style={{
              backgroundColor: editingDim === 'height' ? '#1a1a2e' : 'rgba(139, 92, 246, 0.9)',
              color: '#fff',
              padding: editingDim === 'height' ? '2px' : '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: 'pointer',
              border: editingDim === 'height' ? '2px solid #8b5cf6' : '1px solid transparent',
              minWidth: 50,
              textAlign: 'center',
              transform: 'translateX(15px)',
            }}
          >
            {editingDim === 'height' ? (
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                onBlur={handleInputBlur}
                style={{
                  width: 60,
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
            ) : (
              `${height.toFixed(0)} mm`
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

// ============================================================================
// Arc Preview
// ============================================================================

interface ArcPreviewProps {
  tempPoints: SketchPoint[];
  cursorPos: SketchPoint | null;
  cplane: any;
  color: string;
}

function ArcPreview({ tempPoints, cursorPos, cplane, color }: ArcPreviewProps) {
  const arcPoints = useMemo(() => {
    // Need at least start point
    if (tempPoints.length === 0) return null;

    const points: THREE.Vector3[] = [];

    if (tempPoints.length === 1 && cursorPos) {
      // First line (start to mid)
      const start = plane2DToWorld(tempPoints[0], cplane);
      const end = plane2DToWorld(cursorPos, cplane);
      return [start, end];
    }

    if (tempPoints.length === 2 && cursorPos) {
      // Try to draw arc through 3 points
      const p1 = tempPoints[0];
      const p2 = tempPoints[1];
      const p3 = cursorPos;

      // Calculate arc through 3 points
      const arcPts = calculateArcPoints(p1, p2, p3, 32);
      return arcPts.map((p) => plane2DToWorld(p, cplane));
    }

    return null;
  }, [tempPoints, cursorPos, cplane]);

  if (!arcPoints || arcPoints.length < 2) return null;

  return (
    <Line
      points={arcPoints}
      color={color}
      lineWidth={PREVIEW_LINE_WIDTH}
      dashed
      dashSize={10}
      gapSize={5}
    />
  );
}

/**
 * Calculate points along an arc through 3 points.
 */
function calculateArcPoints(
  p1: SketchPoint,
  p2: SketchPoint,
  p3: SketchPoint,
  segments: number
): SketchPoint[] {
  // Find circle center from 3 points
  const center = findCircleCenter(p1, p2, p3);
  if (!center) {
    // Points are collinear, return straight line
    return [p1, p2, p3];
  }

  const radius = Math.sqrt(
    Math.pow(p1[0] - center[0], 2) + Math.pow(p1[1] - center[1], 2)
  );

  // Calculate angles
  const angle1 = Math.atan2(p1[1] - center[1], p1[0] - center[0]);
  const angle2 = Math.atan2(p2[1] - center[1], p2[0] - center[0]);
  const angle3 = Math.atan2(p3[1] - center[1], p3[0] - center[0]);

  // Determine arc direction (ensure we go through p2)
  let startAngle = angle1;
  let endAngle = angle3;

  // Check if we need to adjust for direction
  const midAngleCheck = (startAngle + endAngle) / 2;
  const angleDiff = Math.abs(normalizeAngle(midAngleCheck - angle2));

  if (angleDiff > Math.PI / 2) {
    // Wrong direction, swap
    [startAngle, endAngle] = [endAngle, startAngle];
  }

  // Generate arc points
  const points: SketchPoint[] = [];
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

function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * Find circle center from 3 points.
 * Returns null if points are collinear.
 */
function findCircleCenter(
  p1: SketchPoint,
  p2: SketchPoint,
  p3: SketchPoint
): SketchPoint | null {
  const ax = p1[0], ay = p1[1];
  const bx = p2[0], by = p2[1];
  const cx = p3[0], cy = p3[1];

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

  if (Math.abs(d) < 0.0001) {
    // Points are collinear
    return null;
  }

  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) /
    d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) /
    d;

  return [ux, uy];
}

// ============================================================================
// Circle Preview
// ============================================================================

interface CirclePreviewProps {
  tempPoints: SketchPoint[];
  cursorPos: SketchPoint | null;
  cplane: any;
  color: string;
}

function CirclePreview({ tempPoints, cursorPos, cplane, color }: CirclePreviewProps) {
  const circlePoints = useMemo(() => {
    if (tempPoints.length === 0 || !cursorPos) return null;

    const center = tempPoints[0];
    const radius = Math.sqrt(
      Math.pow(cursorPos[0] - center[0], 2) +
      Math.pow(cursorPos[1] - center[1], 2)
    );

    if (radius < 1) return null;

    // Generate circle points
    const segments = 64;
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const point: SketchPoint = [
        center[0] + radius * Math.cos(angle),
        center[1] + radius * Math.sin(angle),
      ];
      points.push(plane2DToWorld(point, cplane));
    }

    return points;
  }, [tempPoints, cursorPos, cplane]);

  // Also show radius line
  const radiusLine = useMemo(() => {
    if (tempPoints.length === 0 || !cursorPos) return null;

    return [
      plane2DToWorld(tempPoints[0], cplane),
      plane2DToWorld(cursorPos, cplane),
    ];
  }, [tempPoints, cursorPos, cplane]);

  if (!circlePoints) return null;

  return (
    <>
      <Line
        points={circlePoints}
        color={color}
        lineWidth={PREVIEW_LINE_WIDTH}
        dashed
        dashSize={10}
        gapSize={5}
      />
      {radiusLine && (
        <Line
          points={radiusLine}
          color={color}
          lineWidth={1}
          dashed
          dashSize={5}
          gapSize={5}
          opacity={0.5}
          transparent
        />
      )}
    </>
  );
}

// ============================================================================
// Polyline Preview
// ============================================================================

interface PolylinePreviewProps {
  tempPoints: SketchPoint[];
  cursorPos: SketchPoint | null;
  cplane: any;
  color: string;
}

function PolylinePreview({ tempPoints, cursorPos, cplane, color }: PolylinePreviewProps) {
  const linePoints = useMemo(() => {
    if (tempPoints.length === 0) return null;

    // Convert all temp points to world
    const points = tempPoints.map((p) => plane2DToWorld(p, cplane));

    // Add cursor position if available
    if (cursorPos) {
      points.push(plane2DToWorld(cursorPos, cplane));
    }

    return points.length >= 2 ? points : null;
  }, [tempPoints, cursorPos, cplane]);

  if (!linePoints) return null;

  return (
    <Line
      points={linePoints}
      color={color}
      lineWidth={PREVIEW_LINE_WIDTH}
      dashed
      dashSize={10}
      gapSize={5}
    />
  );
}

// ============================================================================
// Committed Entities Renderer
// ============================================================================

const ENTITY_COLOR = '#22c55e'; // Green for committed entities
const ENTITY_CONSTRUCTION_COLOR = '#f59e0b'; // Amber for construction
const ENTITY_SELECTED_COLOR = '#3b82f6'; // Blue for selected

interface SketchEntitiesRendererProps {
  showDimensions?: boolean;
}

export function SketchEntitiesRenderer({ showDimensions = true }: SketchEntitiesRendererProps) {
  const entities = useSketchEntities();
  const cplane = useCPlane((s) => s.plane);

  if (entities.length === 0) return null;

  return (
    <group name="sketch-entities">
      {entities.map((entity) => {
        const color = entity.selected
          ? ENTITY_SELECTED_COLOR
          : entity.construction
          ? ENTITY_CONSTRUCTION_COLOR
          : ENTITY_COLOR;

        switch (entity.type) {
          case 'line':
            return <LineEntity key={entity.id} entity={entity} cplane={cplane} color={color} />;
          case 'rect':
            return <RectEntity key={entity.id} entity={entity} cplane={cplane} color={color} showDimensions={showDimensions} />;
          case 'arc':
            return <ArcEntity key={entity.id} entity={entity} cplane={cplane} color={color} />;
          case 'circle':
            return <CircleEntity key={entity.id} entity={entity} cplane={cplane} color={color} />;
          case 'polyline':
            return <PolylineEntity key={entity.id} entity={entity} cplane={cplane} color={color} />;
          default:
            return null;
        }
      })}
    </group>
  );
}

// Line Entity
function LineEntity({ entity, cplane, color }: { entity: SketchLine; cplane: any; color: string }) {
  const points = useMemo(() => [
    plane2DToWorld(entity.start, cplane),
    plane2DToWorld(entity.end, cplane),
  ], [entity, cplane]);

  return <Line points={points} color={color} lineWidth={2} />;
}

// Rectangle Entity with Editable Dimensions
function RectEntity({ entity, cplane, color, showDimensions = true }: { entity: SketchRect; cplane: any; color: string; showDimensions?: boolean }) {
  const updateEntity = useSketchStore((s) => s.updateEntity);
  const [editingDim, setEditingDim] = useState<'width' | 'height' | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const rectData = useMemo(() => {
    const corners = getRectCorners(entity.corner1, entity.corner2);
    const worldCorners = corners.map((c) => plane2DToWorld(c, cplane));
    worldCorners.push(worldCorners[0]); // Close the rectangle

    // Calculate dimensions
    const width = Math.abs(entity.corner2[0] - entity.corner1[0]);
    const height = Math.abs(entity.corner2[1] - entity.corner1[1]);

    // Calculate label positions
    const minX = Math.min(entity.corner1[0], entity.corner2[0]);
    const maxX = Math.max(entity.corner1[0], entity.corner2[0]);
    const minY = Math.min(entity.corner1[1], entity.corner2[1]);
    const maxY = Math.max(entity.corner1[1], entity.corner2[1]);

    const widthLabelPos: SketchPoint = [(minX + maxX) / 2, minY];
    const heightLabelPos: SketchPoint = [maxX, (minY + maxY) / 2];

    return {
      worldCorners,
      width,
      height,
      widthLabelWorld: plane2DToWorld(widthLabelPos, cplane),
      heightLabelWorld: plane2DToWorld(heightLabelPos, cplane),
    };
  }, [entity, cplane]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingDim && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingDim]);

  const handleDimClick = (dim: 'width' | 'height', currentValue: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingDim(dim);
    setInputValue(currentValue.toFixed(0));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9.]/g, '');
    setInputValue(value);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      applyDimensionChange();
    } else if (e.key === 'Escape') {
      setEditingDim(null);
      setInputValue('');
    }
    e.stopPropagation();
  };

  const handleInputBlur = () => {
    if (editingDim) {
      applyDimensionChange();
    }
  };

  const applyDimensionChange = () => {
    if (!editingDim) return;

    const newValue = parseFloat(inputValue);
    if (isNaN(newValue) || newValue <= 0) {
      setEditingDim(null);
      setInputValue('');
      return;
    }

    const { corner1, corner2 } = entity;

    // Calculate new corner2 based on edited dimension
    let newCorner2: SketchPoint;

    if (editingDim === 'width') {
      const signX = corner2[0] >= corner1[0] ? 1 : -1;
      newCorner2 = [corner1[0] + signX * newValue, corner2[1]];
    } else {
      const signY = corner2[1] >= corner1[1] ? 1 : -1;
      newCorner2 = [corner2[0], corner1[1] + signY * newValue];
    }

    // Update entity in store
    updateEntity(entity.id, { corner2: newCorner2 } as Partial<SketchRect>);

    setEditingDim(null);
    setInputValue('');
  };

  const { worldCorners, width, height, widthLabelWorld, heightLabelWorld } = rectData;

  return (
    <group name={`rect-entity-${entity.id}`}>
      <Line points={worldCorners} color={color} lineWidth={2} />

      {/* Width dimension label - only show when showDimensions is true */}
      {showDimensions && (
        <Html position={widthLabelWorld} center style={{ pointerEvents: 'auto' }}>
          <div
            onClick={(e) => handleDimClick('width', width, e)}
            style={{
              backgroundColor: editingDim === 'width' ? '#1a1a2e' : 'rgba(34, 197, 94, 0.9)',
              color: '#fff',
              padding: editingDim === 'width' ? '2px' : '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: 'pointer',
              border: editingDim === 'width' ? '2px solid #22c55e' : '1px solid transparent',
              minWidth: 50,
              textAlign: 'center',
              transform: 'translateY(15px)',
            }}
          >
            {editingDim === 'width' ? (
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                onBlur={handleInputBlur}
                style={{
                  width: 60,
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
            ) : (
              `${width.toFixed(0)} mm`
            )}
          </div>
        </Html>
      )}

      {/* Height dimension label - only show when showDimensions is true */}
      {showDimensions && (
        <Html position={heightLabelWorld} center style={{ pointerEvents: 'auto' }}>
          <div
            onClick={(e) => handleDimClick('height', height, e)}
            style={{
              backgroundColor: editingDim === 'height' ? '#1a1a2e' : 'rgba(34, 197, 94, 0.9)',
              color: '#fff',
              padding: editingDim === 'height' ? '2px' : '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: 'pointer',
              border: editingDim === 'height' ? '2px solid #22c55e' : '1px solid transparent',
              minWidth: 50,
              textAlign: 'center',
              transform: 'translateX(15px)',
            }}
          >
            {editingDim === 'height' ? (
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                onBlur={handleInputBlur}
                style={{
                  width: 60,
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
            ) : (
              `${height.toFixed(0)} mm`
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

// Arc Entity
function ArcEntity({ entity, cplane, color }: { entity: SketchArc; cplane: any; color: string }) {
  const points = useMemo(() => {
    const arcPts = calculateArcPoints(entity.start, entity.mid, entity.end, 32);
    return arcPts.map((p) => plane2DToWorld(p, cplane));
  }, [entity, cplane]);

  if (points.length < 2) return null;
  return <Line points={points} color={color} lineWidth={2} />;
}

// Circle Entity
function CircleEntity({ entity, cplane, color }: { entity: SketchCircle; cplane: any; color: string }) {
  const points = useMemo(() => {
    const segments = 64;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const point: SketchPoint = [
        entity.center[0] + entity.radius * Math.cos(angle),
        entity.center[1] + entity.radius * Math.sin(angle),
      ];
      pts.push(plane2DToWorld(point, cplane));
    }
    return pts;
  }, [entity, cplane]);

  return <Line points={points} color={color} lineWidth={2} />;
}

// Polyline Entity
function PolylineEntity({ entity, cplane, color }: { entity: SketchPolyline; cplane: any; color: string }) {
  const points = useMemo(() => {
    const pts = entity.points.map((p) => plane2DToWorld(p, cplane));
    if (entity.closed && pts.length > 0) {
      pts.push(pts[0]); // Close the polyline
    }
    return pts;
  }, [entity, cplane]);

  if (points.length < 2) return null;
  return <Line points={points} color={color} lineWidth={2} />;
}

// ============================================================================
// Exports
// ============================================================================

export default SketchPreview;
