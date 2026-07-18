/**
 * @vitest-environment jsdom
 */

/**
 * supabaseSession.test.ts - S18 L7 Slice 1: session storage compatibility
 *
 * supabase-js persists its session in localStorage under `sb-<ref>-auth-token`.
 * src/factory/api/client.ts authHeaders() scans localStorage for exactly that
 * pattern (/^sb-.+-auth-token$/) to attach the end-user JWT. These tests pin
 * the contract from both sides:
 * - our client's storage key always matches the scanner pattern
 * - the scanner pattern in client.ts has not drifted
 *
 * NOTE: a full runtime test through apiFetch() is not possible here — client.ts
 * reads VITE_SUPABASE_ANON_KEY at module scope and vitest gives every module an
 * isolated import.meta.env clone (verified empirically: neither vi.stubEnv nor
 * direct env mutation crosses module boundaries), so the anon-key guard in
 * authHeaders() cannot be satisfied from a test. The source pin below fails
 * loudly if either side of the contract changes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getAuthStorageKey } from '../supabaseClient';

/** The exact pattern authHeaders() in src/factory/api/client.ts scans for. */
const AUTH_HEADERS_SCAN_PATTERN = /^sb-.+-auth-token$/;

describe('supabase session storage compatibility (S18 L7 Slice 1)', () => {
  it('getAuthStorageKey derives the sb-<ref>-auth-token key that authHeaders scans for', () => {
    expect(getAuthStorageKey('https://abcd1234.supabase.co')).toBe('sb-abcd1234-auth-token');
    expect(getAuthStorageKey('https://abcd1234.supabase.co')).toMatch(AUTH_HEADERS_SCAN_PATTERN);
    // ref with dashes / longer hosts still conform
    expect(getAuthStorageKey('https://my-ref-01.supabase.co')).toMatch(AUTH_HEADERS_SCAN_PATTERN);
  });

  it('factory api client still scans the exact pattern our storage key satisfies', () => {
    // vitest runs from the workspace root; import.meta.url is not a file:
    // URL under the jsdom environment, so resolve from cwd instead.
    const clientSource = readFileSync(
      join(process.cwd(), 'src', 'factory', 'api', 'client.ts'),
      'utf8'
    );
    // Pin the scanner regex literally: if someone changes the pattern in
    // client.ts (or our key format), this contract test fails loudly.
    expect(clientSource).toContain('/^sb-.+-auth-token$/');
    expect(AUTH_HEADERS_SCAN_PATTERN.test(getAuthStorageKey('https://abcd1234.supabase.co'))).toBe(
      true
    );
  });
});
