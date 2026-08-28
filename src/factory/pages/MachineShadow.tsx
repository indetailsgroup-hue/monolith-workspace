/**
 * MachineShadow — Factory route page for Digital Shadow view
 *
 * Wraps MachineShadowPanel in the factory chrome (full viewport) and adds
 * client-side SSE auto-reconnect with exponential back-off whenever the
 * EventSource connection is closed unexpectedly.
 *
 * Back-off policy:
 *   initial delay : 1 s
 *   multiplier    : 2×
 *   cap           : 30 s
 *   reset         : on successful EventSource `open` event
 *
 * @version 1.1.0
 */

import React, { useEffect, useRef } from 'react';
import { MachineShadowPanel } from '../components/shadow/MachineShadowPanel';
import { useMachineShadowStore } from '../state/machineShadowStore';

// ─── Back-off constants ───────────────────────────────────────────────────────

const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MULTIPLIER = 2;
const BACKOFF_MAX_MS     = 30_000;

// ─── Component ────────────────────────────────────────────────────────────────

export function MachineShadow(): React.ReactElement {
  const activeEventSource = useMachineShadowStore((s) => s.activeEventSource);
  const selectedMachineId = useMachineShadowStore((s) => s.selectedMachineId);
  const openEventStream   = useMachineShadowStore((s) => s.openEventStream);

  /** Number of consecutive reconnect attempts since last successful open. */
  const attemptRef = useRef(0);
  /** Handle for the pending reconnect timer so we can clear it on unmount. */
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!activeEventSource || !selectedMachineId) return;

    // ── Reset attempt counter on successful open ──────────────────────────
    activeEventSource.onopen = () => {
      attemptRef.current = 0;
    };

    // ── Reconnect with exponential back-off on error / unexpected close ───
    activeEventSource.onerror = () => {
      // Clear any previously scheduled reconnect
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const delay = Math.min(
        BACKOFF_INITIAL_MS * Math.pow(BACKOFF_MULTIPLIER, attemptRef.current),
        BACKOFF_MAX_MS,
      );
      attemptRef.current += 1;

      // Capture machineId in closure so a deselect mid-flight is safe
      const targetId = selectedMachineId;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        openEventStream(targetId);
      }, delay);
    };

    // ── Cleanup: cancel pending reconnect when effect re-runs or unmounts ─
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
    </div>
  );
}

export default MachineShadow;
