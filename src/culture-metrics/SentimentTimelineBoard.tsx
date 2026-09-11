/**
 * src/culture-metrics/SentimentTimelineBoard.tsx
 *
 * MONOLITH v18.5 Sprint 13 — Employee Sentiment Timeline (EST) UI
 *
 * Props:
 *   orgId   — tenant identifier
 *   plan    — OrgPlan (PROFESSIONAL+ required; others see plan-gate-wall)
 *   isAdmin — shows config / admin controls when true
 *
 * Test-ids (full list):
 *   est-plan-gate-wall, est-loading, est-board, est-error-banner,
 *   est-clear-error-btn, est-summary-section,
 *   est-dimension-card, est-dimension-card-{DIM},
 *   est-dim-score-{DIM}, est-health-badge-{DIM},
 *   est-timeline-section, est-period-row, est-no-data,
 *   est-submit-form, est-score-input, est-dimension-select, est-submit-btn
 */

import React, { useEffect, useState } from 'react';
import type { OrgPlan } from '../tenant/types';
import { useEstStore } from './employeeSentimentStore';
import {
  canAccessEstModule,
  EST_DIMENSION_LABEL,
  EST_DIMENSION_ICON,
  EST_PERIOD_LABEL,
  EST_HEALTH_STATUS_LABEL,
  EST_HEALTH_STATUS_COLOR,
  EST_DIMENSIONS,
  EST_PERIOD_TYPES,
  type EstDimension,
  type EstPeriodType,
  type EstHealthStatus,
} from './employeeSentimentTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface SentimentTimelineBoardProps {
  orgId:   string;
  plan:    OrgPlan;
  isAdmin: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function SentimentTimelineBoard({
  orgId,
  plan,
  isAdmin,
}: SentimentTimelineBoardProps) {
  const {
    summaries,
    configs,
    filters,
    loading,
    error,
    fetchSummary,
    fetchTimelineConfigs,
    submitSentimentEntry,
    setFilters,
    clearError,
  } = useEstStore();

  // ── Anonymous submit form local state ──────────────────────────────────────
  const [submitScore,   setSubmitScore]   = useState<number>(5);
  const [submitDim,     setSubmitDim]     = useState<EstDimension>('MORALE');
  const [submitPeriod,  setSubmitPeriod]  = useState<EstPeriodType>('WEEKLY');
  const [submitLabel,   setSubmitLabel]   = useState<string>('');
  const [submitNote,    setSubmitNote]    = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);

  // ── Initial data load ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchSummary(orgId, plan);
    fetchTimelineConfigs(orgId, plan);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, plan]);

  // ─────────────────────────────────────────────────────────────────────────
  // Plan gate wall
  // ─────────────────────────────────────────────────────────────────────────
  if (!canAccessEstModule(plan)) {
    return (
      <div
        data-testid="est-plan-gate-wall"
        className="flex flex-col items-center justify-center p-12 text-center text-gray-500"
      >
        <p className="text-lg font-semibold text-gray-700">Employee Sentiment Timeline</p>
        <p className="mt-2 text-sm">ฟีเจอร์นี้ต้องการแพลน PROFESSIONAL หรือสูงกว่า</p>
        <p className="mt-1 text-xs text-gray-400">
          อัปเกรดแพลนเพื่อติดตามความรู้สึกพนักงานแบบ real-time
        </p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Loading skeleton
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div data-testid="est-loading" className="animate-pulse space-y-4 p-6">
        <div className="h-6 w-48 rounded bg-gray-100" />
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-gray-100" />
          ))}
        </div>
        <div className="h-4 w-32 rounded bg-gray-100" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-gray-100" />
        ))}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Derived data
  // ─────────────────────────────────────────────────────────────────────────
  const activeConfigs = configs.filter(c => c.isActive);
  const activeDims    = activeConfigs.map(c => c.dimension);

  /** Most-recent summary per dimension (view already orders by period_label desc) */
  const latestByDim = new Map(
    activeDims.map(dim => [dim, summaries.find(s => s.dimension === dim)])
  );

  /** Summaries filtered by current filter selections */
  const filteredSummaries = summaries.filter(s => {
    if (filters.dimension  && s.dimension  !== filters.dimension)  return false;
    if (filters.periodType && s.periodType !== filters.periodType) return false;
    return true;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Submit handler
  // ─────────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitSentimentEntry({
      orgId,
      dimension:   submitDim,
      score:       submitScore,
      periodType:  submitPeriod,
      periodLabel: submitLabel.trim() || new Date().toISOString().slice(0, 10),
      note:        submitNote.trim() || undefined,
    });
    setSubmitLabel('');
    setSubmitNote('');
    setSubmitSuccess(true);
    setTimeout(() => setSubmitSuccess(false), 3000);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div data-testid="est-board" className="space-y-6 p-4">

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div
          data-testid="est-error-banner"
          className="flex items-center justify-between rounded-md bg-red-50 px-4 py-2.5 text-red-700"
        >
          <span className="text-sm">{error}</span>
          <button
            data-testid="est-clear-error-btn"
            onClick={clearError}
            className="ml-4 text-sm underline hover:no-underline"
            type="button"
          >
            ปิด
          </button>
        </div>
      )}

      {/* ── Summary section ────────────────────────────────────────────────── */}
      <section data-testid="est-summary-section">
        <h2 className="mb-3 text-base font-semibold text-gray-700">ภาพรวมความรู้สึกพนักงาน</h2>

        {activeDims.length === 0 ? (
          <p className="text-sm text-gray-400">ยังไม่มีมิติที่เปิดใช้งาน</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {activeDims.map(dim => {
              const summary = latestByDim.get(dim);
              const status  = summary?.healthStatus as EstHealthStatus | null | undefined;
              return (
                <div
                  key={dim}
                  data-testid="est-dimension-card"
                  className="rounded-lg border bg-white p-4 text-center shadow-sm"
                >
                  {/* Invisible anchor for per-dimension testid queries */}
                  <span data-testid={`est-dimension-card-${dim}`} className="sr-only" />

                  <div className="text-2xl">{EST_DIMENSION_ICON[dim]}</div>
                  <div className="mt-1 text-xs font-medium text-gray-600">
                    {EST_DIMENSION_LABEL[dim]}
                  </div>

                  <div
                    data-testid={`est-dim-score-${dim}`}
                    className="mt-1 text-xl font-bold text-gray-800"
                  >
                    {summary ? summary.avgScore.toFixed(1) : '—'}
                  </div>

                  {status ? (
                    <span
                      data-testid={`est-health-badge-${dim}`}
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${EST_HEALTH_STATUS_COLOR[status]}`}
                    >
                      {EST_HEALTH_STATUS_LABEL[status]}
                    </span>
                  ) : (
                    <span
                      data-testid={`est-health-badge-${dim}`}
                      className="mt-1 text-xs text-gray-400"
                    >
                      ข้อมูลไม่เพียงพอ
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Timeline section ───────────────────────────────────────────────── */}
      <section data-testid="est-timeline-section">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-gray-700">ประวัติย้อนหลัง</h2>

          {/* Period type filter */}
          <select
            aria-label="กรองตามช่วงเวลา"
            value={filters.periodType ?? ''}
            onChange={e =>
              setFilters({
                ...filters,
                periodType: (e.target.value as EstPeriodType) || undefined,
              })
            }
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">ทุกช่วง</option>
            {EST_PERIOD_TYPES.map(pt => (
              <option key={pt} value={pt}>{EST_PERIOD_LABEL[pt]}</option>
            ))}
          </select>

          {/* Dimension filter */}
          <select
            aria-label="กรองตามมิติ"
            value={filters.dimension ?? ''}
            onChange={e =>
              setFilters({
                ...filters,
                dimension: (e.target.value as EstDimension) || undefined,
              })
            }
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">ทุกมิติ</option>
            {EST_DIMENSIONS.map(d => (
              <option key={d} value={d}>{EST_DIMENSION_LABEL[d]}</option>
            ))}
          </select>
        </div>

        {filteredSummaries.length === 0 ? (
          <p data-testid="est-no-data" className="text-sm text-gray-400">
            ยังไม่มีข้อมูล
          </p>
        ) : (
          <div className="space-y-2">
            {filteredSummaries.map((s, i) => (
              <div
                key={`${s.dimension}-${s.periodLabel}-${i}`}
                data-testid="est-period-row"
                className="flex flex-wrap items-center justify-between rounded-md border bg-white px-4 py-2 text-sm"
              >
                <span className="font-medium text-gray-700">{EST_DIMENSION_LABEL[s.dimension]}</span>
                <span className="text-gray-500">{s.periodLabel}</span>
                <span className="font-semibold text-gray-800">{s.avgScore.toFixed(1)}</span>
                <span className="text-xs text-gray-400">{s.responseCount} ตอบ</span>
                {s.healthStatus && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${EST_HEALTH_STATUS_COLOR[s.healthStatus]}`}
                  >
                    {EST_HEALTH_STATUS_LABEL[s.healthStatus]}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Anonymous submit form ──────────────────────────────────────────── */}
      <section>
        {submitSuccess && (
          <div className="mb-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            บันทึกความรู้สึกเรียบร้อยแล้ว ขอบคุณสำหรับข้อมูล!
          </div>
        )}

        <form
          data-testid="est-submit-form"
          onSubmit={handleSubmit}
          className="space-y-3 rounded-lg border bg-white p-4"
        >
          <h3 className="text-sm font-semibold text-gray-700">
            บันทึกความรู้สึกวันนี้ <span className="font-normal text-gray-400">(ไม่ระบุตัวตน)</span>
          </h3>

          <div className="flex flex-wrap gap-3">
            {/* Dimension select */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">มิติ</label>
              <select
                data-testid="est-dimension-select"
                value={submitDim}
                onChange={e => setSubmitDim(e.target.value as EstDimension)}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              >
                {EST_DIMENSIONS.map(d => (
                  <option key={d} value={d}>{EST_DIMENSION_LABEL[d]}</option>
                ))}
              </select>
            </div>

            {/* Score input */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">คะแนน (1–10)</label>
              <input
                data-testid="est-score-input"
                type="number"
                min={1}
                max={10}
                value={submitScore}
                onChange={e => setSubmitScore(Number(e.target.value))}
                className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>

            {/* Period type */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">ช่วงเวลา</label>
              <select
                value={submitPeriod}
                onChange={e => setSubmitPeriod(e.target.value as EstPeriodType)}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              >
                {EST_PERIOD_TYPES.map(pt => (
                  <option key={pt} value={pt}>{EST_PERIOD_LABEL[pt]}</option>
                ))}
              </select>
            </div>

            {/* Period label */}
            <div className="flex flex-1 flex-col gap-1" style={{ minWidth: '120px' }}>
              <label className="text-xs text-gray-500">label (เช่น 2027-W12)</label>
              <input
                type="text"
                value={submitLabel}
                onChange={e => setSubmitLabel(e.target.value)}
                placeholder="2027-W12"
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
          </div>

          {/* Optional note */}
          <div>
            <label className="text-xs text-gray-500">หมายเหตุ (ไม่บังคับ)</label>
            <input
              type="text"
              value={submitNote}
              onChange={e => setSubmitNote(e.target.value)}
              placeholder="ความคิดเห็นเพิ่มเติม..."
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>

          <button
            data-testid="est-submit-btn"
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            ส่งความรู้สึก
          </button>
        </form>
      </section>

      {/* ── Admin config panel ─────────────────────────────────────────────── */}
      {isAdmin && (
        <section className="rounded-lg border border-dashed border-gray-300 p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-600">การตั้งค่ามิติ (Admin)</h3>
          <p className="text-xs text-gray-400">
            ตั้งค่า is_active / is_inverted / period_type ผ่าน upsertTimelineConfig
          </p>
        </section>
      )}
    </div>
  );
}
