/**
 * Post-Processing Module
 *
 * Step 10.5: G-code generation from toolpath plans
 *
 * Exports:
 * - Machine profiles (KDT_MVP, HOMAG_MVP)
 * - Tool table management
 * - G-code writer class
 * - Coordinate transforms
 * - Toolpath compiler
 */

// Machine profiles
export {
  type Units,
  type ToolType,
  type Tool,
  type MachineProfile,
  type MaterialFeedSpeed,
  KDT_MVP_PROFILE,
  HOMAG_MVP_PROFILE,
  DEFAULT_TOOL_TABLE,
  MATERIAL_DEFAULTS,
  getMachineProfile,
  getToolByNumber,
  findToolByDiameter,
  getDefaultToolForOperation,
  calculateFeedRate,
  calculateRpm,
  getMaterialDefaults,
} from './machineProfile.js';

// G-code writer
export {
  type GCodeOptions,
  GCode,
  createGCode,
} from './gcodeWriter.js';

// Transforms
export {
  type Rotation,
  type Point2D,
  type Point3D,
  type PartPlacement,
  type TransformContext,
  type BoundingBox,
  partLocalToSheet,
  partLocalToSheet3D,
  transformDrill,
  transformLine,
  transformPolyline,
  rotatedDimensions,
  createTransformContext,
  boundingBox,
  partBoundingBox,
  optimizeDrillOrder,
  calculateZLevels,
  isThroughCut,
} from './transform.js';

// Compiler
export {
  type CompileOptions,
  type CompileResult,
  type SheetGCode,
  compileSheetToGcode,
  compileToolpathPlan,
  formatCompileSummary,
} from './compiler.js';
