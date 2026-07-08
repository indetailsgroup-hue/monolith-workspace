---
note_type: validation_checklist
target_note:             # โน้ตที่กำลังรับรอง
review_roles: []         # hardware_engineer | production
truth_layer: draft
review_status: unreviewed
tags: [validation]
---

# Validation: {{title}}

## เกณฑ์รับรอง (ต้องผ่านก่อนเลื่อนเป็น verified)
- [ ] ทุกสเปกเชิงตัวเลขมี `source_refs` ชี้หน้าแคตตาล็อกจริง
- [ ] ตัวเลขเจาะ/ระยะ/ภาระ ตรงกับภาพ dimension drawing
- [ ] หน่วยถูกต้อง (mm / kg / องศา)
- [ ] SKU ตรงกับแคตตาล็อก
- [ ] ถ้า map กับค่าคงที่ MONOLITH ค่าตรงกันและระบุ path แล้ว
- [ ] ผู้ตรวจ (มนุษย์) ยืนยัน

## ผลตรวจ
<!-- บันทึกความไม่ตรง/แก้ไข -->
