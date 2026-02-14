/**
 * CNC Types - Factory Module Integration
 *
 * Types for CNC G-code generation in the Factory UI.
 * Bridges factory packet data with CNC module.
 *
 * @version 1.1.0 - Phase D4: Added workpiece configuration support
 */

import type { GcodeBundle, PostProcessStats, GcodeDialect } from '../../cnc/post/types';
import type { OperationGraph, Operation } from '../../cnc/operation/operationTypes';
import type { MachineProfile } from '../../cnc/machine/machineProfile';
import type { PanelFace, WorkpieceDatum } from '../../cnc/transform/workpieceTypes';

// ============================================================================
// Workpiece Configuration (D4)
// ============================================================================

/**
 * Workpiece configuration for a single panel.
 * Defines how the panel is placed on the CNC machine bed.
 *
 * @since D4
 */
export interface WorkpiecePanelConfig {
  /** Panel ID (must match packet drillMap panel) */
  panelId: string;

  /** Which face is being machined (TOP = normal, BOTTOM = flipped) */
  face: PanelFace;

  /** Which corner is the origin point */
  datum: WorkpieceDatum;

  /**
   * Placement offset from machine origin (mm).
   * Where the workpiece datum sits on the machine bed.
   */
  offset: {
    x: number;
    y: number;
    z: number;
  };

  /**
   * Rotation around Z axis (degrees, CW from operator view).
   * Common values: 0, 90, 180, 270
   */
  rotationDeg: number;
}

/**
 * Complete workpiece configuration for all panels in a job.
 *
 * @since D4
 */
export interface WorkpieceConfig {
  /** Per-panel configurations. Key is panelId. */
  panels: Map<string, WorkpiecePanelConfig>;

  /** Apply transforms during CNC generation (default: true if panels has entries) */
  applyTransforms: boolean;
}

/**
 * Default workpiece panel config (identity - no transform).
 */
export const defaultWorkpiecePanelConfig: Omit<WorkpiecePanelConfig, 'panelId'> = {
  face: 'TOP',
  datum: 'FRONT_LEFT',
  offset: { x: 0, y: 0, z: 0 },
  rotationDeg: 0,
};

/**
 * Create default config for a panel.
 */
export function createDefaultPanelConfig(panelId: string): WorkpiecePanelConfig {
  return {
    panelId,
    ...defaultWorkpiecePanelConfig,
  };
}

// ============================================================================
// CNC Generation Status
// ============================================================================

/**
 * Status of CNC generation for a job.
 */
export type CncGenerationStatus = 'IDLE' | 'GENERATING' | 'DONE' | 'ERROR';

// ============================================================================
// CNC Cache Entry
// ============================================================================

/**
 * Per-job CNC generation cache entry.
 */
export interface CncCacheEntry {
  /** Current generation status */
  status: CncGenerationStatus;

  /** Selected machine profile ID */
  machineId: string | null;

  /** Operation graph (intermediate state) */
  operationGraph: OperationGraph | null;

  /** Generated G-code bundle */
  bundle: GcodeBundle | null;

  /** Error message if generation failed */
  error: string | null;

  /** Validation issues (warnings/errors) */
  validationIssues: CncValidationIssue[];

  /** Timestamp when generation started */
  startedAt: string | null;

  /** Timestamp when generation completed */
  completedAt: string | null;
}

/**
 * Validation issue from CNC generation.
 */
export interface CncValidationIssue {
  code: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

// ============================================================================
// CNC Generation Request
// ============================================================================

/**
 * Request parameters for CNC G-code generation.
 */
export interface CncGenerateRequest {
  /** Job ID to generate for */
  jobId: string;

  /** Target machine ID */
  machineId: string;

  /** Optional program name override (defaults to jobId) */
  programName?: string;

  /** Include line numbers in G-code */
  lineNumbers?: boolean;

  /** Include comments in G-code */
  includeComments?: boolean;

  /** Override safe Z height (mm) */
  safeZ?: number;

  /** Override default feed rate (mm/min) */
  feedDefault?: number;

  /** Override default spindle RPM */
  rpmDefault?: number;

  /**
   * Workpiece configuration for panel placement.
   * If provided, transforms will be applied during operation mapping.
   * @since D4
   */
  workpieceConfig?: WorkpieceConfig;
}

// ============================================================================
// CNC Generation Response
// ============================================================================

/**
 * Response from CNC G-code generation.
 */
export type CncGenerateResponse =
  | {
      ok: true;
      bundle: GcodeBundle;
      stats: PostProcessStats;
      warnings: string[];
    }
  | {
      ok: false;
      code: CncErrorCode;
      message: string;
      validationIssues?: CncValidationIssue[];
    };

/**
 * CNC generation error codes.
 */
export type CncErrorCode =
  | 'E_CNC_NO_PACKET'
  | 'E_CNC_PACKET_INVALID'
  | 'E_CNC_NO_DRILL_MAP'
  | 'E_CNC_NO_MACHINE'
  | 'E_CNC_MACHINE_NOT_FOUND'
  | 'E_CNC_VALIDATION_FAILED'
  | 'E_CNC_POST_FAILED'
  | 'E_CNC_INTERNAL';

// ============================================================================
// Machine Selection
// ============================================================================

/**
 * Available machine for CNC generation (UI display).
 */
export interface CncMachineOption {
  /** Machine ID */
  id: string;

  /** Display name */
  name: string;

  /** G-code dialect */
  dialect: GcodeDialect;

  /** Machine description */
  description: string;

  /** Whether machine is available for this job */
  available: boolean;

  /** Reason if not available */
  unavailableReason?: string;
}

// ============================================================================
// Preview State
// ============================================================================

/**
 * G-code preview state.
 */
export interface GcodePreviewState {
  /** Is preview visible */
  visible: boolean;

  /** Current line number for highlighting */
  currentLine: number | null;

  /** Word wrap enabled */
  wordWrap: boolean;

  /** Show line numbers */
  showLineNumbers: boolean;
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default CNC cache entry.
 */
export const defaultCncCacheEntry: CncCacheEntry = {
  status: 'IDLE',
  machineId: null,
  operationGraph: null,
  bundle: null,
  error: null,
  validationIssues: [],
  startedAt: null,
  completedAt: null,
};

/**
 * Default G-code preview state.
 */
export const defaultGcodePreviewState: GcodePreviewState = {
  visible: false,
  currentLine: null,
  wordWrap: true,
  showLineNumbers: true,
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if CNC response is successful.
 */
export function isCncSuccess(
  response: CncGenerateResponse
): response is { ok: true; bundle: GcodeBundle; stats: PostProcessStats; warnings: string[] } {
  return response.ok === true;
}

/**
 * Check if CNC response is an error.
 */
export function isCncError(
  response: CncGenerateResponse
): response is { ok: false; code: CncErrorCode; message: string } {
  return response.ok === false;
}

/**
 * Check if CNC cache entry has a valid bundle.
 */
export function hasCncBundle(entry: CncCacheEntry): entry is CncCacheEntry & { bundle: GcodeBundle } {
  return entry.status === 'DONE' && entry.bundle !== null;
}
