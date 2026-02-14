/**
 * HUD Numeric Input Parser
 *
 * Parses numeric input during sketch mode to allow precise dimensions:
 * - "500" → length 500mm (preserve current angle)
 * - "500@30" → length 500mm at 30° angle
 * - "@45" → angle 45° (preserve current length)
 *
 * @version 1.0.0
 */

import type { SketchPoint } from './types';
import { distance2D, angle2D, polarToPoint } from './projectionUtils';

// ============================================================================
// Types
// ============================================================================

export interface HudSpec {
  /** Length in mm (null = use cursor distance) */
  length: number | null;
  /** Angle in degrees (null = use cursor angle) */
  angle: number | null;
  /** Raw input string */
  raw: string;
  /** Whether the input is valid */
  valid: boolean;
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse HUD input string into length and angle.
 *
 * Supported formats:
 * - "500" → length=500, angle=null
 * - "500@30" → length=500, angle=30
 * - "@45" → length=null, angle=45
 * - "500.5@-30" → length=500.5, angle=-30
 *
 * @param input - Raw input string
 * @returns Parsed HUD specification
 */
export function parseHud(input: string): HudSpec {
  const trimmed = input.trim();

  if (!trimmed) {
    return { length: null, angle: null, raw: input, valid: true };
  }

  // Pattern: optional length, optional @angle
  // Examples: "500", "500@30", "@45", "500.5@-30.5"
  const pattern = /^(-?\d+\.?\d*)?(@(-?\d+\.?\d*))?$/;
  const match = trimmed.match(pattern);

  if (!match) {
    return { length: null, angle: null, raw: input, valid: false };
  }

  const lengthStr = match[1];
  const angleStr = match[3];

  const length = lengthStr ? parseFloat(lengthStr) : null;
  const angle = angleStr !== undefined ? parseFloat(angleStr) : null;

  // Validate parsed numbers
  if (length !== null && isNaN(length)) {
    return { length: null, angle: null, raw: input, valid: false };
  }
  if (angle !== null && isNaN(angle)) {
    return { length: null, angle: null, raw: input, valid: false };
  }

  return { length, angle, raw: input, valid: true };
}

// ============================================================================
// Application
// ============================================================================

/**
 * Apply HUD specification to compute the final point.
 *
 * @param origin - Starting point (last committed point)
 * @param cursor - Current cursor position (provides default length/angle)
 * @param spec - Parsed HUD specification
 * @returns Final point after applying HUD constraints
 */
export function applyHudToPoint(
  origin: SketchPoint,
  cursor: SketchPoint,
  spec: HudSpec
): SketchPoint {
  if (!spec.valid) {
    return cursor;
  }

  // Get current cursor distance and angle as defaults
  const cursorDist = distance2D(origin, cursor);
  const cursorAngle = angle2D(origin, cursor);

  // Apply HUD overrides
  const finalLength = spec.length !== null ? spec.length : cursorDist;
  const finalAngle = spec.angle !== null ? spec.angle : cursorAngle;

  // Handle zero or negative length
  if (finalLength <= 0) {
    return origin;
  }

  // Calculate final point using polar coordinates
  return polarToPoint(origin, finalLength, finalAngle);
}

/**
 * Format HUD display string showing current length and angle.
 *
 * @param length - Length in mm
 * @param angle - Angle in degrees
 * @param hudInput - Current HUD input string
 * @returns Formatted display string
 */
export function formatHudDisplay(
  length: number,
  angle: number,
  hudInput: string
): string {
  const lengthStr = `L=${length.toFixed(0)}mm`;
  const angleStr = `@${angle.toFixed(1)}°`;

  if (hudInput) {
    return `${hudInput} → ${lengthStr} ${angleStr}`;
  }

  return `${lengthStr} ${angleStr}`;
}

/**
 * Check if a character is valid for HUD input.
 *
 * @param char - Single character to check
 * @returns true if valid HUD input character
 */
export function isHudChar(char: string): boolean {
  return /^[\d.@-]$/.test(char);
}

/**
 * Validate HUD input in real-time (partial input).
 *
 * @param input - Current input string
 * @returns true if input is valid or potentially valid (partial)
 */
export function validateHudInput(input: string): boolean {
  if (!input) return true;

  // Allow partial patterns like "@", "500@", "-", etc.
  const partialPattern = /^-?\d*\.?\d*@?-?\d*\.?\d*$/;
  return partialPattern.test(input);
}
