/**
 * WorkpieceConfigPanel - Workpiece Configuration UI
 *
 * Panel for configuring per-panel workpiece transforms
 * (offsets, rotation, flipping) for CNC generation.
 *
 * @version 1.0.0
 */

import React from 'react';
import type { WorkpieceConfig } from '../../types/cnc';
import type { PacketDrillPanel } from '../../packet/types';

export interface WorkpieceConfigPanelProps {
  /** Drill map panels from packet */
  panels: PacketDrillPanel[];
  /** Current workpiece configuration */
  config: WorkpieceConfig;
  /** Callback when config changes */
  onChange: (config: WorkpieceConfig) => void;
  /** Whether panel controls are disabled */
  disabled?: boolean;
}

export function WorkpieceConfigPanel({
  panels,
  config,
  onChange,
  disabled = false,
}: WorkpieceConfigPanelProps): React.ReactElement {
  return React.createElement('div', {
    style: {
      padding: 16,
      border: '1px solid #3a3a5a',
      borderRadius: 8,
      background: '#1a1a2e',
      opacity: disabled ? 0.6 : 1,
    },
  },
    React.createElement('h4', {
      style: { color: '#f5f5f5', marginBottom: 12, fontSize: 13, fontWeight: 600 },
    }, 'Workpiece Configuration'),
    React.createElement('label', {
      style: { display: 'flex', alignItems: 'center', gap: 8, color: '#9ca3af', fontSize: 12 },
    },
      React.createElement('input', {
        type: 'checkbox',
        checked: config.applyTransforms,
        disabled,
        onChange: () => onChange({ ...config, applyTransforms: !config.applyTransforms }),
      }),
      'Apply workpiece transforms'
    ),
    React.createElement('div', {
      style: { color: '#6b7280', fontSize: 11, marginTop: 8 },
    }, `${panels.length} panel(s) · ${config.panels.size} configured`)
  );
}
