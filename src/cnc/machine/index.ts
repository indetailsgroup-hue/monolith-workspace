/**
 * CNC Machine Module
 *
 * @version 1.0.0 - Phase D1
 */

// Types
export type {
  AxisLimit,
  AxisConfig,
  SpindleConfig,
  ToolType,
  ToolCapability,
  CoordinateSystem,
  MachineId,
  MachineProfile,
} from './machineProfile';

// Helpers
export {
  hasTool,
  getTool,
  getToolByDiameter,
  isWithinAxisLimits,
  isWithinToolDepth,
  getAxisViolation,
} from './machineProfile';

// Presets
export {
  KDT_MACHINE,
  BIESSE_MACHINE,
  MACHINE_PRESETS,
  getMachineProfile,
  getAvailableMachineIds,
  getAllMachinePresets,
} from './presets';
