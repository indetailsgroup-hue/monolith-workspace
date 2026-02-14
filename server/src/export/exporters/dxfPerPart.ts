/**
 * dxfPerPart.ts - P14A DXF Per-Part Exporter
 *
 * Generates individual DXF files per FlatPart with gate validation.
 * Uses deterministic DXF R12 format for CNC compatibility.
 *
 * Export Profile: DXF_R12_PER_PART_V1
 *
 * @version 0.14.4
 */

import { sha256Hex } from '../../storage/cas.js';
import type { ArtifactBundle, ArtifactFile } from '../../types.js';

// ============================================================================
// Types (inline to avoid client-side type dependencies on server)
// ============================================================================

interface FlatPartLite {
  id: string;
  name: string;
  partNumber?: string;
  cutWidth: number;
  cutHeight: number;
  outer: { type: string; width: number; height: number };
  drills: Array<{
    id: string;
    x: number;
    y: number;
    diameter: number;
    depth: number;
    isThrough: boolean;
    layer?: string;
  }>;
  pockets: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
    layer?: string;
  }>;
  grooves: Array<{
    id: string;
    axis: 'x' | 'y';
    position: number;
    start: number;
    length: number;
    width: number;
    depth: number;
    layer?: string;
  }>;
  edges: Array<{ side: string; materialCode: string; thickness: number }>;
  composite: {
    totalThickness: number;
    core: { materialName: string; thickness: number };
  };
}

interface GateIssue {
  code: string;
  severity: 'ERROR' | 'WARN' | 'INFO';
  message: string;
  location?: string;
}

interface GateResult {
  ok: boolean;
  issues: GateIssue[];
  canExport: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

const GATE_CONFIG = {
  minCutSize: 50,
  maxCutSize: 2800,
  minHoleToEdgeBand: 8,
  drillDepthSafetyMargin: 2,
};

const DXF_CONFIG = {
  precision: 3,
  includeAnnotation: true,
  annotationHeight: 5,
};

// ============================================================================
// Gate Validation (server-side implementation)
// ============================================================================

function validateFlatPartServer(part: FlatPartLite): GateResult {
  const issues: GateIssue[] = [];

  // Rule 1: Cut size validation
  if (part.cutWidth < GATE_CONFIG.minCutSize) {
    issues.push({
      code: 'CUT_SIZE_INVALID',
      severity: 'ERROR',
      message: `Cut width ${part.cutWidth}mm below minimum ${GATE_CONFIG.minCutSize}mm`,
      location: 'cutWidth',
    });
  }
  if (part.cutHeight < GATE_CONFIG.minCutSize) {
    issues.push({
      code: 'CUT_SIZE_INVALID',
      severity: 'ERROR',
      message: `Cut height ${part.cutHeight}mm below minimum ${GATE_CONFIG.minCutSize}mm`,
      location: 'cutHeight',
    });
  }
  if (part.cutWidth > GATE_CONFIG.maxCutSize) {
    issues.push({
      code: 'CUT_SIZE_INVALID',
      severity: 'ERROR',
      message: `Cut width ${part.cutWidth}mm exceeds machine limit ${GATE_CONFIG.maxCutSize}mm`,
      location: 'cutWidth',
    });
  }
  if (part.cutHeight > GATE_CONFIG.maxCutSize) {
    issues.push({
      code: 'CUT_SIZE_INVALID',
      severity: 'ERROR',
      message: `Cut height ${part.cutHeight}mm exceeds machine limit ${GATE_CONFIG.maxCutSize}mm`,
      location: 'cutHeight',
    });
  }

  // Rule 2: Outer contour validation
  if (part.outer.width <= 0 || part.outer.height <= 0) {
    issues.push({
      code: 'DXF_OUTER_NOT_CLOSED',
      severity: 'ERROR',
      message: `Invalid outer contour dimensions: ${part.outer.width}×${part.outer.height}`,
      location: 'outer',
    });
  }

  // Rule 3: Drill depth validation
  const coreThickness = part.composite.core.thickness;
  const maxSafeDepth = coreThickness - GATE_CONFIG.drillDepthSafetyMargin;

  for (const drill of part.drills) {
    if (!drill.isThrough && drill.depth > maxSafeDepth) {
      issues.push({
        code: 'HOLE_TOO_DEEP_FOR_CORE',
        severity: 'ERROR',
        message: `Drill ${drill.id} depth ${drill.depth}mm exceeds safe depth ${maxSafeDepth}mm`,
        location: drill.id,
      });
    }
  }

  // Rule 4: Hole edge clearance
  const hasLeftBand = part.edges.some((e) => e.side === 'left');
  const hasRightBand = part.edges.some((e) => e.side === 'right');
  const hasTopBand = part.edges.some((e) => e.side === 'top');
  const hasBottomBand = part.edges.some((e) => e.side === 'bottom');

  for (const drill of part.drills) {
    const radius = drill.diameter / 2;
    const minClearance = GATE_CONFIG.minHoleToEdgeBand;

    if (hasLeftBand && drill.x - radius < minClearance) {
      issues.push({
        code: 'HOLE_TOO_CLOSE_TO_EDGE_BAND',
        severity: 'ERROR',
        message: `Drill ${drill.id} too close to left edge band`,
        location: drill.id,
      });
    }
    if (hasRightBand && part.cutWidth - drill.x - radius < minClearance) {
      issues.push({
        code: 'HOLE_TOO_CLOSE_TO_EDGE_BAND',
        severity: 'ERROR',
        message: `Drill ${drill.id} too close to right edge band`,
        location: drill.id,
      });
    }
    if (hasBottomBand && drill.y - radius < minClearance) {
      issues.push({
        code: 'HOLE_TOO_CLOSE_TO_EDGE_BAND',
        severity: 'ERROR',
        message: `Drill ${drill.id} too close to bottom edge band`,
        location: drill.id,
      });
    }
    if (hasTopBand && part.cutHeight - drill.y - radius < minClearance) {
      issues.push({
        code: 'HOLE_TOO_CLOSE_TO_EDGE_BAND',
        severity: 'ERROR',
        message: `Drill ${drill.id} too close to top edge band`,
        location: drill.id,
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === 'ERROR');

  return {
    ok: !hasErrors,
    issues,
    canExport: !hasErrors,
  };
}

// ============================================================================
// DXF R12 Generation (Deterministic)
// ============================================================================

function formatNum(value: number): string {
  return value.toFixed(DXF_CONFIG.precision);
}

function generateDxfR12Deterministic(part: FlatPartLite): string {
  // Collect layers
  const layers = new Map<string, number>();
  layers.set('CUT_OUT', 7);
  layers.set('ANNOTATION', 2);

  for (const drill of part.drills) {
    const layer = drill.layer || `DRILL_V_${drill.diameter}_D${drill.depth}`;
    layers.set(layer, 1);
  }
  for (const pocket of part.pockets) {
    const layer = pocket.layer || `POCKET_D${pocket.depth}`;
    layers.set(layer, 4);
  }
  for (const groove of part.grooves) {
    const layer = groove.layer || `SAW_GROOVE_D${groove.depth}`;
    layers.set(layer, 3);
  }

  // Sort layers alphabetically for determinism
  const sortedLayers = Array.from(layers.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  let dxf = '';

  // Header
  dxf += `0\nSECTION\n2\nHEADER\n`;
  dxf += `9\n$ACADVER\n1\nAC1009\n`;
  dxf += `9\n$INSBASE\n10\n0.0\n20\n0.0\n30\n0.0\n`;
  dxf += `9\n$EXTMIN\n10\n0.0\n20\n0.0\n`;
  dxf += `9\n$EXTMAX\n10\n${formatNum(part.cutWidth)}\n20\n${formatNum(part.cutHeight)}\n`;
  dxf += `0\nENDSEC\n`;

  // Tables
  dxf += `0\nSECTION\n2\nTABLES\n`;
  dxf += `0\nTABLE\n2\nLAYER\n70\n${sortedLayers.length}\n`;

  for (const [name, color] of sortedLayers) {
    dxf += `0\nLAYER\n2\n${name}\n70\n0\n62\n${color}\n6\nCONTINUOUS\n`;
  }

  dxf += `0\nENDTAB\n0\nENDSEC\n`;

  // Entities
  dxf += `0\nSECTION\n2\nENTITIES\n`;

  // Outer contour (4 lines)
  const w = part.cutWidth;
  const h = part.cutHeight;
  dxf += `0\nLINE\n8\nCUT_OUT\n10\n${formatNum(0)}\n20\n${formatNum(0)}\n11\n${formatNum(w)}\n21\n${formatNum(0)}\n`;
  dxf += `0\nLINE\n8\nCUT_OUT\n10\n${formatNum(w)}\n20\n${formatNum(0)}\n11\n${formatNum(w)}\n21\n${formatNum(h)}\n`;
  dxf += `0\nLINE\n8\nCUT_OUT\n10\n${formatNum(w)}\n20\n${formatNum(h)}\n11\n${formatNum(0)}\n21\n${formatNum(h)}\n`;
  dxf += `0\nLINE\n8\nCUT_OUT\n10\n${formatNum(0)}\n20\n${formatNum(h)}\n11\n${formatNum(0)}\n21\n${formatNum(0)}\n`;

  // Drills (sorted for determinism)
  const sortedDrills = [...part.drills].sort((a, b) => {
    const la = a.layer || `DRILL_V_${a.diameter}_D${a.depth}`;
    const lb = b.layer || `DRILL_V_${b.diameter}_D${b.depth}`;
    if (la !== lb) return la.localeCompare(lb);
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  for (const drill of sortedDrills) {
    const layer = drill.layer || `DRILL_V_${drill.diameter}_D${drill.depth}`;
    const radius = drill.diameter / 2;
    dxf += `0\nCIRCLE\n8\n${layer}\n10\n${formatNum(drill.x)}\n20\n${formatNum(drill.y)}\n40\n${formatNum(radius)}\n`;
  }

  // Pockets (sorted)
  const sortedPockets = [...part.pockets].sort((a, b) => {
    const la = a.layer || `POCKET_D${a.depth}`;
    const lb = b.layer || `POCKET_D${b.depth}`;
    if (la !== lb) return la.localeCompare(lb);
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  for (const pocket of sortedPockets) {
    const layer = pocket.layer || `POCKET_D${pocket.depth}`;
    const x = pocket.x - pocket.width / 2;
    const y = pocket.y - pocket.height / 2;
    const pw = pocket.width;
    const ph = pocket.height;
    dxf += `0\nLINE\n8\n${layer}\n10\n${formatNum(x)}\n20\n${formatNum(y)}\n11\n${formatNum(x + pw)}\n21\n${formatNum(y)}\n`;
    dxf += `0\nLINE\n8\n${layer}\n10\n${formatNum(x + pw)}\n20\n${formatNum(y)}\n11\n${formatNum(x + pw)}\n21\n${formatNum(y + ph)}\n`;
    dxf += `0\nLINE\n8\n${layer}\n10\n${formatNum(x + pw)}\n20\n${formatNum(y + ph)}\n11\n${formatNum(x)}\n21\n${formatNum(y + ph)}\n`;
    dxf += `0\nLINE\n8\n${layer}\n10\n${formatNum(x)}\n20\n${formatNum(y + ph)}\n11\n${formatNum(x)}\n21\n${formatNum(y)}\n`;
  }

  // Grooves (sorted)
  const sortedGrooves = [...part.grooves].sort((a, b) => {
    const la = a.layer || `SAW_GROOVE_D${a.depth}`;
    const lb = b.layer || `SAW_GROOVE_D${b.depth}`;
    if (la !== lb) return la.localeCompare(lb);
    if (a.position !== b.position) return a.position - b.position;
    return a.start - b.start;
  });

  for (const groove of sortedGrooves) {
    const layer = groove.layer || `SAW_GROOVE_D${groove.depth}`;
    let x: number, y: number, gw: number, gh: number;
    if (groove.axis === 'x') {
      x = groove.start;
      y = groove.position - groove.width / 2;
      gw = groove.length;
      gh = groove.width;
    } else {
      x = groove.position - groove.width / 2;
      y = groove.start;
      gw = groove.width;
      gh = groove.length;
    }
    dxf += `0\nLINE\n8\n${layer}\n10\n${formatNum(x)}\n20\n${formatNum(y)}\n11\n${formatNum(x + gw)}\n21\n${formatNum(y)}\n`;
    dxf += `0\nLINE\n8\n${layer}\n10\n${formatNum(x + gw)}\n20\n${formatNum(y)}\n11\n${formatNum(x + gw)}\n21\n${formatNum(y + gh)}\n`;
    dxf += `0\nLINE\n8\n${layer}\n10\n${formatNum(x + gw)}\n20\n${formatNum(y + gh)}\n11\n${formatNum(x)}\n21\n${formatNum(y + gh)}\n`;
    dxf += `0\nLINE\n8\n${layer}\n10\n${formatNum(x)}\n20\n${formatNum(y + gh)}\n11\n${formatNum(x)}\n21\n${formatNum(y)}\n`;
  }

  // Annotation
  if (DXF_CONFIG.includeAnnotation) {
    const textY = h + 10;
    dxf += `0\nTEXT\n8\nANNOTATION\n10\n${formatNum(5)}\n20\n${formatNum(textY)}\n40\n${formatNum(DXF_CONFIG.annotationHeight)}\n1\n${part.partNumber || part.name}\n`;
    dxf += `0\nTEXT\n8\nANNOTATION\n10\n${formatNum(5)}\n20\n${formatNum(textY + 7)}\n40\n${formatNum(DXF_CONFIG.annotationHeight)}\n1\n${part.cutWidth}x${part.cutHeight}mm\n`;
  }

  dxf += `0\nENDSEC\n0\nEOF\n`;

  return dxf;
}

// ============================================================================
// Main Exporter
// ============================================================================

/**
 * Export DXF files for each FlatPart with gate validation.
 *
 * Profile: DXF_R12_PER_PART_V1
 */
export function exportDxfPerPart(
  bundle: ArtifactBundle,
  jobName: string,
  options?: Record<string, unknown>
): ArtifactFile[] {
  // Extract flatparts from bundle
  const flatpartsFile = bundle.files.find((f) => f.name === 'flatparts.json');
  if (!flatpartsFile) {
    throw new Error('Bundle missing flatparts.json - run FlatPart builder first');
  }

  const flatparts: FlatPartLite[] = JSON.parse(flatpartsFile.content);

  if (!Array.isArray(flatparts) || flatparts.length === 0) {
    throw new Error('No FlatParts found in bundle');
  }

  const files: ArtifactFile[] = [];
  const gateErrors: string[] = [];

  // Validate and generate DXF for each part
  for (const part of flatparts) {
    // Gate validation
    const gateResult = validateFlatPartServer(part);

    if (!gateResult.canExport) {
      const errors = gateResult.issues
        .filter((i) => i.severity === 'ERROR')
        .map((i) => `${part.partNumber || part.id}: ${i.message}`)
        .join('; ');
      gateErrors.push(errors);
      continue; // Skip parts that fail gate
    }

    // Generate DXF
    const dxfContent = generateDxfR12Deterministic(part);
    const fileName = `${jobName}_${sanitizeFilename(part.partNumber || part.name)}.dxf`;
    const hashHex = sha256Hex(dxfContent);

    files.push({
      name: fileName,
      content: dxfContent,
      contentType: 'application/dxf',
      hashHex,
    });
  }

  // If any parts failed gate, throw error
  if (gateErrors.length > 0) {
    throw new Error(`Gate validation failed for ${gateErrors.length} part(s): ${gateErrors.join(' | ')}`);
  }

  // Add gate report as JSON file
  const gateReport = {
    version: 'DXF_GATE_REPORT_V1',
    partsValidated: flatparts.length,
    partsExported: files.length,
    timestamp: new Date().toISOString(),
  };

  files.push({
    name: `${jobName}_gate_report.json`,
    content: JSON.stringify(gateReport, null, 2),
    contentType: 'application/json',
    hashHex: sha256Hex(JSON.stringify(gateReport, null, 2)),
  });

  return files;
}

// ============================================================================
// Helpers
// ============================================================================

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}
