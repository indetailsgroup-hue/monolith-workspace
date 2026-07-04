// Feature: monolith-accounting, Property ACC-13: PDM Sync, Upsert & Revision History
// Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { syncAll, syncEvent, emptyPdmState, type PdmEvent } from '../pdm';

const arbEvent: fc.Arbitrary<PdmEvent> = fc.record({
  eventId: fc.string({ minLength: 1, maxLength: 6 }),
  partNo: fc.constantFrom('P-1', 'P-2', 'P-3'),
  revision: fc.constantFrom('A', 'B', 'C', 'D'),
  bom: fc.array(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 4 }),
});
// eventId unique (idempotent key เป็น identity)
const arbEvents = fc.uniqueArray(arbEvent, { maxLength: 30, selector: (e) => e.eventId });

describe('PDM — Property ACC-13', () => {
  it('upsert ตาม partNo: part count = จำนวน partNo distinct (ไม่สร้างซ้ำ) (11.2)', () => {
    fc.assert(
      fc.property(arbEvents, (events) => {
        const st = syncAll(events);
        const distinctParts = new Set(events.map((e) => e.partNo));
        expect(st.parts.size).toBe(distinctParts.size);
      }),
      { numRuns: 300 },
    );
  });

  it('revision history ครบ: จำนวน history = จำนวนครั้งที่ partNo นั้นถูก sync − 1 (11.3)', () => {
    fc.assert(
      fc.property(arbEvents, (events) => {
        const st = syncAll(events);
        const countByPart = new Map<string, number>();
        for (const e of events) countByPart.set(e.partNo, (countByPart.get(e.partNo) ?? 0) + 1);
        for (const [partNo, rec] of st.parts) {
          expect(rec.revisionHistory.length).toBe((countByPart.get(partNo) ?? 0) - 1);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('idempotent ตาม eventId: sync ซ้ำ eventId เดิม → state ไม่เปลี่ยน (11.5)', () => {
    fc.assert(
      fc.property(arbEvents, (events) => {
        const st1 = syncAll(events);
        let st2 = st1;
        for (const e of events) st2 = syncEvent(st2, e); // ซ้ำทั้งหมด
        expect(st2.parts.size).toBe(st1.parts.size);
        for (const [p, rec] of st2.parts) {
          expect(rec.revisionHistory.length).toBe(st1.parts.get(p)!.revisionHistory.length);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('revision ล่าสุด = revision ของ event สุดท้ายของ partNo นั้น', () => {
    let st = emptyPdmState();
    st = syncEvent(st, { eventId: 'e1', partNo: 'P-1', revision: 'A', bom: [] });
    st = syncEvent(st, { eventId: 'e2', partNo: 'P-1', revision: 'B', bom: ['x'] });
    const rec = st.parts.get('P-1')!;
    expect(rec.revision).toBe('B');
    expect(rec.revisionHistory).toEqual(['A']);
    expect(rec.bom).toEqual(['x']);
  });

  it('fail-safe: partNo ว่าง → throw (11.4)', () => {
    expect(() => syncEvent(emptyPdmState(), { eventId: 'e', partNo: '', revision: 'A', bom: [] })).toThrow();
  });
});
