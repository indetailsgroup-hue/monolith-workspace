/**
 * src/training/trainingTypes.ts
 *
 * MONOLITH v17.5 — Training Tracker Module Types
 *
 * Plan Gate: PROFESSIONAL+ (same tier as Bottleneck Heatmap)
 *
 * Schema: supabase/migrations/20270101_training_tracker.sql
 *
 * Module purpose:
 *   Enables DAPH Decor managers to define training courses, enrol employees,
 *   and track completions — with optional linkage to the Super Employee
 *   (AI Readiness) stage progression system.
 */

import type { OrgPlan } from '../tenant/types';
import type { SuperEmployeeStage } from '../people/types';

// ============================================================================
// PLAN GATE
// ============================================================================

/**
 * Training Tracker is gated at PROFESSIONAL+.
 * This constant is used in component-level plan gate checks.
 */
export const TRAINING_PLAN_GATE = 'PROFESSIONAL' as const;
export type TrainingPlanGate = typeof TRAINING_PLAN_GATE;

/** Returns true if the org's plan meets PROFESSIONAL+ */
export function canAccessTrainingTracker(orgPlan: OrgPlan): boolean {
  return orgPlan === 'PROFESSIONAL' || orgPlan === 'ENTERPRISE';
}

// ============================================================================
// TRAINING COURSE CATEGORY
// ============================================================================

export type TrainingCourseCategory =
  | 'SAFETY'       // ความปลอดภัย / Safety
  | 'QUALITY'      // คุณภาพ / QC
  | 'TECHNICAL'    // ทักษะเทคนิค / Technical Skills
  | 'LEADERSHIP'   // ผู้นำ / Leadership
  | 'COMPLIANCE'   // กฎระเบียบ / Compliance
  | 'ONBOARDING'   // เริ่มงานใหม่ / Onboarding
  | 'AI_LITERACY'  // ความรู้ AI — linked to SuperEmployeeStage progression
  | 'CUSTOM';      // org-defined

export const TRAINING_CATEGORY_LABELS: Record<TrainingCourseCategory, string> = {
  SAFETY:      'ความปลอดภัย',
  QUALITY:     'คุณภาพ / QC',
  TECHNICAL:   'ทักษะเทคนิค',
  LEADERSHIP:  'ผู้นำ',
  COMPLIANCE:  'กฎระเบียบ',
  ONBOARDING:  'เริ่มงานใหม่',
  AI_LITERACY: 'ความรู้ AI',
  CUSTOM:      'กำหนดเอง',
};

export const TRAINING_CATEGORY_ICONS: Record<TrainingCourseCategory, string> = {
  SAFETY:      '🦺',
  QUALITY:     '✅',
  TECHNICAL:   '⚙️',
  LEADERSHIP:  '👤',
  COMPLIANCE:  '📋',
  ONBOARDING:  '🚀',
  AI_LITERACY: '🤖',
  CUSTOM:      '✏️',
};

// ============================================================================
// TRAINING STATUS
// ============================================================================

export type TrainingStatus =
  | 'ENROLLED'     // assigned but not started
  | 'IN_PROGRESS'  // employee has started
  | 'COMPLETED'    // completion record exists
  | 'CANCELLED';   // removed / no longer required

export const TRAINING_STATUS_LABELS: Record<TrainingStatus, string> = {
  ENROLLED:    'มอบหมายแล้ว',
  IN_PROGRESS: 'กำลังเรียน',
  COMPLETED:   'สำเร็จแล้ว',
  CANCELLED:   'ยกเลิก',
};

export const TRAINING_STATUS_COLORS: Record<TrainingStatus, string> = {
  ENROLLED:    '#6b7280',  // gray
  IN_PROGRESS: '#f59e0b',  // amber
  COMPLETED:   '#22c55e',  // green
  CANCELLED:   '#ef4444',  // red
};

// ============================================================================
// TRAINING COURSE
// ============================================================================

export interface TrainingCourse {
  id: string;                               // UUID
  orgId: string | null;                     // null = global seed course
  title: string;
  description?: string;
  category: TrainingCourseCategory;
  planGate: OrgPlan;                        // minimum plan; always 'PROFESSIONAL' for this module
  durationHours: number | null;             // estimated completion time
  passingScore: number | null;              // 0–100; null = no assessment (auto-pass)
  requiredForStage: SuperEmployeeStage | null;
  // If set, this course must be completed before advancing past that stage.
  // e.g. requiredForStage = 'AI_PARTNER' → required to reach SUPER_EMPLOYEE
  isActive: boolean;
  isGlobal: boolean;
  version: number;
  tags: string[];
  externalUrl?: string;                     // LMS or external link
  thumbnailUrl?: string;                    // cover image
  createdBy?: string;                       // userId
  createdAt: string;                        // ISO
  updatedAt: string;
}

/** Input for creating/updating a training course */
export interface TrainingCourseInput {
  title: string;
  description?: string;
  category: TrainingCourseCategory;
  durationHours?: number;
  passingScore?: number;
  requiredForStage?: SuperEmployeeStage | null;
  tags?: string[];
  externalUrl?: string;
  thumbnailUrl?: string;
}

/** Summary row for course list views */
export type TrainingCourseSummary = Omit<TrainingCourse, 'description' | 'externalUrl' | 'thumbnailUrl'>;

// ============================================================================
// TRAINING ENROLLMENT
// ============================================================================

export interface TrainingEnrollment {
  id: string;                               // UUID
  orgId: string;
  courseId: string;
  employeeId: string;
  enrolledBy?: string;                      // userId of ADMIN/OWNER who enrolled
  enrolledAt: string;                       // ISO
  dueDate?: string | null;                  // ISO date string (YYYY-MM-DD)
  status: TrainingStatus;
  notes?: string;
  updatedAt: string;
  // Populated when fetched with joins
  course?: TrainingCourseSummary;
}

/** Input for creating a new enrolment */
export interface TrainingEnrollmentInput {
  courseId: string;
  employeeId: string;
  dueDate?: string;
  notes?: string;
}

/** Input for bulk-enrolling multiple employees in one course */
export interface BulkEnrollmentInput {
  courseId: string;
  employeeIds: string[];
  dueDate?: string;
  notes?: string;
}

// ============================================================================
// TRAINING COMPLETION
// ============================================================================

export interface TrainingCompletion {
  id: string;                               // UUID
  orgId: string;
  courseId: string;
  enrollmentId: string;
  employeeId: string;
  completedAt: string;                      // ISO
  score: number | null;                     // 0–100; null if no assessment
  isPassed: boolean | null;                 // null = pending score entry
  evidenceUrl?: string;                     // link to certificate / photo / LMS export
  evidenceNotes?: string;
  verifiedBy?: string;                      // userId of verifier
  verifiedAt?: string;                      // ISO
  notes?: string;
  createdAt: string;
}

/** Input for recording a training completion */
export interface TrainingCompletionInput {
  enrollmentId: string;
  courseId: string;
  employeeId: string;
  completedAt?: string;                     // defaults to now()
  score?: number;
  evidenceUrl?: string;
  evidenceNotes?: string;
  notes?: string;
}

/** Input for verifying a completion record */
export interface TrainingVerificationInput {
  completionId: string;
  verifiedBy: string;
  verifiedAt?: string;
}

// ============================================================================
// TRAINING SUMMARY (from training_summary_v view)
// ============================================================================

/** Per-employee training progress aggregate */
export interface TrainingEmployeeSummary {
  orgId: string;
  employeeId: string;
  totalEnrolled: number;
  totalCompleted: number;
  totalInProgress: number;
  totalCancelled: number;
  totalOverdue: number;
  completionRatePct: number | null;
  lastCompletedAt: string | null;           // ISO
}

/** Per-course aggregate stats (from training_course_stats_v view) */
export interface TrainingCourseStats {
  orgId: string;
  courseId: string;
  courseTitle: string;
  category: TrainingCourseCategory;
  requiredForStage: SuperEmployeeStage | null;
  totalEnrolled: number;
  totalCompleted: number;
  completionRatePct: number | null;
  avgScore: number | null;
  totalPassed: number;
  totalFailed: number;
}

// ============================================================================
// FILTERS
// ============================================================================

export interface TrainingCourseFilters {
  category?: TrainingCourseCategory | null;
  requiredForStage?: SuperEmployeeStage | null;
  isActive?: boolean;
  isGlobal?: boolean;
  search?: string;                          // fuzzy match on title/description
}

export const DEFAULT_TRAINING_COURSE_FILTERS: TrainingCourseFilters = {
  category: null,
  requiredForStage: null,
  isActive: true,
  isGlobal: undefined,
  search: '',
};

export interface TrainingEnrollmentFilters {
  status?: TrainingStatus | null;
  courseId?: string | null;
  employeeId?: string | null;
  overdueOnly?: boolean;
}

export const DEFAULT_ENROLLMENT_FILTERS: TrainingEnrollmentFilters = {
  status: null,
  courseId: null,
  employeeId: null,
  overdueOnly: false,
};

// ============================================================================
// TRAINING TRACKER STORE STATE (Zustand)
// ============================================================================

export interface TrainingTrackerState {
  /** Course catalogue for the current org (org-specific + global) */
  courses: TrainingCourseSummary[];
  /** Currently selected course (with full description / metadata) */
  selectedCourse: TrainingCourse | null;
  courseFilters: TrainingCourseFilters;

  /** Enrolments for the current org */
  enrollments: TrainingEnrollment[];
  enrollmentFilters: TrainingEnrollmentFilters;

  /** Completions for the current org (loaded on demand) */
  completions: TrainingCompletion[];

  /** Per-employee summary stats */
  employeeSummaries: TrainingEmployeeSummary[];
  /** Per-course stats */
  courseStats: TrainingCourseStats[];

  isLoading: boolean;
  isEnrollmentLoading: boolean;
  error: string | null;
}
