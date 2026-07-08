# Furniture Hardware Second Brain (Obsidian Vault)

Vault องค์ความรู้ฮาร์ดแวร์เฟอร์นิเจอร์ (Blum / Häfele / Aluminum) สำหรับ MONOLITH + Daph
สร้างตามแนวทางใน `determined-williams/docs/OBSIDIAN_SECOND_BRAIN_HARDWARE_TH.md`

## วิธีเปิด
เปิด Obsidian → "Open folder as vault" → ชี้มาที่โฟลเดอร์นี้
จุดเริ่มนำทาง: `50_MOC/hardware-home.md`
- 📖 **วิธีดำเนินงาน (เพิ่มข้อมูล/รีวิว conflict):** `VAULT-GUIDE.md`
- 🔴 **Conflict กับ MONOLITH:** `60_VALIDATION/CONFLICT-REGISTER.md` (+ `ENGINEER-REVIEW-WORKSHEET.md`)

## โครงโฟลเดอร์
```
00_INBOX/          ผล OCR ดิบ / ไฟล์ที่ยังไม่ย่อย
10_SOURCES/        1 โน้ตต่อ 1 แคตตาล็อก (metadata + สารบัญหน้า)
20_ATOMIC_NOTES/   1 โน้ตต่อ 1 ผลิตภัณฑ์/ฟิตติ้ง
30_SYSTEMS/        MOC ต่อระบบ (Hinge / Box / Runner / Aluminum)
40_SPECS/          สเปกเชิงตัวเลขที่ดึงออกมา (drilling / ระยะ / ภาระ)
50_MOC/            Maps of Content — จุดเริ่มนำทาง
60_VALIDATION/     checklist รับรองความถูกต้องของสเปกก่อนใช้จริง
90_TEMPLATES/      Templater templates
```

## กติกา governance (สำคัญ)
1. `truth_layer: draft` = ผล OCR/ร่าง ยังไม่ตรวจกับแคตตาล็อก — **ห้าม** นำค่าไปใส่โค้ด MONOLITH
2. `truth_layer: verified` = ตรวจกับหน้าแคตตาล็อกจริงแล้ว + มนุษย์ยืนยัน — นำไปอ้างอิงได้
3. ทุกสเปกเชิงตัวเลขต้องมี `source_refs` ชี้หน้าแคตตาล็อกเป๊ะ (เช่น `Blum-2024:p.142`)
4. การเปลี่ยนค่าคงที่ในโค้ด MONOLITH ต้องอ้าง verified note เสมอ (กันแก้มั่วแบบ 37↔50)

## สถานะปัจจุบัน (2026-06-22)
- [x] โครง vault + templates + prompts (atomic notes / box-runner / vision)
- [x] **Hinge** ครบ (Blum 64–193 + Salice + Häfele Metalla 510)
- [x] **Box** (LEGRABOX/MERIVOBOX/TANDEMBOX) · **Runner** (MOVENTO/TANDEM)
- [x] **Connector/Dowel/Shelf** (Häfele Ch4) · **Lighting** (Loox) · **Sliding door** (Slido Ch10)
- [x] **Conflict Register FINAL** — 11 รายการ (2 resolved+test / 9 ค้างวิศวกรตัดสิน)
- [x] schema สม่ำเสมอทั้ง vault (flat sku · conflicts มาตรฐาน)
- [ ] วิศวกรรีวิว #3–#11 (ดู `ENGINEER-REVIEW-WORKSHEET.md`) → แก้โค้ด (ถ้า FIX) → verified
- [ ] (optional) baseline เพิ่ม: Häfele Ch7 kitchen pullout / Ch6 locks / Ch8 wardrobe
