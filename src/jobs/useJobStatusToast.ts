/**
 * jobs/useJobStatusToast.ts — Real-time notification toasts for job status changes
 *
 * Integrates with useJobBoardRealtime events to show dismissible
 * toast notifications when jobs change status.
 *
 * Features:
 * - Listens to job board realtime INSERT/UPDATE/DELETE events
 * - Shows appropriate toast per event type
 * - Thai + English status labels
 * - Color-coded by transition direction (progress=success, issue=warning)
 * - Configurable filter (e.g. only show for certain jobIds or statuses)
 *
 * @version 15.3.0
 */

import { useEffect, useRef, useCallback } from 'react';
import { type Job, type JobStatus, JOB_STATUS_LABELS, JOB_STATUSES } from './types';
import { type RealtimeJobEvent } from './useJobBoardRealtime';
import { type UseToastReturn, type ToastType } from '../core/ui/NotificationToast';

// ============================================================================
// Types
// ============================================================================

export interface JobStatusToastOptions {
  /** Only show toasts for these job IDs (empty = all) */
  filterJobIds?: string[];
  /** Only show toasts for transitions TO these statuses (empty = all) */
  filterStatuses?: JobStatus[];
  /** Mute notifications entirely */
  muted?: boolean;
}

export interface UseJobStatusToastReturn {
  /** Process a realtime event (call from useJobBoardRealtime onChange) */
  handleEvent: (event: RealtimeJobEvent) => void;
  /** Mute/unmute */
  setMuted: (muted: boolean) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function getToastType(eventType: 'INSERT' | 'UPDATE' | 'DELETE', newStatus?: JobStatus): ToastType {
  if (eventType === 'INSERT') return 'info';
  if (eventType === 'DELETE') return 'warning';

  // UPDATE — determine progress direction
  if (!newStatus) return 'info';
  const idx = JOB_STATUSES.indexOf(newStatus);
  if (idx >= JOB_STATUSES.indexOf('DELIVERED')) return 'success';
  if (newStatus === 'QC') return 'warning';
  return 'info';
}

function getEventMessage(event: RealtimeJobEvent): { title: string; message: string } {
  const jobCode = event.job.jobCode ?? event.job.jobId.slice(0, 8);
  const jobTitle = (event.job as Partial<Job>).title ?? '';

  switch (event.eventType) {
    case 'INSERT':
      return {
        title: '📋 งานใหม่',
        message: `${jobCode} — ${jobTitle || 'New job created'}`,
      };
    case 'DELETE':
      return {
        title: '🗑️ ลบงาน',
        message: `${jobCode} ถูกลบออกจากระบบ`,
      };
    case 'UPDATE': {
      const status = event.job.status;
      const statusLabel = status ? JOB_STATUS_LABELS[status] : 'updated';
      return {
        title: '🔄 เปลี่ยนสถานะ',
        message: `${jobCode} → ${statusLabel}`,
      };
    }
    default:
      return { title: 'Job Update', message: jobCode };
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useJobStatusToast(
  toast: UseToastReturn,
  options: JobStatusToastOptions = {},
): UseJobStatusToastReturn {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handleEvent = useCallback(
    (event: RealtimeJobEvent) => {
      const opts = optionsRef.current;
      if (opts.muted) return;

      // Filter by job IDs
      if (opts.filterJobIds && opts.filterJobIds.length > 0) {
        if (!opts.filterJobIds.includes(event.job.jobId)) return;
      }

      // Filter by target status (UPDATE only)
      if (opts.filterStatuses && opts.filterStatuses.length > 0 && event.eventType === 'UPDATE') {
        if (event.job.status && !opts.filterStatuses.includes(event.job.status)) return;
      }

      const { title, message } = getEventMessage(event);
      const type = getToastType(event.eventType, event.job.status);

      toast.addToast({ title, message, type, duration: 6000 });
    },
    [toast],
  );

  const setMuted = useCallback((muted: boolean) => {
    optionsRef.current = { ...optionsRef.current, muted };
  }, []);

  return { handleEvent, setMuted };
}

export default useJobStatusToast;
