/**
 * people/types.ts — People Module Types for MONOLITH Manufacturing OS
 *
 * Covers the P2 (People) dimension of the 2S2P1C framework.
 * Grounded in SLR findings: People (89%) is the #1 success factor
 * for AI-era organizational transformation.
 *
 * Key concepts:
 * - Employee: org member (may or may not have a MONOLITH login)
 * - Skill: org-defined competency, categorized, AI-aware
 * - EmployeeSkill: junction — who has which skill at what level
 * - TrainingRecord: planned or completed learning activities
 * - SuperEmployeeProgress: tracks AI-augmentation journey (SLR: "Super Employees")
 */

import type { OrgRole } from '../tenant/types';

// ============================================================================
// Primitive Unions
// ============================================================================

/** Proficiency level for a skill assessment */
export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';

/** Numeric weight for SkillLevel — used in gap analysis calculations */
export const SKILL_LEVEL_SCORE: Record<SkillLevel, number> = {
  BEGINNER: 1,
  INTERMEDIATE: 2,
  ADVANCED: 3,
  EXPERT: 4,
};

/** Taxonomy of skills relevant to a manufacturing org */
export type SkillCategory =
  | 'TECHNICAL'    // e.g., CNC Operation, AutoCAD, Nesting Software
  | 'SOFT'         // e.g., Client Communication, Problem Solving
  | 'AI_TOOL'      // e.g., AI Estimator, ChatGPT, MONOLITH AI-Assist
  | 'PROCESS'      // e.g., QC Checklist, Material Handling, Installation
  | 'MANAGEMENT';  // e.g., Job Scheduling, Team Coordination

/** How training was delivered */
export type TrainingType = 'INTERNAL' | 'EXTERNAL' | 'ONLINE' | 'ON_JOB' | 'COACHING';

/** Lifecycle of a training activity */
export type TrainingStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

/**
 * AI-augmentation journey stages — based on SLR finding:
 * "Super Employees" (AI-augmented workers) reduce resource usage by 8–33×
 * and can work across traditional role boundaries.
 */
export type SuperEmployeeStage =
  | 'AI_UNAWARE'     // ยังไม่รู้จัก AI tools
  | 'AI_AWARE'       // รู้จักแต่ยังไม่ได้ใช้จริง
  | 'AI_ASSISTED'    // ใช้ AI ช่วยทำงานบ้าง (ยังต้องมีคนดูแล)
  | 'AI_PARTNER'     // ทำงานร่วมกับ AI อย่างสม่ำเสมอ
  | 'SUPER_EMPLOYEE'; // AI-augmented เต็มรูปแบบ ทำงานข้ามบทบาทได้

/** Score weight per stage — used in org-level "AI Readiness" metric */
export const SUPER_EMPLOYEE_STAGE_SCORE: Record<SuperEmployeeStage, number> = {
  AI_UNAWARE: 0,
  AI_AWARE: 25,
  AI_ASSISTED: 50,
  AI_PARTNER: 75,
  SUPER_EMPLOYEE: 100,
};

/** Display label (Thai) per stage */
export const SUPER_EMPLOYEE_STAGE_LABEL_TH: Record<SuperEmployeeStage, string> = {
  AI_UNAWARE: 'ยังไม่รู้จัก AI',
  AI_AWARE: 'รู้จัก AI แล้ว',
  AI_ASSISTED: 'ใช้ AI ช่วยงาน',
  AI_PARTNER: 'ทำงานร่วมกับ AI',
  SUPER_EMPLOYEE: 'Super Employee',
};

// ============================================================================
// Core Domain Types
// ============================================================================

/**
 * Employee — a person working in the org.
 * May or may not have a MONOLITH auth account (user_id is optional).
 * Factory workers, installers, and part-timers can be tracked
 * without giving them platform access.
 */
export interface Employee {
  /** UUID primary key */
  id: string;
  /** Org this employee belongs to (tenant isolation) */
  orgId: string;
  /**
   * Linked MONOLITH user account.
   * null → tracked in People module but cannot log in.
   */
  userId: string | null;
  /** Full name (Thai or English) */
  name: string;
  /** Primary role within the org */
  role: OrgRole;
  /** Optional grouping (e.g., "Factory Floor", "Design Studio", "On-Site") */
  department: string | null;
  /** ISO date string e.g. "2024-03-15" */
  hireDate: string | null;
  avatarUrl: string | null;
  /** Active employees show up in assignment lists etc. */
  isActive: boolean;
  /** Current position in the Super Employee journey */
  superEmployeeStage: SuperEmployeeStage;
  /** Optional short code displayed on employee cards (e.g. "EMP001") */
  employeeCode?: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Skill — org-defined competency catalogue.
 * Each org curates its own skill list relevant to its products and workflows.
 */
export interface Skill {
  id: string;
  orgId: string;
  name: string;
  /** Short description of what the skill entails */
  description: string | null;
  category: SkillCategory;
  /**
   * Which roles are expected to have this skill.
   * Used to generate role-level required skill sets.
   */
  roleRelevance: OrgRole[];
  /** True → this skill involves using an AI tool */
  isAiSkill: boolean;
  /**
   * If isAiSkill, what is the minimum required level for "AI Partner" stage?
   * e.g., INTERMEDIATE means staff need at least intermediate proficiency
   * in this AI tool to progress beyond AI_ASSISTED.
   */
  aiPartnerThreshold: SkillLevel | null;
  createdAt: string;
}

/**
 * EmployeeSkill — junction between Employee and Skill with assessed proficiency.
 */
export interface EmployeeSkill {
  id: string;
  employeeId: string;
  skillId: string;
  level: SkillLevel;
  /** Employee who conducted the assessment (null = self-assessed) */
  assessedBy: string | null;
  assessedAt: string | null;
  notes: string | null;
}

/** EmployeeSkill with the full Skill object embedded — used in UI */
export interface EmployeeSkillWithDetails extends EmployeeSkill {
  skill: Skill;
}

/**
 * TrainingRecord — a planned or completed learning activity.
 * Links to the skills it develops, enabling gap-close tracking.
 */
export interface TrainingRecord {
  id: string;
  employeeId: string;
  orgId: string;
  title: string;
  type: TrainingType;
  /** Skills this training is expected to develop */
  skillIds: string[];
  status: TrainingStatus;
  startDate: string | null;
  endDate: string | null;
  /** Training duration in hours */
  hours: number | null;
  /** URL to certificate PDF / image (Supabase Storage or external) */
  certificateUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * SuperEmployeeProgress — milestone log for each stage transition.
 * Immutable audit trail — one record per stage advancement.
 */
export interface SuperEmployeeProgress {
  id: string;
  employeeId: string;
  orgId: string;
  stage: SuperEmployeeStage;
  /** Timestamp when this stage was reached */
  stageDate: string;
  /** AI tools being used at this milestone */
  aiToolsUsed: string[];
  /**
   * % productivity increase since previous stage (optional, self-reported or manager-set).
   * SLR finding: Super Employees reduce resource usage by 8–33× vs traditional employees.
   */
  productivityDelta: number | null;
  /**
   * Number of jobs completed in a cross-role capacity.
   * e.g., DESIGNER doing their own FACTORY QC check (because AI assists).
   */
  jobsCrossRole: number;
  notes: string | null;
}

// ============================================================================
// Derived / Computed Types (used by store selectors)
// ============================================================================

/** Full employee record with skills and progress — used in EmployeeProfile */
export interface EmployeeWithSkills extends Employee {
  skills: EmployeeSkillWithDetails[];
  trainingRecords: TrainingRecord[];
  progressHistory: SuperEmployeeProgress[];
}

/** One row in the Skill Gap Analysis table */
export interface SkillGapItem {
  skill: Skill;
  requiredLevel: SkillLevel;
  actualLevel: SkillLevel | null;  // null = skill not assessed / missing
  /** Numeric gap: requiredScore − actualScore. Positive = gap exists. */
  gap: number;
  /** Training records targeting this skill */
  relatedTraining: TrainingRecord[];
}

/** Full gap analysis for one employee */
export interface SkillGapAnalysis {
  employee: Employee;
  /** All required skills for this employee's role */
  items: SkillGapItem[];
  /** 0–100. 100 = no gaps at all */
  coverageScore: number;
}

/** One row in the org-wide skills matrix */
export interface SkillMatrixRow {
  skill: Skill;
  /** employee_id → level map for every employee who has this skill */
  employeeLevels: Record<string, SkillLevel>;
  /** Count of employees with at least INTERMEDIATE */
  proficientCount: number;
  /** Count of employees who need this skill (by role) but don't have it */
  gapCount: number;
}

/** Summary metrics for the People dashboard */
export interface PeopleDashboardMetrics {
  totalEmployees: number;
  activeEmployees: number;
  avgSuperEmployeeScore: number;   // 0–100
  superEmployeeCount: number;      // employees at SUPER_EMPLOYEE stage
  aiPartnerCount: number;          // at AI_PARTNER or above
  trainingCompletionRate: number;  // 0–100
  skillCoverageRate: number;       // % of role-required skills that are covered
  topSkillGaps: Array<{ skillName: string; gapCount: number }>;
}

// ============================================================================
// Filter / Pagination State
// ============================================================================

export interface EmployeeFilters {
  search: string;
  role: OrgRole | 'ALL';
  department: string | 'ALL';
  superEmployeeStage: SuperEmployeeStage | 'ALL';
  isActive: boolean | 'ALL';
}

export const DEFAULT_EMPLOYEE_FILTERS: EmployeeFilters = {
  search: '',
  role: 'ALL',
  department: 'ALL',
  superEmployeeStage: 'ALL',
  isActive: true,
};

// ============================================================================
// Database Row Types (snake_case — mirrors Supabase/Postgres schema)
// ============================================================================

/** Raw Supabase row for `employees` table */
export interface EmployeeRow {
  id: string;
  org_id: string;
  user_id: string | null;
  name: string;
  role: string;
  department: string | null;
  hire_date: string | null;
  avatar_url: string | null;
  is_active: boolean;
  super_employee_stage: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Raw Supabase row for `skills` table */
export interface SkillRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  category: string;
  role_relevance: string[];
  is_ai_skill: boolean;
  ai_partner_threshold: string | null;
  created_at: string;
}

/** Raw Supabase row for `employee_skills` table */
export interface EmployeeSkillRow {
  id: string;
  employee_id: string;
  skill_id: string;
  level: string;
  assessed_by: string | null;
  assessed_at: string | null;
  notes: string | null;
}

/** Raw Supabase row for `training_records` table */
export interface TrainingRecordRow {
  id: string;
  employee_id: string;
  org_id: string;
  title: string;
  type: string;
  skill_ids: string[];
  status: string;
  start_date: string | null;
  end_date: string | null;
  hours: number | null;
  certificate_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Raw Supabase row for `super_employee_progress` table */
export interface SuperEmployeeProgressRow {
  id: string;
  employee_id: string;
  org_id: string;
  stage: string;
  stage_date: string;
  ai_tools_used: string[];
  productivity_delta: number | null;
  jobs_cross_role: number;
  notes: string | null;
}

// ============================================================================
// Row → Domain Mappers
// ============================================================================

export function mapEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    name: row.name,
    role: row.role as OrgRole,
    department: row.department,
    hireDate: row.hire_date,
    avatarUrl: row.avatar_url,
    isActive: row.is_active,
    superEmployeeStage: row.super_employee_stage as SuperEmployeeStage,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    description: row.description,
    category: row.category as SkillCategory,
    roleRelevance: row.role_relevance as OrgRole[],
    isAiSkill: row.is_ai_skill,
    aiPartnerThreshold: (row.ai_partner_threshold as SkillLevel) ?? null,
    createdAt: row.created_at,
  };
}

export function mapEmployeeSkill(row: EmployeeSkillRow): EmployeeSkill {
  return {
    id: row.id,
    employeeId: row.employee_id,
    skillId: row.skill_id,
    level: row.level as SkillLevel,
    assessedBy: row.assessed_by,
    assessedAt: row.assessed_at,
    notes: row.notes,
  };
}

export function mapTrainingRecord(row: TrainingRecordRow): TrainingRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    orgId: row.org_id,
    title: row.title,
    type: row.type as TrainingType,
    skillIds: row.skill_ids,
    status: row.status as TrainingStatus,
    startDate: row.start_date,
    endDate: row.end_date,
    hours: row.hours,
    certificateUrl: row.certificate_url,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSuperEmployeeProgress(row: SuperEmployeeProgressRow): SuperEmployeeProgress {
  return {
    id: row.id,
    employeeId: row.employee_id,
    orgId: row.org_id,
    stage: row.stage as SuperEmployeeStage,
    stageDate: row.stage_date,
    aiToolsUsed: row.ai_tools_used,
    productivityDelta: row.productivity_delta,
    jobsCrossRole: row.jobs_cross_role,
    notes: row.notes,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Returns employees filtered by the given criteria.
 * Pure function — safe to call in selectors.
 */
export function filterEmployees(
  employees: Employee[],
  filters: EmployeeFilters
): Employee[] {
  return employees.filter((e) => {
    if (filters.isActive !== 'ALL' && e.isActive !== filters.isActive) return false;
    if (filters.role !== 'ALL' && e.role !== filters.role) return false;
    if (filters.department !== 'ALL' && e.department !== filters.department) return false;
    if (filters.superEmployeeStage !== 'ALL' && e.superEmployeeStage !== filters.superEmployeeStage) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!e.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

/**
 * Computes the Skill Gap Analysis for one employee.
 * Returns null if the employee has no role-required skills defined.
 */
export function computeSkillGap(
  employee: Employee,
  allSkills: Skill[],
  employeeSkills: EmployeeSkill[],
  trainingRecords: TrainingRecord[]
): SkillGapAnalysis {
  // Skills required for this employee's role
  const requiredSkills = allSkills.filter((s) =>
    s.roleRelevance.includes(employee.role)
  );

  // Index employee skills by skillId for fast lookup
  const skillMap = new Map(employeeSkills.map((es) => [es.skillId, es]));

  let totalRequired = 0;
  let totalCovered = 0;

  const items: SkillGapItem[] = requiredSkills.map((skill) => {
    const assessed = skillMap.get(skill.id);
    // "Required" = at least INTERMEDIATE for standard skills; ADVANCED for AI skills
    const requiredLevel: SkillLevel = skill.isAiSkill ? 'INTERMEDIATE' : 'INTERMEDIATE';
    const actualLevel = assessed?.level ?? null;
    const requiredScore = SKILL_LEVEL_SCORE[requiredLevel];
    const actualScore = actualLevel ? SKILL_LEVEL_SCORE[actualLevel] : 0;
    const gap = Math.max(0, requiredScore - actualScore);

    totalRequired++;
    if (gap === 0) totalCovered++;

    const relatedTraining = trainingRecords.filter(
      (t) => t.skillIds.includes(skill.id) && t.status !== 'CANCELLED'
    );

    return { skill, requiredLevel, actualLevel, gap, relatedTraining };
  });

  const coverageScore = totalRequired === 0 ? 100 : Math.round((totalCovered / totalRequired) * 100);

  return { employee, items, coverageScore };
}

/**
 * Computes org-level People dashboard metrics.
 */
export function computePeopleDashboardMetrics(
  employees: Employee[],
  allSkills: Skill[],
  allEmployeeSkills: EmployeeSkill[],
  trainingRecords: TrainingRecord[]
): PeopleDashboardMetrics {
  const active = employees.filter((e) => e.isActive);
  const superEmployees = active.filter((e) => e.superEmployeeStage === 'SUPER_EMPLOYEE');
  const aiPartners = active.filter(
    (e) => SUPER_EMPLOYEE_STAGE_SCORE[e.superEmployeeStage] >= SUPER_EMPLOYEE_STAGE_SCORE['AI_PARTNER']
  );

  const avgScore =
    active.length === 0
      ? 0
      : Math.round(
          active.reduce((sum, e) => sum + SUPER_EMPLOYEE_STAGE_SCORE[e.superEmployeeStage], 0) /
            active.length
        );

  const completed = trainingRecords.filter((t) => t.status === 'COMPLETED').length;
  const totalTraining = trainingRecords.filter(
    (t) => t.status !== 'CANCELLED'
  ).length;
  const trainingCompletionRate = totalTraining === 0 ? 0 : Math.round((completed / totalTraining) * 100);

  // Skill coverage: for each required skill, does at least one active employee have it?
  const requiredSkills = allSkills.filter((s) => s.roleRelevance.length > 0);
  const coveredSkillIds = new Set(allEmployeeSkills.map((es) => es.skillId));
  const skillCoverageRate =
    requiredSkills.length === 0
      ? 100
      : Math.round((requiredSkills.filter((s) => coveredSkillIds.has(s.id)).length / requiredSkills.length) * 100);

  // Top skill gaps: skills most employees are missing
  const gapCountMap = new Map<string, number>();
  for (const skill of requiredSkills) {
    const coveredByActive = allEmployeeSkills.filter(
      (es) =>
        es.skillId === skill.id &&
        active.some((e) => e.id === es.employeeId)
    ).length;
    const neededCount = active.filter((e) => skill.roleRelevance.includes(e.role)).length;
    const gap = Math.max(0, neededCount - coveredByActive);
    if (gap > 0) gapCountMap.set(skill.id, gap);
  }

  const topSkillGaps = Array.from(gapCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([skillId, gapCount]) => ({
      skillName: allSkills.find((s) => s.id === skillId)?.name ?? skillId,
      gapCount,
    }));

  return {
    totalEmployees: employees.length,
    activeEmployees: active.length,
    avgSuperEmployeeScore: avgScore,
    superEmployeeCount: superEmployees.length,
    aiPartnerCount: aiPartners.length,
    trainingCompletionRate,
    skillCoverageRate,
    topSkillGaps,
  };
}

/**
 * Returns the distinct list of departments across all employees.
 * Used to populate the department filter dropdown.
 */
export function getUniqueDepartments(employees: Employee[]): string[] {
  return Array.from(
    new Set(employees.map((e) => e.department).filter((d): d is string => d !== null))
  ).sort();
}

/**
 * Returns the next SuperEmployeeStage for an employee.
 * Returns null if already at SUPER_EMPLOYEE.
 */
export function getNextStage(current: SuperEmployeeStage): SuperEmployeeStage | null {
  const stages: SuperEmployeeStage[] = [
    'AI_UNAWARE',
    'AI_AWARE',
    'AI_ASSISTED',
    'AI_PARTNER',
    'SUPER_EMPLOYEE',
  ];
  const idx = stages.indexOf(current);
  return idx < stages.length - 1 ? stages[idx + 1] : null;
}

/**
 * AiStage — alias for SuperEmployeeStage.
 * Used by SuperEmployeeProgressCard for clarity in AI progression context.
 */
export type AiStage = SuperEmployeeStage;
