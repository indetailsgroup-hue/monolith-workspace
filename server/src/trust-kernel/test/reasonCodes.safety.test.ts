/**
 * reasonCodes.safety.test.ts — Task 1: SAFETY reason vocabulary (design §13 + versioned addition).
 *
 * The three SAFETY content-revocation codes must be registered in the canonical
 * TS registry (reasonCodes.ts) so `isTrustReasonCode` accepts them. The edge
 * transport's HTTP-status mapping (httpStatusForReason -> 409) is asserted in the
 * edge suite (supabase/functions/factory-api/index.test.ts), where the edge module
 * is imported natively. It is deliberately NOT imported here: the edge file lives
 * outside the server package's tsconfig `rootDir` (server/src), so importing it
 * would break `tsc -p server/tsconfig.json` (TS6059), which CI runs in the
 * evidence-self-verify gate. vitest/esbuild would mask that break at test time.
 */
import { describe, it, expect } from 'vitest';
import { isTrustReasonCode, TRUST_REASON_CODES } from '../reasonCodes.js';

const SAFETY_CODES = [
  'SAFETY_CONTENT_REVOKED',
  'SAFETY_CONTENT_BLOCKED',
  'SAFETY_CONTENT_UNBLOCKED',
] as const;

describe('SAFETY reason vocabulary — Task 1', () => {
  it('registers all three SAFETY_* codes in the canonical §13 registry', () => {
    for (const code of SAFETY_CODES) {
      expect(isTrustReasonCode(code)).toBe(true);
      expect((TRUST_REASON_CODES as readonly string[]).includes(code)).toBe(true);
    }
  });

  it('does not widen the registry to a bogus SAFETY code (guards against a typo)', () => {
    expect(isTrustReasonCode('SAFETY_CONTENT_NUKED')).toBe(false);
  });
});
