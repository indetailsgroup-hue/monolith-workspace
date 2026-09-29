/**
 * jobs/JobsLayout.tsx — Layout wrapper for all /jobs/* routes
 *
 * Provides:
 * - NotificationToastContainer (top-right)
 * - Supabase Realtime channel (server-push events → store + toasts)
 * - Connection status indicator
 * - Shared toast context for all job pages
 *
 * @version 15.5.0 — replaced store-subscribe with true Supabase Realtime channel
 */

import React, { useEffect, useRef } from 'react';
import { useToast, NotificationToastContainer } from '../core/ui/NotificationToast';
import { useSupabaseRealtimeChannel, type RealtimeChannelEvent } from './useSupabaseRealtimeChannel';
import { JOB_STATUS_LABELS } from './types';

// ============================================================================
// Component
// ============================================================================

export interface JobsLayoutProps {
  children: React.ReactNode;
}

export function JobsLayout({ children }: JobsLayoutProps): React.ReactElement {
  const toast = useToast(5);
  const realtime = useSupabaseRealtimeChannel();
  const prevEventCountRef = useRef(realtime.eventCount);

  // ── Fire toasts when new realtime events arrive ─────────────────────────
  useEffect(() => {
    if (realtime.eventCount <= prevEventCountRef.current) return;
    prevEventCountRef.current = realtime.eventCount;

    const latestEvent = realtime.recentEvents[0];
    if (!latestEvent) return;

    const { eventType, jobCode, newStatus } = latestEvent;

    switch (eventType) {
      case 'INSERT':
        toast.addToast({
          type: 'info',
          title: 'งานใหม่',
          message: `${jobCode ?? 'Job'} ถูกสร้างขึ้น`,
        });
        break;
      case 'UPDATE':
        toast.addToast({
          type: 'success',
          title: 'สถานะเปลี่ยน',
          message: `${jobCode ?? 'Job'} → ${newStatus ? JOB_STATUS_LABELS[newStatus] : 'updated'}`,
        });
        break;
      case 'DELETE':
        toast.addToast({
          type: 'warning',
          title: 'งานถูกลบ',
          message: `${jobCode ?? 'Job'} ถูกลบออก`,
        });
        break;
    }
  }, [realtime.eventCount, realtime.recentEvents, toast]);

  return (
    <div data-testid="jobs-layout">
      {/* Connection status indicator */}
      <RealtimeStatusBadge status={realtime.status} eventCount={realtime.eventCount} onReconnect={realtime.reconnect} />

      {children}

      <NotificationToastContainer
        toasts={toast.toasts}
        onDismiss={toast.removeToast}
        position="top-right"
      />
    </div>
  );
}

// ============================================================================
// Realtime Status Badge
// ============================================================================

function RealtimeStatusBadge({
  status,
  eventCount,
  onReconnect,
}: {
  status: string;
  eventCount: number;
  onReconnect: () => void;
}): React.ReactElement {
  const colors: Record<string, string> = {
    idle: '#6b7280',
    connecting: '#f59e0b',
    subscribed: '#22c55e',
    error: '#ef4444',
    closed: '#6b7280',
  };

  const labels: Record<string, string> = {
    idle: 'Local',
    connecting: 'Connecting...',
    subscribed: 'Live',
    error: 'Error',
    closed: 'Offline',
  };

  return (
    <div
      style={{
        position: 'fixed' as const,
        bottom: '12px',
        right: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '20px',
        background: '#111827',
        border: `1px solid ${colors[status] ?? '#374151'}`,
        fontSize: '10px',
        color: colors[status] ?? '#9ca3af',
        zIndex: 1000,
        cursor: status === 'error' || status === 'closed' ? 'pointer' : 'default',
      }}
      onClick={status === 'error' || status === 'closed' ? onReconnect : undefined}
      data-testid="realtime-status-badge"
      title={status === 'error' || status === 'closed' ? 'Click to reconnect' : `Events: ${eventCount}`}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: colors[status] ?? '#6b7280',
          animation: status === 'subscribed' ? 'pulse 2s infinite' : undefined,
        }}
      />
      <span>{labels[status] ?? status}</span>
      {eventCount > 0 && <span style={{ color: '#6b7280' }}>({eventCount})</span>}
    </div>
  );
}

export default JobsLayout;
