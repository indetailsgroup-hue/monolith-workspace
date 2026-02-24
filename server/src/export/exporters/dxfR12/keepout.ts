/**
 * Keepout / Clamp Zones
 *
 * Step 10.4B: Define and check collision with fixture zones
 *
 * Keepout zones are areas on the sheet where parts cannot be placed:
 * - Clamp positions
 * - Vacuum zones
 * - Screw holes
 * - Registration pins
 *
 * The nesting algorithm must check that part placements don't
 * intersect with any keepout zones.
 */

import type { DxfEntity } from './dxfTypes.js';
import { rectLines, text } from './dxfGeom.js';
import { SAFE_GUIDES } from './toolLayers.js';

// ============================================================================
// Types
// ============================================================================

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface KeepoutRect extends Rect {
  reason: string;
}

export interface SheetProfile {
  sheetW: number;
  sheetH: number;
  marginMm: number;
  partGapMm: number;
  keepouts: KeepoutRect[];
}

// ============================================================================
// Collision Detection
// ============================================================================

/**
 * Check if two axis-aligned rectangles intersect.
 *
 * @param a - First rectangle
 * @param b - Second rectangle
 * @returns True if rectangles overlap
 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.w <= b.x ||  // a is left of b
    b.x + b.w <= a.x ||  // b is left of a
    a.y + a.h <= b.y ||  // a is below b
    b.y + b.h <= a.y     // b is below a
  );
}

/**
 * Check if a rectangle intersects with any keepout zone.
 *
 * @param partRect - Part bounding box
 * @param keepouts - Array of keepout zones
 * @returns First intersecting keepout or null if no collision
 */
export function checkKeepoutCollision(
  partRect: Rect,
  keepouts: KeepoutRect[]
): KeepoutRect | null {
  for (const k of keepouts) {
    if (rectsIntersect(partRect, k)) {
      return k;
    }
  }
  return null;
}

/**
 * Check if a placement is valid (no keepout collisions).
 *
 * @param x - Part X position
 * @param y - Part Y position
 * @param w - Part width (after rotation)
 * @param h - Part height (after rotation)
 * @param keepouts - Keepout zones to check
 * @returns True if placement is valid
 */
export function isPlacementValid(
  x: number,
  y: number,
  w: number,
  h: number,
  keepouts: KeepoutRect[]
): boolean {
  const partRect: Rect = { x, y, w, h };
  return checkKeepoutCollision(partRect, keepouts) === null;
}

// ============================================================================
// Default Factory Profiles
// ============================================================================

/**
 * Standard corner clamps for a CNC router table.
 * Factory defaults: 4 clamps at corners, 120x120mm each, 40mm inset from edges.
 */
export function cornerClamps(
  sheetW: number,
  sheetH: number,
  clampSize = 120,
  inset = 40
): KeepoutRect[] {
  return [
    { x: inset, y: inset, w: clampSize, h: clampSize, reason: 'CLAMP_BL' },
    { x: sheetW - inset - clampSize, y: inset, w: clampSize, h: clampSize, reason: 'CLAMP_BR' },
    { x: sheetW - inset - clampSize, y: sheetH - inset - clampSize, w: clampSize, h: clampSize, reason: 'CLAMP_TR' },
    { x: inset, y: sheetH - inset - clampSize, w: clampSize, h: clampSize, reason: 'CLAMP_TL' },
  ];
}

/**
 * Edge clamps along long edges.
 * For 8'x4' sheets with clamps at regular intervals.
 */
export function edgeClamps(
  sheetW: number,
  sheetH: number,
  clampW = 60,
  clampH = 40,
  spacing = 500,
  edgeInset = 10
): KeepoutRect[] {
  const keepouts: KeepoutRect[] = [];

  // Bottom edge clamps
  const bottomCount = Math.floor((sheetW - 2 * edgeInset) / spacing);
  for (let i = 0; i <= bottomCount; i++) {
    const x = edgeInset + i * spacing - clampW / 2;
    keepouts.push({
      x: Math.max(edgeInset, x),
      y: edgeInset,
      w: clampW,
      h: clampH,
      reason: `CLAMP_BOTTOM_${i}`,
    });
  }

  // Top edge clamps
  for (let i = 0; i <= bottomCount; i++) {
    const x = edgeInset + i * spacing - clampW / 2;
    keepouts.push({
      x: Math.max(edgeInset, x),
      y: sheetH - edgeInset - clampH,
      w: clampW,
      h: clampH,
      reason: `CLAMP_TOP_${i}`,
    });
  }

  return keepouts;
}

/**
 * Vacuum pod zones (circular areas approximated as squares).
 * For vacuum table CNC routers.
 */
export function vacuumPods(
  sheetW: number,
  sheetH: number,
  podDiameter = 80,
  gridSpacingX = 300,
  gridSpacingY = 300,
  marginX = 100,
  marginY = 100
): KeepoutRect[] {
  const keepouts: KeepoutRect[] = [];
  const podSize = podDiameter;

  const colCount = Math.floor((sheetW - 2 * marginX) / gridSpacingX) + 1;
  const rowCount = Math.floor((sheetH - 2 * marginY) / gridSpacingY) + 1;

  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < colCount; col++) {
      const cx = marginX + col * gridSpacingX;
      const cy = marginY + row * gridSpacingY;
      keepouts.push({
        x: cx - podSize / 2,
        y: cy - podSize / 2,
        w: podSize,
        h: podSize,
        reason: `VACUUM_${row}_${col}`,
      });
    }
  }

  return keepouts;
}

/**
 * Create a default sheet profile for standard 8'x4' MDF sheets.
 */
export function defaultSheetProfile(
  sheetW = 2440,
  sheetH = 1220
): SheetProfile {
  return {
    sheetW,
    sheetH,
    marginMm: 15,
    partGapMm: 8,
    keepouts: cornerClamps(sheetW, sheetH),
  };
}

// ============================================================================
// DXF Visualization
// ============================================================================

/**
 * Generate DXF entities to visualize keepout zones.
 *
 * @param keepouts - Keepout zones to draw
 * @param layer - Layer for keepout visualization (default: SAFE_GUIDES)
 * @returns DXF entities (rectangles and labels)
 */
export function drawKeepouts(
  keepouts: KeepoutRect[],
  layer = SAFE_GUIDES
): DxfEntity[] {
  const entities: DxfEntity[] = [];

  for (const k of keepouts) {
    // Rectangle outline
    entities.push(...rectLines({
      layer,
      origin: { x: k.x, y: k.y },
      width: k.w,
      height: k.h,
    }));

    // Label
    entities.push(text({
      layer,
      position: { x: k.x + 3, y: k.y + 3 },
      height: 3,
      text: k.reason,
    }));
  }

  return entities;
}

// ============================================================================
// Profile Merging
// ============================================================================

/**
 * Merge multiple keepout sources into a single array.
 * Useful for combining factory defaults with job-specific keepouts.
 */
export function mergeKeepouts(...sources: KeepoutRect[][]): KeepoutRect[] {
  const merged: KeepoutRect[] = [];

  for (const source of sources) {
    merged.push(...source);
  }

  return merged;
}

/**
 * Filter keepouts that are within sheet bounds.
 */
export function filterKeepoutsInBounds(
  keepouts: KeepoutRect[],
  sheetW: number,
  sheetH: number
): KeepoutRect[] {
  return keepouts.filter(k =>
    k.x >= 0 &&
    k.y >= 0 &&
    k.x + k.w <= sheetW &&
    k.y + k.h <= sheetH
  );
}
