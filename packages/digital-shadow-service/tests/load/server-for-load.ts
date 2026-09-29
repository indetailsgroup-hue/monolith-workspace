/**
 * Standalone server for load testing (same as E2E setup but as a script)
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

import { createCommandRoutes } from '../../src/api/commands';
import { CommandDispatcher } from '../../src/services/CommandDispatcher';
import type { IMachineAdapter } from '../../src/adapters/IMachineAdapter';
import { WwUnitState, WwUnitMode, MachineVendor } from '../../src/types/machine';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6399';
const PORT = parseInt(process.env.PORT || '3199');

function createMockAdapter(machineId: string, vendor: MachineVendor): IMachineAdapter {
  const emitter = new EventEmitter();
  let state = WwUnitState.READY;
  let connected = true;

  const adapter: any = Object.assign(emitter, {
    adapterId: `adapter-${machineId}`,
    endpoint: { machineId, vendor, protocol: 'opcua', address: `opc.tcp://mock:4840/${machineId}` },
    connect: async () => { connected = true; },
    disconnect: async () => { connected = false; },
    ping: async () => connected,
    readUnitState: async () => state,
    readUnitMode: async () => WwUnitMode.AUTOMATIC,
    readState: async () => ({
      machineId, state, mode: WwUnitMode.AUTOMATIC, timestamp: new Date(),
      spindleSpeed: 12000 + Math.random() * 3000,
      feedRate: 8 + Math.random() * 4,
      toolId: 'T01', partCount: Math.floor(Math.random() * 100),
      runtimeSeconds: Math.floor(Math.random() * 28800),
      activeAlarms: [],
    }),
    readTelemetry: async () => [],
    onStateChange: () => {},
    onAlarm: () => {},
    onTelemetry: () => {},
    startJob: async () => {
      setTimeout(() => { state = WwUnitState.WORKING; }, 50 + Math.random() * 100);
      return true;
    },
    pauseJob: async () => {
      setTimeout(() => { state = WwUnitState.STANDBY; }, 30 + Math.random() * 50);
      return true;
    },
    resumeJob: async () => {
      setTimeout(() => { state = WwUnitState.WORKING; }, 30 + Math.random() * 50);
      return true;
    },
    abortJob: async () => {
      setTimeout(() => { state = WwUnitState.READY; }, 20 + Math.random() * 30);
      return true;
    },
  });

  Object.defineProperty(adapter, 'isConnected', { get: () => connected, enumerable: true });
  return adapter;
}

async function main() {
  const redis = new Redis(REDIS_URL);
  await redis.flushall();

  const adapters = new Map<string, IMachineAdapter>();
  adapters.set('biesse-rover-b-01', createMockAdapter('biesse-rover-b-01', MachineVendor.BIESSE));
  adapters.set('homag-centateq-p-01', createMockAdapter('homag-centateq-p-01', MachineVendor.HOMAG));
  adapters.set('kdt-kn3-01', createMockAdapter('kdt-kn3-01', MachineVendor.KDT));

  const dispatcher = new CommandDispatcher();
  await dispatcher.start(adapters);

  const app = new Hono();
  app.use('*', cors());
  app.get('/health', (c) => c.json({ service: 'monolith-digital-shadow-loadtest', status: 'running', timestamp: new Date().toISOString() }));
  app.route('/', createCommandRoutes(dispatcher));

  const server = serve({ fetch: app.fetch, port: PORT });
  console.log(`🔥 Load test server running on http://localhost:${PORT}`);
  console.log(`   Redis: ${REDIS_URL}`);
  console.log(`   Machines: ${[...adapters.keys()].join(', ')}`);

  process.on('SIGINT', async () => {
    await dispatcher.stop();
    await redis.quit();
    server.close();
    process.exit(0);
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
