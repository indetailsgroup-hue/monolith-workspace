/**
 * GizmoOverlayRoot.tsx - Production-Grade Gizmo Wrapper
 *
 * FEATURES:
 * - Constant screen size (gizmo stays same size on screen regardless of zoom)
 * - Quantized grid origin (grid aligns to world coordinates)
 * - Proper render layering (gizmo renders above all objects)
 * - Grid overlay during plane drag
 *
 * USAGE:
 * <GizmoOverlayRoot
 *   position={cabinetPosition}
 *   rotation={cabinetRotation}
 *   onDragStart={() => {...}}
 *   onDrag={(pos) => {...}}
 *   onDragEnd={(pos, delta) => {...}}
 * />
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3 } from '../../core/types/SnapTypes';
import type { GizmoPlane } from '../../core/gizmo/gizmoTypes';
import { useGizmoStore } from '../../core/store/useGizmoStore';
import { calculateConstantScale } from '../../core/gizmo/useConstantScreenSize';
import { gridOriginOnPlane, calculateGridExtent } from '../../core/gizmo/gridOriginOnPlane';
import { getPlaneBasis } from '../../core/gizmo/translatePlaneDrag';
import { localAxesFromEuler } from '../../core/gizmo/gizmoAxis';
import {
  GIZMO_LAYERS,
  RENDER_ORDER,
  GIZMO_MATERIAL_FLAGS,
  setObjectLayers,
} from '../../core/gizmo/gizmoLayers';
import { GizmoTranslate } from './GizmoTranslate';
import { PlanarGridOverlayV2 } from './PlanarGridOverlayV2';

// ============================================
// TYPES
// ============================================

export interface GizmoOverlayRootProps {
  /** Object position in mm */
  position: [number, number, number];
  /** Object rotation in radians [x, y, z] */
  rotation?: [number, number, number];
  /** Target gizmo size in screen pixels (default: 150) */
  targetSizePx?: number;
  /** Whether gizmo is enabled */
  enabled?: boolean;
  /** Called when drag starts */
  onDragStart?: () => void;
  /** Called during drag with new position in mm */
  onDrag?: (position: Vec3) => void;
  /** Called when drag ends with final position in mm */
  onDragEnd?: (position: Vec3, delta: Vec3) => void;
  /** Show grid during plane drag (default: true) */
  showGrid?: boolean;
  /** Grid step size in mm (default: from store or 10mm) */
  gridStepMm?: number;
}

// ============================================
// COMPONENT
// ============================================

export function GizmoOverlayRoot({
  position,
  rotation = [0, 0, 0],
  targetSizePx = 150,
  enabled = true,
  onDragStart,
  onDrag,
  onDragEnd,
  showGrid = true,
  gridStepMm,
}: GizmoOverlayRootProps) {
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const scaleRef = useRef<number>(1);

  // Gizmo store state
  const session = useGizmoStore((s) => s.session);
  const space = useGizmoStore((s) => s.space);
  const stepMmOverride = useGizmoStore((s) => s.stepMmOverride);
  const sessionStepMm = useGizmoStore((s) => s.session.settings.stepMm);

  const isDraggingPlane = session.phase === 'dragging' && session.activePlane !== null;
  const activePlane = session.activePlane;

  // Effective step size (prop > override > session > default)
  const effectiveStepMm = gridStepMm ?? stepMmOverride ?? sessionStepMm ?? 10;

  // Convert position to Vec3 and THREE.Vector3 (meters)
  const positionVec3: Vec3 = useMemo(
    () => ({ x: position[0], y: position[1], z: position[2] }),
    [position]
  );

  const positionMeters = useMemo(
    () => new THREE.Vector3(position[0] / 1000, position[1] / 1000, position[2] / 1000),
    [position]
  );

  // Get local axes from rotation
  const localAxes = useMemo(() => localAxesFromEuler(rotation), [rotation]);

  // Calculate constant screen size scale
  useFrame(() => {
    if (!groupRef.current) return;

    const { scale } = calculateConstantScale({
      camera,
      worldPosition: positionMeters,
      viewportHeight: size.height,
      targetSizePx,
      minScale: 0.3,
      maxScale: 5,
    });

    scaleRef.current = scale;
    groupRef.current.scale.setScalar(scale);
  });

  // Set up gizmo layer on mount
  useEffect(() => {
    if (groupRef.current) {
      setObjectLayers(groupRef.current, GIZMO_LAYERS.DEFAULT, GIZMO_LAYERS.OVERLAY);

      // Set renderOrder on all children
      groupRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh || (child as THREE.Line).isLine) {
          child.renderOrder = RENDER_ORDER.GIZMO;
        }
      });
    }
  }, []);

  // Calculate grid origin and basis for plane drag
  const gridConfig = useMemo(() => {
    if (!isDraggingPlane || !activePlane) return null;

    // Get quantized grid origin
    const { origin, u, v, normal } = gridOriginOnPlane({
      objectPosition: session.previewPosition,
      plane: activePlane,
      stepMm: effectiveStepMm,
      space,
      localAxes: space === 'LOCAL' ? {
        axisX: localAxes.axisX,
        axisY: localAxes.axisY,
        axisZ: localAxes.axisZ,
      } : undefined,
    });

    // Calculate grid extent
    const extent = calculateGridExtent({
      stepMm: effectiveStepMm,
      maxLines: 40,
      minExtentMm: 200,
      maxExtentMm: 1500,
    });

    return { origin, u, v, normal, extent };
  }, [isDraggingPlane, activePlane, session.previewPosition, effectiveStepMm, space, localAxes]);

  if (!enabled) return null;

  return (
    <>
      {/* Gizmo with constant screen size */}
      <group ref={groupRef} position={positionMeters.toArray()}>
        <GizmoTranslate
          position={position}
          rotation={rotation}
          scale={1} // Scale is handled by parent group
          onDragStart={onDragStart}
          onDrag={onDrag}
          onDragEnd={onDragEnd}
          enabled={enabled}
        />
      </group>

      {/* Grid overlay during plane drag */}
      {showGrid && gridConfig && (
        <PlanarGridOverlayV2
          visible={isDraggingPlane}
          originWorld={gridConfig.origin}
          u={gridConfig.u}
          v={gridConfig.v}
          normal={gridConfig.normal}
          stepMm={effectiveStepMm}
          extentMm={gridConfig.extent}
          majorEvery={10}
          ringCount={4}
          minorColor="#ffffff"
          majorColor="#88ccff"
          axisColor="#88ff88"
          minorOpacity={0.1}
          majorOpacityBoost={0.15}
          axisOpacity={0.6}
        />
      )}
    </>
  );
}

// ============================================
// OVERLAY GIZMO HANDLE (with proper layering)
// ============================================

/**
 * HOC to apply overlay material flags to a mesh
 */
export function withOverlayFlags<P extends object>(
  WrappedComponent: React.ComponentType<P>
): React.FC<P & { isActive?: boolean }> {
  return function OverlayWrapped({ isActive, ...props }: P & { isActive?: boolean }) {
    const ref = useRef<THREE.Mesh>(null);

    useEffect(() => {
      if (ref.current) {
        const flags = isActive
          ? GIZMO_MATERIAL_FLAGS.OVERLAY_ACTIVE
          : GIZMO_MATERIAL_FLAGS.OVERLAY;

        ref.current.renderOrder = flags.renderOrder;

        if (ref.current.material) {
          const mat = ref.current.material as THREE.Material;
          mat.depthTest = flags.depthTest;
          mat.depthWrite = flags.depthWrite;
          mat.transparent = flags.transparent;
          mat.needsUpdate = true;
        }
      }
    }, [isActive]);

    return <WrappedComponent {...(props as P)} ref={ref} />;
  };
}

export default GizmoOverlayRoot;
