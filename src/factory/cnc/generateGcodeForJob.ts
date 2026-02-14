/**
 * generateGcodeForJob.ts - G-code Generation Helper for Factory Module
 *
 * Bridges factory packet data with CNC G-code generation module.
 * Handles the complete workflow: packet → operation graph → G-code bundle.
 *
 * D3.2: Now supports caching with deterministic cache keys.
 * D4: Added workpiece transform support.
 * D6-D: Added tool usage observer wiring (read-only, never affects G-code).
 *
 * @version 1.3.0 - Phase D6-D
 */

import type { FactoryPacket } from '../packet/types';
import type { MachineProfile } from '../../cnc/machine/machineProfile';
import type { GcodeBundle } from '../../cnc/post/types';
import type { OperationGraph } from '../../cnc/operation/operationTypes';
import type {
  CncGenerateRequest,
  CncGenerateResponse,
  CncValidationIssue,
  CncMachineOption,
} from '../types/cnc';
import { buildOperationGraph, hasBuildErrors } from '../../cnc/mapping/buildOperationGraph';
import { markPacketAsValidated } from '../../cnc/mapping/g9AssertValidPacket';
import { buildGcodeBundle, canGenerateBundle, getValidationIssues } from '../../cnc/buildGcodeBundle';
import { getMachineProfile, getAllMachinePresets, type MachineId } from '../../cnc/machine';
import {
  buildCncBundleZip,
  downloadCncBundleZip,
  type BuildCncBundleResult,
  type CncDialect,
} from '../../cnc/bundle';
import {
  getCachedBundle,
  cacheBundle,
  hasCachedBundle,
  invalidateJobCache,
  getCacheStatsForJob,
  type CacheLookupInput,
} from '../../cnc/cache';
import {
  adaptWorkpieceConfigToTransforms,
  validateWorkpieceConfig,
} from './workpieceConfigAdapter';
import { wireToolUsageAfterCncBuild } from '../tooling';

// ============================================================================
// Main Generation Function
// ============================================================================

/**
 * Generate G-code bundle for a job from verified packet.
 *
 * @param packet - Verified factory packet
 * @param request - Generation request with machine and options
 * @returns Generation response (success or error)
 */
export async function generateGcodeForJob(
  packet: FactoryPacket | null,
  request: CncGenerateRequest
): Promise<CncGenerateResponse> {
  // Validate packet exists
  if (!packet) {
    return {
      ok: false,
      code: 'E_CNC_NO_PACKET',
      message: 'No verified packet available. Please ingest and verify a factory packet first.',
    };
  }

  // Validate packet has drill map
  if (!packet.drillMap || !packet.drillMap.panels || packet.drillMap.panels.length === 0) {
    return {
      ok: false,
      code: 'E_CNC_NO_DRILL_MAP',
      message: 'Packet has no drill map data. Cannot generate G-code.',
    };
  }

  // Get machine profile
  const machine = getMachineProfile(request.machineId as MachineId);
  if (!machine) {
    return {
      ok: false,
      code: 'E_CNC_MACHINE_NOT_FOUND',
      message: `Machine profile not found: ${request.machineId}`,
    };
  }

  // D4: Validate workpiece config if provided
  if (request.workpieceConfig) {
    const workpieceErrors = validateWorkpieceConfig(request.workpieceConfig, packet.drillMap.panels);
    if (workpieceErrors.length > 0) {
      return {
        ok: false,
        code: 'E_CNC_VALIDATION_FAILED',
        message: `Workpiece configuration invalid: ${workpieceErrors.join(', ')}`,
        validationIssues: workpieceErrors.map((e) => ({
          code: 'WORKPIECE_CONFIG_ERROR',
          message: e,
          severity: 'ERROR' as const,
        })),
      };
    }
  }

  // D4: Convert workpiece config to transform contexts
  const workpieceTransforms = request.workpieceConfig
    ? adaptWorkpieceConfigToTransforms(request.workpieceConfig, packet.drillMap.panels)
    : undefined;

  // Build operation graph from packet (with optional workpiece transforms)
  // G9: Mark packet as validated (trusted internal path from verified packet)
  const validatedPacket = markPacketAsValidated(packet);
  const buildResult = buildOperationGraph(validatedPacket, machine, {
    drillMapOptions: {
      workpieceTransforms,
      attachWorkpieceContext: workpieceTransforms && workpieceTransforms.size > 0,
    },
  });

  if (hasBuildErrors(buildResult)) {
    return {
      ok: false,
      code: 'E_CNC_VALIDATION_FAILED',
      message: `Failed to build operation graph: ${buildResult.errors.join(', ')}`,
      validationIssues: buildResult.errors.map((e) => ({
        code: 'BUILD_ERROR',
        message: e,
        severity: 'ERROR' as const,
      })),
    };
  }

  // Check if bundle can be generated (validation against machine)
  if (!canGenerateBundle(buildResult.graph, machine)) {
    const issues = getValidationIssues(buildResult.graph, machine);
    return {
      ok: false,
      code: 'E_CNC_VALIDATION_FAILED',
      message: 'Operation graph validation failed for target machine',
      validationIssues: issues.map((i) => ({
        code: i.code,
        message: i.message,
        severity: i.severity as 'ERROR' | 'WARNING',
      })),
    };
  }

  // Build G-code bundle
  try {
    const bundleResult = await buildGcodeBundle({
      opGraph: buildResult.graph,
      machine,
      programName: request.programName || request.jobId,
      packetContentHash: packet.manifest.contentHash,
      jobId: request.jobId,
      options: {
        lineNumbers: request.lineNumbers ?? false,
        includeComments: request.includeComments ?? true,
        safeZ: request.safeZ,
        feedDefault: request.feedDefault,
        rpmDefault: request.rpmDefault,
      },
    });

    if (bundleResult.status === 'FAIL') {
      return {
        ok: false,
        code: 'E_CNC_POST_FAILED',
        message: `G-code post-processing failed: ${bundleResult.errors.join(', ')}`,
      };
    }

    return {
      ok: true,
      bundle: bundleResult.bundle,
      stats: bundleResult.bundle.stats,
      warnings: [...buildResult.warnings, ...bundleResult.bundle.warnings],
    };
  } catch (error) {
    return {
      ok: false,
      code: 'E_CNC_INTERNAL',
      message: error instanceof Error ? error.message : 'Internal error during G-code generation',
    };
  }
}

// ============================================================================
// Operation Graph Preview
// ============================================================================

/**
 * Build operation graph preview (without generating G-code).
 * Useful for showing operation count and validation before generation.
 *
 * @param packet - Verified factory packet
 * @param machineId - Target machine ID
 * @returns Operation graph or error
 */
export function buildOperationGraphPreview(
  packet: FactoryPacket | null,
  machineId: string
): { graph: OperationGraph; warnings: string[] } | { error: string; issues?: CncValidationIssue[] } {
  if (!packet) {
    return { error: 'No verified packet available' };
  }

  if (!packet.drillMap) {
    return { error: 'Packet has no drill map data' };
  }

  const machine = getMachineProfile(machineId as MachineId);
  if (!machine) {
    return { error: `Machine not found: ${machineId}` };
  }

  // G9: Mark packet as validated (trusted internal path)
  const validatedPacket = markPacketAsValidated(packet);
  const result = buildOperationGraph(validatedPacket, machine);

  if (hasBuildErrors(result)) {
    return {
      error: result.errors.join(', '),
      issues: result.errors.map((e) => ({
        code: 'BUILD_ERROR',
        message: e,
        severity: 'ERROR' as const,
      })),
    };
  }

  return {
    graph: result.graph,
    warnings: result.warnings,
  };
}

// ============================================================================
// Machine Options
// ============================================================================

/**
 * Get available machine options for CNC generation.
 * Checks compatibility with the verified packet.
 *
 * @param packet - Verified factory packet (optional)
 * @returns List of machine options with availability status
 */
export function getAvailableMachines(packet: FactoryPacket | null): CncMachineOption[] {
  const allMachines = getAllMachinePresets();

  return allMachines.map((machine) => {
    const option: CncMachineOption = {
      id: machine.id,
      name: machine.name,
      dialect: machine.dialect,
      description: machine.description || '',
      available: true,
    };

    // Check compatibility with packet
    if (!packet) {
      option.available = false;
      option.unavailableReason = 'No verified packet loaded';
      return option;
    }

    if (!packet.drillMap || packet.drillMap.panels.length === 0) {
      option.available = false;
      option.unavailableReason = 'Packet has no drill data';
      return option;
    }

    // Check if packet tools are compatible with machine
    const packetTools = packet.drillMap.tools || [];
    const machineToolIds = (machine.toolTable ?? machine.tools).map((t: { toolId: string }) => t.toolId);

    const missingTools = packetTools.filter(
      (t) => !machineToolIds.includes(t.toolId)
    );

    if (missingTools.length > 0) {
      option.available = true; // Still available, just with warnings
      option.unavailableReason = `${missingTools.length} tool(s) not in machine tool table`;
    }

    return option;
  });
}

/**
 * Get default machine for G-code generation.
 * Returns the first available KDT machine, or first available machine.
 *
 * @param packet - Verified factory packet
 * @returns Default machine ID or null
 */
export function getDefaultMachineId(packet: FactoryPacket | null): string | null {
  const options = getAvailableMachines(packet);
  const available = options.filter((o) => o.available);

  if (available.length === 0) return null;

  // Prefer KDT machines
  const kdt = available.find((o) => o.id.startsWith('KDT'));
  if (kdt) return kdt.id;

  return available[0].id;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Quick check if G-code generation is possible.
 *
 * @param packet - Verified factory packet
 * @param machineId - Target machine ID
 * @returns true if generation is possible
 */
export function canGenerateGcode(packet: FactoryPacket | null, machineId: string): boolean {
  if (!packet || !packet.drillMap) return false;

  const machine = getMachineProfile(machineId as MachineId);
  if (!machine) return false;

  // G9: Mark packet as validated (trusted internal path)
  const validatedPacket = markPacketAsValidated(packet);
  const result = buildOperationGraph(validatedPacket, machine);
  if (hasBuildErrors(result)) return false;

  return canGenerateBundle(result.graph, machine);
}

/**
 * Get detailed validation status for G-code generation.
 *
 * @param packet - Verified factory packet
 * @param machineId - Target machine ID
 * @returns Validation status with issues
 */
export function getGenerationValidation(
  packet: FactoryPacket | null,
  machineId: string
): {
  canGenerate: boolean;
  issues: CncValidationIssue[];
  operationCount: number;
  estimatedTime: number;
} {
  const issues: CncValidationIssue[] = [];

  if (!packet) {
    return {
      canGenerate: false,
      issues: [{ code: 'NO_PACKET', message: 'No verified packet', severity: 'ERROR' }],
      operationCount: 0,
      estimatedTime: 0,
    };
  }

  if (!packet.drillMap) {
    return {
      canGenerate: false,
      issues: [{ code: 'NO_DRILL_MAP', message: 'Packet has no drill data', severity: 'ERROR' }],
      operationCount: 0,
      estimatedTime: 0,
    };
  }

  const machine = getMachineProfile(machineId as MachineId);
  if (!machine) {
    return {
      canGenerate: false,
      issues: [{ code: 'NO_MACHINE', message: `Machine not found: ${machineId}`, severity: 'ERROR' }],
      operationCount: 0,
      estimatedTime: 0,
    };
  }

  // G9: Mark packet as validated (trusted internal path)
  const validatedPacket = markPacketAsValidated(packet);
  const buildResult = buildOperationGraph(validatedPacket, machine);

  if (hasBuildErrors(buildResult)) {
    issues.push(
      ...buildResult.errors.map((e) => ({
        code: 'BUILD_ERROR',
        message: e,
        severity: 'ERROR' as const,
      }))
    );
  }

  issues.push(
    ...buildResult.warnings.map((w) => ({
      code: 'BUILD_WARNING',
      message: w,
      severity: 'WARNING' as const,
    }))
  );

  const validationIssues = getValidationIssues(buildResult.graph, machine);
  issues.push(
    ...validationIssues.map((i) => ({
      code: i.code,
      message: i.message,
      severity: i.severity as 'ERROR' | 'WARNING',
    }))
  );

  const canGenerate = !hasBuildErrors(buildResult) && canGenerateBundle(buildResult.graph, machine);

  return {
    canGenerate,
    issues,
    operationCount: buildResult.graph.operations.length,
    estimatedTime: buildResult.graph.estimatedTimeSeconds || 0,
  };
}

// ============================================================================
// CNC Bundle ZIP Generation (D3.1)
// ============================================================================

export interface CncBundleZipRequest {
  /** Job ID for the bundle */
  jobId: string;
  /** Target machine ID */
  machineId: string;
  /** Program name (defaults to jobId) */
  programName?: string;
  /** Include line numbers in G-code */
  lineNumbers?: boolean;
  /** Include comments in G-code */
  includeComments?: boolean;
  /** Skip cache lookup (force regeneration) */
  skipCache?: boolean;
}

export type CncBundleZipResponse =
  | {
      ok: true;
      result: BuildCncBundleResult;
      /** Whether result came from cache */
      cacheHit: boolean;
      /** Cache key used */
      cacheKey: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
    }

/**
 * Generate a factory-verifiable CNC bundle ZIP.
 *
 * This creates a complete bundle with:
 * - cnc-manifest.json (trust chain linkage)
 * - opgraph.json (stable-serialized operation graph)
 * - nc/PROG.nc (G-code program)
 * - checksums.sha256 (factory-friendly checksums)
 *
 * D3.2: Supports caching with deterministic cache keys.
 * Cache hit = identical opGraph + identical G-code (byte-for-byte).
 *
 * @param packet - Verified factory packet
 * @param request - Bundle generation request
 * @returns ZIP bundle or error (with cache hit info)
 */
export async function generateCncBundleZip(
  packet: FactoryPacket | null,
  request: CncBundleZipRequest
): Promise<CncBundleZipResponse> {
  // Validate packet
  if (!packet) {
    return {
      ok: false,
      code: 'E_CNC_NO_PACKET',
      message: 'No verified packet available',
    };
  }

  if (!packet.drillMap) {
    return {
      ok: false,
      code: 'E_CNC_NO_DRILL_MAP',
      message: 'Packet has no drill map data',
    };
  }

  // Get machine profile
  const machine = getMachineProfile(request.machineId as MachineId);
  if (!machine) {
    return {
      ok: false,
      code: 'E_CNC_MACHINE_NOT_FOUND',
      message: `Machine not found: ${request.machineId}`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // D3.2: Check cache first (unless skipCache is set)
  // ─────────────────────────────────────────────────────────────────────────
  const cacheLookupInput: CacheLookupInput = {
    packetContentHash: packet.manifest.contentHash,
    machineId: machine.id,
    dialect: machine.dialect as CncDialect,
  };

  if (!request.skipCache) {
    try {
      const cacheResult = await getCachedBundle(cacheLookupInput);

      if (cacheResult.hit && cacheResult.bundle) {
        // Cache hit! Return cached bundle
        const { metadata, zipBytes } = cacheResult.bundle;

        return {
          ok: true,
          result: {
            zipBytes,
            manifest: {
              schema: 'monolith.cnc.manifest@1.0',
              jobId: metadata.jobId,
              machineId: metadata.machineId,
              packetContentHash: metadata.packetContentHash,
              opGraphHash: '', // Not stored in metadata, but bundle is verified
              gcodeSha256: metadata.gcodeSha256,
              post: metadata.post,
              createdAt: new Date(metadata.cachedAt).getTime(),
              files: [],
              stats: metadata.opCount ? { opCount: metadata.opCount } : undefined,
            },
            filename: metadata.filename,
          },
          cacheHit: true,
          cacheKey: cacheResult.cacheKey,
        };
      }
    } catch {
      // Cache lookup failed, continue with generation
      // (Don't fail the whole operation for cache errors)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build operation graph
  // G9: Mark packet as validated (trusted internal path from verified packet)
  // ─────────────────────────────────────────────────────────────────────────
  const validatedPacket = markPacketAsValidated(packet);
  const buildResult = buildOperationGraph(validatedPacket, machine);
  if (hasBuildErrors(buildResult)) {
    return {
      ok: false,
      code: 'E_CNC_BUILD_FAILED',
      message: `Build failed: ${buildResult.errors.join(', ')}`,
    };
  }

  // Build G-code bundle first to get the G-code bytes
  const gcodeResult = await buildGcodeBundle({
    opGraph: buildResult.graph,
    machine,
    programName: request.programName || request.jobId,
    packetContentHash: packet.manifest.contentHash,
    jobId: request.jobId,
    options: {
      lineNumbers: request.lineNumbers ?? false,
      includeComments: request.includeComments ?? true,
    },
  });

  if (gcodeResult.status === 'FAIL') {
    return {
      ok: false,
      code: 'E_CNC_POST_FAILED',
      message: `G-code generation failed: ${gcodeResult.errors.join(', ')}`,
    };
  }

  const gcodeFile = gcodeResult.bundle.files[0];
  if (!gcodeFile) {
    return {
      ok: false,
      code: 'E_CNC_NO_GCODE',
      message: 'No G-code file in bundle',
    };
  }

  // Build CNC bundle ZIP
  try {
    const result = await buildCncBundleZip({
      jobId: request.jobId,
      machineId: machine.id as 'KDT' | 'BIESSE',
      packetContentHash: packet.manifest.contentHash,
      opGraph: buildResult.graph,
      gcode: {
        path: gcodeFile.path,
        bytes: gcodeFile.bytes,
      },
      dialect: machine.dialect as CncDialect,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // D3.2: Store in cache
    // ─────────────────────────────────────────────────────────────────────────
    let cacheKey = '';
    try {
      cacheKey = await cacheBundle({
        packetContentHash: packet.manifest.contentHash,
        machineId: machine.id,
        dialect: machine.dialect as CncDialect,
        zipBytes: result.zipBytes,
        manifest: result.manifest,
        filename: result.filename,
      });
    } catch {
      // Cache store failed, but bundle generation succeeded
      // Don't fail the operation for cache errors
    }

    // ─────────────────────────────────────────────────────────────────────────
    // D6-D: Tool usage tracking (read-only observer, never affects G-code)
    // ─────────────────────────────────────────────────────────────────────────
    await wireToolUsageAfterCncBuild(
      {
        opGraph: buildResult.graph,
        cacheHit: false, // Fresh generation
        observerContext: {
          jobId: request.jobId,
          machineId: machine.id,
          dialect: machine.dialect,
          postVersion: result.manifest.post?.version ?? '1.0.0',
          programHash: result.manifest.gcodeSha256,
          packetContentHash: packet.manifest.contentHash,
          occurredAt: Date.now(),
        },
      },
      { persistEventLog: true, enableOnCacheHit: false, swallowErrors: true }
    );

    return {
      ok: true,
      result,
      cacheHit: false,
      cacheKey,
    };
  } catch (error) {
    return {
      ok: false,
      code: 'E_CNC_BUNDLE_FAILED',
      message: error instanceof Error ? error.message : 'Bundle creation failed',
    };
  }
}

/**
 * Generate and download CNC bundle ZIP in one step.
 *
 * @param packet - Verified factory packet
 * @param request - Bundle generation request
 * @returns true if download initiated, false on error
 */
export async function generateAndDownloadCncBundle(
  packet: FactoryPacket | null,
  request: CncBundleZipRequest
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await generateCncBundleZip(packet, request);

  if (!response.ok) {
    return { ok: false, message: response.message };
  }

  downloadCncBundleZip(response.result);
  return { ok: true };
}
