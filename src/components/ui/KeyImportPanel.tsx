/**
 * Key Import Panel with Trust Prompt
 *
 * UI for importing public keys from other machines/systems.
 * Imported keys are QUARANTINED by default and require explicit trust decision.
 *
 * Trust workflow:
 * 1. Paste/upload exported public key JSON
 * 2. Validate format and show key details
 * 3. Apply scope guards (FACTORY mode enforces factoryId binding)
 * 4. Display fingerprint for out-of-band verification
 * 5. User decides: Trust & Activate | Trust (inactive) | Reject
 */

import React from 'react';
import { persistentKeyRegistry } from '../../release/keys/persistentRegistry';
import {
  parseExportedPublicKeyJson,
  getKeyFingerprint,
  isValidEd25519PublicKeyBase64,
} from '../../release/keys/importExport';
import type { ExportedPublicKeyJson } from '../../release/keys/importExport';
import type { KeyTrust } from '../../release/keys/types';
import { getTrustColor } from '../../release/keys/policy';
import { guardImportKey, formatGuardRejection } from '../../release/keys/guards';
import type { GuardDecision } from '../../release/keys/guards';
import { getDeviceContext } from '../../runtime/env';
import { audit } from '../../release/keys/audit';
import { AdminOverrideDialog } from './AdminOverrideDialog';

type ImportStep = 'input' | 'preview' | 'complete';

type TrustDecision = 'trust_active' | 'trust_inactive' | 'reject' | 'quarantine';

/**
 * Props for KeyImportPanel
 */
interface KeyImportPanelProps {
  /** Called when import is complete (success or cancel) */
  onComplete?: (result: { imported: boolean; keyId?: string; trust?: KeyTrust }) => void;
  /** Initial JSON to import (e.g., from file drop) */
  initialJson?: string;
}

export function KeyImportPanel({ onComplete, initialJson }: KeyImportPanelProps) {
  const [step, setStep] = React.useState<ImportStep>(initialJson ? 'preview' : 'input');
  const [jsonInput, setJsonInput] = React.useState(initialJson || '');
  const [parsedKey, setParsedKey] = React.useState<ExportedPublicKeyJson | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);

  // Admin override state (for QUARANTINE severity guards)
  const [showAdminOverride, setShowAdminOverride] = React.useState(false);
  const [quarantineGuardDecision, setQuarantineGuardDecision] = React.useState<GuardDecision | null>(null);

  // Get device context for display
  const deviceContext = getDeviceContext();

  // Parse and validate JSON input
  const validateAndPreview = () => {
    setError(null);

    try {
      const parsed = parseExportedPublicKeyJson(jsonInput);

      // Additional validation
      if (!isValidEd25519PublicKeyBase64(parsed.publicKeyBase64)) {
        throw new Error('Invalid Ed25519 public key: wrong length (expected 32 bytes)');
      }

      // Check if key already exists
      const existing = persistentKeyRegistry.get(parsed.keyId);
      if (existing) {
        throw new Error(`Key already exists in registry (status: ${existing.status}, trust: ${existing.trust})`);
      }

      // Apply scope guard (FACTORY mode enforces factoryId binding)
      const guardDecision = guardImportKey(parsed);
      if (!guardDecision.ok) {
        // QUARANTINE severity allows admin override
        if (guardDecision.severity === 'QUARANTINE') {
          audit('KEY_IMPORTED_QUARANTINED', 'local', {
            keyId: parsed.keyId,
            reason: guardDecision.reason,
            adminOverrideAvailable: true,
          });
          setQuarantineGuardDecision(guardDecision);
          setParsedKey(parsed);
          setShowAdminOverride(true);
          return;
        }
        // HARD_REJECT blocks completely
        audit('KEY_IMPORT_BLOCKED', 'local', {
          keyId: parsed.keyId,
          reason: guardDecision.reason,
        });
        throw new Error(formatGuardRejection(guardDecision));
      }

      setParsedKey(parsed);
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid key format');
    }
  };

  // Import with trust decision
  const handleTrustDecision = async (decision: TrustDecision) => {
    if (!parsedKey) return;

    setImporting(true);
    setError(null);

    try {
      // Import key (starts as QUARANTINED)
      persistentKeyRegistry.importPublicKey({
        keyId: parsedKey.keyId,
        publicKeyBase64: parsedKey.publicKeyBase64,
        scope: parsedKey.scope || 'ORG',
        scopeId: parsedKey.scopeId,
        label: parsedKey.label || `Imported ${parsedKey.keyId.slice(0, 8)}...`,
        importedBy: 'local',
      });

      // Apply trust decision
      let finalTrust: KeyTrust = 'QUARANTINED';

      switch (decision) {
        case 'trust_active':
          persistentKeyRegistry.setTrust(parsedKey.keyId, 'TRUSTED', 'local', 'Trusted and activated on import');
          persistentKeyRegistry.activateKey(parsedKey.keyId, 'local');
          finalTrust = 'TRUSTED';
          break;

        case 'trust_inactive':
          persistentKeyRegistry.setTrust(parsedKey.keyId, 'TRUSTED', 'local', 'Trusted on import (not activated)');
          finalTrust = 'TRUSTED';
          break;

        case 'reject':
          persistentKeyRegistry.setTrust(parsedKey.keyId, 'REJECTED', 'local', 'Rejected on import');
          finalTrust = 'REJECTED';
          break;

        case 'quarantine':
          // Keep as QUARANTINED (default)
          finalTrust = 'QUARANTINED';
          break;
      }

      setStep('complete');
      onComplete?.({ imported: true, keyId: parsedKey.keyId, trust: finalTrust });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // Handle admin override success
  const handleAdminOverride = (args: { overriddenBy: string; overrideReason: string }) => {
    if (!parsedKey) return;

    // Log the override
    audit('KEY_OVERRIDE_TRUST', args.overriddenBy, {
      keyId: parsedKey.keyId,
      overrideReason: args.overrideReason,
      originalGuardReason: quarantineGuardDecision && !quarantineGuardDecision.ok ? quarantineGuardDecision.reason : 'unknown',
    });

    // Close dialog and proceed to preview
    setShowAdminOverride(false);
    setQuarantineGuardDecision(null);
    setStep('preview');
  };

  // Cancel admin override
  const handleAdminOverrideCancel = () => {
    setShowAdminOverride(false);
    setQuarantineGuardDecision(null);
    setParsedKey(null);
  };

  // Cancel and reset
  const handleCancel = () => {
    setStep('input');
    setJsonInput('');
    setParsedKey(null);
    setError(null);
    setShowAdminOverride(false);
    setQuarantineGuardDecision(null);
    onComplete?.({ imported: false });
  };

  // File input handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonInput(content);
    };
    reader.readAsText(file);
  };

  return (
    <div
      style={{
        padding: 16,
        backgroundColor: '#1a1a2e',
        borderRadius: 8,
        color: '#e0e0e0',
        maxWidth: 500,
      }}
    >
      <h3 style={{ margin: '0 0 8px 0', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>Import Public Key</span>
        {step === 'preview' && (
          <span
            style={{
              padding: '2px 8px',
              backgroundColor: '#f59e0b',
              color: '#000',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            VERIFY FINGERPRINT
          </span>
        )}
      </h3>

      {/* Device context info */}
      <div
        style={{
          marginBottom: 16,
          padding: '6px 10px',
          backgroundColor: deviceContext.mode === 'FACTORY' ? '#1e3a5f' : '#2a2a4a',
          borderRadius: 4,
          fontSize: 11,
          color: '#a0a0a0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>Device mode:</span>
        <strong style={{ color: deviceContext.mode === 'FACTORY' ? '#60a5fa' : '#a0a0a0' }}>
          {deviceContext.mode}
        </strong>
        {deviceContext.mode === 'FACTORY' && (
          <>
            <span style={{ color: '#4a4a6a' }}>|</span>
            <span>factoryId:</span>
            <strong style={{ color: deviceContext.factoryId ? '#22c55e' : '#ef4444' }}>
              {deviceContext.factoryId || '(not set)'}
            </strong>
          </>
        )}
        {deviceContext.mode === 'FACTORY' && !deviceContext.configured && (
          <span style={{ color: '#ef4444', marginLeft: 'auto' }}>
            Configure device settings first
          </span>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div
          style={{
            padding: '10px 12px',
            marginBottom: 12,
            backgroundColor: '#991b1b',
            color: '#fff',
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* Step 1: Input */}
      {step === 'input' && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 12,
                color: '#a0a0a0',
              }}
            >
              Paste exported public key JSON or select a file:
            </label>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={`{
  "format": "raw",
  "alg": "ed25519",
  "keyId": "abc123...",
  "publicKeyBase64": "base64..."
}`}
              style={{
                width: '100%',
                minHeight: 120,
                padding: 10,
                backgroundColor: '#0a0a1e',
                color: '#e0e0e0',
                border: '1px solid #3a3a5a',
                borderRadius: 4,
                fontFamily: 'monospace',
                fontSize: 11,
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              style={{ fontSize: 12 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={validateAndPreview}
              disabled={!jsonInput.trim()}
              style={{
                padding: '8px 16px',
                backgroundColor: jsonInput.trim() ? '#3b82f6' : '#4a4a6a',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: jsonInput.trim() ? 'pointer' : 'not-allowed',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Validate & Preview
            </button>
            <button
              onClick={handleCancel}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4a4a6a',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Preview with Trust Decision */}
      {step === 'preview' && parsedKey && (
        <div>
          {/* Key details */}
          <div
            style={{
              padding: 12,
              marginBottom: 16,
              backgroundColor: '#0a0a1e',
              borderRadius: 4,
              border: '1px solid #3a3a5a',
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Key ID</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                {parsedKey.keyId}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Fingerprint (verify this!)</div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 18,
                  fontWeight: 600,
                  color: '#f59e0b',
                  letterSpacing: 2,
                }}
              >
                {getKeyFingerprint(parsedKey.keyId)}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Algorithm</div>
                <div style={{ fontSize: 12 }}>{parsedKey.alg}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Scope</div>
                <div style={{ fontSize: 12 }}>
                  <span
                    style={{
                      padding: '2px 6px',
                      backgroundColor: parsedKey.scope === 'FACTORY' ? '#1e3a5f' : '#2a2a4a',
                      borderRadius: 3,
                    }}
                  >
                    {parsedKey.scope}
                  </span>
                </div>
              </div>
              {parsedKey.scopeId && (
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                    {parsedKey.scope === 'FACTORY' ? 'Factory ID' : 'Scope ID'}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace' }}>{parsedKey.scopeId}</div>
                </div>
              )}
              {parsedKey.createdAtIso && (
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Created</div>
                  <div style={{ fontSize: 12 }}>{parsedKey.createdAtIso.slice(0, 10)}</div>
                </div>
              )}
              {parsedKey.label && (
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Label</div>
                  <div style={{ fontSize: 12 }}>{parsedKey.label}</div>
                </div>
              )}
            </div>
          </div>

          {/* Trust decision warning */}
          <div
            style={{
              padding: 12,
              marginBottom: 16,
              backgroundColor: '#422006',
              borderRadius: 4,
              border: '1px solid #f59e0b',
              fontSize: 12,
            }}
          >
            <strong style={{ color: '#f59e0b' }}>Verify the fingerprint above!</strong>
            <p style={{ margin: '8px 0 0 0', color: '#fbbf24' }}>
              Contact the key owner through a separate channel (phone, in-person, etc.) and confirm the fingerprint matches. Trusting an unverified key could allow an attacker to sign fraudulent releases.
            </p>
          </div>

          {/* Trust decision buttons */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#a0a0a0', marginBottom: 8 }}>
              Choose trust level for this key:
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => void handleTrustDecision('trust_active')}
                disabled={importing}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#166534',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: importing ? 'wait' : 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  textAlign: 'left',
                }}
              >
                <span style={{ color: getTrustColor('TRUSTED') }}>Trust & Activate</span>
                <span style={{ display: 'block', fontSize: 11, color: '#86efac', marginTop: 2 }}>
                  Key will be trusted AND set as active signing key
                </span>
              </button>

              <button
                onClick={() => void handleTrustDecision('trust_inactive')}
                disabled={importing}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#1e3a5f',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: importing ? 'wait' : 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  textAlign: 'left',
                }}
              >
                <span style={{ color: '#60a5fa' }}>Trust (Keep Inactive)</span>
                <span style={{ display: 'block', fontSize: 11, color: '#93c5fd', marginTop: 2 }}>
                  Key will be trusted for verification but not activated for signing
                </span>
              </button>

              <button
                onClick={() => void handleTrustDecision('quarantine')}
                disabled={importing}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#4a4a6a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: importing ? 'wait' : 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  textAlign: 'left',
                }}
              >
                <span style={{ color: getTrustColor('QUARANTINED') }}>Keep Quarantined</span>
                <span style={{ display: 'block', fontSize: 11, color: '#a0a0a0', marginTop: 2 }}>
                  Import key but keep in quarantine for later review
                </span>
              </button>

              <button
                onClick={() => void handleTrustDecision('reject')}
                disabled={importing}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#4a1a1a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: importing ? 'wait' : 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  textAlign: 'left',
                }}
              >
                <span style={{ color: getTrustColor('REJECTED') }}>Reject</span>
                <span style={{ display: 'block', fontSize: 11, color: '#f87171', marginTop: 2 }}>
                  Mark as untrusted - verification will always fail
                </span>
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              setStep('input');
              setParsedKey(null);
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4a4a6a',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Back
          </button>
        </div>
      )}

      {/* Step 3: Complete */}
      {step === 'complete' && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>&#10003;</div>
          <div style={{ fontSize: 14, marginBottom: 16 }}>Key imported successfully!</div>
          <button
            onClick={handleCancel}
            style={{
              padding: '8px 24px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Done
          </button>
        </div>
      )}

      {/* Admin Override Dialog (for QUARANTINE severity guards) */}
      {showAdminOverride && parsedKey && quarantineGuardDecision && !quarantineGuardDecision.ok && (
        <AdminOverrideDialog
          keyId={parsedKey.keyId}
          quarantineReason={quarantineGuardDecision.reason}
          onCancel={handleAdminOverrideCancel}
          onOverride={handleAdminOverride}
          loading={importing}
        />
      )}
    </div>
  );
}

/**
 * Trust Prompt Modal - for changing trust on existing QUARANTINED keys
 */
interface TrustPromptModalProps {
  keyId: string;
  fingerprint: string;
  onDecision: (trust: KeyTrust) => void;
  onCancel: () => void;
}

export function TrustPromptModal({ keyId: _keyId, fingerprint, onDecision, onCancel }: TrustPromptModalProps) {
  // _keyId reserved for future use (e.g., displaying in modal)
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: 8,
          padding: 24,
          maxWidth: 400,
          color: '#e0e0e0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 16px 0', color: '#fff' }}>Trust Decision Required</h3>

        <div
          style={{
            padding: 12,
            marginBottom: 16,
            backgroundColor: '#0a0a1e',
            borderRadius: 4,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Key Fingerprint</div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 20,
              fontWeight: 600,
              color: '#f59e0b',
              letterSpacing: 2,
            }}
          >
            {fingerprint}
          </div>
        </div>

        <div style={{ fontSize: 12, color: '#a0a0a0', marginBottom: 16 }}>
          This key is currently QUARANTINED. Verify the fingerprint with the key owner before trusting.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => onDecision('TRUSTED')}
            style={{
              padding: '10px 16px',
              backgroundColor: '#166534',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Trust This Key
          </button>
          <button
            onClick={() => onDecision('REJECTED')}
            style={{
              padding: '10px 16px',
              backgroundColor: '#991b1b',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Reject This Key
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 16px',
              backgroundColor: '#4a4a6a',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Keep Quarantined
          </button>
        </div>
      </div>
    </div>
  );
}
