/**
 * k6 Smoke Test — Quick validation that the command API handles concurrent load.
 * Runs 50 VUs for 15 seconds. Use before merging PRs.
 *
 * Usage:
 *   k6 run tests/load/k6-smoke.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3199';

const errorRate = new Rate('errors');
const latency = new Trend('submit_latency_ms', true);

export const options = {
  vus: 50,
  duration: '15s',
  thresholds: {
    errors: ['rate<0.10'],
    submit_latency_ms: ['p(95)<800'],
    http_req_failed: ['rate<0.10'],
  },
};

const MACHINES = ['biesse-rover-b-01', 'homag-centateq-p-01', 'kdt-kn3-01'];
const headers = { 'Content-Type': 'application/json' };

export function setup() {
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Service not ready at ${BASE_URL}`);
  }
}

export default function () {
  const machineId = MACHINES[Math.floor(Math.random() * MACHINES.length)];

  const body = JSON.stringify({
    machineId,
    commandType: 'START_JOB',
    priority: randomIntBetween(1, 3),
    payload: {
      type: 'START_JOB',
      jobId: `job-smoke-${randomString(8)}`,
      programRef: 'SMOKE_TEST.bpp',
      material: { type: 'MDF', thickness: 18 },
    },
    initiator: {
      source: 'factory_server',
      actorId: `smoke-vu-${__VU}`,
      traceId: `smoke-${randomString(6)}`,
    },
    timeoutMs: 5000,
  });

  const res = http.post(`${BASE_URL}/commands`, body, { headers });
  latency.add(res.timings.duration);

  const passed = check(res, {
    'status is 202 or 422': (r) => r.status === 202 || r.status === 422,
    'has commandId': (r) => {
      try { return r.json('commandId') !== undefined; } catch { return false; }
    },
    'response under 1s': (r) => r.timings.duration < 1000,
  });

  if (!passed) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  sleep(randomIntBetween(0.1, 0.5));
}
