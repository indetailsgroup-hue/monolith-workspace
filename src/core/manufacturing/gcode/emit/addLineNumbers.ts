// src/core/manufacturing/gcode/emit/addLineNumbers.ts
/**
 * Line Number Utilities for G-code.
 *
 * Adds N-word line numbers to G-code programs.
 * Some CNC controllers require line numbers.
 *
 * v0.10.7.1 - G-code Dialects
 */

// =============================================================================
// LINE NUMBERING
// =============================================================================

/**
 * Line numbering options.
 */
export interface LineNumberOptions {
  /** Starting line number */
  start: number;

  /** Line number increment */
  step: number;

  /** Skip empty lines */
  skipEmpty?: boolean;

  /** Skip comment-only lines */
  skipComments?: boolean;

  /** Pad line numbers to this width */
  padWidth?: number;
}

/**
 * Default line numbering options.
 */
export const DEFAULT_LINE_NUMBER_OPTIONS: LineNumberOptions = {
  start: 10,
  step: 10,
  skipEmpty: true,
  skipComments: false,
  padWidth: 0,
};

/**
 * Add line numbers to G-code lines.
 *
 * @param lines G-code lines
 * @param start Starting line number
 * @param step Line number increment
 * @returns Lines with N-word prefix
 *
 * @example
 * addLineNumbers(["G0 X0", "G1 Y10"], 10, 10)
 * // ["N10 G0 X0", "N20 G1 Y10"]
 */
export function addLineNumbers(
  lines: string[],
  start: number,
  step: number
): string[] {
  let n = start;
  return lines.map((line) => {
    const result = `N${n} ${line}`;
    n += step;
    return result;
  });
}

/**
 * Add line numbers with options.
 *
 * @param lines G-code lines
 * @param options Line numbering options
 * @returns Lines with N-word prefix
 */
export function addLineNumbersWithOptions(
  lines: string[],
  options: LineNumberOptions
): string[] {
  const { start, step, skipEmpty = true, skipComments = false, padWidth = 0 } = options;

  let n = start;
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines if requested
    if (skipEmpty && trimmed === "") {
      result.push(line);
      continue;
    }

    // Skip comment-only lines if requested
    if (skipComments) {
      const isComment =
        trimmed.startsWith("(") && trimmed.endsWith(")") ||
        trimmed.startsWith(";");
      if (isComment) {
        result.push(line);
        continue;
      }
    }

    // Add line number
    const nStr = padWidth > 0
      ? String(n).padStart(padWidth, "0")
      : String(n);
    result.push(`N${nStr} ${line}`);
    n += step;
  }

  return result;
}

/**
 * Strip line numbers from G-code lines.
 *
 * @param lines G-code lines with line numbers
 * @returns Lines without N-word prefix
 */
export function stripLineNumbers(lines: string[]): string[] {
  return lines.map((line) => {
    // Remove N followed by digits and optional space
    return line.replace(/^N\d+\s*/, "");
  });
}

/**
 * Renumber G-code lines.
 *
 * @param lines G-code lines (with or without line numbers)
 * @param start Starting line number
 * @param step Line number increment
 * @returns Renumbered lines
 */
export function renumberLines(
  lines: string[],
  start: number,
  step: number
): string[] {
  const stripped = stripLineNumbers(lines);
  return addLineNumbers(stripped, start, step);
}

/**
 * Extract line numbers from G-code.
 *
 * @param lines G-code lines
 * @returns Array of line numbers (undefined for lines without N-word)
 */
export function extractLineNumbers(lines: string[]): (number | undefined)[] {
  return lines.map((line) => {
    const match = line.match(/^N(\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
  });
}

/**
 * Check if G-code has consistent line numbering.
 *
 * @param lines G-code lines
 * @returns True if all lines have N-word and increment is consistent
 */
export function hasConsistentLineNumbers(lines: string[]): boolean {
  const numbers = extractLineNumbers(lines).filter(
    (n): n is number => n !== undefined
  );

  if (numbers.length < 2) {
    return numbers.length === lines.length;
  }

  // Check if all numbers are present and increment is consistent
  const step = numbers[1] - numbers[0];
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] - numbers[i - 1] !== step) {
      return false;
    }
  }

  return numbers.length === lines.length;
}
