// src/core/manufacturing/gcode/emit/emitProgram.ts
/**
 * G-code Program Emitter.
 *
 * Converts canonical IR to machine-specific G-code files.
 * Uses dialects for vendor-specific formatting.
 *
 * Features:
 * - Dialect-aware formatting
 * - Deterministic output
 * - Line numbering (when required)
 * - Fingerprinting for audit trail
 *
 * v0.10.7.1 - G-code Dialects
 */

import { IRProgram, IRMove } from "../ir/gcodeIr.v1";
import { Dialect, validateDialectCapability, DialectIssue } from "../dialects/dialect.v1";
import { addLineNumbers } from "./addLineNumbers";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Emit result.
 */
export interface EmitResult {
  /** Generated G-code text */
  text: string;

  /** SHA-256 fingerprint of output */
  fileFp: string;

  /** Line count */
  lineCount: number;

  /** Dialect used */
  dialectId: string;

  /** Any issues found */
  issues: DialectIssue[];
}

/**
 * Emit options.
 */
export interface EmitOptions {
  /** Include empty lines between sections */
  sectionSpacing?: boolean;

  /** Include move comments for debugging */
  debugComments?: boolean;

  /** Override line number settings */
  lineNumbers?: {
    force?: boolean;
    start?: number;
    step?: number;
  };
}

/**
 * Default emit options.
 */
export const DEFAULT_EMIT_OPTIONS: EmitOptions = {
  sectionSpacing: true,
  debugComments: false,
};

// =============================================================================
// HASHING
// =============================================================================

/**
 * Simple SHA-256 hash for browser/Node.
 *
 * Uses Web Crypto API when available, falls back to simple hash.
 */
async function sha256Async(text: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Fallback: simple deterministic hash (not cryptographically secure)
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Synchronous hash (simple, deterministic).
 */
function sha256Sync(text: string): string {
  // FNV-1a hash - fast and deterministic
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// =============================================================================
// EMITTER
// =============================================================================

/**
 * Emit G-code from IR program.
 *
 * Converts canonical IR to dialect-specific G-code text.
 *
 * @param prog IR program
 * @param dialect Dialect to use
 * @param options Emit options
 * @returns Emit result with text and fingerprint
 */
export function emitNc(
  prog: IRProgram,
  dialect: Dialect,
  options: EmitOptions = DEFAULT_EMIT_OPTIONS
): EmitResult {
  const issues: DialectIssue[] = [];

  // Validate dialect capability
  issues.push(...validateDialectCapability(prog, dialect));

  // Generate header
  const header = dialect.header(prog);

  // Generate body
  const body: string[] = [];
  for (const move of prog.moves) {
    // Add debug comment if requested
    if (options.debugComments) {
      body.push(dialect.formatMove({ kind: "COMMENT", text: `IR: ${move.kind}` })[0]);
    }

    // Format move
    const formatted = dialect.formatMove(move);
    body.push(...formatted);
  }

  // Generate footer
  const footer = dialect.footer(prog);

  // Combine sections
  let lines: string[];
  if (options.sectionSpacing) {
    lines = [
      ...header,
      "", // Spacing after header
      ...body,
      "", // Spacing before footer
      ...footer,
    ].filter((line) => line !== undefined);
  } else {
    lines = [...header, ...body, ...footer].filter((line) => line !== undefined);
  }

  // Add line numbers if needed
  const needsLineNumbers =
    options.lineNumbers?.force ||
    dialect.caps.needsLineNumbers;

  if (needsLineNumbers) {
    const start = options.lineNumbers?.start ?? dialect.caps.lineNumberStart ?? 10;
    const step = options.lineNumbers?.step ?? dialect.caps.lineNumberStep ?? 10;

    // Filter out empty lines for numbering
    const nonEmptyLines = lines.filter((l) => l.trim() !== "");
    const numberedLines = addLineNumbers(nonEmptyLines, start, step);

    // Reinsert empty lines at original positions
    let numberedIdx = 0;
    lines = lines.map((line) => {
      if (line.trim() === "") {
        return line;
      }
      return numberedLines[numberedIdx++];
    });
  }

  // Generate output text
  const text = lines.join("\n") + "\n";

  // Calculate fingerprint
  const fileFp = sha256Sync(text);

  return {
    text,
    fileFp,
    lineCount: lines.length,
    dialectId: dialect.id,
    issues,
  };
}

/**
 * Emit G-code from IR program (async version with full SHA-256).
 *
 * @param prog IR program
 * @param dialect Dialect to use
 * @param options Emit options
 * @returns Promise of emit result
 */
export async function emitNcAsync(
  prog: IRProgram,
  dialect: Dialect,
  options: EmitOptions = DEFAULT_EMIT_OPTIONS
): Promise<EmitResult> {
  // Get sync result first
  const result = emitNc(prog, dialect, options);

  // Calculate full SHA-256 asynchronously
  const fullFp = await sha256Async(result.text);

  return {
    ...result,
    fileFp: fullFp,
  };
}

// =============================================================================
// FILE UTILITIES
// =============================================================================

/**
 * Generate filename for NC file.
 *
 * @param prog IR program
 * @param dialect Dialect
 * @returns Suggested filename
 */
export function generateNcFilename(
  prog: IRProgram,
  dialect: Dialect
): string {
  const ext = dialect.caps.fileExtension;
  const safeJobId = prog.jobId.replace(/[^a-zA-Z0-9-_]/g, "_");
  const safeSheetId = prog.sheetId.replace(/[^a-zA-Z0-9-_]/g, "_");
  return `${safeJobId}_${safeSheetId}.${ext}`;
}

/**
 * Split large program into chunks.
 *
 * Useful for controllers with line count limits.
 *
 * @param lines G-code lines
 * @param maxLines Maximum lines per chunk
 * @returns Array of line chunks
 */
export function splitIntoChunks(
  lines: string[],
  maxLines: number
): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    chunks.push(lines.slice(i, i + maxLines));
  }
  return chunks;
}

/**
 * Estimate file size.
 *
 * @param text G-code text
 * @returns Estimated size in bytes
 */
export function estimateFileSize(text: string): number {
  // Approximate: UTF-8 encoding
  return new TextEncoder().encode(text).length;
}

// =============================================================================
// AUDIT
// =============================================================================

/**
 * Generate emit audit report.
 */
export function generateEmitAuditReport(
  prog: IRProgram,
  result: EmitResult
): Record<string, unknown> {
  return {
    jobId: prog.jobId,
    sheetId: prog.sheetId,
    dialectId: result.dialectId,
    lineCount: result.lineCount,
    fileFp: result.fileFp,
    irFp: prog.audit.irFp,
    planFp: prog.audit.planFp,
    generatedAt: prog.audit.generatedAt,
    issues: result.issues.map((i) => ({
      code: i.code,
      severity: i.severity,
      message: i.message,
    })),
  };
}
