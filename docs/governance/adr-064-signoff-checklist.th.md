# ADR-064 / Real-Cut Gate ② — Human Role Sign-Off Checklist

**Decision**: ADR-064 — รับ PRD v5 As-Built เป็น canonical (`docs/prd/monolith-complete-prd-v5.th.md`, pinned ด้วย `docs/prd/monolith-complete-prd-v5.sha256`) — นิยามจากมติ owner meta-review 11 ก.ค. 2026 ใน `.kiro/steering/architecture-decisions.md` (ADR-065 Q5) และ ledger `.kiro/specs/installation-pm/tasks.md`: "ADR-064 (รับ PRD canonical) รอ Product Owner/Tech Lead/Security Owner/Factory Owner ลงชื่อครบ 4"
**บทบาทใน real-cut gate**: ADR-064 ครบ 4 ลายเซ็น = เงื่อนไข ② จากสี่เงื่อนไขใน `src/core/config/shadowMode.ts` (① S17-1..5 ปิดครบ · ② ADR-064 ครบ 4 · ③ dogfood เต็มสาย ≥1 งาน · ④ machine profile calibrate แล้ว) — เอกสารนี้ปิดได้เฉพาะเงื่อนไข ② เท่านั้น
**Hash anchor ที่ต้องเซ็น**: `adr-064-review-input.sha256` (sha256 `<PENDING — pin exact review bytes ก่อนเปิดรอบเซ็น; ห้ามเซ็นบน anchor ว่าง>`)
**Reviewed artifact commit**: `<PENDING — commit ของ review bytes ณ เวลาเปิดรอบเซ็น>`
**Independent review verdict**: `docs/prd/monolith-prd-v5-review.th.md` — "Target-State Canonical, ไม่ใช่ production-ready" (advisory, non-authoritative — AI เป็น advisory reviewer เท่านั้น ไม่ลงชื่อแทนมนุษย์)

> การเซ็น = การรับผิดชอบของมนุษย์ว่าได้ review เองแล้ว ไม่ใช่การรับ AI verdict มาแปะ · AI ไม่ลงชื่อแทน · เมื่อครบสี่ลายเซ็น ADR-064 = ACCEPTED และปิดเฉพาะ real-cut gate เงื่อนไข ② — การตัดจริงยังต้องรอเงื่อนไข ①③④ ครบ + flag closure ceremony (W3)
> คงบังคับจนกว่าจะครบสี่: PENDING · NO_CUT/NFP ยังคุมทุก artifact · ไม่มี P0 closure จากเอกสารนี้ · `SHADOW_MODE_NOT_FOR_PRODUCTION` ห้ามแตะ

## 0. Pre-Sign (ทุกบทบาททำก่อน)

- [ ] ยืนยันกำลัง review exact bytes ที่ pin ใน `adr-064-review-input.sha256` (anchor ต้องไม่เป็น placeholder แล้ว ณ เวลาเซ็น)
- [ ] verify manifest PRD v5 (`docs/prd/monolith-complete-prd-v5.sha256`) ด้วย `node scripts/verify-sha256-manifest.mjs` เองอย่างอิสระ (ไม่เชื่อเพราะ manifest มี)
- [ ] อ่าน independent review (`docs/prd/monolith-prd-v5-review.th.md`) ครบ + เข้าใจว่า review verdict != approval
- [ ] เข้าใจขอบเขต: เซ็นครบ 4 = รับ PRD canonical + ปิด gate ② เท่านั้น ไม่ใช่การอนุญาตตัดจริง

## 1. Product Owner — Canonical Scope & Business Acceptance

- [ ] ยืนยัน PRD v5 สะท้อน scope ธุรกิจจริงที่ตกลง: dogfood ขนาน S17, shadow-mode Designer, gate ตัดจริงสี่เงื่อนไข (ADR-065)
- [ ] ยืนยันเงื่อนไขจาก review ถูกรับเข้าแผน: ปิด P0 ก่อน pilot, FR ใหม่ freeze จน pilot ปิด
- [ ] ยืนยัน Day-30 definition: P0×5 + controlled pilot 1 งาน 1 machine profile
- [ ] ยืนยันคิวงานหลัง canonical: การเปลี่ยน scope PRD หลังเซ็นต้องเป็น decision ใหม่ (CT-DEC-xxx/ADR ใหม่) ไม่แก้ย้อนหลัง

## 2. Tech Lead — Technical Correctness of Canonical Claims

- [ ] ยืนยัน P0 blockers ทั้งห้าใน PRD ตรงกับโค้ดจริง ณ reviewed commit (ตามที่ S16-18 audit ยืนยันแล้วรอบ 11 ก.ค.)
- [ ] ยืนยัน hard gates เรียงตาม dependency ไม่ใช่ความรุนแรง และประมาณการรวม verification/evidence ไม่ใช่แค่ implementation
- [ ] ยืนยันสถานะ S17-1..5 ใน ledger ตรงความจริง ณ เวลาเซ็น (ไม่มี claim "ปิดแล้ว" ที่ยังไม่มี evidence)
- [ ] ยืนยัน CI evidence chain: verify-full E0 + exclusions ติด claim เสมอ (ตาม CT-DEC-001 ข้อ 4)

## 3. Security Owner — Trust Boundary & Custody Consistency

- [ ] ยืนยัน PRD ไม่ขัดมติ custody: managed KMS/HSM non-exportable, Security Owner = Key Owner, create/rotate/revoke = PO+SO ร่วม
- [ ] ยืนยัน signature model ใน PRD สอดคล้อง ADR-068 (ECDSA P-256 บน AWS KMS) และ CT-DEC-002 v0.4.1
- [ ] ยืนยัน server-owned identity (S17-1) เป็น trust foundation ของ attestation — prod-apply ยังแขวนจน pilot window ไม่ทำให้ claim ใน PRD เกินจริง
- [ ] ยืนยันว่าการรับ canonical ไม่เปิดช่อง bypass: NO_CUT/NFP/bare-`PKT_OK` invariants คงเดิมทุกข้อ

## 4. Factory Owner — Factory Operability & Real-Cut Readiness Path

- [ ] ยืนยันเส้นทาง real-cut ใน PRD ตรงกับที่โรงงานยอมรับ: ตัดจริงได้เมื่อ gate สี่เงื่อนไขครบ + ceremony เท่านั้น
- [ ] ยืนยัน machine onboarding ตาม ADR-070: documented-profile first, bench verification โดยวิศวกรหน้าเครื่อง = hard gate ก่อนทำงานจริง, ไม่ inherit activation ข้ามเครื่อง
- [ ] ยืนยัน dogfood model: โรงงานตัดจากใบสั่งเดิม (legacy work order), packet เป็น shadow evidence เท่านั้น
- [ ] ยืนยัน pilot slot + recovery buffer ยังสอดคล้องกำลังโรงงานจริง (หลุดกำหนด = เลื่อน slot ห้ามบีบ verification)

## 5. Signature Block

| บทบาท | ชื่อ | Reviewed artifact commit | Review anchor SHA-256 | วันที่ | สถานะ |
| --- | --- | --- | --- | --- | --- |
| Product Owner | — | `<PENDING>` | `<PENDING>` | — | PENDING |
| Tech Lead | — | `<PENDING>` | `<PENDING>` | — | PENDING |
| Security Owner | — | `<PENDING>` | `<PENDING>` | — | PENDING |
| Factory Owner | — | `<PENDING>` | `<PENDING>` | — | PENDING |

## 6. Effect เมื่อครบสี่

- ADR-064 = ACCEPTED — PRD v5 As-Built เป็น canonical อย่างเป็นทางการ
- Real-cut gate เงื่อนไข ② ปิด — `readiness-status` จะรายงานช่อง ADR-064 เป็น SIGNED 4/4
- **ไม่ปิด** เงื่อนไข ①③④ และ**ไม่อนุญาต**ตัดจริง/ปิด `SHADOW_MODE_NOT_FOR_PRODUCTION` — flag closure เป็น ceremony แยกหลังครบทั้งสี่เงื่อนไข (ADR-066: hosted/prod ops = human-driven)
- ไม่ปิด P0 ใด และไม่แทน sign-off เฉพาะทาง (CT-DEC-002 = spec approval คนละชั้น)

## 7. ข้อควรระวัง (advisory)

1. ถ้าผู้ถือหลายบทบาทต้องลงชื่อแยกแต่ละบทบาทโดยเจตนา ไม่เซ็นรวบ (แนวเดียวกับ CT-DEC-002 §6.1)
2. ห้ามเซ็นบน anchor placeholder — รอบเซ็นเปิดได้เมื่อ `adr-064-review-input.sha256` ถูก pin และ manifest verify PASS ต่อหน้าผู้เซ็น
3. การแก้ไฟล์นี้หลังมีลายเซ็นแรก = ต้อง re-pin `adr-064-signoff-checklist.sha256` ต่อเหตุการณ์เซ็น (บทเรียน circularity จาก CT-DEC-002 re-pin 16 ก.ค.)
4. sign-off นี้ไม่ปิด P0, ไม่อนุญาต merge/prod-apply, ไม่อนุญาตตัดจริง — ปิดเฉพาะ real-cut gate เงื่อนไข ②

---

*Advisory checklist — human approval required. เอกสารนี้สร้างโดย lane S18/l8-evidence-gov ตาม pattern ของ `ct-dec-002-signoff-checklist.th.md`; สถานะทุกบทบาท = PENDING จนมนุษย์ review exact bytes และลงชื่อเอง; checklist pin แยกด้วย `adr-064-signoff-checklist.sha256` ต่อเหตุการณ์เซ็น.*
