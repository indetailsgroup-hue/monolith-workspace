/**
 * CncOverlayLegend.tsx - CNC Overlay Legend and Controls
 *
 * UI component showing overlay statistics and filter controls.
 * Displays in factory view alongside the 3D viewer.
 *
 * Features:
 * - Point count by type
 * - Filter toggles (DRILL/BORE/through-holes)
 * - Face filter (TOP/BOTTOM)
 * - Cycle filter (G81/G82/G83)
 * - Visibility toggle
 *
 * @version 1.0.0 - Phase D4.x
 */

import React from 'react';
import { useCncOverlayStore, selectLegendState } from '../../../core/store/useCncOverlayStore';
import { OVERLAY_COLORS } from './cncOverlayTypes';
import type { CycleType, HoleKind } from '../../../cnc/policy/drillPolicyTypes';
import type { PanelFace } from '../../../cnc/transform/workpieceTypes';

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: {
    background: '#1a1a2e',
    border: '1px solid #3a3a5a',
    borderRadius: '6px',
    padding: '12px',
    minWidth: '200px',
    fontSize: '12px',
    color: '#e0e0e0',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '1px solid #3a3a5a',
  } as React.CSSProperties,
  title: {
    fontWeight: 'bold',
    fontSize: '13px',
    color: '#8b5cf6',
  } as React.CSSProperties,
  toggleBtn: {
    background: 'none',
    border: '1px solid #3a3a5a',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '11px',
    cursor: 'pointer',
    color: '#e0e0e0',
  } as React.CSSProperties,
  section: {
    marginBottom: '12px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '10px',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '6px',
  } as React.CSSProperties,
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
  } as React.CSSProperties,
  colorDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    marginRight: '8px',
  } as React.CSSProperties,
  filterRow: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap' as const,
    marginTop: '4px',
  } as React.CSSProperties,
  filterChip: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    cursor: 'pointer',
    border: '1px solid #3a3a5a',
    background: 'transparent',
    color: '#e0e0e0',
    transition: 'all 0.15s',
  } as React.CSSProperties,
  filterChipActive: {
    background: '#8b5cf6',
    borderColor: '#8b5cf6',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    color: '#666',
    padding: '20px',
    fontStyle: 'italic',
  } as React.CSSProperties,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export interface CncOverlayLegendProps {
  /** Additional CSS class */
  className?: string;
  /** Compact mode (fewer details) */
  compact?: boolean;
}

export const CncOverlayLegend: React.FC<CncOverlayLegendProps> = ({
  className,
  compact = false,
}) => {
  const { isVisible, filter, stats, hasOverlay } = useCncOverlayStore(selectLegendState);
  const toggleVisibility = useCncOverlayStore((s) => s.toggleVisibility);
  const toggleDrill = useCncOverlayStore((s) => s.toggleDrill);
  const toggleBore = useCncOverlayStore((s) => s.toggleBore);
  const toggleThroughHolesOnly = useCncOverlayStore((s) => s.toggleThroughHolesOnly);
  const setFaceFilter = useCncOverlayStore((s) => s.setFaceFilter);
  const toggleCycleFilter = useCncOverlayStore((s) => s.toggleCycleFilter);

  // No overlay data
  if (!hasOverlay || !stats) {
    return (
      <div style={styles.container} className={className}>
        <div style={styles.emptyState}>
          No CNC overlay data.
          <br />
          Generate G-code to see drilling points.
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container} className={className}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>CNC Overlay</span>
        <button
          style={{
            ...styles.toggleBtn,
            background: isVisible ? '#22c55e' : 'transparent',
            borderColor: isVisible ? '#22c55e' : '#3a3a5a',
          }}
          onClick={toggleVisibility}
        >
          {isVisible ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Stats Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Points</div>
        <StatRow
          color={OVERLAY_COLORS.DRILL}
          label="Drill"
          count={stats.byType.DRILL}
          active={filter.showDrill}
          onClick={toggleDrill}
        />
        <StatRow
          color={OVERLAY_COLORS.BORE}
          label="Bore"
          count={stats.byType.BORE}
          active={filter.showBore}
          onClick={toggleBore}
        />
        <StatRow
          color={OVERLAY_COLORS.THROUGH}
          label="Through"
          count={stats.throughHoleCount}
          active={filter.throughHolesOnly}
          onClick={toggleThroughHolesOnly}
          suffix={filter.throughHolesOnly ? ' only' : ''}
        />
      </div>

      {/* Face Filter */}
      {!compact && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Face</div>
          <div style={styles.filterRow}>
            <FilterChip
              label="All"
              active={filter.faceFilter === null}
              onClick={() => setFaceFilter(null)}
            />
            <FilterChip
              label="TOP"
              active={filter.faceFilter === 'TOP'}
              onClick={() => setFaceFilter(filter.faceFilter === 'TOP' ? null : 'TOP')}
              count={stats.byFace.TOP}
            />
            <FilterChip
              label="BOTTOM"
              active={filter.faceFilter === 'BOTTOM'}
              onClick={() => setFaceFilter(filter.faceFilter === 'BOTTOM' ? null : 'BOTTOM')}
              count={stats.byFace.BOTTOM}
            />
          </div>
        </div>
      )}

      {/* Cycle Filter */}
      {!compact && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Cycle</div>
          <div style={styles.filterRow}>
            <CycleFilterChip
              cycle="G81"
              count={stats.byCycle.G81 ?? 0}
              active={filter.cycleFilter.includes('G81')}
              onClick={() => toggleCycleFilter('G81')}
            />
            <CycleFilterChip
              cycle="G82"
              count={stats.byCycle.G82 ?? 0}
              active={filter.cycleFilter.includes('G82')}
              onClick={() => toggleCycleFilter('G82')}
            />
            <CycleFilterChip
              cycle="G83"
              count={stats.byCycle.G83 ?? 0}
              active={filter.cycleFilter.includes('G83')}
              onClick={() => toggleCycleFilter('G83')}
            />
          </div>
        </div>
      )}

      {/* Summary */}
      <div
        style={{
          ...styles.section,
          marginBottom: 0,
          paddingTop: '8px',
          borderTop: '1px solid #3a3a5a',
        }}
      >
        <div style={styles.statRow}>
          <span style={{ color: '#888' }}>Total depth:</span>
          <span>{stats.totalDepth.toFixed(1)}mm</span>
        </div>
        <div style={styles.statRow}>
          <span style={{ color: '#888' }}>Est. time:</span>
          <span>{formatTime(stats.estimatedTimeSeconds)}</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

interface StatRowProps {
  color: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  suffix?: string;
}

const StatRow: React.FC<StatRowProps> = ({
  color,
  label,
  count,
  active,
  onClick,
  suffix = '',
}) => (
  <div
    style={{
      ...styles.statRow,
      cursor: 'pointer',
      opacity: active ? 1 : 0.5,
    }}
    onClick={onClick}
  >
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ ...styles.colorDot, background: color }} />
      <span>
        {label}
        {suffix}
      </span>
    </div>
    <span style={{ fontFamily: 'monospace' }}>{count}</span>
  </div>
);

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}

const FilterChip: React.FC<FilterChipProps> = ({ label, active, onClick, count }) => (
  <button
    style={{
      ...styles.filterChip,
      ...(active ? styles.filterChipActive : {}),
    }}
    onClick={onClick}
  >
    {label}
    {count !== undefined && count > 0 && (
      <span style={{ marginLeft: '4px', opacity: 0.7 }}>({count})</span>
    )}
  </button>
);

interface CycleFilterChipProps {
  cycle: CycleType;
  count: number;
  active: boolean;
  onClick: () => void;
}

const CycleFilterChip: React.FC<CycleFilterChipProps> = ({
  cycle,
  count,
  active,
  onClick,
}) => {
  const cycleColors: Record<CycleType, string> = {
    G81: '#22c55e', // Green - simple
    G82: '#f59e0b', // Amber - dwell
    G83: '#ef4444', // Red - peck
  };

  return (
    <button
      style={{
        ...styles.filterChip,
        borderColor: active ? cycleColors[cycle] : '#3a3a5a',
        background: active ? `${cycleColors[cycle]}33` : 'transparent',
      }}
      onClick={onClick}
      title={getCycleDescription(cycle)}
    >
      {cycle}
      {count > 0 && (
        <span style={{ marginLeft: '4px', opacity: 0.7 }}>({count})</span>
      )}
    </button>
  );
};

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function getCycleDescription(cycle: CycleType): string {
  switch (cycle) {
    case 'G81':
      return 'Simple drill cycle';
    case 'G82':
      return 'Dwell drill cycle (chip clearing)';
    case 'G83':
      return 'Peck drill cycle (deep holes)';
    default:
      return cycle;
  }
}

export default CncOverlayLegend;
