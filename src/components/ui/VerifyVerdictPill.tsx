/**
 * VerifyVerdictPill - Visual indicator for server verify verdict
 * Priority 4A: Status wiring
 *
 * @version 0.12.2
 */

import React from 'react';

export type VerdictDisplay =
  | 'PASS'
  | 'PASS_WITH_WARN'
  | 'FAIL'
  | 'ERROR'
  | 'UNKNOWN'
  | 'LOADING'
  // FS-B1-02: storage-integrity result — rendered distinctly, never as PASS
  | 'STORAGE_HASH_MATCH';

interface VerifyVerdictPillProps {
  verdict: VerdictDisplay;
  size?: 'sm' | 'md';
}

export function VerifyVerdictPill({ verdict, size = 'md' }: VerifyVerdictPillProps): React.ReactElement {
  const getColors = () => {
    switch (verdict) {
      case 'PASS':
        return { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e', text: '#86efac' };
      case 'STORAGE_HASH_MATCH':
        return { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#93c5fd' };
      case 'PASS_WITH_WARN':
        return { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#fcd34d' };
      case 'FAIL':
        return { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#fca5a5' };
      case 'LOADING':
        return { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#93c5fd' };
      case 'UNKNOWN':
      default:
        return { bg: 'rgba(107, 114, 128, 0.15)', border: '#6b7280', text: '#9ca3af' };
    }
  };

  const getLabel = () => {
    switch (verdict) {
      case 'PASS':
        return '✓ PASS';
      case 'STORAGE_HASH_MATCH':
        return '✓ STORAGE HASH';
      case 'PASS_WITH_WARN':
        return '⚠ WARN';
      case 'FAIL':
        return '✗ FAIL';
      case 'LOADING':
        return '⟳ Loading...';
      case 'UNKNOWN':
      default:
        return '? Unknown';
    }
  };

  const colors = getColors();
  const fontSize = size === 'sm' ? '11px' : '12px';
  const padding = size === 'sm' ? '3px 8px' : '4px 10px';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding,
        borderRadius: '999px',
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.text,
        fontSize,
        fontWeight: 600,
        letterSpacing: '0.3px',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {getLabel()}
    </span>
  );
}

export default VerifyVerdictPill;
