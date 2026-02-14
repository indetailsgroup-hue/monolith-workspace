/**
 * ChecklistExplorer.tsx - Factory Acceptance Checklist UI
 *
 * Displays verified checklist data for factory acceptance.
 * Audit-ready view with copy-to-clipboard support.
 */

import React, { useEffect, useCallback } from 'react';
import type {
  FactoryAcceptanceChecklist,
  ChecklistStatus,
} from '../../core/factory/generateFactoryChecklist';
import {
  getChecklistStatus,
  formatChecklistText,
} from '../../core/factory/generateFactoryChecklist';
import type { ChecklistState } from '../../core/store/useChecklistStore';

// ============================================
// PROPS
// ============================================

export interface ChecklistExplorerProps {
  /** Job ID to display */
  jobId: string;

  /** Zustand store hook */
  useStore: () => ChecklistState;

  /** Optional: Called when status changes */
  onStatusChange?: (status: ChecklistStatus | null) => void;

  /** Optional: Custom class name */
  className?: string;
}

// ============================================
// STYLES
// ============================================

const styles = {
  container: {
    padding: '16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '14px',
    lineHeight: '1.5',
    color: '#e4e4e7',
    backgroundColor: '#18181b',
    borderRadius: '8px',
    border: '1px solid #27272a',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '12px',
    marginBottom: '16px',
  } as React.CSSProperties,

  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#fafafa',
    margin: 0,
  } as React.CSSProperties,

  subtitle: {
    fontSize: '12px',
    color: '#a1a1aa',
    margin: '4px 0 0 0',
  } as React.CSSProperties,

  statusBadge: (status: ChecklistStatus | null) => ({
    padding: '4px 12px',
    borderRadius: '4px',
    fontWeight: 700,
    fontSize: '12px',
    backgroundColor:
      status === 'APPROVED' ? '#166534' :
      status === 'BLOCKED' ? '#991b1b' :
      status === 'INVALID' ? '#7c2d12' :
      '#3f3f46',
    color: '#fafafa',
  }) as React.CSSProperties,

  section: {
    marginBottom: '16px',
  } as React.CSSProperties,

  sectionTitle: {
    fontWeight: 700,
    fontSize: '13px',
    color: '#a1a1aa',
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,

  divider: {
    margin: '12px 0',
    border: 'none',
    borderTop: '1px solid #27272a',
  } as React.CSSProperties,

  row: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '4px',
  } as React.CSSProperties,

  label: {
    color: '#a1a1aa',
  } as React.CSSProperties,

  value: {
    color: '#fafafa',
    fontFamily: 'monospace',
  } as React.CSSProperties,

  errorList: {
    margin: '8px 0 0 0',
    paddingLeft: '20px',
    listStyle: 'disc',
  } as React.CSSProperties,

  errorItem: {
    color: '#fca5a5',
    marginBottom: '4px',
  } as React.CSSProperties,

  exportTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  } as React.CSSProperties,

  exportHeader: {
    textAlign: 'left' as const,
    color: '#a1a1aa',
    fontWeight: 400,
    padding: '4px 8px 4px 0',
  } as React.CSSProperties,

  exportCell: {
    padding: '4px 8px 4px 0',
    borderTop: '1px solid #27272a',
  } as React.CSSProperties,

  hashCell: {
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#71717a',
  } as React.CSSProperties,

  button: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#3f3f46',
    color: '#fafafa',
    fontSize: '13px',
    cursor: 'pointer',
    marginRight: '8px',
  } as React.CSSProperties,

  buttonPrimary: {
    backgroundColor: '#166534',
  } as React.CSSProperties,

  loading: {
    textAlign: 'center' as const,
    padding: '32px',
    color: '#a1a1aa',
  } as React.CSSProperties,

  error: {
    textAlign: 'center' as const,
    padding: '32px',
    color: '#fca5a5',
  } as React.CSSProperties,
};

// ============================================
// COMPONENT
// ============================================

export function ChecklistExplorer({
  jobId,
  useStore,
  onStatusChange,
  className,
}: ChecklistExplorerProps) {
  const state = useStore();

  // Load on mount and when jobId changes
  useEffect(() => {
    if (jobId) {
      state.load(jobId);
    }
  }, [jobId]);

  // Notify status changes
  useEffect(() => {
    if (state.data && onStatusChange) {
      onStatusChange(getChecklistStatus(state.data));
    }
  }, [state.data, onStatusChange]);

  // Copy handlers
  const handleCopyJson = useCallback(() => {
    if (state.data) {
      navigator.clipboard.writeText(JSON.stringify(state.data, null, 2));
    }
  }, [state.data]);

  const handleCopyText = useCallback(() => {
    if (state.data) {
      navigator.clipboard.writeText(formatChecklistText(state.data));
    }
  }, [state.data]);

  // Loading state
  if (state.loading) {
    return (
      <div style={styles.container} className={className}>
        <div style={styles.loading}>Loading checklist...</div>
      </div>
    );
  }

  // Error state
  if (state.error) {
    return (
      <div style={styles.container} className={className}>
        <div style={styles.error}>
          <div>Checklist Error</div>
          <div style={{ marginTop: '8px', fontSize: '12px' }}>{state.error}</div>
        </div>
      </div>
    );
  }

  // No data state
  if (!state.data) {
    return (
      <div style={styles.container} className={className}>
        <div style={styles.loading}>No checklist data.</div>
      </div>
    );
  }

  const c = state.data;
  const status = getChecklistStatus(c);

  return (
    <div style={styles.container} className={className}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Factory Acceptance Checklist</h2>
          <p style={styles.subtitle}>Job: {c.jobId}</p>
          <p style={styles.subtitle}>HEAD: {c.headHash.slice(0, 16)}...</p>
        </div>
        <div style={styles.statusBadge(status)}>{status}</div>
      </div>

      <hr style={styles.divider} />

      {/* Verification Section */}
      <section style={styles.section}>
        <div style={styles.sectionTitle}>Chain Verification</div>
        <Row label="Chain" value={c.verification.chainOk ? 'OK' : 'FAILED'} />
        {!c.verification.chainOk && (
          <Row label="Reason" value={c.verification.reason ?? 'Unknown'} />
        )}
        {c.verification.chainLength !== undefined && (
          <Row label="Chain Length" value={String(c.verification.chainLength)} />
        )}
        <Row label="Approval Key" value={c.verification.keyIdApproval ?? '—'} />
        <Row label="Manifest Key" value={c.verification.keyIdManifest ?? '—'} />
      </section>

      <hr style={styles.divider} />

      {/* Gate Section */}
      <section style={styles.section}>
        <div style={styles.sectionTitle}>Gate Validation</div>
        <Row label="Gate OK" value={c.gate.ok ? 'YES' : 'NO'} />
        <Row label="Warnings" value={String(c.gate.warningsCount)} />

        {c.gate.perCabinetErrors.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontWeight: 600, marginBottom: '4px', color: '#fca5a5' }}>
              Per-Cabinet Errors
            </div>
            <ul style={styles.errorList}>
              {c.gate.perCabinetErrors.map((e) => (
                <li key={e.id} style={styles.errorItem}>
                  <strong>{e.id}:</strong> {e.codes.join(', ')}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <hr style={styles.divider} />

      {/* Collision Section */}
      <section style={styles.section}>
        <div style={styles.sectionTitle}>Collision</div>
        <Row label="Blocked" value={c.collision.blocked ? 'YES' : 'NO'} />
        <Row label="Pairs" value={String(c.collision.pairCount)} />
        {c.collision.worstPenetrationMm !== undefined && (
          <Row label="Worst Penetration" value={`${c.collision.worstPenetrationMm.toFixed(2)} mm`} />
        )}
        {c.collision.worstGapMm !== undefined && (
          <Row label="Worst Gap" value={`${c.collision.worstGapMm.toFixed(2)} mm`} />
        )}
      </section>

      <hr style={styles.divider} />

      {/* Exports Section */}
      <section style={styles.section}>
        <div style={styles.sectionTitle}>Exports (from HEAD)</div>
        {c.exports.length === 0 ? (
          <div style={{ color: '#71717a' }}>No exports recorded.</div>
        ) : (
          <table style={styles.exportTable}>
            <thead>
              <tr>
                <th style={styles.exportHeader}>Kind</th>
                <th style={styles.exportHeader}>File</th>
                <th style={styles.exportHeader}>SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {c.exports.map((e, i) => (
                <tr key={i}>
                  <td style={styles.exportCell}>{e.kind}</td>
                  <td style={styles.exportCell}>{e.filename}</td>
                  <td style={{ ...styles.exportCell, ...styles.hashCell }}>
                    {e.hash.slice(0, 16)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <hr style={styles.divider} />

      {/* Actions */}
      <section>
        <button style={styles.button} onClick={handleCopyJson}>
          Copy JSON
        </button>
        <button style={styles.button} onClick={handleCopyText}>
          Copy Text
        </button>
        <button
          style={{ ...styles.button, ...styles.buttonPrimary }}
          onClick={() => state.refresh()}
        >
          Refresh
        </button>
      </section>
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{label}:</span>
      <span style={styles.value}>{value}</span>
    </div>
  );
}

// ============================================
// COMPACT VARIANT
// ============================================

export interface ChecklistStatusBadgeProps {
  status: ChecklistStatus | null;
  showLabel?: boolean;
}

export function ChecklistStatusBadge({ status, showLabel = true }: ChecklistStatusBadgeProps) {
  const colors = {
    APPROVED: { bg: '#166534', text: '#bbf7d0' },
    BLOCKED: { bg: '#991b1b', text: '#fecaca' },
    INVALID: { bg: '#7c2d12', text: '#fed7aa' },
    null: { bg: '#3f3f46', text: '#a1a1aa' },
  };

  const { bg, text } = colors[status ?? 'null'] ?? colors.null;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '4px',
        backgroundColor: bg,
        color: text,
        fontWeight: 600,
        fontSize: '12px',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: text,
        }}
      />
      {showLabel && (status ?? 'LOADING')}
    </span>
  );
}
