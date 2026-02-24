/**
 * DrillingPatternView - Drilling Patterns browser & SVG visualization
 *
 * Shows a list of all drilling patterns from DRILLING_PATTERNS,
 * renders SVG visualizations of hole positions, and allows selecting
 * a pattern to view detailed hole data.
 *
 * Used inside the HardwarePanel "Drilling" tab.
 */

import React, { useState, useMemo } from 'react';
import {
  DrillingPattern,
  DRILLING_PATTERNS,
  FITTING_CATALOGUE,
} from '../../core/fitting/FittingCatalogue';
import { DrillingPatternDetailCard } from './DrillingPatternDetailCard';

// ============================================
// TYPES
// ============================================

interface DrillingPatternViewProps {
  /** If a fitting is currently selected in the UI, highlight its drilling pattern */
  selectedFittingId?: string | null;
}

// ============================================
// SYSTEM BADGE COLORS (same palette as detail card)
// ============================================

const SYSTEM_COLORS: Record<string, { ring: string; fill: string; badge: string; badgeText: string }> = {
  SYSTEM_32: { ring: 'ring-blue-500/40', fill: 'fill-blue-400', badge: 'bg-blue-500/20', badgeText: 'text-blue-400' },
  CUSTOM: { ring: 'ring-amber-500/40', fill: 'fill-amber-400', badge: 'bg-amber-500/20', badgeText: 'text-amber-400' },
  MINIFIX: { ring: 'ring-purple-500/40', fill: 'fill-purple-400', badge: 'bg-purple-500/20', badgeText: 'text-purple-400' },
  CONFIRMAT: { ring: 'ring-emerald-500/40', fill: 'fill-emerald-400', badge: 'bg-emerald-500/20', badgeText: 'text-emerald-400' },
};

// ============================================
// SVG PATTERN VISUALIZATION
// ============================================

interface PatternSvgProps {
  pattern: DrillingPattern;
  width?: number;
  height?: number;
}

function PatternSvg({ pattern, width = 160, height = 100 }: PatternSvgProps) {
  const { holes } = pattern;

  const layout = useMemo(() => {
    if (holes.length === 0) return null;

    const xs = holes.map((h) => h.x);
    const ys = holes.map((h) => h.y);
    const maxDia = Math.max(...holes.map((h) => h.diameter));

    const minX = Math.min(...xs) - maxDia;
    const maxX = Math.max(...xs) + maxDia;
    const minY = Math.min(...ys) - maxDia;
    const maxY = Math.max(...ys) + maxDia;

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const pad = 16;
    const scale = Math.min((width - pad * 2) / rangeX, (height - pad * 2) / rangeY);
    const drawW = rangeX * scale;
    const drawH = rangeY * scale;

    // Center drawing in SVG
    const oX = (width - drawW) / 2;
    const oY = (height - drawH) / 2;

    return { minX, minY, rangeX, rangeY, scale, oX, oY, drawW, drawH };
  }, [holes, width, height]);

  if (!layout) {
    return (
      <svg width={width} height={height} className="bg-zinc-900/50 rounded border border-zinc-700">
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="#71717a" fontSize="10">
          No holes
        </text>
      </svg>
    );
  }

  const { minX, minY, scale, oX, oY, drawW, drawH } = layout;

  return (
    <svg
      width={width}
      height={height}
      className="bg-zinc-900/50 rounded border border-zinc-700"
      data-testid="pattern-svg"
    >
      {/* Panel outline */}
      <rect
        x={oX}
        y={oY}
        width={drawW}
        height={drawH}
        fill="none"
        stroke="#3f3f46"
        strokeWidth={1}
        strokeDasharray="4,2"
        data-testid="panel-outline"
      />

      {/* Hole circles and labels */}
      {holes.map((hole, i) => {
        const cx = oX + (hole.x - minX) * scale;
        const cy = oY + (hole.y - minY) * scale;
        const r = Math.max((hole.diameter * scale) / 2, 3);

        return (
          <g key={i} data-testid={`hole-group-${i}`}>
            {/* Hole circle */}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="rgba(34, 211, 238, 0.15)"
              stroke="#22d3ee"
              strokeWidth={1}
              data-testid={`hole-circle-${i}`}
            />
            {/* Center cross */}
            <line x1={cx - 2} y1={cy} x2={cx + 2} y2={cy} stroke="#22d3ee" strokeWidth={0.5} />
            <line x1={cx} y1={cy - 2} x2={cx} y2={cy + 2} stroke="#22d3ee" strokeWidth={0.5} />
            {/* Depth label */}
            <text
              x={cx}
              y={cy + r + 9}
              textAnchor="middle"
              fill="#a1a1aa"
              fontSize="7"
              data-testid={`hole-depth-label-${i}`}
            >
              d{hole.depth}
            </text>
          </g>
        );
      })}

      {/* Pattern name label */}
      <text
        x={4}
        y={height - 4}
        fill="#71717a"
        fontSize="7"
        data-testid="pattern-name-label"
      >
        {pattern.name}
      </text>

      {/* System type label */}
      <text
        x={width - 4}
        y={height - 4}
        textAnchor="end"
        fill="#71717a"
        fontSize="7"
        data-testid="system-type-label"
      >
        {pattern.system.replace('_', ' ')}
      </text>
    </svg>
  );
}

// ============================================
// PATTERN LIST ITEM
// ============================================

interface PatternListItemProps {
  pattern: DrillingPattern;
  isSelected: boolean;
  isHighlighted: boolean;
  fittingCount: number;
  onClick: () => void;
}

function PatternListItem({ pattern, isSelected, isHighlighted, fittingCount, onClick }: PatternListItemProps) {
  const colors = SYSTEM_COLORS[pattern.system] ?? SYSTEM_COLORS.CUSTOM;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-2 rounded-lg transition-colors border ${
        isSelected
          ? 'bg-zinc-700/60 border-cyan-500/40'
          : isHighlighted
            ? `bg-zinc-800/80 border-green-500/40 ring-1 ${colors.ring}`
            : 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700/50'
      }`}
      data-testid={`pattern-item-${pattern.id}`}
    >
      {/* SVG visualization */}
      <PatternSvg pattern={pattern} />

      {/* Info row */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-zinc-200 truncate">{pattern.name}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`px-1.5 py-0 rounded text-[10px] font-medium ${colors.badge} ${colors.badgeText}`}
            >
              {pattern.system.replace('_', ' ')}
            </span>
            <span className="text-[10px] text-zinc-500">
              {pattern.holes.length} hole{pattern.holes.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        {fittingCount > 0 && (
          <span className="text-[10px] text-zinc-500 shrink-0">
            {fittingCount} fitting{fittingCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function DrillingPatternView({ selectedFittingId }: DrillingPatternViewProps) {
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);

  // All patterns as array
  const patterns = useMemo<DrillingPattern[]>(
    () => Object.values(DRILLING_PATTERNS),
    [],
  );

  // Build a lookup: pattern id -> count of fittings using it
  const fittingCountByPattern = useMemo(() => {
    const map: Record<string, number> = {};
    for (const fitting of FITTING_CATALOGUE) {
      map[fitting.drillingPatternId] = (map[fitting.drillingPatternId] ?? 0) + 1;
    }
    return map;
  }, []);

  // Find which pattern is highlighted because a fitting is selected
  const highlightedPatternId = useMemo(() => {
    if (!selectedFittingId) return null;
    const fitting = FITTING_CATALOGUE.find((f) => f.id === selectedFittingId);
    return fitting?.drillingPatternId ?? null;
  }, [selectedFittingId]);

  // Selected pattern object
  const selectedPattern = selectedPatternId ? DRILLING_PATTERNS[selectedPatternId] ?? null : null;

  const handlePatternClick = (patternId: string) => {
    setSelectedPatternId((prev) => (prev === patternId ? null : patternId));
  };

  return (
    <div className="h-full flex flex-col" data-testid="drilling-pattern-view">
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-700 shrink-0">
        <div className="text-xs font-medium text-zinc-300">
          Drilling Patterns
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5">
          {patterns.length} pattern{patterns.length !== 1 ? 's' : ''} in catalogue
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Detail card when a pattern is selected */}
        {selectedPattern && (
          <div className="p-2 border-b border-zinc-700">
            <DrillingPatternDetailCard
              pattern={selectedPattern}
              onClose={() => setSelectedPatternId(null)}
            />
          </div>
        )}

        {/* Pattern list */}
        <div className="p-2 space-y-2" data-testid="pattern-list">
          {patterns.map((pattern) => (
            <PatternListItem
              key={pattern.id}
              pattern={pattern}
              isSelected={selectedPatternId === pattern.id}
              isHighlighted={highlightedPatternId === pattern.id}
              fittingCount={fittingCountByPattern[pattern.id] ?? 0}
              onClick={() => handlePatternClick(pattern.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default DrillingPatternView;
