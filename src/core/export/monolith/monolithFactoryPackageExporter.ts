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
import type { HeightStack } from '../../catalog';
import { DEFAULT_HEIGHT_STACK, assertBuildableHeightStack } from '../../catalog';
import type { ExportDestination, EmissionBearingMaterial } from '../../materials/FormaldehydeEmission';
import { assertEmissionCompliantForExport } from '../../materials/FormaldehydeEmission';
import { CORE_MATERIALS_CATALOG } from '../../materials/PanelMaterialSystem';

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

  /**
   * The height stack this package is cut against. Defaults to DEFAULT_HEIGHT_STACK.
   *
   * INJECTED RATHER THAN IMPORTED AT THE CALL SITE so a caller modelling a different
   * market — or a test exercising export mechanics — can supply its own, and so the
   * gate below has something real to check instead of reaching for a global.
   */
  heightStack?: HeightStack;

  /**
   * Where this packet is going, for the formaldehyde emission gate.
   *
   * DELIBERATELY HAS NO DEFAULT. A destination is a regulatory claim: stating one
   * asserts the packet was checked against that market's limits, and quietly defaulting
   * to (say) 'TH' would manufacture that assertion for every packet nobody thought about.
   * Omitted means UNDECLARED, and an undeclared packet is NOT emission-certified — see
   * the note in exportFactoryPackage.
   */
  exportDestination?: ExportDestination;
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
  const {
    contextProvider,
    profileId = 'DEFAULT',
    heightStack = DEFAULT_HEIGHT_STACK,
    exportDestination,
  } = config;
  const profile = getFactoryProfile(profileId);

  return {
    async exportFactoryPackage(args): Promise<FactoryPackageOutputFile[]> {
      const { jobId, headManifestHashHex } = args;

      // ── GATE 0: THE HEIGHT STACK MUST BE BUILDABLE ────────────────────────────────
      //
      // THIS IS THE INSTALL POINT for assertBuildableHeightStack, and it is placed
      // FIRST, before any file is planned or built. Its docstring has always claimed to
      // be "the gate for anything that would commit the configuration to a cut list, a
      // quote or a packet" — but until now it had zero production callers, so an
      // unbuildable stack reached a cut list unimpeded and the rejection existed only
      // inside its own unit test. A gate that is built and not installed is worse than
      // no gate, because a reader believes it is enforced.
      //
      // This function is the narrowest point every DXF sheet, cut-list row and report
      // in the MONOLITH packet passes through, which is why it goes here rather than in
      // each builder.
      //
      // EXPECT THIS TO THROW TODAY. The default Thai stack declares an 850mm counter and
      // the configured material stack builds 848.6mm, so DEFAULT_HEIGHT_STACK.buildable
      // is false (WORKTOP_BUILT_THICKNESS_OFF_TARGET). Blocking the packet is the
      // correct behaviour under the NO_CUT posture: cutting every carcass to a 70mm toe
      // kick for a kitchen that assembles 1.4mm short is precisely the declared-vs-built
      // defect this system exists to eliminate. The error names the three resolutions,
      // all of which need a human.
      assertBuildableHeightStack(heightStack, `factory package ${jobId}`);

      // 1. Get export context from MONOLITH runtime
      const context = await contextProvider.getExportContext({
        jobId,
        headManifestHashHex,
      });

      // ── GATE 1: FORMALDEHYDE EMISSION, WHEN A DESTINATION IS DECLARED ─────────────
      //
      // Runs only when the caller states where the packet is going. That is not a
      // loophole, it is the honest shape of the check: certifying a packet for a market
      // is a claim, and this code must not make that claim on a caller's behalf by
      // defaulting the destination. An UNDECLARED packet is therefore NOT
      // emission-certified, and must not be presented as if it were.
      //
      // KNOWN AND STATED: no material in CORE_MATERIALS_CATALOG or
      // SURFACE_MATERIALS_CATALOG currently carries a formaldehyde class, so declaring
      // ANY destination will block until supplier certificates are collected and
      // recorded. That is the correct outcome — an export packet for the EU, US or Japan
      // produced with no emission data is not compliant, and the previous state (gate
      // defined, never called) shipped exactly that with no check at all.
      if (exportDestination !== undefined) {
        // CORES ONLY, AND THAT IS A REAL LIMIT OF THE DATA MODEL, NOT A CHOICE MADE HERE.
        // `formaldehydeEmission` exists on CoreMaterial and NOT on SurfaceMaterial, so the
        // substrate board is the only thing this catalog can currently state a class for.
        // That matches where the emission physically comes from — the board and its glue
        // line — but it does mean an adhesive or a laminate carrying its own declarable
        // emission would go unchecked. Recorded rather than silently narrowed.
        //
        // Substrate is passed through because it is part of the published limit: a CARB P2
        // figure written for particleboard does not validate an MDF core. Mapped field by
        // field rather than spread, because CoreMaterial.type (substrate) and
        // SurfaceMaterial.type (finish) are different axes that happen to share a name.
        const materials: EmissionBearingMaterial[] = Object.values(CORE_MATERIALS_CATALOG)
          .filter((m) => context.materialIds.includes(m.id))
          .map((m) => ({
            id: m.id,
            name: m.name,
            formaldehydeEmission: m.formaldehydeEmission,
            substrate: m.type,
          }));

        // AN EMPTY MATERIAL SET MUST NOT PASS VACUOUSLY.
        //
        // `validateEmissionForExport([])` is trivially compliant — it found no material
        // that breaks a rule, because it was given no material at all. That is the
        // difference between "checked and clean" and "nothing was checked", and letting
        // the second wear the first's result is the same class of defect as a declared
        // gate with no callers. A packet referencing materials this catalog cannot
        // resolve has NOT been assessed, and the honest answer is to refuse.
        //
        // Caught by exportGates.test.ts, whose stub provider references 'MAT_001' — an id
        // in no catalog — and sailed through a US-destined export until this check existed.
        const unresolved = context.materialIds.filter((id) => !(id in CORE_MATERIALS_CATALOG));
        if (materials.length === 0 || unresolved.length > 0) {
          throw new Error(
            `Formaldehyde emission gate FAILED for destination ${exportDestination}: ` +
              `UNRESOLVED_MATERIAL. This packet references ` +
              `${context.materialIds.length} material id(s) ` +
              `(${context.materialIds.join(', ') || 'none'}) of which ` +
              `${unresolved.length} could not be resolved in CORE_MATERIALS_CATALOG ` +
              `(${unresolved.join(', ') || 'none'}). An emission class cannot be checked for a ` +
              `board this system cannot identify, and an unchecked packet must not be presented ` +
              `as a compliant one. Register the material in the catalog with its supplier ` +
              `certificate, or export without declaring a destination and do not claim ` +
              `${exportDestination} compliance for the result.`
          );
        }

        assertEmissionCompliantForExport(materials, exportDestination);
      }

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
 *
 * `heightStack` and `exportDestination` pass straight through, so the gates in
 * createMONOLITHFactoryPackageExporter are reachable from the convenience factories
 * too. Omitting them keeps the defaults: the shipped height stack (gated) and an
 * UNDECLARED destination (not emission-certified).
 */
export function createDefaultExporter(
  contextProvider: MONOLITHExportContextProvider,
  options: Pick<MONOLITHExporterConfig, 'heightStack' | 'exportDestination'> = {}
): FactoryPackageExporter {
  return createMONOLITHFactoryPackageExporter({
    contextProvider,
    profileId: 'DEFAULT',
    ...options,
  });
}

/**
 * Create exporter with KDT profile. See createDefaultExporter for the options.
 */
export function createKdtExporter(
  contextProvider: MONOLITHExportContextProvider,
  options: Pick<MONOLITHExporterConfig, 'heightStack' | 'exportDestination'> = {}
): FactoryPackageExporter {
  return createMONOLITHFactoryPackageExporter({
    contextProvider,
    profileId: 'KDT',
    ...options,
  });
}
