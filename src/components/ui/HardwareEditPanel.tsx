/**
 * HardwareEditPanel.tsx - Hardware Edit Panel for Selected Minifix
 *
 * Shows detailed information and edit controls when a hardware point
 * (Minifix cam, bolt, dowel) is clicked in the 3D view.
 *
 * Features:
 * - Display selected hardware info (type, dimensions, position)
 * - Position adjustment controls with X, Y, Z sliders
 * - Increment/decrement buttons for fine control
 * - Apply/Reset position changes
 *
 * @version 2.0.0 - Position Editing UI
 */

import React, { useCallback, useState } from 'react';
import {
  useDrillMapStore,
  useSelectedDrillPoint,
  usePositionOffset,
} from '../../core/store/useDrillMapStore';
import type { DrillMapPoint, DrillPurpose } from '../../core/manufacturing/drillMap/types';

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  panel: {
    position: 'fixed' as const,
    top: '80px',
    right: '16px',
    width: '340px',
    backgroundColor: '#1a1a2e',
    border: '2px solid #8b5cf6',
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(139, 92, 246, 0.5)',
    overflow: 'hidden',
    zIndex: 9999,  // Very high z-index to ensure visibility
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxHeight: 'calc(100vh - 100px)',
    overflowY: 'auto' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    backgroundColor: '#252542',
    borderBottom: '1px solid #3a3a5a',
    position: 'sticky' as const,
    top: 0,
    zIndex: 1,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    transition: 'all 0.15s',
  },
  content: {
    padding: '16px',
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#8b5cf6',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '8px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid #252542',
  },
  label: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  value: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#e2e8f0',
    fontFamily: 'monospace',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 600,
  },
  badgeCam: {
    backgroundColor: '#a78bfa20',
    color: '#a78bfa',
  },
  badgeBolt: {
    backgroundColor: '#f4728020',
    color: '#f47280',
  },
  badgeDowel: {
    backgroundColor: '#fbbf2420',
    color: '#fbbf24',
  },
  badgeOther: {
    backgroundColor: '#94a3b820',
    color: '#94a3b8',
  },
  // Position Edit Controls
  positionEditRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  axisLabel: {
    width: '24px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#e2e8f0',
    textAlign: 'center' as const,
  },
  axisLabelX: { color: '#ef4444' },
  axisLabelY: { color: '#22c55e' },
  axisLabelZ: { color: '#3b82f6' },
  incrementButton: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252542',
    border: '1px solid #3a3a5a',
    borderRadius: '4px',
    color: '#e2e8f0',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  inputContainer: {
    flex: 1,
    position: 'relative' as const,
  },
  positionInput: {
    width: '100%',
    padding: '6px 8px',
    fontSize: '13px',
    fontFamily: 'monospace',
    backgroundColor: '#252542',
    border: '1px solid #3a3a5a',
    borderRadius: '4px',
    color: '#e2e8f0',
    textAlign: 'center' as const,
    outline: 'none',
  },
  slider: {
    width: '100%',
    height: '4px',
    marginTop: '4px',
    appearance: 'none' as const,
    backgroundColor: '#3a3a5a',
    borderRadius: '2px',
    cursor: 'pointer',
  },
  previewPosition: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    marginTop: '12px',
    padding: '8px',
    backgroundColor: '#252542',
    borderRadius: '6px',
  },
  previewItem: {
    textAlign: 'center' as const,
  },
  previewLabel: {
    fontSize: '10px',
    color: '#64748b',
    marginBottom: '2px',
  },
  previewValue: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#8b5cf6',
    fontFamily: 'monospace',
  },
  originalValue: {
    fontSize: '10px',
    color: '#64748b',
    fontFamily: 'monospace',
  },
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid #3a3a5a',
    display: 'flex',
    gap: '8px',
    position: 'sticky' as const,
    bottom: 0,
    backgroundColor: '#1a1a2e',
  },
  button: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  primaryButton: {
    backgroundColor: '#8b5cf6',
    color: '#fff',
  },
  successButton: {
    backgroundColor: '#22c55e',
    color: '#fff',
  },
  secondaryButton: {
    backgroundColor: '#252542',
    color: '#e2e8f0',
    border: '1px solid #3a3a5a',
  },
  dangerButton: {
    backgroundColor: '#ef444420',
    color: '#ef4444',
    border: '1px solid #ef444440',
  },
  stepSelector: {
    display: 'flex',
    gap: '4px',
    marginBottom: '12px',
  },
  stepButton: {
    flex: 1,
    padding: '4px 8px',
    fontSize: '11px',
    backgroundColor: '#252542',
    border: '1px solid #3a3a5a',
    borderRadius: '4px',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  stepButtonActive: {
    backgroundColor: '#8b5cf620',
    borderColor: '#8b5cf6',
    color: '#8b5cf6',
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getComponentTypeDisplay(point: DrillMapPoint): { icon: string; label: string; style: React.CSSProperties } {
  const type = point.componentType || 'OTHER';

  switch (type) {
    case 'HOUSING':
      return { icon: '🔩', label: 'Cam Housing', style: { ...styles.badge, ...styles.badgeCam } };
    case 'BOLT':
      return { icon: '🔧', label: 'S200 Bolt', style: { ...styles.badge, ...styles.badgeBolt } };
    case 'DOWEL':
      return { icon: '🪵', label: 'Wood Dowel', style: { ...styles.badge, ...styles.badgeDowel } };
    default:
      return { icon: '⚙️', label: type, style: { ...styles.badge, ...styles.badgeOther } };
  }
}

function getPurposeDisplay(purpose: DrillPurpose): string {
  const labels: Record<string, string> = {
    SHELF_PIN: 'Shelf Pin',
    SYSTEM_32: 'System 32',
    HINGE_CUP: 'Hinge Cup',
    HINGE_SCREW: 'Hinge Screw',
    DOWEL: 'Dowel',
    MINIFIX: 'Minifix',
    CONFIRMAT: 'Confirmat',
    CAM_LOCK: 'Cam Lock',
    BOLT: 'Bolt',
    HINGE: 'Hinge',
    HANDLE: 'Handle',
    SOFT_CLOSE: 'Soft Close',
    CONNECTOR_PLATE: 'Connector Plate',
    OTHER: 'Other',
    CUSTOM: 'Custom',
  };
  return labels[purpose] || purpose;
}

function formatNumber(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

// ============================================================================
// POSITION EDIT ROW COMPONENT
// ============================================================================

interface PositionEditRowProps {
  axis: 'X' | 'Y' | 'Z';
  value: number;
  originalValue: number;
  step: number;
  onChange: (value: number) => void;
}

function PositionEditRow({ axis, value, originalValue, step, onChange }: PositionEditRowProps) {
  const axisColors = {
    X: styles.axisLabelX,
    Y: styles.axisLabelY,
    Z: styles.axisLabelZ,
  };

  const handleIncrement = () => onChange(value + step);
  const handleDecrement = () => onChange(value - step);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    if (!isNaN(newValue)) {
      onChange(newValue);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };

  const newPosition = originalValue + value;

  return (
    <div style={styles.positionEditRow}>
      <div style={{ ...styles.axisLabel, ...axisColors[axis] }}>{axis}</div>
      <button
        style={styles.incrementButton}
        onClick={handleDecrement}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#3a3a5a';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#252542';
        }}
      >
        −
      </button>
      <div style={styles.inputContainer}>
        <input
          type="number"
          style={styles.positionInput}
          value={value.toFixed(1)}
          onChange={handleInputChange}
          step={step}
        />
        <input
          type="range"
          style={styles.slider}
          min={-100}
          max={100}
          step={step}
          value={value}
          onChange={handleSliderChange}
        />
      </div>
      <button
        style={styles.incrementButton}
        onClick={handleIncrement}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#3a3a5a';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#252542';
        }}
      >
        +
      </button>
      <div style={{ width: '60px', textAlign: 'right' as const }}>
        <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#8b5cf6' }}>
          {newPosition.toFixed(1)}
        </div>
        <div style={{ fontSize: '9px', fontFamily: 'monospace', color: '#64748b' }}>
          ({originalValue.toFixed(1)})
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function HardwareEditPanel(): React.ReactElement | null {
  const selectedPoint = useSelectedDrillPoint();
  const positionOffset = usePositionOffset();
  const setSelectedPoint = useDrillMapStore((s) => s.setSelectedPoint);
  const setPositionOffset = useDrillMapStore((s) => s.setPositionOffset);
  const resetPositionOffset = useDrillMapStore((s) => s.resetPositionOffset);
  const applyPositionOffset = useDrillMapStore((s) => s.applyPositionOffset);

  // Step size for position adjustments
  const [step, setStep] = useState(1);

  // Debug: log when component renders
  console.log('[HardwareEditPanel] Render, selectedPoint:', selectedPoint?.id || 'null');

  const handleClose = useCallback(() => {
    setSelectedPoint(null);
  }, [setSelectedPoint]);

  const handleOffsetChange = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      const newOffset: [number, number, number] = [...positionOffset];
      const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      newOffset[idx] = value;
      setPositionOffset(newOffset);
    },
    [positionOffset, setPositionOffset]
  );

  const hasChanges = positionOffset[0] !== 0 || positionOffset[1] !== 0 || positionOffset[2] !== 0;

  // Don't render if no point selected
  if (!selectedPoint) {
    return null;
  }

  console.log('[HardwareEditPanel] Rendering panel for:', selectedPoint.purpose, selectedPoint.componentType);

  const typeInfo = getComponentTypeDisplay(selectedPoint);
  const [x, y, z] = selectedPoint.position;

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>
          <span>{typeInfo.icon}</span>
          <span>Hardware Position</span>
        </div>
        <button
          style={styles.closeButton}
          onClick={handleClose}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#3a3a5a';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#94a3b8';
          }}
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* Type Section */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Hardware Type</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={typeInfo.style}>{typeInfo.label}</span>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              {getPurposeDisplay(selectedPoint.purpose)}
            </span>
          </div>
        </div>

        {/* Position Edit Section */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Position Offset (mm)</div>

          {/* Step Size Selector */}
          <div style={styles.stepSelector}>
            <span style={{ fontSize: '11px', color: '#64748b', marginRight: '8px' }}>Step:</span>
            {[0.1, 0.5, 1, 5, 10].map((s) => (
              <button
                key={s}
                style={{
                  ...styles.stepButton,
                  ...(step === s ? styles.stepButtonActive : {}),
                }}
                onClick={() => setStep(s)}
              >
                {s}mm
              </button>
            ))}
          </div>

          {/* X, Y, Z Offset Controls */}
          <PositionEditRow
            axis="X"
            value={positionOffset[0]}
            originalValue={x}
            step={step}
            onChange={(v) => handleOffsetChange('x', v)}
          />
          <PositionEditRow
            axis="Y"
            value={positionOffset[1]}
            originalValue={y}
            step={step}
            onChange={(v) => handleOffsetChange('y', v)}
          />
          <PositionEditRow
            axis="Z"
            value={positionOffset[2]}
            originalValue={z}
            step={step}
            onChange={(v) => handleOffsetChange('z', v)}
          />

          {/* New Position Preview */}
          <div style={styles.previewPosition}>
            <div style={styles.previewItem}>
              <div style={styles.previewLabel}>New X</div>
              <div style={styles.previewValue}>{formatNumber(x + positionOffset[0])}</div>
              <div style={styles.originalValue}>was {formatNumber(x)}</div>
            </div>
            <div style={styles.previewItem}>
              <div style={styles.previewLabel}>New Y</div>
              <div style={styles.previewValue}>{formatNumber(y + positionOffset[1])}</div>
              <div style={styles.originalValue}>was {formatNumber(y)}</div>
            </div>
            <div style={styles.previewItem}>
              <div style={styles.previewLabel}>New Z</div>
              <div style={styles.previewValue}>{formatNumber(z + positionOffset[2])}</div>
              <div style={styles.originalValue}>was {formatNumber(z)}</div>
            </div>
          </div>
        </div>

        {/* Dimensions Section */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Dimensions</div>
          <div style={styles.row}>
            <span style={styles.label}>Diameter</span>
            <span style={styles.value}>Ø{formatNumber(selectedPoint.diameter)}mm</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Depth</span>
            <span style={styles.value}>{formatNumber(selectedPoint.depth)}mm</span>
          </div>
          {selectedPoint.edgeDistance !== undefined && (
            <div style={styles.row}>
              <span style={styles.label}>Edge Distance (A)</span>
              <span style={styles.value}>{formatNumber(selectedPoint.edgeDistance)}mm</span>
            </div>
          )}
        </div>

        {/* Face & Status */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Drilling Info</div>
          <div style={styles.row}>
            <span style={styles.label}>Face</span>
            <span style={styles.value}>{selectedPoint.face}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Status</span>
            <span
              style={{
                ...styles.value,
                color:
                  selectedPoint.status === 'VALID'
                    ? '#22c55e'
                    : selectedPoint.status === 'WARNING'
                    ? '#f59e0b'
                    : selectedPoint.status === 'ERROR'
                    ? '#ef4444'
                    : '#94a3b8',
              }}
            >
              {selectedPoint.status}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <button
          style={{ ...styles.button, ...styles.secondaryButton }}
          onClick={handleClose}
        >
          Close
        </button>
        {hasChanges && (
          <button
            style={{ ...styles.button, ...styles.dangerButton }}
            onClick={resetPositionOffset}
          >
            Reset
          </button>
        )}
        <button
          style={{
            ...styles.button,
            ...(hasChanges ? styles.successButton : styles.primaryButton),
          }}
          onClick={applyPositionOffset}
          disabled={!hasChanges}
        >
          {hasChanges ? 'Apply' : 'No Changes'}
        </button>
      </div>
    </div>
  );
}

export default HardwareEditPanel;
