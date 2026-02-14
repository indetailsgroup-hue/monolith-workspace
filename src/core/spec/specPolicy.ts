/**
 * specPolicy.ts - Spec State Policy
 *
 * Policy functions for spec state transitions and export guards.
 *
 * @version 1.0.0
 */

import type { SignedJobManifest } from '../trust/manifestChainTypes';
import type { SpecStatus } from './specState';

/**
 * Assert that export is allowed for the given HEAD manifest
 *
 * POLICY: Export requires RELEASED state
 */
export function assertExportAllowed(
  head: SignedJobManifest
): { ok: true } | { ok: false; reason: string } {
  const specState = getSpecStateFromHead(head);

  if (specState !== 'RELEASED') {
    return {
      ok: false,
      reason: `Export requires RELEASED state, current: ${specState}`,
    };
  }

  return { ok: true };
}

/**
 * Get spec state string from HEAD manifest
 */
export function getSpecStateFromHead(head: SignedJobManifest): 'DRAFT' | 'FROZEN' | 'RELEASED' {
  return head.signedTrust?.trust?.spec?.state ?? 'DRAFT';
}

/**
 * Get full SpecStatus from HEAD manifest
 */
export function getSpecStatusFromHead(head: SignedJobManifest): SpecStatus {
  return head.signedTrust?.trust?.spec ?? { state: 'DRAFT' };
}
