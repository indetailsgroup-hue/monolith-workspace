/**
 * MONOLITH Digital Shadow — MQTT Ingestion Service
 * Sparkplug B protocol handler for sensor data ingestion
 * Writes to InfluxDB time-series database
 */

import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import { readFileSync } from 'node:fs';
import pino from 'pino';
import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client';
import { mqttConfig, influxConnection, influxConfig } from '../config';
import type { SensorDataPoint, SensorBatch, SparkplugTopic } from '../types/sensor';
import { SparkplugMessageType, DataQuality } from '../types/sensor';
import type { ServiceHealth } from '../types/events';

export class MqttIngestionService {
  private logger = pino({ name: 'mqtt-ingestion-service' });
  private client: MqttClient | null = null;
  private influxWriteApi: WriteApi;
  private messageCount = 0;
  private errorCount = 0;
  private startTime = Date.now();
  // @ts-expect-error Reserved for future batch aggregation
  private _batchBuffer: Map<string, SensorDataPoint[]> = new Map();

  constructor() {
    const influxDB = new InfluxDB({
      url: influxConnection.url,
      token: influxConnection.token,
    });
    this.influxWriteApi = influxDB.getWriteApi(
      influxConfig.org,
      influxConfig.bucket,
      'ms', // millisecond precision
      {
        batchSize: influxConfig.batchSize,
        flushInterval: influxConfig.flushIntervalMs,
        maxRetries: influxConfig.maxRetries,
      },
    );
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.logger.info('Starting MQTT Ingestion Service...');

    const options: IClientOptions = {
      clientId: mqttConfig.clientId,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
    };

    // Authentication
    if (mqttConfig.username) {
      options.username = mqttConfig.username;
      options.password = mqttConfig.password;
    }

    // TLS configuration
    if (mqttConfig.useTls && mqttConfig.caPath) {
      options.ca = readFileSync(mqttConfig.caPath);
      if (mqttConfig.certPath && mqttConfig.keyPath) {
        options.cert = readFileSync(mqttConfig.certPath);
        options.key = readFileSync(mqttConfig.keyPath);
      }
    }

    this.client = mqtt.connect(mqttConfig.brokerUrl, options);

    this.client.on('connect', () => {
      this.logger.info('Connected to MQTT broker');
      this.subscribeToTopics();
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload);
    });

    this.client.on('error', (err) => {
      this.logger.error({ err }, 'MQTT client error');
      this.errorCount++;
    });

    this.client.on('reconnect', () => {
      this.logger.warn('MQTT client reconnecting...');
    });

    this.client.on('offline', () => {
      this.logger.warn('MQTT client offline');
    });
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping MQTT Ingestion Service...');

    // Flush remaining data to InfluxDB
    await this.influxWriteApi.flush();
    await this.influxWriteApi.close();

    if (this.client) {
      await new Promise<void>((resolve) => {
        this.client!.end(false, {}, () => resolve());
      });
      this.client = null;
    }

    this.logger.info(
      { totalMessages: this.messageCount, errors: this.errorCount },
      'MQTT Ingestion Service stopped',
    );
  }

  // ─── Topic Subscription ────────────────────────────────────────────────────

  private subscribeToTopics(): void {
    if (!this.client) return;

    const topics = [
      // Sparkplug B device data from all edge nodes
      'spBv1.0/monolith/DDATA/#',
      // Sparkplug B device birth/death
      'spBv1.0/monolith/DBIRTH/#',
      'spBv1.0/monolith/DDEATH/#',
      // Node birth/death
      'spBv1.0/monolith/NBIRTH/#',
      'spBv1.0/monolith/NDEATH/#',
      // Legacy topic for non-Sparkplug devices
      'monolith/machines/+/telemetry',
      'monolith/machines/+/state',
      'monolith/machines/+/alarm',
    ];

    this.client.subscribe(topics, { qos: 1 }, (err, granted) => {
      if (err) {
        this.logger.error({ err }, 'Failed to subscribe to topics');
        return;
      }
      this.logger.info(
        { topics: granted?.map((g) => g.topic) },
        'Subscribed to MQTT topics',
      );
    });
  }

  // ─── Message Handling ──────────────────────────────────────────────────────

  private handleMessage(topic: string, payload: Buffer): void {
    this.messageCount++;

    try {
      if (topic.startsWith('spBv1.0/')) {
        this.handleSparkplugMessage(topic, payload);
      } else if (topic.includes('/telemetry')) {
        this.handleLegacyTelemetry(topic, payload);
      } else if (topic.includes('/state')) {
        this.handleLegacyState(topic, payload);
      } else if (topic.includes('/alarm')) {
        this.handleLegacyAlarm(topic, payload);
      }
    } catch (err) {
      this.logger.error({ err, topic }, 'Error processing MQTT message');
      this.errorCount++;
    }
  }

  private handleSparkplugMessage(topic: string, payload: Buffer): void {
    const parsed = this.parseSparkplugTopic(topic);
    if (!parsed) return;

    switch (parsed.messageType) {
      case SparkplugMessageType.DDATA: {
        // Device telemetry data
        const data = this.decodeSparkplugPayload(payload);
        if (data) {
          this.writeToInflux(data, parsed.deviceId ?? 'unknown');
        }
        break;
      }
      case SparkplugMessageType.DBIRTH: {
        this.logger.info(
          { deviceId: parsed.deviceId },
          'Device birth certificate received',
        );
        break;
      }
      case SparkplugMessageType.DDEATH: {
        this.logger.warn(
          { deviceId: parsed.deviceId },
          'Device death certificate received',
        );
        break;
      }
    }
  }

  private handleLegacyTelemetry(topic: string, payload: Buffer): void {
    const machineId = this.extractMachineId(topic);
    const data = JSON.parse(payload.toString()) as SensorDataPoint[];

    for (const point of data) {
      const influxPoint = new Point(influxConfig.telemetryMeasurement)
        .tag('machine_id', machineId)
        .tag('sensor_id', point.sensorId)
        .tag('measurement_type', point.measurement)
        .floatField('value', point.value)
        .stringField('unit', point.unit)
        .stringField('quality', point.quality)
        .timestamp(point.timestamp);

      if (point.tags) {
        for (const [key, value] of Object.entries(point.tags)) {
          influxPoint.tag(key, value);
        }
      }

      this.influxWriteApi.writePoint(influxPoint);
    }
  }

  private handleLegacyState(topic: string, payload: Buffer): void {
    const machineId = this.extractMachineId(topic);
    const data = JSON.parse(payload.toString());

    const point = new Point(influxConfig.stateMeasurement)
      .tag('machine_id', machineId)
      .intField('state', data.state ?? 0)
      .intField('mode', data.mode ?? 0)
      .timestamp(new Date());

    this.influxWriteApi.writePoint(point);
  }

  private handleLegacyAlarm(topic: string, payload: Buffer): void {
    const machineId = this.extractMachineId(topic);
    const data = JSON.parse(payload.toString());

    const point = new Point(influxConfig.eventMeasurement)
      .tag('machine_id', machineId)
      .tag('event_type', 'alarm')
      .stringField('alarm_id', data.alarmId ?? '')
      .stringField('severity', data.severity ?? 'INFO')
      .stringField('message', data.message ?? '')
      .timestamp(new Date());

    this.influxWriteApi.writePoint(point);
  }

  // ─── Sparkplug B Helpers ───────────────────────────────────────────────────

  private parseSparkplugTopic(topic: string): SparkplugTopic | null {
    const parts = topic.split('/');
    if (parts.length < 4) return null;

    return {
      namespace: 'spBv1.0',
      groupId: parts[1]!,
      messageType: parts[2] as SparkplugMessageType,
      edgeNodeId: parts[3]!,
      deviceId: parts[4],
    };
  }

  private decodeSparkplugPayload(payload: Buffer): SensorDataPoint[] | null {
    try {
      // Sparkplug B uses protobuf encoding
      // In production, use sparkplug-payload library for proper decoding
      // For now, attempt JSON fallback (dev mode)
      const decoded = JSON.parse(payload.toString());

      if (decoded.metrics && Array.isArray(decoded.metrics)) {
        return decoded.metrics.map((metric: Record<string, unknown>) => ({
          sensorId: String(metric.name ?? 'unknown'),
          machineId: String(metric.alias ?? 'unknown'),
          measurement: String(metric.name ?? 'unknown'),
          value: Number(metric.value ?? 0),
          unit: String((metric as any).properties?.unit ?? ''),
          timestamp: new Date(Number(metric.timestamp ?? Date.now())),
          quality: DataQuality.GOOD,
        }));
      }

      return null;
    } catch {
      this.logger.debug('Non-JSON Sparkplug payload — needs protobuf decode');
      return null;
    }
  }

  private writeToInflux(points: SensorDataPoint[], deviceId: string): void {
    for (const dataPoint of points) {
      const point = new Point(influxConfig.telemetryMeasurement)
        .tag('machine_id', deviceId)
        .tag('sensor_id', dataPoint.sensorId)
        .tag('measurement_type', dataPoint.measurement)
        .floatField('value', dataPoint.value)
        .stringField('unit', dataPoint.unit)
        .stringField('quality', dataPoint.quality)
        .timestamp(dataPoint.timestamp);

      this.influxWriteApi.writePoint(point);
    }
  }

  private extractMachineId(topic: string): string {
    const parts = topic.split('/');
    return parts[2] ?? 'unknown';
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Publish sensor batch to MQTT (for adapters that push via MQTT) */
  async publishBatch(batch: SensorBatch): Promise<void> {
    if (!this.client?.connected) {
      throw new Error('MQTT client not connected');
    }

    const topic = `monolith/machines/${batch.machineId}/telemetry`;
    const payload = JSON.stringify(batch.points);

    await new Promise<void>((resolve, reject) => {
      this.client!.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // ─── Health Check ──────────────────────────────────────────────────────────

  getHealth(): ServiceHealth {
    return {
      service: 'mqtt-ingestion-service',
      status: this.client?.connected ? 'healthy' : 'unhealthy',
      lastCheck: new Date(),
      details: {
        messagesProcessed: this.messageCount,
        errors: this.errorCount,
        connected: this.client?.connected ?? false,
      },
      uptime: Date.now() - this.startTime,
      connections: [
        {
          name: 'mqtt-broker',
          type: 'mqtt',
          status: this.client?.connected ? 'connected' : 'disconnected',
          lastActivity: new Date(),
          errorCount: this.errorCount,
        },
        {
          name: 'influxdb',
          type: 'influxdb',
          status: 'connected', // WriteApi manages its own connection
          lastActivity: new Date(),
          errorCount: 0,
        },
      ],
    };
  }
}
