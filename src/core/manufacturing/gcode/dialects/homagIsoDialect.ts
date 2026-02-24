// src/core/manufacturing/gcode/dialects/homagIsoDialect.ts
/**
 * Homag ISO Dialect.
 *
 * ISO G-code for Homag CNC routers.
 * Uses line numbers starting from 1 with step 1.
 *
 * Features:
 * - G21 mm units
 * - G90 absolute mode
 * - G54 work coordinate system
 * - G2/G3 with I/J arc centers
 * - M3/M5 spindle control
 * - M6 tool change
 * - Parentheses comments
 * - Line numbers (N1, N2, N3, ...)
 *
 * Note: Real Homag machines often use WoodWOP format,
 * but some controllers accept ISO G-code.
 *
 * v0.10.7.1 - G-code Dialects
 */

import { Dialect, DialectCaps } from "./dialect.v1";
import { IRProgram, IRMove } from "../ir/gcodeIr.v1";
import { fmt, fmtSpindle, fmtTool, fmtFeed } from "../format/num";

// =============================================================================
// CAPABILITIES
// =============================================================================

/**
 * Homag ISO capabilities.
 */
export const HOMAG_ISO_CAPS: DialectCaps = {
  arcMode: "IJ",
  supportsG0: true,
  supportsG1: true,
  supportsG2G3: true,
  supportsM6: true,
  needsLineNumbers: true,
  lineNumberStart: 1,
  lineNumberStep: 1,
  commentStyle: "PAREN",
  decimal: {
    maxPlaces: 3,
    stripTrailingZeros: true,
  },
  fileExtension: "nc",
  supportsWorkCoords: true,
  maxFeedRate: 25000,
  maxSpindleRpm: 24000,
};

// =============================================================================
// DIALECT IMPLEMENTATION
// =============================================================================

/**
 * Homag ISO Dialect implementation.
 */
export const HomagIsoDialect: Dialect = {
  id: "HOMAG_ISO",
  name: "Homag ISO",
  caps: HOMAG_ISO_CAPS,

  /**
   * Generate Homag ISO program header.
   */
  header(prog: IRProgram): string[] {
    return [
      "(MONOLITH Homag ISO)",
      `(JOB ${prog.jobId} SHEET ${prog.sheetId})`,
      `(GENERATED ${prog.audit.generatedAt})`,
      "G21",        // mm units
      "G90",        // absolute mode
      "G17",        // XY plane
      "G54",        // work coordinate system
      "G94",        // feed per minute
      "G40",        // cancel cutter comp
      "G80",        // cancel canned cycles
    ];
  },

  /**
   * Format a single IR move to Homag ISO G-code.
   */
  formatMove(m: IRMove): string[] {
    const p = this.caps.decimal.maxPlaces;

    switch (m.kind) {
      case "COMMENT":
        // Parentheses comment style, sanitize
        const text = m.text.replace(/[()]/g, "");
        return [`(${text})`];

      case "SET_UNITS":
        return ["G21"];

      case "SET_ABS":
        return ["G90"];

      case "SET_PLANE":
        return ["G17"];

      case "SPINDLE_ON": {
        const sCode = m.cw ? "M3" : "M4";
        return [`S${fmtSpindle(m.rpm)} ${sCode}`];
      }

      case "SPINDLE_OFF":
        return ["M5"];

      case "TOOL_CHANGE": {
        const lines: string[] = [];
        // Comment with tool info
        if (m.toolDiameterMm !== undefined) {
          lines.push(`(TOOL ${m.toolNumber} ${m.toolId} D${fmt(m.toolDiameterMm, 1)})`);
        } else {
          lines.push(`(TOOL ${m.toolNumber} ${m.toolId})`);
        }
        // Tool change command
        lines.push(`T${fmtTool(m.toolNumber)} M6`);
        return lines;
      }

      case "SET_FEED":
        return [`F${fmtFeed(m.feed)}`];

      case "RAPID": {
        const parts = ["G0"];
        if (m.x !== undefined) parts.push(`X${fmt(m.x, p)}`);
        if (m.y !== undefined) parts.push(`Y${fmt(m.y, p)}`);
        if (m.z !== undefined) parts.push(`Z${fmt(m.z, p)}`);
        return [parts.join(" ")];
      }

      case "LINEAR": {
        const parts = ["G1"];
        if (m.x !== undefined) parts.push(`X${fmt(m.x, p)}`);
        if (m.y !== undefined) parts.push(`Y${fmt(m.y, p)}`);
        if (m.z !== undefined) parts.push(`Z${fmt(m.z, p)}`);
        if (m.feed !== undefined) parts.push(`F${fmtFeed(m.feed)}`);
        return [parts.join(" ")];
      }

      case "ARC_CW": {
        const parts = [
          "G2",
          `X${fmt(m.x, p)}`,
          `Y${fmt(m.y, p)}`,
          `I${fmt(m.i, p)}`,
          `J${fmt(m.j, p)}`,
        ];
        if (m.feed !== undefined) parts.push(`F${fmtFeed(m.feed)}`);
        return [parts.join(" ")];
      }

      case "ARC_CCW": {
        const parts = [
          "G3",
          `X${fmt(m.x, p)}`,
          `Y${fmt(m.y, p)}`,
          `I${fmt(m.i, p)}`,
          `J${fmt(m.j, p)}`,
        ];
        if (m.feed !== undefined) parts.push(`F${fmtFeed(m.feed)}`);
        return [parts.join(" ")];
      }

      case "DWELL": {
        const seconds = m.ms / 1000;
        return [`G4 P${fmt(seconds, 3)}`];
      }

      case "COOLANT_ON":
        return [m.type === "MIST" ? "M7" : "M8"];

      case "COOLANT_OFF":
        return ["M9"];

      case "PROGRAM_END":
        return ["M30"];

      default:
        return [];
    }
  },

  /**
   * Generate Homag ISO program footer.
   */
  footer(prog: IRProgram): string[] {
    return [
      "(END OF PROGRAM)",
      "M5",           // Spindle off
      "M9",           // Coolant off
      "G0 Z25",       // Safe retract
      "M30",          // Program end
    ];
  },
};

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create Homag ISO dialect with custom options.
 */
export function createHomagIsoDialect(
  options?: Partial<DialectCaps>
): Dialect {
  return {
    ...HomagIsoDialect,
    caps: {
      ...HOMAG_ISO_CAPS,
      ...options,
    },
  };
}
