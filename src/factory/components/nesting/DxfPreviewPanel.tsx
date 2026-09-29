/**
 * DxfPreviewPanel.tsx
 *
 * Renders a DXF-style preview inline as SVG before the user downloads the ZIP.
 * Shows the R12 DXF content visually: sheet boundary, panel outlines, kerf slots,
 * labels — matching what will be in the actual DXF file.
 *
 * Features:
 *  - Tab navigation between curved sheets
 *  - Drag-and-drop manual placement editing for curved panels
 *  - "Reset" button to undo manual moves
 *  - Emits updated placements via onPlacementsChanged callback
 *
 * @module factory/components/nesting/DxfPreviewPanel
 */

import React, { useMemo, useState, useRef, useCallback } from 'react';
import type { NestingSheet } from '../../../core/export/monolith/monolithExportContext';

// ─── Constants ───────────────────────────────────────────────────────────────

const SVG_W = 580;
const SVG_H = 320;
const MARGIN = 12;

const COLORS = {
  sheetBorder: '#475569',   // slate-600
  flatPanel: '#334155',     // slate-700
  curvedPanel: '#0d9488',   // teal-600
  curvedPanelDragging: '#14b8a6', // teal-500 (brighter while dragging)
  kerfLine: '#3b82f6',      // blue-500
  label: '#94a3b8',         // slate-400
  kerfLabel: '#60a5fa',     // blue-400
  background: '#020617',    // slate-950
  tabActive: '#0d9488',
  tabInactive: '#1e293b',
  dragHighlight: '#fbbf24', // amber-400
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlacementOverride {
  partId: string;
  x: number;
  y: number;
}

export interface DxfPreviewPanelProps {
  sheets: NestingSheet[];
  jobId?: string;
  /** Called when user repositions a panel via drag-and-drop */
  onPlacementsChanged?: (sheetIndex1: number, overrides: PlacementOverride[]) => void;
}

// ─── Drag state ──────────────────────────────────────────────────────────────

interface DragState {
  partId: string;
  startMouseX: number;
  startMouseY: number;
  startWorldX: number;
  startWorldY: number;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface SheetDxfPreviewProps {
  sheet: NestingSheet;
  overrides: Map<string, { x: number; y: number }>;
  onDragEnd: (partId: string, newX: number, newY: number) => void;
}

function SheetDxfPreview({ sheet, overrides, onDragEnd }: SheetDxfPreviewProps) {
  const { sheetW, sheetH, placements } = sheet;
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const scaleX = (SVG_W - 2 * MARGIN) / Math.max(sheetW, 1);
  const scaleY = (SVG_H - 2 * MARGIN) / Math.max(sheetH, 1);
  const scale = Math.min(scaleX, scaleY);

  const toX = (wx: number) => MARGIN + wx * scale;
  const toY = (wy: number) => MARGIN + (sheetH - wy) * scale; // flip Y

  // Inverse: SVG → World
  const toWorldX = (svgX: number) => (svgX - MARGIN) / scale;
  const toWorldY = (svgY: number) => sheetH - (svgY - MARGIN) / scale;

  const curvedPlacements = placements.filter(p => p.isCurved);
  const flatPlacements = placements.filter(p => !p.isCurved);

  // Get effective position (with override)
  const getPos = useCallback((p: typeof placements[0]) => {
    const override = overrides.get(p.partId);
    return override ?? { x: p.x, y: p.y };
  }, [overrides]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent, partId: string) => {
    const target = curvedPlacements.find(p => p.partId === partId);
    if (!target) return;
    const pos = getPos(target);
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    setDragState({
      partId,
      startMouseX: svgX,
      startMouseY: svgY,
      startWorldX: pos.x,
      startWorldY: pos.y,
    });
    setDragOffset({ dx: 0, dy: 0 });
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    setDragOffset({
      dx: svgX - dragState.startMouseX,
      dy: svgY - dragState.startMouseY,
    });
  };

  const handleMouseUp = () => {
    if (!dragState) return;
    // Calculate new world position
    const newWorldX = dragState.startWorldX + dragOffset.dx / scale;
    // Y is flipped in SVG
    const newWorldY = dragState.startWorldY - dragOffset.dy / scale;

    // Clamp to sheet bounds
    const target = curvedPlacements.find(p => p.partId === dragState.partId);
    if (target) {
      const w = (target.rotation === 90 || target.rotation === 270) ? target.cutH : target.cutW;
      const h = (target.rotation === 90 || target.rotation === 270) ? target.cutW : target.cutH;
      const clampedX = Math.max(0, Math.min(sheetW - w, newWorldX));
      const clampedY = Math.max(0, Math.min(sheetH - h, newWorldY));
      onDragEnd(dragState.partId, Math.round(clampedX), Math.round(clampedY));
    }
    setDragState(null);
    setDragOffset({ dx: 0, dy: 0 });
  };

  const handleMouseLeave = () => {
    if (dragState) {
      handleMouseUp();
    }
  };

  return (
    <svg
      ref={svgRef}
      width={SVG_W}
      height={SVG_H}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      data-testid={`dxf-preview-${sheet.index1}`}
      style={{ borderRadius: 8, border: `1px solid ${COLORS.sheetBorder}`, cursor: dragState ? 'grabbing' : 'default' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Background */}
      <rect width={SVG_W} height={SVG_H} fill={COLORS.background} />

      {/* Sheet boundary (DXF: SHEET_BOUNDARY layer) */}
      <rect
        x={toX(0)}
        y={toY(sheetH)}
        width={sheetW * scale}
        height={sheetH * scale}
        fill="none"
        stroke={COLORS.sheetBorder}
        strokeWidth={1.5}
        strokeDasharray="4 2"
      />

      {/* Flat panels (dimmed — not the focus of DXF batch) */}
      {flatPlacements.map((p, i) => {
        const pos = getPos(p);
        const w = (p.rotation === 90 || p.rotation === 270) ? p.cutH : p.cutW;
        const h = (p.rotation === 90 || p.rotation === 270) ? p.cutW : p.cutH;
        const rx = toX(pos.x);
        const ry = toY(pos.y + h);
        return (
          <rect
            key={`flat-${i}`}
            x={rx}
            y={ry}
            width={w * scale}
            height={h * scale}
            fill={COLORS.flatPanel}
            fillOpacity={0.3}
            stroke={COLORS.flatPanel}
            strokeWidth={0.5}
          />
        );
      })}

      {/* Curved panels (DXF: CURVED_PANEL layer) — draggable */}
      {curvedPlacements.map((p, i) => {
        const pos = getPos(p);
        const w = (p.rotation === 90 || p.rotation === 270) ? p.cutH : p.cutW;
        const h = (p.rotation === 90 || p.rotation === 270) ? p.cutW : p.cutH;

        const isDragging = dragState?.partId === p.partId;
        let rx = toX(pos.x);
        let ry = toY(pos.y + h);

        // Apply drag offset
        if (isDragging) {
          rx += dragOffset.dx;
          ry += dragOffset.dy;
        }

        const rw = w * scale;
        const rh = h * scale;

        // Kerf slot lines
        const kerfLines: React.ReactElement[] = [];
        if (p.kerfCount && p.kerfCount > 0) {
          const spacing = rw / (p.kerfCount + 1);
          for (let k = 1; k <= p.kerfCount; k++) {
            kerfLines.push(
              <line
                key={`kerf-${i}-${k}`}
                x1={rx + k * spacing}
                y1={ry + 2}
                x2={rx + k * spacing}
                y2={ry + rh - 2}
                stroke={COLORS.kerfLine}
                strokeWidth={0.5}
                strokeDasharray="2 1"
                opacity={0.6}
              />
            );
          }
        }

        return (
          <g
            key={`curved-${i}`}
            data-testid={`dxf-curved-${p.partId}`}
            onMouseDown={(e) => handleMouseDown(e, p.partId)}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            {/* Drop shadow when dragging */}
            {isDragging && (
              <rect
                x={rx + 2}
                y={ry + 2}
                width={rw}
                height={rh}
                fill="rgba(0,0,0,0.3)"
                rx={2}
              />
            )}
            <rect
              x={rx}
              y={ry}
              width={rw}
              height={rh}
              fill={isDragging ? COLORS.curvedPanelDragging : COLORS.curvedPanel}
              fillOpacity={isDragging ? 0.3 : 0.15}
              stroke={isDragging ? COLORS.dragHighlight : COLORS.curvedPanel}
              strokeWidth={isDragging ? 2 : 1.2}
            />
            {kerfLines}
            {/* Part ID */}
            <text
              x={rx + rw / 2}
              y={ry + rh / 2 - 4}
              textAnchor="middle"
              fontSize={9}
              fill={COLORS.label}
              fontFamily="monospace"
            >
              {p.partId}
            </text>
            {/* Kerf count */}
            {p.kerfCount && (
              <text
                x={rx + rw / 2}
                y={ry + rh / 2 + 8}
                textAnchor="middle"
                fontSize={8}
                fill={COLORS.kerfLabel}
                fontFamily="monospace"
                fontWeight="bold"
              >
                {p.kerfCount}K
              </text>
            )}
          </g>
        );
      })}

      {/* Sheet info label */}
      <text x={MARGIN} y={SVG_H - 6} fontSize={8} fill={COLORS.label} fontFamily="monospace">
        {sheet.label ?? `NEST_${String(sheet.index1).padStart(2, '0')}`} | {sheet.materialId} |{' '}
        {sheetW}×{sheetH}mm | {curvedPlacements.length} curved / {placements.length} total
      </text>

      {/* Drag instructions */}
      <text x={SVG_W - MARGIN} y={SVG_H - 6} textAnchor="end" fontSize={7} fill="#64748b" fontFamily="monospace">
        ↕ drag to reposition
      </text>
    </svg>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function DxfPreviewPanel({ sheets, jobId, onPlacementsChanged }: DxfPreviewPanelProps) {
  // Filter sheets that have curved panels
  const curvedSheets = useMemo(
    () => sheets.filter(s => s.placements.some(p => p.isCurved)),
    [sheets]
  );

  const [activeIdx, setActiveIdx] = useState(0);
  // Map of sheetIndex1 → Map<partId, {x, y}>
  const [allOverrides, setAllOverrides] = useState<Map<number, Map<string, { x: number; y: number }>>>(new Map());

  const handleDragEnd = useCallback((sheetIndex1: number, partId: string, newX: number, newY: number) => {
    setAllOverrides(prev => {
      const next = new Map(prev);
      const sheetMap = new Map(next.get(sheetIndex1) ?? []);
      sheetMap.set(partId, { x: newX, y: newY });
      next.set(sheetIndex1, sheetMap);

      // Emit callback
      if (onPlacementsChanged) {
        const overridesArr: PlacementOverride[] = [];
        sheetMap.forEach((pos, pid) => overridesArr.push({ partId: pid, ...pos }));
        onPlacementsChanged(sheetIndex1, overridesArr);
      }

      return next;
    });
  }, [onPlacementsChanged]);

  const handleReset = useCallback(() => {
    setAllOverrides(new Map());
  }, []);

  const hasOverrides = allOverrides.size > 0;

  if (curvedSheets.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-8 gap-2"
        data-testid="dxf-preview-empty"
      >
        <span className="text-2xl opacity-30">📐</span>
        <p className="text-xs text-slate-500">ไม่มี curved panels ในการ nesting</p>
      </div>
    );
  }

  const activeSheet = curvedSheets[Math.min(activeIdx, curvedSheets.length - 1)];
  const currentOverrides = allOverrides.get(activeSheet.index1) ?? new Map();

  return (
    <div data-testid="dxf-preview-panel">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-white">DXF Preview</span>
        {jobId && <span className="text-[10px] text-slate-500">— {jobId}</span>}
        <span className="text-[10px] text-slate-500 ml-auto">
          {curvedSheets.length} sheet(s) with curves
        </span>
        {hasOverrides && (
          <button
            onClick={handleReset}
            data-testid="dxf-reset-button"
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              border: '1px solid #f59e0b',
              background: 'transparent',
              color: '#f59e0b',
              fontSize: 10,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            ↺ Reset
          </button>
        )}
      </div>

      {/* Sheet tabs */}
      {curvedSheets.length > 1 && (
        <div className="flex gap-1 mb-2 flex-wrap" data-testid="dxf-preview-tabs">
          {curvedSheets.map((sheet, idx) => {
            const hasSheetOverrides = (allOverrides.get(sheet.index1)?.size ?? 0) > 0;
            return (
              <button
                key={sheet.index1}
                onClick={() => setActiveIdx(idx)}
                data-testid={`dxf-tab-${sheet.index1}`}
                style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: 'none',
                  fontSize: 10,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  background: idx === activeIdx ? COLORS.tabActive : COLORS.tabInactive,
                  color: idx === activeIdx ? '#fff' : '#64748b',
                  transition: 'all 0.15s ease',
                }}
              >
                {sheet.label ?? `#${sheet.index1}`}
                {hasSheetOverrides && ' ✱'}
              </button>
            );
          })}
        </div>
      )}

      {/* SVG Preview */}
      <SheetDxfPreview
        sheet={activeSheet}
        overrides={currentOverrides}
        onDragEnd={(partId, x, y) => handleDragEnd(activeSheet.index1, partId, x, y)}
      />

      {/* Legend */}
      <div className="flex gap-4 mt-2 text-[9px] text-slate-500">
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: COLORS.curvedPanel, borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} />
          Curved Panel (drag to move)
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: COLORS.kerfLine, borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} />
          Kerf Slots
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, border: `1px dashed ${COLORS.sheetBorder}`, borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} />
          Sheet Boundary
        </span>
        {hasOverrides && (
          <span className="text-amber-400 font-medium" data-testid="dxf-modified-indicator">
            ✱ Modified
          </span>
        )}
      </div>
    </div>
  );
}
