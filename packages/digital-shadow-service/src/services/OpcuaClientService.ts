/**
 * MONOLITH Digital Shadow — OPC UA Client Service
 * Manages multiple OPC UA adapter connections and orchestrates data collection
 */

import pino from 'pino';
import type { IMachineAdapter } from '../adapters/IMachineAdapter';
import { createAdapter } from '../adapters';
import type { MachineEndpoint, MachineStateSnapshot } from '../types/machine';
import type { SensorDataPoint } from '../types/sensor';
import type { ServiceHealth, ConnectionHealth } from '../types/events';

export class OpcuaClientService {
  private logger = pino({ name: 'opcua-client-service' });
  private adapters: Map<string, IMachineAdapter> = new Map();
  private stateCache: Map<string, MachineStateSnapshot> = new Map();
  private startTime = Date.now();

  constructor(private endpoints: MachineEndpoint[]) {}

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.logger.info(
      { machineCount: this.endpoints.length },
      'Starting OPC UA Client Service...',
    );

    const connectPromises = this.endpoints.map(async (endpoint) => {
      try {
        const adapter = createAdapter(endpoint);
        this.adapters.set(endpoint.machineId, adapter);

        // Wire up event listeners
        this.wireAdapterEvents(adapter, endpoint.machineId);

        await adapter.connect();
        this.logger.info({ machineId: endpoint.machineId }, 'Adapter connected');
      } catch (err) {
        this.logger.error(
          { machineId: endpoint.machineId, err },
          'Failed to connect adapter — will retry',
        );
      }
    });

    await Promise.allSettled(connectPromises);

    const connected = [...this.adapters.values()].filter((a) => a.isConnected).length;
    this.logger.info(
      { total: this.endpoints.length, connected },
      'OPC UA Client Service started',
    );
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping OPC UA Client Service...');

    const disconnectPromises = [...this.adapters.values()].map(async (adapter) => {
      try {
        await adapter.disconnect();
      } catch (err) {
        this.logger.error({ adapterId: adapter.adapterId, err }, 'Disconnect error');
      }
    });

    await Promise.allSettled(disconnectPromises);
    this.adapters.clear();
    this.stateCache.clear();
    this.logger.info('OPC UA Client Service stopped');
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  getAdapter(machineId: string): IMachineAdapter | undefined {
    return this.adapters.get(machineId);
  }

  getAllAdapters(): IMachineAdapter[] {
    return [...this.adapters.values()];
  }

  async readAllStates(): Promise<Map<string, MachineStateSnapshot>> {
    const results = new Map<string, MachineStateSnapshot>();

    for (const [machineId, adapter] of this.adapters) {
      if (!adapter.isConnected) continue;
      try {
        const state = await adapter.readState();
        this.stateCache.set(machineId, state);
        results.set(machineId, state);
      } catch (err) {
        this.logger.error({ machineId, err }, 'Failed to read state');
      }
    }

    return results;
  }

  async readAllTelemetry(): Promise<SensorDataPoint[]> {
    const allPoints: SensorDataPoint[] = [];

    for (const [machineId, adapter] of this.adapters) {
      if (!adapter.isConnected) continue;
      try {
        const points = await adapter.readTelemetry();
        allPoints.push(...points);
      } catch (err) {
        this.logger.error({ machineId, err }, 'Failed to read telemetry');
      }
    }

    return allPoints;
  }

  getCachedState(machineId: string): MachineStateSnapshot | undefined {
    return this.stateCache.get(machineId);
  }

  // ─── Health Check ──────────────────────────────────────────────────────────

  getHealth(): ServiceHealth {
    const connections: ConnectionHealth[] = [...this.adapters.entries()].map(
      ([machineId, adapter]) => ({
        name: machineId,
        type: 'opcua' as const,
        status: adapter.isConnected ? 'connected' : 'disconnected',
        lastActivity: this.stateCache.get(machineId)?.timestamp ?? new Date(0),
        errorCount: 0,
      }),
    );

    const connectedCount = connections.filter((c) => c.status === 'connected').length;
    const total = connections.length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (connectedCount === total) status = 'healthy';
    else if (connectedCount > 0) status = 'degraded';
    else status = 'unhealthy';

    return {
      service: 'opcua-client-service',
      status,
      lastCheck: new Date(),
      details: { connectedCount, totalMachines: total },
      uptime: Date.now() - this.startTime,
      connections,
    };
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private wireAdapterEvents(adapter: IMachineAdapter, machineId: string): void {
    adapter.onStateChange((id, prev, next, _ts) => {
      this.logger.info({ machineId: id, prev, next }, 'State transition detected');
      // State change will be picked up by StateReconciliationEngine
    });

    adapter.onAlarm((event) => {
      this.logger.warn({ machineId, event }, 'Machine alarm received');
    });

    adapter.onTelemetry((points) => {
      this.logger.debug(
        { machineId, pointCount: points.length },
        'Telemetry batch received',
      );
    });
  }
}
