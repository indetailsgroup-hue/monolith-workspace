/**
 * jobStateStorage.ts - P10 Job State Storage
 *
 * Read/write authoritative job snapshot state.
 * Storage: JOB_STORAGE_ROOT/<jobId>/state/job.snapshot.json
 *
 * INVARIANT: specState here is the only authoritative state.
 */

import fs from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { JobSnapshotState, SpecState, Actor } from './jobStateTypes.js';

// ============================================================================
// Configuration
// ============================================================================

function envOr(name: string, fallback: string): string {
  const val = process.env[name];
  return val && val.trim() ? val.trim() : fallback;
}

function jobStorageRoot(): string {
  return envOr('JOB_STORAGE_ROOT', './data/jobs');
}

// ============================================================================
// Path Safety
// ============================================================================

/**
 * Sanitize job ID to prevent path traversal.
 * Strict allowlist: alphanumeric, dash, underscore, dot only.
 */
export function safeJobId(jobIdRaw: string): string {
  const jobId = String(jobIdRaw || '').trim();

  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(jobId)) {
    throw new Error('Invalid jobId: must be 1-80 chars, alphanumeric/dash/underscore/dot only');
  }

  if (jobId.includes('..') || jobId.includes('/') || jobId.includes('\\')) {
    throw new Error('Invalid jobId: path traversal blocked');
  }

  return jobId;
}

/**
 * Get job root directory with path traversal protection.
 */
function getJobRoot(jobIdRaw: string): string {
  const jobId = safeJobId(jobIdRaw);
  const root = jobStorageRoot();

  const joined = path.join(root, jobId);
  const normalizedRoot = path.resolve(root);
  const normalizedPath = path.resolve(joined);

  if (!normalizedPath.startsWith(normalizedRoot + path.sep) && normalizedPath !== normalizedRoot) {
    throw new Error('Path traversal blocked');
  }

  return normalizedPath;
}

/**
 * Get snapshot file path for a job.
 */
function snapshotPath(jobId: string): string {
  return path.join(getJobRoot(jobId), 'state', 'job.snapshot.json');
}

/**
 * Get packet.json path for a job (if exists).
 */
export function packetPath(jobId: string): string {
  return path.join(getJobRoot(jobId), 'packet.json');
}

/**
 * Get manifest.json path for a job (if exists).
 */
export function manifestPath(jobId: string): string {
  return path.join(getJobRoot(jobId), 'manifest.json');
}

// ============================================================================
// Hash Helpers
// ============================================================================

/**
 * Compute SHA-256 hex hash of a buffer.
 */
export function sha256Hex(data: Buffer | string): string {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Compute SHA-256 hex hash of a file.
 */
export async function sha256FileHex(filePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath);
    return sha256Hex(buffer);
  } catch {
    return null;
  }
}

// ============================================================================
// Snapshot CRUD
// ============================================================================

/**
 * Create a new DRAFT snapshot for a job.
 */
export function newSnapshot(jobId: string, actor?: Actor): JobSnapshotState {
  const now = new Date().toISOString();
  return {
    jobId,
    specState: 'DRAFT',
    updatedAt: now,
    updatedBy: actor,
  };
}

/**
 * Read job snapshot from disk.
 * Returns new DRAFT snapshot if file doesn't exist.
 */
export async function readJobSnapshot(jobIdRaw: string): Promise<JobSnapshotState> {
  const jobId = safeJobId(jobIdRaw);
  const p = snapshotPath(jobId);

  try {
    const txt = await fs.readFile(p, 'utf8');
    const obj = JSON.parse(txt) as JobSnapshotState;

    // Sanity check
    if (!obj || obj.jobId !== jobId) {
      console.warn(`[State] Invalid snapshot for ${jobId}, returning new DRAFT`);
      return newSnapshot(jobId);
    }

    return obj;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === 'ENOENT') {
      // No snapshot yet = DRAFT
      return newSnapshot(jobId);
    }
    throw e;
  }
}

/**
 * Write job snapshot to disk.
 */
export async function writeJobSnapshot(jobIdRaw: string, snapshot: JobSnapshotState): Promise<void> {
  const jobId = safeJobId(jobIdRaw);
  const p = snapshotPath(jobId);

  // Ensure directory exists
  const dir = path.dirname(p);
  await fs.mkdir(dir, { recursive: true });

  // Write deterministic JSON
  const txt = JSON.stringify(snapshot, null, 2);
  await fs.writeFile(p, txt + '\n', 'utf8');

  console.log(`[State] Wrote snapshot for ${jobId}: ${snapshot.specState}`);
}

// ============================================================================
// Transition Validation
// ============================================================================

/**
 * Valid state transitions:
 * - DRAFT -> FROZEN
 * - FROZEN -> RELEASED
 * - RELEASED -> FROZEN (revoke)
 */
export function assertTransition(from: SpecState, to: SpecState): void {
  const valid =
    (from === 'DRAFT' && to === 'FROZEN') ||
    (from === 'FROZEN' && to === 'RELEASED') ||
    (from === 'RELEASED' && to === 'FROZEN'); // revoke path

  if (!valid) {
    throw new Error(`Invalid state transition: ${from} -> ${to}`);
  }
}

/**
 * Check if transition is valid (non-throwing).
 */
export function isValidTransition(from: SpecState, to: SpecState): boolean {
  return (
    (from === 'DRAFT' && to === 'FROZEN') ||
    (from === 'FROZEN' && to === 'RELEASED') ||
    (from === 'RELEASED' && to === 'FROZEN')
  );
}

// ============================================================================
// Anchor Computation
// ============================================================================

/**
 * Compute revision anchors from job artifacts.
 * Returns server-derived hashes (never trust client).
 */
export async function computeAnchors(jobIdRaw: string): Promise<{
  packetSha256?: string;
  manifestSha256?: string;
  revisionId: string;
}> {
  const jobId = safeJobId(jobIdRaw);

  // Try packet.json
  const pPath = packetPath(jobId);
  const packetSha256 = await sha256FileHex(pPath);

  // Try manifest.json
  const mPath = manifestPath(jobId);
  const manifestSha256 = await sha256FileHex(mPath);

  // Prefer manifest hash, fallback to packet hash
  const revisionId = manifestSha256 ?? packetSha256;

  if (!revisionId) {
    throw new Error(`No revision anchor available for ${jobId} (missing packet/manifest)`);
  }

  return {
    packetSha256: packetSha256 ?? undefined,
    manifestSha256: manifestSha256 ?? undefined,
    revisionId,
  };
}

/**
 * Check if two revision IDs match.
 */
export function isSameRevision(a?: string, b?: string): boolean {
  return Boolean(a && b && a === b);
}
