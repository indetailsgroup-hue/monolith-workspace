/**
 * @vitest-environment jsdom
 */

/**
 * Stable SDK storage-key compatibility. Actual API identity selection is tested
 * through all callers in configuredTransportSession.test.ts, without pinning a
 * scan across unrelated Supabase sessions.
 */

import { describe, it, expect } from 'vitest';

import { getAuthStorageKey } from '../supabaseClient';

describe('configured Supabase session storage compatibility', () => {
  it('derives the SDK storage key from the configured project hostname', () => {
    expect(getAuthStorageKey('https://abcd1234.supabase.co')).toBe('sb-abcd1234-auth-token');
    expect(getAuthStorageKey('https://my-ref-01.supabase.co')).toBe('sb-my-ref-01-auth-token');
  });
});
