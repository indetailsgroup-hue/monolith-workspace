/**
 * MONOLITH Digital Shadow — Integration Test
 * Mock OPC UA Server simulating Biesse CNC Router
 * Tests complete state transition lifecycle:
 *
 * OFFLINE → STANDBY → READY → WORKING → READY → STANDBY → OFFLINE
 *                                ↓ (error path)
 *                              ERROR → READY
 *
 * Also tests: Job lifecycle, telemetry flow, event emission
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  OPCUACertificateManager,
  OPCUAServer,
  Variant,
  DataType,
} from 'node-opcua';
import { BiesseAdapter } from '../../src/adapters/BiesseAdapter';
import { WwUnitState, WwUnitMode, MachineVendor, AdapterProtocol } from '../../src/types/machine';
import type { MachineAlarm, MachineEndpoint } from '../../src/types/machine';

// ─── Mock OPC UA Server (simulates Biesse Rover A) ──────────────────────────

const TEST_PORT = 48400 + Math.floor(Math.random() * 100);
const TEST_ENDPOINT = `opc.tcp://localhost:${TEST_PORT}`;
const TEST_PKI_ROOT = mkdtempSync(join(tmpdir(), 'monolith-opcua-integration-'));

/** Mutable server state — changed during tests to simulate transitions */
const serverState = {
  currentState: WwUnitState.OFFLINE,
  currentMode: WwUnitMode.OTHER,
  spindleOverride: 0,
  feedOverride: 0,
  partCounter: 0,
  programName: '',
  runtime: 0,
  toolId: 'T0',
};

class TestBiesseAdapter extends BiesseAdapter {
  emitTestStateChange(previousState: WwUnitState, newState: WwUnitState): void {
    this.emitStateChange(previousState, newState);
  }

  emitTestAlarm(alarm: MachineAlarm): void {
    this.emitAlarm(alarm);
  }
}

let server: OPCUAServer;
let clientPkiCounter = 0;

function createTestAdapter(): TestBiesseAdapter {
  clientPkiCounter += 1;
  const clientCertificateManager = new OPCUACertificateManager({
    rootFolder: join(TEST_PKI_ROOT, `client-pki-${clientPkiCounter}`),
    automaticallyAcceptUnknownCertificate: true,
  });
  return new TestBiesseAdapter(testEndpoint, clientCertificateManager);
}

async function createMockOpcuaServer(): Promise<OPCUAServer> {
  const serverCertificateManager = new OPCUACertificateManager({
    rootFolder: join(TEST_PKI_ROOT, 'server-pki'),
    automaticallyAcceptUnknownCertificate: true,
  });
  const userCertificateManager = new OPCUACertificateManager({
    rootFolder: join(TEST_PKI_ROOT, 'user-pki'),
    automaticallyAcceptUnknownCertificate: true,
  });

  server = new OPCUAServer({
    port: TEST_PORT,
    resourcePath: '/UA/BiesseTest',
    serverCertificateManager,
    userCertificateManager,
    buildInfo: {
      productName: 'Biesse Rover A Simulator',
      buildNumber: '1.0.0',
      buildDate: new Date(),
    },
    allowAnonymous: true,
  });

  await server.initialize();

  const addressSpace = server.engine.addressSpace!;
  // Real Biesse servers expose the OPC-40550-1 Woodworking companion model at
  // namespace index 4. Reserve indexes 2 and 3 so the simulator exercises the
  // same node IDs used by BiesseAdapter instead of silently returning BadNodeId.
  addressSpace.registerNamespace('urn:monolith:test:reserved-2');
  addressSpace.registerNamespace('urn:monolith:test:reserved-3');
  const namespace = addressSpace.registerNamespace('http://opcfoundation.org/UA/Woodworking/');

  // Create Woodworking folder structure (mimics OPC-40550-1)
  const woodworkingFolder = namespace.addFolder(addressSpace.rootFolder.objects, {
    browseName: 'Woodworking',
  });

  const stateFolder = namespace.addFolder(woodworkingFolder, {
    browseName: 'State',
  });

  const machineFolder = namespace.addFolder(stateFolder, {
    browseName: 'Machine',
  });

  const overviewFolder = namespace.addFolder(machineFolder, {
    browseName: 'Overview',
  });

  const valuesFolder = namespace.addFolder(machineFolder, {
    browseName: 'Values',
  });

  const productionFolder = namespace.addFolder(woodworkingFolder, {
    browseName: 'Production',
  });

  const activeProgramFolder = namespace.addFolder(productionFolder, {
    browseName: 'ActiveProgram',
  });

  // ─── WwUnitStateEnumeration Variable ──────────────────────────────────────

  namespace.addVariable({
    componentOf: overviewFolder,
    browseName: 'CurrentState',
    nodeId: 'ns=4;s=Woodworking.State.Machine.Overview.CurrentState',
    dataType: 'Int32',
    value: {
      get: () => new Variant({ dataType: DataType.Int32, value: serverState.currentState }),
    },
  });

  // ─── WwUnitModeEnumeration Variable ───────────────────────────────────────

  namespace.addVariable({
    componentOf: overviewFolder,
    browseName: 'CurrentMode',
    nodeId: 'ns=4;s=Woodworking.State.Machine.Overview.CurrentMode',
    dataType: 'Int32',
    value: {
      get: () => new Variant({ dataType: DataType.Int32, value: serverState.currentMode }),
    },
  });

  // ─── SpindleOverride ──────────────────────────────────────────────────────

  namespace.addVariable({
    componentOf: valuesFolder,
    browseName: 'SpindleOverride',
    nodeId: 'ns=4;s=Woodworking.State.Machine.Values.SpindleOverride',
    dataType: 'Double',
    value: {
      get: () => new Variant({ dataType: DataType.Double, value: serverState.spindleOverride }),
    },
  });

  // ─── FeedOverride ─────────────────────────────────────────────────────────

  namespace.addVariable({
    componentOf: valuesFolder,
    browseName: 'FeedOverride',
    nodeId: 'ns=4;s=Woodworking.State.Machine.Values.FeedOverride',
    dataType: 'Double',
    value: {
      get: () => new Variant({ dataType: DataType.Double, value: serverState.feedOverride }),
    },
  });

  // ─── PartsCounter ─────────────────────────────────────────────────────────

  namespace.addVariable({
    componentOf: activeProgramFolder,
    browseName: 'PartsCounter',
    nodeId: 'ns=4;s=Woodworking.Production.ActiveProgram.PartsCounter',
    dataType: 'Int32',
    value: {
      get: () => new Variant({ dataType: DataType.Int32, value: serverState.partCounter }),
    },
  });

  // ─── Program Name ─────────────────────────────────────────────────────────

  namespace.addVariable({
    componentOf: activeProgramFolder,
    browseName: 'Name',
    nodeId: 'ns=4;s=Woodworking.Production.ActiveProgram.Name',
    dataType: 'String',
    value: {
      get: () => new Variant({ dataType: DataType.String, value: serverState.programName }),
    },
  });

  // ─── Runtime ──────────────────────────────────────────────────────────────

  namespace.addVariable({
    componentOf: overviewFolder,
    browseName: 'RunTime',
    nodeId: 'ns=4;s=Woodworking.State.Machine.Overview.RunTime',
    dataType: 'Double',
    value: {
      get: () => new Variant({ dataType: DataType.Double, value: serverState.runtime }),
    },
  });

  // ─── Current Tool ID ──────────────────────────────────────────────────────

  namespace.addVariable({
    componentOf: activeProgramFolder,
    browseName: 'CurrentToolId',
    nodeId: 'ns=4;s=Woodworking.Production.ActiveProgram.CurrentToolId',
    dataType: 'String',
    value: {
      get: () => new Variant({ dataType: DataType.String, value: serverState.toolId }),
    },
  });

  await server.start();
  return server;
}

// ─── Test Configuration ──────────────────────────────────────────────────────

const testEndpoint: MachineEndpoint = {
  machineId: 'biesse-rover-test',
  displayName: 'Biesse Rover A (Integration Test)',
  vendor: MachineVendor.BIESSE,
  protocol: AdapterProtocol.OPCUA_NATIVE,
  opcuaEndpoint: TEST_ENDPOINT,
  pollingIntervalMs: 500,
  publishIntervalMs: 250,
  monitoredNodes: [
    'ns=4;s=Woodworking.State.Machine.Overview.CurrentState',
    'ns=4;s=Woodworking.State.Machine.Overview.CurrentMode',
  ],
};

// ─── Helper: Update server state (simulates PLC changes) ─────────────────────

function simulateMachineTransition(transition: Partial<typeof serverState>): void {
  Object.assign(serverState, transition);
}

function resetServerState(): void {
  serverState.currentState = WwUnitState.OFFLINE;
  serverState.currentMode = WwUnitMode.OTHER;
  serverState.spindleOverride = 0;
  serverState.feedOverride = 0;
  serverState.partCounter = 0;
  serverState.programName = '';
  serverState.runtime = 0;
  serverState.toolId = 'T0';
}

// ─── Integration Tests ───────────────────────────────────────────────────────

describe('BiesseAdapter Integration — Full Lifecycle', () => {
  let adapter: TestBiesseAdapter;

  beforeAll(async () => {
    // Start mock OPC UA server
    await createMockOpcuaServer();
    console.log(`Mock OPC UA server running on port ${TEST_PORT}`);
  }, 30000);

  afterAll(async () => {
    if (adapter?.isConnected) {
      await adapter.disconnect();
    }
    if (server) {
      await server.shutdown();
    }
    rmSync(TEST_PKI_ROOT, { recursive: true, force: true });
  }, 15000);

  beforeEach(() => {
    resetServerState();
  });

  // ─── Connection Tests ────────────────────────────────────────────────────

  describe('Connection Lifecycle', () => {
    it('should connect to OPC UA server successfully', async () => {
      adapter = createTestAdapter();
      await adapter.connect();

      expect(adapter.isConnected).toBe(true);
    }, 10000);

    it('should ping the server and get true', async () => {
      const alive = await adapter.ping();
      expect(alive).toBe(true);
    });

    it('should disconnect cleanly', async () => {
      await adapter.disconnect();
      expect(adapter.isConnected).toBe(false);
    });

    it('should reconnect after disconnect', async () => {
      adapter = createTestAdapter();
      await adapter.connect();
      expect(adapter.isConnected).toBe(true);
    }, 10000);
  });

  // ─── State Reading Tests ─────────────────────────────────────────────────

  describe('State Reading — WwUnitStateEnumeration', () => {
    it('should read OFFLINE state (0)', async () => {
      simulateMachineTransition({ currentState: WwUnitState.OFFLINE });
      const state = await adapter.readUnitState();
      expect(state).toBe(WwUnitState.OFFLINE);
    });

    it('should read STANDBY state (1)', async () => {
      simulateMachineTransition({ currentState: WwUnitState.STANDBY });
      const state = await adapter.readUnitState();
      expect(state).toBe(WwUnitState.STANDBY);
    });

    it('should read READY state (2)', async () => {
      simulateMachineTransition({ currentState: WwUnitState.READY });
      const state = await adapter.readUnitState();
      expect(state).toBe(WwUnitState.READY);
    });

    it('should read WORKING state (3)', async () => {
      simulateMachineTransition({ currentState: WwUnitState.WORKING });
      const state = await adapter.readUnitState();
      expect(state).toBe(WwUnitState.WORKING);
    });

    it('should read ERROR state (4)', async () => {
      simulateMachineTransition({ currentState: WwUnitState.ERROR });
      const state = await adapter.readUnitState();
      expect(state).toBe(WwUnitState.ERROR);
    });
  });

  describe('Mode Reading — WwUnitModeEnumeration', () => {
    it('should read AUTOMATIC mode (1)', async () => {
      simulateMachineTransition({ currentMode: WwUnitMode.AUTOMATIC });
      const mode = await adapter.readUnitMode();
      expect(mode).toBe(WwUnitMode.AUTOMATIC);
    });

    it('should read MANUAL mode (3)', async () => {
      simulateMachineTransition({ currentMode: WwUnitMode.MANUAL });
      const mode = await adapter.readUnitMode();
      expect(mode).toBe(WwUnitMode.MANUAL);
    });

    it('should read SETUP mode (4)', async () => {
      simulateMachineTransition({ currentMode: WwUnitMode.SETUP });
      const mode = await adapter.readUnitMode();
      expect(mode).toBe(WwUnitMode.SETUP);
    });
  });

  // ─── Full State Snapshot Tests ───────────────────────────────────────────

  describe('Full State Snapshot', () => {
    it('should read complete machine state during WORKING', async () => {
      simulateMachineTransition({
        currentState: WwUnitState.WORKING,
        currentMode: WwUnitMode.AUTOMATIC,
        spindleOverride: 18000,
        feedOverride: 95,
        partCounter: 42,
        programName: 'cabinet-door-001.nc',
        runtime: 7200,
        toolId: 'T12',
      });

      const snapshot = await adapter.readState();

      expect(snapshot.machineId).toBe('biesse-rover-test');
      expect(snapshot.state).toBe(WwUnitState.WORKING);
      expect(snapshot.mode).toBe(WwUnitMode.AUTOMATIC);
      expect(snapshot.spindleSpeed).toBe(18000);
      expect(snapshot.feedRate).toBe(95);
      expect(snapshot.partCount).toBe(42);
      expect(snapshot.currentProgram).toBe('cabinet-door-001.nc');
      expect(snapshot.runtimeSeconds).toBe(7200);
      expect(snapshot.toolId).toBe('T12');
      expect(snapshot.timestamp).toBeInstanceOf(Date);
    });

    it('should read idle machine state', async () => {
      simulateMachineTransition({
        currentState: WwUnitState.STANDBY,
        currentMode: WwUnitMode.OTHER,
        spindleOverride: 0,
        feedOverride: 0,
        partCounter: 0,
        programName: '',
        runtime: 100,
        toolId: 'T0',
      });

      const snapshot = await adapter.readState();

      expect(snapshot.state).toBe(WwUnitState.STANDBY);
      expect(snapshot.spindleSpeed).toBe(0);
      expect(snapshot.feedRate).toBe(0);
      expect(snapshot.currentProgram).toBe('');
    });
  });

  // ─── Telemetry Tests ─────────────────────────────────────────────────────

  describe('Telemetry Reading', () => {
    it('should read spindle and feed telemetry', async () => {
      simulateMachineTransition({
        spindleOverride: 15000,
        feedOverride: 80,
      });

      const telemetry = await adapter.readTelemetry();

      expect(telemetry.length).toBeGreaterThanOrEqual(2);

      const spindlePoint = telemetry.find((p) => p.measurement === 'spindle_override');
      const feedPoint = telemetry.find((p) => p.measurement === 'feed_override');

      expect(spindlePoint).toBeDefined();
      expect(spindlePoint!.value).toBe(15000);
      expect(spindlePoint!.unit).toBe('%');
      expect(spindlePoint!.machineId).toBe('biesse-rover-test');

      expect(feedPoint).toBeDefined();
      expect(feedPoint!.value).toBe(80);
    });

    it('should return zero values when machine is idle', async () => {
      simulateMachineTransition({
        spindleOverride: 0,
        feedOverride: 0,
      });

      const telemetry = await adapter.readTelemetry();
      const spindlePoint = telemetry.find((p) => p.measurement === 'spindle_override');

      expect(spindlePoint!.value).toBe(0);
    });
  });

  // ─── State Transition Lifecycle Tests ────────────────────────────────────

  describe('Complete State Transition Lifecycle', () => {
    it('should track: OFFLINE → STANDBY → READY → WORKING → READY → STANDBY', async () => {
      const stateHistory: WwUnitState[] = [];

      // Step 1: Machine boots up (OFFLINE → STANDBY)
      simulateMachineTransition({
        currentState: WwUnitState.OFFLINE,
        currentMode: WwUnitMode.OTHER,
      });
      let state = await adapter.readUnitState();
      stateHistory.push(state);
      expect(state).toBe(WwUnitState.OFFLINE);

      // Step 2: Machine initializes (STANDBY)
      simulateMachineTransition({
        currentState: WwUnitState.STANDBY,
        currentMode: WwUnitMode.OTHER,
      });
      state = await adapter.readUnitState();
      stateHistory.push(state);
      expect(state).toBe(WwUnitState.STANDBY);

      // Step 3: Operator loads program (READY)
      simulateMachineTransition({
        currentState: WwUnitState.READY,
        currentMode: WwUnitMode.AUTOMATIC,
        programName: 'shelf-panel-003.nc',
        toolId: 'T5',
      });
      state = await adapter.readUnitState();
      stateHistory.push(state);
      expect(state).toBe(WwUnitState.READY);

      // Step 4: Job starts (WORKING)
      simulateMachineTransition({
        currentState: WwUnitState.WORKING,
        currentMode: WwUnitMode.AUTOMATIC,
        spindleOverride: 18000,
        feedOverride: 100,
      });
      state = await adapter.readUnitState();
      stateHistory.push(state);
      expect(state).toBe(WwUnitState.WORKING);

      // Verify telemetry during work
      const telemetry = await adapter.readTelemetry();
      expect(telemetry.find((p) => p.measurement === 'spindle_override')!.value).toBe(18000);

      // Step 5: Job completes (back to READY)
      simulateMachineTransition({
        currentState: WwUnitState.READY,
        spindleOverride: 0,
        feedOverride: 0,
        partCounter: 1,
      });
      state = await adapter.readUnitState();
      stateHistory.push(state);
      expect(state).toBe(WwUnitState.READY);

      // Step 6: Operator puts machine in standby
      simulateMachineTransition({
        currentState: WwUnitState.STANDBY,
        currentMode: WwUnitMode.OTHER,
      });
      state = await adapter.readUnitState();
      stateHistory.push(state);
      expect(state).toBe(WwUnitState.STANDBY);

      // Verify complete lifecycle
      expect(stateHistory).toEqual([
        WwUnitState.OFFLINE,
        WwUnitState.STANDBY,
        WwUnitState.READY,
        WwUnitState.WORKING,
        WwUnitState.READY,
        WwUnitState.STANDBY,
      ]);
    });

    it('should handle ERROR path: WORKING → ERROR → READY', async () => {
      // Start in WORKING state
      simulateMachineTransition({
        currentState: WwUnitState.WORKING,
        currentMode: WwUnitMode.AUTOMATIC,
        spindleOverride: 18000,
        feedOverride: 100,
        programName: 'wardrobe-side.nc',
      });
      let snapshot = await adapter.readState();
      expect(snapshot.state).toBe(WwUnitState.WORKING);

      // Machine hits an error (tool breakage, collision, etc.)
      simulateMachineTransition({
        currentState: WwUnitState.ERROR,
        currentMode: WwUnitMode.OTHER,
        spindleOverride: 0,
        feedOverride: 0,
      });
      snapshot = await adapter.readState();
      expect(snapshot.state).toBe(WwUnitState.ERROR);
      expect(snapshot.spindleSpeed).toBe(0); // Emergency stop

      // Operator acknowledges alarm and resets
      simulateMachineTransition({
        currentState: WwUnitState.READY,
        currentMode: WwUnitMode.MANUAL,
      });
      snapshot = await adapter.readState();
      expect(snapshot.state).toBe(WwUnitState.READY);
      expect(snapshot.mode).toBe(WwUnitMode.MANUAL); // Manual mode after reset
    });
  });

  // ─── Job Production Simulation ───────────────────────────────────────────

  describe('Production Job Simulation — Batch Processing', () => {
    it('should simulate processing 5 cabinet parts sequentially', async () => {
      const partResults: { partNum: number; state: WwUnitState; partCount: number }[] = [];

      // Machine is ready
      simulateMachineTransition({
        currentState: WwUnitState.READY,
        currentMode: WwUnitMode.AUTOMATIC,
        programName: 'cabinet-door-v2.nc',
        toolId: 'T8',
        partCounter: 0,
      });

      for (let i = 1; i <= 5; i++) {
        // Start machining part i
        simulateMachineTransition({
          currentState: WwUnitState.WORKING,
          spindleOverride: 16000 + Math.floor(Math.random() * 2000),
          feedOverride: 90 + Math.floor(Math.random() * 10),
          partCounter: i - 1,
        });

        let snapshot = await adapter.readState();
        expect(snapshot.state).toBe(WwUnitState.WORKING);

        // Part complete — brief return to READY
        simulateMachineTransition({
          currentState: WwUnitState.READY,
          spindleOverride: 0,
          feedOverride: 0,
          partCounter: i,
        });

        snapshot = await adapter.readState();
        partResults.push({
          partNum: i,
          state: snapshot.state,
          partCount: snapshot.partCount,
        });
      }

      // Verify all 5 parts produced
      expect(partResults).toHaveLength(5);
      expect(partResults[4]!.partCount).toBe(5);
      expect(partResults.every((r) => r.state === WwUnitState.READY)).toBe(true);
    });

    it('should simulate tool change mid-production', async () => {
      // Working with tool T5
      simulateMachineTransition({
        currentState: WwUnitState.WORKING,
        currentMode: WwUnitMode.AUTOMATIC,
        toolId: 'T5',
        spindleOverride: 12000,
      });
      let snapshot = await adapter.readState();
      expect(snapshot.toolId).toBe('T5');

      // Machine pauses for tool change (goes to READY briefly)
      simulateMachineTransition({
        currentState: WwUnitState.READY,
        currentMode: WwUnitMode.AUTOMATIC,
        spindleOverride: 0,
      });
      snapshot = await adapter.readState();
      expect(snapshot.state).toBe(WwUnitState.READY);

      // New tool loaded, resume with T12
      simulateMachineTransition({
        currentState: WwUnitState.WORKING,
        toolId: 'T12',
        spindleOverride: 18000,
      });
      snapshot = await adapter.readState();
      expect(snapshot.state).toBe(WwUnitState.WORKING);
      expect(snapshot.toolId).toBe('T12');
      expect(snapshot.spindleSpeed).toBe(18000);
    });
  });

  // ─── Event Emission Tests ────────────────────────────────────────────────

  describe('Event Emission on State Transitions', () => {
    it('should emit stateChange event when transitioning', async () => {
      const stateChanges: Array<{
        machineId: string;
        prev: WwUnitState;
        next: WwUnitState;
      }> = [];

      adapter.onStateChange((machineId, prev, next) => {
        stateChanges.push({ machineId, prev, next });
      });

      // Simulate READY → WORKING transition via adapter's internal mechanism
      // First read to set _lastState
      simulateMachineTransition({ currentState: WwUnitState.READY });
      await adapter.readState();

      // Now trigger the emitStateChange (simulating subscription callback)
      adapter.emitTestStateChange(WwUnitState.READY, WwUnitState.WORKING);

      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]).toEqual({
        machineId: 'biesse-rover-test',
        prev: WwUnitState.READY,
        next: WwUnitState.WORKING,
      });
    });

    it('should not emit event when state remains the same', () => {
      const stateChanges: unknown[] = [];
      adapter.onStateChange((...args) => stateChanges.push(args));

      // Same state → no emission
      adapter.emitTestStateChange(WwUnitState.WORKING, WwUnitState.WORKING);

      expect(stateChanges).toHaveLength(0);
    });

    it('should emit alarm event', () => {
      const alarms: unknown[] = [];
      adapter.onAlarm((event) => alarms.push(event));

      adapter.emitTestAlarm({
        alarmId: 'ALM-001',
        severity: 'CRITICAL',
        message: 'Spindle overload detected',
        timestamp: new Date(),
        acknowledged: false,
      });

      expect(alarms).toHaveLength(1);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle rapid state transitions', async () => {
      const states = [
        WwUnitState.READY,
        WwUnitState.WORKING,
        WwUnitState.READY,
        WwUnitState.WORKING,
        WwUnitState.ERROR,
        WwUnitState.READY,
      ];

      for (const expectedState of states) {
        simulateMachineTransition({ currentState: expectedState });
        const actualState = await adapter.readUnitState();
        expect(actualState).toBe(expectedState);
      }
    });

    it('should handle invalid state value gracefully', async () => {
      // Force an invalid state value (99)
      serverState.currentState = 99 as WwUnitState;
      const state = await adapter.readUnitState();
      // Should default to OFFLINE for unknown values
      expect(state).toBe(WwUnitState.OFFLINE);
    });

    it('should read state correctly after brief network jitter', async () => {
      simulateMachineTransition({
        currentState: WwUnitState.WORKING,
        spindleOverride: 18000,
      });

      // Multiple rapid reads (simulates jitter recovery)
      const results = await Promise.all([
        adapter.readState(),
        adapter.readState(),
        adapter.readState(),
      ]);

      // All should return consistent state
      results.forEach((snapshot) => {
        expect(snapshot.state).toBe(WwUnitState.WORKING);
        expect(snapshot.spindleSpeed).toBe(18000);
      });
    });
  });

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  describe('Cleanup', () => {
    it('should disconnect adapter at end of test suite', async () => {
      await adapter.disconnect();
      expect(adapter.isConnected).toBe(false);
    });
  });
});
