/**
 * G-Code Writer Class
 *
 * Step 10.5: Fluent G-code builder with machine profile support
 *
 * Features:
 * - Fluent API for building G-code programs
 * - Line numbering (optional)
 * - Comment formatting (parentheses or semicolon)
 * - Coordinate formatting with precision control
 * - Tool change sequences
 * - Canned drilling cycles
 */

import type { MachineProfile } from './machineProfile.js';

// ============================================================================
// Types
// ============================================================================

export interface GCodeOptions {
  profile: MachineProfile;
  jobName?: string;
  sheetIndex?: number;
}

// ============================================================================
// GCode Writer Class
// ============================================================================

export class GCode {
  private lines: string[] = [];
  private profile: MachineProfile;
  private jobName: string;
  private sheetIndex: number;
  private lineNum: number = 10;
  private lineIncrement: number = 10;
  private currentTool: number | null = null;
  private currentRpm: number | null = null;
  private currentZ: number | null = null;

  constructor(options: GCodeOptions) {
    this.profile = options.profile;
    this.jobName = options.jobName ?? 'IIMOS_JOB';
    this.sheetIndex = options.sheetIndex ?? 0;
  }

  // ==========================================================================
  // Program Structure
  // ==========================================================================

  /**
   * Add program header from machine profile.
   */
  header(): this {
    // Add profile header lines
    for (const line of this.profile.programStart) {
      if (line.startsWith('(') || line.startsWith(';')) {
        this.lines.push(line);
      } else if (line.startsWith('%') || line.startsWith('O')) {
        this.lines.push(line);
      } else {
        this.emit(line);
      }
    }

    // Add job info comment
    this.comment(`Job: ${this.jobName}`);
    this.comment(`Sheet: ${this.sheetIndex + 1}`);
    this.comment(`Generated: ${new Date().toISOString()}`);

    return this;
  }

  /**
   * Add program footer from machine profile.
   */
  footer(): this {
    for (const line of this.profile.programEnd) {
      if (line.startsWith('%') || line.startsWith('M30')) {
        this.lines.push(line);
      } else {
        this.emit(line);
      }
    }
    return this;
  }

  // ==========================================================================
  // Motion Commands
  // ==========================================================================

  /**
   * Rapid move (G0).
   */
  rapid(x?: number, y?: number, z?: number): this {
    const coords = this.formatCoords(x, y, z);
    if (coords) {
      this.emit(`G0 ${coords}`);
      if (z !== undefined) this.currentZ = z;
    }
    return this;
  }

  /**
   * Linear feed move (G1).
   */
  linear(x?: number, y?: number, z?: number, f?: number): this {
    const coords = this.formatCoords(x, y, z);
    const feed = f !== undefined ? ` F${f}` : '';
    if (coords) {
      this.emit(`G1 ${coords}${feed}`);
      if (z !== undefined) this.currentZ = z;
    }
    return this;
  }

  /**
   * Arc clockwise (G2).
   */
  arcCW(x: number, y: number, i: number, j: number, f?: number): this {
    const feed = f !== undefined ? ` F${f}` : '';
    this.emit(
      `G2 ${this.fmt('X', x)} ${this.fmt('Y', y)} ${this.fmt('I', i)} ${this.fmt('J', j)}${feed}`
    );
    return this;
  }

  /**
   * Arc counter-clockwise (G3).
   */
  arcCCW(x: number, y: number, i: number, j: number, f?: number): this {
    const feed = f !== undefined ? ` F${f}` : '';
    this.emit(
      `G3 ${this.fmt('X', x)} ${this.fmt('Y', y)} ${this.fmt('I', i)} ${this.fmt('J', j)}${feed}`
    );
    return this;
  }

  // ==========================================================================
  // Z Moves (Common Patterns)
  // ==========================================================================

  /**
   * Rapid to safe Z height.
   */
  safeZ(): this {
    return this.rapid(undefined, undefined, this.profile.safeZMm);
  }

  /**
   * Plunge to depth.
   */
  plunge(z: number, f?: number): this {
    const feed = f ?? 1000;  // Default plunge feed
    return this.linear(undefined, undefined, z, feed);
  }

  /**
   * Retract to safe Z.
   */
  retract(): this {
    return this.rapid(undefined, undefined, this.profile.safeZMm);
  }

  // ==========================================================================
  // Tool Control
  // ==========================================================================

  /**
   * Tool change with optional length offset.
   */
  toolChange(toolNo: number, lengthOffset?: number): this {
    this.safeZ();
    this.emit(`M6 T${toolNo}`);
    this.comment(`Tool ${toolNo}`);

    if (lengthOffset !== undefined) {
      this.emit(`G43 H${lengthOffset}`);
    } else {
      this.emit(`G43 H${toolNo}`);
    }

    this.currentTool = toolNo;
    return this;
  }

  /**
   * Start spindle at RPM.
   */
  spindleOn(rpm: number): this {
    this.emit(`${this.profile.spindleOnCode} S${rpm}`);
    this.currentRpm = rpm;
    return this;
  }

  /**
   * Stop spindle.
   */
  spindleOff(): this {
    this.emit(this.profile.spindleOffCode);
    this.currentRpm = null;
    return this;
  }

  /**
   * Dwell (pause) in seconds.
   */
  dwell(seconds: number): this {
    this.emit(`G4 P${seconds}`);
    return this;
  }

  // ==========================================================================
  // Canned Cycles
  // ==========================================================================

  /**
   * Drilling cycle (G81) - simple drill.
   */
  drill(x: number, y: number, z: number, r: number, f: number): this {
    this.emit(
      `G81 ${this.fmt('X', x)} ${this.fmt('Y', y)} ${this.fmt('Z', z)} ${this.fmt('R', r)} F${f}`
    );
    return this;
  }

  /**
   * Peck drilling cycle (G83) - for deep holes.
   */
  peckDrill(
    x: number,
    y: number,
    z: number,
    r: number,
    q: number,  // Peck depth
    f: number
  ): this {
    this.emit(
      `G83 ${this.fmt('X', x)} ${this.fmt('Y', y)} ${this.fmt('Z', z)} ${this.fmt('R', r)} ${this.fmt('Q', q)} F${f}`
    );
    return this;
  }

  /**
   * Cancel canned cycle.
   */
  cancelCycle(): this {
    this.emit('G80');
    return this;
  }

  // ==========================================================================
  // Coolant
  // ==========================================================================

  /**
   * Turn coolant on (if supported).
   */
  coolantOn(): this {
    if (this.profile.coolantOnCode) {
      this.emit(this.profile.coolantOnCode);
    }
    return this;
  }

  /**
   * Turn coolant off (if supported).
   */
  coolantOff(): this {
    if (this.profile.coolantOffCode) {
      this.emit(this.profile.coolantOffCode);
    }
    return this;
  }

  // ==========================================================================
  // Comments & Raw
  // ==========================================================================

  /**
   * Add a comment.
   */
  comment(text: string): this {
    if (this.profile.commentStyle === 'PAREN') {
      this.lines.push(`(${text})`);
    } else {
      this.lines.push(`; ${text}`);
    }
    return this;
  }

  /**
   * Add blank line.
   */
  blank(): this {
    this.lines.push('');
    return this;
  }

  /**
   * Add raw G-code line (no line number).
   */
  raw(line: string): this {
    this.lines.push(line);
    return this;
  }

  /**
   * Emit a G-code line with optional line number.
   */
  private emit(code: string): void {
    if (this.profile.lineNumbering) {
      this.lines.push(`N${this.lineNum} ${code}`);
      this.lineNum += this.lineIncrement;
    } else {
      this.lines.push(code);
    }
  }

  // ==========================================================================
  // Formatting Helpers
  // ==========================================================================

  /**
   * Format a coordinate value.
   */
  private fmt(axis: string, value: number): string {
    return `${axis}${value.toFixed(this.profile.decimalPlaces)}`;
  }

  /**
   * Format optional coordinates.
   */
  private formatCoords(x?: number, y?: number, z?: number): string {
    const parts: string[] = [];
    if (x !== undefined) parts.push(this.fmt('X', x));
    if (y !== undefined) parts.push(this.fmt('Y', y));
    if (z !== undefined) parts.push(this.fmt('Z', z));
    return parts.join(' ');
  }

  // ==========================================================================
  // Output
  // ==========================================================================

  /**
   * Get all lines.
   */
  getLines(): string[] {
    return [...this.lines];
  }

  /**
   * Build final G-code string.
   */
  build(): string {
    return this.lines.join('\n');
  }

  /**
   * Get current state.
   */
  getState(): { tool: number | null; rpm: number | null; z: number | null } {
    return {
      tool: this.currentTool,
      rpm: this.currentRpm,
      z: this.currentZ,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new G-code writer.
 */
export function createGCode(options: GCodeOptions): GCode {
  return new GCode(options);
}
