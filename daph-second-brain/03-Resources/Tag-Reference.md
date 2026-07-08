---
type: tag-reference
tags: [resource]
---

# 🏷️ รายการแท็ก (Tag Reference)

ระบบแท็กใช้รูปแบบ `<มิติ>/<slug>` สม่ำเสมอทุกโน้ต

| มิติ | รูปแบบ | ตัวอย่าง | ความหมาย |
|------|--------|---------|----------|
| Domain | `domain/<slug>` | `domain/hardware`, `domain/process` | โดเมนความรู้ |
| Group | `group/<slug>` | `group/office`, `group/factory`, `group/installation` | กลุ่มกระบวนการ |
| Unit | `unit/<slug>` | `unit/sale`, `unit/laminate-hpl` | หน่วยกระบวนการ (มีได้หลายค่า) |
| Type | `type/<slug>` | `type/sos`, `type/pfmea`, `type/master-matrix` | ประเภทเอกสาร |
| Status | `status/<value>` | `status/active`, `status/draft`, `status/revise`, `status/archived` | สถานะเอกสาร |
