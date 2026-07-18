/**
 * Handle3D - 3D Models of Cabinet Handle Hardware
 *
 * Renders bought handles (bar pulls and knobs) on door and drawer-front panels.
 * A handle is hardware, never a cut panel: it has no PanelRole, it is not a
 * CabinetPanel, and it can therefore never reach the cut list or the DXF.
 *
 * Follows the Hardware3D contract: mm units, position/rotation tuples converted
 * through THREE.Euler in useMemo, shared HARDWARE_PBR materials and the same
 * flat-red transparent X-Ray path.
 *
 * v1.0: Bar pull (round/square grip) and knob
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { HandleSpec } from '../../core/hardware/handleCatalog';
import { HANDLE_CATALOG } from '../../core/hardware/handleCatalog';
import type { HandlePlacement } from '../../core/hardware/handlePlacement';
import { HARDWARE_COLORS, HARDWARE_PBR } from './Hardware3D';

// ============================================
// DEFAULTS
// ============================================

/** Fallback spec so Handle3D can render standalone (previews, storybook-style use). */
export const DEFAULT_HANDLE_SPEC: HandleSpec = HANDLE_CATALOG['HDL-BAR-160-SS'];

// ============================================
// HANDLE 3D
// ============================================

interface Handle3DProps {
  /** Mounting origin in mm — the point where the posts meet the panel face. */
  position: [number, number, number];
  /** Rotation in radians. [0,0,0] = grip runs along +Y. */
  rotation?: [number, number, number];
  /** Catalog entry, or a partial override merged over the default. */
  config?: Partial<HandleSpec>;
  color?: string;
  xRayMode?: boolean;
  hovered?: boolean;
  onClick?: () => void;
}

/**
 * 3D Model of a cabinet handle.
 *
 * HANDLE-LOCAL FRAME (mirrors the Hardware3D cylinder convention, part axis +Y):
 *   grip axis       = +Y, length = overallLength
 *   mounting posts  = axis +Z, at y = ±centres/2, spanning z = 0 .. projection
 *   grip centreline = z = projection
 *   origin (0,0,0)  = where the posts meet the panel front face
 *
 * A KNOB is a single post on the +Z axis with a spherical head.
 */
export function Handle3D({
  position,
  rotation = [0, 0, 0],
  config,
  color,
  xRayMode = false,
  hovered = false,
  onClick,
}: Handle3DProps) {
  const spec: HandleSpec = useMemo(
    () => ({ ...DEFAULT_HANDLE_SPEC, ...config }),
    [config]
  );

  const baseColor = color || (xRayMode ? HARDWARE_COLORS.xRay : spec.colorHex);

  const eulerRotation = useMemo(() => {
    return new THREE.Euler(rotation[0], rotation[1], rotation[2]);
  }, [rotation]);

  // Handles are decoration on top of a panel that already owns the pointer
  // events. Raycasting stays off unless a caller explicitly wants clicks, so
  // handle meshes cannot swallow cabinet selection, glue-mode or drill-guide
  // clicks that are meant to pass through.
  const noopRaycast = () => {};
  const raycast = onClick ? undefined : noopRaycast;

  const pbr = xRayMode ? HARDWARE_PBR.xRay : HARDWARE_PBR.steel;
  const postRadius = spec.postDia / 2;
  const gripRadius = spec.gripSize / 2;

  const material = (
    <meshStandardMaterial
      color={baseColor}
      metalness={pbr.metalness}
      roughness={pbr.roughness}
      envMapIntensity={pbr.envMapIntensity}
      transparent={xRayMode}
      opacity={xRayMode ? 0.8 : 1}
      emissive={hovered ? baseColor : '#000000'}
      emissiveIntensity={hovered ? 0.3 : 0}
    />
  );

  // ─────────────────────────────────────────────────────────────────────
  // KNOB — single post + spherical head
  // ─────────────────────────────────────────────────────────────────────
  if (spec.form === 'KNOB') {
    return (
      <group position={position} rotation={eulerRotation}>
        {/* Post, laid onto +Z */}
        <mesh
          position={[0, 0, spec.projection / 2]}
          rotation={[Math.PI / 2, 0, 0]}
          raycast={raycast}
          onClick={onClick}
        >
          <cylinderGeometry args={[postRadius, postRadius, spec.projection, 16]} />
          {material}
        </mesh>

        {/* Head — overallLength is the head diameter for a knob */}
        <mesh position={[0, 0, spec.projection]} raycast={raycast} onClick={onClick}>
          <sphereGeometry args={[spec.overallLength / 2, 24, 16]} />
          {material}
        </mesh>
      </group>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // BAR — two posts + a grip spanning them
  // ─────────────────────────────────────────────────────────────────────
  const postY = spec.centres / 2;

  return (
    <group position={position} rotation={eulerRotation}>
      {/* Mounting posts, laid onto +Z */}
      {[postY, -postY].map((y, i) => (
        <mesh
          key={`post-${i}`}
          position={[0, y, spec.projection / 2]}
          rotation={[Math.PI / 2, 0, 0]}
          raycast={raycast}
          onClick={onClick}
        >
          <cylinderGeometry args={[postRadius, postRadius, spec.projection, 16]} />
          {material}
        </mesh>
      ))}

      {/* Grip, running along +Y at the projected centreline */}
      <mesh position={[0, 0, spec.projection]} raycast={raycast} onClick={onClick}>
        {spec.profile === 'SQUARE' ? (
          <boxGeometry args={[spec.gripSize, spec.overallLength, spec.gripSize]} />
        ) : (
          <cylinderGeometry args={[gripRadius, gripRadius, spec.overallLength, 20]} />
        )}
        {material}
      </mesh>
    </group>
  );
}

// ============================================
// HANDLE LAYER
// ============================================

interface HandleLayerProps {
  /** Placements in panel-local mm, from resolveHandlePlacements. */
  placements: HandlePlacement[];
  xRayMode?: boolean;
}

/**
 * Renders every handle on a cabinet.
 *
 * Mounted as a sibling of PanelsWithTexture inside the cabinet group, which is
 * the same cabinet-local mm space panel.position lives in. Each handle is
 * wrapped in a group that re-creates Panel3DComponent's
 * `<group position={panel.position} rotation={panel.rotation}>`, so the handle
 * inherits the cabinet's scenePosition/sceneRotation for free — kitchen runs
 * rotated about Y need no extra math.
 */
export function HandleLayer({ placements, xRayMode = false }: HandleLayerProps) {
  if (placements.length === 0) return null;

  return (
    <>
      {placements.map((placement, index) => (
        <group
          key={`${placement.panelId}-${index}`}
          position={placement.panelPosition}
          rotation={placement.panelRotation}
        >
          <Handle3D
            position={placement.localPosition}
            rotation={placement.localRotation}
            config={placement.spec}
            xRayMode={xRayMode}
          />
        </group>
      ))}
    </>
  );
}
