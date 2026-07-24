/**
 * trustKernelProjection.ts — client-side P2 containment + server projection
 * (Production Trust Kernel, Task 11; design §9 Artifact Class Matrix, §15 legacy
 * migration & route disposition).
 *
 * The client sees SERVER PROJECTIONS only: candidate / attempt / release / artifact
 * STATUS and report/evidence REFERENCES. It never receives a raw storage locator, a
 * reusable signed URL, or P2 plaintext. This module is the pure, non-authoritative
 * containment primitive shared by the client API, the packet hook, and the browser
 * download utilities. It holds NO release authority and performs NO I/O.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */

// ---------------------------------------------------------------------------
// Result + reason codes (local mirror of the canonical registry, design §13).
// ---------------------------------------------------------------------------
export type ContainmentReasonCode =
  | 'STATE_CANDIDATE_STALE'
  | 'STATE_RELEASE_REVOKED'
  | 'STORE_PLAINTEXT_ACCESS_DENIED'
  | 'STORE_ARTIFACT_UNAVAILABLE';

export type ClientResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ContainmentReasonCode; detail?: string };

// ---------------------------------------------------------------------------
// Server projection: the ONLY fields a human/client may ever see. A raw storage
// locator, signed URL, or plaintext bytes are structurally absent — the projection
// copies allow-listed keys and drops everything else (fail-closed).
// ---------------------------------------------------------------------------
export const SAFE_PROJECTION_FIELDS = [
  'ok',
  'jobId',
  'candidateHash',
  'candidateStatus',
  'attemptStatus',
  'releaseStatus',
  'releaseRevisionId',
  'releaseSequence',
  'artifactStatus',
  'artifactClass',
  'contentHash',
  'expectedPacketHash',
  'reportRef',
  'evidenceRef',
  'reasonCode',
  'notForProduction',
  'releasedAt',
  'revokedAt',
] as const;

export type SafeProjectionField = (typeof SAFE_PROJECTION_FIELDS)[number];
export type FactoryPacketProjection = Partial<Record<SafeProjectionField, unknown>>;

const SAFE_SET: ReadonlySet<string> = new Set(SAFE_PROJECTION_FIELDS);

/**
 * Project a raw server/edge response into the client-safe shape. Only allow-listed
 * status/reference fields survive; any locator/url/plaintext/bytes field is dropped.
 */
export function projectFactoryPacketStatus(raw: Record<string, unknown>): FactoryPacketProjection {
  const out: FactoryPacketProjection = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!SAFE_SET.has(key)) continue;
    // A value that is itself a locator/url string is still dropped (defense in depth).
    if (typeof value === 'string' && looksLikeLocatorOrUrl(value)) continue;
    out[key as SafeProjectionField] = value;
  }
  return out;
}

/** Heuristic tripwire: a value that looks like a raw locator or a signed URL. */
function looksLikeLocatorOrUrl(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) ||
    /storage\/v1|\/sign\/|[?&]token=|signedURL/i.test(value) ||
    /^[0-9a-f-]{8,}\/[0-9a-f-]{8,}\/.+\/[0-9a-f]{64}$/i.test(value)
  );
}

// ---------------------------------------------------------------------------
// Legacy manufacturing download — the client is NEVER a P2 authority.
// A client-held DRAFT/FROZEN candidate is stale relative to the server release
// authority (0182 release_revision); it can never pull a production-shaped artifact.
// ---------------------------------------------------------------------------
export async function requestLegacyManufacturingDownload(
  clientState: string,
): Promise<ClientResult<never>> {
  return {
    ok: false,
    code: 'STATE_CANDIDATE_STALE',
    detail: `NOT_FOR_PRODUCTION: a client "${clientState}" candidate is not a server-authorized release; P2 manufacturing artifacts are produced and sealed server-side only.`,
  };
}

// ---------------------------------------------------------------------------
// Shadow P2 read policy (design §9). No human or client principal may read P2
// plaintext; only the isolated workload identity streams bytes to the automated
// verifier, and only for an ACTIVE release (revocation is rechecked at request
// start). Even the allowed branch returns a MODE marker, never a URL or locator.
// ---------------------------------------------------------------------------
export type P2Principal = 'HUMAN' | 'CLIENT' | 'ISOLATED_WORKLOAD';
export interface ReleaseRef {
  status: string;
  releaseRevisionId?: string;
}

export function decideShadowP2Access(
  principal: P2Principal,
  release: ReleaseRef,
): ClientResult<{ mode: 'WORKLOAD_STREAM' }> {
  if (principal !== 'ISOLATED_WORKLOAD') {
    return {
      ok: false,
      code: 'STORE_PLAINTEXT_ACCESS_DENIED',
      detail:
        'Shadow P2 plaintext is readable only by the isolated workload identity; humans receive hashes, reports, and evidence (§9).',
    };
  }
  if (release.status !== 'ACTIVE') {
    return {
      ok: false,
      code: 'STATE_RELEASE_REVOKED',
      detail: 'the release is not ACTIVE; a revoked/void release cannot be streamed (recheck at request start).',
    };
  }
  return { ok: true, value: { mode: 'WORKLOAD_STREAM' } };
}

export function requestShadowP2AsHuman(release: ReleaseRef): ClientResult<{ mode: 'WORKLOAD_STREAM' }> {
  return decideShadowP2Access('HUMAN', release);
}

export function requestShadowP2AsIsolatedRunner(
  release: ReleaseRef,
): ClientResult<{ mode: 'WORKLOAD_STREAM' }> {
  return decideShadowP2Access('ISOLATED_WORKLOAD', release);
}

// ---------------------------------------------------------------------------
// Browser download containment. Production-shaped (P2 manufacturing) artifacts —
// cut lists, DXF, CNC/G-code, CIX, full packets — can never be written to a human
// via a browser download. P0 preview and P1 review artifacts (JSON manifests,
// evidence, PDF, PNG) are unaffected.
// ---------------------------------------------------------------------------
const P2_MANUFACTURING_EXTENSIONS: ReadonlySet<string> = new Set([
  'dxf', 'dwg', 'nc', 'gcode', 'gc', 'tap', 'cnc', 'cix', 'mpr', 'mpr2',
  'step', 'stp', 'iges', 'igs', 'dnc', 'ngc', 'apt',
]);

const P2_NAME_PATTERNS: readonly RegExp[] = [
  /cut[\s._-]?list/i,
  /\bcnc\b/i,
  /factory[\s._-]?packet/i,
  /\bNFP-/,
];

/** True for an unambiguous P2 manufacturing artifact filename. */
export function isProductionShapedArtifact(filename: string): boolean {
  const name = String(filename ?? '');
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (P2_MANUFACTURING_EXTENSIONS.has(ext)) return true;
  // A zip that is a factory packet is P2; a generic .zip is only P2 by name.
  if (P2_NAME_PATTERNS.some((re) => re.test(name))) return true;
  return false;
}

/** Guard the browser-download primitives: throw before any P2 egress. */
export function assertNotProductionShaped(filename: string): void {
  if (isProductionShapedArtifact(filename)) {
    throw new Error(
      `NOT_FOR_PRODUCTION: refused to download production-shaped (P2 manufacturing) artifact "${filename}". ` +
        'P2 artifacts are sealed in the private store; a human never receives plaintext, a raw locator, or a signed URL (design §9).',
    );
  }
}

// ---------------------------------------------------------------------------
// Route-disposition ledger coverage (design §15.2). Pure mirror of
// scripts/trust-kernel/verify-route-ledger.mjs used by the containment suite:
//   - missing: a reachable surface file with no enforced ledger entry
//   - duplicateAuthority: more than one enforced route holding mutable authority
// ---------------------------------------------------------------------------
export interface RouteLedgerEntry {
  id: string;
  file: string;
  disposition: string;
  enforced?: boolean;
  authority?: string;
  [k: string]: unknown;
}
export interface RouteLedger {
  routes: RouteLedgerEntry[];
  [k: string]: unknown;
}

export function routeLedgerCoverage(
  reachableSurfaces: readonly string[],
  ledger: RouteLedger,
): { missing: string[]; duplicateAuthority: string[] } {
  const enforced = (ledger?.routes ?? []).filter((r) => r.enforced);
  const ledgeredFiles = new Set(enforced.map((r) => r.file));
  const missing = [...new Set(reachableSurfaces)].filter((f) => !ledgeredFiles.has(f));

  const mutableFiles = enforced
    .filter((r) => r.authority === 'RELEASE_MUTABLE')
    .map((r) => r.file);
  const seen = new Set<string>();
  const duplicateAuthority: string[] = [];
  // More than one distinct mutable-authority holder is a duplicate authority.
  if (mutableFiles.length > 1) {
    for (const f of mutableFiles) {
      if (seen.has(f)) continue;
      seen.add(f);
      duplicateAuthority.push(f);
    }
  }
  return { missing, duplicateAuthority };
}
