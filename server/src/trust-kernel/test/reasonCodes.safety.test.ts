/**
 * reasonCodes.safety.test.ts — Task 1: SAFETY reason vocabulary (design §13).
 *
 * The three SAFETY content-revocation codes must be registered in the canonical
 * TS registry (reasonCodes.ts) so `isTrustReasonCode` accepts them, AND mirrored
 * into the Deno edge transport (supabase/functions/factory-api/trustKernel.ts) so
 * `httpStatusForReason` maps each to an EXPLICIT status (409 Conflict) rather than
 * falling through to the 500 default. A fallthrough-to-500 would mean protocol
 * drift between the registry and the edge mirror.
 *
 * The edge module is a pure, dependency-injected transport with no Deno-runtime
 * bindings at module scope (uses only global Request/Response/URL), so it imports
 * cleanly into the node/vitest toolchain.
 */
import { describe, it, expect } from 'vitest';
import { isTrustReasonCode, TRUST_REASON_CODES } from '../reasonCodes.js';
import { httpStatusForReason } from '../../../../supabase/functions/factory-api/trustKernel.js';

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

  it('maps every SAFETY_* code to 409 on the edge, never the 500 fallthrough', () => {
    for (const code of SAFETY_CODES) {
      const status = httpStatusForReason(code as never);
      expect(status).toBe(409);
      expect(status).not.toBe(500);
    }
  });
});
