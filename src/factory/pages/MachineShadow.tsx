/**
 * MachineShadow — Factory route page for Digital Shadow view
 *
 * Wraps MachineShadowPanel and handles:
 *   1. SSE auto-reconnect with exponential back-off  (v1.1.0)
 *   2. Dismissible toast banner surfacing reconnect
 *      attempt count and back-off delay              (v1.2.0)
 *
 * Back-off policy:
 *   initial delay : 1 s
 *   multiplier    : 2×
 *   cap           : 30 s
 *   reset         : on successful EventSource `open` event
 *
 * @version 1.2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { MachineShadowPanel } from '../components/shadow/MachineShadowPanel';
import { useMachineShadowStore } from '../state/machineShadowStore';

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

  /** Consecutive reconnect attempts since last successful open. */
  const attemptRef = useRef(0);
  /** Handle for the pending reconnect timer so we can cancel on unmount. */
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Non-null while a reconnect is in progress.
   * Set to null on successful `open` or when the user dismisses the banner.
   */
  const [toast, setToast] = useState<ReconnectToast | null>(null);

  useEffect(() => {
    if (!activeEventSource || !selectedMachineId) return;

    // ── Reset attempt counter and hide banner on successful open ─────────
    activeEventSource.onopen = () => {
      attemptRef.current = 0;
      setToast(null);
    };

    // ── Schedule reconnect; surface attempt + delay in the toast banner ──
    activeEventSource.onerror = () => {
      // Cancel any previously scheduled reconnect
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const delay = Math.min(
        BACKOFF_INITIAL_MS * Math.pow(BACKOFF_MULTIPLIER, attemptRef.current),
        BACKOFF_MAX_MS,
      );
      attemptRef.current += 1;

      // Show the toast with current attempt number (post-increment) and delay
      setToast({ attempt: attemptRef.current, delayMs: delay });

      // Capture machineId so a mid-flight deselect is handled safely
      const targetId = selectedMachineId;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        openEventStream(targetId);
      }, delay);
    };

    // ── Cleanup: cancel pending reconnect on re-render or unmount ─────────
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [activeEventSource, selectedMachineId, openEventStream]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <MachineShadowPanel />

      {/* ── Reconnect toast banner ─────────────────────────────────────── */}
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
