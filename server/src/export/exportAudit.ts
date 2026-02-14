/**
 * exportAudit.ts - Export Audit Trail (P2.2a)
 *
 * JSONL-based audit log for export attempts.
 *
 * GUARANTEES:
 * - Every export attempt is logged
 * - Append-only (immutable entries)
 * - File-based persistence (JSONL format)
 * - Queryable by bundleId, jobId, status
 * - Retention policy support
 *
 * ARCHITECTURE:
 * - Primary storage: JSONL file (audit.jsonl)
 * - In-memory cache for fast queries
 * - Auto-rotation support (future)
 */

import { randomBytes } from 'crypto';
import { existsSync, appendFileSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { AuditEntry, AuditQuery, AuditStats, AuditStatus } from './exportTypes.js';

// ============================================================================
// Configuration
// ============================================================================

const AUDIT_DIR = process.env.AUDIT_DIR ?? './data';
const AUDIT_FILE = join(AUDIT_DIR, 'audit.jsonl');
const MAX_MEMORY_ENTRIES = 10000;

// ============================================================================
// In-Memory Cache
// ============================================================================

let auditCache: AuditEntry[] = [];
let cacheLoaded = false;

/**
 * Ensure cache is loaded from disk.
 */
function ensureCacheLoaded(): void {
  if (cacheLoaded) return;

  try {
    if (existsSync(AUDIT_FILE)) {
      const content = readFileSync(AUDIT_FILE, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as AuditEntry;
          auditCache.push(entry);
        } catch {
          // Skip malformed lines
        }
      }

      // Enforce memory limit (keep newest)
      if (auditCache.length > MAX_MEMORY_ENTRIES) {
        auditCache = auditCache.slice(-MAX_MEMORY_ENTRIES);
      }
    }
  } catch (error) {
    console.error('[AUDIT] Failed to load audit file:', error);
  }

  cacheLoaded = true;
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate unique audit entry ID.
 */
function generateAuditId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `audit_${timestamp}_${random}`;
}

// ============================================================================
// Logging Functions
// ============================================================================

/**
 * Log an export attempt (core function).
 */
export function logExportAttempt(
  entry: Omit<AuditEntry, 'id' | 'timestamp'>
): AuditEntry {
  ensureCacheLoaded();

  const fullEntry: AuditEntry = {
    id: generateAuditId(),
    timestamp: new Date().toISOString(),
    ...entry,
  };

  // Append to JSONL file
  try {
    const line = JSON.stringify(fullEntry) + '\n';
    appendFileSync(AUDIT_FILE, line, 'utf-8');
  } catch (error) {
    console.error('[AUDIT] Failed to write audit entry:', error);
  }

  // Add to memory cache
  auditCache.push(fullEntry);

  // Enforce memory limit
  if (auditCache.length > MAX_MEMORY_ENTRIES) {
    auditCache.shift();
  }

  // Log to console
  const statusIcon = fullEntry.status === 'PASS' ? '✓' : '✗';
  console.log(
    `[AUDIT] ${statusIcon} ${fullEntry.status} | Bundle: ${fullEntry.bundleId.slice(0, 8)}... | Format: ${fullEntry.format}`
  );

  return fullEntry;
}

/**
 * Log a successful export.
 */
export function logExportSuccess(args: {
  bundleId: string;
  jobId?: string;
  format: string;
  requester?: string;
  zipHashHex: string;
  fileCount: number;
  processingTimeMs: number;
  meta?: Record<string, unknown>;
}): AuditEntry {
  return logExportAttempt({
    status: 'PASS',
    bundleId: args.bundleId,
    jobId: args.jobId,
    format: args.format,
    requester: args.requester,
    zipHashHex: args.zipHashHex,
    fileCount: args.fileCount,
    processingTimeMs: args.processingTimeMs,
    meta: args.meta,
  });
}

/**
 * Log a failed verification.
 */
export function logVerifyFail(args: {
  bundleId: string;
  format: string;
  requester?: string;
  issueCount: number;
  errorCount: number;
  error?: string;
}): AuditEntry {
  return logExportAttempt({
    status: 'FAIL',
    bundleId: args.bundleId,
    format: args.format,
    requester: args.requester,
    verify: {
      ok: false,
      issueCount: args.issueCount,
      errorCount: args.errorCount,
    },
    error: args.error ?? 'Verification failed',
  });
}

/**
 * Log a policy denial.
 */
export function logPolicyDenied(args: {
  bundleId: string;
  format: string;
  requester?: string;
  deniedReason: string;
}): AuditEntry {
  return logExportAttempt({
    status: 'DENIED',
    bundleId: args.bundleId,
    format: args.format,
    requester: args.requester,
    policy: {
      ok: false,
      deniedReason: args.deniedReason,
    },
    error: `Policy denied: ${args.deniedReason}`,
  });
}

/**
 * Log an error.
 */
export function logExportError(args: {
  bundleId: string;
  format: string;
  requester?: string;
  error: string;
}): AuditEntry {
  return logExportAttempt({
    status: 'ERROR',
    bundleId: args.bundleId,
    format: args.format,
    requester: args.requester,
    error: args.error,
  });
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Query audit entries.
 */
export function queryAudit(query: AuditQuery = {}): AuditEntry[] {
  ensureCacheLoaded();

  let results = [...auditCache];

  // Filter by bundleId
  if (query.bundleId) {
    results = results.filter((e) => e.bundleId === query.bundleId);
  }

  // Filter by jobId
  if (query.jobId) {
    results = results.filter((e) => e.jobId === query.jobId);
  }

  // Filter by status
  if (query.status) {
    results = results.filter((e) => e.status === query.status);
  }

  // Filter by format
  if (query.format) {
    results = results.filter((e) => e.format === query.format);
  }

  // Filter by date range
  if (query.fromIso) {
    results = results.filter((e) => e.timestamp >= query.fromIso!);
  }
  if (query.toIso) {
    results = results.filter((e) => e.timestamp <= query.toIso!);
  }

  // Sort by timestamp descending (newest first)
  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Apply pagination
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 100;
  results = results.slice(offset, offset + limit);

  return results;
}

/**
 * Get audit entry by ID.
 */
export function getAuditEntry(id: string): AuditEntry | null {
  ensureCacheLoaded();
  return auditCache.find((e) => e.id === id) ?? null;
}

/**
 * Get audit statistics.
 */
export function getAuditStats(): AuditStats {
  ensureCacheLoaded();

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const byStatus: Record<AuditStatus, number> = {
    PASS: 0,
    FAIL: 0,
    DENIED: 0,
    ERROR: 0,
  };

  const byFormat: Record<string, number> = {};

  let last24h = 0;
  let last7d = 0;

  for (const entry of auditCache) {
    // Count by status
    byStatus[entry.status]++;

    // Count by format
    byFormat[entry.format] = (byFormat[entry.format] ?? 0) + 1;

    // Count by time
    const entryTime = new Date(entry.timestamp).getTime();
    if (now - entryTime < day) {
      last24h++;
    }
    if (now - entryTime < 7 * day) {
      last7d++;
    }
  }

  return {
    totalEntries: auditCache.length,
    byStatus,
    byFormat,
    last24h,
    last7d,
  };
}

// ============================================================================
// Export/Import for Persistence
// ============================================================================

/**
 * Export audit log to JSON (for backup).
 */
export function exportAuditLog(): string {
  ensureCacheLoaded();
  return JSON.stringify(auditCache, null, 2);
}

/**
 * Import audit log from JSON (for restore).
 */
export function importAuditLog(json: string): number {
  ensureCacheLoaded();

  try {
    const entries = JSON.parse(json) as AuditEntry[];
    let imported = 0;

    for (const entry of entries) {
      // Skip duplicates
      if (auditCache.some((e) => e.id === entry.id)) {
        continue;
      }

      // Append to file
      const line = JSON.stringify(entry) + '\n';
      appendFileSync(AUDIT_FILE, line, 'utf-8');

      // Add to cache
      auditCache.push(entry);
      imported++;
    }

    // Enforce memory limit
    if (auditCache.length > MAX_MEMORY_ENTRIES) {
      auditCache = auditCache.slice(-MAX_MEMORY_ENTRIES);
    }

    return imported;
  } catch (e) {
    throw new Error(`Failed to import audit log: ${e}`);
  }
}

/**
 * Clear all audit entries (for testing).
 */
export function clearAuditLog(): void {
  auditCache = [];
  cacheLoaded = true;

  try {
    writeFileSync(AUDIT_FILE, '', 'utf-8');
  } catch {
    // Ignore file errors in tests
  }
}

/**
 * Get total entry count.
 */
export function getAuditCount(): number {
  ensureCacheLoaded();
  return auditCache.length;
}
