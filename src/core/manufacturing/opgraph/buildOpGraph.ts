/**
 * Intent → OperationGraph Builder
 *
 * Deterministic mapping from DesignIntent to factory operations.
 * This is the "compiler" from designer language to machine language.
 *
 * v1.0: Initial operation graph builder
 */

import type { OperationGraph, OpNode, OpId } from './types';
import type { DesignIntent } from '../../modeling/types';

let opCounter = 0;

/**
 * Generate unique operation ID.
 */
function opId(prefix: string): OpId {
  opCounter++;
  return `${prefix}_${opCounter.toString(36)}_${Date.now().toString(36)}`;
}

/**
 * Reset operation counter (for testing).
 */
export function resetOpCounter(): void {
  opCounter = 0;
}

/**
 * Build OperationGraph from DesignIntents.
 *
 * @param panelId - Target panel ID
 * @param intents - Array of design intents
 * @returns OperationGraph ready for manufacturing
 */
export function buildOpGraphFromIntents(
  panelId: string,
  intents: DesignIntent[]
): OperationGraph {
  const nodes: OpNode[] = [];

  // Filter intents for this panel
  const panelIntents = intents.filter(
    (it) => it.target.panelId === panelId
  );

  for (const intent of panelIntents) {
    const ops = intentToOps(panelId, intent);
    nodes.push(...ops);
  }

  // Stable ordering: sort by kind then target
  nodes.sort((a, b) => {
    const keyA = `${a.kind}_${a.target.kind}_${a.target.id}`;
    const keyB = `${b.kind}_${b.target.kind}_${b.target.id}`;
    return keyA.localeCompare(keyB);
  });

  return {
    version: 'opgraph.v1',
    nodes,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Convert a single DesignIntent to OpNode(s).
 */
function intentToOps(panelId: string, intent: DesignIntent): OpNode[] {
  switch (intent.type) {
    case 'edge-profile':
      return [
        {
          id: opId('op_prof'),
          kind: 'ROUTE_PROFILE',
          panelId,
          target: {
            kind: 'EDGE',
            id: `edge_${intent.target.edgeIndex ?? 0}`,
            edgeIndex: intent.target.edgeIndex,
          },
          params: {
            profileId: intent.profileId,
            depthMm: intent.depth,
            orientation: intent.orientation,
            startOffset: intent.startOffset ?? 0,
            length: intent.length ?? 'full',
          },
          sourceIntentId: intent.id,
        },
      ];

    case 'groove':
      return [
        {
          id: opId('op_groove'),
          kind: 'POCKET_GROOVE',
          panelId,
          target: {
            kind: 'FACE',
            id: `face_${intent.target.face ?? 'front'}`,
            face: intent.target.face,
          },
          params: {
            widthMm: intent.width,
            depthMm: intent.depth,
            offsetMm: intent.offset,
            referenceEdge: intent.referenceEdge,
            purpose: intent.purpose ?? 'decorative',
          },
          sourceIntentId: intent.id,
        },
      ];

    case 'dado':
      return [
        {
          id: opId('op_dado'),
          kind: 'POCKET_GROOVE',
          panelId,
          target: {
            kind: 'FACE',
            id: `face_${intent.target.face ?? 'front'}`,
            face: intent.target.face,
          },
          params: {
            widthMm: intent.width,
            depthMm: intent.depth,
            positionMm: intent.position,
            orientation: intent.orientation,
            isDado: 'true',
          },
          sourceIntentId: intent.id,
        },
      ];

    case 'rabbet':
      // Rabbet may generate multiple ops (one per edge)
      return intent.edges.map((edgeIdx) => ({
        id: opId('op_rabbet'),
        kind: 'ROUTE_PROFILE',
        panelId,
        target: {
          kind: 'EDGE',
          id: `edge_${edgeIdx}`,
          edgeIndex: edgeIdx,
        },
        params: {
          widthMm: intent.width,
          depthMm: intent.depth,
          isRabbet: 'true',
        },
        sourceIntentId: intent.id,
      }));

    case 'reveal':
      return intent.edges.map((edgeIdx) => ({
        id: opId('op_reveal'),
        kind: 'ROUTE_REVEAL',
        panelId,
        target: {
          kind: 'EDGE',
          id: `edge_${edgeIdx}`,
          edgeIndex: edgeIdx,
        },
        params: {
          depthMm: intent.depth,
          widthMm: intent.width,
        },
        sourceIntentId: intent.id,
      }));

    case 'shadow-gap':
      return [
        {
          id: opId('op_shadow'),
          kind: 'ROUTE_REVEAL',
          panelId,
          target: {
            kind: 'FACE',
            id: `face_${intent.target.face ?? 'front'}`,
            face: intent.target.face,
          },
          params: {
            widthMm: intent.width,
            depthMm: intent.depth,
            positionMm: intent.position,
            isShadowGap: 'true',
          },
          sourceIntentId: intent.id,
        },
      ];

    case 'kerf-bend':
      return [
        {
          id: opId('op_kerf'),
          kind: 'KERF_BEND',
          panelId,
          target: {
            kind: 'PANEL',
            id: panelId,
          },
          params: {
            bendRadius: intent.bendRadius,
            bendAngle: intent.bendAngle,
            kerfSpacing: intent.kerfSpacing,
            kerfDepth: intent.kerfDepth,
            kerfCount: intent.kerfCount,
            pattern: intent.pattern,
          },
          sourceIntentId: intent.id,
        },
      ];

    case 'hole-pattern':
      return [
        {
          id: opId('op_holes'),
          kind: 'DRILL_HOLE',
          panelId,
          target: {
            kind: 'FACE',
            id: `face_${intent.target.face ?? 'front'}`,
            face: intent.target.face,
          },
          params: {
            holeType: intent.holeType,
            diameter: intent.diameter,
            depth: intent.depth,
            patternType: intent.pattern.type,
            spacing: intent.pattern.spacing ?? 0,
            rows: intent.pattern.rows ?? 1,
            columns: intent.pattern.columns ?? 1,
            offsetX: intent.offsetX,
            offsetY: intent.offsetY,
          },
          sourceIntentId: intent.id,
        },
      ];

    case 'edge-band':
      return [
        {
          id: opId('op_band'),
          kind: 'EDGE_BAND',
          panelId,
          target: {
            kind: 'EDGE',
            id: `edge_${intent.target.edgeIndex ?? 0}`,
            edgeIndex: intent.target.edgeIndex,
          },
          params: {
            materialId: intent.materialId,
            thickness: intent.thickness,
            preGlued: intent.preGlued ? 'true' : 'false',
          },
          sourceIntentId: intent.id,
        },
      ];

    case 'surface-pattern':
      // Surface patterns may generate multiple ops depending on type
      return [
        {
          id: opId('op_pattern'),
          kind: 'ROUTE_PROFILE',
          panelId,
          target: {
            kind: 'FACE',
            id: `face_${intent.target.face ?? 'front'}`,
            face: intent.target.face,
          },
          params: {
            patternType: intent.patternType,
            ...intent.params,
          },
          sourceIntentId: intent.id,
        },
      ];

    default:
      console.warn(`[OpGraph] Unknown intent type: ${(intent as any).type}`);
      return [];
  }
}

/**
 * Build operation graph for all panels in a cabinet.
 */
export function buildOpGraphForCabinet(
  panelIds: string[],
  intents: DesignIntent[]
): Map<string, OperationGraph> {
  const result = new Map<string, OperationGraph>();

  for (const panelId of panelIds) {
    const graph = buildOpGraphFromIntents(panelId, intents);
    if (graph.nodes.length > 0) {
      result.set(panelId, graph);
    }
  }

  return result;
}
