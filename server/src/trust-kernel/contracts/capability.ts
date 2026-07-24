/**
 * capability.ts - Task 6 canonical machine-profile and capability contracts
 *
 * The single canonical machine-profile schema and the capability-compiler I/O
 * types for the MONOLITH Production Trust Kernel (approved design 2026-07-22 §12
 * capability safety, §13 error model). These types own the parts of the profile
 * the protocol `MachineCapabilityProfileV1` (Task 1) does not carry - the tool
 * machine (T/TNO) numbers and the postprocessor binary identity - so that ONE
 * canonical profile drives the compiler and the dialect-emission defense.
 *
 * `CompiledCapabilityReportV1` extends the protocol `CapabilityReportV1` with the
 * exhaustive `checkedOperationIds` set (design §12): on PASS it is the sorted set
 * of ALL input operation IDs, and a dropped ID is a defect.
 *
 * Phase: NOT_FOR_PRODUCTION. Types only; no runtime behaviour.
 *
 * @version 0.13.2
 */

import type {
  Sha256Hex,
  CapabilityRangeV1,
  CapabilityReportV1,
} from './protocolV3.js';

// ============================================================================
// Canonical machine profile (design §12)
// ============================================================================

/**
 * A tool identity in the canonical profile: the protocol tool id bound to its
 * physical machine number (the `T`/`TNO` a dialect emits). The machine number is
 * a required, explicit binding - the V3 path never synthesizes a default.
 */
export interface CanonicalToolBindingV1 {
  toolId: string;
  machineNumber: number;
  description?: string;
}

/**
 * The one canonical machine-capability profile schema (design §12). Every field
 * the spec enumerates is present: machine/dialect versions, the operation
 * catalogue, tool IDs + machine numbers, parameter ranges, faces, units, the
 * coordinate convention, and the postprocessor id/version/binary hash.
 */
export interface CanonicalMachineProfileV1 {
  machineId: string;
  machineVersion: string;
  dialectVersion: string;
  /** Supported operation types (the operation catalogue). */
  operationCatalogue: string[];
  /** Tool IDs bound to their machine numbers. */
  tools: CanonicalToolBindingV1[];
  /** Parameter ranges enforced by the compiler. */
  ranges: CapabilityRangeV1[];
  faces: string[];
  units: string;
  coordinateConvention: string;
  postprocessorId: string;
  postprocessorVersion: string;
  postprocessorBinaryHash: Sha256Hex;
}

// ============================================================================
// Capability compiler I/O (design §8, §12)
// ============================================================================

/** One operation the compiler must exhaustively evaluate. */
export interface CapabilityOperationV1 {
  operationId: string;
  operationType: string;
  toolId: string;
  /** The face the operation runs on, if the profile constrains faces. */
  face?: string;
  /** Named numeric parameters checked against the profile ranges. */
  parameters: Record<string, number>;
}

/** The snapshot of operations to compile, bound to a machine-profile hash. */
export interface CapabilitySnapshotV1 {
  machineProfileHash: Sha256Hex;
  operations: CapabilityOperationV1[];
}

/**
 * The compiled capability report: the protocol `CapabilityReportV1` plus the
 * exhaustive checked-operation set. On PASS `checkedOperationIds` is the sorted
 * set of ALL input operation IDs (design §12).
 */
export interface CompiledCapabilityReportV1 extends CapabilityReportV1 {
  checkedOperationIds: string[];
}

// ============================================================================
// Dialect-emission defense (design §12)
// ============================================================================

/** A per-operation tool-number binding produced by the dialect defense. */
export interface DialectToolBindingV1 {
  operationId: string;
  toolId: string;
  machineNumber: number;
}

// ============================================================================
// Legacy / foreign profile input shapes (READ-ONLY inputs to the adapter)
// ============================================================================

/**
 * The shape of a legacy server `MachineProfile` (server/src/post/machineProfiles)
 * as the adapter reads it. Declared structurally (not imported) so this contracts
 * module stays free of runtime code and the post layer stays a read-only source.
 */
export interface LegacyServerProfileShape {
  id: string;
  version?: string;
  dialect?: string;
  tools?: Record<string, { toolId?: string; description?: string }>;
  toolNumberMap?: Record<string, number>;
  [key: string]: unknown;
}

/**
 * A minimal client / localStorage capability shape. Any additional field - most
 * importantly any attestation-like field - is ignored by the adapter.
 */
export interface ClientCapabilityProfileShape {
  machineId: string;
  machineVersion?: string;
  dialectVersion?: string;
  supportedOperationTypes?: string[];
  tools?: Array<{ toolId: string; description?: string }>;
  ranges?: CapabilityRangeV1[];
  faces?: string[];
  units?: string;
  coordinateConventions?: string;
  postprocessorVersion?: string;
  [key: string]: unknown;
}
