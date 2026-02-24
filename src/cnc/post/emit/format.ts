/**
 * format.ts - G-code Formatting Utilities
 *
 * Number and string formatting for deterministic G-code output.
 *
 * @version 1.0.0 - Phase D2
 */

// ============================================================================
// Number Formatting
// ============================================================================

/**
 * Format a number for G-code output.
 * Ensures deterministic representation with no floating point artifacts.
 *
 * @param value - Number to format
 * @param decimals - Number of decimal places (default 3)
 * @returns Formatted string
 */
export function formatNumber(value: number, decimals = 3): string {
  // Round to avoid floating point artifacts
  const multiplier = Math.pow(10, decimals);
  const rounded = Math.round(value * multiplier) / multiplier;

  // Format with fixed decimals
  const fixed = rounded.toFixed(decimals);

  // Remove trailing zeros but keep at least one decimal for clarity
  // e.g., 10.000 -> 10, 10.100 -> 10.1, 10.123 -> 10.123
  return fixed.replace(/\.?0+$/, '') || '0';
}

/**
 * Format a coordinate value with sign for relative moves.
 */
export function formatRelative(value: number, decimals = 3): string {
  const formatted = formatNumber(value, decimals);
  return value >= 0 ? `+${formatted}` : formatted;
}

/**
 * Format a feed rate value (always integer for mm/min).
 */
export function formatFeedRate(value: number): string {
  return Math.round(value).toString();
}

/**
 * Format an RPM value (always integer).
 */
export function formatRpm(value: number): string {
  return Math.round(value).toString();
}

/**
 * Format a tool number.
 */
export function formatTool(toolNumber: number): string {
  return `T${toolNumber}`;
}

// ============================================================================
// String Formatting
// ============================================================================

/**
 * Sanitize a string for use in G-code comments.
 * Removes or replaces characters that could cause issues.
 */
export function sanitizeComment(text: string): string {
  return text
    .replace(/[()]/g, '') // Remove parentheses (comment delimiters)
    .replace(/[^\x20-\x7E]/g, '') // Remove non-ASCII
    .trim()
    .substring(0, 80); // Limit length
}

/**
 * Format a program name for G-code header.
 * Ensures valid characters and length.
 */
export function formatProgramName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .substring(0, 16)
    || 'PROGRAM';
}

/**
 * Format a timestamp for G-code comments.
 */
export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

// ============================================================================
// G-code Line Builders
// ============================================================================

/**
 * Build a G-code move command.
 */
export function buildMoveCommand(
  gCode: 'G0' | 'G1',
  params: {
    x?: number;
    y?: number;
    z?: number;
    f?: number;
  },
  decimals = 3
): string {
  const parts: string[] = [gCode];

  if (params.x !== undefined) {
    parts.push(`X${formatNumber(params.x, decimals)}`);
  }
  if (params.y !== undefined) {
    parts.push(`Y${formatNumber(params.y, decimals)}`);
  }
  if (params.z !== undefined) {
    parts.push(`Z${formatNumber(params.z, decimals)}`);
  }
  if (params.f !== undefined) {
    parts.push(`F${formatFeedRate(params.f)}`);
  }

  return parts.join(' ');
}

/**
 * Build a drilling cycle command (G81).
 */
export function buildDrillCycle(params: {
  x: number;
  y: number;
  z: number;
  r: number;
  f: number;
}): string {
  const { x, y, z, r, f } = params;
  return `G81 X${formatNumber(x)} Y${formatNumber(y)} Z${formatNumber(z)} R${formatNumber(r)} F${formatFeedRate(f)}`;
}

/**
 * Build a peck drilling cycle command (G83).
 */
export function buildPeckCycle(params: {
  x: number;
  y: number;
  z: number;
  r: number;
  q: number;
  f: number;
}): string {
  const { x, y, z, r, q, f } = params;
  return `G83 X${formatNumber(x)} Y${formatNumber(y)} Z${formatNumber(z)} R${formatNumber(r)} Q${formatNumber(q)} F${formatFeedRate(f)}`;
}

/**
 * Build a boring cycle command (G85).
 */
export function buildBoreCycle(params: {
  x: number;
  y: number;
  z: number;
  r: number;
  f: number;
}): string {
  const { x, y, z, r, f } = params;
  return `G85 X${formatNumber(x)} Y${formatNumber(y)} Z${formatNumber(z)} R${formatNumber(r)} F${formatFeedRate(f)}`;
}
