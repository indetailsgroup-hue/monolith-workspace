/**
 * src/training/TrainingCourseList.tsx
 *
 * MONOLITH v17.5 — Training Tracker: Course List UI
 *
 * Features:
 *  - Search input (debounced 300 ms)
 *  - Category filter dropdown (8 categories)
 *  - SuperEmployeeStage filter (requiredForStage)
 *  - isActive checkbox filter
 *  - Course cards: icon, title, duration, passing score, stage badge, plan gate badge, global badge
 *  - Enroll button per card (ADMIN+ only)
 *  - Loading skeleton (6 cards) + empty state + error banner
 *
 * Plan Gate: PROFESSIONAL+ (gated via canAccessTrainingTracker)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTrainingStore } from './trainingStore';
import {
  canAccessTrainingTracker,
  TRAINING_CATEGORY_LABELS,
  TRAINING_CATEGORY_ICONS,
  TRAINING_PLAN_GATE,
  type TrainingCourseCategory,
  type TrainingCourseSummary,
} from './trainingTypes';
import { SUPER_EMPLOYEE_STAGE_LABEL_TH } from '../people/types';
import type { SuperEmployeeStage } from '../people/types';
import type { OrgPlan } from '../tenant/types';

// ============================================================================
// TYPES
// ============================================================================

export interface TrainingCourseListProps {
  orgId: string;
  orgPlan: OrgPlan;
  /** Called when a course card is selected for detail view */
  onSelectCourse?: (course: TrainingCourseSummary) => void;
  /** Called when admin clicks Enroll on a course card */
  onEnroll?: (course: TrainingCourseSummary) => void;
  /** Show admin actions (enroll button) — ADMIN+ only */
  isAdmin?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

const ALL_STAGES: SuperEmployeeStage[] = [
  'AI_UNAWARE',
  'AI_AWARE',
  'AI_ASSISTED',
  'AI_PARTNER',
  'SUPER_EMPLOYEE',
];

const STAGE_BADGE_CLASSES: Record<SuperEmployeeStage, string> = {
  AI_UNAWARE:     'bg-gray-100 text-gray-600',
  AI_AWARE:       'bg-blue-100 text-blue-700',
  AI_ASSISTED:    'bg-indigo-100 text-indigo-700',
  AI_PARTNER:     'bg-violet-100 text-violet-700',
  SUPER_EMPLOYEE: 'bg-amber-100 text-amber-700',
};

function SkeletonCard() {
  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse"
      data-testid="course-skeleton"
    >
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
      <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-1/4" />
    </div>
  );
}

// ============================================================================
// COURSE CARD
// ============================================================================

interface CourseCardProps {
  course: TrainingCourseSummary;
  isAdmin: boolean;
  onSelect: (c: TrainingCourseSummary) => void;
  onEnroll: (c: TrainingCourseSummary) => void;
}

function CourseCard({ course, isAdmin, onSelect, onEnroll }: CourseCardProps) {
  const icon = TRAINING_CATEGORY_ICONS[course.category] ?? '📚';
  const categoryLabel = TRAINING_CATEGORY_LABELS[course.category] ?? course.category;

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 transition-shadow hover:shadow-md cursor-pointer"
      data-testid="course-card"
      data-course-id={course.id}
      onClick={() => onSelect(course)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl flex-shrink-0" aria-hidden="true">
            {icon}
          </span>
          <span
            className="font-medium text-gray-900 truncate"
            data-testid="course-title"
          >
            {course.title}
          </span>
        </div>

        {/* Plan gate badge */}
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 flex-shrink-0"
          data-testid="plan-gate-badge"
        >
          {TRAINING_PLAN_GATE}+
        </span>
      </div>

      {/* Category + global tag */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-gray-500">{categoryLabel}</span>
        {course.isGlobal && (
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700"
            data-testid="global-badge"
          >
            Global
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
        {course.durationHours != null && (
          <span data-testid="course-duration">
            ⏱ {course.durationHours} ชม.
          </span>
        )}
        {course.passingScore != null && (
          <span data-testid="course-passing-score">
            🎯 ผ่าน {course.passingScore}%
          </span>
        )}
        <span>v{course.version}</span>
      </div>

      {/* Tags */}
      {course.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {course.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Required stage badge */}
      {course.requiredForStage && (
        <div className="mb-3">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${STAGE_BADGE_CLASSES[course.requiredForStage]}`}
            data-testid="required-stage-badge"
          >
            🧠 {SUPER_EMPLOYEE_STAGE_LABEL_TH[course.requiredForStage]}
          </span>
        </div>
      )}

      {/* Enroll button — admin only */}
      {isAdmin && (
        <div className="mt-1">
          <button
            type="button"
            className="w-full text-sm text-center py-1.5 px-3 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
            data-testid="enroll-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEnroll(course);
            }}
          >
            มอบหมาย
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TrainingCourseList({
  orgId,
  orgPlan,
  onSelectCourse,
  onEnroll,
  isAdmin = false,
}: TrainingCourseListProps) {
  const {
    courses,
    courseFilters,
    isLoading,
    error,
    fetchCourses,
    setCourseFilters,
    clearError,
  } = useTrainingStore();

  // ── Search debounce ──────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState(courseFilters.search ?? '');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchInput(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setCourseFilters({ search: value });
      }, 300);
    },
    [setCourseFilters]
  );

  // ── Initial load + filter-triggered refetch ──────────────────────────────
  useEffect(() => {
    if (canAccessTrainingTracker(orgPlan)) {
      fetchCourses(orgId, courseFilters);
    }
  }, [orgId, orgPlan, courseFilters, fetchCourses]);

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
          อัปเกรดแผนเพื่อสร้างหลักสูตร มอบหมายการฝึกอบรม
          และติดตาม Super Employee Stage ของทีม
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="training-course-list">
      {/* ── Filters bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
            🔍
          </span>
          <input
            type="search"
            placeholder="ค้นหาหลักสูตร…"
            value={searchInput}
            onChange={handleSearchChange}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            data-testid="course-search-input"
          />
        </div>

        {/* Category filter */}
        <select
          value={courseFilters.category ?? ''}
          onChange={(e) =>
            setCourseFilters({ category: (e.target.value as TrainingCourseCategory) || null })
          }
          className="py-2 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          data-testid="category-filter"
        >
          <option value="">ทุกหมวดหมู่</option>
          {(Object.keys(TRAINING_CATEGORY_LABELS) as TrainingCourseCategory[]).map((cat) => (
            <option key={cat} value={cat}>
              {TRAINING_CATEGORY_ICONS[cat]} {TRAINING_CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>

        {/* SuperEmployeeStage filter */}
        <select
          value={courseFilters.requiredForStage ?? ''}
          onChange={(e) =>
            setCourseFilters({
              requiredForStage: (e.target.value as SuperEmployeeStage) || null,
            })
          }
          className="py-2 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          data-testid="stage-filter"
        >
          <option value="">ทุก Stage</option>
          {ALL_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {SUPER_EMPLOYEE_STAGE_LABEL_TH[stage]}
            </option>
          ))}
        </select>

        {/* isActive filter */}
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={courseFilters.isActive ?? true}
            onChange={(e) => setCourseFilters({ isActive: e.target.checked })}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
            data-testid="active-filter-checkbox"
          />
          เฉพาะหลักสูตรที่ใช้งาน
        </label>

        {/* Result count */}
        <span className="text-sm text-gray-400 ml-auto">
          {courses.length} หลักสูตร
        </span>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"
          data-testid="error-banner"
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

      {/* ── Loading skeleton ──────────────────────────────────────────────── */}
      {isLoading && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="course-loading"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* ── Course grid ───────────────────────────────────────────────────── */}
      {!isLoading && courses.length > 0 && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="course-grid"
        >
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              isAdmin={isAdmin}
              onSelect={onSelectCourse ?? (() => {})}
              onEnroll={onEnroll ?? (() => {})}
            />
          ))}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!isLoading && courses.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-16 text-center"
          data-testid="course-empty-state"
        >
          <span className="text-4xl mb-4">📚</span>
          <h3 className="text-base font-medium text-gray-700 mb-1">
            ยังไม่มีหลักสูตร
          </h3>
          <p className="text-sm text-gray-400">
            {courseFilters.category
              ? `ไม่พบหลักสูตรในหมวดหมู่ "${TRAINING_CATEGORY_LABELS[courseFilters.category]}"`
              : courseFilters.requiredForStage
              ? `ไม่พบหลักสูตรสำหรับ Stage "${SUPER_EMPLOYEE_STAGE_LABEL_TH[courseFilters.requiredForStage]}"`
              : 'สร้างหลักสูตรแรก หรือรอ Global Courses จาก MONOLITH'}
          </p>
        </div>
      )}
    </div>
  );
}

export default TrainingCourseList;
