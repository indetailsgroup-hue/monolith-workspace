/**
 * ToolThresholdEditor.tsx - Tool Threshold Editor Component
 *
 * Allows setting custom wear threshold for a tool.
 * Part of D6.1: Threshold & Maintenance UX.
 *
 * @version 1.0.0 - Phase D6.1
 */

import React, { useState, useCallback } from 'react';
import { DEFAULT_MAX_WEAR_UNITS } from '../../tooling/wearModel';
import {
  THRESHOLD_PRESETS,
  type ThresholdPreset,
  suggestPreset,
} from '../../tooling/query/toolThresholdQuery';

export interface ToolThresholdEditorProps {
  /** Tool ID being edited */
  toolId: string;
  /** Current threshold value */
  currentThreshold: number;
  /** Current wear units (for health % calculation) */
  currentWearUnits: number;
  /** Callback when save is clicked */
  onSave: (threshold: number) => void;
  /** Callback when cancel is clicked */
  onCancel: () => void;
  /** Whether save is in progress */
  saving?: boolean;
}

/**
 * Calculate health percentage from wear and threshold.
 */
function calculateHealthPct(wearUnits: number, maxWearUnits: number): number {
  if (maxWearUnits <= 0) return 0;
  const healthPct = Math.max(0, 100 - (wearUnits / maxWearUnits) * 100);
  return Math.round(healthPct * 10) / 10; // 1 decimal place
}

/**
 * Get status from health percentage.
 */
function getStatus(healthPct: number): 'OK' | 'NEARING_LIMIT' | 'OVER_LIMIT' {
  if (healthPct <= 0) return 'OVER_LIMIT';
  if (healthPct <= 15) return 'NEARING_LIMIT';
  return 'OK';
}

/**
 * Get color for status.
 */
function getStatusColor(status: 'OK' | 'NEARING_LIMIT' | 'OVER_LIMIT'): string {
  switch (status) {
    case 'OVER_LIMIT':
      return '#ef4444';
    case 'NEARING_LIMIT':
      return '#f59e0b';
    case 'OK':
      return '#22c55e';
  }
}

export function ToolThresholdEditor({
  toolId,
  currentThreshold,
  currentWearUnits,
  onSave,
  onCancel,
  saving = false,
}: ToolThresholdEditorProps): React.ReactElement {
  const [threshold, setThreshold] = useState(currentThreshold);
  const [inputValue, setInputValue] = useState(String(currentThreshold));

  // Calculate preview health
  const previewHealthPct = calculateHealthPct(currentWearUnits, threshold);
  const previewStatus = getStatus(previewHealthPct);
  const statusColor = getStatusColor(previewStatus);

  // Check if value changed
  const hasChanges = threshold !== currentThreshold;

  // Handle slider change
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setThreshold(value);
    setInputValue(String(value));
  }, []);

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);

    const value = Number(raw);
    if (!isNaN(value) && value > 0) {
      setThreshold(value);
    }
  }, []);

  // Handle input blur (validate and clamp)
  const handleInputBlur = useCallback(() => {
    const value = Number(inputValue);
    if (isNaN(value) || value <= 0) {
      setThreshold(currentThreshold);
      setInputValue(String(currentThreshold));
    } else {
      const clamped = Math.max(100, Math.min(100000, value));
      setThreshold(clamped);
      setInputValue(String(clamped));
    }
  }, [inputValue, currentThreshold]);

  // Handle preset click
  const handlePresetClick = useCallback((preset: ThresholdPreset) => {
    const value = THRESHOLD_PRESETS[preset];
    setThreshold(value);
    setInputValue(String(value));
  }, []);

  // Handle save
  const handleSave = useCallback(() => {
    if (threshold > 0) {
      onSave(threshold);
    }
  }, [threshold, onSave]);

  const currentPreset = suggestPreset(threshold);

  return (
    <div
      style={{
        padding: 16,
        backgroundColor: '#2a2a4a',
        borderRadius: 8,
      }}
    >
      {/* Header */}
      <div
        style={{
          marginBottom: 16,
          fontSize: 13,
          color: '#888',
        }}
      >
        Set wear threshold for <span style={{ color: '#fff' }}>{toolId}</span>
      </div>

      {/* Current vs New comparison */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            padding: 10,
            backgroundColor: '#1a1a2e',
            borderRadius: 6,
            fontSize: 11,
          }}
        >
          <div style={{ color: '#666', marginBottom: 4 }}>Current</div>
          <div style={{ color: '#888', fontWeight: 500 }}>
            {currentThreshold.toLocaleString()}
          </div>
        </div>
        <div
          style={{
            padding: 10,
            backgroundColor: hasChanges ? '#3a3a6a' : '#1a1a2e',
            borderRadius: 6,
            fontSize: 11,
            border: hasChanges ? '1px solid #8b5cf640' : '1px solid transparent',
          }}
        >
          <div style={{ color: '#666', marginBottom: 4 }}>New</div>
          <div style={{ color: hasChanges ? '#8b5cf6' : '#888', fontWeight: 500 }}>
            {threshold.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Slider */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="range"
          min={100}
          max={50000}
          step={100}
          value={threshold}
          onChange={handleSliderChange}
          style={{
            width: '100%',
            height: 6,
            borderRadius: 3,
            appearance: 'none',
            background: `linear-gradient(to right, #8b5cf6 ${(threshold / 50000) * 100}%, #3a3a5a ${(threshold / 50000) * 100}%)`,
            cursor: 'pointer',
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 9,
            color: '#666',
            marginTop: 4,
          }}
        >
          <span>100</span>
          <span>50,000</span>
        </div>
      </div>

      {/* Numeric input */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          style={{
            width: '100%',
            padding: '8px 12px',
            backgroundColor: '#1a1a2e',
            border: '1px solid #3a3a5a',
            borderRadius: 6,
            color: '#fff',
            fontSize: 14,
            textAlign: 'center',
          }}
        />
      </div>

      {/* Presets */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: '#666', marginBottom: 8 }}>Presets</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(Object.keys(THRESHOLD_PRESETS) as ThresholdPreset[]).map((preset) => (
            <button
              key={preset}
              onClick={() => handlePresetClick(preset)}
              style={{
                flex: 1,
                padding: '6px 8px',
                backgroundColor: currentPreset === preset ? '#8b5cf620' : '#1a1a2e',
                border:
                  currentPreset === preset
                    ? '1px solid #8b5cf6'
                    : '1px solid #3a3a5a',
                borderRadius: 4,
                color: currentPreset === preset ? '#8b5cf6' : '#888',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              {preset.charAt(0) + preset.slice(1).toLowerCase()}
              <br />
              <span style={{ fontSize: 9, opacity: 0.7 }}>
                {(THRESHOLD_PRESETS[preset] / 1000).toFixed(0)}K
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Health preview */}
      <div
        style={{
          padding: 12,
          backgroundColor: `${statusColor}15`,
          border: `1px solid ${statusColor}40`,
          borderRadius: 6,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 11, color: '#888' }}>
            Health at new threshold:
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: statusColor }}>
            {previewHealthPct.toFixed(1)}%
          </span>
        </div>
        <div style={{ fontSize: 10, color: statusColor, marginTop: 4 }}>
          Status: {previewStatus.replace('_', ' ')}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onCancel}
          disabled={saving}
          style={{
            flex: 1,
            padding: '10px 16px',
            backgroundColor: 'transparent',
            border: '1px solid #3a3a5a',
            borderRadius: 6,
            color: '#888',
            fontSize: 13,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          style={{
            flex: 1,
            padding: '10px 16px',
            backgroundColor: saving || !hasChanges ? '#3a3a5a' : '#8b5cf6',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            cursor: saving || !hasChanges ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Help text */}
      <div
        style={{
          marginTop: 12,
          fontSize: 10,
          color: '#666',
          textAlign: 'center',
        }}
      >
        Higher threshold = longer before warning
      </div>
    </div>
  );
}

export default ToolThresholdEditor;
