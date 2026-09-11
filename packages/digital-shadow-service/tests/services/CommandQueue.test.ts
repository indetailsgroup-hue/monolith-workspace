/**
 * Unit Tests: CommandQueue
 * Tests Redis-backed priority queue with retry logic, TTL, timeout management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mock ioredis ─────────────────────────────────────────────────────────────
const { mockPipelineExec, mockPipeline, mockRedis } = vi.hoisted(() => {
  const mockPipelineExec = vi.fn().mockResolvedValue([]);
  const mockPipeline = {
    set: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    srem: vi.fn().mockReturnThis(),
    zrem: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    exec: mockPipelineExec,
  };
  const mockRedis = {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    zcard: vi.fn().mockResolvedValue(0),
    zadd: vi.fn().mockResolvedValue(1),
    zpopmin: vi.fn(),
    zrange: vi.fn().mockResolvedValue([]),
    zrangebyscore: vi.fn().mockResolvedValue([]),
    zrem: vi.fn().mockResolvedValue(1),
    sadd: vi.fn().mockResolvedValue(1),
    srem: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn(() => mockPipeline),
    quit: vi.fn().mockResolvedValue('OK'),
  };
  return { mockPipelineExec, mockPipeline, mockRedis };
});

vi.mock('ioredis', () => ({
  default: vi.fn(function MockIoRedis() { return mockRedis; }),
}));

vi.mock('../../src/config/index.js', () => ({
  redisConfig: { url: 'redis://localhost:6379' },
  opcuaConfig: { endpointUrl: '' },
  mqttConfig: { brokerUrl: '' },
  influxConfig: { url: '', token: '', org: '', bucket: '' },
  appConfig: { port: 3100, nodeEnv: 'test' },
}));

import { CommandQueue, QueueFullError } from '../../src/services/CommandQueue';
import { CommandType, CommandStatus, CommandPriority } from '../../src/types/command';
import type { CommandRequest } from '../../src/types/command';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createRequest(overrides: Partial<CommandRequest> = {}): CommandRequest {
  return {
    machineId: 'biesse-rover-01',
    commandType: CommandType.START_JOB,
    priority: CommandPriority.NORMAL,
    payload: { jobId: 'JOB-001', programRef: 'PANEL-A' },
    operatorId: 'op-001',
    ...overrides,
  };
}

function createEntryJson(commandId: string, overrides: any = {}) {
  return JSON.stringify({
    commandId,
    request: createRequest(),
    status: CommandStatus.QUEUED,
    priority: CommandPriority.NORMAL,
    timestamps: { receivedAt: new Date(), queuedAt: new Date() },
    retryCount: 0,
    maxRetries: 3,
    safetyGateResults: [],
    ...overrides,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CommandQueue', () => {
  let queue: CommandQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    queue = new CommandQueue({ maxQueueDepthPerMachine: 5 });
  });

  afterEach(async () => {
    await queue.stop();
    vi.useRealTimers();
  });

  describe('start()', () => {
    it('should start the timeout checker interval', async () => {
      await queue.start();
      // Timeout checker is running — verify by advancing timers
      mockRedis.zrangebyscore.mockResolvedValue([]);
      await vi.advanceTimersByTimeAsync(1100);
      expect(mockRedis.zrangebyscore).toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    it('should clear interval and quit redis', async () => {
      await queue.start();
      await queue.stop();
      expect(mockRedis.quit).toHaveBeenCalled();
    });

    it('should handle stop without start', async () => {
      await queue.stop();
      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });

  describe('enqueue()', () => {
    it('should enqueue a command and return commandId', async () => {
      mockRedis.zcard.mockResolvedValue(0);
      const id = await queue.enqueue(createRequest());
      expect(id).toMatch(/^cmd_[a-f0-9]{16}$/);
      expect(mockPipeline.set).toHaveBeenCalled();
      expect(mockPipeline.zadd).toHaveBeenCalled();
      expect(mockPipeline.sadd).toHaveBeenCalled();
      expect(mockPipelineExec).toHaveBeenCalled();
    });

    it('should throw QueueFullError when depth limit reached', async () => {
      mockRedis.zcard.mockResolvedValue(5);
      await expect(queue.enqueue(createRequest())).rejects.toThrow(QueueFullError);
    });

    it('should calculate priority score correctly (lower priority = lower score)', async () => {
      mockRedis.zcard.mockResolvedValue(0);
      await queue.enqueue(createRequest({ priority: CommandPriority.HIGH }));
      const zaddCall = mockPipeline.zadd.mock.calls[0];
      // HIGH = 2, score = 2 * 1e13 + timestamp
      expect(zaddCall[1]).toBeLessThan(CommandPriority.LOW * 1e13 + Date.now());
    });

    it('should set TTL on command entry', async () => {
      mockRedis.zcard.mockResolvedValue(0);
      await queue.enqueue(createRequest());
      const setCall = mockPipeline.set.mock.calls[0];
      expect(setCall[2]).toBe('EX');
      expect(setCall[3]).toBe(3600);
    });

    it('should add to timeout watchlist with expiry score', async () => {
      mockRedis.zcard.mockResolvedValue(0);
      await queue.enqueue(createRequest({ timeoutMs: 5000 }));
      // Pipeline zadd is called twice: once for machineQueue, once for timeoutWatchlist
      expect(mockPipeline.zadd).toHaveBeenCalledTimes(2);
    });
  });

  describe('dequeue()', () => {
    it('should return null if machine has executing command', async () => {
      mockRedis.get.mockResolvedValue('cmd_existing');
      const result = await queue.dequeue('biesse-rover-01');
      expect(result).toBeNull();
    });

    it('should return null if queue is empty', async () => {
      mockRedis.get.mockResolvedValue(null); // no current command
      mockRedis.zpopmin.mockResolvedValue([]);
      const result = await queue.dequeue('biesse-rover-01');
      expect(result).toBeNull();
    });

    it('should return null if entry expired from Redis', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null) // no current command
        .mockResolvedValueOnce(null); // entry not found
      mockRedis.zpopmin.mockResolvedValue(['cmd_abc123']);
      const result = await queue.dequeue('biesse-rover-01');
      expect(result).toBeNull();
    });

    it('should dequeue and mark machine as busy', async () => {
      const entryJson = createEntryJson('cmd_abc123');
      mockRedis.get
        .mockResolvedValueOnce(null) // no current command
        .mockResolvedValueOnce(entryJson); // entry found
      mockRedis.zpopmin.mockResolvedValue(['cmd_abc123', '100']);

      const result = await queue.dequeue('biesse-rover-01');
      expect(result).not.toBeNull();
      expect(result!.commandId).toBe('cmd_abc123');
      expect(result!.status).toBe(CommandStatus.DISPATCHING);
      // Should set current command (marking machine as busy)
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('ds:cmd:current:biesse-rover-01'),
        'cmd_abc123',
        'EX',
        expect.any(Number),
      );
    });
  });

  describe('updateStatus()', () => {
    it('should return null if command not found', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await queue.updateStatus('cmd_nope', CommandStatus.CONFIRMED);
      expect(result).toBeNull();
    });

    it('should update status to CONFIRMED with timestamp', async () => {
      const entryJson = createEntryJson('cmd_abc', { status: CommandStatus.DISPATCHING });
      mockRedis.get.mockResolvedValue(entryJson);
      const result = await queue.updateStatus('cmd_abc', CommandStatus.CONFIRMED);
      expect(result!.status).toBe(CommandStatus.CONFIRMED);
      expect(result!.timestamps.confirmedAt).toBeDefined();
    });

    it('should update status to COMPLETED and cleanup', async () => {
      const entryJson = createEntryJson('cmd_abc', { status: CommandStatus.CONFIRMED });
      mockRedis.get
        .mockResolvedValueOnce(entryJson) // getEntry in updateStatus
        .mockResolvedValueOnce('cmd_abc'); // getCurrentCommand in cleanup
      const result = await queue.updateStatus('cmd_abc', CommandStatus.COMPLETED);
      expect(result!.status).toBe(CommandStatus.COMPLETED);
      expect(result!.timestamps.completedAt).toBeDefined();
      // Should call cleanup pipeline
      expect(mockPipeline.srem).toHaveBeenCalled();
      expect(mockPipeline.zrem).toHaveBeenCalled();
    });

    it('should update status to FAILED with error details', async () => {
      const entryJson = createEntryJson('cmd_abc');
      mockRedis.get.mockResolvedValueOnce(entryJson).mockResolvedValueOnce(null);
      const result = await queue.updateStatus('cmd_abc', CommandStatus.FAILED, {
        error: 'Machine fault',
      });
      expect(result!.status).toBe(CommandStatus.FAILED);
      expect(result!.error).toBe('Machine fault');
      expect(result!.timestamps.failedAt).toBeDefined();
    });

    it('should update status to TIMED_OUT with failedAt timestamp', async () => {
      const entryJson = createEntryJson('cmd_abc');
      mockRedis.get.mockResolvedValueOnce(entryJson).mockResolvedValueOnce(null);
      const result = await queue.updateStatus('cmd_abc', CommandStatus.TIMED_OUT);
      expect(result!.status).toBe(CommandStatus.TIMED_OUT);
      expect(result!.timestamps.failedAt).toBeDefined();
    });

    it('should attach machineResponse when provided', async () => {
      const entryJson = createEntryJson('cmd_abc');
      mockRedis.get.mockResolvedValueOnce(entryJson).mockResolvedValueOnce(null);
      const result = await queue.updateStatus('cmd_abc', CommandStatus.CONFIRMED, {
        machineResponse: { accepted: true, statusCode: 0 },
      });
      expect(result!.machineResponse).toEqual({ accepted: true, statusCode: 0 });
    });
  });

  describe('retry()', () => {
    it('should return false if entry not found', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await queue.retry('cmd_nope');
      expect(result).toBe(false);
    });

    it('should return false and mark FAILED if max retries exceeded', async () => {
      const entryJson = createEntryJson('cmd_abc', { retryCount: 3, maxRetries: 3 });
      mockRedis.get
        .mockResolvedValueOnce(entryJson) // retry read
        .mockResolvedValueOnce(entryJson) // updateStatus read
        .mockResolvedValueOnce(null); // cleanup getCurrentCommand
      const result = await queue.retry('cmd_abc');
      expect(result).toBe(false);
    });

    it('should re-enqueue with incremented retry count and backoff', async () => {
      const entryJson = createEntryJson('cmd_abc', { retryCount: 1, maxRetries: 3 });
      mockRedis.get.mockResolvedValue(entryJson);
      const result = await queue.retry('cmd_abc');
      expect(result).toBe(true);
      // Should re-enqueue with zadd
      expect(mockRedis.zadd).toHaveBeenCalled();
      // Should release machine lock
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('getEntry()', () => {
    it('should return parsed entry', async () => {
      mockRedis.get.mockResolvedValue(createEntryJson('cmd_abc'));
      const entry = await queue.getEntry('cmd_abc');
      expect(entry!.commandId).toBe('cmd_abc');
    });

    it('should return null for missing entry', async () => {
      mockRedis.get.mockResolvedValue(null);
      const entry = await queue.getEntry('cmd_nope');
      expect(entry).toBeNull();
    });
  });

  describe('getQueueDepth()', () => {
    it('should return zcard result', async () => {
      mockRedis.zcard.mockResolvedValue(7);
      const depth = await queue.getQueueDepth('machine-01');
      expect(depth).toBe(7);
    });
  });

  describe('getPendingCommands()', () => {
    it('should return empty array for empty queue', async () => {
      mockRedis.zrange.mockResolvedValue([]);
      const cmds = await queue.getPendingCommands('machine-01');
      expect(cmds).toEqual([]);
    });

    it('should return parsed entries for all pending commands', async () => {
      mockRedis.zrange.mockResolvedValue(['cmd_1', 'cmd_2']);
      mockRedis.get
        .mockResolvedValueOnce(createEntryJson('cmd_1'))
        .mockResolvedValueOnce(createEntryJson('cmd_2'));
      const cmds = await queue.getPendingCommands('machine-01');
      expect(cmds).toHaveLength(2);
    });

    it('should skip expired entries', async () => {
      mockRedis.zrange.mockResolvedValue(['cmd_1', 'cmd_expired']);
      mockRedis.get
        .mockResolvedValueOnce(createEntryJson('cmd_1'))
        .mockResolvedValueOnce(null); // expired
      const cmds = await queue.getPendingCommands('machine-01');
      expect(cmds).toHaveLength(1);
    });
  });

  describe('getCurrentCommand()', () => {
    it('should return null if no current command', async () => {
      mockRedis.get.mockResolvedValue(null);
      const cmd = await queue.getCurrentCommand('machine-01');
      expect(cmd).toBeNull();
    });

    it('should return current executing entry', async () => {
      mockRedis.get
        .mockResolvedValueOnce('cmd_active') // machineCurrentCmd
        .mockResolvedValueOnce(createEntryJson('cmd_active')); // getEntry
      const cmd = await queue.getCurrentCommand('machine-01');
      expect(cmd!.commandId).toBe('cmd_active');
    });
  });

  describe('checkTimeouts (via interval)', () => {
    it('should timeout and retry expired commands', async () => {
      await queue.start();

      const entryJson = createEntryJson('cmd_expired', {
        status: CommandStatus.DISPATCHING,
        retryCount: 0,
        maxRetries: 3,
      });
      mockRedis.zrangebyscore.mockResolvedValue(['cmd_expired']);
      mockRedis.get.mockResolvedValue(entryJson);

      await vi.advanceTimersByTimeAsync(1100);

      // Should attempt retry (zadd for re-enqueue)
      expect(mockRedis.zadd).toHaveBeenCalled();
      // Should remove from watchlist
      expect(mockRedis.zrem).toHaveBeenCalled();
    });

    it('should remove watchlist entry if command already in terminal state', async () => {
      await queue.start();

      const entryJson = createEntryJson('cmd_done', {
        status: CommandStatus.COMPLETED,
      });
      mockRedis.zrangebyscore.mockResolvedValue(['cmd_done']);
      mockRedis.get.mockResolvedValue(entryJson);

      await vi.advanceTimersByTimeAsync(1100);

      // Should not retry (already terminal)
      expect(mockRedis.zrem).toHaveBeenCalled();
    });

    it('should handle expired entries with missing Redis data', async () => {
      await queue.start();

      mockRedis.zrangebyscore.mockResolvedValue(['cmd_ghost']);
      mockRedis.get.mockResolvedValue(null);

      await vi.advanceTimersByTimeAsync(1100);

      expect(mockRedis.zrem).toHaveBeenCalledWith(
        expect.stringContaining('timeout'),
        'cmd_ghost',
      );
    });
  });

  describe('QueueFullError', () => {
    it('should have correct properties', () => {
      const err = new QueueFullError('machine-01', 20, 20);
      expect(err.name).toBe('QueueFullError');
      expect(err.machineId).toBe('machine-01');
      expect(err.currentDepth).toBe(20);
      expect(err.maxDepth).toBe(20);
      expect(err.message).toContain('machine-01');
    });
  });
});
