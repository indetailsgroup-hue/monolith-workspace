/**
 * useEnvelopeBuilder.ts - Build Use Envelope OBBs for Doors/Drawers
 *
 * ALGORITHM:
 * - Sample door positions along swing arc (0° to maxOpenDeg)
 * - Sample drawer positions along pull extension (0 to pullOutMm)
 * - Generate OBBs at each sample position
 * - Union of all OBBs = use envelope
 *
 * DETERMINISTIC: Same inputs always produce same OBBs
 */

import type { Vec3 } from '../types/SnapTypes';
import type { OBB } from '../collision/obbTypes';
import type {
  DoorSwingSpec,
  DrawerPullSpec,
  UseEnvelopeShape,
  CabinetTransformInfo,
} from './useEnvelopeTypes';
import { USE_ENVELOPE_DEFAULTS } from '../config/snapClearanceConfig';

// ============================================
// VECTOR UTILITIES
// ============================================

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function mul(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function degToRad(deg: number): number {
  return deg * Math.PI / 180;
}

// ============================================
// RODRIGUES ROTATION
// ============================================

/**
 * Rotate vector around an axis using Rodrigues' rotation formula
 *
 * @param v - Vector to rotate
 * @param axisUnit - Unit axis of rotation
 * @param angleRad - Angle in radians
 */
function rotateAroundAxis(v: Vec3, axisUnit: Vec3, angleRad: number): Vec3 {
  const a = normalize(axisUnit);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  // v * cos(θ) + (a × v) * sin(θ) + a * (a · v) * (1 - cos(θ))
  const cross: Vec3 = {
    x: a.y * v.z - a.z * v.y,
    y: a.z * v.x - a.x * v.z,
    z: a.x * v.y - a.y * v.x,
  };

  const dot = a.x * v.x + a.y * v.y + a.z * v.z;

  return {
    x: v.x * cos + cross.x * sin + a.x * dot * (1 - cos),
    y: v.y * cos + cross.y * sin + a.y * dot * (1 - cos),
    z: v.z * cos + cross.z * sin + a.z * dot * (1 - cos),
  };
}

// ============================================
// COORDINATE TRANSFORMS
// ============================================

/**
 * Convert local point to world space
 */
function localToWorld(pLocal: Vec3, t: CabinetTransformInfo): Vec3 {
  // pWorld = origin + axisX * pLocal.x + axisY * pLocal.y + axisZ * pLocal.z
  return add(
    add(
      add(t.positionWorld, mul(t.axes.axisX, pLocal.x)),
      mul(t.axes.axisY, pLocal.y)
    ),
    mul(t.axes.axisZ, pLocal.z)
  );
}

/**
 * Transform local direction to world space
 */
function localDirToWorld(dirLocal: Vec3, t: CabinetTransformInfo): Vec3 {
  return normalize({
    x: t.axes.axisX.x * dirLocal.x + t.axes.axisY.x * dirLocal.y + t.axes.axisZ.x * dirLocal.z,
    y: t.axes.axisX.y * dirLocal.x + t.axes.axisY.y * dirLocal.y + t.axes.axisZ.y * dirLocal.z,
    z: t.axes.axisX.z * dirLocal.x + t.axes.axisY.z * dirLocal.y + t.axes.axisZ.z * dirLocal.z,
  });
}

// ============================================
// DOOR SWING ENVELOPE
// ============================================

/**
 * Generate OBB for door at a specific swing angle
 *
 * @param spec - Door swing specification
 * @param t - Cabinet transform
 * @param angleDeg - Current swing angle in degrees
 */
function doorObbAtAngle(
  spec: DoorSwingSpec,
  t: CabinetTransformInfo,
  angleDeg: number
): OBB {
  const angleRad = degToRad(angleDeg);

  // Hinge axis is cabinet's Y axis (vertical)
  const hingeAxisW = t.axes.axisY;

  // Door initial orientation (when closed):
  // - Width along cabinet X
  // - Height along cabinet Y
  // - Thickness along cabinet Z (front)

  // Rotate X and Z axes around hinge axis
  const x0 = t.axes.axisX;
  const z0 = t.axes.axisZ;

  const xRotated = rotateAroundAxis(x0, hingeAxisW, angleRad);
  const zRotated = rotateAroundAxis(z0, hingeAxisW, angleRad);

  // Door extends away from hinge
  // LEFT hinge: door extends in +X direction
  // RIGHT hinge: door extends in -X direction
  const widthDir = spec.hingeSide === 'LEFT' ? xRotated : mul(xRotated, -1);

  // Calculate door center in world space
  // Door center = pivot + half width along widthDir + half height along Y + half thickness along Z
  const pivotWorld = localToWorld(spec.pivotLocal, t);

  const centerW = add(
    add(
      add(pivotWorld, mul(widthDir, spec.doorWidth / 2)),
      mul(t.axes.axisY, spec.doorHeight / 2)
    ),
    mul(zRotated, spec.doorThickness / 2)
  );

  return {
    center: centerW,
    axisX: xRotated,
    axisY: t.axes.axisY,
    axisZ: zRotated,
    halfSize: {
      x: spec.doorWidth / 2,
      y: spec.doorHeight / 2,
      z: spec.doorThickness / 2,
    },
  };
}

/**
 * Build use envelope for doors
 *
 * @param doors - Door swing specifications
 * @param t - Cabinet transform
 * @returns UseEnvelopeShape with sampled OBBs
 */
export function buildDoorUseEnvelope(
  doors: DoorSwingSpec[],
  t: CabinetTransformInfo
): UseEnvelopeShape {
  const obbs: OBB[] = [];

  for (const door of doors) {
    const samples = door.sampleCount ?? USE_ENVELOPE_DEFAULTS.doorSampleCount;
    const maxAngle = door.maxOpenDeg ?? USE_ENVELOPE_DEFAULTS.doorMaxOpenDeg;

    // Sample from 0° to maxOpenDeg
    for (let i = 0; i <= samples; i++) {
      const angle = (maxAngle * i) / samples;
      obbs.push(doorObbAtAngle(door, t, angle));
    }
  }

  return { obbs };
}

// ============================================
// DRAWER PULL ENVELOPE
// ============================================

/**
 * Generate OBB for drawer at a specific extension
 *
 * @param spec - Drawer pull specification
 * @param t - Cabinet transform
 * @param extensionMm - Current extension distance (mm)
 */
function drawerObbAtExtension(
  spec: DrawerPullSpec,
  t: CabinetTransformInfo,
  extensionMm: number
): OBB {
  // Get pull direction in world space
  const dirW = localDirToWorld(spec.pullDirectionLocal, t);

  // Calculate front center at this extension
  const center0 = localToWorld(spec.frontCenterLocal, t);
  const centerW = add(center0, mul(dirW, extensionMm));

  return {
    center: centerW,
    axisX: t.axes.axisX,
    axisY: t.axes.axisY,
    axisZ: t.axes.axisZ,
    halfSize: {
      x: spec.frontWidth / 2,
      y: spec.frontHeight / 2,
      z: spec.frontThickness / 2,
    },
  };
}

/**
 * Build use envelope for drawers
 *
 * @param drawers - Drawer pull specifications
 * @param t - Cabinet transform
 * @returns UseEnvelopeShape with sampled OBBs
 */
export function buildDrawerUseEnvelope(
  drawers: DrawerPullSpec[],
  t: CabinetTransformInfo
): UseEnvelopeShape {
  const obbs: OBB[] = [];

  for (const drawer of drawers) {
    const samples = drawer.sampleCount ?? USE_ENVELOPE_DEFAULTS.drawerSampleCount;

    // Sample from 0 to full extension
    for (let i = 0; i <= samples; i++) {
      const ext = (drawer.pullOutMm * i) / samples;
      obbs.push(drawerObbAtExtension(drawer, t, ext));
    }
  }

  return { obbs };
}

// ============================================
// COMBINED ENVELOPE
// ============================================

/**
 * Build complete use envelope for cabinet (doors + drawers)
 *
 * @param doors - Door swing specifications (optional)
 * @param drawers - Drawer pull specifications (optional)
 * @param t - Cabinet transform
 * @returns Combined use envelope
 */
export function buildCabinetUseEnvelope(
  doors: DoorSwingSpec[] | undefined,
  drawers: DrawerPullSpec[] | undefined,
  t: CabinetTransformInfo
): UseEnvelopeShape {
  const obbs: OBB[] = [];

  if (doors && doors.length > 0) {
    const doorEnv = buildDoorUseEnvelope(doors, t);
    obbs.push(...doorEnv.obbs);
  }

  if (drawers && drawers.length > 0) {
    const drawerEnv = buildDrawerUseEnvelope(drawers, t);
    obbs.push(...drawerEnv.obbs);
  }

  return { obbs };
}

// ============================================
// TRANSFORM HELPERS
// ============================================

/**
 * Create CabinetTransformInfo from center position and Y rotation
 *
 * @param centerPos - Cabinet center position in world (mm)
 * @param rotationY - Y-axis rotation in radians
 */
export function createCabinetTransform(
  centerPos: Vec3,
  rotationY: number = 0
): CabinetTransformInfo {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);

  return {
    positionWorld: centerPos,
    axes: {
      axisX: { x: cos, y: 0, z: -sin },
      axisY: { x: 0, y: 1, z: 0 },
      axisZ: { x: sin, y: 0, z: cos },
    },
  };
}
