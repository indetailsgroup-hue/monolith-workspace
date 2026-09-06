/**
 * HomagAdapter Unit Tests — nock-based HTTP mocking
 *
 * Tests the dual-channel (HOMAG Connect REST + OPC UA fallback) adapter.
 * OPC UA methods are mocked via vi.mock('node-opcua').
 * HTTP calls to HOMAG Connect API are intercepted by nock.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import nock from 'nock';
import { HomagAdapter } from '../../src/adapters/HomagAdapter.js';
import type { MachineEndpoint } from '../../src/types/machine.js';
import { WwUnitState, WwUnitMode, MachineVendor, AdapterProtocol } from '../../src/types/machine.js';
import { DataQuality } from '../../src/types/sensor.js';

// ─── Mock node-opcua ──────────────────────────────────────────────────────────

const mockSession = {
  read: vi.fn(),
  write: vi.fn(),
  call: vi.fn(),
  close: vi.fn(),
};

const mockSubscription = {
  terminate: vi.fn(),
};

const mockMonitoredItem = {
  on: vi.fn(),
};

const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn().mockResolvedValue(mockSession),
};

vi.mock('node-opcua', () => ({
  OPCUAClient: {
    create: vi.fn(() => mockClient),
  },
  ClientSubscription: {
    create: vi.fn(() => mockSubscription),
  },
  ClientMonitoredItem: {
    create: vi.fn(() => mockMonitoredItem),
  },
  AttributeIds: { Value: 13 },
  DataType: { String: 12, UInt32: 7 },
  DataValue: class {},
  TimestampsToReturn: { Both: 2 },
  MessageSecurityMode: { SignAndEncrypt: 3 },
  SecurityPolicy: { Basic256Sha256: 'Basic256Sha256' },
  Variant: class {
    constructor(public opts: any) {}
  },
  StatusCodes: {
    Good: { value: 0 },
    Bad: { value: 0x80000000 },
  },
}));

// Mock config
vi.mock('../../src/config/index.js', () => ({
  opcuaConfig: {
    applicationName: 'DigitalShadowTest',
    applicationUri: 'urn:monolith:digital-shadow:test',
  },
  config: {
    INFLUX_URL: 'http://localhost:8086',
    INFLUX_TOKEN: 'test-token',
    INFLUX_ORG: 'monolith',
    INFLUX_BUCKET: 'telemetry',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const HOMAG_API_URL = 'https://connect.homag.cloud/api/v1';
const MACHINE_SERIAL = 'EDGE-001-SN-2024';

const createEndpoint = (withCloud = true): MachineEndpoint => ({
  machineId: 'homag-edgeteq-001',
  displayName: 'HOMAG EDGETEQ S-380 #1',
  vendor: MachineVendor.HOMAG,
  protocol: AdapterProtocol.OPCUA_PLUS_CLOUD,
  opcuaEndpoint: 'opc.tcp://192.168.1.20:4840',
  pollingIntervalMs: 1000,
  publishIntervalMs: 500,
  ...(withCloud && {
    homagConnect: {
      apiUrl: HOMAG_API_URL,
      apiKey: 'test-api-key-12345',
      machineSerial: MACHINE_SERIAL,
    },
  }),
});

// Helper: good OPC UA status
const goodStatus = () => ({ isGood: () => true, toString: () => 'Good' });
const badStatus = () => ({ isGood: () => false, toString: () => 'Bad' });

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('HomagAdapter', () => {
  let adapter: HomagAdapter;

  beforeAll(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    nock.cleanAll();
    adapter = new HomagAdapter(createEndpoint());
  });

  afterEach(async () => {
    // Clear any pending polling timers
    try { await adapter.disconnect(); } catch { /* already disconnected */ }
    nock.cleanAll();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('connect()', () => {
    it('should connect OPC UA client and start cloud polling', async () => {
      // Nock cloud initial fetch
      nock(HOMAG_API_URL)
        .get(`/machines/${MACHINE_SERIAL}/data/current`)
        .reply(200, {
          machineId: 'homag-edgeteq-001',
          timestamp: new Date().toISOString(),
          state: 'WORKING',
          counters: { totalParts: 1000, partsToday: 42, runtime: 3600 },
          currentJob: { name: 'EDGE-PANEL-A', progress: 0.65 },
        });

      await adapter.connect();

      expect(mockClient.connect).toHaveBeenCalledWith('opc.tcp://192.168.1.20:4840');
      expect(mockClient.createSession).toHaveBeenCalled();
    });

    it('should connect without cloud when homagConnect is undefined', async () => {
      const noCloudAdapter = new HomagAdapter(createEndpoint(false));
      await noCloudAdapter.connect();

      expect(mockClient.connect).toHaveBeenCalled();
      // No nock needed — no HTTP call expected
      await noCloudAdapter.disconnect();
    });
  });

  describe('disconnect()', () => {
    it('should close session and disconnect client', async () => {
      nock(HOMAG_API_URL)
        .get(`/machines/${MACHINE_SERIAL}/data/current`)
        .reply(200, { machineId: 'homag-edgeteq-001', timestamp: new Date().toISOString(), state: 'STANDBY', counters: { totalParts: 0, partsToday: 0, runtime: 0 } });

      await adapter.connect();
      await adapter.disconnect();

      expect(mockSubscription.terminate).toHaveBeenCalled();
      expect(mockSession.close).toHaveBeenCalled();
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('ping()', () => {
    it('should return true when session read succeeds', async () => {
      nock(HOMAG_API_URL)
        .get(`/machines/${MACHINE_SERIAL}/data/current`)
        .reply(200, { machineId: 'test', timestamp: new Date().toISOString(), state: 'READY', counters: { totalParts: 0, partsToday: 0, runtime: 0 } });

      await adapter.connect();

      mockSession.read.mockResolvedValueOnce({ statusCode: goodStatus() });
      const result = await adapter.ping();
      expect(result).toBe(true);
    });

    it('should return false when session read fails', async () => {
      nock(HOMAG_API_URL)
        .get(`/machines/${MACHINE_SERIAL}/data/current`)
        .reply(200, { machineId: 'test', timestamp: new Date().toISOString(), state: 'READY', counters: { totalParts: 0, partsToday: 0, runtime: 0 } });

      await adapter.connect();

      mockSession.read.mockRejectedValueOnce(new Error('Connection lost'));
      const result = await adapter.ping();
      expect(result).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE READING
  // ═══════════════════════════════════════════════════════════════════════════

  describe('readState()', () => {
    beforeEach(async () => {
      nock(HOMAG_API_URL)
        .get(`/machines/${MACHINE_SERIAL}/data/current`)
        .reply(200, {
          machineId: 'homag-edgeteq-001',
          timestamp: new Date().toISOString(),
          state: 'WORKING',
          counters: { totalParts: 500, partsToday: 15, runtime: 7200 },
          currentJob: { name: 'EDGE-PANEL-B', progress: 0.4 },
        });
      await adapter.connect();
    });

    it('should read full machine state snapshot via OPC UA + cloud enrichment', async () => {
      mockSession.read.mockResolvedValue([
        { value: { value: WwUnitState.WORKING }, statusCode: goodStatus() },
        { value: { value: WwUnitMode.AUTOMATIC }, statusCode: goodStatus() },
        { value: { value: 12.5 }, statusCode: goodStatus() },
        { value: { value: 150 }, statusCode: goodStatus() },
        { value: { value: 'PROG-001' }, statusCode: goodStatus() },
        { value: { value: 7200 }, statusCode: goodStatus() },
      ]);

      // The cloud request is intentionally fire-and-forget. Poll the observable
      // state instead of relying on a fixed delay that flakes on busy runners.
      await vi.waitFor(async () => {
        const enrichedState = await adapter.readState();
        expect(enrichedState.currentProgram).toBe('EDGE-PANEL-B');
      });

      const state = await adapter.readState();

      expect(state.machineId).toBe('homag-edgeteq-001');
      expect(state.state).toBe(WwUnitState.WORKING);
      expect(state.mode).toBe(WwUnitMode.AUTOMATIC);
      expect(state.feedRate).toBe(12.5);
      expect(state.partCount).toBe(150);
      expect(state.runtimeSeconds).toBe(7200);
      // Cloud enrichment: program name from HOMAG Connect
      expect(state.currentProgram).toBe('EDGE-PANEL-B');
    });

    it('should handle OFFLINE state mapping for unknown values', async () => {
      mockSession.read.mockResolvedValueOnce([
        { value: { value: 99 }, statusCode: goodStatus() },
        { value: { value: 99 }, statusCode: goodStatus() },
        { value: { value: 0 }, statusCode: goodStatus() },
        { value: { value: 0 }, statusCode: goodStatus() },
        { value: { value: '' }, statusCode: goodStatus() },
        { value: { value: 0 }, statusCode: goodStatus() },
      ]);

      const state = await adapter.readState();
      expect(state.state).toBe(WwUnitState.OFFLINE);
      expect(state.mode).toBe(WwUnitMode.OTHER);
    });
  });

  describe('readUnitState()', () => {
    beforeEach(async () => {
      nock(HOMAG_API_URL)
        .get(`/machines/${MACHINE_SERIAL}/data/current`)
        .reply(200, { machineId: 'test', timestamp: new Date().toISOString(), state: 'READY', counters: { totalParts: 0, partsToday: 0, runtime: 0 } });
      await adapter.connect();
    });

    it('should return mapped WwUnitState from OPC UA', async () => {
      mockSession.read.mockResolvedValueOnce({ value: { value: 2 } });
      const state = await adapter.readUnitState();
      expect(state).toBe(WwUnitState.READY);
    });

    it('should return STANDBY for value 1', async () => {
      mockSession.read.mockResolvedValueOnce({ value: { value: 1 } });
      const state = await adapter.readUnitState();
      expect(state).toBe(WwUnitState.STANDBY);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TELEMETRY
  // ═══════════════════════════════════════════════════════════════════════════

  describe('readTelemetry()', () => {
    beforeEach(async () => {
      nock(HOMAG_API_URL)
        .get(`/machines/${MACHINE_SERIAL}/data/current`)
        .reply(200, {
          machineId: 'homag-edgeteq-001',
          timestamp: new Date().toISOString(),
          state: 'WORKING',
          counters: { totalParts: 800, partsToday: 23, runtime: 5400 },
        });
      await adapter.connect();
    });

    it('should return OPC UA feed speed + cloud counter telemetry', async () => {
      mockSession.read.mockResolvedValueOnce([
        { value: { value: 15.2 }, statusCode: goodStatus() },
      ]);

      await new Promise((r) => setTimeout(r, 50));
      const points = await adapter.readTelemetry();

      expect(points.length).toBeGreaterThanOrEqual(1);
      expect(points[0].measurement).toBe('feed_speed');
      expect(points[0].value).toBe(15.2);
      expect(points[0].unit).toBe('m/min');
      expect(points[0].tags?.vendor).toBe('homag');

      // Cloud-sourced telemetry
      const cloudPoint = points.find((p) => p.measurement === 'parts_today');
      if (cloudPoint) {
        expect(cloudPoint.value).toBe(23);
        expect(cloudPoint.quality).toBe(DataQuality.GOOD);
        expect(cloudPoint.tags?.source).toBe('connect_cloud');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — WRITE COMMANDS (Dual Channel)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('startJob() — HOMAG Connect primary', () => {
    beforeEach(async () => {
      nock(HOMAG_API_URL)
        .get(`/machines/${MACHINE_SERIAL}/data/current`)
        .reply(200, { machineId: 'test', timestamp: new Date().toISOString(), state: 'READY', counters: { totalParts: 0, partsToday: 0, runtime: 0 } });
      await adapter.connect();
    });

    it('should send start command via HOMAG Connect REST API', async () => {
      const cmdNock = nock(HOMAG_API_URL)
        .post(`/machines/${MACHINE_SERIAL}/commands`, (body) => {
          return body.action === 'start' && body.jobId === 'JOB-100' && body.programId === 'EDGE-PROG-42';
        })
        .reply(200, {
          commandId: 'cmd-abc-123',
          status: 'accepted',
          machineSerial: MACHINE_SERIAL,
          timestamp: new Date().toISOString(),
        });

      const result = await adapter.startJob('JOB-100', 'EDGE-PROG-42');

      expect(result).toBe(true);
      expect(cmdNock.isDone()).toBe(true);
      // OPC UA write should NOT have been called
      expect(mockSession.write).not.toHaveBeenCalled();
    });

    it('should return false when HOMAG Connect rejects (4xx)', async () => {
      nock(HOMAG_API_URL)
        .post(`/machines/${MACHINE_SERIAL}/commands`)
        .reply(400, { error: 'Machine not in READY state' });

      const result = await adapter.startJob('JOB-101', 'EDGE-PROG-43');
      expect(result).toBe(false);
      // Should NOT fallback to OPC UA on 4xx (definitive rejection)
      expect(mockSession.write).not.toHaveBeenCalled();
    });

    it('should fallback to OPC UA when HOMAG Connect returns 5xx', async () => {
      nock(HOMAG_API_URL)
        .post(`/machines/${MACHINE_SERIAL}/commands`)
        .reply(502, 'Bad Gateway');

      // OPC UA fallback mocks
      mockSession.write.mockResolvedValueOnce(goodStatus());
      mockSession.call.mockResolvedValueOnce({ statusCode: goodStatus() });

      const result = await adapter.startJob('JOB-102', 'EDGE-PROG-44');
      expect(result).toBe(true);
      expect(mockSession.write).toHaveBeenCalled();
      expect(mockSession.call).toHaveBeenCalled();
    });

    it('should fallback to OPC UA when HOMAG Connect is unreachable', async () => {
      nock(HOMAG_API_URL)
        .post(`/machines/${MACHINE_SERIAL}/commands`)
        .replyWithError('ECONNREFUSED');

      mockSession.write.mockResolvedValueOnce(goodStatus());
      mockSession.call.mockResolvedValueOnce({ statusCode: goodStatus() });

      const result = await adapter.startJob('JOB-103', 'EDGE-PROG-45');
      expect(result).toBe(true);
      expect(mockSession.write).toHaveBeenCalled();
    });

    it('should return false when both channels fail', async () => {
      nock(HOMAG_API_URL)
        .post(`/machines/${MACHINE_SERIAL}/commands`)
        .reply(500, 'Internal Error');

      // OPC UA fallback fails
      mockSession.write.mockResolvedValueOnce(badStatus());

      const result = await adapter.startJob('JOB-104', 'EDGE-PROG-46');
      expect(result).toBe(false);
    });
  });

  describe('pauseJob() — dual-channel', () => {
    beforeEach(async () => {
      nock(HOMAG_API_URL)
        .get(`/machines/${MACHINE_SERIAL}/data/current`)
        .reply(200, { machineId: 'test', timestamp: new Date().toISOString(), state: 'WORKING', counters: { totalParts: 0, partsToday: 0, runtime: 0 } });
      await adapter.connect();
    });

    it('should pause via HOMAG Connect successfully', async () => {
      nock(HOMAG_API_URL)
        .post(`/machines/${MACHINE_SERIAL}/commands`, (body) => body.action === 'pause')
        .reply(200, {
          commandId: 'cmd-pause-001',
          status: 'accepted',
          machineSerial: MACHINE_SERIAL,
          timestamp: new Date().toISOString(),
        });

      const result = await adapter.pauseJob();
      expect(result).toBe(true);
      expect(mockSession.call).not.toHaveBeenCalled();
    });

    it('should fallback to OPC UA method call on cloud failure', async () => {
      nock(HOMAG_API_URL)
        .post(`/machines/${MACHINE_SERIAL}/commands`)
        .reply(503, 'Service Unavailable');

      mockSession.call.mockResolvedValueOnce({ statusCode: goodStatus() });

      const result = await adapter.pauseJob();
      expect(result).toBe(true);
      expect(mockSession.call).toHaveBeenCalled();
    });
  });

  describe('resumeJob() — dual-channel', () => {
    beforeEach(async () => {
      nock(HOMAG_API_URL)
        .get(`/machines/${MACHINE_SERIAL}/data/current`)
        .reply(200, { machineId: 'test', timestamp: new Date().toISOString(), state: 'STANDBY', counters: { totalParts: 0, partsToday: 0, runtime: 0 } });
      await adapter.connect();
    });

    it('should resume via cloud API', async () => {
      nock(HOMAG_API_URL)
        .post(`/machines/${MACHINE_SERIAL}/commands`, (body) => body.action === 'resume')
        .reply(200, { commandId: 'cmd-resume-001', status: 'accepted', machineSerial: MACHINE_SERIAL, timestamp: new Date().toISOString() });

      const result = await adapter.resumeJob();
      expect(result).toBe(true);
    });

    it('should reject when cloud API says rejected', async () => {
      nock(HOMAG_API_URL)
        .post(`/machines/${MACHINE_SERIAL}/commands`)
        .reply(200, { commandId: 'cmd-resume-002', status: 'rejected', message: 'No paused job', machineSerial: MACHINE_SERIAL, timestamp: new Date().toISOString() });

      const result = await adapter.resumeJob();
      expect(result).toBe(false);
    });
  });

  describe('abortJob() — dual-channel', () => {
    beforeEach(async () => {
      nock(HOMAG_API_URL)
        .get(`/machines/${MACHINE_SERIAL}/data/current`)
        .reply(200, { machineId: 'test', timestamp: new Date().toISOString(), state: 'WORKING', counters: { totalParts: 0, partsToday: 0, runtime: 0 } });
      await adapter.connect();
    });

    it('should abort via HOMAG Connect', async () => {
      nock(HOMAG_API_URL)
        .post(`/machines/${MACHINE_SERIAL}/commands`, (body) => body.action === 'abort')
        .reply(200, { commandId: 'cmd-abort-001', status: 'accepted', machineSerial: MACHINE_SERIAL, timestamp: new Date().toISOString() });

      const result = await adapter.abortJob();
      expect(result).toBe(true);
    });

    it('should fallback to OPC UA on network error', async () => {
      nock(HOMAG_API_URL)
        .post(`/machines/${MACHINE_SERIAL}/commands`)
        .replyWithError('ETIMEDOUT');

      mockSession.call.mockResolvedValueOnce({ statusCode: goodStatus() });

      const result = await adapter.abortJob();
      expect(result).toBe(true);
      expect(mockSession.call).toHaveBeenCalled();
    });

    it('should return false when OPC UA abort method fails', async () => {
      nock(HOMAG_API_URL)
        .post(`/machines/${MACHINE_SERIAL}/commands`)
        .replyWithError('ECONNRESET');

      mockSession.call.mockResolvedValueOnce({ statusCode: badStatus() });

      const result = await adapter.abortJob();
      expect(result).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOUD API — fetchCloudData()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('HOMAG Connect cloud polling', () => {
    it('should handle cloud API returning 401', async () => {
      nock(HOMAG_API_URL)
        .get(`/machines/${MACHINE_SERIAL}/data/current`)
        .reply(401, { error: 'Unauthorized' });

      // Should still connect (OPC UA works independently)
      await adapter.connect();
      // No exception thrown — cloud is supplementary
    });

    it('should handle cloud API timeout gracefully', async () => {
      nock(HOMAG_API_URL)
        .get(`/machines/${MACHINE_SERIAL}/data/current`)
        .delayConnection(10000)
        .reply(200, {});

      // Force a short timeout by creating adapter
      await adapter.connect();
      // Should not block connect — cloud is fire-and-forget
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // OPC UA ONLY (no cloud config)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('OPC UA-only mode (no homagConnect config)', () => {
    let opcAdapter: HomagAdapter;

    beforeEach(async () => {
      opcAdapter = new HomagAdapter(createEndpoint(false));
      await opcAdapter.connect();
    });

    afterEach(async () => {
      await opcAdapter.disconnect();
    });

    it('should startJob directly via OPC UA write + method call', async () => {
      mockSession.write.mockResolvedValueOnce(goodStatus());
      mockSession.call.mockResolvedValueOnce({ statusCode: goodStatus() });

      const result = await opcAdapter.startJob('JOB-200', 'PANEL-CUT-10');
      expect(result).toBe(true);
      expect(mockSession.write).toHaveBeenCalled();
      expect(mockSession.call).toHaveBeenCalled();
    });

    it('should pauseJob directly via OPC UA method call', async () => {
      mockSession.call.mockResolvedValueOnce({ statusCode: goodStatus() });
      const result = await opcAdapter.pauseJob();
      expect(result).toBe(true);
    });

    it('should abortJob directly via OPC UA method call', async () => {
      mockSession.call.mockResolvedValueOnce({ statusCode: goodStatus() });
      const result = await opcAdapter.abortJob();
      expect(result).toBe(true);
    });
  });
});
