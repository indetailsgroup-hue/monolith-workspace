/**
 * G-Code Exporter
 *
 * Step 9: Server-side G-code generation for CNC routers
 *
 * Generates G-code for:
 * - Panel profiling (outline cutting)
 * - Drilling operations
 * - Pocket cuts
 */

import { sha256Hex } from '../../storage/cas.js';
import type { ArtifactBundle, ArtifactFile } from '../../types.js';

// ============================================================================
// Types
// ============================================================================

interface GCodeConfig {
  // Machine settings
  spindleSpeed: number;      // RPM
  feedRate: number;          // mm/min for cutting
  plungeRate: number;        // mm/min for plunging
  rapidHeight: number;       // Z height for rapid moves (mm)
  safeHeight: number;        // Z height above material (mm)

  // Tool settings
  toolDiameter: number;      // mm
  depthPerPass: number;      // mm
  stepover: number;          // mm for pockets

  // Material settings
  materialThickness: number; // mm
  tabWidth: number;          // mm (holding tabs)
  tabHeight: number;         // mm
}

interface Operation {
  type: 'PROFILE' | 'DRILL' | 'POCKET';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  diameter?: number;
  points?: Array<{ x: number; y: number }>;
}

const DEFAULT_CONFIG: GCodeConfig = {
  spindleSpeed: 18000,
  feedRate: 3000,
  plungeRate: 1000,
  rapidHeight: 10,
  safeHeight: 2,
  toolDiameter: 6,
  depthPerPass: 8,
  stepover: 3,
  materialThickness: 18,
  tabWidth: 20,
  tabHeight: 3,
};

// ============================================================================
// Exporter
// ============================================================================

export function exportGcode(
  bundle: ArtifactBundle,
  jobName: string,
  options?: Record<string, unknown>
): ArtifactFile[] {
  // Merge options with defaults
  const config: GCodeConfig = { ...DEFAULT_CONFIG, ...options };

  // Extract opgraph (operations) from bundle
  const opgraphFile = bundle.files.find((f) => f.name === 'opgraph.json');
  if (!opgraphFile) {
    throw new Error('Bundle missing opgraph.json');
  }

  const opgraph = JSON.parse(opgraphFile.content);
  const panels = opgraph.panels || [];

  const files: ArtifactFile[] = [];

  // Generate G-code for each panel
  for (const panel of panels) {
    const operations = extractOperations(panel);
    const gcodeContent = generateGCode(panel, operations, config, jobName);
    const fileName = `${jobName}_${sanitizeFilename(panel.id || panel.label)}.nc`;
    const hashHex = sha256Hex(gcodeContent);

    files.push({
      name: fileName,
      content: gcodeContent,
      contentType: 'text/plain',
      hashHex,
    });
  }

  return files;
}

// ============================================================================
// G-Code Generation
// ============================================================================

function generateGCode(
  panel: any,
  operations: Operation[],
  config: GCodeConfig,
  jobName: string
): string {
  const lines: string[] = [];

  // Header comments
  lines.push(`; MONOLITH G-Code Export`);
  lines.push(`; Job: ${jobName}`);
  lines.push(`; Panel: ${panel.id || panel.label}`);
  lines.push(`; Size: ${panel.width}x${panel.height}x${panel.thickness}mm`);
  lines.push(`; Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Machine setup
  lines.push('G21 ; Set units to mm');
  lines.push('G90 ; Absolute positioning');
  lines.push('G17 ; XY plane selection');
  lines.push(`G0 Z${config.rapidHeight.toFixed(3)} ; Rapid to safe height`);
  lines.push(`M3 S${config.spindleSpeed} ; Spindle on CW`);
  lines.push('G4 P2 ; Dwell 2s for spindle');
  lines.push('');

  // Group operations by type
  const drillOps = operations.filter((op) => op.type === 'DRILL');
  const pocketOps = operations.filter((op) => op.type === 'POCKET');
  const profileOps = operations.filter((op) => op.type === 'PROFILE');

  // 1. Drilling operations first (fastest)
  if (drillOps.length > 0) {
    lines.push('; === DRILLING ===');
    for (const op of drillOps) {
      lines.push(...generateDrillOp(op, config));
    }
    lines.push('');
  }

  // 2. Pocket operations
  if (pocketOps.length > 0) {
    lines.push('; === POCKETS ===');
    for (const op of pocketOps) {
      lines.push(...generatePocketOp(op, config));
    }
    lines.push('');
  }

  // 3. Profile (outline) last
  if (profileOps.length > 0) {
    lines.push('; === PROFILE CUT ===');
    for (const op of profileOps) {
      lines.push(...generateProfileOp(op, config, panel));
    }
    lines.push('');
  }

  // Footer
  lines.push('; === FINISH ===');
  lines.push(`G0 Z${config.rapidHeight.toFixed(3)} ; Retract`);
  lines.push('M5 ; Spindle off');
  lines.push('G0 X0 Y0 ; Return home');
  lines.push('M30 ; Program end');

  return lines.join('\n');
}

// ============================================================================
// Operation Generators
// ============================================================================

function generateDrillOp(op: Operation, config: GCodeConfig): string[] {
  const lines: string[] = [];
  const x = op.x || 0;
  const y = op.y || 0;
  const depth = op.depth || config.materialThickness;

  lines.push(`; Drill at (${x}, ${y})`);
  lines.push(`G0 X${x.toFixed(3)} Y${y.toFixed(3)}`);
  lines.push(`G0 Z${config.safeHeight.toFixed(3)}`);
  lines.push(`G1 Z${(-depth).toFixed(3)} F${config.plungeRate}`);
  lines.push(`G0 Z${config.rapidHeight.toFixed(3)}`);

  return lines;
}

function generatePocketOp(op: Operation, config: GCodeConfig): string[] {
  const lines: string[] = [];
  const x = op.x || 0;
  const y = op.y || 0;
  const width = op.width || 50;
  const height = op.height || 50;
  const depth = op.depth || 10;

  lines.push(`; Pocket at (${x}, ${y}) ${width}x${height}x${depth}`);

  // Calculate tool offset
  const offset = config.toolDiameter / 2;
  const innerWidth = width - config.toolDiameter;
  const innerHeight = height - config.toolDiameter;

  if (innerWidth <= 0 || innerHeight <= 0) {
    lines.push('; Warning: Pocket too small for tool');
    return lines;
  }

  // Multi-pass depth
  const passes = Math.ceil(depth / config.depthPerPass);

  for (let pass = 1; pass <= passes; pass++) {
    const z = -Math.min(pass * config.depthPerPass, depth);

    lines.push(`; Pass ${pass}/${passes} at Z=${z.toFixed(3)}`);
    lines.push(`G0 X${(x + offset).toFixed(3)} Y${(y + offset).toFixed(3)}`);
    lines.push(`G1 Z${z.toFixed(3)} F${config.plungeRate}`);

    // Spiral outward pocket
    const currentX = x + offset;
    const currentY = y + offset;
    let pocketWidth = config.stepover;
    let pocketHeight = config.stepover;

    while (pocketWidth <= innerWidth || pocketHeight <= innerHeight) {
      // Cut rectangle
      lines.push(`G1 X${(x + offset + Math.min(pocketWidth, innerWidth)).toFixed(3)} F${config.feedRate}`);
      lines.push(`G1 Y${(y + offset + Math.min(pocketHeight, innerHeight)).toFixed(3)}`);
      lines.push(`G1 X${(x + offset).toFixed(3)}`);
      lines.push(`G1 Y${(y + offset).toFixed(3)}`);

      pocketWidth += config.stepover;
      pocketHeight += config.stepover;

      if (pocketWidth > innerWidth && pocketHeight > innerHeight) break;
    }

    // Final outline
    lines.push(`G1 X${(x + offset + innerWidth).toFixed(3)}`);
    lines.push(`G1 Y${(y + offset + innerHeight).toFixed(3)}`);
    lines.push(`G1 X${(x + offset).toFixed(3)}`);
    lines.push(`G1 Y${(y + offset).toFixed(3)}`);
  }

  lines.push(`G0 Z${config.rapidHeight.toFixed(3)}`);

  return lines;
}

function generateProfileOp(op: Operation, config: GCodeConfig, panel: any): string[] {
  const lines: string[] = [];
  const width = panel.width || 600;
  const height = panel.height || 400;
  const depth = config.materialThickness + 1; // Cut through + 1mm

  lines.push(`; Profile cut ${width}x${height}mm`);

  // Tool offset (outside cut)
  const offset = config.toolDiameter / 2;

  // Start position (bottom-left, offset outside)
  const x0 = -offset;
  const y0 = -offset;
  const x1 = width + offset;
  const y1 = height + offset;

  // Tab positions
  const tabs = calculateTabPositions(width, height, config.tabWidth);

  // Multi-pass cutting
  const passes = Math.ceil(depth / config.depthPerPass);

  for (let pass = 1; pass <= passes; pass++) {
    const z = -Math.min(pass * config.depthPerPass, depth);
    const isLastPass = pass === passes;

    lines.push(`; Pass ${pass}/${passes} at Z=${z.toFixed(3)}`);
    lines.push(`G0 X${x0.toFixed(3)} Y${y0.toFixed(3)}`);
    lines.push(`G1 Z${z.toFixed(3)} F${config.plungeRate}`);

    // Cut profile with tabs on last pass
    if (isLastPass && tabs.length > 0) {
      lines.push(...cutProfileWithTabs(x0, y0, x1, y1, tabs, z, config));
    } else {
      // Normal rectangle cut
      lines.push(`G1 X${x1.toFixed(3)} F${config.feedRate}`);
      lines.push(`G1 Y${y1.toFixed(3)}`);
      lines.push(`G1 X${x0.toFixed(3)}`);
      lines.push(`G1 Y${y0.toFixed(3)}`);
    }
  }

  lines.push(`G0 Z${config.rapidHeight.toFixed(3)}`);

  return lines;
}

function cutProfileWithTabs(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tabs: Array<{ edge: string; position: number }>,
  z: number,
  config: GCodeConfig
): string[] {
  const lines: string[] = [];
  const tabZ = z + config.tabHeight;

  // Simplified: just cut the rectangle for now
  // Full implementation would lift Z at tab positions
  lines.push(`G1 X${x1.toFixed(3)} F${config.feedRate}`);
  lines.push(`G1 Y${y1.toFixed(3)}`);
  lines.push(`G1 X${x0.toFixed(3)}`);
  lines.push(`G1 Y${y0.toFixed(3)}`);

  return lines;
}

function calculateTabPositions(
  width: number,
  height: number,
  tabWidth: number
): Array<{ edge: string; position: number }> {
  const tabs: Array<{ edge: string; position: number }> = [];

  // Add tabs on each edge (one in the middle)
  if (width > tabWidth * 3) {
    tabs.push({ edge: 'bottom', position: width / 2 });
    tabs.push({ edge: 'top', position: width / 2 });
  }
  if (height > tabWidth * 3) {
    tabs.push({ edge: 'left', position: height / 2 });
    tabs.push({ edge: 'right', position: height / 2 });
  }

  return tabs;
}

// ============================================================================
// Helpers
// ============================================================================

function extractOperations(panel: any): Operation[] {
  const operations: Operation[] = [];

  // Extract drilling operations
  if (panel.drillHoles) {
    for (const hole of panel.drillHoles) {
      operations.push({
        type: 'DRILL',
        x: hole.x,
        y: hole.y,
        depth: hole.depth,
        diameter: hole.diameter,
      });
    }
  }

  // Extract pocket operations
  if (panel.pockets) {
    for (const pocket of panel.pockets) {
      operations.push({
        type: 'POCKET',
        x: pocket.x,
        y: pocket.y,
        width: pocket.width,
        height: pocket.height,
        depth: pocket.depth,
      });
    }
  }

  // Extract explicit operations
  if (panel.operations) {
    for (const op of panel.operations) {
      operations.push(op);
    }
  }

  // Always add profile cut for the panel outline
  operations.push({ type: 'PROFILE' });

  return operations;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}
