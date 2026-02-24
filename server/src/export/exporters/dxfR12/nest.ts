/**
 * Deterministic Row-Shelf Nesting Algorithm
 *
 * Step 10.1: Simple, deterministic packing for CNC sheet layout
 *
 * Algorithm: Row-Shelf (FFDH - First Fit Decreasing Height)
 * 1. Sort parts by height (descending) then by width (descending)
 * 2. Place tallest part first, starting a new row
 * 3. Fill row left-to-right until no more parts fit
 * 4. Start new row below, repeat
 *
 * Benefits:
 * - 100% deterministic (same input = same output)
 * - Simple to verify visually
 * - Good for rectangular parts (cabinets)
 * - Efficient for similar-height parts
 *
 * Note: This is not optimal (bin packing is NP-hard) but is
 * predictable and "good enough" for factory use.
 */

// ============================================================================
// Types
// ============================================================================

export interface NestPart {
  id: string;
  width: number;   // mm
  height: number;  // mm
}

export interface NestPlacement {
  id: string;
  x: number;       // mm from sheet origin (bottom-left)
  y: number;       // mm from sheet origin (bottom-left)
  width: number;   // mm (after rotation)
  height: number;  // mm (after rotation)
  rotated: boolean; // true if rotated 90° to fit
}

export interface NestSheet {
  sheetWidth: number;
  sheetHeight: number;
  placements: NestPlacement[];
  usedWidth: number;
  usedHeight: number;
  utilization: number; // 0-1
}

export interface NestResult {
  sheets: NestSheet[];
  unplaced: NestPart[];  // Parts that didn't fit on any sheet
}

export interface NestOptions {
  sheetWidth: number;   // mm (e.g., 2440 for 8x4 sheet)
  sheetHeight: number;  // mm (e.g., 1220 for 8x4 sheet)
  gap: number;          // mm between parts (e.g., 5mm for saw kerf)
  allowRotation?: boolean; // Allow 90° rotation to fit
  maxSheets?: number;   // Maximum number of sheets (default: 100)
}

// ============================================================================
// Row-Shelf Nesting Algorithm
// ============================================================================

interface Row {
  y: number;          // Row bottom Y position
  height: number;     // Row height (tallest part)
  usedWidth: number;  // Current X position (right edge of last part)
}

/**
 * Nest parts onto sheets using Row-Shelf algorithm.
 *
 * @param parts - Parts to nest (will not be mutated)
 * @param options - Sheet size and gap options
 * @returns Nest result with sheet placements
 */
export function nestRowShelf(parts: NestPart[], options: NestOptions): NestResult {
  const {
    sheetWidth,
    sheetHeight,
    gap,
    allowRotation = true,
    maxSheets = 100,
  } = options;

  // Sort parts by height descending, then width descending (FFDH)
  const sortedParts = [...parts].sort((a, b) => {
    const heightDiff = b.height - a.height;
    if (heightDiff !== 0) return heightDiff;
    return b.width - a.width;
  });

  const sheets: NestSheet[] = [];
  const unplaced: NestPart[] = [];
  const remainingParts = [...sortedParts];

  // Process parts until all placed or max sheets reached
  while (remainingParts.length > 0 && sheets.length < maxSheets) {
    const sheet = createNewSheet(sheetWidth, sheetHeight);
    const rows: Row[] = [];

    // Try to place each remaining part on this sheet
    const stillRemaining: NestPart[] = [];

    for (const part of remainingParts) {
      const placement = tryPlacePart(part, sheet, rows, gap, allowRotation);

      if (placement) {
        sheet.placements.push(placement);
        updateSheetUsage(sheet, placement);
      } else {
        stillRemaining.push(part);
      }
    }

    // If we placed at least one part, add the sheet
    if (sheet.placements.length > 0) {
      sheet.utilization = calculateUtilization(sheet);
      sheets.push(sheet);
    }

    // If we couldn't place any parts, they won't fit
    if (stillRemaining.length === remainingParts.length) {
      unplaced.push(...stillRemaining);
      break;
    }

    remainingParts.length = 0;
    remainingParts.push(...stillRemaining);
  }

  // Any remaining parts after max sheets
  if (remainingParts.length > 0) {
    unplaced.push(...remainingParts);
  }

  return { sheets, unplaced };
}

// ============================================================================
// Placement Logic
// ============================================================================

function createNewSheet(width: number, height: number): NestSheet {
  return {
    sheetWidth: width,
    sheetHeight: height,
    placements: [],
    usedWidth: 0,
    usedHeight: 0,
    utilization: 0,
  };
}

function tryPlacePart(
  part: NestPart,
  sheet: NestSheet,
  rows: Row[],
  gap: number,
  allowRotation: boolean
): NestPlacement | null {
  // Try without rotation first
  let placement = tryPlaceInRows(part, sheet, rows, gap, false);
  if (placement) return placement;

  // Try with rotation if allowed
  if (allowRotation && part.width !== part.height) {
    placement = tryPlaceInRows(part, sheet, rows, gap, true);
    if (placement) return placement;
  }

  return null;
}

function tryPlaceInRows(
  part: NestPart,
  sheet: NestSheet,
  rows: Row[],
  gap: number,
  rotated: boolean
): NestPlacement | null {
  const width = rotated ? part.height : part.width;
  const height = rotated ? part.width : part.height;

  // Check if part fits on sheet at all
  if (width > sheet.sheetWidth || height > sheet.sheetHeight) {
    return null;
  }

  // Try to fit in existing rows
  for (const row of rows) {
    const x = row.usedWidth + (row.usedWidth > 0 ? gap : 0);

    // Check if part fits in this row
    if (x + width <= sheet.sheetWidth && height <= row.height) {
      // Update row
      row.usedWidth = x + width;

      return {
        id: part.id,
        x,
        y: row.y,
        width,
        height,
        rotated,
      };
    }
  }

  // Start a new row
  const newRowY = rows.length === 0
    ? 0
    : rows[rows.length - 1].y + rows[rows.length - 1].height + gap;

  // Check if new row fits on sheet
  if (newRowY + height > sheet.sheetHeight) {
    return null;
  }

  // Create new row
  const newRow: Row = {
    y: newRowY,
    height: height,
    usedWidth: width,
  };
  rows.push(newRow);

  return {
    id: part.id,
    x: 0,
    y: newRowY,
    width,
    height,
    rotated,
  };
}

function updateSheetUsage(sheet: NestSheet, placement: NestPlacement): void {
  sheet.usedWidth = Math.max(sheet.usedWidth, placement.x + placement.width);
  sheet.usedHeight = Math.max(sheet.usedHeight, placement.y + placement.height);
}

function calculateUtilization(sheet: NestSheet): number {
  const sheetArea = sheet.sheetWidth * sheet.sheetHeight;
  let usedArea = 0;

  for (const p of sheet.placements) {
    usedArea += p.width * p.height;
  }

  return usedArea / sheetArea;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Calculate total material usage statistics.
 */
export function calculateNestStats(result: NestResult): {
  totalSheets: number;
  totalParts: number;
  unplacedParts: number;
  averageUtilization: number;
  totalSheetArea: number;
  totalPartArea: number;
} {
  const totalSheets = result.sheets.length;
  let totalParts = 0;
  let totalSheetArea = 0;
  let totalPartArea = 0;

  for (const sheet of result.sheets) {
    totalSheetArea += sheet.sheetWidth * sheet.sheetHeight;
    for (const p of sheet.placements) {
      totalParts++;
      totalPartArea += p.width * p.height;
    }
  }

  const averageUtilization = totalSheetArea > 0
    ? totalPartArea / totalSheetArea
    : 0;

  return {
    totalSheets,
    totalParts,
    unplacedParts: result.unplaced.length,
    averageUtilization,
    totalSheetArea,
    totalPartArea,
  };
}

/**
 * Format nest result as human-readable summary.
 */
export function formatNestSummary(result: NestResult): string {
  const stats = calculateNestStats(result);
  const lines: string[] = [];

  lines.push(`Nesting Summary`);
  lines.push(`===============`);
  lines.push(`Sheets: ${stats.totalSheets}`);
  lines.push(`Parts placed: ${stats.totalParts}`);
  lines.push(`Parts unplaced: ${stats.unplacedParts}`);
  lines.push(`Average utilization: ${(stats.averageUtilization * 100).toFixed(1)}%`);
  lines.push(``);

  for (let i = 0; i < result.sheets.length; i++) {
    const sheet = result.sheets[i];
    lines.push(`Sheet ${i + 1}:`);
    lines.push(`  Size: ${sheet.sheetWidth}x${sheet.sheetHeight}mm`);
    lines.push(`  Parts: ${sheet.placements.length}`);
    lines.push(`  Utilization: ${(sheet.utilization * 100).toFixed(1)}%`);

    for (const p of sheet.placements) {
      const rotStr = p.rotated ? ' (R)' : '';
      lines.push(`    - ${p.id}: ${p.width}x${p.height}mm at (${p.x}, ${p.y})${rotStr}`);
    }
  }

  if (result.unplaced.length > 0) {
    lines.push(``);
    lines.push(`Unplaced parts:`);
    for (const p of result.unplaced) {
      lines.push(`  - ${p.id}: ${p.width}x${p.height}mm`);
    }
  }

  return lines.join('\n');
}
