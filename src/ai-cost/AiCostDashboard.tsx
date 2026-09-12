/**
 * src/ai-cost/AiCostDashboard.tsx
 *
 * MONOLITH v17.5 — AI Cost Estimation: Dashboard Component
 *
 * Displays an org-level AI cost analytics dashboard for ENTERPRISE plans.
 *
 * Sections:
 *  1. Summary Cards — total spend this month (THB), total time saved (hrs),
 *     total requests, active cost models count
 *  2. Budget Utilization — most recent budget period + utilization progress bar
 *  3. Monthly Cost Trend — CSS bar chart from usageSummary grouped by month
 *  4. Usage by Tool Table — per-model breakdown of cost + requests
 *
 * Plan Gate: ENTERPRISE (canAccessAiCostEstimation)
 *
 * data-testids:
 *   ace-dashboard, plan-gate-wall, dashboard-loading,
 *   summary-cards, total-cost-card, time-saved-card, total-requests-card, models-count-card,
 *   budget-section, budget-period-item, budget-utilization-bar, budget-over-threshold,
 *   no-budget-data,
 *   monthly-trend, trend-bar, trend-bar-label, no-trend-data,
 *   usage-table, usage-table-row, no-usage-data
 */

import React, { useEffect, useMemo } from 'react';
import { useAiCostEstimationStore } from './aiCostEstimationStore';
import {
  canAccessAiCostEstimation,
  AI_TOOL_LABEL_TH,
  COST_UNIT_LABEL_TH,
} from './aiCostEstimationTypes';
import type { OrgPlan } from '../tenant/types';
import type { AiUsageSummary, AiBudgetPeriod } from './aiCostEstimationTypes';

// ============================================================================
// TYPES
// ============================================================================

export interface AiCostDashboardProps {
  orgId: string;
  orgPlan: OrgPlan;
  isAdmin?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatThb(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatHours(minutes: number): string {
  const hours = Math.round(minutes / 60);
  return `${hours.toLocaleString('th-TH')} ชม.`;
}

/** Aggregate usageSummary rows into per-month totals */
function aggregateByMonth(rows: AiUsageSummary[]): Array<{
  month: string;
  totalCostThb: number;
  totalRequests: number;
}> {
  const map = new Map<string, { totalCostThb: number; totalRequests: number }>();
  for (const row of rows) {
    const existing = map.get(row.usageMonth) ?? { totalCostThb: 0, totalRequests: 0 };
    map.set(row.usageMonth, {
      totalCostThb: existing.totalCostThb + row.totalCostThb,
      totalRequests: existing.totalRequests + row.requestCount,
    });
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => ({ month, ...vals }));
}

/** Compute utilization percentage from actual spend vs budget */
function computeUtilization(
  usageSummary: AiUsageSummary[],
  period: AiBudgetPeriod,
): number {
  const totalSpend = usageSummary
    .filter((s) => s.usageMonth >= period.startDate.slice(0, 7))
    .reduce((sum, s) => sum + s.totalCostThb, 0);
  if (period.budgetThb <= 0) return 0;
  return Math.min((totalSpend / period.budgetThb) * 100, 100);
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface SummaryCardProps {
  label: string;
  value: string;
  subLabel?: string;
  accent?: 'indigo' | 'emerald' | 'amber' | 'sky';
  testId: string;
}

function SummaryCard({ label, value, subLabel, accent = 'indigo', testId }: SummaryCardProps) {
  const accentMap = {
    indigo: 'bg-indigo-50 border-indigo-100 text-indigo-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    sky: 'bg-sky-50 border-sky-100 text-sky-700',
  };
  return (
    <div
      className={`rounded-xl border p-4 ${accentMap[accent]}`}
      data-testid={testId}
    >
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold leading-none">{value}</p>
      {subLabel && <p className="text-xs mt-1.5 opacity-60">{subLabel}</p>}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AiCostDashboard({ orgId, orgPlan, isAdmin = false }: AiCostDashboardProps) {
  const {
    costModels,
    usageSummary,
    budgetPeriods,
    isLoading,
    isUsageLoading,
    isBudgetLoading,
    error,
    clearError,
    fetchCostModels,
    fetchUsageSummary,
    fetchBudgetPeriods,
  } = useAiCostEstimationStore();

  // ── Fetch on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!canAccessAiCostEstimation(orgPlan)) return;
    fetchCostModels(orgId);
    fetchUsageSummary(orgId);
    fetchBudgetPeriods(orgId);
  }, [orgId, orgPlan, fetchCostModels, fetchUsageSummary, fetchBudgetPeriods]);

  // ── Plan gate ───────────────────────────────────────────────────────────
  if (!canAccessAiCostEstimation(orgPlan)) {
    return (
      <div
        className="flex flex-col items-center justify-center py-20 text-center"
        data-testid="plan-gate-wall"
      >
        <span className="text-5xl mb-5">🔒</span>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          AI Cost Estimation ต้องการแผน ENTERPRISE
        </h3>
        <p className="text-sm text-gray-500 max-w-sm">
          ติดตามต้นทุน AI ของทีม วิเคราะห์ ROI และควบคุมงบประมาณด้วย AI Cost Estimation
        </p>
        {isAdmin && (
          <p className="text-xs text-indigo-500 mt-3 font-medium">
            ติดต่อทีมขายเพื่ออัปเกรดไปยังแผน ENTERPRISE
          </p>
        )}
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  const isAnyLoading = isLoading || isUsageLoading || isBudgetLoading;
  if (isAnyLoading && usageSummary.length === 0 && budgetPeriods.length === 0) {
    return (
      <div
        className="space-y-4 animate-pulse"
        data-testid="dashboard-loading"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl" />
          ))}
        </div>
        <div className="h-32 bg-gray-100 rounded-xl" />
        <div className="h-48 bg-gray-100 rounded-xl" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  // ── Derived data ─────────────────────────────────────────────────────────
  const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2027-01"
  const thisMonthRows = usageSummary.filter((s) => s.usageMonth === currentMonth);

  const totalCostThisMonthThb = thisMonthRows.reduce((s, r) => s + r.totalCostThb, 0);
  const totalTimeSavedMin = thisMonthRows.reduce((s, r) => s + r.totalTimeSavedMin, 0);
  const totalRequestsThisMonth = thisMonthRows.reduce((s, r) => s + r.requestCount, 0);
  const activeModelsCount = costModels.length;

  const monthlyTrend = useMemo(() => aggregateByMonth(usageSummary), [usageSummary]);
  const maxTrendCost = Math.max(...monthlyTrend.map((m) => m.totalCostThb), 1);

  // Most recent budget period
  const latestBudget = budgetPeriods[0] ?? null;

  return (
    <div
      className="space-y-6"
      data-testid="ace-dashboard"
    >
      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <span data-testid="error-banner">{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="text-red-400 hover:text-red-600 ml-4"
            aria-label="ปิด error"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Summary Cards ────────────────────────────────────────────────── */}
      <section data-testid="summary-cards">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          ภาพรวมเดือนนี้{' '}
          <span className="font-normal text-gray-400 text-xs">({currentMonth})</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            testId="total-cost-card"
            label="ต้นทุน AI รวม (THB)"
            value={`฿${formatThb(totalCostThisMonthThb)}`}
            subLabel="เดือนปัจจุบัน"
            accent="indigo"
          />
          <SummaryCard
            testId="time-saved-card"
            label="เวลาที่ประหยัดได้"
            value={formatHours(totalTimeSavedMin)}
            subLabel="คำนวณจาก Usage Logs"
            accent="emerald"
          />
          <SummaryCard
            testId="total-requests-card"
            label="จำนวน Requests"
            value={totalRequestsThisMonth.toLocaleString('th-TH')}
            subLabel="เดือนปัจจุบัน"
            accent="sky"
          />
          <SummaryCard
            testId="models-count-card"
            label="Cost Models ที่ใช้งาน"
            value={`${activeModelsCount}`}
            subLabel="โมเดลที่เปิดใช้งาน"
            accent="amber"
          />
        </div>
      </section>

      {/* ── Budget Utilization ───────────────────────────────────────────── */}
      <section
        className="bg-white rounded-xl border border-gray-200 p-5"
        data-testid="budget-section"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">งบประมาณ AI</h2>
          {isAdmin && (
            <span className="text-xs text-indigo-500 font-medium">จัดการงบประมาณ →</span>
          )}
        </div>

        {latestBudget == null ? (
          <p
            className="text-sm text-gray-400 text-center py-4"
            data-testid="no-budget-data"
          >
            ยังไม่ได้ตั้งงบประมาณ — {isAdmin ? 'สร้างงบประมาณแรกได้เลย' : 'ติดต่อผู้ดูแลระบบ'}
          </p>
        ) : (
          <div data-testid="budget-period-item">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium text-gray-800">{latestBudget.periodLabel}</span>
              <span className="text-gray-500 text-xs">
                ฿{formatThb(latestBudget.budgetThb)} ต่อ{latestBudget.periodType === 'MONTHLY' ? 'เดือน' : 'งวด'}
              </span>
            </div>
            {(() => {
              const utilPct = computeUtilization(usageSummary, latestBudget);
              const isOverThreshold = utilPct >= latestBudget.alertThreshold * 100;
              const barColor = isOverThreshold
                ? 'bg-red-500'
                : utilPct >= 60
                ? 'bg-amber-400'
                : 'bg-indigo-500';

              return (
                <>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${barColor} rounded-full transition-all duration-500`}
                      style={{ width: `${utilPct}%` }}
                      role="progressbar"
                      aria-valuenow={Math.round(utilPct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      data-testid="budget-utilization-bar"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span className="text-gray-500">{Math.round(utilPct)}% ใช้ไปแล้ว</span>
                    {isOverThreshold && (
                      <span
                        className="text-red-600 font-semibold"
                        data-testid="budget-over-threshold"
                      >
                        ⚠ เกิน {Math.round(latestBudget.alertThreshold * 100)}% — แจ้งเตือน
                      </span>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </section>

      {/* ── Monthly Cost Trend ───────────────────────────────────────────── */}
      <section
        className="bg-white rounded-xl border border-gray-200 p-5"
        data-testid="monthly-trend"
      >
        <h2 className="text-sm font-semibold text-gray-700 mb-4">แนวโน้มต้นทุน AI รายเดือน (THB)</h2>

        {monthlyTrend.length === 0 ? (
          <p
            className="text-sm text-gray-400 text-center py-8"
            data-testid="no-trend-data"
          >
            ยังไม่มีข้อมูลการใช้งาน
          </p>
        ) : (
          <div className="flex items-end gap-2 h-40">
            {monthlyTrend.map((item) => {
              const heightPct = (item.totalCostThb / maxTrendCost) * 100;
              return (
                <div
                  key={item.month}
                  className="flex-1 h-full min-h-0 flex flex-col items-center gap-1"
                >
                  <span className="text-xs text-gray-500 font-medium">
                    ฿{formatThb(item.totalCostThb)}
                  </span>
                  <div className="flex-1 min-h-0 w-full flex items-end">
                    <div
                      className="w-full bg-indigo-500 rounded-t-md transition-all duration-500 hover:bg-indigo-600"
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                      title={`${item.month}: ฿${formatThb(item.totalCostThb)}`}
                      data-testid="trend-bar"
                      data-month={item.month}
                    />
                  </div>
                  <span
                    className="text-xs text-gray-400 text-center truncate w-full"
                    data-testid="trend-bar-label"
                  >
                    {item.month.slice(5)} {/* Show MM only */}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Usage by Tool Table ──────────────────────────────────────────── */}
      <section
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
        data-testid="usage-table"
      >
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">การใช้งานแยกตามเครื่องมือ AI</h2>
        </div>

        {usageSummary.length === 0 ? (
          <p
            className="text-sm text-gray-400 text-center py-8"
            data-testid="no-usage-data"
          >
            ยังไม่มีข้อมูลการใช้งาน
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">เครื่องมือ</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">โมเดล</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">เดือน</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Requests</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">ต้นทุน (THB)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">เวลาที่ประหยัด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {usageSummary.map((row, idx) => (
                  <tr
                    key={`${row.tool}-${row.modelName}-${row.usageMonth}-${idx}`}
                    className="hover:bg-gray-50 transition-colors"
                    data-testid="usage-table-row"
                    data-tool={row.tool}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {AI_TOOL_LABEL_TH[row.tool]}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.modelName}</td>
                    <td className="px-4 py-3 text-gray-500">{row.usageMonth}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {row.requestCount.toLocaleString('th-TH')}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-indigo-700">
                      ฿{formatThb(row.totalCostThb)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600">
                      {formatHours(row.totalTimeSavedMin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default AiCostDashboard;
