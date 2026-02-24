/**
 * Packet Schema Validator (Lightweight)
 * P2.1 Packet Viewer
 *
 * Validates minimal required fields for viewer display.
 * Does NOT perform full schema validation - just essentials.
 *
 * @version 0.12.0
 */

// ============================================================================
// Validation Result
// ============================================================================

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Validator
// ============================================================================

/**
 * Validate packet has minimum required fields for viewer.
 *
 * Required:
 * - version (string)
 * - jobId (string)
 *
 * Recommended (warnings if missing):
 * - toolpathPlan or parts
 * - sheets (for nesting view)
 */
export function validatePacketSchema(
  data: unknown,
  expectedJobId?: string
): SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must be an object
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    errors.push("Packet must be a JSON object");
    return { valid: false, errors, warnings };
  }

  const packet = data as Record<string, unknown>;

  // Required: version
  if (typeof packet.version !== "string") {
    errors.push("Missing or invalid 'version' field (must be string)");
  } else if (!packet.version.trim()) {
    errors.push("'version' field is empty");
  }

  // Required: jobId
  if (typeof packet.jobId !== "string") {
    errors.push("Missing or invalid 'jobId' field (must be string)");
  } else if (!packet.jobId.trim()) {
    errors.push("'jobId' field is empty");
  } else if (expectedJobId && packet.jobId !== expectedJobId) {
    errors.push(
      `Job ID mismatch: packet contains '${packet.jobId}' but expected '${expectedJobId}'`
    );
  }

  // Recommended: toolpathPlan or parts
  const hasToolpathPlan =
    typeof packet.toolpathPlan === "object" && packet.toolpathPlan !== null;
  const hasParts = Array.isArray(packet.parts) && packet.parts.length > 0;

  if (!hasToolpathPlan && !hasParts) {
    warnings.push(
      "Neither 'toolpathPlan' nor 'parts' found - toolpath view will be empty"
    );
  }

  // Recommended: sheets
  const hasSheets = Array.isArray(packet.sheets) && packet.sheets.length > 0;
  if (!hasSheets) {
    warnings.push("No 'sheets' found - nesting view will be empty");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Extract snippet from packet for error display.
 * Returns first N characters of JSON.
 */
export function extractPacketSnippet(
  data: string | Buffer,
  maxLength: number = 4096
): string {
  const str = typeof data === "string" ? data : data.toString("utf-8");
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + "\n... [truncated]";
}

/**
 * Try to parse JSON and extract error location.
 */
export function parsePacketJson(data: string): {
  success: boolean;
  data?: unknown;
  error?: string;
  position?: number;
} {
  try {
    const parsed = JSON.parse(data);
    return { success: true, data: parsed };
  } catch (err) {
    if (err instanceof SyntaxError) {
      // Try to extract position from error message
      const match = err.message.match(/position\s+(\d+)/i);
      const position = match ? parseInt(match[1], 10) : undefined;
      return {
        success: false,
        error: err.message,
        position,
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown parse error",
    };
  }
}
