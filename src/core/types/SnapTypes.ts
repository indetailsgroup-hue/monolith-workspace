/**
 * SnapTypes.ts - Type definitions for Cabinet Snap System
 *
 * ARCHITECTURE:
 * - Snap ตู้ 2 ใบ = snap จาก "หน้าที่มีความหมายทางช่าง" (anchor planes)
 * - ไม่ใช่ center-to-center แต่เป็น face-to-face
 * - Rigid Snap = เปลี่ยนเฉพาะ transform (ไม่ resize)
 *
 * CONSTANTS:
 * - snapThreshold = 50mm (ระยะดูด)
 * - minGap = 1mm (ระยะประกบขั้นต่ำ)
 * - angleThreshold = 5° (ยอมรับ error การหมุน)
 */

// ============================================
// VECTOR & MATH TYPES
// ============================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Plane {
  origin: Vec3;   // จุดบน plane (world space)
  normal: Vec3;   // normal (world space), ต้อง normalized
}

export interface Transform {
  position: Vec3;
  rotationEuler: Vec3; // radians (x, y, z)
}

export interface AABB {
  min: Vec3;
  max: Vec3;
}

// ============================================
// ANCHOR TYPES
// ============================================

export type AnchorKind =
  | 'FACE_LEFT'
  | 'FACE_RIGHT'
  | 'FACE_BACK'
  | 'FACE_FRONT'
  | 'FACE_TOP'
  | 'FACE_BOTTOM'
  | 'DATUM_WALL'
  | 'DATUM_FLOOR'
  | 'DATUM_CEILING'
  | 'JOINERY_LINE';

export interface AnchorEdge {
  id: string;
  a: Vec3;
  b: Vec3;
}

export interface CabinetAnchor {
  id: string;
  kind: AnchorKind;
  plane: Plane;
  edges?: AnchorEdge[];
  snapPriority: number; // higher = more likely to be chosen
}

// ============================================
// SNAP TYPES
// ============================================

export type SnapType =
  | 'SIDE_JOIN'      // A.RIGHT ↔ B.LEFT or A.LEFT ↔ B.RIGHT
  | 'FLUSH_FRONT'    // A.FRONT ↔ B.FRONT (จัดหน้าเสมอกัน)
  | 'BACK_ALIGN'     // A.BACK ↔ B.BACK
  | 'STACK';         // A.TOP ↔ B.BOTTOM (วางซ้อน)

export type SnapExpectation = 'OPPOSED' | 'ALIGNED';

export interface SnapCompatibilityPair {
  type: SnapType;
  a: AnchorKind;
  b: AnchorKind;
  expected: SnapExpectation; // OPPOSED = normals face opposite, ALIGNED = parallel
  priority: number;
}

export interface SnapConstants {
  snapThresholdMm: number; // 50
  minGapMm: number;        // 1
  angleThresholdDeg: number; // 5
}

export const DEFAULT_SNAP_CONSTANTS: SnapConstants = {
  snapThresholdMm: 50,
  minGapMm: 1,
  angleThresholdDeg: 5,
};

export interface SnapCandidate {
  type: SnapType;
  aCabId: string;
  bCabId: string;
  aAnchorId: string;
  bAnchorId: string;
  aAnchorKind: AnchorKind;
  bAnchorKind: AnchorKind;
  distanceMm: number;
  angleErrorDeg: number;
  score: number;
}

export interface SnapResult {
  candidate: SnapCandidate;
  resolvedTransformB: Transform;
  delta: Vec3;
  isValid: boolean;
  validationErrors: string[];
}

// ============================================
// CABINET INSTANCE (for snap system)
// ============================================

export interface CabinetDimensions {
  width: number;  // mm
  height: number; // mm
  depth: number;  // mm
}

export interface SnapCabinetInstance {
  id: string;
  transform: Transform;
  dimensions: CabinetDimensions;
  anchors: CabinetAnchor[];
  envelope?: AABB; // world-space AABB
}

// ============================================
// ALIGNMENT CONSTRAINTS
// ============================================

export interface SnapAlignment {
  alignTop?: boolean;        // align top edges
  alignBottom?: boolean;     // align bottoms (floor datum)
  alignFrontFlush?: boolean; // front faces flush
  alignBackFlush?: boolean;  // back faces flush
  alignCenterX?: boolean;    // center on X axis
  alignCenterZ?: boolean;    // center on Z axis
}

// ============================================
// FEATURE HISTORY PARAMS
// ============================================

export interface CabinetSnapParams {
  aCabId: string;
  bCabId: string;
  snapType: SnapType;
  aAnchorId: string;
  bAnchorId: string;
  aAnchorKind: AnchorKind;
  bAnchorKind: AnchorKind;

  // Constants used
  snapThresholdMm: number;
  minGapMm: number;
  angleThresholdDeg: number;

  // Result
  resolvedTransformB: Transform;
  delta: Vec3;

  // Alignment applied
  alignment: SnapAlignment;

  // Metadata
  distanceMm: number;
  angleErrorDeg: number;
  score: number;
}

// ============================================
// SNAP MODE
// ============================================

export type SnapMode =
  | 'rigid'           // เปลี่ยน transform อย่างเดียว (default)
  | 'auto_filler'     // สร้าง filler ตาม gap
  | 'resize_bounded'; // ยอมให้ resize ใน min/max

// ============================================
// SNAP STATE
// ============================================

export interface SnapState {
  enabled: boolean;
  mode: SnapMode;
  activeCandidate: SnapCandidate | null;
  previewTransform: Transform | null;
  constants: SnapConstants;
}
