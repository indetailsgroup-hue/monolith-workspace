# Phase 2: Bi-directional Command Layer — Architecture Design

## ADR-002: Command Layer for OPC UA Write Operations

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2026-08-28 |
| Decision | Implement queue-based command dispatch with safety validation |
| Context | MONOLITH Digital Shadow Phase 1 is read-only; Phase 2 adds write capability |

---

## 1. Overview

Phase 2 extends the Digital Shadow Service from passive observation (Digital Shadow) to active control (Digital Twin), enabling bi-directional communication with CNC machines via OPC UA write operations.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MONOLITH Factory Server                           │
│  ┌───────────┐  ┌───────────┐  ┌────────────┐  ┌───────────────┐  │
│  │ Job Queue │  │ Scheduler │  │ Operator UI│  │ Safety System │  │
│  └─────┬─────┘  └─────┬─────┘  └─────┬──────┘  └──────┬────────┘  │
│        └───────────────┼──────────────┼─────────────────┘           │
└────────────────────────┼──────────────┼─────────────────────────────┘
                         ▼              ▼
              ┌──────────────────────────────────┐
              │     Command API (Hono REST)       │
              │  POST /commands                   │
              │  POST /commands/emergency-stop    │
              └──────────────┬───────────────────┘
                             ▼
              ┌──────────────────────────────────┐
              │       Command Safety Gate         │
              │  • Machine state validation       │
              │  • Mode check (AUTOMATIC only)    │
              │  • Alarm clearance                │
              │  • Connection liveness            │
              │  • Program ref validation         │
              └──────────────┬───────────────────┘
                             ▼
              ┌──────────────────────────────────┐
              │       Command Queue (Redis)       │
              │  • Priority sorted set/machine    │
              │  • FIFO within same priority      │
              │  • Retry with exponential backoff │
              │  • TTL + timeout watchlist        │
              └──────────────┬───────────────────┘
                             ▼
              ┌──────────────────────────────────┐
              │      Command Dispatcher           │
              │  • Dispatch loop (200ms cycle)    │
              │  • Per-machine single-command     │
              │  • Adapter write execution        │
              │  • Confirmation watcher           │
              └──────────────┬───────────────────┘
                             ▼
    ┌────────────────────────┼────────────────────────┐
    ▼                        ▼                        ▼
┌─────────┐          ┌─────────────┐          ┌──────────┐
│ Biesse  │          │   Homag     │          │   KDT    │
│OPC UA   │          │ OPC UA +    │          │ Modbus   │
│Method   │          │ Cloud API   │          │ Register │
│Call     │          │ Command     │          │ Write    │
└─────────┘          └─────────────┘          └──────────┘
```

---

## 2. Command Lifecycle (State Machine)

```
PENDING → VALIDATING → QUEUED → DISPATCHING → AWAITING_CONFIRMATION → CONFIRMED → COMPLETED
                ↓                      ↓                    ↓
            REJECTED              TIMED_OUT              FAILED
                                      ↓
                                   (retry if < maxRetries)
                                      ↓
                                   QUEUED (re-enqueue)
```

### Terminal States
- **COMPLETED** — Command executed, machine confirmed state transition
- **REJECTED** — Safety gate blocked (pre-validation failure)
- **TIMED_OUT** — No confirmation within timeout + max retries exhausted
- **FAILED** — Machine returned error / adapter exception
- **CANCELLED** — Operator cancelled before dispatch

---

## 3. Safety Gate Design

### Pre-dispatch Checks (ALL must pass for non-CRITICAL commands)

| Check | Description | Blocking? |
|-------|-------------|-----------|
| Connection | `adapter.ping()` returns true | Yes |
| Machine State | Current WwUnitState matches command requirements | Yes |
| Machine Mode | Must be AUTOMATIC/SEMIAUTOMATIC for job commands | Yes |
| Alarm Clear | No CRITICAL/ERROR severity alarms active | Yes |
| Program Ref | Non-empty, valid CAS hash or file path | Yes |
| Spindle Idle | For START_JOB: spindle < 100 RPM | Warning |
| Tool Wear | For ABORT at high speed: advisory only | Warning |

### CRITICAL Priority Bypass
Emergency commands (priority = CRITICAL) bypass ALL checks except connection liveness. This ensures E-STOP always reaches the machine even in degraded states.

---

## 4. Command Queue Architecture

### Redis Data Model

```
ds:cmd:queue:{machineId}     — Sorted Set (score = priority * 1e13 + timestamp)
ds:cmd:entry:{commandId}     — String (JSON serialized CommandQueueEntry, TTL 1h)
ds:cmd:active                — Set of all active command IDs
ds:cmd:current:{machineId}   — String (currently executing commandId, TTL = timeout + 10s)
ds:cmd:timeouts              — Sorted Set (score = expiry timestamp)
```

### Ordering Guarantee
- **Inter-priority**: CRITICAL(0) > HIGH(1) > NORMAL(2) > LOW(3)
- **Intra-priority**: FIFO (timestamp-based score within same priority level)
- **Per-machine serialization**: Only 1 command dispatches at a time per machine

### Retry Strategy
- Max retries: 3 (configurable)
- Backoff: 2s × 2^(retryCount - 1) → 2s, 4s, 8s
- After max retries: permanent FAILED state

---

## 5. OPC UA Write Methods

### Biesse (OPC-40550-1 native)

Uses OPC UA Method Call on the Woodworking Production object:

| Command | Method Node | Input Arguments |
|---------|-------------|-----------------|
| START_JOB | `ns=4;s=Woodworking.Production.Methods.StartProgram` | (jobId: String, programRef: String) |
| PAUSE_JOB | `ns=4;s=Woodworking.Production.Methods.Pause` | (none) |
| RESUME_JOB | `ns=4;s=Woodworking.Production.Methods.Resume` | (none) |
| ABORT_JOB | `ns=4;s=Woodworking.Production.Methods.Abort` | (none) |

### Pre-write: Program Name
Before START_JOB, the program name is written to the ActiveProgram.Name variable node to load it into the machine buffer.

### Homag (OPC UA + HOMAG Connect)

For Homag, job commands route through the HOMAG Connect cloud API (`tapio`) for machines that don't expose native OPC UA methods:
- `POST /machines/{serial}/commands` with `{ action: "start", programId: "..." }`
- Fallback to OPC UA write for direct-connected machines

### KDT (Modbus TCP)

Command register write at holding register address:
- Register 100: Command code (1=Start, 2=Pause, 3=Resume, 4=Abort)
- Register 101-102: Job ID (ASCII encoded, 4 chars)
- Confirmation via polling register 110 (0=idle, 1=ack, 2=error)

---

## 6. Confirmation Strategy

| Command | Method | Expected State | Timeout |
|---------|--------|----------------|---------|
| START_JOB | State transition | WORKING | 10s |
| PAUSE_JOB | State transition | STANDBY | 5s |
| RESUME_JOB | State transition | WORKING | 5s |
| ABORT_JOB | State transition | READY | 15s |
| EMERGENCY_STOP | Method return | — | 2s |
| LOAD_PROGRAM | Method return | — | 30s |
| SET_MODE | State transition | — | 5s |
| RESET_ERROR | State transition | READY | 5s |

**State transition confirmation**: Polls `readUnitState()` every 500ms until expected state is observed or timeout expires.

---

## 7. API Endpoints

### POST /commands
Submit a command for execution.

```json
{
  "machineId": "biesse-rover-01",
  "commandType": "START_JOB",
  "priority": "NORMAL",
  "payload": {
    "type": "START_JOB",
    "jobId": "job-2024-001",
    "programRef": "sha256:abc123...def",
    "material": { "type": "MDF", "thickness": 18 }
  },
  "initiator": {
    "source": "factory_server",
    "actorId": "scheduler-01"
  },
  "timeoutMs": 30000
}
```

Response (202 Accepted):
```json
{
  "requestId": "uuid-v4...",
  "commandId": "cmd_a1b2c3d4e5f6...",
  "machineId": "biesse-rover-01",
  "commandType": "START_JOB",
  "status": "QUEUED",
  "message": "Command validated and queued for execution",
  "timestamps": { "receivedAt": "...", "validatedAt": "...", "queuedAt": "..." },
  "safetyGateResults": [...]
}
```

### POST /commands/emergency-stop
Shortcut for immediate E-STOP (bypasses queue).

### GET /commands/:commandId
Poll command status.

### DELETE /commands/:commandId
Cancel a QUEUED command.

---

## 8. Integration with Existing Services

### StateReconciliationEngine
- After START_JOB confirmed → `stateEngine.registerJob(machineId, jobId)`
- Existing WORKING→READY transition rule handles JOB_COMPLETED event
- Existing WORKING→ERROR transition rule handles JOB_ABORTED event

### ActivityLogBridge
- All command lifecycle events are published to `ds:job:lifecycle` Redis Stream
- Downstream ActivityLogBridge picks up for audit trail

### CASBridge
- Command requests can reference program files by CAS hash
- CASBridge validates hash exists before allowing START_JOB

### Hono Health API
- Existing `/health` endpoint extended with command queue depth metrics
- New `/commands/machine/:machineId` for per-machine queue visibility

---

## 9. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Unauthorized command injection | API key + initiator source validation |
| Command replay attack | requestId idempotency check |
| Race condition (concurrent commands) | Per-machine Redis lock (single execution) |
| State inconsistency after timeout | Mandatory state re-read before retry |
| Emergency stop reliability | CRITICAL bypass + minimal network path |
| Audit trail | Every command lifecycle → Redis Stream → ActivityLog |

---

## 10. File Structure (Phase 2 additions)

```
src/
├── types/
│   └── command.ts              — Command types, enums, interfaces
├── services/
│   ├── CommandSafetyGate.ts    — Pre-dispatch safety validation
│   ├── CommandQueue.ts         — Redis priority queue
│   └── CommandDispatcher.ts    — Orchestrator (validate → queue → dispatch → confirm)
├── api/
│   └── commands.ts             — Hono REST routes
└── adapters/
    └── BiesseAdapter.ts        — Extended with startJob/pauseJob/resumeJob/abortJob

tests/integration/
└── command-safety-gate.test.ts — Safety gate validation tests

infra/grafana/
├── provisioning/
│   ├── dashboards/
│   │   ├── dashboards.yml
│   │   └── digital-shadow-factory.json
│   └── datasources/
│       └── datasources.yml
```

---

## 11. Phase 2 → Phase 3 Bridge

Phase 2 establishes the write path. Phase 3 (Predictive Digital Twin) will add:
- **Adaptive scheduling**: DSAGA/RL-based job sequencing using the command layer
- **Predictive maintenance**: Auto-pause commands based on vibration anomalies
- **Simulation**: What-if scenario testing via shadow command execution
- **Closed-loop optimization**: Feed rate/spindle speed OPC UA variable writes based on real-time quality feedback
