/**
 * useEnvelopeTypes.ts - Types for Door/Drawer Use Envelope System
 *
 * ARCHITECTURE:
 * - Models the swept volume when doors/drawers are in use
 * - Used for clearance validation during installation
 * - Ensures cabinets don't block each other when opened
 */

import type { Vec3 } from '../types/SnapTypes';
import type { OBB } from '../collision/obbTypes';

// ============================================
// DOOR SWING TYPES
// ============================================

/**
 * Which side the door hinge is on (when viewed from front)
 */
export type DoorHingeSide = 'LEFT' | 'RIGHT';

/**
 * Door opening mode
 */
export type DoorSwingMode = 'SINGLE_DOOR' | 'DOUBLE_DOOR' | 'BI_FOLD';

/**
 * Door swing specification for use envelope generation
 */
export interface DoorSwingSpec {
  /** Unique door identifier within cabinet */
  doorId: string;

  /** Which side has the hinge */
  hingeSide: DoorHingeSide;

  /** Door swing mode */
  mode?: DoorSwingMode;

  // ============================================
  // GEOMETRY
  // ============================================

  /** Door width (mm) */
  doorWidth: number;

  /** Door height (mm) */
  doorHeight: number;

  /** Door thickness (mm) */
  doorThickness: number;

  // ============================================
  // HINGE PIVOT (Cabinet local space)
  // ============================================

  /**
   * Hinge pivot point in cabinet local space
   * - Typically at front edge, near side panel
   * - Y=0 usually at bottom of door
   */
  pivotLocal: Vec3;

  // ============================================
  // SWING PARAMETERS
  // ============================================

  /** Maximum opening angle in degrees (default: 110°) */
  maxOpenDeg: number;

  /** Number of OBB samples for envelope (default: 8) */
  sampleCount?: number;
}

// ============================================
// DRAWER PULL TYPES
// ============================================

/**
 * Drawer pull-out specification
 */
export interface DrawerPullSpec {
  /** Unique drawer identifier within cabinet */
  drawerId: string;

  // ============================================
  // EXTENSION
  // ============================================

  /** Full extension distance (mm) */
  pullOutMm: number;

  // ============================================
  // FRONT GEOMETRY
  // ============================================

  /** Drawer front width (mm) */
  frontWidth: number;

  /** Drawer front height (mm) */
  frontHeight: number;

  /** Drawer front thickness (mm) */
  frontThickness: number;

  // ============================================
  // POSITION (Cabinet local space)
  // ============================================

  /**
   * Center of drawer front face in cabinet local space
   * - Z typically at front face of cabinet
   */
  frontCenterLocal: Vec3;

  /**
   * Pull direction in cabinet local space
   * - Usually (0, 0, 1) for front-facing drawers
   */
  pullDirectionLocal: Vec3;

  /** Number of OBB samples for envelope (default: 6) */
  sampleCount?: number;
}

// ============================================
// USE ENVELOPE SHAPE
// ============================================

/**
 * Complete use envelope for a cabinet (doors + drawers)
 */
export interface UseEnvelopeShape {
  /** Cabinet ID this envelope belongs to */
  cabinetId?: string;

  /** Envelope OBBs in WORLD space */
  obbs: OBB[];
}

// ============================================
// CABINET LOCAL AXES
// ============================================

/**
 * Cabinet orientation in world space (unit vectors)
 */
export interface CabinetLocalAxes {
  /** Cabinet right direction (+X in local) */
  axisX: Vec3;

  /** Cabinet up direction (+Y in local) */
  axisY: Vec3;

  /** Cabinet front direction (+Z in local) */
  axisZ: Vec3;
}

/**
 * Cabinet transform info for envelope generation
 */
export interface CabinetTransformInfo {
  /** Cabinet origin in world space (local origin point) */
  positionWorld: Vec3;

  /** Cabinet axes in world space (already rotated) */
  axes: CabinetLocalAxes;
}

// ============================================
// CABINET CLEARANCE SPEC
// ============================================

/**
 * Complete clearance specification for a cabinet
 */
export interface CabinetClearanceSpec {
  cabinetId: string;

  /** Door swing specs (optional) */
  doorSpecs?: DoorSwingSpec[];

  /** Drawer pull specs (optional) */
  drawerSpecs?: DrawerPullSpec[];
}
