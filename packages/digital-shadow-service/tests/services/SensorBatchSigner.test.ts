/**
 * Tests for SensorBatchSigner — Ed25519 signing and verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SensorBatchSigner } from '../../src/services/SensorBatchSigner';
import type { SensorDataPoint } from '../../src/types/sensor';
import { DataQuality } from '../../src/types/sensor';

describe('SensorBatchSigner', () => {
  const samplePoints: SensorDataPoint[] = [
    {
      sensorId: 'sensor-001',
      machineId: 'biesse-test-01',
      measurement: 'spindle_speed',
      value: 18000,
      unit: 'RPM',
      timestamp: new Date('2024-01-01T00:00:00Z'),
      quality: DataQuality.GOOD,
    },
    {
      sensorId: 'sensor-002',
      machineId: 'biesse-test-01',
      measurement: 'feed_rate',
      value: 85,
      unit: '%',
      timestamp: new Date('2024-01-01T00:00:00Z'),
      quality: DataQuality.GOOD,
    },
  ];

  it('should create batch with correct metadata', async () => {
    const signer = new SensorBatchSigner();
    // Skip key loading — test unsigned batch creation
    const batch = await signer.createSignedBatch('biesse-test-01', samplePoints);

    expect(batch.machineId).toBe('biesse-test-01');
    expect(batch.count).toBe(2);
    expect(batch.points).toHaveLength(2);
    expect(batch.contentHash).toBeDefined();
    expect(batch.batchId).toContain('biesse-test-01');
  });

  it('should produce consistent content hash for same data', async () => {
    const signer = new SensorBatchSigner();
    const batch1 = await signer.createSignedBatch('machine-1', samplePoints);
    const batch2 = await signer.createSignedBatch('machine-1', samplePoints);

    // Content hash should be the same (deterministic serialization)
    expect(batch1.contentHash).toBe(batch2.contentHash);
  });

  it('should produce different hash for different data', async () => {
    const signer = new SensorBatchSigner();
    const batch1 = await signer.createSignedBatch('machine-1', samplePoints);

    const modifiedPoints = [...samplePoints];
    modifiedPoints[0] = { ...modifiedPoints[0]!, value: 19000 };

    const batch2 = await signer.createSignedBatch('machine-1', modifiedPoints);

    expect(batch1.contentHash).not.toBe(batch2.contentHash);
  });

  it('should return null public key when no key loaded', () => {
    const signer = new SensorBatchSigner();
    expect(signer.getPublicKeyHex()).toBeNull();
  });
});
