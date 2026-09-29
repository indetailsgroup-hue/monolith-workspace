/**
 * MONOLITH Digital Shadow — Biesse Adapter
 * Native OPC UA Woodworking (OPC-40550-1) implementation
 * For: Biesse Rover A/B/C CNC Routers, Biesse Akron Edgebanders
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
  type OPCUACertificateManager,
} from 'node-opcua';
import { BaseMachineAdapter } from './BaseMachineAdapter';
import { WwUnitState, WwUnitMode } from '../types/machine';
import type { MachineEndpoint, MachineStateSnapshot } from '../types/machine';
import type { SensorDataPoint } from '../types/sensor';
import { DataQuality } from '../types/sensor';
import { opcuaConfig } from '../config';

// ─── OPC UA Node IDs for Woodworking Companion Spec ──────────────────────────

const WW_NODES = {
  /** ns=4 → OPC UA Woodworking namespace */
  currentState: 'ns=4;s=Woodworking.State.Machine.Overview.CurrentState',
  currentMode: 'ns=4;s=Woodworking.State.Machine.Overview.CurrentMode',
  spindleOverride: 'ns=4;s=Woodworking.State.Machine.Values.SpindleOverride',
  feedOverride: 'ns=4;s=Woodworking.State.Machine.Values.FeedOverride',
  partCounter: 'ns=4;s=Woodworking.Production.ActiveProgram.PartsCounter',
  programName: 'ns=4;s=Woodworking.Production.ActiveProgram.Name',
  machineRuntime: 'ns=4;s=Woodworking.State.Machine.Overview.RunTime',
  toolId: 'ns=4;s=Woodworking.Production.ActiveProgram.CurrentToolId',
  // Events
  eventDispatcher: 'ns=4;s=Woodworking.Events.EventDispatcher',
  // ─── Phase 2: Write Targets (OPC UA Method nodes) ─────────────────────────
  /** Method: Start program execution */
  startProgramMethod: 'ns=4;s=Woodworking.Production.Methods.StartProgram',
  /** Method: Pause/hold current execution */
  pauseMethod: 'ns=4;s=Woodworking.Production.Methods.Pause',
  /** Method: Resume paused execution */
  resumeMethod: 'ns=4;s=Woodworking.Production.Methods.Resume',
  /** Method: Abort/stop execution */
  abortMethod: 'ns=4;s=Woodworking.Production.Methods.Abort',
  /** Variable: Write program name before start */
  programNameWrite: 'ns=4;s=Woodworking.Production.ActiveProgram.Name',
  /** Object: Parent of production methods */
  productionObject: 'ns=4;s=Woodworking.Production',
} as const;

export class BiesseAdapter extends BaseMachineAdapter {
  private client: OPCUAClient | null = null;
  private session: ClientSession | null = null;
  private subscription: ClientSubscription | null = null;
  private pollingTimer: NodeJS.Timeout | null = null;

  constructor(
    endpoint: MachineEndpoint,
    private readonly clientCertificateManager?: OPCUACertificateManager,
  ) {
    super(endpoint);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    this.logger.info(
      { endpoint: this.endpoint.opcuaEndpoint },
      'Connecting to Biesse via OPC UA...',
    );

    const securityMode = this.resolveSecurityMode(opcuaConfig.securityMode);
    const securityPolicy = this.resolveSecurityPolicy(opcuaConfig.securityPolicy);

    this.client = OPCUAClient.create({
      applicationName: opcuaConfig.applicationName,
      applicationUri: opcuaConfig.applicationUri,
      securityMode,
      securityPolicy,
      endpointMustExist: false,
      connectionStrategy: {
        initialDelay: 1000,
        maxRetry: 5,
        maxDelay: 10000,
      },
      certificateFile: opcuaConfig.certificatePath,
      privateKeyFile: opcuaConfig.privateKeyPath,
      clientCertificateManager: this.clientCertificateManager,
    });

    await this.client.connect(this.endpoint.opcuaEndpoint!);
    this.session = await this.client.createSession();
    this._isConnected = true;

    this.logger.info('OPC UA session established with Biesse');

    // Set up subscriptions for real-time monitoring
    await this.setupSubscriptions();

    // Start polling for telemetry
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from Biesse...');
    this.stopPolling();

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
    this.logger.info('Disconnected from Biesse');
  }

  async ping(): Promise<boolean> {
    if (!this.session) return false;
    try {
      const result = await this.session.read({
        nodeId: 'ns=0;i=2259', // Server_ServerStatus_State
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

    const nodesToRead = [
      { nodeId: WW_NODES.currentState, attributeId: AttributeIds.Value },
      { nodeId: WW_NODES.currentMode, attributeId: AttributeIds.Value },
      { nodeId: WW_NODES.spindleOverride, attributeId: AttributeIds.Value },
      { nodeId: WW_NODES.feedOverride, attributeId: AttributeIds.Value },
      { nodeId: WW_NODES.partCounter, attributeId: AttributeIds.Value },
      { nodeId: WW_NODES.programName, attributeId: AttributeIds.Value },
      { nodeId: WW_NODES.machineRuntime, attributeId: AttributeIds.Value },
      { nodeId: WW_NODES.toolId, attributeId: AttributeIds.Value },
    ];

    const results = await this.session!.read(nodesToRead);

    const snapshot: MachineStateSnapshot = {
      machineId: this.endpoint.machineId,
      timestamp: new Date(),
      state: this.mapToWwState(results[0]?.value?.value),
      mode: this.mapToWwMode(results[1]?.value?.value),
      spindleSpeed: results[2]?.value?.value ?? 0,
      feedRate: results[3]?.value?.value ?? 0,
      partCount: results[4]?.value?.value ?? 0,
      currentProgram: results[5]?.value?.value ?? undefined,
      runtimeSeconds: results[6]?.value?.value ?? 0,
      toolId: String(results[7]?.value?.value ?? 'unknown'),
      activeAlarms: [],
    };

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
      { nodeId: WW_NODES.spindleOverride, attributeId: AttributeIds.Value },
      { nodeId: WW_NODES.feedOverride, attributeId: AttributeIds.Value },
    ]);

    const points: SensorDataPoint[] = [
      {
        sensorId: `${this.endpoint.machineId}-spindle`,
        machineId: this.endpoint.machineId,
        measurement: 'spindle_override',
        value: results[0]?.value?.value ?? 0,
        unit: '%',
        timestamp: now,
        quality: this.mapQuality(results[0]),
        tags: { vendor: 'biesse', type: 'cnc_router' },
      },
      {
        sensorId: `${this.endpoint.machineId}-feed`,
        machineId: this.endpoint.machineId,
        measurement: 'feed_override',
        value: results[1]?.value?.value ?? 0,
        unit: '%',
        timestamp: now,
        quality: this.mapQuality(results[1]),
        tags: { vendor: 'biesse', type: 'cnc_router' },
      },
    ];

    this.emitTelemetry(points);
    return points;
  }

  // ─── OPC UA Subscription Setup ─────────────────────────────────────────────

  private async setupSubscriptions(): Promise<void> {
    this.ensureSession();

    this.subscription = ClientSubscription.create(this.session!, {
      requestedPublishingInterval: this.endpoint.publishIntervalMs,
      requestedMaxKeepAliveCount: 20,
      requestedLifetimeCount: 100,
      maxNotificationsPerPublish: 50,
      publishingEnabled: true,
      priority: 10,
    });

    this.subscription.on('started', () => {
      this.logger.info(
        { subscriptionId: this.subscription?.subscriptionId },
        'OPC UA subscription started',
      );
    });

    // Monitor state changes
    const stateMonitor = ClientMonitoredItem.create(
      this.subscription,
      { nodeId: WW_NODES.currentState, attributeId: AttributeIds.Value },
      { samplingInterval: 250, discardOldest: true, queueSize: 10 } as MonitoringParametersOptions,
      TimestampsToReturn.Both,
    );

    stateMonitor.on('changed', (dataValue: DataValue) => {
      const newState = this.mapToWwState(dataValue.value?.value);
      const previousState = this._lastState ?? WwUnitState.OFFLINE;
      this.emitStateChange(previousState, newState);
    });

    this.logger.info('OPC UA subscriptions configured for state monitoring');
  }

  // ─── Polling ───────────────────────────────────────────────────────────────

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

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private ensureSession(): void {
    if (!this.session || !this._isConnected) {
      throw new Error(`BiesseAdapter [${this.adapterId}]: No active OPC UA session`);
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
    if (dataValue.statusCode.isGoodish?.()) return DataQuality.UNCERTAIN;
    return DataQuality.BAD;
  }

  private resolveSecurityMode(mode: string): MessageSecurityMode {
    switch (mode) {
      case 'SignAndEncrypt': return MessageSecurityMode.SignAndEncrypt;
      case 'Sign': return MessageSecurityMode.Sign;
      default: return MessageSecurityMode.None;
    }
  }

  private resolveSecurityPolicy(policy: string): SecurityPolicy {
    return (policy as SecurityPolicy) ?? SecurityPolicy.Basic256Sha256;
  }

  // ─── Phase 2: Write Operations (Bi-directional Command Layer) ──────────────

  /**
   * Start a job on the Biesse machine via OPC UA Method Call.
   * Writes program name → calls StartProgram method.
   * Based on OPC-40550-1 Section 9.3 Production Methods.
   */
  async startJob(jobId: string, programRef: string): Promise<boolean> {
    this.ensureSession();
    this.logger.info({ jobId, programRef }, 'OPC UA Write: START_JOB');

    // Step 1: Write program name to machine buffer
    const writeResult = await this.session!.write({
      nodeId: WW_NODES.programNameWrite,
      attributeId: AttributeIds.Value,
      value: {
        value: {
          dataType: DataType.String,
          value: programRef,
        },
      },
    });

    if (!writeResult.isGood()) {
      this.logger.error(
        { statusCode: writeResult.toString(), programRef },
        'Failed to write program name',
      );
      return false;
    }

    // Step 2: Call StartProgram method with jobId as input argument
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
      'StartProgram method call result',
    );

    return success;
  }

  /**
   * Pause current job via OPC UA Method Call.
   * Machine transitions from WORKING → STANDBY.
   */
  async pauseJob(): Promise<boolean> {
    this.ensureSession();
    this.logger.info('OPC UA Write: PAUSE_JOB');

    const callResult = await this.session!.call({
      objectId: WW_NODES.productionObject,
      methodId: WW_NODES.pauseMethod,
      inputArguments: [],
    } as CallMethodRequestLike);

    const success = callResult.statusCode.isGood();
    this.logger.info(
      { success, statusCode: callResult.statusCode.toString() },
      'Pause method call result',
    );

    return success;
  }

  /**
   * Resume paused job via OPC UA Method Call.
   * Machine transitions from STANDBY → WORKING.
   */
  async resumeJob(): Promise<boolean> {
    this.ensureSession();
    this.logger.info('OPC UA Write: RESUME_JOB');

    const callResult = await this.session!.call({
      objectId: WW_NODES.productionObject,
      methodId: WW_NODES.resumeMethod,
      inputArguments: [],
    } as CallMethodRequestLike);

    const success = callResult.statusCode.isGood();
    this.logger.info(
      { success, statusCode: callResult.statusCode.toString() },
      'Resume method call result',
    );

    return success;
  }

  /**
   * Abort current job via OPC UA Method Call.
   * Machine transitions to READY (graceful) or triggers E-STOP.
   */
  async abortJob(): Promise<boolean> {
    this.ensureSession();
    this.logger.warn('OPC UA Write: ABORT_JOB');

    const callResult = await this.session!.call({
      objectId: WW_NODES.productionObject,
      methodId: WW_NODES.abortMethod,
      inputArguments: [],
    } as CallMethodRequestLike);

    const success = callResult.statusCode.isGood();
    this.logger.info(
      { success, statusCode: callResult.statusCode.toString() },
      'Abort method call result',
    );

    return success;
  }
}
