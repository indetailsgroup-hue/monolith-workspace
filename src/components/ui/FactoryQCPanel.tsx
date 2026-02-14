/**
 * FactoryQCPanel.tsx - Factory QC Panel for Bundle Verification & Receipt Signing
 *
 * CLOSED-LOOP WORKFLOW:
 * 1. Upload zip bundle
 * 2. Verify bundle integrity
 * 3. Review checklist
 * 4. Type "ACCEPT" or "REJECT" with reasons
 * 5. Sign receipt with factory key
 * 6. Copy/Download signed receipt
 *
 * The signed receipt can be sent back to the design system
 * to be appended to the manifest chain.
 */

import React, { useState, useCallback } from 'react';
import type { TrustChainService } from '../../core/trustChain/trustChainService';
import type {
  FactoryReceipt,
  SignedFactoryReceipt,
} from '../../core/receipt/factoryReceiptTypes';
import { signFactoryReceipt } from '../../core/receipt/signFactoryReceipt';
import { sha256Hex } from '../../core/crypto/sha256';
import type { BundleVerificationResult } from '../../core/bundle/bundleTypes';

// ============================================
// TYPES
// ============================================

interface FactoryQCPanelProps {
  /** Trust chain service for bundle verification */
  svc: TrustChainService;

  /** Factory key ID */
  factoryKeyId: string;

  /** Factory private key (hex) */
  factoryPrivateKeyHex: string;

  /** Optional callback when receipt is signed */
  onReceiptSigned?: (signed: SignedFactoryReceipt) => void;
}

type PanelStep =
  | 'UPLOAD'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'SIGNING'
  | 'SIGNED'
  | 'ERROR';

// ============================================
// STYLES
// ============================================

const panelStyle: React.CSSProperties = {
  padding: 16,
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const headerStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  marginBottom: 16,
  color: '#fff',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: 12,
  background: 'rgba(255,255,255,0.05)',
  borderRadius: 8,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 6,
  color: '#fff',
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'rgba(34, 197, 94, 0.2)',
  border: '1px solid rgba(34, 197, 94, 0.5)',
  borderRadius: 6,
  color: '#22c55e',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};

const disabledButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  opacity: 0.5,
  cursor: 'not-allowed',
};

const errorStyle: React.CSSProperties = {
  color: '#ef4444',
  fontSize: 14,
  marginTop: 8,
};

const successStyle: React.CSSProperties = {
  color: '#22c55e',
  fontSize: 14,
  marginTop: 8,
};

// ============================================
// COMPONENT
// ============================================

export function FactoryQCPanel(props: FactoryQCPanelProps) {
  const { svc, factoryKeyId, factoryPrivateKeyHex, onReceiptSigned } = props;

  // State
  const [step, setStep] = useState<PanelStep>('UPLOAD');
  const [error, setError] = useState<string | null>(null);

  const [zipBytes, setZipBytes] = useState<Uint8Array | null>(null);
  const [zipHash, setZipHash] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<BundleVerificationResult | null>(null);

  const [receipt, setReceipt] = useState<FactoryReceipt | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [rejectReasons, setRejectReasons] = useState('');
  const [note, setNote] = useState('');

  const [signedReceipt, setSignedReceipt] = useState<SignedFactoryReceipt | null>(null);

  // File upload handler
  const handleFileUpload = useCallback(
    async (file: File) => {
      setStep('VERIFYING');
      setError(null);
      setReceipt(null);
      setSignedReceipt(null);
      setConfirmText('');

      try {
        // Read file
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        setZipBytes(bytes);

        // Compute zip hash
        const hash = await sha256Hex(bytes);
        setZipHash(hash);

        // Verify bundle
        const blob = new Blob([bytes], { type: 'application/zip' });
        const result = await svc.verifyBundle(blob);
        setVerifyResult(result);

        if (!result.ok) {
          setStep('ERROR');
          setError(result.reason ?? 'Bundle verification failed');
          return;
        }

        // Create receipt draft
        const draft: FactoryReceipt = {
          version: '1.0',
          jobId: result.jobId ?? 'unknown',
          headManifestHashHex: result.headHash ?? '',
          snapshotHashHex: '', // Could be extracted from manifest
          bundleZipSha256Hex: hash,
          acceptedAtIso: new Date().toISOString(),
          stationId: 'FACTORY_STATION_1',
          inspector: 'QC-A',
          verdict: 'ACCEPTED',
        };

        setReceipt(draft);
        setStep('VERIFIED');
      } catch (e) {
        setStep('ERROR');
        setError(e instanceof Error ? e.message : 'Failed to process file');
      }
    },
    [svc]
  );

  // Sign receipt handler
  const handleSign = useCallback(async () => {
    if (!receipt || !zipBytes) return;

    const trimmed = confirmText.trim().toUpperCase();
    const isAccept = trimmed === 'ACCEPT';
    const isReject = trimmed === 'REJECT';

    if (!isAccept && !isReject) {
      setError('Type "ACCEPT" or "REJECT" exactly');
      return;
    }

    setStep('SIGNING');
    setError(null);

    try {
      const finalReceipt: FactoryReceipt = {
        ...receipt,
        verdict: isAccept ? 'ACCEPTED' : 'REJECTED',
        rejectReasons: isReject ? rejectReasons.split('\n').filter((r) => r.trim()) : undefined,
        note: note.trim() || undefined,
        acceptedAtIso: new Date().toISOString(),
      };

      const signed = await signFactoryReceipt({
        receipt: finalReceipt,
        keyId: factoryKeyId,
        privateKeyHex: factoryPrivateKeyHex,
      });

      setSignedReceipt(signed);
      setStep('SIGNED');

      onReceiptSigned?.(signed);
    } catch (e) {
      setStep('ERROR');
      setError(e instanceof Error ? e.message : 'Signing failed');
    }
  }, [
    receipt,
    zipBytes,
    confirmText,
    rejectReasons,
    note,
    factoryKeyId,
    factoryPrivateKeyHex,
    onReceiptSigned,
  ]);

  // Copy receipt to clipboard
  const handleCopy = useCallback(() => {
    if (signedReceipt) {
      navigator.clipboard.writeText(JSON.stringify(signedReceipt, null, 2));
    }
  }, [signedReceipt]);

  // Reset
  const handleReset = useCallback(() => {
    setStep('UPLOAD');
    setError(null);
    setZipBytes(null);
    setZipHash(null);
    setVerifyResult(null);
    setReceipt(null);
    setConfirmText('');
    setRejectReasons('');
    setNote('');
    setSignedReceipt(null);
  }, []);

  // Render
  return (
    <div style={panelStyle}>
      <div style={headerStyle}>Factory QC</div>

      {/* Upload section */}
      {step === 'UPLOAD' && (
        <div style={sectionStyle}>
          <div style={{ marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>
            Upload export bundle (.zip) to verify
          </div>
          <input
            type="file"
            accept=".zip"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
            style={inputStyle}
          />
        </div>
      )}

      {/* Verifying */}
      {step === 'VERIFYING' && (
        <div style={sectionStyle}>
          <div style={{ color: '#3b82f6' }}>Verifying bundle...</div>
        </div>
      )}

      {/* Verified - show receipt form */}
      {step === 'VERIFIED' && receipt && (
        <>
          <div style={sectionStyle}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Verification OK</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              Job: {receipt.jobId}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              Head: {receipt.headManifestHashHex.slice(0, 16)}...
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              Bundle SHA-256: {zipHash?.slice(0, 16)}...
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Receipt Details</div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                Station ID
              </label>
              <input
                value={receipt.stationId}
                onChange={(e) => setReceipt({ ...receipt, stationId: e.target.value })}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                Inspector
              </label>
              <input
                value={receipt.inspector}
                onChange={(e) => setReceipt({ ...receipt, inspector: e.target.value })}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                Note (optional)
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={inputStyle}
                placeholder="Optional note..."
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                Rejection Reasons (one per line, if rejecting)
              </label>
              <textarea
                value={rejectReasons}
                onChange={(e) => setRejectReasons(e.target.value)}
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                placeholder="Enter rejection reasons..."
              />
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={{ marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>
              Type <strong style={{ fontFamily: 'monospace' }}>ACCEPT</strong> or{' '}
              <strong style={{ fontFamily: 'monospace' }}>REJECT</strong> to sign receipt:
            </div>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              style={inputStyle}
              placeholder="Type ACCEPT or REJECT"
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSign}
              disabled={
                confirmText.trim().toUpperCase() !== 'ACCEPT' &&
                confirmText.trim().toUpperCase() !== 'REJECT'
              }
              style={
                confirmText.trim().toUpperCase() === 'ACCEPT' ||
                confirmText.trim().toUpperCase() === 'REJECT'
                  ? buttonStyle
                  : disabledButtonStyle
              }
            >
              Sign Receipt
            </button>
            <button onClick={handleReset} style={{ ...buttonStyle, background: 'transparent' }}>
              Reset
            </button>
          </div>

          {error && <div style={errorStyle}>{error}</div>}
        </>
      )}

      {/* Signing */}
      {step === 'SIGNING' && (
        <div style={sectionStyle}>
          <div style={{ color: '#3b82f6' }}>Signing receipt...</div>
        </div>
      )}

      {/* Signed - show result */}
      {step === 'SIGNED' && signedReceipt && (
        <>
          <div style={sectionStyle}>
            <div style={successStyle}>Receipt signed successfully!</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
              Verdict: {signedReceipt.receipt.verdict}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              Key ID: {signedReceipt.keyId}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              Hash: {signedReceipt.receiptHashHex.slice(0, 16)}...
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCopy} style={buttonStyle}>
              Copy Signed Receipt JSON
            </button>
            <button onClick={handleReset} style={{ ...buttonStyle, background: 'transparent' }}>
              Start Over
            </button>
          </div>
        </>
      )}

      {/* Error */}
      {step === 'ERROR' && (
        <>
          <div style={sectionStyle}>
            <div style={errorStyle}>{error}</div>
          </div>
          <button onClick={handleReset} style={buttonStyle}>
            Try Again
          </button>
        </>
      )}
    </div>
  );
}

export default FactoryQCPanel;
