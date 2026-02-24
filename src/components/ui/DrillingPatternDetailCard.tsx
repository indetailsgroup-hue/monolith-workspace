/**
 * DrillingPatternDetailCard - Detail card for a selected drilling pattern
 *
 * Shows:
 * - Pattern name and system type badge
 * - List of holes with x, y, diameter, depth
 * - Associated fittings that use this pattern
 * - Mini SVG preview
 */

import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import {
  DrillingPattern,
  FITTING_CATALOGUE,
  FittingSpec,
} from '../../core/fitting/FittingCatalogue';

// ============================================
// TYPES
// ============================================

interface DrillingPatternDetailCardProps {
  pattern: DrillingPattern;
  onClose?: () => void;
}

// ============================================
// SYSTEM BADGE COLORS
// ============================================

const SYSTEM_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  SYSTEM_32: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  CUSTOM: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  MINIFIX: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  CONFIRMAT: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
};

// ============================================
// MINI SVG PREVIEW
// ============================================

function MiniSvgPreview({ pattern }: { pattern: DrillingPattern }) {
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

    const svgW = 120;
    const svgH = 80;
    const pad = 12;
    const scale = Math.min((svgW - pad * 2) / rangeX, (svgH - pad * 2) / rangeY);

    return { minX, minY, rangeX, rangeY, svgW, svgH, pad, scale };
  }, [holes]);

  if (!layout) return null;

  const { minX, minY, svgW, svgH, pad, scale } = layout;

  return (
    <svg
      width={svgW}
      height={svgH}
      className="bg-zinc-900/50 rounded border border-zinc-700"
      data-testid="mini-svg-preview"
    >
      {holes.map((hole, i) => {
        const cx = pad + (hole.x - minX) * scale;
        const cy = pad + (hole.y - minY) * scale;
        const r = Math.max((hole.diameter * scale) / 2, 2);

        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#22d3ee"
            strokeWidth={1}
            data-testid={`mini-hole-${i}`}
          />
        );
      })}
    </svg>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function DrillingPatternDetailCard({ pattern, onClose }: DrillingPatternDetailCardProps) {
  const badgeColor = SYSTEM_BADGE_COLORS[pattern.system] ?? SYSTEM_BADGE_COLORS.CUSTOM;

  // Find associated fittings
  const associatedFittings: FittingSpec[] = useMemo(
    () => FITTING_CATALOGUE.filter((f) => f.drillingPatternId === pattern.id),
    [pattern.id],
  );

  return (
    <div
      className="bg-zinc-800/80 border border-zinc-700 rounded-lg p-3 space-y-3"
      data-testid="drilling-pattern-detail-card"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-200 truncate">{pattern.name}</div>
          <span
            className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium ${badgeColor.bg} ${badgeColor.text}`}
            data-testid="system-badge"
          >
            {pattern.system.replace('_', ' ')}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
            aria-label="Close detail card"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Mini SVG Preview */}
      <MiniSvgPreview pattern={pattern} />

      {/* Holes table */}
      <div>
        <div className="text-[10px] font-medium text-zinc-400 mb-1">
          Holes ({pattern.holes.length})
        </div>
        <div className="bg-zinc-900/50 rounded border border-zinc-700 overflow-hidden">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-700">
                <th className="px-2 py-1 text-left">#</th>
                <th className="px-2 py-1 text-right">X</th>
                <th className="px-2 py-1 text-right">Y</th>
                <th className="px-2 py-1 text-right">Dia</th>
                <th className="px-2 py-1 text-right">Depth</th>
              </tr>
            </thead>
            <tbody>
              {pattern.holes.map((hole, i) => (
                <tr
                  key={i}
                  className="text-zinc-300 border-b border-zinc-800 last:border-0"
                  data-testid={`hole-row-${i}`}
                >
                  <td className="px-2 py-1 text-zinc-500">{i + 1}</td>
                  <td className="px-2 py-1 text-right">{hole.x}</td>
                  <td className="px-2 py-1 text-right">{hole.y}</td>
                  <td className="px-2 py-1 text-right">{hole.diameter}mm</td>
                  <td className="px-2 py-1 text-right">{hole.depth}mm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Associated Fittings */}
      {associatedFittings.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-zinc-400 mb-1">
            Used by ({associatedFittings.length})
          </div>
          <div className="space-y-1">
            {associatedFittings.map((fitting) => (
              <div
                key={fitting.id}
                className="flex items-center gap-2 px-2 py-1 bg-zinc-900/50 rounded text-[10px]"
                data-testid={`associated-fitting-${fitting.id}`}
              >
                <span className="text-zinc-300 truncate">{fitting.name}</span>
                <span className="text-zinc-500 shrink-0">{fitting.vendor}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DrillingPatternDetailCard;
