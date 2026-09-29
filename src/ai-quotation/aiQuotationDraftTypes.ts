// src/ai-quotation/aiQuotationDraftTypes.ts
// MONOLITH v18.0 — AI Quotation Draft Module

import type { OrgPlan } from '../tenant/types';

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────

export type AqdDraftStatus   = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type AqdLineItemType  = 'PRODUCT' | 'SERVICE' | 'MATERIAL' | 'LABOR' | 'DISCOUNT' | 'CUSTOM';

// ─────────────────────────────────────────────────────────────
// DB Row Types
// ─────────────────────────────────────────────────────────────

export interface AqdQuotationDraftRow {
  id:              string;
  org_id:          string;
  title:           string;
  customer_name:   string | null;
  customer_email:  string | null;
  status:          AqdDraftStatus;
  subtotal_thb:    number;
  tax_rate:        number;
  tax_amount_thb:  number;
  total_thb:       number;
  notes:           string | null;
  generated_by_ai: boolean;
  ai_prompt:       string | null;
  created_by:      string;
  reviewed_by:     string | null;
  reviewed_at:     string | null;
  created_at:      string;
  updated_at:      string;
}

export interface AqdDraftLineItemRow {
  id:              string;
  draft_id:        string;
  org_id:          string;
  item_type:       AqdLineItemType;
  description:     string;
  quantity:        number;
  unit_price_thb:  number;
  /** GENERATED ALWAYS AS (quantity * unit_price_thb) STORED */
  line_total_thb:  number;
  sort_order:      number;
  notes:           string | null;
  created_at:      string;
  updated_at:      string;
}

export interface AqdGenerationLogRow {
  id:            string;
  org_id:        string;
  draft_id:      string | null;
  prompt:        string;
  model:         string;
  tokens_used:   number | null;
  duration_ms:   number | null;
  success:       boolean;
  error_message: string | null;
  created_by:    string;
  created_at:    string;
}

export interface AqdDraftSummaryRow {
  org_id:          string;
  status:          AqdDraftStatus;
  draft_count:     number;
  total_value_thb: number;
}

// ─────────────────────────────────────────────────────────────
// App-level Aliases (camelCase dates)
// ─────────────────────────────────────────────────────────────

export interface AiQuotationDraft extends AqdQuotationDraftRow {
  createdAt:  string;
  updatedAt:  string;
  reviewedAt: string | null;
}

export interface AiQuotationLineItem extends AqdDraftLineItemRow {
  createdAt: string;
  updatedAt: string;
}

export interface AiGenerationLog extends AqdGenerationLogRow {
  createdAt: string;
}

export interface AiQuotationDraftSummary {
  orgId:          string;
  status:         AqdDraftStatus;
  draftCount:     number;
  totalValueThb:  number;
}

// ─────────────────────────────────────────────────────────────
// Payloads
// ─────────────────────────────────────────────────────────────

export interface CreateAqdDraftPayload {
  org_id:          string;
  title:           string;
  customer_name?:  string;
  customer_email?: string;
  tax_rate?:       number;
  notes?:          string;
  generated_by_ai?: boolean;
  ai_prompt?:      string;
}

export interface UpdateAqdDraftPayload {
  title?:          string;
  customer_name?:  string;
  customer_email?: string;
  tax_rate?:       number;
  notes?:          string;
  status?:         AqdDraftStatus;
}

export interface CreateAqdLineItemPayload {
  draft_id:       string;
  org_id:         string;
  item_type:      AqdLineItemType;
  description:    string;
  quantity:       number;
  unit_price_thb: number;
  sort_order?:    number;
  notes?:         string;
}

export interface UpdateAqdLineItemPayload {
  item_type?:      AqdLineItemType;
  description?:    string;
  quantity?:       number;
  unit_price_thb?: number;
  sort_order?:     number;
  notes?:          string;
}

// ─────────────────────────────────────────────────────────────
// Plan Gate
// ─────────────────────────────────────────────────────────────

export function canAccessAiQuotation(plan: OrgPlan): boolean {
  return plan === 'ENTERPRISE';
}

export class AiQuotationPlanGateError extends Error {
  constructor(plan: OrgPlan) {
    super(
      `AI Quotation Draft requires an ENTERPRISE plan. Current plan: ${plan}`
    );
    this.name = 'AiQuotationPlanGateError';
  }
}

// ─────────────────────────────────────────────────────────────
// Thai Labels
// ─────────────────────────────────────────────────────────────

export const AQD_DRAFT_STATUS_LABELS: Record<AqdDraftStatus, string> = {
  DRAFT:          'ร่าง',
  PENDING_REVIEW: 'รอตรวจสอบ',
  APPROVED:       'อนุมัติแล้ว',
  REJECTED:       'ปฏิเสธ',
};

export const AQD_LINE_ITEM_TYPE_LABELS: Record<AqdLineItemType, string> = {
  PRODUCT:  'สินค้า',
  SERVICE:  'บริการ',
  MATERIAL: 'วัสดุ',
  LABOR:    'แรงงาน',
  DISCOUNT: 'ส่วนลด',
  CUSTOM:   'กำหนดเอง',
};

// ─────────────────────────────────────────────────────────────
// Getters
// ─────────────────────────────────────────────────────────────

export function getDraftStatusLabel(status: AqdDraftStatus): string {
  return AQD_DRAFT_STATUS_LABELS[status];
}

export function getLineItemTypeLabel(type: AqdLineItemType): string {
  return AQD_LINE_ITEM_TYPE_LABELS[type];
}

// ─────────────────────────────────────────────────────────────
// Mappers  (DB Row → App Type)
// ─────────────────────────────────────────────────────────────

export function mapDraftRow(row: AqdQuotationDraftRow): AiQuotationDraft {
  return {
    ...row,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
    reviewedAt: row.reviewed_at,
  };
}

export function mapLineItemRow(row: AqdDraftLineItemRow): AiQuotationLineItem {
  return {
    ...row,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapGenerationLogRow(row: AqdGenerationLogRow): AiGenerationLog {
  return {
    ...row,
    createdAt: row.created_at,
  };
}

export function mapDraftSummaryRow(row: AqdDraftSummaryRow): AiQuotationDraftSummary {
  return {
    orgId:         row.org_id,
    status:        row.status,
    draftCount:    Number(row.draft_count),
    totalValueThb: Number(row.total_value_thb),
  };
}

// ─────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────

export interface AqdFilters {
  status:         AqdDraftStatus | 'ALL';
  generatedByAi:  boolean | 'ALL';
}

export const DEFAULT_AQD_FILTERS: AqdFilters = {
  status:        'ALL',
  generatedByAi: 'ALL',
};
