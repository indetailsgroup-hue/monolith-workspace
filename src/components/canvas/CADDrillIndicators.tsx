/**
 * CADDrillIndicators.tsx - CAD-Style Drill Point Annotations
 *
 * Renders 2D CAD-style indicators for drill points:
 * - Center crosshairs (+) at drill locations
 * - Circle outlines showing drill diameter
 * - Diameter callouts (Ø15, Ø10, Ø5, etc.)
 * - Depth annotations
 *
 * Uses Three.js Line and Circle primitives for crisp 2D rendering.
 *
 * @version 1.0.0
 */

import React, { useMemo } from 'react';
import { Line, Circle, Html } from '@react-three/drei';
import * as THREE from 'three';
import type {
  DrillMap,
  DrillMapPoint,
  DrillPurpose,
  Vec3Tuple,
} from '../../core/manufacturing/drillMap/types';

// ============================================
// CONSTANTS
// ============================================

/** CAD line colors by drill purpose */
const CAD_COLORS: Record<DrillPurpose, string> = {
  CAM_LOCK: '#fbbf24',     // Amber - cam housing (Ø15)
  BOLT: '#60a5fa',         // Blue - bolt/sleeve (??10)
  BOLT_ENTRY: '#06b6d4',   // Cyan - hidden in merged display (debug only)
  BOLT_THREAD: '#c4b5fd',  // Light purple - thread pilot (??5)
  DOWEL: '#a78bfa',        // Purple - dowel (Ø8)
  SHELF_PIN: '#4ade80',    // Green - shelf pin (Ø5)
  HINGE: '#f87171',        // Red - hinge cup (Ø35)
  MINIFIX: '#fbbf24',      // Amber - minifix (same as CAM_LOCK)
  DRAWER_SLIDE: '#22d3ee', // Cyan - drawer slide (Ø5)
  OTHER: '#9ca3af',        // Gray - other
};

/** Crosshair arm length as ratio of diameter */
const CROSSHAIR_RATIO = 0.7;

/** Circle segments for smooth appearance */
const CIRCLE_SEGMENTS = 32;

/** Offset to render indicators at panel surface (0 = flush with surface) */
const SURFACE_OFFSET = 0; // mm - flush with panel face

// ============================================
// TYPES
// ============================================

interface CADDrillIndicatorsProps {
  drillMap: DrillMap | null;
  visible: boolean;
  /** Show diameter callouts */
  showDiameter?: boolean;
  /** Show depth callouts */
  showDepth?: boolean;
  /** Show center crosshairs */
  showCrosshairs?: boolean;
  /** Line width for indicators */
  lineWidth?: number;
  /** Filter by purpose (show only specific types) */
  filterPurpose?: DrillPurpose[];
  /** Selected drill point ID for highlighting */
  selectedId?: string | null;
  /** Callback when clicking a drill point */
  onPointClick?: (point: DrillMapPoint) => void;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get rotation quaternion to align indicator with drill normal
 */
function getOrientationFromNormal(normal: Vec3Tuple): THREE.Euler {
  const up = new THREE.Vector3(0, 0, 1); // Default indicator faces +Z
  const normalVec = new THREE.Vector3(...normal).normalize();

  // Calculate rotation to align Z-up with the normal direction
  const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normalVec);
  return new THREE.Euler().setFromQuaternion(quaternion);
}

/**
 * Get offset position along normal for surface rendering.
 * Offset is AWAY from the material (opposite to drill direction)
 * so indicators render above the surface and avoid z-fighting.
 *
 * Example for LEFT panel BOLT:
 * - position = inner face (maxX)
 * - normal = [-1, 0, 0] (drilling INTO material, toward -X)
 * - offset AWAY from material = +X direction = -normal
 * - result: position - normal * offset = maxX - (-1) * 0.5 = maxX + 0.5
 */
function getOffsetPosition(position: Vec3Tuple, normal: Vec3Tuple, offset: number): Vec3Tuple {
  return [
    position[0] - normal[0] * offset,
    position[1] - normal[1] * offset,
    position[2] - normal[2] * offset,
  ];
}

function distanceSq(a: Vec3Tuple, b: Vec3Tuple): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

// ============================================
// LABEL DEDUP — Cross-panel merge (v4.4)
// ============================================
// When multiple drill points from different panels land at the same
// world position (e.g. BOLT on side + BOLT_THREAD on side after
// display normalization), we show only ONE label per (position, diameter).
// Circle/crosshair still renders for every point; only labels merge.

const LABEL_SNAP = 1; // mm tolerance for position grouping

function snapV(v: number): number {
  return Math.round(v / LABEL_SNAP) * LABEL_SNAP;
}

function labelPosKey(pos: Vec3Tuple): string {
  return `${snapV(pos[0])},${snapV(pos[1])},${snapV(pos[2])}`;
}

/** Higher score = higher priority to "own" the label at that position */
const PURPOSE_LABEL_PRIORITY: Record<string, number> = {
  CAM_LOCK: 100,
  MINIFIX: 100,
  BOLT: 90,
  BOLT_THREAD: 80,
  DOWEL: 70,
  SHELF_PIN: 60,
  HINGE: 50,
  DRAWER_SLIDE: 40,
  OTHER: 0,
};

interface LabelWinnerInfo {
  winnerId: string;
  score: number;
  count: number;   // how many points share this label slot
}

interface LabelOwnerMap {
  /** key → winner info for diameter labels: one per (position, diameter) */
  dia: Map<string, LabelWinnerInfo>;
  /** key → winner info for depth labels: one per (position, diameter×depth) */
  dep: Map<string, LabelWinnerInfo>;
}

/**
 * For each cluster of overlapping points, pick one "winner" per
 * (position, diameter) to show the diameter label, and one per
 * (position, diameter×depth) to show the depth label.
 * Winner = highest purpose priority, tie-break by id (stable).
 * Also counts how many points share each label slot for (×n) display.
 */
function buildLabelOwnerMap(points: DrillMapPoint[]): LabelOwnerMap {
  const dia = new Map<string, LabelWinnerInfo>();
  const dep = new Map<string, LabelWinnerInfo>();

  for (const p of points) {
    const base = labelPosKey(p.position);
    const score = PURPOSE_LABEL_PRIORITY[p.purpose] ?? 0;

    // Diameter label: one per (position, diameter)
    const kDia = `${base}|${p.diameter}`;
    const w1 = dia.get(kDia);
    if (!w1) {
      dia.set(kDia, { winnerId: p.id, score, count: 1 });
    } else {
      const better = score > w1.score || (score === w1.score && p.id < w1.winnerId);
      dia.set(kDia, {
        winnerId: better ? p.id : w1.winnerId,
        score: Math.max(w1.score, score),
        count: w1.count + 1,
      });
    }

    // Depth label: one per (position, diameter×depth)
    const kDep = `${base}|${p.diameter}x${p.depth}`;
    const w2 = dep.get(kDep);
    if (!w2) {
      dep.set(kDep, { winnerId: p.id, score, count: 1 });
    } else {
      const better = score > w2.score || (score === w2.score && p.id < w2.winnerId);
      dep.set(kDep, {
        winnerId: better ? p.id : w2.winnerId,
        score: Math.max(w2.score, score),
        count: w2.count + 1,
      });
    }
  }

  return { dia, dep };
}

/** Build the label key for a point (used by both buildLabelOwnerMap and render loop) */
function diaKey(p: DrillMapPoint): string {
  return `${labelPosKey(p.position)}|${p.diameter}`;
}
function depKey(p: DrillMapPoint): string {
  return `${labelPosKey(p.position)}|${p.diameter}x${p.depth}`;
}

function buildDisplayPoints(points: DrillMapPoint[]): DrillMapPoint[] {
  const boltEntries = points.filter((p) => p.purpose === 'BOLT_ENTRY');

  const findBoltEntry = (bolt: DrillMapPoint): DrillMapPoint | undefined => {
    let match = boltEntries.find((e) => e.pairedHoleId === bolt.id);
    if (match) return match;

    if (bolt.pairId) {
      match = boltEntries.find((e) => e.pairId === bolt.pairId);
      if (match) return match;
    }

    if (bolt.cornerType && typeof bolt.depthPosition === 'number') {
      match = boltEntries.find(
        (e) =>
          e.cornerType === bolt.cornerType &&
          typeof e.depthPosition === 'number' &&
          Math.abs(e.depthPosition - bolt.depthPosition!) < 0.001
      );
      if (match) return match;
    }

    if (boltEntries.length === 0) return undefined;

    return [...boltEntries].sort(
      (a, b) => distanceSq(a.position, bolt.position) - distanceSq(b.position, bolt.position)
    )[0];
  };

  const result: DrillMapPoint[] = [];
  for (const point of points) {
    if (point.purpose === 'BOLT_ENTRY') {
      continue;
    }

    if (point.purpose === 'BOLT') {
      const entry = findBoltEntry(point);
      if (entry) {
        result.push({
          ...point,
          position: entry.position,
          normal: entry.normal,
          depth: entry.depth,
        });
        continue;
      }
    }

    // v4.4: No Y-snap — generator now produces correct axis Y for all side-panel points.
    // BOLT_THREAD, DOWEL, and all others pass through with their original positions.
    result.push(point);
  }

  // v4.4: Deduplicate by (panelId, purpose, X, Y, Z) within 1mm tolerance.
  // Each panel's points are independent — never merge across panels.
  // All 3 coordinates checked to preserve DOWEL ±32mm Z offsets.
  const deduped: DrillMapPoint[] = [];
  for (const point of result) {
    const isDupe = deduped.some(
      (r) =>
        r.panelId === point.panelId &&
        r.purpose === point.purpose &&
        Math.abs(r.position[0] - point.position[0]) < 1 &&
        Math.abs(r.position[1] - point.position[1]) < 1 &&
        Math.abs(r.position[2] - point.position[2]) < 1
    );
    if (!isDupe) deduped.push(point);
  }
  return deduped;
}
// ============================================
// SUB-COMPONENTS
// ============================================

interface DrillIndicatorProps {
  point: DrillMapPoint;
  showDiameter: boolean;
  showDepth: boolean;
  showCrosshairs: boolean;
  lineWidth: number;
  isSelected: boolean;
  /** Whether this point "owns" the diameter label at its position (label dedup) */
  isLabelOwnerDia?: boolean;
  /** How many points share this diameter label slot (for ×n display) */
  diaCount?: number;
  /** Whether this point "owns" the depth label at its position (label dedup) */
  isLabelOwnerDep?: boolean;
  /** How many points share this depth label slot (for ×n display) */
  depCount?: number;
  onClick?: () => void;
}

/**
 * Individual CAD-style drill indicator
 */
function DrillIndicator({
  point,
  showDiameter,
  showDepth,
  showCrosshairs,
  lineWidth,
  isSelected,
  isLabelOwnerDia = true,
  diaCount = 1,
  isLabelOwnerDep = true,
  depCount = 1,
  onClick,
}: DrillIndicatorProps) {
  const color = CAD_COLORS[point.purpose] || CAD_COLORS.OTHER;
  const selectedColor = '#ffffff';
  const activeColor = isSelected ? selectedColor : color;

  // Get indicator orientation from drill normal
  const rotation = useMemo(
    () => getOrientationFromNormal(point.normal),
    [point.normal]
  );

  // Calculate offset position (slightly above surface)
  const position = useMemo(
    () => getOffsetPosition(point.position, point.normal, SURFACE_OFFSET),
    [point.position, point.normal]
  );

  // Scale factor for mm to world units
  const radius = point.diameter / 2;
  const crosshairArm = radius * CROSSHAIR_RATIO;

  // Generate circle points
  const circlePoints = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
      const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      pts.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0
      ));
    }
    return pts;
  }, [radius]);

  // Crosshair line points
  const crosshairPoints = useMemo(() => ({
    horizontal: [
      new THREE.Vector3(-crosshairArm, 0, 0),
      new THREE.Vector3(crosshairArm, 0, 0),
    ],
    vertical: [
      new THREE.Vector3(0, -crosshairArm, 0),
      new THREE.Vector3(0, crosshairArm, 0),
    ],
  }), [crosshairArm]);

  return (
    <group
      position={position}
      rotation={rotation}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {/* Invisible click target circle */}
      <mesh>
        <circleGeometry args={[radius, CIRCLE_SEGMENTS]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Diameter circle outline */}
      <Line
        points={circlePoints}
        color={activeColor}
        lineWidth={isSelected ? lineWidth * 1.5 : lineWidth}
        transparent
        opacity={isSelected ? 1 : 0.8}
      />

      {/* Center crosshairs */}
      {showCrosshairs && (
        <>
          <Line
            points={crosshairPoints.horizontal}
            color={activeColor}
            lineWidth={lineWidth * 0.8}
            transparent
            opacity={isSelected ? 1 : 0.7}
          />
          <Line
            points={crosshairPoints.vertical}
            color={activeColor}
            lineWidth={lineWidth * 0.8}
            transparent
            opacity={isSelected ? 1 : 0.7}
          />
        </>
      )}

      {/* Diameter callout — only rendered by the label "owner" at this position */}
      {showDiameter && isLabelOwnerDia && (
        <Html
          position={[radius + 3, radius + 3, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: 'rgba(0, 0, 0, 0.75)',
            color: activeColor,
            fontSize: '10px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            padding: '2px 4px',
            borderRadius: '2px',
            border: `1px solid ${activeColor}`,
            whiteSpace: 'nowrap',
          }}>
            Ø{point.diameter}{diaCount > 1 ? ` ×${diaCount}` : ''}
          </div>
        </Html>
      )}

      {/* Depth callout - show globally when showDepth=true, or per-point when selected */}
      {(showDepth || isSelected) && isLabelOwnerDep && (
        <Html
          position={[radius + 3, -radius - 3, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: isSelected ? 'rgba(30, 58, 95, 0.95)' : 'rgba(0, 0, 0, 0.6)',
            color: isSelected ? '#60a5fa' : '#9ca3af',
            fontSize: isSelected ? '11px' : '9px',
            fontFamily: 'monospace',
            fontWeight: isSelected ? 'bold' : 'normal',
            padding: isSelected ? '2px 6px' : '1px 3px',
            borderRadius: '2px',
            border: isSelected ? '1px solid #3b82f6' : 'none',
            whiteSpace: 'nowrap',
          }}>
            Ø{point.diameter}×{point.depth}mm{depCount > 1 ? ` ×${depCount}` : ''}
          </div>
        </Html>
      )}
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * CAD-style drill point indicators for 3D cabinet visualization.
 */
export function CADDrillIndicators({
  drillMap,
  visible,
  showDiameter = true,
  showDepth = false,
  showCrosshairs = true,
  lineWidth = 2,
  filterPurpose,
  selectedId = null,
  onPointClick,
}: CADDrillIndicatorsProps) {
  // Collect all drill points from all panels
  const allPoints = useMemo(() => {
    if (!drillMap?.panels) return [];

    const rawPoints: DrillMapPoint[] = [];
    for (const panel of drillMap.panels) {
      if (panel.points) {
        rawPoints.push(...panel.points);
      }
    }

    const points = buildDisplayPoints(rawPoints);

    // Apply purpose filter if specified
    if (filterPurpose && filterPurpose.length > 0) {
      return points.filter(p => filterPurpose.includes(p.purpose));
    }

    // ALL mode: show everything (dedup in buildDisplayPoints handles overlaps)
    return points;
  }, [drillMap, filterPurpose]);

  // v4.4: Label dedup — merge labels across panels at same position.
  // Circle/crosshair still renders for every point; only labels deduplicate.
  // Also tracks count per slot so we can show (×n) when multiple points overlap.
  const labelOwners = useMemo(() => buildLabelOwnerMap(allPoints), [allPoints]);

  if (!visible || allPoints.length === 0) {
    return null;
  }

  return (
    <group name="cad-drill-indicators">
      {allPoints.map((point) => {
        const diaInfo = labelOwners.dia.get(diaKey(point));
        const depInfo = labelOwners.dep.get(depKey(point));
        return (
          <DrillIndicator
            key={point.id}
            point={point}
            showDiameter={showDiameter}
            showDepth={showDepth}
            showCrosshairs={showCrosshairs}
            lineWidth={lineWidth}
            isSelected={point.id === selectedId}
            isLabelOwnerDia={diaInfo?.winnerId === point.id}
            diaCount={diaInfo?.count ?? 1}
            isLabelOwnerDep={depInfo?.winnerId === point.id}
            depCount={depInfo?.count ?? 1}
            onClick={() => onPointClick?.(point)}
          />
        );
      })}
    </group>
  );
}

// ============================================
// LEGEND COMPONENT
// ============================================

interface CADDrillLegendProps {
  visible: boolean;
}

/**
 * Legend showing drill purpose colors
 */
export function CADDrillLegend({ visible }: CADDrillLegendProps) {
  if (!visible) return null;

  const legendItems: { purpose: DrillPurpose; label: string; diameter: number }[] = [
    { purpose: 'CAM_LOCK', label: 'Cam Housing', diameter: 15 },
    { purpose: 'BOLT', label: 'Bolt Hole', diameter: 10 },
    { purpose: 'BOLT_THREAD', label: 'Bolt Thread Pilot', diameter: 5 },
    { purpose: 'DOWEL', label: 'Dowel', diameter: 8 },
    { purpose: 'SHELF_PIN', label: 'Shelf Pin', diameter: 5 },
    { purpose: 'DRAWER_SLIDE', label: 'Drawer Slide', diameter: 5 },
    { purpose: 'HINGE', label: 'Hinge Cup', diameter: 35 },
  ];

  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '20px',
      background: 'rgba(0, 0, 0, 0.8)',
      border: '1px solid #3a3a5a',
      borderRadius: '6px',
      padding: '8px 12px',
      fontFamily: 'monospace',
      fontSize: '11px',
    }}>
      <div style={{
        color: '#9ca3af',
        fontWeight: 'bold',
        marginBottom: '6px',
        borderBottom: '1px solid #3a3a5a',
        paddingBottom: '4px',
      }}>
        Drill Legend
      </div>
      {legendItems.map(({ purpose, label, diameter }) => (
        <div
          key={purpose}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '3px',
          }}
        >
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: `2px solid ${CAD_COLORS[purpose]}`,
            background: 'transparent',
          }} />
          <span style={{ color: '#d1d5db' }}>{label}</span>
          <span style={{ color: '#6b7280', marginLeft: 'auto' }}>Ø{diameter}</span>
        </div>
      ))}
    </div>
  );
}

export default CADDrillIndicators;

