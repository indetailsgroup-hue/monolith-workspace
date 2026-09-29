// src/org-health/orgHealthScoreTypes.ts
// MONOLITH v18.5 — 2S2P1C Org Health Score (OHS) types
//
// 2S2P1C = 2 Safety/Satisfaction + 2 Performance/Process + 1 Culture
// Each dimension weighted 20% by default; composite score 0–100.

import type { OrgPlan } from '../tenant/types';

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────

export type OhsDimension =
  | 'SAFETY'
  | 'SATISFACTION'
  | 'PERFORMANCE'
  | 'PROCESS'
  | 'CULTURE';

export type OhsScoreGrade =
  | 'A'  // composite ≥ 90
  | 'B'  // composite ≥ 75
  | 'C'  // composite ≥ 60
  | 'D'  // composite ≥ 40
  | 'F'; // composite < 40

export const ALL_OHS_DIMENSIONS: OhsDimension[] = [
  'SAFETY',
  'SATISFACTION',
  'PERFORMANCE',
  'PROCESS',
  'CULTURE',
];

// ─────────────────────────────────────────────────────────────
// DB Row Types
// ─────────────────────────────────────────────────────────────

export interface OhsScoringConfigRow {
  id:          string;
  org_id:      string;
  dimension:   OhsDimension;
  weight:      number;        // 0.0 – 1.0; weights must sum to 1.0 across 5 dims
  description: string | null;
  created_by:  string;
  created_at:  string;
  updated_at:  string;
}

export interface OhsHealthSnapshotRow {
  id:              string;
  org_id:          string;
  snapshot_date:   string;    // ISO date "YYYY-MM-DD"
  composite_score: number;    // 0 – 100
  grade:           OhsScoreGrade;
  computed_by:     string;
  computed_at:     string;
  notes:           string | null;
}

export interface OhsDimensionScoreRow {
  id:                    string;
  snapshot_id:           string;
  org_id:                string;
  dimension:             OhsDimension;
  raw_score:             number;  // 0 – 100
  weight:                number;  // 0.0 – 1.0
  weighted_contribution: number;  // GENERATED: raw_score * weight (stored)
  detail:                OhsDimensionDetail | null;
}

// Detail shapes for each dimension's source data (stored as jsonb in DB)
export interface OhsSafetyDetail {
  open_critical: number;
  open_others:   number;
}
export interface OhsProcessDetail {
  total_anomalies:  number;
  resolved:         number;
  resolution_rate:  number;
}
export interface OhsSatisfactionDetail {
  avg_enps_score: number | null;
}
export interface OhsCultureDetail {
  avg_culture_score: number | null;
}
export interface OhsPerformanceDetail {
  source: string;
}

export type OhsDimensionDetail =
  | OhsSafetyDetail
  | OhsProcessDetail
  | OhsSatisfactionDetail
  | OhsCultureDetail
  | OhsPerformanceDetail;

// ─────────────────────────────────────────────────────────────
// App-level Types (camelCase dates + helpers)
// ─────────────────────────────────────────────────────────────

export interface OhsScoringConfig extends OhsScoringConfigRow {
  createdAt: string;
  updatedAt: string;
}

export interface OhsHealthSnapshot extends OhsHealthSnapshotRow {
  snapshotDate: string;
  computedAt:   string;
}

export interface OhsDimensionScore extends OhsDimensionScoreRow {
  weightedContribution: number;
}

// Current score view row (from ohs_current_score_v)
export interface OhsCurrentScoreRow extends OhsHealthSnapshotRow {
  snapshot_id: string;
  dimensions:  OhsDimensionScoreRow[];
}

export interface OhsCurrentScore extends OhsCurrentScoreRow {
  snapshotDate:  string;
  computedAt:    string;
  dimensionMap:  Record<OhsDimension, OhsDimensionScore>;
}

// ─────────────────────────────────────────────────────────────
// Thai Labels
// ─────────────────────────────────────────────────────────────

export const OHS_DIMENSION_LABELS: Record<OhsDimension, string> = {
  SAFETY:       'ความปลอดภัย',
  SATISFACTION: 'ความพึงพอใจ',
  PERFORMANCE:  'ประสิทธิภาพ',
  PROCESS:      'กระบวนการ',
  CULTURE:      'วัฒนธรรม',
};

export const OHS_GRADE_LABELS: Record<OhsScoreGrade, string> = {
  A: 'ดีเยี่ยม',
  B: 'ดี',
  C: 'พอใช้',
  D: 'ต้องปรับปรุง',
  F: 'วิกฤต',
};

export const OHS_GRADE_ACCENT: Record<OhsScoreGrade, string> = {
  A: '#22c55e',
  B: '#3b82f6',
  C: '#f59e0b',
  D: '#f97316',
  F: '#ef4444',
};

export function getOhsDimensionLabel(dim: OhsDimension): string {
  return OHS_DIMENSION_LABELS[dim];
}

export function getOhsGradeLabel(grade: OhsScoreGrade): string {
  return OHS_GRADE_LABELS[grade];
}

// ─────────────────────────────────────────────────────────────
// Grade derivation (mirrors DB CASE expression)
// ─────────────────────────────────────────────────────────────

export function deriveOhsGrade(compositeScore: number): OhsScoreGrade {
  if (compositeScore >= 90) return 'A';
  if (compositeScore >= 75) return 'B';
  if (compositeScore >= 60) return 'C';
  if (compositeScore >= 40) return 'D';
  return 'F';
}

// ─────────────────────────────────────────────────────────────
// Plan gate
// ─────────────────────────────────────────────────────────────

export function canAccessOrgHealthScore(plan: OrgPlan): boolean {
  return plan === 'ENTERPRISE';
}

export class OrgHealthScorePlanGateError extends Error {
  constructor(plan: OrgPlan) {
    super(
      `Org Health Score requires an ENTERPRISE plan. Current plan: ${plan}`
    );
    this.name = 'OrgHealthScorePlanGateError';
  }
}

// ─────────────────────────────────────────────────────────────
// Mappers (DB Row → App Type)
// ─────────────────────────────────────────────────────────────

export function mapOhsScoringConfigRow(row: OhsScoringConfigRow): OhsScoringConfig {
  return {
    ...row,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapOhsHealthSnapshotRow(row: OhsHealthSnapshotRow): OhsHealthSnapshot {
  return {
    ...row,
    snapshotDate: row.snapshot_date,
    computedAt:   row.computed_at,
  };
}

export function mapOhsDimensionScoreRow(row: OhsDimensionScoreRow): OhsDimensionScore {
  return {
    ...row,
    weightedContribution: row.weighted_contribution,
  };
}

export function mapOhsCurrentScoreRow(row: OhsCurrentScoreRow): OhsCurrentScore {
  const dimensionMap = {} as Record<OhsDimension, OhsDimensionScore>;
  for (const dim of row.dimensions) {
    dimensionMap[dim.dimension] = mapOhsDimensionScoreRow(dim);
  }
  return {
    ...row,
    snapshotDate: row.snapshot_date,
    computedAt:   row.computed_at,
    dimensionMap,
  };
}

// ─────────────────────────────────────────────────────────────
// Default scoring config (20% each dimension)
// ─────────────────────────────────────────────────────────────

export type OhsScoringConfigMap = Record<OhsDimension, number>;

export const DEFAULT_OHS_SCORING_CONFIG: OhsScoringConfigMap = {
  SAFETY:       0.2,
  SATISFACTION: 0.2,
  PERFORMANCE:  0.2,
  PROCESS:      0.2,
  CULTURE:      0.2,
};
