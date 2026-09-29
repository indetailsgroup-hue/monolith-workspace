/**
 * MONOLITH Digital Shadow — Phase 2 Command Layer Integration Test
 * Tests the full command lifecycle: submit → validate → queue → dispatch → confirm
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  CommandType,
  CommandPriority,
  CommandStatus,
} from '../../src/types/command';
import type { CommandRequest } from '../../src/types/command';
import { WwUnitState, WwUnitMode } from '../../src/types/machine';
import type { MachineStateSnapshot, MachineEndpoint } from '../../src/types/machine';
import { CommandSafetyGate } from '../../src/services/CommandSafetyGate';
import type { IMachineAdapter } from '../../src/adapters/IMachineAdapter';

// ─── Mock Adapter ────────────────────────────────────────────────────────────

function createMockAdapter(overrides: Partial<{
  state: WwUnitState;
  mode: WwUnitMode;
  connected: boolean;
  startJobResult: boolean;
  pauseJobResult: boolean;
  resumeJobResult: boolean;
  abortJobResult: boolean;
}> = {}): IMachineAdapter {
  const state = overrides.state ?? WwUnitState.READY;
  const mode = overrides.mode ?? WwUnitMode.AUTOMATIC;

  return {
    adapterId: 'test-biesse-01',
    endpoint: { machineId: 'biesse-rover-01' } as MachineEndpoint,
    isConnected: overrides.connected ?? true,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue(overrides.connected ?? true),
    readState: vi.fn().mockResolvedValue({
      machineId: 'biesse-rover-01',
      timestamp: new Date(),
      state,
      mode,
      spindleSpeed: 0,
      feedRate: 0,
      partCount: 10,
      toolId: 'T01',
      runtimeSeconds: 3600,
      activeAlarms: [],
    } as MachineStateSnapshot),
    readUnitState: vi.fn().mockResolvedValue(state),
    readUnitMode: vi.fn().mockResolvedValue(mode),
    readTelemetry: vi.fn().mockResolvedValue([]),
    onStateChange: vi.fn(),
    onAlarm: vi.fn(),
    onTelemetry: vi.fn(),
    startJob: vi.fn().mockResolvedValue(overrides.startJobResult ?? true),
    pauseJob: vi.fn().mockResolvedValue(overrides.pauseJobResult ?? true),
    resumeJob: vi.fn().mockResolvedValue(overrides.resumeJobResult ?? true),
    abortJob: vi.fn().mockResolvedValue(overrides.abortJobResult ?? true),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Phase 2: Command Safety Gate', () => {
  let safetyGate: CommandSafetyGate;

  beforeAll(() => {
    safetyGate = new CommandSafetyGate();
  });

  // ─── START_JOB validation ──────────────────────────────────────────────────

  describe('START_JOB', () => {
    const baseRequest: CommandRequest = {
      requestId: 'req-001',
      machineId: 'biesse-rover-01',
      commandType: CommandType.START_JOB,
      priority: CommandPriority.NORMAL,
      payload: {
        type: CommandType.START_JOB,
        jobId: 'job-001',
        programRef: 'DAPH-CABINET-001.nc',
      },
      initiator: { source: 'factory_server', actorId: 'scheduler-01' },
      timeoutMs: 30000,
    };

    it('passes when machine is READY + AUTOMATIC', async () => {
      const adapter = createMockAdapter({
        state: WwUnitState.READY,
        mode: WwUnitMode.AUTOMATIC,
      });
      const results = await safetyGate.validate(baseRequest, adapter);
      expect(safetyGate.canProceed(results)).toBe(true);
    });

    it('blocks when machine is WORKING', async () => {
      const adapter = createMockAdapter({ state: WwUnitState.WORKING });
      const results = await safetyGate.validate(baseRequest, adapter);
      expect(safetyGate.canProceed(results)).toBe(false);
      expect(results.some((r) => !r.passed && r.message.includes('NOT valid'))).toBe(true);
    });

    it('blocks when machine is in ERROR state', async () => {
      const adapter = createMockAdapter({ state: WwUnitState.ERROR });
      const results = await safetyGate.validate(baseRequest, adapter);
      expect(safetyGate.canProceed(results)).toBe(false);
    });

    it('blocks when machine mode is MANUAL', async () => {
      const adapter = createMockAdapter({
        state: WwUnitState.READY,
        mode: WwUnitMode.MANUAL,
      });
      const results = await safetyGate.validate(baseRequest, adapter);
      expect(safetyGate.canProceed(results)).toBe(false);
      expect(results.some((r) => r.message.includes('mode'))).toBe(true);
    });

    it('blocks when connection is down', async () => {
      const adapter = createMockAdapter({ connected: false });
      const results = await safetyGate.validate(baseRequest, adapter);
      expect(safetyGate.canProceed(results)).toBe(false);
    });

    it('blocks when programRef is empty', async () => {
      const adapter = createMockAdapter();
      const emptyProgRequest = {
        ...baseRequest,
        payload: { type: CommandType.START_JOB, jobId: 'j1', programRef: '' },
      } as CommandRequest;
      const results = await safetyGate.validate(emptyProgRequest, adapter);
      expect(safetyGate.canProceed(results)).toBe(false);
    });
  });

  // ─── PAUSE_JOB validation ─────────────────────────────────────────────────

  describe('PAUSE_JOB', () => {
    const pauseRequest: CommandRequest = {
      requestId: 'req-002',
      machineId: 'biesse-rover-01',
      commandType: CommandType.PAUSE_JOB,
      priority: CommandPriority.HIGH,
      payload: { type: CommandType.PAUSE_JOB, reason: 'operator_request' },
      initiator: { source: 'operator_panel', actorId: 'operator-01' },
      timeoutMs: 5000,
    };

    it('passes when machine is WORKING', async () => {
      const adapter = createMockAdapter({ state: WwUnitState.WORKING });
      const results = await safetyGate.validate(pauseRequest, adapter);
      expect(safetyGate.canProceed(results)).toBe(true);
    });

    it('blocks when machine is READY (nothing to pause)', async () => {
      const adapter = createMockAdapter({ state: WwUnitState.READY });
      const results = await safetyGate.validate(pauseRequest, adapter);
      expect(safetyGate.canProceed(results)).toBe(false);
    });
  });

  // ─── RESUME_JOB validation ────────────────────────────────────────────────

  describe('RESUME_JOB', () => {
    const resumeRequest: CommandRequest = {
      requestId: 'req-003',
      machineId: 'biesse-rover-01',
      commandType: CommandType.RESUME_JOB,
      priority: CommandPriority.NORMAL,
      payload: { type: CommandType.RESUME_JOB },
      initiator: { source: 'operator_panel', actorId: 'operator-01' },
      timeoutMs: 5000,
    };

    it('passes when machine is STANDBY (paused state)', async () => {
      const adapter = createMockAdapter({ state: WwUnitState.STANDBY });
      const results = await safetyGate.validate(resumeRequest, adapter);
      expect(safetyGate.canProceed(results)).toBe(true);
    });

    it('blocks when machine is WORKING (already running)', async () => {
      const adapter = createMockAdapter({ state: WwUnitState.WORKING });
      const results = await safetyGate.validate(resumeRequest, adapter);
      expect(safetyGate.canProceed(results)).toBe(false);
    });
  });

  // ─── EMERGENCY_STOP (CRITICAL priority) ───────────────────────────────────

  describe('EMERGENCY_STOP', () => {
    const emergencyRequest: CommandRequest = {
      requestId: 'req-004',
      machineId: 'biesse-rover-01',
      commandType: CommandType.EMERGENCY_STOP,
      priority: CommandPriority.CRITICAL,
      payload: { type: CommandType.EMERGENCY_STOP, source: 'operator' },
      initiator: { source: 'safety_system', actorId: 'e-stop-panel' },
      timeoutMs: 2000,
    };

    it('bypasses all safety checks (CRITICAL priority) — only checks connection', async () => {
      const adapter = createMockAdapter({
        state: WwUnitState.ERROR,
        mode: WwUnitMode.MANUAL,
        connected: true,
      });
      const results = await safetyGate.validate(emergencyRequest, adapter);
      expect(safetyGate.canProceed(results)).toBe(true);
      // Only 1 check (connection)
      expect(results.length).toBe(1);
    });

    it('blocks only if connection is completely dead', async () => {
      const adapter = createMockAdapter({ connected: false });
      const results = await safetyGate.validate(emergencyRequest, adapter);
      expect(safetyGate.canProceed(results)).toBe(false);
    });
  });

  // ─── Alarm blocking ────────────────────────────────────────────────────────

  describe('Alarm blocking', () => {
    it('blocks START_JOB when critical alarm is active', async () => {
      const adapter = createMockAdapter({ state: WwUnitState.READY });
      (adapter.readState as ReturnType<typeof vi.fn>).mockResolvedValue({
        machineId: 'biesse-rover-01',
        timestamp: new Date(),
        state: WwUnitState.READY,
        mode: WwUnitMode.AUTOMATIC,
        spindleSpeed: 0,
        feedRate: 0,
        partCount: 0,
        toolId: 'T01',
        runtimeSeconds: 0,
        activeAlarms: [
          {
            alarmId: 'ALM-001',
            severity: 'CRITICAL',
            message: 'Spindle overtemperature',
            timestamp: new Date(),
            acknowledged: false,
          },
        ],
      });

      const request: CommandRequest = {
        requestId: 'req-005',
        machineId: 'biesse-rover-01',
        commandType: CommandType.START_JOB,
        priority: CommandPriority.NORMAL,
        payload: { type: CommandType.START_JOB, jobId: 'j1', programRef: 'test.nc' },
        initiator: { source: 'factory_server', actorId: 'sched' },
        timeoutMs: 30000,
      };

      const results = await safetyGate.validate(request, adapter);
      expect(safetyGate.canProceed(results)).toBe(false);
      expect(results.some((r) => r.message.includes('critical alarm'))).toBe(true);
    });
  });
});
