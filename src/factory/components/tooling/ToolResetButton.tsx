/**
 * ToolResetButton.tsx - Tool Reset Confirmation Component
 *
 * Allows resetting tool wear data with confirmation.
 * Part of D6.1: Threshold & Maintenance UX.
 *
 * @version 1.0.0 - Phase D6.1
 */

import React, { useState, useCallback } from 'react';
import type { ResetReason } from '../../tooling/storage';

export interface ToolResetButtonProps {
  /** Tool ID to reset */
  toolId: string;
  /** Callback when reset is confirmed */
  onReset: (options: { reason: ResetReason; note?: string }) => void;
  /** Callback when cancel is clicked */
  onCancel: () => void;
  /** Whether reset is in progress */
  resetting?: boolean;
}

const REASON_OPTIONS: { value: ResetReason; label: string; description: string }[] = [
  {
    value: 'REPLACED',
    label: 'Replaced',
    description: 'Tool was replaced with a new one',
  },
  {
    value: 'RESHARPENED',
    label: 'Resharpened',
    description: 'Tool was resharpened/reconditioned',
  },
  {
    value: 'MANUAL',
    label: 'Manual Reset',
    description: 'Manual correction or calibration',
  },
];

export function ToolResetButton({
  toolId,
  onReset,
  onCancel,
  resetting = false,
}: ToolResetButtonProps): React.ReactElement {
  const [reason, setReason] = useState<ResetReason>('REPLACED');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // Handle reason change
  const handleReasonChange = useCallback((newReason: ResetReason) => {
    setReason(newReason);
  }, []);

  // Handle note change
  const handleNoteChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNote(e.target.value);
  }, []);

  // Handle confirm checkbox
  const handleConfirmChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmed(e.target.checked);
  }, []);

  // Handle reset
  const handleReset = useCallback(() => {
    if (confirmed) {
      onReset({ reason, note: note.trim() || undefined });
    }
  }, [confirmed, reason, note, onReset]);

  return (
    <div
      style={{
        padding: 16,
        backgroundColor: '#2a2a4a',
        borderRadius: 8,
      }}
    >
      {/* Warning header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#f59e0b15',
          border: '1px solid #f59e0b40',
          borderRadius: 6,
        }}
      >
        <span style={{ fontSize: 18 }}>⚠</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#f59e0b' }}>
            Reset Tool Wear
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            This will clear all wear data for <strong>{toolId}</strong>
          </div>
        </div>
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: 12,
          color: '#888',
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        Use this after replacing or resharpening the physical tool.
        The tool will start tracking wear from zero.
      </div>

      {/* Reason selection */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Reason</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {REASON_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleReasonChange(option.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                backgroundColor: reason === option.value ? '#3a3a6a' : '#1a1a2e',
                border:
                  reason === option.value
                    ? '1px solid #8b5cf6'
                    : '1px solid #3a3a5a',
                borderRadius: 6,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: '2px solid',
                  borderColor: reason === option.value ? '#8b5cf6' : '#666',
                  backgroundColor:
                    reason === option.value ? '#8b5cf6' : 'transparent',
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: reason === option.value ? '#fff' : '#aaa',
                  }}
                >
                  {option.label}
                </div>
                <div style={{ fontSize: 10, color: '#666' }}>
                  {option.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Note input */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
          Note (optional)
        </div>
        <textarea
          value={note}
          onChange={handleNoteChange}
          placeholder="e.g., New tool installed, SKU: ABC-123"
          rows={2}
          style={{
            width: '100%',
            padding: '8px 12px',
            backgroundColor: '#1a1a2e',
            border: '1px solid #3a3a5a',
            borderRadius: 6,
            color: '#fff',
            fontSize: 12,
            resize: 'none',
          }}
        />
      </div>

      {/* Confirmation checkbox */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#ef444415',
          border: '1px solid #ef444440',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={confirmed}
          onChange={handleConfirmChange}
          style={{
            width: 16,
            height: 16,
            accentColor: '#ef4444',
          }}
        />
        <span style={{ fontSize: 12, color: '#ef4444' }}>
          I understand this action cannot be undone
        </span>
      </label>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onCancel}
          disabled={resetting}
          style={{
            flex: 1,
            padding: '10px 16px',
            backgroundColor: 'transparent',
            border: '1px solid #3a3a5a',
            borderRadius: 6,
            color: '#888',
            fontSize: 13,
            cursor: resetting ? 'not-allowed' : 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleReset}
          disabled={resetting || !confirmed}
          style={{
            flex: 1,
            padding: '10px 16px',
            backgroundColor: resetting || !confirmed ? '#3a3a5a' : '#ef4444',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            cursor: resetting || !confirmed ? 'not-allowed' : 'pointer',
          }}
        >
          {resetting ? 'Resetting...' : 'Reset Wear'}
        </button>
      </div>
    </div>
  );
}

export default ToolResetButton;
