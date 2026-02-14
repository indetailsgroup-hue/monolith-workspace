/**
 * specPolicy.ts - Spec State Policy Enforcement
 *
 * NORTH STAR: No export without RELEASED state
 *
 * Provides policy checks for:
 * - Export permission
 * - Geometry edit permission
 * - State transition validation
 */

import type { SignedJobManifest } from '../trust/manifestChainTypes';
import type { SpecState, SpecStatus } from './specState';

// ============================================
// EXTRACT FROM MANIFEST
// ============================================

/**
 * Get SpecStatus from HEAD manifest
 */
export function getSpecStatusFromHead(head: SignedJobManifest): SpecStatus {
  return head.signedTrust?.trust?.spec ?? { state: 'DRAFT' };
}

/**
 * Get SpecState from HEAD manifest
 */
export function getSpecStateFromHead(head: SignedJobManifest): SpecState {
  return getSpecStatusFromHead(head).state;
}

// ============================================
// POLICY ASSERTIONS
// ============================================

export type PolicyResult = { ok: true } | { ok: false; reason: string };

/**
 * Assert export is allowed by spec state
 *
 * POLICY: Export requires RELEASED state
 */
export function assertExportAllowedBySpec(head: SignedJobManifest): PolicyResult {
  const state = getSpecStateFromHead(head);

  if (state !== 'RELEASED') {
    return {
      ok: false,
      reason: `Export requires RELEASED state. Current: ${state}`,
    };
  }

  return { ok: true };
}

/**
 * Assert geometry edit is allowed by spec state
 *
 * POLICY: Geometry edits only allowed in DRAFT state
 */
export function assertEditAllowedBySpec(head: SignedJobManifest): PolicyResult {
  const state = getSpecStateFromHead(head);

  if (state !== 'DRAFT') {
    return {
      ok: false,
      reason: `Geometry edits require DRAFT state. Current: ${state}`,
    };
  }

  return { ok: true };
}

/**
 * Assert freeze is allowed
 *
 * POLICY: Can only freeze from DRAFT state
 */
export function assertFreezeAllowed(head: SignedJobManifest): PolicyResult {
  const state = getSpecStateFromHead(head);

  if (state !== 'DRAFT') {
    return {
      ok: false,
      reason: `Freeze requires DRAFT state. Current: ${state}`,
    };
  }

  return { ok: true };
}

/**
 * Assert release is allowed
 *
 * POLICY: Can only release from FROZEN state
 */
export function assertReleaseAllowed(head: SignedJobManifest): PolicyResult {
  const state = getSpecStateFromHead(head);

  if (state !== 'FROZEN') {
    return {
      ok: false,
      reason: `Release requires FROZEN state. Current: ${state}`,
    };
  }

  return { ok: true };
}

/**
 * Assert unfreeze (back to DRAFT) is allowed
 *
 * POLICY: Can only unfreeze from FROZEN state
 */
export function assertUnfreezeAllowed(head: SignedJobManifest): PolicyResult {
  const state = getSpecStateFromHead(head);

  if (state !== 'FROZEN') {
    return {
      ok: false,
      reason: `Unfreeze requires FROZEN state. Current: ${state}`,
    };
  }

  return { ok: true };
}

// ============================================
// COMBINED CHECKS
// ============================================

/**
 * Full export policy check (spec + gate)
 */
export function assertExportAllowed(head: SignedJobManifest): PolicyResult {
  // Check spec state
  const specCheck = assertExportAllowedBySpec(head);
  if (!specCheck.ok) return specCheck;

  // Check gate status
  if (!head.signedTrust?.trust?.gate?.ok) {
    const errorCount = head.signedTrust?.trust?.gate?.errorCount ?? 0;
    return {
      ok: false,
      reason: `Gate not OK (${errorCount} errors)`,
    };
  }

  return { ok: true };
}

// ============================================
// UI HELPERS
// ============================================

/**
 * Get human-readable state description
 */
export function getStateDescription(state: SpecState): string {
  switch (state) {
    case 'DRAFT':
      return 'Draft - Edits allowed';
    case 'FROZEN':
      return 'Frozen - Review only, no edits';
    case 'RELEASED':
      return 'Released - Factory spec, export allowed';
  }
}

/**
 * Get state color for UI
 */
export function getStateColor(state: SpecState): string {
  switch (state) {
    case 'DRAFT':
      return '#60a5fa'; // blue
    case 'FROZEN':
      return '#fbbf24'; // amber
    case 'RELEASED':
      return '#34d399'; // green
  }
}
