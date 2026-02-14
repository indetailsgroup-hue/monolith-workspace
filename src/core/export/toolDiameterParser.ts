/**
 * Tool Diameter Parser
 *
 * Parses tool diameter from toolId strings.
 * Supports formats: DRILL_5, BORE_15, D8_CARBIDE, etc.
 *
 * v0.1 - Phase 3 P2 implementation
 */

/**
 * Parse tool diameter from toolId string.
 *
 * Supports formats:
 * - DRILL_5 → 5mm
 * - BORE_15 → 15mm
 * - D8_CARBIDE → 8mm
 * - D_10 → 10mm
 * - Custom IDs fall back to provided default
 *
 * @param toolId - Tool identifier string
 * @param defaultDiameter - Default diameter if parsing fails (default: 5mm)
 * @returns Parsed diameter in mm
 */
export function parseToolDiameter(toolId: string, defaultDiameter: number = 5): number {
  if (!toolId || typeof toolId !== 'string') {
    return defaultDiameter;
  }

  // Pattern: DRILL_X, BORE_X, D_X, or just D followed by number
  // Supports decimal values like DRILL_5.5
  const match = toolId.match(/(?:DRILL|BORE|D)_?(\d+(?:\.\d+)?)/i);

  if (match) {
    const parsed = parseFloat(match[1]);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return defaultDiameter;
}

/**
 * Get tool diameter from operation or toolId.
 * Uses operation.diameter if available, otherwise parses from toolId.
 *
 * @param op - Operation object with toolId and optional diameter
 * @param defaultDiameter - Default diameter if parsing fails (default: 5mm)
 * @returns Diameter in mm
 */
export function getOperationDiameter(
  op: { toolId: string; diameter?: number },
  defaultDiameter: number = 5
): number {
  // Prefer explicit diameter if set
  if (op.diameter !== undefined && op.diameter > 0) {
    return op.diameter;
  }

  return parseToolDiameter(op.toolId, defaultDiameter);
}
