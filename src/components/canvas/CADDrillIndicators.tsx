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
  BOLT: '#60a5fa',         // Blue - bolt bore (Ø8 CNC spec)
  DOWEL: '#a78bfa',        // Purple - dowel (Ø8)
  SHELF_PIN: '#4ade80',    // Green - shelf pin (Ø5)
  HINGE: '#f87171',        // Red - hinge cup (Ø35)
  MINIFIX: '#fbbf24',      // Amber - minifix (same as CAM_LOCK)
  DRAWER_SLIDE: '#22d3ee', // Cyan - drawer slide (Ø5)
  OTHER: '#9ca3af',        // Gray - other
};

// ============================================
// CNC SPEC DISPLAY OVERRIDES
// DrillMapPoint stores manufacturing/assembly domain values (sleeveDia, boltBoreDepth)
// but 3D labels should show CNC catalog spec values per HAFELE_MINIFIX_15_B24.
// ============================================

/** CNC bolt bore diameter — Ø8mm (not assembly sleeve Ø10mm) */
const CNC_BOLT_BORE_DIA = 8;

/** CNC bolt bore depth — 34mm per HAFELE_MINIFIX_15_B24.BOLT.depthMm */
const CNC_BOLT_BORE_DEPTH = 34;

/**
 * Get CNC spec display values for a drill point.
 * BOLT purpose: overrides with CNC catalog values (Ø8, 34mm).
 * All other purposes: uses the drill map point values as-is.
 */
function getCncDisplayValues(point: DrillMapPoint): { diameter: number; depth: number } {
  if (point.purpose === 'BOLT') {
    return { diameter: CNC_BOLT_BORE_DIA, depth: CNC_BOLT_BORE_DEPTH };
  }
  return { diameter: point.diameter, depth: point.depth };
}

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
  onClick,
}: DrillIndicatorProps) {
  const color = CAD_COLORS[point.purpose] || CAD_COLORS.OTHER;
  const selectedColor = '#ffffff';
  const activeColor = isSelected ? selectedColor : color;

  // CNC display values (may override drill map values for BOLT purpose)
  const cncDisplay = useMemo(() => getCncDisplayValues(point), [point]);

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

  // Scale factor for mm to world units — use CNC display diameter for visual circle
  const radius = cncDisplay.diameter / 2;
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

      {/* Diameter callout */}
      {showDiameter && (
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
            Ø{cncDisplay.diameter}
          </div>
        </Html>
      )}

      {/* Depth callout */}
      {showDepth && (
        <Html
          position={[radius + 3, -radius - 3, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: 'rgba(0, 0, 0, 0.6)',
            color: '#9ca3af',
            fontSize: '9px',
            fontFamily: 'monospace',
            padding: '1px 3px',
            borderRadius: '2px',
            whiteSpace: 'nowrap',
          }}>
            ↓{cncDisplay.depth}mm
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

    const points: DrillMapPoint[] = [];
    for (const panel of drillMap.panels) {
      if (panel.points) {
        points.push(...panel.points);
      }
    }

    // Apply purpose filter if specified
    if (filterPurpose && filterPurpose.length > 0) {
      return points.filter(p => filterPurpose.includes(p.purpose));
    }

    return points;
  }, [drillMap, filterPurpose]);

  if (!visible || allPoints.length === 0) {
    return null;
  }

  return (
    <group name="cad-drill-indicators">
      {allPoints.map((point) => (
        <DrillIndicator
          key={point.id}
          point={point}
          showDiameter={showDiameter}
          showDepth={showDepth}
          showCrosshairs={showCrosshairs}
          lineWidth={lineWidth}
          isSelected={point.id === selectedId}
          onClick={() => onPointClick?.(point)}
        />
      ))}
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
    { purpose: 'BOLT', label: 'Bolt Bore', diameter: CNC_BOLT_BORE_DIA },
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
