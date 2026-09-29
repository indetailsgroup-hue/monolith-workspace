/**
 * MachineShadow — Factory route page for Digital Shadow view
 *
 * Wraps MachineShadowPanel and handles:
 *   1. SSE auto-reconnect with exponential back-off         (v1.1.0)
 *   2. Dismissible toast surfacing reconnect attempt + delay (v1.2.0)
 *   3. Dismissible stale-features warning banner             (v1.3.0)
 *   4. Manual force-refresh button in stale banner           (v1.4.0)
 *
 * Back-off policy:
 *   initial delay : 1 s
 *   multiplier    : 2×
 *   cap           : 30 s
 *   reset         : on successful EventSource `open` event
 *
 * Stale-features banner:
 *   Shown when maintenance.staleFeatures === true for the selected machine.
 *   Dismissed per-session; resets automatically when a different machine is
 *   selected or when the maintenance data refreshes with staleFeatures=false.
 *   Force-refresh button calls the backend to reset all Redis key TTLs and
 *   reload the maintenance assessment with live cache values.
 *
 * @version 1.4.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Clock, RefreshCw, X } from 'lucide-react';
import { MachineShadowPanel } from '../components/shadow/MachineShadowPanel';
import {
  useMachineShadowStore,
  selectSelectedMaintenance,
} from '../state/machineShadowStore';

// ─── Back-off constants ───────────────────────────────────────────────────────

const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MULTIPLIER = 2;
const BACKOFF_MAX_MS     = 30_000;

// ─── Toast state shape ────────────────────────────────────────────────────────

interface ReconnectToast {
  /** 1-based reconnect attempt number shown in the banner. */
  attempt: number;
  /** Back-off delay (ms) until the next EventSource open. */
  delayMs: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MachineShadow(): React.ReactElement {
  const activeEventSource = useMachineShadowStore((s) => s.activeEventSource);
  const selectedMachineId = useMachineShadowStore((s) => s.selectedMachineId);
  const openEventStream   = useMachineShadowStore((s) => s.openEventStream);
  const loadMaintenance   = useMachineShadowStore((s) => s.loadMaintenance);
  const maintenance       = useMachineShadowStore(selectSelectedMaintenance);

  /** Consecutive reconnect attempts since last successful open. */
  const attemptRef = useRef(0);
  /** Handle for the pending reconnect timer so we can cancel on unmount. */
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Non-null while a reconnect is in progress.
   * Set to null on successful `open` or when the user dismisses the banner.
   */
  const [toast, setToast] = useState<ReconnectToast | null>(null);

  /**
   * Controls the stale-features warning banner.
   * - true  : user dismissed it for this machine session
   * - Resets to false when selectedMachineId changes
   */
  const [staleDismissed, setStaleDismissed] = useState(false);

  /**
   * True while the force-refresh API call is in flight.
   * Disables the refresh button to prevent double-submission.
   */
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Reset stale banner dismissal whenever the selected machine changes
  useEffect(() => {
    setStaleDismissed(false);
  }, [selectedMachineId]);

  // ── SSE reconnect back-off ────────────────────────────────────────────────
  useEffect(() => {
    if (!activeEventSource || !selectedMachineId) return;

    // Reset attempt counter and hide banner on successful open
    activeEventSource.onopen = () => {
      attemptRef.current = 0;
      setToast(null);
    };

    // Schedule reconnect; surface attempt + delay in the toast banner
    activeEventSource.onerror = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const delay = Math.min(
        BACKOFF_INITIAL_MS * Math.pow(BACKOFF_MULTIPLIER, attemptRef.current),
        BACKOFF_MAX_MS,
      );
      attemptRef.current += 1;

      setToast({ attempt: attemptRef.current, delayMs: delay });

      const targetId = selectedMachineId;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        openEventStream(targetId);
      }, delay);
    };

    // Cancel pending reconnect on re-render or unmount
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [activeEventSource, selectedMachineId, openEventStream]);

  // ── Force-refresh handler ──────────────────────────────────────────────────

  const handleForceRefresh = async () => {
    if (!selectedMachineId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await loadMaintenance(selectedMachineId, { forceRefresh: true });
    } finally {
      setIsRefreshing(false);
    }
  };

  // ── Derived booleans ──────────────────────────────────────────────────────

  /** True when the API reports feature data older than the 300 s TTL. */
  const isStale = maintenance?.staleFeatures === true;

  /** Show the stale banner only when stale AND not yet dismissed this session. */
  const showStaleBanner = isStale && !staleDismissed;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <MachineShadowPanel />

      {/* ── Stale-features warning banner ─────────────────────────────────── */}
      {showStaleBanner && (
        <div
          role="alert"
          aria-live="polite"
          aria-atomic="true"
          data-testid="stale-features-toast"
          style={{
            position:     'fixed',
            bottom:       '5rem',
            right:        '1.5rem',
            zIndex:       50,
            display:      'flex',
            alignItems:   'center',
            gap:          '0.625rem',
            padding:      '0.75rem 1rem',
            borderRadius: '0.5rem',
            background:   '#1c1408',
            color:        '#fef3c7',
            boxShadow:    '0 4px 16px rgba(0,0,0,0.45)',
            minWidth:     '280px',
            maxWidth:     '420px',
            fontSize:     '0.875rem',
            lineHeight:   '1.4',
            border:       '1px solid rgba(245,158,11,0.50)',
          }}
        >
          <Clock
            size={18}
            aria-hidden="true"
            style={{ color: '#f59e0b', flexShrink: 0 }}
          />
          <span style={{ flex: 1 }}>
            Feature data is stale — Redis cache exceeds the{' '}
            <strong>5&thinsp;min TTL</strong>.{' '}
            Predictions may not reflect current sensor readings.
          </span>
          <button
            type="button"
            data-testid="force-refresh-btn"
            aria-label="Force-refresh feature cache"
            disabled={isRefreshing}
            onClick={handleForceRefresh}
            style={{
              background:   'none',
              border:       '1px solid rgba(245,158,11,0.50)',
              cursor:       isRefreshing ? 'not-allowed' : 'pointer',
              color:        '#fef3c7',
              padding:      '0.25rem 0.5rem',
              flexShrink:   0,
              display:      'flex',
              alignItems:   'center',
              gap:          '0.25rem',
              borderRadius: '0.25rem',
              fontSize:     '0.75rem',
            }}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {isRefreshing ? 'Refreshing\u2026' : 'Refresh'}
          </button>
          <button
            type="button"
            aria-label="Dismiss stale features notification"
            onClick={() => setStaleDismissed(true)}
            style={{
              background:   'none',
              border:       'none',
              cursor:       'pointer',
              color:        '#92400e',
              padding:      '0.25rem',
              flexShrink:   0,
              display:      'flex',
              alignItems:   'center',
              borderRadius: '0.25rem',
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ── Reconnect toast banner ─────────────────────────────────────────── */}
      {toast !== null && (
        <div
          role="alert"
          aria-live="polite"
          aria-atomic="true"
          data-testid="reconnect-toast"
          style={{
            position:     'fixed',
            bottom:       '1.5rem',
            right:        '1.5rem',
            zIndex:       50,
            display:      'flex',
            alignItems:   'center',
            gap:          '0.625rem',
            padding:      '0.75rem 1rem',
            borderRadius: '0.5rem',
            background:   '#1e293b',
            color:        '#f8fafc',
            boxShadow:    '0 4px 16px rgba(0,0,0,0.45)',
            minWidth:     '280px',
            maxWidth:     '420px',
            fontSize:     '0.875rem',
            lineHeight:   '1.4',
            border:       '1px solid rgba(245,158,11,0.35)',
          }}
        >
          <AlertCircle
            size={18}
            aria-hidden="true"
            style={{ color: '#f59e0b', flexShrink: 0 }}
          />
          <span style={{ flex: 1 }}>
            Live stream disconnected — reconnecting&hellip;{' '}
            <strong>Attempt&nbsp;{toast.attempt}</strong>
            {' '}in{' '}
            <strong>{(toast.delayMs / 1000).toFixed(1)}&thinsp;s</strong>
          </span>
          <button
            type="button"
            aria-label="Dismiss reconnect notification"
            onClick={() => setToast(null)}
            style={{
              background:   'none',
              border:       'none',
              cursor:       'pointer',
              color:        '#94a3b8',
              padding:      '0.25rem',
              flexShrink:   0,
              display:      'flex',
              alignItems:   'center',
              borderRadius: '0.25rem',
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export default MachineShadow;
