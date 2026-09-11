/**
 * Unit Tests: CommandDispatcher
 * Orchestrator: SafetyGate → Queue → Adapter dispatch → Confirmation
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// ─── Mock ioredis ─────────────────────────────────────────────────────────────
const mockRedis = vi.hoisted(() => ({
  xadd: vi.fn().mockResolvedValue('1-1'),
  quit: vi.fn().mockResolvedValue('OK'),
}));
vi.mock('ioredis', () => ({ default: vi.fn(function MockIoRedis() { return mockRedis; }) }));

// ─── Mock config ──────────────────────────────────────────────────────────────
vi.mock('../../src/config/index.js', () => ({
  redisConfig: { url: 'redis://localhost:6379' },
  opcuaConfig: { endpointUrl: '' },
  mqttConfig: { brokerUrl: '' },
  influxConfig: { url: '', token: '', org: '', bucket: '' },
  appConfig: { port: 3100, nodeEnv: 'test' },
}));

// ─── Mock CommandQueue ────────────────────────────────────────────────────────
const mockCommandQueue = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  enqueue: vi.fn().mockResolvedValue('cmd_queued123'),
  dequeue: vi.fn().mockResolvedValue(null),
  getEntry: vi.fn().mockResolvedValue(null),
  updateStatus: vi.fn().mockResolvedValue(null),
  retry: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../src/services/CommandQueue', () => ({
  CommandQueue: vi.fn(function MockCommandQueue() { return mockCommandQueue; }),
  QueueFullError: class QueueFullError extends Error {
    machineId: string; currentDepth: number; maxDepth: number;
    constructor(m: string, c: number, mx: number) {
      super(`Queue full for ${m}: ${c}/${mx}`);
      this.name = 'QueueFullError'; this.machineId = m; this.currentDepth = c; this.maxDepth = mx;
    }
  },
}));

// ─── Mock CommandSafetyGate ───────────────────────────────────────────────────
const mockSafetyGate = vi.hoisted(() => ({
  validate: vi.fn().mockResolvedValue([{ rule: 'test', passed: true }]),
  canProceed: vi.fn().mockReturnValue(true),
}));
vi.mock('../../src/services/CommandSafetyGate', () => ({
  CommandSafetyGate: vi.fn(function MockCommandSafetyGate() { return mockSafetyGate; }),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────
import { CommandDispatcher } from '../../src/services/CommandDispatcher';
import { CommandType, CommandStatus, CommandPriority } from '../../src/types/command';
import { WwUnitState, WwUnitMode, MachineVendor } from '../../src/types/machine';
import type { CommandRequest } from '../../src/types/command';
import type { IMachineAdapter } from '../../src/adapters/IMachineAdapter';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createAdapter(overrides: Partial<IMachineAdapter> = {}): IMachineAdapter {
  return {
    machineId: 'biesse-rover-01',
    vendor: MachineVendor.BIESSE,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue(true),
    readState: vi.fn().mockResolvedValue({ unitState: WwUnitState.READY }),
    readUnitState: vi.fn().mockResolvedValue(WwUnitState.WORKING),
    readTelemetry: vi.fn().mockResolvedValue({}),
    startJob: vi.fn().mockResolvedValue(true),
    pauseJob: vi.fn().mockResolvedValue(true),
    resumeJob: vi.fn().mockResolvedValue(true),
    abortJob: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as IMachineAdapter;
}

function createRequest(overrides: Partial<CommandRequest> = {}): CommandRequest {
  return {
    requestId: 'req-001',
    machineId: 'biesse-rover-01',
    commandType: CommandType.START_JOB,
    priority: CommandPriority.NORMAL,
    payload: { jobId: 'JOB-001', programRef: 'PANEL-A' },
    operatorId: 'op-001',
    initiator: { source: 'api', operatorId: 'op-001' },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CommandDispatcher', () => {
  let dispatcher: CommandDispatcher;
  let adapter: IMachineAdapter;
  let adapters: Map<string, IMachineAdapter>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Restore mock implementations after clearAllMocks
    mockSafetyGate.validate.mockResolvedValue([{ rule: 'test', passed: true }]);
    mockSafetyGate.canProceed.mockReturnValue(true);
    mockCommandQueue.start.mockResolvedValue(undefined);
    mockCommandQueue.stop.mockResolvedValue(undefined);
    mockCommandQueue.enqueue.mockResolvedValue('cmd_queued123');
    mockCommandQueue.dequeue.mockResolvedValue(null);
    mockCommandQueue.getEntry.mockResolvedValue(null);
    mockCommandQueue.updateStatus.mockResolvedValue(null);
    mockCommandQueue.retry.mockResolvedValue(true);
    mockRedis.xadd.mockResolvedValue('1-1');
    mockRedis.quit.mockResolvedValue('OK');

    dispatcher = new CommandDispatcher();
    adapter = createAdapter();
    adapters = new Map([['biesse-rover-01', adapter]]);
    await dispatcher.start(adapters);
  });

  afterEach(async () => {
    await dispatcher.stop();
    vi.useRealTimers();
  });

  describe('start()', () => {
    it('should start command queue and dispatch loop', async () => {
      expect(mockCommandQueue.start).toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    it('should stop queue and redis', async () => {
      await dispatcher.stop();
      expect(mockCommandQueue.stop).toHaveBeenCalled();
      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });

  describe('submitCommand()', () => {
    it('should reject if no adapter found for machine', async () => {
      const req = createRequest({ machineId: 'unknown-machine' });
      const res = await dispatcher.submitCommand(req);
      expect(res.status).toBe(CommandStatus.REJECTED);
      expect(res.message).toContain('No adapter found');
    });

    it('should reject if adapter does not support command', async () => {
      const noWriteAdapter = createAdapter({ startJob: undefined });
      adapters.set('biesse-rover-01', noWriteAdapter);
      const req = createRequest({ commandType: CommandType.START_JOB });
      const res = await dispatcher.submitCommand(req);
      expect(res.status).toBe(CommandStatus.REJECTED);
      expect(res.message).toContain('does not support');
    });

    it('should reject if safety gate fails', async () => {
      mockSafetyGate.validate.mockResolvedValue([{ rule: 'mode', passed: false }]);
      mockSafetyGate.canProceed.mockReturnValue(false);
      const res = await dispatcher.submitCommand(createRequest());
      expect(res.status).toBe(CommandStatus.REJECTED);
      expect(res.message).toContain('safety gate');
    });

    it('should enqueue normal priority commands', async () => {
      const res = await dispatcher.submitCommand(createRequest());
      expect(res.status).toBe(CommandStatus.QUEUED);
      expect(mockCommandQueue.enqueue).toHaveBeenCalled();
      expect(res.commandId).toBe('cmd_queued123');
    });

    it('should dispatch immediately for CRITICAL priority', async () => {
      const req = createRequest({ priority: CommandPriority.CRITICAL });
      const res = await dispatcher.submitCommand(req);
      // CRITICAL bypasses queue
      expect(mockCommandQueue.enqueue).not.toHaveBeenCalled();
      expect(res.status).toBe(CommandStatus.COMPLETED);
      expect(adapter.startJob).toHaveBeenCalled();
    });

    it('should reject if queue is full', async () => {
      const { QueueFullError } = await import('../../src/services/CommandQueue');
      mockCommandQueue.enqueue.mockRejectedValueOnce(
        new QueueFullError('biesse-rover-01', 20, 20),
      );
      const res = await dispatcher.submitCommand(createRequest());
      expect(res.status).toBe(CommandStatus.REJECTED);
      expect(res.message).toContain('Queue full');
    });

    it('should publish event on successful queue', async () => {
      await dispatcher.submitCommand(createRequest());
      expect(mockRedis.xadd).toHaveBeenCalled();
    });

    it('should handle PAUSE_JOB command', async () => {
      const req = createRequest({
        commandType: CommandType.PAUSE_JOB,
        priority: CommandPriority.CRITICAL,
        payload: {},
      });
      const res = await dispatcher.submitCommand(req);
      expect(res.status).toBe(CommandStatus.COMPLETED);
      expect(adapter.pauseJob).toHaveBeenCalled();
    });

    it('should handle RESUME_JOB command', async () => {
      const req = createRequest({
        commandType: CommandType.RESUME_JOB,
        priority: CommandPriority.CRITICAL,
        payload: {},
      });
      const res = await dispatcher.submitCommand(req);
      expect(adapter.resumeJob).toHaveBeenCalled();
    });

    it('should handle ABORT_JOB command', async () => {
      const req = createRequest({
        commandType: CommandType.ABORT_JOB,
        priority: CommandPriority.CRITICAL,
        payload: {},
      });
      const res = await dispatcher.submitCommand(req);
      expect(adapter.abortJob).toHaveBeenCalled();
    });

    it('should handle EMERGENCY_STOP via abortJob', async () => {
      const req = createRequest({
        commandType: CommandType.EMERGENCY_STOP,
        priority: CommandPriority.CRITICAL,
        payload: {},
      });
      const res = await dispatcher.submitCommand(req);
      expect(adapter.abortJob).toHaveBeenCalled();
    });

    it('should return FAILED for CRITICAL when adapter rejects', async () => {
      (adapter.startJob as Mock).mockResolvedValue(false);
      const req = createRequest({ priority: CommandPriority.CRITICAL });
      const res = await dispatcher.submitCommand(req);
      expect(res.status).toBe(CommandStatus.FAILED);
    });

    it('should handle unsupported command type via CRITICAL dispatch', async () => {
      // LOAD_PROGRAM is not supported by adapterSupportsCommand → REJECTED
      const req = createRequest({
        commandType: CommandType.LOAD_PROGRAM,
        priority: CommandPriority.CRITICAL,
        payload: {},
      });
      const res = await dispatcher.submitCommand(req);
      expect(res.status).toBe(CommandStatus.REJECTED);
    });
  });

  describe('cancelCommand()', () => {
    it('should return false if command not found', async () => {
      mockCommandQueue.getEntry.mockResolvedValue(null);
      const result = await dispatcher.cancelCommand('cmd_nope');
      expect(result).toBe(false);
    });

    it('should cancel queued command', async () => {
      mockCommandQueue.getEntry.mockResolvedValue({
        commandId: 'cmd_abc',
        status: CommandStatus.QUEUED,
        request: createRequest(),
      });
      const result = await dispatcher.cancelCommand('cmd_abc');
      expect(result).toBe(true);
      expect(mockCommandQueue.updateStatus).toHaveBeenCalledWith(
        'cmd_abc', CommandStatus.CANCELLED, expect.any(Object),
      );
    });

    it('should not cancel already-dispatched command', async () => {
      mockCommandQueue.getEntry.mockResolvedValue({
        commandId: 'cmd_abc',
        status: CommandStatus.DISPATCHING,
        request: createRequest(),
      });
      const result = await dispatcher.cancelCommand('cmd_abc');
      expect(result).toBe(false);
    });
  });

  describe('getCommandStatus()', () => {
    it('should return null if command not found', async () => {
      mockCommandQueue.getEntry.mockResolvedValue(null);
      const result = await dispatcher.getCommandStatus('cmd_nope');
      expect(result).toBeNull();
    });

    it('should return response with current status', async () => {
      mockCommandQueue.getEntry.mockResolvedValue({
        commandId: 'cmd_abc',
        status: CommandStatus.AWAITING_CONFIRMATION,
        request: createRequest(),
        timestamps: { receivedAt: new Date() },
        safetyGateResults: [],
      });
      const result = await dispatcher.getCommandStatus('cmd_abc');
      expect(result).not.toBeNull();
      expect(result!.status).toBe(CommandStatus.AWAITING_CONFIRMATION);
    });
  });

  describe('processQueues (dispatch loop)', () => {
    it('should dequeue and dispatch when entry available', async () => {
      const entry = {
        commandId: 'cmd_loop1',
        request: createRequest(),
        status: CommandStatus.DISPATCHING,
        timestamps: {},
        retryCount: 0,
        maxRetries: 3,
        safetyGateResults: [],
      };
      mockCommandQueue.dequeue.mockResolvedValueOnce(entry);
      (adapter.startJob as Mock).mockResolvedValue(true);

      // Advance timer to trigger dispatch loop (200ms)
      await vi.advanceTimersByTimeAsync(250);

      expect(mockCommandQueue.dequeue).toHaveBeenCalledWith('biesse-rover-01');
      expect(adapter.startJob).toHaveBeenCalled();
      expect(mockCommandQueue.updateStatus).toHaveBeenCalledWith(
        'cmd_loop1', CommandStatus.AWAITING_CONFIRMATION, expect.any(Object),
      );
    });

    it('should retry when adapter returns false', async () => {
      const entry = {
        commandId: 'cmd_fail1',
        request: createRequest(),
        status: CommandStatus.DISPATCHING,
        timestamps: {},
        retryCount: 0,
        maxRetries: 3,
        safetyGateResults: [],
      };
      mockCommandQueue.dequeue.mockResolvedValueOnce(entry);
      (adapter.startJob as Mock).mockResolvedValue(false);

      await vi.advanceTimersByTimeAsync(250);

      expect(mockCommandQueue.retry).toHaveBeenCalledWith('cmd_fail1');
    });

    it('should retry when adapter throws error', async () => {
      const entry = {
        commandId: 'cmd_err1',
        request: createRequest(),
        status: CommandStatus.DISPATCHING,
        timestamps: {},
        retryCount: 0,
        maxRetries: 3,
        safetyGateResults: [],
      };
      mockCommandQueue.dequeue.mockResolvedValueOnce(entry);
      (adapter.startJob as Mock).mockRejectedValue(new Error('Network failure'));

      await vi.advanceTimersByTimeAsync(250);

      expect(mockCommandQueue.retry).toHaveBeenCalledWith('cmd_err1');
    });

    it('should mark FAILED if retry returns false (max retries)', async () => {
      const entry = {
        commandId: 'cmd_maxretry',
        request: createRequest(),
        status: CommandStatus.DISPATCHING,
        timestamps: {},
        retryCount: 3,
        maxRetries: 3,
        safetyGateResults: [],
      };
      mockCommandQueue.dequeue.mockResolvedValueOnce(entry);
      (adapter.startJob as Mock).mockResolvedValue(false);
      mockCommandQueue.retry.mockResolvedValueOnce(false);

      await vi.advanceTimersByTimeAsync(250);

      expect(mockCommandQueue.updateStatus).toHaveBeenCalledWith(
        'cmd_maxretry', CommandStatus.FAILED, expect.any(Object),
      );
    });
  });

  describe('confirmation watcher', () => {
    it('should mark COMPLETED when expected state reached', async () => {
      const entry = {
        commandId: 'cmd_confirm1',
        request: createRequest(),
        status: CommandStatus.DISPATCHING,
        timestamps: {},
        retryCount: 0,
        maxRetries: 3,
        safetyGateResults: [],
      };
      mockCommandQueue.dequeue.mockResolvedValueOnce(entry);
      (adapter.startJob as Mock).mockResolvedValue(true);
      (adapter.readUnitState as Mock).mockResolvedValue(WwUnitState.WORKING);

      // Trigger dispatch
      await vi.advanceTimersByTimeAsync(250);

      // Advance for confirmation poll (500ms)
      await vi.advanceTimersByTimeAsync(600);

      expect(mockCommandQueue.updateStatus).toHaveBeenCalledWith(
        'cmd_confirm1', CommandStatus.COMPLETED, expect.any(Object),
      );
    });

    it('should retry on confirmation timeout', async () => {
      const entry = {
        commandId: 'cmd_timeout1',
        request: createRequest(),
        status: CommandStatus.DISPATCHING,
        timestamps: {},
        retryCount: 0,
        maxRetries: 3,
        safetyGateResults: [],
      };
      mockCommandQueue.dequeue.mockResolvedValueOnce(entry);
      (adapter.startJob as Mock).mockResolvedValue(true);
      // Never reaches WORKING
      (adapter.readUnitState as Mock).mockResolvedValue(WwUnitState.READY);

      // Trigger dispatch
      await vi.advanceTimersByTimeAsync(250);

      // Advance past confirmation timeout (10s for START_JOB)
      await vi.advanceTimersByTimeAsync(11_000);

      expect(mockCommandQueue.retry).toHaveBeenCalledWith('cmd_timeout1');
    });

    it('should immediately complete for method_return strategy', async () => {
      const entry = {
        commandId: 'cmd_estop',
        request: createRequest({
          commandType: CommandType.EMERGENCY_STOP,
          payload: {},
        }),
        status: CommandStatus.DISPATCHING,
        timestamps: {},
        retryCount: 0,
        maxRetries: 3,
        safetyGateResults: [],
      };
      mockCommandQueue.dequeue.mockResolvedValueOnce(entry);
      (adapter.abortJob as Mock).mockResolvedValue(true);

      await vi.advanceTimersByTimeAsync(250);

      // method_return immediately completes
      expect(mockCommandQueue.updateStatus).toHaveBeenCalledWith(
        'cmd_estop', CommandStatus.COMPLETED,
      );
    });
  });

  describe('adapterSupportsCommand (via submitCommand)', () => {
    it('should reject SET_MODE (no adapter support defined)', async () => {
      const req = createRequest({ commandType: CommandType.SET_MODE, payload: {} });
      const res = await dispatcher.submitCommand(req);
      expect(res.status).toBe(CommandStatus.REJECTED);
    });

    it('should accept ABORT_JOB when abortJob exists', async () => {
      mockSafetyGate.canProceed.mockReturnValue(true);
      const req = createRequest({
        commandType: CommandType.ABORT_JOB,
        priority: CommandPriority.NORMAL,
        payload: {},
      });
      const res = await dispatcher.submitCommand(req);
      expect(res.status).toBe(CommandStatus.QUEUED);
    });
  });

  describe('statusMessage()', () => {
    it('should return appropriate message for each status via getCommandStatus', async () => {
      mockCommandQueue.getEntry.mockResolvedValue({
        commandId: 'cmd_x',
        status: CommandStatus.QUEUED,
        request: createRequest(),
        timestamps: { receivedAt: new Date() },
        safetyGateResults: [],
      });
      const res = await dispatcher.getCommandStatus('cmd_x');
      expect(res!.message).toContain('queued');
    });
  });
});
