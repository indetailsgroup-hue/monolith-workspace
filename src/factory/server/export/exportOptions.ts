/**
 * Export Options - Available dialects, profiles, modes
 * P2.2 Export UX (Gated)
 *
 * @version 0.12.0
 */

import type {
  ExportDialect,
  ExportProfile,
  ExportOptionsResponse,
  ExportMode,
  ExportTarget,
} from "./exportTypes";

// ============================================================================
// Profiles by Dialect
// ============================================================================

export const EXPORT_PROFILES: ExportProfile[] = [
  // KDT Profiles
  {
    id: "kdt_mvp_v1",
    name: "KDT MVP",
    dialect: "KDT",
    description: "Standard KDT profile for MVP machines",
    enabled: true,
  },
  {
    id: "kdt_pro_v1",
    name: "KDT Pro",
    dialect: "KDT",
    description: "Advanced KDT profile with extended features",
    enabled: false, // Not yet available
  },

  // Biesse Profiles
  {
    id: "biesse_iso_v1",
    name: "Biesse ISO",
    dialect: "BIESSE",
    description: "Standard Biesse ISO G-code profile",
    enabled: true,
  },

  // Homag Profiles
  {
    id: "homag_iso_v1",
    name: "Homag ISO",
    dialect: "HOMAG",
    description: "Standard Homag ISO G-code profile",
    enabled: true,
  },
  {
    id: "homag_weeke_v1",
    name: "Homag Weeke",
    dialect: "HOMAG",
    description: "Homag Weeke-specific profile",
    enabled: false, // Not yet available
  },
];

// ============================================================================
// Dialect Metadata
// ============================================================================

export const DIALECT_METADATA: Record<ExportDialect, { name: string; description: string }> = {
  KDT: {
    name: "KDT",
    description: "KDT CNC machines (China)",
  },
  BIESSE: {
    name: "Biesse",
    description: "Biesse CNC machines (Italy)",
  },
  HOMAG: {
    name: "Homag",
    description: "Homag/Weeke CNC machines (Germany)",
  },
};

// ============================================================================
// Mode Metadata
// ============================================================================

export const MODE_METADATA: Record<ExportMode, { name: string; description: string }> = {
  PER_SHEET: {
    name: "Per Sheet",
    description: "Export each sheet as a separate file",
  },
  PER_JOB: {
    name: "Per Job",
    description: "Export all sheets in a single bundle",
  },
};

// ============================================================================
// Target Metadata
// ============================================================================

export const TARGET_METADATA: Record<ExportTarget, { name: string; description: string; enabled: boolean }> = {
  GCODE: {
    name: "G-Code",
    description: "CNC machine toolpath files (.nc)",
    enabled: true,
  },
  DXF: {
    name: "DXF",
    description: "CAD drawing files (.dxf)",
    enabled: false, // P2.3
  },
  BUNDLE: {
    name: "Full Bundle",
    description: "Complete package with G-code, manifest, and metadata",
    enabled: true,
  },
  MANIFEST: {
    name: "Manifest Only",
    description: "Signed manifest file only",
    enabled: true,
  },
};

// ============================================================================
// Get Export Options
// ============================================================================

/**
 * Get all available export options for the factory.
 */
export function getExportOptions(): ExportOptionsResponse {
  // Group profiles by dialect
  const dialects = (["KDT", "BIESSE", "HOMAG"] as ExportDialect[]).map((dialectId) => ({
    id: dialectId,
    name: DIALECT_METADATA[dialectId].name,
    profiles: EXPORT_PROFILES.filter((p) => p.dialect === dialectId && p.enabled),
  }));

  // Get modes
  const modes = (["PER_SHEET", "PER_JOB"] as ExportMode[]).map((modeId) => ({
    id: modeId,
    name: MODE_METADATA[modeId].name,
    description: MODE_METADATA[modeId].description,
  }));

  // Get targets
  const targets = (["GCODE", "DXF", "BUNDLE", "MANIFEST"] as ExportTarget[]).map((targetId) => ({
    id: targetId,
    name: TARGET_METADATA[targetId].name,
    description: TARGET_METADATA[targetId].description,
    enabled: TARGET_METADATA[targetId].enabled,
  }));

  return { dialects, modes, targets };
}

/**
 * Get profiles for a specific dialect.
 */
export function getProfilesForDialect(dialect: ExportDialect): ExportProfile[] {
  return EXPORT_PROFILES.filter((p) => p.dialect === dialect && p.enabled);
}

/**
 * Get profile by ID.
 */
export function getProfileById(profileId: string): ExportProfile | undefined {
  return EXPORT_PROFILES.find((p) => p.id === profileId);
}

/**
 * Validate dialect-profile combination.
 */
export function validateDialectProfile(
  dialect: ExportDialect,
  profileId: string
): { valid: boolean; error?: string } {
  const profile = getProfileById(profileId);

  if (!profile) {
    return { valid: false, error: `Profile '${profileId}' not found` };
  }

  if (profile.dialect !== dialect) {
    return {
      valid: false,
      error: `Profile '${profileId}' is for ${profile.dialect}, not ${dialect}`,
    };
  }

  if (!profile.enabled) {
    return { valid: false, error: `Profile '${profileId}' is not enabled` };
  }

  return { valid: true };
}
