/**
 * T027: Cut Optimization — NestingPanel
 *
 * Interactive UI for sheet nesting optimization.
 * Displays SVG visualization of panel placements on material sheets.
 *
 * Following patterns from:
 * - CADDrillMapView.tsx (SVG visualization)
 * - ParametricContractPanel.tsx (inline styles + dark theme)
 *
 * @version 2.0.0 - Phase 2: Grain direction indicators
 */

import React, { useState, useMemo, useCallback } from 'react';
import type { CutListRow, NestingSheet } from '../../core/export/monolith/monolithExportContext';
import type {
  NestingConfig,
  NestingResult,
  NestingPart,
  GrainDirection,
} from '../../nesting/types';
import { DEFAULT_NESTING_CONFIG } from '../../nesting/types';
import { runNesting } from '../../nesting/optimizer';

// ============================================
// TYPES
// ============================================

interface NestingPanelProps {
  /** Cut list rows from cabinet store or export context */
  cutListRows: CutListRow[];
  /** Callback when nesting completes (to feed into export pipeline) */
  onNestingComplete?: (sheets: NestingSheet[]) => void;
  /** Component width in px */
  width?: number;
  /** Component height in px */
  height?: number;
}

/**
 * Extended placement with grain direction for visualization.
 * Merges NestingSheet placement with grain info from NestingResult.
 */
interface PlacementWithGrain {
  partId: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  cutW: number;
  cutH: number;
  grainDirection: GrainDirection;
}

// ============================================
// COLORS (dark theme, matches MONOLITH design system)
// ============================================

const COLORS = {
  bgPanel: '#0d0d0d',
  bgCard: '#141414',
  bgInput: '#1a1a1a',
  border: '#2a2a2a',
  borderStrong: '#3a3a3a',
  textPrimary: '#e5e7eb',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  accentPurple: '#8b5cf6',
  accentPurpleBg: 'rgba(139, 92, 246, 0.15)',
  accentPurpleBorder: 'rgba(139, 92, 246, 0.4)',
  successGreen: '#22c55e',
  successBg: 'rgba(34, 197, 94, 0.1)',
  warningAmber: '#f59e0b',
  warningBg: 'rgba(245, 158, 11, 0.1)',
  grainLine: 'rgba(255, 255, 255, 0.12)',
};

// Part fill colors (cycle through for visual distinction)
const PART_FILLS = [
  'rgba(139, 92, 246, 0.25)',   // purple
  'rgba(59, 130, 246, 0.25)',   // blue
  'rgba(34, 197, 94, 0.25)',    // green
  'rgba(245, 158, 11, 0.25)',   // amber
  'rgba(236, 72, 153, 0.25)',   // pink
  'rgba(6, 182, 212, 0.25)',    // cyan
];
const PART_STROKES = [
  '#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4',
];

// ============================================
// GRAIN DIRECTION HELPERS
// ============================================

/**
 * Resolve effective grain direction on the sheet, accounting for rotation.
 *
 * Original grain describes the part's grain relative to its own dimensions.
 * When placed with rotation=90, the grain direction on the sheet flips:
 * - HORIZONTAL (runs along width) + rotation=90 → grain runs along height on sheet (VERTICAL on sheet)
 * - VERTICAL (runs along height) + rotation=90 → grain runs along width on sheet (HORIZONTAL on sheet)
 * - NONE → always NONE
 */
function getSheetGrainDirection(
  grainDirection: GrainDirection,
  rotation: 0 | 90 | 180 | 270,
): 'horizontal' | 'vertical' | 'none' {
  if (grainDirection === 'NONE') return 'none';
  const rotated = rotation === 90 || rotation === 270;
  if (grainDirection === 'HORIZONTAL') return rotated ? 'vertical' : 'horizontal';
  return rotated ? 'horizontal' : 'vertical';
}

// ============================================
// MAIN COMPONENT
// ============================================

export function NestingPanel({
  cutListRows,
  onNestingComplete,
  width = 900,
  height = 700,
}: NestingPanelProps): React.ReactElement {
  // State
  const [kerfWidth, setKerfWidth] = useState(DEFAULT_NESTING_CONFIG.kerfWidth);
  const [edgeClearance, setEdgeClearance] = useState(DEFAULT_NESTING_CONFIG.edgeClearance);
  const [nestingSheets, setNestingSheets] = useState<NestingSheet[] | null>(null);
  const [results, setResults] = useState<Map<string, NestingResult> | null>(null);
  const [unplacedParts, setUnplacedParts] = useState<NestingPart[]>([]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [computing, setComputing] = useState(false);
  const [showGrain, setShowGrain] = useState(true);

  // Run optimization
  const handleRun = useCallback(() => {
    if (cutListRows.length === 0) return;
    setComputing(true);

    // Use requestAnimationFrame so UI can show "computing..." before blocking
    requestAnimationFrame(() => {
      const config: Partial<NestingConfig> = { kerfWidth, edgeClearance };
      const {
        sheets,
        unplacedParts: unplaced,
        results: nestResults,
      } = runNesting(cutListRows, config);
      setNestingSheets(sheets);
      setUnplacedParts(unplaced);
      setResults(nestResults);
      setActiveSheetIdx(0);
      setComputing(false);
      onNestingComplete?.(sheets);
    });
  }, [cutListRows, kerfWidth, edgeClearance, onNestingComplete]);

  // CSV export
  const handleExportCsv = useCallback(() => {
    if (!nestingSheets) return;
    const lines = ['SHEET_NO,PART_ID,X,Y,ROTATION,CUT_W,CUT_H,MATERIAL'];
    for (const sheet of nestingSheets) {
      for (const p of sheet.placements) {
        lines.push(
          `${sheet.index1},${p.partId},${p.x},${p.y},${p.rotation},${p.cutW},${p.cutH},${sheet.materialId}`,
        );
      }
    }
    // Unplaced parts must not vanish from the CSV: a part that is absent from
    // the layout is a part nobody cuts and nobody quotes. Emit them explicitly.
    for (const p of unplacedParts) {
      lines.push(
        `UNPLACED,${p.id},,,,${p.width},${p.height},${p.materialId}`,
      );
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nesting-layout.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [nestingSheets, unplacedParts]);

  // Active sheet for visualization
  const activeSheet = nestingSheets?.[activeSheetIdx] ?? null;

  // Build grain-enriched placements from NestingResult
  const grainPlacements = useMemo((): PlacementWithGrain[] | null => {
    if (!activeSheet || !results) return null;

    // Build a lookup from partId → grainDirection across all result sheets
    const grainMap = new Map<string, GrainDirection>();
    for (const r of results.values()) {
      for (const s of r.sheets) {
        for (const p of s.placements) {
          grainMap.set(p.partId, p.grainDirection);
        }
      }
    }

    return activeSheet.placements.map((p) => ({
      ...p,
      grainDirection: grainMap.get(p.partId) ?? 'NONE',
    }));
  }, [activeSheet, results]);

  // Aggregate stats
  const stats = useMemo(() => {
    if (!results) return null;
    let totalSheets = 0;
    let totalUsed = 0;
    let totalUsable = 0;
    let totalUnplaced = 0;

    for (const r of results.values()) {
      totalSheets += r.sheetsUsed;
      for (const s of r.sheets) {
        totalUsed += s.usedArea;
        totalUsable += s.usableArea;
      }
      totalUnplaced += r.unplacedParts.length;
    }

    return {
      totalSheets,
      utilization: totalUsable > 0 ? Math.round((totalUsed / totalUsable) * 1000) / 10 : 0,
      wasteM2: Math.round((totalUsable - totalUsed) / 1e6 * 100) / 100,
      unplaced: totalUnplaced,
    };
  }, [results]);

  // SVG layout
  const svgW = width - 40;
  const svgH = height - 280; // reserve space for config + summary + tabs
  const layout = useMemo(() => {
    if (!activeSheet) return null;
    const margin = 20;
    const availW = svgW - 2 * margin;
    const availH = svgH - 2 * margin;
    const scale = Math.min(availW / activeSheet.sheetW, availH / activeSheet.sheetH);
    return {
      scale,
      offsetX: margin + (availW - activeSheet.sheetW * scale) / 2,
      offsetY: margin + (availH - activeSheet.sheetH * scale) / 2,
    };
  }, [activeSheet, svgW, svgH]);

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.bgPanel,
        borderRadius: 12,
        border: `1px solid ${COLORS.border}`,
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: COLORS.textPrimary }}>
            Cut Optimization
          </span>
          <span style={{ fontSize: 11, color: COLORS.textMuted }}>FFDH</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {nestingSheets && (
            <button onClick={handleExportCsv} style={buttonStyle('secondary')}>
              Export CSV
            </button>
          )}
          <button
            onClick={handleRun}
            disabled={computing || cutListRows.length === 0}
            style={buttonStyle('primary')}
          >
            {computing ? 'Computing...' : 'Run Optimization'}
          </button>
        </div>
      </div>

      {/* Config */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex',
          gap: 24,
          alignItems: 'center',
        }}
      >
        <ConfigInput label="Kerf Width (mm)" value={kerfWidth} onChange={setKerfWidth} min={0} max={10} step={0.5} />
        <ConfigInput label="Edge Clearance (mm)" value={edgeClearance} onChange={setEdgeClearance} min={0} max={50} step={1} />
        {nestingSheets && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: COLORS.textSecondary, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showGrain}
              onChange={(e) => setShowGrain(e.target.checked)}
              style={{ width: 12, height: 12 }}
            />
            Grain
          </label>
        )}
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>
          {cutListRows.length} parts
        </span>
      </div>

      {/* Sheet tabs */}
      {nestingSheets && nestingSheets.length > 0 && (
        <div
          style={{
            padding: '4px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex',
            gap: 4,
            overflowX: 'auto',
          }}
        >
          {nestingSheets.map((sheet, idx) => (
            <button
              key={sheet.index1}
              onClick={() => setActiveSheetIdx(idx)}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: idx === activeSheetIdx ? 600 : 400,
                borderRadius: 4,
                border: `1px solid ${idx === activeSheetIdx ? COLORS.accentPurpleBorder : 'transparent'}`,
                background: idx === activeSheetIdx ? COLORS.accentPurpleBg : 'transparent',
                color: idx === activeSheetIdx ? COLORS.accentPurple : COLORS.textSecondary,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {sheet.label} ({sheet.placements.length}p, {sheet.utilization.toFixed(1)}%)
            </button>
          ))}
        </div>
      )}

      {/* SVG Visualization */}
      <div style={{ flex: 1, padding: '8px 16px', overflow: 'hidden' }}>
        {!nestingSheets && (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: COLORS.textMuted,
              fontSize: 13,
            }}
          >
            Click &ldquo;Run Optimization&rdquo; to generate nesting layout
          </div>
        )}
        {activeSheet && layout && grainPlacements && (
          <svg width={svgW} height={svgH} style={{ background: COLORS.bgCard, borderRadius: 8 }}>
            {/* Sheet boundary */}
            <rect
              x={layout.offsetX}
              y={layout.offsetY}
              width={activeSheet.sheetW * layout.scale}
              height={activeSheet.sheetH * layout.scale}
              fill="none"
              stroke={COLORS.borderStrong}
              strokeWidth={1.5}
            />

            {/* Edge clearance zone (dashed) */}
            <rect
              x={layout.offsetX + edgeClearance * layout.scale}
              y={layout.offsetY + edgeClearance * layout.scale}
              width={(activeSheet.sheetW - 2 * edgeClearance) * layout.scale}
              height={(activeSheet.sheetH - 2 * edgeClearance) * layout.scale}
              fill="none"
              stroke={COLORS.textMuted}
              strokeWidth={0.5}
              strokeDasharray="4 4"
            />

            {/* Sheet dimension labels */}
            <text
              x={layout.offsetX + (activeSheet.sheetW * layout.scale) / 2}
              y={layout.offsetY - 6}
              fill={COLORS.textMuted}
              fontSize={10}
              textAnchor="middle"
            >
              {activeSheet.sheetW}mm
            </text>
            <text
              x={layout.offsetX - 6}
              y={layout.offsetY + (activeSheet.sheetH * layout.scale) / 2}
              fill={COLORS.textMuted}
              fontSize={10}
              textAnchor="middle"
              transform={`rotate(-90 ${layout.offsetX - 6} ${layout.offsetY + (activeSheet.sheetH * layout.scale) / 2})`}
            >
              {activeSheet.sheetH}mm
            </text>

            {/* Placed parts with grain direction indicators */}
            {grainPlacements.map((p, idx) => {
              const effectiveW = p.rotation === 90 ? p.cutH : p.cutW;
              const effectiveH = p.rotation === 90 ? p.cutW : p.cutH;
              const rx = layout.offsetX + p.x * layout.scale;
              const ry = layout.offsetY + p.y * layout.scale;
              const rw = effectiveW * layout.scale;
              const rh = effectiveH * layout.scale;
              const colorIdx = idx % PART_FILLS.length;
              const sheetGrain = getSheetGrainDirection(p.grainDirection, p.rotation);

              return (
                <g key={p.partId}>
                  {/* Part rectangle */}
                  <rect
                    x={rx}
                    y={ry}
                    width={rw}
                    height={rh}
                    fill={PART_FILLS[colorIdx]}
                    stroke={PART_STROKES[colorIdx]}
                    strokeWidth={1}
                  />

                  {/* Grain direction lines (subtle parallel lines) */}
                  {showGrain && sheetGrain !== 'none' && rw > 12 && rh > 12 && (
                    <GrainLines
                      x={rx}
                      y={ry}
                      w={rw}
                      h={rh}
                      direction={sheetGrain}
                    />
                  )}

                  {/* Part label (only if large enough) */}
                  {rw > 40 && rh > 20 && (
                    <>
                      <text
                        x={rx + rw / 2}
                        y={ry + rh / 2 - 5}
                        fill={COLORS.textPrimary}
                        fontSize={Math.min(10, rw / 8)}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {p.partId}
                      </text>
                      <text
                        x={rx + rw / 2}
                        y={ry + rh / 2 + 7}
                        fill={COLORS.textSecondary}
                        fontSize={Math.min(8, rw / 10)}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {p.cutW}×{p.cutH}{p.rotation ? ' ↻' : ''}{sheetGrain !== 'none' ? (sheetGrain === 'horizontal' ? ' ═' : ' ║') : ''}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {/* Utilization overlay */}
            <text
              x={layout.offsetX + activeSheet.sheetW * layout.scale - 4}
              y={layout.offsetY + activeSheet.sheetH * layout.scale + 14}
              fill={activeSheet.utilization > 70 ? COLORS.successGreen : COLORS.warningAmber}
              fontSize={11}
              textAnchor="end"
              fontWeight={600}
            >
              Utilization: {activeSheet.utilization.toFixed(1)}%
            </text>
          </svg>
        )}
      </div>

      {/* Unplaced parts — a bare count is not enough: name them. The layout
          above and the CSV below are INCOMPLETE while this list is non-empty. */}
      {unplacedParts.length > 0 && (
        <div
          role="alert"
          style={{
            padding: '10px 16px',
            borderTop: `1px solid ${COLORS.border}`,
            background: 'rgba(239, 68, 68, 0.10)',
            color: '#ef4444',
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {unplacedParts.length} part{unplacedParts.length === 1 ? '' : 's'} could not be
            nested — this layout is INCOMPLETE and must not be sent to the factory as-is.
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {unplacedParts.map((p) => (
              <li key={p.id}>
                <strong>{p.id}</strong> — {p.width} × {p.height} mm, {p.materialId},
                grain {p.grainDirection}
                {p.grainDirection !== 'NONE'
                  ? ' (grain locks rotation — part cannot be turned to fit)'
                  : ' (too large for the board in both orientations)'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Results summary */}
      {stats && (
        <div
          style={{
            padding: '10px 16px',
            borderTop: `1px solid ${COLORS.border}`,
            display: 'flex',
            gap: 24,
            fontSize: 12,
          }}
        >
          <StatBadge label="Sheets" value={String(stats.totalSheets)} color={COLORS.accentPurple} />
          <StatBadge
            label="Utilization"
            value={`${stats.utilization}%`}
            color={stats.utilization > 70 ? COLORS.successGreen : COLORS.warningAmber}
          />
          <StatBadge label="Waste" value={`${stats.wasteM2} m²`} color={COLORS.textSecondary} />
          {stats.unplaced > 0 && (
            <StatBadge label="Unplaced" value={String(stats.unplaced)} color="#ef4444" />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// GRAIN LINE SVG COMPONENT
// ============================================

/**
 * Renders subtle parallel lines inside a part rectangle to indicate grain direction.
 * Uses clipPath to confine lines within part bounds.
 */
function GrainLines({
  x,
  y,
  w,
  h,
  direction,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  direction: 'horizontal' | 'vertical';
}) {
  const spacing = Math.max(6, Math.min(12, Math.min(w, h) / 5));
  const inset = 3; // Inset from part edges
  const lines: React.ReactElement[] = [];

  if (direction === 'horizontal') {
    // Horizontal grain: lines run left to right
    const count = Math.floor((h - 2 * inset) / spacing);
    for (let i = 0; i <= count; i++) {
      const ly = y + inset + i * spacing;
      if (ly > y + h - inset) break;
      lines.push(
        <line
          key={i}
          x1={x + inset}
          y1={ly}
          x2={x + w - inset}
          y2={ly}
          stroke={COLORS.grainLine}
          strokeWidth={0.5}
        />,
      );
    }
  } else {
    // Vertical grain: lines run top to bottom
    const count = Math.floor((w - 2 * inset) / spacing);
    for (let i = 0; i <= count; i++) {
      const lx = x + inset + i * spacing;
      if (lx > x + w - inset) break;
      lines.push(
        <line
          key={i}
          x1={lx}
          y1={y + inset}
          x2={lx}
          y2={y + h - inset}
          stroke={COLORS.grainLine}
          strokeWidth={0.5}
        />,
      );
    }
  }

  return <g>{lines}</g>;
}

// ============================================
// SUB-COMPONENTS
// ============================================

function ConfigInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLORS.textSecondary }}>
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        style={{
          width: 56,
          padding: '3px 6px',
          fontSize: 11,
          background: COLORS.bgInput,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 4,
          color: COLORS.textPrimary,
          outline: 'none',
        }}
      />
    </label>
  );
}

function StatBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: COLORS.textMuted }}>{label}</span>
      <span style={{ fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

// ============================================
// STYLE HELPERS
// ============================================

function buttonStyle(variant: 'primary' | 'secondary'): React.CSSProperties {
  if (variant === 'primary') {
    return {
      padding: '6px 14px',
      fontSize: 12,
      fontWeight: 600,
      borderRadius: 6,
      border: 'none',
      background: COLORS.accentPurple,
      color: '#ffffff',
      cursor: 'pointer',
    };
  }
  return {
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 6,
    border: `1px solid ${COLORS.border}`,
    background: 'transparent',
    color: COLORS.textSecondary,
    cursor: 'pointer',
  };
}
