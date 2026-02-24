/**
 * ReleaseCenter
 *
 * Dashboard for released packages
 * Shows manifest, files, and download options
 *
 * v0.1: Downloads from ArtifactStore with verification
 * - Artifacts stored ONCE at release (never regenerated)
 * - Verification against manifest hashes before any download
 *
 * v0.10: Policy status banner + auto requirePolicy in FACTORY mode
 */

import React, { useState } from 'react';
import { useSpecStore } from '../SpecStoreProvider';
import { downloadTextFile } from '@/export/cutList';
import { artifactStore, verifyBundleAgainstManifest } from '@/artifacts';
import type { VerifyResult } from '@/artifacts';
import { PolicyStatusBanner, isPolicyBlocked } from '@/components/ui/PolicyStatusBanner';

export function ReleaseCenter() {
  const doc = useSpecStore((s) => s.doc);
  const createRevision = useSpecStore((s) => s.createRevisionToEdit);
  const busy = useSpecStore((s) => s.async?.busy);

  if (!doc || doc.state !== 'RELEASED') {
    return (
      <div style={{ padding: 24, color: 'rgba(255,255,255,0.6)' }}>
        <h3 style={{ color: '#fff', marginBottom: 12 }}>Release Center</h3>
        <p>No release available. Complete the freeze → gate → release workflow first.</p>
      </div>
    );
  }

  const { release, snapshot, gate } = doc as Record<string, any>;
  const { manifest, signedManifest, artifactBundleId } = release;

  // State for manifest modal
  const [showManifestModal, setShowManifestModal] = useState(false);

  // Verification state
  const [verifyState, setVerifyState] = useState<{
    status: 'idle' | 'checking' | 'verified' | 'failed';
    message: string;
    result?: VerifyResult;
  }>({ status: 'idle', message: '' });

  // Get bundle from artifact store
  const bundle = artifactBundleId
    ? artifactStore.getBundle?.(artifactBundleId)
    : undefined;

  // v0.10: Check if bundle contains policy
  const bundleHasPolicy = !!bundle?.items?.some((x) => x.path === 'revocation-policy.json');

  // v0.10: Check if operations are blocked due to missing policy in FACTORY mode
  const policyBlocked = isPolicyBlocked(bundleHasPolicy);

  /** Verify artifacts against manifest before download */
  const verifyArtifacts = async (): Promise<boolean> => {
    if (!bundle) {
      setVerifyState({
        status: 'failed',
        message: 'Artifact bundle not found in store.',
      });
      return false;
    }

    if (!signedManifest) {
      setVerifyState({
        status: 'failed',
        message: 'Signed manifest not available.',
      });
      return false;
    }

    setVerifyState({ status: 'checking', message: 'Verifying artifacts...' });

    const result = await verifyBundleAgainstManifest(bundle as any, signedManifest);

    if (result.ok) {
      setVerifyState({
        status: 'verified',
        message: 'All artifacts verified against manifest.',
        result,
      });
      return true;
    } else {
      const firstError = result.errors[0];
      setVerifyState({
        status: 'failed',
        message: `Verification failed: ${firstError.path} - ${firstError.message}`,
        result,
      });
      return false;
    }
  };

  /** Download artifact from store (with verification) */
  const downloadFromStore = async (path: string) => {
    // Always verify before download (factory safety)
    const verified = await verifyArtifacts();
    if (!verified) return;

    if (!bundle) {
      alert('Artifact bundle not found.');
      return;
    }

    const bundleRef = bundle as { bundleId?: string };
    const item = artifactStore.getArtifact?.(bundleRef.bundleId ?? artifactBundleId, path);
    if (!item) {
      alert(`Artifact "${path}" not found in bundle.`);
      return;
    }

    const filename = `${release.releaseId}_${path}`;
    const content = item.content;
    const mime = item.mime ?? 'application/octet-stream';
    downloadTextFile(filename, content, mime);
  };

  /** Download manifest.json from store */
  const downloadManifest = async () => {
    await downloadFromStore('manifest.json');
  };

  /** Download cutlist.csv from store */
  const downloadCutlist = async () => {
    await downloadFromStore('cutlist.csv');
  };

  return (
    <div style={{ padding: 24 }}>
      <h3 style={{ color: '#fff', marginBottom: 24 }}>Release Center</h3>

      {/* v0.10: Policy Status Banner */}
      <PolicyStatusBanner bundleHasPolicy={bundleHasPolicy} />

      {/* Release Info Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(139,92,246,0.05) 100%)',
          border: '1px solid rgba(139,92,246,0.3)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span
            style={{
              padding: '6px 16px',
              background: '#8b5cf6',
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
            }}
          >
            RELEASED
          </span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
            {new Date(release.releasedAt).toLocaleString()}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <InfoRow label="Release ID" value={release.releaseId} mono />
          <InfoRow label="Snapshot ID" value={snapshot.snapshotId} mono />
          <InfoRow label="Gate Report" value={gate.gateReportId} mono />
          <InfoRow label="Released By" value={release.releasedBy} />
        </div>
      </div>

      {/* Verification Status */}
      {verifyState.status !== 'idle' && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            borderRadius: 8,
            background:
              verifyState.status === 'verified'
                ? 'rgba(16,185,129,0.1)'
                : verifyState.status === 'failed'
                  ? 'rgba(239,68,68,0.1)'
                  : 'rgba(255,255,255,0.05)',
            border: `1px solid ${
              verifyState.status === 'verified'
                ? 'rgba(16,185,129,0.3)'
                : verifyState.status === 'failed'
                  ? 'rgba(239,68,68,0.3)'
                  : 'rgba(255,255,255,0.1)'
            }`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {verifyState.status === 'checking' && (
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>...</span>
          )}
          {verifyState.status === 'verified' && (
            <span style={{ color: '#10b981', fontWeight: 600 }}>✓</span>
          )}
          {verifyState.status === 'failed' && (
            <span style={{ color: '#ef4444', fontWeight: 600 }}>✗</span>
          )}
          <span
            style={{
              fontSize: 13,
              color:
                verifyState.status === 'verified'
                  ? '#10b981'
                  : verifyState.status === 'failed'
                    ? '#ef4444'
                    : 'rgba(255,255,255,0.6)',
            }}
          >
            {verifyState.message}
          </span>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={() => void verifyArtifacts()}
          disabled={!bundle || policyBlocked}
          style={{
            padding: '12px 24px',
            background: policyBlocked ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)',
            border: `1px solid ${policyBlocked ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}`,
            borderRadius: 8,
            color: policyBlocked ? '#ef4444' : '#3b82f6',
            fontWeight: 600,
            cursor: !bundle || policyBlocked ? 'not-allowed' : 'pointer',
            opacity: !bundle || policyBlocked ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <ShieldIcon />
          {policyBlocked ? 'Policy Required' : 'Verify Artifacts'}
        </button>

        <button
          onClick={() => void downloadCutlist()}
          disabled={!bundle || policyBlocked}
          style={{
            padding: '12px 24px',
            background: policyBlocked ? 'rgba(239,68,68,0.2)' : '#8b5cf6',
            border: policyBlocked ? '1px solid rgba(239,68,68,0.3)' : 'none',
            borderRadius: 8,
            color: policyBlocked ? '#ef4444' : '#fff',
            fontWeight: 600,
            cursor: !bundle || policyBlocked ? 'not-allowed' : 'pointer',
            opacity: !bundle || policyBlocked ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <DownloadIcon />
          Download Cut List CSV
        </button>

        <button
          onClick={() => void downloadManifest()}
          disabled={!bundle || policyBlocked}
          style={{
            padding: '12px 24px',
            background: policyBlocked ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
            border: `1px solid ${policyBlocked ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
            borderRadius: 8,
            color: policyBlocked ? '#ef4444' : '#10b981',
            cursor: !bundle || policyBlocked ? 'not-allowed' : 'pointer',
            opacity: !bundle || policyBlocked ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <DownloadIcon />
          Download Manifest
        </button>

        <button
          onClick={() => setShowManifestModal(true)}
          disabled={!signedManifest}
          style={{
            padding: '12px 24px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            color: '#fff',
            cursor: !signedManifest ? 'not-allowed' : 'pointer',
            opacity: !signedManifest ? 0.5 : 1,
          }}
        >
          View Manifest
        </button>

        <button
          onClick={createRevision}
          disabled={busy}
          style={{
            padding: '12px 24px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            color: '#fff',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.5 : 1,
          }}
        >
          Create Revision to Edit
        </button>
      </div>

      {/* Manifest Files */}
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 24,
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h4 style={{ margin: 0, color: '#fff' }}>Factory Artifacts</h4>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            Manifest: {manifest.manifestId}
          </span>
        </div>

        <div style={{ padding: 16 }}>
          {manifest.files.map((file: any, i: number) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 0',
                borderBottom: i < manifest.files.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              }}
            >
              <FileIcon />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontFamily: 'monospace' }}>{file.path}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                  SHA256: {file.sha256}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginRight: 8 }}>
                {formatBytes(file.bytes)}
              </div>
              {bundle && (
                <button
                  onClick={() => void downloadFromStore(file.path)}
                  style={{
                    padding: '4px 12px',
                    background: 'rgba(139,92,246,0.2)',
                    border: '1px solid rgba(139,92,246,0.3)',
                    borderRadius: 4,
                    color: '#a78bfa',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <DownloadIcon />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Signatures */}
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <h4 style={{ margin: 0, color: '#fff' }}>Approval Signatures</h4>
        </div>

        <div style={{ padding: 16 }}>
          {release.signatures.map((sig: any, i: number) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 0',
                borderBottom: i < release.signatures.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'rgba(16,185,129,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10b981',
                }}
              >
                ✓
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff' }}>{sig.signerUserId}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                  {new Date(sig.signedAt).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manifest Modal */}
      {showManifestModal && signedManifest && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowManifestModal(false)}
        >
          <div
            style={{
              background: '#1a1a2e',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              width: '90%',
              maxWidth: 800,
              maxHeight: '80vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: 16,
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ margin: 0, color: '#fff' }}>Signed Manifest</h3>
              <button
                onClick={() => setShowManifestModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: 24,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                padding: 16,
              }}
            >
              <pre
                style={{
                  margin: 0,
                  padding: 16,
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: '#a78bfa',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {JSON.stringify(signedManifest, null, 2)}
              </pre>
            </div>
            <div
              style={{
                padding: 16,
                borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
              }}
            >
              <button
                onClick={downloadManifest}
                style={{
                  padding: '8px 16px',
                  background: '#8b5cf6',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <DownloadIcon />
                Download JSON
              </button>
              <button
                onClick={() => setShowManifestModal(false)}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 6,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// HELPERS
// ============================================

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function InfoRow({ label, value, mono }: InfoRowProps) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          color: '#fff',
          fontFamily: mono ? 'monospace' : 'inherit',
          fontSize: mono ? 13 : 14,
          wordBreak: 'break-all',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}
