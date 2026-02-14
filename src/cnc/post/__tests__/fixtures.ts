/**
 * fixtures.ts - Shared Test Fixtures for CNC Post Tests
 *
 * Provides reusable mock objects and helper functions.
 * Reduces duplication across test files.
 *
 * @version 1.0.0
 */

import type { DrillOperation, BoreOperation } from '../../operation/operationTypes';
import type { MachineProfile } from '../../machine/machineProfile';
import type { PanelFrameInfo } from '../types';

// ============================================
// MACHINE PROFILE FIXTURES
// ============================================

/**
 * Standard mock machine profile for testing.
 * Includes common tools: DRILL_5, DRILL_8, BORE_35
 */
export const mockMachine: MachineProfile = {
  id: 'GENERIC',
  name: 'Test Machine',
  manufacturer: 'Test',
  units: 'mm',
  axis: {
    x: { min: 0, max: 3000 },
    y: { min: 0, max: 1500 },
    z: { min: -100, max: 100 },
  },
  spindle: { minRpm: 1000, maxRpm: 24000, defaultRpm: 18000 },
  tools: [
    {
      toolId: 'DRILL_5',
      type: 'DRILL',
      diameter: 5,
      maxDepth: 60,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 1200,
      defaultPlungeRate: 800,
    },
    {
      toolId: 'DRILL_8',
      type: 'DRILL',
      diameter: 8,
      maxDepth: 60,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 1000,
      defaultPlungeRate: 700,
    },
    {
      toolId: 'BORE_35',
      type: 'BORE',
      diameter: 35,
      maxDepth: 25,
      supportsPeck: false,
      supportsBore: true,
      defaultFeedRate: 500,
      defaultPlungeRate: 400,
    },
  ],
  defaultSafeZ: 50,
  coordinateSystem: 'Z_UP',
  dialect: 'FANUC',
  supportsToolChange: true,
  toolMagazineSize: 12,
};

// ============================================
// OPERATION FACTORIES
// ============================================

/**
 * Create a drill operation for testing.
 *
 * @param depth - Drill depth in mm
 * @param panelId - Optional panel ID for workpiece context
 * @param options - Additional operation overrides
 */
export function createDrillOp(
  depth: number,
  panelId?: string,
  options?: Partial<DrillOperation>
): DrillOperation {
  return {
    id: 'test-drill-1',
    type: 'DRILL',
    toolId: 'DRILL_5',
    position: { x: 100, y: 50, z: 0 },
    depth,
    throughHole: false,
    sourceId: 'test-source-1',
    workpieceContext: panelId
      ? { panelId, face: 'TOP', appliedOffset: { x: 0, y: 0, z: 0 } }
      : undefined,
    ...options,
  };
}

/**
 * Create a bore operation for testing.
 *
 * @param depth - Bore depth in mm
 * @param diameter - Bore diameter in mm
 * @param panelId - Optional panel ID for workpiece context
 * @param options - Additional operation overrides
 */
export function createBoreOp(
  depth: number,
  diameter: number,
  panelId?: string,
  options?: Partial<BoreOperation>
): BoreOperation {
  return {
    id: 'test-bore-1',
    type: 'BORE',
    toolId: 'BORE_35',
    position: { x: 100, y: 50, z: 0 },
    depth,
    diameter,
    flatBottom: true,
    sourceId: 'test-source-1',
    workpieceContext: panelId
      ? { panelId, face: 'TOP', appliedOffset: { x: 0, y: 0, z: 0 } }
      : undefined,
    ...options,
  };
}

// ============================================
// PANEL FRAME FIXTURES
// ============================================

/**
 * Standard 18mm panel frames for testing.
 */
export const standardPanelFrames: Record<string, PanelFrameInfo> = {
  'panel-1': { thicknessMm: 18 },
  'panel-2': { thicknessMm: 18 },
};

/**
 * Mixed thickness panel frames for testing.
 */
export const mixedPanelFrames: Record<string, PanelFrameInfo> = {
  'thin-panel': { thicknessMm: 6 },
  'standard-panel': { thicknessMm: 18 },
  'thick-panel': { thicknessMm: 25 },
};

// ============================================
// TOOL USAGE EVENT FACTORIES
// ============================================

import type { ToolUsageEvent, MaterialClass } from '../../../factory/tooling/types';

/**
 * Create a tool usage event for testing.
 *
 * @param toolId - Tool identifier
 * @param depthMm - Depth in mm
 * @param material - Material class (default: MDF)
 * @param overrides - Additional event overrides
 */
export function createToolUsageEvent(
  toolId: string,
  depthMm: number,
  material: MaterialClass = 'MDF',
  overrides?: Partial<ToolUsageEvent>
): ToolUsageEvent {
  return {
    jobId: 'test-job',
    machineId: 'KDT',
    dialect: 'FANUC',
    postVersion: '1.0.0',
    programHash: 'sha-test',
    packetContentHash: 'sha-packet',
    tool: { toolId, diameterMm: 5 },
    material,
    holeKind: 'DRILL',
    diameterMm: 5,
    depthMm,
    count: 1,
    occurredAt: Date.now(),
    ...overrides,
  };
}

/**
 * Create multiple tool usage events for batch testing.
 *
 * @param count - Number of events to create
 * @param toolId - Tool identifier
 * @param depthMm - Depth per event
 * @param material - Material class
 */
export function createToolUsageEventBatch(
  count: number,
  toolId: string = 'DRILL_5',
  depthMm: number = 10,
  material: MaterialClass = 'MDF'
): ToolUsageEvent[] {
  return Array.from({ length: count }, (_, i) =>
    createToolUsageEvent(toolId, depthMm, material, {
      occurredAt: Date.now() + i,
    })
  );
}

// ============================================
// OBSERVER CONTEXT FACTORY
// ============================================

import type { ToolUsageObserverContext } from '../../../factory/tooling/observerTypes';

/**
 * Create an observer context for testing.
 *
 * @param overrides - Context overrides
 */
export function createObserverContext(
  overrides?: Partial<ToolUsageObserverContext>
): ToolUsageObserverContext {
  return {
    jobId: 'test-job',
    machineId: 'KDT',
    dialect: 'FANUC',
    postVersion: '1.0.0',
    programHash: 'sha-test',
    packetContentHash: 'sha-packet',
    occurredAt: Date.now(),
    ...overrides,
  };
}
