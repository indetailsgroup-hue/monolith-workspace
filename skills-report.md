# รายงานการตรวจสอบและสร้าง Skills

## สถานะ Skill ทั้งหมด (8 ตัว)

### ✅ Skill ที่ใช้งานได้ดี (4 ตัว)

| Skill | สถานะ | Dependencies |
|-------|--------|-------------|
| **pdf** | ✅ พร้อมใช้งาน | pypdf 3.17.4, pdfplumber 0.11.9, reportlab 4.4.10, qpdf, pdftotext, LibreOffice |
| **xlsx** | ✅ พร้อมใช้งาน | openpyxl 3.1.5, pandas 2.3.3, LibreOffice (recalc.py ทำงานปกติ) |
| **schedule** | ✅ พร้อมใช้งาน | ไม่มี dependency พิเศษ |
| **skill-creator** | ✅ พร้อมใช้งาน | Python scripts ครบ, มี eval-viewer, grader, analyzer |

### ⚠️ Skill ที่มีข้อจำกัด (2 ตัว)

| Skill | ปัญหา | ทางเลือก |
|-------|--------|---------|
| **docx** | npm ถูก block → ติดตั้ง `docx` (docx-js) ไม่ได้ → สร้างไฟล์ใหม่ด้วย JS ไม่ได้ | ใช้ `python-docx` แทนได้ (ใช้งานได้), การแก้ไขไฟล์เดิม (unpack/edit XML/pack) ยังใช้งานได้ปกติ, LibreOffice convert ใช้ได้ |
| **pptx** | npm ถูก block → ติดตั้ง `pptxgenjs` ไม่ได้ → สร้าง presentation จาก scratch ไม่ได้ | การอ่าน/แก้ไข presentation ที่มีอยู่ (unpack/edit/pack) ยังใช้ได้, markitdown ใช้อ่านได้ |

### 🆕 Skill ใหม่ที่สร้าง (2 ตัว)

| Skill | รายละเอียด | ไฟล์ |
|-------|-----------|------|
| **furniture-hardware** | ความรู้ครบวงจรเรื่องอุปกรณ์เชื่อมต่อเฟอร์นิเจอร์ | SKILL.md + 3 reference files |
| **furniture-research** | Deep Research เฉพาะด้านเฟอร์นิเจอร์ | SKILL.md + 1 reference file |

---

## รายละเอียด Skill ใหม่

### furniture-hardware
เนื้อหาครอบคลุม:
- Minifix 15/12 — สเปค, ขนาดรูเจาะ, วิธีติดตั้ง
- Cam Lock ทุกยี่ห้อ (Rafix, VB, Titus)
- Dowel (ไม้, พลาสติก, เหล็ก)
- Confirmat Screw — ตารางขนาด
- Concealed Hinges (Blum, Hettich, Grass) — overlay types, ตารางรุ่น
- Drawer Slides (Ball bearing, Undermount, Tandem)
- Shelf Supports + System 32
- Edge Banding (PVC, ABS, Melamine, Veneer)
- วัสดุแผ่น (Particleboard, MDF, Plywood, Melamine, HDF)

Reference files:
- `hardware-catalog.md` — แคตตาล็อกสเปคทุกอุปกรณ์
- `installation-guide.md` — คู่มือติดตั้ง step-by-step + System 32
- `material-guide.md` — คู่มือวัสดุแผ่นและความเข้ากัน

### furniture-research
เนื้อหาครอบคลุม:
- ขั้นตอนการค้นคว้าแบบ Deep Research
- แหล่งข้อมูลตามประเภท (สเปค, ราคา, ออกแบบ, ตลาด)
- Template รายงานวิจัย, เปรียบเทียบสินค้า, คำแนะนำ
- รายชื่อยี่ห้อหลักในวงการ (Häfele, Blum, Hettich, Grass ฯลฯ)
- มาตรฐานที่เกี่ยวข้อง (EN, ANSI, TIS)

Reference files:
- `suppliers-thailand.md` — แหล่งซื้อในไทย, ตัวแทนจำหน่าย, ราคาวัสดุโดยประมาณ

---

## วิธีติดตั้ง Skill ใหม่

ไฟล์ Skill อยู่ใน folder ที่เลือก:
```
skills/
├── furniture-hardware/
│   ├── SKILL.md
│   └── references/
│       ├── hardware-catalog.md
│       ├── installation-guide.md
│       └── material-guide.md
└── furniture-research/
    ├── SKILL.md
    └── references/
        └── suppliers-thailand.md
```

เพื่อให้ใช้งานได้จริงใน Cowork ต้องย้ายไปยัง `.skills/skills/` ซึ่งเป็น read-only ในตอนนี้ สามารถใช้ skill-creator ในการ package เป็น .skill file แล้วติดตั้งในภายหลังได้
