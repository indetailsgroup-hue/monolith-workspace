// FS-B1-02: the verify adapter must never launder a storage-integrity check
// into a full-verification PASS — and a mismatch is always a hard FAIL.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('../client', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { verifyJobApi } from '../verifyApi';

function edgeResponse(verdict: string) {
  return {
    data: {
      ok: true,
      verdict,
      scope: 'STORAGE_INTEGRITY_ONLY',
      expected: 'a'.repeat(64),
      computed: verdict.includes('MISMATCH') ? 'b'.repeat(64) : 'a'.repeat(64),
      bytes: 8092,
    },
  };
}

describe('verifyJobApi — storage-hash verdict semantics (B1-02)', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('maps STORAGE_HASH_MATCH to the storage verdict, never PASS', async () => {
    apiFetch.mockResolvedValueOnce(edgeResponse('STORAGE_HASH_MATCH'));
    const result = await verifyJobApi('job-1');
    expect(result.verdict).toBe('STORAGE_HASH_MATCH');
    expect(result.verdict).not.toBe('PASS');
    expect(result.summary).toContain('storage integrity');
  });

  it('maps legacy PASS (pre-deploy Edge) to STORAGE_HASH_MATCH too — both are storage checks', async () => {
    apiFetch.mockResolvedValueOnce(edgeResponse('PASS'));
    const result = await verifyJobApi('job-1');
    expect(result.verdict).toBe('STORAGE_HASH_MATCH');
  });

  it('maps STORAGE_HASH_MISMATCH to a hard FAIL with the real E_PACKET_CHECKSUM code', async () => {
    apiFetch.mockResolvedValueOnce(edgeResponse('STORAGE_HASH_MISMATCH'));
    const result = await verifyJobApi('job-1');
    expect(result.verdict).toBe('FAIL');
    expect(result.code).toBe('E_PACKET_CHECKSUM');
  });

  // Live-run finding 2026-07-18: an `as VerifyApiResponse` cast let the adapter
  // return a response with no `checks`/`timestamp`; VerifyConsole reads
  // `apiResponse.checks.length` unconditionally and crashed the whole page on
  // the SUCCESS path. The contract must be complete, not cast-complete.
  it('returns a COMPLETE VerifyApiResponse — checks + timestamp present (console renders them)', async () => {
    apiFetch.mockResolvedValueOnce(edgeResponse('STORAGE_HASH_MATCH'));
    const result = await verifyJobApi('job-1');
    expect(Array.isArray(result.checks)).toBe(true);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]).toMatchObject({ status: 'PASS' });
    expect(result.checks[0].name).toContain('Storage hash');
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });

  it('mismatch also carries a complete contract with a failing check row', async () => {
    apiFetch.mockResolvedValueOnce(edgeResponse('STORAGE_HASH_MISMATCH'));
    const result = await verifyJobApi('job-1');
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].status).toBe('FAIL');
    expect(result.timestamp).toBeTruthy();
  });
});
