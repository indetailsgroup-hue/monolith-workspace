/**
 * Cut List CSV Exporter
 *
 * Step 9: Server-side CSV cut list generation
 *
 * Generates a CSV file with panel dimensions for factory cutting.
 */

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

// ============================================================================
// Exporter
// ============================================================================

export function exportCutlistCsv(
  bundle: ArtifactBundle,
  jobName: string,
  options?: Record<string, unknown>
): ArtifactFile[] {
  // Extract snapshot from bundle
  const snapshotFile = bundle.files.find((f) => f.name === 'snapshot.json');
  if (!snapshotFile) {
    throw new Error('Bundle missing snapshot.json');
  }

  const snapshot = JSON.parse(snapshotFile.content);
  const cabinets = snapshot.cabinets || [];

  // Build cut list entries
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

  // Generate CSV content
  const csvContent = generateCsv(entries);

  // Create artifact file
  const fileName = `${jobName}_cutlist.csv`;
  const content = csvContent;
  const hashHex = sha256Hex(content);

  return [
    {
      name: fileName,
      content,
      contentType: 'text/csv',
      hashHex,
    },
  ];
}

// ============================================================================
// Helpers
// ============================================================================

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

function generateCsv(entries: CutListEntry[]): string {
  const headers = [
    'Part ID',
    'Cabinet ID',
    'Cabinet Name',
    'Part Name',
    'Material',
    'Width (mm)',
    'Height (mm)',
    'Thickness (mm)',
    'Quantity',
    'Grain',
    'Edge Banding',
    'Notes',
  ];

  const rows: string[] = [headers.join(',')];

  for (const entry of entries) {
    const row = [
      escapeCSV(entry.partId),
      escapeCSV(entry.cabinetId),
      escapeCSV(entry.cabinetName),
      escapeCSV(entry.partName),
      escapeCSV(entry.material),
      entry.width.toFixed(1),
      entry.height.toFixed(1),
      entry.thickness.toFixed(1),
      entry.quantity.toString(),
      entry.grain,
      entry.edgeBanding,
      escapeCSV(entry.notes),
    ];
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

function escapeCSV(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
