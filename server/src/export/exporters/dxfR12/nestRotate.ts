/**
 * Rotation-Aware Nesting Algorithm
 *
 * Step 10.2: Deterministic shelf packing with 0°/90° rotation
 *
 * Algorithm:
 * 1. Sort parts by height (descending), then width (descending), then ID
 * 2. For each part, try both 0° and 90° rotations
 * 3. Choose rotation that:
 *    a) Fits on current sheet (priority)
 *    b) Results in tighter packing (xAfter minimal)
 *    c) Tie-break: prefer 0° rotation
 * 4. If part doesn't fit on current sheet, start new sheet
 *
 * Deterministic guarantees:
 * - Same input always produces same output
 * - Sorting is stable (uses ID as final tie-breaker)
 * - Rotation choice has clear priority rules
 */

import type { Rotation } from './transform.js';
import type { KeepoutRect } from './keepout.js';
import { checkKeepoutCollision } from './keepout.js';

// ============================================================================
// Types
// ============================================================================

export interface Part {
  id: string;
  w: number;  // width in mm
  h: number;  // height in mm
}

export interface PlacedPart {
  id: string;
  x: number;           // X position on sheet
  y: number;           // Y position on sheet
  w: number;           // Width after rotation
  h: number;           // Height after rotation
  rot: Rotation;       // Applied rotation
  sheetIndex: number;  // 0-based sheet index
}

export interface NestParams {
  sheetW: number;       // Sheet width in mm
  sheetH: number;       // Sheet height in mm
  sheetMarginMm: number; // Margin from sheet edges
  partGapMm: number;    // Gap between parts
  /** Keepout zones (clamp/vacuum areas) to avoid */
  keepouts?: KeepoutRect[];
}

export interface NestResult {
  ok: boolean;
  placed: PlacedPart[];
  sheetsUsed: number;
  reason?: string;
}

// ============================================================================
// Internal Types
// ============================================================================

interface Cursor {
  x: number;      // Current X position
  y: number;      // Current row Y position
  rowH: number;   // Current row height (tallest part in row)
}

interface FitResult {
  ok: boolean;
  newRow?: boolean;
  newY?: number;
}

interface Candidate {
  rot: Rotation;
  d: { w: number; h: number };
  fit: FitResult;
}

// ============================================================================
// Sorting
// ============================================================================

/**
 * Sort parts deterministically:
 * 1. Height descending (tallest first for shelf packing)
 * 2. Width descending (wider first)
 * 3. ID ascending (stable tie-breaker)
 */
function sortParts(parts: Part[]): Part[] {
  return [...parts].sort((a, b) => {
    // Height descending
    if (b.h !== a.h) return b.h - a.h;
    // Width descending
    if (b.w !== a.w) return b.w - a.w;
    // ID ascending (deterministic tie-breaker)
    return a.id.localeCompare(b.id);
  });
}

// ============================================================================
// Dimension Helpers
// ============================================================================

/**
 * Get dimensions for a part with specified rotation.
 */
function dimsFor(part: Part, rot: Rotation): { w: number; h: number } {
  return rot === 0 ? { w: part.w, h: part.h } : { w: part.h, h: part.w };
}

// ============================================================================
// Fit Checking
// ============================================================================

/**
 * Check if a part with given dimensions can fit at current cursor position.
 * Returns whether it fits and if a new row is needed.
 * Also checks for keepout zone collisions.
 */
function canFitAt(cursor: Cursor, d: { w: number; h: number }, p: NestParams): FitResult {
  const maxX = p.sheetW - p.sheetMarginMm;
  const maxY = p.sheetH - p.sheetMarginMm;
  const keepouts = p.keepouts ?? [];

  // Check if fits in current row (bounds check)
  const xEnd = cursor.x + d.w;
  const yEnd = cursor.y + d.h;

  if (xEnd <= maxX && yEnd <= maxY) {
    // Check keepout collision at current position
    const partRect = { x: cursor.x, y: cursor.y, w: d.w, h: d.h };
    if (checkKeepoutCollision(partRect, keepouts) === null) {
      return { ok: true, newRow: false };
    }
    // Part collides with keepout at current position, try new row
  }

  // Try starting a new row
  const newY = cursor.y + cursor.rowH + p.partGapMm;
  const newXEnd = p.sheetMarginMm + d.w;
  const newYEnd = newY + d.h;

  if (newXEnd <= maxX && newYEnd <= maxY) {
    // Check keepout collision at new row position
    const partRect = { x: p.sheetMarginMm, y: newY, w: d.w, h: d.h };
    if (checkKeepoutCollision(partRect, keepouts) === null) {
      return { ok: true, newRow: true, newY };
    }
    // Part collides with keepout at new row position too
  }

  // Doesn't fit on this sheet
  return { ok: false };
}

// ============================================================================
// Main Packing Algorithm
// ============================================================================

/**
 * Pack parts into sheets with 0°/90° rotation support.
 *
 * @param parts - Parts to pack
 * @param p - Nesting parameters
 * @returns Packing result with placements and sheet count
 */
export function packIntoSheetsRotate(parts: Part[], p: NestParams): NestResult {
  // Validate parameters
  if (p.sheetW <= 0 || p.sheetH <= 0) {
    return { ok: false, placed: [], sheetsUsed: 0, reason: 'Invalid sheet dimensions' };
  }

  if (parts.length === 0) {
    return { ok: true, placed: [], sheetsUsed: 0 };
  }

  // Sort parts deterministically
  const sorted = sortParts(parts);

  const placed: PlacedPart[] = [];
  let sheetIndex = 0;
  let cursor: Cursor = { x: p.sheetMarginMm, y: p.sheetMarginMm, rowH: 0 };

  // Helper to start a new row
  const startNewRow = (newY: number) => {
    cursor.x = p.sheetMarginMm;
    cursor.y = newY;
    cursor.rowH = 0;
  };

  // Helper to start a new sheet
  const startNewSheet = () => {
    sheetIndex += 1;
    cursor = { x: p.sheetMarginMm, y: p.sheetMarginMm, rowH: 0 };
  };

  for (const part of sorted) {
    // Validate part dimensions
    if (part.w <= 0 || part.h <= 0) {
      return {
        ok: false,
        placed,
        sheetsUsed: sheetIndex + 1,
        reason: `Invalid part dimensions: ${part.id} (${part.w}x${part.h})`,
      };
    }

    // Evaluate both rotations
    const candidates: Candidate[] = [];

    // Try 0° rotation
    const d0 = dimsFor(part, 0);
    const fit0 = canFitAt(cursor, d0, p);
    if (fit0.ok) {
      candidates.push({ rot: 0, d: d0, fit: fit0 });
    }

    // Try 90° rotation
    const d90 = dimsFor(part, 90);
    const fit90 = canFitAt(cursor, d90, p);
    if (fit90.ok) {
      candidates.push({ rot: 90, d: d90, fit: fit90 });
    }

    // If no rotation fits, try new sheet
    if (candidates.length === 0) {
      startNewSheet();

      // Re-evaluate on fresh sheet
      const freshCursor: Cursor = { x: p.sheetMarginMm, y: p.sheetMarginMm, rowH: 0 };

      const freshFit0 = canFitAt(freshCursor, d0, p);
      if (freshFit0.ok) {
        candidates.push({ rot: 0, d: d0, fit: freshFit0 });
      }

      const freshFit90 = canFitAt(freshCursor, d90, p);
      if (freshFit90.ok) {
        candidates.push({ rot: 90, d: d90, fit: freshFit90 });
      }

      if (candidates.length === 0) {
        return {
          ok: false,
          placed,
          sheetsUsed: sheetIndex + 1,
          reason: `Part too large for sheet: ${part.id} (${part.w}x${part.h})`,
        };
      }
    }

    // Choose best candidate deterministically
    // Priority:
    // 1. Tighter packing (xAfter minimal)
    // 2. Prefer 0° rotation
    candidates.sort((a, b) => {
      const aX = a.fit.newRow ? p.sheetMarginMm : cursor.x;
      const bX = b.fit.newRow ? p.sheetMarginMm : cursor.x;
      const axAfter = aX + a.d.w;
      const bxAfter = bX + b.d.w;

      if (axAfter !== bxAfter) return axAfter - bxAfter;
      return a.rot - b.rot; // 0 before 90
    });

    const chosen = candidates[0];

    // Apply new row if needed
    if (chosen.fit.newRow && chosen.fit.newY !== undefined) {
      startNewRow(chosen.fit.newY);
    }

    // Place the part
    const x = cursor.x;
    const y = cursor.y;

    placed.push({
      id: part.id,
      x,
      y,
      w: chosen.d.w,
      h: chosen.d.h,
      rot: chosen.rot,
      sheetIndex,
    });

    // Advance cursor
    cursor.x = x + chosen.d.w + p.partGapMm;
    cursor.rowH = Math.max(cursor.rowH, chosen.d.h);

    // Note: if cursor.x exceeds maxX, next iteration will handle new row
  }

  return {
    ok: true,
    placed,
    sheetsUsed: sheetIndex + 1,
  };
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Calculate packing statistics.
 */
export function calculatePackingStats(
  result: NestResult,
  params: NestParams
): {
  totalSheets: number;
  totalParts: number;
  utilization: number;
  sheetUtilizations: number[];
} {
  if (!result.ok || result.placed.length === 0) {
    return {
      totalSheets: 0,
      totalParts: 0,
      utilization: 0,
      sheetUtilizations: [],
    };
  }

  const sheetAreas: number[] = [];
  const partAreasBySheet: number[] = [];

  // Initialize arrays
  for (let i = 0; i < result.sheetsUsed; i++) {
    sheetAreas.push(params.sheetW * params.sheetH);
    partAreasBySheet.push(0);
  }

  // Sum part areas by sheet
  for (const p of result.placed) {
    partAreasBySheet[p.sheetIndex] += p.w * p.h;
  }

  // Calculate utilizations
  const sheetUtilizations = partAreasBySheet.map((area, i) =>
    sheetAreas[i] > 0 ? area / sheetAreas[i] : 0
  );

  const totalSheetArea = sheetAreas.reduce((a, b) => a + b, 0);
  const totalPartArea = partAreasBySheet.reduce((a, b) => a + b, 0);

  return {
    totalSheets: result.sheetsUsed,
    totalParts: result.placed.length,
    utilization: totalSheetArea > 0 ? totalPartArea / totalSheetArea : 0,
    sheetUtilizations,
  };
}

/**
 * Format packing result as summary string.
 */
export function formatPackingSummary(
  result: NestResult,
  params: NestParams
): string {
  const stats = calculatePackingStats(result, params);
  const lines: string[] = [];

  lines.push('Rotation Packing Summary');
  lines.push('========================');
  lines.push(`Status: ${result.ok ? 'SUCCESS' : 'FAILED'}`);
  if (!result.ok && result.reason) {
    lines.push(`Reason: ${result.reason}`);
  }
  lines.push(`Sheets used: ${stats.totalSheets}`);
  lines.push(`Parts placed: ${stats.totalParts}`);
  lines.push(`Overall utilization: ${(stats.utilization * 100).toFixed(1)}%`);
  lines.push('');

  // Per-sheet breakdown
  for (let i = 0; i < stats.totalSheets; i++) {
    const partsOnSheet = result.placed.filter(p => p.sheetIndex === i);
    const rotated = partsOnSheet.filter(p => p.rot === 90).length;

    lines.push(`Sheet ${i + 1}:`);
    lines.push(`  Parts: ${partsOnSheet.length}`);
    lines.push(`  Rotated (90°): ${rotated}`);
    lines.push(`  Utilization: ${(stats.sheetUtilizations[i] * 100).toFixed(1)}%`);
  }

  return lines.join('\n');
}
