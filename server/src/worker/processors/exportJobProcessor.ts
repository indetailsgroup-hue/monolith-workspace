/**
 * Export Job Processor
 *
 * Step 10.5: Processes export jobs from the queue
 *
 * Features:
 * - Bundle verification
 * - Policy evaluation
 * - Format-specific export (CSV, DXF, DXF_SHEET, DXF_SHEET_V2, GCODE, GCODE_KDT_MVP)
 * - Multi-part sheet nesting with rotation packing
 * - G-code compilation from toolpath plans
 * - Signed URL generation for outputs
 */

import { Job } from 'bullmq';
import { CAS } from '../../storage/cas.js';
import { ExportJobData, ExportJobResult } from '../../queue/queue.js';
import { makeSignedDownloadUrl } from '../../download/signedUrl.js';
import { exportPanelOutlineDxf } from '../../export/exporters/dxfR12/exporter.js';
import { buildPartBlueprint, type OpNode } from '../../export/exporters/dxfR12/opgraphToDxf.js';
import { exportSheetDxf, exportPartDxf } from '../../export/exporters/dxfR12/sheetExporter.js';
import { exportSheetsDxfV2, type PanelInput } from '../../export/exporters/dxfR12/sheetExporterV2.js';
import type { ToolpathPlan } from '../../export/exporters/dxfR12/toolpathPlan.js';
import { KDT_MVP_PROFILE, compileToolpathPlan, formatCompileSummary } from '../../post/index.js';

// ============================================================================
// Export Result Types
// ============================================================================

interface ExportOutput {
  filename: string;
  sha256: string;
  mime: string;
  sizeBytes: number;
  url?: string;
}

interface ExportPublicIndex {
  version: string;
  createdAtIso: string;
  bundleId: string;
  format: string;
  jobName: string;
  outputs: ExportOutput[];
}

// ============================================================================
// Processor
// ============================================================================

export interface ProcessorDeps {
  cas: CAS;
}

export async function processExportJob(
  deps: ProcessorDeps,
  job: Job<ExportJobData, ExportJobResult>
): Promise<ExportJobResult> {
  const { cas } = deps;
  const { bundleId, format, jobName, options } = job.data;

  console.log(`[Processor] Starting job ${job.id}: ${format} for bundle ${bundleId}`);

  try {
    // 1. Load bundle index
    const bundleIndexPath = `bundles/${bundleId}.json`;
    const bundleExists = await cas.exists(bundleIndexPath);

    if (!bundleExists) {
      return {
        ok: false,
        error: `Bundle not found: ${bundleId}`,
      };
    }

    const bundleIndex = await cas.readJson<any>(bundleIndexPath);

    // Update progress
    await job.updateProgress(10);

    // 2. Run the appropriate exporter
    let outputs: ExportOutput[] = [];

    switch (format) {
      case 'CUTLIST_CSV':
        outputs = await exportCutlistCsv(cas, bundleIndex, jobName);
        break;

      case 'DXF_R12':
        outputs = await exportDxfR12(cas, bundleIndex, jobName, options);
        break;

      case 'DXF_SHEET':
        outputs = await exportDxfSheet(cas, bundleIndex, jobName, options);
        break;

      case 'DXF_SHEET_V2':
        outputs = await exportDxfSheetV2(cas, bundleIndex, jobName, options);
        break;

      case 'GCODE':
        outputs = await exportGcode(cas, bundleIndex, jobName, options);
        break;

      case 'GCODE_KDT_MVP':
        outputs = await exportGcodeKdtMvp(cas, bundleIndex, jobName, options);
        break;

      default:
        return {
          ok: false,
          error: `Unsupported format: ${format}`,
        };
    }

    await job.updateProgress(70);

    // 3. Store outputs in CAS
    for (const output of outputs) {
      // The content was already stored during export, just verify
      const exists = await cas.hasHash(output.sha256);
      if (!exists) {
        console.warn(`[Processor] Output ${output.filename} not found in CAS`);
      }
    }

    await job.updateProgress(80);

    // 4. Generate signed URLs
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const ttl = Number(process.env.SIGNED_URL_TTL_SECONDS) || 600;

    const outputsWithUrls = outputs.map((output) => {
      const signed = makeSignedDownloadUrl({
        sha256: output.sha256,
        mime: output.mime,
        filename: output.filename,
        ttlSeconds: ttl,
        baseUrl,
      });

      return {
        ...output,
        url: signed.url,
        expiresAt: signed.expiresAtIso,
      };
    });

    await job.updateProgress(90);

    // 5. Create public index
    const publicIndex: ExportPublicIndex = {
      version: 'export-public.v1',
      createdAtIso: new Date().toISOString(),
      bundleId,
      format,
      jobName,
      outputs: outputsWithUrls,
    };

    const publicIndexPath = `exports/${bundleId}/${job.id}_public.json`;
    await cas.putJson(publicIndexPath, publicIndex);

    await job.updateProgress(100);

    console.log(`[Processor] Job ${job.id} completed: ${outputs.length} outputs`);

    return {
      ok: true,
      outputPublicIndexPath: publicIndexPath,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Processor] Job ${job.id} failed:`, message);

    return {
      ok: false,
      error: message,
    };
  }
}

// ============================================================================
// Exporters
// ============================================================================

async function exportCutlistCsv(
  cas: CAS,
  bundleIndex: any,
  jobName: string
): Promise<ExportOutput[]> {
  // Get panels from bundle (simplified - in real implementation, read snapshot.json)
  const panels = bundleIndex.manifest?.files || [];

  // Generate CSV content
  const headers = ['Part ID', 'Width (mm)', 'Height (mm)', 'Thickness (mm)', 'Material', 'Notes'];
  const rows: string[] = [headers.join(',')];

  // Demo data (in real implementation, parse snapshot.json)
  rows.push(`panel_1,600,400,18,MDF,Side panel`);
  rows.push(`panel_2,600,400,18,MDF,Side panel`);
  rows.push(`panel_3,564,400,18,MDF,Top panel`);
  rows.push(`panel_4,564,400,18,MDF,Bottom panel`);
  rows.push(`panel_5,564,382,18,MDF,Back panel`);

  const csvContent = rows.join('\n');
  const sha256 = await cas.putBytes(csvContent);

  return [{
    filename: `${jobName}_cutlist.csv`,
    sha256,
    mime: 'text/csv',
    sizeBytes: Buffer.byteLength(csvContent, 'utf-8'),
  }];
}

async function exportDxfR12(
  cas: CAS,
  bundleIndex: any,
  jobName: string,
  options?: Record<string, unknown>
): Promise<ExportOutput[]> {
  // Check if bundle has panels data
  const panels = extractPanelsFromBundle(bundleIndex);

  if (panels.length > 0) {
    // Use new OpGraph-based export for single panel
    const panel = panels[0];
    const part = buildPartBlueprint(
      panel.panelId,
      panel.label,
      { width: panel.width, height: panel.height, thickness: panel.thickness },
      [] // No operations for simple export
    );

    const result = exportPartDxf(part, { jobName });
    await cas.putBytes(result.content);

    return [{
      filename: result.filename,
      sha256: result.hash,
      mime: result.mime,
      sizeBytes: Buffer.byteLength(result.content, 'utf-8'),
    }];
  }

  // Fallback: Get panel dimensions from options or use defaults
  const width = Number(options?.width) || 600;
  const height = Number(options?.height) || 400;

  // Export panel outline
  const result = exportPanelOutlineDxf({
    jobName,
    width,
    height,
    label: `${jobName} (${width}x${height}mm)`,
  });

  // Store in CAS
  await cas.putBytes(result.content);

  return [{
    filename: result.filename,
    sha256: result.sha256,
    mime: result.mime,
    sizeBytes: result.sizeBytes,
  }];
}

/**
 * Export DXF with sheet nesting - multiple parts on factory sheets.
 */
async function exportDxfSheet(
  cas: CAS,
  bundleIndex: any,
  jobName: string,
  options?: Record<string, unknown>
): Promise<ExportOutput[]> {
  // Extract panels from bundle
  const panels = extractPanelsFromBundle(bundleIndex);

  // Generate demo panels if no bundle data
  if (panels.length === 0) {
    panels.push(
      { panelId: 'side_left', label: 'Side L', width: 600, height: 400, thickness: 18 },
      { panelId: 'side_right', label: 'Side R', width: 600, height: 400, thickness: 18 },
      { panelId: 'top', label: 'Top', width: 564, height: 400, thickness: 18 },
      { panelId: 'bottom', label: 'Bottom', width: 564, height: 400, thickness: 18 },
      { panelId: 'back', label: 'Back', width: 564, height: 382, thickness: 6 },
    );
  }

  // Build part blueprints with operations
  const parts = panels.map(panel => {
    const ops: OpNode[] = (panel.operations ?? []).map((op, idx) => ({
      id: `op_${panel.panelId}_${idx}`,
      kind: op.kind as OpNode['kind'],
      panelId: panel.panelId,
      target: {
        kind: op.target.kind,
        id: panel.panelId,
        edgeIndex: op.target.edgeIndex,
        face: op.target.face as OpNode['target']['face'],
      },
      params: op.params,
    }));

    return buildPartBlueprint(
      panel.panelId,
      panel.label,
      { width: panel.width, height: panel.height, thickness: panel.thickness },
      ops
    );
  });

  // Run sheet export with nesting
  const sheetResult = exportSheetDxf(parts, {
    sheetWidth: Number(options?.sheetWidth) || 2440,
    sheetHeight: Number(options?.sheetHeight) || 1220,
    gap: Number(options?.gap) || 5,
    allowRotation: options?.allowRotation !== false,
    jobName,
  });

  // Store each sheet in CAS
  const outputs: ExportOutput[] = [];

  for (let i = 0; i < sheetResult.dxfContents.length; i++) {
    const content = sheetResult.dxfContents[i];
    const hash = await cas.putBytes(content);

    outputs.push({
      filename: sheetResult.filenames[i],
      sha256: hash,
      mime: sheetResult.mime,
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
    });
  }

  // Log nesting summary
  console.log(`[Processor] Sheet nesting: ${sheetResult.stats.totalParts} parts on ${sheetResult.stats.totalSheets} sheets`);
  console.log(`[Processor] Utilization: ${(sheetResult.stats.averageUtilization * 100).toFixed(1)}%`);

  return outputs;
}

/**
 * Export DXF V2 - Multi-sheet with rotation packing.
 * Step 10.2: Enhanced exporter with 0°/90° rotation support.
 */
async function exportDxfSheetV2(
  cas: CAS,
  bundleIndex: any,
  jobName: string,
  options?: Record<string, unknown>
): Promise<ExportOutput[]> {
  // Extract panels from bundle
  const extractedPanels = extractPanelsFromBundle(bundleIndex);

  // Convert to PanelInput format
  const panels: PanelInput[] = extractedPanels.length > 0
    ? extractedPanels.map(p => ({
        panelId: p.panelId,
        label: p.label,
        width: p.width,
        height: p.height,
        thickness: p.thickness,
        operations: p.operations?.map(op => ({
          kind: op.kind,
          params: op.params,
          target: op.target,
        })),
      }))
    : [
        // Demo panels if no bundle data
        { panelId: 'side_left', label: 'Side L', width: 600, height: 720, thickness: 18 },
        { panelId: 'side_right', label: 'Side R', width: 600, height: 720, thickness: 18 },
        { panelId: 'top', label: 'Top', width: 564, height: 600, thickness: 18 },
        { panelId: 'bottom', label: 'Bottom', width: 564, height: 600, thickness: 18 },
        { panelId: 'back', label: 'Back', width: 564, height: 684, thickness: 6 },
      ];

  // Run V2 sheet export with rotation packing
  const result = exportSheetsDxfV2(panels, {
    jobName,
    sheetW: Number(options?.sheetWidth) || 2440,
    sheetH: Number(options?.sheetHeight) || 1220,
    sheetMarginMm: Number(options?.margin) || 15,
    partGapMm: Number(options?.gap) || 8,
  });

  // Store each output in CAS
  const outputs: ExportOutput[] = [];

  for (const output of result.outputs) {
    const hash = await cas.putBytes(output.content);

    outputs.push({
      filename: output.filename,
      sha256: hash,
      mime: output.mime,
      sizeBytes: output.sizeBytes,
    });
  }

  // Log summary
  console.log(`[Processor] DXF_SHEET_V2: ${result.stats.totalParts} parts on ${result.stats.totalSheets} sheets`);
  console.log(`[Processor] Utilization: ${(result.stats.utilization * 100).toFixed(1)}%`);
  console.log(`[Processor] Rotated parts: ${result.stats.rotatedParts}`);

  if (!result.ok) {
    console.warn(`[Processor] Packing issue: ${result.error}`);
  }

  return outputs;
}

/**
 * Extract panel data from bundle index/snapshot.
 */
interface ExtractedPanelData {
  panelId: string;
  label: string;
  width: number;
  height: number;
  thickness: number;
  operations?: Array<{
    kind: string;
    params: Record<string, number | string>;
    target: {
      kind: 'EDGE' | 'FACE' | 'PANEL';
      edgeIndex?: number;
      face?: string;
    };
  }>;
}

function extractPanelsFromBundle(bundleIndex: any): ExtractedPanelData[] {
  const panels: ExtractedPanelData[] = [];

  // Try to get panels from snapshot
  if (bundleIndex.snapshot?.cabinets) {
    for (const cabinet of bundleIndex.snapshot.cabinets) {
      if (cabinet.panels) {
        for (const panel of cabinet.panels) {
          panels.push({
            panelId: panel.id || `panel_${panels.length}`,
            label: panel.label || panel.name || `Panel ${panels.length + 1}`,
            width: panel.width || 600,
            height: panel.height || 400,
            thickness: panel.thickness || 18,
            operations: panel.operations,
          });
        }
      }
    }
  }

  // Try to get panels from manifest files
  if (panels.length === 0 && bundleIndex.manifest?.files) {
    for (const file of bundleIndex.manifest.files) {
      if (file.path?.includes('panel') || file.type === 'panel') {
        panels.push({
          panelId: file.id || `panel_${panels.length}`,
          label: file.label || file.name || `Panel ${panels.length + 1}`,
          width: file.width || 600,
          height: file.height || 400,
          thickness: file.thickness || 18,
        });
      }
    }
  }

  return panels;
}

async function exportGcode(
  cas: CAS,
  bundleIndex: any,
  jobName: string,
  options?: Record<string, unknown>
): Promise<ExportOutput[]> {
  // Generate basic G-code (simplified)
  const width = Number(options?.width) || 600;
  const height = Number(options?.height) || 400;
  const thickness = Number(options?.thickness) || 18;

  const gcode = generateSimpleGcode(jobName, width, height, thickness);
  const sha256 = await cas.putBytes(gcode);

  return [{
    filename: `${jobName}.nc`,
    sha256,
    mime: 'text/plain',
    sizeBytes: Buffer.byteLength(gcode, 'utf-8'),
  }];
}

function generateSimpleGcode(jobName: string, width: number, height: number, thickness: number): string {
  const lines: string[] = [
    `; MONOLITH G-Code Export`,
    `; Job: ${jobName}`,
    `; Size: ${width}x${height}x${thickness}mm`,
    `; Generated: ${new Date().toISOString()}`,
    '',
    'G21 ; Set units to mm',
    'G90 ; Absolute positioning',
    'G17 ; XY plane',
    '',
    'G0 Z10 ; Rapid to safe height',
    'M3 S18000 ; Spindle on',
    'G4 P2 ; Dwell 2s',
    '',
    '; Profile cut',
    'G0 X0 Y0',
    'G1 Z-' + (thickness + 1) + ' F1000',
    `G1 X${width} F3000`,
    `G1 Y${height}`,
    `G1 X0`,
    `G1 Y0`,
    '',
    'G0 Z10 ; Retract',
    'M5 ; Spindle off',
    'G0 X0 Y0 ; Home',
    'M30 ; End',
  ];

  return lines.join('\n');
}

/**
 * Export G-code using KDT MVP machine profile.
 * Step 10.5: Compiles toolpath_plan.json to G-code.
 *
 * Pipeline:
 * 1. Run DXF_SHEET_V2 export to generate toolpath plan
 * 2. Parse toolpath plan JSON
 * 3. Compile to G-code using KDT_MVP profile
 * 4. Return .nc files for each sheet
 */
async function exportGcodeKdtMvp(
  cas: CAS,
  bundleIndex: any,
  jobName: string,
  options?: Record<string, unknown>
): Promise<ExportOutput[]> {
  // 1. First run DXF_SHEET_V2 to get toolpath plan
  const extractedPanels = extractPanelsFromBundle(bundleIndex);

  const panels: PanelInput[] = extractedPanels.length > 0
    ? extractedPanels.map(p => ({
        panelId: p.panelId,
        label: p.label,
        width: p.width,
        height: p.height,
        thickness: p.thickness,
        operations: p.operations?.map(op => ({
          kind: op.kind,
          params: op.params,
          target: op.target,
        })),
      }))
    : [
        // Demo panels if no bundle data
        { panelId: 'side_left', label: 'Side L', width: 600, height: 720, thickness: 18 },
        { panelId: 'side_right', label: 'Side R', width: 600, height: 720, thickness: 18 },
        { panelId: 'top', label: 'Top', width: 564, height: 600, thickness: 18 },
        { panelId: 'bottom', label: 'Bottom', width: 564, height: 600, thickness: 18 },
        { panelId: 'back', label: 'Back', width: 564, height: 684, thickness: 6 },
      ];

  // Run V2 export to get toolpath plan
  const dxfResult = exportSheetsDxfV2(panels, {
    jobName,
    sheetW: Number(options?.sheetWidth) || 2440,
    sheetH: Number(options?.sheetHeight) || 1220,
    sheetMarginMm: Number(options?.margin) || 15,
    partGapMm: Number(options?.gap) || 8,
    camMode: true,
  });

  // 2. Find and parse toolpath plan from DXF result
  const toolpathOutput = dxfResult.outputs.find(o => o.filename.endsWith('_toolpath_plan.json'));
  if (!toolpathOutput) {
    throw new Error('Toolpath plan not generated - CAM mode may be disabled');
  }

  const toolpathPlan: ToolpathPlan = JSON.parse(toolpathOutput.content);

  // 3. Compile to G-code using KDT_MVP profile
  const compileResult = compileToolpathPlan(toolpathPlan, {
    profile: KDT_MVP_PROFILE,
  });

  if (!compileResult.ok) {
    throw new Error(`G-code compilation failed: ${compileResult.error}`);
  }

  // 4. Store outputs in CAS
  const outputs: ExportOutput[] = [];

  // Store G-code files
  for (const sheet of compileResult.sheets) {
    const hash = await cas.putBytes(sheet.content);
    outputs.push({
      filename: sheet.filename,
      sha256: hash,
      mime: 'text/plain',
      sizeBytes: Buffer.byteLength(sheet.content, 'utf-8'),
    });
  }

  // Also store the toolpath plan JSON for reference
  const planHash = await cas.putBytes(toolpathOutput.content);
  outputs.push({
    filename: toolpathOutput.filename,
    sha256: planHash,
    mime: 'application/json',
    sizeBytes: Buffer.byteLength(toolpathOutput.content, 'utf-8'),
  });

  // Store compile summary
  const summary = formatCompileSummary(compileResult);
  const summaryHash = await cas.putBytes(summary);
  outputs.push({
    filename: `${jobName}_gcode_summary.txt`,
    sha256: summaryHash,
    mime: 'text/plain',
    sizeBytes: Buffer.byteLength(summary, 'utf-8'),
  });

  // Log summary
  console.log(`[Processor] GCODE_KDT_MVP: ${compileResult.sheets.length} sheets compiled`);
  for (const sheet of compileResult.sheets) {
    console.log(`[Processor]   ${sheet.filename}: ${sheet.stats.totalDrills} drills, ${sheet.stats.totalProfiles} profiles`);
  }

  return outputs;
}
