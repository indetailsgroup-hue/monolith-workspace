/**
 * emit/index.ts - G-code Emit Module Exports
 *
 * @version 1.0.0 - Phase D2
 */

export { GcodeBuilder, formatCoord, calculateMoveTime, distance3D } from './gcodeBuilder';
export type { GcodeBuilderOptions } from './gcodeBuilder';

export {
  formatNumber,
  formatRelative,
  formatFeedRate,
  formatRpm,
  formatTool,
  sanitizeComment,
  formatProgramName,
  formatTimestamp,
  buildMoveCommand,
  buildDrillCycle,
  buildPeckCycle,
  buildBoreCycle,
} from './format';
