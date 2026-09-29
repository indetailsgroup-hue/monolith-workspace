/**
 * src/ai-scheduler/AiSchedulerBoard.tsx
 *
 * MONOLITH v17.5 — AI Production Scheduler: Board Component
 *
 * Two-panel board for managing AI-generated production runs:
 *   Left  — scrollable list of ProductionRun cards with status badge,
 *            approve/cancel action buttons (visibility gated by run status)
 *   Right — detail panel for the selected run showing:
 *             • Run header with AI confidence score badge
 *             • Status timeline (DRAFT → GENERATING → READY → APPROVED →
 *               IN_PROGRESS → COMPLETED; CANCELLED/FAILED as terminal states)
 *             • Schedule items table (sequence, job, priority, status,
 *               duration, AI rationale / override badge)
 *
 * Plan Gate: ENTERPRISE (canAccessAiScheduler)
 *
 * data-testids:
 *   aps-board, plan-gate-wall, board-loading, error-banner,
 *   runs-list, run-card, run-status-badge, run-approve-btn, run-cancel-btn,
 *   run-status-timeline, timeline-step,
 *   selected-run-header, confidence-badge,
 *   schedule-items-table, schedule-item-row, item-override-badge,
 *   items-loading, no-runs, no-items
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useAiSchedulerStore } from './aiSchedulerStore';
import {
  canAccessAiScheduler,
  APS_RUN_STATUS_LABEL_TH,
  APS_ITEM_STATUS_LABEL_TH,
  APS_PRIORITY_LABEL_TH,
} from './aiSchedulerTypes';
import type { OrgPlan } from '../tenant/types';
import type { ApsProductionRun, ApsRunStatus } from './aiSchedulerTypes';

// ============================================================================
// PROPS
// ============================================================================

export interface AiSchedulerBoardProps {
  orgId: string;
  orgPlan: OrgPlan;
  isAdmin?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Main-flow status steps shown in the timeline (linear progression) */
const RUN_TIMELINE_STEPS: ApsRunStatus[] = [
  'DRAFT',
  'GENERATING',
  'READY',
  'APPROVED',
  'IN_PROGRESS',
  'COMPLETED',
];

// ============================================================================
// HELPERS
// ============================================================================

function getStatusColor(status: ApsRunStatus): string {
  switch (status) {
    case 'DRAFT':       return 'bg-gray-100 text-gray-600 border-gray-200';
    case 'GENERATING':  return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'READY':       return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'APPROVED':    return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    case 'IN_PROGRESS': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'COMPLETED':   return 'bg-emerald-200 text-emerald-800 border-emerald-300';
    case 'CANCELLED':   return 'bg-gray-200 text-gray-500 border-gray-300';
    case 'FAILED':      return 'bg-red-100 text-red-700 border-red-200';
    default:            return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

function formatScheduleDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function canApprove(run: ApsProductionRun): boolean {
  return run.status === 'READY';
}

function canCancel(run: ApsProductionRun): boolean {
  return ['DRAFT', 'READY', 'APPROVED'].includes(run.status);
}

function isTerminalStatus(status: ApsRunStatus): boolean {
  return status === 'CANCELLED' || status === 'FAILED';
}

// ============================================================================
// SUB-COMPONENT — RunStatusTimeline
// ============================================================================

interface RunStatusTimelineProps {
  currentStatus: ApsRunStatus;
}

function RunStatusTimeline({ currentStatus }: RunStatusTimelineProps) {
  if (isTerminalStatus(currentStatus)) {
    // Cancelled or Failed — show compact terminal badge instead of the linear steps
    return (
      <div className="flex items-center gap-2 py-1" data-testid="run-status-timeline">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(currentStatus)}`}
          data-testid="timeline-step"
          data-status={currentStatus}
          data-active="true"
          aria-current="step"
        >
          {currentStatus === 'CANCELLED' ? '✕ ยกเลิกแล้ว' : '✗ เกิดข้อผิดพลาด'}
        </span>
        <span className="text-xs text-gray-400">{APS_RUN_STATUS_LABEL_TH[currentStatus]}</span>
      </div>
    );
  }

  const currentIdx = RUN_TIMELINE_STEPS.indexOf(currentStatus);

  return (
    <ol
      className="flex items-center w-full overflow-x-auto pb-1"
      aria-label="สถานะแผนการผลิต"
      data-testid="run-status-timeline"
    >
      {RUN_TIMELINE_STEPS.map((step, idx) => {
        const isDone   = idx < currentIdx;
        const isActive = step === currentStatus;
        const isFuture = idx > currentIdx;

        return (
          <li key={step} className={`flex items-center ${idx < RUN_TIMELINE_STEPS.length - 1 ? 'flex-1' : ''}`}>
            {/* Step circle */}
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 text-xs font-bold transition-colors ${
                isDone
                  ? 'bg-indigo-600 text-white'
                  : isActive
                  ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500 ring-offset-1'
                  : 'bg-gray-100 text-gray-400'
              }`}
              data-testid="timeline-step"
              data-status={step}
              data-active={isActive ? 'true' : undefined}
              data-done={isDone ? 'true' : undefined}
              aria-current={isActive ? 'step' : undefined}
              title={APS_RUN_STATUS_LABEL_TH[step]}
            >
              {isDone ? '✓' : idx + 1}
            </div>

            {/* Connector line */}
            {idx < RUN_TIMELINE_STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 transition-colors ${isDone ? 'bg-indigo-600' : 'bg-gray-200'}`}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ============================================================================
// SUB-COMPONENT — RunCard
// ============================================================================

interface RunCardProps {
  run: ApsProductionRun;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onApprove: (run: ApsProductionRun) => void;
  onCancel: (run: ApsProductionRun) => void;
}

function RunCard({ run, isSelected, onSelect, onApprove, onCancel }: RunCardProps) {
  return (
    <li>
      <button
        type="button"
        className={`w-full text-left rounded-xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          isSelected
            ? 'border-indigo-400 bg-indigo-50 shadow-sm'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
        }`}
        data-testid="run-card"
        data-run-id={run.id}
        onClick={() => onSelect(run.id)}
      >
        {/* Run title + status badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{run.runLabel}</p>
            <p className="text-xs text-gray-500 mt-0.5">{formatScheduleDate(run.scheduleDate)}</p>
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 border ${getStatusColor(run.status)}`}
            data-testid="run-status-badge"
            data-status={run.status}
          >
            {APS_RUN_STATUS_LABEL_TH[run.status]}
          </span>
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <span>{run.totalItems} รายการ</span>
          {run.aiConfidenceScore !== null && (
            <span className="text-blue-500">AI {run.aiConfidenceScore}%</span>
          )}
          {run.delayRiskCount > 0 && (
            <span className="text-amber-600">⚠ {run.delayRiskCount} ความเสี่ยง</span>
          )}
        </div>

        {/* Action buttons — only render when actions are available */}
        {(canApprove(run) || canCancel(run)) && (
          <div
            className="flex gap-2 mt-2.5"
            // Prevent clicking action buttons from triggering the card's own onSelect
            onClick={(e) => e.stopPropagation()}
          >
            {canApprove(run) && (
              <button
                type="button"
                className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg py-1.5 font-medium transition-colors"
                data-testid="run-approve-btn"
                data-run-id={run.id}
                onClick={() => onApprove(run)}
              >
                อนุมัติ
              </button>
            )}
            {canCancel(run) && (
              <button
                type="button"
                className="flex-1 text-xs bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 rounded-lg py-1.5 font-medium transition-colors"
                data-testid="run-cancel-btn"
                data-run-id={run.id}
                onClick={() => onCancel(run)}
              >
                ยกเลิก
              </button>
            )}
          </div>
        )}
      </button>
    </li>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AiSchedulerBoard({ orgId, orgPlan, isAdmin = false }: AiSchedulerBoardProps) {
  const {
    productionRuns,
    scheduleItems,
    isRunLoading,
    isItemLoading,
    error,
    clearError,
    fetchProductionRuns,
    fetchScheduleItems,
    approveRun,
    cancelRun,
  } = useAiSchedulerStore();

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [actionError, setActionError]     = useState<string | null>(null);

  // ── Fetch production runs on mount ──────────────────────────────────────
  useEffect(() => {
    if (!canAccessAiScheduler(orgPlan)) return;
    fetchProductionRuns(orgId);
  }, [orgId, orgPlan, fetchProductionRuns]);

  // ── Fetch schedule items when a run is selected ─────────────────────────
  useEffect(() => {
    if (!selectedRunId) return;
    fetchScheduleItems(orgId, selectedRunId);
  }, [orgId, selectedRunId, fetchScheduleItems]);

  // ── Plan gate ────────────────────────────────────────────────────────────
  if (!canAccessAiScheduler(orgPlan)) {
    return (
      <div
        className="flex flex-col items-center justify-center py-20 text-center"
        data-testid="plan-gate-wall"
      >
        <span className="text-5xl mb-5" aria-hidden="true">🤖</span>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          AI Production Scheduler ต้องการแผน ENTERPRISE
        </h3>
        <p className="text-sm text-gray-500 max-w-sm">
          จัดตารางการผลิตอัตโนมัติด้วย AI ลดเวลารอและเพิ่มประสิทธิภาพสายการผลิต
        </p>
        {isAdmin && (
          <p className="text-xs text-indigo-500 mt-3 font-medium">
            ติดต่อทีมขายเพื่ออัปเกรดไปยังแผน ENTERPRISE
          </p>
        )}
      </div>
    );
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (isRunLoading && productionRuns.length === 0) {
    return (
      <div className="space-y-3 animate-pulse" data-testid="board-loading">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl" />
        ))}
      </div>
    );
  }

  // ── Derived state ────────────────────────────────────────────────────────
  const selectedRun     = productionRuns.find((r) => r.id === selectedRunId) ?? null;
  const selectedItems   = scheduleItems.filter((i) => i.runId === selectedRunId);
  const displayError    = actionError ?? error;

  // ── Action handlers ──────────────────────────────────────────────────────
  const handleApprove = useCallback(
    async (run: ApsProductionRun) => {
      setActionError(null);
      try {
        await approveRun(orgId, orgPlan, run.id);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'ไม่สามารถอนุมัติแผนได้');
      }
    },
    [orgId, orgPlan, approveRun],
  );

  const handleCancel = useCallback(
    async (run: ApsProductionRun) => {
      setActionError(null);
      try {
        await cancelRun(orgId, orgPlan, run.id);
        // Deselect the run if it was selected
        if (selectedRunId === run.id) setSelectedRunId(null);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'ไม่สามารถยกเลิกแผนได้');
      }
    },
    [orgId, orgPlan, cancelRun, selectedRunId],
  );

  const handleDismissError = useCallback(() => {
    clearError();
    setActionError(null);
  }, [clearError]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-4" data-testid="aps-board">

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {displayError && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <span data-testid="error-banner">{displayError}</span>
          <button
            type="button"
            onClick={handleDismissError}
            className="text-red-400 hover:text-red-600 ml-4 shrink-0"
            aria-label="ปิดข้อความแจ้งเตือน"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Two-panel layout ───────────────────────────────────────────────── */}
      <div className="flex gap-4 items-start">

        {/* ── LEFT: Runs list ──────────────────────────────────────────────── */}
        <aside className="w-80 shrink-0" data-testid="runs-list">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">แผนการผลิต</h2>
            {isAdmin && (
              <span className="text-xs text-indigo-500 font-medium cursor-pointer hover:text-indigo-700">
                + สร้างแผนใหม่
              </span>
            )}
          </div>

          {productionRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="no-runs">
              <span className="text-3xl mb-2" aria-hidden="true">📅</span>
              <p className="text-sm text-gray-400">ยังไม่มีแผนการผลิต</p>
              {isAdmin && (
                <p className="text-xs text-indigo-400 mt-1">สร้างแผนแรกได้เลย</p>
              )}
            </div>
          ) : (
            <ul className="space-y-2 max-h-[calc(100vh-12rem)] overflow-y-auto pr-0.5">
              {productionRuns.map((run) => (
                <RunCard
                  key={run.id}
                  run={run}
                  isSelected={selectedRunId === run.id}
                  onSelect={setSelectedRunId}
                  onApprove={handleApprove}
                  onCancel={handleCancel}
                />
              ))}
            </ul>
          )}
        </aside>

        {/* ── RIGHT: Run detail panel ───────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {selectedRun == null ? (
            /* Empty placeholder when no run is selected */
            <div className="flex flex-col items-center justify-center h-72 text-center text-gray-400 rounded-xl border border-dashed border-gray-200">
              <span className="text-4xl mb-3" aria-hidden="true">📋</span>
              <p className="text-sm">เลือกแผนการผลิตทางซ้ายเพื่อดูรายละเอียด</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* ── Run header ─────────────────────────────────────────────── */}
              <div
                className="bg-white rounded-xl border border-gray-200 p-5"
                data-testid="selected-run-header"
                data-run-id={selectedRun.id}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{selectedRun.runLabel}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">
                        {formatScheduleDate(selectedRun.scheduleDate)}
                      </span>
                      {selectedRun.aiConfidenceScore !== null && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
                          data-testid="confidence-badge"
                          data-score={selectedRun.aiConfidenceScore}
                        >
                          AI {selectedRun.aiConfidenceScore}%
                        </span>
                      )}
                      {selectedRun.overrideCount > 0 && (
                        <span className="text-xs text-amber-600">
                          {selectedRun.overrideCount} Override
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(selectedRun.status)}`}
                    data-testid="run-status-badge"
                    data-status={selectedRun.status}
                  >
                    {APS_RUN_STATUS_LABEL_TH[selectedRun.status]}
                  </span>
                </div>

                {/* Status timeline */}
                <RunStatusTimeline currentStatus={selectedRun.status} />

                {/* Inline approve/cancel for selected run */}
                {(canApprove(selectedRun) || canCancel(selectedRun)) && (
                  <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                    {canApprove(selectedRun) && (
                      <button
                        type="button"
                        className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                        data-testid="run-approve-btn"
                        data-run-id={selectedRun.id}
                        onClick={() => handleApprove(selectedRun)}
                      >
                        อนุมัติแผน
                      </button>
                    )}
                    {canCancel(selectedRun) && (
                      <button
                        type="button"
                        className="px-4 py-2 text-sm bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 rounded-lg font-medium transition-colors"
                        data-testid="run-cancel-btn"
                        data-run-id={selectedRun.id}
                        onClick={() => handleCancel(selectedRun)}
                      >
                        ยกเลิกแผน
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Schedule items table ────────────────────────────────────── */}
              <div
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                data-testid="schedule-items-table"
              >
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">
                    รายการงาน
                    {!isItemLoading && (
                      <span className="ml-1.5 text-gray-400 font-normal">({selectedItems.length})</span>
                    )}
                  </h3>
                  {selectedRun.estimatedUtilisationPct !== null && (
                    <span className="text-xs text-gray-500">
                      ใช้กำลังการผลิต {Math.round(selectedRun.estimatedUtilisationPct)}%
                    </span>
                  )}
                </div>

                {isItemLoading ? (
                  <div className="p-4 space-y-2 animate-pulse" data-testid="items-loading">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 bg-gray-100 rounded" />
                    ))}
                  </div>
                ) : selectedItems.length === 0 ? (
                  <p
                    className="text-sm text-gray-400 text-center py-10"
                    data-testid="no-items"
                  >
                    ยังไม่มีรายการงานสำหรับแผนนี้
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">งาน</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">ลำดับความสำคัญ</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">สถานะ</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">เวลาประมาณ (นาที)</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">AI / Override</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {selectedItems.map((item) => {
                          const itemStatusColor =
                            item.status === 'DONE'        ? 'bg-emerald-100 text-emerald-700' :
                            item.status === 'BLOCKED'     ? 'bg-red-100 text-red-700' :
                            item.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                            item.status === 'SKIPPED'     ? 'bg-gray-200 text-gray-500' :
                                                            'bg-gray-100 text-gray-600';
                          return (
                            <tr
                              key={item.id}
                              className="hover:bg-gray-50/60 transition-colors"
                              data-testid="schedule-item-row"
                              data-item-id={item.id}
                            >
                              <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                                {item.sequenceOrder}
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-900">{item.jobLabel}</p>
                                {item.aiRationale && (
                                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-1 max-w-xs">
                                    {item.aiRationale}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                {APS_PRIORITY_LABEL_TH[item.priority]}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${itemStatusColor}`}>
                                  {APS_ITEM_STATUS_LABEL_TH[item.status]}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-gray-700 font-mono text-xs">
                                {item.estDurationMin}
                              </td>
                              <td className="px-4 py-3">
                                {item.isOverridden ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 cursor-help"
                                    data-testid="item-override-badge"
                                    data-item-id={item.id}
                                    title={item.overrideReason ?? 'Override applied'}
                                  >
                                    ✎ Override
                                  </span>
                                ) : (
                                  item.aiRationale && (
                                    <span className="text-xs text-blue-400 font-medium">AI</span>
                                  )
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AiSchedulerBoard;
