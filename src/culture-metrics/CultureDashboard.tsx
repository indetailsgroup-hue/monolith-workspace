/**
 * src/culture-metrics/CultureDashboard.tsx
 *
 * MONOLITH v17.5 — Culture Metrics Dashboard UI Component
 *
 * Provides a PROFESSIONAL+ gated org-culture overview with three sections:
 *   1. eNPS Surveys — list, activate (admin), close (admin)
 *   2. eNPS Results — per-survey NPS score display (hidden until respondent
 *      threshold met, configurable via survey.minResponses)
 *   3. Org Health    — latest metric snapshot summary per active metric
 *
 * Plan Gate: PROFESSIONAL+ (canAccessCultureMetrics)
 *
 * data-testids:
 *   plan-gate-wall, culture-dashboard, dashboard-loading, error-banner,
 *   surveys-section, survey-card, survey-status-badge,
 *   survey-activate-btn, survey-close-btn, no-surveys,
 *   enps-results-section, enps-result-card, nps-score-display, nps-hidden,
 *   org-health-section, health-metric-row, no-health-data
 */

import React, { useEffect, useState } from 'react';
import { useCultureMetricsStore } from './cultureMetricsStore';
import SentimentTimelineBoard from './SentimentTimelineBoard';
import type { OrgPlan } from '../tenant/types';
import type { CmdEnpsSurvey, CmdEnpsResults, CmdOrgHealth } from './cultureMetricsTypes';
import {
  canAccessCultureMetrics,
  CMD_ENPS_STATUS_LABEL_TH,
  CMD_HEALTH_STATUS_LABEL_TH,
  CMD_HEALTH_STATUS_COLOR,
} from './cultureMetricsTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface CultureDashboardProps {
  orgId:    string;
  orgPlan:  OrgPlan;
  isAdmin?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: SurveyCard
// ─────────────────────────────────────────────────────────────────────────────

interface SurveyCardProps {
  survey:     CmdEnpsSurvey;
  isAdmin:    boolean;
  onActivate: (surveyId: string) => void;
  onClose:    (surveyId: string) => void;
}

function SurveyCard({ survey, isAdmin, onActivate, onClose }: SurveyCardProps) {
  const statusLabel = CMD_ENPS_STATUS_LABEL_TH[survey.status];

  const statusColor =
    survey.status === 'ACTIVE'
      ? 'text-emerald-700 bg-emerald-50'
      : survey.status === 'CLOSED'
      ? 'text-gray-500 bg-gray-100'
      : 'text-amber-700 bg-amber-50'; // DRAFT

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      data-testid="survey-card"
      data-survey-id={survey.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-gray-900">{survey.titleTh ?? survey.title}</p>
          {survey.closesAt && (
            <p className="mt-0.5 text-xs text-gray-500">
              ปิด {new Date(survey.closesAt).toLocaleDateString('th-TH')}
            </p>
          )}
        </div>

        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}`}
          data-testid="survey-status-badge"
          data-status={survey.status}
        >
          {statusLabel}
        </span>
      </div>

      {isAdmin && (
        <div className="mt-3 flex flex-wrap gap-2">
          {survey.status === 'DRAFT' && (
            <button
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              data-testid="survey-activate-btn"
              data-survey-id={survey.id}
              onClick={() => onActivate(survey.id)}
              type="button"
            >
              เปิดรับคำตอบ
            </button>
          )}

          {survey.status === 'ACTIVE' && (
            <button
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
              data-testid="survey-close-btn"
              data-survey-id={survey.id}
              onClick={() => onClose(survey.id)}
              type="button"
            >
              ปิดการสำรวจ
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: EnpsResultCard
// ─────────────────────────────────────────────────────────────────────────────

interface EnpsResultCardProps {
  result: CmdEnpsResults;
}

function EnpsResultCard({ result }: EnpsResultCardProps) {
  const revealed = result.totalResponses >= result.minResponses;

  const npsColor =
    result.npsScore === null
      ? 'text-gray-500'
      : result.npsScore >= 50
      ? 'text-emerald-600'
      : result.npsScore >= 0
      ? 'text-amber-600'
      : 'text-red-600';

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      data-testid="enps-result-card"
      data-survey-id={result.surveyId}
    >
      <p className="font-medium text-gray-900">{result.title}</p>
      <p className="mt-0.5 text-xs text-gray-500">
        {result.totalResponses} คำตอบ
        {!revealed && ` / ต้องการอย่างน้อย ${result.minResponses} คำตอบ`}
      </p>

      {revealed ? (
        <div className="mt-3" data-testid="nps-score-display">
          <span className={`text-3xl font-bold ${npsColor}`}>
            {result.npsScore !== null ? result.npsScore : '—'}
          </span>
          <span className="ml-1 text-sm text-gray-500">คะแนน eNPS</span>

          {result.promoterCount !== null && (
            <div className="mt-2 flex gap-4 text-xs text-gray-600">
              <span>ผู้สนับสนุน {result.promoterCount}</span>
              <span>กลาง {result.passiveCount ?? 0}</span>
              <span>ต่อต้าน {result.detractorCount ?? 0}</span>
            </div>
          )}
        </div>
      ) : (
        <p
          className="mt-3 rounded-md bg-gray-50 p-2 text-xs text-gray-400"
          data-testid="nps-hidden"
        >
          ผลลัพธ์จะแสดงเมื่อได้รับคำตอบครบ {result.minResponses} รายการ
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: HealthMetricRow
// ─────────────────────────────────────────────────────────────────────────────

interface HealthMetricRowProps {
  metric: CmdOrgHealth;
}

function HealthMetricRow({ metric }: HealthMetricRowProps) {
  const statusLabel = CMD_HEALTH_STATUS_LABEL_TH[metric.healthStatus];
  const statusColor = CMD_HEALTH_STATUS_COLOR[metric.healthStatus];

  return (
    <div
      className="flex items-center justify-between rounded-md border border-gray-100 bg-white px-4 py-3"
      data-testid="health-metric-row"
      data-metric-id={metric.metricId}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {metric.displayNameTh ?? metric.displayName}
        </p>
        <p className="text-xs text-gray-500">{metric.latestPeriod}</p>
      </div>

      <div className="ml-4 flex items-center gap-3 text-right">
        <span className="text-lg font-semibold text-gray-900">{metric.latestScore}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}
          data-health-status={metric.healthStatus}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function CultureDashboard({ orgId, orgPlan, isAdmin = false }: CultureDashboardProps) {
  const {
    enpsSurveys,
    enpsResults,
    orgHealth,
    isLoading,
    isEnpsLoading,
    error,
    fetchEnpsSurveys,
    fetchEnpsResults,
    fetchOrgHealth,
    activateEnpsSurvey,
    closeEnpsSurvey,
    createEnpsSurvey,
    createMetricDefinition,
    clearError,
  } = useCultureMetricsStore();

  const canAccess = canAccessCultureMetrics(orgPlan);

  const [createSurveyTitle, setCreateSurveyTitle] = useState('');
  const [activeTab, setActiveTab] = useState<'surveys' | 'sentiment'>('surveys');

  // Hooks must run in the same order for gated and entitled users. Keep the
  // access check inside the effect so a gated render performs no data request.
  useEffect(() => {
    if (!canAccess) return;
    fetchEnpsSurveys(orgId);
    fetchEnpsResults(orgId);
    fetchOrgHealth(orgId);
  }, [canAccess, orgId, fetchEnpsSurveys, fetchEnpsResults, fetchOrgHealth]);

  // ── Plan gate ──────────────────────────────────────────────────────────────
  if (!canAccess) {
    return (
      <div
        className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-amber-300 bg-amber-50 p-8 text-center"
        data-testid="plan-gate-wall"
      >
        <svg
          className="mb-3 h-10 w-10 text-amber-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>

        <h2 className="text-base font-semibold text-amber-800">
          Culture Metrics Dashboard ต้องการแผน PROFESSIONAL ขึ้นไป
        </h2>
        <p className="mt-1 text-sm text-amber-700">
          แผนปัจจุบัน: <strong>{orgPlan}</strong>
        </p>

        {isAdmin && (
          <p className="mt-3 text-sm text-amber-600">
            ติดต่อทีมขายเพื่ออัปเกรดไปยังแผน PROFESSIONAL หรือ ENTERPRISE
          </p>
        )}
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading || isEnpsLoading) {
    return (
      <div
        className="space-y-4 animate-pulse"
        data-testid="dashboard-loading"
        aria-busy="true"
        aria-label="กำลังโหลดข้อมูล Culture Metrics"
      >
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-gray-200" />
        ))}
      </div>
    );
  }

  // ── Action handlers ────────────────────────────────────────────────────────
  async function handleActivate(surveyId: string) {
    await activateEnpySurvey(surveyId);
  }

  async function handleClose(surveyId: string) {
    await closeEnpsSurvey(orgId, orgPlan, surveyId);
  }

  // Wrap activateEnpySurvey with the store's activateEnpsSurvey
  async function activateEnpySurvey(surveyId: string) {
    await activateEnpsSurvey(orgId, orgPlan, surveyId);
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8" data-testid="culture-dashboard">

      {/* Error banner */}
      {error && (
        <div
          className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3"
          role="alert"
        >
          <span className="text-sm text-red-700" data-testid="error-banner">
            {error}
          </span>
          <button
            className="ml-3 text-sm font-medium text-red-600 hover:text-red-800"
            onClick={clearError}
            type="button"
            aria-label="ปิดข้อความแจ้งเตือน"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div data-testid="culture-tab-bar" className="flex gap-1 border-b border-gray-200">
        <button
          data-testid="culture-tab-surveys"
          onClick={() => setActiveTab('surveys')}
          type="button"
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'surveys'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          แบบสำรวจ &amp; สุขภาพองค์กร
        </button>
        <button
          data-testid="culture-tab-sentiment"
          onClick={() => setActiveTab('sentiment')}
          type="button"
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'sentiment'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ความรู้สึกพนักงาน
        </button>
      </div>

      {/* ── Surveys tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'surveys' && (
        <>

      <section aria-labelledby="surveys-heading" data-testid="surveys-section">
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="text-base font-semibold text-gray-900"
            id="surveys-heading"
          >
            แบบสำรวจ eNPS
          </h2>
          {isAdmin && (
            <span className="text-xs text-gray-400">
              {enpsSurveys.length} แบบสำรวจ
            </span>
          )}
        </div>

        {enpsSurveys.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 py-10 text-center"
            data-testid="no-surveys"
          >
            <p className="text-sm text-gray-400">ยังไม่มีแบบสำรวจ</p>
            {isAdmin && (
              <>
                <p className="mt-1 text-xs text-gray-400">
                  สร้างแบบสำรวจแรกเพื่อเริ่มเก็บข้อมูล eNPS
                </p>
                <form
                  className="mt-4 flex gap-2"
                  data-testid="create-survey-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!createSurveyTitle.trim()) return;
                    createEnpsSurvey(orgId, orgPlan, { title: createSurveyTitle.trim() });
                    setCreateSurveyTitle('');
                  }}
                >
                  <input
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    data-testid="create-survey-title-input"
                    onChange={(e) => setCreateSurveyTitle(e.target.value)}
                    placeholder="ชื่อแบบสำรวจ"
                    type="text"
                    value={createSurveyTitle}
                  />
                  <button
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    data-testid="create-survey-submit-btn"
                    type="submit"
                  >
                    สร้างแบบสำรวจ
                  </button>
                </form>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {enpsSurveys.map((survey: CmdEnpsSurvey) => (
              <SurveyCard
                key={survey.id}
                survey={survey}
                isAdmin={isAdmin}
                onActivate={activateEnpySurvey}
                onClose={handleClose}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Section 2: eNPS Results ──────────────────────────────────────── */}
      <section aria-labelledby="enps-results-heading" data-testid="enps-results-section">
        <h2
          className="mb-4 text-base font-semibold text-gray-900"
          id="enps-results-heading"
        >
          ผลลัพธ์ eNPS
        </h2>

        {enpsResults.length === 0 ? (
          <p className="text-sm text-gray-400">ยังไม่มีผลลัพธ์แบบสำรวจ</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {enpsResults.map((result: CmdEnpsResults) => (
              <EnpsResultCard key={result.surveyId} result={result} />
            ))}
          </div>
        )}
      </section>

      {/* ── Section 3: Org Health ────────────────────────────────────────── */}
      <section aria-labelledby="org-health-heading" data-testid="org-health-section">
        <h2
          className="mb-4 text-base font-semibold text-gray-900"
          id="org-health-heading"
        >
          สุขภาพองค์กร
        </h2>

        {orgHealth.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 py-10 text-center"
            data-testid="no-health-data"
          >
            <p className="text-sm text-gray-400">ยังไม่มีข้อมูลสุขภาพองค์กร</p>
            {isAdmin && (
              <>
                <p className="mt-1 text-xs text-gray-400">
                  บันทึก metric snapshot แรกเพื่อเริ่มติดตาม
                </p>
                <button
                  className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="create-metric-btn"
                  onClick={() =>
                    createMetricDefinition(orgId, orgPlan, {
                      metricCategory: 'CUSTOM',
                      metricSource:   'OTHER',
                      displayName:    'Metric ใหม่',
                    })
                  }
                  type="button"
                >
                  เพิ่ม Metric Definition
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {orgHealth.map((metric: CmdOrgHealth) => (
              <HealthMetricRow key={metric.metricId} metric={metric} />
            ))}
          </div>
        )}
      </section>
        </>
      )}

      {/* ── Sentiment tab ─────────────────────────────────────────────────── */}
      {activeTab === 'sentiment' && (
        <div data-testid="est-tab-panel">
          <SentimentTimelineBoard orgId={orgId} plan={orgPlan} isAdmin={isAdmin} />
        </div>
      )}

    </div>
  );
}

export default CultureDashboard;
