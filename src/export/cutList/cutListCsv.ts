/**
 * cutListCsv.ts - Cut List CSV Export
 *
 * Generates CSV cut lists from cabinet data for factory production.
 *
 * @version 1.0.0
 */

// ============================================================================
// Types
// ============================================================================

/**
 * CSV output mode.
 * - 'standard': Basic cut list with panel dimensions
 * - 'optimized': Includes nesting/optimization data
 */
export type CutListCsvMode = 'standard' | 'optimized';

/**
 * Input for generating a cut list CSV.
 */
export interface ExportCutListCsvInput {
  /** Cabinet panels data */
  panels: CutListPanel[];
  /** Output mode */
  mode?: CutListCsvMode;
  /** Include edge banding info */
  includeEdgeBanding?: boolean;
  /** Material thickness override */
  thicknessOverride?: number;
}

/**
 * Panel entry for cut list.
 */
export interface CutListPanel {
  /** Panel name/label */
  name: string;
  /** Panel width (mm) */
  width: number;
  /** Panel height (mm) */
  height: number;
  /** Panel thickness (mm) */
  thickness: number;
  /** Material name */
  material?: string;
  /** Quantity */
  qty?: number;
  /** Edge banding (L/R/T/B) */
  edgeBanding?: string;
}

// ============================================================================
// Compute Helpers
// ============================================================================

/**
 * Compute real cutting width accounting for blade kerf.
 */
export function computeCutW(width: number, kerf: number = 3.2): number {
  return width + kerf;
}

/**
 * Compute real cutting height accounting for blade kerf.
 */
export function computeCutH(height: number, kerf: number = 3.2): number {
  return height + kerf;
}

/**
 * Compute real thickness from nominal.
 * Some materials have actual thickness slightly different from nominal.
 */
export function computeTReal(thickness: number): number {
  // Standard mapping: 16mm nominal → 16mm actual, 18mm → 18mm
  // HMR boards may be 15.8mm for nominal 16mm
  return thickness;
}

// ============================================================================
// CSV Export
// ============================================================================

/**
 * Generate a CSV cut list from panel data.
 */
export function exportCutListCsv(input: ExportCutListCsvInput): string {
  const { panels, mode = 'standard', includeEdgeBanding = false } = input;

  const headers = ['Name', 'Width', 'Height', 'Thickness', 'Qty'];
  if (includeEdgeBanding) {
    headers.push('Edge Banding');
  }
  if (mode === 'optimized') {
    headers.push('Cut W', 'Cut H');
  }
  headers.push('Material');

  const rows = panels.map((panel) => {
    const row: (string | number)[] = [
      panel.name,
      panel.width,
      panel.height,
      panel.thickness,
      panel.qty ?? 1,
    ];
    if (includeEdgeBanding) {
      row.push(panel.edgeBanding ?? '');
    }
    if (mode === 'optimized') {
      row.push(computeCutW(panel.width), computeCutH(panel.height));
    }
    row.push(panel.material ?? '');
    return row;
  });

  const csvLines = [
    headers.join(','),
    ...rows.map((row) => row.join(',')),
  ];

  return csvLines.join('\n');
}
