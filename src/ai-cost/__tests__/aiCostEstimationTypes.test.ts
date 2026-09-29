/**
 * src/ai-cost/__tests__/aiCostEstimationTypes.test.ts
 *
 * MONOLITH v17.5 — AI Cost Estimation Types
 * Framework: Vitest (pure unit — no Supabase mock needed)
 *
 * Coverage:
 *  - AiCostEstimationPlanGateError — name, message, instanceof checks
 *  - canAccessAiCostEstimation — all 4 OrgPlan values
 *  - AI_COST_PLAN_GATE constant value
 *  - computeTokenCostUsd — separate input/output rates; fallback to rateUsd
 *  - computeRoiPct — normal, null manualCost, zero manualCost
 *  - usdToThb — basic conversion + fractional amounts
 *  - DEFAULT_AI_COST_FILTERS — all 5 default fields
 *  - Label constants completeness — AI_TOOL_LABEL_TH, COST_UNIT_LABEL_TH, TASK_CATEGORY_LABEL_TH
 *  - All 6 mappers — snake_case → camelCase field mappings
 *    (mapCostModelRow, mapUsageLogRow, mapTaskEstimateRow,
 *     mapBudgetPeriodRow, mapUsageSummaryRow, mapTaskRoiRow)
 */

import { describe, it, expect } from 'vitest';
import {
  AiCostEstimationPlanGateError,
  canAccessAiCostEstimation,
  AI_COST_PLAN_GATE,
  computeTokenCostUsd,
  computeRoiPct,
  usdToThb,
  DEFAULT_AI_COST_FILTERS,
  AI_TOOL_LABEL_TH,
  COST_UNIT_LABEL_TH,
  TASK_CATEGORY_LABEL_TH,
  mapCostModelRow,
  mapUsageLogRow,
  mapTaskEstimateRow,
  mapBudgetPeriodRow,
  mapUsageSummaryRow,
  mapTaskRoiRow,
} from '../aiCostEstimationTypes';
import type {
  CostModelRow,
  UsageLogRow,
  TaskEstimateRow,
  BudgetPeriodRow,
  UsageSummaryRow,
  TaskRoiRow,
} from '../aiCostEstimationTypes';

// ============================================================================
// ROW FACTORIES
// ============================================================================

function makeCostModelRow(overrides: Partial<CostModelRow> = {}): CostModelRow {
  return {
    id: 'cm-001',
    org_id: 'org-001',
    tool: 'CHATGPT',
    display_name: 'GPT-4o',
    cost_unit: 'PER_TOKEN',
    rate_usd: 0.005,
    input_rate_usd: 0.003,
    output_rate_usd: 0.015,
    thb_exchange_rate: 35.0,
    is_active: true,
    notes: null,
    created_by: 'user-001',
    created_at: '2027-01-01T00:00:00Z',
    updated_at: '2027-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeUsageLogRow(overrides: Partial<UsageLogRow> = {}): UsageLogRow {
  return {
    id: 'ul-001',
    org_id: 'org-001',
    employee_id: 'emp-001',
    cost_model_id: 'cm-001',
    task_category: 'DESIGN',
    task_ref_id: 'task-ref-001',
    task_description: 'สร้างภาพออกแบบผลิตภัณฑ์',
    input_tokens: 500,
    output_tokens: 1000,
    request_count: 1,
    duration_minutes: null,
    computed_cost_usd: 0.01,
    computed_cost_thb: 0.35,
    time_saved_minutes: 30,
    logged_at: '2027-01-15T10:00:00Z',
    created_at: '2027-01-15T10:00:00Z',
    ...overrides,
  };
}

function makeTaskEstimateRow(overrides: Partial<TaskEstimateRow> = {}): TaskEstimateRow {
  return {
    id: 'te-001',
    org_id: 'org-001',
    created_by: 'user-001',
    task_category: 'QUOTATION',
    task_description: 'ประเมินราคาออเดอร์ลูกค้า',
    task_ref_id: null,
    cost_model_ids: ['cm-001'],
    est_input_tokens: 1000,
    est_output_tokens: 2000,
    est_requests: 1,
    est_duration_minutes: null,
    est_cost_usd: 0.033,
    est_cost_thb: 1.155,
    manual_cost_thb: 200,
    manual_time_min: 60,
    est_roi_pct: 99.42,
    actual_cost_usd: null,
    actual_cost_thb: null,
    actual_roi_pct: null,
    completed_at: null,
    created_at: '2027-01-15T09:00:00Z',
    updated_at: '2027-01-15T09:00:00Z',
    ...overrides,
  };
}

function makeBudgetPeriodRow(overrides: Partial<BudgetPeriodRow> = {}): BudgetPeriodRow {
  return {
    id: 'bp-001',
    org_id: 'org-001',
    period_type: 'MONTHLY',
    period_label: 'มกราคม 2027',
    start_date: '2027-01-01',
    end_date: '2027-01-31',
    budget_usd: 100,
    budget_thb: 3500,
    alert_threshold: 0.8,
    alert_sent: false,
    notes: null,
    created_by: 'user-001',
    created_at: '2027-01-01T00:00:00Z',
    updated_at: '2027-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeUsageSummaryRow(overrides: Partial<UsageSummaryRow> = {}): UsageSummaryRow {
  return {
    org_id: 'org-001',
    tool: 'CLAUDE',
    model_name: 'Claude 3.5 Sonnet',
    usage_month: '2027-01',
    request_count: 150,
    total_input_tokens: 300000,
    total_output_tokens: 150000,
    total_cost_usd: 4.5,
    total_cost_thb: 157.5,
    total_time_saved_min: 900,
    unique_employees: 5,
    ...overrides,
  };
}

function makeTaskRoiRow(overrides: Partial<TaskRoiRow> = {}): TaskRoiRow {
  return {
    id: 'tr-001',
    org_id: 'org-001',
    task_category: 'DATA_ANALYSIS',
    task_description: 'วิเคราะห์ข้อมูลการผลิตรายเดือน',
    est_cost_thb: 50,
    manual_cost_thb: 500,
    est_roi_pct: 90,
    actual_cost_thb: 45,
    actual_roi_pct: 91,
    cost_variance_pct: -10,
    is_completed: true,
    created_at: '2027-01-10T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// AiCostEstimationPlanGateError
// ============================================================================

describe('AiCostEstimationPlanGateError', () => {
  it('has name = AiCostEstimationPlanGateError', () => {
    const err = new AiCostEstimationPlanGateError('PROFESSIONAL');
    expect(err.name).toBe('AiCostEstimationPlanGateError');
  });

  it('includes "ENTERPRISE" in message', () => {
    const err = new AiCostEstimationPlanGateError();
    expect(err.message).toContain('ENTERPRISE');
  });

  it('includes current plan in message when provided', () => {
    const err = new AiCostEstimationPlanGateError('PROFESSIONAL');
    expect(err.message).toContain('ENTERPRISE');
    expect(err.message).toContain('PROFESSIONAL');
  });

  it('works without plan argument', () => {
    const err = new AiCostEstimationPlanGateError();
    expect(err.message).toContain('ENTERPRISE');
    expect(err.name).toBe('AiCostEstimationPlanGateError');
  });

  it('is instanceof Error', () => {
    const err = new AiCostEstimationPlanGateError('FREE');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AiCostEstimationPlanGateError);
  });
});

// ============================================================================
// canAccessAiCostEstimation
// ============================================================================

describe('canAccessAiCostEstimation', () => {
  it.each([
    ['FREE', false],
    ['STARTER', false],
    ['PROFESSIONAL', false],
    ['ENTERPRISE', true],
  ])('plan=%s → %s', (plan, expected) => {
    expect(canAccessAiCostEstimation(plan)).toBe(expected);
  });
});

// ============================================================================
// AI_COST_PLAN_GATE constant
// ============================================================================

describe('AI_COST_PLAN_GATE', () => {
  it("equals 'ENTERPRISE'", () => {
    expect(AI_COST_PLAN_GATE).toBe('ENTERPRISE');
  });
});

// ============================================================================
// computeTokenCostUsd
// ============================================================================

describe('computeTokenCostUsd', () => {
  it('uses separate inputRateUsd and outputRateUsd when both are provided', () => {
    const model = { rateUsd: 0.005, inputRateUsd: 0.003, outputRateUsd: 0.015 };
    // (500 × 0.003 + 1000 × 0.015) / 1_000_000 = (1.5 + 15) / 1_000_000 = 0.0000165
    const result = computeTokenCostUsd(model, 500, 1000);
    expect(result).toBeCloseTo(0.0000165, 10);
  });

  it('falls back to rateUsd for both when inputRateUsd and outputRateUsd are null', () => {
    const model = { rateUsd: 0.01, inputRateUsd: null, outputRateUsd: null };
    // (1000 × 0.01 + 2000 × 0.01) / 1_000_000 = 30 / 1_000_000 = 0.00003
    const result = computeTokenCostUsd(model, 1000, 2000);
    expect(result).toBeCloseTo(0.00003, 10);
  });

  it('uses inputRateUsd for input and falls back to rateUsd for output when only inputRateUsd is set', () => {
    const model = { rateUsd: 0.008, inputRateUsd: 0.003, outputRateUsd: null };
    // input: 1000 × 0.003 = 3; output: 500 × 0.008 = 4 → (3 + 4) / 1_000_000
    const result = computeTokenCostUsd(model, 1000, 500);
    expect(result).toBeCloseTo(7 / 1_000_000, 10);
  });

  it('returns 0 for zero tokens', () => {
    const model = { rateUsd: 0.01, inputRateUsd: 0.003, outputRateUsd: 0.015 };
    expect(computeTokenCostUsd(model, 0, 0)).toBe(0);
  });
});

// ============================================================================
// computeRoiPct
// ============================================================================

describe('computeRoiPct', () => {
  it('computes correct ROI percentage', () => {
    // ROI = (200 - 2) / 200 × 100 = 99%
    const result = computeRoiPct(200, 2);
    expect(result).toBeCloseTo(99, 5);
  });

  it('returns null when manualCostThb is null', () => {
    expect(computeRoiPct(null, 10)).toBeNull();
  });

  it('returns null when manualCostThb is 0 (avoids division by zero)', () => {
    expect(computeRoiPct(0, 5)).toBeNull();
  });

  it('returns negative ROI when AI cost exceeds manual cost', () => {
    // ROI = (50 - 100) / 50 × 100 = -100%
    const result = computeRoiPct(50, 100);
    expect(result).toBeCloseTo(-100, 5);
  });

  it('returns 0 when costs are equal', () => {
    expect(computeRoiPct(100, 100)).toBeCloseTo(0, 5);
  });
});

// ============================================================================
// usdToThb
// ============================================================================

describe('usdToThb', () => {
  it('converts USD to THB at given exchange rate', () => {
    expect(usdToThb(1, 35)).toBe(35);
    expect(usdToThb(10, 35)).toBe(350);
  });

  it('handles fractional USD amounts', () => {
    expect(usdToThb(0.5, 36)).toBeCloseTo(18, 10);
  });

  it('returns 0 for 0 USD', () => {
    expect(usdToThb(0, 35)).toBe(0);
  });
});

// ============================================================================
// DEFAULT_AI_COST_FILTERS
// ============================================================================

describe('DEFAULT_AI_COST_FILTERS', () => {
  it('has tool = ALL', () => {
    expect(DEFAULT_AI_COST_FILTERS.tool).toBe('ALL');
  });

  it('has taskCategory = ALL', () => {
    expect(DEFAULT_AI_COST_FILTERS.taskCategory).toBe('ALL');
  });

  it('has fromDate = null', () => {
    expect(DEFAULT_AI_COST_FILTERS.fromDate).toBeNull();
  });

  it('has toDate = null', () => {
    expect(DEFAULT_AI_COST_FILTERS.toDate).toBeNull();
  });

  it('has employeeId = null', () => {
    expect(DEFAULT_AI_COST_FILTERS.employeeId).toBeNull();
  });
});

// ============================================================================
// Label constants completeness
// ============================================================================

describe('AI_TOOL_LABEL_TH', () => {
  const expectedTools = [
    'CHATGPT', 'CLAUDE', 'GEMINI', 'COPILOT',
    'MIDJOURNEY', 'STABLE_DIFFUSION', 'CUSTOM_MODEL', 'OTHER',
  ] as const;

  it.each(expectedTools)('has label for %s', (tool) => {
    expect(AI_TOOL_LABEL_TH[tool]).toBeTruthy();
    expect(typeof AI_TOOL_LABEL_TH[tool]).toBe('string');
  });

  it('covers all 8 AiTool values', () => {
    expect(Object.keys(AI_TOOL_LABEL_TH)).toHaveLength(8);
  });
});

describe('COST_UNIT_LABEL_TH', () => {
  const expectedUnits = [
    'PER_TOKEN', 'PER_REQUEST', 'PER_IMAGE', 'PER_MINUTE', 'MONTHLY_FLAT',
  ] as const;

  it.each(expectedUnits)('has label for %s', (unit) => {
    expect(COST_UNIT_LABEL_TH[unit]).toBeTruthy();
  });

  it('covers all 5 CostUnit values', () => {
    expect(Object.keys(COST_UNIT_LABEL_TH)).toHaveLength(5);
  });
});

describe('TASK_CATEGORY_LABEL_TH', () => {
  const expectedCategories = [
    'DESIGN', 'QUOTATION', 'QUALITY_CHECK', 'PRODUCTION_PLANNING',
    'CUSTOMER_SERVICE', 'DOCUMENTATION', 'DATA_ANALYSIS', 'OTHER',
  ] as const;

  it.each(expectedCategories)('has label for %s', (cat) => {
    expect(TASK_CATEGORY_LABEL_TH[cat]).toBeTruthy();
  });

  it('covers all 8 AceTaskCategory values', () => {
    expect(Object.keys(TASK_CATEGORY_LABEL_TH)).toHaveLength(8);
  });
});

// ============================================================================
// mapCostModelRow
// ============================================================================

describe('mapCostModelRow', () => {
  it('maps all snake_case fields to camelCase', () => {
    const row = makeCostModelRow();
    const model = mapCostModelRow(row);

    expect(model.id).toBe(row.id);
    expect(model.orgId).toBe(row.org_id);
    expect(model.tool).toBe(row.tool);
    expect(model.displayName).toBe(row.display_name);
    expect(model.costUnit).toBe(row.cost_unit);
    expect(model.rateUsd).toBe(Number(row.rate_usd));
    expect(model.inputRateUsd).toBe(Number(row.input_rate_usd));
    expect(model.outputRateUsd).toBe(Number(row.output_rate_usd));
    expect(model.thbExchangeRate).toBe(Number(row.thb_exchange_rate));
    expect(model.isActive).toBe(row.is_active);
    expect(model.notes).toBe(row.notes);
    expect(model.createdBy).toBe(row.created_by);
    expect(model.createdAt).toBe(row.created_at);
    expect(model.updatedAt).toBe(row.updated_at);
  });

  it('maps null input/output rates to null (not 0)', () => {
    const row = makeCostModelRow({ input_rate_usd: null, output_rate_usd: null });
    const model = mapCostModelRow(row);
    expect(model.inputRateUsd).toBeNull();
    expect(model.outputRateUsd).toBeNull();
  });
});

// ============================================================================
// mapUsageLogRow
// ============================================================================

describe('mapUsageLogRow', () => {
  it('maps all fields to camelCase correctly', () => {
    const row = makeUsageLogRow();
    const log = mapUsageLogRow(row);

    expect(log.id).toBe(row.id);
    expect(log.orgId).toBe(row.org_id);
    expect(log.employeeId).toBe(row.employee_id);
    expect(log.costModelId).toBe(row.cost_model_id);
    expect(log.taskCategory).toBe(row.task_category);
    expect(log.taskRefId).toBe(row.task_ref_id);
    expect(log.taskDescription).toBe(row.task_description);
    expect(log.inputTokens).toBe(row.input_tokens);
    expect(log.outputTokens).toBe(row.output_tokens);
    expect(log.requestCount).toBe(row.request_count);
    expect(log.computedCostUsd).toBe(Number(row.computed_cost_usd));
    expect(log.computedCostThb).toBe(Number(row.computed_cost_thb));
    expect(log.timeSavedMinutes).toBe(row.time_saved_minutes);
    expect(log.loggedAt).toBe(row.logged_at);
    expect(log.createdAt).toBe(row.created_at);
  });

  it('maps null duration_minutes to null', () => {
    const row = makeUsageLogRow({ duration_minutes: null });
    expect(mapUsageLogRow(row).durationMinutes).toBeNull();
  });

  it('maps numeric duration_minutes to number', () => {
    const row = makeUsageLogRow({ duration_minutes: 15 });
    expect(mapUsageLogRow(row).durationMinutes).toBe(15);
  });
});

// ============================================================================
// mapTaskEstimateRow
// ============================================================================

describe('mapTaskEstimateRow', () => {
  it('maps all required fields to camelCase', () => {
    const row = makeTaskEstimateRow();
    const estimate = mapTaskEstimateRow(row);

    expect(estimate.id).toBe(row.id);
    expect(estimate.orgId).toBe(row.org_id);
    expect(estimate.createdBy).toBe(row.created_by);
    expect(estimate.taskCategory).toBe(row.task_category);
    expect(estimate.taskDescription).toBe(row.task_description);
    expect(estimate.taskRefId).toBe(row.task_ref_id);
    expect(estimate.costModelIds).toEqual(row.cost_model_ids);
    expect(estimate.estCostUsd).toBe(Number(row.est_cost_usd));
    expect(estimate.estCostThb).toBe(Number(row.est_cost_thb));
    expect(estimate.manualCostThb).toBe(Number(row.manual_cost_thb));
    expect(estimate.estRoiPct).toBe(Number(row.est_roi_pct));
  });

  it('maps null actuals to null', () => {
    const row = makeTaskEstimateRow({
      actual_cost_usd: null,
      actual_cost_thb: null,
      actual_roi_pct: null,
      completed_at: null,
    });
    const estimate = mapTaskEstimateRow(row);
    expect(estimate.actualCostUsd).toBeNull();
    expect(estimate.actualCostThb).toBeNull();
    expect(estimate.actualRoiPct).toBeNull();
    expect(estimate.completedAt).toBeNull();
  });

  it('maps null cost_model_ids to empty array', () => {
    const row = makeTaskEstimateRow({ cost_model_ids: null as unknown as string[] });
    expect(mapTaskEstimateRow(row).costModelIds).toEqual([]);
  });
});

// ============================================================================
// mapBudgetPeriodRow
// ============================================================================

describe('mapBudgetPeriodRow', () => {
  it('maps all fields to camelCase correctly', () => {
    const row = makeBudgetPeriodRow();
    const period = mapBudgetPeriodRow(row);

    expect(period.id).toBe(row.id);
    expect(period.orgId).toBe(row.org_id);
    expect(period.periodType).toBe(row.period_type);
    expect(period.periodLabel).toBe(row.period_label);
    expect(period.startDate).toBe(row.start_date);
    expect(period.endDate).toBe(row.end_date);
    expect(period.budgetUsd).toBe(Number(row.budget_usd));
    expect(period.budgetThb).toBe(Number(row.budget_thb));
    expect(period.alertThreshold).toBe(Number(row.alert_threshold));
    expect(period.alertSent).toBe(row.alert_sent);
    expect(period.notes).toBe(row.notes);
    expect(period.createdBy).toBe(row.created_by);
  });
});

// ============================================================================
// mapUsageSummaryRow
// ============================================================================

describe('mapUsageSummaryRow', () => {
  it('maps all fields to camelCase correctly', () => {
    const row = makeUsageSummaryRow();
    const summary = mapUsageSummaryRow(row);

    expect(summary.orgId).toBe(row.org_id);
    expect(summary.tool).toBe(row.tool);
    expect(summary.modelName).toBe(row.model_name);
    expect(summary.usageMonth).toBe(row.usage_month);
    expect(summary.requestCount).toBe(Number(row.request_count));
    expect(summary.totalInputTokens).toBe(Number(row.total_input_tokens));
    expect(summary.totalOutputTokens).toBe(Number(row.total_output_tokens));
    expect(summary.totalCostUsd).toBe(Number(row.total_cost_usd));
    expect(summary.totalCostThb).toBe(Number(row.total_cost_thb));
    expect(summary.totalTimeSavedMin).toBe(Number(row.total_time_saved_min));
    expect(summary.uniqueEmployees).toBe(Number(row.unique_employees));
  });
});

// ============================================================================
// mapTaskRoiRow
// ============================================================================

describe('mapTaskRoiRow', () => {
  it('maps all fields to camelCase correctly', () => {
    const row = makeTaskRoiRow();
    const roi = mapTaskRoiRow(row);

    expect(roi.id).toBe(row.id);
    expect(roi.orgId).toBe(row.org_id);
    expect(roi.taskCategory).toBe(row.task_category);
    expect(roi.taskDescription).toBe(row.task_description);
    expect(roi.estCostThb).toBe(Number(row.est_cost_thb));
    expect(roi.manualCostThb).toBe(Number(row.manual_cost_thb));
    expect(roi.estRoiPct).toBe(Number(row.est_roi_pct));
    expect(roi.actualCostThb).toBe(Number(row.actual_cost_thb));
    expect(roi.actualRoiPct).toBe(Number(row.actual_roi_pct));
    expect(roi.costVariancePct).toBe(Number(row.cost_variance_pct));
    expect(roi.isCompleted).toBe(row.is_completed);
    expect(roi.createdAt).toBe(row.created_at);
  });

  it('maps null optional fields to null', () => {
    const row = makeTaskRoiRow({
      manual_cost_thb: null,
      est_roi_pct: null,
      actual_cost_thb: null,
      actual_roi_pct: null,
      cost_variance_pct: null,
    });
    const roi = mapTaskRoiRow(row);
    expect(roi.manualCostThb).toBeNull();
    expect(roi.estRoiPct).toBeNull();
    expect(roi.actualCostThb).toBeNull();
    expect(roi.actualRoiPct).toBeNull();
    expect(roi.costVariancePct).toBeNull();
  });
});
