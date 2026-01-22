/**
 * types.ts - G-code Post Processor Types
 *
 * Types for converting OperationGraph to machine-specific G-code.
 *
 * @version 1.0.0 - Phase D2
 */

import type { MachineProfile } from '../machine/machineProfile';
import type { OperationGraph } from '../operation/operationTypes';

// ============================================================================
// Post Process Options
// ============================================================================

/**
 * Options for post-processing an operation graph to G-code.
 */
export interface PostProcessOptions {
  /** Program name/number for G-code header (e.g., "JOB123") */
  programName: string;

  /** Override safe Z height (mm) - defaults to machine profile */
  safeZ?: number;

  /** Override default feed rate (mm/min) */
  feedDefault?: number;

  /** Override default spindle RPM */
  rpmDefault?: number;

  /** Units - currently only mm supported */
  units?: 'mm';

  /** Include line numbers in G-code */
  lineNumbers?: boolean;

  /** Line number increment */
  lineNumberIncrement?: number;

  /** Include comments in G-code */
  includeComments?: boolean;

  /** Preserve original operation order (skip normalization) */
  preserveOrder?: boolean;
}

// ============================================================================
// Post Process Result
// ============================================================================

/**
 * Result of post-processing - either success with G-code or failure with errors.
 */
export type PostProcessResult =
  | {
      status: 'OK';
      gcode: string;
      warnings: string[];
      stats: PostProcessStats;
    }
  | {
      status: 'FAIL';
      errors: string[];
    };

/**
 * Statistics from post-processing.
 */
export interface PostProcessStats {
  /** Total lines of G-code generated */
  lineCount: number;

  /** Number of tool changes */
  toolChanges: number;

  /** Number of operations processed */
  operationCount: number;

  /** Estimated run time in seconds */
  estimatedTimeSeconds: number;
}

// ============================================================================
// Post Processor Interface
// ============================================================================

/**
 * Supported G-code dialects.
 */
export type GcodeDialect = 'FANUC' | 'BIESSE_ISO';

/**
 * Post processor interface - converts OperationGraph to machine-specific G-code.
 */
export interface PostProcessor {
  /** Dialect identifier */
  dialect: GcodeDialect;

  /** File extension for output */
  fileExt: '.nc' | '.tap';

  /**
   * Post-process an operation graph to G-code.
   *
   * @param opGraph - Validated operation graph
   * @param machine - Machine profile
   * @param opts - Post-processing options
   * @returns G-code string or errors
   */
  post(
    opGraph: OperationGraph,
    machine: MachineProfile,
    opts: PostProcessOptions
  ): PostProcessResult;
}

// ============================================================================
// G-code Bundle Types
// ============================================================================

/**
 * A single G-code file in the bundle.
 */
export interface GcodeFile {
  /** Relative path in bundle (e.g., "nc/JOB123.nc") */
  path: string;

  /** File content as bytes */
  bytes: Uint8Array;

  /** SHA-256 hash of content */
  sha256: string;
}

/**
 * Complete G-code bundle with manifest.
 */
export interface GcodeBundle {
  /** Schema identifier */
  schema: 'monolith.cnc.bundle@1.0';

  /** Machine ID this bundle was generated for */
  machineId: string;

  /** Creation timestamp (Unix ms) */
  createdAt: number;

  /** Source traceability */
  source: {
    /** Hash of the operation graph */
    opGraphHash: string;

    /** Hash of the original factory packet (if available) */
    packetContentHash?: string;

    /** Job ID reference */
    jobId?: string;
  };

  /** G-code files in the bundle */
  files: GcodeFile[];

  /** Warnings generated during post-processing */
  warnings: string[];

  /** Post-processing statistics */
  stats: PostProcessStats;
}

// ============================================================================
// Build Bundle Result
// ============================================================================

/**
 * Result of building a G-code bundle.
 */
export type BuildBundleResult =
  | {
      status: 'OK';
      bundle: GcodeBundle;
    }
  | {
      status: 'FAIL';
      errors: string[];
    };

// ============================================================================
// Tool Map Types
// ============================================================================

/**
 * Mapping from logical tool ID to machine tool number.
 */
export interface ToolMapEntry {
  /** Machine tool number (T1, T2, etc.) */
  toolNumber: number;

  /** Tool diameter (for verification) */
  diameter?: number;

  /** Tool description */
  description?: string;
}

/**
 * Complete tool map for a machine.
 */
export type ToolMap = Record<string, ToolMapEntry>;
