/**
 * gcodeBuilder.ts - G-code Builder Utility
 *
 * Deterministic G-code line builder with formatting utilities.
 *
 * @version 1.0.0 - Phase D2
 */

// ============================================================================
// Types
// ============================================================================

export interface GcodeBuilderOptions {
  /** Include line numbers (N10, N20, etc.) */
  lineNumbers?: boolean;

  /** Line number increment */
  lineNumberIncrement?: number;

  /** Decimal places for coordinates */
  decimalPlaces?: number;

  /** Include comments */
  includeComments?: boolean;
}

// ============================================================================
// G-code Builder Class
// ============================================================================

/**
 * Builder for constructing G-code programs line by line.
 * Ensures deterministic output ordering.
 */
export class GcodeBuilder {
  private lines: string[] = [];
  private lineNumber = 0;
  private options: Required<GcodeBuilderOptions>;

  constructor(options: GcodeBuilderOptions = {}) {
    this.options = {
      lineNumbers: options.lineNumbers ?? false,
      lineNumberIncrement: options.lineNumberIncrement ?? 10,
      decimalPlaces: options.decimalPlaces ?? 3,
      includeComments: options.includeComments ?? true,
    };
  }

  // --------------------------------------------------------------------------
  // Core Methods
  // --------------------------------------------------------------------------

  /**
   * Add a raw line to the program.
   */
  addLine(line: string): this {
    if (this.options.lineNumbers) {
      this.lineNumber += this.options.lineNumberIncrement;
      this.lines.push(`N${this.lineNumber} ${line}`);
    } else {
      this.lines.push(line);
    }
    return this;
  }

  /**
   * Add a comment line.
   */
  addComment(comment: string): this {
    if (this.options.includeComments) {
      this.lines.push(`(${comment})`);
    }
    return this;
  }

  /**
   * Add a blank line.
   */
  addBlank(): this {
    this.lines.push('');
    return this;
  }

  /**
   * Add a raw line without line number (for headers like %).
   */
  addRaw(line: string): this {
    this.lines.push(line);
    return this;
  }

  // --------------------------------------------------------------------------
  // G-code Specific Methods
  // --------------------------------------------------------------------------

  /**
   * Rapid move (G0).
   */
  rapid(params: { x?: number; y?: number; z?: number }): this {
    return this.addLine(this.buildMove('G0', params));
  }

  /**
   * Linear feed move (G1).
   */
  feed(params: { x?: number; y?: number; z?: number; f?: number }): this {
    return this.addLine(this.buildMove('G1', params));
  }

  /**
   * Tool change (T + M6).
   */
  toolChange(toolNumber: number, comment?: string): this {
    const line = `T${toolNumber} M6`;
    if (comment && this.options.includeComments) {
      return this.addLine(`${line} (${comment})`);
    }
    return this.addLine(line);
  }

  /**
   * Spindle on (M3/M4).
   */
  spindleOn(rpm: number, direction: 'CW' | 'CCW' = 'CW'): this {
    const mCode = direction === 'CW' ? 'M3' : 'M4';
    return this.addLine(`${mCode} S${rpm}`);
  }

  /**
   * Spindle off (M5).
   */
  spindleOff(): this {
    return this.addLine('M5');
  }

  /**
   * Coolant on (M8).
   */
  coolantOn(): this {
    return this.addLine('M8');
  }

  /**
   * Coolant off (M9).
   */
  coolantOff(): this {
    return this.addLine('M9');
  }

  /**
   * Program end (M30).
   */
  programEnd(): this {
    return this.addLine('M30');
  }

  /**
   * Set units to mm (G21).
   */
  setMillimeters(): this {
    return this.addLine('G21');
  }

  /**
   * Set absolute mode (G90).
   */
  setAbsolute(): this {
    return this.addLine('G90');
  }

  /**
   * Set XY plane (G17).
   */
  setXYPlane(): this {
    return this.addLine('G17');
  }

  /**
   * Cancel canned cycle (G80).
   */
  cancelCycle(): this {
    return this.addLine('G80');
  }

  /**
   * Dwell (G4).
   */
  dwell(seconds: number): this {
    return this.addLine(`G4 P${this.formatNumber(seconds)}`);
  }

  // --------------------------------------------------------------------------
  // Drilling Cycles
  // --------------------------------------------------------------------------

  /**
   * Simple drilling cycle (G81).
   */
  drillCycle(params: {
    x: number;
    y: number;
    z: number;
    r: number;
    f: number;
  }): this {
    const { x, y, z, r, f } = params;
    return this.addLine(
      `G81 X${this.formatNumber(x)} Y${this.formatNumber(y)} Z${this.formatNumber(z)} R${this.formatNumber(r)} F${this.formatNumber(f)}`
    );
  }

  /**
   * Peck drilling cycle (G83).
   */
  peckDrillCycle(params: {
    x: number;
    y: number;
    z: number;
    r: number;
    q: number;
    f: number;
  }): this {
    const { x, y, z, r, q, f } = params;
    return this.addLine(
      `G83 X${this.formatNumber(x)} Y${this.formatNumber(y)} Z${this.formatNumber(z)} R${this.formatNumber(r)} Q${this.formatNumber(q)} F${this.formatNumber(f)}`
    );
  }

  /**
   * Boring cycle (G85).
   */
  boreCycle(params: {
    x: number;
    y: number;
    z: number;
    r: number;
    f: number;
  }): this {
    const { x, y, z, r, f } = params;
    return this.addLine(
      `G85 X${this.formatNumber(x)} Y${this.formatNumber(y)} Z${this.formatNumber(z)} R${this.formatNumber(r)} F${this.formatNumber(f)}`
    );
  }

  // --------------------------------------------------------------------------
  // Output Methods
  // --------------------------------------------------------------------------

  /**
   * Build the final G-code string.
   */
  build(): string {
    return this.lines.join('\n');
  }

  /**
   * Get line count.
   */
  getLineCount(): number {
    return this.lines.length;
  }

  /**
   * Get lines array (for testing/inspection).
   */
  getLines(): readonly string[] {
    return this.lines;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private buildMove(
    gCode: string,
    params: { x?: number; y?: number; z?: number; f?: number }
  ): string {
    const parts = [gCode];

    if (params.x !== undefined) {
      parts.push(`X${this.formatNumber(params.x)}`);
    }
    if (params.y !== undefined) {
      parts.push(`Y${this.formatNumber(params.y)}`);
    }
    if (params.z !== undefined) {
      parts.push(`Z${this.formatNumber(params.z)}`);
    }
    if (params.f !== undefined) {
      parts.push(`F${this.formatNumber(params.f)}`);
    }

    return parts.join(' ');
  }

  private formatNumber(value: number): string {
    // Format with fixed decimal places, remove trailing zeros
    const fixed = value.toFixed(this.options.decimalPlaces);
    // Remove trailing zeros after decimal point, but keep at least one decimal
    return fixed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format a coordinate value for G-code.
 */
export function formatCoord(value: number, decimals = 3): string {
  return value.toFixed(decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/**
 * Calculate estimated time for a move.
 *
 * @param distance - Distance in mm
 * @param feedRate - Feed rate in mm/min
 * @returns Time in seconds
 */
export function calculateMoveTime(distance: number, feedRate: number): number {
  if (feedRate <= 0) return 0;
  return (distance / feedRate) * 60;
}

/**
 * Calculate distance between two 3D points.
 */
export function distance3D(
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number }
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
