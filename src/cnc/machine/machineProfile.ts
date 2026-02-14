/**
 * machineProfile.ts - CNC Machine Profile Types
 *
 * Defines machine capabilities, axis limits, spindle config, and tool support.
 * This is the single source of truth for machine constraints.
 *
 * @version 1.0.0 - Phase D1: Machine Profile + Operation Mapping
 */

// ============================================
// AXIS CONFIGURATION
// ============================================

export interface AxisLimit {
  min: number;
  max: number;
}

export interface AxisConfig {
  x: AxisLimit;
  y: AxisLimit;
  z: AxisLimit;
}

// ============================================
// SPINDLE CONFIGURATION
// ============================================

export interface SpindleConfig {
  /** Maximum RPM */
  maxRpm: number;
  /** Minimum RPM */
  minRpm: number;
  /** Default RPM for general operations */
  defaultRpm: number;
}

// ============================================
// TOOL CONFIGURATION
// ============================================

export type ToolType = 'DRILL' | 'BORE' | 'ROUTER' | 'SAW' | 'drill' | 'bore' | 'boring' | 'router' | 'saw';

export interface ToolCapability {
  /** Unique tool identifier */
  toolId: string;
  /** Tool type */
  type: ToolType;
  /** Tool diameter in mm */
  diameter: number;
  /** Maximum cutting depth in mm */
  maxDepth?: number;
  /** Supports peck drilling */
  supportsPeck?: boolean;
  /** Supports boring operations */
  supportsBore?: boolean;
  /** Default feed rate mm/min */
  defaultFeedRate?: number;
  /** Default plunge rate mm/min */
  defaultPlungeRate?: number;
}

// ============================================
// COORDINATE SYSTEM
// ============================================

/**
 * Coordinate system orientation
 * - Y_UP: Standard 3D (Monolith default)
 * - Z_UP: Some CNC machines use Z as vertical
 */
export type CoordinateSystem = 'Y_UP' | 'Z_UP';

// ============================================
// MACHINE PROFILE
// ============================================

export type MachineId = 'KDT' | 'BIESSE' | 'HOMAG' | 'SCM' | 'GENERIC' | (string & {});

export interface MachineProfile {
  /** Machine identifier */
  id: MachineId;
  /** Machine display name */
  name: string;
  /** Machine description */
  description?: string;
  /** Manufacturer */
  manufacturer?: string;
  /** Unit system (always mm for now) */
  units?: 'mm';
  /** Axis travel limits */
  axis?: AxisConfig;
  /** Simplified limits (alternative to axis) */
  limits?: { x: number; y: number; z: number };
  /** Spindle configuration */
  spindle: SpindleConfig;
  /** Available tools */
  tools: ToolCapability[];
  /** Tool table (alias for tools, for compatibility) */
  toolTable?: ToolCapability[];
  /** Safe Z height for rapid moves */
  defaultSafeZ: number;
  /** Coordinate system orientation */
  coordinateSystem?: CoordinateSystem;
  /** G-code dialect */
  dialect?: 'FANUC' | 'HEIDENHAIN' | 'BIESSE' | 'WEEKE';
  /** Supports tool change */
  supportsToolChange?: boolean;
  /** Maximum number of tools in magazine */
  toolMagazineSize?: number;
  /** Controller type (from simplified profiles) */
  controller?: string;
}

/**
 * Strict machine profile with all fields required (for presets/production use).
 */
export interface StrictMachineProfile extends MachineProfile {
  manufacturer: string;
  units: 'mm';
  axis: AxisConfig;
  coordinateSystem: CoordinateSystem;
  dialect: 'FANUC' | 'HEIDENHAIN' | 'BIESSE' | 'WEEKE';
  supportsToolChange: boolean;
  toolMagazineSize: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a tool exists in the machine profile
 */
export function hasTool(machine: MachineProfile, toolId: string): boolean {
  return machine.tools.some((t) => t.toolId === toolId);
}

/**
 * Get tool by ID
 */
export function getTool(machine: MachineProfile, toolId: string): ToolCapability | undefined {
  return machine.tools.find((t) => t.toolId === toolId);
}

/**
 * Get tool by diameter (finds closest match)
 */
export function getToolByDiameter(
  machine: MachineProfile,
  diameter: number,
  type?: ToolType
): ToolCapability | undefined {
  const candidates = machine.tools.filter((t) =>
    type ? t.type === type && t.diameter === diameter : t.diameter === diameter
  );
  return candidates[0];
}

/**
 * Check if position is within machine axis limits
 */
export function isWithinAxisLimits(
  machine: MachineProfile,
  position: { x: number; y: number; z: number }
): boolean {
  const { axis } = machine;
  if (!axis) return true; // No axis limits defined
  return (
    position.x >= axis.x.min &&
    position.x <= axis.x.max &&
    position.y >= axis.y.min &&
    position.y <= axis.y.max &&
    position.z >= axis.z.min &&
    position.z <= axis.z.max
  );
}

/**
 * Check if depth is within tool capability
 */
export function isWithinToolDepth(tool: ToolCapability, depth: number): boolean {
  return tool.maxDepth == null || depth <= tool.maxDepth;
}

/**
 * Get axis violation details
 */
export function getAxisViolation(
  machine: MachineProfile,
  position: { x: number; y: number; z: number }
): string | null {
  const { axis } = machine;
  if (!axis) return null; // No axis limits defined

  if (position.x < axis.x.min || position.x > axis.x.max) {
    return `X axis out of range: ${position.x} (limits: ${axis.x.min}-${axis.x.max})`;
  }
  if (position.y < axis.y.min || position.y > axis.y.max) {
    return `Y axis out of range: ${position.y} (limits: ${axis.y.min}-${axis.y.max})`;
  }
  if (position.z < axis.z.min || position.z > axis.z.max) {
    return `Z axis out of range: ${position.z} (limits: ${axis.z.min}-${axis.z.max})`;
  }

  return null;
}
