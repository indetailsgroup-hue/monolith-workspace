/**
 * iimoExportContext.ts - IIMOS Export Context Types
 *
 * ARCHITECTURE:
 * - Define the context interface that IIMOS provides to exporters
 * - Context contains all resolved data needed for export
 * - Must be deterministic: same job state → same context
 *
 * INTEGRATION:
 * - Context provider extracts data from IIMOS runtime (cabinets, nesting, materials)
 * - Exporter uses context to build files
 */

// ============================================
// CUT LIST ROW
// ============================================

/**
 * Cut list row from Composite Material Logic (SPEC-08 v8.2)
 *
 * This represents one part with all dimensions calculated.
 */
export interface CutListRow {
  /** Part identifier (e.g., "SIDE_L", "TOP") */
  partId: string;

  /** Cabinet ID this part belongs to */
  cabinetId: string;

  /** Material ID */
  materialId: string;

  // ---- Finish Dimensions ----
  /** Finish width (W) in mm */
  finishW: number;

  /** Finish height (H) in mm */
  finishH: number;

  // ---- Edge Banding ----
  /** Edge band thickness Left (mm) */
  edgeL: number;

  /** Edge band thickness Right (mm) */
  edgeR: number;

  /** Edge band thickness Top (mm) */
  edgeT: number;

  /** Edge band thickness Bottom (mm) */
  edgeB: number;

  // ---- Premill (SPEC-08 v8.2) ----
  /** Premill amount Left (mm) */
  premillL: number;

  /** Premill amount Right (mm) */
  premillR: number;

  /** Premill amount Top (mm) */
  premillT: number;

  /** Premill amount Bottom (mm) */
  premillB: number;

  // ---- Cut Dimensions ----
  /** Cut width = Finish W - Edge L - Edge R + Premill L + Premill R */
  cutW: number;

  /** Cut height = Finish H - Edge T - Edge B + Premill T + Premill B */
  cutH: number;

  // ---- Metadata ----
  /** Quantity (usually 1 per row, but can group identical parts) */
  qty: number;

  /** Optional notes */
  note?: string;

  /** Grain direction */
  grain?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
}

// ============================================
// NESTING SHEET
// ============================================

/**
 * Nesting sheet from nesting algorithm
 *
 * Contains info about parts placed on this sheet.
 */
export interface NestingSheet {
  /** Sheet index (1-based) */
  index1: number;

  /** Sheet label (e.g., "NEST_01") */
  label?: string;

  /** Material ID */
  materialId: string;

  /** Sheet dimensions */
  sheetW: number;
  sheetH: number;
  sheetThickness: number;

  /** Placed parts */
  placements: Array<{
    partId: string;
    x: number;
    y: number;
    rotation: 0 | 90 | 180 | 270;
    cutW: number;
    cutH: number;
  }>;

  /** Utilization percentage */
  utilization: number;
}

// ============================================
// EXPORT CONTEXT
// ============================================

/**
 * Complete export context from IIMOS runtime
 *
 * This is the "resolved" state that exporters consume.
 * All dimensions are calculated, all parts are nested.
 */
export interface IIMOSExportContext {
  // ---- Job Info ----
  /** Job ID */
  jobId: string;

  /** Job name/title */
  jobName?: string;

  /** Customer name */
  customerName?: string;

  // ---- Materials ----
  /** Material IDs used in this job */
  materialIds: string[];

  /** Material info map */
  materials: Map<string, {
    id: string;
    name: string;
    thickness: number;
    type: 'BOARD' | 'PANEL' | 'OTHER';
  }>;

  // ---- Cut List ----
  /** All cut list rows (parts with calculated dimensions) */
  cutListRows: CutListRow[];

  // ---- Nesting ----
  /** Nesting sheets (DXF per sheet) */
  nestingSheets: NestingSheet[];

  // ---- Gate Summary ----
  /** Gate passed? */
  gateOk: boolean;

  /** Gate issue count */
  gateIssueCount: number;

  // ---- Counts ----
  /** Cabinet count */
  cabinetCount: number;

  /** Part count */
  partCount: number;

  // ---- Version ----
  /** Context version (for debugging/audit) */
  contextVersion: string;
}

// ============================================
// CONTEXT PROVIDER INTERFACE
// ============================================

/**
 * IIMOS export context provider
 *
 * Implementations extract context from IIMOS runtime.
 * The provider MUST return deterministic context.
 */
export interface IIMOSExportContextProvider {
  /**
   * Get export context for a job
   *
   * @param args.jobId - Job ID
   * @param args.headManifestHashHex - Current HEAD manifest hash
   * @returns Deterministic export context
   */
  getExportContext(args: {
    jobId: string;
    headManifestHashHex: string;
  }): Promise<IIMOSExportContext>;
}

// ============================================
// STUB CONTEXT PROVIDER (for testing)
// ============================================

/**
 * Create stub context provider for testing
 *
 * Returns minimal context to verify pipeline wiring.
 */
export function createStubContextProvider(): IIMOSExportContextProvider {
  return {
    getExportContext: async ({ jobId }) => ({
      jobId,
      jobName: `Test Job ${jobId}`,
      customerName: 'Test Customer',

      materialIds: ['MAT_001'],
      materials: new Map([
        ['MAT_001', { id: 'MAT_001', name: 'MDF 18mm', thickness: 18, type: 'BOARD' }],
      ]),

      cutListRows: [
        {
          partId: 'SIDE_L',
          cabinetId: 'CAB_001',
          materialId: 'MAT_001',
          finishW: 600,
          finishH: 720,
          edgeL: 1,
          edgeR: 1,
          edgeT: 0,
          edgeB: 0,
          premillL: 0.5,
          premillR: 0.5,
          premillT: 0,
          premillB: 0,
          cutW: 599,
          cutH: 720,
          qty: 1,
          grain: 'VERTICAL',
        },
        {
          partId: 'SIDE_R',
          cabinetId: 'CAB_001',
          materialId: 'MAT_001',
          finishW: 600,
          finishH: 720,
          edgeL: 1,
          edgeR: 1,
          edgeT: 0,
          edgeB: 0,
          premillL: 0.5,
          premillR: 0.5,
          premillT: 0,
          premillB: 0,
          cutW: 599,
          cutH: 720,
          qty: 1,
          grain: 'VERTICAL',
        },
      ],

      nestingSheets: [
        {
          index1: 1,
          label: 'NEST_01',
          materialId: 'MAT_001',
          sheetW: 2440,
          sheetH: 1220,
          sheetThickness: 18,
          placements: [
            { partId: 'SIDE_L', x: 10, y: 10, rotation: 0, cutW: 599, cutH: 720 },
            { partId: 'SIDE_R', x: 620, y: 10, rotation: 0, cutW: 599, cutH: 720 },
          ],
          utilization: 58.2,
        },
      ],

      gateOk: true,
      gateIssueCount: 0,
      cabinetCount: 1,
      partCount: 2,
      contextVersion: 'stub-1.0',
    }),
  };
}
