/**
 * Modeling Release Panel - FROZEN → RELEASED Workflow
 *
 * Step 6 of Plasticity-Style Modeling Layer:
 * - Shows current approval status
 * - Requires explicit approval before release
 * - Builds release bundle with manifest + signatures
 *
 * v1.0: Initial modeling release panel
 */

import { useState } from 'react';
import {
  useReleaseStore,
  useApprovals,
  useLastBundle,
  useApprovalModalOpen,
  useCanRelease,
} from '../../core/manufacturing/release/releaseStore';
import { buildReleaseBundle, downloadBundle, getBundleMeta } from '../../core/manufacturing/release';
import type { FrozenSnapshot } from '../../core/manufacturing/gate/snapshot';
import type { OperationGraph } from '../../core/manufacturing/opgraph/types';
import ApprovalModal from './ApprovalModal';

interface ModelingReleasePanelProps {
  /** Current frozen snapshot (required for release) */
  snapshot: FrozenSnapshot | null;
  /** Current operation graph */
  opGraph: OperationGraph | null;
  /** Is gate passing? */
  gatePass: boolean;
  /** Factory ID for bundle */
  factoryId?: string;
}

export function ModelingReleasePanel({
  snapshot,
  opGraph,
  gatePass,
  factoryId,
}: ModelingReleasePanelProps) {
  const approvals = useApprovals();
  const lastBundle = useLastBundle();
  const approvalModalOpen = useApprovalModalOpen();
  const canRelease = useCanRelease();

  const { setApprovalModalOpen, addApproval, setBundle, clearApprovals } =
    useReleaseStore.getState();

  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if we can release
  const isFrozen = snapshot !== null;
  const hasOpGraph = opGraph !== null;
  const releaseReady = isFrozen && hasOpGraph && gatePass && canRelease;

  const handleRelease = async () => {
    if (!snapshot || !opGraph) {
      setError('Missing snapshot or operation graph');
      return;
    }

    if (approvals.length === 0) {
      setError('At least one approval is required');
      return;
    }

    setReleasing(true);
    setError(null);

    try {
      // Build the release bundle
      const bundle = buildReleaseBundle({
        snapshot,
        approvals,
        signerKeyId: 'factory-release-key',
        factoryId,
      });

      setBundle(bundle);

      // Auto-download the bundle
      downloadBundle(bundle, `release-${bundle.bundleId.slice(0, 8)}.json`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Release failed');
    } finally {
      setReleasing(false);
    }
  };

  const bundleMeta = lastBundle ? getBundleMeta(lastBundle) : null;

  return (
    <div
      style={{
        background: 'rgba(139,92,246,0.05)',
        border: '1px solid #3a3a5a',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #3a3a5a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Release Bundle</span>
          {lastBundle && (
            <span
              style={{
                padding: '2px 8px',
                background: 'rgba(34,197,94,0.2)',
                border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: 4,
                fontSize: 11,
                color: '#22c55e',
              }}
            >
              RELEASED
            </span>
          )}
        </div>

        {/* Status indicators */}
        <div style={{ display: 'flex', gap: 8 }}>
          <StatusPill label="Frozen" ok={isFrozen} />
          <StatusPill label="Gate" ok={gatePass} />
          <StatusPill label={`${approvals.length} Approval`} ok={approvals.length > 0} />
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {/* Not frozen message */}
        {!isFrozen && (
          <div
            style={{
              padding: 12,
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 6,
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 13, color: '#f59e0b' }}>
              Snapshot must be frozen before release.
            </div>
          </div>
        )}

        {/* Gate not passing */}
        {isFrozen && !gatePass && (
          <div
            style={{
              padding: 12,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 13, color: '#ef4444' }}>
              Gate must pass before release. Fix all blockers first.
            </div>
          </div>
        )}

        {/* Approvals section */}
        {isFrozen && gatePass && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.6)',
                marginBottom: 8,
              }}
            >
              Approvals ({approvals.length})
            </div>

            {approvals.length === 0 ? (
              <div
                style={{
                  padding: 12,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px dashed #3a3a5a',
                  borderRadius: 6,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                  No approvals yet. Add at least one approval to release.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {approvals.map((approval, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(34,197,94,0.1)',
                      border: '1px solid rgba(34,197,94,0.2)',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, color: '#fff' }}>{approval.approverId}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                        {approval.role} · {approval.message}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.4)',
                        fontFamily: 'monospace',
                      }}
                    >
                      {approval.signedAtIso.slice(0, 10)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Approval button */}
            <button
              onClick={() => setApprovalModalOpen(true)}
              style={{
                marginTop: 12,
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid #8b5cf6',
                borderRadius: 6,
                color: '#8b5cf6',
                fontSize: 13,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              + Add Approval
            </button>
          </div>
        )}

        {/* Last bundle info */}
        {bundleMeta && (
          <div
            style={{
              padding: 12,
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: 6,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
              Last Release Bundle
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Bundle ID</div>
                <div style={{ fontSize: 12, color: '#fff', fontFamily: 'monospace' }}>
                  {bundleMeta.bundleId.slice(0, 12)}...
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Files</div>
                <div style={{ fontSize: 12, color: '#fff' }}>
                  {bundleMeta.fileCount} files ({(bundleMeta.totalBytes / 1024).toFixed(1)} KB)
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Approvals</div>
                <div style={{ fontSize: 12, color: '#fff' }}>{bundleMeta.approvalCount}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Created</div>
                <div style={{ fontSize: 12, color: '#fff' }}>
                  {bundleMeta.createdAtIso.slice(0, 10)}
                </div>
              </div>
            </div>

            {/* Re-download button */}
            <button
              onClick={() => lastBundle && downloadBundle(lastBundle)}
              style={{
                marginTop: 12,
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid rgba(34,197,94,0.5)',
                borderRadius: 4,
                color: '#22c55e',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Download Again
            </button>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: 12,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 13, color: '#ef4444' }}>{error}</div>
          </div>
        )}

        {/* Release button */}
        <button
          onClick={handleRelease}
          disabled={!releaseReady || releasing}
          style={{
            width: '100%',
            padding: '12px 20px',
            background: releaseReady ? '#8b5cf6' : 'rgba(139,92,246,0.3)',
            border: 'none',
            borderRadius: 6,
            color: releaseReady ? '#fff' : 'rgba(255,255,255,0.5)',
            fontSize: 14,
            fontWeight: 600,
            cursor: releaseReady ? 'pointer' : 'not-allowed',
          }}
        >
          {releasing ? 'Building Bundle...' : 'Release to Factory'}
        </button>

        {/* Clear approvals (for re-release) */}
        {approvals.length > 0 && !releasing && (
          <button
            onClick={clearApprovals}
            style={{
              marginTop: 8,
              width: '100%',
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              color: 'rgba(239,68,68,0.7)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Clear Approvals
          </button>
        )}
      </div>

      {/* Approval Modal */}
      <ApprovalModal
        open={approvalModalOpen}
        onClose={() => setApprovalModalOpen(false)}
        onApprove={(signature) => {
          addApproval(signature);
        }}
      />
    </div>
  );
}

/** Small status pill component */
function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      style={{
        padding: '2px 8px',
        background: ok ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 4,
        fontSize: 10,
        color: ok ? '#22c55e' : 'rgba(255,255,255,0.4)',
      }}
    >
      {label}
    </span>
  );
}

export default ModelingReleasePanel;
