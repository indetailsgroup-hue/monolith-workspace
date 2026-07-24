/**
 * compileCapabilities.property.test.ts - Task 6 exhaustive capability compiler
 *
 * RED-first coverage for the V3 capability compiler and its dialect-emission
 * defense (approved design 2026-07-22 §12 capability safety, §13 error model).
 *
 * The compiler is EXHAUSTIVE and FAIL-CLOSED: an unknown tool, unsupported
 * operation, out-of-range parameter, or an invalid profile attestation yields a
 * stable `CAP_*` reason code and zero publishable output. On PASS the report's
 * `checkedOperationIds` equals the sorted set of ALL input operation IDs - any
 * dropped ID is a defect, asserted here over operation permutations.
 *
 * The dialect defense (`compileDialectToolBindings`) proves defense-in-depth:
 * a CIX/G-code layer re-derives tool numbers from the canonical profile and
 * refuses to emit for an unknown tool or unsupported operation EVEN when a
 * forged upstream capability report claims PASS. It never defaults an unknown
 * tool to `TNO=1`.
 *
 * Written with plain Vitest plus a deterministic seeded PRNG (the Task 1
 * pattern), so the suite adds no dependency and stays reproducible.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { describe, it, expect } from 'vitest';
import type { TrustResult } from '../result.js';
import type {
  CapabilityReportV1,
  MachineProfileAttestationV1,
} from '../contracts/protocolV3.js';
import type {
  CanonicalMachineProfileV1,
  CapabilityOperationV1,
  CapabilitySnapshotV1,
  CompiledCapabilityReportV1,
} from '../contracts/capability.js';
import { canonicalProfileHash } from '../capability/canonicalProfile.js';
import {
  compileCapabilities,
  compileDialectToolBindings,
} from '../capability/compileCapabilities.js';

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) - no runtime randomness.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function baseProfile(
  overrides: Partial<CanonicalMachineProfileV1> = {},
): CanonicalMachineProfileV1 {
  return {
    machineId: 'CNC-001',
    machineVersion: '1.0.0',
    dialectVersion: 'CIX-4.2',
    operationCatalogue: ['DRILL', 'ROUTE', 'BORE'],
    tools: [
      { toolId: 'T_DRILL_8', machineNumber: 2 },
      { toolId: 'T_ROUTE_6', machineNumber: 5 },
      { toolId: 'T_BORE_35', machineNumber: 4 },
    ],
    ranges: [
      { parameter: 'depth', min: 0, max: 40, unit: 'mm' },
      { parameter: 'diameter', min: 1, max: 20, unit: 'mm' },
    ],
    faces: ['TOP', 'BOTTOM'],
    units: 'mm',
    coordinateConvention: 'ISO-TOP-LEFT',
    postprocessorId: 'pp-nc-1000',
    postprocessorVersion: '1.2.3',
    postprocessorBinaryHash: 'c'.repeat(64),
    ...overrides,
  };
}

function attestationFor(
  profile: CanonicalMachineProfileV1,
  overrides: Partial<MachineProfileAttestationV1> = {},
): MachineProfileAttestationV1 {
  return {
    attestationId: '11111111-1111-1111-1111-111111111111',
    tenantId: 'tenant-001',
    siteId: 'site-001',
    machineId: profile.machineId,
    profileHash: canonicalProfileHash(profile),
    toolLibraryHash: 'b'.repeat(64),
    postprocessorId: profile.postprocessorId,
    postprocessorVersion: profile.postprocessorVersion,
    postprocessorBinaryHash: profile.postprocessorBinaryHash,
    approverUserId: 'user-approver',
    issuedAt: '2026-07-23T00:00:00.000Z',
    validFrom: '2026-07-23T00:00:00.000Z',
    validUntil: '2026-07-25T00:00:00.000Z',
    status: 'ACTIVE',
    attestationSequence: 1,
    signature: { alg: 'ed25519', keyId: 'dev-profile-attestation-key', sig: '0'.repeat(64) },
    ...overrides,
  };
}

function op(overrides: Partial<CapabilityOperationV1> = {}): CapabilityOperationV1 {
  return {
    operationId: 'op-1',
    operationType: 'DRILL',
    toolId: 'T_DRILL_8',
    face: 'TOP',
    parameters: { depth: 10, diameter: 8 },
    ...overrides,
  };
}

function snapshotOf(
  profile: CanonicalMachineProfileV1,
  operations: CapabilityOperationV1[],
): CapabilitySnapshotV1 {
  return { machineProfileHash: canonicalProfileHash(profile), operations };
}

function expectOk<T>(result: TrustResult<T>): T {
  // strictNullChecks is off in this package, so `!result.ok` does not narrow the
  // boolean-discriminated union; read the failure code through an explicit cast.
  if (!result.ok) {
    throw new Error(`expected ok result, received failure ${(result as { code: string }).code}`);
  }
  return result.value;
}

/** A forged upstream report claiming PASS with no blockers (the "lying" report). */
function forgedPassReport(profile: CanonicalMachineProfileV1): CapabilityReportV1 {
  return {
    reportHash: 'f'.repeat(64),
    machineProfileHash: canonicalProfileHash(profile),
    supported: true,
    evaluatedOperationCount: 0,
    blockers: [],
  };
}

// ---------------------------------------------------------------------------
// Step 1 - exhaustive failure tests (plan Task 6 Step 1)
// ---------------------------------------------------------------------------

describe('compileCapabilities: exhaustive fail-closed blockers (design §12)', () => {
  it('rejects an unknown tool with CAP_UNKNOWN_TOOL', () => {
    const profile = baseProfile();
    const attestation = attestationFor(profile);
    expect(
      compileCapabilities(snapshotOf(profile, [op({ toolId: 'UNKNOWN' })]), profile, attestation),
    ).toMatchObject({ ok: false, code: 'CAP_UNKNOWN_TOOL' });
  });

  it('rejects an unsupported operation with CAP_UNSUPPORTED_OPERATION', () => {
    const profile = baseProfile();
    const attestation = attestationFor(profile);
    expect(
      compileCapabilities(
        snapshotOf(profile, [op({ operationType: 'FIVE_AXIS_SWARF' })]),
        profile,
        attestation,
      ),
    ).toMatchObject({ ok: false, code: 'CAP_UNSUPPORTED_OPERATION' });
  });

  it('rejects an out-of-range parameter with CAP_PARAMETER_RANGE', () => {
    const profile = baseProfile({
      ranges: [
        { parameter: 'depth', min: 0, max: 40, unit: 'mm' },
        { parameter: 'diameter', min: 1, max: 20, unit: 'mm' },
      ],
    });
    const attestation = attestationFor(profile);
    expect(
      compileCapabilities(
        snapshotOf(profile, [op({ parameters: { depth: 41, diameter: 8 } })]),
        profile,
        attestation,
      ),
    ).toMatchObject({ ok: false, code: 'CAP_PARAMETER_RANGE' });
  });

  it('rejects a parameter below its minimum with CAP_PARAMETER_RANGE', () => {
    const profile = baseProfile();
    const attestation = attestationFor(profile);
    expect(
      compileCapabilities(
        snapshotOf(profile, [op({ parameters: { depth: 10, diameter: 0 } })]),
        profile,
        attestation,
      ),
    ).toMatchObject({ ok: false, code: 'CAP_PARAMETER_RANGE' });
  });
});

describe('compileCapabilities: attestation binding (design §12)', () => {
  it('rejects a non-ACTIVE attestation with CAP_PROFILE_ATTESTATION_INVALID', () => {
    const profile = baseProfile();
    const attestation = attestationFor(profile, { status: 'REVOKED' });
    expect(compileCapabilities(snapshotOf(profile, [op()]), profile, attestation)).toMatchObject({
      ok: false,
      code: 'CAP_PROFILE_ATTESTATION_INVALID',
    });
  });

  it('rejects an attestation not bound to the canonical profile hash', () => {
    const profile = baseProfile();
    const attestation = attestationFor(profile, { profileHash: 'a'.repeat(64) });
    expect(compileCapabilities(snapshotOf(profile, [op()]), profile, attestation)).toMatchObject({
      ok: false,
      code: 'CAP_PROFILE_ATTESTATION_INVALID',
    });
  });

  it('rejects a snapshot bound to a different profile hash with CAP_PROFILE_MISMATCH', () => {
    const profile = baseProfile();
    const attestation = attestationFor(profile);
    const snapshot: CapabilitySnapshotV1 = {
      machineProfileHash: 'e'.repeat(64),
      operations: [op()],
    };
    expect(compileCapabilities(snapshot, profile, attestation)).toMatchObject({
      ok: false,
      code: 'CAP_PROFILE_MISMATCH',
    });
  });
});

// ---------------------------------------------------------------------------
// PASS + exhaustiveness property (plan Task 6 Step 1)
// ---------------------------------------------------------------------------

describe('compileCapabilities: PASS report exhaustiveness (design §12)', () => {
  it('returns supported=true with the sorted set of all operation ids', () => {
    const profile = baseProfile();
    const attestation = attestationFor(profile);
    const operations = [
      op({ operationId: 'op-c', operationType: 'BORE', toolId: 'T_BORE_35', parameters: { depth: 12, diameter: 18 } }),
      op({ operationId: 'op-a', operationType: 'DRILL', toolId: 'T_DRILL_8', parameters: { depth: 5, diameter: 8 } }),
      op({ operationId: 'op-b', operationType: 'ROUTE', toolId: 'T_ROUTE_6', parameters: { depth: 20, diameter: 6 } }),
    ];
    const report = expectOk(
      compileCapabilities(snapshotOf(profile, operations), profile, attestation),
    );
    expect(report.supported).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.evaluatedOperationCount).toBe(3);
    expect(report.checkedOperationIds).toEqual(['op-a', 'op-b', 'op-c']);
    expect(report.machineProfileHash).toBe(canonicalProfileHash(profile));
    expect(report.reportHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('checkedOperationIds equals the sorted input set across permutations, and any dropped id fails', () => {
    const profile = baseProfile();
    const attestation = attestationFor(profile);
    const types = profile.operationCatalogue;
    const tools = profile.tools;
    const rng = mulberry32(0xca9ab);

    for (let trial = 0; trial < 200; trial++) {
      const count = 1 + Math.floor(rng() * 8);
      const operations: CapabilityOperationV1[] = [];
      for (let i = 0; i < count; i++) {
        const type = types[Math.floor(rng() * types.length)];
        const tool = tools[Math.floor(rng() * tools.length)];
        operations.push(
          op({
            operationId: `op-${trial}-${i}`,
            operationType: type,
            toolId: tool.toolId,
            parameters: { depth: Math.floor(rng() * 41), diameter: 1 + Math.floor(rng() * 20) },
          }),
        );
      }
      const expectedIds = [...new Set(operations.map((o) => o.operationId))].sort();

      const first = expectOk(
        compileCapabilities(snapshotOf(profile, operations), profile, attestation),
      );
      expect(first.checkedOperationIds).toEqual(expectedIds);

      // Permuting the operation order must not change the checked set or hash.
      const permuted = shuffle(operations, rng);
      const second = expectOk(
        compileCapabilities(snapshotOf(profile, permuted), profile, attestation),
      );
      expect(second.checkedOperationIds).toEqual(expectedIds);
      expect(second.reportHash).toBe(first.reportHash);
    }
  });

  it('an unknown tool at any position aborts the whole report (exhaustive, no silent drop)', () => {
    const profile = baseProfile();
    const attestation = attestationFor(profile);
    const rng = mulberry32(0x0badf00d);
    const good = op({ operationId: 'good', operationType: 'DRILL', toolId: 'T_DRILL_8' });

    for (let position = 0; position < 6; position++) {
      const operations: CapabilityOperationV1[] = [];
      for (let i = 0; i < 5; i++) operations.push(op({ operationId: `g-${i}` }));
      operations.splice(position, 0, op({ operationId: 'bad', toolId: 'GHOST_TOOL' }));
      const result = compileCapabilities(snapshotOf(profile, operations), profile, attestation);
      expect(result).toMatchObject({ ok: false, code: 'CAP_UNKNOWN_TOOL' });
    }
    // Sanity: the "good" op alone passes.
    expect(expectOk(compileCapabilities(snapshotOf(profile, [good]), profile, attestation)).supported).toBe(true);
    void rng;
  });
});

// ---------------------------------------------------------------------------
// Dialect defense - CIX / G-code (plan Task 6 Step 4, design §12)
// ---------------------------------------------------------------------------

describe('dialect defense: CIX/G-code rejects a lying report (design §12 defense-in-depth)', () => {
  it('emits tool numbers from the profile for a valid operation (never TNO=1 by default)', () => {
    const profile = baseProfile();
    const operations = [
      op({ operationId: 'op-a', operationType: 'DRILL', toolId: 'T_DRILL_8' }),
      op({ operationId: 'op-b', operationType: 'BORE', toolId: 'T_BORE_35', parameters: { depth: 12, diameter: 18 } }),
    ];
    const bindings = expectOk(
      compileDialectToolBindings(snapshotOf(profile, operations), profile, forgedPassReport(profile)),
    );
    expect(bindings).toEqual([
      { operationId: 'op-a', toolId: 'T_DRILL_8', machineNumber: 2 },
      { operationId: 'op-b', toolId: 'T_BORE_35', machineNumber: 4 },
    ]);
  });

  it('rejects an unknown tool with CAP_UNKNOWN_TOOL even when the upstream report says PASS', () => {
    const profile = baseProfile();
    const snapshot = snapshotOf(profile, [op({ toolId: 'GHOST_TOOL' })]);
    const result = compileDialectToolBindings(snapshot, profile, forgedPassReport(profile));
    expect(result).toMatchObject({ ok: false, code: 'CAP_UNKNOWN_TOOL' });
    // The defense must NOT have defaulted the unknown tool to machine number 1.
    const failure = result as { ok: boolean; detail?: Record<string, string> };
    expect(failure.detail?.defaultedTo).toBeUndefined();
  });

  it('rejects an unsupported operation with CAP_UNSUPPORTED_OPERATION even when the report says PASS', () => {
    const profile = baseProfile();
    const snapshot = snapshotOf(profile, [op({ operationType: 'FIVE_AXIS_SWARF' })]);
    expect(
      compileDialectToolBindings(snapshot, profile, forgedPassReport(profile)),
    ).toMatchObject({ ok: false, code: 'CAP_UNSUPPORTED_OPERATION' });
  });
});
