/**
 * CNC Operation Module
 *
 * @version 1.0.0 - Phase D1
 */

// Types
export type {
  Position3D,
  BaseOperation,
  DrillOperation,
  BoreOperation,
  PocketOperation,
  ProfileOperation,
  ProfileSide,
  SlotOperation,
  Operation,
  OperationType,
  OperationGraphMetadata,
  OperationGraph,
} from './operationTypes';

// Type Guards
export {
  isDrillOperation,
  isBoreOperation,
  isPocketOperation,
  isProfileOperation,
  isSlotOperation,
} from './operationTypes';

// Helpers
export {
  getToolsUsed,
  groupByTool,
  countByType,
} from './operationTypes';
