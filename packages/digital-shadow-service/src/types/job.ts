/**
 * MONOLITH Digital Shadow Service — Job & Integration Types
 * Bridge types for MONOLITH Factory Server integration
 */

// ─── MONOLITH Job State Mapping ──────────────────────────────────────────────

/**
 * Maps WwUnitState to MONOLITH's existing job states
 * from Factory Server FIFO Job Queue
 */
export enum MonolithJobState {
  QUEUED = 'QUEUED',
  PREPARING = 'PREPARING',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/** Mapping table: WwUnitState + context → MonolithJobState */
export interface StateTransitionRule {
  fromWwState: import('./machine').WwUnitState;
  toWwState: import('./machine').WwUnitState;
  condition?: string;
  resultJobState: MonolithJobState;
  emitEvent: import('./machine').MachineEventType;
}

// ─── CAS (Content-Addressable Storage) Integration ───────────────────────────

export interface CASEntry {
  /** SHA-256 content hash (CAS address) */
  hash: string;
  /** Content type identifier */
  contentType: CASContentType;
  /** Size in bytes */
  size: number;
  /** Creation timestamp */
  createdAt: Date;
  /** Ed25519 signature */
  signature: string;
  /** Public key used for signing (hex) */
  publicKey: string;
  /** Reference to original source */
  sourceRef: {
    machineId: string;
    batchId?: string;
    jobId?: string;
  };
}

export enum CASContentType {
  SENSOR_BATCH = 'SENSOR_BATCH',
  STATE_SNAPSHOT = 'STATE_SNAPSHOT',
  MACHINE_EVENT = 'MACHINE_EVENT',
  JOB_TRACE = 'JOB_TRACE',
  ALARM_LOG = 'ALARM_LOG',
}

// ─── Activity Log Bridge ─────────────────────────────────────────────────────

export interface ActivityLogEntry {
  id: string;
  timestamp: Date;
  actorType: 'MACHINE' | 'SYSTEM' | 'OPERATOR';
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  /** Links to CAS entry for full data */
  casHash?: string;
}

// ─── Factory Server API Types ────────────────────────────────────────────────

export interface FactoryServerJob {
  jobId: string;
  orderId: string;
  productId: string;
  /** CNC preset type */
  machinePreset: 'BIESSE' | 'HOMAG' | 'KDT' | 'SCM' | 'GENERIC';
  /** G-code or program reference */
  programRef: string;
  /** Priority in queue */
  priority: number;
  /** Estimated duration (seconds) */
  estimatedDuration: number;
  /** Material specification */
  material: {
    type: string;
    thickness: number;
    width: number;
    length: number;
  };
  state: MonolithJobState;
  assignedMachineId?: string;
  startedAt?: Date;
  completedAt?: Date;
}

// ─── Safety Gate Integration ─────────────────────────────────────────────────

export interface SafetyGateCheck {
  checkId: string;
  machineId: string;
  timestamp: Date;
  gateType: SafetyGateType;
  passed: boolean;
  reason?: string;
  /** If failed, action taken */
  action?: 'BLOCK' | 'WARN' | 'LOG_ONLY';
}

export enum SafetyGateType {
  /** Machine state valid for job start */
  PRE_JOB_STATE = 'PRE_JOB_STATE',
  /** Sensor readings within tolerance */
  SENSOR_TOLERANCE = 'SENSOR_TOLERANCE',
  /** No active critical alarms */
  ALARM_CLEAR = 'ALARM_CLEAR',
  /** Tool wear within limits */
  TOOL_WEAR = 'TOOL_WEAR',
  /** Material dimensions match job spec */
  MATERIAL_CHECK = 'MATERIAL_CHECK',
}
