/**
 * MONOLITH Digital Shadow — Phase 2 Command Dispatcher
 * Main orchestrator for bi-directional machine control
 * 
 * Flow: Request → Validate (SafetyGate) → Queue → Dispatch (OPC UA Write) → Confirm
 * 
 * Architecture:
 * ┌─────────────────┐     ┌──────────────┐     ┌──────────────┐     ┌───────────┐
 * │ Factory Server  │────▶│  Safety Gate  │────▶│ Command Queue│────▶│  Adapter  │
 * │ / Operator API  │     │  (validate)   │     │   (Redis)    │     │(OPC UA wr)│
 * └─────────────────┘     └──────────────┘     └──────────────┘     └───────────┘
 *                                                                          │
 *                                                                          ▼
 *        ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
 *        │  Activity Log    │◀────│ State Reconcile   │◀────│  Machine PLC     │
 *        │  (audit trail)   │     │ (confirm via Δ)   │     │  (state change)  │
 *        └──────────────────┘     └──────────────────┘     └──────────────────┘
 */

import pino from 'pino';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { redisConfig } from '../config';
import {
  CommandType,
  CommandStatus,
  CommandPriority,
} from '../types/command';
import type {
  CommandRequest,
  CommandResponse,
  CommandQueueEntry,
  SafetyGateResult,
  MachineCommandResponse,
  ConfirmationStrategy,
} from '../types/command';
import { WwUnitState } from '../types/machine';
import { EventStream } from '../types/events';
import type { IMachineAdapter } from '../adapters/IMachineAdapter';
import { CommandSafetyGate } from './CommandSafetyGate';
import { CommandQueue, QueueFullError } from './CommandQueue';
import type { StateReconciliationEngine } from './StateReconciliationEngine';

// ─── Confirmation Strategies per Command ─────────────────────────────────────

const CONFIRMATION_STRATEGIES: Record<CommandType, ConfirmationStrategy> = {
  [CommandType.START_JOB]: {
    method: 'state_transition',
    expectedState: WwUnitState.WORKING,
    confirmationTimeoutMs: 10_000,
  },
  [CommandType.PAUSE_JOB]: {
    method: 'state_transition',
    expectedState: WwUnitState.STANDBY,
    confirmationTimeoutMs: 5_000,
  },
  [CommandType.RESUME_JOB]: {
    method: 'state_transition',
    expectedState: WwUnitState.WORKING,
    confirmationTimeoutMs: 5_000,
  },
  [CommandType.ABORT_JOB]: {
    method: 'state_transition',
    expectedState: WwUnitState.READY,
    confirmationTimeoutMs: 15_000,
  },
  [CommandType.EMERGENCY_STOP]: {
    method: 'method_return',
    confirmationTimeoutMs: 2_000,
  },
  [CommandType.LOAD_PROGRAM]: {
    method: 'method_return',
    confirmationTimeoutMs: 30_000,
  },
  [CommandType.SET_MODE]: {
    method: 'state_transition',
    confirmationTimeoutMs: 5_000,
  },
  [CommandType.RESET_ERROR]: {
    method: 'state_transition',
    expectedState: WwUnitState.READY,
    confirmationTimeoutMs: 5_000,
  },
};

export class CommandDispatcher {
  private logger = pino({ name: 'command-dispatcher' });
  private redis: Redis;
  private safetyGate: CommandSafetyGate;
  private commandQueue: CommandQueue;
  private adapters: Map<string, IMachineAdapter> = new Map();
  private stateEngine: StateReconciliationEngine | null = null;
  private dispatchLoop: NodeJS.Timeout | null = null;
  private confirmationWatchers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.redis = new Redis(redisConfig.url);
    this.safetyGate = new CommandSafetyGate();
    this.commandQueue = new CommandQueue();
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async start(
    adapters: Map<string, IMachineAdapter>,
    stateEngine?: StateReconciliationEngine,
  ): Promise<void> {
    this.adapters = adapters;
    this.stateEngine = stateEngine ?? null;

    await this.commandQueue.start();

    // Start dispatch loop (checks every 200ms for new commands)
    this.dispatchLoop = setInterval(() => {
      this.processQueues().catch((err) =>
        this.logger.error({ err }, 'Dispatch loop error'),
      );
    }, 200);

    this.logger.info(
      { machineCount: adapters.size },
      'Command Dispatcher started — Phase 2 active',
    );
  }

  async stop(): Promise<void> {
    if (this.dispatchLoop) {
      clearInterval(this.dispatchLoop);
      this.dispatchLoop = null;
    }

    // Clear all confirmation watchers
    for (const [, timer] of this.confirmationWatchers) {
      clearTimeout(timer);
    }
    this.confirmationWatchers.clear();

    await this.commandQueue.stop();
    await this.redis.quit();
    this.logger.info('Command Dispatcher stopped');
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Submit a command request.
   * Validates through safety gate, then enqueues for execution.
   * Returns immediate response with commandId and status.
   */
  async submitCommand(request: CommandRequest): Promise<CommandResponse> {
    const now = new Date();
    const commandId = `cmd_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    this.logger.info(
      {
        requestId: request.requestId,
        commandId,
        machineId: request.machineId,
        commandType: request.commandType,
        priority: CommandPriority[request.priority],
        initiator: request.initiator.source,
      },
      'Command received',
    );

    // 1. Get adapter
    const adapter = this.adapters.get(request.machineId);
    if (!adapter) {
      return this.buildResponse(commandId, request, CommandStatus.REJECTED, {
        message: `No adapter found for machine: ${request.machineId}`,
        timestamps: { receivedAt: now },
      });
    }

    // 2. Check adapter supports write operations
    if (!this.adapterSupportsCommand(adapter, request.commandType)) {
      return this.buildResponse(commandId, request, CommandStatus.REJECTED, {
        message: `Adapter for ${request.machineId} does not support ${request.commandType}`,
        timestamps: { receivedAt: now },
      });
    }

    // 3. Safety Gate Validation
    const safetyResults = await this.safetyGate.validate(request, adapter);
    const canProceed = this.safetyGate.canProceed(safetyResults);

    if (!canProceed) {
      await this.publishCommandEvent(commandId, request, CommandStatus.REJECTED, safetyResults);
      return this.buildResponse(commandId, request, CommandStatus.REJECTED, {
        message: 'Command rejected by safety gate',
        timestamps: { receivedAt: now, validatedAt: new Date() },
        safetyGateResults: safetyResults,
      });
    }

    // 4. Enqueue (or direct dispatch for CRITICAL priority)
    try {
      if (request.priority === CommandPriority.CRITICAL) {
        // Emergency: bypass queue, dispatch immediately
        return await this.dispatchImmediate(commandId, request, adapter, safetyResults);
      }

      // Normal: enqueue
      const queuedId = await this.commandQueue.enqueue(request);

      await this.publishCommandEvent(queuedId, request, CommandStatus.QUEUED, safetyResults);

      return this.buildResponse(queuedId, request, CommandStatus.QUEUED, {
        message: 'Command validated and queued for execution',
        timestamps: { receivedAt: now, validatedAt: new Date(), queuedAt: new Date() },
        safetyGateResults: safetyResults,
      });
    } catch (err) {
      if (err instanceof QueueFullError) {
        return this.buildResponse(commandId, request, CommandStatus.REJECTED, {
          message: err.message,
          timestamps: { receivedAt: now, validatedAt: new Date() },
          safetyGateResults: safetyResults,
        });
      }
      throw err;
    }
  }

  /**
   * Cancel a pending command (if not yet dispatched)
   */
  async cancelCommand(commandId: string): Promise<boolean> {
    const entry = await this.commandQueue.getEntry(commandId);
    if (!entry) return false;

    if (entry.status === CommandStatus.QUEUED) {
      await this.commandQueue.updateStatus(commandId, CommandStatus.CANCELLED, {
        error: 'Cancelled by operator',
      });
      this.logger.info({ commandId }, 'Command cancelled');
      return true;
    }

    this.logger.warn(
      { commandId, status: entry.status },
      'Cannot cancel command — already dispatched',
    );
    return false;
  }

  /**
   * Get command status
   */
  async getCommandStatus(commandId: string): Promise<CommandResponse | null> {
    const entry = await this.commandQueue.getEntry(commandId);
    if (!entry) return null;

    return this.buildResponse(commandId, entry.request, entry.status, {
      message: entry.error ?? this.statusMessage(entry.status),
      timestamps: entry.timestamps,
      safetyGateResults: entry.safetyGateResults,
      machineResponse: entry.machineResponse,
    });
  }

  // ─── Dispatch Loop ─────────────────────────────────────────────────────────

  private async processQueues(): Promise<void> {
    for (const [machineId] of this.adapters) {
      try {
        const entry = await this.commandQueue.dequeue(machineId);
        if (entry) {
          await this.dispatchCommand(entry);
        }
      } catch (err) {
        this.logger.error({ err, machineId }, 'Error processing queue');
      }
    }
  }

  private async dispatchCommand(entry: CommandQueueEntry): Promise<void> {
    const { commandId, request } = entry;
    const adapter = this.adapters.get(request.machineId)!;

    this.logger.info(
      { commandId, machineId: request.machineId, commandType: request.commandType },
      'Dispatching command to machine',
    );

    try {
      const machineResponse = await this.executeOnAdapter(adapter, request);

      if (machineResponse.accepted) {
        // Update to AWAITING_CONFIRMATION and start confirmation watcher
        await this.commandQueue.updateStatus(commandId, CommandStatus.AWAITING_CONFIRMATION, {
          machineResponse,
        });
        this.startConfirmationWatcher(commandId, request);
      } else {
        // Machine rejected the command
        const retried = await this.commandQueue.retry(commandId);
        if (!retried) {
          await this.commandQueue.updateStatus(commandId, CommandStatus.FAILED, {
            machineResponse,
            error: machineResponse.errorDescription ?? 'Machine rejected command',
          });
        }
      }
    } catch (err) {
      this.logger.error(
        { err, commandId, machineId: request.machineId },
        'Command dispatch failed',
      );

      const retried = await this.commandQueue.retry(commandId);
      if (!retried) {
        await this.commandQueue.updateStatus(commandId, CommandStatus.FAILED, {
          error: `Dispatch error: ${(err as Error).message}`,
        });
      }
    }
  }

  // ─── OPC UA Write Execution ────────────────────────────────────────────────

  private async executeOnAdapter(
    adapter: IMachineAdapter,
    request: CommandRequest,
  ): Promise<MachineCommandResponse> {
    const { commandType, payload } = request;

    try {
      let success = false;

      switch (commandType) {
        case CommandType.START_JOB: {
          const p = payload as import('../types/command').StartJobPayload;
          success = await adapter.startJob!(p.jobId, p.programRef);
          break;
        }
        case CommandType.PAUSE_JOB:
          success = await adapter.pauseJob!();
          break;
        case CommandType.RESUME_JOB:
          success = await adapter.resumeJob!();
          break;
        case CommandType.ABORT_JOB:
          success = await adapter.abortJob!();
          break;
        case CommandType.EMERGENCY_STOP:
          // Emergency stop uses abort with immediate flag
          success = await adapter.abortJob!();
          break;
        default:
          return {
            statusCode: 0x80000000, // Bad_UnexpectedError
            accepted: false,
            errorDescription: `Unsupported command type: ${commandType}`,
          };
      }

      return {
        statusCode: success ? 0 : 0x80000000,
        accepted: success,
        errorDescription: success ? undefined : 'Adapter returned false',
      };
    } catch (err) {
      return {
        statusCode: 0x80000000,
        accepted: false,
        errorDescription: (err as Error).message,
      };
    }
  }

  // ─── Confirmation Watcher ──────────────────────────────────────────────────

  /**
   * After successful dispatch, watch for state transition that confirms execution.
   * Uses a poll-based approach: periodically reads machine state until:
   * - Expected state is reached (CONFIRMED → COMPLETED)
   * - Timeout expires (TIMED_OUT)
   */
  private startConfirmationWatcher(commandId: string, request: CommandRequest): void {
    const strategy = CONFIRMATION_STRATEGIES[request.commandType];
    if (!strategy) return;

    if (strategy.method === 'method_return') {
      // Method return was already captured — mark as completed
      this.commandQueue.updateStatus(commandId, CommandStatus.COMPLETED).catch((err) =>
        this.logger.error({ err, commandId }, 'Failed to mark completed'),
      );
      return;
    }

    // State transition confirmation
    const startTime = Date.now();
    const pollInterval = strategy.pollIntervalMs ?? 500;

    const timer = setInterval(async () => {
      try {
        const adapter = this.adapters.get(request.machineId);
        if (!adapter) {
          clearInterval(timer);
          this.confirmationWatchers.delete(commandId);
          return;
        }

        const currentState = await adapter.readUnitState();

        if (strategy.expectedState !== undefined && currentState === strategy.expectedState) {
          // Confirmed!
          clearInterval(timer);
          this.confirmationWatchers.delete(commandId);

          await this.commandQueue.updateStatus(commandId, CommandStatus.COMPLETED, {
            machineResponse: {
              statusCode: 0,
              accepted: true,
              outputArgs: { confirmedState: WwUnitState[currentState] },
            },
          });

          // Register job if START_JOB
          if (
            request.commandType === CommandType.START_JOB &&
            this.stateEngine
          ) {
            const payload = request.payload as import('../types/command').StartJobPayload;
            this.stateEngine.registerJob(request.machineId, payload.jobId);
          }

          this.logger.info(
            { commandId, machineId: request.machineId, confirmedState: WwUnitState[currentState] },
            'Command execution CONFIRMED by state transition',
          );
          return;
        }

        // Check timeout
        if (Date.now() - startTime > strategy.confirmationTimeoutMs) {
          clearInterval(timer);
          this.confirmationWatchers.delete(commandId);

          this.logger.warn(
            {
              commandId,
              expectedState: strategy.expectedState !== undefined
                ? WwUnitState[strategy.expectedState]
                : 'N/A',
              actualState: WwUnitState[currentState],
            },
            'Confirmation timed out',
          );

          await this.commandQueue.retry(commandId);
        }
      } catch (err) {
        this.logger.error({ err, commandId }, 'Confirmation watcher error');
      }
    }, pollInterval);

    this.confirmationWatchers.set(commandId, timer);
  }

  // ─── Immediate Dispatch (Emergency) ────────────────────────────────────────

  private async dispatchImmediate(
    commandId: string,
    request: CommandRequest,
    adapter: IMachineAdapter,
    safetyResults: SafetyGateResult[],
  ): Promise<CommandResponse> {
    const now = new Date();

    this.logger.warn(
      { commandId, machineId: request.machineId, commandType: request.commandType },
      'IMMEDIATE dispatch (CRITICAL priority)',
    );

    const machineResponse = await this.executeOnAdapter(adapter, request);

    const status = machineResponse.accepted
      ? CommandStatus.COMPLETED
      : CommandStatus.FAILED;

    await this.publishCommandEvent(commandId, request, status, safetyResults);

    return this.buildResponse(commandId, request, status, {
      message: machineResponse.accepted
        ? 'Emergency command executed immediately'
        : `Emergency command failed: ${machineResponse.errorDescription}`,
      timestamps: {
        receivedAt: now,
        validatedAt: now,
        dispatchedAt: now,
        completedAt: machineResponse.accepted ? now : undefined,
        failedAt: machineResponse.accepted ? undefined : now,
      },
      safetyGateResults: safetyResults,
      machineResponse,
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private adapterSupportsCommand(
    adapter: IMachineAdapter,
    commandType: CommandType,
  ): boolean {
    switch (commandType) {
      case CommandType.START_JOB:
        return typeof adapter.startJob === 'function';
      case CommandType.PAUSE_JOB:
        return typeof adapter.pauseJob === 'function';
      case CommandType.RESUME_JOB:
        return typeof adapter.resumeJob === 'function';
      case CommandType.ABORT_JOB:
      case CommandType.EMERGENCY_STOP:
        return typeof adapter.abortJob === 'function';
      default:
        return false;
    }
  }

  private buildResponse(
    commandId: string,
    request: CommandRequest,
    status: CommandStatus,
    details: {
      message: string;
      timestamps: Partial<import('../types/command').CommandTimestamps>;
      safetyGateResults?: SafetyGateResult[];
      machineResponse?: MachineCommandResponse;
    },
  ): CommandResponse {
    return {
      requestId: request.requestId,
      commandId,
      machineId: request.machineId,
      commandType: request.commandType,
      status,
      message: details.message,
      timestamps: details.timestamps as import('../types/command').CommandTimestamps,
      safetyGateResults: details.safetyGateResults,
      machineResponse: details.machineResponse,
    };
  }

  private statusMessage(status: CommandStatus): string {
    const messages: Record<CommandStatus, string> = {
      [CommandStatus.PENDING]: 'Command pending validation',
      [CommandStatus.VALIDATING]: 'Safety gate checks in progress',
      [CommandStatus.QUEUED]: 'Command queued for execution',
      [CommandStatus.DISPATCHING]: 'Command being sent to machine',
      [CommandStatus.AWAITING_CONFIRMATION]: 'Waiting for machine confirmation',
      [CommandStatus.CONFIRMED]: 'Machine confirmed execution',
      [CommandStatus.COMPLETED]: 'Command completed successfully',
      [CommandStatus.REJECTED]: 'Command rejected by safety gate',
      [CommandStatus.TIMED_OUT]: 'Command execution timed out',
      [CommandStatus.FAILED]: 'Command execution failed',
      [CommandStatus.CANCELLED]: 'Command cancelled',
    };
    return messages[status] ?? 'Unknown status';
  }

  private async publishCommandEvent(
    commandId: string,
    request: CommandRequest,
    status: CommandStatus,
    safetyResults: SafetyGateResult[],
  ): Promise<void> {
    const fields: Record<string, string> = {
      type: 'command_lifecycle',
      source: 'command-dispatcher',
      timestamp: new Date().toISOString(),
      data: JSON.stringify({
        commandId,
        requestId: request.requestId,
        machineId: request.machineId,
        commandType: request.commandType,
        status,
        initiator: request.initiator,
        safetyPassed: this.safetyGate.canProceed(safetyResults),
      }),
    };

    await this.redis.xadd(
      EventStream.JOB_LIFECYCLE,
      'MAXLEN',
      '~',
      '100000',
      '*',
      ...Object.entries(fields).flat(),
    );
  }
}
