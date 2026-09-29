/**
 * src/training/superEmployeeTypes.ts
 *
 * MONOLITH v17.5 — Super Employee Tracker: AI Readiness Stage Progression
 *
 * Type definitions, constants, and utilities for the Super Employee Tracker
 * module — tracks each employee's journey through the 5 AI Readiness stages
 * defined in src/people/types.ts.
 *
 * Plan Gate: PROFESSIONAL+
 *
 * Stage progression:
 *   AI_UNAWARE (0) → AI_AWARE (25) → AI_ASSISTED (50) → AI_PARTNER (75) → SUPER_EMPLOYEE (100)
 */

import type { SuperEmployeeStage } from '../people/types';
import type { OrgPlan } from '../tenant/types';

// ============================================================================
// DB ROW TYPES (snake_case mirrors Supabase columns)
// ============================================================================

/** Raw row from employee_ai_assessments table */
export interface AiAssessmentRow {
  id: string;
  org_id: string;
  employee_id: string;
  assessor_id: string;
  stage_at_assessment: SuperEmployeeStage;
  score: number;
  strengths: string[];
  gaps: string[];
  ai_tools_used: string[];
  completed_at: string;
  created_at: string;
}

/** Raw row from employee_stage_history table */
export interface StageHistoryRow {
  id: string;
  org_id: string;
  employee_id: string;
  stage: SuperEmployeeStage;
  stage_score: number;
  assessment_id: string | null;
  changed_by: string;
  notes: string | null;
  scored_at: string;
  created_at: string;
}

/** Raw row from employee_skill_gaps table */
export interface SkillGapRow {
  id: string;
  org_id: string;
  employee_id: string;
  stage_required: SuperEmployeeStage;
  skill_name: string;
  skill_description: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

/** Row from employee_ai_readiness_v view */
export interface EmployeeReadinessRow {
  org_id: string;
  employee_id: string;
  current_stage: SuperEmployeeStage;
  current_score: number;
  last_assessed_at: string | null;
}

/** Row from org_ai_readiness_summary_v view */
export interface OrgReadinessSummaryRow {
  org_id: string;
  total_employees: number;
  ai_unaware_count: number;
  ai_aware_count: number;
  ai_assisted_count: number;
  ai_partner_count: number;
  super_employee_count: number;
  avg_score: number;
  ai_readiness_rate: number;
}

// ============================================================================
// APP-LAYER TYPES (camelCase for React/Zustand layer)
// ============================================================================

export interface AiAssessment {
  id: string;
  orgId: string;
  employeeId: string;
  assessorId: string;
  stageAtAssessment: SuperEmployeeStage;
  score: number;
  strengths: string[];
  gaps: string[];
  aiToolsUsed: string[];
  completedAt: string;
  createdAt: string;
}

export interface StageHistoryEntry {
  id: string;
  orgId: string;
  employeeId: string;
  stage: SuperEmployeeStage;
  stageScore: number;
  assessmentId: string | null;
  changedBy: string;
  notes: string | null;
  scoredAt: string;
  createdAt: string;
}

export interface SkillGap {
  id: string;
  orgId: string;
  employeeId: string;
  stageRequired: SuperEmployeeStage;
  skillName: string;
  skillDescription: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export interface EmployeeAiReadiness {
  orgId: string;
  employeeId: string;
  currentStage: SuperEmployeeStage;
  currentScore: number;
  lastAssessedAt: string | null;
}

export interface OrgAiReadinessSummary {
  orgId: string;
  totalEmployees: number;
  stageDistribution: Record<SuperEmployeeStage, number>;
  avgScore: number;
  superEmployeeCount: number;
  aiReadinessRate: number; // % of AI_ASSISTED and above
}

// ============================================================================
// PAYLOADS (for store actions)
// ============================================================================

export interface RecordStageTransitionPayload {
  employeeId: string;
  stage: SuperEmployeeStage;
  assessmentId?: string;
  notes?: string;
  /** Defaults to NOW() if omitted */
  scoredAt?: string;
}

export interface CreateAssessmentPayload {
  employeeId: string;
  assessorId: string;
  stageAtAssessment: SuperEmployeeStage;
  score: number;
  strengths?: string[];
  gaps?: string[];
  aiToolsUsed?: string[];
  completedAt?: string;
}

export interface AddSkillGapPayload {
  employeeId: string;
  stageRequired: SuperEmployeeStage;
  skillName: string;
  skillDescription?: string;
}

// ============================================================================
// PLAN GATE
// ============================================================================

/**
 * Returns true if the org plan grants access to the Super Employee Tracker.
 * PROFESSIONAL or ENTERPRISE required (same gate as Training Tracker).
 */
export function canAccessSuperEmployeeTracker(orgPlan: OrgPlan | string): boolean {
  return orgPlan === 'PROFESSIONAL' || orgPlan === 'ENTERPRISE';
}

export class SuperEmployeeTrackerPlanGateError extends Error {
  constructor(orgPlan?: string) {
    super(
      `Super Employee Tracker requires PROFESSIONAL+ plan${orgPlan ? ` (current: ${orgPlan})` : ''}`
    );
    this.name = 'SuperEmployeeTrackerPlanGateError';
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Stages at or above this threshold count toward org AI Readiness Rate.
 * Mirrors AI_READINESS_SCORE_THRESHOLD = 50 (score at AI_ASSISTED).
 */
export const AI_READINESS_THRESHOLD_STAGE: SuperEmployeeStage = 'AI_ASSISTED';
export const AI_READINESS_SCORE_THRESHOLD = 50;

/** Stage scores map — kept in sync with SUPER_EMPLOYEE_STAGE_SCORE in people/types.ts */
export const STAGE_SCORE_MAP: Record<SuperEmployeeStage, number> = {
  AI_UNAWARE: 0,
  AI_AWARE: 25,
  AI_ASSISTED: 50,
  AI_PARTNER: 75,
  SUPER_EMPLOYEE: 100,
};

/** Ordered stage progression (index = advancement order) */
export const STAGE_PROGRESSION_ORDER: SuperEmployeeStage[] = [
  'AI_UNAWARE',
  'AI_AWARE',
  'AI_ASSISTED',
  'AI_PARTNER',
  'SUPER_EMPLOYEE',
];

/** Returns the next stage in the progression, or null if already at the top */
export function getNextStage(current: SuperEmployeeStage): SuperEmployeeStage | null {
  const idx = STAGE_PROGRESSION_ORDER.indexOf(current);
  return idx >= 0 && idx < STAGE_PROGRESSION_ORDER.length - 1
    ? STAGE_PROGRESSION_ORDER[idx + 1]
    : null;
}

/** Returns true if `candidate` is strictly higher than `current` */
export function isStageAdvancement(
  current: SuperEmployeeStage,
  candidate: SuperEmployeeStage
): boolean {
  return (
    STAGE_PROGRESSION_ORDER.indexOf(candidate) >
    STAGE_PROGRESSION_ORDER.indexOf(current)
  );
}

// ============================================================================
// MAPPERS (DB row → app type)
// ============================================================================

export function mapAssessmentRow(row: AiAssessmentRow): AiAssessment {
  return {
    id: row.id,
    orgId: row.org_id,
    employeeId: row.employee_id,
    assessorId: row.assessor_id,
    stageAtAssessment: row.stage_at_assessment,
    score: row.score,
    strengths: row.strengths ?? [],
    gaps: row.gaps ?? [],
    aiToolsUsed: row.ai_tools_used ?? [],
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export function mapStageHistoryRow(row: StageHistoryRow): StageHistoryEntry {
  return {
    id: row.id,
    orgId: row.org_id,
    employeeId: row.employee_id,
    stage: row.stage,
    stageScore: row.stage_score,
    assessmentId: row.assessment_id,
    changedBy: row.changed_by,
    notes: row.notes,
    scoredAt: row.scored_at,
    createdAt: row.created_at,
  };
}

export function mapSkillGapRow(row: SkillGapRow): SkillGap {
  return {
    id: row.id,
    orgId: row.org_id,
    employeeId: row.employee_id,
    stageRequired: row.stage_required,
    skillName: row.skill_name,
    skillDescription: row.skill_description,
    resolved: row.resolved,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

export function mapReadinessRow(row: EmployeeReadinessRow): EmployeeAiReadiness {
  return {
    orgId: row.org_id,
    employeeId: row.employee_id,
    currentStage: row.current_stage,
    currentScore: row.current_score,
    lastAssessedAt: row.last_assessed_at,
  };
}

export function mapOrgSummaryRow(row: OrgReadinessSummaryRow): OrgAiReadinessSummary {
  return {
    orgId: row.org_id,
    totalEmployees: Number(row.total_employees),
    stageDistribution: {
      AI_UNAWARE: Number(row.ai_unaware_count),
      AI_AWARE: Number(row.ai_aware_count),
      AI_ASSISTED: Number(row.ai_assisted_count),
      AI_PARTNER: Number(row.ai_partner_count),
      SUPER_EMPLOYEE: Number(row.super_employee_count),
    },
    avgScore: Number(row.avg_score),
    superEmployeeCount: Number(row.super_employee_count),
    aiReadinessRate: Number(row.ai_readiness_rate),
  };
}
