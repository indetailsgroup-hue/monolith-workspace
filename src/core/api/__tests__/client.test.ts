/**
 * client.test.ts - API client Thai error mapping (S18 l6-server-api)
 *
 * จุดเดียวที่แปลง HTTP status เป็นข้อความไทยที่ผู้ใช้อ่านรู้เรื่อง:
 * 401 → เซสชันหมดอายุ, 403 → สิทธิ์ไม่พอ (ต้องเป็น <role>), 409 → ข้อมูลถูกเปลี่ยน
 * โดยโค้ดเดิมที่อ่าน error (code / statusCode / details) ต้องยังทำงานเหมือนเดิม
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiGet, ApiRequestError, thaiErrorMessage } from '../client';

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function captureError(promise: Promise<unknown>): Promise<ApiRequestError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiRequestError);
    return err as ApiRequestError;
  }
  throw new Error('expected ApiRequestError');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('thaiErrorMessage (จุดเดียวของข้อความไทย)', () => {
  it('maps 401/403/409 to Thai messages and leaves other statuses alone', () => {
    expect(thaiErrorMessage(401)).toBe('เซสชันหมดอายุ — เข้าสู่ระบบใหม่');
    expect(thaiErrorMessage(403, { requiredRole: 'FACTORY' })).toBe(
      'สิทธิ์ไม่พอ (ต้องเป็น FACTORY)'
    );
    expect(thaiErrorMessage(403)).toBe('สิทธิ์ไม่พอ');
    expect(thaiErrorMessage(409)).toBe('ข้อมูลถูกเปลี่ยนโดยคนอื่น — รีเฟรชก่อน');
    expect(thaiErrorMessage(500)).toBeNull();
    expect(thaiErrorMessage(404)).toBeNull();
  });
});

describe('apiGet error mapping', () => {
  it('401 → เซสชันหมดอายุ โดยยังรักษา code/statusCode เดิม', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { code: 'E_SESSION_EXPIRED', message: 'jwt expired' }))
    );
    const err = await captureError(apiGet('/api/factory/jobs'));
    expect(err.message).toBe('เซสชันหมดอายุ — เข้าสู่ระบบใหม่');
    expect(err.code).toBe('E_SESSION_EXPIRED');
    expect(err.statusCode).toBe(401);
  });

  it('403 → สิทธิ์ไม่พอ พร้อม role ที่ต้องมีจาก body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(403, { error: 'insufficient role', requiredRole: 'FACTORY' })
      )
    );
    const err = await captureError(apiGet('/api/factory/jobs'));
    expect(err.message).toBe('สิทธิ์ไม่พอ (ต้องเป็น FACTORY)');
    expect(err.statusCode).toBe(403);
    // โค้ดเดิมอ่าน details ต่อได้
    expect(err.details).toMatchObject({ error: 'insufficient role' });
  });

  it('403 ไม่มี role ใน body → ข้อความไทยแบบไม่มีวงเล็บ', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(403, { error: 'insufficient role' }))
    );
    const err = await captureError(apiGet('/api/factory/jobs'));
    expect(err.message).toBe('สิทธิ์ไม่พอ');
  });

  it('409 → ข้อมูลถูกเปลี่ยนโดยคนอื่น', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(409, { error: 'conflict', message: 'stale revision' }))
    );
    const err = await captureError(apiGet('/api/factory/jobs/JOB-1'));
    expect(err.message).toBe('ข้อมูลถูกเปลี่ยนโดยคนอื่น — รีเฟรชก่อน');
    expect(err.statusCode).toBe(409);
  });

  it('status อื่นคงข้อความ server เดิม (โค้ดเดิมยังทำงาน)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(500, { code: 'E_INTERNAL', message: 'boom' }))
    );
    const err = await captureError(apiGet('/api/health'));
    expect(err.message).toBe('boom');
    expect(err.code).toBe('E_INTERNAL');
    expect(err.statusCode).toBe(500);
  });

  it('2xx คืน data ตามเดิม', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { ok: true, jobs: [] })));
    await expect(apiGet('/api/factory/jobs')).resolves.toEqual({ ok: true, jobs: [] });
  });
});
