/**
 * Device Settings Panel
 *
 * UI for configuring device runtime mode and factory ID.
 * Used by factory floor devices to enforce scope restrictions.
 *
 * Modes:
 * - DESIGNER: Design workstation (no factory restrictions)
 * - FACTORY: Factory floor device (strict scope enforcement)
 */

import React from 'react';
import {
  getRuntimeMode,
  setRuntimeMode,
  getFactoryId,
  setFactoryId,
  clearFactoryId,
  type RuntimeMode,
} from '../../runtime/env';

export function DeviceSettingsPanel() {
  const [mode, setMode] = React.useState<RuntimeMode>(getRuntimeMode());
  const [factoryIdInput, setFactoryIdInput] = React.useState<string>(getFactoryId() ?? '');
  const [saved, setSaved] = React.useState(false);

  const handleSave = () => {
    setRuntimeMode(mode);
    if (mode === 'FACTORY' && factoryIdInput.trim()) {
      setFactoryId(factoryIdInput.trim());
    } else if (mode === 'DESIGNER') {
      // Optionally clear factory ID in designer mode
      // clearFactoryId();
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearFactoryId = () => {
    clearFactoryId();
    setFactoryIdInput('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const isConfigValid = mode === 'DESIGNER' || (mode === 'FACTORY' && factoryIdInput.trim().length > 0);

  return (
    <div
      style={{
        padding: 16,
        backgroundColor: '#1a1a2e',
        borderRadius: 8,
        color: '#e0e0e0',
        marginBottom: 16,
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
        <h3 style={{ margin: 0, color: '#fff', fontSize: 16 }}>Device Settings</h3>
        {saved && (
          <span
            style={{
              padding: '4px 12px',
              backgroundColor: '#166534',
              color: '#fff',
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            Saved
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Mode selector */}
        <div>
          <label
            style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 12,
              color: '#a0a0a0',
            }}
          >
            Runtime Mode
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setMode('DESIGNER')}
              style={{
                flex: 1,
                padding: '10px 16px',
                backgroundColor: mode === 'DESIGNER' ? '#3b82f6' : '#2a2a4a',
                color: '#fff',
                border: mode === 'DESIGNER' ? '2px solid #60a5fa' : '2px solid transparent',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              <div>DESIGNER</div>
              <div style={{ fontSize: 10, color: mode === 'DESIGNER' ? '#bfdbfe' : '#6b7280', marginTop: 4 }}>
                No factory restrictions
              </div>
            </button>
            <button
              onClick={() => setMode('FACTORY')}
              style={{
                flex: 1,
                padding: '10px 16px',
                backgroundColor: mode === 'FACTORY' ? '#1e3a5f' : '#2a2a4a',
                color: '#fff',
                border: mode === 'FACTORY' ? '2px solid #60a5fa' : '2px solid transparent',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              <div>FACTORY</div>
              <div style={{ fontSize: 10, color: mode === 'FACTORY' ? '#93c5fd' : '#6b7280', marginTop: 4 }}>
                Strict scope enforcement
              </div>
            </button>
          </div>
        </div>

        {/* Factory ID input (only shown in FACTORY mode) */}
        {mode === 'FACTORY' && (
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 12,
                color: '#a0a0a0',
              }}
            >
              Factory ID <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={factoryIdInput}
                onChange={(e) => setFactoryIdInput(e.target.value)}
                placeholder="e.g., F_BKK_01"
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  backgroundColor: '#0a0a1e',
                  color: '#e0e0e0',
                  border: `1px solid ${factoryIdInput.trim() ? '#3a3a5a' : '#ef4444'}`,
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: 'monospace',
                }}
              />
              {factoryIdInput && (
                <button
                  onClick={handleClearFactoryId}
                  style={{
                    padding: '10px 12px',
                    backgroundColor: '#4a4a6a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            {!factoryIdInput.trim() && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#ef4444' }}>
                Factory ID is required in FACTORY mode
              </div>
            )}
          </div>
        )}

        {/* Info box */}
        <div
          style={{
            padding: 12,
            backgroundColor: mode === 'FACTORY' ? '#1e3a5f' : '#2a2a4a',
            borderRadius: 4,
            fontSize: 11,
            color: '#a0a0a0',
          }}
        >
          {mode === 'DESIGNER' ? (
            <>
              <strong style={{ color: '#60a5fa' }}>Designer Mode:</strong>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: 16 }}>
                <li>Import keys with any scope (ORG, FACTORY, PROJECT)</li>
                <li>No factoryId binding enforcement</li>
                <li>Suitable for design workstations</li>
              </ul>
            </>
          ) : (
            <>
              <strong style={{ color: '#60a5fa' }}>Factory Mode:</strong>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: 16 }}>
                <li>Only accept FACTORY-scoped keys</li>
                <li>Key scopeId must match this factoryId</li>
                <li>Prevents cross-factory key misuse</li>
                <li>Required for factory floor devices</li>
              </ul>
            </>
          )}
        </div>

        {/* Save button */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSave}
            disabled={!isConfigValid}
            style={{
              flex: 1,
              padding: '10px 16px',
              backgroundColor: isConfigValid ? '#22c55e' : '#4a4a6a',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: isConfigValid ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
