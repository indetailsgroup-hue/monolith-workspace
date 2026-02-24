/**
 * WorkpieceConfigPanel - Panel Workpiece Configuration UI
 *
 * Allows operators to configure how panels are placed on the CNC machine bed:
 * - Face: TOP (normal) or BOTTOM (flipped)
 * - Datum: Origin corner (FRONT_LEFT, FRONT_RIGHT, etc.)
 * - Rotation: 0°, 90°, 180°, 270°
 *
 * @version 1.0.0 - Phase D4: Workpiece Transform UI
 */

import React, { useCallback, useMemo } from 'react';
import type { PacketDrillPanel } from '../../packet/types';
import type { PanelFace, WorkpieceDatum } from '../../../cnc/transform/workpieceTypes';
import type { WorkpiecePanelConfig, WorkpieceConfig } from '../../types/cnc';
import { createDefaultPanelConfig } from '../../types/cnc';

// ============================================================================
// Types
// ============================================================================

export interface WorkpieceConfigPanelProps {
  /** Panels from drill map */
  panels: PacketDrillPanel[];
  /** Current workpiece configuration */
  config: WorkpieceConfig;
  /** Callback when configuration changes */
  onChange: (config: WorkpieceConfig) => void;
  /** Disabled state */
  disabled?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const FACE_OPTIONS: { value: PanelFace; label: string; icon: string }[] = [
  { value: 'TOP', label: 'Top', icon: '▲' },
  { value: 'BOTTOM', label: 'Bottom', icon: '▼' },
];

const ROTATION_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '0°' },
  { value: 90, label: '90°' },
  { value: 180, label: '180°' },
  { value: 270, label: '270°' },
];

// Datum positions in a 3x2 grid layout (relative to panel)
// Layout matches operator view looking down at machine bed
const DATUM_GRID: { value: WorkpieceDatum; row: number; col: number; label: string }[] = [
  { value: 'BACK_LEFT', row: 0, col: 0, label: 'BL' },
  { value: 'CENTER', row: 0, col: 1, label: 'C' },
  { value: 'BACK_RIGHT', row: 0, col: 2, label: 'BR' },
  { value: 'FRONT_LEFT', row: 1, col: 0, label: 'FL' },
  { value: 'FRONT_RIGHT', row: 1, col: 2, label: 'FR' },
];

// ============================================================================
// Component
// ============================================================================

export function WorkpieceConfigPanel({
  panels,
  config,
  onChange,
  disabled = false,
}: WorkpieceConfigPanelProps): React.ReactElement {
  // Get panel config (or create default)
  const getPanelConfig = useCallback(
    (panelId: string): WorkpiecePanelConfig => {
      return config.panels.get(panelId) ?? createDefaultPanelConfig(panelId);
    },
    [config.panels]
  );

  // Update single panel config
  const updatePanelConfig = useCallback(
    (panelId: string, updates: Partial<Omit<WorkpiecePanelConfig, 'panelId'>>) => {
      const currentConfig = getPanelConfig(panelId);
      const newPanels = new Map(config.panels);
      newPanels.set(panelId, { ...currentConfig, ...updates });

      onChange({
        ...config,
        panels: newPanels,
        applyTransforms: newPanels.size > 0,
      });
    },
    [config, getPanelConfig, onChange]
  );

  // Reset all panels to defaults
  const handleResetAll = useCallback(() => {
    onChange({
      panels: new Map(),
      applyTransforms: false,
    });
  }, [onChange]);

  // Toggle apply transforms
  const handleToggleApply = useCallback(() => {
    onChange({
      ...config,
      applyTransforms: !config.applyTransforms,
    });
  }, [config, onChange]);

  // Count configured panels
  const configuredCount = useMemo(
    () => Array.from(config.panels.values()).filter((p) => p.face !== 'TOP' || p.datum !== 'FRONT_LEFT' || p.rotationDeg !== 0).length,
    [config.panels]
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 16,
        backgroundColor: '#1a1a2e',
        border: '1px solid #3a3a5a',
        borderRadius: 12,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h4
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
            }}
          >
            Workpiece Configuration
          </h4>
          {configuredCount > 0 && (
            <span
              style={{
                padding: '2px 6px',
                backgroundColor: '#8b5cf620',
                color: '#8b5cf6',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {configuredCount} configured
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {config.panels.size > 0 && (
            <button
              onClick={handleResetAll}
              disabled={disabled}
              style={{
                padding: '4px 8px',
                backgroundColor: 'transparent',
                border: '1px solid #3a3a5a',
                borderRadius: 4,
                color: '#888',
                fontSize: 11,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              Reset All
            </button>
          )}
        </div>
      </div>

      {/* Apply transforms toggle */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 8,
          backgroundColor: config.applyTransforms ? '#8b5cf610' : '#2a2a4a',
          border: `1px solid ${config.applyTransforms ? '#8b5cf640' : '#3a3a5a'}`,
          borderRadius: 6,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={config.applyTransforms}
          onChange={handleToggleApply}
          disabled={disabled}
          style={{ accentColor: '#8b5cf6' }}
        />
        <span style={{ fontSize: 13, color: '#ccc' }}>
          Apply workpiece transforms
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: '#666',
          }}
        >
          {config.applyTransforms ? 'Positions will be transformed' : 'Default positioning'}
        </span>
      </label>

      {/* Panel list */}
      {panels.length === 0 ? (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            color: '#666',
            fontSize: 13,
          }}
        >
          No panels available. Generate a drill map first.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            maxHeight: 400,
            overflowY: 'auto',
          }}
        >
          {panels.map((panel) => (
            <PanelConfigRow
              key={panel.panelId}
              panel={panel}
              config={getPanelConfig(panel.panelId)}
              onChange={(updates) => updatePanelConfig(panel.panelId, updates)}
              disabled={disabled || !config.applyTransforms}
            />
          ))}
        </div>
      )}

      {/* Info footer */}
      <div
        style={{
          fontSize: 11,
          color: '#666',
          borderTop: '1px solid #3a3a5a',
          paddingTop: 12,
        }}
      >
        Configure how each panel is placed on the machine bed. Default is TOP face, FRONT_LEFT origin, 0° rotation.
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface PanelConfigRowProps {
  panel: PacketDrillPanel;
  config: WorkpiecePanelConfig;
  onChange: (updates: Partial<Omit<WorkpiecePanelConfig, 'panelId'>>) => void;
  disabled: boolean;
}

function PanelConfigRow({
  panel,
  config,
  onChange,
  disabled,
}: PanelConfigRowProps): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false);

  const isModified = config.face !== 'TOP' || config.datum !== 'FRONT_LEFT' || config.rotationDeg !== 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: isModified ? '#8b5cf608' : '#2a2a4a',
        border: `1px solid ${isModified ? '#8b5cf640' : '#3a3a5a'}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Panel header (always visible) */}
      <button
        onClick={() => setExpanded(!expanded)}
        disabled={disabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 12px',
          backgroundColor: 'transparent',
          border: 'none',
          width: '100%',
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {/* Expand indicator */}
        <span
          style={{
            fontSize: 10,
            color: '#666',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          ▶
        </span>

        {/* Panel info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>
              {panel.role}
            </span>
            {isModified && (
              <span
                style={{
                  padding: '1px 4px',
                  backgroundColor: '#8b5cf640',
                  color: '#8b5cf6',
                  borderRadius: 3,
                  fontSize: 9,
                  fontWeight: 600,
                }}
              >
                MODIFIED
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            {panel.dimensions[0]} × {panel.dimensions[1]} × {panel.dimensions[2]} mm
            {' · '}{panel.points.length} points
          </div>
        </div>

        {/* Quick status */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            fontSize: 11,
            color: '#888',
          }}
        >
          <span style={{ color: config.face === 'BOTTOM' ? '#f59e0b' : '#666' }}>
            {config.face}
          </span>
          <span>·</span>
          <span>{config.datum.replace('_', ' ')}</span>
          <span>·</span>
          <span>{config.rotationDeg}°</span>
        </div>
      </button>

      {/* Expanded config options */}
      {expanded && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            padding: '12px 16px',
            borderTop: '1px solid #3a3a5a',
            backgroundColor: '#1f1f35',
          }}
        >
          {/* Face selector */}
          <FaceSelector
            value={config.face}
            onChange={(face) => onChange({ face })}
            disabled={disabled}
          />

          {/* Datum selector */}
          <DatumSelector
            value={config.datum}
            onChange={(datum) => onChange({ datum })}
            panelDimensions={panel.dimensions}
            disabled={disabled}
          />

          {/* Rotation selector */}
          <RotationSelector
            value={config.rotationDeg}
            onChange={(rotationDeg) => onChange({ rotationDeg })}
            disabled={disabled}
          />

          {/* Preview indicator */}
          <WorkpiecePreview
            config={config}
            panelDimensions={panel.dimensions}
          />
        </div>
      )}
    </div>
  );
}

interface FaceSelectorProps {
  value: PanelFace;
  onChange: (value: PanelFace) => void;
  disabled: boolean;
}

function FaceSelector({ value, onChange, disabled }: FaceSelectorProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: '#888',
          textTransform: 'uppercase',
        }}
      >
        Machining Face
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        {FACE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            disabled={disabled}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              backgroundColor: value === option.value ? '#8b5cf620' : '#2a2a4a',
              border: value === option.value ? '2px solid #8b5cf6' : '1px solid #3a3a5a',
              borderRadius: 6,
              color: value === option.value ? '#fff' : '#888',
              fontSize: 12,
              fontWeight: value === option.value ? 600 : 400,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <span>{option.icon}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      {value === 'BOTTOM' && (
        <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
          Panel will be flipped. Coordinates will be mirrored.
        </div>
      )}
    </div>
  );
}

interface DatumSelectorProps {
  value: WorkpieceDatum;
  onChange: (value: WorkpieceDatum) => void;
  panelDimensions: [number, number, number];
  disabled: boolean;
}

function DatumSelector({
  value,
  onChange,
  panelDimensions,
  disabled,
}: DatumSelectorProps): React.ReactElement {
  // Calculate aspect ratio for preview
  const aspectRatio = panelDimensions[0] / panelDimensions[1];
  const gridWidth = Math.min(180, aspectRatio * 60);
  const gridHeight = gridWidth / aspectRatio;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: '#888',
          textTransform: 'uppercase',
        }}
      >
        Origin Datum
      </label>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(2, 1fr)',
          gap: 4,
          width: gridWidth,
          height: gridHeight,
          padding: 8,
          backgroundColor: '#0a0a15',
          border: '1px solid #3a3a5a',
          borderRadius: 6,
        }}
      >
        {/* Back row (Y+) */}
        {[0, 1, 2].map((col) => {
          const datum = DATUM_GRID.find((d) => d.row === 0 && d.col === col);
          if (!datum) {
            // Center position in back row (placeholder)
            return (
              <div
                key={`0-${col}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {col === 1 && (
                  <DatumButton
                    datum={DATUM_GRID.find((d) => d.value === 'CENTER')!}
                    selected={value === 'CENTER'}
                    onClick={() => onChange('CENTER')}
                    disabled={disabled}
                  />
                )}
              </div>
            );
          }
          return (
            <DatumButton
              key={datum.value}
              datum={datum}
              selected={value === datum.value}
              onClick={() => onChange(datum.value)}
              disabled={disabled}
            />
          );
        })}

        {/* Front row (Y=0) */}
        {[0, 1, 2].map((col) => {
          const datum = DATUM_GRID.find((d) => d.row === 1 && d.col === col);
          if (!datum) {
            // Center placeholder (front row middle)
            return <div key={`1-${col}`} />;
          }
          return (
            <DatumButton
              key={datum.value}
              datum={datum}
              selected={value === datum.value}
              onClick={() => onChange(datum.value)}
              disabled={disabled}
            />
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
        Machine origin will be placed at the selected corner
      </div>
    </div>
  );
}

interface DatumButtonProps {
  datum: { value: WorkpieceDatum; label: string };
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}

function DatumButton({ datum, selected, onClick, disabled }: DatumButtonProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? '#8b5cf6' : '#2a2a4a',
        border: selected ? '2px solid #8b5cf6' : '1px solid #3a3a5a',
        borderRadius: 4,
        color: selected ? '#fff' : '#666',
        fontSize: 9,
        fontWeight: selected ? 600 : 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
      title={datum.value.replace('_', ' ')}
    >
      {selected ? '●' : '○'}
    </button>
  );
}

interface RotationSelectorProps {
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}

function RotationSelector({ value, onChange, disabled }: RotationSelectorProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: '#888',
          textTransform: 'uppercase',
        }}
      >
        Rotation (CW)
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        {ROTATION_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            disabled={disabled}
            style={{
              flex: 1,
              padding: '8px 4px',
              backgroundColor: value === option.value ? '#8b5cf620' : '#2a2a4a',
              border: value === option.value ? '2px solid #8b5cf6' : '1px solid #3a3a5a',
              borderRadius: 6,
              color: value === option.value ? '#fff' : '#888',
              fontSize: 12,
              fontWeight: value === option.value ? 600 : 400,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface WorkpiecePreviewProps {
  config: WorkpiecePanelConfig;
  panelDimensions: [number, number, number];
}

function WorkpiecePreview({
  config,
  panelDimensions,
}: WorkpiecePreviewProps): React.ReactElement {
  // Calculate preview dimensions (keeping aspect ratio)
  const maxWidth = 160;
  const aspectRatio = panelDimensions[0] / panelDimensions[1];
  const previewWidth = Math.min(maxWidth, aspectRatio * 80);
  const previewHeight = previewWidth / aspectRatio;

  // Calculate origin position within preview
  const getOriginPosition = (): { x: number; y: number } => {
    const padding = 8;
    const w = previewWidth - padding * 2;
    const h = previewHeight - padding * 2;

    switch (config.datum) {
      case 'FRONT_LEFT':
        return { x: padding, y: previewHeight - padding };
      case 'FRONT_RIGHT':
        return { x: previewWidth - padding, y: previewHeight - padding };
      case 'BACK_LEFT':
        return { x: padding, y: padding };
      case 'BACK_RIGHT':
        return { x: previewWidth - padding, y: padding };
      case 'CENTER':
        return { x: previewWidth / 2, y: previewHeight / 2 };
      default:
        return { x: padding, y: previewHeight - padding };
    }
  };

  const origin = getOriginPosition();

  // Calculate axis rotation (in degrees, SVG uses CW positive)
  const axisRotation = config.rotationDeg;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: '#888',
          textTransform: 'uppercase',
        }}
      >
        Preview
      </label>
      <div
        style={{
          width: previewWidth,
          height: previewHeight,
          backgroundColor: config.face === 'BOTTOM' ? '#f59e0b10' : '#0a0a15',
          border: `1px solid ${config.face === 'BOTTOM' ? '#f59e0b40' : '#3a3a5a'}`,
          borderRadius: 6,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Panel outline */}
        <div
          style={{
            position: 'absolute',
            inset: 8,
            border: '1px dashed #3a3a5a',
            borderRadius: 2,
          }}
        />

        {/* "BACK" label */}
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 8,
            color: '#444',
          }}
        >
          BACK
        </div>

        {/* "FRONT" label */}
        <div
          style={{
            position: 'absolute',
            bottom: 2,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 8,
            color: '#444',
          }}
        >
          FRONT
        </div>

        {/* Face indicator */}
        {config.face === 'BOTTOM' && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: 10,
              color: '#f59e0b',
              fontWeight: 600,
            }}
          >
            FLIPPED
          </div>
        )}

        {/* Origin axes (SVG) */}
        <svg
          width={previewWidth}
          height={previewHeight}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <g
            transform={`translate(${origin.x}, ${origin.y}) rotate(${axisRotation})`}
          >
            {/* X axis (red) */}
            <line
              x1={0}
              y1={0}
              x2={20}
              y2={0}
              stroke="#ef4444"
              strokeWidth={2}
            />
            <polygon
              points="20,-3 26,0 20,3"
              fill="#ef4444"
            />
            <text
              x={28}
              y={4}
              fill="#ef4444"
              fontSize={8}
              fontWeight="bold"
            >
              X
            </text>

            {/* Y axis (green, pointing up in SVG = negative Y) */}
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={-20}
              stroke="#22c55e"
              strokeWidth={2}
            />
            <polygon
              points="-3,-20 0,-26 3,-20"
              fill="#22c55e"
            />
            <text
              x={-10}
              y={-24}
              fill="#22c55e"
              fontSize={8}
              fontWeight="bold"
            >
              Y
            </text>

            {/* Origin point */}
            <circle cx={0} cy={0} r={3} fill="#8b5cf6" />
          </g>
        </svg>
      </div>
      <div style={{ fontSize: 10, color: '#666' }}>
        Origin: {config.datum.replace('_', ' ')} | Rotation: {config.rotationDeg}° CW
      </div>
    </div>
  );
}

export default WorkpieceConfigPanel;
