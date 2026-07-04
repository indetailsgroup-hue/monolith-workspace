// Feature: monolith-workflow-copilot — integration tests (task 18.1, 18.2)
// Consume the ACTUAL daph-second-brain Knowledge_Export and assert the workflow can ingest it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { validateExport, normalizeProcessModel, accountableForStep, approversForStep, type KnowledgeExport } from '../import';
import { evaluateEscalation } from '../../resolver/escalation';
import { DEFAULT_WORKFLOW_CONFIG } from '../../domain/config';

const EXPORT_PATH = path.resolve(process.cwd(), 'daph-second-brain/_knowledge-export.json');

function loadRealExport(): KnowledgeExport {
  return JSON.parse(readFileSync(EXPORT_PATH, 'utf8')) as KnowledgeExport;
}

describe('Integration 18.1: consume real Knowledge_Export', () => {
  const exp = loadRealExport();

  it('real export passes validation (process model / quorum / freshness / raci shape)', () => {
    const res = validateExport(exp);
    expect(res).toEqual({ valid: true, errors: [] });
  });

  it('canonical process model normalizes with contiguous order from 0; Sale first, Installation group present', () => {
    const norm = normalizeProcessModel(exp);
    expect(norm.length).toBeGreaterThan(0);
    // order ต่อเนื่อง 0..n-1
    norm.forEach((n, i) => expect(n.order).toBe(i));
    const steps = norm.map((n) => n.step);
    expect(steps[0]).toBe('Sale');
    expect(steps).toContain('Designer');
    // Installation เป็น subProcessGroup (ขั้นย่อยติดตั้งหลายขั้น) ไม่ใช่ step ชื่อตรง
    expect(norm.some((n) => n.group === 'Installation')).toBe(true);
    expect(norm.some((n) => n.group === 'Factory')).toBe(true);
  });

  it('RACI accountable resolves for an approval step (Designer)', () => {
    const acc = accountableForStep(exp, 'Designer');
    expect(acc.length).toBe(1);
    expect(typeof acc[0]).toBe('string');
    expect(acc[0].length).toBeGreaterThan(0);
  });

  it('ADR-018: Designer (unanimous) approversForStep returns the explicit approvers set (≥2)', () => {
    const approvers = approversForStep(exp, 'Designer', 'unanimous');
    expect(approvers.length).toBeGreaterThanOrEqual(2); // จาก approvers[].ref ไม่ใช่ accountable เดี่ยว
    approvers.forEach((r) => expect(typeof r).toBe('string'));
  });

  it('approval steps carry a quorum in the normalized model', () => {
    const norm = normalizeProcessModel(exp);
    const designer = norm.find((n) => n.step === 'Designer');
    expect(designer?.requiresApproval).toBe(true);
    expect(designer?.quorum).toBe('unanimous');
  });

  it('freshness fields present (source_version / imported_at / review_status)', () => {
    const f = exp.knowledgeFreshness as Record<string, unknown>;
    expect(typeof f.sourceVersion).toBe('string');
    expect(typeof f.importedAt).toBe('string');
    expect(typeof f.reviewStatus).toBe('string');
  });
});

describe('Integration 18.2: Installation stage notifies Sale + PM (Req 8.6)', () => {
  it('Installation escalation routes to installation_lead and notifies Sale + Project_Manager', () => {
    const d = evaluateEscalation({ stage: 'installation' }, DEFAULT_WORKFLOW_CONFIG.escalation);
    expect(d.target).toBe('installation_lead');
    expect(d.notify).toEqual(['Sale', 'Project_Manager']);
  });
});
