# CT-DEC-002 — Reconciliation Record (ปิด governance split-brain)

วันที่: 2026-07-18
ผู้จัดทำ: Claude (reviewer track) ตามคำสั่งคุณเดฟ — ตอบ Finding **B1-01** ของ Full-System Scrutiny 2026-07-18 (anchor `6d30cc1e17cbdc5f53f3317d50f177ac53d1964b69823fb633fe215c2ec8e70a`)
ลักษณะ: append-only — ไม่แก้เนื้อหา record ที่เซ็นแล้ว ไม่เปลี่ยนสถานะ governance ใด ๆ เพิ่มเติม

## 1. ปัญหาที่ปิด (B1-01: split-brain)

ก่อน record นี้ ความจริงของ CT-DEC-002 กระจายอยู่สอง branch โดยไม่มี checkout เดียวที่ตอบคำถาม authority ได้ครบ:

| ที่ | สิ่งที่จริง | สิ่งที่ stale |
|---|---|---|
| `origin/main` (6c1a6f59) | spec = APPROVED · ledger = S17-3 [x] / S17-4-5 UNLOCKED | checklist = PENDING×3 · `monolith-s17-v041-review-input.sha256` = ฉบับเก่า 49 บรรทัด (ก่อน anchor v2/v3) |
| `governance/s17-control-pack` | checklist = SIGNED×3 (commit `fd65eaf6`) | ledger = S17-3 DRAFT / S17-4-5 LOCKED (ประวัติศาสตร์ ณ ก่อนเซ็น) |

ข้อเท็จจริง ancestry: `fd65eaf611a87d54bbda1131142df2fa12c9787c` (signed checklist) **ไม่เป็น ancestor ของ `origin/main`** — ยืนยันด้วย `git merge-base --is-ancestor` เมื่อ 2026-07-18

## 2. หลักฐานว่าลายเซ็นยัง bind (ตรวจซ้ำ 2026-07-18)

1. **Anchor v3 ตรงตัวเป๊ะ**: `sha256(monolith-s17-v041-review-input.sha256 ฉบับ governance branch)` = `f7b35734bc3283e7fcc8a27b1842119178f79d2179fcfde1983e44e3e6381a16` — ตรงกับที่ Security Owner เซ็น และตรงกับ Approval record ที่ฝังในตัว spec
2. **ณ commit ที่เซ็น (`fd65eaf6`) ครบ 43/43**: ทุกไฟล์ใน frozen set ตรง manifest รวมทั้ง spec (`7ad8b66c…84b6`)
3. **สถานะปัจจุบันของ main เทียบ anchor = 38/43**: 5 ไฟล์ที่ต่างคือชุด spec เท่านั้น และ diff จาก `fd65eaf6` → main คือ **status flip DRAFT→APPROVED ที่ ratified แล้ว** (การ flip ฝัง approval record ชี้กลับ checklist@`fd65eaf6` + anchor v3 ในตัวเอง) — ไม่มีการแก้เนื้อหา normative
4. **Per-event manifest ของ checklist**: 4/4 PASS บน branch นี้

ดังนั้น: การนำ signed checklist ขึ้น main ไม่ได้ "ย้ายลายเซ็นไปเซ็นของใหม่" — ไบต์ที่เซ็นตรวจย้อนได้ครบทุกชั้น

## 3. สิ่งที่ record นี้นำขึ้น main (9 ไฟล์, byte-exact จาก governance branch)

| ไฟล์ | เหตุผล |
|---|---|
| `docs/governance/ct-dec-002-signoff-checklist.{th,en}.{md,html}` + `.sha256` | signed record ตัวจริง (แทนฉบับ PENDING ที่ stale) |
| `docs/governance/ct-dec-002-v041-signoff-review-pack.th.md` | review pack ที่ใช้ประกอบการเซ็น |
| `docs/governance/codex-handoff-2026-07-17.th.md` | handoff ที่มอบหมาย S17-4 (อ้างอิงใน ledger บน main อยู่แล้ว) |
| `docs/governance/s17-5-verifier-plan.th.md` | แผน S17-5 (อ้างอิงใน ledger บน main อยู่แล้ว) |
| `monolith-s17-v041-review-input.sha256` | anchor v3 ฉบับที่เซ็นจริง (แทนฉบับ 49 บรรทัดที่ stale) |

พร้อมกันนี้เพิ่ม `scripts/governance-semantic-status.test.mjs` — semantic cross-file gate ที่ตรวจว่า **บน checkout เดียวกัน** spec/checklist/ledger/anchor เล่าเรื่องเดียวกัน (รันใน `npm run test:node` ซึ่ง CI `verify-full` เรียกอยู่แล้ว) เพื่อกัน split-brain แบบเดียวกันเกิดซ้ำโดยไม่มีใครเห็น

## 4. สถานะของ branch หลัง reconciliation

- **`origin/main` = baseline เดียว** สำหรับคำถาม authority ทั้งหมดนับจาก merge record นี้
- **`governance/s17-control-pack` = historical record** — คงไว้ตามเดิม ไม่แก้ย้อนหลัง (ledger เก่าบน branch นั้นคือภาพ ณ ก่อนเซ็น ไม่ใช่ข้อความที่ต้องแก้)
- record นี้**ไม่**เปลี่ยนสถานะใด ๆ: CT-DEC-002 ยังคง APPROVED ตามเดิม · NO_CUT/NFP ยังบังคับ · ไม่สร้าง production/real-cut authority

## 5. สิ่งที่ยังเปิดอยู่ (นอกขอบเขต record นี้ — ตาม execution order ของ scrutiny)

freeze S17-4 + black-box interop (ข้อ 2) · converge runtime + เปลี่ยนความหมาย `PASS` (ข้อ 3) · CI non-vacuous (ข้อ 4) · dogfood start / prod-apply / KMS / bench (ข้อ 5–6)
