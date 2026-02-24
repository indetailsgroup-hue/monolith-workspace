/**
 * verifiedPacketStore.test.ts - Tests for D0 Verified Packet Persistence
 *
 * @version 1.0.0 - Phase D0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useFactoryStore } from '../factoryStore';
import type { VerifyPacketResult } from '../../packet/verifyPacket';
import type { FactoryPacket, PacketManifest } from '../../packet/types';

// ============================================
// TEST FIXTURES
// ============================================

const createMockManifest = (): PacketManifest => ({
  schema: 'monolith.factory.packet@1.0',
  version: '1.0.0',
  jobId: 'JOB-001',
  projectId: 'PROJ-001',
  createdAt: '2024-01-15T10:00:00Z',
  toolVersion: 'monolith@1.0.0',
  files: [],
  contentHash: 'abc123',
});

const createMockPacket = (): FactoryPacket => ({
  manifest: createMockManifest(),
  drillMap: {
    version: 'drillmap.v1',
    panels: [],
    summary: {
      totalDrills: 50,
      totalBores: 25,
      byPurpose: { CAM: 25, BOLT: 25 },
      byDiameter: { '15': 25, '8': 25 },
    },
    tools: [],
  },
  connectors: {
    version: 'connectors.v1',
    minifix: [],
    summary: { totalPairs: 10, validPairs: 10, warningPairs: 0, errorPairs: 0 },
  },
  cutList: {
    version: 'cutlist.v1',
    rows: [],
    summary: {
      totalRows: 20,
      totalParts: 20,
      byMaterial: { 'MDF-18': { rows: 20, parts: 20 } },
    },
  },
  gateResult: {
    version: 'gate.v1',
    policyVersion: '1.0.0',
    passed: true,
    runAt: '2024-01-15T10:00:00Z',
    findings: { blockers: [], warnings: [], info: [] },
    summary: { blockerCount: 0, warningCount: 0, infoCount: 0 },
  },
});

const createMockVerifyResult = (valid: boolean): VerifyPacketResult => ({
  valid,
  timestamp: Date.now(),
  checks: [
    { id: 'MANIFEST_PRESENT', name: 'Manifest Present', status: 'PASS', message: 'OK' },
    { id: 'SCHEMA_VALID', name: 'Schema Valid', status: 'PASS', message: 'OK' },
    { id: 'FILES_COMPLETE', name: 'Files Complete', status: 'PASS', message: 'OK' },
    { id: 'HASHES_MATCH', name: 'Hashes Match', status: 'PASS', message: 'OK' },
    { id: 'CONTENT_HASH', name: 'Content Hash', status: 'PASS', message: 'OK' },
    { id: 'GATE_PASSED', name: 'Gate Passed', status: valid ? 'PASS' : 'FAIL', message: valid ? 'OK' : 'Gate failed' },
    { id: 'NO_EXTRA_FILES', name: 'No Extra Files', status: 'PASS', message: 'OK' },
  ],
  summary: {
    passed: valid ? 7 : 6,
    failed: valid ? 0 : 1,
    warned: 0,
    skipped: 0,
  },
  hashMismatches: [],
  missingFiles: [],
  extraFiles: [],
  packet: createMockPacket(),
});

// ============================================
// TESTS
// ============================================

describe('D0: Verified Packet Store', () => {
  beforeEach(() => {
    // Reset store state
    useFactoryStore.setState({
      verifiedPacketByJobId: {},
      activityLog: [],
    });
  });

  describe('getVerifiedPacketCacheEntry', () => {
    it('returns IDLE state for unknown job', () => {
      const store = useFactoryStore.getState();
      const entry = store.getVerifiedPacketCacheEntry('UNKNOWN-JOB');

      expect(entry.status).toBe('IDLE');
      expect(entry.fileName).toBeNull();
      expect(entry.verifyResult).toBeNull();
      expect(entry.packet).toBeNull();
    });
  });

  describe('setVerifiedPacket', () => {
    it('stores verified packet with VERIFIED status', () => {
      const store = useFactoryStore.getState();
      const verifyResult = createMockVerifyResult(true);
      const packet = createMockPacket();

      store.setVerifiedPacket(
        'JOB-001',
        'packet-JOB-001.zip',
        verifyResult,
        packet,
        12345
      );

      const entry = store.getVerifiedPacketCacheEntry('JOB-001');

      expect(entry.status).toBe('VERIFIED');
      expect(entry.fileName).toBe('packet-JOB-001.zip');
      expect(entry.fileSizeBytes).toBe(12345);
      expect(entry.verifyResult).toBe(verifyResult);
      expect(entry.packet).toBe(packet);
      expect(entry.verifiedAt).toBeTruthy();
    });

    it('stores invalid packet with INVALID status', () => {
      const store = useFactoryStore.getState();
      const verifyResult = createMockVerifyResult(false);

      store.setVerifiedPacket(
        'JOB-002',
        'invalid-packet.zip',
        verifyResult,
        null,
        5000
      );

      const entry = store.getVerifiedPacketCacheEntry('JOB-002');

      expect(entry.status).toBe('INVALID');
      expect(entry.fileName).toBe('invalid-packet.zip');
    });

    it('adds activity log entry for verified packet', () => {
      const store = useFactoryStore.getState();
      const verifyResult = createMockVerifyResult(true);

      store.setVerifiedPacket(
        'JOB-001',
        'packet.zip',
        verifyResult,
        null,
        10000
      );

      const state = useFactoryStore.getState();
      const activities = state.activityLog;

      expect(activities.length).toBeGreaterThan(0);
      expect(activities[0].type).toBe('VERIFY_PASSED');
      expect(activities[0].jobId).toBe('JOB-001');
      expect(activities[0].details?.source).toBe('packet-ingest');
    });

    it('adds activity log entry for failed verification', () => {
      const store = useFactoryStore.getState();
      const verifyResult = createMockVerifyResult(false);

      store.setVerifiedPacket(
        'JOB-003',
        'bad-packet.zip',
        verifyResult,
        null,
        5000
      );

      const state = useFactoryStore.getState();
      const activities = state.activityLog;

      expect(activities.length).toBeGreaterThan(0);
      expect(activities[0].type).toBe('VERIFY_FAILED');
    });
  });

  describe('clearVerifiedPacket', () => {
    it('removes verified packet for job', () => {
      const store = useFactoryStore.getState();
      const verifyResult = createMockVerifyResult(true);

      // First add a packet
      store.setVerifiedPacket(
        'JOB-001',
        'packet.zip',
        verifyResult,
        null,
        10000
      );

      // Verify it exists
      let entry = store.getVerifiedPacketCacheEntry('JOB-001');
      expect(entry.status).toBe('VERIFIED');

      // Clear it
      store.clearVerifiedPacket('JOB-001');

      // Verify it's gone
      entry = store.getVerifiedPacketCacheEntry('JOB-001');
      expect(entry.status).toBe('IDLE');
    });
  });

  describe('clearAllVerifiedPackets', () => {
    it('removes all verified packets', () => {
      const store = useFactoryStore.getState();
      const verifyResult = createMockVerifyResult(true);

      // Add multiple packets
      store.setVerifiedPacket('JOB-001', 'p1.zip', verifyResult, null, 1000);
      store.setVerifiedPacket('JOB-002', 'p2.zip', verifyResult, null, 2000);
      store.setVerifiedPacket('JOB-003', 'p3.zip', verifyResult, null, 3000);

      // Verify they exist
      expect(store.getVerifiedPacketCacheEntry('JOB-001').status).toBe('VERIFIED');
      expect(store.getVerifiedPacketCacheEntry('JOB-002').status).toBe('VERIFIED');
      expect(store.getVerifiedPacketCacheEntry('JOB-003').status).toBe('VERIFIED');

      // Clear all
      store.clearAllVerifiedPackets();

      // Verify they're gone
      expect(store.getVerifiedPacketCacheEntry('JOB-001').status).toBe('IDLE');
      expect(store.getVerifiedPacketCacheEntry('JOB-002').status).toBe('IDLE');
      expect(store.getVerifiedPacketCacheEntry('JOB-003').status).toBe('IDLE');
    });
  });

  describe('multiple jobs isolation', () => {
    it('stores and retrieves packets for different jobs independently', () => {
      const store = useFactoryStore.getState();
      const result1 = createMockVerifyResult(true);
      const result2 = createMockVerifyResult(false);

      store.setVerifiedPacket('JOB-001', 'valid.zip', result1, createMockPacket(), 10000);
      store.setVerifiedPacket('JOB-002', 'invalid.zip', result2, null, 5000);

      const entry1 = store.getVerifiedPacketCacheEntry('JOB-001');
      const entry2 = store.getVerifiedPacketCacheEntry('JOB-002');

      expect(entry1.status).toBe('VERIFIED');
      expect(entry1.fileName).toBe('valid.zip');

      expect(entry2.status).toBe('INVALID');
      expect(entry2.fileName).toBe('invalid.zip');
    });
  });
});
