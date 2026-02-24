/**
 * Activity Storage - P8.1 JSONL Append-Only Per-Job
 *
 * Storage contract:
 * - JOB_STORAGE_ROOT/<jobId>/audit/activity.jsonl
 * - Append-only (immutable entries)
 * - 1 event = 1 line JSON
 * - Server time for timestamps
 *
 * P8.1 Hardening:
 * - Path traversal guard with resolve check
 * - Actor normalization (allowlist, trim, strip control chars)
 * - Malformed line counter in stats
 *
 * @version 0.12.9
 */

import { createHash } from "crypto";
import fs from "node:fs/promises";
import { existsSync, appendFileSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { ActivityRecord, ActivityRecordPartial } from "./activityTypes.js";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get job storage root from environment.
 * Falls back to ./data/jobs for development.
 */
function getJobStorageRoot(): string {
  return process.env.JOB_STORAGE_ROOT ?? process.env.JOB_DIR ?? "./data/jobs";
}

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Sanitize job ID to prevent path traversal.
 * Strict allowlist: alphanumeric, dash, underscore, dot only.
 */
function safeJobId(jobIdRaw: string): string {
  const trimmed = String(jobIdRaw || "").trim();

  // Strict allowlist pattern
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(trimmed)) {
    throw new Error("Invalid jobId: must be 1-80 chars, alphanumeric/dash/underscore/dot only");
  }

  // Block traversal patterns
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("Invalid jobId: path traversal blocked");
  }

  return trimmed;
}

/**
 * Get job root directory with path traversal protection.
 */
function getJobRoot(jobIdRaw: string): string {
  const jobId = safeJobId(jobIdRaw);
  const root = getJobStorageRoot();

  // Join and normalize
  const joined = path.join(root, jobId);
  const normalizedRoot = path.resolve(root);
  const normalizedPath = path.resolve(joined);

  // Ensure path stays within root
  if (!normalizedPath.startsWith(normalizedRoot + path.sep) && normalizedPath !== normalizedRoot) {
    throw new Error("Path traversal blocked");
  }

  return normalizedPath;
}

/**
 * Get activity file path for a job.
 * Path: JOB_STORAGE_ROOT/<jobId>/audit/activity.jsonl
 */
function activityPath(jobId: string): string {
  return path.join(getJobRoot(jobId), "audit", "activity.jsonl");
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
// Actor Normalization
// ============================================================================

const VALID_ROLES = ["FACTORY", "ADMIN", "DESIGNER", "SYSTEM"] as const;
type ActorRole = typeof VALID_ROLES[number];

/**
 * Normalize actor role (allowlist check).
 */
function normalizeRole(roleRaw: string | undefined): ActorRole {
  const role = String(roleRaw || "").trim().toUpperCase();
  if (VALID_ROLES.includes(role as ActorRole)) {
    return role as ActorRole;
  }
  return "SYSTEM";
}

/**
 * Normalize actor name (trim, max 64, strip control chars).
 */
function normalizeName(nameRaw: string | undefined): string | undefined {
  if (!nameRaw) return undefined;

  // Trim and limit length
  let name = String(nameRaw).trim().slice(0, 64);

  // Strip control characters (keep printable ASCII and common unicode)
  name = name.replace(/[\x00-\x1F\x7F]/g, "");

  return name || undefined;
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

  // Normalize actor if present
  const normalizedActor = partial.actor ? {
    role: normalizeRole(partial.actor.role),
    name: normalizeName(partial.actor.name),
  } : undefined;

  // Build base record (without id)
  const base: Omit<ActivityRecord, "id"> = {
    ...partial,
    actor: normalizedActor,
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

export interface ReadActivityResult {
  items: ActivityRecord[];
  parsedLines: number;
  malformedLines: number;
}

/**
 * Read activity records for a job.
 * Returns records sorted by timestamp DESC, id ASC (stable).
 */
export async function readActivity(
  jobIdRaw: string,
  opts?: ReadActivityOptions
): Promise<ActivityRecord[]> {
  const result = await readActivityWithStats(jobIdRaw, opts);
  return result.items;
}

/**
 * Read activity records with parse statistics.
 */
export async function readActivityWithStats(
  jobIdRaw: string,
  opts?: ReadActivityOptions
): Promise<ReadActivityResult> {
  const jobId = safeJobId(jobIdRaw);
  const limit = Math.min(5000, Math.max(50, opts?.limit ?? 2000));
  const filePath = activityPath(jobId);

  // Read file
  let txt = "";
  try {
    txt = readFileSync(filePath, "utf8");
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "ENOENT") {
      // File doesn't exist = no activity yet
      return { items: [], parsedLines: 0, malformedLines: 0 };
    }
    throw e;
  }

  // Parse JSONL
  const lines = txt.split("\n").filter(Boolean);
  const sliced = lines.slice(Math.max(0, lines.length - limit));

  const items: ActivityRecord[] = [];
  let malformedLines = 0;

  for (const line of sliced) {
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === "object") {
        items.push(obj as ActivityRecord);
      } else {
        malformedLines++;
      }
    } catch {
      // Skip malformed lines, keep reading
      malformedLines++;
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

  return {
    items,
    parsedLines: items.length,
    malformedLines,
  };
}

// ============================================================================
// Actor Extraction from Headers
// ============================================================================

/**
 * Extract actor info from request headers.
 * Uses X-MONOLITH-ACTOR-ROLE and X-MONOLITH-ACTOR-NAME headers.
 * P8.1: Normalized with allowlist and sanitization.
 */
export function extractActorFromHeaders(headers: Record<string, string | string[] | undefined>): {
  role: ActorRole;
  name?: string;
} {
  // Get role header
  let roleHeader = headers["x-monolith-actor-role"];
  if (Array.isArray(roleHeader)) roleHeader = roleHeader[0];
  const role = normalizeRole(roleHeader);

  // Get name header
  let nameHeader = headers["x-monolith-actor-name"];
  if (Array.isArray(nameHeader)) nameHeader = nameHeader[0];
  const name = normalizeName(nameHeader);

  return { role, name };
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
 * P8.1: Includes malformedLines counter.
 */
export async function getActivityStats(jobIdRaw: string): Promise<{
  exists: boolean;
  lineCount: number;
  parsedLines: number;
  malformedLines: number;
  sizeBytes: number;
  path: string;
} | null> {
  const jobId = safeJobId(jobIdRaw);
  const filePath = activityPath(jobId);

  try {
    const stat = await fs.stat(filePath);
    const txt = readFileSync(filePath, "utf8");
    const lines = txt.split("\n").filter(Boolean);

    // Count malformed lines
    let parsedLines = 0;
    let malformedLines = 0;
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj && typeof obj === "object") {
          parsedLines++;
        } else {
          malformedLines++;
        }
      } catch {
        malformedLines++;
      }
    }

    return {
      exists: true,
      lineCount: lines.length,
      parsedLines,
      malformedLines,
      sizeBytes: stat.size,
      path: filePath,
    };
  } catch {
    return null;
  }
}

/**
 * Get the activity file path for a job (for debugging).
 */
export function getActivityPath(jobIdRaw: string): string {
  return activityPath(safeJobId(jobIdRaw));
}
