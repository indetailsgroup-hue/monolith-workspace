'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Legend,
} from 'recharts';
import { useCultureStore, selectScoresForChart, selectIsAnyLoading, selectPendingFeedback, selectCurrentPeriodLabel } from './cultureStore';
import { useTenantStore } from '../tenant/tenantStore';
import { ORG_ROLE_HIERARCHY } from '../tenant/types';
import {
  AnonymousFeedback,
  FeedbackActionStatus,
  FeedbackCategory,
  PsDimension,
  getPsScoreLabel,
  formatPeriodLabel,
  THAI_MANUFACTURING_PS_BENCHMARK,
} from './types';

// ─────────────────────────────────────────────────────────────
// Constants & Label Maps
// ─────────────────────────────────────────────────────────────

const DIMENSION_LABELS: Record<PsDimension, string> = {
  SPEAK_UP: 'พูดความจริง',
  HELP_SEEKING: 'ขอความช่วยเหลือ',
  RISK_TAKING: 'กล้าลองสิ่งใหม่',
  INCLUSION: 'ความรู้สึกเป็นส่วนหนึ่ง',
};

const DIMENSION_COLORS: Record<PsDimension, string> = {
  SPEAK_UP: '#6366f1',
  HELP_SEEKING: '#22c55e',
  RISK_TAKING: '#f59e0b',
  INCLUSION: '#ec4899',
};

const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  SAFETY: 'ความปลอดภัย',
  PROCESS: 'กระบวนการ',
  MANAGEMENT: 'การจัดการ',
  ENVIRONMENT: 'สภาพแวดล้อม',
  OTHER: 'อื่นๆ',
};

const ACTION_STATUS_LABELS: Record<FeedbackActionStatus, string> = {
  PENDING: 'รอดำเนินการ',
  ACKNOWLEDGED: 'รับทราบแล้ว',
  IN_PROGRESS: 'กำลังดำเนินการ',
  RESOLVED: 'แก้ไขแล้ว',
  DISMISSED: 'ไม่ดำเนินการ',
};

const ACTION_STATUS_BADGE: Record<FeedbackActionStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  ACKNOWLEDGED: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-purple-100 text-purple-800',
  RESOLVED: 'bg-green-100 text-green-800',
  DISMISSED: 'bg-gray-100 text-gray-500',
};

const SCORE_BADGE_COLOR = (score: number): string => {
  if (score < 30) return 'bg-red-100 text-red-800';
  if (score < 45) return 'bg-orange-100 text-orange-800';
  if (score < 60) return 'bg-yellow-100 text-yellow-800';
  if (score < 75) return 'bg-blue-100 text-blue-800';
  return 'bg-green-100 text-green-800';
};

const ALL_CATEGORIES: Array<FeedbackCategory | 'ALL'> = [
  'ALL',
  'SAFETY',
  'PROCESS',
  'MANAGEMENT',
  'ENVIRONMENT',
  'OTHER',
];

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded bg-gray-200 ${className}`} />
);

const ScoreBadge: React.FC<{ score: number }> = ({ score }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SCORE_BADGE_COLOR(
      score
    )}`}
  >
    {getPsScoreLabel(score)}
  </span>
);

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
}

const ChartTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-md text-sm">
      <p className="mb-1 font-medium text-gray-900">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Feedback Item
// ─────────────────────────────────────────────────────────────

interface FeedbackItemProps {
  feedback: AnonymousFeedback;
  onAction: (id: string, status: FeedbackActionStatus) => Promise<void>;
}

const FeedbackItem: React.FC<FeedbackItemProps> = ({ feedback, onAction }) => {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);

  const handleStatusChange = async (status: FeedbackActionStatus) => {
    setUpdating(true);
    try {
      await onAction(feedback.id, status);
    } finally {
      setUpdating(false);
    }
  };

  const isLong = feedback.content.length > 120;

  return (
    <div className="rounded-lg border border-gray-100 p-3 hover:border-indigo-200 transition-colors">
      <div className="flex items-start justify-between gap-3">
        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {FEEDBACK_CATEGORY_LABELS[feedback.category]}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_STATUS_BADGE[feedback.actionStatus]}`}
            >
              {ACTION_STATUS_LABELS[feedback.actionStatus]}
            </span>
          </div>

          <p className={`text-sm text-gray-700 ${!expanded && isLong ? 'line-clamp-2' : ''}`}>
            {feedback.content}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs text-indigo-500 hover:text-indigo-700"
            >
              {expanded ? 'ย่อ' : 'ดูเพิ่มเติม'}
            </button>
          )}

          {feedback.actionNote && (
            <div className="mt-2 border-t border-gray-100 pt-2">
              <p className="text-xs text-gray-500">
                <span className="font-medium">หมายเหตุ: </span>
                {feedback.actionNote}
              </p>
            </div>
          )}
        </div>

        {/* Action selector */}
        <div className="shrink-0">
          <select
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
            style={{ colorScheme: 'light' }}
            value={feedback.actionStatus}
            disabled={updating}
            onChange={(e) => handleStatusChange(e.target.value as FeedbackActionStatus)}
          >
            {(Object.keys(ACTION_STATUS_LABELS) as FeedbackActionStatus[]).map((s) => (
              <option key={s} value={s}>
                {ACTION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main: CultureDashboard
// ─────────────────────────────────────────────────────────────

interface CultureDashboardProps {
  /** The active organisation ID (tenant-scoped) */
  orgId: string;
  /** Omit to retain the chart library's animation defaults. */
  animateCharts?: boolean;
}

export const CultureDashboard: React.FC<CultureDashboardProps> = ({ orgId, animateCharts }) => {
  // ── store slices ──────────────────────────────────────────
  const psScores = useCultureStore((s) => s.psScores);
  const anonymousFeedback = useCultureStore((s) => s.anonymousFeedback);
  const fetchPsScores = useCultureStore((s) => s.fetchPsScores);
  const fetchAnonymousFeedback = useCultureStore((s) => s.fetchAnonymousFeedback);
  const actionFeedback = useCultureStore((s) => s.actionFeedback);
  const currentMember = useTenantStore((s) => s.currentMember);
  const isAdmin = currentMember ? ORG_ROLE_HIERARCHY[currentMember.role] >= 80 : false;

  // ── selectors ─────────────────────────────────────────────
  const chartData = useCultureStore(selectScoresForChart);
  const isLoading = useCultureStore(selectIsAnyLoading);
  const pendingFeedback = useCultureStore(selectPendingFeedback);
  const currentPeriodLabel = useCultureStore(selectCurrentPeriodLabel);

  // ── latest score ──────────────────────────────────────────
  const latestScore = useMemo(
    () => (psScores.length > 0 ? psScores[psScores.length - 1] : null),
    [psScores]
  );

  // ── dimension bar data ────────────────────────────────────
  const dimensionData = useMemo(() => {
    if (!latestScore) return [];
    const dims = (latestScore.dimensionScores ?? {}) as Partial<Record<PsDimension, number>>;
    return (['SPEAK_UP', 'HELP_SEEKING', 'RISK_TAKING', 'INCLUSION'] as PsDimension[]).map(
      (dim) => ({
        name: DIMENSION_LABELS[dim],
        score: dims[dim] ?? 0,
        color: DIMENSION_COLORS[dim],
        dimension: dim,
      })
    );
  }, [latestScore]);

  // ── feedback filters ──────────────────────────────────────
  const [categoryFilter, setCategoryFilter] = useState<FeedbackCategory | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<FeedbackActionStatus | 'ALL'>('ALL');

  const filteredFeedback = useMemo(() => {
    let list = [...anonymousFeedback];
    if (categoryFilter !== 'ALL') list = list.filter((f) => f.category === categoryFilter);
    if (statusFilter !== 'ALL') list = list.filter((f) => f.actionStatus === statusFilter);
    return list;
  }, [anonymousFeedback, categoryFilter, statusFilter]);

  // ── fetch on mount ────────────────────────────────────────
  useEffect(() => {
    fetchPsScores(orgId);
    if (isAdmin) fetchAnonymousFeedback(orgId);
  }, [orgId, isAdmin]);

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Psychological Safety Dashboard</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            วัดความปลอดภัยทางจิตวิทยาในองค์กร (Edmondson 1999 · Likert 1–7)
          </p>
        </div>
        {currentPeriodLabel && (
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
            งวด: {currentPeriodLabel}
          </span>
        )}
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Overall Score */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">คะแนน PS รวม</p>
          {isLoading ? (
            <Skeleton className="mt-2 h-10 w-24" />
          ) : latestScore ? (
            <>
              <div className="mt-2 flex items-end gap-1.5">
                <span className="text-4xl font-bold text-gray-900">
                  {latestScore.score.toFixed(1)}
                </span>
                <span className="mb-1 text-lg text-gray-400">/100</span>
              </div>
              <div className="mt-2">
                <ScoreBadge score={latestScore.score} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-gray-400">ยังไม่มีข้อมูล</p>
          )}
        </div>

        {/* Benchmark Comparison */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            เทียบค่าเฉลี่ยอุตสาหกรรมไทย
          </p>
          {isLoading ? (
            <Skeleton className="mt-2 h-10 w-32" />
          ) : latestScore ? (
            <div className="mt-2">
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold ${
                    latestScore.score >= THAI_MANUFACTURING_PS_BENCHMARK
                      ? 'text-green-600'
                      : 'text-red-500'
                  }`}
                >
                  {latestScore.score >= THAI_MANUFACTURING_PS_BENCHMARK ? '▲' : '▼'}
                  {Math.abs(
                    latestScore.score - THAI_MANUFACTURING_PS_BENCHMARK
                  ).toFixed(1)}
                </span>
                <span className="text-sm text-gray-500">จากเกณฑ์ {THAI_MANUFACTURING_PS_BENCHMARK}</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {latestScore.score >= THAI_MANUFACTURING_PS_BENCHMARK
                  ? 'สูงกว่าค่าเฉลี่ยอุตสาหกรรม'
                  : 'ต่ำกว่าค่าเฉลี่ยอุตสาหกรรม'}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-400">ยังไม่มีข้อมูล</p>
          )}
        </div>

        {/* Pending Feedback Count */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            ความคิดเห็นรอดำเนินการ
          </p>
          {isLoading ? (
            <Skeleton className="mt-2 h-10 w-16" />
          ) : (
            <>
              <div className="mt-2 flex items-end gap-1.5">
                <span className="text-4xl font-bold text-gray-900">
                  {pendingFeedback.length}
                </span>
                <span className="mb-1 text-sm text-gray-400">รายการ</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                จากทั้งหมด {anonymousFeedback.length} รายการ
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Trend Line Chart ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">แนวโน้ม PS Score</h2>
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={chartData} margin={{ top: 5, right: 24, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="period"
                tickFormatter={(v: string) => formatPeriodLabel(v)}
                tick={{ fontSize: 11, fill: '#6b7280' }}
              />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#6b7280' }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-gray-600">{value}</span>
                )}
              />
              <ReferenceLine
                y={THAI_MANUFACTURING_PS_BENCHMARK}
                stroke="#f59e0b"
                strokeDasharray="6 3"
                label={{
                  value: `เกณฑ์อุตสาหกรรม (${THAI_MANUFACTURING_PS_BENCHMARK})`,
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill: '#b45309',
                }}
              />
              <Line
                isAnimationActive={animateCharts}
                type="monotone"
                dataKey="score"
                name="คะแนนรวม"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#6366f1' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-56 items-center justify-center text-sm text-gray-400">
            ยังไม่มีข้อมูล PS Score
          </div>
        )}
      </div>

      {/* ── Dimension Bar Chart ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          คะแนนตามมิติ ({currentPeriodLabel ?? 'ล่าสุด'})
        </h2>
        {isLoading ? (
          <Skeleton className="h-44 w-full" />
        ) : dimensionData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={dimensionData}
              layout="vertical"
              margin={{ top: 0, right: 24, left: 90, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: '#374151' }}
                width={90}
              />
              <Tooltip formatter={(value: number) => value.toFixed(1)} />
              <ReferenceLine
                x={THAI_MANUFACTURING_PS_BENCHMARK}
                stroke="#f59e0b"
                strokeDasharray="4 2"
              />
              <Bar dataKey="score" name="คะแนน" radius={[0, 4, 4, 0]} isAnimationActive={animateCharts}>
                {dimensionData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-44 items-center justify-center text-sm text-gray-400">
            ยังไม่มีข้อมูลมิติ
          </div>
        )}
      </div>

      {/* ── Anonymous Feedback List (ADMIN only) ── */}
      {!isAdmin ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-center text-sm text-amber-700">
          ความคิดเห็นนิรนามแสดงเฉพาะผู้ดูแลระบบ (ADMIN ขึ้นไป) เท่านั้น
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        {/* List header */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-gray-900">ความคิดเห็นนิรนาม</h2>
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            style={{ colorScheme: 'light' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FeedbackActionStatus | 'ALL')}
          >
            <option value="ALL">ทุกสถานะ</option>
            {(Object.keys(ACTION_STATUS_LABELS) as FeedbackActionStatus[]).map((s) => (
              <option key={s} value={s}>
                {ACTION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {/* Category tabs */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {ALL_CATEGORIES.map((cat) => {
            const count =
              cat === 'ALL'
                ? anonymousFeedback.length
                : anonymousFeedback.filter((f) => f.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  categoryFilter === cat
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat === 'ALL' ? 'ทั้งหมด' : FEEDBACK_CATEGORY_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>

        {/* Feedback rows */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredFeedback.length > 0 ? (
          <div className="space-y-3">
            {filteredFeedback.map((feedback) => (
              <FeedbackItem
                key={feedback.id}
                feedback={feedback}
                onAction={async (id, status) => { await actionFeedback({ feedbackId: id, actionStatus: status }); }}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            ไม่มีความคิดเห็นที่ตรงกับเงื่อนไข
          </div>
        )}
        </div>
      )}
    </div>
  );
};

export default CultureDashboard;
