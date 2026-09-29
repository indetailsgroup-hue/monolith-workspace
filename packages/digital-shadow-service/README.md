# MONOLITH Digital Shadow Service

> Phase 1 of Digital Twin integration for MONOLITH Manufacturing OS — DAPH Decor

## Overview

The Digital Shadow Service provides **real-time machine data acquisition** from CNC machines (Biesse, Homag, KDT) on the factory floor, ingests sensor telemetry, reconciles machine states with MONOLITH's job queue, and stores signed data in CAS (Content-Addressable Storage).

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Factory Floor                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                          │
│  │ Biesse   │  │ Homag    │  │ KDT      │                          │
│  │ (OPC UA) │  │ (OPC UA  │  │ (Modbus  │                          │
│  │          │  │  + Cloud) │  │  TCP)    │                          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                          │
└───────┼──────────────┼─────────────┼────────────────────────────────┘
        │              │             │
┌───────┼──────────────┼─────────────┼────────────────────────────────┐
│  Digital Shadow Service                                              │
│  ┌────┴──────────────┴─────────────┴──────┐                         │
│  │         Machine Adapter Layer           │                         │
│  │  BiesseAdapter | HomagAdapter | KdtAdapter                       │
│  └────────────────────┬───────────────────┘                         │
│                       │                                              │
│  ┌────────────────────┼───────────────────┐                         │
│  │     OPC UA Client Service              │   ┌──────────────────┐  │
│  │     (manages all adapters)             │   │ MQTT Ingestion   │  │
│  └────────────────────┬───────────────────┘   │ (Sparkplug B)    │  │
│                       │                       └────────┬─────────┘  │
│  ┌────────────────────┴────────────────────────────────┴─────────┐  │
│  │              State Reconciliation Engine                        │  │
│  │    WwUnitState → MonolithJobState mapping + event publishing    │  │
│  └────────────────────┬───────────────────────────────┬──────────┘  │
│                       │                               │              │
│  ┌────────────────────┴──────────┐   ┌───────────────┴──────────┐  │
│  │  CAS Bridge                   │   │  Activity Log Bridge     │  │
│  │  (SHA-256 + Ed25519 signing)  │   │  (MONOLITH Factory API)  │  │
│  └───────────────────────────────┘   └──────────────────────────┘  │
│                                                                      │
│  Infrastructure: InfluxDB | Redis Streams | Mosquitto MQTT           │
└──────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20+ / TypeScript 5.6 |
| OPC UA Client | node-opcua ^2.128 |
| MQTT | mqtt.js + Sparkplug B |
| Time-series DB | InfluxDB 2.7 |
| Event Bus | Redis 7 Streams |
| HTTP Framework | Hono 4 |
| Signing | Ed25519 (@noble/ed25519) |
| Modbus (KDT) | modbus-serial |
| Validation | Zod |
| Logging | Pino |

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Copy environment config
cp .env.example .env

# 3. Start infrastructure (InfluxDB, Redis, Mosquitto)
npm run docker:up

# 4. Run in development mode
npm run dev

# 5. Check health
curl http://localhost:3100/health
```

## Project Structure

```
src/
├── index.ts              # Bootstrap & HTTP health API
├── config/
│   └── index.ts          # Environment config (Zod validated)
├── types/
│   ├── machine.ts        # OPC-40550-1 types (WwUnitState, WwUnitMode)
│   ├── sensor.ts         # Sensor & Sparkplug B types
│   ├── job.ts            # MONOLITH job state & CAS types
│   └── events.ts         # Redis Streams event types
├── adapters/
│   ├── IMachineAdapter.ts    # Abstract interface
│   ├── BaseMachineAdapter.ts # Shared logic (reconnection, events)
│   ├── BiesseAdapter.ts      # OPC UA native (Woodworking spec)
│   ├── HomagAdapter.ts       # OPC UA + HOMAG Connect cloud
│   └── KdtAdapter.ts         # Modbus TCP fallback
└── services/
    ├── OpcuaClientService.ts       # Multi-adapter orchestrator
    ├── MqttIngestionService.ts     # MQTT → InfluxDB writer
    ├── StateReconciliationEngine.ts # State mapping + event publish
    ├── CASBridge.ts                # Content-addressable storage
    ├── ActivityLogBridge.ts        # Audit trail to Factory Server
    └── SensorBatchSigner.ts        # Ed25519 data integrity
```

## Machine Support

| Vendor | Protocol | Adapter | Features |
|--------|----------|---------|----------|
| Biesse | OPC UA (native) | BiesseAdapter | Full WwMachineType, subscriptions |
| Homag | OPC UA + Cloud API | HomagAdapter | Dual-channel, 90-day cloud history |
| KDT | Modbus TCP | KdtAdapter | Register polling, state inference |

## OPC UA Woodworking (OPC-40550-1)

This service implements the **OPC UA Companion Specification for Woodworking** (OPC-40550-1 v1.02.0, released 2025-06-01):

- **WwUnitStateEnumeration**: OFFLINE(0), STANDBY(1), READY(2), WORKING(3), ERROR(4)
- **WwUnitModeEnumeration**: OTHER(0), AUTOMATIC(1), SEMIAUTOMATIC(2), MANUAL(3), SETUP(4), SLEEP(5)
- **Namespace**: `http://opcfoundation.org/UA/Woodworking/`
- **Application URI**: `urn:monolith:digital-shadow:opcua-client`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health + component status |
| GET | `/machines` | All machine states |
| GET | `/machines/:id` | Single machine state |
| GET | `/machines/:id/telemetry` | Real-time telemetry |

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

## Docker Deployment

```bash
# Build and run all services
docker compose up --build

# Production deployment
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Integration with MONOLITH Factory Server

The Digital Shadow Service integrates with the existing MONOLITH Factory Server via:

1. **CAS Bridge** — Stores signed sensor batches and state snapshots using SHA-256 content addressing
2. **Activity Log Bridge** — Sends machine events to the factory server's audit trail
3. **Job State Sync** — Maps WwUnitState transitions to MONOLITH's FIFO job queue states
4. **Safety Gate** — Pre-job validation checks (sensor tolerance, alarm status, tool wear)

## Roadmap

- **Phase 1** (Current): Digital Shadow — unidirectional data acquisition
- **Phase 2**: Digital Twin Core — bi-directional control, 3D visualization (Three.js)
- **Phase 3**: Intelligent Twin — ML-based scheduling (AIOGA + DRL), predictive maintenance

---

*Part of MONOLITH Manufacturing OS (IIMOS) v13.4.0 — DAPH Decor*
