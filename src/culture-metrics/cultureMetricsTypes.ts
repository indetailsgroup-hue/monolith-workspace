// src/culture-metrics/cultureMetricsTypes.ts
// MONOLITH v18.5 — Culture Metrics Dashboard (CMD) types
//
// DB schema: supabase/migrations/20270125_culture_metrics_dashboard.sql
// Plan gate: PROFESSIONAL+ (PROFESSIONAL or ENTERPRISE)
//
// Tables: cmd_metric_definitions, cmd_metric_snapshots,
//         cmd_enps_surveys, cmd_enps_responses
// Views:  cmd_org_health_v, cmd_enps_results_v

import type { OrgPlan } from '../tenant/types';

// ─────────────────────────────────────────────────────────────────────────────
// Enum union types (mirror DB ENUM values)
// ─────────────────────────────────────────────────────────────────────────────

export type CmdMetricCategory =
  | 'ENGAGEMENT'
  | 'PSYCHOLOGICAL_SAFETY'
  | 'COLLABORATION'
  | 'SATISFACTION'
  | 'PRODUCTIVITY'
  | 'LEADERSHIP'
  | 'AI_READINESS'
  | 'CUSTOM';

export type CmdMetricSource =
  | 'PS_SURVEY'
  | 'ENPS'
  | 'SUPER_EMPLOYEE'
  | 'MANUAL'
  | 'ATTENDANCE'
  | 'OTHER';

export type CmdSnapshotPeriod =
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUAL';

export type CmdEnpsStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'CLOSED';

/** Derived health status band from cmd_org_health_v */
export type CmdHealthStatus =
  | 'CRITICAL'
  | 'WARNING'
  | 'ON_TARGET'
  | 'NORMAL';

// ─────────────────────────────────────────────────────────────────────────────
// DB Row Interfaces (snake_case — mirror DB columns directly)
// ─────────────────────────────────────────────────────────────────────────────

export interface CmdMetricDefinitionRow {
  id:                 string;
  org_id:             string;
  metric_category:    CmdMetricCategory;
  metric_source:      CmdMetricSource;
  display_name:       string;
  display_name_th:    string | null;
  min_score:          number;
  max_score:          number;
  target_score:       number | null;
  warning_threshold:  number | null;
  critical_threshold: number | null;
  health_weight:      number;           // 0.0 – 1.0
  is_active:          boolean;
  is_system:          boolean;
  description:        string | null;
  created_by:         string | null;
  created_at:         string;
  updated_at:         string;
}

export interface CmdMetricSnapshotRow {
  id:               string;
  org_id:           string;
  metric_id:        string;
  period_type:      CmdSnapshotPeriod;
  period_label:     string;             // e.g. "2027-W04", "2027-01", "2027-Q1"
  snapshot_date:    string;             // ISO date "YYYY-MM-DD"
  score:            number;
  respondent_count: number;
  notes:            string | null;
  source_ref_id:    string | null;
  recorded_by:      string | null;
  created_at:       string;
}

export interface CmdEnpsSurveyRow {
  id:                string;
  org_id:            string;
  title:             string;
  title_th:          string | null;
  status:            CmdEnpsStatus;
  question_text:     string;
  followup_question: string | null;
  opens_at:          string | null;
  closes_at:         string | null;
  min_responses:     number;            // default 3 — anonymity guard
  notes:             string | null;
  created_by:        string | null;
  created_at:        string;
  updated_at:        string;
}

/**
 * cmd_enps_responses — anonymous eNPS responses.
 * NO user_id column — identity never stored.
 * anonymous_token is a client-generated UUID for deduplication only.
 */
export interface CmdEnpsResponseRow {
  id:              string;
  org_id:          string;
  survey_id:       string;
  score:           number;              // 0–10
  followup_text:   string | null;
  anonymous_token: string;
  department_label: string | null;
  submitted_at:    string;
}

// ─────────────────────────────────────────────────────────────────────────────
// View Row Interfaces (snake_case — mirror DB view columns)
// ─────────────────────────────────────────────────────────────────────────────

/** cmd_org_health_v — latest snapshot per metric with health_status band */
export interface CmdOrgHealthRow {
  org_id:                  string;
  metric_id:               string;
  display_name:            string;
  display_name_th:         string | null;
  metric_category:         CmdMetricCategory;
  metric_source:           CmdMetricSource;
  target_score:            number | null;
  warning_threshold:       number | null;
  critical_threshold:      number | null;
  health_weight:           number;
  latest_score:            number;
  latest_respondent_count: number;
  latest_period:           string;
  latest_snapshot_date:    string;
  health_status:           CmdHealthStatus;
}

/**
 * cmd_enps_results_v — NPS results per survey.
 * promoter_count / passive_count / detractor_count / nps_score are NULL
 * until total_responses >= min_responses (anonymity guard).
 */
export interface CmdEnpsResultsRow {
  survey_id:       string;
  org_id:          string;
  title:           string;
  status:          CmdEnpsStatus;
  closes_at:       string | null;
  min_responses:   number;
  total_responses: number;
  promoter_count:  number | null;
  passive_count:   number | null;
  detractor_count: number | null;
  nps_score:       number | null;       // null until min_responses met
  avg_score:       number | null;
}

/** Alias — backward compat for tests that import EnpsResultsRow */
export type EnpsResultsRow = CmdEnpsResultsRow;

// ─────────────────────────────────────────────────────────────────────────────
// App-layer Types (camelCase — for use in UI components and Zustand store)
// ─────────────────────────────────────────────────────────────────────────────

export interface CmdMetricDefinition {
  id:                string;
  orgId:             string;
  metricCategory:    CmdMetricCategory;
  metricSource:      CmdMetricSource;
  displayName:       string;
  displayNameTh:     string | null;
  minScore:          number;
  maxScore:          number;
  targetScore:       number | null;
  warningThreshold:  number | null;
  criticalThreshold: number | null;
  healthWeight:      number;
  isActive:          boolean;
  isSystem:          boolean;
  description:       string | null;
  createdBy:         string | null;
  createdAt:         string;
  updatedAt:         string;
}

export interface CmdMetricSnapshot {
  id:              string;
  orgId:           string;
  metricId:        string;
  periodType:      CmdSnapshotPeriod;
  periodLabel:     string;
  snapshotDate:    string;
  score:           number;
  respondentCount: number;
  notes:           string | null;
  sourceRefId:     string | null;
  recordedBy:      string | null;
  createdAt:       string;
}

/** App-layer camelCase eNPS survey — used in components and Zustand state */
export interface CmdEnpsSurvey {
  id:               string;
  orgId:            string;
  title:            string;
  titleTh:          string | null;
  status:           CmdEnpsStatus;
  questionText:     string;
  followupQuestion: string | null;
  opensAt:          string | null;
  closesAt:         string | null;
  minResponses:     number;
  notes:            string | null;
  createdBy:        string | null;
  createdAt:        string;
  updatedAt:        string;
}

export interface CmdEnpsResponse {
  id: string;
  orgId: string;
  surveyId: string;
  score: number;
  followupText: string | null;
  anonymousToken: string;
  departmentLabel: string | null;
  submittedAt: string;
}

/** App-layer camelCase eNPS results — mapped from cmd_enps_results_v */
export interface CmdEnpsResults {
  surveyId:       string;
  orgId:          string;
  title:          string;
  status:         CmdEnpsStatus;
  closesAt:       string | null;
  minResponses:   number;
  totalResponses: number;
  promoterCount:  number | null;
  passiveCount:   number | null;
  detractorCount: number | null;
  npsScore:       number | null;    // null until min_responses met
  avgScore:       number | null;
}

/**
 * App-layer camelCase org health row — mapped from cmd_org_health_v.
 * healthStatus / metricCategory / metricSource kept as string to allow
 * extended values from story fixtures.
 */
export interface CmdOrgHealth {
  orgId:                 string;
  metricId:              string;
  displayName:           string;
  displayNameTh:         string | null;
  metricCategory:        string;
  metricSource:          string;
  targetScore:           number | null;
  warningThreshold:      number | null;
  criticalThreshold:     number | null;
  healthWeight:          number;
  latestScore:           number;
  latestRespondentCount: number;
  latestPeriod:          string;
  latestSnapshotDate:    string;
  healthStatus:          string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thai Labels
// ─────────────────────────────────────────────────────────────────────────────

export const CMD_METRIC_CATEGORY_LABELS: Record<CmdMetricCategory, string> = {
  ENGAGEMENT:           'ความผูกพันองค์กร',
  PSYCHOLOGICAL_SAFETY: 'ความปลอดภัยทางจิตใจ',
  COLLABORATION:        'การทำงานร่วมกัน',
  SATISFACTION:         'ความพึงพอใจในงาน',
  PRODUCTIVITY:         'ประสิทธิผลการทำงาน',
  LEADERSHIP:           'ประสิทธิภาพผู้นำ',
  AI_READINESS:         'ความพร้อม AI',
  CUSTOM:               'กำหนดเอง',
};

export const CMD_HEALTH_STATUS_LABELS: Record<CmdHealthStatus, string> = {
  CRITICAL:  'วิกฤต',
  WARNING:   'เตือนภัย',
  ON_TARGET: 'เป้าหมาย',
  NORMAL:    'ปกติ',
};

/** Alias used by CultureDashboard.tsx */
export const CMD_HEALTH_STATUS_LABEL_TH: Record<string, string> = {
  ...CMD_HEALTH_STATUS_LABELS,
  HEALTHY: 'ดี',
};

export const CMD_ENPS_STATUS_LABELS: Record<CmdEnpsStatus, string> = {
  DRAFT:  'แบบร่าง',
  ACTIVE: 'เปิดรับ',
  CLOSED: 'ปิดแล้ว',
};

/** Alias used by CultureDashboard.tsx */
export const CMD_ENPS_STATUS_LABEL_TH: Record<CmdEnpsStatus, string> = CMD_ENPS_STATUS_LABELS;

/** Tailwind CSS classes for health status badge — used by CultureDashboard.tsx */
export const CMD_HEALTH_STATUS_COLOR: Record<string, string> = {
  CRITICAL:  'text-red-700 bg-red-50',
  WARNING:   'text-amber-700 bg-amber-50',
  ON_TARGET: 'text-emerald-700 bg-emerald-50',
  NORMAL:    'text-blue-700 bg-blue-50',
  HEALTHY:   'text-emerald-700 bg-emerald-50',
};

// ─────────────────────────────────────────────────────────────────────────────
// Plan gate
// ─────────────────────────────────────────────────────────────────────────────

export function canAccessCultureMetrics(plan: OrgPlan): boolean {
  return plan === 'PROFESSIONAL' || plan === 'ENTERPRISE';
}

export class CultureMetricsPlanGateError extends Error {
  constructor(plan: OrgPlan) {
    super(
      `Culture Metrics Dashboard requires a PROFESSIONAL or ENTERPRISE plan. Current plan: ${plan}`,
    );
    this.name = 'CultureMetricsPlanGateError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappers (DB Row → App Type)
// ─────────────────────────────────────────────────────────────────────────────

export function mapCmdMetricDefinitionRow(row: CmdMetricDefinitionRow): CmdMetricDefinition {
  return {
    id:                row.id,
    orgId:             row.org_id,
    metricCategory:    row.metric_category,
    metricSource:      row.metric_source,
    displayName:       row.display_name,
    displayNameTh:     row.display_name_th,
    minScore:          row.min_score,
    maxScore:          row.max_score,
    targetScore:       row.target_score,
    warningThreshold:  row.warning_threshold,
    criticalThreshold: row.critical_threshold,
    healthWeight:      row.health_weight,
    isActive:          row.is_active,
    isSystem:          row.is_system,
    description:       row.description,
    createdBy:         row.created_by,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  };
}

export function mapCmdMetricSnapshotRow(row: CmdMetricSnapshotRow): CmdMetricSnapshot {
  return {
    id:              row.id,
    orgId:           row.org_id,
    metricId:        row.metric_id,
    periodType:      row.period_type,
    periodLabel:     row.period_label,
    snapshotDate:    row.snapshot_date,
    score:           row.score,
    respondentCount: row.respondent_count,
    notes:           row.notes,
    sourceRefId:     row.source_ref_id,
    recordedBy:      row.recorded_by,
    createdAt:       row.created_at,
  };
}

export function mapCmdEnpsSurveyRow(row: CmdEnpsSurveyRow): CmdEnpsSurvey {
  return {
    id:               row.id,
    orgId:            row.org_id,
    title:            row.title,
    titleTh:          row.title_th,
    status:           row.status,
    questionText:     row.question_text,
    followupQuestion: row.followup_question,
    opensAt:          row.opens_at,
    closesAt:         row.closes_at,
    minResponses:     row.min_responses,
    notes:            row.notes,
    createdBy:        row.created_by,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
}

export function mapCmdEnpsResultsRow(row: CmdEnpsResultsRow): CmdEnpsResults {
  return {
    surveyId:       row.survey_id,
    orgId:          row.org_id,
    title:          row.title,
    status:         row.status,
    closesAt:       row.closes_at,
    minResponses:   row.min_responses,
    totalResponses: row.total_responses,
    promoterCount:  row.promoter_count,
    passiveCount:   row.passive_count,
    detractorCount: row.detractor_count,
    npsScore:       row.nps_score,
    avgScore:       row.avg_score,
  };
}

export function mapCmdOrgHealthRow(row: CmdOrgHealthRow): CmdOrgHealth {
  return {
    orgId:                 row.org_id,
    metricId:              row.metric_id,
    displayName:           row.display_name,
    displayNameTh:         row.display_name_th,
    metricCategory:        row.metric_category,
    metricSource:          row.metric_source,
    targetScore:           row.target_score,
    warningThreshold:      row.warning_threshold,
    criticalThreshold:     row.critical_threshold,
    healthWeight:          row.health_weight,
    latestScore:           row.latest_score,
    latestRespondentCount: row.latest_respondent_count,
    latestPeriod:          row.latest_period,
    latestSnapshotDate:    row.latest_snapshot_date,
    healthStatus:          row.health_status,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────────────────────

export interface CmdFilters {
  metricCategory: CmdMetricCategory | string | null;
  periodType:     CmdSnapshotPeriod | string | null;
  fromDate:       string | null;
  toDate:         string | null;
}

export const DEFAULT_CMD_FILTERS: CmdFilters = {
  metricCategory: null,
  periodType:     null,
  fromDate:       null,
  toDate:         null,
};
