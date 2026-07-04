// Feature: monolith-workflow-copilot — audit writer + secret scrub (Req 9.1, 9.3, 9.5, 9.6)

export interface AuditEntryInput {
  eventType: string;
  workItemId?: string | null;
  processStep?: string | null;
  siteCode?: string | null;
  performedBy: string; // resolve_actor()
  detail?: Record<string, unknown>;
}

export interface AuditEntry {
  eventType: string;
  workItemId: string | null;
  processStep: string | null;
  siteCode: string | null;
  performedBy: string;
  /** UTC ISO timestamp */
  occurredAt: string;
  detail: Record<string, unknown>;
}

const REQUIRED_FIELDS: (keyof AuditEntry)[] = [
  'eventType',
  'performedBy',
  'occurredAt',
];

/**
 * Req 9.1 — ประกอบ audit entry ครบ field (UTC); field ที่ไม่ทราบ → null (ยังครบโครงสร้าง).
 */
export function buildAuditEntry(input: AuditEntryInput, nowIso: string): AuditEntry {
  return {
    eventType: input.eventType,
    workItemId: input.workItemId ?? null,
    processStep: input.processStep ?? null,
    siteCode: input.siteCode ?? null,
    performedBy: input.performedBy,
    occurredAt: nowIso,
    detail: input.detail ?? {},
  };
}

/** ตรวจความครบถ้วนของ audit entry (Req 9.1) */
export function isCompleteAuditEntry(entry: AuditEntry): boolean {
  return REQUIRED_FIELDS.every((f) => {
    const v = entry[f];
    return typeof v === 'string' && v.length > 0;
  });
}

/** Req 9.3/9.5 — scrub ความลับออกจากสตริง (แทนที่ด้วย [REDACTED]) */
export function scrubString(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) {
    if (s.length === 0) continue;
    out = out.split(s).join('[REDACTED]');
  }
  return out;
}

/** scrub ความลับแบบ deep ในทุก string ของ object (Req 9.5 — ทุกผลลัพธ์) */
export function scrubObject<T>(obj: T, secrets: readonly string[]): T {
  if (typeof obj === 'string') return scrubString(obj, secrets) as unknown as T;
  if (Array.isArray(obj)) return obj.map((v) => scrubObject(v, secrets)) as unknown as T;
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = scrubObject(v, secrets);
    return out as T;
  }
  return obj;
}

export interface AuditWriteResult {
  /** แถว audit ที่บันทึก (คงไว้เสมอ — Req 9.6) */
  entry: AuditEntry;
  /** scrub สำเร็จหรือไม่ (best-effort) */
  scrubbed: boolean;
}

/**
 * Req 9.6 — เขียนแถว audit ก่อน แล้ว scrub best-effort:
 * แม้ scrub โยน exception แถว audit ต้องคงอยู่ (scrubbed=false) ไม่ทำให้ทั้ง entry หาย.
 */
export function writeAuditWithScrub(
  entry: AuditEntry,
  secrets: readonly string[],
): AuditWriteResult {
  try {
    const scrubbedDetail = scrubObject(entry.detail, secrets);
    return { entry: { ...entry, detail: scrubbedDetail }, scrubbed: true };
  } catch {
    // scrub ล้มเหลว → คงแถว audit เดิม (ยังบันทึก ไม่หาย)
    return { entry, scrubbed: false };
  }
}
