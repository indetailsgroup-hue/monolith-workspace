/**
 * Activity Storage - P8 JSONL Append-Only Per-Job
 *
 * Storage contract:
 * - JOB_ACTIVITY_ROOT/<jobId>/activity.jsonl
 * - Append-only (immutable entries)
 * - 1 event = 1 line JSON
 * - Server time for timestamps
 *
 * @version 0.12.8
 */

import { createHash, randomBytes } from "crypto";
import fs from "node:fs/promises";
import { existsSync, appendFileSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { ActivityRecord, ActivityRecordPartial } from "./activityTypes.js";

// ============================================================================
// Configuration
// ============================================================================

const ACTIVITY_ROOT = process.env.ACTIVITY_DIR ?? process.env.AUDIT_DIR ?? "./data/activity";

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Sanitize job ID to prevent path traversal.
 */
function safeJobId(jobIdRaw: string): string {
  // Allow alphanumeric, dash, underscore only
  const sanitized = jobIdRaw.replace(/[^a-zA-Z0-9_-]/g, "");
  if (sanitized.length === 0) {
    throw new Error("Invalid jobId: empty after sanitization");
  }
  if (sanitized.length > 128) {
    return sanitized.slice(0, 128);
  }
  return sanitized;
}

/**
 * Get activity file path for a job.
 */
function activityPath(jobId: string): string {
  return path.join(ACTIVITY_ROOT, jobId, "activity.jsonl");
}

// ============================================================================
// Hash Helper
// ============================================================================

/**
 * Compute SHA-256 hex hash.
 */
function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

// ============================================================================
// Append Activity
// ============================================================================

/**
 * Append an activity record for a job.
 * Returns the complete record with generated id and timestamp.
 */
export async function appendActivity(
  jobIdRaw: string,
  partial: ActivityRecordPartial
): Promise<ActivityRecord> {
  const jobId = safeJobId(jobIdRaw);
  const at = new Date().toISOString();

  // Build base record (without id)
  const base: Omit<ActivityRecord, "id"> = {
    ...partial,
    at,
    jobId,
  };

  // Generate deterministic ID from key fields
  const idSource = JSON.stringify({
    type: base.type,
    at: base.at,
    jobId: base.jobId,
    verify: base.verify,
    export: base.export,
    actor: base.actor,
    packet: base.packet,
  });
  const id = sha256Hex(idSource);

  const record: ActivityRecord = { ...base, id };

  // Ensure directory exists
  const filePath = activityPath(jobId);
  const dir = path.dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Append to JSONL (sync for atomicity)
  const line = JSON.stringify(record) + "\n";
  appendFileSync(filePath, line, "utf8");

  // Log to console
  const icon = partial.type.includes("SUCCESS") || partial.type === "VERIFY_RUN" ? "✓" : "→";
  console.log(`[ACTIVITY] ${icon} ${partial.type} | Job: ${jobId} | ID: ${id.slice(0, 8)}...`);

  return record;
}

// ============================================================================
// Read Activity
// ============================================================================

export interface ReadActivityOptions {
  /** Maximum number of records to return (default: 2000) */
  limit?: number;
}

/**
 * Read activity records for a job.
 * Returns records sorted by timestamp DESC, id ASC (stable).
 */
export async function readActivity(
  jobIdRaw: string,
  opts?: ReadActivityOptions
): Promise<ActivityRecord[]> {
  const jobId = safeJobId(jobIdRaw);
  const limit = opts?.limit ?? 2000;
  const filePath = activityPath(jobId);

  // Read file
  let txt = "";
  try {
    txt = readFileSync(filePath, "utf8");
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "ENOENT") {
      // File doesn't exist = no activity yet
      return [];
    }
    throw e;
  }

  // Parse JSONL
  const lines = txt.split("\n").filter(Boolean);
  const sliced = lines.slice(Math.max(0, lines.length - limit));

  const items: ActivityRecord[] = [];
  for (const line of sliced) {
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === "object") {
        items.push(obj as ActivityRecord);
      }
    } catch {
      // Skip malformed lines, keep reading
      console.warn("[ACTIVITY] Skipping malformed line:", line.slice(0, 50));
    }
  }

  // Stable sort: at DESC, id ASC
  items.sort((a, b) => {
    const ta = Date.parse(a.at || "");
    const tb = Date.parse(b.at || "");
    const da = Number.isFinite(ta) ? ta : 0;
    const db = Number.isFinite(tb) ? tb : 0;

    if (db !== da) return db - da;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });

  return items;
}

// ============================================================================
// Actor Extraction from Headers
// ============================================================================

/**
 * Extract actor info from request headers.
 * Uses X-IIMOS-ACTOR-ROLE and X-IIMOS-ACTOR-NAME headers.
 */
export function extractActorFromHeaders(headers: Record<string, string | string[] | undefined>): {
  role?: "FACTORY" | "ADMIN" | "DESIGNER" | "SYSTEM";
  name?: string;
} {
  const validRoles = ["FACTORY", "ADMIN", "DESIGNER", "SYSTEM"] as const;

  // Get role header
  let roleHeader = headers["x-iimos-actor-role"];
  if (Array.isArray(roleHeader)) roleHeader = roleHeader[0];
  const role = validRoles.find((r) => r === roleHeader?.toUpperCase());

  // Get name header (limit to 64 chars)
  let nameHeader = headers["x-iimos-actor-name"];
  if (Array.isArray(nameHeader)) nameHeader = nameHeader[0];
  const name = nameHeader ? nameHeader.slice(0, 64) : undefined;

  return {
    role: role ?? "SYSTEM",
    name,
  };
}

// ============================================================================
// Utility
// ============================================================================

/**
 * Check if activity file exists for a job.
 */
export async function hasActivity(jobIdRaw: string): Promise<boolean> {
  const jobId = safeJobId(jobIdRaw);
  return existsSync(activityPath(jobId));
}

/**
 * Get activity file stats for a job.
 */
export async function getActivityStats(jobIdRaw: string): Promise<{
  exists: boolean;
  lineCount: number;
  sizeBytes: number;
} | null> {
  const jobId = safeJobId(jobIdRaw);
  const filePath = activityPath(jobId);

  try {
    const stat = await fs.stat(filePath);
    const txt = readFileSync(filePath, "utf8");
    const lineCount = txt.split("\n").filter(Boolean).length;

    return {
      exists: true,
      lineCount,
      sizeBytes: stat.size,
    };
  } catch {
    return null;
  }
}
