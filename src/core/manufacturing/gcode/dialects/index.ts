// src/core/manufacturing/gcode/dialects/index.ts
/**
 * G-code Dialects Module.
 *
 * Machine-specific G-code formatters.
 */

// Dialect interface
export type {
  DialectId,
  ArcMode,
  CommentStyle,
  DialectCaps,
  Dialect,
  DialectIssueCode,
  DialectIssue,
} from "./dialect.v1";

export {
  DEFAULT_DIALECT_CAPS,
  validateDialectCapability,
  getDialectFileExtension,
  dialectSupports,
} from "./dialect.v1";

// KDT ISO
export {
  KDT_ISO_CAPS,
  KdtIsoDialect,
  createKdtIsoDialect,
} from "./kdtIsoDialect";

// Biesse ISO
export {
  BIESSE_ISO_CAPS,
  BiesseIsoDialect,
  createBiesseIsoDialect,
} from "./biesseIsoDialect";

// Homag ISO
export {
  HOMAG_ISO_CAPS,
  HomagIsoDialect,
  createHomagIsoDialect,
} from "./homagIsoDialect";

// =============================================================================
// DIALECT REGISTRY
// =============================================================================

import { Dialect, DialectId } from "./dialect.v1";
import { KdtIsoDialect } from "./kdtIsoDialect";
import { BiesseIsoDialect } from "./biesseIsoDialect";
import { HomagIsoDialect } from "./homagIsoDialect";

/**
 * All available dialects.
 */
export const DIALECTS: Record<DialectId, Dialect> = {
  KDT_ISO: KdtIsoDialect,
  BIESSE_ISO: BiesseIsoDialect,
  HOMAG_ISO: HomagIsoDialect,
  GENERIC_ISO: KdtIsoDialect, // Use KDT as generic baseline
};

/**
 * Get dialect by ID.
 */
export function getDialect(id: DialectId): Dialect | undefined {
  return DIALECTS[id];
}

/**
 * List all dialect IDs.
 */
export function listDialectIds(): DialectId[] {
  return Object.keys(DIALECTS) as DialectId[];
}
