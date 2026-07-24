/**
 * canonicalProfile.ts - Canonical machine-profile normalization and hashing
 *
 * The one canonical machine profile (design §12) is reduced to a single stable
 * digest here so a candidate, the capability compiler, an attestation, and the
 * verifier can all bind the SAME bytes. Normalization sorts every set-like field
 * (operation catalogue, tools, ranges, faces) so the hash is independent of the
 * order a legacy or client source happened to use; array semantics that matter
 * elsewhere in the protocol are irrelevant for a profile, whose lists are sets.
 *
 * Pure functions only: no I/O, clock, locale, or randomness. The digest is a
 * domain-separated SHA-256 over canonical JSON (design §11.1).
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { canonicalJson } from '../canonical/canonicalJson.js';
import { sha256Hex } from '../canonical/hash.js';
import type { Sha256Hex, CapabilityRangeV1 } from '../contracts/protocolV3.js';
import type {
  CanonicalMachineProfileV1,
  CanonicalToolBindingV1,
} from '../contracts/capability.js';

export type { CanonicalMachineProfileV1, CanonicalToolBindingV1 } from '../contracts/capability.js';

const PROFILE_DOMAIN = 'MONOLITH/CanonicalMachineProfile/V1';

/**
 * Return a normalized copy of the canonical profile with every set-like field
 * sorted into a stable order. Sorting is by the natural string key of each
 * element so two profiles that differ only in source ordering normalize equal.
 */
export function normalizeCanonicalProfile(
  profile: CanonicalMachineProfileV1,
): CanonicalMachineProfileV1 {
  const tools: CanonicalToolBindingV1[] = [...profile.tools]
    .map((t) => normalizeTool(t))
    .sort((a, b) => (a.toolId < b.toolId ? -1 : a.toolId > b.toolId ? 1 : 0));

  const ranges: CapabilityRangeV1[] = [...profile.ranges].sort((a, b) =>
    a.parameter < b.parameter ? -1 : a.parameter > b.parameter ? 1 : 0,
  );

  return {
    machineId: profile.machineId,
    machineVersion: profile.machineVersion,
    dialectVersion: profile.dialectVersion,
    operationCatalogue: [...profile.operationCatalogue].sort(),
    tools,
    ranges,
    faces: [...profile.faces].sort(),
    units: profile.units,
    coordinateConvention: profile.coordinateConvention,
    postprocessorId: profile.postprocessorId,
    postprocessorVersion: profile.postprocessorVersion,
    postprocessorBinaryHash: profile.postprocessorBinaryHash,
  };
}

function normalizeTool(tool: CanonicalToolBindingV1): CanonicalToolBindingV1 {
  // Preserve only the canonical tool identity; drop incidental extra fields.
  return tool.description === undefined
    ? { toolId: tool.toolId, machineNumber: tool.machineNumber }
    : { toolId: tool.toolId, machineNumber: tool.machineNumber, description: tool.description };
}

/**
 * Compute the domain-separated canonical profile hash (design §11.1, §12).
 * Two profiles hash equal iff their normalized forms are byte-identical.
 */
export function canonicalProfileHash(profile: CanonicalMachineProfileV1): Sha256Hex {
  const normalized = normalizeCanonicalProfile(profile);
  return sha256Hex(canonicalJson({ domain: PROFILE_DOMAIN, profile: normalized }));
}
