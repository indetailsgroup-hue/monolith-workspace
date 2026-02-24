/**
 * createTestFixture.ts - P13.4 Golden Test Fixture Generator
 *
 * Creates deterministic test ZIP files with receipts for testing.
 * Uses fixed timestamps and content for reproducibility.
 *
 * @version 0.13.4
 */

import { createHash, generateKeyPairSync, sign } from 'crypto';
import yazl from 'yazl';
import { RECEIPT_VERSION } from '../../export/exportReceiptTypes.js';
import type { ExportReceipt, ExportReceiptSignature } from '../../export/exportReceiptTypes.js';
import type { JobProof } from '../../proof/proofTypes.js';
import { PROOF_VERSION } from '../../proof/proofTypes.js';

// ============================================================================
// Constants for Determinism
// ============================================================================

const EPOCH_DATE = new Date(0);
const COMPRESSION_LEVEL = 8;

// Fixed test timestamp
const FIXED_TIMESTAMP = '2025-01-15T12:00:00.000Z';

// Fixed test key pair (generated once, stored here for reproducibility)
// In real tests, we generate fresh but for golden tests we need determinism
export const TEST_KEY_ID = 'test-key-v1';

// ============================================================================
// Test Key Management
// ============================================================================

export interface TestKeyPair {
  keyId: string;
  privateKeyDer: Buffer;
  publicKeyDer: Buffer;
  publicKeyBase64: string;
}

/**
 * Generate a fresh Ed25519 key pair for testing.
 */
export function generateTestKeyPair(keyId: string = TEST_KEY_ID): TestKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');

  const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });

  return {
    keyId,
    privateKeyDer: Buffer.from(privateKeyDer),
    publicKeyDer: Buffer.from(publicKeyDer),
    publicKeyBase64: Buffer.from(publicKeyDer).toString('base64'),
  };
}

// ============================================================================
// Deterministic JSON Serialization
// ============================================================================

function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj as object).sort();
  const pairs = keys.map((k) => {
    const v = (obj as Record<string, unknown>)[k];
    return JSON.stringify(k) + ':' + stableStringify(v);
  });
  return '{' + pairs.join(',') + '}';
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

// ============================================================================
// Fixture Creation
// ============================================================================

export interface FixtureOptions {
  jobId?: string;
  keyPair?: TestKeyPair;
  signed?: boolean;
  includeReceipt?: boolean;
  tamperReceipt?: boolean;
  tamperContent?: boolean;
  revokedKey?: boolean;
  timestamp?: string;
}

export interface FixtureResult {
  zipBuffer: Buffer;
  zipSha256: string;
  contentSha256: string;
  receipt: ExportReceipt;
  keyPair?: TestKeyPair;
}

/**
 * Create a deterministic test ZIP with receipt.
 */
export async function createTestFixture(options: FixtureOptions = {}): Promise<FixtureResult> {
  const {
    jobId = 'test-job-001',
    keyPair = generateTestKeyPair(),
    signed = true,
    includeReceipt = true,
    tamperReceipt = false,
    tamperContent = false,
    timestamp = FIXED_TIMESTAMP,
  } = options;

  // 1. Create base content files
  const manifest = {
    bundleId: jobId,
    version: '1.0.0',
    panels: [
      { id: 'panel-1', width: 600, height: 400, thickness: 18 },
      { id: 'panel-2', width: 800, height: 500, thickness: 18 },
    ],
  };

  const meta = {
    jobId,
    projectName: 'Test Project',
    format: 'CUTLIST_CSV',
    exportedAtIso: timestamp,
    fileCount: 1,
    monolithVersion: '2.0.0',
  };

  const cutlist = 'Panel ID,Width,Height,Thickness\npanel-1,600,400,18\npanel-2,800,500,18\n';

  // 2. Create proof bundle
  const proof: JobProof = {
    ok: true,
    version: PROOF_VERSION,
    jobId,
    state: {
      specState: 'RELEASED',
      revisionId: 'rev-001',
      frozenAt: timestamp,
      releasedAt: timestamp,
    },
    latestVerify: {
      at: timestamp,
      verdict: 'PASS',
      summary: 'All checks passed',
    },
    canExport: true,
    generatedAt: timestamp,
  };

  // 3. Create content ZIP (without receipt) to get content hash
  const contentEntries = [
    { name: 'exports/cutlist.csv', content: cutlist },
    { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) },
    { name: 'meta.json', content: JSON.stringify(meta, null, 2) },
  ];

  // Sort for determinism
  contentEntries.sort((a, b) => a.name.localeCompare(b.name));

  const contentZipBuffer = await createDeterministicZip(contentEntries);
  let contentSha256 = sha256Hex(contentZipBuffer);

  // Optionally tamper content hash
  if (tamperContent) {
    contentSha256 = 'tampered_' + contentSha256.slice(9);
  }

  // 4. Build receipt
  const baseReceipt = {
    version: RECEIPT_VERSION,
    jobId,
    contentSha256,
    export: {
      target: 'FACTORY',
      dialect: 'CUTLIST_CSV',
      mode: 'PRODUCTION',
      artifactName: `${jobId}_CUTLIST_CSV.zip`,
    },
    proof,
    generatedAt: timestamp,
    signature: { alg: 'none' as const } as ExportReceiptSignature,
  };

  // Compute receiptId
  const canonical = stableStringify(baseReceipt);
  const receiptId = sha256Hex(canonical);

  let receipt: ExportReceipt = {
    ...baseReceipt,
    receiptId,
  };

  // 5. Sign if requested
  if (signed) {
    const { signature, ...signablePayload } = receipt;
    const signableCanonical = stableStringify(signablePayload);
    const signatureBuffer = sign(null, Buffer.from(signableCanonical), {
      key: keyPair.privateKeyDer,
      format: 'der',
      type: 'pkcs8',
    });

    receipt = {
      ...receipt,
      signature: {
        alg: 'ed25519',
        keyId: keyPair.keyId,
        sig: signatureBuffer.toString('base64'),
      },
    };
  }

  // 6. Optionally tamper receipt
  if (tamperReceipt) {
    receipt = {
      ...receipt,
      jobId: 'tampered-job-id',
    };
  }

  // 7. Create final ZIP with receipt
  const finalEntries = [...contentEntries];
  if (includeReceipt) {
    finalEntries.push({
      name: 'receipt.json',
      content: JSON.stringify(receipt, null, 2),
    });
  }
  finalEntries.sort((a, b) => a.name.localeCompare(b.name));

  const zipBuffer = await createDeterministicZip(finalEntries);
  const zipSha256 = sha256Hex(zipBuffer);

  // Add zipSha256 to receipt (but don't regenerate ZIP - simulates real flow)
  receipt = { ...receipt, zipSha256 };

  return {
    zipBuffer,
    zipSha256,
    contentSha256,
    receipt,
    keyPair,
  };
}

/**
 * Create a deterministic ZIP from entries.
 */
async function createDeterministicZip(
  entries: Array<{ name: string; content: string | Buffer }>
): Promise<Buffer> {
  const zipfile = new yazl.ZipFile();

  for (const entry of entries) {
    const content =
      typeof entry.content === 'string'
        ? Buffer.from(entry.content, 'utf-8')
        : entry.content;

    zipfile.addBuffer(content, entry.name, {
      mtime: EPOCH_DATE,
      compress: true,
      compressionLevel: COMPRESSION_LEVEL,
    });
  }

  zipfile.end();

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    zipfile.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zipfile.outputStream.on('end', resolve);
    zipfile.outputStream.on('error', reject);
  });

  return Buffer.concat(chunks);
}

/**
 * Create a tampered ZIP by modifying one byte.
 */
export function tamperZipBuffer(zipBuffer: Buffer, offset: number = 100): Buffer {
  const tampered = Buffer.from(zipBuffer);
  if (offset < tampered.length) {
    tampered[offset] = (tampered[offset] + 1) % 256;
  }
  return tampered;
}
