/**
 * CurvedPanelProfileEditor
 *
 * Panel-level profile editor for curved cabinet panels.
 * Surfaces in the "Curves" tab of DesignerIntentPanel when a panel is selected.
 *
 * Features:
 *  - Kind selector: RECT / ARC / S_CURVE / ROUNDED_CORNER
 *  - Dynamic form fields per kind (edge, radius, sweepDeg, etc.)
 *  - Live kerf preview: kerfCount, developedLength, projectedDepth
 *  - G12 gate error / warning badges from computeCurveProfile()
 *  - Writes to useCabinetStore → updatePanelProfile() on every valid change
 *
 * @module CurvedPanelProfileEditor
 */

import React, { useMemo, useCallback } from 'react';
import { useCabinet, useCabinetStore } from '../../core/store/useCabinetStore';
import type { PanelProfile, PanelEdge } from '../../core/types/Cabinet';
import { computeCurveProfile } from '../../core/manufacturing/curve/curveProfile';
import type { ArcSegment } from '../../core/manufacturing/curve/curveProfile';
import {
  computeCurveFields,
  resolveMaterial,
  DEFAULT_KERF_TOOL,
} from '../../factory/packet/builders/curveFieldsComputer';

// ============================================
// CONSTANTS
// ============================================

const KIND_OPTIONS: { value: PanelProfile['kind']; label: string; labelTH: string; icon: string }[] = [
  { value: 'RECT',            label: 'Flat',           labelTH: 'แบน',          icon: '▭' },
  { value: 'ARC',             label: 'Arc',            labelTH: 'โค้ง Arc',     icon: '⌒' },
  { value: 'S_CURVE',         label: 'S-Curve',        labelTH: 'S-Curve',      icon: '∿' },
  { value: 'ROUNDED_CORNER',  label: 'Rounded Corner', labelTH: 'โค้งมุม',      icon: '⌐' },
];

const EDGE_OPTIONS: { value: PanelEdge; label: string; labelTH: string }[] = [
  { value: 'TOP',    label: 'Top',    labelTH: 'บน'   },
  { value: 'BOTTOM', label: 'Bottom', labelTH: 'ล่าง'  },
  { value: 'LEFT',   label: 'Left',   labelTH: 'ซ้าย'  },
  { value: 'RIGHT',  label: 'Right',  labelTH: 'ขวา'  },
];

const G12_LABELS: Record<string, { label: string; color: string }> = {
  G12_RADIUS_BELOW_MIN:       { label: 'G12: รัศมีน้อยเกินไป',          color: 'text-red-400 border-red-500/30 bg-red-500/10' },
  G12_FITTING_IN_KERF_ZONE:   { label: 'G12: โค้งไม่พอดีขนาดแผ่น',    color: 'text-red-400 border-red-500/30 bg-red-500/10' },
  G12_SCURVE_TRANSITION_SHORT:{ label: 'G12 ⚠ S-Curve เกือบตั้ง 180°', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
};

// ============================================
// HELPERS
// ============================================

function defaultForKind(kind: PanelProfile['kind']): PanelProfile {
  switch (kind) {
    case 'RECT':           return { kind: 'RECT' };
    case 'ARC':            return { kind: 'ARC',     edge: 'TOP', radius: 150, sweepDeg: 30 };
    case 'S_CURVE':        return { kind: 'S_CURVE', edge: 'TOP', r1: 150, r2: 150, sweepDeg1: 20, sweepDeg2: 20 };
    case 'ROUNDED_CORNER': return { kind: 'ROUNDED_CORNER', corners: { TL: 50, TR: 50, BL: 50, BR: 50 } };
  }
}

// ============================================
// SUB-COMPONENTS — number input
// ============================================

interface NumInputProps {
  label: string;
  unit?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}
function NumInput({ label, unit = 'mm', value, min = 0, max = 9999, step = 1, onChange }: NumInputProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-gray-400 flex-1">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
          className="w-20 bg-surface-2 border border-[#333] rounded px-1.5 py-0.5 text-[11px] text-white font-mono text-right focus:outline-none focus:border-purple-500/60"
        />
        <span className="text-[9px] text-gray-500 w-5">{unit}</span>
      </div>
    </div>
  );
}

// ============================================
// SUB-COMPONENTS — edge selector
// ============================================

interface EdgeSelectorProps {
  value: PanelEdge;
  onChange: (e: PanelEdge) => void;
}
function EdgeSelector({ value, onChange }: EdgeSelectorProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-gray-400">ขอบโค้ง</span>
      <div className="flex gap-0.5">
        {EDGE_OPTIONS.map((e) => (
          <button
            key={e.value}
            onClick={() => onChange(e.value)}
            className={`px-2 py-0.5 rounded text-[9px] font-medium border transition-colors ${
              value === e.value
                ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                : 'bg-surface-2 border-[#333] text-gray-400 hover:border-gray-500'
            }`}
          >
            {e.labelTH}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================
// PREVIEW CARD
// ============================================

interface PreviewCardProps {
  kerfCount: number;
  developedLength: number;
  projectedDepth: number;
  errors: string[];
  valid: boolean;
}
function PreviewCard({ kerfCount, developedLength, projectedDepth, errors, valid }: PreviewCardProps) {
  return (
    <div className={`rounded-lg border p-2 space-y-1.5 ${valid ? 'border-purple-500/20 bg-purple-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-medium text-gray-300">Live Preview</span>
        {valid
          ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">✓ Valid</span>
          : <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">✗ G12 Error</span>
        }
      </div>

      {/* Metric rows */}
      <div className="grid grid-cols-3 gap-1">
        <div className="text-center">
          <div className="text-[14px] font-bold font-mono text-purple-300">{kerfCount}</div>
          <div className="text-[8px] text-gray-500">รอยตัด</div>
        </div>
        <div className="text-center">
          <div className="text-[11px] font-bold font-mono text-cyan-300">{developedLength.toFixed(1)}</div>
          <div className="text-[8px] text-gray-500">dev.length mm</div>
        </div>
        <div className="text-center">
          <div className="text-[11px] font-bold font-mono text-amber-300">{projectedDepth.toFixed(1)}</div>
          <div className="text-[8px] text-gray-500">proj.depth mm</div>
        </div>
      </div>

      {/* G12 error badges */}
      {errors.length > 0 && (
        <div className="flex flex-col gap-0.5 mt-1">
          {errors.map((code) => {
            const info = G12_LABELS[code] ?? { label: code, color: 'text-red-400 border-red-500/30 bg-red-500/10' };
            return (
              <div key={code} className={`text-[9px] px-1.5 py-0.5 rounded border ${info.color}`}>
                {info.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================
// SUB-COMPONENT — SVG arc preview
// ============================================

const ARC_SVG_W = 120;
const ARC_SVG_H = 80;
const ARC_MARGIN = 6;

interface ArcPreviewSvgProps {
  arcSegments: ArcSegment[];
  panelW: number;
  panelH: number;
}
function ArcPreviewSvg({ arcSegments, panelW, panelH }: ArcPreviewSvgProps) {
  const scale = Math.min(
    (ARC_SVG_W - 2 * ARC_MARGIN) / Math.max(panelW, 1),
    (ARC_SVG_H - 2 * ARC_MARGIN) / Math.max(panelH, 1),
  );

  const pw = panelW * scale;
  const ph = panelH * scale;

  // Panel world → SVG pixel (Y-flip: world Y-up, SVG Y-down)
  const sx = (wx: number) => ARC_MARGIN + wx * scale;
  const sy = (wy: number) => ARC_MARGIN + (panelH - wy) * scale;

  return (
    <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-1.5">
      <span className="text-[9px] text-teal-400 block mb-1">Arc Preview</span>
      <svg
        width={ARC_SVG_W}
        height={ARC_SVG_H}
        viewBox={`0 0 ${ARC_SVG_W} ${ARC_SVG_H}`}
        className="w-full"
        data-testid="arc-preview-svg"
      >
        {/* Panel outline */}
        <rect
          x={ARC_MARGIN} y={ARC_MARGIN}
          width={pw} height={ph}
          fill="none"
          stroke="#334155"
          strokeWidth="0.5"
          strokeDasharray="2 2"
        />
        {/* Arc segments */}
        {arcSegments.map((seg, i) => {
          const { cx, cy, radius, startAngle, sweepAngle } = seg;
          const r = radius * scale;
          const endAngle = startAngle + sweepAngle;

          const x1 = sx(cx + radius * Math.cos(startAngle));
          const y1 = sy(cy + radius * Math.sin(startAngle));
          const x2 = sx(cx + radius * Math.cos(endAngle));
          const y2 = sy(cy + radius * Math.sin(endAngle));

          // After Y-flip: positive sweep (CCW in math) becomes CW in SVG → sweepFlag=1
          const sweepFlag  = sweepAngle > 0 ? 1 : 0;
          const largeArcFlag = Math.abs(sweepAngle) > Math.PI ? 1 : 0;

          return (
            <path
              key={i}
              d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArcFlag} ${sweepFlag} ${x2.toFixed(2)} ${y2.toFixed(2)}`}
              fill="none"
              stroke="#0d9488"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function CurvedPanelProfileEditor() {
  const cabinet      = useCabinet();
  const selectedPanelId    = useCabinetStore((s) => s.selectedPanelId);
  const updatePanelProfile = useCabinetStore((s) => s.updatePanelProfile);

  // Resolve selected panel
  const panel = useMemo(
    () => cabinet?.panels.find((p) => p.id === selectedPanelId) ?? null,
    [cabinet, selectedPanelId],
  );

  // Current profile (or RECT default)
  const profile: PanelProfile = panel?.profile ?? { kind: 'RECT' };

  // ── Commit helpers ─────────────────────────────────────────────

  const commitProfile = useCallback(
    (next: PanelProfile) => {
      if (!panel) return;
      updatePanelProfile(panel.id, next);
    },
    [panel, updatePanelProfile],
  );

  // Change kind → reset to sensible defaults
  const handleKindChange = useCallback(
    (kind: PanelProfile['kind']) => commitProfile(defaultForKind(kind)),
    [commitProfile],
  );

  // Patch a partial update into the current profile
  const patch = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fields: Record<string, any>) => commitProfile({ ...profile, ...fields } as PanelProfile),
    [profile, commitProfile],
  );

  // ── Live preview (useMemo = no extra render) ───────────────────
  const preview = useMemo(() => {
    if (!panel || profile.kind === 'RECT') {
      return { valid: true, errors: [], kerfCount: 0, developedLength: 0, projectedDepth: 0, arcSegments: [] as ArcSegment[] };
    }

    const curveResult = computeCurveProfile(profile, panel.finishWidth, panel.finishHeight);
    if (!curveResult.valid) {
      return {
        valid: false,
        errors: curveResult.errors,
        kerfCount: 0,
        developedLength: 0,
        projectedDepth: 0,
        arcSegments: [] as ArcSegment[],
      };
    }

    const material = resolveMaterial(panel.coreMaterialId);
    const mockPanel = { ...panel, profile };
    const fields = computeCurveFields(mockPanel, DEFAULT_KERF_TOOL, material);

    return {
      valid: true,
      errors: curveResult.errors,   // may contain warnings (G12_SCURVE_TRANSITION_SHORT)
      kerfCount:       fields?.kerfCount       ?? 0,
      developedLength: fields?.developedLength ?? 0,
      projectedDepth:  fields?.projectedDepth  ?? 0,
      arcSegments:     curveResult.arcSegments ?? [],
    };
  }, [panel, profile]);

  // ── No panel selected guard ────────────────────────────────────
  if (!selectedPanelId || !panel) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-2">
        <span className="text-2xl">↖</span>
        <p className="text-[11px] text-gray-400">
          เลือก panel ใน Catalog tab<br />เพื่อแก้ไข curved profile
        </p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="p-2 space-y-2">
      {/* Panel header */}
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="text-[10px] font-medium text-white truncate">{panel.name || panel.role}</span>
        <span className="text-[8px] px-1 py-0.5 rounded bg-surface-2 border border-[#333] text-gray-400 shrink-0">
          {panel.finishWidth}×{panel.finishHeight} mm
        </span>
      </div>

      {/* Kind selector */}
      <div className="space-y-1">
        <span className="text-[9px] text-gray-500 uppercase tracking-widest">Profile Kind</span>
        <div className="grid grid-cols-2 gap-1">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleKindChange(opt.value)}
              className={`py-1.5 px-2 rounded-lg border text-left transition-colors ${
                profile.kind === opt.value
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                  : 'bg-surface-2 border-[#333] text-gray-400 hover:border-gray-500'
              }`}
            >
              <span className="text-sm mr-1">{opt.icon}</span>
              <span className="text-[10px] font-medium">{opt.labelTH}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── ARC fields ── */}
      {profile.kind === 'ARC' && (
        <div className="space-y-1.5 border-t border-[#333] pt-2">
          <span className="text-[9px] text-gray-500 uppercase tracking-widest">Arc Parameters</span>
          <EdgeSelector value={profile.edge} onChange={(e) => patch({ edge: e })} />
          <NumInput label="รัศมี (Radius)"    value={profile.radius}   min={1} onChange={(v) => patch({ radius:   v })} />
          <NumInput label="มุมงอ (Sweep °)"   value={profile.sweepDeg} min={1} max={180} unit="°" onChange={(v) => patch({ sweepDeg: v })} />
        </div>
      )}

      {/* ── S_CURVE fields ── */}
      {profile.kind === 'S_CURVE' && (
        <div className="space-y-1.5 border-t border-[#333] pt-2">
          <span className="text-[9px] text-gray-500 uppercase tracking-widest">S-Curve Parameters</span>
          <EdgeSelector value={profile.edge} onChange={(e) => patch({ edge: e })} />
          <div className="pl-1 space-y-1 border-l-2 border-purple-500/20">
            <span className="text-[9px] text-purple-400">Arc 1</span>
            <NumInput label="r1 รัศมี"      value={profile.r1}       min={1} onChange={(v) => patch({ r1:       v })} />
            <NumInput label="sweep1 มุมงอ"  value={profile.sweepDeg1} min={1} max={180} unit="°" onChange={(v) => patch({ sweepDeg1: v })} />
          </div>
          <div className="pl-1 space-y-1 border-l-2 border-cyan-500/20">
            <span className="text-[9px] text-cyan-400">Arc 2</span>
            <NumInput label="r2 รัศมี"      value={profile.r2}       min={1} onChange={(v) => patch({ r2:       v })} />
            <NumInput label="sweep2 มุมงอ"  value={profile.sweepDeg2} min={1} max={180} unit="°" onChange={(v) => patch({ sweepDeg2: v })} />
          </div>
        </div>
      )}

      {/* ── ROUNDED_CORNER fields ── */}
      {profile.kind === 'ROUNDED_CORNER' && (
        <div className="space-y-1.5 border-t border-[#333] pt-2">
          <span className="text-[9px] text-gray-500 uppercase tracking-widest">Corner Radii</span>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {(['TL', 'TR', 'BL', 'BR'] as const).map((c) => (
              <NumInput
                key={c}
                label={c}
                value={profile.corners[c] ?? 0}
                min={0}
                onChange={(v) =>
                  commitProfile({
                    kind: 'ROUNDED_CORNER',
                    corners: { ...profile.corners, [c]: v === 0 ? undefined : v },
                  })
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* ── RECT placeholder ── */}
      {profile.kind === 'RECT' && (
        <div className="border-t border-[#333] pt-2">
          <p className="text-[10px] text-gray-500 text-center py-2">
            แผ่นแบน — ไม่มีพารามิเตอร์โค้ง
          </p>
        </div>
      )}

      {/* ── Live preview ── */}
      {profile.kind !== 'RECT' && (
        <PreviewCard
          kerfCount={preview.kerfCount}
          developedLength={preview.developedLength}
          projectedDepth={preview.projectedDepth}
          errors={preview.errors}
          valid={preview.valid}
        />
      )}

      {/* ── SVG arc preview ── */}
      {preview.arcSegments.length > 0 && (
        <ArcPreviewSvg
          arcSegments={preview.arcSegments}
          panelW={panel.finishWidth}
          panelH={panel.finishHeight}
        />
      )}

      {/* ── Reset button ── */}
      {profile.kind !== 'RECT' && (
        <button
          onClick={() => commitProfile({ kind: 'RECT' })}
          className="w-full py-1 rounded border border-[#333] text-[10px] text-gray-500 hover:border-gray-600 hover:text-gray-400 transition-colors"
        >
          รีเซ็ตเป็นแผ่นแบน (RECT)
        </button>
      )}
    </div>
  );
}
