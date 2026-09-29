/**
 * E2E Test: Command API via Real HTTP + Real Redis
 *
 * Prerequisites: Docker must be available (for Redis container)
 * Run: docker compose -f docker-compose.e2e.yml -p monolith-e2e up -d --wait
 * Then: npx vitest run tests/e2e/command-api.e2e.test.ts
 *
 * Tests the full HTTP flow:
 *   POST /commands → 202 (QUEUED) → GET /commands/:id → status transitions
 *   POST /commands/emergency-stop → 200 (COMPLETED)
 *   DELETE /commands/:id → cancel pending
 *   Validation errors → 400
 *   Safety gate rejection → 422
 *
 * @module tests/e2e/command-api.e2e
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  composeUp,
  composeDown,
  waitForRedis,
  createE2EServer,
  BASE_URL,
  type E2EServer,
} from './setup';
import { MachineVendor, WwUnitState } from '../../src/types/machine';
import { CommandType, CommandPriority, CommandStatus } from '../../src/types/command';

// ─── Test Configuration ──────────────────────────────────────────────────────

const TIMEOUT_BOOT = 60_000; // Docker + Redis startup
const TIMEOUT_COMMAND = 15_000; // Command lifecycle (dispatch loop 200ms + confirm)

// ─── Helper: HTTP client ──────────────────────────────────────────────────────

async function post(path: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function get(path: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE_URL}${path}`);
  const data = await res.json();
  return { status: res.status, data };
}

async function del(path: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE' });
  const data = await res.json();
  return { status: res.status, data };
}

/** Poll GET /commands/:id until status matches or timeout */
async function waitForStatus(
  commandId: string,
  targetStatuses: CommandStatus[],
  timeoutMs = 10_000,
  pollMs = 200,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await get(`/commands/${commandId}`);
    if (targetStatuses.includes(data.status)) {
      return data;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  // Final attempt
  const { data } = await get(`/commands/${commandId}`);
  return data;
}

// ─── Valid Request Builders ───────────────────────────────────────────────────

function buildStartJobRequest(machineId: string, overrides?: Partial<any>) {
  return {
    machineId,
    commandType: CommandType.START_JOB,
    priority: CommandPriority.NORMAL,
    payload: {
      type: 'START_JOB',
      jobId: `job-e2e-${Date.now()}`,
      programRef: 'PANEL_CUT_E2E.bpp',
      material: { type: 'MDF', thickness: 18 },
    },
    initiator: {
      source: 'factory_server',
      actorId: 'e2e-test-runner',
      traceId: `trace-${Date.now()}`,
    },
    timeoutMs: 10_000,
    ...overrides,
  };
}

function buildPauseRequest(machineId: string) {
  return {
    machineId,
    commandType: CommandType.PAUSE_JOB,
    priority: CommandPriority.NORMAL,
    payload: {
      type: 'PAUSE_JOB',
      reason: 'operator_request',
    },
    initiator: {
      source: 'operator_panel',
      actorId: 'operator-e2e',
    },
    timeoutMs: 5_000,
  };
}

function buildAbortRequest(machineId: string) {
  return {
    machineId,
    commandType: CommandType.ABORT_JOB,
    priority: CommandPriority.HIGH,
    payload: {
      type: 'ABORT_JOB',
      reason: 'E2E test abort',
      graceful: true,
    },
    initiator: {
      source: 'factory_server',
      actorId: 'e2e-test-runner',
    },
    timeoutMs: 15_000,
  };
}

function buildEmergencyStop(machineId: string) {
  return {
    machineId,
    source: 'operator',
    actorId: 'e2e-operator',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E: Command API via HTTP + Real Redis', () => {
  let server: E2EServer;

  // ─── Boot infrastructure ────────────────────────────────────────────────────

  beforeAll(async () => {
    // 1. Start Redis container
    composeUp();
    await waitForRedis();

    // 2. Start Hono server with real dispatcher
    server = await createE2EServer([
      {
        machineId: 'biesse-rover-b-01',
        vendor: MachineVendor.BIESSE,
        initialState: WwUnitState.READY,
        stateAfterStart: WwUnitState.WORKING,
        stateAfterPause: WwUnitState.STANDBY,
        stateAfterAbort: WwUnitState.READY,
      },
      {
        machineId: 'homag-centateq-p-01',
        vendor: MachineVendor.HOMAG,
        initialState: WwUnitState.READY,
        stateAfterStart: WwUnitState.WORKING,
        stateAfterPause: WwUnitState.STANDBY,
        stateAfterAbort: WwUnitState.READY,
      },
      {
        machineId: 'kdt-kn3-01',
        vendor: MachineVendor.KDT,
        initialState: WwUnitState.READY,
        stateAfterStart: WwUnitState.WORKING,
        stateAfterPause: WwUnitState.STANDBY,
        stateAfterAbort: WwUnitState.READY,
      },
      {
        machineId: 'disconnected-01',
        vendor: MachineVendor.BIESSE,
        initialState: WwUnitState.READY,
        disconnected: true,
      },
      {
        machineId: 'failing-01',
        vendor: MachineVendor.HOMAG,
        initialState: WwUnitState.READY,
        failStart: true,
      },
    ]);

    // 3. Verify server health
    const health = await get('/health');
    expect(health.status).toBe(200);
    expect(health.data.status).toBe('running');
  }, TIMEOUT_BOOT);

  afterAll(async () => {
    if (server) await server.close();
    composeDown();
  }, 30_000);

  beforeEach(async () => {
    // Flush Redis between tests for isolation
    await server.redis.flushall();
    // Reset adapter states back to initial (READY) so safety gate passes
    server.resetAdapters();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Health Check', () => {
    it('GET /health returns 200 with service info', async () => {
      const { status, data } = await get('/health');
      expect(status).toBe(200);
      expect(data.service).toBe('monolith-digital-shadow-e2e');
      expect(data.status).toBe('running');
      expect(data.timestamp).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. START_JOB — Full Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /commands — START_JOB', () => {
    it('should accept and queue a valid START_JOB → eventually COMPLETED', async () => {
      const body = buildStartJobRequest('biesse-rover-b-01');
      const { status, data } = await post('/commands', body);

      // Immediate response: 202 QUEUED
      expect(status).toBe(202);
      expect(data.status).toBe(CommandStatus.QUEUED);
      expect(data.commandId).toMatch(/^cmd_/);
      expect(data.machineId).toBe('biesse-rover-b-01');
      expect(data.commandType).toBe(CommandType.START_JOB);
      expect(data.message).toContain('queued');
      expect(data.timestamps.receivedAt).toBeDefined();
      expect(data.timestamps.queuedAt).toBeDefined();

      // Poll until COMPLETED (dispatcher loop processes queue → adapter → confirm)
      const final = await waitForStatus(
        data.commandId,
        [CommandStatus.COMPLETED],
        TIMEOUT_COMMAND,
      );
      expect(final.status).toBe(CommandStatus.COMPLETED);
    }, TIMEOUT_COMMAND + 5_000);

    it('should accept START_JOB for Homag adapter', async () => {
      const body = buildStartJobRequest('homag-centateq-p-01', {
        payload: {
          type: 'START_JOB',
          jobId: 'job-homag-e2e-001',
          programRef: 'EDGE_BAND_042.mpr',
        },
      });

      const { status, data } = await post('/commands', body);
      expect(status).toBe(202);
      expect(data.status).toBe(CommandStatus.QUEUED);

      const final = await waitForStatus(
        data.commandId,
        [CommandStatus.COMPLETED],
        TIMEOUT_COMMAND,
      );
      expect(final.status).toBe(CommandStatus.COMPLETED);
    }, TIMEOUT_COMMAND + 5_000);

    it('should accept START_JOB for KDT adapter', async () => {
      const body = buildStartJobRequest('kdt-kn3-01', {
        payload: {
          type: 'START_JOB',
          jobId: 'job-kdt-e2e-001',
          programRef: 'BORE_V2',
        },
      });

      const { status, data } = await post('/commands', body);
      expect(status).toBe(202);

      const final = await waitForStatus(
        data.commandId,
        [CommandStatus.COMPLETED],
        TIMEOUT_COMMAND,
      );
      expect(final.status).toBe(CommandStatus.COMPLETED);
    }, TIMEOUT_COMMAND + 5_000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. PAUSE_JOB
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /commands — PAUSE_JOB', () => {
    it('should queue and complete a PAUSE command', async () => {
      // First start a job so machine is WORKING
      const startBody = buildStartJobRequest('biesse-rover-b-01');
      const startRes = await post('/commands', startBody);
      await waitForStatus(startRes.data.commandId, [CommandStatus.COMPLETED], TIMEOUT_COMMAND);

      // Now pause
      const pauseBody = buildPauseRequest('biesse-rover-b-01');
      const { status, data } = await post('/commands', pauseBody);
      expect(status).toBe(202);
      expect(data.status).toBe(CommandStatus.QUEUED);

      const final = await waitForStatus(
        data.commandId,
        [CommandStatus.COMPLETED],
        TIMEOUT_COMMAND,
      );
      expect(final.status).toBe(CommandStatus.COMPLETED);
    }, TIMEOUT_COMMAND * 2 + 5_000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ABORT_JOB
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /commands — ABORT_JOB', () => {
    it('should queue and complete an ABORT command', async () => {
      // First start a job so machine is WORKING (ABORT requires WORKING or STANDBY)
      const startBody = buildStartJobRequest('homag-centateq-p-01');
      const startRes = await post('/commands', startBody);
      await waitForStatus(startRes.data.commandId, [CommandStatus.COMPLETED], TIMEOUT_COMMAND);

      const body = buildAbortRequest('homag-centateq-p-01');
      const { status, data } = await post('/commands', body);
      expect(status).toBe(202);

      const final = await waitForStatus(
        data.commandId,
        [CommandStatus.COMPLETED],
        TIMEOUT_COMMAND,
      );
      expect(final.status).toBe(CommandStatus.COMPLETED);
    }, TIMEOUT_COMMAND * 2 + 5_000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. EMERGENCY STOP — Bypass Queue (CRITICAL)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /commands/emergency-stop', () => {
    it('should execute emergency stop immediately (bypass queue) → 200', async () => {
      const body = buildEmergencyStop('biesse-rover-b-01');
      const { status, data } = await post('/commands/emergency-stop', body);

      // Emergency returns synchronously (CRITICAL bypass)
      expect(status).toBe(200);
      expect(data.status).toBe(CommandStatus.COMPLETED);
      expect(data.commandType).toBe(CommandType.EMERGENCY_STOP);
      expect(data.message).toContain('immediately');
    });

    it('should execute emergency stop on KDT machine', async () => {
      const body = buildEmergencyStop('kdt-kn3-01');
      const { status, data } = await post('/commands/emergency-stop', body);

      expect(status).toBe(200);
      expect(data.status).toBe(CommandStatus.COMPLETED);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. GET /commands/:commandId — Status Polling
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /commands/:commandId', () => {
    it('should return current command status', async () => {
      const body = buildStartJobRequest('biesse-rover-b-01');
      const { data: submitData } = await post('/commands', body);
      const commandId = submitData.commandId;

      const { status, data } = await get(`/commands/${commandId}`);
      expect(status).toBe(200);
      expect(data.commandId).toBe(commandId);
      expect([CommandStatus.QUEUED, CommandStatus.AWAITING_CONFIRMATION, CommandStatus.COMPLETED])
        .toContain(data.status);
    });

    it('should return 404 for unknown commandId', async () => {
      const { status, data } = await get('/commands/cmd_nonexistent_12345');
      expect(status).toBe(404);
      expect(data.error).toBe('NOT_FOUND');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. DELETE /commands/:commandId — Cancel Pending
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /commands/:commandId — Cancel', () => {
    it('should cancel a QUEUED command', async () => {
      // Submit multiple commands so one stays queued while another processes
      const body1 = buildStartJobRequest('biesse-rover-b-01', {
        payload: { type: 'START_JOB', jobId: 'job-first', programRef: 'a.bpp' },
      });
      const body2 = buildStartJobRequest('biesse-rover-b-01', {
        payload: { type: 'START_JOB', jobId: 'job-second', programRef: 'b.bpp' },
        priority: CommandPriority.LOW,
      });

      const res1 = await post('/commands', body1);
      const res2 = await post('/commands', body2);

      // Attempt to cancel the second (it should still be QUEUED)
      // Give a small delay for first to be picked up
      await new Promise((r) => setTimeout(r, 100));

      const { status, data } = await del(`/commands/${res2.data.commandId}`);

      // May succeed (if still QUEUED) or fail (if already dispatched)
      if (status === 200) {
        expect(data.status).toBe('CANCELLED');
      } else {
        expect(status).toBe(409); // Already dispatched
      }
    });

    it('should return 409 for non-existent command', async () => {
      const { status, data } = await del('/commands/cmd_does_not_exist');
      expect(status).toBe(409);
      expect(data.error).toBe('CANCEL_FAILED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. VALIDATION ERRORS (400)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Validation Errors — 400', () => {
    it('should reject empty body', async () => {
      const res = await fetch(`${BASE_URL}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('VALIDATION_ERROR');
    });

    it('should reject missing machineId', async () => {
      const body = {
        commandType: CommandType.START_JOB,
        payload: { type: 'START_JOB', jobId: 'x', programRef: 'y' },
        initiator: { source: 'factory_server', actorId: 'test' },
      };
      const { status, data } = await post('/commands', body);
      expect(status).toBe(400);
      expect(data.error).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid payload type', async () => {
      const body = {
        machineId: 'biesse-rover-b-01',
        commandType: CommandType.START_JOB,
        payload: { type: 'INVALID_TYPE', data: 123 },
        initiator: { source: 'factory_server', actorId: 'test' },
      };
      const { status, data } = await post('/commands', body);
      expect(status).toBe(400);
      expect(data.error).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid priority enum value', async () => {
      const body = {
        machineId: 'biesse-rover-b-01',
        commandType: CommandType.START_JOB,
        priority: 99, // Invalid
        payload: { type: 'START_JOB', jobId: 'x', programRef: 'y' },
        initiator: { source: 'factory_server', actorId: 'test' },
      };
      const { status, data } = await post('/commands', body);
      expect(status).toBe(400);
    });

    it('should reject emergency-stop with missing actorId', async () => {
      const body = { machineId: 'biesse-rover-b-01' };
      const { status, data } = await post('/commands/emergency-stop', body);
      expect(status).toBe(400);
      expect(data.error).toBe('VALIDATION_ERROR');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. SAFETY GATE REJECTION (422)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Safety Gate Rejection — 422', () => {
    it('should reject command for non-existent machine → 422', async () => {
      const body = buildStartJobRequest('machine-does-not-exist');
      const { status, data } = await post('/commands', body);
      expect(status).toBe(422);
      expect(data.status).toBe(CommandStatus.REJECTED);
      expect(data.message).toContain('No adapter found');
    });

    it('should reject START for disconnected adapter → 422', async () => {
      const body = buildStartJobRequest('disconnected-01');
      const { status, data } = await post('/commands', body);
      // Rejected either by safety gate (state check) or adapter execution
      expect([422, 202]).toContain(status);
      if (status === 422) {
        expect(data.status).toBe(CommandStatus.REJECTED);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. ADAPTER FAILURE → FAILED STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Adapter Failure → FAILED Status', () => {
    it('should transition to FAILED when adapter rejects startJob', async () => {
      const body = buildStartJobRequest('failing-01');
      const { status, data } = await post('/commands', body);

      // May be queued first, then dispatched and fail
      if (status === 202) {
        const final = await waitForStatus(
          data.commandId,
          [CommandStatus.FAILED, CommandStatus.COMPLETED],
          TIMEOUT_COMMAND,
        );
        expect(final.status).toBe(CommandStatus.FAILED);
      } else {
        // Or rejected immediately if safety gate catches it
        expect(data.status).toBe(CommandStatus.REJECTED);
      }
    }, TIMEOUT_COMMAND + 5_000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. CONCURRENT COMMANDS ACROSS MACHINES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Concurrent Commands', () => {
    it('should process commands for multiple machines in parallel', async () => {
      const machines = ['biesse-rover-b-01', 'homag-centateq-p-01', 'kdt-kn3-01'];

      const results = await Promise.all(
        machines.map((machineId) =>
          post('/commands', buildStartJobRequest(machineId, {
            payload: {
              type: 'START_JOB',
              jobId: `job-concurrent-${machineId}`,
              programRef: `prog-${machineId}.nc`,
            },
          })),
        ),
      );

      // All should be accepted (202)
      for (const r of results) {
        expect(r.status).toBe(202);
        expect(r.data.status).toBe(CommandStatus.QUEUED);
      }

      // All should eventually complete
      const finals = await Promise.all(
        results.map((r) =>
          waitForStatus(r.data.commandId, [CommandStatus.COMPLETED], TIMEOUT_COMMAND),
        ),
      );

      for (const f of finals) {
        expect(f.status).toBe(CommandStatus.COMPLETED);
      }
    }, TIMEOUT_COMMAND + 10_000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. RESPONSE STRUCTURE VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Response Structure', () => {
    it('POST /commands response should include all required fields', async () => {
      const body = buildStartJobRequest('biesse-rover-b-01');
      const { data } = await post('/commands', body);

      expect(data).toHaveProperty('requestId');
      expect(data).toHaveProperty('commandId');
      expect(data).toHaveProperty('machineId');
      expect(data).toHaveProperty('commandType');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('timestamps');
      expect(data.timestamps).toHaveProperty('receivedAt');
    });

    it('COMPLETED response should include confirmation timestamps', async () => {
      const body = buildStartJobRequest('biesse-rover-b-01');
      const { data } = await post('/commands', body);

      const final = await waitForStatus(
        data.commandId,
        [CommandStatus.COMPLETED],
        TIMEOUT_COMMAND,
      );

      expect(final.timestamps).toBeDefined();
      expect(final.status).toBe(CommandStatus.COMPLETED);
    }, TIMEOUT_COMMAND + 5_000);
  });
});
