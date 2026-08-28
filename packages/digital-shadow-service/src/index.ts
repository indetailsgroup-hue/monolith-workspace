/**
 * MONOLITH Digital Shadow Service — Main Entry Point
 * Bootstraps all services and starts the HTTP health server
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  Digital Shadow Service                                      │
 * │  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │
 * │  │ OPC UA Client │  │ MQTT Ingestion │  │ State Recon.   │  │
 * │  │ Service       │  │ Service        │  │ Engine         │  │
 * │  └──────┬───────┘  └───────┬────────┘  └───────┬────────┘  │
 * │         │                   │                    │           │
 * │  ┌──────┴───────────────────┴────────────────────┴────────┐ │
 * │  │              Redis Streams (Event Bus)                   │ │
 * │  └──────┬───────────────────┬────────────────────┬────────┘ │
 * │         │                   │                    │           │
 * │  ┌──────┴───────┐  ┌───────┴────────┐  ┌───────┴────────┐  │
 * │  │ CAS Bridge   │  │ Activity Log   │  │ Sensor Batch   │  │
 * │  │              │  │ Bridge         │  │ Signer         │  │
 * │  └──────────────┘  └────────────────┘  └────────────────┘  │
 * └─────────────────────────────────────────────────────────────┘
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import Redis from 'ioredis';
import pino from 'pino';

import {
  serverConfig,
  redisConfig,
  influxConnection,
  influxConfig,
  buildMachineEndpoints,
} from './config';
import { FeatureCacheService } from './services/FeatureCacheService';
import { FeatureEngineeringService } from './services/FeatureEngineeringService';
import { RULPredictionService } from './services/RULPredictionService';
import { ComponentType, HealthStatus } from './types/maintenance';
import { DataQuality } from './types/sensor';
import { EventStream } from './types/events';
import type { EventEnvelope } from './types/events';
import {
  OpcuaClientService,
  MqttIngestionService,
  StateReconciliationEngine,
  CASBridge,
  ActivityLogBridge,
  SensorBatchSigner,
} from './services';

// ─── Logger ──────────────────────────────────────────────────────────────────

const logger = pino({
  name: 'digital-shadow-main',
  level: serverConfig.logLevel,
  transport: serverConfig.isDev
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

// ─── Service Instances ───────────────────────────────────────────────────────

const machineEndpoints = buildMachineEndpoints();
const opcuaService = new OpcuaClientService(machineEndpoints);
const mqttService = new MqttIngestionService();
const stateEngine = new StateReconciliationEngine();
const casBridge = new CASBridge();
const activityLog = new ActivityLogBridge();
const batchSigner = new SensorBatchSigner();
const rulService = new RULPredictionService({ logger });

const featureCache = new FeatureCacheService(redisConfig.url);
const featureEng = new FeatureEngineeringService({
  influxUrl: influxConnection.url,
  influxToken: influxConnection.token,
  influxOrg: influxConfig.org,
  logger,
});

// ─── Measurement → ComponentType lookup ──────────────────────────────────────

const MEASUREMENT_TO_COMPONENT: Record<string, ComponentType> = {
  spindle_vibration: ComponentType.SPINDLE,
  spindle_current:   ComponentType.SPINDLE,
  feed_current_x:    ComponentType.BALL_SCREW_X,
  feed_current_y:    ComponentType.BALL_SCREW_Y,
  feed_current_z:    ComponentType.BALL_SCREW_Z,
  linear_guide_x:    ComponentType.LINEAR_GUIDE_X,
  linear_guide_y:    ComponentType.LINEAR_GUIDE_Y,
  linear_guide_z:    ComponentType.LINEAR_GUIDE_Z,
  tool_vibration:    ComponentType.TOOL_HOLDER,
  vacuum_pressure:   ComponentType.VACUUM_PUMP,
  atc_current:       ComponentType.ATC_MAGAZINE,
};

// ─── HTTP Health API (Hono) ──────────────────────────────────────────────────

const app = new Hono();
app.use('*', cors());

app.get('/health', (c) => {
  const health = {
    service: 'monolith-digital-shadow',
    version: '0.1.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    components: {
      opcua: opcuaService.getHealth(),
      mqtt: mqttService.getHealth(),
    },
  };
  return c.json(health);
});

app.get('/machines', async (c) => {
  const states = await opcuaService.readAllStates();
  const machines = [...states.entries()].map(([id, state]) => ({
    ...state,
    machineId: id,
  }));
  return c.json({ machines });
});

app.get('/machines/:id', async (c) => {
  const machineId = c.req.param('id');
  const adapter = opcuaService.getAdapter(machineId);
  if (!adapter) {
    return c.json({ error: 'Machine not found' }, 404);
  }
  try {
    const state = await adapter.readState();
    return c.json(state);
  } catch (err) {
    return c.json({ error: 'Failed to read machine state' }, 500);
  }
});

app.get('/machines/:id/telemetry', async (c) => {
  const machineId = c.req.param('id');
  const adapter = opcuaService.getAdapter(machineId);
  if (!adapter) {
    return c.json({ error: 'Machine not found' }, 404);
  }
  try {
    const telemetry = await adapter.readTelemetry();
    return c.json({ machineId, telemetry });
  } catch (err) {
    return c.json({ error: 'Failed to read telemetry' }, 500);
  }
});

// ─── Predictive Maintenance / RUL Endpoint ───────────────────────────────────

app.get('/machines/:id/maintenance', async (c) => {
  const machineId = c.req.param('id');
  const adapter = opcuaService.getAdapter(machineId);
  if (!adapter) {
    return c.json({ error: 'Machine not found' }, 404);
  }

  try {
    const operatingHoursParam = c.req.query('operatingHours');
    const operatingHours = operatingHoursParam
      ? parseFloat(operatingHoursParam)
      : 2500; // default: mid-life CNC

    const components = Object.values(ComponentType);

    const results = await Promise.all(
      components.map(async (componentType) => {
        // Prefer live degradation indicators from the Redis feature cache;
        // fall back to static defaults when the cache is empty or unavailable.
        const cached = await featureCache.getIndicators(machineId, componentType);
        const degradationIndicators = cached ?? [
          {
            name: 'rms_vibration',
            currentValue: 0.12 + Math.random() * 0.08,
            warningThreshold: 0.18,
            failureThreshold: 0.30,
            normalizedDeviation: 0.15,
          },
          {
            name: 'kurtosis',
            currentValue: 3.1 + Math.random() * 0.8,
            warningThreshold: 4.5,
            failureThreshold: 7.0,
            normalizedDeviation: 0.10,
          },
        ];

        const rul = rulService.predictRUL(
          machineId,
          componentType,
          operatingHours,
          degradationIndicators,
        );

        const health = rulService.assessComponentHealth(
          machineId,
          componentType,
          rul,
          0.05, // anomalyScore — low baseline
          degradationIndicators,
        );

        return {
          componentType,
          healthScore: health.healthScore,
          status: health.status,
          remainingUsefulLife: rul.median,
          confidence: rul.confidence,
          rul,
          contributingFactors: health.contributingFactors,
        };
      }),
    );

    const criticalCount = results.filter(
      (r) => r.status === 'CRITICAL' || r.status === 'FAILED',
    ).length;
    const warningCount = results.filter((r) => r.status === 'WARNING').length;

    // ── Aggregate overall health from live Redis feature cache (worst-wins) ──
    // getAggregatedHealth() scans all cached component keys and returns the
    // HealthStatus corresponding to the worst normalizedDeviation score seen.
    // Falls back to HealthStatus.HEALTHY on Redis unavailability (fail-open).
    const overallHealth: HealthStatus = await featureCache.getAggregatedHealth(machineId);

    // ── cacheAge: ms since the oldest cached feature timestamp (null = no cache) ──
    const oldestTs = await featureCache.getOldestTimestamp(machineId);
    const cacheAge = oldestTs !== null ? Date.now() - oldestTs : null;

    return c.json({
      machineId,
      assessedAt: new Date().toISOString(),
      operatingHours,
      components: results,
      overallHealth,
      criticalCount,
      warningCount,
      cacheAge,
    });
  } catch (err) {
    logger.error({ err, machineId }, 'Failed to assess maintenance');
    return c.json({ error: 'Maintenance assessment failed' }, 500);
  }
});

// ─── Real-time SSE Stream ─────────────────────────────────────────────────────

app.get('/machines/:id/events', (c) => {
  const machineId = c.req.param('id');

  return streamSSE(c, async (stream) => {
    // Dedicated Redis client per connection — ensures BLOCK doesn't starve others
    const subRedis = new Redis(redisConfig.url, { lazyConnect: true });
    subRedis.on('error', () => undefined);

    let running = true;
    let lastStateId = '$';
    let lastAlarmId = '$';

    // Keep-alive ping every 15 s to prevent proxy timeout drops
    const pingTimer = setInterval(async () => {
      if (!running) return;
      try {
        await stream.writeSSE({ data: '', event: 'ping' });
      } catch {
        running = false;
      }
    }, 15_000);

    stream.onAbort(() => {
      running = false;
      clearInterval(pingTimer);
      void subRedis.quit();
    });

    while (running) {
      try {
        // XREAD BLOCK 2000 STREAMS ds:machine:state ds:machine:alarm <ids>
        const results = (await subRedis.xread(
          'BLOCK', '2000',
          'STREAMS',
          EventStream.MACHINE_STATE,
          EventStream.MACHINE_ALARM,
          lastStateId,
          lastAlarmId,
        )) as Array<[string, Array<[string, string[]]>]> | null;

        if (!results) continue;

        for (const [streamKey, entries] of results) {
          for (const [id, fields] of entries) {
            // Advance the per-stream cursor
            if (streamKey === EventStream.MACHINE_STATE) lastStateId = id;
            else lastAlarmId = id;

            // Convert Redis flat field array → map
            const fieldMap: Record<string, string> = {};
            for (let i = 0; i + 1 < fields.length; i += 2) {
              fieldMap[fields[i]!] = fields[i + 1]!;
            }

            const raw = fieldMap['envelope'] ?? fieldMap['data'];
            if (!raw) continue;

            let envelope: EventEnvelope<Record<string, unknown>>;
            try {
              envelope = JSON.parse(raw) as EventEnvelope<Record<string, unknown>>;
            } catch {
              continue;
            }

            // Filter: only forward events that belong to the requested machine
            if (
              envelope.source !== machineId &&
              envelope.data?.['machineId'] !== machineId
            ) {
              continue;
            }

            const eventType =
              streamKey === EventStream.MACHINE_STATE ? 'state' : 'alarm';

            await stream.writeSSE({
              id,
              event: eventType,
              data: JSON.stringify(envelope.data),
            });
          }
        }
      } catch {
        running = false;
      }
    }

    clearInterval(pingTimer);
    try { await subRedis.quit(); } catch { /* ignore */ }
  });
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('  MONOLITH Digital Shadow Service v0.1.0');
  logger.info('  DAPH Decor — Manufacturing Intelligence Platform');
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info({ machineCount: machineEndpoints.length, port: serverConfig.port });

  try {
    // 1. Initialize signing keys
    await batchSigner.initialize();
    logger.info('✓ Sensor Batch Signer initialized');

    // 2. Start State Reconciliation Engine (creates Redis streams)
    await stateEngine.start();
    logger.info('✓ State Reconciliation Engine started');

    // 3. Start Activity Log Bridge
    activityLog.start();
    logger.info('✓ Activity Log Bridge started');

    // 4. Start MQTT Ingestion Service
    await mqttService.start();
    logger.info('✓ MQTT Ingestion Service started');

    // 5. Start OPC UA Client Service (connects to machines)
    await opcuaService.start();
    logger.info('✓ OPC UA Client Service started');

    // 6. Wire up state change pipeline
    wireEventPipeline();
    logger.info('✓ Event pipeline wired');

    // 7. Start HTTP server
    serve({ fetch: app.fetch, port: serverConfig.port });
    logger.info(`✓ Health API listening on http://0.0.0.0:${serverConfig.port}`);

    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('  Digital Shadow Service is READY');
    logger.info('═══════════════════════════════════════════════════════════════');

    activityLog.logSystemEvent('service_started', {
      version: '0.1.0',
      machines: machineEndpoints.map((e) => e.machineId),
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to bootstrap Digital Shadow Service');
    process.exit(1);
  }
}

// ─── Event Pipeline Wiring ───────────────────────────────────────────────────

function wireEventPipeline(): void {
  for (const adapter of opcuaService.getAllAdapters()) {
    adapter.onStateChange(async (machineId, _prev, _next, _timestamp) => {
      const snapshot = opcuaService.getCachedState(machineId);
      if (!snapshot) return;

      await stateEngine.processStateUpdate(snapshot);
      const hash = await casBridge.storeStateSnapshot(snapshot);
      activityLog.logStateSnapshot(snapshot, hash);
    });

    adapter.onTelemetry(async (points) => {
      if (points.length === 0) return;
      const machineId = points[0]!.machineId;

      // ── Feature engineering pipeline ──────────────────────────────────
      // Group GOOD-quality points by measurement name
      const grouped = new Map<string, { values: number[]; timestamps: number[] }>();
      for (const pt of points) {
        if (pt.quality !== DataQuality.GOOD) continue;
        if (!MEASUREMENT_TO_COMPONENT[pt.measurement]) continue;
        if (!grouped.has(pt.measurement)) {
          grouped.set(pt.measurement, { values: [], timestamps: [] });
        }
        grouped.get(pt.measurement)!.values.push(pt.value);
        grouped.get(pt.measurement)!.timestamps.push(pt.timestamp.getTime());
      }

      for (const [measurement, { values, timestamps }] of grouped) {
        const componentType = MEASUREMENT_TO_COMPONENT[measurement]!;
        if (values.length < 4) continue; // computeTimeDomain requires min 4 pts

        try {
          const td = featureEng.computeTimeDomain(values);
          const trend = featureEng.computeTrend(values, timestamps);
          await featureCache.setFeatures(machineId, componentType, {
            rms:           td.rms,
            kurtosis:      td.kurtosis,
            crestFactor:   td.crestFactor,
            slope:         trend.slope,
            ewmaDeviation: trend.ewmaDeviation,
            timestamp:     Date.now(),
          });
        } catch (err) {
          logger.warn({ err, machineId, measurement }, 'Feature computation failed');
        }
      }
      // ──────────────────────────────────────────────────────────────────

      const batch = await batchSigner.createSignedBatch(machineId, points);
      await casBridge.storeSensorBatch(batch);
      await mqttService.publishBatch(batch);
    });
  }
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received');
  activityLog.logSystemEvent('service_stopping', { signal });

  await opcuaService.stop();
  await mqttService.stop();
  await stateEngine.stop();
  await activityLog.stop();
  await featureCache.quit();

  logger.info('Digital Shadow Service stopped gracefully');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Start ───────────────────────────────────────────────────────────────────

bootstrap();

