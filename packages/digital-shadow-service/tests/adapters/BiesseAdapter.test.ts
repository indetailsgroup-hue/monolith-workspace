/**
 * Tests for BiesseAdapter — OPC UA Woodworking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WwUnitState, WwUnitMode, MachineVendor, AdapterProtocol } from '../../src/types/machine';
import type { MachineEndpoint } from '../../src/types/machine';

// Mock node-opcua
vi.mock('node-opcua', () => ({
  OPCUAClient: {
    create: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      createSession: vi.fn(() => ({
        read: vi.fn(() => [
          { value: { value: 3 }, statusCode: { isGood: () => true } }, // WORKING
          { value: { value: 1 }, statusCode: { isGood: () => true } }, // AUTOMATIC
          { value: { value: 18000 }, statusCode: { isGood: () => true } }, // spindle
          { value: { value: 85 }, statusCode: { isGood: () => true } },   // feed
          { value: { value: 142 }, statusCode: { isGood: () => true } },  // parts
          { value: { value: 'program1.nc' }, statusCode: { isGood: () => true } },
          { value: { value: 3600 }, statusCode: { isGood: () => true } }, // runtime
          { value: { value: 'T12' }, statusCode: { isGood: () => true } }, // tool
        ]),
        close: vi.fn(),
      })),
    })),
  },
  ClientSubscription: { create: vi.fn(() => ({ terminate: vi.fn(), on: vi.fn(), subscriptionId: 1 })) },
  ClientMonitoredItem: { create: vi.fn(() => ({ on: vi.fn() })) },
  AttributeIds: { Value: 13 },
  TimestampsToReturn: { Both: 2 },
  MessageSecurityMode: { None: 1, Sign: 2, SignAndEncrypt: 3 },
  SecurityPolicy: { Basic256Sha256: 'Basic256Sha256' },
}));

vi.mock('../../src/config', () => ({
  opcuaConfig: {
    applicationName: 'TEST',
    applicationUri: 'urn:test',
    securityMode: 'None',
    securityPolicy: 'Basic256Sha256',
  },
}));

const TEST_ENDPOINT: MachineEndpoint = {
  machineId: 'biesse-test-01',
  displayName: 'Biesse Test CNC',
  vendor: MachineVendor.BIESSE,
  protocol: AdapterProtocol.OPCUA_NATIVE,
  opcuaEndpoint: 'opc.tcp://localhost:4840',
  pollingIntervalMs: 1000,
  publishIntervalMs: 500,
};

describe('BiesseAdapter', () => {
  let BiesseAdapter: typeof import('../../src/adapters/BiesseAdapter').BiesseAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../src/adapters/BiesseAdapter');
    BiesseAdapter = mod.BiesseAdapter;
  });

  it('should create adapter with correct ID', () => {
    const adapter = new BiesseAdapter(TEST_ENDPOINT);
    expect(adapter.adapterId).toBe('adapter-biesse-biesse-test-01');
    expect(adapter.isConnected).toBe(false);
  });

  it('should connect and set isConnected to true', async () => {
    const adapter = new BiesseAdapter(TEST_ENDPOINT);
    await adapter.connect();
    expect(adapter.isConnected).toBe(true);
  });

  it('should read machine state snapshot', async () => {
    const adapter = new BiesseAdapter(TEST_ENDPOINT);
    await adapter.connect();

    const state = await adapter.readState();

    expect(state.machineId).toBe('biesse-test-01');
    expect(state.state).toBe(WwUnitState.WORKING);
    expect(state.mode).toBe(WwUnitMode.AUTOMATIC);
    expect(state.spindleSpeed).toBe(18000);
    expect(state.feedRate).toBe(85);
    expect(state.partCount).toBe(142);
    expect(state.currentProgram).toBe('program1.nc');
    expect(state.toolId).toBe('T12');
  });

  it('should read telemetry data points', async () => {
    const adapter = new BiesseAdapter(TEST_ENDPOINT);
    await adapter.connect();

    const telemetry = await adapter.readTelemetry();

    expect(telemetry.length).toBeGreaterThan(0);
    expect(telemetry[0]?.machineId).toBe('biesse-test-01');
    expect(telemetry[0]?.measurement).toBe('spindle_override');
  });

  it('should disconnect cleanly', async () => {
    const adapter = new BiesseAdapter(TEST_ENDPOINT);
    await adapter.connect();
    await adapter.disconnect();
    expect(adapter.isConnected).toBe(false);
  });

  it('should emit stateChange event on transition', async () => {
    const adapter = new BiesseAdapter(TEST_ENDPOINT);
    const callback = vi.fn();
    adapter.onStateChange(callback);

    await adapter.connect();

    // Simulate state change via protected method
    (adapter as any).emitStateChange(WwUnitState.READY, WwUnitState.WORKING);

    expect(callback).toHaveBeenCalledWith(
      'biesse-test-01',
      WwUnitState.READY,
      WwUnitState.WORKING,
      expect.any(Date),
    );
  });
});
