/**
 * buildGcodeBundle.ts - Main Entry for G-code Bundle Generation
 *
 * Orchestrates validation, post-processing, and bundle creation.
 * Ensures only validated operation graphs produce G-code.
 *
 * @version 1.0.0 - Phase D2
 */

import type { MachineProfile } from './machine/machineProfile';
import type { OperationGraph } from './operation/operationTypes';
import type {
  GcodeBundle,
  GcodeFile,
  BuildBundleResult,
  PostProcessOptions,
  PostProcessStats,
} from './post/types';
import { validateOperationGraph, isValidGraph } from './mapping/validateOperationGraph';
import { getPostProcessor } from './post/postProcessor';
import { sha256Hex } from '../crypto/sha256';

// ============================================================================
// Types
// ============================================================================

export interface BuildBundleParams {
  /** Validated operation graph */
  opGraph: OperationGraph;

  /** Target machine profile */
  machine: MachineProfile;

  /** Program name for G-code header */
  programName: string;

  /** Original factory packet content hash (for traceability) */
  packetContentHash?: string;

  /** Job ID reference */
  jobId?: string;

  /** Post-processing options */
  options?: Partial<PostProcessOptions>;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Build a G-code bundle from a validated operation graph.
 *
 * IMPORTANT: This function validates the operation graph before generating G-code.
 * If validation fails, no G-code is produced.
 *
 * @param params - Bundle build parameters
 * @returns G-code bundle or validation/processing errors
 */
export async function buildGcodeBundle(params: BuildBundleParams): Promise<BuildBundleResult> {
  const { opGraph, machine, programName, packetContentHash, jobId, options = {} } = params;

  // Step 1: Validate operation graph against machine profile
  const validation = validateOperationGraph(opGraph, machine);

  if (!isValidGraph(validation)) {
    return {
      status: 'FAIL',
      errors: [
        'Operation graph validation failed',
        ...validation.issues
          .filter((i) => i.severity === 'ERROR')
          .map((i) => `${i.code}: ${i.message}`),
      ],
    };
  }

  // Step 2: Get appropriate post processor for machine
  const postProcessor = getPostProcessor(machine);

  // Step 3: Build post-process options
  const postOpts: PostProcessOptions = {
    programName,
    safeZ: options.safeZ ?? machine.defaultSafeZ,
    feedDefault: options.feedDefault,
    rpmDefault: options.rpmDefault,
    lineNumbers: options.lineNumbers ?? false,
    includeComments: options.includeComments ?? true,
    preserveOrder: options.preserveOrder ?? false,
  };

  // Step 4: Generate G-code
  const result = postProcessor.post(opGraph, machine, postOpts);

  if (result.status === 'FAIL') {
    return {
      status: 'FAIL',
      errors: result.errors,
    };
  }

  // Step 5: Create file with hash
  const gcodeBytes = new TextEncoder().encode(result.gcode);
  const gcodeSha256 = await sha256Hex(gcodeBytes);

  const gcodeFile: GcodeFile = {
    path: `nc/${programName}${postProcessor.fileExt}`,
    bytes: gcodeBytes,
    sha256: gcodeSha256,
  };

  // Step 6: Calculate operation graph hash for traceability
  const opGraphJson = JSON.stringify(opGraph);
  const opGraphHash = await sha256Hex(opGraphJson);

  // Step 7: Collect warnings (from validation and post-processing)
  const warnings = [
    ...validation.issues
      .filter((i) => i.severity === 'WARNING')
      .map((i) => i.message),
    ...result.warnings,
  ];

  // Step 8: Build bundle
  const bundle: GcodeBundle = {
    schema: 'monolith.cnc.bundle@1.0',
    machineId: machine.id,
    createdAt: Date.now(),
    source: {
      opGraphHash,
      packetContentHash,
      jobId,
    },
    files: [gcodeFile],
    warnings,
    stats: result.stats,
  };

  return {
    status: 'OK',
    bundle,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Quick check if bundle generation would succeed (without actually generating).
 * Useful for UI to show "Generate G-code" button state.
 *
 * @param opGraph - Operation graph to check
 * @param machine - Target machine
 * @returns true if bundle can be generated
 */
export function canGenerateBundle(opGraph: OperationGraph, machine: MachineProfile): boolean {
  const validation = validateOperationGraph(opGraph, machine);
  return isValidGraph(validation);
}

/**
 * Get validation issues for an operation graph.
 * Useful for showing detailed errors in UI.
 *
 * @param opGraph - Operation graph to validate
 * @param machine - Target machine
 * @returns Validation issues
 */
export function getValidationIssues(
  opGraph: OperationGraph,
  machine: MachineProfile
): Array<{ code: string; message: string; severity: string }> {
  const validation = validateOperationGraph(opGraph, machine);
  return validation.issues;
}

/**
 * Extract G-code text from bundle.
 *
 * @param bundle - G-code bundle
 * @param index - File index (default 0)
 * @returns G-code text or undefined
 */
export function extractGcodeText(bundle: GcodeBundle, index = 0): string | undefined {
  const file = bundle.files[index];
  if (!file) return undefined;
  return new TextDecoder().decode(file.bytes);
}

/**
 * Create a downloadable blob from G-code bundle.
 *
 * @param bundle - G-code bundle
 * @param index - File index (default 0)
 * @returns Blob for download
 */
export function createGcodeBlob(bundle: GcodeBundle, index = 0): Blob | undefined {
  const file = bundle.files[index];
  if (!file) return undefined;
  return new Blob([new Uint8Array(file.bytes)], { type: 'text/plain' });
}

/**
 * Get filename from bundle.
 *
 * @param bundle - G-code bundle
 * @param index - File index (default 0)
 * @returns Filename (e.g., "JOB123.nc")
 */
export function getGcodeFilename(bundle: GcodeBundle, index = 0): string {
  const file = bundle.files[index];
  if (!file) return 'program.nc';
  return file.path.split('/').pop() ?? 'program.nc';
}
