/**
 * MONOLITH Digital Shadow — Phase 2 Command Safety Gate
 * Pre-command validation ensuring machine is safe to receive commands
 * All checks MUST pass before OPC UA write operations are dispatched
 */

import pino from 'pino';
import type {
  CommandRequest,
  CommandType as CmdType,
  SafetyGateResult,
  StartJobPayload,
} from '../types/command';
import { CommandType, CommandPriority } from '../types/command';
import { WwUnitState, WwUnitMode } from '../types/machine';
import type { MachineStateSnapshot } from '../types/machine';
import { SafetyGateType } from '../types/job';
import type { IMachineAdapter } from '../adapters/IMachineAdapter';

// ─── Safety Rules Matrix ─────────────────────────────────────────────────────

/**
 * Required machine state for each command type
 * Multiple states = any of them is acceptable
 */
const REQUIRED_STATES: Record<CmdType, WwUnitState[]> = {
  [CommandType.START_JOB]: [WwUnitState.READY],
  [CommandType.PAUSE_JOB]: [WwUnitState.WORKING],
  [CommandType.RESUME_JOB]: [WwUnitState.STANDBY],
  [CommandType.ABORT_JOB]: [WwUnitState.WORKING, WwUnitState.STANDBY],
  [CommandType.EMERGENCY_STOP]: [
    WwUnitState.OFFLINE,
    WwUnitState.STANDBY,
    WwUnitState.READY,
    WwUnitState.WORKING,
    WwUnitState.ERROR,
  ], // Always allowed
  [CommandType.LOAD_PROGRAM]: [WwUnitState.READY, WwUnitState.STANDBY],
  [CommandType.SET_MODE]: [WwUnitState.READY, WwUnitState.STANDBY],
  [CommandType.RESET_ERROR]: [WwUnitState.ERROR],
};

/**
 * Required machine mode for each command type (null = any mode acceptable)
 */
const REQUIRED_MODES: Partial<Record<CmdType, WwUnitMode[]>> = {
  [CommandType.START_JOB]: [WwUnitMode.AUTOMATIC, WwUnitMode.SEMIAUTOMATIC],
  [CommandType.RESUME_JOB]: [WwUnitMode.AUTOMATIC, WwUnitMode.SEMIAUTOMATIC],
};

export class CommandSafetyGate {
  private logger = pino({ name: 'command-safety-gate' });

  /**
   * Execute all safety gate checks for a command request.
   * Returns array of results; command proceeds only if ALL blocking checks pass.
   */
  async validate(
    request: CommandRequest,
    adapter: IMachineAdapter,
    currentSnapshot?: MachineStateSnapshot,
  ): Promise<SafetyGateResult[]> {
    const results: SafetyGateResult[] = [];

    // Emergency commands bypass all checks except connection
    if (request.priority === CommandPriority.CRITICAL) {
      const connCheck = await this.checkConnection(adapter);
      results.push(connCheck);
      this.logger.warn(
        { requestId: request.requestId, commandType: request.commandType },
        'CRITICAL priority — bypassing safety gates',
      );
      return results;
    }

    // 1. Connection check
    results.push(await this.checkConnection(adapter));

    // 2. Read current state (use provided snapshot or fresh read)
    let snapshot: MachineStateSnapshot;
    try {
      snapshot = currentSnapshot ?? await adapter.readState();
    } catch (err) {
      results.push({
        gateType: SafetyGateType.PRE_JOB_STATE,
        passed: false,
        severity: 'blocking',
        message: `Failed to read machine state: ${(err as Error).message}`,
      });
      return results;
    }

    // 3. Machine state check
    results.push(this.checkMachineState(request.commandType, snapshot));

    // 4. Machine mode check (if applicable)
    const modeCheck = this.checkMachineMode(request.commandType, snapshot);
    if (modeCheck) results.push(modeCheck);

    // 5. No critical alarms check
    results.push(this.checkAlarms(snapshot));

    // 6. Command-specific checks
    const specificChecks = await this.runCommandSpecificChecks(request, snapshot);
    results.push(...specificChecks);

    // Log summary
    const blocked = results.filter((r) => !r.passed && r.severity === 'blocking');
    if (blocked.length > 0) {
      this.logger.warn(
        {
          requestId: request.requestId,
          machineId: request.machineId,
          blockers: blocked.map((b) => b.message),
        },
        'Command REJECTED by safety gate',
      );
    } else {
      this.logger.info(
        { requestId: request.requestId, machineId: request.machineId },
        'Command PASSED safety gate',
      );
    }

    return results;
  }

  /**
   * Determine if command can proceed based on safety results
   */
  canProceed(results: SafetyGateResult[]): boolean {
    return results.every((r) => r.passed || r.severity !== 'blocking');
  }

  // ─── Individual Checks ─────────────────────────────────────────────────────

  private async checkConnection(adapter: IMachineAdapter): Promise<SafetyGateResult> {
    const isAlive = adapter.isConnected && (await adapter.ping());
    return {
      gateType: SafetyGateType.PRE_JOB_STATE,
      passed: isAlive,
      severity: 'blocking',
      message: isAlive
        ? 'Machine connection is active'
        : 'Machine connection is not available',
      actual: isAlive,
      expected: true,
    };
  }

  private checkMachineState(
    commandType: CommandType,
    snapshot: MachineStateSnapshot,
  ): SafetyGateResult {
    const allowedStates = REQUIRED_STATES[commandType] ?? [];
    const passed = allowedStates.includes(snapshot.state);
    return {
      gateType: SafetyGateType.PRE_JOB_STATE,
      passed,
      severity: 'blocking',
      message: passed
        ? `Machine state ${WwUnitState[snapshot.state]} is valid for ${commandType}`
        : `Machine state ${WwUnitState[snapshot.state]} is NOT valid for ${commandType}. Required: ${allowedStates.map((s) => WwUnitState[s]).join(' | ')}`,
      actual: WwUnitState[snapshot.state],
      expected: allowedStates.map((s) => WwUnitState[s]),
    };
  }

  private checkMachineMode(
    commandType: CommandType,
    snapshot: MachineStateSnapshot,
  ): SafetyGateResult | null {
    const allowedModes = REQUIRED_MODES[commandType];
    if (!allowedModes) return null;

    const passed = allowedModes.includes(snapshot.mode);
    return {
      gateType: SafetyGateType.PRE_JOB_STATE,
      passed,
      severity: 'blocking',
      message: passed
        ? `Machine mode ${WwUnitMode[snapshot.mode]} is valid`
        : `Machine mode ${WwUnitMode[snapshot.mode]} is NOT valid. Required: ${allowedModes.map((m) => WwUnitMode[m]).join(' | ')}`,
      actual: WwUnitMode[snapshot.mode],
      expected: allowedModes.map((m) => WwUnitMode[m]),
    };
  }

  private checkAlarms(snapshot: MachineStateSnapshot): SafetyGateResult {
    const criticalAlarms = snapshot.activeAlarms.filter(
      (a) => a.severity === 'CRITICAL' || a.severity === 'ERROR',
    );
    const passed = criticalAlarms.length === 0;
    return {
      gateType: SafetyGateType.ALARM_CLEAR,
      passed,
      severity: passed ? 'info' : 'blocking',
      message: passed
        ? 'No critical alarms active'
        : `${criticalAlarms.length} critical alarm(s) active: ${criticalAlarms.map((a) => a.message).join('; ')}`,
      actual: criticalAlarms.length,
      expected: 0,
    };
  }

  private async runCommandSpecificChecks(
    request: CommandRequest,
    snapshot: MachineStateSnapshot,
  ): Promise<SafetyGateResult[]> {
    const results: SafetyGateResult[] = [];

    switch (request.commandType) {
      case CommandType.START_JOB: {
        const payload = request.payload as StartJobPayload;

        // Check no other job running
        if (snapshot.currentJobId) {
          results.push({
            gateType: SafetyGateType.PRE_JOB_STATE,
            passed: false,
            severity: 'blocking',
            message: `Machine already has active job: ${snapshot.currentJobId}`,
            actual: snapshot.currentJobId,
            expected: undefined,
          });
        }

        // Check program reference exists (basic validation)
        if (!payload.programRef || payload.programRef.length === 0) {
          results.push({
            gateType: SafetyGateType.MATERIAL_CHECK,
            passed: false,
            severity: 'blocking',
            message: 'Program reference is empty',
          });
        }

        // Sensor tolerance check: spindle is idle (< 100 RPM)
        if (snapshot.spindleSpeed > 100) {
          results.push({
            gateType: SafetyGateType.SENSOR_TOLERANCE,
            passed: false,
            severity: 'warning',
            message: `Spindle still rotating at ${snapshot.spindleSpeed} RPM — wait for full stop`,
            actual: snapshot.spindleSpeed,
            expected: '< 100 RPM',
          });
        }
        break;
      }

      case CommandType.ABORT_JOB: {
        // Warn if abort during high spindle speed (potential tool/material damage)
        if (snapshot.spindleSpeed > 10000) {
          results.push({
            gateType: SafetyGateType.TOOL_WEAR,
            passed: true, // warning only, doesn't block
            severity: 'warning',
            message: `High spindle speed (${snapshot.spindleSpeed} RPM) — abort may cause tool stress`,
            actual: snapshot.spindleSpeed,
            expected: '< 10000 RPM for safe abort',
          });
        }
        break;
      }

      default:
        break;
    }

    return results;
  }
}
