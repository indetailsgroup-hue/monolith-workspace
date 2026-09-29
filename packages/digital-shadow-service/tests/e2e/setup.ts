/**
 * E2E Test Setup — Docker Compose lifecycle + Hono server
 * Boots Redis via docker-compose.e2e.yml, then starts a real Hono HTTP server
 * with mock adapters but real Redis, real CommandQueue, real CommandDispatcher.
 *
 * @module tests/e2e/setup
 */

import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { execSync } from 'node:child_process';

import { createCommandRoutes } from '../../src/api/commands';
import { CommandDispatcher } from '../../src/services/CommandDispatcher';
import type { IMachineAdapter } from '../../src/adapters/IMachineAdapter';
import { WwUnitState, WwUnitMode, MachineVendor } from '../../src/types/machine';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(__dirname, '../..');
const REDIS_E2E_PORT = 6399;
const REDIS_E2E_URL = `redis://localhost:${REDIS_E2E_PORT}`;
const SERVER_PORT = 3199;
export const BASE_URL = `http://localhost:${SERVER_PORT}`;

// ─── Redis Lifecycle (no Docker — assumes Redis is running externally) ────────

/**
 * In CI/Docker environments, call composeUp(). In sandbox/local dev,
 * ensure Redis is started manually on port 6399 before running E2E tests.
 */
export function composeUp(): void {
  // Docker Compose is used in CI. For local sandbox, Redis must be pre-started:
  //   redis-server --port 6399 --daemonize yes
  // This function is a no-op when Docker is not available.
  try {
    const COMPOSE_FILE = resolve(PROJECT_ROOT, 'docker-compose.e2e.yml');
    execSync(
      `docker compose -f ${COMPOSE_FILE} -p monolith-e2e up -d --wait`,
      { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 60_000 },
    );
  } catch {
    // Docker not available — assume Redis is already running on REDIS_E2E_PORT
  }
}

export function composeDown(): void {
  try {
    const COMPOSE_FILE = resolve(PROJECT_ROOT, 'docker-compose.e2e.yml');
    execSync(
      `docker compose -f ${COMPOSE_FILE} -p monolith-e2e down -v --remove-orphans`,
      { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 30_000 },
    );
  } catch {
    // Docker not available — no-op
  }
}

export async function waitForRedis(retries = 20, intervalMs = 500): Promise<void> {
  const redis = new Redis(REDIS_E2E_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });

  for (let i = 0; i < retries; i++) {
    try {
      await redis.connect();
      const pong = await redis.ping();
      if (pong === 'PONG') {
        await redis.quit();
        return;
      }
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  await redis.quit().catch(() => {});
  throw new Error(`Redis not ready after ${retries * intervalMs}ms`);
}

// ─── Mock Adapter Factory (E2E) ──────────────────────────────────────────────

export interface E2EMockAdapterOptions {
  machineId: string;
  vendor: MachineVendor;
  initialState?: WwUnitState;
  /** State to transition to after receiving a START command */
  stateAfterStart?: WwUnitState;
  /** State to transition to after receiving a PAUSE command */
  stateAfterPause?: WwUnitState;
  /** State to transition to after receiving an ABORT command */
  stateAfterAbort?: WwUnitState;
  /** Simulate failure on startJob */
  failStart?: boolean;
  /** Simulate disconnection */
  disconnected?: boolean;
}

export function createE2EAdapter(opts: E2EMockAdapterOptions): IMachineAdapter & { resetState: () => void } {
  const emitter = new EventEmitter();
  let state = opts.initialState ?? WwUnitState.READY;
  let connected = !(opts.disconnected ?? false);

  const adapter: IMachineAdapter & EventEmitter & { resetState: () => void } = Object.assign(emitter, {
    // Required interface fields
    adapterId: `adapter-${opts.machineId}`,
    endpoint: {
      machineId: opts.machineId,
      vendor: opts.vendor,
      protocol: 'opcua' as const,
      address: `opc.tcp://mock:4840/${opts.machineId}`,
    },

    // Reset state back to initial (for test isolation)
    resetState: () => {
      state = opts.initialState ?? WwUnitState.READY;
      connected = !(opts.disconnected ?? false);
    },

    connect: async () => { connected = true; },
    disconnect: async () => { connected = false; },
    ping: async () => connected,

    readUnitState: async () => state,
    readUnitMode: async () => WwUnitMode.AUTOMATIC,

    readState: async () => ({
      machineId: opts.machineId,
      state,
      mode: WwUnitMode.AUTOMATIC,
      timestamp: new Date(),
      spindleSpeed: 0,
      feedRate: 0,
      toolId: 'T01',
      partCount: 0,
      runtimeSeconds: 0,
      activeAlarms: [],
    }),

    readTelemetry: async () => [],

    // Subscriptions
    onStateChange: (_cb: any) => {},
    onAlarm: (_cb: any) => {},
    onTelemetry: (_cb: any) => {},

    // Phase 2 write methods
    startJob: async (_jobId: string, _programRef: string) => {
      if (!connected) throw new Error('Adapter disconnected');
      if (opts.failStart) throw new Error('Simulated start failure');
      // Transition state after a brief delay (simulate machine response)
      setTimeout(() => {
        state = opts.stateAfterStart ?? WwUnitState.WORKING;
      }, 100);
      return true;
    },

    pauseJob: async () => {
      if (!connected) throw new Error('Adapter disconnected');
      setTimeout(() => {
        state = opts.stateAfterPause ?? WwUnitState.STANDBY;
      }, 80);
      return true;
    },

    resumeJob: async () => {
      if (!connected) throw new Error('Adapter disconnected');
      setTimeout(() => {
        state = WwUnitState.WORKING;
      }, 80);
      return true;
    },

    abortJob: async () => {
      if (!connected) throw new Error('Adapter disconnected');
      setTimeout(() => {
        state = opts.stateAfterAbort ?? WwUnitState.READY;
      }, 50);
      return true;
    },
  });

  // Define isConnected as getter
  Object.defineProperty(adapter, 'isConnected', {
    get: () => connected,
    enumerable: true,
  });

  return adapter as any;
}

// ─── Server Factory ───────────────────────────────────────────────────────────

export interface E2EServer {
  server: ReturnType<typeof serve>;
  dispatcher: CommandDispatcher;
  redis: Redis;
  adapters: Map<string, IMachineAdapter>;
  resetAdapters: () => void;
  close: () => Promise<void>;
}

/**
 * Creates and starts the Hono server with real CommandDispatcher + real Redis.
 * Adapters are mocked but all other services are real.
 */
export async function createE2EServer(
  adapterOptions?: E2EMockAdapterOptions[],
): Promise<E2EServer> {
  // Override env for test Redis
  process.env.REDIS_URL = REDIS_E2E_URL;

  // Create adapters
  const defaultAdapters: E2EMockAdapterOptions[] = adapterOptions ?? [
    { machineId: 'biesse-rover-b-01', vendor: MachineVendor.BIESSE },
    { machineId: 'homag-centateq-p-01', vendor: MachineVendor.HOMAG },
    { machineId: 'kdt-kn3-01', vendor: MachineVendor.KDT },
  ];

  const adapters = new Map<string, IMachineAdapter>();
  for (const opt of defaultAdapters) {
    adapters.set(opt.machineId, createE2EAdapter(opt));
  }

  // Create real Redis connection
  const redis = new Redis(REDIS_E2E_URL);
  await redis.flushall(); // clean state

  // Create real CommandDispatcher (uses real Redis internally)
  const dispatcher = new CommandDispatcher();
  await dispatcher.start(adapters);

  // Build Hono app
  const app = new Hono();
  app.use('*', cors());

  // Health endpoint
  app.get('/health', (c) =>
    c.json({
      service: 'monolith-digital-shadow-e2e',
      status: 'running',
      timestamp: new Date().toISOString(),
    }),
  );

  // Mount command routes
  const commandApp = createCommandRoutes(dispatcher);
  app.route('/', commandApp);

  // Start server
  const server = serve({ fetch: app.fetch, port: SERVER_PORT });

  const close = async () => {
    await dispatcher.stop();
    await redis.flushall();
    await redis.quit();
    server.close();
  };

  const resetAdapters = () => {
    for (const adapter of adapters.values()) {
      (adapter as any).resetState();
    }
  };

  return { server, dispatcher, redis, adapters, resetAdapters, close };
}
