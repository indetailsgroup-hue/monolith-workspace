/**
 * MONOLITH Digital Shadow — Phase 2 Command Queue
 * Redis-backed priority queue with retry logic, TTL, and per-machine FIFO ordering
 * 
 * Design:
 * - Each machine has its own sorted set (priority queue)
 * - Commands are serialized to Redis hashes for state tracking
 * - A separate retry scheduler handles timed-out and failed commands
 * - Emergency commands bypass the queue entirely
 */

import pino from 'pino';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { redisConfig } from '../config';
import {
  CommandStatus,
  CommandPriority,
  CommandType,
} from '../types/command';
import type {
  CommandRequest,
  CommandQueueEntry,
  CommandLayerConfig,
} from '../types/command';

// ─── Default Configuration ───────────────────────────────────────────────────

const DEFAULT_CONFIG: CommandLayerConfig = {
  defaultTimeoutMs: 30_000,
  maxQueueDepthPerMachine: 20,
  maxRetries: 3,
  retryBackoffBaseMs: 2000,
  confirmationPollMs: 500,
  emergencyBypassesSafety: true,
  dualConfirmCommands: [CommandType.EMERGENCY_STOP],
};

// ─── Redis Key Patterns ──────────────────────────────────────────────────────

const KEYS = {
  /** Sorted set: per-machine priority queue */
  machineQueue: (machineId: string) => `ds:cmd:queue:${machineId}`,
  /** Hash: command entry full state */
  commandEntry: (commandId: string) => `ds:cmd:entry:${commandId}`,
  /** Set: all active command IDs (for monitoring) */
  activeCommands: 'ds:cmd:active',
  /** String: currently executing command per machine */
  machineCurrentCmd: (machineId: string) => `ds:cmd:current:${machineId}`,
  /** Sorted set: timeout watchlist (score = expiry timestamp) */
  timeoutWatchlist: 'ds:cmd:timeouts',
} as const;

export class CommandQueue {
  private logger = pino({ name: 'command-queue' });
  private redis: Redis;
  private config: CommandLayerConfig;
  private timeoutChecker: NodeJS.Timeout | null = null;

  constructor(config: Partial<CommandLayerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.redis = new Redis(redisConfig.url);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.logger.info('Starting Command Queue...');

    // Start timeout checker (runs every second)
    this.timeoutChecker = setInterval(() => {
      this.checkTimeouts().catch((err) =>
        this.logger.error({ err }, 'Timeout checker error'),
      );
    }, 1000);

    this.logger.info(
      { maxRetries: this.config.maxRetries, defaultTimeoutMs: this.config.defaultTimeoutMs },
      'Command Queue ready',
    );
  }

  async stop(): Promise<void> {
    if (this.timeoutChecker) {
      clearInterval(this.timeoutChecker);
      this.timeoutChecker = null;
    }
    await this.redis.quit();
    this.logger.info('Command Queue stopped');
  }

  // ─── Enqueue ───────────────────────────────────────────────────────────────

  /**
   * Enqueue a validated command for execution.
   * Returns the generated commandId.
   */
  async enqueue(request: CommandRequest): Promise<string> {
    const commandId = `cmd_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date();

    // Check queue depth limit
    const depth = await this.redis.zcard(KEYS.machineQueue(request.machineId));
    if (depth >= this.config.maxQueueDepthPerMachine) {
      throw new QueueFullError(
        request.machineId,
        depth,
        this.config.maxQueueDepthPerMachine,
      );
    }

    const entry: CommandQueueEntry = {
      commandId,
      request,
      status: CommandStatus.QUEUED,
      priority: request.priority,
      timestamps: {
        receivedAt: now,
        queuedAt: now,
      },
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      safetyGateResults: [],
    };

    // Atomic: store entry + add to sorted set + add to active set
    const pipeline = this.redis.pipeline();

    // Store full entry as JSON hash field
    pipeline.set(
      KEYS.commandEntry(commandId),
      JSON.stringify(entry),
      'EX',
      3600, // TTL 1 hour
    );

    // Add to machine's priority queue (lower score = higher priority)
    // Score = priority * 1e13 + timestamp (ensures FIFO within same priority)
    const score = request.priority * 1e13 + now.getTime();
    pipeline.zadd(KEYS.machineQueue(request.machineId), score, commandId);

    // Track in active set
    pipeline.sadd(KEYS.activeCommands, commandId);

    // Add to timeout watchlist
    const expiresAt = now.getTime() + (request.timeoutMs || this.config.defaultTimeoutMs);
    pipeline.zadd(KEYS.timeoutWatchlist, expiresAt, commandId);

    await pipeline.exec();

    this.logger.info(
      {
        commandId,
        machineId: request.machineId,
        commandType: request.commandType,
        priority: CommandPriority[request.priority],
        queueDepth: depth + 1,
      },
      'Command enqueued',
    );

    return commandId;
  }

  // ─── Dequeue ───────────────────────────────────────────────────────────────

  /**
   * Dequeue the highest-priority command for a machine.
   * Returns null if no commands pending or machine is busy.
   */
  async dequeue(machineId: string): Promise<CommandQueueEntry | null> {
    // Check if machine already has an executing command
    const currentCmd = await this.redis.get(KEYS.machineCurrentCmd(machineId));
    if (currentCmd) {
      return null; // Machine is busy
    }

    // Pop highest priority (lowest score)
    const results = await this.redis.zpopmin(KEYS.machineQueue(machineId), 1);
    if (!results || results.length === 0) {
      return null;
    }

    const commandId = results[0] as string;
    const entryJson = await this.redis.get(KEYS.commandEntry(commandId));
    if (!entryJson) {
      this.logger.warn({ commandId }, 'Command entry not found in Redis — expired?');
      return null;
    }

    const entry: CommandQueueEntry = JSON.parse(entryJson);

    // Mark machine as busy
    await this.redis.set(
      KEYS.machineCurrentCmd(machineId),
      commandId,
      'EX',
      Math.ceil((entry.request.timeoutMs || this.config.defaultTimeoutMs) / 1000) + 10,
    );

    // Update status to DISPATCHING
    entry.status = CommandStatus.DISPATCHING;
    entry.timestamps.dispatchedAt = new Date();
    await this.updateEntry(entry);

    this.logger.info(
      { commandId, machineId, commandType: entry.request.commandType },
      'Command dequeued for dispatch',
    );

    return entry;
  }

  // ─── Status Updates ────────────────────────────────────────────────────────

  /**
   * Update command status after dispatch/confirmation/failure
   */
  async updateStatus(
    commandId: string,
    status: CommandStatus,
    details?: Partial<Pick<CommandQueueEntry, 'machineResponse' | 'error'>>,
  ): Promise<CommandQueueEntry | null> {
    const entryJson = await this.redis.get(KEYS.commandEntry(commandId));
    if (!entryJson) return null;

    const entry: CommandQueueEntry = JSON.parse(entryJson);
    entry.status = status;

    // Update timestamps based on status
    const now = new Date();
    switch (status) {
      case CommandStatus.AWAITING_CONFIRMATION:
        break;
      case CommandStatus.CONFIRMED:
        entry.timestamps.confirmedAt = now;
        break;
      case CommandStatus.COMPLETED:
        entry.timestamps.completedAt = now;
        break;
      case CommandStatus.FAILED:
      case CommandStatus.TIMED_OUT:
        entry.timestamps.failedAt = now;
        break;
    }

    if (details?.machineResponse) entry.machineResponse = details.machineResponse;
    if (details?.error) entry.error = details.error;

    await this.updateEntry(entry);

    // If terminal state, clean up
    if (this.isTerminalStatus(status)) {
      await this.cleanupCommand(commandId, entry.request.machineId);
    }

    return entry;
  }

  /**
   * Retry a failed command (increment retry count, re-enqueue)
   */
  async retry(commandId: string): Promise<boolean> {
    const entryJson = await this.redis.get(KEYS.commandEntry(commandId));
    if (!entryJson) return false;

    const entry: CommandQueueEntry = JSON.parse(entryJson);

    if (entry.retryCount >= entry.maxRetries) {
      this.logger.warn(
        { commandId, retryCount: entry.retryCount },
        'Max retries exceeded — marking as FAILED',
      );
      await this.updateStatus(commandId, CommandStatus.FAILED, {
        error: `Exceeded max retries (${entry.maxRetries})`,
      });
      return false;
    }

    entry.retryCount += 1;
    entry.status = CommandStatus.QUEUED;
    entry.timestamps.dispatchedAt = undefined as unknown as Date;
    await this.updateEntry(entry);

    // Re-enqueue with same priority (slight delay via backoff)
    const backoffMs =
      this.config.retryBackoffBaseMs * Math.pow(2, entry.retryCount - 1);
    const score =
      entry.request.priority * 1e13 + Date.now() + backoffMs;

    await this.redis.zadd(
      KEYS.machineQueue(entry.request.machineId),
      score,
      commandId,
    );

    // Release machine lock
    await this.redis.del(KEYS.machineCurrentCmd(entry.request.machineId));

    this.logger.info(
      { commandId, retryCount: entry.retryCount, backoffMs },
      'Command re-enqueued for retry',
    );

    return true;
  }

  // ─── Query ─────────────────────────────────────────────────────────────────

  /** Get command entry by ID */
  async getEntry(commandId: string): Promise<CommandQueueEntry | null> {
    const json = await this.redis.get(KEYS.commandEntry(commandId));
    return json ? JSON.parse(json) : null;
  }

  /** Get queue depth for a machine */
  async getQueueDepth(machineId: string): Promise<number> {
    return this.redis.zcard(KEYS.machineQueue(machineId));
  }

  /** Get all pending commands for a machine (ordered by priority) */
  async getPendingCommands(machineId: string): Promise<CommandQueueEntry[]> {
    const ids = await this.redis.zrange(KEYS.machineQueue(machineId), 0, -1);
    const entries: CommandQueueEntry[] = [];

    for (const id of ids) {
      const json = await this.redis.get(KEYS.commandEntry(id));
      if (json) entries.push(JSON.parse(json));
    }

    return entries;
  }

  /** Get currently executing command for a machine */
  async getCurrentCommand(machineId: string): Promise<CommandQueueEntry | null> {
    const commandId = await this.redis.get(KEYS.machineCurrentCmd(machineId));
    if (!commandId) return null;
    return this.getEntry(commandId);
  }

  // ─── Timeout Management ────────────────────────────────────────────────────

  private async checkTimeouts(): Promise<void> {
    const now = Date.now();

    // Get all commands that have expired
    const expired = await this.redis.zrangebyscore(
      KEYS.timeoutWatchlist,
      0,
      now,
    );

    for (const commandId of expired) {
      const entry = await this.getEntry(commandId);
      if (!entry) {
        await this.redis.zrem(KEYS.timeoutWatchlist, commandId);
        continue;
      }

      // Only timeout non-terminal commands
      if (!this.isTerminalStatus(entry.status)) {
        this.logger.warn(
          { commandId, machineId: entry.request.machineId, status: entry.status },
          'Command TIMED OUT',
        );

        // Attempt retry first
        const retried = await this.retry(commandId);
        if (!retried) {
          await this.updateStatus(commandId, CommandStatus.TIMED_OUT, {
            error: 'Command execution timed out',
          });
        }
      }

      // Remove from watchlist regardless
      await this.redis.zrem(KEYS.timeoutWatchlist, commandId);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async updateEntry(entry: CommandQueueEntry): Promise<void> {
    await this.redis.set(
      KEYS.commandEntry(entry.commandId),
      JSON.stringify(entry),
      'EX',
      3600,
    );
  }

  private async cleanupCommand(
    commandId: string,
    machineId: string,
  ): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.srem(KEYS.activeCommands, commandId);
    pipeline.zrem(KEYS.timeoutWatchlist, commandId);
    pipeline.zrem(KEYS.machineQueue(machineId), commandId);

    // Release machine lock if this was the executing command
    const currentCmd = await this.redis.get(KEYS.machineCurrentCmd(machineId));
    if (currentCmd === commandId) {
      pipeline.del(KEYS.machineCurrentCmd(machineId));
    }

    await pipeline.exec();
  }

  private isTerminalStatus(status: CommandStatus): boolean {
    return [
      CommandStatus.COMPLETED,
      CommandStatus.REJECTED,
      CommandStatus.TIMED_OUT,
      CommandStatus.FAILED,
      CommandStatus.CANCELLED,
    ].includes(status);
  }
}

// ─── Custom Errors ───────────────────────────────────────────────────────────

export class QueueFullError extends Error {
  constructor(
    public machineId: string,
    public currentDepth: number,
    public maxDepth: number,
  ) {
    super(
      `Command queue full for machine ${machineId}: ${currentDepth}/${maxDepth}`,
    );
    this.name = 'QueueFullError';
  }
}
