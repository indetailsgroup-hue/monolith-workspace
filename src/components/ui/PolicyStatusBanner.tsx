/**
 * Policy Status Banner (v0.10)
 *
 * Displays policy status and warnings in Release UI:
 * - Shows current runtime mode (DESIGNER/FACTORY)
 * - Shows policy availability (Bundle/Installed/None)
 * - Shows BLOCKED warning in FACTORY mode without policy
 *
 * Use in ReleaseCenter and other verification UIs.
 */

import React from 'react';
import { getRuntimeMode, getFactoryId } from '../../runtime/env';
import {
  getInstalledPolicyJson,
  getInstalledPolicyMeta,
} from '../../release/policy/installedPolicyStore';
import { shouldRequirePolicy } from '../../release/policy/verifyPolicyMode';

export interface PolicyStatusBannerProps {
  /** Whether the current bundle contains a revocation-policy.json */
  bundleHasPolicy?: boolean;
}

export function PolicyStatusBanner({ bundleHasPolicy = false }: PolicyStatusBannerProps) {
  const mode = getRuntimeMode();
  const factoryId = getFactoryId();

  const installedJson = getInstalledPolicyJson();
  const installed = !!installedJson;
  const meta = getInstalledPolicyMeta();

  const requirePolicy = shouldRequirePolicy();
  const hasAnyPolicy = bundleHasPolicy || installed;
  const ok = !requirePolicy || hasAnyPolicy;

  return (
    <div
      style={{
        padding: 12,
        marginBottom: 16,
        borderRadius: 8,
        backgroundColor: ok ? '#0d3320' : '#422006',
        border: `1px solid ${ok ? '#166534' : '#f59e0b'}`,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{ok ? '🛡️' : '⚠️'}</span>
          <strong style={{ color: '#fff' }}>Policy Status</strong>
        </div>
        <span
          style={{
            padding: '4px 10px',
            backgroundColor: ok ? '#166534' : '#991b1b',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            color: '#fff',
          }}
        >
          {ok ? 'OK' : 'BLOCKED'}
        </span>
      </div>

      {/* Mode Info */}
      <div style={{ marginTop: 10, fontSize: 12, color: '#a0a0a0' }}>
        <div>
          Mode:{' '}
          <strong style={{ color: mode === 'FACTORY' ? '#60a5fa' : '#a0a0a0' }}>{mode}</strong>
          {mode === 'FACTORY' && (
            <>
              {' • '}
              factoryId:{' '}
              <strong style={{ color: factoryId ? '#22c55e' : '#ef4444' }}>
                {factoryId ?? '(not set)'}
              </strong>
            </>
          )}
        </div>
      </div>

      {/* Policy Sources */}
      <div style={{ marginTop: 10, fontSize: 12, color: '#a0a0a0' }}>
        <div>
          Bundle policy:{' '}
          <strong style={{ color: bundleHasPolicy ? '#22c55e' : '#6b7280' }}>
            {bundleHasPolicy ? 'Present' : 'None'}
          </strong>
        </div>
        <div>
          Installed policy:{' '}
          <strong style={{ color: installed ? '#22c55e' : '#6b7280' }}>
            {installed ? 'Present' : 'None'}
          </strong>
          {installed && meta && (
            <span style={{ color: '#6b7280' }}>
              {' • '}
              {new Date(meta.installedAtIso).toLocaleDateString()} by {meta.installedBy}
            </span>
          )}
        </div>
      </div>

      {/* Blocked Warning */}
      {!ok && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 12px',
            backgroundColor: '#991b1b',
            borderRadius: 4,
            fontSize: 12,
            color: '#fff',
          }}
        >
          <strong>Blocked:</strong> This device is in FACTORY mode and requires a signed revocation
          policy (bundle or installed) before verification/export.
        </div>
      )}

      {/* Precedence Note */}
      <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280' }}>
        Precedence: <strong>Bundle → Installed → None</strong>
        {requirePolicy && <span> • Policy required in FACTORY mode</span>}
      </div>
    </div>
  );
}

/**
 * Check if export/verify should be blocked due to missing policy
 *
 * @param bundleHasPolicy - Whether bundle contains policy
 * @returns True if operation should be blocked
 */
export function isPolicyBlocked(bundleHasPolicy: boolean): boolean {
  if (!shouldRequirePolicy()) return false;

  const installed = !!getInstalledPolicyJson();
  return !bundleHasPolicy && !installed;
}

export default PolicyStatusBanner;
