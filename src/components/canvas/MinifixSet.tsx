/**
 * MinifixSet Component - Häfele S200 Connecting Bolt + CAM Assembly
 *
 * Based on Häfele S200 specifications:
 * - L (Thread Length): 8.5mm or 11mm - screws into FACE of one panel
 * - B (Drilling Dim): 24mm or 34mm - distance to CAM center in other panel
 *
 * CRITICAL: Origin (0,0,0) = Joint seam between two panels
 * - Thread (L) extends in +Y direction (into "main" panel)
 * - Shaft (B) extends in -Y direction (into "secondary" panel)
 * - CAM Housing is at position Y = -B
 */

import React from 'react';
import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Häfele S200 Specifications
// ─────────────────────────────────────────────────────────────────────────────

export const S200_SPECS = {
  // Thread lengths (L) - based on wood thickness
  threadLength: {
    '8.5': 8.5,   // For thinner wood
    '11': 11,     // Standard for 18mm wood
  },
  // Drilling dimensions (B) - distance to CAM center
  drillingDim: {
    '24': 24,     // Compact
    '34': 34,     // Standard (stronger)
  },
  // Physical dimensions
  shaftDiameter: 5,       // Ø5mm shaft
  boltHeadDiameter: 6.5,  // Ø6.5mm head (per Häfele catalog)
  camDiameter: 15,        // Ø15mm CAM housing
  camDepth: 13.5,         // CAM housing depth for 18mm wood (default)
  threadDiameter: 7.5,    // Ø7.5mm threaded section
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Props Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface MinifixSetProps {
  /** World position of the joint seam */
  position: [number, number, number];
  /** Rotation to orient the bolt axis */
  rotation: [number, number, number];
  /** Thread length L (mm) - Default 11mm for 18mm wood */
  L?: number;
  /** Drilling dimension B (mm) - Default 34mm */
  B?: number;
  /** Show debug labels */
  showLabel?: boolean;
  /** Opacity for visualization */
  opacity?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const MinifixSet: React.FC<MinifixSetProps> = ({
  position,
  rotation,
  L = S200_SPECS.threadLength['11'],  // Default: 11mm for 18mm wood
  B = S200_SPECS.drillingDim['24'],   // Default: 24mm (Indetails standard)
  showLabel = false,
  opacity = 1.0,
}) => {
  const SHAFT_DIA = S200_SPECS.shaftDiameter;
  const THREAD_DIA = S200_SPECS.threadDiameter;
  const HEAD_DIA = S200_SPECS.boltHeadDiameter;
  const CAM_DIA = S200_SPECS.camDiameter;
  const CAM_DEPTH = S200_SPECS.camDepth;

  return (
    <group position={position} rotation={rotation}>
      {/* ─── จุด Origin (0,0,0) = รอยต่อไม้ (Joint Seam) ─── */}

      {/* 1. ส่วนเกลียว (Thread L) - กินเข้าไปในไม้แผ่นที่ 1 (ทิศทาง +Y) */}
      <mesh position={[0, L / 2, 0]}>
        <cylinderGeometry args={[THREAD_DIA / 2, THREAD_DIA / 2, L, 12]} />
        <meshStandardMaterial
          color="#4a4a4a"
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>

      {/* 2. แหวนหยุด (Stop Ring) - อยู่ตรงรอยต่อพอดี */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[4, 4, 1, 12]} />
        <meshStandardMaterial
          color="#666666"
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>

      {/* 3. ส่วนก้าน (Shaft B) - กินเข้าไปในไม้แผ่นที่ 2 (ทิศทาง -Y) */}
      <mesh position={[0, -B / 2, 0]}>
        <cylinderGeometry args={[SHAFT_DIA / 2, SHAFT_DIA / 2, B, 12]} />
        <meshStandardMaterial
          color="#C0C0C0"
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>

      {/* 4. หัว Bolt (Head) - อยู่ที่ปลายก้าน */}
      <mesh position={[0, -B + 2, 0]}>
        <sphereGeometry args={[HEAD_DIA / 2, 12, 8]} />
        <meshStandardMaterial
          color="#A0A0A0"
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>

      {/* 5. ตัวเบ้า CAM (Housing) - อยู่ที่ระยะ -B, หมุน 90° เพื่อให้หันเข้าหา bolt head */}
      <group position={[0, -B, 0]} rotation={[Math.PI / 2, 0, 0]}>
        {/* CAM body */}
        <mesh>
          <cylinderGeometry args={[CAM_DIA / 2, CAM_DIA / 2, CAM_DEPTH, 32]} />
          <meshStandardMaterial
            color="#A9A9A9"
            transparent={opacity < 1}
            opacity={opacity}
          />
        </mesh>
        {/* CAM slot (cross on top) */}
        <mesh position={[0, CAM_DEPTH / 2 + 0.1, 0]}>
          <boxGeometry args={[8, 1, 1]} />
          <meshStandardMaterial color="#333333" />
        </mesh>
        <mesh position={[0, CAM_DEPTH / 2 + 0.1, 0]} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[8, 1, 1]} />
          <meshStandardMaterial color="#333333" />
        </mesh>
      </group>

      {/* Debug marker at origin */}
      {showLabel && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[2, 8, 8]} />
          <meshBasicMaterial color="#ff0000" wireframe />
        </mesh>
      )}
    </group>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Calculate Minifix placement for different joint types
// ─────────────────────────────────────────────────────────────────────────────

export interface MinifixPlacementParams {
  jointType: 'OVERLAY' | 'INSET';
  position: 'TOP' | 'BOTTOM';
  side: 'left' | 'right';
  /** Cabinet dimensions */
  cabinetWidth: number;
  cabinetHeight: number;
  cabinetDepth: number;
  /** Panel thickness */
  thickness: number;
  /** Toe kick height (for bottom joints) */
  toeKickHeight?: number;
  /** Häfele spec values */
  L?: number;
  B?: number;
}

export interface MinifixPlacement {
  position: [number, number, number];
  rotation: [number, number, number];
  L: number;
  B: number;
}

/**
 * Calculate Minifix placement based on joint configuration
 *
 * CRITICAL LOGIC:
 * - OVERLAY: Thread (L) goes into horizontal panel FACE, CAM (B) in vertical panel EDGE
 * - INSET: Thread (L) goes into vertical panel FACE, CAM (B) in horizontal panel EDGE
 */
export function calculateMinifixPlacement(params: MinifixPlacementParams): MinifixPlacement[] {
  const {
    jointType,
    position,
    side,
    cabinetWidth: W,
    cabinetHeight: H,
    cabinetDepth: D,
    thickness: t,
    toeKickHeight = 0,
    L = S200_SPECS.threadLength['11'],
    B = S200_SPECS.drillingDim['24'],  // Indetails standard: 24mm
  } = params;

  const placements: MinifixPlacement[] = [];

  // Z positions along depth (front and back setbacks)
  const Z_OFFSET = 50;
  const zPositions = [Z_OFFSET, D - Z_OFFSET];

  // Determine joint Y position
  const isTop = position === 'TOP';
  const baseY = isTop ? H : toeKickHeight;

  for (const z of zPositions) {
    let pos: [number, number, number];
    let rot: [number, number, number];

    if (jointType === 'OVERLAY') {
      // OVERLAY: Thread (L) into horizontal panel, CAM (B) into vertical panel edge
      // Joint seam is at the face of horizontal panel meeting vertical panel's edge

      if (isTop) {
        // Top OVERLAY: joint at Y = H - t (bottom face of Top panel)
        const jointY = H - t;

        if (side === 'left') {
          // Position at center of Side panel thickness
          pos = [t / 2, jointY, z];
          // Rotation: +Y up (thread into Top), -Y down (CAM into Side's top edge)
          rot = [0, 0, 0];
        } else {
          pos = [W - t / 2, jointY, z];
          rot = [0, 0, 0];
        }
      } else {
        // Bottom OVERLAY: joint at Y = toeKickHeight + t (top face of Bottom panel)
        const jointY = toeKickHeight + t;

        if (side === 'left') {
          pos = [t / 2, jointY, z];
          // Rotation: flip 180° so thread goes DOWN into Bottom, CAM goes UP into Side
          rot = [Math.PI, 0, 0];
        } else {
          pos = [W - t / 2, jointY, z];
          rot = [Math.PI, 0, 0];
        }
      }
    } else {
      // INSET: Thread (L) into vertical panel FACE, CAM (B) into horizontal panel EDGE
      // Joint seam is at the inner face of vertical panel

      if (isTop) {
        // Top INSET: joint at inner face of Side panel
        const jointY = H - t / 2; // Center of Top panel thickness

        if (side === 'left') {
          // Joint at X = t (inner surface of left Side)
          pos = [t, jointY, z];
          // Rotate 90° around Z: +Y becomes -X (thread into Side), -Y becomes +X (CAM into Top)
          rot = [0, 0, Math.PI / 2];
        } else {
          // Joint at X = W - t (inner surface of right Side)
          pos = [W - t, jointY, z];
          // Rotate -90° around Z: +Y becomes +X (thread into Side), -Y becomes -X (CAM into Top)
          rot = [0, 0, -Math.PI / 2];
        }
      } else {
        // Bottom INSET: joint at inner face of Side panel
        const jointY = toeKickHeight + t / 2;

        if (side === 'left') {
          pos = [t, jointY, z];
          rot = [0, 0, Math.PI / 2];
        } else {
          pos = [W - t, jointY, z];
          rot = [0, 0, -Math.PI / 2];
        }
      }
    }

    placements.push({ position: pos, rotation: rot, L, B });
  }

  return placements;
}

export default MinifixSet;
