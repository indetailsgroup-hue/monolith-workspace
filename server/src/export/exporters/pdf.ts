/**
 * PDF Exporter
 *
 * Generates a professional PDF cutlist report for cabinet manufacturing.
 *
 * Includes:
 * - Cutlist (panel dimensions, quantities)
 * - Material summary
 * - Assembly overview
 * - Bill of materials
 */

import PDFDocument from 'pdfkit';
import { sha256Hex } from '../../storage/cas.js';
import type { ArtifactBundle, ArtifactFile } from '../../types.js';

// ============================================================================
// Types
// ============================================================================

interface CutListEntry {
  partId: string;
  cabinetId: string;
  cabinetName: string;
  partName: string;
  material: string;
  width: number;
  height: number;
  thickness: number;
  quantity: number;
  grain: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  edgeBanding: string;
  notes: string;
}

interface MaterialSummary {
  material: string;
  thickness: number;
  totalArea: number; // mm^2
  panelCount: number;
}

interface CabinetSummary {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  depth: number;
  panelCount: number;
}

// ============================================================================
// PDF Configuration
// ============================================================================

const PDF_CONFIG = {
  margins: { top: 50, bottom: 50, left: 50, right: 50 },
  fonts: {
    title: 24,
    sectionHeader: 16,
    tableHeader: 10,
    tableBody: 9,
    footer: 8,
  },
  colors: {
    primary: '#1a365d',
    secondary: '#2d3748',
    headerBg: '#edf2f7',
    tableBorder: '#cbd5e0',
    text: '#2d3748',
    lightText: '#718096',
  },
  tableRowHeight: 20,
  columnWidths: {
    cutlist: {
      partName: 100,
      material: 80,
      width: 50,
      height: 50,
      thickness: 45,
      grain: 50,
      edgeBanding: 60,
      notes: 75,
    },
  },
};

// ============================================================================
// Exporter
// ============================================================================

export function exportPdf(
  bundle: ArtifactBundle,
  jobName: string,
  _options?: Record<string, unknown>
): ArtifactFile[] {
  // Extract snapshot from bundle
  const snapshotFile = bundle.files.find((f) => f.name === 'snapshot.json');
  if (!snapshotFile) {
    throw new Error('Bundle missing snapshot.json');
  }

  const snapshot = JSON.parse(snapshotFile.content);
  const cabinets = snapshot.cabinets || [];

  // Build data structures
  const cutlistEntries = buildCutlistEntries(cabinets);
  const materialSummary = buildMaterialSummary(cutlistEntries);
  const cabinetSummary = buildCabinetSummary(cabinets);

  // Generate PDF
  const pdfBuffer = generatePdfDocument(
    jobName,
    cutlistEntries,
    materialSummary,
    cabinetSummary,
    snapshot
  );

  // Create artifact file
  const fileName = `${jobName}_cutlist_report.pdf`;
  const content = pdfBuffer.toString('base64');
  const hashHex = sha256Hex(pdfBuffer);

  return [
    {
      name: fileName,
      content,
      contentType: 'application/pdf',
      hashHex,
    },
  ];
}

// ============================================================================
// PDF Generation
// ============================================================================

function generatePdfDocument(
  jobName: string,
  cutlistEntries: CutListEntry[],
  materialSummary: MaterialSummary[],
  cabinetSummary: CabinetSummary[],
  snapshot: any
): Buffer {
  const chunks: Buffer[] = [];

  const doc = new PDFDocument({
    size: 'A4',
    margins: PDF_CONFIG.margins,
    bufferPages: true,
  });

  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  // Track current page for footer
  let pageNumber = 1;

  // Page setup helper
  const addPageFooter = () => {
    const pageHeight = doc.page.height;
    doc
      .fontSize(PDF_CONFIG.fonts.footer)
      .fillColor(PDF_CONFIG.colors.lightText)
      .text(
        `Generated: ${new Date().toISOString().split('T')[0]} | Page ${pageNumber}`,
        PDF_CONFIG.margins.left,
        pageHeight - 30,
        { align: 'center', width: doc.page.width - PDF_CONFIG.margins.left - PDF_CONFIG.margins.right }
      );
  };

  // ========== Title Page ==========
  doc
    .fontSize(PDF_CONFIG.fonts.title)
    .fillColor(PDF_CONFIG.colors.primary)
    .text('Cutlist Report', { align: 'center' });

  doc.moveDown(0.5);

  doc
    .fontSize(14)
    .fillColor(PDF_CONFIG.colors.secondary)
    .text(jobName, { align: 'center' });

  doc.moveDown(2);

  // Project summary box
  const summaryY = doc.y;
  doc
    .rect(PDF_CONFIG.margins.left, summaryY, doc.page.width - PDF_CONFIG.margins.left - PDF_CONFIG.margins.right, 100)
    .fillColor('#f7fafc')
    .fill();

  doc.fillColor(PDF_CONFIG.colors.text);
  doc.y = summaryY + 15;

  doc
    .fontSize(12)
    .text(`Project: ${snapshot.projectName || jobName}`, PDF_CONFIG.margins.left + 20);
  doc
    .fontSize(10)
    .text(`Total Cabinets: ${cabinetSummary.length}`, PDF_CONFIG.margins.left + 20);
  doc.text(`Total Panels: ${cutlistEntries.length}`, PDF_CONFIG.margins.left + 20);
  doc.text(`Material Types: ${materialSummary.length}`, PDF_CONFIG.margins.left + 20);

  const totalArea = materialSummary.reduce((sum, m) => sum + m.totalArea, 0);
  doc.text(`Total Sheet Area: ${(totalArea / 1000000).toFixed(2)} m²`, PDF_CONFIG.margins.left + 20);

  addPageFooter();

  // ========== Material Summary Page ==========
  doc.addPage();
  pageNumber++;

  doc
    .fontSize(PDF_CONFIG.fonts.sectionHeader)
    .fillColor(PDF_CONFIG.colors.primary)
    .text('Material Summary', { underline: true });

  doc.moveDown();

  // Material summary table
  const matHeaders = ['Material', 'Thickness', 'Panel Count', 'Total Area (m²)'];
  const matColWidths = [180, 80, 80, 100];
  let tableY = doc.y;

  // Header row
  drawTableRow(doc, matHeaders, matColWidths, tableY, true);
  tableY += PDF_CONFIG.tableRowHeight;

  // Data rows
  for (const mat of materialSummary) {
    if (tableY > doc.page.height - 100) {
      addPageFooter();
      doc.addPage();
      pageNumber++;
      tableY = PDF_CONFIG.margins.top;
      drawTableRow(doc, matHeaders, matColWidths, tableY, true);
      tableY += PDF_CONFIG.tableRowHeight;
    }

    const row = [
      mat.material,
      `${mat.thickness}mm`,
      mat.panelCount.toString(),
      (mat.totalArea / 1000000).toFixed(3),
    ];
    drawTableRow(doc, row, matColWidths, tableY, false);
    tableY += PDF_CONFIG.tableRowHeight;
  }

  doc.y = tableY + 20;

  addPageFooter();

  // ========== Cabinet Overview Page ==========
  doc.addPage();
  pageNumber++;

  doc
    .fontSize(PDF_CONFIG.fonts.sectionHeader)
    .fillColor(PDF_CONFIG.colors.primary)
    .text('Cabinet Overview', { underline: true });

  doc.moveDown();

  const cabHeaders = ['Cabinet', 'Type', 'W x H x D (mm)', 'Panels'];
  const cabColWidths = [150, 100, 120, 60];
  tableY = doc.y;

  drawTableRow(doc, cabHeaders, cabColWidths, tableY, true);
  tableY += PDF_CONFIG.tableRowHeight;

  for (const cab of cabinetSummary) {
    if (tableY > doc.page.height - 100) {
      addPageFooter();
      doc.addPage();
      pageNumber++;
      tableY = PDF_CONFIG.margins.top;
      drawTableRow(doc, cabHeaders, cabColWidths, tableY, true);
      tableY += PDF_CONFIG.tableRowHeight;
    }

    const row = [
      cab.name,
      cab.type,
      `${cab.width} x ${cab.height} x ${cab.depth}`,
      cab.panelCount.toString(),
    ];
    drawTableRow(doc, row, cabColWidths, tableY, false);
    tableY += PDF_CONFIG.tableRowHeight;
  }

  doc.y = tableY + 20;

  addPageFooter();

  // ========== Cutlist Detail Pages ==========
  doc.addPage();
  pageNumber++;

  doc
    .fontSize(PDF_CONFIG.fonts.sectionHeader)
    .fillColor(PDF_CONFIG.colors.primary)
    .text('Cutlist Detail', { underline: true });

  doc.moveDown();

  const cutHeaders = ['Part', 'Material', 'W', 'H', 'T', 'Grain', 'Edge', 'Notes'];
  const cutColWidths = [
    PDF_CONFIG.columnWidths.cutlist.partName,
    PDF_CONFIG.columnWidths.cutlist.material,
    PDF_CONFIG.columnWidths.cutlist.width,
    PDF_CONFIG.columnWidths.cutlist.height,
    PDF_CONFIG.columnWidths.cutlist.thickness,
    PDF_CONFIG.columnWidths.cutlist.grain,
    PDF_CONFIG.columnWidths.cutlist.edgeBanding,
    PDF_CONFIG.columnWidths.cutlist.notes,
  ];
  tableY = doc.y;

  drawTableRow(doc, cutHeaders, cutColWidths, tableY, true);
  tableY += PDF_CONFIG.tableRowHeight;

  // Group entries by cabinet
  const entriesByCabinet = new Map<string, CutListEntry[]>();
  for (const entry of cutlistEntries) {
    const existing = entriesByCabinet.get(entry.cabinetId) || [];
    existing.push(entry);
    entriesByCabinet.set(entry.cabinetId, existing);
  }

  for (const [cabinetId, entries] of entriesByCabinet) {
    // Cabinet header
    if (tableY > doc.page.height - 120) {
      addPageFooter();
      doc.addPage();
      pageNumber++;
      tableY = PDF_CONFIG.margins.top;
      drawTableRow(doc, cutHeaders, cutColWidths, tableY, true);
      tableY += PDF_CONFIG.tableRowHeight;
    }

    const cabinetName = entries[0]?.cabinetName || cabinetId;
    doc
      .fontSize(10)
      .fillColor(PDF_CONFIG.colors.primary)
      .text(cabinetName, PDF_CONFIG.margins.left, tableY + 4);
    tableY += PDF_CONFIG.tableRowHeight;

    for (const entry of entries) {
      if (tableY > doc.page.height - 100) {
        addPageFooter();
        doc.addPage();
        pageNumber++;
        tableY = PDF_CONFIG.margins.top;
        drawTableRow(doc, cutHeaders, cutColWidths, tableY, true);
        tableY += PDF_CONFIG.tableRowHeight;
      }

      const row = [
        truncateText(entry.partName, 15),
        truncateText(entry.material, 12),
        entry.width.toFixed(0),
        entry.height.toFixed(0),
        entry.thickness.toFixed(0),
        entry.grain.charAt(0),
        entry.edgeBanding,
        truncateText(entry.notes, 10),
      ];
      drawTableRow(doc, row, cutColWidths, tableY, false);
      tableY += PDF_CONFIG.tableRowHeight;
    }

    tableY += 5; // Space between cabinets
  }

  addPageFooter();

  // ========== Assembly Notes Page ==========
  doc.addPage();
  pageNumber++;

  doc
    .fontSize(PDF_CONFIG.fonts.sectionHeader)
    .fillColor(PDF_CONFIG.colors.primary)
    .text('Assembly Notes', { underline: true });

  doc.moveDown();

  doc
    .fontSize(10)
    .fillColor(PDF_CONFIG.colors.text);

  // General assembly instructions
  const assemblyNotes = [
    '1. Verify all panel dimensions before cutting.',
    '2. Apply edge banding as specified in the cutlist.',
    '3. Observe grain direction for panels marked H (horizontal) or V (vertical).',
    '4. Pre-drill all hinge and shelf pin holes before assembly.',
    '5. Use appropriate hardware for the material type and load requirements.',
    '6. Check squareness during assembly using diagonal measurements.',
    '7. Allow adhesives to cure fully before applying load.',
  ];

  for (const note of assemblyNotes) {
    doc.text(note);
    doc.moveDown(0.5);
  }

  doc.moveDown();

  // Edge banding legend
  doc
    .fontSize(12)
    .fillColor(PDF_CONFIG.colors.primary)
    .text('Edge Banding Legend:');

  doc.moveDown(0.5);

  doc
    .fontSize(10)
    .fillColor(PDF_CONFIG.colors.text);

  const edgeLegend = [
    'NONE - No edge banding required',
    'ALL - Apply edge banding to all four edges',
    'T - Top edge only',
    'B - Bottom edge only',
    'L - Left edge only',
    'R - Right edge only',
    'T+B - Top and bottom edges',
    'L+R - Left and right edges',
  ];

  for (const item of edgeLegend) {
    doc.text(`  ${item}`);
  }

  doc.moveDown();

  // Grain legend
  doc
    .fontSize(12)
    .fillColor(PDF_CONFIG.colors.primary)
    .text('Grain Direction Legend:');

  doc.moveDown(0.5);

  doc
    .fontSize(10)
    .fillColor(PDF_CONFIG.colors.text);

  doc.text('  H - Horizontal grain (parallel to width)');
  doc.text('  V - Vertical grain (parallel to height)');
  doc.text('  N - No grain direction (MDF, particle board, etc.)');

  addPageFooter();

  // ========== Bill of Materials Page ==========
  doc.addPage();
  pageNumber++;

  doc
    .fontSize(PDF_CONFIG.fonts.sectionHeader)
    .fillColor(PDF_CONFIG.colors.primary)
    .text('Bill of Materials', { underline: true });

  doc.moveDown();

  // Sheet goods summary
  doc
    .fontSize(12)
    .fillColor(PDF_CONFIG.colors.secondary)
    .text('Sheet Goods:');

  doc.moveDown(0.5);

  doc.fontSize(10).fillColor(PDF_CONFIG.colors.text);

  for (const mat of materialSummary) {
    const sheetsNeeded = Math.ceil(mat.totalArea / (2440 * 1220)); // Standard 8x4 sheet
    doc.text(
      `  ${mat.material} (${mat.thickness}mm): ${sheetsNeeded} sheet(s) - ${mat.panelCount} parts`
    );
  }

  doc.moveDown();

  // Hardware estimates (basic)
  doc
    .fontSize(12)
    .fillColor(PDF_CONFIG.colors.secondary)
    .text('Hardware Estimates:');

  doc.moveDown(0.5);

  doc.fontSize(10).fillColor(PDF_CONFIG.colors.text);

  const doorCount = cutlistEntries.filter((e) => e.partName === 'Door').length;
  const drawerCount = cutlistEntries.filter((e) => e.partName === 'Drawer Front').length;

  doc.text(`  Hinges (pair): ${doorCount * 2} (based on ${doorCount} doors)`);
  doc.text(`  Drawer slides (pair): ${drawerCount}`);
  doc.text(`  Shelf pins: ${cabinetSummary.length * 8} (estimated 8 per cabinet)`);
  doc.text(`  Confirmat screws: ${cutlistEntries.length * 8} (estimated)`);
  doc.text(`  Cam locks: ${cutlistEntries.length * 4} (estimated)`);

  addPageFooter();

  // Finalize document
  doc.end();

  // Wait for all chunks and return buffer
  return Buffer.concat(chunks);
}

// ============================================================================
// Table Drawing Helpers
// ============================================================================

function drawTableRow(
  doc: PDFKit.PDFDocument,
  cells: string[],
  widths: number[],
  y: number,
  isHeader: boolean
): void {
  let x = PDF_CONFIG.margins.left;

  // Background for header
  if (isHeader) {
    const totalWidth = widths.reduce((sum, w) => sum + w, 0);
    doc
      .rect(x, y, totalWidth, PDF_CONFIG.tableRowHeight)
      .fillColor(PDF_CONFIG.colors.headerBg)
      .fill();
  }

  // Text
  doc
    .fontSize(isHeader ? PDF_CONFIG.fonts.tableHeader : PDF_CONFIG.fonts.tableBody)
    .fillColor(isHeader ? PDF_CONFIG.colors.primary : PDF_CONFIG.colors.text);

  for (let i = 0; i < cells.length; i++) {
    doc.text(cells[i], x + 3, y + 5, {
      width: widths[i] - 6,
      height: PDF_CONFIG.tableRowHeight - 4,
      ellipsis: true,
    });
    x += widths[i];
  }

  // Border
  x = PDF_CONFIG.margins.left;
  const totalWidth = widths.reduce((sum, w) => sum + w, 0);

  doc
    .strokeColor(PDF_CONFIG.colors.tableBorder)
    .lineWidth(0.5)
    .rect(x, y, totalWidth, PDF_CONFIG.tableRowHeight)
    .stroke();

  // Column borders
  for (let i = 0; i < widths.length - 1; i++) {
    x += widths[i];
    doc
      .moveTo(x, y)
      .lineTo(x, y + PDF_CONFIG.tableRowHeight)
      .stroke();
  }
}

function truncateText(text: string, maxLen: number): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 2) + '..';
}

// ============================================================================
// Data Building Helpers
// ============================================================================

function buildCutlistEntries(cabinets: any[]): CutListEntry[] {
  const entries: CutListEntry[] = [];

  for (const cabinet of cabinets) {
    // Add panels from the cabinet
    const panels = cabinet.panels || [];
    for (const panel of panels) {
      entries.push({
        partId: panel.id || `${cabinet.id}-${panel.label}`,
        cabinetId: cabinet.id,
        cabinetName: cabinet.name || cabinet.displayName || cabinet.id,
        partName: panel.label || panel.type || 'Panel',
        material: panel.material || cabinet.coreMaterial || 'MDF',
        width: panel.computedW || panel.width || 0,
        height: panel.computedH || panel.height || 0,
        thickness: panel.computedT || panel.thickness || 18,
        quantity: 1,
        grain: panel.grain || 'NONE',
        edgeBanding: formatEdgeBanding(panel.edgeBanding),
        notes: panel.notes || '',
      });
    }

    // Add doors/drawer fronts if any
    const compartments = cabinet.compartments || [];
    for (const comp of compartments) {
      if (comp.door) {
        entries.push({
          partId: `${cabinet.id}-door-${comp.id}`,
          cabinetId: cabinet.id,
          cabinetName: cabinet.name || cabinet.displayName || cabinet.id,
          partName: 'Door',
          material: cabinet.frontMaterial || cabinet.coreMaterial || 'MDF',
          width: comp.door.width || 0,
          height: comp.door.height || 0,
          thickness: comp.door.thickness || 18,
          quantity: 1,
          grain: 'VERTICAL',
          edgeBanding: 'ALL',
          notes: comp.door.hingeType || '',
        });
      }
      if (comp.drawerFront) {
        entries.push({
          partId: `${cabinet.id}-drawer-${comp.id}`,
          cabinetId: cabinet.id,
          cabinetName: cabinet.name || cabinet.displayName || cabinet.id,
          partName: 'Drawer Front',
          material: cabinet.frontMaterial || cabinet.coreMaterial || 'MDF',
          width: comp.drawerFront.width || 0,
          height: comp.drawerFront.height || 0,
          thickness: comp.drawerFront.thickness || 18,
          quantity: 1,
          grain: 'HORIZONTAL',
          edgeBanding: 'ALL',
          notes: '',
        });
      }
    }
  }

  return entries;
}

function buildMaterialSummary(entries: CutListEntry[]): MaterialSummary[] {
  const summaryMap = new Map<string, MaterialSummary>();

  for (const entry of entries) {
    const key = `${entry.material}-${entry.thickness}`;
    const existing = summaryMap.get(key);
    const area = entry.width * entry.height * entry.quantity;

    if (existing) {
      existing.totalArea += area;
      existing.panelCount += entry.quantity;
    } else {
      summaryMap.set(key, {
        material: entry.material,
        thickness: entry.thickness,
        totalArea: area,
        panelCount: entry.quantity,
      });
    }
  }

  return Array.from(summaryMap.values()).sort((a, b) => {
    if (a.material !== b.material) return a.material.localeCompare(b.material);
    return a.thickness - b.thickness;
  });
}

function buildCabinetSummary(cabinets: any[]): CabinetSummary[] {
  return cabinets.map((cab) => ({
    id: cab.id,
    name: cab.name || cab.displayName || cab.id,
    type: cab.type || cab.cabinetType || 'Base',
    width: cab.width || cab.computedWidth || 0,
    height: cab.height || cab.computedHeight || 0,
    depth: cab.depth || cab.computedDepth || 0,
    panelCount: (cab.panels || []).length + countDoorsPanels(cab),
  }));
}

function countDoorsPanels(cabinet: any): number {
  let count = 0;
  const compartments = cabinet.compartments || [];
  for (const comp of compartments) {
    if (comp.door) count++;
    if (comp.drawerFront) count++;
  }
  return count;
}

function formatEdgeBanding(edgeBanding: any): string {
  if (!edgeBanding) return 'NONE';
  if (typeof edgeBanding === 'string') return edgeBanding;

  // Object format: { top: true, bottom: true, left: false, right: false }
  const sides: string[] = [];
  if (edgeBanding.top) sides.push('T');
  if (edgeBanding.bottom) sides.push('B');
  if (edgeBanding.left) sides.push('L');
  if (edgeBanding.right) sides.push('R');

  if (sides.length === 0) return 'NONE';
  if (sides.length === 4) return 'ALL';
  return sides.join('+');
}
