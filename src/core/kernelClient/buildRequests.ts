/**
 * Request Builders - Build kernel requests with computed fingerprints
 *
 * SPEC-08 v8.2: Plasticity-DNA Design Engine
 *
 * These builders compute commandFp automatically, ensuring
 * requests won't be rejected with COMMAND_FP_MISMATCH.
 */

import { computeCommandFp } from './kernelFp';
import type {
  KernelOpKind,
  KernelOpRequestV1,
  KernelBatchRequestV1,
} from './kernelTypes';

// ============================================================================
// REQUEST BUILDER
// ============================================================================

export interface BuildOpRequestArgs {
  requestId: string;
  jobId: string;
  opKind: KernelOpKind;
  commandId: string;
  commandVersion: number;
  commandInputs: unknown;
  selectionKernelIds: string[];
  payload: unknown;
  designFp?: string;
}

/**
 * Build single operation request with computed commandFp.
 *
 * @param args - Request arguments
 * @returns KernelOpRequestV1 ready to send
 */
export async function buildKernelOpRequest(args: BuildOpRequestArgs): Promise<KernelOpRequestV1> {
  const commandFp = await computeCommandFp({
    commandId: args.commandId,
    commandVersion: args.commandVersion,
    commandInputs: args.commandInputs,
    selectionKernelIds: args.selectionKernelIds,
  });

  return {
    schema: 'monolith.kernel-op-request.v1',
    requestId: args.requestId,
    jobId: args.jobId,
    opKind: args.opKind,
    commandId: args.commandId,
    commandVersion: args.commandVersion,
    commandInputs: args.commandInputs ?? {},
    selectionKernelIds: args.selectionKernelIds ?? [],
    payload: args.payload ?? {},
    fingerprints: {
      commandFp,
      ...(args.designFp ? { designFp: args.designFp } : {}),
    },
  };
}

// ============================================================================
// BATCH REQUEST BUILDER
// ============================================================================

export interface BuildBatchRequestArgs {
  requestId: string;
  jobId: string;
  ops: Array<Omit<BuildOpRequestArgs, 'jobId'>>;
}

/**
 * Build batch request with computed fingerprints for all ops.
 *
 * @param args - Batch arguments
 * @returns KernelBatchRequestV1 ready to send
 */
export async function buildKernelBatchRequest(args: BuildBatchRequestArgs): Promise<KernelBatchRequestV1> {
  const builtOps: KernelOpRequestV1[] = [];

  for (const op of args.ops) {
    builtOps.push(await buildKernelOpRequest({
      ...op,
      jobId: args.jobId,
    }));
  }

  return {
    schema: 'monolith.kernel-batch-request.v1',
    requestId: args.requestId,
    jobId: args.jobId,
    ops: builtOps,
  };
}

// ============================================================================
// CONVENIENCE BUILDERS
// ============================================================================

/**
 * Build createSolidFromProfile request.
 */
export async function buildCreateSolidRequest(args: {
  requestId: string;
  jobId: string;
  profile2d: { closed: boolean; segs: unknown[] };
  thickness: number;
  width?: number;
  height?: number;
}): Promise<KernelOpRequestV1> {
  return buildKernelOpRequest({
    requestId: args.requestId,
    jobId: args.jobId,
    opKind: 'createSolidFromProfile',
    commandId: 'panel.create',
    commandVersion: 1,
    commandInputs: {
      width: args.width,
      height: args.height,
      finishedThickness: args.thickness,
    },
    selectionKernelIds: [],
    payload: {
      profile2d: args.profile2d,
      thickness: args.thickness,
    },
  });
}

/**
 * Build extractPlanarLoops request.
 */
export async function buildExtractLoopsRequest(args: {
  requestId: string;
  jobId: string;
  solidId: string;
  faceId?: string;
}): Promise<KernelOpRequestV1> {
  return buildKernelOpRequest({
    requestId: args.requestId,
    jobId: args.jobId,
    opKind: 'extractPlanarLoops',
    commandId: 'manufacturing.flatten',
    commandVersion: 1,
    commandInputs: { solidId: args.solidId },
    selectionKernelIds: [args.solidId],
    payload: {
      solidId: args.solidId,
      faceId: args.faceId ?? 'FACE_TOP',
    },
  });
}

/**
 * Build validateLoops request.
 */
export async function buildValidateLoopsRequest(args: {
  requestId: string;
  jobId: string;
  loops: unknown;
  rulesetId?: string;
}): Promise<KernelOpRequestV1> {
  return buildKernelOpRequest({
    requestId: args.requestId,
    jobId: args.jobId,
    opKind: 'validateLoops',
    commandId: 'manufacturing.runGate',
    commandVersion: 1,
    commandInputs: { rulesetId: args.rulesetId ?? 'flatten.v1' },
    selectionKernelIds: [],
    payload: {
      loops: args.loops,
      rulesetId: args.rulesetId ?? 'flatten.v1',
    },
  });
}
