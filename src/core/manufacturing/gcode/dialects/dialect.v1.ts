// src/core/manufacturing/gcode/dialects/dialect.v1.ts
/**
 * G-code Dialect Interface.
 *
 * Defines the contract for machine-specific G-code formatting.
 * Each dialect translates canonical IR to vendor-specific syntax.
 *
 * Key concepts:
 * - DialectCaps: Machine capabilities and formatting rules
 * - Dialect: Formatter interface with header/body/footer
 *
 * Supported dialects:
 * - KDT_ISO: KDT CNC (baseline ISO)
 * - BIESSE_ISO: Biesse CNC (ISO with semicolon comments)
 * - HOMAG_ISO: Homag CNC (ISO with line numbers)
 *
 * v0.10.7.1 - G-code Dialects
 */

import { IRProgram, IRMove } from "../ir/gcodeIr.v1";

// =============================================================================
// DIALECT ID
// =============================================================================

/**
 * Supported dialect identifiers.
 */
export type DialectId =
  | "KDT_ISO"
  | "BIESSE_ISO"
  | "HOMAG_ISO"
  | "GENERIC_ISO";

// =============================================================================
// CAPABILITIES
// =============================================================================

/**
 * Arc center mode.
 *
 * - IJ: Relative offsets from start to center (most common)
 * - R: Radius mode (less common, can be ambiguous)
 */
export type ArcMode = "IJ" | "R";

/**
 * Comment style.
 *
 * - PAREN: (comment text)
 * - SEMICOLON: ; comment text
 */
export type CommentStyle = "PAREN" | "SEMICOLON";

/**
 * Dialect capabilities.
 *
 * Defines what the machine controller supports.
 */
export interface DialectCaps {
  /** Arc center mode (IJ or R) */
  arcMode: ArcMode;

  /** Supports G0 rapid */
  supportsG0: boolean;

  /** Supports G1 linear */
  supportsG1: boolean;

  /** Supports G2/G3 arcs */
  supportsG2G3: boolean;

  /** Supports M6 tool change */
  supportsM6: boolean;

  /** Requires line numbers */
  needsLineNumbers: boolean;

  /** Line number start (if needed) */
  lineNumberStart?: number;

  /** Line number increment (if needed) */
  lineNumberStep?: number;

  /** Comment style */
  commentStyle: CommentStyle;

  /** Decimal formatting */
  decimal: {
    /** Maximum decimal places (deterministic) */
    maxPlaces: number;

    /** Strip trailing zeros */
    stripTrailingZeros?: boolean;
  };

  /** File extension (without dot) */
  fileExtension: string;

  /** Supports work coordinate systems (G54-G59) */
  supportsWorkCoords?: boolean;

  /** Supports canned cycles (G81, G82, etc.) */
  supportsCannedCycles?: boolean;

  /** Maximum feed rate (mm/min) */
  maxFeedRate?: number;

  /** Maximum spindle RPM */
  maxSpindleRpm?: number;
}

/**
 * Default capabilities (generic ISO).
 */
export const DEFAULT_DIALECT_CAPS: DialectCaps = {
  arcMode: "IJ",
  supportsG0: true,
  supportsG1: true,
  supportsG2G3: true,
  supportsM6: true,
  needsLineNumbers: false,
  commentStyle: "PAREN",
  decimal: {
    maxPlaces: 3,
    stripTrailingZeros: true,
  },
  fileExtension: "nc",
};

// =============================================================================
// DIALECT INTERFACE
// =============================================================================

/**
 * Dialect interface.
 *
 * Translates canonical IR to machine-specific G-code.
 */
export interface Dialect {
  /** Dialect identifier */
  id: DialectId;

  /** Display name */
  name: string;

  /** Dialect capabilities */
  caps: DialectCaps;

  /**
   * Generate program header lines.
   *
   * @param prog IR program
   * @returns Header lines (no line numbers)
   */
  header(prog: IRProgram): string[];

  /**
   * Format a single IR move.
   *
   * @param move IR move to format
   * @returns Formatted lines (may be multiple for tool change, etc.)
   */
  formatMove(move: IRMove): string[];

  /**
   * Generate program footer lines.
   *
   * @param prog IR program
   * @returns Footer lines (no line numbers)
   */
  footer(prog: IRProgram): string[];
}

// =============================================================================
// ISSUE CODES
// =============================================================================

/**
 * Dialect-related issue codes.
 */
export type DialectIssueCode =
  | "DIALECT_CAPABILITY_MISMATCH"   // IR requires feature dialect doesn't support
  | "DECIMAL_PRECISION_TOO_LOW"    // Decimal places < 3 may cause tolerance issues
  | "ARC_MODE_MISMATCH"            // IR uses IJ but dialect only supports R
  | "TOOL_CHANGE_NOT_SUPPORTED"    // M6 not supported
  | "LINE_NUMBER_CONFIG_MISSING";  // Line numbers needed but not configured

/**
 * Dialect issue.
 */
export interface DialectIssue {
  code: DialectIssueCode;
  severity: "BLOCK" | "WARN" | "INFO";
  message: string;
  data?: Record<string, unknown>;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate IR program against dialect capabilities.
 *
 * @param prog IR program
 * @param dialect Dialect to validate against
 * @returns Array of issues
 */
export function validateDialectCapability(
  prog: IRProgram,
  dialect: Dialect
): DialectIssue[] {
  const issues: DialectIssue[] = [];
  const caps = dialect.caps;

  // Check arc support
  const hasArcs = prog.moves.some(
    (m) => m.kind === "ARC_CW" || m.kind === "ARC_CCW"
  );
  if (hasArcs && !caps.supportsG2G3) {
    issues.push({
      code: "DIALECT_CAPABILITY_MISMATCH",
      severity: "BLOCK",
      message: `Dialect ${dialect.id} does not support G2/G3 arcs`,
      data: { feature: "G2G3", dialectId: dialect.id },
    });
  }

  // Check tool change support
  const hasToolChanges = prog.moves.some((m) => m.kind === "TOOL_CHANGE");
  if (hasToolChanges && !caps.supportsM6) {
    issues.push({
      code: "TOOL_CHANGE_NOT_SUPPORTED",
      severity: "BLOCK",
      message: `Dialect ${dialect.id} does not support M6 tool changes`,
      data: { dialectId: dialect.id },
    });
  }

  // Check line number config
  if (caps.needsLineNumbers) {
    if (caps.lineNumberStart === undefined || caps.lineNumberStep === undefined) {
      issues.push({
        code: "LINE_NUMBER_CONFIG_MISSING",
        severity: "BLOCK",
        message: `Dialect ${dialect.id} requires line numbers but config is missing`,
        data: {
          dialectId: dialect.id,
          lineNumberStart: caps.lineNumberStart,
          lineNumberStep: caps.lineNumberStep,
        },
      });
    }
  }

  // Check decimal precision
  if (caps.decimal.maxPlaces < 3) {
    issues.push({
      code: "DECIMAL_PRECISION_TOO_LOW",
      severity: "WARN",
      message: `Dialect ${dialect.id} uses ${caps.decimal.maxPlaces} decimal places - may cause tolerance issues`,
      data: {
        dialectId: dialect.id,
        maxPlaces: caps.decimal.maxPlaces,
        recommendedMinPlaces: 3,
      },
    });
  }

  return issues;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get file extension for dialect.
 */
export function getDialectFileExtension(dialect: Dialect): string {
  return dialect.caps.fileExtension;
}

/**
 * Check if dialect supports a specific feature.
 */
export function dialectSupports(
  dialect: Dialect,
  feature: "arcs" | "toolChange" | "workCoords" | "cannedCycles"
): boolean {
  switch (feature) {
    case "arcs":
      return dialect.caps.supportsG2G3;
    case "toolChange":
      return dialect.caps.supportsM6;
    case "workCoords":
      return dialect.caps.supportsWorkCoords ?? false;
    case "cannedCycles":
      return dialect.caps.supportsCannedCycles ?? false;
    default:
      return false;
  }
}
