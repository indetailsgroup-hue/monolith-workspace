# MONOLITH LINE Design Approval Sandbox A1 — คู่มือการใช้งาน

- สถานะ: คู่มือการใช้งาน A1 sandbox ที่อนุมัติแล้ว
- ฉบับ: ภาษาไทย
- ใช้กับ: standalone LineOS Design Approval journey
- Design authority: [ข้อกำหนดการออกแบบ A1 ที่อนุมัติ](../superpowers/specs/2026-08-02-monolith-line-design-approval-port-a1-design.th.md)
- Execution authority: [แผนการดำเนินงาน A1 ที่อนุมัติ](../superpowers/plans/2026-08-02-monolith-line-design-approval-port-a1-implementation.th.md)

> Human Surface contract-ready with sandbox adapter — ยังไม่เชื่อมต่อ MONOLITH runtime

## 1. วัตถุประสงค์และผลลัพธ์ที่อธิบายได้อย่างตรงไปตรงมา

คู่มือนี้ครอบคลุมการซ้อม Trust Concierge A1 สำหรับตรวจ design revision ผู้ใช้งานจะเปิด private review ที่ adapter เป็นเจ้าของ ตรวจ revision และผลที่อธิบายไว้ บันทึก sandbox confirmation attempt และอ่าน bounded verification record

A1 เป็น local contract harness สำหรับตรวจ review, expiry, stale revision, idempotency และ record semantics ส่วน identity, permission, revision authority, workflow, signing และ audit effect จริงยังอยู่ภายในขอบเขตของ MONOLITH product

## 2. A1 routing และขอบเขตของ token

เฉพาะ preset `design-approval` เท่านั้นที่ route ผ่าน A1 `DesignApprovalPort`; presets อีกสี่รายการยังใช้ legacy local demo journey

A1 review token เป็น opaque และ non-secret; token นี้ไม่มี customer, tenant, role, recipient, project หรือ authorization claim

Token ใช้เลือก bounded sandbox fixture ไม่ใช่ LINE ID token, access token, credential, permission, tenant identifier หรือ business command ส่วน Flex fields ที่แก้ไขได้เป็น invitation และ display content เท่านั้น และใช้แทน snapshot จาก `openReview(reviewToken)` ไม่ได้

## 3. เริ่ม local rehearsal

จาก parent repository root ให้ serve LineOS ผ่าน localhost:

```powershell
python -m http.server 4177 --directory LineOS
```

เปิด `http://localhost:4177/line-flex-studio.html` แล้วทำตามลำดับ:

1. เลือกภาษาไทยหรืออังกฤษ
2. เลือก preset `design-approval`
3. แก้ blocking validation error ทุกข้อ
4. ตรวจ Flex preview และ generated JSON
5. เลือก **Run Journey** เพื่อเปิด private sandbox review

ห้ามใส่ production credential, personal data, channel secret, channel access token หรือ LINE identity token ลงใน draft, URL, JSON, log, screenshot หรือ browser storage

## 4. ตรวจ adapter-owned review

Private dialog ต้องแสดง `SANDBOX — NO BUSINESS EFFECT` ตลอดเวลา ก่อนยืนยันให้เทียบค่าที่ adapter เป็นเจ้าของดังนี้:

| ค่าใน Review | สิ่งที่ผู้ใช้งานต้องตรวจ |
|---|---|
| Mode และ effect | `mode: sandbox` และ `businessEffect: none` |
| Provider context | ใช้แสดง provenance เท่านั้น |
| Work item และ approval request | Opaque sandbox references |
| Revision | Revision label และ adapter-owned revision content hash |
| Artifact manifest | SHA-256 digest ของ review artifacts ที่ผูกไว้ |
| Requested action | Canonical action และผลที่อธิบายด้วยภาษาคน |
| Time boundary | เวลา issue และ expiry |

`providerContext` เป็นเพียง display provenance ไม่ใช่ tenant authority และห้ามตีความเป็น tenant assertion

ให้ Cancel หาก revision, artifact digest, consequence หรือ expiry ไม่ตรงตามที่ต้องการ การ open สำเร็จไม่ใช่ authorization สำหรับ product confirmation ในอนาคต

## 5. ยืนยัน sandbox attempt หนึ่งรายการ

เลือก **ยืนยันการทดลองใน Sandbox** หลังตรวจค่าจาก adapter ครบแล้ว Browser ส่งคืนเฉพาะ review session, adapter-issued idempotency key, expected revision และ `decision: confirm`

ปุ่ม disabled/busy เป็นเพียง UX guard ส่วน adapter เป็นเจ้าของ duplicate suppression ภายใน session เดียวกัน key และ canonical payload เดิมจะคืน record เดิม แต่ payload ที่เปลี่ยนโดยใช้ key เดิมจะคืน `idempotency_conflict`

| Outcome | การตอบสนองที่ปลอดภัย |
|---|---|
| `sandbox_recorded` หรือ `sandbox_replayed` | อ่าน bounded record และเก็บเฉพาะ review note ที่อนุมัติ |
| `expired` | เริ่ม review ใหม่ |
| `stale_revision` | เปิด revision ล่าสุดและไม่ใช้ snapshot เดิมซ้ำ |
| `version_conflict` | เริ่ม sandbox review ใหม่เพื่อโหลด adapter-owned current snapshot; โดยไม่มีการ query MONOLITH workflow |
| `idempotency_conflict` | หยุดและใช้ correlation ID สำหรับตรวจสอบ |
| `unauthorized` หรือ `not_available` | รักษาข้อความกลางและไม่อนุมานข้อมูลของลูกค้าหรือ scope อื่น |
| `invalid_request` หรือ `temporarily_unavailable` | เริ่มจาก bounded message และ retry เฉพาะตามคำแนะนำ |

## 6. อ่าน sandbox record

ชื่อ record ที่กำหนดตายตัวคือ:

> **Sandbox Verification Record — Demo · No Business Effect**

ตรวจว่า record แสดง sandbox mode, no business effect, bounded references, revision/manifest digests, requested action, outcome, timestamps, canonicalization version, correlation ID และ record digest

A1 ไม่ทำ workflow mutation, ไม่ส่งข้อความ LINE, ไม่เขียน database record, ไม่สร้าง cryptographic signature และไม่อ้างว่า production audit เสร็จสมบูรณ์

SHA-256 digest เป็น integrity metadata ของ sandbox record ไม่ใช่ signature, verified-signer status, LINE delivery receipt, workflow decision, tenant assertion หรือ MONOLITH audit record

## 7. ข้อจำกัดเรื่อง session-only reset

A1 ledger เป็น session-only: การ reload หรือ restart browser อาจ reset ledger จึงไม่มี replay guarantee หลังการ reset นั้น

การสลับ preset หรือภาษา, แก้ field, reset draft, cancel หรือปิด dialog จะล้าง active review เช่นกัน ให้เริ่มใหม่และตรวจ snapshot ที่ออกใหม่แทนการใช้ session value ที่คัดลอกไว้

## 8. Checklist ก่อนจบการซ้อม

ก่อนปิด rehearsal ให้ยืนยันว่า:

- เลือก preset `design-approval`
- Sandbox warning แสดงต่อเนื่องทั้งใน review และ record
- Review values มาจาก adapter-owned snapshot
- Revision และ artifact digest ตรงกับ rehearsal ที่ต้องการ
- ผลลัพธ์ใช้ชื่อ sandbox record ที่กำหนดไว้ตรงตัว
- อธิบาย record ว่าเป็น integrity metadata ไม่ใช่ signature หรือ audit artifact
- เข้าใจข้อจำกัด session-only reset
- จัดการ local artifact ที่คัดลอกหรือดาวน์โหลดตาม retention rule ที่อนุมัติ

ผลที่รองรับได้คือ contract evidence ของ A1 เท่านั้น ไม่ใช่ runtime integration, production readiness, customer delivery หรือ approval authority

## 9. Future A2 promotion gates

การ promote ไป A2 ต้องได้รับ owner approval แยกและผ่าน gate ทั้งเจ็ดข้อด้านล่าง; การผ่าน A1 เพียงอย่างเดียวไม่อนุญาต runtime integration

1. `A1 contract and browser evidence` ต้องผ่านด้วย fresh results
2. อนุมัติ `canonical server-owned revision source` และ persistence path
3. อนุมัติ `tenant–organization–site mapping` หรือกำหนด slice ด้วย non-tenant scope model อย่างชัดเจน
4. มี `customer-design-view database contract tests` และผ่าน local รวมทั้ง allowlisting และ denial paths
5. `narrow LIFF confirmation transport design` ผ่าน security review และ reuse product boundary เดิม
6. พิสูจน์ `rollback, idempotency, audit, and error semantics` สำหรับ runtime path
7. อนุมัติ `local environment and secret-handling authority`

A2 ต้อง reuse design-view และ customer-approval substrate เดิม และไม่นำ generic integration gateway ที่ถูกปฏิเสธกลับมาใน promotion path นี้

## แหล่งข้อมูลทางการ

Retrieved 2026-08-02:

- [Messaging API actions](https://developers.line.biz/en/docs/messaging-api/actions/)
- [Adding a LIFF app](https://developers.line.biz/en/docs/liff/registering-liff-apps/)
- [Developing a LIFF app](https://developers.line.biz/en/docs/liff/developing-liff-apps/)
- [LIFF API reference](https://developers.line.biz/en/reference/liff/)
