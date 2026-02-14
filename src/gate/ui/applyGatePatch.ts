/**
 * Apply Gate Patch
 *
 * Safely applies JSON Patch operations from Gate findings.
 * Security: Only allows patches to /useDrillMapStore/drillMap/ paths.
 *
 * @version 1.0.0 - Phase A: Gate → UI Integration
 */

import { useDrillMapStore } from '../../core/store/useDrillMapStore';
import type { GatePatch, GateFinding } from './gateTypes';
import type { DrillMap } from '../../core/manufacturing/drillMap/types';

// ============================================
// SECURITY CONSTANTS
// ============================================

/**
 * Allowed path prefix for patches.
 * All patches MUST start with this prefix.
 */
const ALLOWED_PATH_PREFIX = '/useDrillMapStore/drillMap/';

// ============================================
// PATH VALIDATION
// ============================================

/**
 * Validate that a patch path is safe to apply.
 *
 * @param path - The JSON Patch path
 * @returns true if path is safe, false otherwise
 */
function isPathSafe(path: string): boolean {
  // Must start with allowed prefix
  if (!path.startsWith(ALLOWED_PATH_PREFIX)) {
    console.error(`[ApplyPatch] SECURITY: Blocked path "${path}" - must start with "${ALLOWED_PATH_PREFIX}"`);
    return false;
  }

  // No path traversal
  if (path.includes('..')) {
    console.error(`[ApplyPatch] SECURITY: Blocked path "${path}" - contains ".."`)
    return false;
  }

  return true;
}

// ============================================
// APPLY SINGLE PATCH
// ============================================

/**
 * Apply a single patch operation to an object.
 * Handles 'replace', 'add', and 'remove' operations.
 *
 * @param obj - Target object to patch
 * @param relativePath - Path relative to obj (e.g., "/panels/0/points/1/position/1")
 * @param op - Operation type
 * @param value - Value for replace/add operations
 * @returns The patched object (or original if operation failed)
 */
function applyPatchOperation<T extends object>(
  obj: T,
  relativePath: string,
  op: 'replace' | 'add' | 'remove',
  value?: unknown
): T {
  // Parse path into segments (remove leading /)
  const segments = relativePath.slice(1).split('/');

  if (segments.length === 0) {
    console.error('[ApplyPatch] Empty path');
    return obj;
  }

  // Navigate to parent
  let current: any = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const key = /^\d+$/.test(seg) ? parseInt(seg, 10) : seg;

    if (current === null || current === undefined) {
      console.error(`[ApplyPatch] Path navigation failed at segment "${seg}"`);
      return obj;
    }

    current = current[key];
  }

  // Get final key
  const finalSeg = segments[segments.length - 1];
  const finalKey = /^\d+$/.test(finalSeg) ? parseInt(finalSeg, 10) : finalSeg;

  // Apply operation
  switch (op) {
    case 'replace':
    case 'add':
      current[finalKey] = value;
      break;
    case 'remove':
      if (Array.isArray(current) && typeof finalKey === 'number') {
        current.splice(finalKey, 1);
      } else {
        delete current[finalKey];
      }
      break;
  }

  return obj;
}

// ============================================
// APPLY GATE PATCHES
// ============================================

/**
 * Apply an array of Gate patches to the DrillMap store.
 * Returns success/failure status.
 *
 * @param patches - Array of GatePatch operations
 * @returns true if all patches applied successfully, false otherwise
 */
export function applyGatePatches(patches: GatePatch[]): boolean {
  if (patches.length === 0) {
    console.log('[ApplyPatch] No patches to apply');
    return true;
  }

  // Validate all paths first
  for (const patch of patches) {
    if (!isPathSafe(patch.path)) {
      console.error('[ApplyPatch] Blocked: unsafe path detected');
      return false;
    }
  }

  // Get current drill map
  const drillMap = useDrillMapStore.getState().drillMap;
  if (!drillMap) {
    console.error('[ApplyPatch] No drill map available');
    return false;
  }

  // Deep clone to avoid mutations during patch
  let patched: DrillMap = JSON.parse(JSON.stringify(drillMap));

  // Apply each patch
  for (const patch of patches) {
    // Extract relative path (remove store prefix)
    const relativePath = patch.path.slice(ALLOWED_PATH_PREFIX.length - 1);

    try {
      patched = applyPatchOperation(patched, relativePath, patch.op, patch.value);
      console.log(`[ApplyPatch] Applied: ${patch.op} ${patch.path}`);
    } catch (err) {
      console.error(`[ApplyPatch] Failed to apply patch:`, patch, err);
      return false;
    }
  }

  // Update store with patched drill map
  useDrillMapStore.getState().setDrillMap(patched);
  console.log(`[ApplyPatch] Successfully applied ${patches.length} patches`);

  return true;
}

// ============================================
// APPLY FINDING FIX
// ============================================

/**
 * Apply the auto-fix patch from a Gate finding.
 * Convenience wrapper for UI buttons.
 *
 * @param finding - The GateFinding with patch data
 * @returns true if fix was applied, false otherwise
 */
export function applyFindingFix(finding: GateFinding): boolean {
  if (!finding.patch || finding.patch.length === 0) {
    console.log(`[ApplyPatch] No fix available for finding: ${finding.key}`);
    return false;
  }

  console.log(`[ApplyPatch] Applying fix for: ${finding.key}`);
  return applyGatePatches(finding.patch);
}

// ============================================
// PREVIEW PATCH (DRY RUN)
// ============================================

/**
 * Preview what a patch would do without applying it.
 * Returns the patched drill map for inspection.
 *
 * @param patches - Array of GatePatch operations
 * @returns Preview of patched DrillMap or null if invalid
 */
export function previewGatePatches(patches: GatePatch[]): DrillMap | null {
  // Validate all paths
  for (const patch of patches) {
    if (!isPathSafe(patch.path)) {
      return null;
    }
  }

  const drillMap = useDrillMapStore.getState().drillMap;
  if (!drillMap) return null;

  // Deep clone
  let preview: DrillMap = JSON.parse(JSON.stringify(drillMap));

  // Apply patches to preview
  for (const patch of patches) {
    const relativePath = patch.path.slice(ALLOWED_PATH_PREFIX.length - 1);
    try {
      preview = applyPatchOperation(preview, relativePath, patch.op, patch.value);
    } catch {
      return null;
    }
  }

  return preview;
}
