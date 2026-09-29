/**
 * MONOLITH Digital Shadow — BaseMachineAdapter
 * Abstract base class with shared logic for all adapters
 */

import { EventEmitter } from 'node:events';
import pino from 'pino';
import type {
  IMachineAdapter,
  StateChangeCallback,
  AlarmCallback,
  TelemetryCallback,
} from './IMachineAdapter';
import type {
  MachineEndpoint,
  MachineStateSnapshot,
  MachineEvent,
  WwUnitState,
  WwUnitMode,
  MachineAlarm,
} from '../types/machine';
import { MachineEventType } from '../types/machine';
import type { SensorDataPoint } from '../types/sensor';

export abstract class BaseMachineAdapter extends EventEmitter implements IMachineAdapter {
  readonly adapterId: string;
  readonly endpoint: MachineEndpoint;
  protected logger: pino.Logger;
  protected _isConnected = false;
  protected _lastState: WwUnitState | null = null;
  protected _reconnectAttempts = 0;
  protected _maxReconnectAttempts = 10;
  protected _reconnectDelayMs = 5000;
  private _reconnectTimer: NodeJS.Timeout | null = null;

  constructor(endpoint: MachineEndpoint) {
    super();
    this.endpoint = endpoint;
    this.adapterId = `adapter-${endpoint.vendor.toLowerCase()}-${endpoint.machineId}`;
    this.logger = pino({ name: this.adapterId });
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  // ─── Abstract Methods (must be implemented by vendor adapters) ──────────────

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract ping(): Promise<boolean>;
  abstract readState(): Promise<MachineStateSnapshot>;
  abstract readUnitState(): Promise<WwUnitState>;
  abstract readUnitMode(): Promise<WwUnitMode>;
  abstract readTelemetry(): Promise<SensorDataPoint[]>;

  // ─── Event Subscription (shared implementation) ────────────────────────────

  onStateChange(callback: StateChangeCallback): void {
    this.on('stateChange', callback);
  }

  onAlarm(callback: AlarmCallback): void {
    this.on('alarm', callback);
  }

  onTelemetry(callback: TelemetryCallback): void {
    this.on('telemetry', callback);
  }

  // ─── Protected Helpers ─────────────────────────────────────────────────────

  protected emitStateChange(previousState: WwUnitState, newState: WwUnitState): void {
    if (previousState === newState) return;

    this._lastState = newState;
    this.logger.info({ previousState, newState }, 'Machine state changed');

    this.emit('stateChange', this.endpoint.machineId, previousState, newState, new Date());

    const event: MachineEvent = {
      eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      machineId: this.endpoint.machineId,
      timestamp: new Date(),
      eventType: MachineEventType.STATE_CHANGED,
      previousState,
      newState,
      payload: { adapterId: this.adapterId },
    };
    this.emit('machineEvent', event);
  }

  protected emitAlarm(alarm: MachineAlarm): void {
    this.logger.warn({ alarm }, 'Machine alarm raised');

    const event: MachineEvent = {
      eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      machineId: this.endpoint.machineId,
      timestamp: new Date(),
      eventType: MachineEventType.ALARM_RAISED,
      payload: { ...alarm, timestamp: alarm.timestamp.toISOString() } as unknown as Record<string, unknown>,
    };
    this.emit('alarm', event);
  }

  protected emitTelemetry(points: SensorDataPoint[]): void {
    this.emit('telemetry', points);
  }

  // ─── Reconnection Logic ────────────────────────────────────────────────────

  protected async handleDisconnection(): Promise<void> {
    this._isConnected = false;
    this.logger.warn('Connection lost, attempting reconnection...');

    this.emit(
      'stateChange',
      this.endpoint.machineId,
      this._lastState,
      null,
      new Date(),
    );

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached. Giving up.');
      const event: MachineEvent = {
        eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        machineId: this.endpoint.machineId,
        timestamp: new Date(),
        eventType: MachineEventType.CONNECTION_LOST,
        payload: { attempts: this._reconnectAttempts },
      };
      this.emit('alarm', event);
      return;
    }

    const delay = this._reconnectDelayMs * Math.pow(2, this._reconnectAttempts);
    this._reconnectAttempts++;

    this.logger.info(
      { attempt: this._reconnectAttempts, delayMs: delay },
      'Scheduling reconnection attempt',
    );

    this._reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        this._reconnectAttempts = 0;
        this.logger.info('Reconnection successful');

        const event: MachineEvent = {
          eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          machineId: this.endpoint.machineId,
          timestamp: new Date(),
          eventType: MachineEventType.CONNECTION_RESTORED,
          payload: {},
        };
        this.emit('machineEvent', event);
      } catch (err) {
        this.logger.error({ err }, 'Reconnection attempt failed');
        this.scheduleReconnect();
      }
    }, delay);
  }

  protected cleanup(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this.removeAllListeners();
  }
}
