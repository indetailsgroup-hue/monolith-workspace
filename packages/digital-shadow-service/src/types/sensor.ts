/**
 * MONOLITH Digital Shadow Service — Sensor & Telemetry Types
 * Sparkplug B payload format for MQTT ingestion
 */

// ─── Sensor Data Point ───────────────────────────────────────────────────────

export interface SensorDataPoint {
  /** Unique sensor identifier */
  sensorId: string;
  /** Machine this sensor belongs to */
  machineId: string;
  /** Measurement name (e.g., 'spindle_vibration', 'dust_level') */
  measurement: string;
  /** Numeric value */
  value: number;
  /** Unit of measurement */
  unit: string;
  /** Timestamp of reading */
  timestamp: Date;
  /** Data quality flag */
  quality: DataQuality;
  /** Additional tags for InfluxDB */
  tags?: Record<string, string>;
}

export enum DataQuality {
  GOOD = 'GOOD',
  UNCERTAIN = 'UNCERTAIN',
  BAD = 'BAD',
  STALE = 'STALE',
}

// ─── Sensor Batch (for Ed25519 signing) ──────────────────────────────────────

export interface SensorBatch {
  batchId: string;
  machineId: string;
  /** Batch creation timestamp */
  createdAt: Date;
  /** Number of data points in batch */
  count: number;
  /** Data points */
  points: SensorDataPoint[];
  /** Ed25519 signature of the batch (hex) */
  signature?: string;
  /** SHA-256 hash of serialized points (for CAS) */
  contentHash?: string;
}

// ─── Sparkplug B MQTT Topic Structure ────────────────────────────────────────

/**
 * Topic pattern: spBv1.0/{group_id}/{message_type}/{edge_node_id}/{device_id}
 * MONOLITH mapping:
 *   group_id = "monolith"
 *   edge_node_id = factory floor gateway ID
 *   device_id = machine ID
 */
export interface SparkplugTopic {
  namespace: 'spBv1.0';
  groupId: string;
  messageType: SparkplugMessageType;
  edgeNodeId: string;
  deviceId?: string;
}

export enum SparkplugMessageType {
  NBIRTH = 'NBIRTH',   // Node birth certificate
  NDEATH = 'NDEATH',   // Node death certificate
  DBIRTH = 'DBIRTH',   // Device birth certificate
  DDEATH = 'DDEATH',   // Device death certificate
  NDATA = 'NDATA',     // Node data
  DDATA = 'DDATA',     // Device data
  NCMD = 'NCMD',       // Node command
  DCMD = 'DCMD',       // Device command
  STATE = 'STATE',     // SCADA state
}

// ─── InfluxDB Write Configuration ────────────────────────────────────────────

export interface InfluxWriteConfig {
  bucket: string;
  org: string;
  /** Measurement name for machine states */
  stateMeasurement: string;
  /** Measurement name for sensor telemetry */
  telemetryMeasurement: string;
  /** Measurement name for events */
  eventMeasurement: string;
  /** Batch size before flushing */
  batchSize: number;
  /** Flush interval in ms */
  flushIntervalMs: number;
  /** Max retry attempts */
  maxRetries: number;
}
