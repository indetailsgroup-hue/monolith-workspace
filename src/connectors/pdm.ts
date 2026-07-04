// Feature: monolith-accounting — PDM_Sync_Connector core (ACC-13 Sync, Upsert & Revision History)
// Pure: onWebhook idempotent ตาม eventId; upsert ตาม partNo (ไม่เพิ่ม part ซ้ำ); เก็บ revision history ครบ.
// fail-safe: partNo ว่าง → throw (Req 11.4 ปฏิเสธ payload ไม่ครบ).

export interface PdmEvent {
  eventId: string;
  partNo: string;
  revision: string;
  bom: readonly string[]; // material/part refs
}

export interface PartRecord {
  partNo: string;
  revision: string;
  bom: readonly string[];
  revisionHistory: readonly string[]; // revision ก่อนหน้าทั้งหมด (เก่า→ใหม่)
}

export interface PdmState {
  parts: ReadonlyMap<string, PartRecord>;
  processedEvents: ReadonlySet<string>;
}

export function emptyPdmState(): PdmState {
  return { parts: new Map(), processedEvents: new Set() };
}

/**
 * Req 11.1/11.2/11.3 — sync webhook: idempotent ตาม eventId; upsert ตาม partNo;
 *   revision ใหม่ → push revision ปัจจุบันเข้า history (part count ไม่เพิ่มถ้า partNo เดิม).
 * Req 11.4 — partNo ว่าง → throw (ปฏิเสธ + ไม่แก้ state).
 */
export function syncEvent(state: PdmState, ev: PdmEvent): PdmState {
  if (!ev.partNo) throw new Error('pdm: partNo ว่าง (ปฏิเสธ payload ไม่ครบ)');
  if (!ev.eventId) throw new Error('pdm: eventId ว่าง');
  if (state.processedEvents.has(ev.eventId)) return state; // idempotent (Req 11.5)

  const parts = new Map(state.parts);
  const existing = parts.get(ev.partNo);
  if (existing) {
    // upsert: revision ปัจจุบันเข้า history (ครบทุกครั้งที่มี revision ใหม่)
    parts.set(ev.partNo, {
      partNo: ev.partNo,
      revision: ev.revision,
      bom: [...ev.bom],
      revisionHistory: [...existing.revisionHistory, existing.revision],
    });
  } else {
    parts.set(ev.partNo, { partNo: ev.partNo, revision: ev.revision, bom: [...ev.bom], revisionHistory: [] });
  }
  const processedEvents = new Set(state.processedEvents);
  processedEvents.add(ev.eventId);
  return { parts, processedEvents };
}

export function syncAll(events: readonly PdmEvent[]): PdmState {
  return events.reduce((st, ev) => syncEvent(st, ev), emptyPdmState());
}
