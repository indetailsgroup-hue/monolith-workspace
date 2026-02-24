/**
 * factoryPackageProfiles.ts - Factory Package Export Profiles
 *
 * ARCHITECTURE:
 * - Define export profiles for different factory systems
 * - Each profile specifies folder layout, naming, file formats
 * - Start with DEFAULT, extend to KDT/HOMAG/BIESSE later
 *
 * DETERMINISM:
 * - Naming patterns must be pure functions (no random, no timestamps)
 * - Output structure must be consistent across runs
 */

// ============================================
// PROFILE ID
// ============================================

/**
 * Factory profile identifier
 *
 * DEFAULT: Generic factory format
 * KDT: KDT factory format (future)
 * HOMAG: Homag factory format (future)
 * BIESSE: Biesse factory format (future)
 */
export type FactoryProfileId = 'DEFAULT' | 'KDT' | 'HOMAG' | 'BIESSE';

// ============================================
// PROFILE DEFINITION
// ============================================

/**
 * Factory package export profile
 *
 * Defines the output structure and naming conventions.
 */
export interface FactoryPackageProfile {
  /** Profile identifier */
  id: FactoryProfileId;

  // ---- Folder Layout ----
  /** DXF sheets folder (e.g., "sheets") */
  sheetFolder: string;

  /** Cut list folder (e.g., "cutlist") */
  cutListFolder: string;

  /** Report folder (e.g., "reports") */
  reportFolder: string;

  // ---- File Naming ----
  /**
   * Sheet filename pattern
   *
   * @param index1 - 1-based sheet index
   * @param label - Optional sheet label
   * @returns Filename with extension (e.g., "A01.dxf")
   */
  sheetNamePattern: (index1: number, label?: string) => string;

  /** Cut list filename (e.g., "cutlist.csv") */
  cutListFileName: string;

  /** Export report filename (e.g., "export-report.json") */
  reportFileName: string;

  // ---- Format Options ----
  /** DXF flavor/version */
  dxfFlavor: 'R12' | 'R14' | '2000' | '2004' | '2007';

  /** CSV delimiter */
  csvDelimiter: ',' | ';' | '\t';

  /** CSV encoding */
  csvEncoding: 'utf-8' | 'utf-16' | 'ascii';

  /** Include BOM in CSV */
  csvBom: boolean;
}

// ============================================
// HELPERS
// ============================================

/**
 * Sanitize label for use in filename
 *
 * - Trim whitespace
 * - Replace spaces with underscores
 * - Remove special characters
 * - Limit length
 */
function sanitizeLabel(s: string): string {
  return String(s)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .slice(0, 24);
}

/**
 * Create sheet filename with standard pattern
 *
 * @param prefix - Filename prefix (e.g., "A", "S")
 * @param index1 - 1-based index
 * @param label - Optional label
 * @param extension - File extension (e.g., "dxf")
 * @returns Filename (e.g., "A01-NEST_01.dxf")
 */
function makeSheetFilename(
  prefix: string,
  index1: number,
  label: string | undefined,
  extension: string
): string {
  const idx = String(index1).padStart(2, '0');
  const base = label ? `${prefix}${idx}-${sanitizeLabel(label)}` : `${prefix}${idx}`;
  return `${base}.${extension}`;
}

// ============================================
// DEFAULT PROFILE
// ============================================

/**
 * Default factory package profile
 *
 * Generic format suitable for most factories.
 */
export const DEFAULT_FACTORY_PROFILE: FactoryPackageProfile = {
  id: 'DEFAULT',

  // Folder layout
  sheetFolder: 'sheets',
  cutListFolder: 'cutlist',
  reportFolder: 'reports',

  // File naming
  sheetNamePattern: (index1, label) => makeSheetFilename('A', index1, label, 'dxf'),
  cutListFileName: 'cutlist.csv',
  reportFileName: 'export-report.json',

  // Format options
  dxfFlavor: 'R12',
  csvDelimiter: ',',
  csvEncoding: 'utf-8',
  csvBom: false,
};

// ============================================
// KDT PROFILE (future)
// ============================================

/**
 * KDT factory profile
 *
 * Optimized for KDT CNC machines.
 */
export const KDT_FACTORY_PROFILE: FactoryPackageProfile = {
  id: 'KDT',

  // KDT-specific folder layout
  sheetFolder: 'dxf',
  cutListFolder: 'csv',
  reportFolder: 'meta',

  // KDT naming conventions
  sheetNamePattern: (index1, label) => makeSheetFilename('S', index1, label, 'dxf'),
  cutListFileName: 'parts.csv',
  reportFileName: 'job-info.json',

  // KDT format preferences
  dxfFlavor: 'R12',
  csvDelimiter: ';',
  csvEncoding: 'utf-8',
  csvBom: true,
};

// ============================================
// PROFILE REGISTRY
// ============================================

/**
 * Get profile by ID
 *
 * @param id - Profile ID
 * @returns Profile or DEFAULT if not found
 */
export function getFactoryProfile(id: FactoryProfileId): FactoryPackageProfile {
  switch (id) {
    case 'KDT':
      return KDT_FACTORY_PROFILE;
    case 'HOMAG':
    case 'BIESSE':
      // Future: return specific profiles
      return DEFAULT_FACTORY_PROFILE;
    case 'DEFAULT':
    default:
      return DEFAULT_FACTORY_PROFILE;
  }
}

/**
 * List available profile IDs
 */
export function listFactoryProfileIds(): FactoryProfileId[] {
  return ['DEFAULT', 'KDT', 'HOMAG', 'BIESSE'];
}
