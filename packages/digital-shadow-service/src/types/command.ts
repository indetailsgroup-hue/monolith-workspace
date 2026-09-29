/**
 * MONOLITH Digital Shadow Service — Phase 2 Command Layer Types
 * Bi-directional OPC UA write operations for job control
 */

import type { WwUnitState, WwUnitMode, MachineVendor } from './machine';
import type { SafetyGateType } from './job';

// ─── Command Types ───────────────────────────────────────────────────────────

/** Available machine commands (Phase 2) */
export enum CommandType {
  START_JOB = 'START_JOB',
  PAUSE_JOB = 'PAUSE_JOB',
  RESUME_JOB = 'RESUME_JOB',
  ABORT_JOB = 'ABORT_JOB',
  /** Emergency stop — bypasses queue, immediate execution */
  EMERGENCY_STOP = 'EMERGENCY_STOP',
  /** Load program/G-code to machine buffer */
  LOAD_PROGRAM = 'LOAD_PROGRAM',
  /** Set machine mode (e.g., AUTOMATIC → SETUP) */
  SET_MODE = 'SET_MODE',
  /** Reset error state */
  RESET_ERROR = 'RESET_ERROR',
}

/** Command execution status lifecycle */
export enum CommandStatus {
  /** Command received, pending safety validation */
  PENDING = 'PENDING',
  /** Safety gate checks in progress */
  VALIDATING = 'VALIDATING',
  /** Validated, queued for execution */
  QUEUED = 'QUEUED',
  /** Currently being dispatched to machine */
  DISPATCHING = 'DISPATCHING',
  /** OPC UA write sent, awaiting confirmation */
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
  /** Machine confirmed execution */
  CONFIRMED = 'CONFIRMED',
  /** Command completed successfully */
  COMPLETED = 'COMPLETED',
  /** Safety gate rejected command */
  REJECTED = 'REJECTED',
  /** Execution timed out */
  TIMED_OUT = 'TIMED_OUT',
  /** Machine returned error */
  FAILED = 'FAILED',
  /** Command cancelled by operator/system */
  CANCELLED = 'CANCELLED',
}

/** Command priority levels */
export enum CommandPriority {
  /** Emergency commands — immediate execution, bypass queue */
  CRITICAL = 0,
  /** Operator-initiated stop/pause — high priority */
  HIGH = 1,
  /** Normal job start/resume */
  NORMAL = 2,
  /** Low-priority maintenance commands */
  LOW = 3,
}

// ─── Command Request / Response ──────────────────────────────────────────────

/** Inbound command request from Factory Server or operator */
export interface CommandRequest {
  /** Client-generated idempotency key (UUID v4) */
  requestId: string;
  /** Target machine */
  machineId: string;
  /** Command to execute */
  commandType: CommandType;
  /** Priority level */
  priority: CommandPriority;
  /** Command-specific payload */
  payload: CommandPayload;
  /** Who initiated the command */
  initiator: CommandInitiator;
  /** Maximum time to wait for confirmation (ms) */
  timeoutMs: number;
  /** Metadata for audit trail */
  metadata?: Record<string, unknown>;
}

/** Command payload — discriminated by CommandType */
export type CommandPayload =
  | StartJobPayload
  | PauseJobPayload
  | ResumeJobPayload
  | AbortJobPayload
  | EmergencyStopPayload
  | LoadProgramPayload
  | SetModePayload
  | ResetErrorPayload;

export interface StartJobPayload {
  type: CommandType.START_JOB;
  jobId: string;
  /** CNC program reference (CAS hash or file path) */
  programRef: string;
  /** Material spec for safety validation */
  material?: {
    type: string;
    thickness: number;
  };
  /** Expected cycle time (seconds) — for timeout calculation */
  expectedCycleTime?: number;
}

export interface PauseJobPayload {
  type: CommandType.PAUSE_JOB;
  /** Reason for pause (audit) */
  reason: 'operator_request' | 'tool_change' | 'material_shortage' | 'quality_hold';
}

export interface ResumeJobPayload {
  type: CommandType.RESUME_JOB;
  /** Confirmation that pause condition resolved */
  resumeConfirmation?: string;
}

export interface AbortJobPayload {
  type: CommandType.ABORT_JOB;
  /** Reason for abort */
  reason: string;
  /** Whether to attempt graceful stop (spindle deceleration) */
  graceful: boolean;
}

export interface EmergencyStopPayload {
  type: CommandType.EMERGENCY_STOP;
  /** Source of emergency (operator, sensor, safety-system) */
  source: 'operator' | 'sensor' | 'safety_system';
}

export interface LoadProgramPayload {
  type: CommandType.LOAD_PROGRAM;
  /** CAS hash of G-code/program file */
  programHash: string;
  /** Program name for display */
  programName: string;
  /** Transfer method */
  transferMethod: 'opcua_file_transfer' | 'network_share' | 'usb';
}

export interface SetModePayload {
  type: CommandType.SET_MODE;
  targetMode: WwUnitMode;
}

export interface ResetErrorPayload {
  type: CommandType.RESET_ERROR;
  /** Acknowledged alarm IDs */
  alarmIds: string[];
}

// ─── Command Initiator ───────────────────────────────────────────────────────

export interface CommandInitiator {
  /** Who initiated: factory-server, operator-panel, scheduler, safety-system */
  source: 'factory_server' | 'operator_panel' | 'scheduler' | 'safety_system';
  /** User/service ID */
  actorId: string;
  /** Session/request trace ID */
  traceId?: string;
}

// ─── Command Response ────────────────────────────────────────────────────────

export interface CommandResponse {
  /** Same as request.requestId */
  requestId: string;
  /** Internal command ID (generated by CommandDispatcher) */
  commandId: string;
  /** Target machine */
  machineId: string;
  /** Command type */
  commandType: CommandType;
  /** Current status */
  status: CommandStatus;
  /** Status detail message */
  message: string;
  /** Timestamps for lifecycle tracking */
  timestamps: CommandTimestamps;
  /** Safety gate results (if validation completed) */
  safetyGateResults?: SafetyGateResult[];
  /** Machine response data (if confirmed) */
  machineResponse?: MachineCommandResponse;
}

export interface CommandTimestamps {
  receivedAt: Date;
  validatedAt?: Date;
  queuedAt?: Date;
  dispatchedAt?: Date;
  confirmedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
}

// ─── Safety Gate Result (per-check) ──────────────────────────────────────────

export interface SafetyGateResult {
  gateType: SafetyGateType;
  passed: boolean;
  severity: 'blocking' | 'warning' | 'info';
  message: string;
  /** Current value vs. required value (for diagnostics) */
  actual?: unknown;
  expected?: unknown;
}

// ─── Machine-level Response ──────────────────────────────────────────────────

export interface MachineCommandResponse {
  /** OPC UA StatusCode */
  statusCode: number;
  /** Whether machine accepted the command */
  accepted: boolean;
  /** Machine-returned error description */
  errorDescription?: string;
  /** OPC UA Method output arguments */
  outputArgs?: Record<string, unknown>;
}

// ─── Command Queue Entry (Redis) ─────────────────────────────────────────────

export interface CommandQueueEntry {
  commandId: string;
  request: CommandRequest;
  status: CommandStatus;
  priority: CommandPriority;
  timestamps: CommandTimestamps;
  retryCount: number;
  maxRetries: number;
  safetyGateResults: SafetyGateResult[];
  machineResponse?: MachineCommandResponse;
  /** Error detail for FAILED/REJECTED */
  error?: string;
}

// ─── OPC UA Write Targets ────────────────────────────────────────────────────

/** OPC UA nodeIds for write operations per vendor */
export interface VendorWriteNodes {
  vendor: MachineVendor;
  /** Method node for StartProgram (if OPC UA Method Call) */
  startProgramMethod?: string;
  /** Method node for Stop/Pause */
  stopMethod?: string;
  /** Variable node for program name write */
  programNameWrite?: string;
  /** Variable node for command register (Modbus-style) */
  commandRegister?: string;
  /** Variable node for mode select */
  modeSelect?: string;
  /** Variable node for error reset */
  errorReset?: string;
}

// ─── Command Confirmation Strategy ──────────────────────────────────────────

export interface ConfirmationStrategy {
  /** How to confirm command execution */
  method: 'state_transition' | 'method_return' | 'register_poll';
  /** Expected state after command succeeds */
  expectedState?: WwUnitState;
  /** Timeout before considering command failed (ms) */
  confirmationTimeoutMs: number;
  /** Polling interval for register-based confirmation (ms) */
  pollIntervalMs?: number;
}

// ─── Command Configuration ───────────────────────────────────────────────────

export interface CommandLayerConfig {
  /** Global command timeout (ms) — default 30s */
  defaultTimeoutMs: number;
  /** Max commands in queue per machine */
  maxQueueDepthPerMachine: number;
  /** Max retries for transient failures */
  maxRetries: number;
  /** Retry backoff base (ms) */
  retryBackoffBaseMs: number;
  /** Confirmation polling interval (ms) */
  confirmationPollMs: number;
  /** Emergency stop bypasses safety gate */
  emergencyBypassesSafety: boolean;
  /** Commands requiring dual-operator confirmation */
  dualConfirmCommands: CommandType[];
}
