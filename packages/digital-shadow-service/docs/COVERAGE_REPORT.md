# Test Coverage Report — Digital Shadow Service

**Generated**: 2026-08-28  
**Test Framework**: Vitest 2.1.9 + @vitest/coverage-v8  
**Total Tests**: 70 passing (across 5 test files)

---

## Summary

| Metric | Coverage | Status |
|--------|----------|--------|
| **Statements** | 37.8% (1,205 / 3,185) | ⚠️ Below 60% target |
| **Branches** | 72.6% (178 / 245) | ✅ Above 50% target |
| **Functions** | 72.6% (69 / 95) | ✅ Above 60% target |
| **Lines** | 37.8% (1,205 / 3,185) | ⚠️ Below 60% target |

> **Note**: Statement/Line coverage is low because HomagAdapter, KdtAdapter, and infrastructure services (MQTT, OPC UA orchestrator, CAS Bridge) require real hardware/server connections for testing. The **actively testable code** (command pathway) achieves **82-93% coverage**.

---

## Per-File Breakdown

### API Layer (93.4% coverage ✅)

| File | Stmts | Branch | Funcs | Lines | Notes |
|------|-------|--------|-------|-------|-------|
| `api/commands.ts` | 93.4% | 87.5% | 100% | 93.4% | Only uncovered: error edge cases (L121-128, 169-170) |

### Services — Command Pathway (81-83% ✅)

| File | Stmts | Branch | Funcs | Lines | Notes |
|------|-------|--------|-------|-------|-------|
| `CommandDispatcher.ts` | 82.9% | 66.2% | 100% | 82.9% | Core orchestration fully tested |
| `CommandQueue.ts` | 81.1% | 85.4% | 80% | 81.1% | Redis queue operations well covered |
| `CommandSafetyGate.ts` | 82.4% | 88.7% | 100% | 82.4% | All gate types validated |

### Adapters

| File | Stmts | Branch | Funcs | Lines | Notes |
|------|-------|--------|-------|-------|-------|
| `BiesseAdapter.ts` | 62.2% | 46.9% | 68.2% | 62.2% | Partially tested via mock OPC UA |
| `BaseMachineAdapter.ts` | 44.4% | 77.8% | 58.3% | 44.4% | Abstract base, partial |
| `HomagAdapter.ts` | 0% | 0% | 0% | 0% | Needs HOMAG Connect API mock |
| `KdtAdapter.ts` | 0% | 0% | 0% | 0% | Needs Modbus TCP mock |

### Services — Infrastructure (0% — requires external systems)

| File | Stmts | Notes |
|------|-------|-------|
| `MqttIngestionService.ts` | 0% | Needs MQTT broker + InfluxDB |
| `OpcuaClientService.ts` | 0% | Needs OPC UA server |
| `StateReconciliationEngine.ts` | 0% | Needs OPC UA server |
| `ActivityLogBridge.ts` | 0% | Needs Factory Server |
| `CASBridge.ts` | 0% | Needs CAS storage backend |
| `SensorBatchSigner.ts` | 45.2% | Crypto operations tested |

---

## Test Suite Breakdown

| Test File | Tests | Duration | Focus |
|-----------|-------|----------|-------|
| `tests/e2e/command-api.e2e.test.ts` | 23 | ~8.5s | Full HTTP + Redis E2E |
| `tests/integration/command-lifecycle.test.ts` | 24 | ~3.2s | Queue→Dispatch→Confirm |
| `tests/integration/command-safety-gate.test.ts` | 13 | 10ms | Safety gate validation |
| `tests/adapters/BiesseAdapter.test.ts` | 6 | 127ms | Adapter unit test |
| `tests/services/SensorBatchSigner.test.ts` | 4 | 6ms | Crypto signing |
| **Total** | **70** | **~14s** | |

### Excluded from Coverage Run (require OPC UA server):
- `tests/integration/biesse-lifecycle.test.ts` (25 tests)
- `tests/integration/state-reconciliation.test.ts` (8 tests)

---

## Coverage Improvement Plan

| Priority | Action | Expected Gain |
|----------|--------|---------------|
| 1 | Add Modbus TCP mock for KdtAdapter tests | +16% statements |
| 2 | Add HOMAG Connect API mock (nock/msw) | +18% statements |
| 3 | Add MQTT broker mock (aedes) for ingestion tests | +11% statements |
| 4 | Add CAS/ActivityLog unit tests with mock HTTP | +10% statements |
| 5 | Integration test with testcontainers (InfluxDB) | +8% statements |

**Projected coverage after Plan 1-4**: ~75-80% statements

---

## Running Coverage

```bash
# Full coverage (excluding OPC UA tests)
npm run test:coverage

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# Load tests (requires server running)
npm run test:load:smoke   # Quick 15s smoke test
npm run test:load         # Full 5-minute load test
```

---

## HTML Report

Coverage HTML report is generated at `./coverage/index.html`.  
Open in browser: `npx serve coverage/`
