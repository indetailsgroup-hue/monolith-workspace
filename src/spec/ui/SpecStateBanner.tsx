/**
 * SpecStateBanner
 *
 * Top banner showing current spec state with contextual CTAs
 *
 * P11.1: Shows offline status and blocks state transitions when server unavailable
 */

import { useSpecStore } from '../SpecStoreProvider';
import { useSyncStatus, usePendingTransition } from '../../core/store/useSpecStore';
import { CloudOff, Loader2, AlertCircle } from 'lucide-react';

export function SpecStateBanner() {
  const state = useSpecStore((s) => s.doc.state);
  const doc = useSpecStore((s) => s.doc);

  const openFreeze = useSpecStore((s) => s.openFreeze);
  const openRelease = useSpecStore((s) => s.openRelease);
  const runGate = useSpecStore((s) => s.runGate);
  const createRevision = useSpecStore((s) => s.createRevisionToEdit);
  const busy = useSpecStore((s) => s.async.busy);

  // P11.1: Server sync status
  const syncStatus = useSyncStatus();
  const pendingTransition = usePendingTransition();

  // P11.1: Block state transitions when offline/error
  const isOnline = syncStatus === 'synced' || syncStatus === 'pending';
  const canTransition = isOnline && !busy;

  // Primary action based on state
  const primary = (() => {
    if (state === 'DRAFT') {
      return {
        label: isOnline ? 'Freeze for Manufacturing' : 'Server Unavailable',
        onClick: openFreeze,
        disabled: !canTransition,
      };
    }
    if (state === 'FROZEN') {
      return { label: 'Run Gate', onClick: runGate, disabled: busy };
    }
    return { label: 'Download Factory Package', onClick: () => {}, disabled: !isOnline };
  })();

  // Secondary action (create revision)
  const secondary = (() => {
    if (state === 'DRAFT') return null;
    return { label: 'Create Revision to Edit', onClick: createRevision, disabled: busy };
  })();

  // Can release?
  const canRelease =
    doc.state === 'FROZEN' && doc.lastGate && doc.lastGate.blockers.length === 0;

  // State badge color
  const stateColors: Record<string, string> = {
    DRAFT: '#10b981',     // green
    FROZEN: '#3b82f6',    // blue
    RELEASED: '#8b5cf6',  // purple
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      <strong style={{ color: '#fff' }}>MONOLITH Workspace</strong>

      <span
        style={{
          padding: '4px 12px',
          background: stateColors[state],
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          color: '#fff',
        }}
      >
        {state}
      </span>

      {/* P11.1: Sync status indicator */}
      {syncStatus === 'offline' && (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            background: 'rgba(107, 114, 128, 0.3)',
            border: '1px solid rgba(107, 114, 128, 0.5)',
            borderRadius: 999,
            fontSize: 11,
            color: '#9ca3af',
          }}
          title="Server unavailable — cannot Freeze/Release"
        >
          <CloudOff size={12} />
          Offline
        </span>
      )}
      {syncStatus === 'error' && (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 999,
            fontSize: 11,
            color: '#f87171',
          }}
          title="Server error — state transitions blocked"
        >
          <AlertCircle size={12} />
          Sync Error
        </span>
      )}
      {syncStatus === 'pending' && (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            background: 'rgba(245, 158, 11, 0.2)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: 999,
            fontSize: 11,
            color: '#fbbf24',
          }}
        >
          <Loader2 size={12} className="animate-spin" />
          Syncing...
        </span>
      )}

      {/* P11.1: Pending transition indicator */}
      {pendingTransition && (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            background: 'rgba(139, 92, 246, 0.2)',
            border: '1px solid rgba(139, 92, 246, 0.4)',
            borderRadius: 999,
            fontSize: 11,
            color: '#a78bfa',
          }}
          title={`Queued: ${pendingTransition.type} — will retry when online`}
        >
          Pending: {pendingTransition.type}
        </span>
      )}

      {/* Snapshot/Release info */}
      {doc.state === 'FROZEN' && (
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
          Snapshot: {doc.snapshot.snapshotId.slice(0, 12)}...
        </span>
      )}
      {doc.state === 'RELEASED' && (
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
          Release: {doc.release.releaseId.slice(0, 12)}...
        </span>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        {secondary && (
          <button
            onClick={secondary.onClick}
            disabled={secondary.disabled}
            style={{
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              color: '#fff',
              cursor: secondary.disabled ? 'not-allowed' : 'pointer',
              opacity: secondary.disabled ? 0.5 : 1,
            }}
          >
            {secondary.label}
          </button>
        )}

        {state === 'FROZEN' && (
          <button
            onClick={openRelease}
            disabled={!canRelease || !canTransition}
            style={{
              padding: '8px 16px',
              background: canRelease && isOnline ? '#8b5cf6' : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              cursor: !canRelease || !canTransition ? 'not-allowed' : 'pointer',
              opacity: !canRelease || !canTransition ? 0.5 : 1,
            }}
            title={!isOnline ? 'Server unavailable — cannot Release' : undefined}
          >
            {isOnline ? 'Proceed to Release' : 'Server Unavailable'}
          </button>
        )}

        <button
          onClick={primary.onClick}
          disabled={primary.disabled}
          style={{
            padding: '8px 16px',
            background: stateColors[state],
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontWeight: 600,
            cursor: primary.disabled ? 'not-allowed' : 'pointer',
            opacity: primary.disabled ? 0.5 : 1,
          }}
        >
          {primary.label}
        </button>
      </div>
    </div>
  );
}
