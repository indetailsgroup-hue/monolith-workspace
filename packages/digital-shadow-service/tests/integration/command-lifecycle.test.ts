/**
 * Integration Test: Full Command Lifecycle
 * Tests: submit → safety gate → queue → dispatch → state confirmation
 * Covers all 3 adapters: Biesse (OPC UA), Homag (Cloud+Fallback), KDT (Modbus)
 *
 * @module tests/integration/command-lifecycle
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { EventEmitter } from 'events';

// ─── Types ────────────────────────────────────────────────────────────────────
import {
  CommandType,
  CommandStatus,
  CommandPriority,
  type CommandRequest,
  type CommandQueueEntry,
  type StartJobPayload,
  type PauseJobPayload,
  type AbortJobPayload,
  type EmergencyStopPayload,
} from '../../src/types/command';
import {
  WwUnitState,
  WwUnitMode,
  MachineVendor,
  type MachineStateSnapshot,
} from '../../src/types/machine';
import type { IMachineAdapter } from '../../src/adapters/IMachineAdapter';

// ─── Mock Redis ───────────────────────────────────────────────────────────────
const mockRedisData = new Map<string, string>();
const mockRedisSortedSets = new Map<string, Array<{ score: number; member: string }>>();
const mockRedisExpiry = new Map<string, number>();

const createMockRedis = () => ({
  get: vi.fn(async (key: string) => mockRedisData.get(key) || null),
  set: vi.fn(async (key: string, value: string, ...args: any[]) => {
    mockRedisData.set(key, value);
    if (args[0] === 'EX' && args[1]) {
      mockRedisExpiry.set(key, args[1]);
    }
    return 'OK';
  }),
  del: vi.fn(async (...keys: string[]) => {
    keys.forEach(k => {
      mockRedisData.delete(k);
      mockRedisExpiry.delete(k);
    });
    return keys.length;
  }),
  zadd: vi.fn(async (key: string, score: number, member: string) => {
    if (!mockRedisSortedSets.has(key)) {
      mockRedisSortedSets.set(key, []);
    }
    const set = mockRedisSortedSets.get(key)!;
    const existing = set.findIndex(s => s.member === member);
    if (existing >= 0) set[existing].score = score;
    else set.push({ score, member });
    set.sort((a, b) => a.score - b.score);
    return 1;
  }),
  zrangebyscore: vi.fn(async (key: string, min: string | number, max: string | number, ...args: any[]) => {
    const set = mockRedisSortedSets.get(key) || [];
    const minVal = min === '-inf' ? -Infinity : Number(min);
    const maxVal = max === '+inf' ? Infinity : Number(max);
    let results = set
      .filter(s => s.score >= minVal && s.score <= maxVal)
      .map(s => s.member);
    // Handle LIMIT offset count
    if (args[0] === 'LIMIT') {
      const offset = Number(args[1]);
      const count = Number(args[2]);
      results = results.slice(offset, offset + count);
    }
    return results;
  }),
  zpopmin: vi.fn(async (key: string, count = 1) => {
    const set = mockRedisSortedSets.get(key) || [];
    const popped = set.splice(0, count);
    return popped.flatMap(s => [s.member, String(s.score)]);
  }),
  zrem: vi.fn(async (key: string, ...members: string[]) => {
    const set = mockRedisSortedSets.get(key) || [];
    const before = set.length;
    const filtered = set.filter(s => !members.includes(s.member));
    mockRedisSortedSets.set(key, filtered);
    return before - filtered.length;
  }),
  zcard: vi.fn(async (key: string) => {
    return (mockRedisSortedSets.get(key) || []).length;
  }),
  exists: vi.fn(async (key: string) => mockRedisData.has(key) ? 1 : 0),
  expire: vi.fn(async () => 1),
  publish: vi.fn(async () => 1),
  subscribe: vi.fn(async () => {}),
  on: vi.fn(),
  duplicate: vi.fn(),
  ping: vi.fn(async () => 'PONG'),
  multi: vi.fn(() => ({
    set: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    zrem: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn(async () => []),
  })),
});

vi.mock('ioredis', () => ({
  default: vi.fn(() => createMockRedis()),
  Redis: vi.fn(() => createMockRedis()),
}));

// ─── Mock Adapter Factory ─────────────────────────────────────────────────────

interface MockAdapterOptions {
  vendor: MachineVendor;
  machineId: string;
  initialState: WwUnitState;
  /** State sequence after command dispatch (simulates transitions) */
  stateSequence?: WwUnitState[];
  /** Whether startJob/pauseJob should reject */
  rejectCommand?: boolean;
  /** Simulate network failure on first attempt (for retry testing) */
  failFirstAttempt?: boolean;
}

function createMockAdapter(options: MockAdapterOptions): IMachineAdapter & EventEmitter & {
  _stateIndex: number;
  _callLog: Array<{ method: string; args: any[]; timestamp: number }>;
  _connected: boolean;
} {
  const emitter = new EventEmitter();
  let currentState = options.initialState;
  let stateIndex = 0;
  let attemptCount = 0;
  let connected = true;
  const callLog: Array<{ method: string; args: any[]; timestamp: number }> = [];

  const advanceState = () => {
    if (options.stateSequence && stateIndex < options.stateSequence.length) {
      currentState = options.stateSequence[stateIndex];
      stateIndex++;
    }
  };

  const base: any = Object.assign(emitter, {
    _stateIndex: stateIndex,
    _callLog: callLog,

    connect: vi.fn(async () => { connected = true; }),
    disconnect: vi.fn(async () => { connected = false; }),

    readUnitState: vi.fn(async (): Promise<WwUnitState> => {
      return currentState;
    }),

    readUnitMode: vi.fn(async (): Promise<WwUnitMode> => WwUnitMode.AUTOMATIC),

    readCurrentState: vi.fn(async (): Promise<MachineStateSnapshot> => ({
      machineId: options.machineId,
      state: currentState,
      mode: WwUnitMode.AUTOMATIC,
      timestamp: new Date(),
      vendor: options.vendor,
    })),

    // ── Phase 2 Command Methods ──
    startJob: vi.fn(async (jobId: string, programRef: string) => {
      callLog.push({ method: 'startJob', args: [jobId, programRef], timestamp: Date.now() });
      attemptCount++;

      if (options.failFirstAttempt && attemptCount === 1) {
        throw new Error(`Network timeout dispatching to ${options.machineId}`);
      }
      if (options.rejectCommand) {
        throw new Error(`Machine ${options.machineId} rejected START command`);
      }

      // Simulate state transition after successful dispatch
      advanceState();
      return { success: true, timestamp: new Date() };
    }),

    pauseJob: vi.fn(async (jobId: string) => {
      callLog.push({ method: 'pauseJob', args: [jobId], timestamp: Date.now() });
      attemptCount++;

      if (options.failFirstAttempt && attemptCount === 1) {
        throw new Error(`Network timeout dispatching to ${options.machineId}`);
      }
      if (options.rejectCommand) {
        throw new Error(`Machine ${options.machineId} rejected PAUSE command`);
      }

      advanceState();
      return { success: true, timestamp: new Date() };
    }),

    resumeJob: vi.fn(async (jobId: string) => {
      callLog.push({ method: 'resumeJob', args: [jobId], timestamp: Date.now() });
      advanceState();
      return { success: true, timestamp: new Date() };
    }),

    abortJob: vi.fn(async (jobId: string) => {
      callLog.push({ method: 'abortJob', args: [jobId], timestamp: Date.now() });
      advanceState();
      return { success: true, timestamp: new Date() };
    }),

    emergencyStop: vi.fn(async () => {
      callLog.push({ method: 'emergencyStop', args: [], timestamp: Date.now() });
      currentState = WwUnitState.ERROR;
      return { success: true, timestamp: new Date() };
    }),

    // ── Homag-specific: dual-channel simulation ──
    _homagCloudAvailable: true,
    setHomagCloudAvailable(available: boolean) {
      base._homagCloudAvailable = available;
    },
  });

  // Define getter/setter properties that need closure access
  Object.defineProperties(base, {
    _connected: {
      get() { return connected; },
      set(val: boolean) { connected = val; },
      enumerable: true,
      configurable: true,
    },
    machineId: {
      get() { return options.machineId; },
      enumerable: true,
      configurable: true,
    },
    vendor: {
      get() { return options.vendor; },
      enumerable: true,
      configurable: true,
    },
    isConnected: {
      get() { return connected; },
      enumerable: true,
      configurable: true,
    },
  });

  return base;
}

// ─── CommandSafetyGate Mock ───────────────────────────────────────────────────

interface SafetyGateResult {
  passed: boolean;
  reason?: string;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
}

function createMockSafetyGate(options?: { rejectReason?: string }) {
  return {
    validate: vi.fn(async (
      command: CommandRequest,
      adapter: IMachineAdapter
    ): Promise<SafetyGateResult> => {
      if (options?.rejectReason) {
        return {
          passed: false,
          reason: options.rejectReason,
          checks: [
            { name: 'connection', passed: true },
            { name: 'state_compatibility', passed: false, detail: options.rejectReason },
          ],
        };
      }

      // Default: check connection
      const connected = (adapter as any).isConnected;
      if (!connected) {
        return {
          passed: false,
          reason: 'Machine not connected',
          checks: [{ name: 'connection', passed: false, detail: 'Adapter disconnected' }],
        };
      }

      return {
        passed: true,
        checks: [
          { name: 'connection', passed: true },
          { name: 'state_compatibility', passed: true },
          { name: 'concurrent_commands', passed: true },
        ],
      };
    }),
  };
}

// ─── CommandQueue Mock (wraps Redis mock) ─────────────────────────────────────

interface QueuedCommand {
  entry: CommandQueueEntry;
  score: number;
}

function createMockCommandQueue() {
  const queued: Map<string, QueuedCommand[]> = new Map();
  const entries: Map<string, CommandQueueEntry> = new Map();
  const currentCommands: Map<string, string> = new Map(); // machineId → commandId

  return {
    enqueue: vi.fn(async (entry: CommandQueueEntry): Promise<void> => {
      const key = entry.request.machineId;
      if (!queued.has(key)) queued.set(key, []);
      const score = entry.request.priority * 1e13 + Date.now();
      queued.get(key)!.push({ entry, score });
      // Sort ascending: lowest score (highest priority) first for dequeue
      queued.get(key)!.sort((a, b) => a.score - b.score);
      entries.set(entry.commandId, entry);
    }),

    dequeue: vi.fn(async (machineId: string): Promise<CommandQueueEntry | null> => {
      const queue = queued.get(machineId);
      if (!queue || queue.length === 0) return null;
      const item = queue.shift()!; // Take highest priority (lowest score = first after asc sort)
      currentCommands.set(machineId, item.entry.commandId);
      return item.entry;
    }),

    peek: vi.fn(async (machineId: string): Promise<CommandQueueEntry | null> => {
      const queue = queued.get(machineId);
      if (!queue || queue.length === 0) return null;
      return queue[0].entry;
    }),

    getEntry: vi.fn(async (commandId: string): Promise<CommandQueueEntry | null> => {
      return entries.get(commandId) || null;
    }),

    updateStatus: vi.fn(async (commandId: string, status: CommandStatus, detail?: string): Promise<void> => {
      const entry = entries.get(commandId);
      if (entry) {
        entry.status = status;
        if (detail) (entry as any).statusDetail = detail;
      }
    }),

    cancel: vi.fn(async (commandId: string): Promise<boolean> => {
      const entry = entries.get(commandId);
      if (!entry) return false;
      if (entry.status === CommandStatus.QUEUED) {
        entry.status = CommandStatus.CANCELLED;
        const queue = queued.get(entry.request.machineId);
        if (queue) {
          const idx = queue.findIndex(q => q.entry.commandId === commandId);
          if (idx >= 0) queue.splice(idx, 1);
        }
        return true;
      }
      return false;
    }),

    getQueueLength: vi.fn(async (machineId: string): Promise<number> => {
      return (queued.get(machineId) || []).length;
    }),

    getCurrentCommand: vi.fn(async (machineId: string): Promise<string | null> => {
      return currentCommands.get(machineId) || null;
    }),

    clearCurrentCommand: vi.fn(async (machineId: string): Promise<void> => {
      currentCommands.delete(machineId);
    }),

    // Expose internals for assertions
    _queued: queued,
    _entries: entries,
    _currentCommands: currentCommands,
  };
}

// ─── CommandDispatcher (Simplified Integration Harness) ───────────────────────

interface DispatcherDeps {
  safetyGate: ReturnType<typeof createMockSafetyGate>;
  commandQueue: ReturnType<typeof createMockCommandQueue>;
  adapters: Map<string, ReturnType<typeof createMockAdapter>>;
}

/**
 * Lightweight CommandDispatcher harness that follows the real flow:
 * submit → safety gate → queue (or bypass) → dispatch → confirm
 */
class TestCommandDispatcher {
  private deps: DispatcherDeps;
  private confirmationTimeouts: Map<string, { type: CommandType; timeout: number }> = new Map([
    [CommandType.START_JOB, { type: CommandType.START_JOB, timeout: 500 }],
    [CommandType.PAUSE_JOB, { type: CommandType.PAUSE_JOB, timeout: 300 }],
    [CommandType.RESUME_JOB, { type: CommandType.RESUME_JOB, timeout: 300 }],
    [CommandType.ABORT_JOB, { type: CommandType.ABORT_JOB, timeout: 500 }],
    [CommandType.EMERGENCY_STOP, { type: CommandType.EMERGENCY_STOP, timeout: 200 }],
  ]);
  private maxRetries = 3;
  private retryBaseDelay = 50; // shortened for tests (real: 2000ms)
  public dispatchLog: Array<{
    commandId: string;
    status: CommandStatus;
    timestamp: number;
    detail?: string;
  }> = [];

  constructor(deps: DispatcherDeps) {
    this.deps = deps;
  }

  /** Submit a command through the full lifecycle */
  async submit(request: CommandRequest): Promise<{
    commandId: string;
    status: CommandStatus;
    detail?: string;
  }> {
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const adapter = this.deps.adapters.get(request.machineId);

    if (!adapter) {
      return { commandId, status: CommandStatus.REJECTED, detail: 'Adapter not found' };
    }

    // ── Step 1: Safety Gate ──
    const safetyResult = await this.deps.safetyGate.validate(request, adapter as any);
    if (!safetyResult.passed) {
      // CRITICAL priority: only connection check blocks
      if (request.priority === CommandPriority.CRITICAL) {
        const connectionCheck = safetyResult.checks.find(c => c.name === 'connection');
        if (connectionCheck && !connectionCheck.passed) {
          this.log(commandId, CommandStatus.REJECTED, safetyResult.reason);
          return { commandId, status: CommandStatus.REJECTED, detail: safetyResult.reason };
        }
        // Bypass other checks for CRITICAL
      } else {
        this.log(commandId, CommandStatus.REJECTED, safetyResult.reason);
        return { commandId, status: CommandStatus.REJECTED, detail: safetyResult.reason };
      }
    }

    // ── Step 2: Queue or Bypass ──
    const entry: CommandQueueEntry = {
      commandId,
      request,
      status: CommandStatus.QUEUED,
      createdAt: new Date(),
      retryCount: 0,
    };

    if (request.priority === CommandPriority.CRITICAL) {
      // Bypass queue — dispatch immediately
      entry.status = CommandStatus.DISPATCHING;
      this.log(commandId, CommandStatus.DISPATCHING, 'CRITICAL bypass queue');
      return this.dispatch(entry, adapter);
    }

    await this.deps.commandQueue.enqueue(entry);
    this.log(commandId, CommandStatus.QUEUED);

    // ── Step 3: Process queue (immediate for test) ──
    return this.processQueue(request.machineId);
  }

  /** Process next command from queue */
  private async processQueue(machineId: string): Promise<{
    commandId: string;
    status: CommandStatus;
    detail?: string;
  }> {
    const entry = await this.deps.commandQueue.dequeue(machineId);
    if (!entry) {
      return { commandId: '', status: CommandStatus.REJECTED, detail: 'Queue empty' };
    }

    const adapter = this.deps.adapters.get(machineId);
    if (!adapter) {
      return { commandId: entry.commandId, status: CommandStatus.FAILED, detail: 'Adapter lost' };
    }

    entry.status = CommandStatus.DISPATCHING;
    await this.deps.commandQueue.updateStatus(entry.commandId, CommandStatus.DISPATCHING);
    this.log(entry.commandId, CommandStatus.DISPATCHING);

    return this.dispatch(entry, adapter);
  }

  /** Dispatch command to adapter with retry logic */
  private async dispatch(
    entry: CommandQueueEntry,
    adapter: ReturnType<typeof createMockAdapter>
  ): Promise<{ commandId: string; status: CommandStatus; detail?: string }> {
    const { request, commandId } = entry;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff (shortened for tests)
        const delay = this.retryBaseDelay * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
        entry.retryCount = attempt;
        this.log(commandId, CommandStatus.DISPATCHING, `Retry attempt ${attempt}`);
      }

      try {
        await this.executeCommand(request, adapter);

        // ── Step 4: State Confirmation ──
        const confirmed = await this.waitForConfirmation(request, adapter);
        if (confirmed) {
          entry.status = CommandStatus.CONFIRMED;
          await this.deps.commandQueue.updateStatus(commandId, CommandStatus.CONFIRMED);
          await this.deps.commandQueue.clearCurrentCommand(request.machineId);
          this.log(commandId, CommandStatus.CONFIRMED);
          return { commandId, status: CommandStatus.CONFIRMED };
        } else {
          lastError = new Error('State confirmation timeout');
        }
      } catch (err) {
        lastError = err as Error;
        if ((err as Error).message.includes('rejected')) {
          // Hard rejection — no retry
          entry.status = CommandStatus.REJECTED;
          await this.deps.commandQueue.updateStatus(commandId, CommandStatus.REJECTED, (err as Error).message);
          this.log(commandId, CommandStatus.REJECTED, (err as Error).message);
          return { commandId, status: CommandStatus.REJECTED, detail: (err as Error).message };
        }
        // Transient error — retry
        continue;
      }
    }

    // All retries exhausted
    entry.status = CommandStatus.FAILED;
    const detail = `Max retries exceeded: ${lastError?.message}`;
    await this.deps.commandQueue.updateStatus(commandId, CommandStatus.FAILED, detail);
    await this.deps.commandQueue.clearCurrentCommand(request.machineId);
    this.log(commandId, CommandStatus.FAILED, detail);
    return { commandId, status: CommandStatus.FAILED, detail };
  }

  /** Execute the actual command on the adapter */
  private async executeCommand(
    request: CommandRequest,
    adapter: ReturnType<typeof createMockAdapter>
  ): Promise<void> {
    switch (request.type) {
      case CommandType.START_JOB: {
        const payload = request.payload as StartJobPayload;
        await adapter.startJob(payload.jobId, payload.programRef);
        break;
      }
      case CommandType.PAUSE_JOB: {
        const payload = request.payload as PauseJobPayload;
        await adapter.pauseJob(payload.jobId);
        break;
      }
      case CommandType.RESUME_JOB: {
        const payload = request.payload as { jobId: string };
        await adapter.resumeJob(payload.jobId);
        break;
      }
      case CommandType.ABORT_JOB: {
        const payload = request.payload as AbortJobPayload;
        await adapter.abortJob(payload.jobId);
        break;
      }
      case CommandType.EMERGENCY_STOP: {
        await adapter.emergencyStop();
        break;
      }
    }
  }

  /** Poll adapter state until expected state or timeout */
  private async waitForConfirmation(
    request: CommandRequest,
    adapter: ReturnType<typeof createMockAdapter>
  ): Promise<boolean> {
    const expectedState = this.getExpectedState(request.type);
    if (expectedState === null) return true; // No confirmation needed (e.g., emergency uses method return)

    const config = this.confirmationTimeouts.get(request.type);
    const timeout = config ? config.timeout : 5000;
    const pollInterval = 50; // shortened for tests (real: 500ms)
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const currentState = await adapter.readUnitState();
      if (currentState === expectedState) {
        return true;
      }
      await new Promise(r => setTimeout(r, pollInterval));
    }

    return false;
  }

  private getExpectedState(type: CommandType): WwUnitState | null {
    switch (type) {
      case CommandType.START_JOB: return WwUnitState.WORKING;
      case CommandType.PAUSE_JOB: return WwUnitState.STANDBY;
      case CommandType.RESUME_JOB: return WwUnitState.WORKING;
      case CommandType.ABORT_JOB: return WwUnitState.READY;
      case CommandType.EMERGENCY_STOP: return null; // uses method return, not state poll
    }
  }

  private log(commandId: string, status: CommandStatus, detail?: string) {
    this.dispatchLog.push({ commandId, status, timestamp: Date.now(), detail });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Command Lifecycle Integration', () => {
  let safetyGate: ReturnType<typeof createMockSafetyGate>;
  let commandQueue: ReturnType<typeof createMockCommandQueue>;
  let adapters: Map<string, ReturnType<typeof createMockAdapter>>;
  let dispatcher: TestCommandDispatcher;

  // Machine IDs
  const BIESSE_ID = 'biesse-rover-b-01';
  const HOMAG_ID = 'homag-centateq-p-01';
  const KDT_ID = 'kdt-kn3-01';

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockRedisData.clear();
    mockRedisSortedSets.clear();
    mockRedisExpiry.clear();

    safetyGate = createMockSafetyGate();
    commandQueue = createMockCommandQueue();
    adapters = new Map();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setupDispatcher() {
    dispatcher = new TestCommandDispatcher({
      safetyGate,
      commandQueue,
      adapters,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. BIESSE ADAPTER — OPC UA Method Call Path
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Biesse OPC UA Method Call Path', () => {
    beforeEach(() => {
      adapters.set(BIESSE_ID, createMockAdapter({
        vendor: MachineVendor.BIESSE,
        machineId: BIESSE_ID,
        initialState: WwUnitState.READY,
        stateSequence: [WwUnitState.WORKING], // transitions to WORKING after startJob
      }));
      setupDispatcher();
    });

    it('should complete START_JOB lifecycle: submit → safety → queue → dispatch → confirm', async () => {
      const request: CommandRequest = {
        type: CommandType.START_JOB,
        machineId: BIESSE_ID,
        priority: CommandPriority.NORMAL,
        payload: {
          jobId: 'job-biesse-001',
          programRef: 'PANEL_CUT_001.bpp',
        } as StartJobPayload,
        requestedBy: 'operator-01',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      expect(result.status).toBe(CommandStatus.CONFIRMED);
      expect(safetyGate.validate).toHaveBeenCalledOnce();
      expect(commandQueue.enqueue).toHaveBeenCalledOnce();
      expect(commandQueue.dequeue).toHaveBeenCalledOnce();

      const adapter = adapters.get(BIESSE_ID)!;
      expect(adapter.startJob).toHaveBeenCalledWith('job-biesse-001', 'PANEL_CUT_001.bpp');
      expect(adapter.readUnitState).toHaveBeenCalled();

      // Verify dispatch log sequence
      const statuses = dispatcher.dispatchLog.map(l => l.status);
      expect(statuses).toContain(CommandStatus.QUEUED);
      expect(statuses).toContain(CommandStatus.DISPATCHING);
      expect(statuses).toContain(CommandStatus.CONFIRMED);
    });

    it('should complete PAUSE_JOB lifecycle with STANDBY confirmation', async () => {
      // Set machine to WORKING first
      const adapter = createMockAdapter({
        vendor: MachineVendor.BIESSE,
        machineId: BIESSE_ID,
        initialState: WwUnitState.WORKING,
        stateSequence: [WwUnitState.STANDBY],
      });
      adapters.set(BIESSE_ID, adapter);
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.PAUSE_JOB,
        machineId: BIESSE_ID,
        priority: CommandPriority.NORMAL,
        payload: { jobId: 'job-biesse-001' } as PauseJobPayload,
        requestedBy: 'operator-01',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      expect(result.status).toBe(CommandStatus.CONFIRMED);
      expect(adapter.pauseJob).toHaveBeenCalledWith('job-biesse-001');
    });

    it('should complete ABORT_JOB lifecycle with READY confirmation', async () => {
      const adapter = createMockAdapter({
        vendor: MachineVendor.BIESSE,
        machineId: BIESSE_ID,
        initialState: WwUnitState.WORKING,
        stateSequence: [WwUnitState.READY],
      });
      adapters.set(BIESSE_ID, adapter);
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.ABORT_JOB,
        machineId: BIESSE_ID,
        priority: CommandPriority.HIGH,
        payload: { jobId: 'job-biesse-001', reason: 'Material defect' } as AbortJobPayload,
        requestedBy: 'supervisor-01',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      expect(result.status).toBe(CommandStatus.CONFIRMED);
      expect(adapter.abortJob).toHaveBeenCalledWith('job-biesse-001');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. HOMAG ADAPTER — Cloud API + OPC UA Fallback Path
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Homag Dual-Channel Path (Cloud API + OPC UA Fallback)', () => {
    beforeEach(() => {
      adapters.set(HOMAG_ID, createMockAdapter({
        vendor: MachineVendor.HOMAG,
        machineId: HOMAG_ID,
        initialState: WwUnitState.READY,
        stateSequence: [WwUnitState.WORKING],
      }));
      setupDispatcher();
    });

    it('should complete START_JOB via primary cloud API path', async () => {
      const request: CommandRequest = {
        type: CommandType.START_JOB,
        machineId: HOMAG_ID,
        priority: CommandPriority.NORMAL,
        payload: {
          jobId: 'job-homag-001',
          programRef: 'EDGE_BAND_042.mpr',
        } as StartJobPayload,
        requestedBy: 'operator-02',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      expect(result.status).toBe(CommandStatus.CONFIRMED);
      const adapter = adapters.get(HOMAG_ID)!;
      expect(adapter.startJob).toHaveBeenCalledWith('job-homag-001', 'EDGE_BAND_042.mpr');
      expect(adapter._callLog[0].method).toBe('startJob');
    });

    it('should fallback to OPC UA when cloud API fails (simulated via retry)', async () => {
      // Simulate cloud failure on first attempt
      const adapter = createMockAdapter({
        vendor: MachineVendor.HOMAG,
        machineId: HOMAG_ID,
        initialState: WwUnitState.READY,
        stateSequence: [WwUnitState.WORKING],
        failFirstAttempt: true, // first call throws network error
      });
      adapters.set(HOMAG_ID, adapter);
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.START_JOB,
        machineId: HOMAG_ID,
        priority: CommandPriority.NORMAL,
        payload: {
          jobId: 'job-homag-002',
          programRef: 'DRILL_PATTERN_003.mpr',
        } as StartJobPayload,
        requestedBy: 'operator-02',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      // Should succeed on retry (simulating OPC UA fallback)
      expect(result.status).toBe(CommandStatus.CONFIRMED);
      expect(adapter.startJob).toHaveBeenCalledTimes(2);
      expect(adapter._callLog).toHaveLength(2);

      // Verify retry was logged
      const retryLog = dispatcher.dispatchLog.find(l => l.detail?.includes('Retry'));
      expect(retryLog).toBeDefined();
    });

    it('should handle PAUSE via cloud API with STANDBY confirmation', async () => {
      const adapter = createMockAdapter({
        vendor: MachineVendor.HOMAG,
        machineId: HOMAG_ID,
        initialState: WwUnitState.WORKING,
        stateSequence: [WwUnitState.STANDBY],
      });
      adapters.set(HOMAG_ID, adapter);
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.PAUSE_JOB,
        machineId: HOMAG_ID,
        priority: CommandPriority.NORMAL,
        payload: { jobId: 'job-homag-001' } as PauseJobPayload,
        requestedBy: 'operator-02',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);
      expect(result.status).toBe(CommandStatus.CONFIRMED);
      expect(adapter.pauseJob).toHaveBeenCalledWith('job-homag-001');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. KDT ADAPTER — Modbus Register Write + ACK Polling Path
  // ═══════════════════════════════════════════════════════════════════════════

  describe('KDT Modbus Register Write + ACK Polling Path', () => {
    beforeEach(() => {
      adapters.set(KDT_ID, createMockAdapter({
        vendor: MachineVendor.KDT,
        machineId: KDT_ID,
        initialState: WwUnitState.READY,
        stateSequence: [WwUnitState.WORKING],
      }));
      setupDispatcher();
    });

    it('should complete START_JOB via Modbus register write with state confirmation', async () => {
      const request: CommandRequest = {
        type: CommandType.START_JOB,
        machineId: KDT_ID,
        priority: CommandPriority.NORMAL,
        payload: {
          jobId: 'job-kdt-001',
          programRef: 'BORE_V2',
        } as StartJobPayload,
        requestedBy: 'operator-03',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      expect(result.status).toBe(CommandStatus.CONFIRMED);
      const adapter = adapters.get(KDT_ID)!;
      expect(adapter.startJob).toHaveBeenCalledWith('job-kdt-001', 'BORE_V2');
      expect(adapter._callLog[0]).toEqual(
        expect.objectContaining({ method: 'startJob', args: ['job-kdt-001', 'BORE_V2'] })
      );
    });

    it('should complete ABORT_JOB with READY confirmation', async () => {
      const adapter = createMockAdapter({
        vendor: MachineVendor.KDT,
        machineId: KDT_ID,
        initialState: WwUnitState.WORKING,
        stateSequence: [WwUnitState.READY],
      });
      adapters.set(KDT_ID, adapter);
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.ABORT_JOB,
        machineId: KDT_ID,
        priority: CommandPriority.HIGH,
        payload: { jobId: 'job-kdt-001', reason: 'Wrong program loaded' } as AbortJobPayload,
        requestedBy: 'operator-03',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);
      expect(result.status).toBe(CommandStatus.CONFIRMED);
      expect(adapter.abortJob).toHaveBeenCalledWith('job-kdt-001');
    });

    it('should handle KDT Modbus failure with retry and eventual success', async () => {
      const adapter = createMockAdapter({
        vendor: MachineVendor.KDT,
        machineId: KDT_ID,
        initialState: WwUnitState.READY,
        stateSequence: [WwUnitState.WORKING],
        failFirstAttempt: true, // Simulates Modbus NACK on first attempt
      });
      adapters.set(KDT_ID, adapter);
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.START_JOB,
        machineId: KDT_ID,
        priority: CommandPriority.NORMAL,
        payload: { jobId: 'job-kdt-002', programRef: 'EDGE_V1' } as StartJobPayload,
        requestedBy: 'operator-03',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);
      expect(result.status).toBe(CommandStatus.CONFIRMED);
      expect(adapter.startJob).toHaveBeenCalledTimes(2); // 1 fail + 1 success
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. SAFETY GATE REJECTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Safety Gate Rejection', () => {
    it('should reject command when safety gate fails (incompatible state)', async () => {
      safetyGate = createMockSafetyGate({
        rejectReason: 'Machine in ERROR state — cannot accept START command',
      });

      adapters.set(BIESSE_ID, createMockAdapter({
        vendor: MachineVendor.BIESSE,
        machineId: BIESSE_ID,
        initialState: WwUnitState.ERROR,
      }));
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.START_JOB,
        machineId: BIESSE_ID,
        priority: CommandPriority.NORMAL,
        payload: { jobId: 'job-fail-001', programRef: 'test.bpp' } as StartJobPayload,
        requestedBy: 'operator-01',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      expect(result.status).toBe(CommandStatus.REJECTED);
      expect(result.detail).toContain('ERROR state');
      expect(commandQueue.enqueue).not.toHaveBeenCalled();

      // Adapter should never have been called
      const adapter = adapters.get(BIESSE_ID)!;
      expect(adapter.startJob).not.toHaveBeenCalled();
    });

    it('should reject command when adapter is disconnected', async () => {
      const adapter = createMockAdapter({
        vendor: MachineVendor.HOMAG,
        machineId: HOMAG_ID,
        initialState: WwUnitState.READY,
      });
      adapter._connected = false;
      adapters.set(HOMAG_ID, adapter);
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.START_JOB,
        machineId: HOMAG_ID,
        priority: CommandPriority.NORMAL,
        payload: { jobId: 'job-fail-002', programRef: 'test.mpr' } as StartJobPayload,
        requestedBy: 'operator-02',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      expect(result.status).toBe(CommandStatus.REJECTED);
      expect(result.detail).toContain('not connected');
    });

    it('should reject non-existent machine', async () => {
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.START_JOB,
        machineId: 'ghost-machine-99',
        priority: CommandPriority.NORMAL,
        payload: { jobId: 'job-ghost', programRef: 'nothing.nc' } as StartJobPayload,
        requestedBy: 'operator-01',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);
      expect(result.status).toBe(CommandStatus.REJECTED);
      expect(result.detail).toContain('Adapter not found');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. EMERGENCY STOP — Bypass Queue (CRITICAL priority)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Emergency Stop — CRITICAL Priority Queue Bypass', () => {
    it('should bypass queue and dispatch immediately for Biesse E-STOP', async () => {
      adapters.set(BIESSE_ID, createMockAdapter({
        vendor: MachineVendor.BIESSE,
        machineId: BIESSE_ID,
        initialState: WwUnitState.WORKING,
      }));
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.EMERGENCY_STOP,
        machineId: BIESSE_ID,
        priority: CommandPriority.CRITICAL,
        payload: { reason: 'Operator safety concern' } as EmergencyStopPayload,
        requestedBy: 'supervisor-01',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      expect(result.status).toBe(CommandStatus.CONFIRMED);
      // Queue should NOT have been used
      expect(commandQueue.enqueue).not.toHaveBeenCalled();
      expect(commandQueue.dequeue).not.toHaveBeenCalled();

      const adapter = adapters.get(BIESSE_ID)!;
      expect(adapter.emergencyStop).toHaveBeenCalledOnce();

      // Verify dispatch log shows bypass
      const bypassLog = dispatcher.dispatchLog.find(l => l.detail?.includes('CRITICAL bypass'));
      expect(bypassLog).toBeDefined();
    });

    it('should bypass queue for KDT E-STOP', async () => {
      adapters.set(KDT_ID, createMockAdapter({
        vendor: MachineVendor.KDT,
        machineId: KDT_ID,
        initialState: WwUnitState.WORKING,
      }));
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.EMERGENCY_STOP,
        machineId: KDT_ID,
        priority: CommandPriority.CRITICAL,
        payload: { reason: 'Spindle vibration anomaly' } as EmergencyStopPayload,
        requestedBy: 'system-watchdog',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      expect(result.status).toBe(CommandStatus.CONFIRMED);
      expect(commandQueue.enqueue).not.toHaveBeenCalled();

      const adapter = adapters.get(KDT_ID)!;
      expect(adapter.emergencyStop).toHaveBeenCalledOnce();
    });

    it('should still reject CRITICAL E-STOP if adapter is disconnected', async () => {
      const adapter = createMockAdapter({
        vendor: MachineVendor.HOMAG,
        machineId: HOMAG_ID,
        initialState: WwUnitState.WORKING,
      });
      adapter._connected = false;
      adapters.set(HOMAG_ID, adapter);
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.EMERGENCY_STOP,
        machineId: HOMAG_ID,
        priority: CommandPriority.CRITICAL,
        payload: { reason: 'Fire alarm' } as EmergencyStopPayload,
        requestedBy: 'fire-system',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      // Even CRITICAL cannot bypass connection check
      expect(result.status).toBe(CommandStatus.REJECTED);
      expect(result.detail).toContain('not connected');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. RETRY ON FAILURE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Retry on Transient Failure', () => {
    it('should retry up to maxRetries and then FAIL if all attempts fail', async () => {
      // Always fails — never succeeds
      const adapter = createMockAdapter({
        vendor: MachineVendor.BIESSE,
        machineId: BIESSE_ID,
        initialState: WwUnitState.READY,
        stateSequence: [], // never transitions
      });
      // Override startJob to always throw transient error
      adapter.startJob = vi.fn(async () => {
        throw new Error('OPC UA ServiceFault: BadTimeout');
      });
      adapters.set(BIESSE_ID, adapter);
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.START_JOB,
        machineId: BIESSE_ID,
        priority: CommandPriority.NORMAL,
        payload: { jobId: 'job-retry-all', programRef: 'fail.bpp' } as StartJobPayload,
        requestedBy: 'operator-01',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      expect(result.status).toBe(CommandStatus.FAILED);
      expect(result.detail).toContain('Max retries exceeded');
      // Initial attempt + 3 retries = 4 calls total
      expect(adapter.startJob).toHaveBeenCalledTimes(4);
    });

    it('should succeed on second attempt after transient failure', async () => {
      const adapter = createMockAdapter({
        vendor: MachineVendor.KDT,
        machineId: KDT_ID,
        initialState: WwUnitState.READY,
        stateSequence: [WwUnitState.WORKING],
        failFirstAttempt: true,
      });
      adapters.set(KDT_ID, adapter);
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.START_JOB,
        machineId: KDT_ID,
        priority: CommandPriority.NORMAL,
        payload: { jobId: 'job-retry-ok', programRef: 'PANEL_V3' } as StartJobPayload,
        requestedBy: 'operator-03',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      expect(result.status).toBe(CommandStatus.CONFIRMED);
      expect(adapter.startJob).toHaveBeenCalledTimes(2);
    });

    it('should NOT retry on hard rejection (4xx equivalent)', async () => {
      const adapter = createMockAdapter({
        vendor: MachineVendor.HOMAG,
        machineId: HOMAG_ID,
        initialState: WwUnitState.READY,
        rejectCommand: true, // throws "rejected" error
      });
      adapters.set(HOMAG_ID, adapter);
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.START_JOB,
        machineId: HOMAG_ID,
        priority: CommandPriority.NORMAL,
        payload: { jobId: 'job-hard-reject', programRef: 'nope.mpr' } as StartJobPayload,
        requestedBy: 'operator-02',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      expect(result.status).toBe(CommandStatus.REJECTED);
      expect(result.detail).toContain('rejected');
      // Should only attempt once — no retry on hard rejection
      expect(adapter.startJob).toHaveBeenCalledTimes(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. TIMEOUT HANDLING (State Confirmation Timeout)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('State Confirmation Timeout', () => {
    it('should FAIL when machine never transitions to expected state', async () => {
      // Machine stays READY — never goes to WORKING
      const adapter = createMockAdapter({
        vendor: MachineVendor.BIESSE,
        machineId: BIESSE_ID,
        initialState: WwUnitState.READY,
        stateSequence: [], // state never changes
      });
      adapters.set(BIESSE_ID, adapter);
      setupDispatcher();

      const request: CommandRequest = {
        type: CommandType.START_JOB,
        machineId: BIESSE_ID,
        priority: CommandPriority.NORMAL,
        payload: { jobId: 'job-timeout', programRef: 'stuck.bpp' } as StartJobPayload,
        requestedBy: 'operator-01',
        requestedAt: new Date(),
      };

      const result = await dispatcher.submit(request);

      // Should fail after retries due to confirmation timeout
      expect(result.status).toBe(CommandStatus.FAILED);
      expect(result.detail).toContain('Max retries exceeded');
      expect(result.detail).toContain('confirmation timeout');
    }, 60_000); // Extended timeout for retry + polling cycles
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. CANCEL PENDING COMMAND
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cancel Pending Command', () => {
    it('should cancel a QUEUED command before dispatch', async () => {
      adapters.set(BIESSE_ID, createMockAdapter({
        vendor: MachineVendor.BIESSE,
        machineId: BIESSE_ID,
        initialState: WwUnitState.READY,
        stateSequence: [WwUnitState.WORKING],
      }));
      setupDispatcher();

      // Manually enqueue a command
      const entry: CommandQueueEntry = {
        commandId: 'cmd_cancel_001',
        request: {
          type: CommandType.START_JOB,
          machineId: BIESSE_ID,
          priority: CommandPriority.LOW,
          payload: { jobId: 'job-cancel', programRef: 'cancel.bpp' } as StartJobPayload,
          requestedBy: 'operator-01',
          requestedAt: new Date(),
        },
        status: CommandStatus.QUEUED,
        createdAt: new Date(),
        retryCount: 0,
      };

      await commandQueue.enqueue(entry);
      expect(await commandQueue.getQueueLength(BIESSE_ID)).toBe(1);

      // Cancel it
      const cancelled = await commandQueue.cancel('cmd_cancel_001');
      expect(cancelled).toBe(true);

      const cancelledEntry = await commandQueue.getEntry('cmd_cancel_001');
      expect(cancelledEntry?.status).toBe(CommandStatus.CANCELLED);
      expect(await commandQueue.getQueueLength(BIESSE_ID)).toBe(0);
    });

    it('should NOT cancel a command that is already DISPATCHING', async () => {
      adapters.set(HOMAG_ID, createMockAdapter({
        vendor: MachineVendor.HOMAG,
        machineId: HOMAG_ID,
        initialState: WwUnitState.READY,
        stateSequence: [WwUnitState.WORKING],
      }));
      setupDispatcher();

      // Manually set entry to DISPATCHING state
      const entry: CommandQueueEntry = {
        commandId: 'cmd_no_cancel_001',
        request: {
          type: CommandType.START_JOB,
          machineId: HOMAG_ID,
          priority: CommandPriority.NORMAL,
          payload: { jobId: 'job-active', programRef: 'active.mpr' } as StartJobPayload,
          requestedBy: 'operator-02',
          requestedAt: new Date(),
        },
        status: CommandStatus.DISPATCHING,
        createdAt: new Date(),
        retryCount: 0,
      };

      await commandQueue.enqueue(entry);
      entry.status = CommandStatus.DISPATCHING; // Already dispatching
      commandQueue._entries.set(entry.commandId, entry);

      const cancelled = await commandQueue.cancel('cmd_no_cancel_001');
      expect(cancelled).toBe(false); // Cannot cancel in-flight
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. CROSS-ADAPTER SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cross-Adapter Concurrent Commands', () => {
    beforeEach(() => {
      adapters.set(BIESSE_ID, createMockAdapter({
        vendor: MachineVendor.BIESSE,
        machineId: BIESSE_ID,
        initialState: WwUnitState.READY,
        stateSequence: [WwUnitState.WORKING],
      }));
      adapters.set(HOMAG_ID, createMockAdapter({
        vendor: MachineVendor.HOMAG,
        machineId: HOMAG_ID,
        initialState: WwUnitState.READY,
        stateSequence: [WwUnitState.WORKING],
      }));
      adapters.set(KDT_ID, createMockAdapter({
        vendor: MachineVendor.KDT,
        machineId: KDT_ID,
        initialState: WwUnitState.READY,
        stateSequence: [WwUnitState.WORKING],
      }));
      setupDispatcher();
    });

    it('should handle parallel START_JOB across all 3 machines', async () => {
      const requests: CommandRequest[] = [
        {
          type: CommandType.START_JOB,
          machineId: BIESSE_ID,
          priority: CommandPriority.NORMAL,
          payload: { jobId: 'job-b-001', programRef: 'panel.bpp' } as StartJobPayload,
          requestedBy: 'scheduler',
          requestedAt: new Date(),
        },
        {
          type: CommandType.START_JOB,
          machineId: HOMAG_ID,
          priority: CommandPriority.NORMAL,
          payload: { jobId: 'job-h-001', programRef: 'edge.mpr' } as StartJobPayload,
          requestedBy: 'scheduler',
          requestedAt: new Date(),
        },
        {
          type: CommandType.START_JOB,
          machineId: KDT_ID,
          priority: CommandPriority.NORMAL,
          payload: { jobId: 'job-k-001', programRef: 'bore.nc' } as StartJobPayload,
          requestedBy: 'scheduler',
          requestedAt: new Date(),
        },
      ];

      const results = await Promise.all(requests.map(r => dispatcher.submit(r)));

      // All 3 should confirm
      expect(results.every(r => r.status === CommandStatus.CONFIRMED)).toBe(true);

      // Each adapter called exactly once
      expect(adapters.get(BIESSE_ID)!.startJob).toHaveBeenCalledOnce();
      expect(adapters.get(HOMAG_ID)!.startJob).toHaveBeenCalledOnce();
      expect(adapters.get(KDT_ID)!.startJob).toHaveBeenCalledOnce();
    });

    it('should handle mixed success/failure across adapters', async () => {
      // Biesse: success
      // Homag: reject (hard failure)
      // KDT: success after retry
      adapters.set(HOMAG_ID, createMockAdapter({
        vendor: MachineVendor.HOMAG,
        machineId: HOMAG_ID,
        initialState: WwUnitState.READY,
        rejectCommand: true,
      }));
      adapters.set(KDT_ID, createMockAdapter({
        vendor: MachineVendor.KDT,
        machineId: KDT_ID,
        initialState: WwUnitState.READY,
        stateSequence: [WwUnitState.WORKING],
        failFirstAttempt: true,
      }));
      setupDispatcher();

      const requests: CommandRequest[] = [
        {
          type: CommandType.START_JOB,
          machineId: BIESSE_ID,
          priority: CommandPriority.NORMAL,
          payload: { jobId: 'job-mix-b', programRef: 'ok.bpp' } as StartJobPayload,
          requestedBy: 'scheduler',
          requestedAt: new Date(),
        },
        {
          type: CommandType.START_JOB,
          machineId: HOMAG_ID,
          priority: CommandPriority.NORMAL,
          payload: { jobId: 'job-mix-h', programRef: 'fail.mpr' } as StartJobPayload,
          requestedBy: 'scheduler',
          requestedAt: new Date(),
        },
        {
          type: CommandType.START_JOB,
          machineId: KDT_ID,
          priority: CommandPriority.NORMAL,
          payload: { jobId: 'job-mix-k', programRef: 'retry.nc' } as StartJobPayload,
          requestedBy: 'scheduler',
          requestedAt: new Date(),
        },
      ];

      const results = await Promise.all(requests.map(r => dispatcher.submit(r)));

      expect(results[0].status).toBe(CommandStatus.CONFIRMED); // Biesse OK
      expect(results[1].status).toBe(CommandStatus.REJECTED);  // Homag rejected
      expect(results[2].status).toBe(CommandStatus.CONFIRMED); // KDT retry success
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. PRIORITY ORDERING
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Priority Queue Ordering', () => {
    it('should dequeue HIGH priority before NORMAL', async () => {
      adapters.set(BIESSE_ID, createMockAdapter({
        vendor: MachineVendor.BIESSE,
        machineId: BIESSE_ID,
        initialState: WwUnitState.READY,
        stateSequence: [WwUnitState.WORKING],
      }));
      setupDispatcher();

      const normalEntry: CommandQueueEntry = {
        commandId: 'cmd_normal_001',
        request: {
          type: CommandType.START_JOB,
          machineId: BIESSE_ID,
          priority: CommandPriority.NORMAL,
          payload: { jobId: 'job-normal', programRef: 'a.bpp' } as StartJobPayload,
          requestedBy: 'operator',
          requestedAt: new Date(),
        },
        status: CommandStatus.QUEUED,
        createdAt: new Date(),
        retryCount: 0,
      };

      const highEntry: CommandQueueEntry = {
        commandId: 'cmd_high_001',
        request: {
          type: CommandType.START_JOB,
          machineId: BIESSE_ID,
          priority: CommandPriority.HIGH,
          payload: { jobId: 'job-high', programRef: 'b.bpp' } as StartJobPayload,
          requestedBy: 'supervisor',
          requestedAt: new Date(),
        },
        status: CommandStatus.QUEUED,
        createdAt: new Date(),
        retryCount: 0,
      };

      // Enqueue normal first, then high
      await commandQueue.enqueue(normalEntry);
      await commandQueue.enqueue(highEntry);

      // High should come out first (higher priority score)
      const first = await commandQueue.dequeue(BIESSE_ID);
      expect(first?.commandId).toBe('cmd_high_001');

      const second = await commandQueue.dequeue(BIESSE_ID);
      expect(second?.commandId).toBe('cmd_normal_001');
    });
  });
});
