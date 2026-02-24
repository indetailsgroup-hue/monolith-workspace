/**
 * Modeling Gate Panel - Preflight + OpGraph Preview + Freeze
 *
 * Step 5 of Plasticity-Style Modeling Layer:
 * - Designer sees "what the factory would run"
 * - Preflight validation with issues display
 * - OperationGraph preview (read-only)
 * - Freeze button (DRAFT → FROZEN)
 *
 * v1.0: Initial modeling gate panel
 */

import { useState, useMemo } from 'react';
import type { DesignIntent } from '../../core/modeling/types';
import type { PanelContext } from '../../core/modeling/preflight';
import type { FrozenSnapshot } from '../../core/manufacturing/gate/snapshot';
import { runGate } from '../../core/manufacturing/gate/runGate';
import { createFrozenSnapshot } from '../../core/manufacturing/gate/snapshot';
import { useSpecStore } from '../../core/store/useSpecStore';
import { getSeverityColor, getSeverityIcon } from '../../core/modeling/preflight';

interface ModelingGatePanelProps {
  /** Target panel context */
  panel: PanelContext;
  /** Panel ID */
  panelId: string;
  /** Design intents for this panel */
  intents: DesignIntent[];
  /** Callback when frozen */
  onFrozen?: (snapshot: FrozenSnapshot) => void;
}

export function ModelingGatePanel({
  panel,
  panelId,
  intents,
  onFrozen,
}: ModelingGatePanelProps) {
  const specState = useSpecStore((s) => s.specState);
  const freezeSpec = useSpecStore((s) => s.freezeSpec);

  const [frozenSnapshot, setFrozenSnapshot] = useState<FrozenSnapshot | null>(null);
  const [expandedOps, setExpandedOps] = useState(false);

  // Run gate check
  const gate = useMemo(
    () => runGate(panelId, panel, intents),
    [panelId, panel, intents]
  );

  const handleFreeze = () => {
    if (specState !== 'DRAFT') return;
    if (!gate.ok) return;

    // Create frozen snapshot
    const snapshot = createFrozenSnapshot({
      panelId,
      gate,
      intents,
    });

    setFrozenSnapshot(snapshot);
    freezeSpec(); // Transition SpecState to FROZEN
    onFrozen?.(snapshot);
  };

  const errorCount = gate.preflight.errors.filter((e) => e.severity === 'error').length;
  const warnCount = gate.preflight.errors.filter((e) => e.severity === 'warning').length;

  return (
    <div
      style={{
        background: '#1a1a2e',
        border: '1px solid #3a3a5a',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid #3a3a5a',
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 14 }}>Gate Panel</h3>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
            SpecState: <strong style={{ color: specState === 'DRAFT' ? '#8b5cf6' : '#22c55e' }}>{specState}</strong>
            {' '}&bull;{' '}
            Freeze = snapshot (audit-ready)
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: gate.ok ? '#22c55e' : '#ef4444',
            }}
          >
            {gate.ok ? 'PASS' : 'BLOCKED'}
          </div>
          <button
            onClick={handleFreeze}
            disabled={specState !== 'DRAFT' || !gate.ok}
            style={{
              marginTop: 6,
              padding: '6px 16px',
              background: gate.ok && specState === 'DRAFT' ? '#8b5cf6' : '#4a4a6a',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: gate.ok && specState === 'DRAFT' ? 'pointer' : 'not-allowed',
              opacity: gate.ok && specState === 'DRAFT' ? 1 : 0.5,
            }}
          >
            Freeze Snapshot
          </button>
        </div>
      </div>

      {/* Preflight Section */}
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: 13, color: '#fff' }}>Preflight</strong>
          <span
            style={{
              marginLeft: 8,
              fontSize: 12,
              color: gate.ok ? '#22c55e' : '#ef4444',
            }}
          >
            {gate.ok ? 'OK (no errors)' : `${errorCount} error(s) - fix before Freeze`}
          </span>
        </div>

        {gate.preflight.errors.length === 0 ? (
          <div
            style={{
              padding: 12,
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: 8,
              fontSize: 12,
              color: '#22c55e',
            }}
          >
            No issues found. Ready to freeze.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {gate.preflight.errors.map((err) => (
              <div
                key={err.id}
                style={{
                  padding: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${getSeverityColor(err.severity)}33`,
                  borderLeft: `3px solid ${getSeverityColor(err.severity)}`,
                  borderRadius: 6,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 14 }}>{getSeverityIcon(err.severity)}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: getSeverityColor(err.severity),
                      textTransform: 'uppercase',
                    }}
                  >
                    {err.severity}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    {err.code}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: '#fff' }}>
                  {err.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* OpGraph Preview Section */}
      <div
        style={{
          padding: 16,
          borderTop: '1px solid #3a3a5a',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div>
            <strong style={{ fontSize: 13, color: '#fff' }}>
              OperationGraph Preview
            </strong>
            <span style={{ marginLeft: 8, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              (read-only)
            </span>
          </div>
          <span
            style={{
              padding: '2px 8px',
              background: 'rgba(139,92,246,0.2)',
              borderRadius: 4,
              fontSize: 11,
              color: '#8b5cf6',
            }}
          >
            {gate.opGraph.nodes.length} ops
          </span>
        </div>

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>
          What the factory would run if you Freeze now.
        </div>

        {gate.opGraph.nodes.length === 0 ? (
          <div
            style={{
              padding: 12,
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 8,
              fontSize: 12,
              color: 'rgba(255,255,255,0.5)',
              textAlign: 'center',
            }}
          >
            No operations yet. Add design intents to generate ops.
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                maxHeight: expandedOps ? 400 : 150,
                overflow: 'auto',
              }}
            >
              {gate.opGraph.nodes.map((node) => (
                <div
                  key={node.id}
                  style={{
                    padding: 10,
                    borderBottom: '1px solid #3a3a5a',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        padding: '2px 6px',
                        background: getOpKindColor(node.kind),
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#fff',
                      }}
                    >
                      {node.kind}
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                      {node.target.kind}:{node.target.id}
                    </span>
                  </div>
                  <code
                    style={{
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.4)',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                    }}
                  >
                    {JSON.stringify(node.params)}
                  </code>
                </div>
              ))}
            </div>
            {gate.opGraph.nodes.length > 3 && (
              <button
                onClick={() => setExpandedOps(!expandedOps)}
                style={{
                  width: '100%',
                  padding: 8,
                  background: 'rgba(255,255,255,0.05)',
                  border: 'none',
                  color: '#8b5cf6',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {expandedOps ? 'Show less' : `Show all ${gate.opGraph.nodes.length} operations`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Snapshot Section */}
      <div
        style={{
          padding: 16,
          borderTop: '1px solid #3a3a5a',
        }}
      >
        <strong style={{ fontSize: 13, color: '#fff' }}>Snapshot</strong>

        {!frozenSnapshot ? (
          <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {gate.ok
              ? 'Ready to freeze. Click "Freeze Snapshot" to lock.'
              : 'Fix errors first, then Freeze.'}
          </div>
        ) : (
          <div
            style={{
              marginTop: 8,
              padding: 12,
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, marginBottom: 8 }}>
              Frozen!
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
              <div>snapshotId: <strong>{frozenSnapshot.snapshotId}</strong></div>
              <div>createdAt: {frozenSnapshot.createdAt}</div>
              <div>hash: <code style={{ color: '#8b5cf6' }}>{frozenSnapshot.hash}</code></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Get color for operation kind.
 */
function getOpKindColor(kind: string): string {
  switch (kind) {
    case 'ROUTE_PROFILE':
      return '#22c55e';
    case 'POCKET_GROOVE':
      return '#3b82f6';
    case 'ROUTE_REVEAL':
      return '#f59e0b';
    case 'DRILL_HOLE':
      return '#8b5cf6';
    case 'EDGE_BAND':
      return '#ec4899';
    case 'KERF_BEND':
      return '#14b8a6';
    default:
      return '#6b7280';
  }
}

export default ModelingGatePanel;
