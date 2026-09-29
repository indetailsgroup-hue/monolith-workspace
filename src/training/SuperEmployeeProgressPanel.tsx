/**
 * src/training/SuperEmployeeProgressPanel.tsx
 *
 * MONOLITH v17.5 — Super Employee Tracker: AI Readiness Progress Panel
 *
 * Displays an employee's current AI Readiness stage, the full 5-step
 * progression timeline, and their open skill gaps.
 *
 * Features:
 *  - Stage progression timeline (AI_UNAWARE → SUPER_EMPLOYEE)
 *    with completed / current / upcoming visual states
 *  - Current stage card with score progress bar
 *  - AI Readiness badge (AI_ASSISTED+ threshold)
 *  - Open skill gap list with stage label and resolve button (admin only)
 *  - Plan gate wall for FREE / STARTER plans
 *  - Loading skeleton
 *
 * Plan Gate: PROFESSIONAL+ (canAccessSuperEmployeeTracker)
 *
 * data-testids:
 *   progress-panel, plan-gate-wall, panel-loading, current-stage-display,
 *   current-score, ai-readiness-badge, stage-timeline, stage-step,
 *   skill-gap-list, skill-gap-item, resolve-gap-btn, no-gaps-message
 */

import React, { useEffect, useCallback } from 'react';
import { useSuperEmployeeStore } from './superEmployeeStore';
import {
  canAccessSuperEmployeeTracker,
  STAGE_PROGRESSION_ORDER,
  STAGE_SCORE_MAP,
  AI_READINESS_THRESHOLD_STAGE,
  AI_READINESS_SCORE_THRESHOLD,
} from './superEmployeeTypes';
import { SUPER_EMPLOYEE_STAGE_LABEL_TH } from '../people/types';
import type { OrgPlan } from '../tenant/types';
import type { SuperEmployeeStage } from '../people/types';

// ============================================================================
// TYPES
// ============================================================================

export interface SuperEmployeeProgressPanelProps {
  orgId: string;
  orgPlan: OrgPlan;
  employeeId: string;
  employeeName?: string;
  isAdmin?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

type StepStatus = 'completed' | 'current' | 'upcoming';

function getStepStatus(stage: SuperEmployeeStage, currentScore: number): StepStatus {
  const stageScore = STAGE_SCORE_MAP[stage];
  if (currentScore > stageScore) return 'completed';
  if (currentScore === stageScore) return 'current';
  return 'upcoming';
}

const STEP_STATUS_STYLES: Record<StepStatus, { circle: string; label: string; line: string }> = {
  completed: {
    circle: 'bg-emerald-500 border-emerald-500 text-white',
    label: 'text-emerald-700 font-semibold',
    line: 'bg-emerald-400',
  },
  current: {
    circle: 'bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-100',
    label: 'text-indigo-700 font-bold',
    line: 'bg-gray-200',
  },
  upcoming: {
    circle: 'bg-white border-gray-300 text-gray-400',
    label: 'text-gray-400',
    line: 'bg-gray-200',
  },
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SuperEmployeeProgressPanel({
  orgId,
  orgPlan,
  employeeId,
  employeeName,
  isAdmin = false,
}: SuperEmployeeProgressPanelProps) {
  const {
    employeeReadiness,
    skillGaps,
    isLoading,
    error,
    clearError,
    fetchEmployeeReadiness,
    fetchStageHistory,
    fetchSkillGaps,
    resolveSkillGap,
  } = useSuperEmployeeStore();

  // ── Fetch on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!canAccessSuperEmployeeTracker(orgPlan)) return;
    fetchEmployeeReadiness(orgId, employeeId);
    fetchStageHistory(orgId, employeeId);
    fetchSkillGaps(orgId, employeeId);
  }, [orgId, orgPlan, employeeId, fetchEmployeeReadiness, fetchStageHistory, fetchSkillGaps]);

  // ── Plan gate ───────────────────────────────────────────────────────────
  if (!canAccessSuperEmployeeTracker(orgPlan)) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center"
        data-testid="plan-gate-wall"
      >
        <span className="text-4xl mb-4">🔒</span>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Super Employee Tracker ต้องการแผน PROFESSIONAL+
        </h3>
        <p className="text-sm text-gray-500 max-w-sm">
          อัปเกรดแผนเพื่อติดตามความก้าวหน้า AI Readiness ของทีม
        </p>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (isLoading && !employeeReadiness) {
    return (
      <div
        className="space-y-4 animate-pulse"
        data-testid="panel-loading"
      >
        {/* Stage display skeleton */}
        <div className="h-24 bg-gray-100 rounded-xl" />
        {/* Timeline skeleton */}
        <div className="h-16 bg-gray-100 rounded-xl" />
        {/* Gap list skeleton */}
        <div className="h-32 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  const currentScore = employeeReadiness?.currentScore ?? 0;
  const currentStage = employeeReadiness?.currentStage ?? 'AI_UNAWARE';
  const isAiReady = currentScore >= AI_READINESS_SCORE_THRESHOLD;

  // ── Resolve skill gap ───────────────────────────────────────────────────
  const handleResolveGap = useCallback(
    async (gapId: string) => {
      clearError();
      try {
        await resolveSkillGap(orgId, orgPlan, gapId);
        // Re-fetch gaps after resolving to stay in sync
        await fetchSkillGaps(orgId, employeeId);
      } catch {
        // error is set in store by resolveSkillGap
      }
    },
    [orgId, orgPlan, employeeId, resolveSkillGap, fetchSkillGaps, clearError],
  );

  const openGaps = skillGaps.filter((g) => !g.resolved);

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6"
      data-testid="progress-panel"
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {employeeName ?? employeeId}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">AI Readiness Progress</p>
        </div>
        {isAiReady && (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
            data-testid="ai-readiness-badge"
          >
            ✦ AI Ready
          </span>
        )}
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
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

      {/* ── Current stage card ───────────────────────────────────────────── */}
      <div
        className="rounded-xl bg-indigo-50 border border-indigo-100 p-4"
        data-testid="current-stage-display"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-indigo-800">
            {SUPER_EMPLOYEE_STAGE_LABEL_TH[currentStage]}
          </span>
          <span
            className="text-lg font-bold text-indigo-700"
            data-testid="current-score"
          >
            {currentScore}
            <span className="text-xs font-normal text-indigo-400"> / 100</span>
          </span>
        </div>
        {/* Score progress bar */}
        <div className="w-full h-2 bg-indigo-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${currentScore}%` }}
            role="progressbar"
            aria-valuenow={currentScore}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        {!isAiReady && (
          <p className="text-xs text-indigo-400 mt-2">
            ต้องการ {AI_READINESS_SCORE_THRESHOLD} คะแนน (ระดับ{' '}
            {SUPER_EMPLOYEE_STAGE_LABEL_TH[AI_READINESS_THRESHOLD_STAGE]}) เพื่อผ่าน AI Readiness
          </p>
        )}
      </div>

      {/* ── Stage progression timeline ───────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-4">เส้นทางพัฒนา</h3>
        <ol
          className="flex items-start gap-0"
          data-testid="stage-timeline"
          aria-label="AI Readiness stage progression"
        >
          {STAGE_PROGRESSION_ORDER.map((stage, idx) => {
            const status = getStepStatus(stage, currentScore);
            const styles = STEP_STATUS_STYLES[status];
            const isLast = idx === STAGE_PROGRESSION_ORDER.length - 1;
            const stageScore = STAGE_SCORE_MAP[stage];

            return (
              <li
                key={stage}
                className="flex-1 flex flex-col items-center"
                data-testid="stage-step"
                data-stage={stage}
                data-status={status}
              >
                <div className="flex items-center w-full">
                  {/* Step circle */}
                  <div
                    className={`
                      w-7 h-7 rounded-full border-2 flex items-center justify-center
                      flex-shrink-0 transition-all duration-300 z-10
                      ${styles.circle}
                    `}
                  >
                    {status === 'completed' ? (
                      <CheckIcon />
                    ) : (
                      <span className="text-xs font-bold">{stageScore}</span>
                    )}
                  </div>
                  {/* Connector line */}
                  {!isLast && (
                    <div className={`flex-1 h-0.5 ${styles.line} transition-all duration-300`} />
                  )}
                </div>
                {/* Stage label */}
                <p className={`text-center mt-2 text-xs leading-tight px-0.5 ${styles.label}`}>
                  {SUPER_EMPLOYEE_STAGE_LABEL_TH[stage]}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ── Skill gap list ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700">ช่องว่างทักษะที่ต้องพัฒนา</h3>
          {openGaps.length > 0 && (
            <span className="text-xs text-gray-400">{openGaps.length} รายการ</span>
          )}
        </div>

        {openGaps.length === 0 ? (
          <p
            className="text-sm text-gray-400 py-4 text-center"
            data-testid="no-gaps-message"
          >
            ไม่มีช่องว่างทักษะที่ค้างอยู่ 🎉
          </p>
        ) : (
          <ul className="space-y-2" data-testid="skill-gap-list">
            {openGaps.map((gap) => (
              <li
                key={gap.id}
                className="flex items-start justify-between gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg"
                data-testid="skill-gap-item"
                data-gap-id={gap.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{gap.skillName}</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    ต้องการสำหรับระดับ{' '}
                    <span className="font-semibold">
                      {SUPER_EMPLOYEE_STAGE_LABEL_TH[gap.stageRequired]}
                    </span>
                  </p>
                  {gap.skillDescription && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{gap.skillDescription}</p>
                  )}
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleResolveGap(gap.id)}
                    disabled={isLoading}
                    className="flex-shrink-0 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label={`แก้ไขช่องว่าง: ${gap.skillName}`}
                    data-testid="resolve-gap-btn"
                  >
                    แก้ไขแล้ว
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SuperEmployeeProgressPanel;
