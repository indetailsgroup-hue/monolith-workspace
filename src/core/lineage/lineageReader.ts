/**
 * lineageReader.ts - P9 Spec Lineage Reader
 *
 * NORTH STAR: Query and visualize the audit trail
 *
 * FEATURES:
 * - Load all events for a job
 * - Filter by type, revision, time range
 * - Build lineage graph for visualization
 * - Find ancestors/descendants of a revision
 *
 * GATE RULE (G9): Uses Zod validation for localStorage lineage data.
 */

import type {
  SpecLineageEvent,
  SpecLineageEventType,
  LineageChain,
  LineageQueryOptions,
  LineageGraph,
  LineageGraphNode,
  LineageReadResult,
} from './lineageTypes';
import { SpecLineageEventSchema } from './lineage.schema';
import { validateExternalStateSafe } from '../gate/validateExternalState';

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
// READ EVENTS
// ============================================

/**
 * Parse JSONL string into events array with G9 validation
 */
function parseJsonl(jsonl: string): SpecLineageEvent[] {
  if (!jsonl.trim()) {
    return [];
  }

  const lines = jsonl.split('\n').filter((line) => line.trim());
  const events: SpecLineageEvent[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);

      // G9: Validate each event with Zod schema
      const result = validateExternalStateSafe(SpecLineageEventSchema, parsed, 'lineage-event');
      if (result.ok) {
        events.push(result.data as SpecLineageEvent);
      } else {
        // Log validation failure but don't crash - audit trail should be recoverable
        console.warn('[Lineage] G9 validation failed for event:', result.issues);
      }
    } catch {
      // Skip malformed JSON lines
      console.warn('[Lineage] Malformed JSONL line:', line.substring(0, 100));
    }
  }

  return events;
}

/**
 * Load all lineage events for a job
 */
export function loadLineage(jobId: string): LineageReadResult {
  try {
    const key = getStorageKey(jobId);
    const jsonl = localStorage.getItem(key) || '';
    const events = parseJsonl(jsonl);

    // Find HEAD (latest release or frozen revision)
    let headRevisionId: string | undefined;
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.type === 'SPEC_RELEASED' || event.type === 'SPEC_FROZEN') {
        headRevisionId = event.revision.revisionId;
        break;
      }
    }

    const chain: LineageChain = {
      jobId,
      events,
      headRevisionId,
      eventCount: events.length,
    };

    return { ok: true, chain };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : 'Failed to load lineage',
    };
  }
}

// ============================================
// QUERY EVENTS
// ============================================

/**
 * Query lineage events with filters
 */
export function queryLineage(
  jobId: string,
  options: LineageQueryOptions = {}
): SpecLineageEvent[] {
  const result = loadLineage(jobId);
  if (!result.ok) {
    return [];
  }

  let events = result.chain.events;

  // Filter by type
  if (options.type) {
    const types = Array.isArray(options.type) ? options.type : [options.type];
    events = events.filter((e) => types.includes(e.type));
  }

  // Filter by revision ID
  if (options.revisionId) {
    events = events.filter((e) => e.revision.revisionId === options.revisionId);
  }

  // Filter by time range
  if (options.after) {
    events = events.filter((e) => e.at >= options.after!);
  }
  if (options.before) {
    events = events.filter((e) => e.at <= options.before!);
  }

  // Pagination
  if (options.offset) {
    events = events.slice(options.offset);
  }
  if (options.limit) {
    events = events.slice(0, options.limit);
  }

  return events;
}

// ============================================
// GRAPH BUILDING
// ============================================

/**
 * Build lineage graph from events
 */
export function buildLineageGraph(jobId: string): LineageGraph {
  const result = loadLineage(jobId);
  const nodes = new Map<string, LineageGraphNode>();
  const roots: string[] = [];
  const heads: string[] = [];

  if (!result.ok) {
    return { nodes, roots, heads };
  }

  const events = result.chain.events;

  // First pass: create nodes
  for (const event of events) {
    const revisionId = event.revision.revisionId;

    if (!nodes.has(revisionId)) {
      nodes.set(revisionId, {
        revisionId,
        parentRevisionId: event.revision.parentRevisionId,
        events: [],
        children: [],
        depth: 0,
      });
    }

    nodes.get(revisionId)!.events.push(event);
  }

  // Second pass: build parent-child relationships
  for (const node of Array.from(nodes.values())) {
    if (node.parentRevisionId && nodes.has(node.parentRevisionId)) {
      const parent = nodes.get(node.parentRevisionId)!;
      if (!parent.children.includes(node.revisionId)) {
        parent.children.push(node.revisionId);
      }
    } else if (!node.parentRevisionId) {
      // No parent = root node
      roots.push(node.revisionId);
    }
  }

  // Third pass: calculate depths
  function setDepth(revisionId: string, depth: number): void {
    const node = nodes.get(revisionId);
    if (!node) return;
    node.depth = depth;
    for (const childId of node.children) {
      setDepth(childId, depth + 1);
    }
  }

  for (const rootId of roots) {
    setDepth(rootId, 0);
  }

  // Fourth pass: find heads (nodes with no children)
  for (const node of Array.from(nodes.values())) {
    if (node.children.length === 0) {
      heads.push(node.revisionId);
    }
  }

  return { nodes, roots, heads };
}

// ============================================
// ANCESTOR/DESCENDANT QUERIES
// ============================================

/**
 * Get all ancestors of a revision
 */
export function getAncestors(
  jobId: string,
  revisionId: string
): SpecLineageEvent[] {
  const graph = buildLineageGraph(jobId);
  const ancestors: SpecLineageEvent[] = [];
  const visited = new Set<string>();

  function walk(id: string): void {
    const node = graph.nodes.get(id);
    if (!node || visited.has(id)) return;
    visited.add(id);

    if (node.parentRevisionId) {
      const parent = graph.nodes.get(node.parentRevisionId);
      if (parent) {
        ancestors.push(...parent.events);
        walk(node.parentRevisionId);
      }
    }
  }

  walk(revisionId);
  return ancestors;
}

/**
 * Get all descendants of a revision
 */
export function getDescendants(
  jobId: string,
  revisionId: string
): SpecLineageEvent[] {
  const graph = buildLineageGraph(jobId);
  const descendants: SpecLineageEvent[] = [];
  const visited = new Set<string>();

  function walk(id: string): void {
    const node = graph.nodes.get(id);
    if (!node || visited.has(id)) return;
    visited.add(id);

    for (const childId of node.children) {
      const child = graph.nodes.get(childId);
      if (child) {
        descendants.push(...child.events);
        walk(childId);
      }
    }
  }

  walk(revisionId);
  return descendants;
}

// ============================================
// REVISION LOOKUP
// ============================================

/**
 * Get events for a specific revision
 */
export function getRevisionEvents(
  jobId: string,
  revisionId: string
): SpecLineageEvent[] {
  return queryLineage(jobId, { revisionId });
}

/**
 * Get the latest event for a job
 */
export function getLatestEvent(jobId: string): SpecLineageEvent | null {
  const result = loadLineage(jobId);
  if (!result.ok || result.chain.events.length === 0) {
    return null;
  }
  return result.chain.events[result.chain.events.length - 1];
}

/**
 * Get HEAD revision ID
 */
export function getHeadRevisionId(jobId: string): string | null {
  const result = loadLineage(jobId);
  if (!result.ok) {
    return null;
  }
  return result.chain.headRevisionId || null;
}

// ============================================
// STATISTICS
// ============================================

/**
 * Get lineage statistics for a job
 */
export function getLineageStats(jobId: string): {
  totalEvents: number;
  revisionCount: number;
  freezeCount: number;
  releaseCount: number;
  exportCount: number;
  revokeCount: number;
} {
  const result = loadLineage(jobId);
  if (!result.ok) {
    return {
      totalEvents: 0,
      revisionCount: 0,
      freezeCount: 0,
      releaseCount: 0,
      exportCount: 0,
      revokeCount: 0,
    };
  }

  const events = result.chain.events;
  const revisions = new Set<string>();

  let freezeCount = 0;
  let releaseCount = 0;
  let exportCount = 0;
  let revokeCount = 0;

  for (const event of events) {
    revisions.add(event.revision.revisionId);

    switch (event.type) {
      case 'SPEC_FROZEN':
        freezeCount++;
        break;
      case 'SPEC_RELEASED':
        releaseCount++;
        break;
      case 'EXPORT_SUCCESS_LINK':
        exportCount++;
        break;
      case 'SPEC_REVOKED':
        revokeCount++;
        break;
    }
  }

  return {
    totalEvents: events.length,
    revisionCount: revisions.size,
    freezeCount,
    releaseCount,
    exportCount,
    revokeCount,
  };
}

// ============================================
// EXPORT TO JSONL
// ============================================

/**
 * Export lineage as JSONL string (for backup/transfer)
 */
export function exportLineageJsonl(jobId: string): string {
  const key = getStorageKey(jobId);
  return localStorage.getItem(key) || '';
}

/**
 * Import lineage from JSONL string (merges with existing)
 */
export function importLineageJsonl(jobId: string, jsonl: string): number {
  const key = getStorageKey(jobId);
  const existingJsonl = localStorage.getItem(key) || '';
  const existingEvents = parseJsonl(existingJsonl);
  const newEvents = parseJsonl(jsonl);

  // Build set of existing event IDs
  const existingIds = new Set(existingEvents.map((e) => e.id));

  // Filter new events that don't exist yet
  const uniqueNew = newEvents.filter((e) => !existingIds.has(e.id));

  if (uniqueNew.length === 0) {
    return 0;
  }

  // Append unique new events
  const newLines = uniqueNew.map((e) => JSON.stringify(e)).join('\n');
  const updated = existingJsonl ? `${existingJsonl}\n${newLines}` : newLines;
  localStorage.setItem(key, updated);

  return uniqueNew.length;
}
