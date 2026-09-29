/**
 * jobs/useJobBoardRealtime.ts — Real-time Job Board with Supabase subscriptions
 *
 * Subscribes to postgres_changes on the `job` table for live updates.
 * Falls back to HTTP polling if WebSocket connection fails.
 *
 * Features:
 * - INSERT: new jobs appear on board immediately
 * - UPDATE: status transitions reflect in real-time
 * - DELETE: removed jobs disappear
 * - Auto-reconnect on disconnect
 * - HTTP polling fallback (30s interval)
 * - Connection status indicator
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { type Job, type JobStatus, JOB_STATUSES } from './types';

// ============================================================================
// Types
// ============================================================================

export type RealtimeJobEvent = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  job: Partial<Job> & { jobId: string };
  timestamp: string;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'polling';

export interface JobBoardRealtimeState {
  /** Live job list (merged from initial + realtime events) */
  jobs: Job[];
  /** Connection status */
  status: ConnectionStatus;
  /** Error message if any */
  error: string | null;
  /** Count of real-time events received */
  eventCount: number;
  /** Last update timestamp */
  lastUpdate: string | null;
  /** Manual reconnect trigger */
  reconnect: () => void;
  /** Force refresh from server */
  refresh: () => Promise<void>;
}

// ============================================================================
// Supabase Realtime Channel Setup
// ============================================================================

interface SupabaseRealtimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken?: string;
}

function getRealtimeConfig(): SupabaseRealtimeConfig | null {
  const url = typeof import.meta !== 'undefined'
    ? (import.meta as any).env?.VITE_SUPABASE_URL
    : undefined;
  const anonKey = typeof import.meta !== 'undefined'
    ? (import.meta as any).env?.VITE_SUPABASE_ANON_KEY
    : undefined;

  if (!url || !anonKey) return null;
  return { supabaseUrl: url, supabaseAnonKey: anonKey };
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useJobBoardRealtime(
  initialJobs: Job[] = [],
  config?: Partial<SupabaseRealtimeConfig>,
): JobBoardRealtimeState {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  const channelRef = useRef<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Merge realtime event into state ─────────────────────────────────────

  const handleRealtimeEvent = useCallback((event: RealtimeJobEvent) => {
    setEventCount((c) => c + 1);
    setLastUpdate(event.timestamp);

    setJobs((prev) => {
      switch (event.eventType) {
        case 'INSERT': {
          // Avoid duplicates
          if (prev.some((j) => j.jobId === event.job.jobId)) return prev;
          return [event.job as Job, ...prev];
        }
        case 'UPDATE': {
          return prev.map((j) =>
            j.jobId === event.job.jobId ? { ...j, ...event.job } : j,
          );
        }
        case 'DELETE': {
          return prev.filter((j) => j.jobId !== event.job.jobId);
        }
        default:
          return prev;
      }
    });
  }, []);

  // ── Connect to Supabase Realtime ────────────────────────────────────────

  const connect = useCallback(async () => {
    const realtimeConfig = config
      ? { supabaseUrl: config.supabaseUrl ?? '', supabaseAnonKey: config.supabaseAnonKey ?? '' }
      : getRealtimeConfig();

    if (!realtimeConfig) {
      setStatus('polling');
      setError('No Supabase config — using polling fallback');
      startPolling();
      return;
    }

    try {
      // Dynamic import to avoid SSR issues
      const { createClient } = await import('@supabase/supabase-js');
      const client = createClient(realtimeConfig.supabaseUrl, realtimeConfig.supabaseAnonKey);

      setStatus('connecting');

      const channel = client
        .channel('job-board-realtime')
        .on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table: 'job' },
          (payload: any) => {
            const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
            const record = payload.new || payload.old;
            if (!record?.job_id) return;

            // Map DB snake_case to app camelCase
            const job: Partial<Job> & { jobId: string } = {
              jobId: record.job_id,
              jobCode: record.job_code,
              title: record.title,
              status: record.status?.toUpperCase() as JobStatus,
              priority: record.priority?.toUpperCase(),
              deadline: record.deadline,
              materialGroup: record.material_group,
              totalPanelCount: record.total_panel_count,
              updatedAt: record.updated_at,
            };

            handleRealtimeEvent({
              eventType,
              job,
              timestamp: new Date().toISOString(),
            });
          },
        )
        .subscribe((subscriptionStatus: string) => {
          if (subscriptionStatus === 'SUBSCRIBED') {
            setStatus('connected');
            setError(null);
            stopPolling();
          } else if (subscriptionStatus === 'CLOSED' || subscriptionStatus === 'CHANNEL_ERROR') {
            setStatus('disconnected');
            scheduleReconnect();
          }
        });

      channelRef.current = channel;
    } catch (err) {
      setStatus('polling');
      setError(err instanceof Error ? err.message : 'Realtime connection failed');
      startPolling();
    }
  }, [config, handleRealtimeEvent]);

  // ── Polling Fallback ────────────────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    setStatus('polling');

    pollingRef.current = setInterval(async () => {
      try {
        const realtimeConfig = config
          ? { supabaseUrl: config.supabaseUrl ?? '', supabaseAnonKey: config.supabaseAnonKey ?? '' }
          : getRealtimeConfig();

        if (!realtimeConfig) return;

        const res = await fetch(
          `${realtimeConfig.supabaseUrl}/rest/v1/rpc/rpc_job_board`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              apikey: realtimeConfig.supabaseAnonKey,
              authorization: `Bearer ${realtimeConfig.supabaseAnonKey}`,
            },
            body: JSON.stringify({ p_limit: 50 }),
          },
        );

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setJobs(data);
            setLastUpdate(new Date().toISOString());
          }
        }
      } catch {
        // silent retry on next interval
      }
    }, 30_000);
  }, [config]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // ── Reconnect Logic ─────────────────────────────────────────────────────

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) return;
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connect();
    }, 3000);
  }, [connect]);

  const reconnect = useCallback(() => {
    // Cleanup existing channel
    if (channelRef.current) {
      channelRef.current.unsubscribe?.();
      channelRef.current = null;
    }
    stopPolling();
    connect();
  }, [connect, stopPolling]);

  // ── Force Refresh ───────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    const realtimeConfig = config
      ? { supabaseUrl: config.supabaseUrl ?? '', supabaseAnonKey: config.supabaseAnonKey ?? '' }
      : getRealtimeConfig();

    if (!realtimeConfig) return;

    try {
      const res = await fetch(
        `${realtimeConfig.supabaseUrl}/rest/v1/rpc/rpc_job_board`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            apikey: realtimeConfig.supabaseAnonKey,
            authorization: `Bearer ${realtimeConfig.supabaseAnonKey}`,
          },
          body: JSON.stringify({ p_limit: 50 }),
        },
      );

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setJobs(data);
          setLastUpdate(new Date().toISOString());
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    }
  }, [config]);

  // ── Lifecycle ───────────────────────────────────────────────────────────

  useEffect(() => {
    connect();

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe?.();
      }
      stopPolling();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect, stopPolling]);

  // Sync initial jobs
  useEffect(() => {
    if (initialJobs.length > 0 && jobs.length === 0) {
      setJobs(initialJobs);
    }
  }, [initialJobs]);

  return {
    jobs,
    status,
    error,
    eventCount,
    lastUpdate,
    reconnect,
    refresh,
  };
}
