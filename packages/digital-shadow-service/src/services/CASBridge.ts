/**
 * MONOLITH Digital Shadow — CAS Bridge
 * Integrates with MONOLITH Factory Server's Content-Addressable Storage
 * Stores signed sensor batches and state snapshots
 */

import { createHash } from 'node:crypto';
import pino from 'pino';
import { factoryServerConfig } from '../config';
import type { SensorBatch } from '../types/sensor';
import type { MachineStateSnapshot } from '../types/machine';
import type { CASEntry } from '../types/job';
import { CASContentType } from '../types/job';

export class CASBridge {
  private logger = pino({ name: 'cas-bridge' });
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = factoryServerConfig.url ?? 'http://localhost:3000';
    this.apiKey = factoryServerConfig.apiKey ?? '';
  }

  // ─── Store Sensor Batch ────────────────────────────────────────────────────

  /**
   * Store a signed sensor batch in CAS
   * Returns the content hash (CAS address)
   */
  async storeSensorBatch(batch: SensorBatch): Promise<string> {
    const serialized = JSON.stringify(batch.points);
    const hash = this.computeHash(serialized);

    const entry: Omit<CASEntry, 'createdAt'> = {
      hash,
      contentType: CASContentType.SENSOR_BATCH,
      size: Buffer.byteLength(serialized),
      signature: batch.signature ?? '',
      publicKey: '', // Will be set by SensorBatchSigner
      sourceRef: {
        machineId: batch.machineId,
        batchId: batch.batchId,
      },
    };

    await this.putToCAS(hash, serialized, entry);
    this.logger.debug({ hash, machineId: batch.machineId, points: batch.count }, 'Sensor batch stored in CAS');

    return hash;
  }

  // ─── Store State Snapshot ──────────────────────────────────────────────────

  /**
   * Store a machine state snapshot in CAS
   */
  async storeStateSnapshot(snapshot: MachineStateSnapshot): Promise<string> {
    const serialized = JSON.stringify(snapshot);
    const hash = this.computeHash(serialized);

    const entry: Omit<CASEntry, 'createdAt'> = {
      hash,
      contentType: CASContentType.STATE_SNAPSHOT,
      size: Buffer.byteLength(serialized),
      signature: '',
      publicKey: '',
      sourceRef: {
        machineId: snapshot.machineId,
      },
    };

    await this.putToCAS(hash, serialized, entry);
    this.logger.debug({ hash, machineId: snapshot.machineId }, 'State snapshot stored in CAS');

    return hash;
  }

  // ─── Retrieve from CAS ─────────────────────────────────────────────────────

  /**
   * Retrieve content by hash from Factory Server CAS
   */
  async retrieve(hash: string): Promise<unknown | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/cas/${hash}`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`CAS retrieve failed: ${response.status}`);
      }

      return response.json();
    } catch (err) {
      this.logger.error({ err, hash }, 'Failed to retrieve from CAS');
      return null;
    }
  }

  // ─── Verify Integrity ──────────────────────────────────────────────────────

  /**
   * Verify that stored content matches its hash (integrity check)
   */
  async verify(hash: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/cas/${hash}/verify`, {
        method: 'POST',
        headers: this.getHeaders(),
      });

      if (!response.ok) return false;
      const result = (await response.json()) as { valid: boolean };
      return result.valid;
    } catch (err) {
      this.logger.error({ err, hash }, 'CAS verification failed');
      return false;
    }
  }

  // ─── Private Methods ───────────────────────────────────────────────────────

  private async putToCAS(
    hash: string,
    content: string,
    metadata: Omit<CASEntry, 'createdAt'>,
  ): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/cas`, {
        method: 'PUT',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hash,
          content,
          metadata,
        }),
      });

      if (!response.ok) {
        throw new Error(`CAS PUT failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      this.logger.error({ err, hash }, 'Failed to store in CAS');
      throw err;
    }
  }

  private computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }
    return headers;
  }
}
