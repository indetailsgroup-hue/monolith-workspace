/**
 * src/culture-metrics/employeeSentimentTypes.ts
 *
 * MONOLITH v18.5 Sprint 13 — Employee Sentiment Timeline (EST) types
 *
 * Follows the same convention as cultureMetricsTypes.ts:
 *   - DB row interfaces  (snake_case, match Supabase columns)
 *   - App-layer types    (camelCase, used in store / components)
 *   - Mappers            (row → app type)
 *   - Plan gate helper   (PROFESSIONAL | ENTERPRISE)
 *   - Display maps       (labels, icons, colours)
 */

import type { OrgPlan } from '../tenant/types';

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export type EstDimension  = 'MORALE' | 'ENGAGEMENT' | 'STRESS' | 'COLLABORATION' | 'CLARITY';
export type EstPeriodType = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';
export type EstHealthStatus = 'CRITICAL' | 'WARNING' | 'NORMAL';

// ─────────────────────────────────────────────────────────────────────────────
// DB row interfaces  (match Supabase / PostgreSQL columns)
// ─────────────────────────────────────────────────────────────────────────────

export interface EstSentimentEntryRow {
  id:           string;
  org_id:       string;
  dimension:    EstDimension;
  score:        number;
  period_type:  EstPeriodType;
  period_label: string;
  note:         string | null;
  submitted_at: string;
}

export interface EstTimelineConfigRow {
  id:            string;
  org_id:        string;
  dimension:     EstDimension;
  is_active:     boolean;
  is_inverted:   boolean;
  min_responses: number;
  period_type:   EstPeriodType;
  created_at:    string;
  updated_at:    string;
}

/** Row returned by est_sentiment_summary_v */
export interface EstSentimentSummaryRow {
  org_id:         string;
  dimension:      EstDimension;
  period_type:    EstPeriodType;
  period_label:   string;
  avg_score:      number;
  response_count: number;
  is_inverted:    boolean;
  min_responses:  number;
  health_status:  EstHealthStatus | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// App-layer camelCase types
// ─────────────────────────────────────────────────────────────────────────────

export interface EstSentimentEntry {
  id:          string;
  orgId:       string;
  dimension:   EstDimension;
  score:       number;
  periodType:  EstPeriodType;
  periodLabel: string;
  note:        string | null;
  submittedAt: string;
}

export interface EstTimelineConfig {
  id:           string;
  orgId:        string;
  dimension:    EstDimension;
  isActive:     boolean;
  isInverted:   boolean;
  minResponses: number;
  periodType:   EstPeriodType;
  createdAt:    string;
  updatedAt:    string;
}

export interface EstSentimentSummary {
  orgId:         string;
  dimension:     EstDimension;
  periodType:    EstPeriodType;
  periodLabel:   string;
  avgScore:      number;
  responseCount: number;
  isInverted:    boolean;
  minResponses:  number;
  healthStatus:  EstHealthStatus | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action payloads
// ─────────────────────────────────────────────────────────────────────────────

/** Used by submitSentimentEntry (plan-gate EXEMPT — anonymous, no auth.getUser) */
export interface EstSubmitPayload {
  orgId:       string;
  dimension:   EstDimension;
  score:       number;
  periodType:  EstPeriodType;
  periodLabel: string;
  note?:       string;
}

/** Used by upsertTimelineConfig (PROFESSIONAL+ gated) */
export interface EstUpsertConfigPayload {
  orgId:        string;
  dimension:    EstDimension;
  isActive?:    boolean;
  isInverted?:  boolean;
  minResponses?: number;
  periodType?:  EstPeriodType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────────────────────

export interface EstFilters {
  dimension?:  EstDimension;
  periodType?: EstPeriodType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan gate
// ─────────────────────────────────────────────────────────────────────────────

/** EST module requires PROFESSIONAL or ENTERPRISE plan */
export const canAccessEstModule = (plan: OrgPlan): boolean =>
  plan === 'PROFESSIONAL' || plan === 'ENTERPRISE';

// ─────────────────────────────────────────────────────────────────────────────
// Display maps
// ─────────────────────────────────────────────────────────────────────────────

export const EST_DIMENSION_LABEL: Record<EstDimension, string> = {
  MORALE:        'ขวัญกำลังใจ',
  ENGAGEMENT:    'ความผูกพัน',
  STRESS:        'ความเครียด',
  COLLABORATION: 'การทำงานร่วมกัน',
  CLARITY:       'ความชัดเจนในงาน',
};

export const EST_DIMENSION_ICON: Record<EstDimension, string> = {
  MORALE:        '😊',
  ENGAGEMENT:    '🔥',
  STRESS:        '⚠️',
  COLLABORATION: '🤝',
  CLARITY:       '🎯',
};

export const EST_PERIOD_LABEL: Record<EstPeriodType, string> = {
  WEEKLY:    'รายสัปดาห์',
  MONTHLY:   'รายเดือน',
  QUARTERLY: 'รายไตรมาส',
};

export const EST_HEALTH_STATUS_LABEL: Record<EstHealthStatus, string> = {
  CRITICAL: 'วิกฤต',
  WARNING:  'เฝ้าระวัง',
  NORMAL:   'ปกติ',
};

/**
 * Health status colour classes — matches CMD_HEALTH_STATUS_COLOR convention
 * from cultureMetricsTypes.ts for visual consistency.
 */
export const EST_HEALTH_STATUS_COLOR: Record<EstHealthStatus, string> = {
  CRITICAL: 'text-red-700 bg-red-50',
  WARNING:  'text-amber-700 bg-amber-50',
  NORMAL:   'text-blue-700 bg-blue-50',
};

// ─────────────────────────────────────────────────────────────────────────────
// Ordered dimension list (consistent rendering order)
// ─────────────────────────────────────────────────────────────────────────────

export const EST_DIMENSIONS: EstDimension[] = [
  'MORALE',
  'ENGAGEMENT',
  'STRESS',
  'COLLABORATION',
  'CLARITY',
];

export const EST_PERIOD_TYPES: EstPeriodType[] = ['WEEKLY', 'MONTHLY', 'QUARTERLY'];

// ─────────────────────────────────────────────────────────────────────────────
// Mappers: DB row → app-layer type
// ─────────────────────────────────────────────────────────────────────────────

export function mapEstSentimentEntry(row: EstSentimentEntryRow): EstSentimentEntry {
  return {
    id:          row.id,
    orgId:       row.org_id,
    dimension:   row.dimension,
    score:       row.score,
    periodType:  row.period_type,
    periodLabel: row.period_label,
    note:        row.note,
    submittedAt: row.submitted_at,
  };
}

export function mapEstTimelineConfig(row: EstTimelineConfigRow): EstTimelineConfig {
  return {
    id:           row.id,
    orgId:        row.org_id,
    dimension:    row.dimension,
    isActive:     row.is_active,
    isInverted:   row.is_inverted,
    minResponses: row.min_responses,
    periodType:   row.period_type,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  };
}

export function mapEstSentimentSummary(row: EstSentimentSummaryRow): EstSentimentSummary {
  return {
    orgId:         row.org_id,
    dimension:     row.dimension,
    periodType:    row.period_type,
    periodLabel:   row.period_label,
    avgScore:      Number(row.avg_score),
    responseCount: Number(row.response_count),
    isInverted:    row.is_inverted,
    minResponses:  row.min_responses,
    healthStatus:  row.health_status,
  };
}
