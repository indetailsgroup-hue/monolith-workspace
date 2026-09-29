/**
 * MONOLITH Digital Shadow — IMachineAdapter Interface
 * Abstract contract for all machine communication adapters
 * Based on OPC-40550-1 WwMachineType abstraction
 */

import type {
  MachineEndpoint,
  MachineStateSnapshot,
  MachineEvent,
  WwUnitState,
  WwUnitMode,
} from '../types/machine';
import type { SensorDataPoint } from '../types/sensor';

// ─── Adapter Lifecycle ───────────────────────────────────────────────────────

export interface IMachineAdapter {
  /** Unique adapter instance ID */
  readonly adapterId: string;

  /** Machine endpoint configuration */
  readonly endpoint: MachineEndpoint;

  /** Current connection status */
  readonly isConnected: boolean;

  /** Initialize and connect to machine */
  connect(): Promise<void>;

  /** Gracefully disconnect */
  disconnect(): Promise<void>;

  /** Check if connection is alive */
  ping(): Promise<boolean>;

  // ─── State Reading ───────────────────────────────────────────────────────

  /** Get current machine state snapshot */
  readState(): Promise<MachineStateSnapshot>;

  /** Get current WwUnitState */
  readUnitState(): Promise<WwUnitState>;

  /** Get current WwUnitMode */
  readUnitMode(): Promise<WwUnitMode>;

  // ─── Telemetry ─────────────────────────────────────────────────────────────

  /** Read all available sensor data points */
  readTelemetry(): Promise<SensorDataPoint[]>;

  // ─── Subscription (OPC UA style) ──────────────────────────────────────────

  /** Subscribe to state change notifications */
  onStateChange(callback: StateChangeCallback): void;

  /** Subscribe to alarm/event notifications */
  onAlarm(callback: AlarmCallback): void;

  /** Subscribe to telemetry data stream */
  onTelemetry(callback: TelemetryCallback): void;

  // ─── Job Control (Phase 2 — bi-directional) ────────────────────────────────

  /** Start a job on the machine (write command) */
  startJob?(jobId: string, programRef: string): Promise<boolean>;

  /** Pause current job */
  pauseJob?(): Promise<boolean>;

  /** Resume paused job */
  resumeJob?(): Promise<boolean>;

  /** Abort current job */
  abortJob?(): Promise<boolean>;
}

// ─── Callback Types ──────────────────────────────────────────────────────────

export type StateChangeCallback = (
  machineId: string,
  previousState: WwUnitState,
  newState: WwUnitState,
  timestamp: Date,
) => void;

export type AlarmCallback = (event: MachineEvent) => void;

export type TelemetryCallback = (points: SensorDataPoint[]) => void;
