/**
 * Connector OS v1.1 - OpGraph Emission Bridge
 *
 * Converts ConnectorDrillOp[] to OpNode[] for integration with
 * the existing OperationGraph pipeline.
 *
 * @see src/core/manufacturing/opgraph/types.ts
 */

import type { OpNode } from '../manufacturing/opgraph/types';
import type { ConnectorDrillOp } from './types';

const EDGE_FEATURES = new Set(['BOLT', 'DOWEL']);

/**
 * Convert ConnectorDrillOp[] to OpNode[] for OperationGraph.
 *
 * Maps Connector OS output to the existing factory manufacturing pipeline.
 * Each ConnectorDrillOp becomes a DRILL_HOLE OpNode.
 *
 * @param ops - Connector drill operations from the compiler
 * @param panelId - Target panel ID for the operation graph
 * @returns Array of OpNode compatible with OperationGraph
 */
export function emitToOpNodes(
  ops: ConnectorDrillOp[],
  panelId: string,
): OpNode[] {
  return ops.map((op, idx) => ({
    id: `conn_${op.meta.pairId}_${op.meta.featureId}_${idx}`,
    kind: 'DRILL_HOLE' as const,
    panelId,
    target: {
      kind: EDGE_FEATURES.has(op.meta.featureId)
        ? ('EDGE' as const)
        : ('FACE' as const),
      id: `${op.meta.featureId.toLowerCase()}_${op.meta.instanceIndex}`,
    },
    params: {
      diameter: op.params.dia,
      depth: op.params.depth,
      u: op.params.u,
      v: op.params.v,
      n: op.params.n,
      connectorId: op.meta.connectorId,
      pairId: op.meta.pairId,
      featureId: op.meta.featureId,
      role: op.meta.role,
      frame: op.meta.frame,
    },
    sourceIntentId: `connector-os:${op.meta.connectorId}`,
  }));
}
