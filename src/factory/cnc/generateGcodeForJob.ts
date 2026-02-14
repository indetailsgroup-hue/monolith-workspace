/**
 * generateGcodeForJob.ts - G-code Generation Entry Point
 *
 * High-level functions for generating G-code from factory packets.
 * Used by CncGeneratePanel for the generation workflow.
 *
 * @version 1.0.0
 */

import type { FactoryPacket } from '../packet/types';
import type { GcodeBundle } from '../../cnc/post/types';
import type {
  CncMachineOption,
  CncValidationResult,
  CncGenerationResponse,
  WorkpieceConfig,
} from '../types/cnc';

// ============================================================================
// Machine Discovery
// ============================================================================

/**
 * Get available CNC machines for a packet.
 */
export function getAvailableMachines(_packet: FactoryPacket | null): CncMachineOption[] {
  return [
    {
      id: 'KDT',
      name: 'KDT CNC Router',
      type: 'KDT',
      dialect: 'FANUC',
      available: true,
      description: 'Standard 3-axis CNC router',
    },
    {
      id: 'BIESSE',
      name: 'Biesse Rover',
      type: 'BIESSE',
      dialect: 'BIESSE',
      available: true,
      description: 'Biesse nesting CNC',
    },
  ];
}

/**
 * Get default machine ID for a packet.
 */
export function getDefaultMachineId(_packet: FactoryPacket | null): string | null {
  return 'KDT';
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Get validation result for generating G-code.
 */
export function getGenerationValidation(
  packet: FactoryPacket | null,
  _machineId: string
): CncValidationResult {
  if (!packet) {
    return {
      canGenerate: false,
      issues: [{ severity: 'ERROR', message: 'No verified packet available' }],
      operationCount: 0,
      estimatedTime: 0,
    };
  }

  const panels = packet.drillMap?.panels ?? [];
  const totalPoints = panels.reduce((sum, p) => sum + p.points.length, 0);

  if (panels.length === 0) {
    return {
      canGenerate: false,
      issues: [{ severity: 'WARNING', message: 'Packet has no drill map data' }],
      operationCount: 0,
      estimatedTime: 0,
    };
  }

  return {
    canGenerate: true,
    issues: [],
    operationCount: totalPoints,
    estimatedTime: Math.ceil(totalPoints * 0.5), // rough estimate
  };
}

// ============================================================================
// Generation Options
// ============================================================================

export interface GenerateGcodeOptions {
  /** Job ID */
  jobId: string;
  /** Target machine ID */
  machineId: string;
  /** Include comments in G-code */
  includeComments?: boolean;
  /** Include line numbers */
  lineNumbers?: boolean;
  /** Workpiece configuration */
  workpieceConfig?: WorkpieceConfig;
}

// ============================================================================
// Generation
// ============================================================================

/**
 * Generate G-code for a job.
 * Returns a CncGenerationResponse with the result.
 */
export async function generateGcodeForJob(
  _packet: FactoryPacket,
  _options: GenerateGcodeOptions
): Promise<CncGenerationResponse> {
  // Stub: returns empty bundle
  // Real implementation would use buildOperationGraph + postFanuc/postBiesse
  try {
    const bundle: GcodeBundle = {
      schema: 'monolith.cnc.bundle@1.0',
      machineId: _options.machineId,
      createdAt: Date.now(),
      source: {
        opGraphHash: '',
        jobId: _options.jobId,
      },
      files: [],
      warnings: [],
      stats: {
        lineCount: 0,
        operationCount: 0,
        toolChanges: 0,
        estimatedTimeSeconds: 0,
      },
    };

    return { ok: true, bundle };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Download Bundle
// ============================================================================

export interface DownloadBundleOptions {
  /** Job ID */
  jobId: string;
  /** Target machine ID */
  machineId: string;
  /** Include comments */
  includeComments?: boolean;
  /** Line numbers */
  lineNumbers?: boolean;
}

/**
 * Generate and trigger download of CNC bundle.
 */
export async function generateAndDownloadCncBundle(
  packet: FactoryPacket,
  options: DownloadBundleOptions
): Promise<{ ok: boolean; message?: string }> {
  try {
    const result = await generateGcodeForJob(packet, options);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    // In real implementation: build ZIP and trigger download
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Download failed',
    };
  }
}
