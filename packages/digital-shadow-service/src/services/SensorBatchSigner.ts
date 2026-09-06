/**
 * MONOLITH Digital Shadow — Sensor Batch Signer
 * Ed25519 digital signature for sensor data integrity
 * Ensures tamper-evident data pipeline from machine to CAS
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as ed from '@noble/ed25519';
import pino from 'pino';
import type { SensorBatch } from '../types/sensor';
import type { SensorDataPoint } from '../types/sensor';

export class SensorBatchSigner {
  private logger = pino({ name: 'sensor-batch-signer' });
  private privateKey: Uint8Array | null = null;
  private publicKey: Uint8Array | null = null;
  private batchCounter = 0;

  constructor(
    private readonly privateKeyPath = process.env.ED25519_PRIVATE_KEY_PATH,
  ) {}

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    try {
      if (this.privateKeyPath) {
        const keyPem = readFileSync(this.privateKeyPath, 'utf-8');
        this.privateKey = this.extractKeyFromPem(keyPem);
        this.publicKey = await ed.getPublicKeyAsync(this.privateKey);
        this.logger.info('Ed25519 signing keys loaded');
      } else {
        this.logger.warn('No signing key configured — batches will not be signed');
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to load signing keys');
      throw err;
    }
  }

  // ─── Batch Creation ────────────────────────────────────────────────────────

  /**
   * Create a new sensor batch from data points
   * Computes content hash and signs with Ed25519
   */
  async createSignedBatch(
    machineId: string,
    points: SensorDataPoint[],
  ): Promise<SensorBatch> {
    this.batchCounter++;

    const batchId = `batch-${machineId}-${Date.now()}-${this.batchCounter}`;
    const serialized = this.serializePoints(points);
    const contentHash = this.computeHash(serialized);

    let signature: string | undefined;

    if (this.privateKey) {
      const signatureBytes = await ed.signAsync(
        new TextEncoder().encode(contentHash),
        this.privateKey,
      );
      signature = Buffer.from(signatureBytes).toString('hex');
    }

    const batch: SensorBatch = {
      batchId,
      machineId,
      createdAt: new Date(),
      count: points.length,
      points,
      signature,
      contentHash,
    };

    this.logger.debug(
      { batchId, pointCount: points.length, signed: !!signature },
      'Signed batch created',
    );

    return batch;
  }

  // ─── Verification ──────────────────────────────────────────────────────────

  /**
   * Verify a batch signature
   * Used by downstream consumers to validate data integrity
   */
  async verifyBatch(batch: SensorBatch): Promise<boolean> {
    if (!batch.signature || !batch.contentHash) {
      this.logger.warn({ batchId: batch.batchId }, 'Batch has no signature');
      return false;
    }

    if (!this.publicKey) {
      this.logger.warn('No public key available for verification');
      return false;
    }

    try {
      // Recompute hash from points
      const serialized = this.serializePoints(batch.points);
      const recomputedHash = this.computeHash(serialized);

      // Check content hash matches
      if (recomputedHash !== batch.contentHash) {
        this.logger.error(
          { batchId: batch.batchId },
          'Content hash mismatch — data may be tampered',
        );
        return false;
      }

      // Verify Ed25519 signature
      const signatureBytes = Buffer.from(batch.signature, 'hex');
      const isValid = await ed.verifyAsync(
        signatureBytes,
        new TextEncoder().encode(batch.contentHash),
        this.publicKey,
      );

      if (!isValid) {
        this.logger.error(
          { batchId: batch.batchId },
          'Signature verification failed',
        );
      }

      return isValid;
    } catch (err) {
      this.logger.error({ err, batchId: batch.batchId }, 'Verification error');
      return false;
    }
  }

  // ─── Public Key Export ─────────────────────────────────────────────────────

  getPublicKeyHex(): string | null {
    if (!this.publicKey) return null;
    return Buffer.from(this.publicKey).toString('hex');
  }

  // ─── Private Methods ───────────────────────────────────────────────────────

  private serializePoints(points: SensorDataPoint[]): string {
    // Deterministic serialization (sorted keys, consistent format)
    return JSON.stringify(
      points.map((p) => ({
        s: p.sensorId,
        m: p.machineId,
        n: p.measurement,
        v: p.value,
        t: p.timestamp.toISOString(),
      })),
    );
  }

  private computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private extractKeyFromPem(pem: string): Uint8Array {
    // Strip PEM headers and decode base64
    const lines = pem.split('\n').filter(
      (line) => !line.startsWith('-----') && line.trim().length > 0,
    );
    const der = Buffer.from(lines.join(''), 'base64');
    // Ed25519 private key is last 32 bytes of DER
    return new Uint8Array(der.slice(-32));
  }
}
