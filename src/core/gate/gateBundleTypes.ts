/**
 * gateBundleTypes.ts - Gate Bundle Types for Multi-Select
 *
 * ARCHITECTURE:
 * - GateBundleResult: combined result for multiple cabinets
 * - GatePerCabinet: per-cabinet gate result
 * - Used for atomic commit validation in multi-select
 */

import type { CollisionGateIssue } from './collisionIssueCodes';

// ============================================
// BASE GATE ISSUE (compatible with existing system)
// ============================================

export interface GateIssue {
  severity: 'ERROR' | 'WARNING';
  code: string;
  message: string;
  subjectId?: string;
  relatedId?: string;
  metrics?: Record<string, number | string | boolean>;
}

// ============================================
// PER-CABINET RESULT
// ============================================

/**
 * Gate result for a single cabinet
 */
export interface GatePerCabinet {
  /** Cabinet ID */
  id: string;
  /** True if no ERROR issues for this cabinet */
  ok: boolean;
  /** All issues for this cabinet */
  issues: GateIssue[];
}

// ============================================
// BUNDLE RESULT
// ============================================

/**
 * Combined gate result for multi-select
 */
export interface GateBundleResult {
  /** True if all cabinets pass (no ERROR issues) */
  ok: boolean;
  /** Per-cabinet results */
  perCabinet: GatePerCabinet[];
  /** Global issues (not tied to single cabinet) */
  globalIssues: GateIssue[];
  /** Total issue count */
  totalIssues: number;
  /** Error count */
  errorCount: number;
  /** Warning count */
  warningCount: number;
}

// ============================================
// HELPERS
// ============================================

/**
 * Create empty bundle result (all ok)
 */
export function createEmptyBundleResult(): GateBundleResult {
  return {
    ok: true,
    perCabinet: [],
    globalIssues: [],
    totalIssues: 0,
    errorCount: 0,
    warningCount: 0,
  };
}

/**
 * Get all issues from bundle (flattened)
 */
export function getAllIssues(bundle: GateBundleResult): GateIssue[] {
  const issues: GateIssue[] = [...bundle.globalIssues];
  for (const pc of bundle.perCabinet) {
    issues.push(...pc.issues);
  }
  return issues;
}

/**
 * Get issues for a specific cabinet
 */
export function getIssuesForCabinet(
  bundle: GateBundleResult,
  cabinetId: string
): GateIssue[] {
  const pc = bundle.perCabinet.find(p => p.id === cabinetId);
  return pc?.issues ?? [];
}

/**
 * Get all cabinet IDs with errors
 */
export function getCabinetIdsWithErrors(bundle: GateBundleResult): string[] {
  return bundle.perCabinet
    .filter(pc => !pc.ok)
    .map(pc => pc.id);
}

/**
 * Filter bundle by cabinet IDs
 */
export function filterBundleByIds(
  bundle: GateBundleResult,
  ids: Set<string>
): GateBundleResult {
  const filtered = bundle.perCabinet.filter(pc => ids.has(pc.id));
  const ok = filtered.every(pc => pc.ok);

  let errorCount = 0;
  let warningCount = 0;
  let totalIssues = 0;

  for (const pc of filtered) {
    for (const issue of pc.issues) {
      totalIssues++;
      if (issue.severity === 'ERROR') errorCount++;
      else warningCount++;
    }
  }

  return {
    ok,
    perCabinet: filtered,
    globalIssues: bundle.globalIssues,
    totalIssues,
    errorCount,
    warningCount,
  };
}

/**
 * Merge multiple bundle results
 */
export function mergeBundleResults(bundles: GateBundleResult[]): GateBundleResult {
  const perCabinet: GatePerCabinet[] = [];
  const globalIssues: GateIssue[] = [];

  // Merge per-cabinet (latest wins for same ID)
  const byId = new Map<string, GatePerCabinet>();
  for (const bundle of bundles) {
    for (const pc of bundle.perCabinet) {
      byId.set(pc.id, pc);
    }
    globalIssues.push(...bundle.globalIssues);
  }
  perCabinet.push(...byId.values());

  // Calculate totals
  let errorCount = 0;
  let warningCount = 0;
  let totalIssues = 0;

  for (const pc of perCabinet) {
    for (const issue of pc.issues) {
      totalIssues++;
      if (issue.severity === 'ERROR') errorCount++;
      else warningCount++;
    }
  }
  for (const issue of globalIssues) {
    totalIssues++;
    if (issue.severity === 'ERROR') errorCount++;
    else warningCount++;
  }

  const ok = errorCount === 0;

  return { ok, perCabinet, globalIssues, totalIssues, errorCount, warningCount };
}
