/**
 * Policy Manager Panel (v0.9)
 *
 * UI for managing revocation policy rules:
 * - CRUD operations on local revocation rules
 * - Export signed revocation-policy.json artifact
 * - Admin session required for all modifications
 * - Policy precedence display (v0.9)
 *
 * Factory Safety:
 * - In FACTORY mode, exported policy is bound to factoryId
 * - Rules become immutable once exported into signed artifact
 */

import React from 'react';
import { isAdminSessionActive } from '../../runtime/admin';
import { getRuntimeMode, getFactoryId } from '../../runtime/env';
import {
  getLocalRevocationPolicy,
  upsertLocalRevocationRule,
  removeLocalRevocationRule,
} from '../../release/policy/localRevocationPolicyStore';
import { buildRevocationPolicyArtifact } from '../../release/policy/buildRevocationPolicyArtifact';
import {
  resolvePolicyJsonByPrecedence,
  describePolicySource,
  hasPolicyAvailable,
} from '../../release/policy/policyPrecedence';
import { getInstalledPolicyInfo } from '../../release/policy/installedPolicyStore';
import { downloadTextFile } from '../../export/cutList/download';
import { audit } from '../../release/keys/audit';
import { AdminGatePanel } from './AdminGatePanel';

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Policy Precedence Status (v0.9)
 * Shows current effective policy source
 */
function PolicyPrecedenceStatus() {
  const precedence = resolvePolicyJsonByPrecedence();
  const installedInfo = getInstalledPolicyInfo();
  const hasPolicy = hasPolicyAvailable();

  return (
    <div
      style={{
        padding: 12,
        marginBottom: 12,
        backgroundColor: hasPolicy ? '#0d3320' : '#422006',
        borderRadius: 8,
        border: `1px solid ${hasPolicy ? '#166534' : '#f59e0b'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{hasPolicy ? '🛡️' : '⚠️'}</span>
          <strong style={{ color: '#fff' }}>Policy Precedence</strong>
        </div>
        <span
          style={{
            padding: '2px 8px',
            backgroundColor:
              precedence.source === 'BUNDLE'
                ? '#166534'
                : precedence.source === 'INSTALLED'
                ? '#1e3a5f'
                : '#4a4a6a',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            color: '#fff',
          }}
        >
          {precedence.source}
        </span>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#a0a0a0' }}>
        Effective: <strong style={{ color: '#fff' }}>{describePolicySource(precedence.source)}</strong>
      </div>
      {precedence.source === 'INSTALLED' && installedInfo.meta && (
        <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
          Installed: {new Date(installedInfo.meta.installedAtIso).toLocaleString()} by {installedInfo.meta.installedBy}
        </div>
      )}
      {precedence.source === 'NONE' && (
        <div style={{ marginTop: 4, fontSize: 11, color: '#fbbf24' }}>
          No policy available. Export or import a signed policy.
        </div>
      )}
      <div style={{ marginTop: 6, fontSize: 10, color: '#6b7280' }}>
        Priority: BUNDLE → INSTALLED → NONE
      </div>
    </div>
  );
}

export function PolicyManagerPanel() {
  const [policy, setPolicy] = React.useState(() => getLocalRevocationPolicy());
  const [message, setMessage] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);

  // Form state
  const [keyId, setKeyId] = React.useState('');
  const [revokedAtIso, setRevokedAtIso] = React.useState('');
  const [reason, setReason] = React.useState('');

  const mode = getRuntimeMode();
  const factoryId = getFactoryId();
  const isAdmin = isAdminSessionActive();

  const refresh = () => setPolicy(getLocalRevocationPolicy());

  const handleAddOrUpdate = () => {
    if (!isAdmin) {
      setMessage('Admin session required.');
      return;
    }
    if (!keyId || keyId.length < 16) {
      setMessage('Invalid keyId (must be at least 16 characters).');
      return;
    }

    const timestamp = revokedAtIso.trim() || nowIso();

    upsertLocalRevocationRule({
      keyId: keyId.trim(),
      revokedAtIso: timestamp,
      reason: reason.trim() || 'revoked',
      by: 'local-admin',
    });

    audit('POLICY_REVOKE_SET', 'local-admin', {
      keyId: keyId.trim(),
      revokedAtIso: timestamp,
      reason: reason.trim() || 'revoked',
    });

    setMessage(`Saved rule for key ${keyId.slice(0, 12)}...`);
    setKeyId('');
    setRevokedAtIso('');
    setReason('');
    refresh();
  };

  const handleRemoveRule = (kid: string) => {
    if (!isAdmin) {
      setMessage('Admin session required.');
      return;
    }

    removeLocalRevocationRule(kid, 'local-admin');
    audit('POLICY_REVOKE_CLEAR', 'local-admin', { keyId: kid });
    setMessage(`Removed rule for key ${kid.slice(0, 12)}...`);
    refresh();
  };

  const handleEditRule = (rule: { keyId: string; revokedAtIso: string; reason: string }) => {
    setKeyId(rule.keyId);
    setRevokedAtIso(rule.revokedAtIso);
    setReason(rule.reason);
    setMessage('Loaded rule into editor.');
  };

  const handleExportSignedPolicy = async () => {
    if (!isAdmin) {
      setMessage('Admin session required.');
      return;
    }

    setExporting(true);
    try {
      const { policyJson } = await buildRevocationPolicyArtifact({
        updatedBy: 'local-admin',
      });

      const dateStr = new Date().toISOString().slice(0, 10);
      const filename =
        mode === 'FACTORY'
          ? `revocation-policy_FACTORY_${factoryId ?? 'UNKNOWN'}_${dateStr}.json`
          : `revocation-policy_ORG_${dateStr}.json`;

      downloadTextFile(filename, policyJson, 'application/json;charset=utf-8');

      audit('POLICY_REVOKE_SET', 'local-admin', {
        action: 'export_signed_policy',
        filename,
        rulesCount: policy.rules.length,
      });

      setMessage(`Exported signed ${filename}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
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
      <h3 style={{ margin: '0 0 16px 0', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20 }}>📋</span>
        Revocation Policy Manager
      </h3>

      {/* Admin Gate */}
      <AdminGatePanel />

      {/* Policy Precedence Status (v0.9) */}
      <PolicyPrecedenceStatus />

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
        <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
          Exported artifact scope binding:{' '}
          <strong>{mode === 'FACTORY' ? `FACTORY + scopeId=${factoryId ?? '?'}` : 'ORG (default)'}</strong>
        </div>
      </div>

      {/* Local Rules Panel */}
      <div
        style={{
          padding: 12,
          backgroundColor: '#0a0a1e',
          borderRadius: 8,
          border: '1px solid #3a3a5a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <strong style={{ color: '#fff' }}>Local Rules (editable)</strong>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{policy.rules.length} rule(s)</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
          These rules become immutable only when exported into a signed artifact (and/or packaged into a RELEASE bundle).
        </div>

        {/* Add/Edit Form */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr auto',
            gap: 8,
            marginTop: 12,
          }}
        >
          <input
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            placeholder="keyId (sha256...) e.g. 9f3a..."
            disabled={!isAdmin}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #3a3a5a',
              backgroundColor: isAdmin ? '#1a1a2e' : '#0a0a1e',
              color: '#fff',
              fontSize: 11,
              fontFamily: 'monospace',
            }}
          />
          <input
            value={revokedAtIso}
            onChange={(e) => setRevokedAtIso(e.target.value)}
            placeholder="revokedAtIso (ISO) empty = now"
            disabled={!isAdmin}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #3a3a5a',
              backgroundColor: isAdmin ? '#1a1a2e' : '#0a0a1e',
              color: '#fff',
              fontSize: 11,
            }}
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="reason"
            disabled={!isAdmin}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #3a3a5a',
              backgroundColor: isAdmin ? '#1a1a2e' : '#0a0a1e',
              color: '#fff',
              fontSize: 11,
            }}
          />
          <button
            onClick={handleAddOrUpdate}
            disabled={!isAdmin}
            style={{
              padding: '8px 14px',
              backgroundColor: isAdmin ? '#166534' : '#4a4a6a',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: isAdmin ? 'pointer' : 'not-allowed',
              fontSize: 11,
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            Add / Update
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={() => void handleExportSignedPolicy()}
            disabled={!isAdmin || exporting}
            style={{
              padding: '8px 14px',
              backgroundColor: isAdmin ? '#3b82f6' : '#4a4a6a',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: isAdmin && !exporting ? 'pointer' : 'not-allowed',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {exporting ? 'Exporting...' : 'Export Signed revocation-policy.json'}
          </button>
          <button
            onClick={refresh}
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
            Refresh
          </button>
        </div>

        {/* Message */}
        {message && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 12px',
              backgroundColor: message.includes('failed') || message.includes('Invalid') || message.includes('required')
                ? '#991b1b'
                : '#1e3a5f',
              borderRadius: 4,
              fontSize: 12,
              color: '#fff',
            }}
          >
            {message}
          </div>
        )}

        {/* Rules Table */}
        <div style={{ marginTop: 16, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ backgroundColor: '#1a1a2e' }}>
                <th style={{ padding: 10, textAlign: 'left', borderBottom: '1px solid #3a3a5a', color: '#a0a0a0' }}>
                  KeyId
                </th>
                <th style={{ padding: 10, textAlign: 'left', borderBottom: '1px solid #3a3a5a', color: '#a0a0a0' }}>
                  RevokedAt
                </th>
                <th style={{ padding: 10, textAlign: 'left', borderBottom: '1px solid #3a3a5a', color: '#a0a0a0' }}>
                  Reason
                </th>
                <th style={{ padding: 10, textAlign: 'right', borderBottom: '1px solid #3a3a5a', color: '#a0a0a0' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {policy.rules.map((r) => (
                <tr key={r.keyId} style={{ borderBottom: '1px solid #2a2a4a' }}>
                  <td
                    style={{
                      padding: 10,
                      fontFamily: 'monospace',
                      color: '#f59e0b',
                    }}
                  >
                    {r.keyId.slice(0, 20)}...
                  </td>
                  <td style={{ padding: 10, color: '#e0e0e0' }}>{r.revokedAtIso}</td>
                  <td style={{ padding: 10, color: '#a0a0a0' }}>{r.reason}</td>
                  <td style={{ padding: 10, textAlign: 'right' }}>
                    <button
                      onClick={() => handleEditRule(r)}
                      disabled={!isAdmin}
                      style={{
                        padding: '4px 10px',
                        backgroundColor: isAdmin ? '#1e3a5f' : '#2a2a4a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        cursor: isAdmin ? 'pointer' : 'not-allowed',
                        fontSize: 10,
                        marginRight: 6,
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleRemoveRule(r.keyId)}
                      disabled={!isAdmin}
                      style={{
                        padding: '4px 10px',
                        backgroundColor: isAdmin ? '#991b1b' : '#2a2a4a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        cursor: isAdmin ? 'pointer' : 'not-allowed',
                        fontSize: 10,
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {policy.rules.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 16, color: '#6b7280', textAlign: 'center' }}>
                    No revocation rules yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Enforcement Note */}
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
          <strong>Enforcement:</strong> Any manifest created at/after revokedAtIso for its signing key will fail verification.
          Rules in local store can be edited until exported into a signed artifact.
        </div>
      </div>

      {/* Policy Metadata */}
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
        <div>
          <strong>Policy Metadata:</strong>
        </div>
        <div style={{ marginTop: 4 }}>
          Scope: {policy.scope} {policy.scopeId ? `(${policy.scopeId})` : ''}
        </div>
        <div>Updated: {policy.updatedAtIso}</div>
        <div>Updated By: {policy.updatedBy}</div>
      </div>
    </div>
  );
}

export default PolicyManagerPanel;
