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

  it('maps STORAGE_HASH_MISMATCH to a hard FAIL with HASH_MISMATCH code', async () => {
    apiFetch.mockResolvedValueOnce(edgeResponse('STORAGE_HASH_MISMATCH'));
    const result = await verifyJobApi('job-1');
    expect(result.verdict).toBe('FAIL');
    expect(result.code).toBe('HASH_MISMATCH');
  });
});
