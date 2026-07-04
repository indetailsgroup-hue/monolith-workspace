// Feature: monolith-workflow-copilot — property tests for audit writer + scrub (Req 9)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  buildAuditEntry,
  isCompleteAuditEntry,
  scrubString,
  scrubObject,
  writeAuditWithScrub,
  type AuditEntry,
} from '../writer';

const NOW = '2026-01-01T00:00:00.000Z';

describe('audit writer (Req 9)', () => {
  // Feature: monolith-workflow-copilot, Property 18: ความครบถ้วนของ Workflow_Audit_Log
  it('Property 18: audit entry มี field ครบเสมอ (UTC); field ไม่ทราบ → null', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.string({ minLength: 1, maxLength: 8 }),
        (eventType, actor) => {
          const entry = buildAuditEntry({ eventType, performedBy: actor }, NOW);
          expect(isCompleteAuditEntry(entry)).toBe(true);
          expect(entry.occurredAt).toBe(NOW);
          expect(entry.workItemId).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: monolith-workflow-copilot, Property 19: การลบความลับออกจากทุกผลลัพธ์
  it('Property 19: ความลับถูก scrub จากทุก string ใน object', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 3, maxLength: 8 }), fc.string(), (secret, ctx) => {
        const payload = {
          a: `${ctx}${secret}${ctx}`,
          nested: { b: secret, arr: [secret, 'safe'] },
        };
        const scrubbed = scrubObject(payload, [secret]);
        const json = JSON.stringify(scrubbed);
        expect(json.includes(secret)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('scrubString แทนที่ด้วย [REDACTED]', () => {
    expect(scrubString('token=abc123', ['abc123'])).toBe('token=[REDACTED]');
  });

  // Feature: monolith-workflow-copilot, Property 20: การคงรายการ audit แม้การ scrub ล้มเหลว
  it('Property 20: scrub ล้มเหลว → แถว audit ยังคงอยู่ (scrubbed=false)', () => {
    const entry: AuditEntry = buildAuditEntry(
      { eventType: 'e', performedBy: 'actor', detail: { x: 1 } },
      NOW,
    );
    // จำลอง detail ที่ทำให้ scrubObject throw (circular)
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const entryWithBadDetail: AuditEntry = { ...entry, detail: { bad: circular } };
    // scrubObject เดินซ้ำ circular → RangeError; writeAuditWithScrub ต้อง catch และคงแถว
    const res = writeAuditWithScrub(entryWithBadDetail, ['secret']);
    expect(res.scrubbed).toBe(false);
    expect(res.entry.eventType).toBe('e');
    expect(res.entry.performedBy).toBe('actor');
  });
});
