/**
 * Hardware3D - 3D Models of Cabinet Hardware
 *
 * Renders Häfele Minifix connectors, dowels, and bolts as 3D objects
 * for realistic visualization in the cabinet scene.
 *
 * v1.0: Initial implementation with Minifix, Dowel, Bolt models
 * v1.1: Enhanced PBR materials and improved detail (Indetails Smart patterns)
 */

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Cylinder, Cone, Line, Html } from '@react-three/drei';
import type { DrillMapPoint } from '../../core/manufacturing/drillMap/types';
import type { RenderMode } from '../../core/types/VisualTypes';
import type { MinifixFullConfig } from '../ui/MinifixConfigPanel';
import { MinifixSet, S200_SPECS } from './MinifixSet';

// ============================================
// HARDWARE COLORS (Enhanced PBR values)
// ============================================

export const HARDWARE_COLORS = {
  // Minifix cam housing - zinc alloy (realistic silver/gray)
  camHousing: '#b8b8b8',
  camHousingSlot: '#505050',
  camHousingHighlight: '#d0d0d0',
  camHousingInner: '#8a8a8a',

  // Connecting bolt - steel (realistic metallic)
  bolt: '#6a6a78',
  boltThread: '#454550',
  boltHead: '#7a7a88',
  boltTip: '#808090',
  // S200 Bolt sleeve - BRIGHT RED plastic (matches Häfele catalog)
  boltSleeve: '#e02020',
  boltSleeveDark: '#c01818',

  // Wood dowel - beech wood (warm natural brown)
  dowel: '#c9a86c',
  dowelFlute: '#9e7a45',
  dowelEnd: '#b8976a',

  // X-Ray mode - professional CAD red scheme
  xRay: '#ff3333',
  xRayHighlight: '#ff0000',
  xRayDim: '#993333',

  // Ghost mode (for preview)
  ghost: '#d6d3d1',
};

// ============================================
// PBR MATERIAL PROPERTIES
// ============================================

export const HARDWARE_PBR = {
  // Zinc alloy (cam housing)
  zinc: {
    metalness: 0.7,
    roughness: 0.25,
    envMapIntensity: 1.2,
  },
  // Steel (bolts)
  steel: {
    metalness: 0.85,
    roughness: 0.2,
    envMapIntensity: 1.5,
  },
  // Beech wood (dowels)
  wood: {
    metalness: 0,
    roughness: 0.65,
    envMapIntensity: 0.3,
  },
  // X-Ray (flat, no reflections)
  xRay: {
    metalness: 0,
    roughness: 1,
    envMapIntensity: 0,
  },
};

// ============================================
// MINIFIX BOLT FRAME BUILDER (Truth-chain aligned)
// ============================================

type Vec3Tuple = [number, number, number];

function tupleSub(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function tupleScale(a: Vec3Tuple, s: number): Vec3Tuple {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function tupleAdd(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function tupleLen(a: Vec3Tuple): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

function tupleNormalize(a: Vec3Tuple, eps = 1e-9): Vec3Tuple {
  const L = tupleLen(a);
  if (L < eps) return [0, 1, 0];
  return [a[0] / L, a[1] / L, a[2] / L];
}

export function quatFromYTo(dir: Vec3Tuple): Vec3Tuple {
  const axisV = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, axisV);
  const e = new THREE.Euler().setFromQuaternion(q);
  return [e.x, e.y, e.z];
}

export interface BoltMeshFrame {
  axis: Vec3Tuple;                    // A -> C (toward cam pocket)
  rotation: Vec3Tuple;                // +Y -> axis
  ballPos: Vec3Tuple;                 // local (relative to group origin at A)
  neckPos: Vec3Tuple;                 // local
  sleevePos: Vec3Tuple;               // local
  threadPos: Vec3Tuple;               // local (center of threaded shaft segment)
  debug: {
    hasTarget: boolean;
    distAtoBall: number;
  };
}

export interface BuildBoltMeshFrameArgs {
  point: DrillMapPoint;
  hardwareConfig?: MinifixFullConfig;
  // Dimensions (defaults match S200 values)
  BALL_HEAD_RADIUS?: number;
  NECK_LENGTH?: number;
  SLEEVE_LENGTH?: number;
  L?: number;
}

/**
 * Build bolt mesh positioning frame from DrillMapPoint.
 *
 * Truth chain: generateDrillMap → targetPocketCenter → buildBoltMeshFrame → 3D mesh
 *
 * @param args - Point data and optional dimension overrides
 * @returns Frame with all positions/rotations for bolt parts
 */
export function buildBoltMeshFrame(args: BuildBoltMeshFrameArgs): BoltMeshFrame {
  const { point, hardwareConfig } = args;

  const BALL_HEAD_RADIUS = args.BALL_HEAD_RADIUS ?? 3.75;
  const NECK_LENGTH = args.NECK_LENGTH ?? 6.5;
  const SLEEVE_LENGTH = args.SLEEVE_LENGTH ?? 17.5;
  const L = args.L ?? (hardwareConfig?.shaftLength || 11);

  const A = point.position as Vec3Tuple;

  // axis = A -> C (or legacy normal)
  const boltDir = (point.boltDirection || point.normal) as Vec3Tuple;
  const axis = tupleNormalize(boltDir);

  // BALL target: use targetPocketCenter if available (B=C truth)
  const C = point.targetPocketCenter as Vec3Tuple | undefined;

  // fallback puts ball "in front" of A toward cam direction
  const fallbackDistance = SLEEVE_LENGTH + NECK_LENGTH + BALL_HEAD_RADIUS;

  const ballPos: Vec3Tuple = C
    ? tupleSub(C, A) // local coords relative to A
    : tupleScale(axis, fallbackDistance);

  // Anchor all parts to ballPos (robust approach)
  const neckOffset = BALL_HEAD_RADIUS + NECK_LENGTH / 2;
  const sleeveOffset = BALL_HEAD_RADIUS + NECK_LENGTH + SLEEVE_LENGTH / 2;

  const neckPos: Vec3Tuple = tupleAdd(ballPos, tupleScale(axis, -neckOffset));
  const sleevePos: Vec3Tuple = tupleAdd(ballPos, tupleScale(axis, -sleeveOffset));

  // IMPORTANT: thread goes INTO bolt panel from A along +axis
  const threadPos: Vec3Tuple = tupleScale(axis, L / 2);

  return {
    axis,
    rotation: quatFromYTo(axis),
    ballPos,
    neckPos,
    sleevePos,
    threadPos,
    debug: {
      hasTarget: !!C,
      distAtoBall: tupleLen(ballPos),
    },
  };
}

// ============================================
// CAM HOUSING (Minifix 15)
// ============================================

interface CamHousing3DProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  diameter?: number;
  depth?: number;
  color?: string;
  xRayMode?: boolean;
  hovered?: boolean;
  onClick?: () => void;
}

/**
 * 3D Model of Minifix Cam Housing
 *
 * Features:
 * - Cylindrical body with eccentric cam mechanism
 * - Slot for screwdriver
 * - Accurate dimensions from Häfele specs
 */
export function CamHousing3D({
  position,
  rotation = [0, 0, 0],
  diameter = 15,
  depth = 13.5,
  color,
  xRayMode = false,
  hovered = false,
  onClick,
}: CamHousing3DProps) {
  const baseColor = color || (xRayMode ? HARDWARE_COLORS.xRay : HARDWARE_COLORS.camHousing);
  const radius = diameter / 2;

  // Convert rotation to Euler
  const eulerRotation = useMemo(() => {
    return new THREE.Euler(rotation[0], rotation[1], rotation[2]);
  }, [rotation]);

  return (
    <group position={position} rotation={eulerRotation}>
      {/* Main cylindrical body */}
      <mesh onClick={onClick}>
        <cylinderGeometry args={[radius, radius, depth, 32]} />
        <meshStandardMaterial
          color={baseColor}
          metalness={xRayMode ? HARDWARE_PBR.xRay.metalness : HARDWARE_PBR.zinc.metalness}
          roughness={xRayMode ? HARDWARE_PBR.xRay.roughness : HARDWARE_PBR.zinc.roughness}
          envMapIntensity={xRayMode ? HARDWARE_PBR.xRay.envMapIntensity : HARDWARE_PBR.zinc.envMapIntensity}
          transparent={xRayMode}
          opacity={xRayMode ? 0.8 : 1}
          emissive={hovered ? baseColor : '#000000'}
          emissiveIntensity={hovered ? 0.3 : 0}
        />
      </mesh>

      {/* Inner eccentric cam (smaller cylinder offset from center) */}
      <mesh position={[radius * 0.2, 0, 0]}>
        <cylinderGeometry args={[radius * 0.5, radius * 0.5, depth * 0.8, 24]} />
        <meshStandardMaterial
          color={xRayMode ? HARDWARE_COLORS.xRayDim : HARDWARE_COLORS.camHousingSlot}
          metalness={xRayMode ? 0 : 0.4}
          roughness={0.5}
          transparent={xRayMode}
          opacity={xRayMode ? 0.6 : 1}
        />
      </mesh>

      {/* Screw slot on top (cross pattern) */}
      <group position={[0, depth / 2 + 0.1, 0]}>
        {/* Horizontal slot */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[radius * 1.2, 1.5, 2]} />
          <meshStandardMaterial
            color={xRayMode ? HARDWARE_COLORS.xRayDim : HARDWARE_COLORS.camHousingSlot}
            metalness={0.3}
            roughness={0.6}
          />
        </mesh>
        {/* Vertical slot */}
        <mesh rotation={[Math.PI / 2, Math.PI / 2, 0]}>
          <boxGeometry args={[radius * 1.2, 1.5, 2]} />
          <meshStandardMaterial
            color={xRayMode ? HARDWARE_COLORS.xRayDim : HARDWARE_COLORS.camHousingSlot}
            metalness={0.3}
            roughness={0.6}
          />
        </mesh>
      </group>

      {/* Rim/flange at top */}
      <mesh position={[0, depth / 2 - 1, 0]}>
        <cylinderGeometry args={[radius * 1.1, radius, 2, 32]} />
        <meshStandardMaterial
          color={hovered ? HARDWARE_COLORS.camHousingHighlight : baseColor}
          metalness={xRayMode ? HARDWARE_PBR.xRay.metalness : HARDWARE_PBR.zinc.metalness + 0.1}
          roughness={xRayMode ? HARDWARE_PBR.xRay.roughness : HARDWARE_PBR.zinc.roughness - 0.05}
          envMapIntensity={xRayMode ? 0 : HARDWARE_PBR.zinc.envMapIntensity}
          transparent={xRayMode}
          opacity={xRayMode ? 0.9 : 1}
        />
      </mesh>
    </group>
  );
}

// ============================================
// WOOD DOWEL
// ============================================

interface Dowel3DProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  diameter?: number;
  length?: number;
  color?: string;
  xRayMode?: boolean;
  hovered?: boolean;
  onClick?: () => void;
}

/**
 * 3D Model of Wood Dowel (Fluted) - Häfele Style
 *
 * Features:
 * - Multiple straight vertical flutes (grooves) like real industrial dowels
 * - Flutes are indented channels running parallel to the axis
 * - Chamfered ends for easy insertion
 * - Beech wood color with darker flute channels
 *
 * Based on Häfele catalog reference images showing straight fluted dowels
 */
export function Dowel3D({
  position,
  rotation = [0, 0, 0],
  diameter = 8,
  length = 30,
  color,
  xRayMode = false,
  hovered = false,
  onClick,
}: Dowel3DProps) {
  const baseColor = color || (xRayMode ? HARDWARE_COLORS.xRay : HARDWARE_COLORS.dowel);
  const radius = diameter / 2;
  const fluteCount = 12; // Number of flutes around circumference
  const fluteDepth = radius * 0.15; // How deep the grooves are
  const fluteWidth = 0.8; // Width of each groove in mm

  const eulerRotation = useMemo(() => {
    return new THREE.Euler(rotation[0], rotation[1], rotation[2]);
  }, [rotation]);

  // Calculate flute positions (evenly spaced around circumference)
  const flutePositions = useMemo(() => {
    const positions: { x: number; z: number; angle: number }[] = [];
    for (let i = 0; i < fluteCount; i++) {
      const angle = (i / fluteCount) * Math.PI * 2;
      // Position at the outer edge of the dowel
      const x = Math.cos(angle) * (radius - fluteDepth / 2);
      const z = Math.sin(angle) * (radius - fluteDepth / 2);
      positions.push({ x, z, angle });
    }
    return positions;
  }, [radius, fluteCount, fluteDepth]);

  // Effective fluted length (leave some smooth at ends for chamfer)
  const flutedLength = length - 4; // 2mm chamfer zone at each end

  return (
    <group position={position} rotation={eulerRotation}>
      {/* Main cylinder body */}
      <mesh onClick={onClick}>
        <cylinderGeometry args={[radius, radius, length, 24]} />
        <meshStandardMaterial
          color={baseColor}
          metalness={xRayMode ? HARDWARE_PBR.xRay.metalness : HARDWARE_PBR.wood.metalness}
          roughness={xRayMode ? HARDWARE_PBR.xRay.roughness : HARDWARE_PBR.wood.roughness}
          envMapIntensity={xRayMode ? 0 : HARDWARE_PBR.wood.envMapIntensity}
          transparent={xRayMode}
          opacity={xRayMode ? 0.8 : 1}
          emissive={hovered ? baseColor : '#000000'}
          emissiveIntensity={hovered ? 0.2 : 0}
        />
      </mesh>

      {/* Flutes (straight grooves along the length) */}
      {!xRayMode && flutePositions.map((pos, idx) => (
        <mesh
          key={`flute-${idx}`}
          position={[pos.x, 0, pos.z]}
          rotation={[0, pos.angle, 0]}
        >
          {/* Each flute is a thin box that represents the groove */}
          <boxGeometry args={[fluteWidth, flutedLength, fluteDepth]} />
          <meshStandardMaterial
            color={HARDWARE_COLORS.dowelFlute}
            metalness={0}
            roughness={0.8}
          />
        </mesh>
      ))}

      {/* Chamfered end - top (smooth tapered cone) */}
      <mesh position={[0, length / 2, 0]}>
        <coneGeometry args={[radius * 0.7, 2, 16]} />
        <meshStandardMaterial
          color={xRayMode ? HARDWARE_COLORS.xRay : HARDWARE_COLORS.dowelEnd}
          metalness={0}
          roughness={0.6}
          transparent={xRayMode}
          opacity={xRayMode ? 0.8 : 1}
        />
      </mesh>

      {/* Chamfer ring at top */}
      <mesh position={[0, length / 2 - 1, 0]}>
        <cylinderGeometry args={[radius, radius * 0.85, 1.5, 16]} />
        <meshStandardMaterial
          color={baseColor}
          metalness={0}
          roughness={0.65}
          transparent={xRayMode}
          opacity={xRayMode ? 0.8 : 1}
        />
      </mesh>

      {/* Chamfered end - bottom */}
      <mesh position={[0, -length / 2, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[radius * 0.7, 2, 16]} />
        <meshStandardMaterial
          color={xRayMode ? HARDWARE_COLORS.xRay : HARDWARE_COLORS.dowelEnd}
          metalness={0}
          roughness={0.6}
          transparent={xRayMode}
          opacity={xRayMode ? 0.8 : 1}
        />
      </mesh>

      {/* Chamfer ring at bottom */}
      <mesh position={[0, -length / 2 + 1, 0]}>
        <cylinderGeometry args={[radius * 0.85, radius, 1.5, 16]} />
        <meshStandardMaterial
          color={baseColor}
          metalness={0}
          roughness={0.65}
          transparent={xRayMode}
          opacity={xRayMode ? 0.8 : 1}
        />
      </mesh>
    </group>
  );
}

// ============================================
// S200 MINIFIX BOLT (สลักเกลียว)
// Based on Häfele S200 Bolt specifications
// ============================================

/**
 * S200 Bolt Configuration (from Minifix Config Editor)
 */
export interface S200BoltConfig {
  /** Drilling Distance B (24mm or 34mm) */
  drillingDistanceB: number;
  /** Ball Head diameter in mm */
  ballHeadDia: number;
  /** Ball Head offset from shaft center */
  ballHeadOffset: number;
  /** Neck shaft diameter in mm (steel shaft between ball head and sleeve) */
  neckShaftDia: number;
  /** Neck shaft length in mm */
  neckShaftLength: number;
  /** Neck shaft offset */
  neckShaftOffset: number;
  /** Sleeve diameter in mm */
  sleeveDia: number;
  /** Sleeve length in mm */
  sleeveLength: number;
  /** Sleeve offset from ball head */
  sleeveOffset: number;
  /** Threaded shaft diameter in mm */
  shaftDia: number;
  /** Threaded shaft length in mm */
  shaftLength: number;
  /** Threaded shaft offset */
  shaftOffset: number;
}

/** Default S200 Bolt configuration (B=24mm per Indetails CAD spec)
 * B = ballHead/2 (3.25) + neckShaft (6.5) + sleeve (14.25) = 24mm
 * Total = B + shaftLength (11) = 35mm
 * Per Häfele catalog: "Ø 6.5 mm bolt head" */
export const DEFAULT_S200_CONFIG: S200BoltConfig = {
  drillingDistanceB: 24,
  ballHeadDia: 6.5,
  ballHeadOffset: 0,
  neckShaftDia: 6.5,
  neckShaftLength: 6.5,
  neckShaftOffset: 0,
  sleeveDia: 10,
  sleeveLength: 14.25,
  sleeveOffset: 0,
  shaftDia: 5,
  shaftLength: 11,
  shaftOffset: 0,
};

/** S200 Bolt configuration for B=24mm variant (shorter shaft) */
export const S200_CONFIG_B24: S200BoltConfig = {
  drillingDistanceB: 24,
  ballHeadDia: 6.5,
  ballHeadOffset: 0,
  neckShaftDia: 6.5,
  neckShaftLength: 6.5,
  neckShaftOffset: 0,
  sleeveDia: 10,
  sleeveLength: 14.25,
  sleeveOffset: 0,
  shaftDia: 5,
  shaftLength: 8,
  shaftOffset: 0,
};

interface S200Bolt3DProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  config?: S200BoltConfig;
  color?: string;
  xRayMode?: boolean;
  hovered?: boolean;
  onClick?: () => void;
}

/**
 * 3D Model of Häfele S200 Minifix Bolt (สลักเกลียว)
 *
 * Accurate model based on Minifix Config Editor specs:
 * - Ball Head (หัวกลม): 7.5mm diameter sphere
 * - Sleeve (ปลอก): 10mm dia × 17.5mm length
 * - Threaded Shaft (ก้านเกลียว): 6mm dia × 31mm length
 */
export function S200Bolt3D({
  position,
  rotation = [0, 0, 0],
  config = DEFAULT_S200_CONFIG,
  color,
  xRayMode = false,
  hovered = false,
  onClick,
}: S200Bolt3DProps) {
  const baseColor = color || (xRayMode ? HARDWARE_COLORS.xRay : HARDWARE_COLORS.bolt);

  const eulerRotation = useMemo(() => {
    return new THREE.Euler(rotation[0], rotation[1], rotation[2]);
  }, [rotation]);

  // Thread rings for visual detail on shaft
  const threadRings = useMemo(() => {
    const rings: number[] = [];
    const threadPitch = 2; // 2mm thread pitch
    const threadCount = Math.floor(config.shaftLength / threadPitch);
    for (let i = 0; i < threadCount; i++) {
      rings.push(i * threadPitch);
    }
    return rings;
  }, [config.shaftLength]);

  // Calculate total length: Ball Head + Neck Shaft + Sleeve + Threaded Shaft
  // Layout from top to bottom: Ball Head -> Neck Shaft -> Sleeve -> Threaded Shaft
  const totalLength =
    config.ballHeadDia / 2 +
    config.neckShaftLength +
    config.sleeveLength +
    config.shaftLength;

  // Calculate Y positions for each part (centered at 0)
  const ballHeadY = totalLength / 2 - config.ballHeadDia / 2;
  const neckShaftY = totalLength / 2 - config.ballHeadDia - config.neckShaftLength / 2;
  const sleeveY = totalLength / 2 - config.ballHeadDia - config.neckShaftLength - config.sleeveLength / 2;
  const shaftY = totalLength / 2 - config.ballHeadDia - config.neckShaftLength - config.sleeveLength - config.shaftLength / 2;

  return (
    <group position={position} rotation={eulerRotation}>
      {/* Ball Head (หัวกลม) - chrome steel sphere at top */}
      <mesh position={[0, ballHeadY, 0]} onClick={onClick}>
        <sphereGeometry args={[config.ballHeadDia / 2, 24, 24]} />
        <meshStandardMaterial
          color={xRayMode ? HARDWARE_COLORS.xRay : '#c0c0c0'}
          metalness={xRayMode ? HARDWARE_PBR.xRay.metalness : 0.6}
          roughness={xRayMode ? HARDWARE_PBR.xRay.roughness : 0.25}
          envMapIntensity={xRayMode ? 0 : 1}
          transparent={xRayMode}
          opacity={xRayMode ? 0.8 : 1}
          emissive={hovered ? baseColor : '#000000'}
          emissiveIntensity={hovered ? 0.3 : 0}
        />
      </mesh>

      {/* Neck connecting ball to shaft (small steel cylinder under ball head) */}
      <mesh position={[0, ballHeadY - config.ballHeadDia / 2 - config.ballHeadDia * 0.15, 0]}>
        <cylinderGeometry args={[config.ballHeadDia * 0.2, config.ballHeadDia * 0.25, config.ballHeadDia * 0.3, 16]} />
        <meshStandardMaterial
          color={xRayMode ? HARDWARE_COLORS.xRay : '#b0b0b0'}
          metalness={xRayMode ? 0 : 0.5}
          roughness={xRayMode ? 1 : 0.3}
          transparent={xRayMode}
          opacity={xRayMode ? 0.8 : 1}
        />
      </mesh>

      {/* Neck Shaft (แกนเหล็ก) - steel shaft between ball head and sleeve */}
      <mesh position={[0, neckShaftY, 0]}>
        <cylinderGeometry args={[config.neckShaftDia / 2, config.neckShaftDia / 2, config.neckShaftLength, 20]} />
        <meshStandardMaterial
          color={xRayMode ? HARDWARE_COLORS.xRay : '#a0a0a0'}
          metalness={xRayMode ? 0 : 0.5}
          roughness={xRayMode ? 1 : 0.3}
          envMapIntensity={xRayMode ? 0 : 0.8}
          transparent={xRayMode}
          opacity={xRayMode ? 0.8 : 1}
        />
      </mesh>

      {/* Sleeve (ปลอก) - BRIGHT RED plastic like real Häfele S200 */}
      <mesh position={[0, sleeveY, 0]}>
        <cylinderGeometry args={[config.sleeveDia / 2, config.sleeveDia / 2, config.sleeveLength, 24]} />
        <meshStandardMaterial
          color={xRayMode ? HARDWARE_COLORS.xRay : HARDWARE_COLORS.boltSleeve}
          metalness={0}
          roughness={xRayMode ? 1 : 0.5}
          envMapIntensity={xRayMode ? 0 : 0.3}
          transparent={xRayMode}
          opacity={xRayMode ? 0.8 : 1}
        />
      </mesh>

      {/* Sleeve fins (decorative) - 4 fins around the red sleeve */}
      {!xRayMode && [0, 1, 2, 3].map((i) => (
        <mesh
          key={`fin-${i}`}
          position={[0, sleeveY, 0]}
          rotation={[0, (i * Math.PI) / 2, 0]}
        >
          <boxGeometry args={[config.sleeveDia / 2 + 0.8, config.sleeveLength * 0.8, 0.4]} />
          <meshStandardMaterial color={HARDWARE_COLORS.boltSleeveDark} metalness={0} roughness={0.6} />
        </mesh>
      ))}

      {/* PZ2 Cross slot on top of sleeve (for screwdriver) */}
      {!xRayMode && (
        <group position={[0, sleeveY + config.sleeveLength / 2 - 0.5, 0]}>
          {/* Cross slot - horizontal */}
          <mesh>
            <boxGeometry args={[config.sleeveDia * 0.6, 0.8, 1.5]} />
            <meshStandardMaterial color="#801010" metalness={0} roughness={0.7} />
          </mesh>
          {/* Cross slot - vertical */}
          <mesh>
            <boxGeometry args={[1.5, 0.8, config.sleeveDia * 0.6]} />
            <meshStandardMaterial color="#801010" metalness={0} roughness={0.7} />
          </mesh>
        </group>
      )}

      {/* Top cap ring on sleeve */}
      <mesh position={[0, sleeveY + config.sleeveLength / 2 - 0.3, 0]}>
        <cylinderGeometry args={[config.sleeveDia / 2 + 0.2, config.sleeveDia / 2, 0.6, 24]} />
        <meshStandardMaterial
          color={xRayMode ? HARDWARE_COLORS.xRay : '#f03030'}
          metalness={0}
          roughness={0.4}
          transparent={xRayMode}
          opacity={xRayMode ? 0.8 : 1}
        />
      </mesh>

      {/* Threaded Shaft (ก้านเกลียว) - steel gray */}
      <mesh position={[0, shaftY, 0]}>
        <cylinderGeometry args={[config.shaftDia / 2, config.shaftDia / 2, config.shaftLength, 16]} />
        <meshStandardMaterial
          color={xRayMode ? HARDWARE_COLORS.xRay : '#909090'}
          metalness={xRayMode ? HARDWARE_PBR.xRay.metalness : 0.5}
          roughness={xRayMode ? HARDWARE_PBR.xRay.roughness : 0.35}
          envMapIntensity={xRayMode ? 0 : 0.8}
          transparent={xRayMode}
          opacity={xRayMode ? 0.8 : 1}
        />
      </mesh>

      {/* Thread rings on shaft (visual detail) */}
      {!xRayMode && threadRings.map((offset, idx) => (
        <mesh
          key={idx}
          position={[0, shaftY + config.shaftLength / 2 - offset - 1, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[config.shaftDia / 2 + 0.2, 0.2, 8, 16]} />
          <meshStandardMaterial
            color={HARDWARE_COLORS.boltThread}
            metalness={0.6}
            roughness={0.4}
          />
        </mesh>
      ))}

      {/* Pointed tip at bottom of shaft */}
      <mesh
        position={[0, totalLength / 2 - config.ballHeadDia - config.sleeveLength - config.shaftLength - 1, 0]}
      >
        <coneGeometry args={[config.shaftDia / 2, 2, 16]} />
        <meshStandardMaterial
          color={baseColor}
          metalness={xRayMode ? 0 : HARDWARE_PBR.steel.metalness}
          roughness={xRayMode ? 1 : HARDWARE_PBR.steel.roughness}
          transparent={xRayMode}
          opacity={xRayMode ? 0.8 : 1}
        />
      </mesh>
    </group>
  );
}

// ============================================
// ASSEMBLED MINIFIX 3D (Cam + Bolt as ONE unit)
// ============================================

/**
 * Renders complete Minifix assembly (Cam + Bolt) as ONE unit.
 *
 * This is the correct approach for positioning:
 * - All parts are positioned relative to each other INSIDE this group
 * - The group is placed at the CAM position (panel surface)
 * - No complex offset calculations needed for alignment
 *
 * Based on Preview3D from MinifixConfigPanel.tsx which correctly
 * assembles the Minifix hardware.
 */
interface AssembledMinifix3DProps {
  /** Position of the CAM (where it drills into the horizontal panel) */
  position: [number, number, number];
  /**
   * Rotation of the assembly:
   * - For INSET joint (TOP/BOTTOM connection): Bolt points DOWN/UP
   * - For OVERLAY joint: Bolt points horizontally
   */
  rotation?: [number, number, number];
  /** Configuration from MinifixFullConfig */
  config: {
    camDia: number;
    camDepth: number;
    camHeight: number;
    ballHeadDia: number;
    neckShaftDia: number;
    neckShaftLength: number;
    sleeveDia: number;
    sleeveLength: number;
    shaftDia: number;
    shaftLength: number;
  };
  /** X-Ray mode for transparent rendering */
  xRayMode?: boolean;
  /** Hover state */
  hovered?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Whether bolt points DOWN (true) or UP (false) relative to cam */
  boltPointsDown?: boolean;
  /**
   * Scene mode: When true, no internal rotation is applied (rotation comes from parent).
   * When false (default), applies catalog view rotation for standalone preview.
   */
  sceneMode?: boolean;
}

export function AssembledMinifix3D({
  position,
  rotation = [0, 0, 0],
  config,
  xRayMode = false,
  hovered = false,
  onClick,
  boltPointsDown = true,
  sceneMode = false,
}: AssembledMinifix3DProps) {
  // ========================================
  // PRESENTATION VIEW - Always show correct orientation
  // ========================================
  // For hardware visualization, we IGNORE the drill normal rotation
  // and always show the assembly in "catalog" orientation:
  // - Cam at TOP with PZ2 cross slot visible
  // - Ball head below cam, engaging socket
  // - Bolt shaft extending DOWNWARD
  //
  // This matches Image 1 from user (Häfele catalog style)
  // The rotation prop is NOT applied to maintain consistent viewing

  // Cam dimensions
  const camRadius = config.camDia / 2;
  const camDepth = config.camDepth;

  // Bolt dimensions
  const ballHeadRadius = config.ballHeadDia / 2;
  const neckShaftLength = config.neckShaftLength;
  const sleeveLength = config.sleeveLength;
  const shaftLength = config.shaftLength;

  // Calculate bolt total length (from ball head top to shaft bottom)
  const boltTotalLength = ballHeadRadius + neckShaftLength + sleeveLength + shaftLength;

  // Eccentric socket offset (cam socket is not at center)
  const socketEccentricOffset = 1.5; // 1.5mm typical for Minifix 15

  // ========================================
  // PRESENTATION LAYOUT CALCULATION
  // ========================================
  // Assembly is centered at Y=0 with:
  // - Cam body at TOP (positive Y)
  // - Ball head at CENTER (Y ≈ 0), entering cam socket
  // - Bolt body extending DOWN (negative Y)
  //
  // Key dimensions:
  // - Cam bottom (socket entrance) should be AT or slightly above ball head top
  // - Ball head center is reference point (Y=0)
  // - Bolt extends downward from ball head

  // Gap between components for visual clarity (exploded view effect)
  const visualGap = 2; // 2mm gap for clearer visualization

  // ========================================
  // CAM ORIENTATION (Horizontal - Like Image 2)
  // ========================================
  // The cam cylinder should lie HORIZONTAL with:
  // - Cylinder axis pointing LEFT-RIGHT (X-axis)
  // - Socket opening facing DOWN toward ball head
  // - PZ2 cross slot visible from the side
  //
  // This requires rotating the cam -90° around Z-axis:
  // - Local Y (cylinder axis) → World X (horizontal)
  // - Local X (socket offset) → World -Y (downward)

  // After rotation:
  // - Original X offset (socketEccentricOffset) becomes -Y offset
  // - Socket center will be at (camCenterY - socketEccentricOffset)
  // - We want socket center ALIGNED with ball head center (Y=0)
  //
  // So: camCenterY - socketEccentricOffset = 0 (ball head center)
  //     camCenterY = socketEccentricOffset
  const camCenterY = socketEccentricOffset;

  // Ball head position: centered at Y=0
  // Ball head spans from -ballHeadRadius to +ballHeadRadius
  const ballHeadCenterY = 0;

  // Bolt body position: calculated so ball head is at ballHeadCenterY
  // In S200Bolt3D, ball head is at +Y end of the bolt
  // Ball head local position = boltTotalLength/2 - ballHeadRadius/2
  // To place ball head at world Y=0:
  // boltCenterY + (boltTotalLength/2 - ballHeadRadius/2) = 0
  // boltCenterY = -(boltTotalLength/2 - ballHeadRadius/2)
  const ballHeadLocalOffset = boltTotalLength / 2 - ballHeadRadius / 2;
  const boltCenterY = -ballHeadLocalOffset;

  // Determine rotation based on mode:
  // - sceneMode=true: No internal rotation (rotation comes from parent based on drill normal)
  // - sceneMode=false: Apply 90° CCW rotation for catalog/preview view
  const internalRotation: [number, number, number] = sceneMode
    ? [0, 0, 0]
    : [0, 0, Math.PI / 2];

  // Position offset only needed for catalog view (when rotated)
  const positionOffset: [number, number, number] = sceneMode
    ? [0, 0, 0]
    : [0, -camCenterY, 0];

  return (
    // NOTE: In sceneMode, rotation comes from parent (drill normal)
    // In catalog mode, we apply internal 90° CCW rotation for presentation
    <group position={position} onClick={onClick}>
      <group rotation={internalRotation}>
        {/* Offset to center CAM at origin after rotation (catalog mode only) */}
        <group position={positionOffset}>
          {/* ============================================ */}
          {/* CAM HOUSING - HORIZONTAL orientation */}
          {/* Cylinder axis along X, socket opening faces DOWN toward ball head */}
          {/* ============================================ */}
          <group position={[0, camCenterY, 0]} rotation={[0, 0, -Math.PI / 2]}>
            {/* Main cam body - cylinder centered at this position */}
            <mesh>
              <cylinderGeometry args={[camRadius, camRadius, camDepth, 32]} />
              <meshStandardMaterial
                color={xRayMode ? HARDWARE_COLORS.xRay : HARDWARE_COLORS.camHousing}
                metalness={xRayMode ? 0 : HARDWARE_PBR.zinc.metalness}
                roughness={xRayMode ? 1 : HARDWARE_PBR.zinc.roughness}
                transparent={xRayMode}
                opacity={xRayMode ? 0.7 : 1}
                emissive={hovered ? HARDWARE_COLORS.camHousing : '#000000'}
                emissiveIntensity={hovered ? 0.3 : 0}
              />
            </mesh>

            {/* Eccentric socket (where ball head sits) */}
            <mesh position={[socketEccentricOffset, 0, 0]}>
              <cylinderGeometry args={[ballHeadRadius * 1.1, ballHeadRadius * 1.1, config.camHeight, 24]} />
              <meshStandardMaterial
                color={xRayMode ? HARDWARE_COLORS.xRayDim : HARDWARE_COLORS.camHousingSlot}
                metalness={0.4}
                roughness={0.5}
                transparent={xRayMode}
                opacity={xRayMode ? 0.5 : 1}
              />
            </mesh>

            {/* Rim/flange at top */}
            <mesh position={[0, camDepth / 2 - 1, 0]}>
              <cylinderGeometry args={[camRadius * 1.1, camRadius, 2, 32]} />
              <meshStandardMaterial
                color={xRayMode ? HARDWARE_COLORS.xRay : HARDWARE_COLORS.camHousingHighlight}
                metalness={xRayMode ? 0 : HARDWARE_PBR.zinc.metalness}
                roughness={xRayMode ? 1 : HARDWARE_PBR.zinc.roughness - 0.05}
                transparent={xRayMode}
                opacity={xRayMode ? 0.8 : 1}
              />
            </mesh>

            {/* PZ2 cross slot on top */}
            {!xRayMode && (
              <group position={[0, camDepth / 2 + 0.1, 0]}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <boxGeometry args={[camRadius * 1.2, 1.5, 2]} />
                  <meshStandardMaterial color={HARDWARE_COLORS.camHousingSlot} metalness={0.3} roughness={0.6} />
                </mesh>
                <mesh rotation={[Math.PI / 2, Math.PI / 2, 0]}>
                  <boxGeometry args={[camRadius * 1.2, 1.5, 2]} />
                  <meshStandardMaterial color={HARDWARE_COLORS.camHousingSlot} metalness={0.3} roughness={0.6} />
                </mesh>
              </group>
            )}
          </group>

          {/* ============================================ */}
          {/* S200 BOLT - Below cam, shaft extending DOWN */}
          {/* Ball head centered at X=0, directly below the rotated cam socket */}
          {/* ============================================ */}
          <group position={[0, boltCenterY, 0]}>
            {/* Ball Head (at +Y when upright) */}
            <mesh position={[0, boltTotalLength / 2 - ballHeadRadius / 2, 0]}>
              <sphereGeometry args={[ballHeadRadius, 24, 24]} />
              <meshStandardMaterial
                color={xRayMode ? HARDWARE_COLORS.xRay : '#c0c0c0'}
                metalness={xRayMode ? 0 : 0.6}
                roughness={xRayMode ? 1 : 0.25}
                transparent={xRayMode}
                opacity={xRayMode ? 0.8 : 1}
              />
            </mesh>

            {/* Neck shaft */}
            <mesh position={[0, boltTotalLength / 2 - ballHeadRadius - neckShaftLength / 2, 0]}>
              <cylinderGeometry args={[config.neckShaftDia / 2, config.neckShaftDia / 2, neckShaftLength, 20]} />
              <meshStandardMaterial
                color={xRayMode ? HARDWARE_COLORS.xRay : '#a0a0a0'}
                metalness={xRayMode ? 0 : 0.5}
                roughness={xRayMode ? 1 : 0.3}
                transparent={xRayMode}
                opacity={xRayMode ? 0.8 : 1}
              />
            </mesh>

            {/* Red plastic sleeve */}
            <mesh position={[0, boltTotalLength / 2 - ballHeadRadius - neckShaftLength - sleeveLength / 2, 0]}>
              <cylinderGeometry args={[config.sleeveDia / 2, config.sleeveDia / 2, sleeveLength, 24]} />
              <meshStandardMaterial
                color={xRayMode ? HARDWARE_COLORS.xRay : HARDWARE_COLORS.boltSleeve}
                metalness={0}
                roughness={xRayMode ? 1 : 0.5}
                transparent={xRayMode}
                opacity={xRayMode ? 0.8 : 1}
              />
            </mesh>

            {/* Sleeve fins */}
            {!xRayMode && [0, 1, 2, 3].map((i) => (
              <mesh
                key={`fin-${i}`}
                position={[0, boltTotalLength / 2 - ballHeadRadius - neckShaftLength - sleeveLength / 2, 0]}
                rotation={[0, (i * Math.PI) / 2, 0]}
              >
                <boxGeometry args={[config.sleeveDia / 2 + 0.8, sleeveLength * 0.8, 0.4]} />
                <meshStandardMaterial color={HARDWARE_COLORS.boltSleeveDark} metalness={0} roughness={0.6} />
              </mesh>
            ))}

            {/* Threaded shaft */}
            <mesh position={[0, -boltTotalLength / 2 + shaftLength / 2, 0]}>
              <cylinderGeometry args={[config.shaftDia / 2, config.shaftDia / 2, shaftLength, 16]} />
              <meshStandardMaterial
                color={xRayMode ? HARDWARE_COLORS.xRay : '#909090'}
                metalness={xRayMode ? 0 : 0.5}
                roughness={xRayMode ? 1 : 0.35}
                transparent={xRayMode}
                opacity={xRayMode ? 0.8 : 1}
              />
            </mesh>

            {/* Note: Pointed tip removed - real S200 bolt has flat end */}
          </group>
        </group>
      </group>
    </group>
  );
}

// Legacy Bolt3D - kept for backwards compatibility
interface Bolt3DProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  diameter?: number;
  length?: number;
  headDiameter?: number;
  color?: string;
  xRayMode?: boolean;
  hovered?: boolean;
  onClick?: () => void;
}

/**
 * Legacy 3D Model of Connecting Bolt (use S200Bolt3D for accurate Minifix)
 */
export function Bolt3D({
  position,
  rotation = [0, 0, 0],
  diameter = 6,
  length = 31,
  headDiameter = 10,
  color,
  xRayMode = false,
  hovered = false,
  onClick,
}: Bolt3DProps) {
  // Use S200Bolt3D with custom config for legacy compatibility
  const config: S200BoltConfig = {
    ...DEFAULT_S200_CONFIG,
    shaftDia: diameter,
    shaftLength: length,
    sleeveDia: headDiameter,
  };

  return (
    <S200Bolt3D
      position={position}
      rotation={rotation}
      config={config}
      color={color}
      xRayMode={xRayMode}
      hovered={hovered}
      onClick={onClick}
    />
  );
}

// ============================================
// HARDWARE FROM DRILL POINT
// ============================================

interface HardwareFromPointProps {
  point: DrillMapPoint;
  xRayMode?: boolean;
  hovered?: boolean;
  onClick?: () => void;
  /** Show full 3D hardware or simplified symbol */
  detailed?: boolean;
  /** Hardware configuration from preset (for accurate 3D models) */
  hardwareConfig?: MinifixFullConfig;
}

/**
 * Render appropriate 3D hardware based on drill point data
 *
 * NOTE: This component renders hardware at drill points. For Minifix:
 * - HOUSING (Cam): Renders the complete assembled Minifix (Cam + Bolt as one unit)
 * - BOLT: Skipped (already rendered as part of the assembled Cam)
 * - DOWEL: Rendered only if explicitly enabled in config
 *
 * The assembled approach ensures Cam and Bolt are always perfectly aligned,
 * matching the Preview3D from MinifixConfigPanel.
 */
export function HardwareFromPoint({
  point,
  xRayMode = false,
  hovered = false,
  onClick,
  detailed = true,
  hardwareConfig,
}: HardwareFromPointProps) {
  // Calculate rotation to orient the Minifix assembly correctly
  // The AssembledMinifix3D has bolt extending in -Y direction (downward)
  // We need to rotate so that -Y points in the boltDirection
  //
  // Häfele S200 bolt directions:
  // - INSET: Bolt in SIDE panel, points HORIZONTALLY [±1, 0, 0] toward Top/Bottom
  // - OVERLAY: Bolt in TOP/BOTTOM panel, points VERTICALLY [0, ±1, 0] toward Side
  const rotation = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    let dir: THREE.Vector3;

    // Use boltDirection for BOTH joint types (if available)
    // To make bolt extend toward boltDirection, rotate Y → -boltDirection
    // (because bolt extends in -Y in the assembly)
    if (point.boltDirection) {
      dir = new THREE.Vector3(
        -point.boltDirection[0],
        -point.boltDirection[1],
        -point.boltDirection[2]
      );
    } else {
      // Fallback: use drill normal (legacy behavior)
      dir = new THREE.Vector3(
        point.normal[0],
        point.normal[1],
        point.normal[2]
      );
    }

    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    return [euler.x, euler.y, euler.z] as [number, number, number];
  }, [point.normal, point.boltDirection]);

  // Determine hardware type
  const componentType = point.componentType || 'OTHER';
  const purpose = point.purpose;

  // Calculate normal vector for offset calculations
  const normal = new THREE.Vector3(point.normal[0], point.normal[1], point.normal[2]);

  // ============================================
  // HOUSING (CAM) - Render CAM housing only
  // ============================================
  // CAM is rendered at its drill point position
  // Bolt is rendered separately from BOLT drill point
  // This matches Gate validation geometry (A, B, C, axis)
  // ============================================
  if (componentType === 'HOUSING' || purpose === 'CAM_LOCK') {
    // Dimensions
    const CAM_DIA = S200_SPECS.camDiameter;      // 15mm
    const CAM_DEPTH = hardwareConfig?.camDepth || S200_SPECS.camDepth; // 13.5mm for 18mm wood

    // Material props
    const opacity = xRayMode ? 0.6 : 1.0;
    const transparent = opacity < 1;

    // CAM rotation: cylinder axis along drill normal
    // CylinderGeometry has Y-up local axis, rotate to align with drill normal
    const camUp = new THREE.Vector3(0, 1, 0);
    const camDir = new THREE.Vector3(point.normal[0], point.normal[1], point.normal[2]);
    const camQuaternion = new THREE.Quaternion().setFromUnitVectors(camUp, camDir);
    const camEuler = new THREE.Euler().setFromQuaternion(camQuaternion);
    const camRotation: [number, number, number] = [camEuler.x, camEuler.y, camEuler.z];

    // CAM position offset: drill point is at panel surface, cam center is at depth/2
    const camCenterOffset: [number, number, number] = [
      point.normal[0] * (CAM_DEPTH / 2),
      point.normal[1] * (CAM_DEPTH / 2),
      point.normal[2] * (CAM_DEPTH / 2),
    ];

    return (
      <group onClick={onClick} position={camCenterOffset}>
        {/* ─── CAM Housing ─── */}
        <mesh rotation={camRotation}>
          <cylinderGeometry args={[CAM_DIA / 2, CAM_DIA / 2, CAM_DEPTH, 32]} />
          <meshStandardMaterial
            color={HARDWARE_COLORS.camHousing}
            transparent={transparent}
            opacity={opacity}
            metalness={HARDWARE_PBR.zinc.metalness}
            roughness={HARDWARE_PBR.zinc.roughness}
          />
        </mesh>

        {/* CAM cross slot (PZ2) - on top of CAM */}
        <group rotation={camRotation}>
          <mesh position={[0, CAM_DEPTH / 2 + 0.5, 0]}>
            <boxGeometry args={[8, 1, 1.5]} />
            <meshStandardMaterial color={HARDWARE_COLORS.camHousingSlot} />
          </mesh>
          <mesh position={[0, CAM_DEPTH / 2 + 0.5, 0]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[8, 1, 1.5]} />
            <meshStandardMaterial color={HARDWARE_COLORS.camHousingSlot} />
          </mesh>
        </group>

        {/* Rim/flange */}
        <mesh rotation={camRotation} position={[0, 0, 0]}>
          <cylinderGeometry args={[CAM_DIA / 2 * 1.1, CAM_DIA / 2, 2, 32]} />
          <meshStandardMaterial
            color={HARDWARE_COLORS.camHousingHighlight}
            transparent={transparent}
            opacity={opacity}
            metalness={HARDWARE_PBR.zinc.metalness}
            roughness={HARDWARE_PBR.zinc.roughness - 0.05}
          />
        </mesh>
      </group>
    );
  }

  // ============================================
  // BOLT - Render bolt at drill point A, ball head toward cam (B ≈ C)
  // ============================================
  // Matches Gate validation geometry:
  // - A = bolt drill origin (edge surface) = point.position
  // - B = ball center (should be at cam pocket center C)
  // - axis = direction from A to C (boltDirection)
  // Uses buildBoltMeshFrame() for consistent truth-chain positioning
  //
  // FIN ROTATION FIX (v1.2):
  // Previously used Euler addition: `rotation={[..., boltRotation[1] + (i * Math.PI) / 2, ...]}`
  // This is WRONG - adding to Euler Y component doesn't rotate around bolt local axis
  // after the bolt has been rotated by quaternion.
  //
  // FIX: Use quaternion for base rotation, then local Euler for fin spin.
  // Structure: <group quaternion={boltQuat}> → fins with rotation={[0, i*π/2, 0]}
  // ============================================
  if (componentType === 'BOLT') {
    // S200 Bolt dimensions (from Häfele catalog)
    const BALL_HEAD_RADIUS = 3.75;   // Ø7.5mm / 2
    const SLEEVE_DIA = 10;           // Ø10mm sleeve
    const NECK_DIA = 6.5;            // Ø6.5mm neck
    const NECK_LENGTH = 6.5;         // Steel neck shaft length
    const SLEEVE_LENGTH = 17.5;      // Red plastic sleeve length
    const SHAFT_DIA = 5;             // Thread diameter
    const L = hardwareConfig?.shaftLength || 11; // Thread length into panel

    // Build frame using truth-chain helper
    const frame = buildBoltMeshFrame({
      point,
      hardwareConfig,
      BALL_HEAD_RADIUS,
      NECK_LENGTH,
      SLEEVE_LENGTH,
      L,
    });

    const { axis, ballPos, neckPos, sleevePos, threadPos, debug } = frame;

    // Get twist angle from drill point (computed by boltOrientationPolicy)
    const twistDeg = point.boltTwistDeg ?? 0;

    // ============================================
    // QUATERNION-BASED ROTATION (v1.4 - world-axis twist)
    // ============================================
    // CRITICAL FIX: Twist must be around WORLD bolt axis, not local Y!
    //
    // Policy computes twist using signedAngleAroundAxis(..., axis=boltDirWorld).
    // To match this, renderer must also twist around boltDir in world space.
    //
    // ORDER: finalQuat = twistWorld * baseQuat
    //   - baseQuat aligns model +Y → boltDir
    //   - twistWorld rotates around boltDir (world axis)
    //   - Pre-multiply (twist * base) applies twist AFTER base alignment in world frame
    //
    const boltQuat = useMemo(() => {
      const up = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();

      // Base alignment: MODEL_UP → boltDir
      const baseQuat = new THREE.Quaternion().setFromUnitVectors(up, dir);

      // Twist around WORLD bolt axis (matches policy's signedAngleAroundAxis)
      if (Math.abs(twistDeg) > 0.001) {
        const twistRad = THREE.MathUtils.degToRad(twistDeg);

        // Rotate around the actual bolt direction in world space
        const twistWorld = new THREE.Quaternion().setFromAxisAngle(dir, twistRad);

        // Pre-multiply: twist applied after base alignment in world frame
        // finalQuat = twistWorld * baseQuat
        return twistWorld.multiply(baseQuat);
      }

      return baseQuat;
    }, [axis, twistDeg]);

    // For parts that don't need fin rotation (sleeve body, neck, thread),
    // we still need Euler for the rotation prop
    const boltRotation = useMemo(() => {
      const euler = new THREE.Euler().setFromQuaternion(boltQuat);
      return [euler.x, euler.y, euler.z] as [number, number, number];
    }, [boltQuat]);

    // Material props
    const opacity = xRayMode ? 0.7 : 1.0;
    const transparent = opacity < 1;

    // Debug overlay flag (show A→C line in X-Ray mode)
    const debugMinifix = xRayMode;

    return (
      <group onClick={onClick}>
        {/* ─── X-Ray Debug Overlay ─── */}
        {debugMinifix && (
          <group>
            {/* A marker (origin = bolt drill point) */}
            <mesh position={[0, 0, 0]}>
              <sphereGeometry args={[1.2, 10, 8]} />
              <meshBasicMaterial color="#00ffff" />
            </mesh>

            {/* C marker (ballPos = cam pocket center) */}
            <mesh position={ballPos}>
              <sphereGeometry args={[1.2, 10, 8]} />
              <meshBasicMaterial color="#ff00ff" />
            </mesh>

            {/* A → C line */}
            <Line
              points={[
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(ballPos[0], ballPos[1], ballPos[2]),
              ]}
              lineWidth={2}
              color="#ffffff"
              transparent
              opacity={0.9}
            />

            {/* Debug info (optional - shows hasTarget status) */}
            {debug.hasTarget && (
              <mesh position={[ballPos[0], ballPos[1] + 5, ballPos[2]]}>
                <sphereGeometry args={[0.8, 8, 6]} />
                <meshBasicMaterial color="#00ff00" />
              </mesh>
            )}
          </group>
        )}

        {/* ─── Bolt Thread (L) ─── */}
        {/* Inside panel - threaded shaft */}
        <mesh position={threadPos} rotation={boltRotation}>
          <cylinderGeometry args={[SHAFT_DIA / 2, SHAFT_DIA / 2, L, 12]} />
          <meshStandardMaterial
            color={HARDWARE_COLORS.boltThread}
            transparent={transparent}
            opacity={opacity}
            metalness={HARDWARE_PBR.steel.metalness}
            roughness={HARDWARE_PBR.steel.roughness}
          />
        </mesh>

        {/* ─── Red Sleeve with Fins ─── */}
        {/*
         * FIN ROTATION FIX: Use group with quaternion for base rotation,
         * then fins as children with LOCAL rotation around Y axis.
         * This ensures fins rotate around the bolt's local axis, not world Y.
         */}
        <group position={sleevePos} quaternion={boltQuat}>
          {/* Sleeve body (no rotation needed - parent group handles it) */}
          <mesh>
            <cylinderGeometry args={[SLEEVE_DIA / 2, SLEEVE_DIA / 2, SLEEVE_LENGTH, 24]} />
            <meshStandardMaterial
              color={HARDWARE_COLORS.boltSleeve}
              transparent={transparent}
              opacity={opacity}
              metalness={0}
              roughness={0.5}
            />
          </mesh>

          {/* Sleeve fins - LOCAL rotation around Y (bolt local axis) */}
          {!xRayMode && [0, 1, 2, 3].map((i) => (
            <mesh
              key={`fin-${i}`}
              rotation={[0, (i * Math.PI) / 2, 0]}
            >
              <boxGeometry args={[SLEEVE_DIA / 2 + 0.8, SLEEVE_LENGTH * 0.8, 0.4]} />
              <meshStandardMaterial color={HARDWARE_COLORS.boltSleeveDark} metalness={0} roughness={0.6} />
            </mesh>
          ))}
        </group>

        {/* ─── Neck Shaft ─── */}
        {/* Steel shaft between sleeve and ball head */}
        <mesh position={neckPos} rotation={boltRotation}>
          <cylinderGeometry args={[NECK_DIA / 2, NECK_DIA / 2, NECK_LENGTH, 16]} />
          <meshStandardMaterial
            color="#a0a0a0"
            transparent={transparent}
            opacity={opacity}
            metalness={0.5}
            roughness={0.3}
          />
        </mesh>

        {/* ─── Ball Head ─── */}
        {/* Chrome steel sphere - engages cam socket */}
        <mesh position={ballPos}>
          <sphereGeometry args={[BALL_HEAD_RADIUS, 16, 12]} />
          <meshStandardMaterial
            color="#c0c0c0"
            transparent={transparent}
            opacity={opacity}
            metalness={0.6}
            roughness={0.25}
          />
        </mesh>
      </group>
    );
  }

  // ============================================
  // DOWEL
  // ============================================
  if (componentType === 'DOWEL' || purpose === 'DOWEL') {
    // Only show DOWELs if explicitly enabled via includeDowel
    // Otherwise return null (don't render anything)
    if (!hardwareConfig || hardwareConfig.includeDowel !== true) {
      return null;
    }

    // Center the dowel at the joint (half in each panel)
    // Use hardwareConfig values if available, otherwise use defaults
    const dowelLength = hardwareConfig?.dowelLength || 30;
    const dowelDiameter = hardwareConfig?.dowelDia || point.diameter;
    const offset: [number, number, number] = [
      normal.x * (dowelLength / 4),
      normal.y * (dowelLength / 4),
      normal.z * (dowelLength / 4),
    ];

    return (
      <Dowel3D
        position={offset}
        rotation={rotation}
        diameter={dowelDiameter}
        length={dowelLength}
        xRayMode={xRayMode}
        hovered={hovered}
        onClick={onClick}
      />
    );
  }

  // ============================================
  // DEFAULT: Simple cylinder for unknown types
  // ============================================
  return (
    <mesh position={[0, 0, 0]}>
      <cylinderGeometry args={[point.diameter / 2, point.diameter / 2, point.depth, 16]} />
      <meshStandardMaterial
        color={xRayMode ? HARDWARE_COLORS.xRay : '#888888'}
        transparent
        opacity={0.7}
      />
    </mesh>
  );
}

// ============================================
// CONNECTOR PLATE (Wooden Spacer for Overlay↔Inset)
// ============================================

export interface ConnectorPlateConfig {
  thickness: number;      // mm (default: 12)
  width: number;          // mm (default: 60)
  length: number;         // mm (default: 120)
  housingHoleDia: number; // mm (default: 15 for Minifix 15)
  boltHoleDia: number;    // mm (default: 10 for S200 sleeve)
  dowelHoleDia: number;   // mm (default: 8)
  holeSpacing: number;    // mm (default: 32 - System 32)
  includeDowelHoles: boolean;
}

export const DEFAULT_PLATE_CONFIG: ConnectorPlateConfig = {
  thickness: 12,
  width: 60,
  length: 120,
  housingHoleDia: 15,
  boltHoleDia: 10,
  dowelHoleDia: 8,
  holeSpacing: 32,
  includeDowelHoles: true,
};

interface ConnectorPlate3DProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  config?: Partial<ConnectorPlateConfig>;
  xRayMode?: boolean;
  hovered?: boolean;
  showDimensions?: boolean;
  onClick?: () => void;
}

/**
 * 3D Model of Wooden Connector Plate (Spacer)
 *
 * Used for overlay↔inset joints where a wooden plate
 * bridges between the cam housing and bolt panels.
 *
 * Features:
 * - Rectangular wooden plate
 * - Housing hole (Ø15) for cam
 * - Bolt hole (Ø10) for sleeve passage
 * - Optional dowel holes (Ø8)
 */
export function ConnectorPlate3D({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  config = {},
  xRayMode = false,
  hovered = false,
  showDimensions = false,
  onClick,
}: ConnectorPlate3DProps) {
  const cfg = { ...DEFAULT_PLATE_CONFIG, ...config };
  const { thickness, width, length, housingHoleDia, boltHoleDia, dowelHoleDia, holeSpacing, includeDowelHoles } = cfg;

  // Wood color
  const woodColor = xRayMode ? HARDWARE_COLORS.xRay : '#d4a574'; // Light oak
  const holeColor = xRayMode ? HARDWARE_COLORS.xRayDim : '#8b6914';

  const eulerRotation = useMemo(() => {
    return new THREE.Euler(rotation[0], rotation[1], rotation[2]);
  }, [rotation]);

  // Create hole geometry using CSG-like approach with ring visualization
  const housingHoleRadius = housingHoleDia / 2;
  const boltHoleRadius = boltHoleDia / 2;
  const dowelHoleRadius = dowelHoleDia / 2;

  return (
    <group position={position} rotation={eulerRotation}>
      {/* Main plate body */}
      <mesh onClick={onClick}>
        <boxGeometry args={[length, thickness, width]} />
        <meshStandardMaterial
          color={woodColor}
          metalness={xRayMode ? 0 : HARDWARE_PBR.wood.metalness}
          roughness={xRayMode ? 1 : HARDWARE_PBR.wood.roughness}
          transparent={xRayMode}
          opacity={xRayMode ? 0.6 : 1}
          emissive={hovered ? woodColor : '#000000'}
          emissiveIntensity={hovered ? 0.2 : 0}
        />
      </mesh>

      {/* Housing hole (center) - visualized as dark cylinder */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[housingHoleRadius, housingHoleRadius, thickness + 0.2, 24]} />
        <meshStandardMaterial
          color={holeColor}
          metalness={0}
          roughness={0.9}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Bolt hole (offset by holeSpacing) */}
      <mesh position={[holeSpacing, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[boltHoleRadius, boltHoleRadius, thickness + 0.2, 24]} />
        <meshStandardMaterial
          color={holeColor}
          metalness={0}
          roughness={0.9}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Optional dowel holes */}
      {includeDowelHoles && (
        <>
          {/* Dowel hole 1 (opposite side of bolt) */}
          <mesh position={[-holeSpacing, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[dowelHoleRadius, dowelHoleRadius, thickness + 0.2, 16]} />
            <meshStandardMaterial
              color={holeColor}
              metalness={0}
              roughness={0.9}
              transparent
              opacity={0.8}
            />
          </mesh>
        </>
      )}

      {/* Hole edge markers - using spheres for consistent visibility from all angles */}
      {/* Spheres render correctly from any camera angle (no edge-on line artifacts) */}
      <mesh position={[0, thickness / 2 + 0.5, 0]}>
        <sphereGeometry args={[housingHoleRadius * 0.15, 8, 6]} />
        <meshBasicMaterial color="#333" />
      </mesh>

      <mesh position={[holeSpacing, thickness / 2 + 0.5, 0]}>
        <sphereGeometry args={[boltHoleRadius * 0.15, 8, 6]} />
        <meshBasicMaterial color="#333" />
      </mesh>

      {/* Dimension labels */}
      {showDimensions && (
        <Html position={[0, thickness + 10, 0]} center style={{ pointerEvents: 'none' }}>
          <div
            style={{
              background: 'rgba(0,0,0,0.8)',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {length}×{width}×{thickness}mm
          </div>
        </Html>
      )}
    </group>
  );
}

// ============================================
// EXPORTS
// ============================================

export default {
  CamHousing3D,
  Dowel3D,
  Bolt3D,
  S200Bolt3D,
  AssembledMinifix3D,
  ConnectorPlate3D,
  HardwareFromPoint,
  HARDWARE_COLORS,
  HARDWARE_PBR,
  DEFAULT_S200_CONFIG,
  S200_CONFIG_B24,
  DEFAULT_PLATE_CONFIG,
};
