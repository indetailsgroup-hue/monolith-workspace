/**
 * protocolV3.test.ts - Task 1 contract, canonical hashing, and reason-code tests
 *
 * Encodes the FactoryPacket V3 protocol contracts from the approved
 * "MONOLITH Production Trust Kernel Design" (2026-07-22), sections 6, 11,
 * 12, and 13. Phase: NOT_FOR_PRODUCTION. Pure functions/types only; no
 * network, filesystem writes, or Date.now in canonical paths.
 *
 * @version 0.13.2
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { canonicalJson } from '../canonical/canonicalJson.js';
import { sha256Hex, computeReleaseAuthorizationHash, assertSha256 } from '../canonical/hash.js';
import {
  RELEASE_ATTEMPT_STATUSES,
  ARTIFACT_STATUSES,
  RELEASE_REVISION_STATUSES,
  WORKING_REVISION_STATUSES,
} from '../result.js';
import { TRUST_REASON_CODES } from '../reasonCodes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '..', 'contracts', 'protocolV3.schema.json');

// The 19 approved protocol types the plan's Interfaces block names (design §§6-14).
const PROTOCOL_TYPES = [
  'ActorContextV1',
  'VerifiedActionContextV1',
  'TenantScopeV1',
  'WorkingRevision',
  'ReleaseCandidate',
  'ReleaseAttempt',
  'ReleaseSnapshotV3',
  'MachineCapabilityProfileV1',
  'MachineProfileAttestationV1',
  'WarningExceptionGrantV1',
  'CapabilityReportV1',
  'FactoryPacketManifestV3',
  'ReleaseCertificateV1',
  'ArtifactRecordV1',
  'ReleaseRevision',
  'TrustBundleV1',
  'ReleaseStatusBundleV1',
  'VerificationReportV1',
  'EvidenceAttestationV1',
] as const;

// Signed boundaries that MUST reject unknown properties (design §11.2, §11.3, §12).
const SIGNED_BOUNDARIES = [
  'MachineProfileAttestationV1',
  'WarningExceptionGrantV1',
  'ReleaseCertificateV1',
  'FactoryPacketManifestV3',
  'TrustBundleV1',
  'ReleaseStatusBundleV1',
  'EvidenceAttestationV1',
] as const;

describe('canonicalJson', () => {
  it('sorts object keys and preserves values (design §11.1)', () => {
    expect(canonicalJson({ b: 1, a: 'x' })).toBe('{"a":"x","b":1}');
  });

  it('throws NON_CANONICAL_NUMBER for NaN', () => {
    expect(() => canonicalJson({ n: Number.NaN })).toThrow('NON_CANONICAL_NUMBER');
  });
});

describe('computeReleaseAuthorizationHash (design §6.3)', () => {
  it('hashes canonical release-authorization JSON with empty grant list', () => {
    expect(computeReleaseAuthorizationHash('ab'.repeat(32), [])).toBe(
      sha256Hex(
        '{"candidateHash":"' +
          'ab'.repeat(32) +
          '","domain":"MONOLITH/ReleaseAuthorization/V1","sortedGrantHashes":[]}',
      ),
    );
  });

  it('sorts grant hashes before hashing so ordering is irrelevant', () => {
    const a = 'a'.repeat(64);
    const b = 'b'.repeat(64);
    const candidate = 'c'.repeat(64);
    expect(computeReleaseAuthorizationHash(candidate, [b, a])).toBe(
      computeReleaseAuthorizationHash(candidate, [a, b]),
    );
  });

  it('rejects a candidate hash that is not a sha256 shape', () => {
    expect(() => computeReleaseAuthorizationHash('nope', [])).toThrow();
  });

  it('rejects a grant hash that is not a sha256 shape', () => {
    expect(() => computeReleaseAuthorizationHash('ab'.repeat(32), ['nope'])).toThrow();
  });
});

describe('sha256Hex / assertSha256', () => {
  it('produces a 64-char lowercase hex digest for strings and bytes', () => {
    const fromString = sha256Hex('abc');
    expect(fromString).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(fromString);
  });

  it('accepts a valid sha256 shape and rejects malformed ones', () => {
    expect(() => assertSha256('ab'.repeat(32))).not.toThrow();
    expect(() => assertSha256('AB'.repeat(32))).toThrow();
    expect(() => assertSha256('abc')).toThrow();
  });
});

describe('status constants (design §6)', () => {
  it('pins release-attempt statuses', () => {
    expect(RELEASE_ATTEMPT_STATUSES).toEqual(['PENDING', 'FAILED', 'PUBLISHED', 'VOID']);
  });

  it('pins artifact statuses', () => {
    expect(ARTIFACT_STATUSES).toEqual(['QUARANTINED', 'MATERIALIZING', 'AVAILABLE', 'VOID']);
  });

  it('pins release-revision statuses (VOID is not one)', () => {
    expect(RELEASE_REVISION_STATUSES).toEqual(['ACTIVE', 'REVOKED']);
  });

  it('pins working-revision statuses', () => {
    expect(WORKING_REVISION_STATUSES).toEqual(['DRAFT', 'FROZEN']);
  });
});

describe('TrustReasonCode registry (design §13)', () => {
  it('is a duplicate-free stable inventory', () => {
    expect(new Set(TRUST_REASON_CODES).size).toBe(TRUST_REASON_CODES.length);
  });

  it('covers the reason codes the plan uses across Tasks 1-12', () => {
    const required = [
      'AUTH_SOD_VIOLATION',
      'AUTH_ACTION_CONTEXT_INVALID',
      'STATE_IDEMPOTENCY_MISMATCH',
      'STATE_CONFLICT',
      'STATE_CANDIDATE_STALE',
      'CAP_UNKNOWN_TOOL',
      'CAP_UNSUPPORTED_OPERATION',
      'CAP_PARAMETER_RANGE',
      'CAP_PROFILE_ATTESTATION_INVALID',
      'GATE_HARD_BLOCKER',
      'GATE_WARNING_EXCEPTION_MISMATCH',
      'CRYPTO_SIGNER_UNAVAILABLE',
      'CRYPTO_ALGORITHM_DENIED',
      'STORE_PLAINTEXT_ACCESS_DENIED',
      'PACKET_EXTRA_FILE',
      'TRUST_CHECKPOINT_REQUIRED',
      'TRUST_SEQUENCE_ROLLBACK',
    ];
    for (const code of required) {
      expect(TRUST_REASON_CODES).toContain(code);
    }
  });

  it('carries the design §13 registry + SAFETY + REPAIR versioned additions (10 namespaces, 43 codes)', () => {
    expect(TRUST_REASON_CODES.length).toBe(43);
    const namespaces = new Set(TRUST_REASON_CODES.map((c) => c.split('_')[0]));
    expect([...namespaces].sort()).toEqual([
      'AUTH',
      'CAP',
      'CRYPTO',
      'GATE',
      'PACKET',
      'REPAIR',
      'SAFETY',
      'STATE',
      'STORE',
      'TRUST',
    ]);
  });
});

describe('protocolV3.schema.json', () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8')) as {
    $defs: Record<string, { additionalProperties?: boolean }>;
  };

  it('defines every one of the 19 approved protocol types', () => {
    for (const typeName of PROTOCOL_TYPES) {
      expect(schema.$defs[typeName]).toBeDefined();
    }
  });

  it('sets additionalProperties:false at every signed boundary', () => {
    for (const typeName of SIGNED_BOUNDARIES) {
      expect(schema.$defs[typeName].additionalProperties).toBe(false);
    }
  });

  it('sets additionalProperties:false on every protocol object def', () => {
    for (const typeName of PROTOCOL_TYPES) {
      expect(schema.$defs[typeName].additionalProperties).toBe(false);
    }
  });
});
