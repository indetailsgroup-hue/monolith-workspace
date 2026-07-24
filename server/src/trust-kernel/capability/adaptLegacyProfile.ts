/**
 * adaptLegacyProfile.ts - Read-only legacy/foreign profile adapter (design §15.1)
 *
 * Canonicalization-first migration (design §15.1): a legacy server `MachineProfile`,
 * a client/localStorage capability shape, or any arbitrary override is a READ-ONLY
 * input that passes through this adapter into the protocol `MachineCapabilityProfileV1`.
 * The adapter constructs ONLY the known canonical fields, so a forged `attested`,
 * `attestationStatus`, or `attestation` field on the input is silently dropped and
 * can NEVER grant attestation authority (design §12). Authority is acquired only
 * later, through a signed `MachineProfileAttestationV1` verified by Task 3.
 *
 * Pure function: no I/O, clock, or randomness. A structurally unrecognizable input
 * fails closed with `CAP_PROFILE_MISMATCH`.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { ok, err, type TrustResult } from '../result.js';
import type {
  MachineCapabilityProfileV1,
  CapabilityToolV1,
  CapabilityRangeV1,
} from '../contracts/protocolV3.js';

export type { MachineCapabilityProfileV1 } from '../contracts/protocolV3.js';

/**
 * Adapt a legacy/foreign profile shape into the canonical protocol
 * `MachineCapabilityProfileV1`. The input is treated as untrusted and read-only.
 */
export function adaptLegacyProfile(input: unknown): TrustResult<MachineCapabilityProfileV1> {
  if (input === null || typeof input !== 'object') {
    return err('CAP_PROFILE_MISMATCH', { reason: 'profile must be a non-null object' });
  }
  const obj = input as Record<string, unknown>;

  // Client / localStorage capability shape is keyed by `machineId`.
  if (typeof obj.machineId === 'string') {
    return adaptClientShape(obj);
  }
  // Legacy server `MachineProfile` is keyed by `id` with an object tool table.
  if (typeof obj.id === 'string') {
    return adaptLegacyServerShape(obj);
  }
  return err('CAP_PROFILE_MISMATCH', { reason: 'unrecognized profile shape' });
}

// ---------------------------------------------------------------------------
// Client / localStorage capability shape
// ---------------------------------------------------------------------------

function adaptClientShape(obj: Record<string, unknown>): TrustResult<MachineCapabilityProfileV1> {
  const machineId = obj.machineId as string;
  if (machineId.length === 0) {
    return err('CAP_PROFILE_MISMATCH', { field: 'machineId', reason: 'empty' });
  }
  if (!Array.isArray(obj.tools)) {
    return err('CAP_PROFILE_MISMATCH', { field: 'tools', reason: 'expected an array' });
  }
  const tools: CapabilityToolV1[] = [];
  for (const raw of obj.tools) {
    if (raw === null || typeof raw !== 'object' || typeof (raw as { toolId?: unknown }).toolId !== 'string') {
      return err('CAP_PROFILE_MISMATCH', { field: 'tools[].toolId', reason: 'expected a string' });
    }
    tools.push(toCapabilityTool(raw as { toolId: string; description?: unknown }));
  }

  return ok({
    machineId,
    dialectVersion: stringOr(obj.dialectVersion, ''),
    supportedOperationTypes: stringArrayOr(obj.supportedOperationTypes),
    tools,
    ranges: rangeArrayOr(obj.ranges),
    faces: stringArrayOr(obj.faces),
    units: stringOr(obj.units, ''),
    coordinateConventions: stringOr(obj.coordinateConventions, ''),
    postprocessorVersion: stringOr(obj.postprocessorVersion, ''),
  });
}

// ---------------------------------------------------------------------------
// Legacy server `MachineProfile` shape
// ---------------------------------------------------------------------------

function adaptLegacyServerShape(
  obj: Record<string, unknown>,
): TrustResult<MachineCapabilityProfileV1> {
  const id = obj.id as string;
  if (id.length === 0) {
    return err('CAP_PROFILE_MISMATCH', { field: 'id', reason: 'empty' });
  }
  const rawTools = obj.tools;
  if (rawTools === null || typeof rawTools !== 'object' || Array.isArray(rawTools)) {
    return err('CAP_PROFILE_MISMATCH', { field: 'tools', reason: 'expected a tool table object' });
  }
  const toolTable = rawTools as Record<string, { description?: unknown }>;
  const toolIds = Object.keys(toolTable);
  if (toolIds.length === 0) {
    return err('CAP_PROFILE_MISMATCH', { field: 'tools', reason: 'at least one tool required' });
  }
  const tools: CapabilityToolV1[] = toolIds.map((toolId) =>
    toCapabilityTool({ toolId, description: toolTable[toolId]?.description }),
  );

  return ok({
    machineId: id,
    dialectVersion: stringOr(obj.dialect, ''),
    // Legacy server profiles carry no operation catalogue, ranges, or faces; the
    // canonical authority for those is established downstream, never inferred here.
    supportedOperationTypes: [],
    tools,
    ranges: [],
    faces: [],
    // The legacy post system is millimetre-based (see makePostContext units: 'MM').
    units: 'MM',
    coordinateConventions: '',
    postprocessorVersion: stringOr(obj.version, ''),
  });
}

// ---------------------------------------------------------------------------
// Sanitizers (construct ONLY known fields; drop everything else)
// ---------------------------------------------------------------------------

function toCapabilityTool(raw: { toolId: string; description?: unknown }): CapabilityToolV1 {
  return typeof raw.description === 'string'
    ? { toolId: raw.toolId, description: raw.description }
    : { toolId: raw.toolId };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function stringArrayOr(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function rangeArrayOr(value: unknown): CapabilityRangeV1[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const ranges: CapabilityRangeV1[] = [];
  for (const raw of value) {
    if (
      raw !== null &&
      typeof raw === 'object' &&
      typeof (raw as CapabilityRangeV1).parameter === 'string' &&
      typeof (raw as CapabilityRangeV1).min === 'number' &&
      typeof (raw as CapabilityRangeV1).max === 'number' &&
      typeof (raw as CapabilityRangeV1).unit === 'string'
    ) {
      const r = raw as CapabilityRangeV1;
      ranges.push({ parameter: r.parameter, min: r.min, max: r.max, unit: r.unit });
    }
  }
  return ranges;
}
