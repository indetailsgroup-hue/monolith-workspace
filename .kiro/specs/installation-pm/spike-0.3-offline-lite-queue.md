# Spike 0.3 — Offline-Lite Upload Queue (D-6a) · ผลการทดลอง

> สถานะ: ✅ **ผ่าน — กลไกพิสูจน์แล้วด้วยโค้ดจริง + 21 tests เขียว** (2026-07-06)
> โค้ด: `src/installation/offline-queue/` (queue core + IndexedDB adapter + sw-bridge) — พร้อมยกไปใช้ใน task 1.7 ตรง ๆ

## สิ่งที่ spike ต้องพิสูจน์ (จาก D-6a) และผล

| คำถาม | ผล |
|-------|-----|
| Idempotent submission id ทำงานจริงไหม | ✅ `submissionId` (uuid) เกิดครั้งเดียวตอน enqueue, คงที่ทุก retry — test ยืนยัน retry 3 รอบส่ง id เดิมตลอด; ฝั่ง server แค่มี UNIQUE constraint ก็กันซ้ำได้ (รวม case "ส่งสำเร็จแต่ client ไม่รู้ผล") |
| คิวรอดปิดแอป/restart ไหม | ✅ IndexedDB adapter: เปิด instance ใหม่บน DB เดิมเห็นรายการค้างส่งครบ (test "คิวรอด restart") |
| Retry/backoff ไม่ทำคิวตัน | ✅ นโยบายเดียวกับ notification worker (1000ms·2^n cap 300s, max 5) → เกิน 5 ครั้ง = `failed` หยุด auto-retry; poison item ไม่ block รายการอื่น; ผู้ใช้กด "ลองส่งอีกครั้ง" ปลุกกลับได้ (`retryFailed`) |
| UI "ค้างส่ง N" มีข้อมูลพอไหม | ✅ `pendingCount()` = pending+failed (ของที่ยังไปไม่ถึง server ทั้งหมด — ตรงความหมายที่ช่างเข้าใจ); ไม่มีศัพท์ sync/queue หลุดหน้าบ้าน (D-12) |
| Metric baseline (ตัดสิน Phase 2) | ✅ เก็บ `enqueuedAt` + `sentAt` ต่อรายการ → gap = เวลาที่ของค้างเพราะ offline; `pruneSent(maxAge)` เก็บไว้ช่วงหนึ่งก่อนลบ |

## ข้อค้นพบสำคัญ: Background Sync

- **Background Sync API มีเฉพาะ Chromium** (Android Chrome = เครื่องช่างส่วนใหญ่ของ DAPH) — ส่งต่อได้แม้ปิดแท็บ
- **iOS Safari/PWA ไม่มี Background Sync** → fallback: flush ตอน `online` + ตอนแอปกลับ foreground (`visibilitychange`) + ตอนเปิดแอป — ยอมรับได้เพราะช่างเปิดแอปดู "ค้างส่ง N" อยู่แล้ว
- ทั้งสองทางใช้**คิวเดียวกันใน IndexedDB** (service worker กับ window เห็น DB เดียวกัน — เหตุผลที่ใช้ localStorage ไม่ได้) → logic ไม่แตกสาย, `sw-bridge.ts` เลือกกลยุทธ์จาก feature detection
- ตัดสินใจ: **MVP รองรับสองกลยุทธ์ตั้งแต่แรก** (`pickSyncStrategy`) — ไม่ผูก MVP กับ Chromium-only

## สิ่งที่เหลือให้ task 1.7 (ไม่ใช่ความเสี่ยงแล้ว — เป็นงานต่อยอด)

1. รูปจริงเก็บเป็น Blob ใน object store แยก (spike เก็บ payload เป็น JSON) — reconcile local id → storage path ตอนส่ง
2. ผู้ส่งจริง = `rpc_capture_ingest` (`installation_proof`) — spike รับเป็น `SubmitFn` dependency แล้ว เสียบได้เลย
3. Service worker ไฟล์จริง + `SYNC_TAG` registration (โครงใน sw-bridge พร้อม)
4. Server: UNIQUE constraint บน client submission id ที่ตาราง capture/report (คู่กับ D-2 DDL)

## Correctness property ที่ล็อกไว้ในเทสต์

- flush ไม่ทำรายการหาย: `sent+deferred+failed = attempted` (property test 50 runs)
- รายการที่ยังไม่ถึง `nextAttemptAt` ต้องไม่ถูกแตะ (กันส่งรัวใน dead zone)
- `put` key เดิม = update (state transition) ไม่ใช่แถวใหม่
