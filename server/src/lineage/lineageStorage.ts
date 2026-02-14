/**
 * lineageStorage.ts - P9.1 Server Lineage Storage
 *
 * Append-only JSONL storage for lineage events.
 * Storage: LINEAGE_DIR/<jobId>/lineage.jsonl
 *
 * INVARIANT: Events are never deleted, only appended.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  LineageEvent,
  LineageEventType,
  LineageActor,
  LineageRevision,
  LineageExport,
  ChangeClass,
  LineageAppendResult,
} from './lineageTypes.js';

// ============================================================================
// Utilities
// ============================================================================

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function envOr(name: string, fallback: string): string {
  const val = process.env[name];
  return val && val.trim() ? val.trim() : fallback;
}

/**
 * Validate and sanitize job ID
 */
export function safeJobId(jobIdRaw: string): string {
  const jobId = String(jobIdRaw || '').trim();
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(jobId)) {
    throw new Error('Invalid jobId');
  }
  if (jobId.includes('..') || jobId.includes('/') || jobId.includes('\\')) {
    throw new Error('Invalid jobId');
  }
  return jobId;
}

// ============================================================================
// Paths
// ============================================================================

function lineageDir(): string {
  return envOr('LINEAGE_DIR', './data/lineage');
}

function lineagePath(jobId: string): string {
  const safe = safeJobId(jobId);
  return path.join(lineageDir(), safe, 'lineage.jsonl');
}

// ============================================================================
// Canonical JSON for Event ID
// ============================================================================

function canonicalPayload(event: Omit<LineageEvent, 'id'>): string {
  // Deterministic JSON for event ID calculation
  return JSON.stringify({
    type: event.type,
    at: event.at,
    jobId: event.jobId,
    specId: event.specId,
    actor: event.actor,
    revision: event.revision,
    export: event.export,
    changeClass: event.changeClass,
    note: event.note,
  });
}

// ============================================================================
// Append Event
// ============================================================================

export interface AppendLineageEventParams {
  type: LineageEventType;
  actor?: LineageActor;
  revision: LineageRevision;
  changeClass?: ChangeClass;
  note?: string;
  export?: LineageExport;
}

/**
 * Append a lineage event to storage (server-side only)
 *
 * @param jobIdRaw - Job identifier
 * @param params - Event parameters (without id, at, jobId, specId)
 * @returns The created event with server-derived id and timestamp
 */
export async function appendLineageEvent(
  jobIdRaw: string,
  params: AppendLineageEventParams
): Promise<LineageAppendResult> {
  try {
    const jobId = safeJobId(jobIdRaw);
    const at = new Date().toISOString();

    // Build event without ID
    const base: Omit<LineageEvent, 'id'> = {
      at,
      jobId,
      specId: jobId, // Until server owns spec identity separately
      type: params.type,
      revision: params.revision,
    };

    if (params.actor) base.actor = params.actor;
    if (params.changeClass) base.changeClass = params.changeClass;
    if (params.note) base.note = params.note;
    if (params.export) base.export = params.export;

    // Compute deterministic event ID
    const id = sha256Hex(canonicalPayload(base));
    const event: LineageEvent = { ...base, id };

    // Append to JSONL file
    const p = lineagePath(jobId);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.appendFile(p, JSON.stringify(event) + '\n', 'utf8');

    console.log(`[Lineage] Appended ${event.type} for job ${jobId}:`, event.id.slice(0, 16));

    return { ok: true, event };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    console.error('[Lineage] Append failed:', error);
    return { ok: false, error };
  }
}

// ============================================================================
// Read Events
// ============================================================================

export interface ReadLineageOptions {
  limit?: number;
  offset?: number;
  type?: LineageEventType | LineageEventType[];
}

/**
 * Read lineage events for a job
 *
 * @param jobIdRaw - Job identifier
 * @param opts - Query options
 * @returns Array of events (newest first)
 */
export async function readLineageEvents(
  jobIdRaw: string,
  opts?: ReadLineageOptions
): Promise<LineageEvent[]> {
  const jobId = safeJobId(jobIdRaw);
  const p = lineagePath(jobId);
  const limit = Math.min(5000, Math.max(50, Number(opts?.limit ?? 2000)));

  let txt = '';
  try {
    txt = await fs.readFile(p, 'utf8');
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return [];
    }
    throw e;
  }

  const lines = txt.split('\n').filter(Boolean);

  // Parse all events
  let items: LineageEvent[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === 'object') {
        items.push(obj as LineageEvent);
      }
    } catch {
      // Ignore malformed lines
    }
  }

  // Filter by type if specified
  if (opts?.type) {
    const types = Array.isArray(opts.type) ? opts.type : [opts.type];
    items = items.filter((e) => types.includes(e.type));
  }

  // Sort by timestamp DESC, then id ASC
  items.sort((a, b) => {
    const ta = Date.parse(String(a.at || ''));
    const tb = Date.parse(String(b.at || ''));
    const da = Number.isFinite(ta) ? ta : 0;
    const db = Number.isFinite(tb) ? tb : 0;
    if (db !== da) return db - da;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  // Apply offset and limit
  const offset = opts?.offset ?? 0;
  return items.slice(offset, offset + limit);
}

// ============================================================================
// Get Latest Revision
// ============================================================================

/**
 * Get the latest revision ID for a job (HEAD)
 */
export async function getLatestRevisionId(
  jobIdRaw: string
): Promise<string | null> {
  const events = await readLineageEvents(jobIdRaw, { limit: 100 });

  // Find most recent SPEC_RELEASED or SPEC_FROZEN event
  for (const event of events) {
    if (event.type === 'SPEC_RELEASED' || event.type === 'SPEC_FROZEN') {
      return event.revision.revisionId;
    }
  }

  // Fallback to any event with revisionId
  for (const event of events) {
    if (event.revision.revisionId) {
      return event.revision.revisionId;
    }
  }

  return null;
}

// ============================================================================
// Convenience: Record Export Success
// ============================================================================

export interface RecordExportParams {
  jobId: string;
  revisionId: string;
  manifestSha256?: string;
  packetSha256?: string;
  artifactSha256: string;
  artifactName?: string;
  sizeBytes?: number;
  dialect?: string;
  profileId?: string;
  mode?: string;
  target?: string;
  actor?: LineageActor;
  note?: string;
}

/**
 * Record an EXPORT_SUCCESS_LINK event
 */
export async function recordExportSuccess(
  params: RecordExportParams
): Promise<LineageAppendResult> {
  return appendLineageEvent(params.jobId, {
    type: 'EXPORT_SUCCESS_LINK',
    actor: params.actor,
    revision: {
      revisionId: params.revisionId,
      manifestSha256: params.manifestSha256,
      packetSha256: params.packetSha256,
    },
    export: {
      exportId: params.artifactSha256,
      artifactSha256: params.artifactSha256,
      artifactName: params.artifactName,
      sizeBytes: params.sizeBytes,
      dialect: params.dialect,
      profileId: params.profileId,
      mode: params.mode,
      target: params.target,
    },
    note: params.note,
  });
}
