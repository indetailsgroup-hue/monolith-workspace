# Handoff → Codex (Control Tower) — 17 ก.ค. 2026

> เอกสารนี้คือ prompt เสียง owner สำหรับส่งให้ Codex — คุณเดฟ copy บล็อกด้านล่างไปวางได้ตรง ๆ
> (จัดทำโดย Claude reviewer track ตามมติ ADR-069 ข้อ 2 + กระดานงาน 17 ก.ค.)

---

ผมเดฟครับ มีมติและงานมอบหมาย 3 เรื่องจาก sign-off session วันนี้ (17 ก.ค. 2026):

## 1) CT-DEC-002 v0.4.1 = APPROVED — อัปเดต spec status (คุณเป็นผู้ร่าง)

ครบสามลายเซ็นแยกบทบาทแล้ววันนี้ (Tech Lead / Factory Owner แบบ shadow-contract / Security Owner)
บันทึกที่ `docs/governance/ct-dec-002-signoff-checklist.th.md` + `.en.md` (governance branch, commit `fd65eaf6`)
— hash anchor สุดท้าย v3 = `f7b35734bc3283e7fcc8a27b1842119178f79d2179fcfde1983e44e3e6381a16` (43 spec-content files)

งานของคุณ: อัปเดตบรรทัดสถานะในตัว spec `docs/specs/s17-canonical-packet-spec-v1.th.md` + `.en.md`
จาก "DRAFT — NOT APPROVED" → "APPROVED (2026-07-17, 3-role sign-off)" พร้อม regen html + re-pin
manifest ของ spec — **ระวัง**: การแก้ status line จะเปลี่ยน bytes ของ spec → อย่าลืม re-pin
`docs/specs/s17-canonical-packet-spec-v1.sha256` และรับทราบว่า review anchor v3 ที่ลายเซ็นอ้าง
เป็น snapshot ณ เวลาเซ็น (ก่อน status flip) — ให้บันทึก provenance ไว้ใน commit message

## 2) Ratify .kiro union 2 ไฟล์ (มติ ADR-069 ข้อ 2 — ผม merge PR #1 เองแล้วแจ้ง delta ให้คุณ)

Claude ได้ resolve merge conflict ของไฟล์ governance ที่คุณเป็นเจ้าของ ตอนรวม branch (PR #1
integration/s17 → main) ด้วยวิธี **union แบบไม่แต่งเนื้อหา**:

- `.kiro/steering/architecture-decisions.md` — union append-only เรียงเวลา:
  Amendment CT-DEC-001 (7 ก.ค.) ตามด้วย ADR-066/067/068 (14 ก.ค.) — ไม่มีการแก้ข้อความใด
  (หลังจากนั้นมี ADR-069/070 + addenda ที่ Claude บันทึกจากมติผมโดยตรง)
- `.kiro/specs/installation-pm/tasks.md` — เลือกต่อรายการ: S17-1/S17-2 ใช้สถานะ [~] COMPLETE
  จากฝั่ง main (ความจริงล่าสุด) + S17-3..S17-6 ใช้รายละเอียดฝั่งคุณ (CT-DEC-002 refs/KMS/SoD)
  (วันนี้ S17-3 ถูก mark ปิดแล้วหลัง sign-off ครบ)

งานของคุณ: ตรวจ union ทั้งสองไฟล์ว่าตรงเจตนาเอกสารต้นฉบับของคุณ — ถ้าตรง ตอบ ratify
ถ้าไม่ตรงจุดไหน แจ้งผม (อย่าแก้ทับตรง ๆ เพราะตอนนี้เป็น history บน main แล้ว — เสนอ patch แยก)

## 3) มอบหมาย: คุณ = builder S17-4 (Deterministic Packet Generator)

ตาม SoD ใน checklist §5 ("S17-5 ต้องอิสระจาก S17-3/4 builder") และคุณเป็น builder S17-3 อยู่แล้ว
→ **คุณรับ S17-4 · Claude (reviewer track) รับ S17-5 verifier ฝั่งอิสระ** — ทางเดียวที่ถูกกติกา

ขอบเขต S17-4 (จาก spec ที่คุณร่างเอง — ตอนนี้มี implementation authority แล้ว):
- Generator ที่ผลิต packet ตรง contract: canonical payload/manifest (§7 byte rules — JCS,
  integer micrometre, LF, lowercase hex, path rules, x-monolith-orderBy), `packetContentId`
  ตาม §4/§5, ZIP byte profile (method-0 + ลิมิต §container), attestation ตาม
  `packet-attestation.schema.json` (ECDSA_P256_SHA256 — signing ผ่าน KMS adapter interface
  ที่ mock ได้ เพราะ key ceremony S17-6 ยังไม่เริ่ม; ห้าม implement คีย์จริง)
- Determinism proof ตาม §4.1: สอง run เดียวกัน → payload + manifest + packetContentId
  byte-identical; ต่างได้เฉพาะ run allowlist (jobRunId, issuedAt, actor, signature)
- NFP บังคับ: `NOT_FOR_PRODUCTION.txt` ใน manifest + ชื่อ ZIP ขึ้นต้น `NFP-` (§NFP)
- ทดสอบระดับ E0: golden fixtures + double-run byte-compare + CI job
- Base: รอผม merge PR #1 ก่อนแล้วแตกจาก main ล่าสุด (ADR-065: head ณ เวลาเปิด worktree)
  บน clean worktree ของ Track B

Interface ที่ต้องตกลงกับ Claude (S17-5): ผม (เดฟ) ให้สองฝั่ง**ห้ามแชร์โค้ด/fixtures กัน**นอกจาก
spec + schemas ที่ approve แล้ว — verifier ของ Claude ต้อง reject packet ที่ผิด spec ได้เอง
โดยไม่เคยเห็น generator ของคุณ (นั่นคือคุณค่าของ SoD)

— เดฟ

---

*หมายเหตุจาก Claude (reviewer track): เอกสารนี้บันทึกไว้ที่ `docs/governance/codex-handoff-2026-07-17.th.md`
เพื่อเป็น record; การส่งจริงเป็นการกระทำของ owner*
