/**
 * resolvePreviewState.ts - Per-Connector Preview State Resolver
 *
 * Centralises the preview-state resolution logic described in
 * docs/architecture/HARDWARE_PREVIEW_KEYS.md so that CNC overlay
 * and Hardware3D always agree on the same transform.
 *
 * Resolution order (v2):
 *   1. hardwareOverrides[pairKeyV2]?.previewState  (v2 content-addressed)
 *   2. hardwareOverrides[pairId]?.previewState      (v1 legacy fallback)
 *   3. globalConfig (cabinet.hardware.minifixConfig) (global)
 *   4. null  (identity / no-op)
 *
 * ══════════════════════════════════════════════════════════════════
 * ⚠️ PREVIEW-ONLY: Never import this from G-code/export modules
 * ══════════════════════════════════════════════════════════════════
 *
 * @version 2.0.0 - Dual-key resolution (pairKeyV2 + pairId fallback)
 */

import type { OverlayPreviewState } from './overlayPreviewTransform';
import type { HardwarePointOverrides, HardwarePreviewState } from '../../../core/types/Cabinet';

// ============================================================================
// RESOLVER
// ============================================================================

/**
 * Resolve the effective preview state for a single point/connector.
 *
 * @param pairKeyV2   - Content-addressed connector key (v2). May be undefined.
 * @param pairId      - Legacy connector pair ID (v1). May be undefined.
 * @param overrides   - Cabinet's `hardwareOverrides` map.
 * @param globalConfig - Cabinet-wide preview config (from minifixConfig).
 * @returns Resolved preview state, or null for identity (no transform).
 */
export function resolvePreviewState(
  pairKeyV2: string | undefined,
  pairId: string | undefined,
  overrides: HardwarePointOverrides | undefined,
  globalConfig: PartialPreviewConfig | null | undefined
): OverlayPreviewState | null {
  // 1. Per-connector override (v2 key — content-addressed, stable across dim changes)
  if (pairKeyV2 && overrides) {
    const ps = overrides[pairKeyV2]?.previewState;
    if (ps) {
      return toFullPreviewState(ps);
    }
  }

  // 2. Per-connector override (v1 key — legacy fallback)
  if (pairId && overrides) {
    const ps = overrides[pairId]?.previewState;
    if (ps) {
      return toFullPreviewState(ps);
    }
  }

  // 3. Global config fallback
  if (globalConfig) {
    return toFullPreviewState(globalConfig);
  }

  // 4. Identity (no transform)
  return null;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Partial preview config — accepts any object with the preview fields.
 * Allows passing MinifixFullConfig, HardwarePreviewState, or plain objects.
 */
export interface PartialPreviewConfig {
  flipVertical?: boolean;
  flipHorizontal?: boolean;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
}

/**
 * Convert partial preview config to full OverlayPreviewState with defaults.
 */
function toFullPreviewState(partial: PartialPreviewConfig): OverlayPreviewState {
  return {
    flipVertical: !!partial.flipVertical,
    flipHorizontal: !!partial.flipHorizontal,
    rotationX: Number(partial.rotationX ?? 0),
    rotationY: Number(partial.rotationY ?? 0),
    rotationZ: Number(partial.rotationZ ?? 0),
  };
}

/**
 * Check whether a resolved preview state is effectively identity (no-op).
 * Useful for early-exit optimizations in renderers.
 */
export function isIdentityPreview(state: OverlayPreviewState | null): boolean {
  if (!state) return true;
  return (
    !state.flipVertical &&
    !state.flipHorizontal &&
    state.rotationX === 0 &&
    state.rotationY === 0 &&
    state.rotationZ === 0
  );
}
