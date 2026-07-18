/**
 * factory.test.ts - Factory routes (S18 l6-server-api)
 *
 * The legacy download endpoint must refuse honestly (501 E_NOT_IMPLEMENTED)
 * instead of fabricating mock G-code with a real-looking SHA-256 header.
 * The real packet path is the Supabase edge factory-api:
 * GET /factory/jobs/:jobId/export (signed URL, RELEASED-only).
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { factoryRouter } from './factory.js';
import type { CAS } from '../../storage/cas.js';

const RELEASED_EXPORT = {
  exportId: 'e-1',
  jobId: 'JOB-2026-0001',
  dialect: 'KDT',
  profileId: 'kdt_mvp_v1',
  target: 'GCODE',
  mode: 'PER_JOB',
  exportedAt: '2026-07-18T00:00:00.000Z',
  sha256: '0'.repeat(64),
};

// CAS stub: the legacy route used this record to fabricate G-code — the stub
// keeps that path reachable so the test proves the fabrication is gone.
const casStub = {
  putJson: async () => {},
  readJsonSafe: async () => RELEASED_EXPORT,
  list: async () => [],
} as unknown as CAS;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/factory', factoryRouter({ cas: casStub }));
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe('GET /factory/jobs/:jobId/export/:exportId/download (legacy)', () => {
  it('returns 501 E_NOT_IMPLEMENTED with a Thai message pointing to the real path', async () => {
    const res = await fetch(`${baseUrl}/factory/jobs/JOB-2026-0001/export/e-1/download`);
    expect(res.status).toBe(501);
    const body = (await res.json()) as { ok: boolean; error: string; message: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('E_NOT_IMPLEMENTED');
    // Message speaks Thai and points at the real export path (factory-api).
    expect(body.message).toMatch(/[ก-๙]/);
    expect(body.message).toContain('factory-api');
  });

  it('does not fabricate G-code bytes or a mock SHA header', async () => {
    const res = await fetch(`${baseUrl}/factory/jobs/JOB-2026-0001/export/e-1/download`);
    expect(res.status).toBe(501);
    expect(res.headers.get('x-monolith-zip-sha256')).toBeNull();
    expect(res.headers.get('content-disposition')).toBeNull();
    const text = await res.text();
    expect(text).not.toContain('G21');
    expect(text).not.toContain('M30');
  });
});
