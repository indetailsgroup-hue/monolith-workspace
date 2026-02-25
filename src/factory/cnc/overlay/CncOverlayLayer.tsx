/**
 * CncOverlayLayer.tsx - CNC Overlay Layer Component
 *
 * R3F component that renders all CNC overlay markers.
 * Integrates with useCncOverlayStore for data and filter state.
 *
 * Features:
 * - Renders filtered overlay points as 3D markers
 * - Handles selection/hover state
 * - Performance optimized with instancing for large point counts
 *
 * @version 1.0.0 - Phase D4.x
 */

import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useCncOverlayStore, selectFilteredPoints } from '../../../core/store/useCncOverlayStore';
import { useCabinetStore } from '../../../core/store/useCabinetStore';
import { CncOverlayMarker } from './CncOverlayMarker';
import type { CncOverlayPoint } from './cncOverlayTypes';
import { getOverlayPointColor } from './cncOverlayTypes';
import { overlayPointToThreePosition, type OverlayPreviewState } from './overlayPreviewTransform';
import { resolvePreviewState, type PartialPreviewConfig } from './resolvePreviewState';
import type { HardwarePointOverrides } from '../../../core/types/Cabinet';

// ============================================================================
// TYPES
// ============================================================================

export interface CncOverlayLayerProps {
  /** Override visibility (optional, uses store state by default) */
  visible?: boolean;
  /** Maximum points to render (for performance) */
  maxPoints?: number;
  /** Preview transform state (flip/rotate) — preview-only, does not affect truth */
  previewState?: OverlayPreviewState | null;
  /** Callback when a point is selected */
  onPointSelect?: (point: CncOverlayPoint | null) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default maximum points to render */
const DEFAULT_MAX_POINTS = 500;

// ============================================================================
// COMPONENT
// ============================================================================

export const CncOverlayLayer: React.FC<CncOverlayLayerProps> = ({
  visible,
  maxPoints = DEFAULT_MAX_POINTS,
  previewState,
  onPointSelect,
}) => {
  // Per-connector preview: read overrides + global config from cabinet store.
  // Resolution per point: overrides[pairId] → globalConfig → identity
  // See docs/architecture/HARDWARE_PREVIEW_KEYS.md
  const hardwareOverrides = useCabinetStore(
    (s) => s.cabinet?.hardwareOverrides as HardwarePointOverrides | undefined
  );
  const globalPreviewConfig = useCabinetStore((s) => {
    const cfg: any = s.cabinet?.hardware?.minifixConfig;
    if (!cfg) return null;
    return cfg as PartialPreviewConfig;
  });

  // Get store state
  const isVisible = useCncOverlayStore((s) => visible ?? s.isVisible);
  const overlayResult = useCncOverlayStore((s) => s.overlayResult);
  const filter = useCncOverlayStore((s) => s.filter);
  const markerStyle = useCncOverlayStore((s) => s.markerStyle);
  const hoveredPointId = useCncOverlayStore((s) => s.hoveredPointId);
  const selectedPointId = useCncOverlayStore((s) => s.selectedPointId);
  const setHoveredPoint = useCncOverlayStore((s) => s.setHoveredPoint);
  const setSelectedPoint = useCncOverlayStore((s) => s.setSelectedPoint);
  const getPointById = useCncOverlayStore((s) => s.getPointById);

  // Get filtered points
  const filteredPoints = useCncOverlayStore(selectFilteredPoints);

  // Limit points for performance
  const visiblePoints = useMemo(() => {
    if (filteredPoints.length <= maxPoints) {
      return filteredPoints;
    }
    // When exceeding max, prioritize selected/hovered points
    const priority: CncOverlayPoint[] = [];
    const rest: CncOverlayPoint[] = [];

    for (const point of filteredPoints) {
      if (point.id === selectedPointId || point.id === hoveredPointId) {
        priority.push(point);
      } else {
        rest.push(point);
      }
    }

    return [...priority, ...rest.slice(0, maxPoints - priority.length)];
  }, [filteredPoints, maxPoints, selectedPointId, hoveredPointId]);

  // Handle point click
  const handlePointClick = useCallback(
    (pointId: string) => {
      // Toggle selection
      const newSelectedId = pointId === selectedPointId ? null : pointId;
      setSelectedPoint(newSelectedId);

      // Notify parent
      if (onPointSelect) {
        const point = newSelectedId ? getPointById(newSelectedId) : null;
        onPointSelect(point ?? null);
      }
    },
    [selectedPointId, setSelectedPoint, onPointSelect, getPointById]
  );

  // Handle point hover
  const handlePointHover = useCallback(
    (pointId: string | null) => {
      setHoveredPoint(pointId);
    },
    [setHoveredPoint]
  );

  // Don't render if not visible or no data
  if (!isVisible || !overlayResult || visiblePoints.length === 0) {
    return null;
  }

  return (
    <group name="cnc-overlay-layer">
      {visiblePoints.map((point) => {
        // Per-point preview resolution: overrides[v2] → overrides[v1] → global → identity
        const pointPreview = previewState ?? resolvePreviewState(
          point.preview?.pairKeyV2,
          point.preview?.pairId,
          hardwareOverrides,
          globalPreviewConfig
        );
        return (
          <CncOverlayMarker
            key={point.id}
            point={point}
            style={markerStyle}
            isSelected={point.id === selectedPointId}
            isHovered={point.id === hoveredPointId}
            previewState={pointPreview}
            onClick={handlePointClick}
            onHover={handlePointHover}
          />
        );
      })}
    </group>
  );
};

// ============================================================================
// CONSTANTS FOR INSTANCED RENDERING
// ============================================================================

/** Scale factor to convert mm to Three.js units (m) */
const MM_TO_M = 0.001;

/** Minimum marker height for visibility */
const MIN_MARKER_HEIGHT = 0.002; // 2mm

/** Default cylinder segments for instanced rendering (lower for performance) */
const INSTANCED_CYLINDER_SEGMENTS = 8;

/** Threshold for switching to instanced rendering */
const INSTANCING_THRESHOLD = 100;

// ============================================================================
// INSTANCED VERSION (for large point counts)
// ============================================================================

/**
 * Instanced overlay layer for better performance with many points.
 * Uses THREE.InstancedMesh for rendering 100+ drill points efficiently.
 *
 * Features:
 * - Uses InstancedMesh for batch rendering
 * - Per-instance color support via InstancedBufferAttribute
 * - Falls back to regular rendering for selection/hover interaction
 */
export const CncOverlayLayerInstanced: React.FC<CncOverlayLayerProps> = ({
  visible,
  maxPoints = 5000,
  previewState,
  onPointSelect,
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Per-connector preview: read overrides + global config from cabinet store.
  const hardwareOverrides = useCabinetStore(
    (s) => s.cabinet?.hardwareOverrides as HardwarePointOverrides | undefined
  );
  const globalPreviewConfig = useCabinetStore((s) => {
    const cfg: any = s.cabinet?.hardware?.minifixConfig;
    if (!cfg) return null;
    return cfg as PartialPreviewConfig;
  });

  const isVisible = useCncOverlayStore((s) => visible ?? s.isVisible);
  const overlayResult = useCncOverlayStore((s) => s.overlayResult);
  const markerStyle = useCncOverlayStore((s) => s.markerStyle);
  const hoveredPointId = useCncOverlayStore((s) => s.hoveredPointId);
  const selectedPointId = useCncOverlayStore((s) => s.selectedPointId);
  const setHoveredPoint = useCncOverlayStore((s) => s.setHoveredPoint);
  const setSelectedPoint = useCncOverlayStore((s) => s.setSelectedPoint);
  const getPointById = useCncOverlayStore((s) => s.getPointById);
  const filteredPoints = useCncOverlayStore(selectFilteredPoints);

  // Limit points for performance
  const visiblePoints = useMemo(() => {
    if (filteredPoints.length <= maxPoints) {
      return filteredPoints;
    }
    return filteredPoints.slice(0, maxPoints);
  }, [filteredPoints, maxPoints]);

  // For under threshold, fall back to regular layer for full interactivity
  if (visiblePoints.length < INSTANCING_THRESHOLD) {
    return (
      <CncOverlayLayer
        visible={visible}
        maxPoints={maxPoints}
        previewState={previewState}
        onPointSelect={onPointSelect}
      />
    );
  }

  // Create shared geometry for all instances (cylinder)
  const sharedGeometry = useMemo(() => {
    // Use average dimensions for the shared geometry
    const avgRadius = 0.004; // ~4mm radius
    const avgHeight = 0.01;  // ~10mm height
    return new THREE.CylinderGeometry(
      avgRadius,
      avgRadius,
      avgHeight,
      INSTANCED_CYLINDER_SEGMENTS
    );
  }, []);

  // Create instance matrices and colors
  const { matrices, colors, pointIdMap } = useMemo(() => {
    const count = visiblePoints.length;
    const matrices: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const pointIdMap: Map<number, string> = new Map();
    const tempMatrix = new THREE.Matrix4();
    const tempPosition = new THREE.Vector3();
    const tempQuaternion = new THREE.Quaternion();
    const tempScale = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const point = visiblePoints[i];
      pointIdMap.set(i, point.id);

      const height = Math.max(point.depth * MM_TO_M * markerStyle.scale, MIN_MARKER_HEIGHT);

      // Per-point preview resolution: overrides[v2] → overrides[v1] → global → identity
      const pointPreview = previewState ?? resolvePreviewState(
        point.preview?.pairKeyV2,
        point.preview?.pairId,
        hardwareOverrides,
        globalPreviewConfig
      );
      const [px, py, pz] = overlayPointToThreePosition(point, pointPreview, height / 2);
      tempPosition.set(px, py, pz);

      // Calculate scale based on actual diameter and depth
      const radius = (point.diameter / 2) * MM_TO_M * markerStyle.scale;
      const scaleX = radius / 0.004; // Scale relative to base geometry
      const scaleY = height / 0.01;
      const scaleZ = radius / 0.004;
      tempScale.set(scaleX, scaleY, scaleZ);

      // Identity rotation
      tempQuaternion.identity();

      // Compose matrix
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      matrices.push(tempMatrix.clone());

      // Get color based on point type
      const colorHex = getOverlayPointColor(point);
      colors.push(new THREE.Color(colorHex));
    }

    return { matrices, colors, pointIdMap };
  }, [visiblePoints, markerStyle.scale, previewState, hardwareOverrides, globalPreviewConfig]);

  // Update instance matrices when points change
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Update instance matrices
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Update instance colors
    if (mesh.instanceColor) {
      for (let i = 0; i < colors.length; i++) {
        mesh.setColorAt(i, colors[i]);
      }
      mesh.instanceColor.needsUpdate = true;
    }

    mesh.count = matrices.length;
  }, [matrices, colors]);

  // Handle click on instanced mesh
  const handleClick = useCallback(
    (event: THREE.Event) => {
      const instanceId = (event as any).instanceId;
      if (instanceId !== undefined && pointIdMap.has(instanceId)) {
        const pointId = pointIdMap.get(instanceId)!;
        const newSelectedId = pointId === selectedPointId ? null : pointId;
        setSelectedPoint(newSelectedId);

        if (onPointSelect) {
          const point = newSelectedId ? getPointById(newSelectedId) : null;
          onPointSelect(point ?? null);
        }
      }
    },
    [pointIdMap, selectedPointId, setSelectedPoint, onPointSelect, getPointById]
  );

  // Handle pointer move for hover
  const handlePointerMove = useCallback(
    (event: THREE.Event) => {
      const instanceId = (event as any).instanceId;
      if (instanceId !== undefined && pointIdMap.has(instanceId)) {
        const pointId = pointIdMap.get(instanceId)!;
        if (pointId !== hoveredPointId) {
          setHoveredPoint(pointId);
        }
      }
    },
    [pointIdMap, hoveredPointId, setHoveredPoint]
  );

  // Handle pointer leave
  const handlePointerLeave = useCallback(() => {
    setHoveredPoint(null);
  }, [setHoveredPoint]);

  // Don't render if not visible or no data
  if (!isVisible || !overlayResult || visiblePoints.length === 0) {
    return null;
  }

  return (
    <group name="cnc-overlay-layer-instanced">
      <instancedMesh
        ref={meshRef}
        args={[sharedGeometry, undefined, visiblePoints.length]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <meshStandardMaterial
          transparent
          opacity={markerStyle.opacity}
          vertexColors
        />
      </instancedMesh>

      {/* Render selected/hovered points with full detail markers for interaction feedback */}
      {selectedPointId && (
        (() => {
          const point = getPointById(selectedPointId);
          return point ? (
            <CncOverlayMarker
              key={`selected-${point.id}`}
              point={point}
              style={markerStyle}
              isSelected={true}
              isHovered={false}
            />
          ) : null;
        })()
      )}
      {hoveredPointId && hoveredPointId !== selectedPointId && (
        (() => {
          const point = getPointById(hoveredPointId);
          return point ? (
            <CncOverlayMarker
              key={`hovered-${point.id}`}
              point={point}
              style={markerStyle}
              isSelected={false}
              isHovered={true}
            />
          ) : null;
        })()
      )}
    </group>
  );
};

export default CncOverlayLayer;
