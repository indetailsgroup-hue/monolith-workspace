/**
 * Golden Output Parser
 * P1.1 Factory Ops UX - PR-P1.1-B.1
 *
 * Parses IIMOS_VERIFY_V1 golden format output.
 * Strict header check, tolerant KV parsing, strict required key validation.
 *
 * @version 0.12.0
 */

// ============================================================================
// Types
// ============================================================================

export interface GoldenParseResult {
  /** Key-value pairs from golden output */
  kv: Record<string, string>;
  /** Verbatim log section (after ---LOG---) */
  log: string;
}

export interface ValidationResult {
  ok: true;
}

export interface ValidationError {
  ok: false;
  reason: string;
}

export type GoldenValidationResult = ValidationResult | ValidationError;

// ============================================================================
// Constants
// ============================================================================

/** Golden format header - must be first line */
export const GOLDEN_HEADER = "IIMOS_VERIFY_V1";

/** Log section separator */
export const LOG_SEPARATOR = "---LOG---";

/** Required keys for valid golden output */
export const REQUIRED_KEYS = [
  "VERDICT",
  "CODE",
  "EXIT_CODE",
  "TOOL",
  "TOOL_VERSION",
  "SUMMARY_TH",
] as const;

/** Valid verdict values */
export const VALID_VERDICTS = ["PASS", "FAIL", "PASS_WITH_WARN"] as const;

/** Optional keys that can be extracted to details */
export const OPTIONAL_KEYS = [
  "JOB_ID",
  "PACKET_PATH",
  "PACKET_SHA256",
  "MANIFEST_HASH",
  "PUBLIC_KEY_ID",
  "AUDIT_PUBLIC_KEY_ID",
  "SIGNED_AT",
  "GATE_VERDICT",
  "GATE_REPORT_HASH",
  "MERKLE_ROOT",
  "AUDIT_DAY",
] as const;

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse golden format output
 *
 * Algorithm:
 * 1. Check first line is IIMOS_VERIFY_V1
 * 2. Parse KEY=VALUE lines until ---LOG---
 * 3. Everything after ---LOG--- is verbatim log
 *
 * @param output - Raw verifier output (stdout + stderr combined)
 * @returns Parsed result or null if not golden format
 */
export function parseGoldenOutput(output: string): GoldenParseResult | null {
  if (!output || typeof output !== "string") {
    return null;
  }

  // Split by newlines (handle both Unix and Windows)
  const lines = output.split(/\r?\n/);

  if (lines.length === 0) {
    return null;
  }

  // Check header (strict)
  if (lines[0].trim() !== GOLDEN_HEADER) {
    return null;
  }

  const kv: Record<string, string> = {};
  let i = 1;

  // Parse KV lines until ---LOG--- (tolerant for unknown lines)
  for (; i < lines.length; i++) {
    const line = lines[i];

    // Check for log separator
    if (line === LOG_SEPARATOR) {
      i++;
      break;
    }

    // Parse KEY=VALUE (tolerant - skip non-matching lines)
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      kv[match[1]] = match[2];
    }
    // Non-matching lines are silently ignored (tolerant parsing)
  }

  // Rest is verbatim log
  const log = lines.slice(i).join("\n");

  return { kv, log };
}

/**
 * Validate golden KV has all required fields
 *
 * @param kv - Parsed key-value pairs
 * @returns Validation result
 */
export function validateGoldenKV(
  kv: Record<string, string>
): GoldenValidationResult {
  // Check required keys
  for (const key of REQUIRED_KEYS) {
    if (!kv[key]) {
      return { ok: false, reason: `MISSING_${key}` };
    }
  }

  // Validate VERDICT value
  if (!VALID_VERDICTS.includes(kv["VERDICT"] as typeof VALID_VERDICTS[number])) {
    return { ok: false, reason: "BAD_VERDICT" };
  }

  // Validate EXIT_CODE is numeric
  if (!/^\d+$/.test(kv["EXIT_CODE"])) {
    return { ok: false, reason: "BAD_EXIT_CODE" };
  }

  return { ok: true };
}

/**
 * Check if output is golden format (quick check)
 *
 * @param output - Raw output string
 * @returns true if starts with golden header
 */
export function isGoldenFormat(output: string): boolean {
  if (!output || typeof output !== "string") {
    return false;
  }
  const firstLine = output.split(/\r?\n/)[0]?.trim();
  return firstLine === GOLDEN_HEADER;
}

/**
 * Extract optional details from golden KV
 *
 * @param kv - Parsed key-value pairs
 * @returns Details object with optional fields
 */
export function extractGoldenDetails(
  kv: Record<string, string>
): Record<string, unknown> {
  const details: Record<string, unknown> = {
    exitCode: Number(kv["EXIT_CODE"]),
    tool: kv["TOOL"],
    toolVersion: kv["TOOL_VERSION"],
  };

  // Extract optional fields (convert to camelCase)
  for (const key of OPTIONAL_KEYS) {
    if (kv[key]) {
      // Convert SNAKE_CASE to camelCase
      const camelKey = key.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      details[camelKey] = kv[key];
    }
  }

  return details;
}

// ============================================================================
// Builder Functions (for wrapper services)
// ============================================================================

/**
 * Build golden format output string
 * Used by wrapper services (e.g., factory-service) to emit consistent output
 *
 * @param params - Golden output parameters
 * @returns Formatted golden output string
 */
export function buildGoldenOutput(params: {
  verdict: typeof VALID_VERDICTS[number];
  code: string;
  exitCode: number;
  tool: string;
  toolVersion: string;
  summaryTh: string;
  details?: Record<string, string>;
  logLines?: string[];
}): string {
  const lines: string[] = [
    GOLDEN_HEADER,
    `VERDICT=${params.verdict}`,
    `CODE=${params.code}`,
    `EXIT_CODE=${params.exitCode}`,
    `TOOL=${params.tool}`,
    `TOOL_VERSION=${params.toolVersion}`,
  ];

  // Add optional details
  if (params.details) {
    for (const [key, value] of Object.entries(params.details)) {
      lines.push(`${key}=${value}`);
    }
  }

  // Add Thai summary (must be last KV before log)
  lines.push(`SUMMARY_TH=${params.summaryTh}`);

  // Add log separator and log content
  lines.push(LOG_SEPARATOR);
  if (params.logLines) {
    lines.push(...params.logLines);
  }

  return lines.join("\n");
}

/**
 * Build timeout golden output (for wrapper services)
 */
export function buildTimeoutGolden(
  jobId: string,
  timeoutMs: number,
  tool: string,
  toolVersion: string
): string {
  return buildGoldenOutput({
    verdict: "FAIL",
    code: "E_VERIFY_TIMEOUT",
    exitCode: 71,
    tool,
    toolVersion,
    summaryTh: "ตรวจนานเกินกำหนด (timeout)",
    details: jobId ? { JOB_ID: jobId } : undefined,
    logLines: [
      `[${tool}] Process killed after ${Math.round(timeoutMs / 1000)}s timeout`,
      `[${tool}] iimos-verify did not respond`,
    ],
  });
}
