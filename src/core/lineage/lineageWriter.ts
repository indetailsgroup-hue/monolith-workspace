/**
 * lineageWriter.ts - P9 Spec Lineage Writer
 *
 * NORTH STAR: Append-only audit trail for job artifacts
 *
 * STORAGE: Browser localStorage with JSONL format
 * KEY: `lineage:${jobId}`
 *
 * INVARIANT: Events are never deleted, only appended
 */

import type {
  SpecLineageEvent,
  SpecLineageEventType,
  LineageActor,
  LineageRevision,
  LineageExport,
  ChangeClass,
  LineageWriteResult,
} from './lineageTypes';
import { sha256TextHex } from '../crypto/hashBytes';

// ============================================
// STORAGE KEY
// ============================================

/**
 * Get storage key for job lineage
 */
function getStorageKey(jobId: string): string {
  return `lineage:${jobId}`;
}

// ============================================
// CANONICAL JSON
// ============================================

/**
 * Create canonical JSON for hashing
 * - Sorted keys
 * - No whitespace
 * - Deterministic output
 */
function canonicalJson(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const value = obj[key];
    if (value !== undefined && value !== null) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        sorted[key] = JSON.parse(canonicalJson(value as Record<string, unknown>));
      } else {
        sorted[key] = value;
      }
    }
  }
  return JSON.stringify(sorted);
}

// ============================================
// EVENT BUILDER
// ============================================

/**
 * Parameters for building a lineage event
 */
export interface BuildLineageEventParams {
  jobId: string;
  specId: string;
  type: SpecLineageEventType;
  revision: LineageRevision;
  actor?: LineageActor;
  note?: string;
  changeClass?: ChangeClass;
  export?: LineageExport;
}

/**
 * Build a lineage event with computed ID
 */
export async function buildLineageEvent(
  params: BuildLineageEventParams
): Promise<SpecLineageEvent> {
  const at = new Date().toISOString();

  // Build payload for hashing (without id)
  const payload: Omit<SpecLineageEvent, 'id'> = {
    at,
    jobId: params.jobId,
    specId: params.specId,
    type: params.type,
    revision: params.revision,
  };

  if (params.actor) {
    payload.actor = params.actor;
  }
  if (params.note) {
    payload.note = params.note;
  }
  if (params.changeClass) {
    payload.changeClass = params.changeClass;
  }
  if (params.export) {
    payload.export = params.export;
  }

  // Compute event ID from canonical JSON
  const canonical = canonicalJson(payload as Record<string, unknown>);
  const id = await sha256TextHex(canonical);

  return {
    id,
    ...payload,
  };
}

// ============================================
// APPEND EVENT
// ============================================

/**
 * Append a lineage event to storage
 *
 * INVARIANT: Never overwrites, only appends
 */
export async function appendLineageEvent(
  event: SpecLineageEvent
): Promise<LineageWriteResult> {
  try {
    const key = getStorageKey(event.jobId);

    // Read existing JSONL
    const existing = localStorage.getItem(key) || '';

    // Append new event as JSONL line
    const line = JSON.stringify(event);
    const updated = existing ? `${existing}\n${line}` : line;

    // Write back
    localStorage.setItem(key, updated);

    return { ok: true, eventId: event.id };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : 'Failed to append lineage event',
    };
  }
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Record a SPEC_FROZEN event
 */
export async function recordSpecFrozen(params: {
  jobId: string;
  specId: string;
  revisionId: string;
  parentRevisionId?: string;
  packetSha256: string;
  actor?: LineageActor;
  changeClass?: ChangeClass;
  note?: string;
}): Promise<LineageWriteResult> {
  const event = await buildLineageEvent({
    jobId: params.jobId,
    specId: params.specId,
    type: 'SPEC_FROZEN',
    revision: {
      revisionId: params.revisionId,
      parentRevisionId: params.parentRevisionId,
      packetSha256: params.packetSha256,
    },
    actor: params.actor,
    changeClass: params.changeClass,
    note: params.note,
  });

  return appendLineageEvent(event);
}

/**
 * Record a SPEC_RELEASED event
 */
export async function recordSpecReleased(params: {
  jobId: string;
  specId: string;
  revisionId: string;
  parentRevisionId?: string;
  manifestSha256: string;
  actor?: LineageActor;
  note?: string;
}): Promise<LineageWriteResult> {
  const event = await buildLineageEvent({
    jobId: params.jobId,
    specId: params.specId,
    type: 'SPEC_RELEASED',
    revision: {
      revisionId: params.revisionId,
      parentRevisionId: params.parentRevisionId,
      manifestSha256: params.manifestSha256,
    },
    actor: params.actor,
    note: params.note,
  });

  return appendLineageEvent(event);
}

/**
 * Record a SPEC_REVOKED event
 */
export async function recordSpecRevoked(params: {
  jobId: string;
  specId: string;
  revisionId: string;
  actor?: LineageActor;
  note?: string;
}): Promise<LineageWriteResult> {
  const event = await buildLineageEvent({
    jobId: params.jobId,
    specId: params.specId,
    type: 'SPEC_REVOKED',
    revision: {
      revisionId: params.revisionId,
    },
    actor: params.actor,
    note: params.note,
  });

  return appendLineageEvent(event);
}

/**
 * Record an EXPORT_SUCCESS_LINK event
 */
export async function recordExportLink(params: {
  jobId: string;
  specId: string;
  revisionId: string;
  exportId: string;
  artifactSha256: string;
  dialect?: string;
  profileId?: string;
  mode?: string;
  actor?: LineageActor;
  note?: string;
}): Promise<LineageWriteResult> {
  const event = await buildLineageEvent({
    jobId: params.jobId,
    specId: params.specId,
    type: 'EXPORT_SUCCESS_LINK',
    revision: {
      revisionId: params.revisionId,
    },
    actor: params.actor,
    note: params.note,
    export: {
      exportId: params.exportId,
      artifactSha256: params.artifactSha256,
      dialect: params.dialect,
      profileId: params.profileId,
      mode: params.mode,
    },
  });

  return appendLineageEvent(event);
}

// ============================================
// CLEAR (FOR TESTING ONLY)
// ============================================

/**
 * Clear lineage for a job (FOR TESTING ONLY)
 *
 * WARNING: This violates the append-only invariant
 */
export function __clearLineage_TESTING_ONLY(jobId: string): void {
  const key = getStorageKey(jobId);
  localStorage.removeItem(key);
}
