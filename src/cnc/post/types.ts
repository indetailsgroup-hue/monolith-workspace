/**
 * types.ts - G-code Post Processor Types
 *
 * Types for converting OperationGraph to machine-specific G-code.
 *
 * @version 1.5.0 - Phase D5-D.1: Added useCoolant option
 */

import type { MachineProfile } from '../machine/machineProfile';
import type { OperationGraph } from '../operation/operationTypes';
import type { DrillPolicy, MaterialClass, PanelMaterialContext, DrillTuningOptions } from '../policy';

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

  /**
   * Enable automatic coolant control (M8/M9).
   * When true, emits M8 (coolant on) at program start and M9 (coolant off) at end.
   * Defaults to false for dry-run safety.
   * @since D5-D.1
   */
  useCoolant?: boolean;

  /**
   * Drilling policy options for cycle selection and feed/speed.
   * If not provided, uses CONSERVATIVE_DRILL_POLICY with UNKNOWN material.
   * @since D5-B
   */
  policy?: CncPolicyOptions;
}

// ============================================================================
// CNC Policy Options
// ============================================================================

/**
 * Options for drill policy integration.
 * @since D5-B
 */
export interface CncPolicyOptions {
  /**
   * Drill policy to use for cycle selection.
   * Defaults to CONSERVATIVE_DRILL_POLICY if not specified.
   */
  drillPolicy?: DrillPolicy;

  /**
   * Panel material contexts for material-aware feed/speed.
   * Key is panelId from operation's workpieceContext.
   */
  panelMaterials?: Map<string, PanelMaterialContext>;

  /**
   * Material ID to MaterialClass mapping.
   * Used to resolve materialClass from materialId.
   */
  materialClassMap?: Record<string, MaterialClass>;

  /**
   * Default material class when panel material is unknown.
   * Defaults to 'UNKNOWN' for conservative parameters.
   */
  defaultMaterialClass?: MaterialClass;

  /**
   * Tuning options for drill cycle execution.
   * Controls retract behavior, peck scheduling, etc.
   * @since D5-C.0
   */
  drillTuning?: DrillTuningOptions;

  /**
   * Panel frame information for thickness lookup.
   * Key is panelId from operation's workpieceContext.
   * @since D5-C.1A
   */
  panelFrames?: Record<string, PanelFrameInfo>;

  /**
   * Fallback thickness when panel not found in panelFrames.
   * Defaults to 18mm (standard cabinet panel).
   * @since D5-C.1A
   */
  fallbackThicknessMm?: number;

  /**
   * Through-hole tuning for breakout mitigation.
   * Controls dwell behavior near panel exit.
   * @since D5-C.1A
   */
  throughHoleTuning?: ThroughHoleTuning;
}

// ============================================================================
// Panel Frame Types (D5-C.1A)
// ============================================================================

/**
 * Panel frame thickness information.
 * Used for through-hole detection.
 * @since D5-C.1A
 */
export interface PanelFrameInfo {
  /** Panel thickness in mm */
  thicknessMm: number;
}

/**
 * Material classes that benefit from through-hole dwell.
 * These materials have breakout/delamination risk at exit.
 * @since D5-C.1A
 */
export type ThroughHoleSensitiveMaterial = 'HPL' | 'PLYWOOD' | 'MELAMINE';

/**
 * Through-hole tuning options for breakout mitigation.
 * @since D5-C.1A
 * @since D5-C.1B: Added feed-down near exit
 * @since D5-D.2: Added emitExitFeed option
 */
export interface ThroughHoleTuning {
  /**
   * Enable through-hole detection and mitigation.
   * Defaults to true when panelFrames available.
   */
  enabled?: boolean;

  /**
   * Distance from panel bottom to consider as "through-hole".
   * depth >= (thickness - allowance) → through-hole
   * Defaults to 0.5mm (conservative).
   */
  breakthroughAllowanceMm?: number;

  /**
   * Dwell time (seconds) at bottom for each sensitive material.
   * Material not in map → no extra dwell.
   * Defaults: HPL=0.15, PLYWOOD=0.15, MELAMINE=0.10
   */
  dwellSecByMaterial?: Partial<Record<ThroughHoleSensitiveMaterial, number>>;

  /**
   * Enable feed rate reduction near exit (D5-C.1B).
   * Defaults to true for additional breakout protection.
   * @since D5-C.1B
   */
  feedDownEnabled?: boolean;

  /**
   * Depth of exit zone (mm from panel bottom) where feed reduction applies.
   * The drill slows down when entering this zone.
   * Defaults to 2mm (conservative).
   * @since D5-C.1B
   */
  exitZoneDepthMm?: number;

  /**
   * Feed rate reduction percentage for each sensitive material in exit zone.
   * 30 = reduce feed by 30% (i.e., use 70% of base feed).
   * Material not in map → no feed reduction.
   * Defaults: HPL=30, PLYWOOD=30, MELAMINE=25
   * @since D5-C.1B
   */
  exitFeedReductionByMaterial?: Partial<Record<ThroughHoleSensitiveMaterial, number>>;

  /**
   * Emit multi-line drill with reduced exit feed in G-code.
   * When true, through-holes with sensitive materials use multi-line approach
   * instead of canned cycles to apply different feed rates:
   *   G0 X_ Y_ (rapid to position)
   *   G0 Z{safeZ} (rapid to clearance)
   *   G1 Z-{exitZoneStart} F{normalFeed} (drill at normal speed)
   *   G1 Z-{depth} F{exitFeed} (slow down for exit zone)
   *   G4 P{dwell} (optional dwell)
   *   G0 Z{safeZ} (retract)
   * When false (default), uses canned cycles with single feed rate.
   * @since D5-D.2
   */
  emitExitFeed?: boolean;
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
export type GcodeDialect = 'FANUC' | 'BIESSE_ISO' | 'BIESSE' | 'HEIDENHAIN' | 'WEEKE' | 'MPR' | 'CIX' | 'XXL';

/**
 * Post processor interface - converts OperationGraph to machine-specific G-code.
 */
export interface PostProcessor {
  /** Dialect identifier */
  dialect: GcodeDialect;

  /** File extension for output */
  fileExt: '.nc' | '.tap' | '.mpr' | '.cix' | '.xxl';

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
