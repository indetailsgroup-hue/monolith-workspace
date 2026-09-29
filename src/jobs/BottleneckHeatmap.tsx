/**
 * src/jobs/BottleneckHeatmap.tsx
 *
 * MONOLITH v17.0 — Bottleneck Heatmap UI (PROFESSIONAL+)
 *
 * Renders a heatmap table of stage bottleneck analytics:
 *  - Average actual vs. expected duration per stage
 *  - pct_of_expected with severity color (OK / WARNING / CRITICAL)
 *  - Bottleneck rate percentage
 *  - Worst-stage highlight
 *
 * Plan Gate: PROFESSIONAL+ only.
 * Non-PROFESSIONAL orgs see an upgrade prompt.
 *
 * Data: useProcessTemplateStore.bottleneckData (from bottleneck_heatmap_v view)
 */

import React, { useEffect } from 'react';
import { useProcessTemplateStore } from './processTemplateStore';
import { PlanGateError } from './processTemplateStore';
import {
  meetsplanGate,
  getBottleneckSeverity,
  BOTTLENECK_SEVERITY_COLORS,
  BOTTLENECK_SEVERITY_LABELS,
  type BottleneckHeatmapRow,
} from './processTemplateTypes';
import type { OrgPlan } from '../tenant/types';

// ============================================================================
// TYPES
// ============================================================================

export interface BottleneckHeatmapProps {
  orgId: string;
  orgPlan: OrgPlan;
  /** Optional: filter by a specific template's stages */
  templateId?: string;
  /** Template name for header display */
  templateName?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Format minutes to "Xh Ym" or "Xm" */
function fmtMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Severity indicator cell ───────────────────────────────────────────────────

interface SeverityCellProps {
  pctOfExpected: number;
}

function SeverityCell({ pctOfExpected }: SeverityCellProps) {
  const severity = getBottleneckSeverity(pctOfExpected);
  const color = BOTTLENECK_SEVERITY_COLORS[severity];
  const label = BOTTLENECK_SEVERITY_LABELS[severity];

  return (
    <div className="flex items-center gap-2" data-testid="severity-cell">
      {/* Color bar */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span
        className="text-sm font-medium"
        style={{ color }}
        data-testid="severity-label"
      >
        {pctOfExpected.toFixed(0)}%
      </span>
      <span
        className="text-xs text-gray-400"
        data-testid="severity-text"
      >
        {label}
      </span>
    </div>
  );
}

// ── Bottleneck bar (visual) ───────────────────────────────────────────────────

function BottleneckBar({ pctOfExpected }: { pctOfExpected: number }) {
  const severity = getBottleneckSeverity(pctOfExpected);
  const color = BOTTLENECK_SEVERITY_COLORS[severity];
  // Cap visual bar at 200% so extreme values don't break layout
  const widthPct = Math.min(pctOfExpected / 2, 100);

  return (
    <div className="w-full bg-gray-100 rounded-full h-2" data-testid="bottleneck-bar">
      <div
        className="h-2 rounded-full transition-all"
        style={{ width: `${widthPct}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────────

interface HeatmapRowProps {
  row: BottleneckHeatmapRow;
  isWorstStage: boolean;
}

function HeatmapRow({ row, isWorstStage }: HeatmapRowProps) {
  return (
    <tr
      className={`border-b border-gray-100 ${isWorstStage ? 'bg-red-50' : 'hover:bg-gray-50'}`}
      data-testid="heatmap-row"
      data-stage={row.stageName}
    >
      {/* Stage name */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          {isWorstStage && (
            <span className="text-red-500" title="Worst bottleneck" aria-label="worst stage">
              ⚠️
            </span>
          )}
          <span className="text-sm font-medium text-gray-900">{row.stageName}</span>
        </div>
        <BottleneckBar pctOfExpected={row.pctOfExpected} />
      </td>

      {/* Job count */}
      <td className="py-3 px-4 text-sm text-gray-600 text-right">
        {row.jobCount}
      </td>

      {/* Avg actual */}
      <td className="py-3 px-4 text-sm text-gray-600 text-right">
        {fmtMinutes(row.avgDurationMinutes)}
      </td>

      {/* Avg expected */}
      <td className="py-3 px-4 text-sm text-gray-400 text-right">
        {fmtMinutes(row.avgExpectedMinutes)}
      </td>

      {/* Severity / pct */}
      <td className="py-3 px-4">
        <SeverityCell pctOfExpected={row.pctOfExpected} />
      </td>

      {/* Bottleneck rate */}
      <td className="py-3 px-4 text-sm text-gray-600 text-right">
        {row.bottleneckRatePct.toFixed(0)}%
      </td>
    </tr>
  );
}

// ============================================================================
// SUMMARY BAR
// ============================================================================

interface SummaryBarProps {
  rows: BottleneckHeatmapRow[];
  worstStage: string | null;
}

function SummaryBar({ rows, worstStage }: SummaryBarProps) {
  const totalBottlenecks = rows.reduce((sum, r) => sum + r.bottleneckCount, 0);
  const totalJobs = rows.reduce((sum, r) => sum + r.jobCount, 0);
  const overallRate = totalJobs > 0 ? (totalBottlenecks / totalJobs) * 100 : 0;
  const overallSeverity = getBottleneckSeverity(overallRate + 100); // shift to pct-of-expected scale

  return (
    <div
      className="grid grid-cols-3 gap-4 bg-white border border-gray-200 rounded-lg p-4"
      data-testid="bottleneck-summary-bar"
    >
      <div>
        <p className="text-xs text-gray-400 mb-1">Bottleneck Rate รวม</p>
        <p
          className="text-2xl font-bold"
          style={{ color: BOTTLENECK_SEVERITY_COLORS[overallSeverity] }}
          data-testid="overall-bottleneck-rate"
        >
          {overallRate.toFixed(1)}%
        </p>
        <p className="text-xs text-gray-400">ของ {totalJobs} งาน</p>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-1">Stage ที่ช้าที่สุด</p>
        <p
          className="text-base font-semibold text-red-600 truncate"
          data-testid="worst-stage-display"
        >
          {worstStage ?? '—'}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-1">Bottleneck Events</p>
        <p className="text-2xl font-bold text-gray-800" data-testid="total-bottleneck-events">
          {totalBottlenecks}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BottleneckHeatmap({
  orgId,
  orgPlan,
  templateId,
  templateName,
}: BottleneckHeatmapProps) {
  const {
    bottleneckData,
    isBottleneckLoading,
    error,
    fetchBottleneckData,
    clearError,
  } = useProcessTemplateStore();

  // ── Plan gate guard ──────────────────────────────────────────────────────
  if (!meetsplanGate(orgPlan, 'PROFESSIONAL')) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-indigo-300 rounded-lg bg-indigo-50"
        data-testid="bottleneck-plan-gate-wall"
      >
        <span className="text-4xl mb-4">📊</span>
        <h3 className="text-lg font-semibold text-indigo-800 mb-2">
          Bottleneck Heatmap ต้องการแผน PROFESSIONAL+
        </h3>
        <p className="text-sm text-indigo-600 max-w-sm">
          อัปเกรดเพื่อดูวิเคราะห์ขั้นตอนที่ช้ากว่าแผน และลดเวลาสูญเสียในสายการผลิต
        </p>
        <ul className="mt-4 text-sm text-indigo-700 space-y-1 text-left">
          <li>✅ Heatmap แสดง % เวลาจริง vs. แผน</li>
          <li>✅ Bottleneck Rate ต่อ stage</li>
          <li>✅ Time-in-Stage analytics</li>
        </ul>
      </div>
    );
  }

  // ── Data fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetchBottleneckData(orgId, orgPlan, templateId).catch((err) => {
      if (!(err instanceof PlanGateError)) {
        console.error('BottleneckHeatmap fetch error:', err);
      }
    });
  }, [orgId, orgPlan, templateId, fetchBottleneckData]);

  // ── Derive worst stage ────────────────────────────────────────────────────
  const worstStage =
    bottleneckData.length > 0
      ? bottleneckData.reduce((a, b) =>
          b.pctOfExpected > a.pctOfExpected ? b : a
        ).stageName
      : null;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isBottleneckLoading) {
    return (
      <div
        className="space-y-3 animate-pulse"
        data-testid="bottleneck-loading"
      >
        <div className="h-24 bg-gray-100 rounded-lg" />
        <div className="h-48 bg-gray-100 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="bottleneck-heatmap">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Bottleneck Heatmap
          </h2>
          {templateName && (
            <p className="text-sm text-gray-500">Template: {templateName}</p>
          )}
        </div>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700"
        >
          PROFESSIONAL+
        </span>
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"
          data-testid="bottleneck-error-banner"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="text-red-500 hover:text-red-700 ml-4"
            aria-label="ปิด error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary bar */}
      {bottleneckData.length > 0 && (
        <SummaryBar rows={bottleneckData} worstStage={worstStage} />
      )}

      {/* Heatmap table */}
      {bottleneckData.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full" data-testid="bottleneck-table">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-2.5 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Stage
                </th>
                <th className="py-2.5 px-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  งาน
                </th>
                <th className="py-2.5 px-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  เฉลี่ยจริง
                </th>
                <th className="py-2.5 px-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  เฉลี่ยแผน
                </th>
                <th className="py-2.5 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  % เทียบแผน
                </th>
                <th className="py-2.5 px-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Bottleneck %
                </th>
              </tr>
            </thead>
            <tbody>
              {bottleneckData.map((row) => (
                <HeatmapRow
                  key={`${row.stageName}-${row.templateId ?? 'all'}`}
                  row={row}
                  isWorstStage={row.stageName === worstStage}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center py-16 text-center"
          data-testid="bottleneck-empty-state"
        >
          <span className="text-4xl mb-4">📈</span>
          <h3 className="text-base font-medium text-gray-700 mb-1">
            ยังไม่มีข้อมูล Bottleneck
          </h3>
          <p className="text-sm text-gray-400">
            ข้อมูลจะแสดงเมื่อมีการบันทึก Time-in-Stage สำหรับงานในระบบ
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        {(
          [
            { severity: 'OK', label: 'ปกติ (≤ 110%)' },
            { severity: 'WARNING', label: 'ช้ากว่าแผน (111–150%)' },
            { severity: 'CRITICAL', label: 'Bottleneck (> 150%)' },
          ] as const
        ).map(({ severity, label }) => (
          <div key={severity} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: BOTTLENECK_SEVERITY_COLORS[severity] }}
            />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default BottleneckHeatmap;
