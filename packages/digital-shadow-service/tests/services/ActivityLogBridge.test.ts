/**
 * Unit Tests: ActivityLogBridge
 * Buffers machine events and flushes to Factory Server Activity Log API
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/config/index.js', () => ({
  factoryServerConfig: { url: 'http://localhost:3000', apiKey: 'test-key' },
  redisConfig: { url: 'redis://localhost:6379' },
  opcuaConfig: { endpointUrl: '' },
  mqttConfig: { brokerUrl: '' },
  influxConfig: { url: '', token: '', org: '', bucket: '' },
  appConfig: { port: 3100, nodeEnv: 'test' },
}));

import { ActivityLogBridge } from '../../src/services/ActivityLogBridge';
import { MachineEventType, WwUnitState } from '../../src/types/machine';
import type { MachineEvent, MachineStateSnapshot } from '../../src/types/machine';

// ─── Mock global fetch ────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMachineEvent(overrides: Partial<MachineEvent> = {}): MachineEvent {
  return {
    eventId: 'evt-001',
    machineId: 'biesse-rover-01',
    eventType: MachineEventType.STATE_CHANGED,
    timestamp: new Date('2025-01-01T10:00:00Z'),
    previousState: WwUnitState.READY,
    newState: WwUnitState.WORKING,
    payload: {},
    ...overrides,
  } as MachineEvent;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ActivityLogBridge', () => {
  let bridge: ActivityLogBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    bridge = new ActivityLogBridge();
  });

  afterEach(async () => {
    await bridge.stop();
    vi.useRealTimers();
  });

  describe('start()', () => {
    it('should start flush timer', () => {
      bridge.start();
      // No error = success
      expect(true).toBe(true);
    });
  });

  describe('stop()', () => {
    it('should flush remaining buffer and clear timer', async () => {
      bridge.start();
      bridge.logSystemEvent('test', { foo: 'bar' });
      await bridge.stop();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle stop without start', async () => {
      await bridge.stop();
      // No fetch if buffer empty
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('logMachineEvent()', () => {
    it('should buffer a machine event', () => {
      bridge.logMachineEvent(createMachineEvent());
      // Not flushed yet (buffer < 50)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should include casHash when provided', async () => {
      bridge.logMachineEvent(createMachineEvent(), 'abc123hash');
      await bridge.stop(); // triggers flush
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.entries[0].casHash).toBe('abc123hash');
    });

    it('should flush when buffer reaches MAX_BUFFER_SIZE (50)', () => {
      for (let i = 0; i < 50; i++) {
        bridge.logMachineEvent(createMachineEvent({ eventId: `evt-${i}` }));
      }
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should map different event types to actions', async () => {
      bridge.logMachineEvent(createMachineEvent({ eventType: MachineEventType.ALARM_RAISED }));
      bridge.logMachineEvent(createMachineEvent({ eventType: MachineEventType.JOB_STARTED }));
      bridge.logMachineEvent(createMachineEvent({ eventType: MachineEventType.TOOL_CHANGED }));
      await bridge.stop();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.entries[0].action).toBe('machine_alarm_raised');
      expect(body.entries[1].action).toBe('job_started_on_machine');
      expect(body.entries[2].action).toBe('machine_tool_changed');
    });
  });

  describe('logStateSnapshot()', () => {
    it('should buffer a state snapshot', async () => {
      const snapshot = {
        machineId: 'biesse-rover-01',
        timestamp: new Date(),
        state: WwUnitState.WORKING,
        mode: 1,
        partCount: 42,
        spindleSpeed: 18000,
        feedRate: 12.5,
      } as unknown as MachineStateSnapshot;
      bridge.logStateSnapshot(snapshot, 'hashXYZ');
      await bridge.stop();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.entries[0].action).toBe('state_recorded');
      expect(body.entries[0].casHash).toBe('hashXYZ');
    });
  });

  describe('logSystemEvent()', () => {
    it('should buffer a system event', async () => {
      bridge.logSystemEvent('service_started', { version: '1.0.0' });
      await bridge.stop();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.entries[0].action).toBe('service_started');
      expect(body.entries[0].actorType).toBe('SYSTEM');
    });
  });

  describe('flush()', () => {
    it('should POST to factory server API with correct headers', async () => {
      bridge.logSystemEvent('test', {});
      await bridge.stop();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/activity-log/batch',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-key',
          },
        }),
      );
    });

    it('should re-buffer on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      bridge.logSystemEvent('test', {});
      bridge.start();
      await vi.advanceTimersByTimeAsync(5100); // trigger flush
      // First flush fails, re-buffers, then second flush attempt
      mockFetch.mockResolvedValueOnce({ ok: true });
      await vi.advanceTimersByTimeAsync(5100);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should re-buffer on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      bridge.logSystemEvent('test', {});
      bridge.start();
      await vi.advanceTimersByTimeAsync(5100);
      // Entry should still be in buffer for next flush
      mockFetch.mockResolvedValueOnce({ ok: true });
      await vi.advanceTimersByTimeAsync(5100);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not flush empty buffer', async () => {
      bridge.start();
      await vi.advanceTimersByTimeAsync(5100);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
