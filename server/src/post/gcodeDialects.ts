/**
 * G-Code Dialects (Post-Processor Layer)
 *
 * Step 10.7.1: Convert MotionPlanV1 to G-code for different CNC machine dialects.
 *
 * This module provides:
 * - Dialect interface (single contract for G-code generation)
 * - Base ISO dialect with shared behavior
 * - Concrete dialects: KDT, Biesse, Homag (ISO-like)
 * - Main emitter with arc I,J computation and Z-constant enforcement
 * - Post hooks for header/footer customization
 * - Deterministic numeric formatting
 *
 * Key concepts:
 * - Dialect: Interface for machine-specific G-code generation
 * - PostContext: Machine configuration (units, tool table, formatting)
 * - PostResult: Output with gcode string, fingerprint, report
 * - emitGcode: Main function to convert MotionPlanV1 → G-code
 *
 * Reality check:
 * - KDT: ISO G-code usually works directly
 * - Biesse/Homag: Often use CIX/MPR formats in real factories
 *   This module provides ISO-like baseline; specialized formats in 10.7.2+
 *
 * All output is deterministic with stable fingerprints for Gate audit.
 */

import type {
  XYZ,
  XY,
  Motion,
  MotionBlock,
  MotionPlanV1,
} from './offsetKernel/zAwarePlanning.js';

// ============================================================================
// Types: Dialect System
// ============================================================================

/**
 * Supported dialect identifiers.
 */
export type DialectId = 'KDT_ISO' | 'BIESSE_ISO' | 'HOMAG_ISO' | 'GENERIC_ISO';

/**
 * Post-processor context with machine configuration.
 */
export interface PostContext {
  /** Unit system (always MM for this kernel) */
  units: 'MM';
  /** Absolute positioning mode (G90) */
  absMode: boolean;
  /** Working plane (G17 = XY) */
  plane: 'XY';
  /** Arc mode: IJ = incremental center offsets */
  arcMode: 'IJ';
  /** Feed mode: G94 = feed per minute */
  feedMode: 'G94';

  /** Safe clearance Z height (mm) */
  safeZ: number;
  /** Rapid travel Z height (mm) */
  rapidZ: number;

  /** Get tool number from tool ID */
  toolNumberOf: (toolId: string) => number;
  /** Get spindle RPM from tool ID */
  spindleRpmOf: (toolId: string) => number;

  /** Decimal places for X, Y, Z coordinates */
  decimalsXYZ: number;
  /** Decimal places for I, J arc offsets */
  decimalsIJ: number;
  /** Decimal places for feed rate */
  decimalsF: number;

  /** Program name/number (optional) */
  programName?: string;
  /** Program comment (optional) */
  programComment?: string;
}

/**
 * Report item for post-processing.
 */
export interface PostReportItem {
  /** Issue code */
  code: string;
  /** Human-readable detail */
  detail: string;
  /** Stable fingerprint */
  fingerprint: string;
  /** Severity level */
  severity: 'INFO' | 'WARN' | 'BLOCK';
}

/**
 * Result of post-processing.
 */
export interface PostResult {
  /** Complete G-code program */
  gcode: string;
  /** Number of lines */
  lineCount: number;
  /** Stable fingerprint for audit */
  fingerprint: string;
  /** Processing report */
  report: PostReportItem[];
  /** Whether post succeeded */
  valid: boolean;
}

/**
 * Dialect interface for machine-specific G-code generation.
 */
export interface Dialect {
  /** Dialect identifier */
  id: DialectId;

  /** Generate program header */
  header(ctx: PostContext): string[];

  /** Generate program footer */
  footer(ctx: PostContext): string[];

  /** Generate tool change commands */
  toolChange(toolId: string, ctx: PostContext): string[];

  /** Generate spindle on/off commands */
  spindle(on: boolean, toolId: string, ctx: PostContext): string[];

  /** Generate rapid move (G0) */
  rapid(to: XYZ, ctx: PostContext): string[];

  /** Generate feed move (G1) */
  feed(to: XYZ, feed: number, ctx: PostContext): string[];

  /** Generate arc move (G2/G3) with I,J offsets */
  arcWithIJ(
    cw: boolean,
    to: XYZ,
    i: number,
    j: number,
    feed: number,
    ctx: PostContext
  ): string[];

  /** Generate comment */
  comment(text: string, ctx: PostContext): string[];

  /** Generate dwell (G4) */
  dwell(ms: number, ctx: PostContext): string[];
}

/**
 * Post hooks for customization.
 */
export interface PostHooks {
  /** Lines to add before header */
  preHeader?: string[];
  /** Lines to add after header */
  postHeader?: string[];
  /** Lines to add before footer */
  preFooter?: string[];
  /** Lines to add after footer */
  postFooter?: string[];
  /** Coolant/vacuum on commands */
  coolantOn?: string[];
  /** Coolant/vacuum off commands */
  coolantOff?: string[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default post context values.
 */
export const DEFAULT_POST_CONTEXT: Omit<PostContext, 'toolNumberOf' | 'spindleRpmOf'> = {
  units: 'MM',
  absMode: true,
  plane: 'XY',
  arcMode: 'IJ',
  feedMode: 'G94',
  safeZ: 15,
  rapidZ: 5,
  decimalsXYZ: 3,
  decimalsIJ: 3,
  decimalsF: 0,
};

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format number with fixed decimals (deterministic).
 * Avoids -0.000 output.
 */
function fmt(n: number, decimals: number): string {
  const threshold = 0.5 * Math.pow(10, -decimals);
  const value = Math.abs(n) < threshold ? 0 : n;
  return value.toFixed(decimals);
}

/**
 * Format feed rate (rounded to integer by default).
 */
function fmtF(f: number, decimals: number): string {
  return Math.round(f).toFixed(decimals);
}

/**
 * Compute I,J offsets from current position to arc center.
 */
function ijFromCenter(
  from: XYZ,
  center: XY
): { i: number; j: number } {
  return {
    i: center.x - from.x,
    j: center.y - from.y,
  };
}

/**
 * Sanitize text for G-code comment (remove parentheses).
 */
function sanitizeComment(text: string): string {
  return text.replace(/[()]/g, '|');
}

// ============================================================================
// Base ISO Dialect
// ============================================================================

/**
 * Base ISO dialect with shared G-code behavior.
 * Concrete dialects extend this and override specific methods.
 */
export class BaseIsoDialect implements Dialect {
  id: DialectId = 'GENERIC_ISO';

  header(ctx: PostContext): string[] {
    const lines: string[] = [];

    // Program start marker
    lines.push('%');

    // Program number/name if provided
    if (ctx.programName) {
      lines.push(`O${ctx.programName}`);
    }

    // Comment if provided
    if (ctx.programComment) {
      lines.push(`(${sanitizeComment(ctx.programComment)})`);
    }

    // Setup codes
    lines.push('G21'); // Metric (mm)
    lines.push('G90'); // Absolute positioning
    lines.push('G17'); // XY plane for arcs
    lines.push('G94'); // Feed per minute
    lines.push('G40'); // Cancel cutter compensation
    lines.push('G49'); // Cancel tool length compensation
    lines.push('G80'); // Cancel canned cycles

    return lines;
  }

  footer(ctx: PostContext): string[] {
    return [
      'M5', // Spindle stop
      `G0 Z${fmt(ctx.safeZ, ctx.decimalsXYZ)}`, // Retract to safe Z
      'M30', // Program end and rewind
      '%', // Program end marker
    ];
  }

  toolChange(toolId: string, ctx: PostContext): string[] {
    const toolNum = ctx.toolNumberOf(toolId);
    return [`T${toolNum} M6`];
  }

  spindle(on: boolean, toolId: string, ctx: PostContext): string[] {
    if (!on) {
      return ['M5'];
    }
    const rpm = ctx.spindleRpmOf(toolId);
    return [`S${Math.round(rpm)} M3`]; // CW spindle
  }

  rapid(to: XYZ, ctx: PostContext): string[] {
    return [
      `G0 X${fmt(to.x, ctx.decimalsXYZ)} Y${fmt(to.y, ctx.decimalsXYZ)} Z${fmt(to.z, ctx.decimalsXYZ)}`,
    ];
  }

  feed(to: XYZ, feed: number, ctx: PostContext): string[] {
    return [
      `G1 X${fmt(to.x, ctx.decimalsXYZ)} Y${fmt(to.y, ctx.decimalsXYZ)} Z${fmt(to.z, ctx.decimalsXYZ)} F${fmtF(feed, ctx.decimalsF)}`,
    ];
  }

  arcWithIJ(
    cw: boolean,
    to: XYZ,
    i: number,
    j: number,
    feed: number,
    ctx: PostContext
  ): string[] {
    const g = cw ? 'G2' : 'G3';
    return [
      `${g} X${fmt(to.x, ctx.decimalsXYZ)} Y${fmt(to.y, ctx.decimalsXYZ)} I${fmt(i, ctx.decimalsIJ)} J${fmt(j, ctx.decimalsIJ)} F${fmtF(feed, ctx.decimalsF)}`,
    ];
  }

  comment(text: string, ctx: PostContext): string[] {
    return [`(${sanitizeComment(text)})`];
  }

  dwell(ms: number, ctx: PostContext): string[] {
    // G4 P in seconds (3 decimal places)
    const seconds = ms / 1000;
    return [`G4 P${seconds.toFixed(3)}`];
  }
}

// ============================================================================
// KDT ISO Dialect
// ============================================================================

/**
 * KDT ISO dialect (generic ISO baseline).
 * Most KDT machines accept standard ISO G-code.
 */
export class KdtIsoDialect extends BaseIsoDialect {
  id: DialectId = 'KDT_ISO';

  header(ctx: PostContext): string[] {
    return [
      ...super.header(ctx),
      '(KDT ISO POST)',
      '(Generated by MONOLITH Offset Kernel 10.7.1)',
    ];
  }
}

// ============================================================================
// Biesse ISO Dialect
// ============================================================================

/**
 * Biesse ISO-like dialect.
 *
 * Note: Real Biesse machines often use CIX format.
 * This provides ISO-like baseline for compatible controllers.
 *
 * Differences from base ISO:
 * - Tool change: T and M6 on separate lines
 * - Spindle: S and M3 on separate lines
 */
export class BiesseIsoDialect extends BaseIsoDialect {
  id: DialectId = 'BIESSE_ISO';

  header(ctx: PostContext): string[] {
    return [
      ...super.header(ctx),
      '(BIESSE ISO-LIKE POST)',
      '(Generated by MONOLITH Offset Kernel 10.7.1)',
      '(Note: Real Biesse may require CIX format)',
    ];
  }

  toolChange(toolId: string, ctx: PostContext): string[] {
    const toolNum = ctx.toolNumberOf(toolId);
    return [`T${toolNum}`, 'M6'];
  }

  spindle(on: boolean, toolId: string, ctx: PostContext): string[] {
    if (!on) {
      return ['M5'];
    }
    const rpm = ctx.spindleRpmOf(toolId);
    return [`S${Math.round(rpm)}`, 'M3'];
  }
}

// ============================================================================
// Homag ISO Dialect
// ============================================================================

/**
 * Homag ISO-like dialect.
 *
 * Note: Real Homag machines often use WoodWOP/MPR format.
 * This provides ISO-like baseline for compatible controllers.
 */
export class HomagIsoDialect extends BaseIsoDialect {
  id: DialectId = 'HOMAG_ISO';

  header(ctx: PostContext): string[] {
    return [
      ...super.header(ctx),
      '(HOMAG ISO-LIKE POST)',
      '(Generated by MONOLITH Offset Kernel 10.7.1)',
      '(Note: Real Homag may require MPR/WoodWOP format)',
    ];
  }

  footer(ctx: PostContext): string[] {
    // Homag may need additional safety moves
    return [
      'M5', // Spindle stop
      `G0 Z${fmt(ctx.safeZ, ctx.decimalsXYZ)}`, // Retract to safe Z
      'G0 X0 Y0', // Return to origin (optional for Homag)
      'M30',
      '%',
    ];
  }
}

// ============================================================================
// Dialect Registry
// ============================================================================

/**
 * Get dialect by ID.
 */
export function getDialect(id: DialectId): Dialect {
  switch (id) {
    case 'KDT_ISO':
      return new KdtIsoDialect();
    case 'BIESSE_ISO':
      return new BiesseIsoDialect();
    case 'HOMAG_ISO':
      return new HomagIsoDialect();
    case 'GENERIC_ISO':
    default:
      return new BaseIsoDialect();
  }
}

/**
 * List all available dialect IDs.
 */
export function listDialects(): DialectId[] {
  return ['GENERIC_ISO', 'KDT_ISO', 'BIESSE_ISO', 'HOMAG_ISO'];
}

// ============================================================================
// Post Hooks Wrapper
// ============================================================================

/**
 * Wrap a dialect with custom hooks.
 */
export function wrapDialectWithHooks(
  dialect: Dialect,
  hooks: PostHooks
): Dialect {
  return {
    ...dialect,
    id: dialect.id,

    header(ctx: PostContext): string[] {
      return [
        ...(hooks.preHeader ?? []),
        ...dialect.header(ctx),
        ...(hooks.postHeader ?? []),
      ];
    },

    footer(ctx: PostContext): string[] {
      return [
        ...(hooks.preFooter ?? []),
        ...dialect.footer(ctx),
        ...(hooks.postFooter ?? []),
      ];
    },

    toolChange(toolId: string, ctx: PostContext): string[] {
      return dialect.toolChange(toolId, ctx);
    },

    spindle(on: boolean, toolId: string, ctx: PostContext): string[] {
      const lines = dialect.spindle(on, toolId, ctx);
      if (on && hooks.coolantOn) {
        return [...lines, ...hooks.coolantOn];
      }
      if (!on && hooks.coolantOff) {
        return [...hooks.coolantOff, ...lines];
      }
      return lines;
    },

    rapid: dialect.rapid.bind(dialect),
    feed: dialect.feed.bind(dialect),
    arcWithIJ: dialect.arcWithIJ.bind(dialect),
    comment: dialect.comment.bind(dialect),
    dwell: dialect.dwell.bind(dialect),
  };
}

// ============================================================================
// Main Emitter
// ============================================================================

/**
 * Emit G-code from MotionPlanV1.
 *
 * Handles:
 * - Tool changes and spindle control
 * - Arc I,J computation from current position
 * - Z-constant enforcement for arcs (router safety)
 * - Deterministic output
 *
 * @param plan - Motion plan from 10.6.8
 * @param dialect - Target dialect
 * @param ctx - Post context with machine configuration
 * @returns Post result with G-code and report
 */
export function emitGcode(
  plan: MotionPlanV1,
  dialect: Dialect,
  ctx: PostContext
): PostResult {
  const lines: string[] = [];
  const report: PostReportItem[] = [];
  const valid = true;

  // Current position tracking
  let cur: XYZ = { x: 0, y: 0, z: ctx.safeZ };

  // Active tool and spindle state
  let activeTool: string | null = null;
  let spindleOn = false;

  // Helper to push lines
  function push(ls: string[]): void {
    for (const l of ls) {
      lines.push(l);
    }
  }

  // Emit header
  push(dialect.header(ctx));

  // Initial safe position
  push(dialect.rapid({ x: 0, y: 0, z: ctx.safeZ }, ctx));

  // Process each block
  for (const block of plan.blocks) {
    // Tool change if needed
    if (activeTool !== block.toolId) {
      // Stop spindle before tool change
      if (spindleOn && activeTool !== null) {
        push(dialect.spindle(false, activeTool, ctx));
        spindleOn = false;
      }

      // Retract to safe Z before tool change
      if (cur.z < ctx.safeZ - 0.001) {
        push(dialect.rapid({ x: cur.x, y: cur.y, z: ctx.safeZ }, ctx));
        cur = { ...cur, z: ctx.safeZ };
      }

      // Tool change
      push(dialect.toolChange(block.toolId, ctx));
      activeTool = block.toolId;

      // Start spindle
      push(dialect.spindle(true, block.toolId, ctx));
      spindleOn = true;

      report.push({
        code: 'TOOL_CHANGE',
        detail: `Tool=${block.toolId}`,
        fingerprint: `10.7.1:TC:${block.toolId}`,
        severity: 'INFO',
      });
    }

    // Block start comment
    push(dialect.comment(`BLOCK ${block.id}`, ctx));

    // Process motions in block
    for (let i = 0; i < block.ops.length; i++) {
      const m = block.ops[i];

      switch (m.kind) {
        case 'COMMENT':
          push(dialect.comment(m.text, ctx));
          break;

        case 'TOOL_CHANGE':
          // Handle inline tool change (unusual but supported)
          if (spindleOn) {
            push(dialect.spindle(false, activeTool ?? m.toolId, ctx));
            spindleOn = false;
          }
          push(dialect.toolChange(m.toolId, ctx));
          activeTool = m.toolId;
          break;

        case 'SPINDLE':
          push(dialect.spindle(m.on, activeTool ?? block.toolId, ctx));
          spindleOn = m.on;
          break;

        case 'RAPID':
          push(dialect.rapid(m.to, ctx));
          cur = m.to;
          break;

        case 'FEED':
          push(dialect.feed(m.to, m.feedMMmin, ctx));
          cur = m.to;
          break;

        case 'ARC': {
          // Enforce Z-constant during arc (router safety)
          const zDiff = Math.abs(m.to.z - cur.z);
          if (zDiff > 0.001) {
            report.push({
              code: 'ARC_Z_VIOLATION',
              detail: `Arc Z change ${zDiff.toFixed(3)}mm in block ${block.id} op ${i}; splitting into feed+arc`,
              fingerprint: `10.7.1:ARCZ:${block.id}:${i}`,
              severity: 'WARN',
            });

            // Split: feed to target Z first, then arc at constant Z
            push(dialect.feed({ x: cur.x, y: cur.y, z: m.to.z }, m.feedMMmin, ctx));
            cur = { x: cur.x, y: cur.y, z: m.to.z };
          }

          // Compute I,J from current position to arc center
          const ij = ijFromCenter(cur, m.centerXY);

          // Emit arc
          push(dialect.arcWithIJ(m.cw, m.to, ij.i, ij.j, m.feedMMmin, ctx));
          cur = m.to;
          break;
        }

        case 'DWELL':
          push(dialect.dwell(m.ms, ctx));
          break;

        default:
          // Exhaustive check - should never reach here
          push(dialect.comment(`UNSUPPORTED: ${JSON.stringify(m)}`, ctx));
          report.push({
            code: 'UNSUPPORTED_MOTION',
            detail: `Unknown motion kind in block ${block.id}`,
            fingerprint: `10.7.1:UNSUP:${block.id}:${i}`,
            severity: 'WARN',
          });
      }
    }

    // Optional: retract at end of block for safety
    if (cur.z < ctx.rapidZ - 0.001) {
      push(dialect.rapid({ x: cur.x, y: cur.y, z: ctx.rapidZ }, ctx));
      cur = { ...cur, z: ctx.rapidZ };
    }
  }

  // Stop spindle at end
  if (spindleOn && activeTool !== null) {
    push(dialect.spindle(false, activeTool, ctx));
    spindleOn = false;
  }

  // Emit footer
  push(dialect.footer(ctx));

  // Build fingerprint (non-cryptographic summary)
  const toolOrder = plan.blocks.map((b) => b.toolId).join(',');
  const fingerprint = `10.7.1:${dialect.id}:${lines.length}:${toolOrder}`;

  report.push({
    code: 'POST_COMPLETE',
    detail: `Dialect=${dialect.id} lines=${lines.length} blocks=${plan.blocks.length}`,
    fingerprint,
    severity: 'INFO',
  });

  return {
    gcode: lines.join('\n'),
    lineCount: lines.length,
    fingerprint,
    report,
    valid,
  };
}

// ============================================================================
// Context Factory
// ============================================================================

/**
 * Create a post context with tool table.
 */
export function createPostContext(
  toolTable: Record<string, { number: number; rpm: number }>,
  overrides: Partial<Omit<PostContext, 'toolNumberOf' | 'spindleRpmOf'>> = {}
): PostContext {
  return {
    ...DEFAULT_POST_CONTEXT,
    ...overrides,
    toolNumberOf: (toolId: string) => toolTable[toolId]?.number ?? 1,
    spindleRpmOf: (toolId: string) => toolTable[toolId]?.rpm ?? 18000,
  };
}

/**
 * Create a simple tool table from tool IDs.
 */
export function createSimpleToolTable(
  toolIds: string[],
  defaultRpm: number = 18000
): Record<string, { number: number; rpm: number }> {
  const table: Record<string, { number: number; rpm: number }> = {};
  toolIds.forEach((id, index) => {
    table[id] = { number: index + 1, rpm: defaultRpm };
  });
  return table;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate G-code output for common issues.
 */
export function validateGcode(gcode: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const lines = gcode.split('\n');

  let hasG21 = false;
  let hasG90 = false;
  let hasM30 = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('G21')) hasG21 = true;
    if (line.startsWith('G90')) hasG90 = true;
    if (line.startsWith('M30')) hasM30 = true;

    // Check for common issues
    if (line.includes('NaN')) {
      issues.push(`Line ${i + 1}: Contains NaN value`);
    }
    if (line.includes('undefined')) {
      issues.push(`Line ${i + 1}: Contains undefined value`);
    }
    if (line.includes('Infinity')) {
      issues.push(`Line ${i + 1}: Contains Infinity value`);
    }
  }

  if (!hasG21) {
    issues.push('Missing G21 (metric mode)');
  }
  if (!hasG90) {
    issues.push('Missing G90 (absolute mode)');
  }
  if (!hasM30) {
    issues.push('Missing M30 (program end)');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Count G-code lines by type.
 */
export function countGcodeLines(gcode: string): Record<string, number> {
  const counts: Record<string, number> = {
    G0: 0,
    G1: 0,
    G2: 0,
    G3: 0,
    G4: 0,
    M3: 0,
    M5: 0,
    M6: 0,
    T: 0,
    comment: 0,
    other: 0,
  };

  const lines = gcode.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('(')) {
      counts.comment++;
    } else if (trimmed.startsWith('G0 ') || trimmed === 'G0') {
      counts.G0++;
    } else if (trimmed.startsWith('G1 ')) {
      counts.G1++;
    } else if (trimmed.startsWith('G2 ')) {
      counts.G2++;
    } else if (trimmed.startsWith('G3 ')) {
      counts.G3++;
    } else if (trimmed.startsWith('G4 ')) {
      counts.G4++;
    } else if (trimmed.includes('M3')) {
      counts.M3++;
    } else if (trimmed.includes('M5')) {
      counts.M5++;
    } else if (trimmed.includes('M6')) {
      counts.M6++;
    } else if (trimmed.startsWith('T')) {
      counts.T++;
    } else if (trimmed.length > 0) {
      counts.other++;
    }
  }

  return counts;
}

/**
 * Extract tool changes from G-code.
 */
export function extractToolChanges(gcode: string): string[] {
  const tools: string[] = [];
  const lines = gcode.split('\n');

  for (const line of lines) {
    const match = line.match(/T(\d+)/);
    if (match) {
      const toolNum = match[1];
      if (!tools.includes(toolNum)) {
        tools.push(toolNum);
      }
    }
  }

  return tools;
}

/**
 * Get G-code summary for logging.
 */
export function summarizeGcode(result: PostResult): string {
  const counts = countGcodeLines(result.gcode);
  return `Dialect post: ${result.lineCount} lines, G0=${counts.G0} G1=${counts.G1} G2=${counts.G2} G3=${counts.G3} tools=${counts.T}`;
}
