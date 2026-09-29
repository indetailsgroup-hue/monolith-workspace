/**
 * MONOLITH Digital Shadow — State Reconciliation Engine
 * Maps WwUnitState transitions to MONOLITH Job States
 * Publishes events to Redis Streams for downstream consumers
 */

import pino from 'pino';
import Redis from 'ioredis';
import { redisConfig, eventBusConfig } from '../config';
import { WwUnitState, MachineEventType } from '../types/machine';
import type { MachineStateSnapshot } from '../types/machine';
import { MonolithJobState } from '../types/job';
import type { StateTransitionRule } from '../types/job';
import { EventStream } from '../types/events';
import type { EventEnvelope } from '../types/events';

// ─── State Transition Rules ──────────────────────────────────────────────────

/**
 * WwUnitState → MonolithJobState mapping matrix
 * Includes context-aware transitions (e.g., has active job?)
 */
const TRANSITION_RULES: StateTransitionRule[] = [
  {
    fromWwState: WwUnitState.READY,
    toWwState: WwUnitState.WORKING,
    condition: 'hasActiveJob',
    resultJobState: MonolithJobState.IN_PROGRESS,
    emitEvent: MachineEventType.JOB_STARTED,
  },
  {
    fromWwState: WwUnitState.WORKING,
    toWwState: WwUnitState.READY,
    condition: 'jobComplete',
    resultJobState: MonolithJobState.COMPLETED,
    emitEvent: MachineEventType.JOB_COMPLETED,
  },
  {
    fromWwState: WwUnitState.WORKING,
    toWwState: WwUnitState.STANDBY,
    condition: undefined,
    resultJobState: MonolithJobState.PAUSED,
    emitEvent: MachineEventType.STATE_CHANGED,
  },
  {
    fromWwState: WwUnitState.WORKING,
    toWwState: WwUnitState.ERROR,
    condition: undefined,
    resultJobState: MonolithJobState.FAILED,
    emitEvent: MachineEventType.JOB_ABORTED,
  },
  {
    fromWwState: WwUnitState.STANDBY,
    toWwState: WwUnitState.WORKING,
    condition: 'hasActiveJob',
    resultJobState: MonolithJobState.IN_PROGRESS,
    emitEvent: MachineEventType.STATE_CHANGED,
  },
  {
    fromWwState: WwUnitState.ERROR,
    toWwState: WwUnitState.READY,
    condition: undefined,
    resultJobState: MonolithJobState.QUEUED,
    emitEvent: MachineEventType.ALARM_CLEARED,
  },
];

export class StateReconciliationEngine {
  private logger = pino({ name: 'state-reconciliation' });
  private redis: Redis;
  private previousStates: Map<string, WwUnitState> = new Map();
  private activeJobs: Map<string, string> = new Map(); // machineId → jobId

  constructor() {
    this.redis = new Redis(redisConfig.url);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.logger.info('Starting State Reconciliation Engine...');

    // Create consumer groups if not exists
    for (const stream of Object.values(EventStream)) {
      try {
        await this.redis.xgroup(
          'CREATE',
          stream,
          eventBusConfig.consumerGroup,
          '0',
          'MKSTREAM',
        );
      } catch {
        // Group already exists — OK
      }
    }

    this.logger.info('State Reconciliation Engine ready');
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping State Reconciliation Engine...');
    await this.redis.quit();
  }

  // ─── State Processing ──────────────────────────────────────────────────────

  /**
   * Process a new machine state snapshot
   * Detects transitions, maps to job states, and publishes events
   */
  async processStateUpdate(snapshot: MachineStateSnapshot): Promise<void> {
    const { machineId, state: newState } = snapshot;
    const previousState = this.previousStates.get(machineId);

    // Store current state
    this.previousStates.set(machineId, newState);

    // Publish state to Redis Stream (always)
    await this.publishEvent(EventStream.MACHINE_STATE, {
      type: 'state_update',
      source: 'state-reconciliation',
      timestamp: snapshot.timestamp,
      data: {
        machineId,
        state: newState,
        mode: snapshot.mode,
        previousState,
        spindleSpeed: snapshot.spindleSpeed,
        feedRate: snapshot.feedRate,
        partCount: snapshot.partCount,
      },
    });

    // Check for state transition
    if (previousState !== undefined && previousState !== newState) {
      await this.handleStateTransition(machineId, previousState, newState, snapshot);
    }

    // Check for alarms
    if (snapshot.activeAlarms.length > 0) {
      for (const alarm of snapshot.activeAlarms) {
        await this.publishEvent(EventStream.MACHINE_ALARM, {
          type: 'alarm',
          source: 'state-reconciliation',
          timestamp: alarm.timestamp,
          data: { machineId, alarm },
        });
      }
    }
  }

  /**
   * Register an active job on a machine (called by CAS Bridge)
   */
  registerJob(machineId: string, jobId: string): void {
    this.activeJobs.set(machineId, jobId);
    this.logger.info({ machineId, jobId }, 'Job registered on machine');
  }

  /**
   * Clear active job from machine
   */
  clearJob(machineId: string): void {
    this.activeJobs.delete(machineId);
    this.logger.info({ machineId }, 'Job cleared from machine');
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async handleStateTransition(
    machineId: string,
    fromState: WwUnitState,
    toState: WwUnitState,
    snapshot: MachineStateSnapshot,
  ): Promise<void> {
    this.logger.info(
      { machineId, from: WwUnitState[fromState], to: WwUnitState[toState] },
      'State transition detected',
    );

    // Find matching transition rule
    const rule = TRANSITION_RULES.find(
      (r) =>
        r.fromWwState === fromState &&
        r.toWwState === toState &&
        this.evaluateCondition(r.condition, machineId),
    );

    if (!rule) {
      this.logger.debug(
        { fromState, toState },
        'No matching transition rule — logging only',
      );
      return;
    }

    const jobId = this.activeJobs.get(machineId);

    // Publish job lifecycle event
    await this.publishEvent(EventStream.JOB_LIFECYCLE, {
      type: rule.emitEvent,
      source: 'state-reconciliation',
      timestamp: snapshot.timestamp,
      correlationId: jobId,
      data: {
        machineId,
        jobId,
        previousState: fromState,
        newState: toState,
        jobState: rule.resultJobState,
        snapshot,
      },
    });

    // Clear job if completed or failed
    if (
      rule.resultJobState === MonolithJobState.COMPLETED ||
      rule.resultJobState === MonolithJobState.FAILED
    ) {
      this.clearJob(machineId);
    }
  }

  private evaluateCondition(
    condition: string | undefined,
    machineId: string,
  ): boolean {
    if (!condition) return true;

    switch (condition) {
      case 'hasActiveJob':
        return this.activeJobs.has(machineId);
      case 'jobComplete':
        return this.activeJobs.has(machineId); // Job exists = can complete
      default:
        return true;
    }
  }

  private async publishEvent(
    stream: EventStream,
    event: Omit<EventEnvelope, 'id' | 'stream'>,
  ): Promise<string | null> {
    const fields: Record<string, string> = {
      type: event.type,
      source: event.source,
      timestamp: event.timestamp.toISOString(),
      data: JSON.stringify(event.data),
    };

    if (event.correlationId) {
      fields['correlationId'] = event.correlationId;
    }

    const id = await this.redis.xadd(
      stream,
      'MAXLEN',
      '~',
      String(eventBusConfig.maxStreamLength),
      '*',
      ...Object.entries(fields).flat(),
    );

    return id;
  }
}
