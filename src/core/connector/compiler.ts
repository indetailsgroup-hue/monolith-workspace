/**
 * Connector OS v1.1 - Digital Joinery Compiler
 *
 * Synthesizes drill operations from ConnectorSpec + S-positions + material stack.
 * Uses AdjacencyContext for panel-agnostic joint resolution.
 *
 * @see docs/connector-os/compiler-pipeline.md
 */

import type {
  ConnectorSpec,
  ConnectorDrillOp,
  AdjacencyContext,
  MaterialStackPreset,
  BoreFeature,
} from './types';
import type { Stack, ManufacturingMode } from './calculateCncCoordinate';
import { calculateCncCoordinate } from './calculateCncCoordinate';

/**
 * Resolve the final U-coordinate (Distance B) for a feature,
 * applying any per-feature transform (e.g. Target J10: B = A - 25).
 */
function resolveFeatureB(feature: BoreFeature): number {
  return feature.offsetPrimaryMm + (feature.transform?.deltaMm ?? 0);
}

/**
 * Convert a MaterialStackPreset to the Stack format used by calculateCncCoordinate.
 */
function presetToStack(preset: MaterialStackPreset): Stack {
  return {
    core: preset.resolved.coreThk,
    finished: preset.resolved.finishedThk,
    pvc: preset.resolved.edgeThk,
  };
}

/**
 * Compile connector operations for a joint.
 *
 * For each S-position and each feature in the spec, produces a
 * ConnectorDrillOp with full CNC coordinates and structured metadata.
 *
 * @param adjContext - Adjacency context identifying the joint
 * @param spec - Connector specification (hardware)
 * @param sPositions - Array of S-positions from the Placer
 * @param preset - Material stack preset
 * @param mode - Manufacturing mode (DRILL_ON_CORE or DRILL_ON_FINISHED)
 * @returns Array of ConnectorDrillOp with full metadata
 */
export function compileConnectorOps(
  adjContext: AdjacencyContext,
  spec: ConnectorSpec,
  sPositions: number[],
  preset: MaterialStackPreset,
  mode: ManufacturingMode,
): ConnectorDrillOp[] {
  const stack = presetToStack(preset);
  const ops: ConnectorDrillOp[] = [];

  sPositions.forEach((sPos, index) => {
    spec.features.forEach((feature) => {
      const finalB = resolveFeatureB(feature);

      const coord = calculateCncCoordinate(sPos, finalB, stack, mode);

      ops.push({
        type: 'DRILL',
        params: {
          dia: feature.diaMm,
          depth: feature.depthMm,
          u: coord.u,
          v: coord.v,
          n: coord.n,
        },
        meta: {
          connectorId: spec.connectorId,
          pairId: `PAIR_${adjContext.id}_${index}`,
          featureId: feature.id,
          instanceIndex: index,
          role: feature.role,
          frame: feature.refFrame,
        },
        tags: [
          `CONN=${spec.connectorId}`,
          `ROLE=${feature.role}`,
          `MODE=${mode}`,
        ],
      });
    });
  });

  return ops;
}
