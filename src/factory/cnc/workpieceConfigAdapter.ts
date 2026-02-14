/**
 * workpieceConfigAdapter.ts - Convert UI WorkpieceConfig to CNC Transform Context
 *
 * Bridges the gap between the Factory UI workpiece configuration
 * and the CNC transform module's WorkpieceTransformContext.
 *
 * @version 1.0.0 - Phase D4
 */

import type { PacketDrillPanel } from '../packet/types';
import type { WorkpieceConfig, WorkpiecePanelConfig } from '../types/cnc';
import type { WorkpieceTransformContext } from '../../cnc/transform/workpieceTypes';

/**
 * Convert UI WorkpieceConfig to a Map of WorkpieceTransformContext.
 *
 * This adapter translates the UI-friendly WorkpieceConfig (with degrees, simplified offset)
 * to the CNC module's WorkpieceTransformContext (with radians, full frame).
 *
 * @param config - UI workpiece configuration
 * @param panels - Drill map panels (for dimensions)
 * @returns Map of panelId → WorkpieceTransformContext
 */
export function adaptWorkpieceConfigToTransforms(
  config: WorkpieceConfig,
  panels: PacketDrillPanel[]
): Map<string, WorkpieceTransformContext> {
  const transforms = new Map<string, WorkpieceTransformContext>();

  if (!config.applyTransforms) {
    return transforms;
  }

  // Build a panel dimension lookup
  const panelDims = new Map<string, [number, number, number]>();
  for (const panel of panels) {
    panelDims.set(panel.panelId, panel.dimensions);
  }

  // Convert each panel config to transform context
  for (const [panelId, panelConfig] of config.panels) {
    const dims = panelDims.get(panelId);
    if (!dims) {
      // Panel not found in drill map, skip
      continue;
    }

    const context = convertPanelConfigToContext(panelConfig, dims);
    transforms.set(panelId, context);
  }

  return transforms;
}

/**
 * Convert a single WorkpiecePanelConfig to WorkpieceTransformContext.
 *
 * @param config - UI panel config
 * @param dimensions - Panel dimensions [length, width, thickness] in mm
 * @returns Transform context for CNC operations
 */
function convertPanelConfigToContext(
  config: WorkpiecePanelConfig,
  dimensions: [number, number, number]
): WorkpieceTransformContext {
  // Convert rotation from degrees to radians
  // Note: UI uses CW degrees, transform uses CCW radians
  // CW 90° = CCW -90° = -π/2
  const rotationRad = (-config.rotationDeg * Math.PI) / 180;

  return {
    panelId: config.panelId,
    frame: {
      datum: config.datum,
      face: config.face,
      dimensions: {
        length: dimensions[0],
        width: dimensions[1],
        thickness: dimensions[2],
      },
    },
    placement: {
      offset: {
        x: config.offset.x,
        y: config.offset.y,
        z: config.offset.z,
      },
      rotationZ: rotationRad,
    },
  };
}

/**
 * Validate a WorkpieceConfig for generation.
 *
 * Returns validation issues that should block generation.
 *
 * @param config - UI workpiece configuration
 * @param panels - Drill map panels (for validation)
 * @returns Array of validation error messages (empty if valid)
 */
export function validateWorkpieceConfig(
  config: WorkpieceConfig,
  panels: PacketDrillPanel[]
): string[] {
  const errors: string[] = [];

  if (!config.applyTransforms) {
    // No transforms applied, always valid
    return [];
  }

  const panelIds = new Set(panels.map((p) => p.panelId));

  // Check for invalid panel IDs
  for (const [panelId] of config.panels) {
    if (!panelIds.has(panelId)) {
      errors.push(`Workpiece config references unknown panel: ${panelId}`);
    }
  }

  // Check for valid rotation values
  for (const [panelId, panelConfig] of config.panels) {
    if (![0, 90, 180, 270].includes(panelConfig.rotationDeg)) {
      errors.push(`Panel ${panelId} has invalid rotation: ${panelConfig.rotationDeg}° (must be 0, 90, 180, or 270)`);
    }
  }

  return errors;
}

/**
 * Check if a WorkpieceConfig has any actual transformations.
 *
 * Returns true if any panel has non-default settings (not TOP + FRONT_LEFT + 0° + zero offset).
 *
 * @param config - UI workpiece configuration
 * @returns true if config has meaningful transforms
 */
export function hasActiveTransforms(config: WorkpieceConfig): boolean {
  if (!config.applyTransforms) {
    return false;
  }

  for (const [, panelConfig] of config.panels) {
    if (
      panelConfig.face !== 'TOP' ||
      panelConfig.datum !== 'FRONT_LEFT' ||
      panelConfig.rotationDeg !== 0 ||
      panelConfig.offset.x !== 0 ||
      panelConfig.offset.y !== 0 ||
      panelConfig.offset.z !== 0
    ) {
      return true;
    }
  }

  return false;
}
