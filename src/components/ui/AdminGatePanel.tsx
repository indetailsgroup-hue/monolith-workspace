/**
 * Admin Gate Panel (v0.8)
 *
 * UI for admin session management:
 * - Bootstrap: First-time passphrase setup
 * - Login: Time-limited session (15 min default)
 * - Logout: End session manually
 *
 * Production note: Replace with SSO/Role-based access + hardware token.
 *
 * Priority 0: Hidden in production unless ADMIN role
 */

import React from 'react';
import {
  adminBootstrap,
  adminLogin,
  adminLogout,
  isAdminBootstrapped,
  isAdminSessionActive,
  getAdminSessionExpiry,
} from '../../runtime/admin';
import { isOverrideUIAllowed } from '../../core/auth/permissions';

export function AdminGatePanel() {
  // Priority 0: Hide in production unless ADMIN
  if (!isOverrideUIAllowed()) {
    return null;
  }
  const [bootstrapped, setBootstrapped] = React.useState(isAdminBootstrapped());
  const [active, setActive] = React.useState(isAdminSessionActive());
  const [passphrase, setPassphrase] = React.useState('');
  const [message, setMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const refresh = () => {
    setBootstrapped(isAdminBootstrapped());
    setActive(isAdminSessionActive());
  };

  const handleBootstrap = async () => {
    if (!passphrase) {
      setMessage('Enter passphrase to bootstrap.');
      return;
    }
    if (passphrase.length < 8) {
      setMessage('Passphrase must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await adminBootstrap(passphrase);
      setMessage('Admin bootstrap complete. You can now login.');
      setPassphrase('');
      refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Bootstrap failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!passphrase) {
      setMessage('Enter passphrase to login.');
      return;
    }

    setLoading(true);
    try {
      const success = await adminLogin(passphrase, 15);
      if (success) {
        setMessage('Admin session active (15 min).');
        setPassphrase('');
      } else {
        setMessage('Invalid passphrase.');
      }
      refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    adminLogout();
    setMessage('Admin session ended.');
    refresh();
  };

  const sessionExpiry = active ? getAdminSessionExpiry() : null;

  return (
    <div
      style={{
        padding: 12,
        marginBottom: 12,
        backgroundColor: active ? '#0d3320' : '#1a1a2e',
        borderRadius: 8,
        border: `1px solid ${active ? '#166534' : '#3a3a5a'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{active ? '🔓' : '🔒'}</span>
          <strong style={{ color: '#fff' }}>Admin Session</strong>
        </div>
        <div style={{ fontSize: 11, color: '#a0a0a0' }}>
          Bootstrapped: <strong style={{ color: bootstrapped ? '#22c55e' : '#ef4444' }}>{bootstrapped ? 'YES' : 'NO'}</strong>
          {' • '}
          Session: <strong style={{ color: active ? '#22c55e' : '#6b7280' }}>{active ? 'ACTIVE' : 'INACTIVE'}</strong>
        </div>
      </div>

      {sessionExpiry && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#86efac' }}>
          Expires: {new Date(sessionExpiry).toLocaleTimeString()}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (!bootstrapped) {
                void handleBootstrap();
              } else if (!active) {
                void handleLogin();
              }
            }
          }}
          placeholder="Admin passphrase"
          disabled={loading || active}
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid #3a3a5a',
            backgroundColor: '#0a0a1e',
            color: '#fff',
            fontSize: 12,
          }}
        />

        {!bootstrapped ? (
          <button
            onClick={() => void handleBootstrap()}
            disabled={loading}
            style={{
              padding: '8px 14px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: loading ? 'wait' : 'pointer',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {loading ? '...' : 'Bootstrap'}
          </button>
        ) : (
          <button
            onClick={() => void handleLogin()}
            disabled={loading || active}
            style={{
              padding: '8px 14px',
              backgroundColor: active ? '#4a4a6a' : '#166534',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: loading || active ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {loading ? '...' : 'Login (15 min)'}
          </button>
        )}

        <button
          onClick={handleLogout}
          disabled={!active}
          style={{
            padding: '8px 14px',
            backgroundColor: active ? '#991b1b' : '#4a4a6a',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: active ? 'pointer' : 'not-allowed',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          Logout
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

      {message && (
        <div
          style={{
            marginTop: 8,
            padding: '6px 10px',
            backgroundColor: message.includes('failed') || message.includes('Invalid') ? '#991b1b' : '#1e3a5f',
            borderRadius: 4,
            fontSize: 12,
            color: '#fff',
          }}
        >
          {message}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280' }}>
        Production note: Replace with SSO/Role-based access + hardware token for real deployments.
      </div>
    </div>
  );
}

export default AdminGatePanel;
