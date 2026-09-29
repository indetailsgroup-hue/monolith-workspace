/**
 * k6 Load Test — Digital Shadow Service Command API
 *
 * Simulates 50 concurrent operators submitting commands through the Hono REST API.
 * Tests throughput, latency percentiles, error rates, and queue saturation.
 *
 * Usage:
 *   # Start Redis + server first:
 *   redis-server --port 6399 --daemonize yes
 *   npm run dev  # or: npx tsx src/index.ts
 *
 *   # Run load test:
 *   k6 run tests/load/k6-command-load.js
 *
 *   # Run with custom VUs/duration:
 *   k6 run --vus 100 --duration 60s tests/load/k6-command-load.js
 *
 * @module tests/load/k6-command-load
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ─── Configuration ────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3199';

// Custom metrics
const commandSubmitErrors = new Rate('command_submit_errors');
const commandCompletedRate = new Rate('command_completed_rate');
const commandRejectedRate = new Rate('command_rejected_rate');
const commandsSubmitted = new Counter('commands_submitted_total');
const commandsCompleted = new Counter('commands_completed_total');
const commandsFailed = new Counter('commands_failed_total');
const completionTime = new Trend('command_completion_time_ms', true);
const queueTime = new Trend('command_queue_time_ms', true);

// ─── Scenarios ────────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Scenario 1: Ramp up to 50 concurrent operators over 30s, sustain for 2min
    steady_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 25 },   // ramp up to 25
        { duration: '15s', target: 50 },   // ramp up to 50
        { duration: '120s', target: 50 },  // sustain 50 operators
        { duration: '15s', target: 0 },    // ramp down
      ],
      gracefulRampDown: '10s',
      exec: 'operatorWorkflow',
    },

    // Scenario 2: Burst — 50 operators fire simultaneously
    burst_spike: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 5,
      startTime: '180s',  // start after steady_load finishes
      maxDuration: '60s',
      exec: 'burstSubmit',
    },

    // Scenario 3: Emergency stop stress test
    emergency_stress: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      startTime: '250s',  // after burst
      exec: 'emergencyStopFlow',
    },
  },

  thresholds: {
    // P95 response time under 500ms for submit
    'http_req_duration{endpoint:submit}': ['p(95)<500', 'p(99)<1000'],
    // P95 under 200ms for status check
    'http_req_duration{endpoint:status}': ['p(95)<200'],
    // Error rate below 5%
    command_submit_errors: ['rate<0.05'],
    // At least 80% of commands complete successfully
    command_completed_rate: ['rate>0.80'],
    // P95 completion time under 3s
    command_completion_time_ms: ['p(95)<3000'],
    // Overall HTTP failure rate
    http_req_failed: ['rate<0.05'],
  },
};

// ─── Machine Pool ─────────────────────────────────────────────────────────────

const MACHINES = [
  'biesse-rover-b-01',
  'homag-centateq-p-01',
  'kdt-kn3-01',
];

const PROGRAMS = [
  'PANEL_CUT_001.bpp',
  'EDGE_BAND_A.mpr',
  'DRILL_PATTERN_X.nc',
  'SHELF_ROUTE_B.cnc',
  'CABINET_DOOR_C.bpp',
  'DRAWER_FACE_D.mpr',
  'COUNTERTOP_E.nc',
  'BOOKCASE_F.bpp',
];

const MATERIALS = [
  { type: 'MDF', thickness: 18 },
  { type: 'MDF', thickness: 25 },
  { type: 'Plywood', thickness: 15 },
  { type: 'Melamine', thickness: 18 },
  { type: 'Solid_Oak', thickness: 20 },
  { type: 'HPL', thickness: 12 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildStartJobRequest(machineId) {
  return JSON.stringify({
    machineId: machineId || randomItem(MACHINES),
    commandType: 'START_JOB',
    priority: randomIntBetween(1, 3), // HIGH=1, NORMAL=2, LOW=3
    payload: {
      type: 'START_JOB',
      jobId: `job-load-${randomString(8)}`,
      programRef: randomItem(PROGRAMS),
      material: randomItem(MATERIALS),
    },
    initiator: {
      source: 'factory_server',
      actorId: `operator-${__VU}-${__ITER}`,
      traceId: `trace-k6-${randomString(12)}`,
    },
    timeoutMs: 10000,
  });
}

function buildPauseRequest(machineId) {
  return JSON.stringify({
    machineId,
    commandType: 'PAUSE_JOB',
    priority: 2,
    payload: { type: 'PAUSE_JOB', reason: 'operator_request' },
    initiator: { source: 'operator_panel', actorId: `operator-${__VU}` },
    timeoutMs: 5000,
  });
}

function buildAbortRequest(machineId) {
  return JSON.stringify({
    machineId,
    commandType: 'ABORT_JOB',
    priority: 1,
    payload: { type: 'ABORT_JOB', reason: 'load_test_cleanup', graceful: true },
    initiator: { source: 'factory_server', actorId: `operator-${__VU}` },
    timeoutMs: 15000,
  });
}

function buildEmergencyStop(machineId) {
  return JSON.stringify({
    machineId,
    source: 'operator',
    actorId: `emergency-operator-${__VU}`,
  });
}

const headers = { 'Content-Type': 'application/json' };

function submitCommand(body) {
  const res = http.post(`${BASE_URL}/commands`, body, {
    headers,
    tags: { endpoint: 'submit' },
  });
  commandsSubmitted.add(1);
  return res;
}

function getCommandStatus(commandId) {
  return http.get(`${BASE_URL}/commands/${commandId}`, {
    tags: { endpoint: 'status' },
  });
}

function waitForCompletion(commandId, maxWaitMs = 8000) {
  const start = Date.now();
  const pollInterval = 300; // ms

  while (Date.now() - start < maxWaitMs) {
    const res = getCommandStatus(commandId);
    if (res.status === 200) {
      const data = res.json();
      if (['COMPLETED', 'FAILED', 'REJECTED', 'TIMED_OUT', 'CANCELLED'].includes(data.status)) {
        const elapsed = Date.now() - start;
        completionTime.add(elapsed);
        return data;
      }
    }
    sleep(pollInterval / 1000);
  }

  // Timeout — get final state
  const finalRes = getCommandStatus(commandId);
  return finalRes.status === 200 ? finalRes.json() : null;
}

// ─── Scenario Executors ───────────────────────────────────────────────────────

/**
 * Scenario 1: Full operator workflow
 * Each VU simulates an operator: submit START → poll status → sometimes PAUSE → ABORT
 */
export function operatorWorkflow() {
  const machineId = randomItem(MACHINES);

  group('operator_submit_start', () => {
    const res = submitCommand(buildStartJobRequest(machineId));

    const isAccepted = check(res, {
      'submit: status is 202 (queued)': (r) => r.status === 202,
      'submit: has commandId': (r) => r.json('commandId') !== undefined,
      'submit: has requestId': (r) => r.json('requestId') !== undefined,
    });

    if (!isAccepted) {
      // Check if rejected by safety gate (422) — this is expected under load
      if (res.status === 422) {
        commandRejectedRate.add(1);
        commandCompletedRate.add(0);
      } else {
        commandSubmitErrors.add(1);
        commandCompletedRate.add(0);
      }
      return;
    }

    commandSubmitErrors.add(0);
    const commandId = res.json('commandId');

    // Poll for completion
    const result = waitForCompletion(commandId);
    if (result && result.status === 'COMPLETED') {
      commandCompletedRate.add(1);
      commandsCompleted.add(1);
    } else {
      commandCompletedRate.add(0);
      commandsFailed.add(1);
    }
  });

  // Random pause between operations (simulate human think time)
  sleep(randomIntBetween(1, 3));

  // 30% chance operator also sends a PAUSE
  if (Math.random() < 0.3) {
    group('operator_pause', () => {
      const res = submitCommand(buildPauseRequest(machineId));
      check(res, {
        'pause: accepted or rejected': (r) => r.status === 202 || r.status === 422,
      });
    });
    sleep(1);
  }
}

/**
 * Scenario 2: Burst submission
 * All 50 VUs submit 5 commands each as fast as possible
 */
export function burstSubmit() {
  const machineId = randomItem(MACHINES);
  const body = buildStartJobRequest(machineId);

  const res = submitCommand(body);

  const accepted = check(res, {
    'burst: status is 202 or 422': (r) => r.status === 202 || r.status === 422,
    'burst: response time < 1s': (r) => r.timings.duration < 1000,
  });

  if (res.status === 202) {
    const commandId = res.json('commandId');
    const result = waitForCompletion(commandId, 5000);
    if (result && result.status === 'COMPLETED') {
      commandCompletedRate.add(1);
      commandsCompleted.add(1);
    } else {
      commandCompletedRate.add(0);
    }
  } else if (res.status === 422) {
    commandRejectedRate.add(1);
  } else {
    commandSubmitErrors.add(1);
  }

  // Minimal delay between burst requests
  sleep(0.1);
}

/**
 * Scenario 3: Emergency stop stress
 * Tests the CRITICAL priority bypass path under sustained load
 */
export function emergencyStopFlow() {
  const machineId = randomItem(MACHINES);

  group('emergency_stop', () => {
    const res = http.post(
      `${BASE_URL}/commands/emergency-stop`,
      buildEmergencyStop(machineId),
      { headers, tags: { endpoint: 'emergency' } },
    );

    check(res, {
      'emergency: status is 200 or 500': (r) => r.status === 200 || r.status === 500,
      'emergency: response time < 2s': (r) => r.timings.duration < 2000,
    });
  });

  sleep(randomIntBetween(2, 4));
}

// ─── Setup & Teardown ─────────────────────────────────────────────────────────

export function setup() {
  // Verify service is running
  const healthRes = http.get(`${BASE_URL}/health`);
  const healthy = check(healthRes, {
    'setup: service is healthy': (r) => r.status === 200,
    'setup: status is running': (r) => r.json('status') === 'running',
  });

  if (!healthy) {
    throw new Error(`Service not healthy at ${BASE_URL}. Start the server first.`);
  }

  return {
    startTime: new Date().toISOString(),
    baseUrl: BASE_URL,
  };
}

export function teardown(data) {
  console.log(`\n═══ Load Test Summary ═══`);
  console.log(`Started at: ${data.startTime}`);
  console.log(`Ended at:   ${new Date().toISOString()}`);
  console.log(`Base URL:   ${data.baseUrl}`);
  console.log(`═════════════════════════\n`);
}
