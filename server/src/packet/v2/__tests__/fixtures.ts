import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  CanonicalPacketContentInput,
  PacketSignerAdapter,
  PacketSigningRequest,
} from '../types.js';

const inputPath = fileURLToPath(new URL('./fixtures/golden-input.json', import.meta.url));
const expectedPath = fileURLToPath(new URL('./fixtures/golden-expected.json', import.meta.url));

export function loadGoldenInput(): CanonicalPacketContentInput {
  return JSON.parse(readFileSync(inputPath, 'utf8')) as CanonicalPacketContentInput;
}

export function loadGoldenExpected(): Record<string, string | number> {
  return JSON.parse(readFileSync(expectedPath, 'utf8')) as Record<string, string | number>;
}

export function encodeDerSignature(r: bigint, s: bigint): Uint8Array {
  const rBytes = encodeDerInteger(r);
  const sBytes = encodeDerInteger(s);
  const body = Uint8Array.from([0x02, rBytes.length, ...rBytes, 0x02, sBytes.length, ...sBytes]);
  return Uint8Array.from([0x30, body.length, ...body]);
}

function encodeDerInteger(value: bigint): Uint8Array {
  if (value < 0n) throw new Error('test DER helper only accepts non-negative integers');
  const bytes: number[] = [];
  let remaining = value;
  do {
    bytes.unshift(Number(remaining & 0xffn));
    remaining >>= 8n;
  } while (remaining > 0n);
  if ((bytes[0] & 0x80) !== 0) bytes.unshift(0);
  return Uint8Array.from(bytes);
}

export class SequenceSigner implements PacketSignerAdapter {
  readonly requests: PacketSigningRequest[] = [];
  private index = 0;

  constructor(private readonly signatures: readonly Uint8Array[]) {}

  async signDigest(request: PacketSigningRequest): Promise<Uint8Array> {
    this.requests.push({ ...request, messageDigest: new Uint8Array(request.messageDigest) });
    const signature = this.signatures[Math.min(this.index, this.signatures.length - 1)];
    this.index += 1;
    return new Uint8Array(signature);
  }
}

export const GOLDEN_RUN = {
  jobRunId: '11111111-1111-4111-8111-111111111111',
  issuedAt: '2026-07-17T12:00:00.000Z',
  actorSubjectId: 'actor-owner',
  authorizationContextId: 'auth-context-1',
};

export const GOLDEN_SIGNING_IDENTITY = {
  keyId: 'kms-key-factory-packet-1',
  registryVersion: '1.0.0',
};
