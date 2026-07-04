// Feature: monolith-workflow-copilot — Knowledge_Export validation + last-good (Req 11.1–11.5, 11.8–11.10)
// Schema = ACTUAL daph-second-brain export (consume, ไม่ redefine):
//   processModel[]: { processStep, subProcessGroup, requiresApproval, approvalQuorum, canonicalOrder }
//   raciMap: { status, entries: [{ processStep, responsible, accountable, consulted[], informed[] }] }
//   approvalQuorumByStep: { <step>: quorum|null }
//   pfmeaRiskRows[]: { processStep, actionPriority, rpnStatus, ... }
//   knowledgeFreshness: { sourceVersion, importedAt, reviewStatus }
// หมายเหตุ: step เป็น string อิสระจาก export (รวม Factory stations) — ไม่ผูกกับ union แคบใน domain/types.
import { APPROVAL_QUORUMS } from '../domain/constants';

export interface KnowledgeFreshness {
  sourceVersion: string;
  importedAt: string;
  reviewStatus: string;
}

export interface ExportProcessModelEntry {
  processStep: string;
  subProcessGroup: string;
  requiresApproval: boolean;
  approvalQuorum: string | null;
  canonicalOrder: number;
}

export interface RaciEntry {
  processStep: string;
  responsible?: string;
  accountable?: string; // single role (canonical export shape)
  approvers?: { ref: string; kind?: string }[]; // explicit multi-approver set (unanimous steps)
  consulted?: string[];
  informed?: string[];
}

export interface KnowledgeExport {
  schemaVersion?: string;
  knowledgeFreshness?: unknown;
  processModel?: unknown;
  pfmeaRiskRows?: unknown;
  raciMap?: unknown;
  approvalQuorumByStep?: unknown;
}

export interface ValidationOutcome {
  valid: boolean;
  errors: string[];
}

/** canonical projection ที่โมดูลอื่น (handoff/resolver) ใช้ */
export interface NormalizedProcessStep {
  step: string;
  order: number;
  group: string;
  quorum: string | null;
  requiresApproval: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

const QUORUM_OK = (v: unknown): boolean =>
  v === null || (typeof v === 'string' && (APPROVAL_QUORUMS as readonly string[]).includes(v));

/**
 * Req 11.2/11.3/11.8/11.9/11.10 — validate รูปร่าง Knowledge_Export จริง:
 *   - pfmeaRiskRows เป็น array
 *   - processModel เป็น array, canonicalOrder ต่อเนื่อง 0..n-1
 *   - raciMap เป็น object ที่มี entries เป็น array
 *   - approvalQuorumByStep เป็น object, ค่า ∈ {unanimous,majority,first_response,null}
 *   - knowledgeFreshness มี sourceVersion/importedAt/reviewStatus
 */
export function validateExport(payload: unknown): ValidationOutcome {
  const errors: string[] = [];
  if (!isRecord(payload)) return { valid: false, errors: ['payload_not_object'] };
  const p = payload as KnowledgeExport;

  if (!Array.isArray(p.pfmeaRiskRows)) errors.push('pfmeaRiskRows_not_array');

  if (!Array.isArray(p.processModel)) {
    errors.push('processModel_not_array');
  } else {
    const rows = p.processModel as ExportProcessModelEntry[];
    const orders = rows.map((m) => m?.canonicalOrder);
    const sorted = [...orders].sort((a, b) => a - b);
    const contiguousFromZero = orders.length > 0 && sorted.every((o, i) => o === i);
    if (!contiguousFromZero) errors.push('processModel_canonicalOrder_not_contiguous_from_zero');
    if (rows.some((m) => typeof m?.processStep !== 'string')) errors.push('processModel_missing_processStep');
  }

  if (!isRecord(p.raciMap) || !Array.isArray((p.raciMap as { entries?: unknown }).entries)) {
    errors.push('raciMap_entries_not_array');
  }

  if (!isRecord(p.approvalQuorumByStep)) {
    errors.push('approvalQuorumByStep_not_object');
  } else {
    for (const v of Object.values(p.approvalQuorumByStep)) {
      if (!QUORUM_OK(v)) {
        errors.push('approvalQuorumByStep_invalid_value');
        break;
      }
    }
  }

  const f = p.knowledgeFreshness;
  if (!isRecord(f) || typeof f.sourceVersion !== 'string' || typeof f.importedAt !== 'string' || typeof f.reviewStatus !== 'string') {
    errors.push('knowledgeFreshness_incomplete');
  }

  return { valid: errors.length === 0, errors };
}

/** Req 11.3/11.8 — normalize processModel → canonical projection (step/order/group/quorum) */
export function normalizeProcessModel(payload: KnowledgeExport): NormalizedProcessStep[] {
  const rows = Array.isArray(payload.processModel) ? (payload.processModel as ExportProcessModelEntry[]) : [];
  return rows
    .map((m) => ({
      step: m.processStep,
      order: m.canonicalOrder,
      group: m.subProcessGroup,
      quorum: m.approvalQuorum ?? null,
      requiresApproval: Boolean(m.requiresApproval),
    }))
    .sort((a, b) => a.order - b.order);
}

/** Req 3.1 — accountable role(s) ของ step จาก raciMap.entries (accountable เดี่ยว → array 1 ตัว) */
export function accountableForStep(payload: KnowledgeExport, step: string): string[] {
  const entries =
    isRecord(payload.raciMap) && Array.isArray((payload.raciMap as { entries?: unknown }).entries)
      ? ((payload.raciMap as { entries: RaciEntry[] }).entries)
      : [];
  const entry = entries.find((e) => e.processStep === step);
  if (entry === undefined || entry.accountable === undefined || entry.accountable === null) return [];
  return [entry.accountable];
}

/**
 * ADR-018 — approver set ของ step ตาม quorum:
 *   unanimous → `approvers[].ref` (เซ็ตหลายคน; fallback เป็น accountable ถ้าไม่มี)
 *   first_response / single → accountable (คนเดียว)
 */
export function approversForStep(payload: KnowledgeExport, step: string, quorum: string): string[] {
  if (quorum === 'unanimous') {
    const entries =
      isRecord(payload.raciMap) && Array.isArray((payload.raciMap as { entries?: unknown }).entries)
        ? ((payload.raciMap as { entries: RaciEntry[] }).entries)
        : [];
    const refs: string[] = [];
    for (const e of entries) {
      if (e.processStep === step && Array.isArray(e.approvers)) {
        for (const a of e.approvers) {
          if (a !== null && typeof a.ref === 'string' && a.ref.length > 0) refs.push(a.ref);
        }
      }
    }
    if (refs.length > 0) return refs;
  }
  return accountableForStep(payload, step);
}

/** Req 11.5/11.8 — invalid candidate → คง last-good */
export function selectCurrent<T extends KnowledgeExport>(
  lastGood: T | null,
  candidate: unknown,
): { current: T | null; accepted: boolean } {
  const outcome = validateExport(candidate);
  if (outcome.valid) return { current: candidate as T, accepted: true };
  return { current: lastGood, accepted: false };
}
