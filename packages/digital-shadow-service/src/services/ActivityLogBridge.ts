/**
 * MONOLITH Digital Shadow — Activity Log Bridge
 * Sends machine events to MONOLITH Factory Server Activity Log
 * Maintains audit trail of all machine-related activities
 */

import pino from 'pino';
import { factoryServerConfig } from '../config';
import type { MachineEvent } from '../types/machine';
import { MachineEventType } from '../types/machine';
import type { MachineStateSnapshot } from '../types/machine';
import type { ActivityLogEntry } from '../types/job';

export class ActivityLogBridge {
  private logger = pino({ name: 'activity-log-bridge' });
  private baseUrl: string;
  private apiKey: string;
  private buffer: ActivityLogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL_MS = 5000;
  private readonly MAX_BUFFER_SIZE = 50;

  constructor() {
    this.baseUrl = factoryServerConfig.url ?? 'http://localhost:3000';
    this.apiKey = factoryServerConfig.apiKey ?? '';
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL_MS);
    this.logger.info('Activity Log Bridge started');
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
    this.logger.info('Activity Log Bridge stopped');
  }

  // ─── Log Machine Event ─────────────────────────────────────────────────────

  logMachineEvent(event: MachineEvent, casHash?: string): void {
    const entry: ActivityLogEntry = {
      id: event.eventId,
      timestamp: event.timestamp,
      actorType: 'MACHINE',
      actorId: event.machineId,
      action: this.mapEventToAction(event.eventType),
      resourceType: 'machine',
      resourceId: event.machineId,
      metadata: {
        eventType: event.eventType,
        previousState: event.previousState,
        newState: event.newState,
        ...event.payload,
      },
      casHash,
    };

    this.buffer.push(entry);

    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  // ─── Log State Snapshot ────────────────────────────────────────────────────

  logStateSnapshot(snapshot: MachineStateSnapshot, casHash: string): void {
    const entry: ActivityLogEntry = {
      id: `snap-${snapshot.machineId}-${snapshot.timestamp.getTime()}`,
      timestamp: snapshot.timestamp,
      actorType: 'MACHINE',
      actorId: snapshot.machineId,
      action: 'state_recorded',
      resourceType: 'state_snapshot',
      resourceId: snapshot.machineId,
      metadata: {
        state: snapshot.state,
        mode: snapshot.mode,
        partCount: snapshot.partCount,
        spindleSpeed: snapshot.spindleSpeed,
        feedRate: snapshot.feedRate,
      },
      casHash,
    };

    this.buffer.push(entry);
  }

  // ─── Log System Event ──────────────────────────────────────────────────────

  logSystemEvent(action: string, details: Record<string, unknown>): void {
    const entry: ActivityLogEntry = {
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date(),
      actorType: 'SYSTEM',
      actorId: 'digital-shadow-service',
      action,
      resourceType: 'system',
      resourceId: 'digital-shadow',
      metadata: details,
    };

    this.buffer.push(entry);
  }

  // ─── Flush Buffer ──────────────────────────────────────────────────────────

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      const response = await fetch(`${this.baseUrl}/api/activity-log/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({ entries }),
      });

      if (!response.ok) {
        this.logger.warn(
          { status: response.status, count: entries.length },
          'Failed to flush activity log — re-buffering',
        );
        // Re-add to buffer (at front) for retry
        this.buffer.unshift(...entries);
      } else {
        this.logger.debug({ count: entries.length }, 'Activity log flushed');
      }
    } catch (err) {
      this.logger.error({ err, count: entries.length }, 'Activity log flush error');
      // Re-buffer on network error
      this.buffer.unshift(...entries);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private mapEventToAction(eventType: MachineEventType): string {
    const actionMap: Record<MachineEventType, string> = {
      [MachineEventType.STATE_CHANGED]: 'machine_state_changed',
      [MachineEventType.MODE_CHANGED]: 'machine_mode_changed',
      [MachineEventType.ALARM_RAISED]: 'machine_alarm_raised',
      [MachineEventType.ALARM_CLEARED]: 'machine_alarm_cleared',
      [MachineEventType.JOB_STARTED]: 'job_started_on_machine',
      [MachineEventType.JOB_COMPLETED]: 'job_completed_on_machine',
      [MachineEventType.JOB_ABORTED]: 'job_aborted_on_machine',
      [MachineEventType.TOOL_CHANGED]: 'machine_tool_changed',
      [MachineEventType.PROGRAM_LOADED]: 'program_loaded_on_machine',
      [MachineEventType.MAINTENANCE_DUE]: 'machine_maintenance_due',
      [MachineEventType.CONNECTION_LOST]: 'machine_connection_lost',
      [MachineEventType.CONNECTION_RESTORED]: 'machine_connection_restored',
    };
    return actionMap[eventType] ?? 'unknown_event';
  }
}
