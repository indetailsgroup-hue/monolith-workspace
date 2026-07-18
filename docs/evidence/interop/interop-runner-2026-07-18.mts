// S17 Track B black-box interop — GENERATOR-SIDE runner (B2-02 official round).
//
// Runs the FROZEN S17-4 generator (commit eeed1ce6, tree da717b31) against its
// golden input with a real-crypto KMS mock, and writes the packet ZIP + meta to
// an artifacts directory. The verifier track consumes ONLY those artifact bytes
// — no source crosses the boundary.
//
// The KMS mock honors the PacketSignerAdapter contract exactly: it receives a
// SHA-256 digest and returns a DER ECDSA_P256 signature over that digest
// (MessageType=DIGEST semantics), implemented as textbook ECDSA in BigInt.
// It never sees the preimage — exactly like AWS KMS Sign.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, webcrypto } from 'node:crypto';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// dynamic import from the frozen worktree (cwd) — the runner file itself lives
// OUTSIDE the worktree so nothing is ever written into the frozen checkout
const { buildCanonicalPacketContentV2, computeIdempotencyFingerprint, generateFactoryPacketV2 } =
  await import(pathToFileURL(resolve('server/src/packet/v2/generator.ts')).href);
type PacketSigningRequest = { keyId: string; keySpec: string; signingAlgorithm: string; messageType: string; messageDigest: Uint8Array };
type CanonicalPacketContentInput = unknown;

// ---------- P-256 ECDSA over a raw digest (test KMS; BigInt textbook impl) ----------
const P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
const N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const A = P - 3n;
const GX = BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296');
const GY = BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5');

function mod(a: bigint, m: bigint): bigint { const r = a % m; return r < 0n ? r + m : r; }
function modinv(a: bigint, m: bigint): bigint {
  let [old_r, r] = [mod(a, m), m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  if (old_r !== 1n) throw new Error('not invertible');
  return mod(old_s, m);
}
type Pt = { x: bigint; y: bigint } | null;
function ptAdd(p1: Pt, p2: Pt): Pt {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  if (p1.x === p2.x && mod(p1.y + p2.y, P) === 0n) return null;
  let lambda: bigint;
  if (p1.x === p2.x && p1.y === p2.y) {
    lambda = mod((3n * p1.x * p1.x + A) * modinv(2n * p1.y, P), P);
  } else {
    lambda = mod((p2.y - p1.y) * modinv(mod(p2.x - p1.x, P), P), P);
  }
  const x3 = mod(lambda * lambda - p1.x - p2.x, P);
  const y3 = mod(lambda * (p1.x - x3) - p1.y, P);
  return { x: x3, y: y3 };
}
function ptMul(k: bigint, pt: Pt): Pt {
  let result: Pt = null;
  let addend = pt;
  while (k > 0n) {
    if (k & 1n) result = ptAdd(result, addend);
    addend = ptAdd(addend, addend);
    k >>= 1n;
  }
  return result;
}
function bytesToBig(b: Uint8Array): bigint { return b.reduce((a, x) => (a << 8n) | BigInt(x), 0n); }
function derInt(v: bigint): number[] {
  const bytes: number[] = [];
  let x = v;
  do { bytes.unshift(Number(x & 0xffn)); x >>= 8n; } while (x > 0n);
  if ((bytes[0] & 0x80) !== 0) bytes.unshift(0);
  return [0x02, bytes.length, ...bytes];
}
function ecdsaSignDigestDer(d: bigint, digest: Uint8Array): Uint8Array {
  const z = bytesToBig(digest); // 256-bit digest, no truncation needed
  for (;;) {
    const k = mod(bytesToBig(randomBytes(32)), N - 1n) + 1n;
    const R = ptMul(k, { x: GX, y: GY });
    if (R === null) continue;
    const r = mod(R.x, N);
    if (r === 0n) continue;
    const s = mod(modinv(k, N) * mod(z + r * d, N), N);
    if (s === 0n) continue;
    const body = [...derInt(r), ...derInt(s)];
    return Uint8Array.from([0x30, body.length, ...body]);
  }
}

// ---------- main ----------
const OUT = process.env.INTEROP_OUT;
if (!OUT) throw new Error('set INTEROP_OUT');
mkdirSync(OUT, { recursive: true });

const inputPath = './server/src/packet/v2/__tests__/fixtures/golden-input.json';
const inputBytes = readFileSync(inputPath);
const goldenInput = JSON.parse(inputBytes.toString('utf8')) as CanonicalPacketContentInput;

const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await webcrypto.subtle.exportKey('jwk', kp.privateKey);
const dPriv = bytesToBig(Buffer.from(jwk.d as string, 'base64url'));
const spkiDer = Buffer.from(await webcrypto.subtle.exportKey('spki', kp.publicKey));

const kmsRequests: PacketSigningRequest[] = [];
const signer = {
  async signDigest(request: PacketSigningRequest): Promise<Uint8Array> {
    kmsRequests.push({ ...request, messageDigest: new Uint8Array(request.messageDigest) });
    return ecdsaSignDigestDer(dPriv, new Uint8Array(request.messageDigest));
  },
};

const RUN = {
  jobRunId: '4f9be2a7-33c1-4d68-9b21-5f0e8d7a6c15',
  issuedAt: '2026-07-18T09:00:00.000Z',
  actorSubjectId: 'actor-owner',
  authorizationContextId: 'auth-context-1',
};
const IDENTITY = { keyId: 'kms-key-interop-blackbox-1', registryVersion: '1.0.0' };

const content = buildCanonicalPacketContentV2(goldenInput);
const fingerprint = computeIdempotencyFingerprint(
  { actorSubjectId: RUN.actorSubjectId, authorizationContextId: RUN.authorizationContextId },
  content,
);
const packet = await generateFactoryPacketV2(
  content,
  { ...RUN, idempotencyFingerprint: fingerprint },
  IDENTITY,
  signer,
);

const sha256 = (b: Uint8Array | Buffer) => createHash('sha256').update(b).digest('hex');

writeFileSync(join(OUT, packet.filename), packet.zipBytes);
const meta = {
  generatorCommit: 'eeed1ce6b4388db5c661932a419e5d2c61267712',
  generatorTree: 'da717b31f26f7000e5f94fad854cb0dd13c61004',
  inputPath,
  inputSha256: sha256(inputBytes),
  zipFilename: packet.filename,
  zipSha256: sha256(packet.zipBytes),
  zipBytes: packet.zipBytes.length,
  kmsSignCalls: kmsRequests.length,
  packetContentId: packet.packetContentId,
  manifestSha256: packet.manifestSha256,
  machineProfileSha256: content.machineProfileSha256,
  run: { ...RUN, idempotencyFingerprint: fingerprint },
  signingIdentity: IDENTITY,
  spkiDerBase64: spkiDer.toString('base64'),
  releasedRevision: packet.manifest.releasedRevision,
  exporter: packet.manifest.exporter,
  gatePolicyVersion: '1.0.0',
};
writeFileSync(join(OUT, 'interop-meta.json'), JSON.stringify(meta, null, 2) + '\n');
console.log('BLACK-BOX ARTIFACT WRITTEN');
console.log('zip:', packet.filename, packet.zipBytes.length, 'bytes sha256:', meta.zipSha256);
console.log('kms sign calls:', kmsRequests.length);
