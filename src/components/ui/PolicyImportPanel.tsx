/**
 * Policy Import Panel (v0.9)
 *
 * UI for importing signed revocation-policy.json artifacts:
 * - Parse and verify signature
 * - Preview policy details before installing
 * - Install as local fallback policy
 * - Clear installed policy
 *
 * Precedence: Bundle policy > Installed policy > None
 */

import React from 'react';
import { isAdminSessionActive } from '../../runtime/admin';
import { getRuntimeMode, getFactoryId } from '../../runtime/env';
import { verifyRevocationPolicyArtifact } from '../../release/policy/verifyRevocationPolicyArtifact';
import {
  getInstalledPolicyInfo,
  installPolicyJson,
  clearInstalledPolicy,
} from '../../release/policy/installedPolicyStore';
import {
  resolvePolicyJsonByPrecedence,
  describePolicySource,
} from '../../release/policy/policyPrecedence';
import { audit } from '../../release/keys/audit';
import type { SignedRevocationPolicy } from '../../release/policy/revocationPolicyTypes';

/**
 * Parse policy JSON safely
 */
function parsePolicyJson(jsonStr: string): SignedRevocationPolicy | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed?.policyType === 'revocation-policy') {
      return parsed as SignedRevocationPolicy;
    }
    return null;
  } catch {
    return null;
  }
}

export function PolicyImportPanel() {
  const [inputJson, setInputJson] = React.useState('');
  const [message, setMessage] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<{
    policy: SignedRevocationPolicy;
    verifyResult: Awaited<ReturnType<typeof verifyRevocationPolicyArtifact>>;
  } | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [installedInfo, setInstalledInfo] = React.useState(() => getInstalledPolicyInfo());

  const mode = getRuntimeMode();
  const factoryId = getFactoryId();
  const isAdmin = isAdminSessionActive();

  const refreshInstalledInfo = () => setInstalledInfo(getInstalledPolicyInfo());

  // Get current precedence
  const precedence = resolvePolicyJsonByPrecedence();

  const handleVerify = async () => {
    if (!inputJson.trim()) {
      setMessage('Paste a signed revocation-policy.json to verify.');
      setPreview(null);
      return;
    }

    const policy = parsePolicyJson(inputJson.trim());
    if (!policy) {
      setMessage('Invalid JSON or not a revocation-policy artifact.');
      setPreview(null);
      return;
    }

    setVerifying(true);
    setMessage(null);
    try {
      const result = await verifyRevocationPolicyArtifact(inputJson.trim());
      setPreview({ policy, verifyResult: result });

      if (result.ok) {
        setMessage('Signature valid. Review details below.');
      } else {
        setMessage(`Verification failed: ${result.error}`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Verification error.');
      setPreview(null);
    } finally {
      setVerifying(false);
    }
  };

  const handleInstall = () => {
    if (!isAdmin) {
      setMessage('Admin session required to install policy.');
      return;
    }
    if (!preview || !preview.verifyResult.ok) {
      setMessage('Cannot install: policy not verified.');
      return;
    }

    installPolicyJson(inputJson.trim(), {
      by: 'local-admin',
      source: 'IMPORT',
      note: `Imported policy with ${preview.policy.rules.length} rule(s)`,
    });

    audit('POLICY_REVOKE_SET', 'local-admin', {
      action: 'install_policy',
      scope: preview.policy.scope,
      scopeId: preview.policy.scopeId,
      rulesCount: preview.policy.rules.length,
      signerKeyId: preview.policy.signature.publicKeyId.slice(0, 16),
    });

    setMessage('Policy installed successfully.');
    setInputJson('');
    setPreview(null);
    refreshInstalledInfo();
  };

  const handleClear = () => {
    if (!isAdmin) {
      setMessage('Admin session required to clear policy.');
      return;
    }

    clearInstalledPolicy('local-admin');

    audit('POLICY_REVOKE_CLEAR', 'local-admin', {
      action: 'clear_installed_policy',
    });

    setMessage('Installed policy cleared.');
    refreshInstalledInfo();
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result;
      if (typeof content === 'string') {
        setInputJson(content);
        setPreview(null);
        setMessage('File loaded. Click "Verify" to check signature.');
      }
    };
    reader.onerror = () => {
      setMessage('Failed to read file.');
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
      }}
    >
      <h3 style={{ margin: '0 0 16px 0', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20 }}>📥</span>
        Policy Import &amp; Precedence
      </h3>

      {/* Current Precedence Status */}
      <div
        style={{
          padding: 12,
          marginBottom: 12,
          backgroundColor: '#0a0a1e',
          borderRadius: 8,
          border: '1px solid #3a3a5a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ color: '#fff' }}>Policy Precedence</strong>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#a0a0a0' }}>
          <div>
            Current Source:{' '}
            <strong
              style={{
                color:
                  precedence.source === 'BUNDLE'
                    ? '#22c55e'
                    : precedence.source === 'INSTALLED'
                    ? '#3b82f6'
                    : '#6b7280',
              }}
            >
              {describePolicySource(precedence.source)}
            </strong>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
          Priority: BUNDLE (highest) → INSTALLED → NONE
        </div>
      </div>

      {/* Device Context */}
      <div
        style={{
          padding: 12,
          marginBottom: 12,
          backgroundColor: mode === 'FACTORY' ? '#1e3a5f' : '#2a2a4a',
          borderRadius: 8,
          border: '1px solid #3a3a5a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ color: '#fff' }}>Device Context</strong>
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: '#a0a0a0' }}>
          Mode: <strong style={{ color: mode === 'FACTORY' ? '#60a5fa' : '#a0a0a0' }}>{mode}</strong>
          {mode === 'FACTORY' && (
            <>
              {' • '}
              factoryId: <strong style={{ color: factoryId ? '#22c55e' : '#ef4444' }}>{factoryId ?? '(not set)'}</strong>
            </>
          )}
        </div>
      </div>

      {/* Installed Policy Info */}
      <div
        style={{
          padding: 12,
          marginBottom: 12,
          backgroundColor: installedInfo.installed ? '#0d3320' : '#0a0a1e',
          borderRadius: 8,
          border: `1px solid ${installedInfo.installed ? '#166534' : '#3a3a5a'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>{installedInfo.installed ? '✅' : '⬜'}</span>
            <strong style={{ color: '#fff' }}>Installed Policy</strong>
          </div>
          <button
            onClick={handleClear}
            disabled={!isAdmin || !installedInfo.installed}
            style={{
              padding: '4px 10px',
              backgroundColor: isAdmin && installedInfo.installed ? '#991b1b' : '#4a4a6a',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: isAdmin && installedInfo.installed ? 'pointer' : 'not-allowed',
              fontSize: 11,
            }}
          >
            Clear
          </button>
        </div>
        {installedInfo.installed ? (
          <div style={{ marginTop: 8, fontSize: 11, color: '#a0a0a0' }}>
            <div>Size: {installedInfo.jsonLength} bytes</div>
            {installedInfo.meta && (
              <>
                <div>Installed: {new Date(installedInfo.meta.installedAtIso).toLocaleString()}</div>
                <div>By: {installedInfo.meta.installedBy}</div>
                <div>Source: {installedInfo.meta.source}</div>
                {installedInfo.meta.note && <div>Note: {installedInfo.meta.note}</div>}
              </>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
            No policy installed. Import a signed policy below.
          </div>
        )}
      </div>

      {/* Import Section */}
      <div
        style={{
          padding: 12,
          backgroundColor: '#0a0a1e',
          borderRadius: 8,
          border: '1px solid #3a3a5a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <strong style={{ color: '#fff' }}>Import Policy</strong>
          <label
            style={{
              padding: '4px 10px',
              backgroundColor: '#1e3a5f',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Browse File
            <input
              type="file"
              accept=".json"
              onChange={handleFileImport}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        <textarea
          value={inputJson}
          onChange={(e) => {
            setInputJson(e.target.value);
            setPreview(null);
          }}
          placeholder="Paste signed revocation-policy.json content here..."
          style={{
            width: '100%',
            height: 120,
            marginTop: 10,
            padding: 10,
            borderRadius: 6,
            border: '1px solid #3a3a5a',
            backgroundColor: '#1a1a2e',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: 11,
            resize: 'vertical',
          }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={() => void handleVerify()}
            disabled={verifying || !inputJson.trim()}
            style={{
              padding: '8px 14px',
              backgroundColor: inputJson.trim() ? '#3b82f6' : '#4a4a6a',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: verifying || !inputJson.trim() ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {verifying ? 'Verifying...' : 'Verify Signature'}
          </button>
          <button
            onClick={handleInstall}
            disabled={!isAdmin || !preview?.verifyResult.ok}
            style={{
              padding: '8px 14px',
              backgroundColor: isAdmin && preview?.verifyResult.ok ? '#166534' : '#4a4a6a',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: isAdmin && preview?.verifyResult.ok ? 'pointer' : 'not-allowed',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Install Policy
          </button>
          <button
            onClick={() => {
              setInputJson('');
              setPreview(null);
              setMessage(null);
            }}
            style={{
              padding: '8px 14px',
              backgroundColor: '#4a4a6a',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Clear
          </button>
        </div>

        {/* Message */}
        {message && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 12px',
              backgroundColor: message.includes('failed') || message.includes('Invalid') || message.includes('Cannot')
                ? '#991b1b'
                : message.includes('successfully') || message.includes('valid')
                ? '#166534'
                : '#1e3a5f',
              borderRadius: 4,
              fontSize: 12,
              color: '#fff',
            }}
          >
            {message}
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              backgroundColor: preview.verifyResult.ok ? '#0d3320' : '#422006',
              borderRadius: 8,
              border: `1px solid ${preview.verifyResult.ok ? '#166534' : '#f59e0b'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>{preview.verifyResult.ok ? '✅' : '⚠️'}</span>
              <strong style={{ color: '#fff' }}>
                {preview.verifyResult.ok ? 'Signature Valid' : 'Verification Issue'}
              </strong>
            </div>

            <div style={{ fontSize: 12, color: '#e0e0e0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 8px' }}>
                <span style={{ color: '#a0a0a0' }}>Policy Type:</span>
                <span>{preview.policy.policyType}</span>

                <span style={{ color: '#a0a0a0' }}>Version:</span>
                <span>{preview.policy.policyVersion}</span>

                <span style={{ color: '#a0a0a0' }}>Scope:</span>
                <span>
                  {preview.policy.scope}
                  {preview.policy.scopeId && ` (${preview.policy.scopeId})`}
                </span>

                <span style={{ color: '#a0a0a0' }}>Updated:</span>
                <span>{new Date(preview.policy.updatedAtIso).toLocaleString()}</span>

                <span style={{ color: '#a0a0a0' }}>Updated By:</span>
                <span>{preview.policy.updatedBy}</span>

                <span style={{ color: '#a0a0a0' }}>Rules:</span>
                <span>{preview.policy.rules.length} revocation rule(s)</span>

                <span style={{ color: '#a0a0a0' }}>Signer KeyId:</span>
                <span style={{ fontFamily: 'monospace', color: '#f59e0b' }}>
                  {preview.policy.signature.publicKeyId.slice(0, 24)}...
                </span>
              </div>
            </div>

            {!preview.verifyResult.ok && (
              <div
                style={{
                  marginTop: 8,
                  padding: '6px 10px',
                  backgroundColor: '#991b1b',
                  borderRadius: 4,
                  fontSize: 11,
                  color: '#fff',
                }}
              >
                {preview.verifyResult.error}
              </div>
            )}

            {/* Rules Preview */}
            {preview.policy.rules.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 4 }}>Revocation Rules:</div>
                <div
                  style={{
                    maxHeight: 100,
                    overflowY: 'auto',
                    backgroundColor: '#0a0a1e',
                    borderRadius: 4,
                    padding: 8,
                  }}
                >
                  {preview.policy.rules.map((rule, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 10,
                        fontFamily: 'monospace',
                        color: '#e0e0e0',
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ color: '#f59e0b' }}>{rule.keyId.slice(0, 16)}...</span>
                      {' @ '}
                      <span style={{ color: '#a0a0a0' }}>{rule.revokedAtIso}</span>
                      {' — '}
                      <span style={{ color: '#6b7280' }}>{rule.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admin Note */}
      {!isAdmin && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            backgroundColor: '#422006',
            borderRadius: 4,
            border: '1px solid #f59e0b',
            fontSize: 11,
            color: '#fbbf24',
          }}
        >
          <strong>Admin Required:</strong> Start an admin session to install or clear policies.
        </div>
      )}

      {/* Info */}
      <div
        style={{
          marginTop: 12,
          padding: 10,
          backgroundColor: '#0a0a1e',
          borderRadius: 8,
          border: '1px solid #3a3a5a',
          fontSize: 11,
          color: '#6b7280',
        }}
      >
        <strong>Policy Precedence:</strong>
        <div style={{ marginTop: 4 }}>
          1. <strong style={{ color: '#22c55e' }}>BUNDLE</strong> — Policy in release bundle (highest priority)
        </div>
        <div>
          2. <strong style={{ color: '#3b82f6' }}>INSTALLED</strong> — Locally installed signed policy
        </div>
        <div>
          3. <strong style={{ color: '#6b7280' }}>NONE</strong> — No policy available
        </div>
      </div>
    </div>
  );
}

export default PolicyImportPanel;
