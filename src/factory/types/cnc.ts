/**
 * cnc.ts - CNC Type Definitions for Factory
 *
 * Types used by CNC generation panel and related UI.
 *
 * @version 1.0.0
 */

// ============================================================================
// Machine Options
// ============================================================================

/**
 * Available CNC machine option for selection UI.
 */
export interface CncMachineOption {
  /** Machine identifier */
  id: string;
  /** Display name */
  name: string;
  /** Machine type */
  type: 'KDT' | 'BIESSE' | 'HOMAG';
  /** Whether the machine is available */
  available: boolean;
  /** G-code dialect */
  dialect: string;
  /** Description */
  description?: string;
  /** Reason if unavailable */
  unavailableReason?: string;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validation issue for CNC generation.
 * Severity uses uppercase to match CNC conventions.
 */
export interface CncValidationIssue {
  /** Issue severity */
  severity: 'ERROR' | 'WARNING' | 'INFO';
  /** Issue message */
  message: string;
  /** Affected panel ID (if applicable) */
  panelId?: string;
}

/**
 * Validation result returned by getGenerationValidation.
 */
export interface CncValidationResult {
  /** Whether generation can proceed */
  canGenerate: boolean;
  /** Validation issues */
  issues: CncValidationIssue[];
  /** Number of operations to generate */
  operationCount: number;
  /** Estimated generation time (seconds) */
  estimatedTime: number;
}

// ============================================================================
// Generation Status
// ============================================================================

/**
 * CNC generation status.
 */
export type CncGenerationStatus =
  | 'IDLE'
  | 'GENERATING'
  | 'DONE'
  | 'SUCCESS'
  | 'ERROR';

/**
 * CNC generation response.
 * Uses import type to avoid circular dependency.
 */
export interface CncGenerationResponse {
  /** Whether generation succeeded */
  ok: boolean;
  /** Generated bundle (if successful) */
  bundle?: import('../../cnc/post/types').GcodeBundle;
  /** Error message (if failed) */
  message?: string;
}

/**
 * Check if a generation response represents success.
 */
export function isCncSuccess(
  response: CncGenerationResponse
): response is CncGenerationResponse & { bundle: import('../../cnc/post/types').GcodeBundle } {
  return response.ok === true && response.bundle !== undefined;
}

// ============================================================================
// Workpiece Configuration
// ============================================================================

/**
 * Per-panel workpiece configuration.
 */
export interface PanelWorkpieceConfig {
  /** Panel ID */
  panelId: string;
  /** Custom offset X (mm) */
  offsetX?: number;
  /** Custom offset Y (mm) */
  offsetY?: number;
  /** Rotation angle (degrees) */
  rotation?: number;
  /** Whether panel is flipped */
  flipped?: boolean;
}

/**
 * Workpiece configuration for the entire job.
 */
export interface WorkpieceConfig {
  /** Per-panel configurations */
  panels: Map<string, PanelWorkpieceConfig>;
  /** Whether to apply workpiece transforms */
  applyTransforms: boolean;
}
