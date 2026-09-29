// =============================================================================
// roleNetworkTypes.ts — v18.0 Role Network View
// Plan gate: ENTERPRISE only (canAccessRoleNetwork)
// =============================================================================

import type { OrgPlan } from '../tenant/types';

// ─── Union Types ─────────────────────────────────────────────────────────────

/** Cross-functional relationship direction between two roles. */
export type RnvRelationshipType =
  | 'COLLABORATES_WITH'
  | 'DEPENDS_ON'
  | 'MENTORS'
  | 'REVIEWS'
  | 'ESCALATES_TO';

/** Seniority level of a role. */
export type RnvSeniority = 'JUNIOR' | 'MID' | 'SENIOR' | 'LEAD' | 'PRINCIPAL';

// ─── DB Row Types ─────────────────────────────────────────────────────────────

export interface RnvRoleRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  seniority: RnvSeniority;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface RnvRoleRelationshipRow {
  id: string;
  org_id: string;
  from_role_id: string;
  to_role_id: string;
  relationship_type: RnvRelationshipType;
  notes: string | null;
  created_at: string;
}

export interface RnvEmployeeRoleRow {
  id: string;
  org_id: string;
  employee_id: string;
  role_id: string;
  is_primary: boolean;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

/** Row shape returned by the rnv_role_network_v view. */
export interface RnvRoleNetworkRow extends RnvRoleRow {
  current_headcount: number;
  relationship_count: number;
}

// ─── App-Layer Types ──────────────────────────────────────────────────────────

/** Full role with network stats (from rnv_role_network_v view). */
export interface RnvRole extends RnvRoleNetworkRow {
  /** Outgoing + incoming relationships for this role (populated from store). */
  relationships: RnvRoleRelationship[];
  /** Employee assignments for this role (populated from store). */
  employeeRoles: RnvEmployeeRole[];
}

export type RnvRoleRelationship = RnvRoleRelationshipRow;
export type RnvEmployeeRole = RnvEmployeeRoleRow;

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface CreateRnvRolePayload {
  name: string;
  description?: string | null;
  seniority?: RnvSeniority;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateRnvRolePayload {
  name?: string;
  description?: string | null;
  seniority?: RnvSeniority;
  is_active?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface AddRnvRelationshipPayload {
  from_role_id: string;
  to_role_id: string;
  relationship_type: RnvRelationshipType;
  notes?: string | null;
}

export interface AssignRnvEmployeeRolePayload {
  employee_id: string;
  role_id: string;
  is_primary?: boolean;
  started_at?: string | null;
  ended_at?: string | null;
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export const DEFAULT_RNV_FILTERS = {
  seniority: 'ALL' as RnvSeniority | 'ALL',
  relationshipType: 'ALL' as RnvRelationshipType | 'ALL',
  isActive: true as boolean,
};

export type RnvFilters = typeof DEFAULT_RNV_FILTERS;

// ─── Plan Gate ────────────────────────────────────────────────────────────────

export function canAccessRoleNetwork(orgPlan: OrgPlan): boolean {
  return orgPlan === 'ENTERPRISE';
}

export class RoleNetworkPlanGateError extends Error {
  constructor(orgPlan: string) {
    super(
      `Role Network View requires ENTERPRISE plan. Current plan: ${orgPlan}`
    );
    this.name = 'RoleNetworkPlanGateError';
  }
}

// ─── Label Constants (Thai) ───────────────────────────────────────────────────

export const RNV_RELATIONSHIP_TYPE_LABEL_TH: Record<RnvRelationshipType, string> = {
  COLLABORATES_WITH: 'ทำงานร่วมกัน',
  DEPENDS_ON:        'พึ่งพา',
  MENTORS:           'สอนงาน',
  REVIEWS:           'ตรวจสอบ',
  ESCALATES_TO:      'ส่งต่อ',
};

export const RNV_SENIORITY_LABEL_TH: Record<RnvSeniority, string> = {
  JUNIOR:    'จูเนียร์',
  MID:       'มิด-เลเวล',
  SENIOR:    'ซีเนียร์',
  LEAD:      'ลีด',
  PRINCIPAL: 'พรินซิเพิล',
};

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function mapRnvRoleRow(row: RnvRoleNetworkRow): RnvRole {
  return {
    ...row,
    relationships: [],
    employeeRoles: [],
  };
}

export function mapRnvRelationshipRow(
  row: RnvRoleRelationshipRow
): RnvRoleRelationship {
  return { ...row };
}

export function mapRnvEmployeeRoleRow(row: RnvEmployeeRoleRow): RnvEmployeeRole {
  return { ...row };
}
