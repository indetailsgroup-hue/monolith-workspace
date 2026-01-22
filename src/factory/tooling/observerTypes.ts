/**
 * observerTypes.ts - Tool Usage Observer Types
 *
 * Context types for the pure observer function.
 * Caller provides all context; observer has no side effects.
 *
 * @version 1.0.0 - Phase D6-B
 */

import type { MaterialClass } from './types';

/**
 * Resolver function for determining material class from an operation.
 * Caller implements this to wire packet/cutlist data.
 */
export type OperationMaterialResolver = (op: unknown) => MaterialClass;

/**
 * Context for tool usage observation.
 * All values are provided by caller for full determinism.
 */
export type ToolUsageObserverContext = {
  /** Job identifier */
  jobId: string;
  /** Machine identifier */
  machineId: string;
  /** G-code dialect (e.g., "FANUC", "BIESSE_ISO") */
  dialect: string;
  /** Post-processor version */
  postVersion: string;

  /** SHA-256 hash of generated G-code program (from cnc-manifest) */
  programHash: string;
  /** SHA-256 hash of source factory packet (from cnc-manifest) */
  packetContentHash: string;

  /** Timestamp for events - caller provides for determinism in tests */
  occurredAt?: number;
  /** Material resolver - defaults to returning UNKNOWN */
  resolveMaterial?: OperationMaterialResolver;
};
