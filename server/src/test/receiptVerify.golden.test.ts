/**
 * receiptVerify.golden.test.ts - P13.4 Golden Test Matrix
 *
 * Comprehensive tests for receipt verification:
 * - PASS baseline
 * - Receipt tamper detection
 * - ZIP content tamper detection
 * - Content hash mismatch
 * - Revoked key rejection
 *
 * @version 0.13.4
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  createTestFixture,
  generateTestKeyPair,
  tamperZipBuffer,
  TEST_KEY_ID,
} from './fixtures/createTestFixture.js';
import { verifyReceiptZip, CLI_VERSION } from '../cli/receiptVerify.js';
import { __setPinnedKeysForTest } from '../crypto/receiptKeyStore.js';
import type { PinnedPublicKey } from '../crypto/receiptKeyStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Test Setup
// ============================================================================

const TEST_DIR = join(__dirname, '.test-temp');

function writeTestZip(name: string, buffer: Buffer): string {
  const path = join(TEST_DIR, name);
  writeFileSync(path, buffer);
  return path;
}

// Inject trusted keys in memory — never mutates the on-disk production key file.
function setPinnedKeys(keys: PinnedPublicKey[]): void {
  __setPinnedKeysForTest(keys);
}

// ============================================================================
// Test Suite
// ============================================================================

describe('P13.4 Golden Test Matrix - Receipt Verification', () => {
  beforeAll(() => {
    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  beforeEach(() => {
    // Isolate each test with no trusted keys until it injects its own.
    __setPinnedKeysForTest([]);
  });

  // ==========================================================================
  // 1. PASS Baseline
  // ==========================================================================

  describe('PASS Baseline', () => {
    it('should PASS for valid signed receipt with known key', async () => {
      const keyPair = generateTestKeyPair();

      // Set up pinned keys
      setPinnedKeys([
        {
          keyId: keyPair.keyId,
          publicKeyBase64: keyPair.publicKeyBase64,
          algorithm: 'ed25519',
          validFrom: '2024-01-01T00:00:00.000Z',
        },
      ]);

      const fixture = await createTestFixture({ keyPair, signed: true });
      const zipPath = writeTestZip('valid-signed.zip', fixture.zipBuffer);

      const result = await verifyReceiptZip(zipPath);

      expect(result.version).toBe(CLI_VERSION);
      expect(result.verdict).toBe('PASS');
      expect(result.code).toBe('R_OK');
      expect(result.zipSha256).toBe(fixture.zipSha256);
      expect(result.contentSha256).toBeDefined();
      expect(result.receiptId).toBe(fixture.receipt.receiptId);
      expect(result.keyId).toBe(keyPair.keyId);
    });

    it('should PASS for unsigned receipt with warning', async () => {
      const fixture = await createTestFixture({ signed: false });
      const zipPath = writeTestZip('valid-unsigned.zip', fixture.zipBuffer);

      const result = await verifyReceiptZip(zipPath);

      expect(result.verdict).toBe('PASS');
      expect(result.code).toBe('R_OK');
      expect(result.warnings).toContain('Receipt is unsigned (alg: none)');
    });
  });

  // ==========================================================================
  // 2. Receipt Tamper Detection
  // ==========================================================================

  describe('Receipt Tamper Detection', () => {
    it('should FAIL when receipt content is modified (signature invalid)', async () => {
      const keyPair = generateTestKeyPair();

      setPinnedKeys([
        {
          keyId: keyPair.keyId,
          publicKeyBase64: keyPair.publicKeyBase64,
          algorithm: 'ed25519',
          validFrom: '2024-01-01T00:00:00.000Z',
        },
      ]);

      // Create fixture with tampered receipt (jobId changed after signing)
      const fixture = await createTestFixture({
        keyPair,
        signed: true,
        tamperReceipt: true,
      });
      const zipPath = writeTestZip('tampered-receipt.zip', fixture.zipBuffer);

      const result = await verifyReceiptZip(zipPath);

      expect(result.verdict).toBe('FAIL');
      // Could be R_SIG_INVALID or R_RECEIPT_ID_MISMATCH depending on what changed
      expect(['R_SIG_INVALID', 'R_RECEIPT_ID_MISMATCH']).toContain(result.code);
    });

    it('should FAIL when receiptId does not match content', async () => {
      const fixture = await createTestFixture({ signed: false });

      // Manually corrupt the receiptId in the ZIP
      const zipPath = writeTestZip('bad-receipt-id.zip', fixture.zipBuffer);

      // Note: This test verifies that receiptId validation works
      // The fixture generator creates valid receipts, so we test via tamperReceipt
      const tamperedFixture = await createTestFixture({
        signed: false,
        tamperReceipt: true,
      });
      const tamperedPath = writeTestZip('tampered-id.zip', tamperedFixture.zipBuffer);

      const result = await verifyReceiptZip(tamperedPath);

      expect(result.verdict).toBe('FAIL');
      expect(result.code).toBe('R_RECEIPT_ID_MISMATCH');
    });
  });

  // ==========================================================================
  // 3. ZIP Content Tamper Detection
  // ==========================================================================

  describe('ZIP Content Tamper Detection', () => {
    it('should FAIL when ZIP bytes are modified', async () => {
      const keyPair = generateTestKeyPair();

      setPinnedKeys([
        {
          keyId: keyPair.keyId,
          publicKeyBase64: keyPair.publicKeyBase64,
          algorithm: 'ed25519',
          validFrom: '2024-01-01T00:00:00.000Z',
        },
      ]);

      const fixture = await createTestFixture({ keyPair, signed: true });

      // Tamper with ZIP bytes
      const tamperedBuffer = tamperZipBuffer(fixture.zipBuffer, 200);
      const zipPath = writeTestZip('tampered-zip.zip', tamperedBuffer);

      const result = await verifyReceiptZip(zipPath);

      // Should fail - either can't parse ZIP or hash mismatch
      expect(result.verdict).toBe('FAIL');
      expect([
        'R_ZIP_HASH_MISMATCH',
        'R_CONTENT_HASH_MISMATCH',
        'R_INVALID_RECEIPT_JSON',
        'R_NO_RECEIPT',
        'R_NOT_A_ZIP',
      ]).toContain(result.code);
    });
  });

  // ==========================================================================
  // 4. Content Hash Mismatch
  // ==========================================================================

  describe('Content Hash Mismatch', () => {
    it('should FAIL when contentSha256 does not match computed hash', async () => {
      // Create fixture with tampered content hash
      const fixture = await createTestFixture({
        signed: false,
        tamperContent: true,
      });
      const zipPath = writeTestZip('content-mismatch.zip', fixture.zipBuffer);

      const result = await verifyReceiptZip(zipPath);

      expect(result.verdict).toBe('FAIL');
      // Could be receipt ID mismatch (since contentSha256 affects receiptId)
      // or content hash mismatch
      expect(['R_CONTENT_HASH_MISMATCH', 'R_RECEIPT_ID_MISMATCH']).toContain(result.code);
    });
  });

  // ==========================================================================
  // 5. Key Validation
  // ==========================================================================

  describe('Key Validation', () => {
    it('should FAIL when signing key is unknown', async () => {
      const keyPair = generateTestKeyPair('unknown-key');

      // Don't add key to pinned keys
      setPinnedKeys([]);

      const fixture = await createTestFixture({ keyPair, signed: true });
      const zipPath = writeTestZip('unknown-key.zip', fixture.zipBuffer);

      const result = await verifyReceiptZip(zipPath);

      expect(result.verdict).toBe('FAIL');
      expect(result.code).toBe('R_SIG_KEY_UNKNOWN');
      expect(result.keyId).toBe('unknown-key');
    });

    it('should FAIL when signing key is revoked', async () => {
      const keyPair = generateTestKeyPair('revoked-key');

      // Add revoked key to pinned keys
      setPinnedKeys([
        {
          keyId: keyPair.keyId,
          publicKeyBase64: keyPair.publicKeyBase64,
          algorithm: 'ed25519',
          validFrom: '2024-01-01T00:00:00.000Z',
          revoked: true,
          revokedAt: '2025-01-01T00:00:00.000Z',
          revokedReason: 'Test revocation',
        },
      ]);

      const fixture = await createTestFixture({ keyPair, signed: true });
      const zipPath = writeTestZip('revoked-key.zip', fixture.zipBuffer);

      const result = await verifyReceiptZip(zipPath);

      expect(result.verdict).toBe('FAIL');
      expect(result.code).toBe('R_SIG_KEY_REVOKED');
    });

    it('should FAIL when key is not yet valid', async () => {
      const keyPair = generateTestKeyPair('future-key');

      // Add key with future validFrom
      setPinnedKeys([
        {
          keyId: keyPair.keyId,
          publicKeyBase64: keyPair.publicKeyBase64,
          algorithm: 'ed25519',
          validFrom: '2099-01-01T00:00:00.000Z', // Far future
        },
      ]);

      const fixture = await createTestFixture({ keyPair, signed: true });
      const zipPath = writeTestZip('future-key.zip', fixture.zipBuffer);

      const result = await verifyReceiptZip(zipPath);

      expect(result.verdict).toBe('FAIL');
      expect(result.code).toBe('R_SIG_KEY_EXPIRED'); // "expired" covers not-yet-valid
    });

    it('should FAIL when key has expired', async () => {
      const keyPair = generateTestKeyPair('expired-key');

      // Add expired key
      setPinnedKeys([
        {
          keyId: keyPair.keyId,
          publicKeyBase64: keyPair.publicKeyBase64,
          algorithm: 'ed25519',
          validFrom: '2020-01-01T00:00:00.000Z',
          validUntil: '2021-01-01T00:00:00.000Z', // Expired
        },
      ]);

      const fixture = await createTestFixture({ keyPair, signed: true });
      const zipPath = writeTestZip('expired-key.zip', fixture.zipBuffer);

      const result = await verifyReceiptZip(zipPath);

      expect(result.verdict).toBe('FAIL');
      expect(result.code).toBe('R_SIG_KEY_EXPIRED');
    });
  });

  // ==========================================================================
  // 6. Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should FAIL for non-existent file', async () => {
      const result = await verifyReceiptZip('/nonexistent/path/file.zip');

      expect(result.verdict).toBe('FAIL');
      expect(result.code).toBe('R_FILE_NOT_FOUND');
    });

    it('should FAIL for ZIP without receipt.json', async () => {
      const fixture = await createTestFixture({ includeReceipt: false });
      const zipPath = writeTestZip('no-receipt.zip', fixture.zipBuffer);

      const result = await verifyReceiptZip(zipPath);

      expect(result.verdict).toBe('FAIL');
      expect(result.code).toBe('R_NO_RECEIPT');
    });

    it('should FAIL for invalid JSON in receipt.json', async () => {
      // Create a ZIP with invalid JSON receipt
      const yazl = await import('yazl');
      const zipfile = new yazl.ZipFile();

      zipfile.addBuffer(Buffer.from('not valid json {{{'), 'receipt.json', {
        mtime: new Date(0),
        compress: true,
      });
      zipfile.end();

      const chunks: Buffer[] = [];
      await new Promise<void>((resolve) => {
        zipfile.outputStream.on('data', (c: Buffer) => chunks.push(c));
        zipfile.outputStream.on('end', resolve);
      });

      const zipPath = writeTestZip('invalid-json.zip', Buffer.concat(chunks));

      const result = await verifyReceiptZip(zipPath);

      expect(result.verdict).toBe('FAIL');
      expect(result.code).toBe('R_INVALID_RECEIPT_JSON');
    });
  });
});
