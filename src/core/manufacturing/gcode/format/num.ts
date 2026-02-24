// src/core/manufacturing/gcode/format/num.ts
/**
 * Deterministic Number Formatting for G-code.
 *
 * Ensures consistent, reproducible output across all dialects.
 * Critical for audit trail and fingerprinting.
 *
 * Rules:
 * - Round to specified decimal places
 * - Optional trailing zero stripping
 * - Consistent negative sign handling
 * - Integer detection for clean output
 *
 * v0.10.7.1 - G-code Dialects
 */

// =============================================================================
// FORMATTING OPTIONS
// =============================================================================

/**
 * Number formatting options.
 */
export interface NumFormatOptions {
  /** Maximum decimal places */
  places: number;

  /** Strip trailing zeros after decimal point */
  stripTrailingZeros?: boolean;

  /** Always include decimal point (even for integers) */
  forceDecimal?: boolean;

  /** Minimum integer digits (pad with zeros) */
  minIntegerDigits?: number;
}

/**
 * Default formatting options for G-code.
 */
export const DEFAULT_NUM_FORMAT: NumFormatOptions = {
  places: 3,
  stripTrailingZeros: true,
  forceDecimal: false,
  minIntegerDigits: 1,
};

// =============================================================================
// CORE FORMATTING
// =============================================================================

/**
 * Format a number for G-code output.
 *
 * Deterministic formatting with configurable options.
 *
 * @param n Number to format
 * @param places Decimal places (default 3)
 * @param stripZeros Strip trailing zeros (default true)
 * @returns Formatted string
 *
 * @example
 * fmt(1.23, 3) // "1.23"
 * fmt(5.000, 3) // "5"
 * fmt(-0.5, 3) // "-0.5"
 * fmt(0, 3) // "0"
 */
export function fmt(
  n: number,
  places: number = 3,
  stripZeros: boolean = true
): string {
  // Handle special cases
  if (!Number.isFinite(n)) {
    return "0";
  }

  // Round to specified places
  const multiplier = Math.pow(10, places);
  const rounded = Math.round(n * multiplier) / multiplier;

  // Format to fixed decimals
  let str = rounded.toFixed(places);

  // Strip trailing zeros if requested
  if (stripZeros) {
    // Remove trailing zeros after decimal point
    str = str.replace(/(\.\d*?)0+$/, "$1");
    // Remove trailing decimal point
    str = str.replace(/\.$/, "");
  }

  // Handle negative zero
  if (str === "-0") {
    str = "0";
  }

  return str;
}

/**
 * Format a number with full options.
 *
 * @param n Number to format
 * @param opts Formatting options
 * @returns Formatted string
 */
export function fmtNum(n: number, opts: NumFormatOptions = DEFAULT_NUM_FORMAT): string {
  const { places, stripTrailingZeros = true, forceDecimal = false, minIntegerDigits = 1 } = opts;

  // Handle special cases
  if (!Number.isFinite(n)) {
    return "0";
  }

  // Round to specified places
  const multiplier = Math.pow(10, places);
  const rounded = Math.round(n * multiplier) / multiplier;

  // Format to fixed decimals
  let str = rounded.toFixed(places);

  // Strip trailing zeros if requested
  if (stripTrailingZeros && !forceDecimal) {
    str = str.replace(/(\.\d*?)0+$/, "$1");
    str = str.replace(/\.$/, "");
  } else if (stripTrailingZeros && forceDecimal) {
    str = str.replace(/(\.\d*?)0+$/, "$1");
    // Keep at least one decimal place
    if (!str.includes(".")) {
      str += ".0";
    }
  }

  // Handle negative zero
  if (str === "-0" || str === "-0.0") {
    str = forceDecimal ? "0.0" : "0";
  }

  // Pad integer part if needed
  if (minIntegerDigits > 1) {
    const isNegative = str.startsWith("-");
    const absStr = isNegative ? str.slice(1) : str;
    const [intPart, decPart] = absStr.split(".");
    const paddedInt = intPart.padStart(minIntegerDigits, "0");
    str = (isNegative ? "-" : "") + paddedInt + (decPart ? "." + decPart : "");
  }

  return str;
}

// =============================================================================
// SPECIALIZED FORMATTERS
// =============================================================================

/**
 * Format coordinate value (X, Y, Z).
 *
 * Uses 3 decimal places by default.
 */
export function fmtCoord(n: number, places: number = 3): string {
  return fmt(n, places, true);
}

/**
 * Format feed rate (F).
 *
 * Uses 1 decimal place, strips zeros.
 */
export function fmtFeed(n: number): string {
  return fmt(n, 1, true);
}

/**
 * Format spindle speed (S).
 *
 * Integer, no decimals.
 */
export function fmtSpindle(n: number): string {
  return fmt(Math.round(n), 0, true);
}

/**
 * Format tool number (T).
 *
 * Integer, no decimals.
 */
export function fmtTool(n: number): string {
  return fmt(Math.round(n), 0, true);
}

/**
 * Format arc center offset (I, J).
 *
 * Uses 4 decimal places for precision.
 */
export function fmtArc(n: number): string {
  return fmt(n, 4, true);
}

/**
 * Format dwell time (seconds).
 *
 * Uses 3 decimal places.
 */
export function fmtDwell(seconds: number): string {
  return fmt(seconds, 3, true);
}

/**
 * Format line number (N).
 *
 * Integer, no decimals.
 */
export function fmtLineNumber(n: number): string {
  return String(Math.round(n));
}

// =============================================================================
// COORDINATE FORMATTING
// =============================================================================

/**
 * Format optional coordinate with axis label.
 *
 * @param axis Axis label (X, Y, Z)
 * @param value Value (undefined = skip)
 * @param places Decimal places
 * @returns Formatted "X1.23" or empty string
 */
export function fmtAxis(
  axis: string,
  value: number | undefined,
  places: number = 3
): string {
  if (value === undefined) {
    return "";
  }
  return `${axis}${fmt(value, places)}`;
}

/**
 * Format XYZ coordinates.
 *
 * @param x X coordinate (optional)
 * @param y Y coordinate (optional)
 * @param z Z coordinate (optional)
 * @param places Decimal places
 * @returns Array of formatted axis strings
 */
export function fmtXYZ(
  x?: number,
  y?: number,
  z?: number,
  places: number = 3
): string[] {
  const parts: string[] = [];
  if (x !== undefined) parts.push(`X${fmt(x, places)}`);
  if (y !== undefined) parts.push(`Y${fmt(y, places)}`);
  if (z !== undefined) parts.push(`Z${fmt(z, places)}`);
  return parts;
}

/**
 * Format IJ arc center offsets.
 *
 * @param i I offset
 * @param j J offset
 * @param places Decimal places
 * @returns Array of formatted offset strings
 */
export function fmtIJ(i: number, j: number, places: number = 4): string[] {
  return [`I${fmt(i, places)}`, `J${fmt(j, places)}`];
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Check if value is within machine limits.
 *
 * @param value Value to check
 * @param min Minimum allowed
 * @param max Maximum allowed
 * @returns True if within limits
 */
export function isWithinLimits(
  value: number,
  min: number,
  max: number
): boolean {
  return value >= min && value <= max;
}

/**
 * Clamp value to machine limits.
 *
 * @param value Value to clamp
 * @param min Minimum allowed
 * @param max Maximum allowed
 * @returns Clamped value
 */
export function clampToLimits(
  value: number,
  min: number,
  max: number
): number {
  return Math.max(min, Math.min(max, value));
}
