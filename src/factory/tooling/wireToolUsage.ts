/**
 * wireToolUsage.ts - Tool Usage Wiring for CNC Pipeline
 *
 * Connects the tool usage observer to the CNC generation flow.
 * Read-only - does not affect G-code output.
 *
 * @version 1.0.0 - Phase D6-D
 */

import type { ToolUsageObserverContext } from './observerTypes';
import type { ToolUsageEvent } from './types';
import { observeToolUsageFromOperationGraph } from './toolUsageObserver';
import { appendToolUsageEvents } from './storage';

/**
 * Options for tool usage wiring.
 */
export type WireToolUsageOptions = {
  /** Persist individual events to event log (default: true) */
  persistEventLog?: boolean;
  /** Write usage on cache hit (default: false to avoid double count) */
  enableOnCacheHit?: boolean;
  /** Swallow errors to prevent blocking CNC generation (default: true) */
  swallowErrors?: boolean;
};

/**
 * Input for tool usage wiring.
 */
export type WireToolUsageInput = {
  /** Operation graph from CNC pipeline */
  opGraph: unknown;
  /** Observer context with provenance data */
  observerContext: ToolUsageObserverContext;
  /** Whether this was a cache hit (skip writing to avoid double count) */
  cacheHit: boolean;
};

/**
 * Result of tool usage wiring.
 */
export type WireToolUsageResult = {
  /** Whether wiring was attempted (false if skipped due to cache hit) */
  attempted: boolean;
  /** Whether input was from cache */
  cacheHit: boolean;
  /** Number of events written to storage */
  eventsWritten: number;
  /** Error message if wiring failed (only when swallowErrors=true) */
  error?: string;
};

/**
 * Wire tool usage tracking after CNC bundle generation.
 *
 * This function:
 * 1. Observes the operation graph to extract tool usage events
 * 2. Persists events to IndexedDB (aggregating into ToolUsageRecord)
 * 3. Handles errors gracefully to never block CNC generation
 *
 * By default, skips writing on cache hits to avoid double-counting usage.
 *
 * @param input - Operation graph, observer context, and cache hit flag
 * @param options - Wiring options
 * @returns Result with attempt status and event count
 *
 * @example
 * ```typescript
 * const result = await wireToolUsageAfterCncBuild(
 *   {
 *     opGraph: bundle.opGraph,
 *     cacheHit: false,
 *     observerContext: {
 *       jobId: 'JOB-123',
 *       machineId: 'KDT-1',
 *       dialect: 'FANUC',
 *       postVersion: '1.3.0',
 *       programHash: 'sha256-...',
 *       packetContentHash: 'sha256-...',
 *     },
 *   },
 *   { persistEventLog: true, swallowErrors: true }
 * );
 * ```
 */
export async function wireToolUsageAfterCncBuild(
  input: WireToolUsageInput,
  options?: WireToolUsageOptions
): Promise<WireToolUsageResult> {
  const persistEventLog = options?.persistEventLog ?? true;
  const enableOnCacheHit = options?.enableOnCacheHit ?? false;
  const swallowErrors = options?.swallowErrors ?? true;

  // Skip writing on cache hit by default (avoid double count)
  const shouldWrite = enableOnCacheHit ? true : !input.cacheHit;
  if (!shouldWrite) {
    return { attempted: false, cacheHit: input.cacheHit, eventsWritten: 0 };
  }

  try {
    // Observe tool usage from operation graph
    const events: ToolUsageEvent[] = observeToolUsageFromOperationGraph(
      input.opGraph,
      input.observerContext
    );

    if (events.length === 0) {
      return { attempted: true, cacheHit: input.cacheHit, eventsWritten: 0 };
    }

    // Persist to IndexedDB
    await appendToolUsageEvents(events, { persistEventLog });

    return { attempted: true, cacheHit: input.cacheHit, eventsWritten: events.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Re-throw if swallowErrors is false
    if (!swallowErrors) throw err;

    // Return error info but don't block
    return { attempted: true, cacheHit: input.cacheHit, eventsWritten: 0, error: msg };
  }
}
