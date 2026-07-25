/**
 * phase0LegacyGuard.ts — the single Repair Phase 0 containment guard for every
 * legacy client byte / signed-locator route on the Node server.
 *
 * Phase 0 global constraint: no client receives a raw locator, an unsigned hash
 * byte route, or a reusable signed URL. Each such route calls `phase0LegacyBlocked`
 * as its FIRST line and returns 423 REPAIR_PHASE_NOT_ENABLED by default. The only
 * escape is an explicit `legacyAccessMode: 'SHADOW_LEGACY'` dependency injection
 * used by unit tests and shadow runs — the default server bootstrap never passes it.
 */
import type { Response } from 'express';

export type LegacyAccessMode = 'PHASE0_BLOCKED' | 'SHADOW_LEGACY';

/**
 * Deny a legacy byte/locator route unless SHADOW_LEGACY is explicitly injected.
 * Returns true (and writes the 423 response) when the route must be blocked.
 */
export function phase0LegacyBlocked(mode: LegacyAccessMode | undefined, res: Response): boolean {
  if ((mode ?? 'PHASE0_BLOCKED') !== 'SHADOW_LEGACY') {
    res.status(423).json({
      ok: false,
      code: 'REPAIR_PHASE_NOT_ENABLED',
      error: 'LEGACY_BYTE_ROUTE_BLOCKED',
    });
    return true;
  }
  return false;
}
