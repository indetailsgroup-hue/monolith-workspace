/**
 * static-assets.ts — StaticAssets ของ Vault_Builder
 *
 * Feature: daph-obsidian-second-brain (Tasks 13.1–13.4)
 * Requirements: 6.x (Master Matrix), 8.x (Glossary), 10.x (Template), 11.x (Plugin Guide), 11.5 (Tag-Reference)
 *
 * สร้างเอกสาร static ใน `03-Resources`: Glossary, Tag-Reference,
 * Master Process Matrix note, Project Template, Plugin Guide
 */

import { CANONICAL_GROUPS, CANONICAL_UNITS_BY_GROUP } from './constants.js';
import { groupMocName } from './moc-generator.js';
import type { GeneratedNote } from './moc-generator.js';

/** Glossary — คำย่อ + ซอฟต์แวร์ (Req 8/12) */
function glossary(): GeneratedNote {
  const content = `---
type: glossary
tags: [resource, glossary]
---

# 📖 อภิธานศัพท์ (Glossary)

## คำย่อระบบคุณภาพ
- **SOS** — Standardized Operation Sheet: เอกสารกำหนดมาตรฐานการปฏิบัติงานต่อหน่วยกระบวนการ
- **JES** — Job Element Sheet: เอกสารแจกแจงองค์ประกอบของงาน (What/How/Why) อ้างด้วยรหัส เช่น JES-001
- **PFMEA** — Process Failure Mode and Effects Analysis: วิเคราะห์ความเสี่ยงของกระบวนการ
- **RPN** — Risk Priority Number: ค่าจัดลำดับความเสี่ยง (= SEV × OCC × DET)
- **MC_Code** — รหัสเครื่องจักร/อุปกรณ์ที่อ้างใน SOS เช่น MC-001
- **MOC** — Map of Content: โน้ตศูนย์รวมที่ลิงก์ไปโน้ตอื่นในหัวข้อเดียวกัน
- **PARA** — ระบบจัดหมวดความรู้ 4 กลุ่ม: Projects, Areas, Resources, Archives

## ซอฟต์แวร์ที่ใช้ในกระบวนการ
- **Pytha** — ซอฟต์แวร์ออกแบบ/ถอดวัสดุเฟอร์นิเจอร์ 3D (ใช้ในขั้น Production Planning)
- **MaxCut** — ซอฟต์แวร์วางแผนการตัดและถอดรายการวัสดุ
- **AutoCAD** — ซอฟต์แวร์เขียนแบบ 2D ใช้แปลงไฟล์เจาะส่งร้านนอก
- **3D Max** — ซอฟต์แวร์ขึ้นโมเดลและเรนเดอร์ 3D (ใช้ในขั้น 3D Perspective)
`;
  return { relativePath: '03-Resources/Glossary.md', content };
}

/** Tag-Reference — รายการแท็กทั้งหมด (Req 11.5) */
function tagReference(): GeneratedNote {
  const content = `---
type: tag-reference
tags: [resource]
---

# 🏷️ รายการแท็ก (Tag Reference)

ระบบแท็กใช้รูปแบบ \`<มิติ>/<slug>\` สม่ำเสมอทุกโน้ต

| มิติ | รูปแบบ | ตัวอย่าง | ความหมาย |
|------|--------|---------|----------|
| Domain | \`domain/<slug>\` | \`domain/hardware\`, \`domain/process\` | โดเมนความรู้ |
| Group | \`group/<slug>\` | \`group/office\`, \`group/factory\`, \`group/installation\` | กลุ่มกระบวนการ |
| Unit | \`unit/<slug>\` | \`unit/sale\`, \`unit/laminate-hpl\` | หน่วยกระบวนการ (มีได้หลายค่า) |
| Type | \`type/<slug>\` | \`type/sos\`, \`type/pfmea\`, \`type/master-matrix\` | ประเภทเอกสาร |
| Status | \`status/<value>\` | \`status/active\`, \`status/draft\`, \`status/revise\`, \`status/archived\` | สถานะเอกสาร |
`;
  return { relativePath: '03-Resources/Tag-Reference.md', content };
}

/** Master Process Matrix note — สำหรับคุณชุ.xlsx (Req 6) */
function masterMatrix(): GeneratedNote {
  const groupLinks = CANONICAL_GROUPS.map((g) => `- [[${groupMocName(g)}|${g}]]`).join('\n');
  const content = `---
type: master-matrix
tags: [resource, type/master-matrix]
source_file: "สำหรับคุณชุ.xlsx"
---

# 🗂️ Master Process Matrix (สำหรับคุณชุ)

เมทริกซ์กระบวนการ + เวลา + ต้นทุน + RACI ระดับบริษัท (กว่า 1,000 แถว)
ครอบคลุมทั้งสายงาน: **Line sales → measure → Production → House design → 3D → Installation**
พร้อมคอลัมน์ประมาณการเวลาและต้นทุนรายขั้นตอน

## ไฟล์ต้นฉบับ
![[สำหรับคุณชุ.xlsx]]

## เชื่อมไปกลุ่มกระบวนการ
${groupLinks}
`;
  return { relativePath: '03-Resources/Master-Matrix.md', content };
}

/** Project Template — งานลูกค้าใหม่ (Req 10) */
function projectTemplate(): GeneratedNote {
  const sections = CANONICAL_GROUPS.map((g) => {
    const units = CANONICAL_UNITS_BY_GROUP[g].map((u) => `- [ ] ${u}`).join('\n');
    return `### ${g}\n${units}`;
  }).join('\n\n');

  const content = `---
type: project-template
tags: [resource, template]
client: ""
project: ""
date: ""
---

# 📝 เทมเพลตโครงการ: {{ชื่อโครงการ}}

> คัดลอกโน้ตนี้ไปไว้ใน \`01-Projects/\` เมื่อเริ่มงานลูกค้าใหม่ แล้วแก้ frontmatter (client/project/date)

## ข้อมูลลูกค้า
- ลูกค้า:
- โครงการ:
- วันที่เริ่ม:

## ขั้นตอนงานตามกระบวนการ
${sections}

## เอกสารปฏิบัติการที่เกี่ยวข้อง
- Feasibility / ใบเสนอราคา (ดู \`03-Resources/Templates/\`)
- Spec sheet
- แผนงานช่างติดตั้งรายวัน
`;
  return { relativePath: '03-Resources/Project-Template.md', content };
}

/** Plugin Guide (Req 11) */
function pluginGuide(): GeneratedNote {
  const content = `---
type: plugin-guide
tags: [resource]
---

# 🔌 คำแนะนำปลั๊กอิน Obsidian

Vault นี้ใช้ปลั๊กอินต่อไปนี้เพื่อให้ฟีเจอร์ทำงานเต็มที่:

## Dataview (จำเป็น)
- ใช้ใน Home_Dashboard และ MOC สำหรับ query รายการเอกสารแบบไดนามิก
- **หาก query Dataview ไม่แสดงผล** แปลว่ายังไม่ได้ติดตั้ง/เปิดใช้งาน Dataview — ลิงก์ static ยังใช้ได้ตามปกติ
- เปิดใช้: Settings → Community plugins → Browse → ค้นหา "Dataview" → Install → Enable

## Templater (แนะนำ)
- ใช้สร้างโน้ตโครงการใหม่จาก \`03-Resources/Project-Template.md\` อย่างรวดเร็ว
- เปิดใช้: Settings → Community plugins → Browse → "Templater" → Install → Enable

## Excalidraw (ทางเลือก)
- ใช้วาดไดอะแกรม/ผังหน้างานประกอบโน้ต
- เปิดใช้: Settings → Community plugins → Browse → "Excalidraw" → Install → Enable
`;
  return { relativePath: '03-Resources/Plugin-Guide.md', content };
}

/** สร้าง static asset ทั้งหมด */
export function generateStaticAssets(): GeneratedNote[] {
  return [glossary(), tagReference(), masterMatrix(), projectTemplate(), pluginGuide()];
}
