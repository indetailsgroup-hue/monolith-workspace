/**
 * exportOptions.ts - P2.2a Export Options & Defaults
 *
 * Defines dialects, profiles, and default options for each export format.
 * Machine-specific presets for CNC integration.
 */

import type {
  ExportFormat,
  CsvDialect,
  DxfVersion,
  GcodeProfile,
  CutlistCsvOptions,
  DxfOptions,
  DxfPerPartOptions,
  GcodeOptions,
  BomJsonOptions,
  ExportOptionsResponse,
} from './exportTypes.js';

// ============================================================================
// Available Options
// ============================================================================

export const EXPORT_FORMATS: ExportFormat[] = [
  'CUTLIST_CSV',
  'DXF_R12',
  'DXF_R12_PER_PART',
  'GCODE',
  'BOM_JSON',
  'STEP',
  'PDF',
];

export const CSV_DIALECTS: CsvDialect[] = [
  'EXCEL',
  'RFC4180',
  'HOMAG',
  'BIESSE',
  'SCM',
];

export const DXF_VERSIONS: DxfVersion[] = ['R12', 'R14', '2000', '2007'];

export const GCODE_PROFILES: GcodeProfile[] = [
  'GRBL',
  'MACH3',
  'LINUXCNC',
  'FANUC',
  'HOMAG',
];

// ============================================================================
// Default Options
// ============================================================================

export const DEFAULT_CUTLIST_OPTIONS: CutlistCsvOptions = {
  dialect: 'EXCEL',
  includeEdgeBanding: true,
  includeGrain: true,
  groupByMaterial: true,
  unitSystem: 'METRIC',
};

export const DEFAULT_DXF_OPTIONS: DxfOptions = {
  version: 'R12',
  includeLabels: true,
  layerPerMaterial: true,
  explodeBlocks: false,
};

export const DEFAULT_DXF_PER_PART_OPTIONS: DxfPerPartOptions = {
  includeAnnotation: true,
  annotationHeight: 5,
  precision: 3,
};

export const DEFAULT_GCODE_OPTIONS: GcodeOptions = {
  profile: 'GRBL',
  safeZ: 5,
  feedRate: 3000,
  spindleSpeed: 18000,
  toolDiameter: 6,
  includeToolChange: true,
};

export const DEFAULT_BOM_OPTIONS: BomJsonOptions = {
  includeHardware: true,
  includePricing: false,
  groupByCategory: true,
};

// ============================================================================
// Dialect-specific CSV Configurations
// ============================================================================

export interface CsvDialectConfig {
  delimiter: string;
  quoteChar: string;
  lineEnding: string;
  bom: boolean;
  encoding: BufferEncoding;
}

export const CSV_DIALECT_CONFIGS: Record<CsvDialect, CsvDialectConfig> = {
  EXCEL: {
    delimiter: ',',
    quoteChar: '"',
    lineEnding: '\r\n',
    bom: true,
    encoding: 'utf-8',
  },
  RFC4180: {
    delimiter: ',',
    quoteChar: '"',
    lineEnding: '\r\n',
    bom: false,
    encoding: 'utf-8',
  },
  HOMAG: {
    delimiter: ';',
    quoteChar: '"',
    lineEnding: '\r\n',
    bom: false,
    encoding: 'utf-8',
  },
  BIESSE: {
    delimiter: ';',
    quoteChar: '"',
    lineEnding: '\r\n',
    bom: false,
    encoding: 'utf-8',
  },
  SCM: {
    delimiter: '\t',
    quoteChar: '"',
    lineEnding: '\r\n',
    bom: false,
    encoding: 'utf-8',
  },
};

// ============================================================================
// G-code Profile Configurations
// ============================================================================

export interface GcodeProfileConfig {
  lineEnding: string;
  coordinateFormat: 'ABSOLUTE' | 'INCREMENTAL';
  spindleCommand: string;
  spindleOffCommand: string;
  feedRateCommand: string;
  toolChangeCommand: string;
  programStart: string[];
  programEnd: string[];
  commentStyle: 'PAREN' | 'SEMICOLON';
}

export const GCODE_PROFILE_CONFIGS: Record<GcodeProfile, GcodeProfileConfig> = {
  GRBL: {
    lineEnding: '\n',
    coordinateFormat: 'ABSOLUTE',
    spindleCommand: 'M3 S',
    spindleOffCommand: 'M5',
    feedRateCommand: 'F',
    toolChangeCommand: 'M6 T',
    programStart: ['G21', 'G90', 'G17'],
    programEnd: ['M5', 'G0 Z5', 'M30'],
    commentStyle: 'PAREN',
  },
  MACH3: {
    lineEnding: '\r\n',
    coordinateFormat: 'ABSOLUTE',
    spindleCommand: 'M3 S',
    spindleOffCommand: 'M5',
    feedRateCommand: 'F',
    toolChangeCommand: 'M6 T',
    programStart: ['G21', 'G90', 'G40', 'G49', 'G80'],
    programEnd: ['M5', 'G0 Z5', 'M30'],
    commentStyle: 'PAREN',
  },
  LINUXCNC: {
    lineEnding: '\n',
    coordinateFormat: 'ABSOLUTE',
    spindleCommand: 'S',
    spindleOffCommand: 'M5',
    feedRateCommand: 'F',
    toolChangeCommand: 'T',
    programStart: ['G21', 'G90', 'G64 P0.05'],
    programEnd: ['M5', 'G0 Z5', 'M2'],
    commentStyle: 'SEMICOLON',
  },
  FANUC: {
    lineEnding: '\r\n',
    coordinateFormat: 'ABSOLUTE',
    spindleCommand: 'S',
    spindleOffCommand: 'M5',
    feedRateCommand: 'F',
    toolChangeCommand: 'T',
    programStart: ['O0001', 'G21', 'G90', 'G40', 'G80'],
    programEnd: ['M5', 'G91 G28 Z0', 'M30'],
    commentStyle: 'PAREN',
  },
  HOMAG: {
    lineEnding: '\r\n',
    coordinateFormat: 'ABSOLUTE',
    spindleCommand: 'M3 S',
    spindleOffCommand: 'M5',
    feedRateCommand: 'F',
    toolChangeCommand: 'T',
    programStart: ['%', 'G21', 'G90', 'G17'],
    programEnd: ['M5', 'G0 Z50', 'M30', '%'],
    commentStyle: 'PAREN',
  },
};

// ============================================================================
// API Response Builder
// ============================================================================

export function getExportOptionsResponse(): ExportOptionsResponse {
  return {
    formats: EXPORT_FORMATS,
    dialects: {
      csv: CSV_DIALECTS,
      dxf: DXF_VERSIONS,
      gcode: GCODE_PROFILES,
    },
    defaults: {
      csv: DEFAULT_CUTLIST_OPTIONS,
      dxf: DEFAULT_DXF_OPTIONS,
      gcode: DEFAULT_GCODE_OPTIONS,
    },
  };
}

// ============================================================================
// Option Merging Helpers
// ============================================================================

export function mergeCutlistOptions(
  partial?: Partial<CutlistCsvOptions>
): CutlistCsvOptions {
  return { ...DEFAULT_CUTLIST_OPTIONS, ...partial };
}

export function mergeDxfOptions(partial?: Partial<DxfOptions>): DxfOptions {
  return { ...DEFAULT_DXF_OPTIONS, ...partial };
}

export function mergeDxfPerPartOptions(
  partial?: Partial<DxfPerPartOptions>
): DxfPerPartOptions {
  return { ...DEFAULT_DXF_PER_PART_OPTIONS, ...partial };
}

export function mergeGcodeOptions(
  partial?: Partial<GcodeOptions>
): GcodeOptions {
  return { ...DEFAULT_GCODE_OPTIONS, ...partial };
}

export function mergeBomOptions(
  partial?: Partial<BomJsonOptions>
): BomJsonOptions {
  return { ...DEFAULT_BOM_OPTIONS, ...partial };
}
