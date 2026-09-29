/**
 * MONOLITH Digital Shadow — KDT Adapter
 * Modbus TCP fallback for machines without OPC UA support
 * For: KDT KE-368J, KE-468J Edgebanders (Chinese-manufactured)
 */

import ModbusRTU from 'modbus-serial';
import { BaseMachineAdapter } from './BaseMachineAdapter';
import { WwUnitState, WwUnitMode } from '../types/machine';
import type {
  MachineEndpoint,
  MachineStateSnapshot,
  ModbusRegisterMap,
} from '../types/machine';
import type { SensorDataPoint } from '../types/sensor';
import { DataQuality } from '../types/sensor';

// ─── Modbus → WwUnitState Mapping ────────────────────────────────────────────

/**
 * KDT machines report state as integer in holding register:
 * 0 = Off/Offline → OFFLINE
 * 1 = Idle → STANDBY
 * 2 = Ready → READY
 * 3 = Running → WORKING
 * 4+ = Error/Fault → ERROR
 */
const MODBUS_STATE_MAP: Record<number, WwUnitState> = {
  0: WwUnitState.OFFLINE,
  1: WwUnitState.STANDBY,
  2: WwUnitState.READY,
  3: WwUnitState.WORKING,
  4: WwUnitState.ERROR,
  5: WwUnitState.ERROR,
};

// ─── Modbus Command Register Layout (Phase 2 Write) ──────────────────────────
//
// KDT machines use a command register protocol for receiving instructions:
//
// HR 100 (COMMAND_CODE):     Command action code
//   1 = Start Program
//   2 = Pause
//   3 = Resume
//   4 = Abort/Stop
//   5 = Emergency Stop
//   0 = Idle/No-op (clear after ACK)
//
// HR 101-102 (JOB_ID):      Job ID as 32-bit integer (for start command)
// HR 103-106 (PROGRAM_REF): Program reference (8 ASCII chars, 4 registers)
// HR 110 (ACK_REGISTER):    Machine acknowledgement
//   0 = Idle (ready for command)
//   1 = ACK (command accepted, processing)
//   2 = NACK (command rejected)
//   3 = Done (command completed)
//   4 = Error (execution error)
//
// HR 111 (ERROR_DETAIL):    Error code when ACK_REGISTER = 4
// ─────────────────────────────────────────────────────────────────────────────

const CMD_REGISTERS = {
  commandCode: 100,
  jobIdHigh: 101,
  jobIdLow: 102,
  programRef: 103,  // 4 registers (103-106) = 8 ASCII chars
  ackRegister: 110,
  errorDetail: 111,
} as const;

/** Command codes for KDT Modbus write protocol */
enum KdtCommandCode {
  IDLE = 0,
  START = 1,
  PAUSE = 2,
  RESUME = 3,
  ABORT = 4,
  EMERGENCY_STOP = 5,
}

/** ACK register values */
enum KdtAckStatus {
  IDLE = 0,
  ACK = 1,
  NACK = 2,
  DONE = 3,
  ERROR = 4,
}

export class KdtAdapter extends BaseMachineAdapter {
  private modbusClient: ModbusRTU;
  private pollingTimer: NodeJS.Timeout | null = null;
  private registers: ModbusRegisterMap;

  constructor(endpoint: MachineEndpoint) {
    super(endpoint);
    this.modbusClient = new ModbusRTU();
    this.registers = endpoint.modbusRegisters ?? {
      state: { address: 0, length: 1 },
      spindleSpeed: { address: 10, length: 2 },
      feedRate: { address: 12, length: 2 },
      toolId: { address: 20, length: 1 },
      errorCode: { address: 30, length: 1 },
      partCount: { address: 40, length: 2 },
    };
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    this.logger.info(
      { host: this.endpoint.modbusHost, port: this.endpoint.modbusPort },
      'Connecting to KDT via Modbus TCP...',
    );

    await this.modbusClient.connectTCP(this.endpoint.modbusHost!, {
      port: this.endpoint.modbusPort ?? 502,
    });

    this.modbusClient.setID(1); // Default Modbus slave ID
    this.modbusClient.setTimeout(5000);

    this._isConnected = true;
    this.logger.info('Modbus TCP connection established with KDT');

    // Start polling (Modbus has no subscription model)
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from KDT...');
    this.stopPolling();
    this.modbusClient.close(() => {});
    this._isConnected = false;
    this.cleanup();
    this.logger.info('Disconnected from KDT');
  }

  async ping(): Promise<boolean> {
    try {
      // Read state register as heartbeat
      await this.modbusClient.readHoldingRegisters(
        this.registers.state.address,
        this.registers.state.length,
      );
      return true;
    } catch {
      return false;
    }
  }

  // ─── State Reading ─────────────────────────────────────────────────────────

  async readState(): Promise<MachineStateSnapshot> {
    this.ensureConnection();

    const [stateReg, spindleReg, feedReg, toolReg, errorReg, partReg] = await Promise.all([
      this.readRegister(this.registers.state),
      this.readRegister(this.registers.spindleSpeed),
      this.readRegister(this.registers.feedRate),
      this.readRegister(this.registers.toolId),
      this.readRegister(this.registers.errorCode),
      this.readRegister(this.registers.partCount),
    ]);

    const state = MODBUS_STATE_MAP[stateReg] ?? WwUnitState.OFFLINE;
    const previousState = this._lastState;

    // Emit state change if different
    if (previousState !== null && previousState !== state) {
      this.emitStateChange(previousState, state);
    }
    this._lastState = state;

    const snapshot: MachineStateSnapshot = {
      machineId: this.endpoint.machineId,
      timestamp: new Date(),
      state,
      mode: state === WwUnitState.WORKING ? WwUnitMode.AUTOMATIC : WwUnitMode.OTHER,
      spindleSpeed: spindleReg,
      feedRate: feedReg,
      toolId: String(toolReg),
      partCount: partReg,
      runtimeSeconds: 0, // KDT doesn't expose runtime via Modbus
      activeAlarms: errorReg > 0
        ? [{
            alarmId: `kdt-err-${errorReg}`,
            severity: errorReg >= 100 ? 'CRITICAL' : 'WARNING',
            message: `KDT Error Code: ${errorReg}`,
            timestamp: new Date(),
            acknowledged: false,
          }]
        : [],
    };

    return snapshot;
  }

  async readUnitState(): Promise<WwUnitState> {
    this.ensureConnection();
    const value = await this.readRegister(this.registers.state);
    return MODBUS_STATE_MAP[value] ?? WwUnitState.OFFLINE;
  }

  async readUnitMode(): Promise<WwUnitMode> {
    const state = await this.readUnitState();
    // KDT doesn't expose mode; infer from state
    if (state === WwUnitState.WORKING) return WwUnitMode.AUTOMATIC;
    if (state === WwUnitState.READY) return WwUnitMode.MANUAL;
    return WwUnitMode.OTHER;
  }

  // ─── Telemetry ─────────────────────────────────────────────────────────────

  async readTelemetry(): Promise<SensorDataPoint[]> {
    this.ensureConnection();
    const now = new Date();

    const [spindleSpeed, feedRate, partCount] = await Promise.all([
      this.readRegister(this.registers.spindleSpeed),
      this.readRegister(this.registers.feedRate),
      this.readRegister(this.registers.partCount),
    ]);

    const points: SensorDataPoint[] = [
      {
        sensorId: `${this.endpoint.machineId}-spindle`,
        machineId: this.endpoint.machineId,
        measurement: 'spindle_speed',
        value: spindleSpeed,
        unit: 'RPM',
        timestamp: now,
        quality: DataQuality.GOOD,
        tags: { vendor: 'kdt', type: 'edgebander', protocol: 'modbus' },
      },
      {
        sensorId: `${this.endpoint.machineId}-feed`,
        machineId: this.endpoint.machineId,
        measurement: 'feed_rate',
        value: feedRate,
        unit: 'mm/min',
        timestamp: now,
        quality: DataQuality.GOOD,
        tags: { vendor: 'kdt', type: 'edgebander', protocol: 'modbus' },
      },
      {
        sensorId: `${this.endpoint.machineId}-parts`,
        machineId: this.endpoint.machineId,
        measurement: 'part_count',
        value: partCount,
        unit: 'count',
        timestamp: now,
        quality: DataQuality.GOOD,
        tags: { vendor: 'kdt', type: 'edgebander', protocol: 'modbus' },
      },
    ];

    this.emitTelemetry(points);
    return points;
  }

  // ─── Private Methods ───────────────────────────────────────────────────────

  private async readRegister(reg: { address: number; length: number }): Promise<number> {
    const result = await this.modbusClient.readHoldingRegisters(reg.address, reg.length);
    if (reg.length === 1) {
      return result.data[0] ?? 0;
    }
    // Combine two 16-bit registers into 32-bit value (big-endian)
    return ((result.data[0] ?? 0) << 16) | (result.data[1] ?? 0);
  }

  private startPolling(): void {
    this.pollingTimer = setInterval(async () => {
      try {
        await this.readState(); // readState includes telemetry checks
        await this.readTelemetry();
      } catch (err) {
        this.logger.error({ err }, 'KDT polling error');
        if (!await this.ping()) {
          this.handleDisconnection();
        }
      }
    }, this.endpoint.pollingIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private ensureConnection(): void {
    if (!this._isConnected) {
      throw new Error(`KdtAdapter [${this.adapterId}]: No active Modbus connection`);
    }
  }

  // ─── Phase 2: Write Operations (Modbus Register Write) ─────────────────────
  //
  // KDT machines receive commands via Modbus holding register writes.
  // Protocol:
  //   1. Check ACK register is IDLE (machine ready for command)
  //   2. Write job parameters (job ID + program ref) if applicable
  //   3. Write command code to trigger execution
  //   4. Poll ACK register until machine responds (ACK/NACK/Done/Error)
  //   5. Clear command register (write IDLE) after ACK
  //
  // Timeout: 5 seconds for ACK, polling every 100ms
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Start a job on KDT machine via Modbus register write.
   * Writes: jobId → HR101-102, programRef → HR103-106, commandCode=1 → HR100
   */
  async startJob(jobId: string, programRef: string): Promise<boolean> {
    this.ensureConnection();
    this.logger.info({ jobId, programRef }, 'Modbus Write: START_JOB (KDT)');

    // 1. Check machine is ready for command
    const ready = await this.waitForAckIdle();
    if (!ready) {
      this.logger.error('KDT machine not ready (ACK register not IDLE)');
      return false;
    }

    // 2. Write job ID as 32-bit integer across two registers
    const jobIdNum = this.jobIdToNumber(jobId);
    await this.modbusClient.writeRegisters(CMD_REGISTERS.jobIdHigh, [
      (jobIdNum >>> 16) & 0xFFFF, // High word
      jobIdNum & 0xFFFF,           // Low word
    ]);

    // 3. Write program reference (truncate to 8 ASCII chars → 4 registers)
    const programRegisters = this.stringToRegisters(programRef, 4);
    await this.modbusClient.writeRegisters(CMD_REGISTERS.programRef, programRegisters);

    // 4. Write command code = START
    await this.modbusClient.writeRegister(CMD_REGISTERS.commandCode, KdtCommandCode.START);

    // 5. Wait for ACK
    const ackResult = await this.pollForAck();
    this.logger.info(
      { jobId, ackStatus: KdtAckStatus[ackResult], success: ackResult === KdtAckStatus.ACK || ackResult === KdtAckStatus.DONE },
      'KDT START_JOB ACK result',
    );

    // Clear command register
    await this.clearCommandRegister();

    return ackResult === KdtAckStatus.ACK || ackResult === KdtAckStatus.DONE;
  }

  /**
   * Pause current job via Modbus command register.
   */
  async pauseJob(): Promise<boolean> {
    this.ensureConnection();
    this.logger.info('Modbus Write: PAUSE_JOB (KDT)');
    return this.sendSimpleCommand(KdtCommandCode.PAUSE);
  }

  /**
   * Resume paused job via Modbus command register.
   */
  async resumeJob(): Promise<boolean> {
    this.ensureConnection();
    this.logger.info('Modbus Write: RESUME_JOB (KDT)');
    return this.sendSimpleCommand(KdtCommandCode.RESUME);
  }

  /**
   * Abort current job via Modbus command register.
   */
  async abortJob(): Promise<boolean> {
    this.ensureConnection();
    this.logger.warn('Modbus Write: ABORT_JOB (KDT)');
    return this.sendSimpleCommand(KdtCommandCode.ABORT);
  }

  // ─── Modbus Write Helpers ──────────────────────────────────────────────────

  /**
   * Send a simple command (no parameters) and wait for ACK.
   */
  private async sendSimpleCommand(code: KdtCommandCode): Promise<boolean> {
    // Wait for machine to be ready
    const ready = await this.waitForAckIdle();
    if (!ready) {
      this.logger.error({ code: KdtCommandCode[code] }, 'KDT not ready for command');
      return false;
    }

    // Write command code
    await this.modbusClient.writeRegister(CMD_REGISTERS.commandCode, code);

    // Wait for ACK
    const ackResult = await this.pollForAck();
    this.logger.info(
      { command: KdtCommandCode[code], ackStatus: KdtAckStatus[ackResult] },
      'KDT command ACK result',
    );

    // Clear command register
    await this.clearCommandRegister();

    return ackResult === KdtAckStatus.ACK || ackResult === KdtAckStatus.DONE;
  }

  /**
   * Wait for ACK register to be IDLE (machine ready for new command).
   * Polls every 100ms, timeout 3 seconds.
   */
  private async waitForAckIdle(): Promise<boolean> {
    const maxWait = 3000;
    const pollInterval = 100;
    let elapsed = 0;

    while (elapsed < maxWait) {
      const ack = await this.readAckRegister();
      if (ack === KdtAckStatus.IDLE) return true;

      await this.sleep(pollInterval);
      elapsed += pollInterval;
    }

    return false;
  }

  /**
   * Poll ACK register until machine responds with non-IDLE status.
   * Timeout: 5 seconds, poll interval: 100ms.
   * Returns the final ACK status.
   */
  private async pollForAck(): Promise<KdtAckStatus> {
    const maxWait = 5000;
    const pollInterval = 100;
    let elapsed = 0;

    while (elapsed < maxWait) {
      const ack = await this.readAckRegister();

      // Any non-IDLE response means machine processed the command
      if (ack !== KdtAckStatus.IDLE) {
        // If ACK (still processing), wait a bit more for DONE
        if (ack === KdtAckStatus.ACK) {
          // Give it another 2s for DONE
          const doneWait = await this.waitForDone(2000);
          return doneWait;
        }
        return ack;
      }

      await this.sleep(pollInterval);
      elapsed += pollInterval;
    }

    // Timeout — treat as error
    this.logger.warn('KDT ACK poll timeout — no response from machine');
    return KdtAckStatus.ERROR;
  }

  /**
   * After receiving ACK, wait for DONE (or stay at ACK if timeout).
   */
  private async waitForDone(maxWait: number): Promise<KdtAckStatus> {
    const pollInterval = 100;
    let elapsed = 0;

    while (elapsed < maxWait) {
      const ack = await this.readAckRegister();
      if (ack === KdtAckStatus.DONE) return KdtAckStatus.DONE;
      if (ack === KdtAckStatus.ERROR) return KdtAckStatus.ERROR;
      if (ack === KdtAckStatus.NACK) return KdtAckStatus.NACK;

      await this.sleep(pollInterval);
      elapsed += pollInterval;
    }

    // Still ACK after timeout — acceptable (machine is processing)
    return KdtAckStatus.ACK;
  }

  /**
   * Read the ACK register value.
   */
  private async readAckRegister(): Promise<KdtAckStatus> {
    const result = await this.modbusClient.readHoldingRegisters(CMD_REGISTERS.ackRegister, 1);
    return (result.data[0] ?? 0) as KdtAckStatus;
  }

  /**
   * Clear the command register after command is processed.
   */
  private async clearCommandRegister(): Promise<void> {
    await this.modbusClient.writeRegister(CMD_REGISTERS.commandCode, KdtCommandCode.IDLE);
  }

  /**
   * Convert a job ID string to a numeric value for Modbus registers.
   * Uses CRC32 hash for arbitrary-length strings → 32-bit integer.
   */
  private jobIdToNumber(jobId: string): number {
    // Simple hash: sum of char codes with bit mixing
    let hash = 0;
    for (let i = 0; i < jobId.length; i++) {
      const char = jobId.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0; // Force 32-bit integer
    }
    return hash >>> 0; // Unsigned 32-bit
  }

  /**
   * Convert a string to Modbus register array (2 ASCII chars per register).
   * Pads with null bytes if shorter than target length.
   */
  private stringToRegisters(str: string, registerCount: number): number[] {
    const registers: number[] = [];
    const padded = str.padEnd(registerCount * 2, '\0').slice(0, registerCount * 2);

    for (let i = 0; i < registerCount; i++) {
      const highByte = padded.charCodeAt(i * 2);
      const lowByte = padded.charCodeAt(i * 2 + 1);
      registers.push((highByte << 8) | lowByte);
    }

    return registers;
  }

  /**
   * Async sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
