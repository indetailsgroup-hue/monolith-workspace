/**
 * src/ai-cost/aiCostEstimationTypes.ts
 *
 * MONOLITH v17.5 — AI Cost Estimation Module: TypeScript types
 *
 * Tracks AI tool usage, cost models, task estimates, and ROI for DAPH Decor.
 *
 * Plan Gate: ENTERPRISE
 *
 * Key design decisions:
 *  - Costs stored in both USD (API pricing) and THB (local reporting)
 *  - PER_TOKEN models support separate input/output rates
 *  - ace_usage_logs is append-only (no UPDATE/DELETE from app layer)
 *  - ROI = (manual_cost - ai_cost) / manual_cost × 100
 */

import type { OrgPlan } from '../tenant/types';

// ============================================================================
// ENUM UNIONS (mirror Postgres ENUM types)
// ============================================================================

export type AiTool =
  | 'CHATGPT'
  | 'CLAUDE'
  | 'GEMINI'
  | 'COPILOT'
  | 'MIDJOURNEY'
  | 'STABLE_DIFFUSION'
  | 'CUSTOM_MODEL'
  | 'OTHER';

export type CostUnit =
  | 'PER_TOKEN'       // LLM APIs
  | 'PER_REQUEST'     // flat per-call
  | 'PER_IMAGE'       // image generation
  | 'PER_MINUTE'      // audio/video
  | 'MONTHLY_FLAT';   // subscription cost prorated per task

export type AceTaskCategory =
  | 'DESIGN'
  | 'QUOTATION'
  | 'QUALITY_CHECK'
  | 'PRODUCTION_PLANNING'
  | 'CUSTOMER_SERVICE'
  | 'DOCUMENTATION'
  | 'DATA_ANALYSIS'
  | 'OTHER';

export type AcePeriodType = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

// ============================================================================
// DB ROW TYPES (snake_case — mirrors Supabase columns)
// ============================================================================

export interface CostModelRow {
  id: string;
  org_id: string;
  tool: AiTool;
  display_name: string;
  cost_unit: CostUnit;
  rate_usd: number;
  input_rate_usd: number | null;
  output_rate_usd: number | null;
  thb_exchange_rate: number;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageLogRow {
  id: string;
  org_id: string;
  employee_id: string;
  cost_model_id: string;
  task_category: AceTaskCategory;
  task_ref_id: string | null;
  task_description: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  request_count: number;
  duration_minutes: number | null;
  computed_cost_usd: number;
  computed_cost_thb: number;
  time_saved_minutes: number | null;
  logged_at: string;
  created_at: string;
}

export interface TaskEstimateRow {
  id: string;
  org_id: string;
  created_by: string | null;
  task_category: AceTaskCategory;
  task_description: string;
  task_ref_id: string | null;
  cost_model_ids: string[];
  est_input_tokens: number | null;
  est_output_tokens: number | null;
  est_requests: number;
  est_duration_minutes: number | null;
  est_cost_usd: number;
  est_cost_thb: number;
  manual_cost_thb: number | null;
  manual_time_min: number | null;
  est_roi_pct: number | null;
  actual_cost_usd: number | null;
  actual_cost_thb: number | null;
  actual_roi_pct: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetPeriodRow {
  id: string;
  org_id: string;
  period_type: AcePeriodType;
  period_label: string;
  start_date: string;
  end_date: string;
  budget_usd: number;
  budget_thb: number;
  alert_threshold: number;
  alert_sent: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageSummaryRow {
  org_id: string;
  tool: AiTool;
  model_name: string;
  usage_month: string;
  request_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  total_cost_thb: number;
  total_time_saved_min: number;
  unique_employees: number;
}

export interface TaskRoiRow {
  id: string;
  org_id: string;
  task_category: AceTaskCategory;
  task_description: string;
  est_cost_thb: number;
  manual_cost_thb: number | null;
  est_roi_pct: number | null;
  actual_cost_thb: number | null;
  actual_roi_pct: number | null;
  cost_variance_pct: number | null;
  is_completed: boolean;
  created_at: string;
}

// ============================================================================
// APP-LAYER TYPES (camelCase for React/Zustand layer)
// ============================================================================

export interface AiCostModel {
  id: string;
  orgId: string;
  tool: AiTool;
  displayName: string;
  costUnit: CostUnit;
  rateUsd: number;
  inputRateUsd: number | null;
  outputRateUsd: number | null;
  thbExchangeRate: number;
  isActive: boolean;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiUsageLog {
  id: string;
  orgId: string;
  employeeId: string;
  costModelId: string;
  taskCategory: AceTaskCategory;
  taskRefId: string | null;
  taskDescription: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  requestCount: number;
  durationMinutes: number | null;
  computedCostUsd: number;
  computedCostThb: number;
  timeSavedMinutes: number | null;
  loggedAt: string;
  createdAt: string;
}

export interface AiTaskEstimate {
  id: string;
  orgId: string;
  createdBy: string | null;
  taskCategory: AceTaskCategory;
  taskDescription: string;
  taskRefId: string | null;
  costModelIds: string[];
  estInputTokens: number | null;
  estOutputTokens: number | null;
  estRequests: number;
  estDurationMinutes: number | null;
  estCostUsd: number;
  estCostThb: number;
  manualCostThb: number | null;
  manualTimeMin: number | null;
  estRoiPct: number | null;
  actualCostUsd: number | null;
  actualCostThb: number | null;
  actualRoiPct: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiBudgetPeriod {
  id: string;
  orgId: string;
  periodType: AcePeriodType;
  periodLabel: string;
  startDate: string;
  endDate: string;
  budgetUsd: number;
  budgetThb: number;
  alertThreshold: number;
  alertSent: boolean;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiUsageSummary {
  orgId: string;
  tool: AiTool;
  modelName: string;
  usageMonth: string;
  requestCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalCostThb: number;
  totalTimeSavedMin: number;
  uniqueEmployees: number;
}

export interface AiTaskRoi {
  id: string;
  orgId: string;
  taskCategory: AceTaskCategory;
  taskDescription: string;
  estCostThb: number;
  manualCostThb: number | null;
  estRoiPct: number | null;
  actualCostThb: number | null;
  actualRoiPct: number | null;
  costVariancePct: number | null;
  isCompleted: boolean;
  createdAt: string;
}

// ============================================================================
// PAYLOADS (for store actions)
// ============================================================================

export interface CreateCostModelPayload {
  tool: AiTool;
  displayName: string;
  costUnit: CostUnit;
  rateUsd: number;
  inputRateUsd?: number;
  outputRateUsd?: number;
  thbExchangeRate?: number;
  notes?: string;
}

export interface LogUsagePayload {
  employeeId: string;
  costModelId: string;
  taskCategory: AceTaskCategory;
  taskRefId?: string;
  taskDescription?: string;
  inputTokens?: number;
  outputTokens?: number;
  requestCount?: number;
  durationMinutes?: number;
  timeSavedMinutes?: number;
}

export interface CreateTaskEstimatePayload {
  taskCategory: AceTaskCategory;
  taskDescription: string;
  taskRefId?: string;
  costModelIds: string[];
  estInputTokens?: number;
  estOutputTokens?: number;
  estRequests?: number;
  estDurationMinutes?: number;
  manualCostThb?: number;
  manualTimeMin?: number;
}

export interface UpdateActualsPayload {
  estimateId: string;
  actualCostUsd: number;
  actualCostThb: number;
  actualRoiPct?: number;
}

export interface CreateBudgetPeriodPayload {
  periodType: AcePeriodType;
  periodLabel: string;
  startDate: string;
  endDate: string;
  budgetUsd: number;
  budgetThb: number;
  alertThreshold?: number;
  notes?: string;
}

// ============================================================================
// PLAN GATE
// ============================================================================

/**
 * Returns true if the org plan grants access to AI Cost Estimation.
 * ENTERPRISE only — premium analytics feature.
 */
export function canAccessAiCostEstimation(orgPlan: OrgPlan | string): boolean {
  return orgPlan === 'ENTERPRISE';
}

export class AiCostEstimationPlanGateError extends Error {
  constructor(orgPlan?: string) {
    super(
      `AI Cost Estimation requires ENTERPRISE plan${orgPlan ? ` (current: ${orgPlan})` : ''}`
    );
    this.name = 'AiCostEstimationPlanGateError';
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const AI_COST_PLAN_GATE = 'ENTERPRISE' as const;

/** Display labels for AI tools (Thai) */
export const AI_TOOL_LABEL_TH: Record<AiTool, string> = {
  CHATGPT: 'ChatGPT',
  CLAUDE: 'Claude',
  GEMINI: 'Gemini',
  COPILOT: 'Microsoft Copilot',
  MIDJOURNEY: 'Midjourney',
  STABLE_DIFFUSION: 'Stable Diffusion',
  CUSTOM_MODEL: 'โมเดล AI ภายในองค์กร',
  OTHER: 'อื่นๆ',
};

/** Display labels for cost units (Thai) */
export const COST_UNIT_LABEL_TH: Record<CostUnit, string> = {
  PER_TOKEN: 'ต่อ Token',
  PER_REQUEST: 'ต่อ Request',
  PER_IMAGE: 'ต่อรูปภาพ',
  PER_MINUTE: 'ต่อนาที',
  MONTHLY_FLAT: 'รายเดือน (เฉลี่ยต่องาน)',
};

/** Display labels for task categories (Thai) */
export const TASK_CATEGORY_LABEL_TH: Record<AceTaskCategory, string> = {
  DESIGN: 'งานออกแบบ',
  QUOTATION: 'ใบเสนอราคา',
  QUALITY_CHECK: 'ตรวจสอบคุณภาพ',
  PRODUCTION_PLANNING: 'วางแผนการผลิต',
  CUSTOMER_SERVICE: 'บริการลูกค้า',
  DOCUMENTATION: 'เอกสาร',
  DATA_ANALYSIS: 'วิเคราะห์ข้อมูล',
  OTHER: 'อื่นๆ',
};

/** Ordered AI tools for UI display */
export const AI_TOOL_ORDER: AiTool[] = [
  'CHATGPT',
  'CLAUDE',
  'GEMINI',
  'COPILOT',
  'MIDJOURNEY',
  'STABLE_DIFFUSION',
  'CUSTOM_MODEL',
  'OTHER',
];

/** Default THB/USD exchange rate (updated in cost model, not hardcoded in app) */
export const DEFAULT_THB_EXCHANGE_RATE = 35.0;

// ============================================================================
// FILTERS
// ============================================================================

export interface AiCostFilters {
  tool: AiTool | 'ALL';
  taskCategory: AceTaskCategory | 'ALL';
  /** ISO date string or null for no filter */
  fromDate: string | null;
  toDate: string | null;
  employeeId: string | null;
}

export const DEFAULT_AI_COST_FILTERS: AiCostFilters = {
  tool: 'ALL',
  taskCategory: 'ALL',
  fromDate: null,
  toDate: null,
  employeeId: null,
};

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Computes cost in USD for a PER_TOKEN model.
 * Uses separate input/output rates when available, falls back to rate_usd.
 */
export function computeTokenCostUsd(
  model: Pick<AiCostModel, 'rateUsd' | 'inputRateUsd' | 'outputRateUsd'>,
  inputTokens: number,
  outputTokens: number
): number {
  const inputRate = model.inputRateUsd ?? model.rateUsd;
  const outputRate = model.outputRateUsd ?? model.rateUsd;
  // Rates are typically per 1M tokens
  return (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
}

/**
 * Computes estimated ROI percentage.
 * Returns null if manual cost is not provided or is zero.
 */
export function computeRoiPct(
  manualCostThb: number | null,
  aiCostThb: number
): number | null {
  if (!manualCostThb || manualCostThb <= 0) return null;
  return ((manualCostThb - aiCostThb) / manualCostThb) * 100;
}

/**
 * Converts USD to THB using the model's exchange rate snapshot.
 */
export function usdToThb(usd: number, exchangeRate: number): number {
  return usd * exchangeRate;
}

// ============================================================================
// MAPPERS (DB row → app type)
// ============================================================================

export function mapCostModelRow(row: CostModelRow): AiCostModel {
  return {
    id: row.id,
    orgId: row.org_id,
    tool: row.tool,
    displayName: row.display_name,
    costUnit: row.cost_unit,
    rateUsd: Number(row.rate_usd),
    inputRateUsd: row.input_rate_usd != null ? Number(row.input_rate_usd) : null,
    outputRateUsd: row.output_rate_usd != null ? Number(row.output_rate_usd) : null,
    thbExchangeRate: Number(row.thb_exchange_rate),
    isActive: row.is_active,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapUsageLogRow(row: UsageLogRow): AiUsageLog {
  return {
    id: row.id,
    orgId: row.org_id,
    employeeId: row.employee_id,
    costModelId: row.cost_model_id,
    taskCategory: row.task_category,
    taskRefId: row.task_ref_id,
    taskDescription: row.task_description,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    requestCount: row.request_count,
    durationMinutes: row.duration_minutes != null ? Number(row.duration_minutes) : null,
    computedCostUsd: Number(row.computed_cost_usd),
    computedCostThb: Number(row.computed_cost_thb),
    timeSavedMinutes: row.time_saved_minutes,
    loggedAt: row.logged_at,
    createdAt: row.created_at,
  };
}

export function mapTaskEstimateRow(row: TaskEstimateRow): AiTaskEstimate {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by,
    taskCategory: row.task_category,
    taskDescription: row.task_description,
    taskRefId: row.task_ref_id,
    costModelIds: row.cost_model_ids ?? [],
    estInputTokens: row.est_input_tokens,
    estOutputTokens: row.est_output_tokens,
    estRequests: row.est_requests,
    estDurationMinutes: row.est_duration_minutes != null ? Number(row.est_duration_minutes) : null,
    estCostUsd: Number(row.est_cost_usd),
    estCostThb: Number(row.est_cost_thb),
    manualCostThb: row.manual_cost_thb != null ? Number(row.manual_cost_thb) : null,
    manualTimeMin: row.manual_time_min,
    estRoiPct: row.est_roi_pct != null ? Number(row.est_roi_pct) : null,
    actualCostUsd: row.actual_cost_usd != null ? Number(row.actual_cost_usd) : null,
    actualCostThb: row.actual_cost_thb != null ? Number(row.actual_cost_thb) : null,
    actualRoiPct: row.actual_roi_pct != null ? Number(row.actual_roi_pct) : null,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapBudgetPeriodRow(row: BudgetPeriodRow): AiBudgetPeriod {
  return {
    id: row.id,
    orgId: row.org_id,
    periodType: row.period_type,
    periodLabel: row.period_label,
    startDate: row.start_date,
    endDate: row.end_date,
    budgetUsd: Number(row.budget_usd),
    budgetThb: Number(row.budget_thb),
    alertThreshold: Number(row.alert_threshold),
    alertSent: row.alert_sent,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapUsageSummaryRow(row: UsageSummaryRow): AiUsageSummary {
  return {
    orgId: row.org_id,
    tool: row.tool,
    modelName: row.model_name,
    usageMonth: row.usage_month,
    requestCount: Number(row.request_count),
    totalInputTokens: Number(row.total_input_tokens),
    totalOutputTokens: Number(row.total_output_tokens),
    totalCostUsd: Number(row.total_cost_usd),
    totalCostThb: Number(row.total_cost_thb),
    totalTimeSavedMin: Number(row.total_time_saved_min),
    uniqueEmployees: Number(row.unique_employees),
  };
}

export function mapTaskRoiRow(row: TaskRoiRow): AiTaskRoi {
  return {
    id: row.id,
    orgId: row.org_id,
    taskCategory: row.task_category,
    taskDescription: row.task_description,
    estCostThb: Number(row.est_cost_thb),
    manualCostThb: row.manual_cost_thb != null ? Number(row.manual_cost_thb) : null,
    estRoiPct: row.est_roi_pct != null ? Number(row.est_roi_pct) : null,
    actualCostThb: row.actual_cost_thb != null ? Number(row.actual_cost_thb) : null,
    actualRoiPct: row.actual_roi_pct != null ? Number(row.actual_roi_pct) : null,
    costVariancePct: row.cost_variance_pct != null ? Number(row.cost_variance_pct) : null,
    isCompleted: row.is_completed,
    createdAt: row.created_at,
  };
}
