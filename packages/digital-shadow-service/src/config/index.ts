/**
 * MONOLITH Digital Shadow Service — Configuration
 * Loads and validates environment variables using Zod
 */

import { z } from 'zod';
import { config as loadEnv } from 'dotenv';
import { MachineVendor, AdapterProtocol } from '../types/machine';
import type { MachineEndpoint } from '../types/machine';
import type { InfluxWriteConfig } from '../types/sensor';
import type { EventBusConfig } from '../types/events';

loadEnv();

// ─── Environment Schema ──────────────────────────────────────────────────────

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3100),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // InfluxDB
  INFLUXDB_URL: z.string().url(),
  INFLUXDB_TOKEN: z.string().min(1),
  INFLUXDB_ORG: z.string().min(1),
  INFLUXDB_BUCKET: z.string().min(1),

  // MQTT
  MQTT_BROKER_URL: z.string().min(1),
  MQTT_CLIENT_ID: z.string().default('monolith-digital-shadow-01'),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  MQTT_USE_TLS: z.coerce.boolean().default(false),
  MQTT_CA_PATH: z.string().optional(),
  MQTT_CERT_PATH: z.string().optional(),
  MQTT_KEY_PATH: z.string().optional(),

  // Redis
  REDIS_URL: z.string().min(1),

  // OPC UA
  OPCUA_APPLICATION_NAME: z.string().default('MONOLITH Digital Shadow'),
  OPCUA_APPLICATION_URI: z.string().default('urn:monolith:digital-shadow:opcua-client'),
  OPCUA_SECURITY_MODE: z.enum(['None', 'Sign', 'SignAndEncrypt']).default('SignAndEncrypt'),
  OPCUA_SECURITY_POLICY: z.string().default('Basic256Sha256'),
  OPCUA_CERTIFICATE_PATH: z.string().optional(),
  OPCUA_PRIVATE_KEY_PATH: z.string().optional(),

  // Machine Endpoints
  BIESSE_OPCUA_ENDPOINT: z.string().optional(),
  HOMAG_OPCUA_ENDPOINT: z.string().optional(),
  HOMAG_CONNECT_API_URL: z.string().optional(),
  HOMAG_CONNECT_API_KEY: z.string().optional(),
  KDT_MODBUS_HOST: z.string().optional(),
  KDT_MODBUS_PORT: z.coerce.number().default(502),

  // Factory Server
  FACTORY_SERVER_URL: z.string().url().optional(),
  FACTORY_SERVER_API_KEY: z.string().optional(),

  // Ed25519
  ED25519_PRIVATE_KEY_PATH: z.string().optional(),
  ED25519_PUBLIC_KEY_PATH: z.string().optional(),
});

// ─── Parse & Validate ────────────────────────────────────────────────────────

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

const env = parsed.data;

// ─── Derived Configuration Objects ───────────────────────────────────────────

export const serverConfig = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  isDev: env.NODE_ENV === 'development',
  isProd: env.NODE_ENV === 'production',
} as const;

export const influxConfig: InfluxWriteConfig = {
  bucket: env.INFLUXDB_BUCKET,
  org: env.INFLUXDB_ORG,
  stateMeasurement: 'machine_state',
  telemetryMeasurement: 'sensor_telemetry',
  eventMeasurement: 'machine_event',
  batchSize: 100,
  flushIntervalMs: 1000,
  maxRetries: 3,
};

export const influxConnection = {
  url: env.INFLUXDB_URL,
  token: env.INFLUXDB_TOKEN,
} as const;

export const mqttConfig = {
  brokerUrl: env.MQTT_BROKER_URL,
  clientId: env.MQTT_CLIENT_ID,
  username: env.MQTT_USERNAME,
  password: env.MQTT_PASSWORD,
  useTls: env.MQTT_USE_TLS,
  caPath: env.MQTT_CA_PATH,
  certPath: env.MQTT_CERT_PATH,
  keyPath: env.MQTT_KEY_PATH,
} as const;

export const redisConfig = {
  url: env.REDIS_URL,
} as const;

export const opcuaConfig = {
  applicationName: env.OPCUA_APPLICATION_NAME,
  applicationUri: env.OPCUA_APPLICATION_URI,
  securityMode: env.OPCUA_SECURITY_MODE,
  securityPolicy: env.OPCUA_SECURITY_POLICY,
  certificatePath: env.OPCUA_CERTIFICATE_PATH,
  privateKeyPath: env.OPCUA_PRIVATE_KEY_PATH,
} as const;

export const eventBusConfig: EventBusConfig = {
  streamPrefix: 'ds:',
  consumerGroup: 'digital-shadow-group',
  consumerName: `ds-consumer-${process.pid}`,
  maxStreamLength: 100_000,
  blockTimeoutMs: 5000,
};

export const factoryServerConfig = {
  url: env.FACTORY_SERVER_URL,
  apiKey: env.FACTORY_SERVER_API_KEY,
} as const;

export const signingConfig = {
  privateKeyPath: env.ED25519_PRIVATE_KEY_PATH,
  publicKeyPath: env.ED25519_PUBLIC_KEY_PATH,
} as const;

// ─── Machine Endpoints Builder ───────────────────────────────────────────────

export function buildMachineEndpoints(): MachineEndpoint[] {
  const endpoints: MachineEndpoint[] = [];

  if (env.BIESSE_OPCUA_ENDPOINT) {
    endpoints.push({
      machineId: 'biesse-rover-01',
      displayName: 'Biesse Rover A (CNC Router)',
      vendor: MachineVendor.BIESSE,
      protocol: AdapterProtocol.OPCUA_NATIVE,
      opcuaEndpoint: env.BIESSE_OPCUA_ENDPOINT,
      pollingIntervalMs: 1000,
      publishIntervalMs: 500,
      monitoredNodes: [
        'ns=4;s=Woodworking.MachineIdentification',
        'ns=4;s=Woodworking.State.Machine.Overview.CurrentState',
        'ns=4;s=Woodworking.State.Machine.Overview.CurrentMode',
        'ns=4;s=Woodworking.State.Machine.Values.SpindleOverride',
        'ns=4;s=Woodworking.State.Machine.Values.FeedOverride',
      ],
    });
  }

  if (env.HOMAG_OPCUA_ENDPOINT) {
    endpoints.push({
      machineId: 'homag-edgeband-01',
      displayName: 'Homag EDGETEQ S-500 (Edgebander)',
      vendor: MachineVendor.HOMAG,
      protocol: AdapterProtocol.OPCUA_PLUS_CLOUD,
      opcuaEndpoint: env.HOMAG_OPCUA_ENDPOINT,
      homagConnect: env.HOMAG_CONNECT_API_URL ? {
        apiUrl: env.HOMAG_CONNECT_API_URL,
        apiKey: env.HOMAG_CONNECT_API_KEY ?? '',
        machineSerial: 'HOMAG-S500-001',
      } : undefined,
      pollingIntervalMs: 2000,
      publishIntervalMs: 1000,
    });
  }

  if (env.KDT_MODBUS_HOST) {
    endpoints.push({
      machineId: 'kdt-edgeband-01',
      displayName: 'KDT KE-368J (Edgebander)',
      vendor: MachineVendor.KDT,
      protocol: AdapterProtocol.MODBUS_TCP,
      modbusHost: env.KDT_MODBUS_HOST,
      modbusPort: env.KDT_MODBUS_PORT,
      pollingIntervalMs: 3000,
      publishIntervalMs: 3000,
      modbusRegisters: {
        state: { address: 0, length: 1 },
        spindleSpeed: { address: 10, length: 2 },
        feedRate: { address: 12, length: 2 },
        toolId: { address: 20, length: 1 },
        errorCode: { address: 30, length: 1 },
        partCount: { address: 40, length: 2 },
      },
    });
  }

  return endpoints;
}

export default env;
