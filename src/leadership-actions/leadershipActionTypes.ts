// src/leadership-actions/leadershipActionTypes.ts
// MONOLITH v18.0 — Leadership Action Tracker (LAT) types

import type { OrgPlan } from '../tenant/types';

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────

export type LatActionStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'CANCELLED';

export type LatActionPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type LatActionCategory =
  | 'STRATEGY'
  | 'OPERATIONS'
  | 'PEOPLE'
  | 'FINANCE'
  | 'COMPLIANCE'
  | 'QUALITY'
  | 'SAFETY'
  | 'CUSTOM';

// ─────────────────────────────────────────────────────────────
// DB Row Types
// ─────────────────────────────────────────────────────────────

export interface LatActionRow {
  id:            string;
  org_id:        string;
  title:         string;
  description:   string | null;
  category:      LatActionCategory;
  priority:      LatActionPriority;
  status:        LatActionStatus;
  due_date:      string | null;    // ISO date string "YYYY-MM-DD"
  owner_id:      string;
  reviewed_by:   string | null;
  completed_at:  string | null;
  cancelled_at:  string | null;
  created_by:    string;
  created_at:    string;
  updated_at:    string;
}

export interface LatActionAssignmentRow {
  id:          string;
  action_id:   string;
  org_id:      string;
  assignee_id: string;
  assigned_by: string;
  assigned_at: string;
}

export interface LatActionUpdateRow {
  id:              string;
  action_id:       string;
  org_id:          string;
  author_id:       string;
  body:            string;
  previous_status: LatActionStatus | null;
  new_status:      LatActionStatus | null;
  created_at:      string;
}

export interface LatActionSummaryRow {
  org_id:        string;
  status:        LatActionStatus;
  priority:      LatActionPriority;
  action_count:  number;
  overdue_count: number;
}

// ─────────────────────────────────────────────────────────────
// App-level Aliases (camelCase dates)
// ─────────────────────────────────────────────────────────────

export interface LatAction extends LatActionRow {
  createdAt:   string;
  updatedAt:   string;
  completedAt: string | null;
  cancelledAt: string | null;
  dueDate:     string | null;
}

export interface LatActionAssignment extends LatActionAssignmentRow {
  assignedAt: string;
}

export interface LatActionUpdate extends LatActionUpdateRow {
  createdAt: string;
}

export interface LatActionSummary {
  orgId:        string;
  status:       LatActionStatus;
  priority:     LatActionPriority;
  actionCount:  number;
  overdueCount: number;
}

// ─────────────────────────────────────────────────────────────
// Payloads
// ─────────────────────────────────────────────────────────────

export interface CreateLatActionPayload {
  org_id:       string;
  title:        string;
  description?: string;
  category?:    LatActionCategory;
  priority?:    LatActionPriority;
  due_date?:    string;
  owner_id:     string;
}

export interface UpdateLatActionPayload {
  title?:       string;
  description?: string;
  category?:    LatActionCategory;
  priority?:    LatActionPriority;
  status?:      LatActionStatus;
  due_date?:    string | null;
  owner_id?:    string;
  reviewed_by?: string;
}

export interface AddLatAssignmentPayload {
  action_id:   string;
  org_id:      string;
  assignee_id: string;
}

export interface PostLatUpdatePayload {
  action_id:       string;
  org_id:          string;
  body:            string;
  previous_status?: LatActionStatus;
  new_status?:      LatActionStatus;
}

// ─────────────────────────────────────────────────────────────
// Plan Gate
// ─────────────────────────────────────────────────────────────

export function canAccessLeadershipActions(plan: OrgPlan): boolean {
  return plan === 'ENTERPRISE';
}

export class LeadershipActionPlanGateError extends Error {
  constructor(plan: OrgPlan) {
    super(
      `Leadership Action Tracker requires an ENTERPRISE plan. Current plan: ${plan}`
    );
    this.name = 'LeadershipActionPlanGateError';
  }
}

// ─────────────────────────────────────────────────────────────
// Thai Labels
// ─────────────────────────────────────────────────────────────

export const LAT_STATUS_LABELS: Record<LatActionStatus, string> = {
  OPEN:        'เปิด',
  IN_PROGRESS: 'กำลังดำเนินการ',
  BLOCKED:     'ติดขัด',
  COMPLETED:   'เสร็จสิ้น',
  CANCELLED:   'ยกเลิก',
};

export const LAT_PRIORITY_LABELS: Record<LatActionPriority, string> = {
  LOW:      'ต่ำ',
  MEDIUM:   'ปานกลาง',
  HIGH:     'สูง',
  CRITICAL: 'วิกฤต',
};

export const LAT_CATEGORY_LABELS: Record<LatActionCategory, string> = {
  STRATEGY:   'กลยุทธ์',
  OPERATIONS: 'ปฏิบัติการ',
  PEOPLE:     'บุคลากร',
  FINANCE:    'การเงิน',
  COMPLIANCE: 'การปฏิบัติตาม',
  QUALITY:    'คุณภาพ',
  SAFETY:     'ความปลอดภัย',
  CUSTOM:     'กำหนดเอง',
};

// ─────────────────────────────────────────────────────────────
// Getters
// ─────────────────────────────────────────────────────────────

export function getLatStatusLabel(status: LatActionStatus): string {
  return LAT_STATUS_LABELS[status];
}

export function getLatPriorityLabel(priority: LatActionPriority): string {
  return LAT_PRIORITY_LABELS[priority];
}

export function getLatCategoryLabel(category: LatActionCategory): string {
  return LAT_CATEGORY_LABELS[category];
}

// ─────────────────────────────────────────────────────────────
// Mappers (DB Row → App Type)
// ─────────────────────────────────────────────────────────────

export function mapLatActionRow(row: LatActionRow): LatAction {
  return {
    ...row,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    dueDate:     row.due_date,
  };
}

export function mapLatAssignmentRow(row: LatActionAssignmentRow): LatActionAssignment {
  return { ...row, assignedAt: row.assigned_at };
}

export function mapLatUpdateRow(row: LatActionUpdateRow): LatActionUpdate {
  return { ...row, createdAt: row.created_at };
}

export function mapLatSummaryRow(row: LatActionSummaryRow): LatActionSummary {
  return {
    orgId:        row.org_id,
    status:       row.status,
    priority:     row.priority,
    actionCount:  Number(row.action_count),
    overdueCount: Number(row.overdue_count),
  };
}

// ─────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────

export interface LatFilters {
  status:   LatActionStatus | 'ALL';
  priority: LatActionPriority | 'ALL';
  category: LatActionCategory | 'ALL';
  ownerId:  string | 'ALL';
}

export const DEFAULT_LAT_FILTERS: LatFilters = {
  status:   'ALL',
  priority: 'ALL',
  category: 'ALL',
  ownerId:  'ALL',
};
