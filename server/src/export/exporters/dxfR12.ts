/**
 * DXF R12 Exporter
 *
 * Step 9: Server-side DXF generation for CNC machines
 *
 * Generates DXF R12 format files compatible with most CAM software.
 * Each panel is exported as a separate DXF file with:
 * - Panel outline
 * - Drilling points
 * - Edge banding indicators
 */

import { sha256Hex } from '../../storage/cas.js';
import type { ArtifactBundle, ArtifactFile } from '../../types.js';

// ============================================================================
// Types
// ============================================================================

interface DxfPanel {
  id: string;
  name: string;
  width: number;
  height: number;
  thickness: number;
  drillPoints: DrillPoint[];
  edgeBanding: EdgeBanding;
}

interface DrillPoint {
  x: number;
  y: number;
  diameter: number;
  depth: number;
  type: 'THROUGH' | 'BLIND';
}

interface EdgeBanding {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

// ============================================================================
// Exporter
// ============================================================================

export function exportDxfR12(
  bundle: ArtifactBundle,
  jobName: string,
  options?: Record<string, unknown>
): ArtifactFile[] {
  // Extract opgraph (panel data) from bundle
  const opgraphFile = bundle.files.find((f) => f.name === 'opgraph.json');
  if (!opgraphFile) {
    throw new Error('Bundle missing opgraph.json');
  }

  const opgraph = JSON.parse(opgraphFile.content);
  const panels = opgraph.panels || [];

  const files: ArtifactFile[] = [];

  // Generate a DXF file for each panel
  for (const panel of panels) {
    const dxfPanel: DxfPanel = {
      id: panel.id,
      name: panel.label || panel.id,
      width: panel.width || 0,
      height: panel.height || 0,
      thickness: panel.thickness || 18,
      drillPoints: extractDrillPoints(panel),
      edgeBanding: extractEdgeBanding(panel),
    };

    const dxfContent = generateDxfR12(dxfPanel);
    const fileName = `${jobName}_${sanitizeFilename(dxfPanel.name)}.dxf`;
    const hashHex = sha256Hex(dxfContent);

    files.push({
      name: fileName,
      content: dxfContent,
      contentType: 'application/dxf',
      hashHex,
    });
  }

  return files;
}

// ============================================================================
// DXF R12 Generation
// ============================================================================

function generateDxfR12(panel: DxfPanel): string {
  const lines: string[] = [];

  // Header section
  lines.push('0', 'SECTION');
  lines.push('2', 'HEADER');
  lines.push('9', '$ACADVER');
  lines.push('1', 'AC1009'); // DXF R12
  lines.push('9', '$INSBASE');
  lines.push('10', '0.0');
  lines.push('20', '0.0');
  lines.push('30', '0.0');
  lines.push('9', '$EXTMIN');
  lines.push('10', '0.0');
  lines.push('20', '0.0');
  lines.push('30', '0.0');
  lines.push('9', '$EXTMAX');
  lines.push('10', panel.width.toString());
  lines.push('20', panel.height.toString());
  lines.push('30', '0.0');
  lines.push('0', 'ENDSEC');

  // Tables section (layers)
  lines.push('0', 'SECTION');
  lines.push('2', 'TABLES');

  // Layer table
  lines.push('0', 'TABLE');
  lines.push('2', 'LAYER');
  lines.push('70', '4'); // 4 layers

  // OUTLINE layer
  lines.push(...createLayer('OUTLINE', 7, 'CONTINUOUS'));
  // DRILL layer
  lines.push(...createLayer('DRILL', 1, 'CONTINUOUS'));
  // EDGE layer
  lines.push(...createLayer('EDGE', 3, 'DASHED'));
  // TEXT layer
  lines.push(...createLayer('TEXT', 4, 'CONTINUOUS'));

  lines.push('0', 'ENDTAB');
  lines.push('0', 'ENDSEC');

  // Entities section
  lines.push('0', 'SECTION');
  lines.push('2', 'ENTITIES');

  // Panel outline (rectangle)
  lines.push(...createLine(0, 0, panel.width, 0, 'OUTLINE'));
  lines.push(...createLine(panel.width, 0, panel.width, panel.height, 'OUTLINE'));
  lines.push(...createLine(panel.width, panel.height, 0, panel.height, 'OUTLINE'));
  lines.push(...createLine(0, panel.height, 0, 0, 'OUTLINE'));

  // Drill points
  for (const drill of panel.drillPoints) {
    lines.push(...createCircle(drill.x, drill.y, drill.diameter / 2, 'DRILL'));
    // Add center point
    lines.push(...createPoint(drill.x, drill.y, 'DRILL'));
  }

  // Edge banding indicators (dashed lines slightly inside the edge)
  const offset = 5; // 5mm inside the edge
  if (panel.edgeBanding.top) {
    lines.push(...createLine(offset, panel.height - offset, panel.width - offset, panel.height - offset, 'EDGE'));
  }
  if (panel.edgeBanding.bottom) {
    lines.push(...createLine(offset, offset, panel.width - offset, offset, 'EDGE'));
  }
  if (panel.edgeBanding.left) {
    lines.push(...createLine(offset, offset, offset, panel.height - offset, 'EDGE'));
  }
  if (panel.edgeBanding.right) {
    lines.push(...createLine(panel.width - offset, offset, panel.width - offset, panel.height - offset, 'EDGE'));
  }

  // Panel info text
  const infoText = `${panel.name} (${panel.width}x${panel.height}x${panel.thickness})`;
  lines.push(...createText(panel.width / 2, panel.height / 2, infoText, 10, 'TEXT'));

  lines.push('0', 'ENDSEC');

  // End of file
  lines.push('0', 'EOF');

  return lines.join('\n');
}

// ============================================================================
// DXF Entity Helpers
// ============================================================================

function createLayer(name: string, color: number, lineType: string): string[] {
  return [
    '0', 'LAYER',
    '2', name,
    '70', '0',
    '62', color.toString(),
    '6', lineType,
  ];
}

function createLine(x1: number, y1: number, x2: number, y2: number, layer: string): string[] {
  return [
    '0', 'LINE',
    '8', layer,
    '10', x1.toFixed(4),
    '20', y1.toFixed(4),
    '30', '0.0',
    '11', x2.toFixed(4),
    '21', y2.toFixed(4),
    '31', '0.0',
  ];
}

function createCircle(x: number, y: number, radius: number, layer: string): string[] {
  return [
    '0', 'CIRCLE',
    '8', layer,
    '10', x.toFixed(4),
    '20', y.toFixed(4),
    '30', '0.0',
    '40', radius.toFixed(4),
  ];
}

function createPoint(x: number, y: number, layer: string): string[] {
  return [
    '0', 'POINT',
    '8', layer,
    '10', x.toFixed(4),
    '20', y.toFixed(4),
    '30', '0.0',
  ];
}

function createText(x: number, y: number, text: string, height: number, layer: string): string[] {
  return [
    '0', 'TEXT',
    '8', layer,
    '10', x.toFixed(4),
    '20', y.toFixed(4),
    '30', '0.0',
    '40', height.toFixed(4),
    '1', text,
    '72', '1', // Center horizontally
    '73', '2', // Center vertically
    '11', x.toFixed(4), // Alignment point
    '21', y.toFixed(4),
    '31', '0.0',
  ];
}

// ============================================================================
// Helpers
// ============================================================================

function extractDrillPoints(panel: any): DrillPoint[] {
  const drillPoints: DrillPoint[] = [];

  // Extract from 32mm system holes
  if (panel.drillHoles) {
    for (const hole of panel.drillHoles) {
      drillPoints.push({
        x: hole.x || 0,
        y: hole.y || 0,
        diameter: hole.diameter || 5,
        depth: hole.depth || 13,
        type: hole.through ? 'THROUGH' : 'BLIND',
      });
    }
  }

  // Extract from operations
  if (panel.operations) {
    for (const op of panel.operations) {
      if (op.type === 'DRILL') {
        drillPoints.push({
          x: op.x || 0,
          y: op.y || 0,
          diameter: op.diameter || 5,
          depth: op.depth || 13,
          type: op.through ? 'THROUGH' : 'BLIND',
        });
      }
    }
  }

  return drillPoints;
}

function extractEdgeBanding(panel: any): EdgeBanding {
  const eb = panel.edgeBanding || {};

  if (typeof eb === 'string') {
    const all = eb === 'ALL';
    return { top: all, bottom: all, left: all, right: all };
  }

  return {
    top: eb.top ?? false,
    bottom: eb.bottom ?? false,
    left: eb.left ?? false,
    right: eb.right ?? false,
  };
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}
