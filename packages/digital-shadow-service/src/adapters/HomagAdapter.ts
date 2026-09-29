/**
 * MONOLITH Digital Shadow — Homag Adapter
 * Dual-channel: OPC UA Woodworking + HOMAG Connect Cloud API
 * For: Homag EDGETEQ, CENTATEQ, DRILLTEQ series
 */

import {
  OPCUAClient,
  ClientSession,
  ClientSubscription,
  ClientMonitoredItem,
  AttributeIds,
  DataValue,
  DataType,
  TimestampsToReturn,
  MessageSecurityMode,
  SecurityPolicy,
  MonitoringParametersOptions,
  CallMethodRequestLike,
  Variant,
} from 'node-opcua';
import { BaseMachineAdapter } from './BaseMachineAdapter';
import { WwUnitState, WwUnitMode } from '../types/machine';
import type { MachineEndpoint, MachineStateSnapshot } from '../types/machine';
import type { SensorDataPoint } from '../types/sensor';
import { DataQuality } from '../types/sensor';
import { opcuaConfig } from '../config';

// ─── HOMAG Connect Cloud API Types ───────────────────────────────────────────

interface HomagConnectMachineData {
  machineId: string;
  timestamp: string;
  state: string;
  counters: {
    totalParts: number;
    partsToday: number;
    runtime: number;
  };
  currentJob?: {
    name: string;
    progress: number;
  };
}

/** HOMAG Connect command API response */
interface HomagConnectCommandResponse {
  commandId: string;
  status: 'accepted' | 'rejected' | 'error';
  message?: string;
  machineSerial: string;
  timestamp: string;
}

/** HOMAG Connect command actions */
type HomagCommandAction = 'start' | 'pause' | 'resume' | 'abort' | 'emergency_stop';

// ─── OPC UA Nodes (Homag uses same Woodworking companion spec) ───────────────

const WW_NODES = {
  currentState: 'ns=4;s=Woodworking.State.Machine.Overview.CurrentState',
  currentMode: 'ns=4;s=Woodworking.State.Machine.Overview.CurrentMode',
  feedSpeed: 'ns=4;s=Woodworking.State.Machine.Values.FeedSpeed',
  partCounter: 'ns=4;s=Woodworking.Production.ActiveProgram.PartsCounter',
  programName: 'ns=4;s=Woodworking.Production.ActiveProgram.Name',
  machineRuntime: 'ns=4;s=Woodworking.State.Machine.Overview.RunTime',
  // ─── Phase 2: Write Targets ───────────────────────────────────────────────
  startProgramMethod: 'ns=4;s=Woodworking.Production.Methods.StartProgram',
  pauseMethod: 'ns=4;s=Woodworking.Production.Methods.Pause',
  resumeMethod: 'ns=4;s=Woodworking.Production.Methods.Resume',
  abortMethod: 'ns=4;s=Woodworking.Production.Methods.Abort',
  productionObject: 'ns=4;s=Woodworking.Production',
} as const;

export class HomagAdapter extends BaseMachineAdapter {
  private client: OPCUAClient | null = null;
  private session: ClientSession | null = null;
  private subscription: ClientSubscription | null = null;
  private pollingTimer: NodeJS.Timeout | null = null;
  private cloudPollingTimer: NodeJS.Timeout | null = null;
  private lastCloudData: HomagConnectMachineData | null = null;

  constructor(endpoint: MachineEndpoint) {
    super(endpoint);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    this.logger.info(
      { endpoint: this.endpoint.opcuaEndpoint, hasCloud: !!this.endpoint.homagConnect },
      'Connecting to Homag (dual-channel)...',
    );

    // Channel 1: OPC UA direct connection
    await this.connectOpcua();

    // Channel 2: HOMAG Connect cloud API (supplementary data)
    if (this.endpoint.homagConnect) {
      this.startCloudPolling();
    }

    this._isConnected = true;
    this.startPolling();
    this.logger.info('Homag dual-channel connection established');
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from Homag...');
    this.stopPolling();
    this.stopCloudPolling();

    if (this.subscription) {
      await this.subscription.terminate();
      this.subscription = null;
    }
    if (this.session) {
      await this.session.close();
      this.session = null;
    }
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }

    this._isConnected = false;
    this.cleanup();
    this.logger.info('Disconnected from Homag');
  }

  async ping(): Promise<boolean> {
    if (!this.session) return false;
    try {
      const result = await this.session.read({
        nodeId: 'ns=0;i=2259',
        attributeId: AttributeIds.Value,
      });
      return result.statusCode.isGood();
    } catch {
      return false;
    }
  }

  // ─── State Reading ─────────────────────────────────────────────────────────

  async readState(): Promise<MachineStateSnapshot> {
    this.ensureSession();

    const results = await this.session!.read([
      { nodeId: WW_NODES.currentState, attributeId: AttributeIds.Value },
      { nodeId: WW_NODES.currentMode, attributeId: AttributeIds.Value },
      { nodeId: WW_NODES.feedSpeed, attributeId: AttributeIds.Value },
      { nodeId: WW_NODES.partCounter, attributeId: AttributeIds.Value },
      { nodeId: WW_NODES.programName, attributeId: AttributeIds.Value },
      { nodeId: WW_NODES.machineRuntime, attributeId: AttributeIds.Value },
    ]);

    const snapshot: MachineStateSnapshot = {
      machineId: this.endpoint.machineId,
      timestamp: new Date(),
      state: this.mapToWwState(results[0]?.value?.value),
      mode: this.mapToWwMode(results[1]?.value?.value),
      spindleSpeed: 0, // Edgebanders don't have spindle in same sense
      feedRate: results[2]?.value?.value ?? 0,
      partCount: results[3]?.value?.value ?? 0,
      currentProgram: results[4]?.value?.value ?? undefined,
      runtimeSeconds: results[5]?.value?.value ?? 0,
      toolId: 'edge-unit',
      activeAlarms: [],
    };

    // Enrich with cloud data if available
    if (this.lastCloudData?.currentJob) {
      snapshot.currentProgram = this.lastCloudData.currentJob.name;
    }

    return snapshot;
  }

  async readUnitState(): Promise<WwUnitState> {
    this.ensureSession();
    const result = await this.session!.read({
      nodeId: WW_NODES.currentState,
      attributeId: AttributeIds.Value,
    });
    return this.mapToWwState(result.value?.value);
  }

  async readUnitMode(): Promise<WwUnitMode> {
    this.ensureSession();
    const result = await this.session!.read({
      nodeId: WW_NODES.currentMode,
      attributeId: AttributeIds.Value,
    });
    return this.mapToWwMode(result.value?.value);
  }

  // ─── Telemetry ─────────────────────────────────────────────────────────────

  async readTelemetry(): Promise<SensorDataPoint[]> {
    this.ensureSession();
    const now = new Date();

    const results = await this.session!.read([
      { nodeId: WW_NODES.feedSpeed, attributeId: AttributeIds.Value },
    ]);

    const points: SensorDataPoint[] = [
      {
        sensorId: `${this.endpoint.machineId}-feed`,
        machineId: this.endpoint.machineId,
        measurement: 'feed_speed',
        value: results[0]?.value?.value ?? 0,
        unit: 'm/min',
        timestamp: now,
        quality: this.mapQuality(results[0]),
        tags: { vendor: 'homag', type: 'edgebander' },
      },
    ];

    // Add cloud-sourced data
    if (this.lastCloudData) {
      points.push({
        sensorId: `${this.endpoint.machineId}-cloud-parts`,
        machineId: this.endpoint.machineId,
        measurement: 'parts_today',
        value: this.lastCloudData.counters.partsToday,
        unit: 'count',
        timestamp: now,
        quality: DataQuality.GOOD,
        tags: { vendor: 'homag', source: 'connect_cloud' },
      });
    }

    this.emitTelemetry(points);
    return points;
  }

  // ─── HOMAG Connect Cloud API ───────────────────────────────────────────────

  private async fetchCloudData(): Promise<void> {
    const config = this.endpoint.homagConnect;
    if (!config) return;

    try {
      const response = await fetch(
        `${config.apiUrl}/machines/${config.machineSerial}/data/current`,
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        this.logger.warn(
          { status: response.status },
          'HOMAG Connect API request failed',
        );
        return;
      }

      this.lastCloudData = (await response.json()) as HomagConnectMachineData;
      this.logger.debug({ data: this.lastCloudData }, 'HOMAG Connect data refreshed');
    } catch (err) {
      this.logger.error({ err }, 'HOMAG Connect API error');
    }
  }

  // ─── Private Methods ───────────────────────────────────────────────────────

  private async connectOpcua(): Promise<void> {
    this.client = OPCUAClient.create({
      applicationName: opcuaConfig.applicationName,
      applicationUri: opcuaConfig.applicationUri,
      securityMode: MessageSecurityMode.SignAndEncrypt,
      securityPolicy: SecurityPolicy.Basic256Sha256,
      endpointMustExist: false,
      connectionStrategy: {
        initialDelay: 1000,
        maxRetry: 5,
        maxDelay: 10000,
      },
    });

    await this.client.connect(this.endpoint.opcuaEndpoint!);
    this.session = await this.client.createSession();

    // Setup subscription
    this.subscription = ClientSubscription.create(this.session, {
      requestedPublishingInterval: this.endpoint.publishIntervalMs,
      requestedMaxKeepAliveCount: 20,
      requestedLifetimeCount: 100,
      maxNotificationsPerPublish: 50,
      publishingEnabled: true,
      priority: 10,
    });

    const stateMonitor = ClientMonitoredItem.create(
      this.subscription,
      { nodeId: WW_NODES.currentState, attributeId: AttributeIds.Value },
      { samplingInterval: 500, discardOldest: true, queueSize: 10 } as MonitoringParametersOptions,
      TimestampsToReturn.Both,
    );

    stateMonitor.on('changed', (dataValue: DataValue) => {
      const newState = this.mapToWwState(dataValue.value?.value);
      const previousState = this._lastState ?? WwUnitState.OFFLINE;
      this.emitStateChange(previousState, newState);
    });
  }

  private startPolling(): void {
    this.pollingTimer = setInterval(async () => {
      try {
        await this.readTelemetry();
      } catch (err) {
        this.logger.error({ err }, 'Polling error');
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

  private startCloudPolling(): void {
    // Cloud API poll every 30 seconds (rate-limited)
    this.cloudPollingTimer = setInterval(() => {
      this.fetchCloudData();
    }, 30_000);
    // Initial fetch
    this.fetchCloudData();
  }

  private stopCloudPolling(): void {
    if (this.cloudPollingTimer) {
      clearInterval(this.cloudPollingTimer);
      this.cloudPollingTimer = null;
    }
  }

  private ensureSession(): void {
    if (!this.session || !this._isConnected) {
      throw new Error(`HomagAdapter [${this.adapterId}]: No active OPC UA session`);
    }
  }

  private mapToWwState(value: unknown): WwUnitState {
    const num = Number(value);
    if (num >= 0 && num <= 4) return num as WwUnitState;
    return WwUnitState.OFFLINE;
  }

  private mapToWwMode(value: unknown): WwUnitMode {
    const num = Number(value);
    if (num >= 0 && num <= 5) return num as WwUnitMode;
    return WwUnitMode.OTHER;
  }

  private mapQuality(dataValue: DataValue | undefined): DataQuality {
    if (!dataValue) return DataQuality.BAD;
    if (dataValue.statusCode.isGood()) return DataQuality.GOOD;
    return DataQuality.UNCERTAIN;
  }

  // ─── Phase 2: Write Operations (Bi-directional Command Layer) ──────────────
  //
  // Homag dual-channel write strategy:
  //   1. If HOMAG Connect cloud API is configured → use REST command API (preferred)
  //   2. Fallback to OPC UA Method Call (direct PLC communication)
  //
  // HOMAG Connect provides better audit trail, remote monitoring, and
  // integrates with Homag's own ecosystem (tapio/intelliDivide).
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Start a job via HOMAG Connect API or OPC UA fallback.
   * HOMAG Connect: POST /machines/{serial}/commands { action: "start", ... }
   */
  async startJob(jobId: string, programRef: string): Promise<boolean> {
    this.logger.info({ jobId, programRef }, 'Write: START_JOB (Homag dual-channel)');

    // Try HOMAG Connect API first (if configured)
    if (this.endpoint.homagConnect) {
      const result = await this.sendCloudCommand('start', {
        jobId,
        programId: programRef,
        source: 'monolith-digital-shadow',
      });
      if (result !== null) return result;
      // If cloud API fails, fall through to OPC UA
      this.logger.warn('HOMAG Connect command failed — falling back to OPC UA');
    }

    // OPC UA fallback: write program name + call StartProgram
    return this.startJobOpcua(jobId, programRef);
  }

  /**
   * Pause current job via HOMAG Connect or OPC UA.
   */
  async pauseJob(): Promise<boolean> {
    this.logger.info('Write: PAUSE_JOB (Homag)');

    if (this.endpoint.homagConnect) {
      const result = await this.sendCloudCommand('pause', {
        source: 'monolith-digital-shadow',
      });
      if (result !== null) return result;
      this.logger.warn('HOMAG Connect pause failed — falling back to OPC UA');
    }

    return this.callOpcuaMethod(WW_NODES.pauseMethod);
  }

  /**
   * Resume paused job via HOMAG Connect or OPC UA.
   */
  async resumeJob(): Promise<boolean> {
    this.logger.info('Write: RESUME_JOB (Homag)');

    if (this.endpoint.homagConnect) {
      const result = await this.sendCloudCommand('resume', {
        source: 'monolith-digital-shadow',
      });
      if (result !== null) return result;
      this.logger.warn('HOMAG Connect resume failed — falling back to OPC UA');
    }

    return this.callOpcuaMethod(WW_NODES.resumeMethod);
  }

  /**
   * Abort current job via HOMAG Connect or OPC UA.
   */
  async abortJob(): Promise<boolean> {
    this.logger.warn('Write: ABORT_JOB (Homag)');

    if (this.endpoint.homagConnect) {
      const result = await this.sendCloudCommand('abort', {
        source: 'monolith-digital-shadow',
        reason: 'operator_or_system_abort',
      });
      if (result !== null) return result;
      this.logger.warn('HOMAG Connect abort failed — falling back to OPC UA');
    }

    return this.callOpcuaMethod(WW_NODES.abortMethod);
  }

  // ─── HOMAG Connect Cloud Command API ───────────────────────────────────────

  /**
   * Send a command via HOMAG Connect REST API.
   * Returns: true (accepted), false (rejected), null (API unreachable → use fallback)
   */
  private async sendCloudCommand(
    action: HomagCommandAction,
    params: Record<string, string>,
  ): Promise<boolean | null> {
    const config = this.endpoint.homagConnect!;

    try {
      const response = await fetch(
        `${config.apiUrl}/machines/${config.machineSerial}/commands`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Request-Source': 'monolith-digital-shadow',
          },
          body: JSON.stringify({
            action,
            ...params,
            timestamp: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(5000), // 5s timeout for cloud API
        },
      );

      if (!response.ok) {
        this.logger.error(
          { status: response.status, action },
          'HOMAG Connect command API error',
        );
        // 4xx = command rejected, 5xx = API error (fallback)
        if (response.status >= 500) return null; // trigger fallback
        return false; // definitive rejection
      }

      const result = (await response.json()) as HomagConnectCommandResponse;
      this.logger.info(
        { commandId: result.commandId, status: result.status, action },
        'HOMAG Connect command response',
      );

      return result.status === 'accepted';
    } catch (err) {
      this.logger.error({ err, action }, 'HOMAG Connect API unreachable');
      return null; // trigger OPC UA fallback
    }
  }

  // ─── OPC UA Write Fallback ─────────────────────────────────────────────────

  /**
   * Start job via direct OPC UA Method Call (same as Biesse pattern).
   */
  private async startJobOpcua(jobId: string, programRef: string): Promise<boolean> {
    this.ensureSession();

    // Write program name first
    const writeResult = await this.session!.write({
      nodeId: WW_NODES.programName,
      attributeId: AttributeIds.Value,
      value: {
        value: { dataType: DataType.String, value: programRef },
      },
    });

    if (!writeResult.isGood()) {
      this.logger.error(
        { statusCode: writeResult.toString() },
        'OPC UA: Failed to write program name (Homag)',
      );
      return false;
    }

    // Call StartProgram method
    const callResult = await this.session!.call({
      objectId: WW_NODES.productionObject,
      methodId: WW_NODES.startProgramMethod,
      inputArguments: [
        new Variant({ dataType: DataType.String, value: jobId }),
        new Variant({ dataType: DataType.String, value: programRef }),
      ],
    } as CallMethodRequestLike);

    const success = callResult.statusCode.isGood();
    this.logger.info(
      { jobId, success, statusCode: callResult.statusCode.toString() },
      'OPC UA StartProgram (Homag) result',
    );
    return success;
  }

  /**
   * Generic OPC UA method call for pause/resume/abort.
   */
  private async callOpcuaMethod(methodNodeId: string): Promise<boolean> {
    this.ensureSession();

    const callResult = await this.session!.call({
      objectId: WW_NODES.productionObject,
      methodId: methodNodeId,
      inputArguments: [],
    } as CallMethodRequestLike);

    const success = callResult.statusCode.isGood();
    this.logger.info(
      { method: methodNodeId, success, statusCode: callResult.statusCode.toString() },
      'OPC UA method call (Homag) result',
    );
    return success;
  }
}
