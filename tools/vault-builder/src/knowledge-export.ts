/**
 * knowledge-export.ts — Knowledge_Export emitter core (Phase 3)
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export)
 * Consumer contract: monolith-workflow-copilot Req 11 (read-only import ผ่าน rpc_import_knowledge)
 * อิง ADR-009 (emit machine-readable), ADR-010 (3D สองขั้น), ADR-011/012 (RPN/AP fail-safe)
 *
 * โมดูลนี้ประกอบ Knowledge_Export object แบบบริสุทธิ์ (pure assembly) จาก:
 *   - PROCESS_MODEL (canonical 6+6+16 ขั้น, 0-based)
 *   - PFMEA rows ดิบ (sev/occ/det) → ผ่าน risk-scoring (rpn + action_priority + rpn_status)
 *   - RACI entries (draft-guard: status + confidence ต่อ entry)
 *   - Knowledge_Freshness (source_version / imported_at / review_status)
 * พร้อม validateKnowledgeExport() สำหรับ schema validation เข้ม (last-good fallback ฝั่ง consumer)
 */

import {
  PROCESS_MODEL,
  PROCESS_STEP_IDS,
  type ApprovalQuorum,
  type ProcessStep,
} from './process-model.js';
import { scoreRisk, type RiskScore } from './risk-scoring.js';

export const KNOWLEDGE_EXPORT_SCHEMA_VERSION = '1.0.0';

export type ReviewStatus = 'approved' | 'pending' | 'draft';
export type RaciStatus = 'draft' | 'confirmed';
export type RaciConfidence = 'high' | 'needs_confirmation';

/**
 * ชนิดของผู้อนุมัติใน RACI (รองรับ 2 ชนิด):
 *  - 'role'     : ผู้อนุมัติเชิงตำแหน่ง (role-based) เช่น 'ผู้จัดการฝ่ายออกแบบ' — map กับ C12 role ฝั่ง workflow
 *  - 'customer' : ผู้อนุมัติแบบ project-scoped (ลูกค้าเซ็นผ่าน LINE) — ไม่ใช่ C12 principal (ดู workflow Req 20)
 */
export type ApproverKind = 'role' | 'customer';

export interface RaciApprover {
  kind: ApproverKind;
  /** role: ชื่อตำแหน่ง; customer: marker 'ลูกค้า' (project-scoped, resolve ผ่าน line_oa_customer_identity ฝั่ง workflow) */
  ref: string;
}

export interface KnowledgeFreshness {
  sourceVersion: string;
  /** ISO-8601 timestamp */
  importedAt: string;
  reviewStatus: ReviewStatus;
}

/** PFMEA row ดิบจากต้นฉบับ (ก่อนให้คะแนน) */
export interface PfmeaRiskRowInput {
  processStep: string;
  /** คอลัมน์ Requirement (เนื้อหากิจกรรม) — เก็บไว้กัน data-loss ของ row ที่กรอกแค่ Requirement+SEV */
  requirement?: string;
  failureMode: string;
  cause: string;
  control: string;
  sev: number | null;
  occ: number | null;
  det: number | null;
  /** ไฟล์ต้นทาง (traceability) — ฉบับ canonical ที่เลือกต่อหน่วย */
  sourceFile: string;
  /** ชื่อ step ภายในไฟล์ต้นทาง (sub-step provenance เช่น "1. Incoming Inspection") */
  sourceStep?: string;
}

/** PFMEA row หลังให้คะแนน (ออกใน export) */
export interface PfmeaRiskRow extends RiskScore {
  processStep: string;
  requirement?: string;
  failureMode: string;
  cause: string;
  control: string;
  sourceFile: string;
  sourceStep?: string;
}

export interface RaciEntryInput {
  processStep: string;
  responsible: string | null;
  accountable: string | null;
  consulted: string[];
  informed: string[];
  confidence: RaciConfidence;
  /**
   * Approver set (ตามการตัดสิน OQ-KX-2 §7) — รองรับ 2 ชนิด (role-based + customer-project-scoped).
   * ถ้าไม่ระบุ → consumer derive ผู้อนุมัติจาก `accountable` (role) เดี่ยว (backward compatible).
   * เมื่อมี approver kind='customer' → ขั้นนั้นต้องใช้ quorum=unanimous (บังคับใน validateKnowledgeExport).
   */
  approvers?: RaciApprover[];
}

export interface BuildInput {
  pfmea: PfmeaRiskRowInput[];
  raci: RaciEntryInput[];
  raciStatus: RaciStatus;
  freshness: KnowledgeFreshness;
}

export interface KnowledgeExport {
  schemaVersion: string;
  knowledgeFreshness: KnowledgeFreshness;
  processModel: readonly ProcessStep[];
  pfmeaRiskRows: PfmeaRiskRow[];
  raciMap: {
    status: RaciStatus;
    entries: RaciEntryInput[];
  };
  approvalQuorumByStep: Record<string, ApprovalQuorum | null>;
}

/** ประกอบ Knowledge_Export (pure) */
export function buildKnowledgeExport(input: BuildInput): KnowledgeExport {
  const pfmeaRiskRows: PfmeaRiskRow[] = input.pfmea.map((row) => {
    const score = scoreRisk(row.sev, row.occ, row.det);
    return {
      processStep: row.processStep,
      requirement: row.requirement,
      failureMode: row.failureMode,
      cause: row.cause,
      control: row.control,
      sourceFile: row.sourceFile,
      sourceStep: row.sourceStep,
      ...score,
    };
  });

  const approvalQuorumByStep: Record<string, ApprovalQuorum | null> = {};
  for (const step of PROCESS_MODEL) {
    approvalQuorumByStep[step.processStep] = step.approvalQuorum;
  }

  return {
    schemaVersion: KNOWLEDGE_EXPORT_SCHEMA_VERSION,
    knowledgeFreshness: input.freshness,
    processModel: PROCESS_MODEL,
    pfmeaRiskRows,
    raciMap: { status: input.raciStatus, entries: input.raci },
    approvalQuorumByStep,
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const REVIEW_STATUSES: ReadonlySet<string> = new Set(['approved', 'pending', 'draft']);
const RACI_STATUSES: ReadonlySet<string> = new Set(['draft', 'confirmed']);

/**
 * ตรวจ schema เข้ม — consumer (workflow Req 11.5) ปฏิเสธ export ที่ invalid
 * แล้วคง last-good ฉบับก่อนหน้า
 */
export function validateKnowledgeExport(exp: KnowledgeExport): ValidationResult {
  const errors: string[] = [];

  if (exp.schemaVersion !== KNOWLEDGE_EXPORT_SCHEMA_VERSION) {
    errors.push(`schemaVersion mismatch: expected ${KNOWLEDGE_EXPORT_SCHEMA_VERSION}, got ${exp.schemaVersion}`);
  }

  // freshness
  const f = exp.knowledgeFreshness;
  if (!f || !f.sourceVersion?.trim()) errors.push('knowledgeFreshness.sourceVersion is required');
  if (!f || !f.importedAt?.trim() || Number.isNaN(Date.parse(f.importedAt))) {
    errors.push('knowledgeFreshness.importedAt must be a valid ISO timestamp');
  }
  if (!f || !REVIEW_STATUSES.has(f.reviewStatus)) errors.push('knowledgeFreshness.reviewStatus is invalid');

  // process model — 0-based contiguous unique order + unique step ids
  const model = exp.processModel;
  if (!model || model.length === 0) {
    errors.push('processModel must be non-empty');
  } else {
    const orders = [...model].map((s) => s.canonicalOrder).sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== i) {
        errors.push(`processModel.canonicalOrder must be 0-based contiguous; missing or duplicate at ${i}`);
        break;
      }
    }
    const ids = new Set<string>();
    for (const s of model) {
      if (ids.has(s.processStep)) errors.push(`duplicate processStep id: ${s.processStep}`);
      ids.add(s.processStep);
      if (s.requiresApproval && s.approvalQuorum === null) {
        errors.push(`processStep ${s.processStep} requiresApproval but has no approvalQuorum`);
      }
    }
  }

  // pfmea rows
  for (const row of exp.pfmeaRiskRows) {
    if (!PROCESS_STEP_IDS.has(row.processStep)) {
      errors.push(`pfmeaRiskRows references unknown processStep: ${row.processStep}`);
    }
    const computed = row.rpnStatus === 'computed';
    if (computed && row.rpn !== (row.sev as number) * (row.occ as number) * (row.det as number)) {
      errors.push(`pfmea row (${row.processStep}) rpn mismatch`);
    }
    if (!computed && row.rpn !== null) {
      errors.push(`pfmea row (${row.processStep}) must have null rpn when not computed`);
    }
    if (!row.sourceFile?.trim()) {
      errors.push(`pfmea row (${row.processStep}) missing sourceFile (traceability required)`);
    }
  }

  // raci
  if (!RACI_STATUSES.has(exp.raciMap.status)) errors.push('raciMap.status is invalid');
  for (const e of exp.raciMap.entries) {
    if (!PROCESS_STEP_IDS.has(e.processStep)) {
      errors.push(`raciMap references unknown processStep: ${e.processStep}`);
    }
    if (e.confidence !== 'high' && e.confidence !== 'needs_confirmation') {
      errors.push(`raciMap entry (${e.processStep}) has invalid confidence`);
    }
    // approvers (optional) — รองรับ 2 ชนิด role/customer; ref ต้องไม่ว่าง
    if (e.approvers !== undefined) {
      for (const a of e.approvers) {
        if (a.kind !== 'role' && a.kind !== 'customer') {
          errors.push(`raciMap entry (${e.processStep}) has invalid approver kind: ${a.kind}`);
        }
        if (!a.ref?.trim()) {
          errors.push(`raciMap entry (${e.processStep}) has empty approver ref`);
        }
      }
      // coherence (OQ-KX-2 §7): มี customer approver → ขั้นนั้นต้อง quorum=unanimous
      const hasCustomer = e.approvers.some((a) => a.kind === 'customer');
      if (hasCustomer && exp.approvalQuorumByStep[e.processStep] !== 'unanimous') {
        errors.push(`raciMap entry (${e.processStep}) has customer approver but quorum ≠ unanimous`);
      }
    }
  }

  // approvalQuorumByStep keys ⊆ process step ids
  for (const key of Object.keys(exp.approvalQuorumByStep)) {
    if (!PROCESS_STEP_IDS.has(key)) errors.push(`approvalQuorumByStep has unknown step: ${key}`);
  }

  return { valid: errors.length === 0, errors };
}
