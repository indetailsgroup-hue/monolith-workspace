/**
 * Kernel Types - Request/Response types for Kernel Truth Service
 *
 * SPEC-08 v8.2: Plasticity-DNA Design Engine
 *
 * These types MUST match server's api/models.py exactly.
 */

// ============================================================================
// OPERATION KINDS
// ============================================================================

export type KernelOpKind =
  | 'createSolidFromProfile'
  | 'transformSolid'
  | 'mirrorSolid'
  | 'booleanCut'
  | 'filletEdges'
  | 'extractPlanarLoops'
  | 'projectFeaturesToPlane'
  | 'validateLoops';

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface KernelOpRequestV1 {
  schema: 'monolith.kernel-op-request.v1';
  requestId: string;
  jobId: string;
  opKind: KernelOpKind;

  // Command identification
  commandId: string;
  commandVersion: number;
  commandInputs: unknown;
  selectionKernelIds: string[];

  // Operation payload
  payload: unknown;

  // Fingerprints for verification
  fingerprints: {
    commandFp: string;
    designFp?: string;
  };
}

export interface KernelBatchRequestV1 {
  schema: 'monolith.kernel-batch-request.v1';
  requestId: string;
  jobId: string;
  ops: KernelOpRequestV1[];
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface KernelTolerance {
  internalEps: number;
  exportEps: number;
  angleEpsDeg: number;
}

export interface KernelIssue {
  code: string;
  severity: 'INFO' | 'WARN' | 'BLOCK';
  message: string;
  refs?: string[];
  data?: unknown;
}

export interface KernelOpResponseV1 {
  schema: 'monolith.kernel-op-response.v1';
  requestId: string;
  ok: boolean;
  tolerance: KernelTolerance;
  responseFp: string;

  // Created/modified entities
  created?: {
    solidIds: string[];
    [key: string]: unknown;
  };

  // Delta for undo/redo
  delta?: {
    schema: 'monolith.kernel-delta.v1';
    deltaId: string;
    ops: unknown[];
    writes: string[];
  };

  // Extracted loops (for extractPlanarLoops)
  loops?: {
    schema: 'monolith.planar-loops.v1';
    faceId?: string;
    outer: {
      closed: boolean;
      ccw: boolean;
      segs: LoopSegment[];
    };
    inners: Array<{
      closed: boolean;
      ccw: boolean;
      segs: LoopSegment[];
    }>;
  };

  // Issues/warnings
  issues?: KernelIssue[];

  // Metadata
  meta?: {
    kernelVersion: string;
    impl: string;
  };
}

export interface LoopSegment {
  type: 'line' | 'arc';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  // Arc-specific
  cx?: number;
  cy?: number;
  ccw?: boolean;
}

export interface KernelBatchResponseV1 {
  schema: 'monolith.kernel-batch-response.v1';
  requestId: string;
  ok: boolean;
  tolerance: KernelTolerance;
  responses: KernelOpResponseV1[];
  responseFp: string;
}

export interface KernelHealthResponse {
  ok: boolean;
  service: string;
  version: string;
  tolerance: KernelTolerance;
  tolPolicyId?: string;
}
