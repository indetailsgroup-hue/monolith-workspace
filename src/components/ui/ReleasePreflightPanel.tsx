/**
 * ReleasePreflightPanel - Release Readiness Summary
 *
 * Shows preflight checks and release readiness status.
 *
 * @version 1.0.0
 */

import React from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { PreflightState } from '../../core/preflight/preflightStore';

export interface ReleasePreflightPanelProps {
  /** Preflight store */
  store?: UseBoundStore<StoreApi<PreflightState>>;
  /** Job ID */
  jobId?: string;
  /** Callback when release is requested */
  onRequestRelease?: () => void;
  /** Whether release is allowed */
  canRelease?: boolean;
}

export function ReleasePreflightPanel({
  jobId,
  canRelease = false,
  onRequestRelease,
}: ReleasePreflightPanelProps): React.ReactElement {
  return React.createElement('div', {
    style: { padding: 16, border: '1px solid #3a3a5a', borderRadius: 8 },
  },
    React.createElement('h3', {
      style: { color: '#f5f5f5', marginBottom: 12, fontSize: 14, fontWeight: 600 },
    }, 'Release Preflight'),
    React.createElement('div', {
      style: { color: '#9ca3af', fontSize: 13 },
    }, jobId ? `Job: ${jobId}` : 'No job selected'),
    canRelease && onRequestRelease && React.createElement('button', {
      onClick: onRequestRelease,
      style: {
        marginTop: 12,
        padding: '8px 16px',
        background: '#22c55e',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
      },
    }, 'Request Release')
  );
}
