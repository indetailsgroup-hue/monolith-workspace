/**
 * Admin Gate Panel (v0.6)
 *
 * Simple admin session toggle for development.
 * Shows current session state and provides start/end controls.
 *
 * Future: Replace with passphrase-protected admin gate.
 */

import React from 'react';
import { isAdminSessionActive, startAdminSession, endAdminSession } from '../../runtime/admin';

export function AdminGatePanel() {
  const [isActive, setIsActive] = React.useState(() => isAdminSessionActive());

  const handleToggle = () => {
    if (isActive) {
      endAdminSession();
    } else {
      startAdminSession();
    }
    setIsActive(!isActive);
  };

  return (
    <div
      style={{
        padding: 12,
        marginBottom: 12,
        backgroundColor: isActive ? '#0d3320' : '#2a2a4a',
        borderRadius: 8,
        border: `1px solid ${isActive ? '#166534' : '#3a3a5a'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{isActive ? '\uD83D\uDD13' : '\uD83D\uDD12'}</span>
        <div>
          <strong style={{ color: '#fff', fontSize: 13 }}>Admin Session</strong>
          <div style={{ fontSize: 11, color: isActive ? '#22c55e' : '#6b7280', marginTop: 2 }}>
            {isActive ? 'Active — modifications allowed' : 'Inactive — start session to edit'}
          </div>
        </div>
      </div>
      <button
        onClick={handleToggle}
        style={{
          padding: '6px 14px',
          backgroundColor: isActive ? '#991b1b' : '#166534',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {isActive ? 'End Session' : 'Start Session'}
      </button>
    </div>
  );
}
