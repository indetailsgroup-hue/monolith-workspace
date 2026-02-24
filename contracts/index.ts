/**
 * MONOLITH Contracts - Public API
 *
 * SPEC-08 v8.2: Plasticity-DNA Design Engine
 *
 * This module exports all contract types and utilities for:
 * - Kernel Truth Service (B-Rep geometry operations)
 * - Command Registry (UI action definitions)
 */

// ============================================================================
// KERNEL TYPES
// ============================================================================

export type {
  // Transport
  KernelOpRequest,
  KernelOpResponse,
  KernelError,
  KernelErrorCode,

  // Geometry Primitives
  Path2D,
  PathSegment,
  Point3D,
  Vector3D,
  AABB,
  Matrix4x4,

  // Delta Chain
  KernelDeltaV1,

  // Flatten Output
  PlanarLoopsV1,
  Loop2D,
  LoopSegment,

  // Operation Payloads
  CreateSolidFromProfilePayload,
  CreateSolidFromProfileResult,
  BooleanCutPayload,
  BooleanCutResult,
  FilletEdgesPayload,
  FilletEdgesResult,
  ExtractPlanarLoopsPayload,
  ExtractPlanarLoopsResult,
  ValidateLoopsPayload,
  ValidateLoopsResult,
  ValidationIssue,
  GetSolidInfoPayload,
  GetSolidInfoResult,
  GetSolidMeshPayload,
  GetSolidMeshResult,
  MeshGroup,

  // Command Registry
  CommandDef,
  CommandCategory,
  CommandPrecondition,
} from './kernel/types';

// ============================================================================
// KERNEL UTILITIES
// ============================================================================

export {
  canonicalize,
  computeHash,
  isKernelError,
  isKernelSuccess,
} from './kernel/types';

// ============================================================================
// KERNEL CLIENT
// ============================================================================

export type {
  KernelClientConfig,
  KernelOpKind,
  KernelOpRequestV1,
  KernelOpResponseV1,
} from './kernel/client';

export {
  KernelClient,
  getKernelClient,
  resetKernelClient,
  computeCommandFp,
} from './kernel/client';
