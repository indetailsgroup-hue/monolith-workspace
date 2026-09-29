/**
 * src/ai-scheduler/aiSchedulerTypes.ts
 *
 * MONOLITH v17.5 — AI Production Scheduler Module: TypeScript types
 *
 * AI-assisted production scheduling for DAPH Decor manufacturing floor.
 * Generates optimised job sequences from pending orders, machine capacity,
 * and delivery deadlines.
 *
 * Plan Gate: ENTERPRISE
 *
 * Key design decisions:
 *  - Runs are immutable once APPROVED (override tracked separately)
 *  - aps_schedule_items dependencies modelled as UUID[] (not a join table)
 *    for simplicity — scheduler engine resolves topological order
 *  - ai_confidence_score (0–100) is AI-reported; humans may override freely
 *  - aps_scheduling_constraints are additive; conflicting constraints resolved
 *    by the AI engine with human fallback
 */

import type { OrgPlan } from '../tenant/types';

// ============================================================================
// ENUM UNIONS (mirror Postgres ENUM types)
// ============================================================================

export type ApsRunStatus =
  | 'DRAFT'
  | 'GENERATING'
  | 'READY'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export type ApsItemStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'SKIPPED'
  | 'BLOCKED';

export type ApsPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type ApsMachineType =
  | 'CNC'
  | 'LASER_CUTTING'
  | 'EDGE_BANDING'
  | 'ASSEMBLY'
  | 'PAINTING'
  | 'QUALITY_CHECK'
  | 'PACKAGING'
  | 'OTHER';

export type ApsScheduleMode =
  | 'AUTO'
  | 'SEMI_AUTO'
  | 'MANUAL_OVERRIDE';

export type ApsConstraintType =
  | 'MACHINE_DOWN'
  | 'DEADLINE_OVERRIDE'
  | 'PRIORITY_OVERRIDE'
  | 'CAPACITY_LIMIT'
  | 'SEQUENCE_LOCK'
  | 'EXCLUDE_JOB'
  | 'CUSTOM';

// ============================================================================
// DB ROW TYPES (snake_case — mirrors Supabase columns)
// ============================================================================

export interface MachineConfigRow {
  id: string;
  org_id: string;
  machine_type: ApsMachineType;
  display_name: string;
  daily_capacity_hrs: number;
  setup_time_min: number;
  max_concurrent_jobs: number;
  scheduling_weight: number;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductionRunRow {
  id: string;
  org_id: string;
  run_label: string;
  schedule_date: string;
  status: ApsRunStatus;
  schedule_mode: ApsScheduleMode;
  ai_model_used: string | null;
  ai_prompt_tokens: number | null;
  ai_run_duration_ms: number | null;
  ai_confidence_score: number | null;
  override_count: number;
  approved_by: string | null;
  approved_at: string | null;
  total_items: number;
  estimated_utilisation_pct: number | null;
  delay_risk_count: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleItemRow {
  id: string;
  org_id: string;
  run_id: string;
  machine_config_id: string | null;
  job_ref_id: string | null;
  job_label: string;
  priority: ApsPriority;
  status: ApsItemStatus;
  scheduled_start: string | null;
  scheduled_end: string | null;
  est_duration_min: number;
  actual_start: string | null;
  actual_end: string | null;
  depends_on: string[];
  ai_rationale: string | null;
  is_overridden: boolean;
  override_reason: string | null;
  sequence_order: number;
  created_at: string;
  updated_at: string;
}

export interface SchedulingConstraintRow {
  id: string;
  org_id: string;
  run_id: string | null;
  constraint_type: ApsConstraintType;
  machine_config_id: string | null;
  job_ref_id: string | null;
  job_ref_id_b: string | null;
  window_start: string | null;
  window_end: string | null;
  capacity_value: number | null;
  priority_value: ApsPriority | null;
  deadline_value: string | null;
  custom_note: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ScheduleSummaryRow {
  run_id: string;
  org_id: string;
  run_label: string;
  schedule_date: string;
  status: ApsRunStatus;
  schedule_mode: ApsScheduleMode;
  ai_confidence_score: number | null;
  override_count: number;
  estimated_utilisation_pct: number | null;
  delay_risk_count: number;
  item_count: number;
  done_count: number;
  blocked_count: number;
  high_priority_count: number;
  created_at: string;
  updated_at: string;
}

export interface MachineUtilisationRow {
  org_id: string;
  machine_config_id: string;
  display_name: string;
  machine_type: ApsMachineType;
  daily_capacity_hrs: number;
  run_id: string;
  schedule_date: string;
  scheduled_item_count: number;
  scheduled_hrs: number;
  utilisation_pct: number;
}

// ============================================================================
// APP-LAYER TYPES (camelCase for React/Zustand layer)
// ============================================================================

export interface ApsMachineConfig {
  id: string;
  orgId: string;
  machineType: ApsMachineType;
  displayName: string;
  dailyCapacityHrs: number;
  setupTimeMin: number;
  maxConcurrentJobs: number;
  schedulingWeight: number;
  isActive: boolean;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApsProductionRun {
  id: string;
  orgId: string;
  runLabel: string;
  scheduleDate: string;
  status: ApsRunStatus;
  scheduleMode: ApsScheduleMode;
  aiModelUsed: string | null;
  aiPromptTokens: number | null;
  aiRunDurationMs: number | null;
  aiConfidenceScore: number | null;
  overrideCount: number;
  approvedBy: string | null;
  approvedAt: string | null;
  totalItems: number;
  estimatedUtilisationPct: number | null;
  delayRiskCount: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApsScheduleItem {
  id: string;
  orgId: string;
  runId: string;
  machineConfigId: string | null;
  jobRefId: string | null;
  jobLabel: string;
  priority: ApsPriority;
  status: ApsItemStatus;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  estDurationMin: number;
  actualStart: string | null;
  actualEnd: string | null;
  dependsOn: string[];
  aiRationale: string | null;
  isOverridden: boolean;
  overrideReason: string | null;
  sequenceOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApsSchedulingConstraint {
  id: string;
  orgId: string;
  runId: string | null;
  constraintType: ApsConstraintType;
  machineConfigId: string | null;
  jobRefId: string | null;
  jobRefIdB: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  capacityValue: number | null;
  priorityValue: ApsPriority | null;
  deadlineValue: string | null;
  customNote: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface ApsScheduleSummary {
  runId: string;
  orgId: string;
  runLabel: string;
  scheduleDate: string;
  status: ApsRunStatus;
  scheduleMode: ApsScheduleMode;
  aiConfidenceScore: number | null;
  overrideCount: number;
  estimatedUtilisationPct: number | null;
  delayRiskCount: number;
  itemCount: number;
  doneCount: number;
  blockedCount: number;
  highPriorityCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApsMachineUtilisation {
  orgId: string;
  machineConfigId: string;
  displayName: string;
  machineType: ApsMachineType;
  dailyCapacityHrs: number;
  runId: string;
  scheduleDate: string;
  scheduledItemCount: number;
  scheduledHrs: number;
  utilisationPct: number;
}

// ============================================================================
// PAYLOADS (for store actions)
// ============================================================================

export interface CreateMachineConfigPayload {
  machineType: ApsMachineType;
  displayName: string;
  dailyCapacityHrs?: number;
  setupTimeMin?: number;
  maxConcurrentJobs?: number;
  schedulingWeight?: number;
  notes?: string;
}

export interface CreateProductionRunPayload {
  runLabel: string;
  scheduleDate: string;  // ISO date "YYYY-MM-DD"
  scheduleMode?: ApsScheduleMode;
  notes?: string;
}

export interface AddScheduleItemPayload {
  runId: string;
  jobLabel: string;
  priority?: ApsPriority;
  machineConfigId?: string;
  jobRefId?: string;
  estDurationMin: number;
  scheduledStart?: string;
  scheduledEnd?: string;
  dependsOn?: string[];
  aiRationale?: string;
  sequenceOrder?: number;
}

export interface UpdateItemStatusPayload {
  itemId: string;
  status: ApsItemStatus;
  actualStart?: string;
  actualEnd?: string;
  overrideReason?: string;
}

export interface CreateConstraintPayload {
  constraintType: ApsConstraintType;
  runId?: string;
  machineConfigId?: string;
  jobRefId?: string;
  jobRefIdB?: string;
  windowStart?: string;
  windowEnd?: string;
  capacityValue?: number;
  priorityValue?: ApsPriority;
  deadlineValue?: string;
  customNote?: string;
}

// ============================================================================
// PLAN GATE
// ============================================================================

/**
 * Returns true if the org plan grants access to AI Production Scheduler.
 * ENTERPRISE only — AI scheduling is a premium feature.
 */
export function canAccessAiScheduler(orgPlan: OrgPlan | string): boolean {
  return orgPlan === 'ENTERPRISE';
}

export class AiSchedulerPlanGateError extends Error {
  public readonly plan: string | undefined;

  constructor(orgPlan?: string) {
    super(
      `AI Production Scheduler requires ENTERPRISE plan${orgPlan ? ` (current: ${orgPlan})` : ''}`
    );
    this.name = 'AiSchedulerPlanGateError';
    this.plan = orgPlan;
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const APS_PLAN_GATE = 'ENTERPRISE' as const;

/** Default machine capacity hours per day */
export const DEFAULT_DAILY_CAPACITY_HRS = 8.0;

/** Default setup time between jobs (minutes) */
export const DEFAULT_SETUP_TIME_MIN = 15;

/** Display labels for run status (Thai) */
export const APS_RUN_STATUS_LABEL_TH: Record<ApsRunStatus, string> = {
  DRAFT:       'แบบร่าง',
  GENERATING:  'กำลังสร้างด้วย AI',
  READY:       'รอการอนุมัติ',
  APPROVED:    'อนุมัติแล้ว',
  IN_PROGRESS: 'กำลังดำเนินการ',
  COMPLETED:   'เสร็จสิ้น',
  CANCELLED:   'ยกเลิก',
  FAILED:      'เกิดข้อผิดพลาด',
};

/** Display labels for item status (Thai) */
export const APS_ITEM_STATUS_LABEL_TH: Record<ApsItemStatus, string> = {
  PENDING:     'รอดำเนินการ',
  IN_PROGRESS: 'กำลังดำเนินการ',
  DONE:        'เสร็จสิ้น',
  SKIPPED:     'ข้ามรายการ',
  BLOCKED:     'ติดขัด',
};

/** Display labels for priority (Thai) */
export const APS_PRIORITY_LABEL_TH: Record<ApsPriority, string> = {
  LOW:    'ต่ำ',
  NORMAL: 'ปกติ',
  HIGH:   'สูง',
  URGENT: 'เร่งด่วน',
};

/** Display labels for machine type (Thai) */
export const APS_MACHINE_TYPE_LABEL_TH: Record<ApsMachineType, string> = {
  CNC:           'CNC',
  LASER_CUTTING: 'เลเซอร์ตัด',
  EDGE_BANDING:  'ขอบแถบ',
  ASSEMBLY:      'ประกอบ',
  PAINTING:      'ทำสี',
  QUALITY_CHECK: 'ตรวจสอบคุณภาพ',
  PACKAGING:     'บรรจุภัณฑ์',
  OTHER:         'อื่นๆ',
};

/** Display labels for schedule mode (Thai) */
export const APS_SCHEDULE_MODE_LABEL_TH: Record<ApsScheduleMode, string> = {
  AUTO:            'AI สร้างอัตโนมัติ',
  SEMI_AUTO:       'AI + ปรับด้วยมือ',
  MANUAL_OVERRIDE: 'ปรับด้วยมือทั้งหมด',
};

/** Display labels for constraint type (Thai) */
export const APS_CONSTRAINT_TYPE_LABEL_TH: Record<ApsConstraintType, string> = {
  MACHINE_DOWN:       'เครื่องหยุดซ่อมบำรุง',
  DEADLINE_OVERRIDE:  'กำหนดส่งพิเศษ',
  PRIORITY_OVERRIDE:  'ปรับลำดับความสำคัญ',
  CAPACITY_LIMIT:     'จำกัดงานพร้อมกัน',
  SEQUENCE_LOCK:      'ลำดับงานตายตัว',
  EXCLUDE_JOB:        'ยกเว้นงานนี้',
  CUSTOM:             'เงื่อนไขพิเศษ',
};

// ============================================================================
// FILTERS
// ============================================================================

export interface ApsFilters {
  status: ApsRunStatus | 'ALL';
  scheduleMode: ApsScheduleMode | 'ALL';
  fromDate: string | null;
  toDate: string | null;
  machineConfigId: string | null;
}

export const DEFAULT_APS_FILTERS: ApsFilters = {
  status: 'ALL',
  scheduleMode: 'ALL',
  fromDate: null,
  toDate: null,
  machineConfigId: null,
};

// ============================================================================
// MAPPERS (DB row → app type)
// ============================================================================

export function mapMachineConfigRow(row: MachineConfigRow): ApsMachineConfig {
  return {
    id: row.id,
    orgId: row.org_id,
    machineType: row.machine_type,
    displayName: row.display_name,
    dailyCapacityHrs: Number(row.daily_capacity_hrs),
    setupTimeMin: row.setup_time_min,
    maxConcurrentJobs: row.max_concurrent_jobs,
    schedulingWeight: Number(row.scheduling_weight),
    isActive: row.is_active,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProductionRunRow(row: ProductionRunRow): ApsProductionRun {
  return {
    id: row.id,
    orgId: row.org_id,
    runLabel: row.run_label,
    scheduleDate: row.schedule_date,
    status: row.status,
    scheduleMode: row.schedule_mode,
    aiModelUsed: row.ai_model_used,
    aiPromptTokens: row.ai_prompt_tokens,
    aiRunDurationMs: row.ai_run_duration_ms,
    aiConfidenceScore: row.ai_confidence_score != null ? Number(row.ai_confidence_score) : null,
    overrideCount: row.override_count,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    totalItems: row.total_items,
    estimatedUtilisationPct: row.estimated_utilisation_pct != null
      ? Number(row.estimated_utilisation_pct)
      : null,
    delayRiskCount: row.delay_risk_count,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapScheduleItemRow(row: ScheduleItemRow): ApsScheduleItem {
  return {
    id: row.id,
    orgId: row.org_id,
    runId: row.run_id,
    machineConfigId: row.machine_config_id,
    jobRefId: row.job_ref_id,
    jobLabel: row.job_label,
    priority: row.priority,
    status: row.status,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    estDurationMin: row.est_duration_min,
    actualStart: row.actual_start,
    actualEnd: row.actual_end,
    dependsOn: row.depends_on ?? [],
    aiRationale: row.ai_rationale,
    isOverridden: row.is_overridden,
    overrideReason: row.override_reason,
    sequenceOrder: row.sequence_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSchedulingConstraintRow(row: SchedulingConstraintRow): ApsSchedulingConstraint {
  return {
    id: row.id,
    orgId: row.org_id,
    runId: row.run_id,
    constraintType: row.constraint_type,
    machineConfigId: row.machine_config_id,
    jobRefId: row.job_ref_id,
    jobRefIdB: row.job_ref_id_b,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    capacityValue: row.capacity_value,
    priorityValue: row.priority_value,
    deadlineValue: row.deadline_value,
    customNote: row.custom_note,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function mapScheduleSummaryRow(row: ScheduleSummaryRow): ApsScheduleSummary {
  return {
    runId: row.run_id,
    orgId: row.org_id,
    runLabel: row.run_label,
    scheduleDate: row.schedule_date,
    status: row.status,
    scheduleMode: row.schedule_mode,
    aiConfidenceScore: row.ai_confidence_score != null ? Number(row.ai_confidence_score) : null,
    overrideCount: row.override_count,
    estimatedUtilisationPct: row.estimated_utilisation_pct != null
      ? Number(row.estimated_utilisation_pct)
      : null,
    delayRiskCount: row.delay_risk_count,
    itemCount: Number(row.item_count),
    doneCount: Number(row.done_count),
    blockedCount: Number(row.blocked_count),
    highPriorityCount: Number(row.high_priority_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMachineUtilisationRow(row: MachineUtilisationRow): ApsMachineUtilisation {
  return {
    orgId: row.org_id,
    machineConfigId: row.machine_config_id,
    displayName: row.display_name,
    machineType: row.machine_type,
    dailyCapacityHrs: Number(row.daily_capacity_hrs),
    runId: row.run_id,
    scheduleDate: row.schedule_date,
    scheduledItemCount: Number(row.scheduled_item_count),
    scheduledHrs: Number(row.scheduled_hrs),
    utilisationPct: Number(row.utilisation_pct),
  };
}
