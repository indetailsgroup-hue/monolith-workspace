/**
 * profileAdapter.test.ts - Task 6 legacy profile adapter + V3 tool-number fail-closed
 *
 * Coverage for the read-only legacy/foreign profile adapter and the V3 machine
 * tool-number resolver (approved design 2026-07-22 §12 capability safety, §15.1
 * canonicalization-first migration, §13 error model).
 *
 * Binding behaviour proven here:
 * - `adaptLegacyProfile` treats legacy server/client shapes as READ-ONLY inputs
 *   and produces a canonical `MachineCapabilityProfileV1`. Local storage,
 *   client overrides, or a forged `attested`/`attestationStatus` field NEVER
 *   grant attestation authority - the adapter carries no attestation status.
 * - The V3 tool-number path (`resolveToolNumberV3`) FAILS CLOSED on an unknown
 *   tool (`CAP_UNKNOWN_TOOL`), removing the legacy `unknown tool -> 1` default
 *   from any V3 invocation. The legacy `PostContext` retains its historical
 *   reading, demonstrated side-by-side.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { describe, it, expect } from 'vitest';
import type { TrustResult } from '../result.js';
import type { MachineCapabilityProfileV1 } from '../contracts/protocolV3.js';
import { adaptLegacyProfile } from '../capability/adaptLegacyProfile.js';
import {
  KDT_MVP_PROFILE,
  makePostContext,
  resolveParams,
  resolveToolNumberV3,
  type MachineProfile,
} from '../../post/machineProfiles.js';

function expectOk<T>(result: TrustResult<T>): T {
  // strictNullChecks is off in this package, so `!result.ok` does not narrow the
  // boolean-discriminated union; read the failure code through an explicit cast.
  if (!result.ok) {
    throw new Error(`expected ok result, received failure ${(result as { code: string }).code}`);
  }
  return result.value;
}

// ---------------------------------------------------------------------------
// adaptLegacyProfile - legacy server MachineProfile (read-only input)
// ---------------------------------------------------------------------------

describe('adaptLegacyProfile: legacy server profile is a read-only input (design §15.1)', () => {
  it('maps a legacy KDT server profile into a canonical MachineCapabilityProfileV1', () => {
    const profile: MachineCapabilityProfileV1 = expectOk(adaptLegacyProfile(KDT_MVP_PROFILE));

    expect(profile.machineId).toBe('KDT_MVP_TH_01');
    expect(profile.dialectVersion).toBe('KDT_ISO');
    // Every legacy tool id is carried across as a canonical tool identity.
    const toolIds = profile.tools.map((t) => t.toolId).sort();
    expect(toolIds).toEqual(Object.keys(KDT_MVP_PROFILE.tools).sort());
    expect(profile.units).toBe('MM');
  });

  it('never lets a forged attestation field on the input grant authority', () => {
    const forged = {
      ...KDT_MVP_PROFILE,
      // Attacker-supplied fields a localStorage / client override might carry.
      attested: true,
      attestationStatus: 'ACTIVE',
      attestation: { status: 'ACTIVE', signature: 'x' },
    } as unknown;

    const profile = expectOk(adaptLegacyProfile(forged)) as MachineCapabilityProfileV1 &
      Record<string, unknown>;

    // The canonical output carries NO attestation status of any kind.
    expect(profile.attested).toBeUndefined();
    expect(profile.attestationStatus).toBeUndefined();
    expect(profile.attestation).toBeUndefined();
    expect('status' in profile).toBe(false);
  });

  it('accepts a minimal client/localStorage capability shape as a read-only input', () => {
    const clientShape = {
      machineId: 'CLIENT-CNC-9',
      dialectVersion: 'GENERIC_ISO',
      supportedOperationTypes: ['DRILL', 'ROUTE'],
      tools: [{ toolId: 'T1' }, { toolId: 'T2' }],
      ranges: [{ parameter: 'depth', min: 0, max: 30, unit: 'mm' }],
      faces: ['TOP'],
      units: 'mm',
      coordinateConventions: 'ISO',
      postprocessorVersion: '0.0.1',
      // A hostile override that must be ignored.
      attestationStatus: 'ACTIVE',
    };
    const profile = expectOk(adaptLegacyProfile(clientShape)) as MachineCapabilityProfileV1 &
      Record<string, unknown>;
    expect(profile.machineId).toBe('CLIENT-CNC-9');
    expect(profile.tools.map((t) => t.toolId)).toEqual(['T1', 'T2']);
    expect(profile.attestationStatus).toBeUndefined();
  });

  it('rejects a structurally invalid profile with CAP_PROFILE_MISMATCH', () => {
    expect(adaptLegacyProfile(null)).toMatchObject({ ok: false, code: 'CAP_PROFILE_MISMATCH' });
    expect(adaptLegacyProfile({})).toMatchObject({ ok: false, code: 'CAP_PROFILE_MISMATCH' });
    expect(adaptLegacyProfile({ machineId: 'x' })).toMatchObject({
      ok: false,
      code: 'CAP_PROFILE_MISMATCH',
    });
  });
});

// ---------------------------------------------------------------------------
// V3 tool-number resolution fails closed (removes the legacy TNO=1 default)
// ---------------------------------------------------------------------------

describe('resolveToolNumberV3: V3 path fails closed on unknown tool (design §12)', () => {
  it('resolves a known tool to its machine number', () => {
    expect(resolveToolNumberV3(KDT_MVP_PROFILE, 'T_COMP_8')).toEqual({ ok: true, value: 2 });
  });

  it('rejects an unknown tool with CAP_UNKNOWN_TOOL (no default to 1)', () => {
    const result = resolveToolNumberV3(KDT_MVP_PROFILE, 'GHOST_TOOL');
    expect(result).toMatchObject({ ok: false, code: 'CAP_UNKNOWN_TOOL' });
  });

  it('contrasts with the legacy PostContext, which still defaults unknown tools to 1', () => {
    const res = resolveParams(KDT_MVP_PROFILE, 'MDF', 'T_COMP_6');
    const ctx = makePostContext(KDT_MVP_PROFILE, res);
    // Legacy historical reading: unknown tool silently becomes 1.
    expect(ctx.toolNumberOf('GHOST_TOOL')).toBe(1);
    // V3 path refuses the same lookup.
    expect(resolveToolNumberV3(KDT_MVP_PROFILE, 'GHOST_TOOL').ok).toBe(false);
  });
});
