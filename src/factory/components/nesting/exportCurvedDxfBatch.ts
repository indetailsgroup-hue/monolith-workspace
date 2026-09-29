/**
 * exportCurvedDxfBatch.ts
 *
 * Feature 4: Export all curved-panel DXF files as a ZIP bundle.
 * Uses the existing buildDxfSheet infrastructure with a minimal
 * PlannedSheet + default profile, then zips via JSZip.
 *
 * @module factory/components/nesting/exportCurvedDxfBatch
 */

import JSZip from 'jszip';
import type { NestingSheet } from '../../../core/export/monolith/monolithExportContext';

// ─── Minimal DXF Generator (R12 format, curved panels only) ──────────────────

/**
 * Generate a DXF string for one nesting sheet (curved panels only).
 * Uses AutoCAD R12 format for maximum CNC compatibility.
 */
function buildCurvedSheetDxf(sheet: NestingSheet): string {
  const lines: string[] = [];

  // HEADER
  lines.push('0', 'SECTION', '2', 'HEADER');
  lines.push('9', '$ACADVER', '1', 'AC1009'); // R12
  lines.push('9', '$INSUNITS', '70', '4'); // mm
  lines.push('0', 'ENDSEC');

  // TABLES (layers)
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER', '70', '3');
  // Layer: SHEET_BOUNDARY
  lines.push('0', 'LAYER', '2', 'SHEET_BOUNDARY', '70', '0', '62', '7', '6', 'CONTINUOUS');
  // Layer: CURVED_PANEL
  lines.push('0', 'LAYER', '2', 'CURVED_PANEL', '70', '0', '62', '3', '6', 'CONTINUOUS'); // green
  // Layer: KERF_MARK
  lines.push('0', 'LAYER', '2', 'KERF_MARK', '70', '0', '62', '5', '6', 'DASHED'); // blue
  lines.push('0', 'ENDTAB');
  lines.push('0', 'ENDSEC');

  // ENTITIES
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  // Sheet boundary rectangle
  addRect(lines, 0, 0, sheet.sheetW, sheet.sheetH, 'SHEET_BOUNDARY');

  // Sheet label
  addText(lines, 2, sheet.sheetH + 5, 4,
    `NEST_${String(sheet.index1).padStart(2, '0')} | ${sheet.materialId} | ${sheet.sheetW}×${sheet.sheetH}×${sheet.sheetThickness}`,
    'SHEET_BOUNDARY');

  // Curved placements only
  const curvedPlacements = sheet.placements.filter(p => p.isCurved);

  for (const p of curvedPlacements) {
    const w = (p.rotation === 90 || p.rotation === 270) ? p.cutH : p.cutW;
    const h = (p.rotation === 90 || p.rotation === 270) ? p.cutW : p.cutH;

    // Panel outline
    addRect(lines, p.x, p.y, w, h, 'CURVED_PANEL');

    // Part ID label
    addText(lines, p.x + 2, p.y + h - 5, 3, p.partId, 'CURVED_PANEL');

    // Kerf count label
    if (p.kerfCount && p.kerfCount > 0) {
      addText(lines, p.x + 2, p.y + 3, 2.5, `${p.kerfCount}K`, 'KERF_MARK');

      // Draw kerf slot markers (evenly spaced lines across width)
      const kerfSpacing = w / (p.kerfCount + 1);
      for (let k = 1; k <= p.kerfCount; k++) {
        const kx = p.x + k * kerfSpacing;
        addLine(lines, kx, p.y + 1, kx, p.y + h - 1, 'KERF_MARK');
      }
    }
  }

  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  return lines.join('\n');
}

// ─── DXF Primitive Helpers ───────────────────────────────────────────────────

function addRect(lines: string[], x: number, y: number, w: number, h: number, layer: string): void {
  // Polyline rectangle
  addLine(lines, x, y, x + w, y, layer);
  addLine(lines, x + w, y, x + w, y + h, layer);
  addLine(lines, x + w, y + h, x, y + h, layer);
  addLine(lines, x, y + h, x, y, layer);
}

function addLine(lines: string[], x1: number, y1: number, x2: number, y2: number, layer: string): void {
  lines.push('0', 'LINE', '8', layer, '10', x1.toFixed(2), '20', y1.toFixed(2), '30', '0',
    '11', x2.toFixed(2), '21', y2.toFixed(2), '31', '0');
}

function addText(lines: string[], x: number, y: number, height: number, text: string, layer: string): void {
  lines.push('0', 'TEXT', '8', layer, '10', x.toFixed(2), '20', y.toFixed(2), '30', '0',
    '40', height.toFixed(2), '1', text);
}

// ─── ZIP + Download ──────────────────────────────────────────────────────────

/**
 * Generate DXF files for all sheets that contain curved panels,
 * bundle them into a ZIP, and trigger browser download.
 *
 * @param sheets - NestingSheet array from the verified packet
 * @param jobId - Job ID for filename
 */
export async function exportCurvedDxfBatch(
  sheets: NestingSheet[],
  jobId?: string
): Promise<void> {
  if (!sheets || sheets.length === 0) return;

  const zip = new JSZip();

  // Filter to sheets that actually have curved panels
  const sheetsWithCurved = sheets.filter(
    s => s.placements.some(p => p.isCurved)
  );

  if (sheetsWithCurved.length === 0) {
    // If no curved panels, include all sheets as a fallback
    for (const sheet of sheets) {
      const dxfContent = buildCurvedSheetDxf(sheet);
      const filename = `NEST_${String(sheet.index1).padStart(2, '0')}_${sheet.materialId}.dxf`;
      zip.file(filename, dxfContent);
    }
  } else {
    for (const sheet of sheetsWithCurved) {
      const dxfContent = buildCurvedSheetDxf(sheet);
      const filename = `NEST_${String(sheet.index1).padStart(2, '0')}_curved_${sheet.materialId}.dxf`;
      zip.file(filename, dxfContent);
    }
  }

  // Add a manifest
  const manifest = {
    jobId: jobId ?? 'unknown',
    exportedAt: new Date().toISOString(),
    sheetCount: zip.file(/\.dxf$/).length,
    curvedSheetCount: sheetsWithCurved.length,
    totalSheets: sheets.length,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // Generate ZIP blob and download
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dxf_curved_${jobId ?? 'export'}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
