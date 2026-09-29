/**
 * src/culture-metrics/teamPulseTypes.ts
 *
 * MONOLITH v18.5 Sprint 15 — Team Pulse Check (TPC) types
 *
 * Follows the same convention as employeeSentimentTypes.ts:
 *   - DB row interfaces  (snake_case, match Supabase columns)
 *   - App-layer types    (camelCase, used in store / components)
 *   - Mappers            (row → app type)
 *   - Plan gate helper   (PROFESSIONAL | ENTERPRISE)
 *   - Display maps       (labels, icons, health colours)
 *
 * Key differences from EST:
 *   - Score scale: 1-5 (Likert) instead of 1-10
 *   - Topics are team-dynamics focused (vs emotional dimensions in EST)
 *   - Sessions concept: admins create/activate/close pulse sessions
 */

import type { OrgPlan } from '../tenant/types';

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

/** Team-dynamics pulse topics (5 fixed topics, mirrors EST's 5 fixed dimensions) */
export type TpcTopic         = 'WORKLOAD' | 'COMMUNICATION' | 'DIRECTION' | 'SUPPORT' | 'RECOGNITION';
export type TpcSessionStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';
export type TpcHealthStatus  = 'CRITICAL' | 'WARNING' | 'NORMAL';

// ─────────────────────────────────────────────────────────────────────────────
// DB row interfaces  (match Supabase / PostgreSQL columns)
// ─────────────────────────────────────────────────────────────────────────────

export interface TpcPulseConfigRow {
  id:         string;
  org_id:     string;
  topic:      TpcTopic;
  is_active:  boolean;
  scale_max:  number;
  created_at: string;
  updated_at: string;
}

export interface TpcPulseSessionRow {
  id:           string;
  org_id:       string;
  title:        string;
  status:       TpcSessionStatus;
  period_label: string;
  opened_at:    string | null;
  closed_at:    string | null;
  created_at:   string;
}

export interface TpcPulseResponseRow {
  id:           string;
  org_id:       string;
  session_id:   string;
  topic:        TpcTopic;
  score:        number;
  comment:      string | null;
  submitted_at: string;
}

/** Row returned by tpc_pulse_summary_v */
export interface TpcPulseSummaryRow {
  org_id:          string;
  session_id:      string;
  session_title:   string;
  period_label:    string;
  session_status:  TpcSessionStatus;
  topic:           TpcTopic;
  avg_score:       number;
  response_count:  number;
  health_status:   TpcHealthStatus | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// App-layer camelCase types
// ─────────────────────────────────────────────────────────────────────────────

export interface TpcPulseConfig {
  id:        string;
  orgId:     string;
  topic:     TpcTopic;
  isActive:  boolean;
  scaleMax:  number;
  createdAt: string;
  updatedAt: string;
}

export interface TpcPulseSession {
  id:          string;
  orgId:       string;
  title:       string;
  status:      TpcSessionStatus;
  periodLabel: string;
  openedAt:    string | null;
  closedAt:    string | null;
  createdAt:   string;
}

export interface TpcPulseResponse {
  id:          string;
  orgId:       string;
  sessionId:   string;
  topic:       TpcTopic;
  score:       number;
  comment:     string | null;
  submittedAt: string;
}

export interface TpcPulseSummary {
  orgId:          string;
  sessionId:      string;
  sessionTitle:   string;
  periodLabel:    string;
  sessionStatus:  TpcSessionStatus;
  topic:          TpcTopic;
  avgScore:       number;
  responseCount:  number;
  healthStatus:   TpcHealthStatus | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action payloads
// ─────────────────────────────────────────────────────────────────────────────

/** Used by upsertConfig (PROFESSIONAL+ gated) */
export interface TpcUpsertConfigPayload {
  orgId:     string;
  topic:     TpcTopic;
  isActive?: boolean;
}

/** Used by createSession (PROFESSIONAL+ gated) */
export interface TpcCreateSessionPayload {
  orgId:       string;
  title:       string;
  periodLabel: string;
}

/** Used by submitResponse (PLAN-GATE EXEMPT — anonymous, no auth.getUser) */
export interface TpcSubmitResponsePayload {
  orgId:     string;
  sessionId: string;
  topic:     TpcTopic;
  score:     number;
  comment?:  string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────────────────────

export interface TpcFilters {
  topic?:     TpcTopic;
  sessionId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan gate
// ─────────────────────────────────────────────────────────────────────────────

/** TPC module requires PROFESSIONAL or ENTERPRISE plan */
export const canAccessTpcModule = (plan: OrgPlan): boolean =>
  plan === 'PROFESSIONAL' || plan === 'ENTERPRISE';

export const TPC_PLAN_GATE_ERROR = 'TPC module requires PROFESSIONAL or ENTERPRISE plan' as const;

// ─────────────────────────────────────────────────────────────────────────────
// Display maps
// ─────────────────────────────────────────────────────────────────────────────

export const TPC_TOPIC_LABEL: Record<TpcTopic, string> = {
  WORKLOAD:      'ปริมาณงาน',
  COMMUNICATION: 'การสื่อสารในทีม',
  DIRECTION:     'ทิศทางและเป้าหมาย',
  SUPPORT:       'การสนับสนุนจากหัวหน้า',
  RECOGNITION:   'การยอมรับและชื่นชม',
};

export const TPC_TOPIC_ICON: Record<TpcTopic, string> = {
  WORKLOAD:      '⚖️',
  COMMUNICATION: '💬',
  DIRECTION:     '🧭',
  SUPPORT:       '🤲',
  RECOGNITION:   '🏅',
};

export const TPC_SESSION_STATUS_LABEL: Record<TpcSessionStatus, string> = {
  DRAFT:  'ร่าง',
  ACTIVE: 'เปิดรับตอบ',
  CLOSED: 'ปิดแล้ว',
};

export const TPC_HEALTH_STATUS_LABEL: Record<TpcHealthStatus, string> = {
  CRITICAL: 'วิกฤต',
  WARNING:  'เฝ้าระวัง',
  NORMAL:   'ปกติ',
};

/**
 * Health status colour classes — consistent with EST_HEALTH_STATUS_COLOR
 * and CMD_HEALTH_STATUS_COLOR across all culture-metrics modules.
 */
export const TPC_HEALTH_STATUS_COLOR: Record<TpcHealthStatus, string> = {
  CRITICAL: 'text-red-700 bg-red-50',
  WARNING:  'text-amber-700 bg-amber-50',
  NORMAL:   'text-blue-700 bg-blue-50',
};

export const TPC_SESSION_STATUS_COLOR: Record<TpcSessionStatus, string> = {
  DRAFT:  'text-gray-600 bg-gray-100',
  ACTIVE: 'text-green-700 bg-green-50',
  CLOSED: 'text-gray-500 bg-gray-50',
};

// ─────────────────────────────────────────────────────────────────────────────
// Ordered lists (consistent rendering order)
// ─────────────────────────────────────────────────────────────────────────────

export const TPC_TOPICS: TpcTopic[] = [
  'WORKLOAD',
  'COMMUNICATION',
  'DIRECTION',
  'SUPPORT',
  'RECOGNITION',
];

export const TPC_SESSION_STATUSES: TpcSessionStatus[] = ['DRAFT', 'ACTIVE', 'CLOSED'];

// ─────────────────────────────────────────────────────────────────────────────
// Mappers: DB row → app-layer type
// ─────────────────────────────────────────────────────────────────────────────

export function mapTpcPulseConfig(row: TpcPulseConfigRow): TpcPulseConfig {
  return {
    id:        row.id,
    orgId:     row.org_id,
    topic:     row.topic,
    isActive:  row.is_active,
    scaleMax:  row.scale_max,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTpcPulseSession(row: TpcPulseSessionRow): TpcPulseSession {
  return {
    id:          row.id,
    orgId:       row.org_id,
    title:       row.title,
    status:      row.status,
    periodLabel: row.period_label,
    openedAt:    row.opened_at,
    closedAt:    row.closed_at,
    createdAt:   row.created_at,
  };
}

export function mapTpcPulseResponse(row: TpcPulseResponseRow): TpcPulseResponse {
  return {
    id:          row.id,
    orgId:       row.org_id,
    sessionId:   row.session_id,
    topic:       row.topic,
    score:       row.score,
    comment:     row.comment,
    submittedAt: row.submitted_at,
  };
}

export function mapTpcPulseSummary(row: TpcPulseSummaryRow): TpcPulseSummary {
  return {
    orgId:          row.org_id,
    sessionId:      row.session_id,
    sessionTitle:   row.session_title,
    periodLabel:    row.period_label,
    sessionStatus:  row.session_status,
    topic:          row.topic,
    avgScore:       Number(row.avg_score),
    responseCount:  Number(row.response_count),
    healthStatus:   row.health_status,
  };
}
