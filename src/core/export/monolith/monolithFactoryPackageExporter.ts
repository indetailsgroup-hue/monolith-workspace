/**
 * monolithFactoryPackageExporter.ts - MONOLITH Factory Package Exporter
 *
 * ARCHITECTURE:
 * - Implements FactoryPackageExporter interface
 * - Uses MONOLITHExportContextProvider to get resolved job data
 * - Uses builders to generate DXF, CSV, JSON files
 * - Returns files for ArtifactStore storage
 *
 * DETERMINISM:
 * - Same job state → same export files
 * - Planning phase determines structure
 * - Builders produce deterministic content
 *
 * INTEGRATION:
 * - Plug into TrustChainService via factoryExporter config
 * - Context provider extracts data from MONOLITH runtime
 */

import type {
  FactoryPackageExporter,
  FactoryPackageOutputFile,
} from '../factoryPackageExporter';
import type { FactoryPackageProfile, FactoryProfileId } from '../factoryPackageProfiles';
import { getFactoryProfile } from '../factoryPackageProfiles';
import { planFactoryPackage } from '../planFactoryPackage';
import type { MONOLITHExportContextProvider, MONOLITHExportContext } from './monolithExportContext';
import { buildDxfSheets } from './builders/buildDxfSheets';
import { buildCutListCsv } from './builders/buildCutListCsv';
import { buildExportReportJson } from './builders/buildExportReportJson';

// ============================================
// EXPORTER CONFIG
// ============================================

/**
 * MONOLITH Factory Package Exporter configuration
 */
export interface MONOLITHExporterConfig {
  /** Context provider (extracts data from MONOLITH runtime) */
  contextProvider: MONOLITHExportContextProvider;

  /** Factory profile ID (default: 'DEFAULT') */
  profileId?: FactoryProfileId;
}

// ============================================
// EXPORTER IMPLEMENTATION
// ============================================

/**
 * Create MONOLITH Factory Package Exporter
 *
 * This is the production exporter for MONOLITH.
 * It uses the context provider to get job data
 * and builders to generate export files.
 *
 * @param config - Exporter configuration
 * @returns FactoryPackageExporter implementation
 *
 * @example
 * ```ts
 * const exporter = createMONOLITHFactoryPackageExporter({
 *   contextProvider: myContextProvider,
 *   profileId: 'KDT',
 * });
 *
 * const files = await exporter.exportFactoryPackage({
 *   jobId: 'JOB_001',
 *   headManifestHashHex: 'abc123...',
 * });
 * ```
 */
export function createMONOLITHFactoryPackageExporter(
  config: MONOLITHExporterConfig
): FactoryPackageExporter {
  const { contextProvider, profileId = 'DEFAULT' } = config;
  const profile = getFactoryProfile(profileId);

  return {
    async exportFactoryPackage(args): Promise<FactoryPackageOutputFile[]> {
      const { jobId, headManifestHashHex } = args;

      // 1. Get export context from MONOLITH runtime
      const context = await contextProvider.getExportContext({
        jobId,
        headManifestHashHex,
      });

      // 2. Plan the export (deterministic)
      const plan = planFactoryPackage({
        profile,
        sheetLabels: context.nestingSheets.map((ns) => ({
          label: ns.label,
          partCount: ns.placements.length,
          materialId: ns.materialId,
        })),
        totalPartCount: context.partCount,
        materialIds: context.materialIds,
      });

      // 3. Build DXF sheets
      const dxfOutputs = buildDxfSheets({
        plannedSheets: plan.sheets,
        nestingSheets: context.nestingSheets,
        profile,
      });

      // 4. Build cut list CSV
      const csvOutput = buildCutListCsv({
        cutListRows: context.cutListRows,
        profile,
        jobId,
      });

      // 5. Build export report JSON
      const reportOutput = buildExportReportJson({
        context,
        plan,
        profile,
        sheetFilenames: dxfOutputs.map((d) => d.path.split('/').pop() ?? ''),
      });

      // 6. Assemble output files
      const outputFiles: FactoryPackageOutputFile[] = [];

      // Add DXF files
      for (const dxf of dxfOutputs) {
        outputFiles.push({
          path: dxf.path,
          mime: 'application/dxf',
          filename: dxf.path.split('/').pop() ?? 'sheet.dxf',
          bytes: dxf.bytes,
        });
      }

      // Add CSV file
      outputFiles.push({
        path: csvOutput.path,
        mime: 'text/csv',
        filename: csvOutput.path.split('/').pop() ?? 'cutlist.csv',
        bytes: csvOutput.bytes,
      });

      // Add report JSON
      outputFiles.push({
        path: reportOutput.path,
        mime: 'application/json',
        filename: reportOutput.path.split('/').pop() ?? 'report.json',
        bytes: reportOutput.bytes,
      });

      return outputFiles;
    },
  };
}

// ============================================
// CONTEXT PROVIDER FROM STORE
// ============================================

/**
 * Options for creating context provider from store
 */
export interface CreateContextProviderFromStoreOptions {
  /**
   * Get cabinets from store
   */
  getCabinets: () => Array<{
    id: string;
    // Add more cabinet properties as needed for parts generation
  }>;

  /**
   * Get nesting sheets from store/algorithm
   * If not provided, creates single sheet with all parts
   */
  getNestingSheets?: () => MONOLITHExportContext['nestingSheets'];

  /**
   * Get materials map
   */
  getMaterials?: () => MONOLITHExportContext['materials'];

  /**
   * Get gate status
   */
  getGateStatus?: () => { ok: boolean; issueCount: number };
}

/**
 * Create context provider from MONOLITH store
 *
 * This is a convenience function to create a context provider
 * from the MONOLITH cabinet store and related state.
 *
 * NOTE: This is a template. Real implementation should extract
 * parts from cabinets using the parametric calculation system.
 *
 * ## Nesting Integration (T027)
 *
 * ```typescript
 * import { getNestingSheetsForExport } from '@/core/store/useNestingStore';
 *
 * const provider = createContextProviderFromStore({
 *   getCabinets: () => useCabinetStore.getState().cabinets,
 *   getNestingSheets: getNestingSheetsForExport,
 * });
 * ```
 *
 * When `getNestingSheets` returns undefined/null, the fallback
 * single-sheet layout is used (lines below).
 *
 * @param options - Store access options
 * @returns Context provider
 */
export function createContextProviderFromStore(
  options: CreateContextProviderFromStoreOptions
): MONOLITHExportContextProvider {
  const { getCabinets, getNestingSheets, getMaterials, getGateStatus } = options;

  return {
    async getExportContext({ jobId }): Promise<MONOLITHExportContext> {
      const cabinets = getCabinets();

      // Get or create materials map
      const materials =
        getMaterials?.() ??
        new Map([
          ['MAT_DEFAULT', { id: 'MAT_DEFAULT', name: 'Default Material', thickness: 18, type: 'BOARD' as const }],
        ]);

      // Get gate status
      const gateStatus = getGateStatus?.() ?? { ok: true, issueCount: 0 };

      // Generate cut list rows from cabinets
      // NOTE: Real implementation should use parametric calculations
      const cutListRows: MONOLITHExportContext['cutListRows'] = [];

      // Placeholder: generate dummy rows for each cabinet
      // Real implementation extracts parts from cabinet parametric data
      for (const cabinet of cabinets) {
        // This is a placeholder - real implementation would iterate cabinet parts
        cutListRows.push({
          partId: `${cabinet.id}_SIDE_L`,
          cabinetId: cabinet.id,
          materialId: 'MAT_DEFAULT',
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
        });
      }

      // Get or create nesting sheets
      const nestingSheets =
        getNestingSheets?.() ??
        [
          {
            index1: 1,
            label: 'NEST_01',
            materialId: 'MAT_DEFAULT',
            // W is the SHORT edge and H the LONG edge — the convention used by
            // src/nesting (DEFAULT_NESTING_CONFIG, and every NestingSheet the
            // optimizer emits). These were previously 2440 x 1220, which is
            // that convention with the axes swapped and matches no board in
            // CORE_MATERIALS_CATALOG.
            sheetW: 1220,
            sheetH: 2440,
            sheetThickness: 18,
            placements: cutListRows.map((row, idx) => ({
              partId: row.partId,
              x: (idx % 3) * 620 + 10,
              y: Math.floor(idx / 3) * 740 + 10,
              rotation: 0 as const,
              cutW: row.cutW,
              cutH: row.cutH,
            })),
            utilization: 65.0,
          },
        ];

      return {
        jobId,
        jobName: `Job ${jobId}`,
        customerName: undefined,
        materialIds: [...materials.keys()],
        materials,
        cutListRows,
        nestingSheets,
        gateOk: gateStatus.ok,
        gateIssueCount: gateStatus.issueCount,
        cabinetCount: cabinets.length,
        partCount: cutListRows.reduce((sum, r) => sum + r.qty, 0),
        contextVersion: 'monolith-store-1.0',
      };
    },
  };
}

// ============================================
// PROFILE-SPECIFIC FACTORIES
// ============================================

/**
 * Create exporter with DEFAULT profile
 */
export function createDefaultExporter(
  contextProvider: MONOLITHExportContextProvider
): FactoryPackageExporter {
  return createMONOLITHFactoryPackageExporter({
    contextProvider,
    profileId: 'DEFAULT',
  });
}

/**
 * Create exporter with KDT profile
 */
export function createKdtExporter(
  contextProvider: MONOLITHExportContextProvider
): FactoryPackageExporter {
  return createMONOLITHFactoryPackageExporter({
    contextProvider,
    profileId: 'KDT',
  });
}
