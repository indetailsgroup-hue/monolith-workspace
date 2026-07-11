# S17 Shadow Dogfood SOP — Freeze → Release → Export

รุ่นเอกสาร: 1.0

จัดทำ: 2026-07-11

Implementation candidate: `739aee160f324543006028e74f8ce479ecc538a3`

สถานะปฏิบัติการ: **shadow-only / NO_CUT**

> Flow ที่เป็นลายลักษณ์อักษรเปลี่ยนเป็น **Freeze → Release → Export** โดย FROZEN หมายถึงล็อกเพื่อ review และไม่ให้อำนาจอัปโหลด packet, factory export หรือ verification SOP นี้เป็น dogfood note ไม่ใช่อำนาจ production หรือ P0 closure

## 1. บทบาทและเงื่อนไขก่อนเริ่ม

- บัญชี Designer: Supabase session ถูกต้อง, `app_metadata.roles` ที่อนุมัติมี `designer` (หรือ admin equivalent ที่อนุมัติ) และ site code ที่อนุมัติ
- บัญชี Factory: session ถูกต้อง, role มี `factory_operator`/`factory` (หรือ admin equivalent ที่อนุมัติ) และ site code ที่อนุมัติ
- controlled dogfood job หนึ่งงานและ machine profile ที่ยืนยันแล้วหนึ่งตัว
- review gate result แล้วและไม่มี blocker ค้าง
- `SHADOW_MODE_NOT_FOR_PRODUCTION = true`
- ห้าม operator ใช้ packet ตัดชิ้นงานจริง

## 2. ลำดับปฏิบัติ

### ขั้น 1 — เตรียม DRAFT

1. เปิดโครงการ dogfood ที่ควบคุมไว้
2. ยืนยัน project/job ID และ site ให้ถูกต้อง
3. แก้ design ให้เสร็จและรัน gate checks ที่เกี่ยวข้อง
4. บันทึก warning/blocker และห้ามเดินหน้าหากยังมี blocker

### ขั้น 2 — Freeze

1. Designer เลือก Freeze
2. ยืนยัน server state เป็น `FROZEN` และมี revision ID
3. Review geometry, materials, hardware, drill map และ gate evidence ที่ถูก freeze

**ขอบเขต FROZEN:** packet upload, Factory export และ verification ต้องถูกปฏิเสธทั้งหมด Local preview ใช้ review ได้เท่านั้นและไม่ใช่ release evidence

### ขั้น 3 — Release

1. หลัง review/gate acceptance แล้ว Designer เลือก Release อย่างชัดเจน
2. ยืนยัน server state เป็น `RELEASED`
3. ยืนยัน release event บันทึก server-derived actor และ authorization context

Release เป็น transition ที่มนุษย์มองเห็นแยกต่างหาก Freeze อย่างเดียวไม่เพียงพอ

### ขั้น 4 — Export และ upload จาก Designer

1. เลือก Export หลัง UI และ server รายงาน RELEASED ตรงกันเท่านั้น
2. ZIP ที่สร้างยังขึ้นต้น `NFP-` และมี `NOT_FOR_PRODUCTION.txt`
3. ยืนยัน server packet upload สำเร็จและมี packet SHA-256/storage path
4. ห้ามเชื่อเฉพาะ browser download เพราะเส้นปัจจุบันของ Designer ดาวน์โหลด ZIP local ก่อน server upload ดังนั้น upload ที่ล้มเหลวอาจทิ้งไฟล์ local ที่ server ไม่เคยรับ

### ขั้น 5 — Factory รับ, export และ verify

1. Factory operator เปิด job เดียวกันด้วยบัญชี Factory
2. ยืนยัน state เป็น RELEASED และมี packet anchor ที่บันทึกแล้ว
3. ขอ Factory export และรับ signed URL อายุสั้น
4. รัน verification และบันทึก expected/computed SHA-256, verdict, actor และเวลา
5. ใช้ผลลัพธ์เพื่อเทียบกับใบสั่ง/กระบวนการเดิมของโรงงานและเก็บ S17 evidence เท่านั้น

**Operational disposition สูงสุด:** shadow evidence only / NO_CUT แม้ PASS ก็ไม่ให้อำนาจผลิต

## 3. ผลกระทบที่ผู้ใช้เห็น

- “Freeze แล้ว Export” ใช้ไม่ได้อีก ต้องทำ Release อย่างชัดเจน
- ความพยายาม export/upload/verify ตอน FROZEN จะถูกปฏิเสธ
- ผู้ใช้ไม่มี session ถูกต้องได้ `401`; ไม่มี role ที่ระบบรู้จักได้ `403`
- เปลี่ยน local UI role ไม่เปลี่ยน server permission
- NFP file ที่ดาวน์โหลดไม่ใช่หลักฐานว่า server รับแล้ว ต้องตรวจ server packet record/activity
- FactoryApp อาจยังแสดง FROZEN เป็น `VERIFIED`; ให้เชื่อ server state และ export response จนกว่าจะแก้ label

## 4. การหยุดและ rollback

หยุด dogfood run เมื่อเกิดข้อใดข้อหนึ่ง:

- state ไม่ตรง DRAFT/FROZEN/RELEASED ที่คาด
- Release ล้มเหลวหรือไม่มี revision ID
- packet upload ล้มเหลวหรือไม่มี packet/storage anchors
- Factory export หรือ verification สำเร็จทั้งที่ state ยัง FROZEN
- หลักฐาน JWT actor/roles/site หายหรือไม่ตรง operator
- ไม่มี NFP prefix/marker
- computed packet hash ไม่ตรง server anchor

หากต้องถอนงาน RELEASED ให้ใช้ Revoke เพื่อกลับเป็น FROZEN หลัง revoke แล้ว upload/export/verify ต้องถูกปฏิเสธอีกครั้ง เก็บ events เดิมไว้และห้าม rewrite audit history

## 5. Evidence ที่ต้องเก็บ

- application commit และ migration hash ที่แน่นอน
- dogfood job ID และ released revision ID
- Designer/Factory actor subject IDs, role arrays, site-code arrays และ authorization-context IDs
- เวลา Freeze, Release, packet-record และ verify events
- packet/manifest SHA-256 และ storage path
- HTTP status/result ของ FROZEN negative checks สามเส้น
- verification expected/computed hash และ verdict
- screenshot/record ที่เห็น NFP marker และการรับทราบ NO_CUT
- CI และ database dry-run IDs/output

## 6. ขอบเขตการปิดงาน

การทำ SOP นี้ครบให้ controlled dogfood evidence เท่านั้น ไม่ปิด S17-1/S17-2, ไม่อนุมัติ migration 0162, ไม่ unlock Track B, ไม่อนุญาต production และไม่อนุญาตตัดจริง อำนาจ closure ทั้งหมดยังคงเป็นของมนุษย์
