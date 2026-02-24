/**
 * Key Management Panel
 *
 * UI for managing Ed25519 signing keys:
 * - View registered keys with status and trust level
 * - Rotate (generate new) signing key
 * - Revoke compromised/old keys
 * - Export public key for sharing
 * - Import public key from other systems
 * - Manage trust for quarantined keys
 */

import React from 'react';
import { persistentKeyRegistry } from '../../release/keys/persistentRegistry';
import { rotateSigningKey } from '../../release/keys/keyRegistry';
import { getTrustColor } from '../../release/keys/policy';
import { getKeyFingerprint } from '../../release/keys/importExport';
import type { PublicKeyRecord, ExportedPublicKeyBundle, KeyTrust } from '../../release/keys/types';
import { KeyImportPanel, TrustPromptModal } from './KeyImportPanel';

/**
 * Download a text file
 */
function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Get current ISO timestamp
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Key status badge colors
 */
function getStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return '#22c55e'; // green
    case 'REVOKED':
      return '#ef4444'; // red
    case 'EXPIRED':
      return '#f59e0b'; // amber
    default:
      return '#6b7280'; // gray
  }
}

export function KeyManagementPanel() {
  const [keys, setKeys] = React.useState<PublicKeyRecord[]>(() =>
    persistentKeyRegistry.list()
  );
  const [message, setMessage] = React.useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [showImportPanel, setShowImportPanel] = React.useState(false);
  const [trustPromptKey, setTrustPromptKey] = React.useState<PublicKeyRecord | null>(null);

  const activeKeyId = persistentKeyRegistry.getActiveKeyId();

  const refresh = () => {
    setKeys(persistentKeyRegistry.list());
  };

  const showMessage = (
    type: 'success' | 'error' | 'info',
    text: string,
    duration = 3000
  ) => {
    setMessage({ type, text });
    if (duration > 0) {
      setTimeout(() => setMessage(null), duration);
    }
  };

  // Export public key as JSON
  const exportPublicKey = (keyId: string) => {
    const k = persistentKeyRegistry.get(keyId);
    if (!k) {
      showMessage('error', 'Key not found');
      return;
    }

    const bundle: ExportedPublicKeyBundle = {
      format: 'raw',
      alg: 'ed25519',
      keyId: k.keyId,
      publicKeyBase64: k.publicKeyBase64,
      createdAtIso: k.createdAtIso,
      scope: k.scope,
      scopeId: k.scopeId,
      label: k.label,
    };

    const json = JSON.stringify(bundle, null, 2) + '\n';
    downloadTextFile(
      `publicKey_${k.keyId.slice(0, 12)}.json`,
      json,
      'application/json;charset=utf-8'
    );
    showMessage('success', `Exported public key: ${k.keyId.slice(0, 12)}...`);
  };

  // Revoke a key
  const revokeKey = (keyId: string) => {
    const reason = prompt('Enter revocation reason (required):');
    if (!reason || reason.trim() === '') {
      showMessage('error', 'Revocation reason is required');
      return;
    }

    try {
      persistentKeyRegistry.revokeKey(keyId, 'local', reason.trim());
      showMessage('success', `Revoked key: ${keyId.slice(0, 12)}...`);
      refresh();
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Revoke failed');
    }
  };

  // Activate a key
  const activateKey = (keyId: string) => {
    try {
      persistentKeyRegistry.activateKey(keyId, 'local');
      showMessage('success', `Activated key: ${keyId.slice(0, 12)}...`);
      refresh();
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Activate failed');
    }
  };

  // Rotate (generate new) signing key
  const rotate = async () => {
    try {
      const result = await rotateSigningKey({
        createdBy: 'local',
        scope: 'ORG',
        label: `Rotated @ ${nowIso()}`,
      });
      showMessage(
        'success',
        `Generated new signing key: ${result.keyId.slice(0, 12)}...`
      );
      refresh();
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Rotation failed');
    }
  };

  // Handle trust decision for quarantined keys
  const handleTrustDecision = (keyId: string, trust: KeyTrust) => {
    try {
      persistentKeyRegistry.setTrust(keyId, trust, 'local');
      showMessage('success', `Key trust set to ${trust}`);
      setTrustPromptKey(null);
      refresh();
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Trust update failed');
    }
  };

  // Handle import panel completion
  const handleImportComplete = (result: { imported: boolean; keyId?: string; trust?: KeyTrust }) => {
    setShowImportPanel(false);
    if (result.imported && result.keyId) {
      showMessage('success', `Imported key: ${result.keyId.slice(0, 12)}... (Trust: ${result.trust})`);
      refresh();
    }
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: 0, color: '#fff' }}>Key Management</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => void rotate()}
            style={{
              padding: '6px 12px',
              backgroundColor: '#22c55e',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Rotate Key
          </button>
          <button
            onClick={() => setShowImportPanel(!showImportPanel)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Import Key
          </button>
          <button
            onClick={refresh}
            style={{
              padding: '6px 12px',
              backgroundColor: '#6b7280',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Message banner */}
      {message && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: 12,
            borderRadius: 4,
            backgroundColor:
              message.type === 'success'
                ? '#166534'
                : message.type === 'error'
                  ? '#991b1b'
                  : '#1e40af',
            color: '#fff',
            fontSize: 12,
          }}
        >
          {message.text}
        </div>
      )}

      {/* Import panel */}
      {showImportPanel && (
        <div style={{ marginBottom: 12 }}>
          <KeyImportPanel onComplete={handleImportComplete} />
        </div>
      )}

      {/* Trust prompt modal */}
      {trustPromptKey && (
        <TrustPromptModal
          keyId={trustPromptKey.keyId}
          fingerprint={getKeyFingerprint(trustPromptKey.keyId)}
          onDecision={(trust) => handleTrustDecision(trustPromptKey.keyId, trust)}
          onCancel={() => setTrustPromptKey(null)}
        />
      )}

      {/* Active key info */}
      <div
        style={{
          padding: '8px 12px',
          marginBottom: 12,
          backgroundColor: '#2a2a4a',
          borderRadius: 4,
          fontSize: 12,
        }}
      >
        <span style={{ color: '#a0a0a0' }}>Active Signing Key: </span>
        {activeKeyId ? (
          <span style={{ fontFamily: 'monospace', color: '#22c55e' }}>
            {activeKeyId.slice(0, 16)}...
          </span>
        ) : (
          <span style={{ color: '#f59e0b' }}>(none)</span>
        )}
        <span style={{ marginLeft: 12, color: '#6b7280' }}>
          • Only ACTIVE keys can sign factory releases
        </span>
      </div>

      {/* Keys table */}
      <div
        style={{
          border: '1px solid #3a3a5a',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#2a2a4a' }}>
              <th
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  color: '#a0a0a0',
                  fontWeight: 500,
                }}
              >
                Key ID
              </th>
              <th
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  color: '#a0a0a0',
                  fontWeight: 500,
                }}
              >
                Status
              </th>
              <th
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  color: '#a0a0a0',
                  fontWeight: 500,
                }}
              >
                Trust
              </th>
              <th
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  color: '#a0a0a0',
                  fontWeight: 500,
                }}
              >
                Scope
              </th>
              <th
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  color: '#a0a0a0',
                  fontWeight: 500,
                }}
              >
                Created
              </th>
              <th
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  color: '#a0a0a0',
                  fontWeight: 500,
                }}
              >
                Label
              </th>
              <th
                style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  color: '#a0a0a0',
                  fontWeight: 500,
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr
                key={k.keyId}
                style={{
                  borderTop: '1px solid #3a3a5a',
                  backgroundColor:
                    k.keyId === activeKeyId ? 'rgba(34, 197, 94, 0.1)' : undefined,
                }}
              >
                <td
                  style={{
                    padding: '10px 12px',
                    fontFamily: 'monospace',
                  }}
                >
                  {k.keyId.slice(0, 16)}...
                  {k.keyId === activeKeyId && (
                    <span
                      style={{
                        marginLeft: 8,
                        padding: '2px 6px',
                        backgroundColor: '#22c55e',
                        color: '#fff',
                        borderRadius: 3,
                        fontSize: 10,
                      }}
                    >
                      ACTIVE
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      backgroundColor: getStatusColor(k.status),
                      color: '#fff',
                      borderRadius: 3,
                      fontSize: 10,
                    }}
                  >
                    {k.status}
                  </span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      backgroundColor: getTrustColor(k.trust),
                      color: '#fff',
                      borderRadius: 3,
                      fontSize: 10,
                      cursor: k.trust === 'QUARANTINED' ? 'pointer' : 'default',
                    }}
                    onClick={() => {
                      if (k.trust === 'QUARANTINED') {
                        setTrustPromptKey(k);
                      }
                    }}
                    title={k.trust === 'QUARANTINED' ? 'Click to review trust' : undefined}
                  >
                    {k.trust}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', color: '#a0a0a0' }}>
                  {k.scope}
                  {k.scopeId ? `:${k.scopeId}` : ''}
                </td>
                <td style={{ padding: '10px 12px', color: '#a0a0a0' }}>
                  {k.createdAtIso?.slice(0, 10) ?? '-'}
                </td>
                <td style={{ padding: '10px 12px', color: '#a0a0a0' }}>
                  {k.label || '-'}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => exportPublicKey(k.keyId)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 3,
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      Export
                    </button>
                    {k.status !== 'REVOKED' && k.keyId !== activeKeyId && (
                      <button
                        onClick={() => activateKey(k.keyId)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#22c55e',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 3,
                          cursor: 'pointer',
                          fontSize: 11,
                        }}
                      >
                        Set Active
                      </button>
                    )}
                    {k.status !== 'REVOKED' && (
                      <button
                        onClick={() => revokeKey(k.keyId)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 3,
                          cursor: 'pointer',
                          fontSize: 11,
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: 20,
                    textAlign: 'center',
                    color: '#6b7280',
                  }}
                >
                  No keys registered. Click "Rotate Key" to generate a new signing key.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Help text */}
      <div
        style={{
          marginTop: 12,
          padding: 12,
          backgroundColor: '#2a2a4a',
          borderRadius: 4,
          fontSize: 11,
          color: '#6b7280',
        }}
      >
        <strong style={{ color: '#a0a0a0' }}>Key Trust Policy:</strong>
        <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
          <li>Only <strong>TRUSTED + ACTIVE</strong> keys can sign/verify factory releases</li>
          <li><span style={{ color: getTrustColor('TRUSTED') }}>TRUSTED</span> - Approved for verification on this machine</li>
          <li><span style={{ color: getTrustColor('QUARANTINED') }}>QUARANTINED</span> - Imported but pending approval (click to review)</li>
          <li><span style={{ color: getTrustColor('REJECTED') }}>REJECTED</span> - Explicitly rejected, verification will fail</li>
          <li>Export public keys to share with other systems for verification</li>
          <li>Always verify fingerprints out-of-band before trusting imported keys</li>
        </ul>
      </div>
    </div>
  );
}
