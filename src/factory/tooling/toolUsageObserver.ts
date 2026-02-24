/**
 * toolUsageObserver.ts - Tool Usage Observer
 *
 * Pure function that observes operation graphs and emits tool usage events.
 * Read-only - does not modify any CNC output.
 *
 * @version 1.0.0 - Phase D6-B
 */

import type { ToolUsageEvent, MaterialClass } from './types';
import type { ToolUsageObserverContext } from './observerTypes';
import {
  clampNonNegative,
  makeToolIdentity,
  normalizeNumber,
  stableSortEvents,
} from './toolUsageObserverHelpers';

/**
 * Observe tool usage from an operation graph.
 *
 * Conservative observer:
 * - Reads OperationGraph only (no G-code parsing)
 * - Emits one event per DRILL/BORE operation (count = 1)
 * - Stable ordering for determinism
 * - Material resolved via optional resolver (defaults to UNKNOWN)
 *
 * @param opGraph - Operation graph from CNC pipeline
 * @param ctx - Observer context with provenance data
 * @returns Array of ToolUsageEvent in stable order
 *
 * @example
 * ```typescript
 * const events = observeToolUsageFromOperationGraph(opGraph, {
 *   jobId: 'JOB-123',
 *   machineId: 'KDT-1',
 *   dialect: 'FANUC',
 *   postVersion: '1.3.0',
 *   programHash: 'sha256-...',
 *   packetContentHash: 'sha256-...',
 *   occurredAt: Date.now(),
 *   resolveMaterial: (op) => lookupMaterial(op),
 * });
 * ```
 */
export function observeToolUsageFromOperationGraph(
  opGraph: unknown,
  ctx: ToolUsageObserverContext
): ToolUsageEvent[] {
  const occurredAt = ctx.occurredAt ?? Date.now();
  const resolveMaterial = ctx.resolveMaterial ?? (() => 'UNKNOWN' as MaterialClass);

  // Safely extract operations array
  const graph = opGraph as { operations?: unknown[] } | null | undefined;
  const ops: unknown[] = Array.isArray(graph?.operations) ? graph.operations : [];

  const events: ToolUsageEvent[] = [];

  for (const op of ops) {
    const operation = op as {
      type?: string;
      toolId?: string;
      depth?: number;
      diameter?: number;
      diameterMm?: number;
    } | null;

    if (!operation) continue;

    const type = operation.type;

    // Only process DRILL and BORE operations
    if (type !== 'DRILL' && type !== 'BORE') continue;

    const toolId = String(operation.toolId ?? '');
    if (!toolId) continue;

    // Extract diameter (BORE ops typically have diameter, DRILL ops may not)
    const diameterMm = clampNonNegative(
      Number(operation.diameter ?? operation.diameterMm ?? 0)
    );

    // Extract depth
    const depthMm = clampNonNegative(Number(operation.depth ?? 0));

    // Resolve material via caller-provided resolver
    const material = resolveMaterial(op);

    events.push({
      jobId: ctx.jobId,
      machineId: ctx.machineId,
      dialect: ctx.dialect,
      postVersion: ctx.postVersion,
      programHash: ctx.programHash,
      packetContentHash: ctx.packetContentHash,

      tool: makeToolIdentity(toolId, diameterMm || undefined),
      material,
      holeKind: type as 'DRILL' | 'BORE',
      diameterMm: normalizeNumber(diameterMm, 3),
      depthMm: normalizeNumber(depthMm, 3),

      count: 1,
      occurredAt,
    });
  }

  // Return in stable order for determinism
  return stableSortEvents(events);
}
