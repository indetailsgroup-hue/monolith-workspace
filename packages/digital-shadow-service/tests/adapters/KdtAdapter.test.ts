/**
 * KdtAdapter Unit Tests — Mocked Modbus TCP
 *
 * Tests the Modbus-based adapter for KDT edgebanders,
 * including Phase 2 command register write protocol.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KdtAdapter } from '../../src/adapters/KdtAdapter';
import type { MachineEndpoint } from '../../src/types/machine';
import { WwUnitState, WwUnitMode, MachineVendor, AdapterProtocol } from '../../src/types/machine';
import { DataQuality } from '../../src/types/sensor';

// ─── Mock modbus-serial ───────────────────────────────────────────────────────

const mockModbus = vi.hoisted(() => ({
  connectTCP: vi.fn().mockResolvedValue(undefined),
  close: vi.fn((cb: () => void) => cb()),
  setID: vi.fn(),
  setTimeout: vi.fn(),
  readHoldingRegisters: vi.fn(),
  writeRegister: vi.fn().mockResolvedValue(undefined),
  writeRegisters: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('modbus-serial', () => ({
  default: vi.fn(function MockModbusRTU() { return mockModbus; }),
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

// ─── Fixture ──────────────────────────────────────────────────────────────────

const createEndpoint = (): MachineEndpoint => ({
  machineId: 'kdt-ke368j-001',
  displayName: 'KDT KE-368J #1',
  vendor: MachineVendor.KDT,
  protocol: AdapterProtocol.MODBUS_TCP,
  modbusHost: '192.168.1.50',
  modbusPort: 502,
  pollingIntervalMs: 1000,
  publishIntervalMs: 500,
  modbusRegisters: {
    state: { address: 0, length: 1 },
    spindleSpeed: { address: 10, length: 2 },
    feedRate: { address: 12, length: 2 },
    toolId: { address: 20, length: 1 },
    errorCode: { address: 30, length: 1 },
    partCount: { address: 40, length: 2 },
  },
});

// Helper to mock readHoldingRegisters responses
function mockRegisterRead(address: number, data: number[]) {
  mockModbus.readHoldingRegisters.mockImplementation((addr: number) => {
    if (addr === address) return Promise.resolve({ data });
    // Default fallback for other registers
    return Promise.resolve({ data: [0] });
  });
}

// Multi-register mock
function mockAllRegisters(map: Record<number, number[]>) {
  mockModbus.readHoldingRegisters.mockImplementation((addr: number) => {
    if (map[addr]) return Promise.resolve({ data: map[addr] });
    return Promise.resolve({ data: [0] });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('KdtAdapter', () => {
  let adapter: KdtAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new KdtAdapter(createEndpoint());
  });

  afterEach(async () => {
    try { await adapter.disconnect(); } catch { /* already disconnected */ }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('connect()', () => {
    it('should connect via Modbus TCP with correct host/port', async () => {
      await adapter.connect();
      expect(mockModbus.connectTCP).toHaveBeenCalledWith('192.168.1.50', { port: 502 });
      expect(mockModbus.setID).toHaveBeenCalledWith(1);
      expect(mockModbus.setTimeout).toHaveBeenCalledWith(5000);
    });
  });

  describe('disconnect()', () => {
    it('should close modbus connection', async () => {
      await adapter.connect();
      await adapter.disconnect();
      expect(mockModbus.close).toHaveBeenCalled();
    });
  });

  describe('ping()', () => {
    it('should return true when register read succeeds', async () => {
      await adapter.connect();
      mockModbus.readHoldingRegisters.mockResolvedValueOnce({ data: [2] });
      const result = await adapter.ping();
      expect(result).toBe(true);
    });

    it('should return false when register read fails', async () => {
      await adapter.connect();
      mockModbus.readHoldingRegisters.mockRejectedValueOnce(new Error('Timeout'));
      const result = await adapter.ping();
      expect(result).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE READING
  // ═══════════════════════════════════════════════════════════════════════════

  describe('readState()', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should read all registers and return MachineStateSnapshot', async () => {
      mockAllRegisters({
        0: [3],       // state = WORKING
        10: [0, 18000], // spindle = 18000
        12: [0, 5000],  // feed = 5000
        20: [7],       // tool id = 7
        30: [0],       // no error
        40: [0, 250],  // part count = 250
      });

      const state = await adapter.readState();
      expect(state.machineId).toBe('kdt-ke368j-001');
      expect(state.state).toBe(WwUnitState.WORKING);
      expect(state.mode).toBe(WwUnitMode.AUTOMATIC);
      expect(state.partCount).toBe(250);
    });

    it('should map error state and include alarm', async () => {
      mockAllRegisters({
        0: [4],       // state = ERROR
        10: [0, 0],
        12: [0, 0],
        20: [0],
        30: [150],    // error code 150 (critical)
        40: [0, 0],
      });

      const state = await adapter.readState();
      expect(state.state).toBe(WwUnitState.ERROR);
      expect(state.activeAlarms.length).toBe(1);
      expect(state.activeAlarms[0]!.severity).toBe('CRITICAL');
    });

    it('should map unknown state values to OFFLINE', async () => {
      mockAllRegisters({
        0: [99],
        10: [0, 0],
        12: [0, 0],
        20: [0],
        30: [0],
        40: [0, 0],
      });

      const state = await adapter.readState();
      expect(state.state).toBe(WwUnitState.OFFLINE);
    });
  });

  describe('readUnitState()', () => {
    beforeEach(async () => { await adapter.connect(); });

    it('should return READY for register value 2', async () => {
      mockModbus.readHoldingRegisters.mockResolvedValueOnce({ data: [2] });
      const state = await adapter.readUnitState();
      expect(state).toBe(WwUnitState.READY);
    });

    it('should return STANDBY for register value 1', async () => {
      mockModbus.readHoldingRegisters.mockResolvedValueOnce({ data: [1] });
      const state = await adapter.readUnitState();
      expect(state).toBe(WwUnitState.STANDBY);
    });
  });

  describe('readUnitMode()', () => {
    beforeEach(async () => { await adapter.connect(); });

    it('should return AUTOMATIC when state is WORKING', async () => {
      mockModbus.readHoldingRegisters.mockResolvedValueOnce({ data: [3] });
      const mode = await adapter.readUnitMode();
      expect(mode).toBe(WwUnitMode.AUTOMATIC);
    });

    it('should return MANUAL when state is READY', async () => {
      mockModbus.readHoldingRegisters.mockResolvedValueOnce({ data: [2] });
      const mode = await adapter.readUnitMode();
      expect(mode).toBe(WwUnitMode.MANUAL);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TELEMETRY
  // ═══════════════════════════════════════════════════════════════════════════

  describe('readTelemetry()', () => {
    beforeEach(async () => { await adapter.connect(); });

    it('should return spindle, feed, and part count telemetry', async () => {
      mockAllRegisters({
        10: [0, 12000], // spindle
        12: [0, 3500],  // feed
        40: [0, 100],   // parts
      });

      const points = await adapter.readTelemetry();
      expect(points.length).toBe(3);

      const spindle = points.find(p => p.measurement === 'spindle_speed');
      expect(spindle!.value).toBe(12000);
      expect(spindle!.unit).toBe('RPM');
      expect(spindle!.quality).toBe(DataQuality.GOOD);

      const feed = points.find(p => p.measurement === 'feed_rate');
      expect(feed!.value).toBe(3500);

      const parts = points.find(p => p.measurement === 'part_count');
      expect(parts!.value).toBe(100);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — MODBUS WRITE COMMANDS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('startJob()', () => {
    beforeEach(async () => { await adapter.connect(); });

    it('should write job parameters and command code, then poll ACK', async () => {
      // ACK register: IDLE → ACK → DONE
      let ackCallCount = 0;
      mockModbus.readHoldingRegisters.mockImplementation((addr: number) => {
        if (addr === 110) {
          ackCallCount++;
          // First call (waitForAckIdle) → IDLE
          // Second call (pollForAck) → DONE directly
          if (ackCallCount <= 1) return Promise.resolve({ data: [0] }); // IDLE
          return Promise.resolve({ data: [3] }); // DONE
        }
        return Promise.resolve({ data: [0] });
      });

      const result = await adapter.startJob('JOB-500', 'PANEL-01');
      expect(result).toBe(true);

      // Should have written job ID registers (101-102)
      expect(mockModbus.writeRegisters).toHaveBeenCalledWith(101, expect.any(Array));
      // Should have written program ref registers (103-106)
      expect(mockModbus.writeRegisters).toHaveBeenCalledWith(103, expect.any(Array));
      // Should have written command code = 1 (START)
      expect(mockModbus.writeRegister).toHaveBeenCalledWith(100, 1);
      // Should have cleared command register
      expect(mockModbus.writeRegister).toHaveBeenCalledWith(100, 0);
    });

    it('should return false when machine is not ready (ACK not IDLE)', async () => {
      // ACK register stuck at ACK (machine busy)
      mockModbus.readHoldingRegisters.mockImplementation((addr: number) => {
        if (addr === 110) return Promise.resolve({ data: [1] }); // ACK (busy)
        return Promise.resolve({ data: [0] });
      });

      const result = await adapter.startJob('JOB-501', 'PANEL-02');
      expect(result).toBe(false);
      // Should not have written command code
      expect(mockModbus.writeRegister).not.toHaveBeenCalledWith(100, 1);
    }, 10000);

    it('should return false when machine NACKs', async () => {
      let ackCallCount = 0;
      mockModbus.readHoldingRegisters.mockImplementation((addr: number) => {
        if (addr === 110) {
          ackCallCount++;
          if (ackCallCount <= 1) return Promise.resolve({ data: [0] }); // IDLE
          return Promise.resolve({ data: [2] }); // NACK
        }
        return Promise.resolve({ data: [0] });
      });

      const result = await adapter.startJob('JOB-502', 'PANEL-03');
      expect(result).toBe(false);
    });
  });

  describe('pauseJob()', () => {
    beforeEach(async () => { await adapter.connect(); });

    it('should send PAUSE command code and get ACK', async () => {
      let ackCallCount = 0;
      mockModbus.readHoldingRegisters.mockImplementation((addr: number) => {
        if (addr === 110) {
          ackCallCount++;
          if (ackCallCount <= 1) return Promise.resolve({ data: [0] }); // IDLE
          return Promise.resolve({ data: [3] }); // DONE
        }
        return Promise.resolve({ data: [0] });
      });

      const result = await adapter.pauseJob();
      expect(result).toBe(true);
      expect(mockModbus.writeRegister).toHaveBeenCalledWith(100, 2); // PAUSE = 2
    });
  });

  describe('resumeJob()', () => {
    beforeEach(async () => { await adapter.connect(); });

    it('should send RESUME command code', async () => {
      let ackCallCount = 0;
      mockModbus.readHoldingRegisters.mockImplementation((addr: number) => {
        if (addr === 110) {
          ackCallCount++;
          if (ackCallCount <= 1) return Promise.resolve({ data: [0] });
          return Promise.resolve({ data: [1] }); // ACK → stays ACK
        }
        return Promise.resolve({ data: [0] });
      });

      const result = await adapter.resumeJob();
      expect(result).toBe(true);
      expect(mockModbus.writeRegister).toHaveBeenCalledWith(100, 3); // RESUME = 3
    });
  });

  describe('abortJob()', () => {
    beforeEach(async () => { await adapter.connect(); });

    it('should send ABORT command code and handle DONE', async () => {
      let ackCallCount = 0;
      mockModbus.readHoldingRegisters.mockImplementation((addr: number) => {
        if (addr === 110) {
          ackCallCount++;
          if (ackCallCount <= 1) return Promise.resolve({ data: [0] });
          return Promise.resolve({ data: [3] }); // DONE
        }
        return Promise.resolve({ data: [0] });
      });

      const result = await adapter.abortJob();
      expect(result).toBe(true);
      expect(mockModbus.writeRegister).toHaveBeenCalledWith(100, 4); // ABORT = 4
    });

    it('should return false on ERROR ACK', async () => {
      let ackCallCount = 0;
      mockModbus.readHoldingRegisters.mockImplementation((addr: number) => {
        if (addr === 110) {
          ackCallCount++;
          if (ackCallCount <= 1) return Promise.resolve({ data: [0] });
          return Promise.resolve({ data: [4] }); // ERROR
        }
        return Promise.resolve({ data: [0] });
      });

      const result = await adapter.abortJob();
      expect(result).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('error handling', () => {
    it('should throw when readState called before connect', async () => {
      await expect(adapter.readState()).rejects.toThrow('No active Modbus connection');
    });

    it('should throw when command sent before connect', async () => {
      await expect(adapter.startJob('x', 'y')).rejects.toThrow('No active Modbus connection');
    });
  });
});
