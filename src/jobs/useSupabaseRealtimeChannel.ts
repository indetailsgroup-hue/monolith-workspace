/**
 * jobs/useSupabaseRealtimeChannel.ts — Direct Supabase Realtime channel subscription
 *
 * Replaces the store-subscribe approach with true server-push events.
 * Listens to postgres_changes on the `job` table and updates the jobStore directly.
 *
 * Features:
 * - Connects to Supabase Realtime WebSocket channel
 * - Handles INSERT, UPDATE, DELETE events
 * - Updates jobStore directly (single source of truth)
 * - Auto-reconnect on disconnect
 * - Connection status tracking
 * - Falls back gracefully when Supabase is not configured
 *
 * @version 15.5.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useJobStore } from './jobStore';
import { type Job, type JobStatus } from './types';

// ============================================================================
// Types
// ============================================================================

export type ChannelStatus = 'idle' | 'connecting' | 'subscribed' | 'error' | 'closed';

export interface RealtimeChannelEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  jobId: string;
  jobCode?: string;
  oldStatus?: JobStatus;
  newStatus?: JobStatus;
  timestamp: string;
}

export interface UseSupabaseRealtimeChannelReturn {
  /** Current channel status */
  status: ChannelStatus;
  /** Error message if connection failed */
  error: string | null;
  /** Total events received since connection */
  eventCount: number;
  /** Recent events (last 20) for debugging / toast display */
  recentEvents: RealtimeChannelEvent[];
  /** Manually reconnect */
  reconnect: () => void;
  /** Disconnect and cleanup */
  disconnect: () => void;
}

// ============================================================================
// DB Record → Job mapper
// ============================================================================

function mapDbRecordToJob(record: any): Partial<Job> & { jobId: string } {
  return {
    jobId: record.job_id ?? record.jobId,
    jobCode: record.job_code ?? record.jobCode,
    title: record.title,
    status: (record.status?.toUpperCase?.() ?? record.status) as JobStatus,
    priority: record.priority?.toUpperCase?.() ?? record.priority,
    deadline: record.deadline,
    materialGroup: record.material_group ?? record.materialGroup,
    totalPanelCount: record.total_panel_count ?? record.totalPanelCount,
    updatedAt: record.updated_at ?? record.updatedAt ?? new Date().toISOString(),
    createdAt: record.created_at ?? record.createdAt,
    notes: record.notes,
  };
}

function mapDbRecordToFullJob(record: any): Job {
  return {
    jobId: record.job_id ?? record.jobId,
    jobCode: record.job_code ?? record.jobCode ?? '',
    title: record.title ?? '',
    customer: record.customer ?? { customerId: '', name: record.customer_name ?? 'Unknown' },
    panels: record.panels ?? [],
    status: (record.status?.toUpperCase?.() ?? 'DRAFT') as JobStatus,
    priority: record.priority?.toUpperCase?.() ?? 'NORMAL',
    deadline: record.deadline,
    materialGroup: record.material_group ?? record.materialGroup ?? '',
    totalPanelCount: record.total_panel_count ?? record.totalPanelCount ?? 0,
    estimatedCost: record.estimated_cost ?? record.estimatedCost,
    quotationId: record.quotation_id ?? record.quotationId,
    invoiceId: record.invoice_id ?? record.invoiceId,
    notes: record.notes,
    createdAt: record.created_at ?? record.createdAt ?? new Date().toISOString(),
    updatedAt: record.updated_at ?? record.updatedAt ?? new Date().toISOString(),
    createdBy: record.created_by ?? record.createdBy ?? '',
    assignedTo: record.assigned_to ?? record.assignedTo,
  };
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useSupabaseRealtimeChannel(): UseSupabaseRealtimeChannelReturn {
  const [status, setStatus] = useState<ChannelStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [recentEvents, setRecentEvents] = useState<RealtimeChannelEvent[]>([]);

  const channelRef = useRef<any>(null);
  const clientRef = useRef<any>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Get Supabase config ─────────────────────────────────────────────────

  const getConfig = useCallback(() => {
    const url = typeof import.meta !== 'undefined'
      ? (import.meta as any).env?.VITE_SUPABASE_URL
      : undefined;
    const anonKey = typeof import.meta !== 'undefined'
      ? (import.meta as any).env?.VITE_SUPABASE_ANON_KEY
      : undefined;

    if (!url || !anonKey) return null;
    return { url, anonKey };
  }, []);

  // ── Handle incoming events ──────────────────────────────────────────────

  const handlePayload = useCallback((payload: any) => {
    const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
    const newRecord = payload.new;
    const oldRecord = payload.old;
    const record = newRecord || oldRecord;

    if (!record) return;

    const jobId = record.job_id ?? record.jobId;
    if (!jobId) return;

    const event: RealtimeChannelEvent = {
      eventType,
      jobId,
      jobCode: record.job_code ?? record.jobCode,
      oldStatus: oldRecord?.status?.toUpperCase?.() as JobStatus | undefined,
      newStatus: newRecord?.status?.toUpperCase?.() as JobStatus | undefined,
      timestamp: new Date().toISOString(),
    };

    setEventCount((c) => c + 1);
    setRecentEvents((prev) => [event, ...prev].slice(0, 20));

    // Update the Zustand store directly
    const store = useJobStore.getState();

    switch (eventType) {
      case 'INSERT': {
        const existing = store.jobs.find((j) => j.jobId === jobId);
        if (!existing && newRecord) {
          const newJob = mapDbRecordToFullJob(newRecord);
          useJobStore.setState({ jobs: [...store.jobs, newJob] });
        }
        break;
      }
      case 'UPDATE': {
        if (newRecord) {
          const updates = mapDbRecordToJob(newRecord);
          useJobStore.setState({
            jobs: store.jobs.map((j) =>
              j.jobId === jobId ? { ...j, ...updates } : j,
            ),
          });
        }
        break;
      }
      case 'DELETE': {
        useJobStore.setState({
          jobs: store.jobs.filter((j) => j.jobId !== jobId),
        });
        break;
      }
    }
  }, []);

  // ── Connect to channel ──────────────────────────────────────────────────

  const connect = useCallback(async () => {
    const config = getConfig();
    if (!config) {
      setStatus('idle');
      setError('Supabase not configured — using local store only');
      return;
    }

    try {
      setStatus('connecting');

      const { createClient } = await import('@supabase/supabase-js');
      const client = createClient(config.url, config.anonKey, {
        realtime: { params: { eventsPerSecond: 10 } },
      });
      clientRef.current = client;

      const channel = client
        .channel('monolith-job-realtime', {
          config: { broadcast: { self: true } },
        })
        .on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table: 'job' },
          handlePayload,
        )
        .subscribe((subscriptionStatus: string) => {
          switch (subscriptionStatus) {
            case 'SUBSCRIBED':
              setStatus('subscribed');
              setError(null);
              break;
            case 'CLOSED':
              setStatus('closed');
              scheduleReconnect();
              break;
            case 'CHANNEL_ERROR':
              setStatus('error');
              setError('Channel error — will retry');
              scheduleReconnect();
              break;
            case 'TIMED_OUT':
              setStatus('error');
              setError('Connection timed out — will retry');
              scheduleReconnect();
              break;
          }
        });

      channelRef.current = channel;
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to connect');
      scheduleReconnect();
    }
  }, [getConfig, handlePayload]);

  // ── Reconnect logic ─────────────────────────────────────────────────────

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, 5000);
  }, [connect]);

  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (channelRef.current) {
      channelRef.current.unsubscribe?.();
      channelRef.current = null;
    }
    if (clientRef.current) {
      clientRef.current.removeAllChannels?.();
      clientRef.current = null;
    }
    setStatus('closed');
  }, []);

  // ── Lifecycle ───────────────────────────────────────────────────────────

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    status,
    error,
    eventCount,
    recentEvents,
    reconnect,
    disconnect,
  };
}

export default useSupabaseRealtimeChannel;
