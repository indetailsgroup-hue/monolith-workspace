/**
 * src/training/TrainingEnrollmentPanel.tsx
 *
 * MONOLITH v17.5 — Training Tracker: Bulk Enrollment Panel
 *
 * Features:
 *  - Employee ID tag input (type + Enter or Add button)
 *  - Due date picker
 *  - Notes textarea
 *  - Bulk enroll submission
 *  - Status timeline showing existing enrollments for the course
 *
 * Plan Gate: PROFESSIONAL+ (shows lock wall if plan not met)
 *
 * data-testids:
 *   enrollment-panel, plan-gate-wall, employee-id-input, add-employee-btn,
 *   employee-tag, remove-employee-tag-btn, bulk-enroll-count, due-date-picker,
 *   enrollment-notes-input, enroll-submit-btn, enrollment-timeline,
 *   timeline-item, enrollment-status-badge, error-banner, panel-loading
 */

import React, { useEffect, useCallback, useState } from 'react';
import { useTrainingStore } from './trainingStore';
import {
  canAccessTrainingTracker,
  TRAINING_STATUS_COLORS,
  TRAINING_STATUS_LABELS,
  type TrainingEnrollment,
} from './trainingTypes';
import type { OrgPlan } from '../tenant/types';

// ============================================================================
// TYPES
// ============================================================================

export interface TrainingEnrollmentPanelProps {
  orgId: string;
  orgPlan: OrgPlan;
  courseId: string;
  courseName?: string;
  onClose?: () => void;
  onEnrolled?: (result: TrainingEnrollment[]) => void;
  isAdmin?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TrainingEnrollmentPanel({
  orgId,
  orgPlan,
  courseId,
  courseName,
  onClose,
  onEnrolled,
  isAdmin = false,
}: TrainingEnrollmentPanelProps) {
  const {
    bulkEnroll,
    fetchEnrollments,
    enrollments,
    isEnrollmentLoading,
    error,
    clearError,
  } = useTrainingStore();

  // ── Local form state ─────────────────────────────────────────────────────
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // ── Fetch existing enrollments on mount ──────────────────────────────────
  useEffect(() => {
    if (canAccessTrainingTracker(orgPlan)) {
      fetchEnrollments(orgId, { courseId });
    }
  }, [orgId, orgPlan, courseId, fetchEnrollments]);

  // ── Plan gate guard ──────────────────────────────────────────────────────
  if (!canAccessTrainingTracker(orgPlan)) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center"
        data-testid="plan-gate-wall"
      >
        <span className="text-4xl mb-4">🔒</span>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Training Tracker ต้องการแผน PROFESSIONAL+
        </h3>
        <p className="text-sm text-gray-500 max-w-sm">
          อัปเกรดแผนเพื่อมอบหมายการฝึกอบรมและติดตามความก้าวหน้าของทีม
        </p>
      </div>
    );
  }

  // ── Employee tag management ──────────────────────────────────────────────
  const addEmployee = useCallback(() => {
    const trimmed = currentInput.trim();
    if (!trimmed || employeeIds.includes(trimmed)) {
      setCurrentInput('');
      return;
    }
    setEmployeeIds((prev) => [...prev, trimmed]);
    setCurrentInput('');
  }, [currentInput, employeeIds]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addEmployee();
      }
    },
    [addEmployee]
  );

  const removeEmployee = useCallback((id: string) => {
    setEmployeeIds((prev) => prev.filter((e) => e !== id));
  }, []);

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLocalError(null);

      if (employeeIds.length === 0) {
        setLocalError('กรุณาเพิ่มรหัสพนักงานอย่างน้อย 1 คน');
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await bulkEnroll(orgId, orgPlan, {
          courseId,
          employeeIds,
          dueDate: dueDate || undefined,
          notes: notes || undefined,
        });

        // Reset form on success
        setEmployeeIds([]);
        setCurrentInput('');
        setDueDate('');
        setNotes('');
        setLocalError(null);

        onEnrolled?.(result);

        // Refresh timeline
        await fetchEnrollments(orgId, { courseId });
      } catch (err) {
        setLocalError(
          err instanceof Error ? err.message : 'มอบหมายไม่สำเร็จ กรุณาลองใหม่'
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      orgId,
      orgPlan,
      courseId,
      employeeIds,
      dueDate,
      notes,
      bulkEnroll,
      fetchEnrollments,
      onEnrolled,
    ]
  );

  // ── Course-specific enrollments for timeline ─────────────────────────────
  const courseEnrollments = enrollments.filter((e) => e.courseId === courseId);

  const displayError = localError ?? error;

  return (
    <div
      className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 space-y-6 max-w-lg w-full"
      data-testid="enrollment-panel"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            มอบหมายการฝึกอบรม
          </h2>
          {courseName && (
            <p className="text-sm text-gray-500 mt-0.5">{courseName}</p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            aria-label="ปิด"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {displayError && (
        <div
          className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"
          data-testid="error-banner"
        >
          <span>{displayError}</span>
          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              clearError();
            }}
            className="text-red-500 hover:text-red-700 ml-4 text-xs"
            aria-label="ปิด error"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Enroll form ─────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Employee ID input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            รหัสพนักงาน
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="กรอกรหัสพนักงาน แล้วกด Enter"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              data-testid="employee-id-input"
            />
            <button
              type="button"
              onClick={addEmployee}
              className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors whitespace-nowrap"
              data-testid="add-employee-btn"
            >
              เพิ่ม
            </button>
          </div>

          {/* Employee tags */}
          {employeeIds.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {employeeIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs"
                  data-testid="employee-tag"
                >
                  {id}
                  <button
                    type="button"
                    onClick={() => removeEmployee(id)}
                    className="ml-1 text-indigo-400 hover:text-indigo-700 leading-none"
                    aria-label={`ลบ ${id}`}
                    data-testid="remove-employee-tag-btn"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Bulk count indicator */}
          {employeeIds.length > 0 && (
            <p className="text-xs text-gray-400 mt-1" data-testid="bulk-enroll-count">
              {employeeIds.length} คน
            </p>
          )}
        </div>

        {/* Due date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            กำหนดเสร็จ (ถ้ามี)
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            data-testid="due-date-picker"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            หมายเหตุ
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)"
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            data-testid="enrollment-notes-input"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting || employeeIds.length === 0}
          className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="enroll-submit-btn"
        >
          {isSubmitting
            ? 'กำลังมอบหมาย…'
            : `มอบหมาย${employeeIds.length > 0 ? ` (${employeeIds.length} คน)` : ''}`}
        </button>
      </form>

      {/* ── Status timeline ──────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          ประวัติการมอบหมาย
        </h3>

        {/* Loading */}
        {isEnrollmentLoading && (
          <div
            className="text-sm text-gray-400 py-4 text-center"
            data-testid="panel-loading"
          >
            กำลังโหลด…
          </div>
        )}

        {/* Timeline list */}
        {!isEnrollmentLoading && (
          <div
            className="space-y-2 max-h-64 overflow-y-auto"
            data-testid="enrollment-timeline"
          >
            {courseEnrollments.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                ยังไม่มีการมอบหมาย
              </p>
            ) : (
              courseEnrollments.map((enrollment) => (
                <div
                  key={enrollment.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
                  data-testid="timeline-item"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-medium text-gray-800 truncate">
                      {enrollment.employeeId}
                    </p>
                    <p className="text-xs text-gray-400">
                      มอบหมาย {formatDate(enrollment.enrolledAt)}
                      {enrollment.dueDate &&
                        ` · ครบ ${formatDate(enrollment.dueDate)}`}
                    </p>
                  </div>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white ml-3 flex-shrink-0"
                    style={{
                      backgroundColor: TRAINING_STATUS_COLORS[enrollment.status],
                    }}
                    data-testid="enrollment-status-badge"
                  >
                    {TRAINING_STATUS_LABELS[enrollment.status]}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TrainingEnrollmentPanel;
