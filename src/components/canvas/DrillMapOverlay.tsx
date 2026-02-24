/**
 * DrillMapOverlay - v3.0 (InstancedMesh Optimization)
 *
 * Renders drill points in 3D scene using InstancedMesh for performance.
 * Shows CAM holes (Ø15) and BOLT holes (Ø10) with color coding.
 *
 * v3.0 Changes:
 * - CRITICAL FIX: Use InstancedMesh instead of individual meshes
 * - Reduces draw calls from 500+ to ~6 (one per drill purpose)
 * - Fixes WebGL Context Lost error on large drill maps
 * - Maintains click-to-select and dimension label features
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Html, Instances, Instance } from '@react-three/drei';
import * as THREE from 'three';
import type {
  DrillMap,
  DrillMapPoint,
  DrillMapPanel,
  MinifixConfig,
  DrillPurpose,
  DrillingParams,
} from '../../core/manufacturing/drillMap/types';
import { useDrillMapStore } from '../../core/store/useDrillMapStore';

// ============================================
// CONSTANTS
// ============================================

/** Colors for different drill purposes */
const DRILL_COLORS: Record<DrillPurpose, string> = {
  CAM_LOCK: '#f59e0b',     // Amber - cam housing
  BOLT: '#3b82f6',         // Blue - bolt/sleeve
  BOLT_ENTRY: '#06b6d4',   // Cyan - bolt entry (usually merged/hidden in other overlays)
  BOLT_THREAD: '#c4b5fd',  // Light purple - bolt thread pilot
  DOWEL: '#8b5cf6',        // Purple - dowel
  SHELF_PIN: '#22c55e',    // Green - shelf pin
  HINGE: '#ef4444',        // Red - hinge cup
  MINIFIX: '#f59e0b',      // Amber - minifix (same as CAM_LOCK)
  DRAWER_SLIDE: '#06b6d4', // Cyan - drawer slide mounting hole
  OTHER: '#6b7280',        // Gray - other
};

/** All drill purposes for iteration */
const ALL_PURPOSES: DrillPurpose[] = [
  'CAM_LOCK',
  'BOLT',
  'BOLT_ENTRY',
  'BOLT_THREAD',
  'DOWEL',
  'SHELF_PIN',
  'HINGE',
  'MINIFIX',
  'DRAWER_SLIDE',
  'OTHER',
];

function distanceSq(
  a: [number, number, number],
  b: [number, number, number]
): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
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
    if (point.purpose === 'BOLT_ENTRY') continue;

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
    result.push(point);
  }

  // v4.4: Deduplicate by (panelId, purpose, X, Y, Z) within 1mm tolerance.
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
// EDITABLE DIMENSION LABEL COMPONENTS
// ============================================

interface EditableDrillValueProps {
  label: string;
  value: number;
  unit?: string;
  onValueChange: (newValue: number) => void;
}

function EditableDrillValue({ label, value, unit = 'mm', onValueChange }: EditableDrillValueProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toFixed(1));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSubmit = useCallback(() => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 500) {
      onValueChange(parsed);
    }
    setIsEditing(false);
  }, [editValue, onValueChange]);

  const handleCancel = useCallback(() => {
    setEditValue(value.toFixed(1));
    setIsEditing(false);
  }, [value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  }, [handleSubmit, handleCancel]);

  if (isEditing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        <span style={{ color: '#9ca3af', fontSize: '9px' }}>{label}:</span>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={handleKeyDown}
          style={{
            width: '40px',
            padding: '1px 3px',
            border: '1px solid #3b82f6',
            borderRadius: '2px',
            background: '#1e3a5f',
            color: 'white',
            fontSize: '10px',
            fontFamily: 'monospace',
            outline: 'none',
          }}
        />
        <span style={{ color: '#9ca3af', fontSize: '9px' }}>{unit}</span>
      </span>
    );
  }

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      style={{
        cursor: 'pointer',
        padding: '1px 4px',
        borderRadius: '2px',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      title={`Click to edit ${label}`}
    >
      <span style={{ color: '#9ca3af', fontSize: '9px' }}>{label}:</span>
      <span style={{ color: '#60a5fa', fontWeight: 'bold', marginLeft: '2px' }}>
        {value.toFixed(1)}
      </span>
      <span style={{ color: '#9ca3af', fontSize: '9px', marginLeft: '1px' }}>{unit}</span>
    </span>
  );
}

interface DrillDimensionLabelProps {
  point: DrillMapPoint;
  drillingParams: DrillingParams;
  onParamChange: (param: keyof DrillingParams, value: number) => void;
}

function DrillDimensionLabel({ point, drillingParams, onParamChange }: DrillDimensionLabelProps) {
  const [x, y, z] = point.position;
  const labelOffset = 30;

  return (
    <Html
      position={[x, y + labelOffset, z]}
      center
      distanceFactor={300}
      style={{ pointerEvents: 'auto' }}
    >
      <div
        style={{
          background: 'rgba(30, 58, 95, 0.95)',
          border: '1px solid #3b82f6',
          borderRadius: '4px',
          padding: '4px 8px',
          fontFamily: 'monospace',
          fontSize: '10px',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{
          color: DRILL_COLORS[point.purpose],
          fontWeight: 'bold',
          borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
          paddingBottom: '2px',
          marginBottom: '4px',
        }}>
          {point.purpose === 'CAM_LOCK' ? 'CAM' : point.purpose === 'BOLT' ? 'BOLT' : point.purpose}
          <span style={{ color: '#9ca3af', fontWeight: 'normal', marginLeft: '4px' }}>
            Ø{point.diameter}×{point.depth}
          </span>
        </div>
        <div style={{ marginBottom: '2px' }}>
          <EditableDrillValue
            label="Z"
            value={drillingParams.firstHoleZ}
            onValueChange={(v) => onParamChange('firstHoleZ', v)}
          />
        </div>
        <div>
          <EditableDrillValue
            label="A"
            value={drillingParams.drillingDistanceB}
            onValueChange={(v) => onParamChange('drillingDistanceB', v)}
          />
        </div>
      </div>
      <svg
        style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
        }}
        width="2"
        height="20"
      >
        <line x1="1" y1="0" x2="1" y2="20" stroke="#3b82f6" strokeWidth="1" />
      </svg>
    </Html>
  );
}

// ============================================
// TYPES
// ============================================

interface DrillMapOverlayProps {
  drillMap: DrillMap | null;
  visible: boolean;
  selectedPurpose?: string | null;
  visualScale?: number;
  xRayMode?: boolean;
  show3DHardware?: boolean;
  showDrillDimensions?: boolean;
  highlightPresetConfig?: boolean;
  hardwareConfig?: MinifixConfig;
  selectedPointId?: string | null;
  onPointClick?: (point: DrillMapPoint | null) => void;
}

// ============================================
// INSTANCED DRILL POINTS (Performance Optimized)
// ============================================

interface InstancedDrillGroupProps {
  points: DrillMapPoint[];
  purpose: DrillPurpose;
  selectedPointId?: string | null;
  onPointClick?: (point: DrillMapPoint | null) => void;
}

/**
 * Renders all drill points of a specific purpose using InstancedMesh.
 * This dramatically reduces draw calls from N to 1 per purpose type.
 */
function InstancedDrillGroup({ points, purpose, selectedPointId, onPointClick }: InstancedDrillGroupProps) {
  const color = DRILL_COLORS[purpose];

  // Calculate transforms for each point
  const transforms = useMemo(() => {
    return points.map(point => {
      const [x, y, z] = point.position;
      const [nx, ny, nz] = point.normal;
      const radius = point.diameter / 2;
      const depth = point.depth;

      // Calculate rotation to align cylinder with normal
      const up = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3(nx, ny, nz).normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal);

      // Position offset by half depth along normal
      const halfDepth = depth / 2;
      const position = new THREE.Vector3(
        x - nx * halfDepth,
        y - ny * halfDepth,
        z - nz * halfDepth
      );

      return {
        point,
        position,
        quaternion,
        scale: new THREE.Vector3(radius, depth, radius), // x=radius, y=height, z=radius
        surfacePosition: new THREE.Vector3(x, y, z),
        surfaceScale: radius * 0.3,
      };
    });
  }, [points]);

  if (points.length === 0) return null;

  // Use average dimensions for the base geometry (instances will scale)
  const baseRadius = 1; // Unit radius, scaled per instance
  const baseHeight = 1; // Unit height, scaled per instance

  // OPTIMIZATION: Use static limit and minimal geometry to prevent WebGL Context Lost
  const INSTANCE_LIMIT = 200;

  return (
    <group name={`drill-instances-${purpose}`}>
      {/* Instanced cylinders for drill holes - minimal segments */}
      <Instances limit={INSTANCE_LIMIT} castShadow={false} receiveShadow={false}>
        <cylinderGeometry args={[baseRadius, baseRadius, baseHeight, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} />
        {transforms.map(({ point, position, quaternion, scale }) => (
          <Instance
            key={point.id}
            position={position}
            quaternion={quaternion}
            scale={scale}
            onClick={(e) => {
              e.stopPropagation();
              onPointClick?.(point);
            }}
            color={point.id === selectedPointId ? '#ffffff' : color}
          />
        ))}
      </Instances>
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function DrillMapOverlay({
  drillMap,
  visible,
  selectedPurpose,
  showDrillDimensions = false,
  selectedPointId,
  onPointClick,
}: DrillMapOverlayProps) {
  // Get drilling params and setter from store
  const drillingParams = useDrillMapStore((s) => s.drillingParams);
  const setDrillingParam = useDrillMapStore((s) => s.setDrillingParam);

  const handleParamChange = useCallback((param: keyof DrillingParams, value: number) => {
    setDrillingParam(param, value);
  }, [setDrillingParam]);

  // Collect and group all points by purpose
  const pointsByPurpose = useMemo(() => {
    if (!drillMap) return new Map<DrillPurpose, DrillMapPoint[]>();

    const grouped = new Map<DrillPurpose, DrillMapPoint[]>();
    ALL_PURPOSES.forEach(p => grouped.set(p, []));

    const rawPoints: DrillMapPoint[] = [];

    for (const panel of drillMap.panels) {
      for (const point of panel.points) {
        rawPoints.push(point);
      }
    }

    const displayPoints = buildDisplayPoints(rawPoints);

    for (const point of displayPoints) {
      // Filter by selected purpose if specified
      if (selectedPurpose && point.purpose !== selectedPurpose) continue;

      const arr = grouped.get(point.purpose);
      if (arr) arr.push(point);
    }

    return grouped;
  }, [drillMap, selectedPurpose]);

  // Find selected point for dimension label
  const selectedPoint = useMemo(() => {
    if (!selectedPointId || !drillMap) return null;
    const rawPoints = drillMap.panels.flatMap((panel) => panel.points);
    const displayPoints = buildDisplayPoints(rawPoints);
    for (const point of displayPoints) {
      if (point.id === selectedPointId) return point;
    }
    return null;
  }, [drillMap, selectedPointId]);

  if (!visible || !drillMap) return null;

  return (
    <group name="drill-map-overlay-v3.0">
      {/* Render instanced groups for each purpose type */}
      {ALL_PURPOSES.map(purpose => {
        const points = pointsByPurpose.get(purpose) || [];
        if (points.length === 0) return null;

        return (
          <InstancedDrillGroup
            key={purpose}
            points={points}
            purpose={purpose}
            selectedPointId={selectedPointId}
            onPointClick={onPointClick}
          />
        );
      })}

      {/* Show dimension label only for selected point */}
      {showDrillDimensions && selectedPoint && (
        <DrillDimensionLabel
          point={selectedPoint}
          drillingParams={drillingParams}
          onParamChange={handleParamChange}
        />
      )}
    </group>
  );
}

export default DrillMapOverlay;
