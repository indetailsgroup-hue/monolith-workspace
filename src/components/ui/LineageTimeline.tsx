/**
 * LineageTimeline.tsx - P9/P9.1 Spec Lineage UI
 *
 * Visual timeline of spec state transitions and exports
 *
 * DATA SOURCE PRIORITY:
 * 1. Server endpoint (authoritative) - GET /api/factory/jobs/:jobId/lineage
 * 2. localStorage fallback (dev/offline)
 *
 * FEATURES:
 * - Chronological event list
 * - Event type icons
 * - Revision chain visualization
 * - Export linkage display
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useProjectStore } from '../../core/store/useProjectStore';
import {
  loadLineage,
  getLineageStats,
  type SpecLineageEvent,
  type LineageChain,
} from '../../core/lineage';

// ============================================
// SERVER API
// ============================================

const API_BASE = import.meta.env.VITE_API_URL || '';

interface ServerLineageResponse {
  ok: boolean;
  jobId: string;
  items: SpecLineageEvent[];
  error?: string;
}

async function fetchServerLineage(jobId: string): Promise<ServerLineageResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/factory/jobs/${encodeURIComponent(jobId)}/lineage`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

type DataSource = 'server' | 'local' | 'none';

// ============================================
// STYLES
// ============================================

const styles = {
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    padding: '16px',
    minHeight: '200px',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    borderBottom: '1px solid #3a3a5a',
    paddingBottom: '12px',
  } as React.CSSProperties,

  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    margin: 0,
  } as React.CSSProperties,

  stats: {
    display: 'flex',
    gap: '12px',
  } as React.CSSProperties,

  statBadge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '4px',
    backgroundColor: '#2a2a4e',
    color: '#8b8ba7',
  } as React.CSSProperties,

  timeline: {
    position: 'relative',
    paddingLeft: '24px',
  } as React.CSSProperties,

  timelineLine: {
    position: 'absolute',
    left: '8px',
    top: '0',
    bottom: '0',
    width: '2px',
    backgroundColor: '#3a3a5a',
  } as React.CSSProperties,

  eventItem: {
    position: 'relative',
    marginBottom: '16px',
    paddingBottom: '16px',
    borderBottom: '1px solid #2a2a4e',
  } as React.CSSProperties,

  eventDot: {
    position: 'absolute',
    left: '-20px',
    top: '4px',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    border: '2px solid #1a1a2e',
  } as React.CSSProperties,

  eventHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
  } as React.CSSProperties,

  eventType: {
    fontSize: '12px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,

  eventTime: {
    fontSize: '11px',
    color: '#6b6b8a',
  } as React.CSSProperties,

  eventDetails: {
    fontSize: '11px',
    color: '#8b8ba7',
    lineHeight: 1.5,
  } as React.CSSProperties,

  revisionId: {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: '#6b6b8a',
    backgroundColor: '#2a2a4e',
    padding: '2px 6px',
    borderRadius: '3px',
    display: 'inline-block',
    marginTop: '4px',
  } as React.CSSProperties,

  changeClass: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '3px',
    backgroundColor: '#3a3a5a',
    color: '#a0a0c0',
    marginLeft: '8px',
  } as React.CSSProperties,

  exportInfo: {
    marginTop: '8px',
    padding: '8px',
    backgroundColor: '#2a2a4e',
    borderRadius: '4px',
    fontSize: '11px',
  } as React.CSSProperties,

  emptyState: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#6b6b8a',
  } as React.CSSProperties,

  refreshButton: {
    padding: '4px 8px',
    fontSize: '11px',
    backgroundColor: 'transparent',
    border: '1px solid #3a3a5a',
    borderRadius: '4px',
    color: '#8b8ba7',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// ============================================
// EVENT TYPE CONFIG
// ============================================

const EVENT_CONFIG: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  SPEC_FROZEN: {
    icon: '❄️',
    color: '#3b82f6',
    label: 'Spec Frozen',
  },
  SPEC_RELEASED: {
    icon: '✅',
    color: '#22c55e',
    label: 'Spec Released',
  },
  SPEC_REVOKED: {
    icon: '⛔',
    color: '#ef4444',
    label: 'Spec Revoked',
  },
  EXPORT_SUCCESS_LINK: {
    icon: '📦',
    color: '#8b5cf6',
    label: 'Export Linked',
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
}

/**
 * Compute stats directly from events (for server data)
 */
function computeStatsFromEvents(events: SpecLineageEvent[]) {
  const revisions = new Set<string>();
  let releaseCount = 0;
  let exportCount = 0;

  for (const e of events) {
    if (e?.revision?.revisionId) revisions.add(e.revision.revisionId);
    if (e.type === 'SPEC_RELEASED') releaseCount++;
    if (e.type === 'EXPORT_SUCCESS_LINK') exportCount++;
  }

  return {
    revisionCount: revisions.size,
    releaseCount,
    exportCount,
  };
}

/**
 * Sort events newest-first with stable ordering
 */
function sortEventsNewestFirst(events: SpecLineageEvent[]): SpecLineageEvent[] {
  return [...events].sort((a, b) => {
    const ta = Date.parse(a.at);
    const tb = Date.parse(b.at);
    const da = Number.isFinite(ta) ? ta : 0;
    const db = Number.isFinite(tb) ? tb : 0;
    if (db !== da) return db - da;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

// ============================================
// COMPONENT
// ============================================

interface LineageTimelineProps {
  maxEvents?: number;
  showStats?: boolean;
}

export function LineageTimeline({
  maxEvents = 10,
  showStats = true,
}: LineageTimelineProps): React.ReactElement {
  const [chain, setChain] = useState<LineageChain | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<DataSource>('none');
  const projectMeta = useProjectStore((s) => s.metadata);

  const loadData = useCallback(async () => {
    if (!projectMeta?.id) {
      setLoading(false);
      setDataSource('none');
      return;
    }

    setLoading(true);

    // 1. Try server first (authoritative - even if empty)
    const serverData = await fetchServerLineage(projectMeta.id);
    if (serverData?.ok && Array.isArray(serverData.items)) {
      // Convert server response to LineageChain format
      const serverChain: LineageChain = {
        jobId: serverData.jobId,
        events: serverData.items,
        eventCount: serverData.items.length,
        headRevisionId: serverData.items[0]?.revision?.revisionId,
      };
      setChain(serverChain);
      setDataSource('server');
      setLoading(false);
      return;
    }

    // 2. Fallback to localStorage (dev/offline)
    const localResult = loadLineage(projectMeta.id);
    if (localResult.ok) {
      setChain(localResult.chain);
      setDataSource('local');
    } else {
      setChain(null);
      setDataSource('none');
    }
    setLoading(false);
  }, [projectMeta?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>Loading lineage...</div>
      </div>
    );
  }

  if (!projectMeta?.id) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>No project loaded</div>
      </div>
    );
  }

  // Compute stats from correct source
  const stats =
    dataSource === 'server'
      ? computeStatsFromEvents(chain?.events ?? [])
      : getLineageStats(projectMeta.id);

  // Sort newest-first and take top N
  const events = sortEventsNewestFirst(chain?.events ?? []).slice(0, maxEvents);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={styles.title}>Spec Lineage</h3>
          {dataSource === 'server' && (
            <span
              style={{ ...styles.statBadge, backgroundColor: '#22c55e20', color: '#22c55e', fontSize: '9px' }}
              title="Server-anchored lineage (authoritative)"
            >
              ● Server
            </span>
          )}
          {dataSource === 'local' && (
            <span
              style={{ ...styles.statBadge, backgroundColor: '#f59e0b20', color: '#f59e0b', fontSize: '9px' }}
              title="Local storage only – not legally authoritative. Server unavailable."
            >
              ⚠ Local
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {showStats && (
            <div style={styles.stats}>
              <span style={styles.statBadge}>
                {stats.revisionCount} revisions
              </span>
              <span style={styles.statBadge}>
                {stats.releaseCount} releases
              </span>
              <span style={styles.statBadge}>{stats.exportCount} exports</span>
            </div>
          )}
          <button
            style={styles.refreshButton}
            onClick={loadData}
            title="Refresh lineage"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Timeline */}
      {events.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>📋</div>
          <div>No lineage events yet</div>
          <div style={{ fontSize: '11px', marginTop: '4px' }}>
            Freeze or release a spec to start the audit trail
          </div>
        </div>
      ) : (
        <div style={styles.timeline}>
          <div style={styles.timelineLine} />
          {events.map((event, index) => (
            <LineageEventItem key={event.id} event={event} isFirst={index === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// EVENT ITEM
// ============================================

interface LineageEventItemProps {
  event: SpecLineageEvent;
  isFirst: boolean;
}

function LineageEventItem({
  event,
  isFirst,
}: LineageEventItemProps): React.ReactElement {
  const config = EVENT_CONFIG[event.type] || {
    icon: '📝',
    color: '#8b8ba7',
    label: event.type,
  };

  return (
    <div style={styles.eventItem}>
      {/* Dot */}
      <div
        style={{
          ...styles.eventDot,
          backgroundColor: config.color,
          boxShadow: isFirst ? `0 0 8px ${config.color}` : 'none',
        }}
      />

      {/* Header */}
      <div style={styles.eventHeader}>
        <div style={{ ...styles.eventType, color: config.color }}>
          <span>{config.icon}</span>
          <span>{config.label}</span>
          {event.changeClass && (
            <span style={styles.changeClass}>{event.changeClass}</span>
          )}
        </div>
        <span style={styles.eventTime}>{formatTime(event.at)}</span>
      </div>

      {/* Details */}
      <div style={styles.eventDetails}>
        {event.note && <div>{event.note}</div>}
        {event.actor?.name && (
          <div>
            By: {event.actor.name}
            {event.actor.role && ` (${event.actor.role})`}
          </div>
        )}
        <div style={styles.revisionId}>
          Rev: {truncateHash(event.revision.revisionId)}
        </div>
        {event.revision.parentRevisionId && (
          <div style={{ ...styles.revisionId, marginLeft: '8px' }}>
            Parent: {truncateHash(event.revision.parentRevisionId)}
          </div>
        )}
      </div>

      {/* Export Info */}
      {event.export && (
        <div style={styles.exportInfo}>
          <div>
            <strong>Export:</strong> {event.export.dialect || 'Unknown format'}
          </div>
          {event.export.artifactSha256 && (
            <div>Hash: {truncateHash(event.export.artifactSha256)}</div>
          )}
          {event.export.mode && <div>Mode: {event.export.mode}</div>}
        </div>
      )}
    </div>
  );
}

export default LineageTimeline;
