/**
 * MONOLITH Digital Shadow Service — Machine Types
 * Based on OPC-40550-1 (OPC UA for Woodworking) v1.02.0
 * Namespace: http://opcfoundation.org/UA/Woodworking/
 */

// ─── OPC UA Woodworking Enumerations ─────────────────────────────────────────

/** WwUnitStateEnumeration — OPC-40550-1 Section 8.2 */
export enum WwUnitState {
  OFFLINE = 0,
  STANDBY = 1,
  READY = 2,
  WORKING = 3,
  ERROR = 4,
}

/** WwUnitModeEnumeration — OPC-40550-1 Section 8.3 */
export enum WwUnitMode {
  OTHER = 0,
  AUTOMATIC = 1,
  SEMIAUTOMATIC = 2,
  MANUAL = 3,
  SETUP = 4,
  SLEEP = 5,
}

/** Machine vendor types supported by MONOLITH */
export enum MachineVendor {
  BIESSE = 'BIESSE',
  HOMAG = 'HOMAG',
  KDT = 'KDT',
  SCM = 'SCM',
  GENERIC = 'GENERIC',
}

/** Communication protocol used by each adapter */
export enum AdapterProtocol {
  OPCUA_NATIVE = 'OPCUA_NATIVE',       // Biesse — native OPC UA Woodworking
  OPCUA_PLUS_CLOUD = 'OPCUA_PLUS_CLOUD', // Homag — OPC UA + Connect cloud API
  MODBUS_TCP = 'MODBUS_TCP',            // KDT — Modbus TCP fallback
  MQTT_DIRECT = 'MQTT_DIRECT',          // Generic MQTT devices
}

// ─── Machine Configuration ───────────────────────────────────────────────────

export interface MachineEndpoint {
  machineId: string;
  displayName: string;
  vendor: MachineVendor;
  protocol: AdapterProtocol;
  /** OPC UA endpoint URL (for OPCUA_NATIVE / OPCUA_PLUS_CLOUD) */
  opcuaEndpoint?: string;
  /** Modbus TCP host (for MODBUS_TCP) */
  modbusHost?: string;
  /** Modbus TCP port (for MODBUS_TCP) */
  modbusPort?: number;
  /** HOMAG Connect cloud API config */
  homagConnect?: {
    apiUrl: string;
    apiKey: string;
    machineSerial: string;
  };
  /** Polling interval in milliseconds */
  pollingIntervalMs: number;
  /** Subscription publish interval (OPC UA) in ms */
  publishIntervalMs: number;
  /** Node IDs to monitor (OPC UA) */
  monitoredNodes?: string[];
  /** Modbus register map */
  modbusRegisters?: ModbusRegisterMap;
}

export interface ModbusRegisterMap {
  state: { address: number; length: number };
  spindleSpeed: { address: number; length: number };
  feedRate: { address: number; length: number };
  toolId: { address: number; length: number };
  errorCode: { address: number; length: number };
  partCount: { address: number; length: number };
}

// ─── Machine State Snapshot ──────────────────────────────────────────────────

export interface MachineStateSnapshot {
  machineId: string;
  timestamp: Date;
  state: WwUnitState;
  mode: WwUnitMode;
  /** Current job ID from MONOLITH Job Queue */
  currentJobId?: string;
  /** Current program/G-code file name */
  currentProgram?: string;
  /** Spindle speed (RPM) */
  spindleSpeed: number;
  /** Feed rate (mm/min) */
  feedRate: number;
  /** Active tool ID */
  toolId: string;
  /** Part counter (cumulative) */
  partCount: number;
  /** Machine runtime since last reset (seconds) */
  runtimeSeconds: number;
  /** Error/alarm information */
  activeAlarms: MachineAlarm[];
  /** OPC UA specific: server status */
  opcuaServerStatus?: string;
}

export interface MachineAlarm {
  alarmId: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

// ─── Machine Event ───────────────────────────────────────────────────────────

export interface MachineEvent {
  eventId: string;
  machineId: string;
  timestamp: Date;
  eventType: MachineEventType;
  previousState?: WwUnitState;
  newState?: WwUnitState;
  payload: Record<string, unknown>;
}

export enum MachineEventType {
  STATE_CHANGED = 'STATE_CHANGED',
  MODE_CHANGED = 'MODE_CHANGED',
  ALARM_RAISED = 'ALARM_RAISED',
  ALARM_CLEARED = 'ALARM_CLEARED',
  JOB_STARTED = 'JOB_STARTED',
  JOB_COMPLETED = 'JOB_COMPLETED',
  JOB_ABORTED = 'JOB_ABORTED',
  TOOL_CHANGED = 'TOOL_CHANGED',
  PROGRAM_LOADED = 'PROGRAM_LOADED',
  MAINTENANCE_DUE = 'MAINTENANCE_DUE',
  CONNECTION_LOST = 'CONNECTION_LOST',
  CONNECTION_RESTORED = 'CONNECTION_RESTORED',
}
