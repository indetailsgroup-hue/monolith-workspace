# Contract และคู่มือดูแลเอกสาร Manufacturing

เจ้าของงานอนุมัติในห้อง Codex วันที่ 2026-09-21 ให้ใช้ **phase 0–15 โดย Foundation=0** แทนสเปกเดิม 1–15 อย่างชัดเจน ผล audit เดิมยังเป็นหลักฐานเดิม ไม่เปลี่ยนย้อนหลังให้ผ่าน

## หลักฐานและขอบเขต

ต้นฉบับ SHA `1f4dc37fed3d5f32ce9c5f29f1d3cc1f303c973f` เทียบ Git blobs ครบ55บทกับ inventory DOC-S1 แล้ว บท01–27 ระบุ phase_num:0 ส่วนบท28–55 ระบุ1–15 ตัวอย่าง: [บท01](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1f4dc37fed3d5f32ce9c5f29f1d3cc1f303c973f/docs/chapters/chapter-01.md), [บท27](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1f4dc37fed3d5f32ce9c5f29f1d3cc1f303c973f/docs/chapters/chapter-27.md), [บท28](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1f4dc37fed3d5f32ce9c5f29f1d3cc1f303c973f/docs/chapters/chapter-28.md), [บท55](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1f4dc37fed3d5f32ce9c5f29f1d3cc1f303c973f/docs/chapters/chapter-55.md)

Contract นี้ใช้กับระบบเอกสาร ไม่ใช่ระดับความพร้อมของผลิตภัณฑ์ governance/bootstrap root และ nested product repository เป็น Git คนละ root ข้อความและ status ในบทไม่ใช่หลักฐานว่า deploy ระบบจริงแล้ว

## Frontmatter ที่ต้องมี

| ฟิลด์ | ข้อตกลง |
|---|---|
| num | จำนวนเต็ม1–55 ตรง chapter-NN.md ไม่รับ boolean |
| title | ข้อความไม่ว่างและสอดคล้องกับเนื้อหาเดิม |
| phase | จำนวนเต็ม0–15 โดย0คือ Foundation และ1–15คือ phase ที่มีหมายเลข |
| phase_num | จำนวนเต็มตรงกับ phase เสมอ เก็บเพื่อความเข้ากันได้ |
| phase_label | Foundation เมื่อ phase=0 มิฉะนั้น Phase N |
| mcp_tools | จำนวนเต็มไม่ติดลบใน metadata ไม่รับ boolean |
| status | complete, in-progress, planned หรือ draft |

```yaml
---
num: 1
title: Executive Summary — Monolith Manufacturing OS
phase: 0
phase_num: 0
phase_label: Foundation
mcp_tools: 2
status: complete
---
```

## Editorial corrections ที่รับแล้ว

ชื่อบท02–10 ใช้หัวข้อเนื้อหาเดิมตามลำดับ: System Overview, Research & Background, Technical Architecture, Product Requirements Document (PRD), Technical Specifications, Developer Documentation, Rebuild Blueprint, Risk Management, Roadmap บท11–12 ใช้ Conclusions & Recommendations และ API Reference — MCP Server & REST Endpoints คงหมายเลขทุกบท การย้าย metadata คง body เดิมทั้งหมด แต่รอบ editorial correction ต่อมาแก้บริบท23จุดใน6บท ดู[บันทึกการแก้](../reports/2026-09-21-docs-claim-corrections.th.html) ย้ายชื่อ phase เดิมไป phase_label และใช้เลข phase_num เดิม ไม่สร้างการจัด phase ใหม่

คง status complete53บทและ in-progress2บท (54–55) ผลรวม MCP metadata126 ไม่ใช่จำนวน tool ที่ไม่ซ้ำหรือ inventory runtime ที่ยืนยันแล้ว ห้ามล้างจำนวนโดยสมมติว่าเป็น placeholder, เปลี่ยนสถานะ, ย้ายเนื้อหา หรืออ้างว่า ADR implement แล้วจาก DOC-S1 เพียงอย่างเดียว ชื่อคนละภาษาไม่ใช่ defect โดยอัตโนมัติ

## การตรวจและสร้างข้อมูลในเครื่อง

รันจาก repository root ด้วย Python3.12 และ Node.js บน Windows ใช้ Git Bash สำหรับทดสอบ syntax ของ shell ใน workflow

```bash
python -m pip install -r scripts/docs/requirements.txt
python -m unittest discover -s tests/docs -v
python -c "from scripts.docs.site_data import *; c=render_chapters('docs/chapters'); s=search_index(c); validate_data(c,s,{str(n) for n in range(1,56)}); write_json('docs/manufacturing-os-site/chapters.json',c); write_json('docs/manufacturing-os-site/search_index.json',s)"
python -m scripts.docs.site_data
python -m http.server 3000 --directory docs/manufacturing-os-site
```

Generator และ release sync ใช้ renderer เดียวกัน fingerprint ของ cache ครอบคลุม source, renderer/workflow และเวอร์ชัน dependencies ถ้าข้อมูลที่สร้างหายหรือผิดรูปแบบต้อง rebuild เก็บคู่มือนอก docs/chapters เพราะ Markdown ทุกไฟล์ในนั้นถูกตรวจเป็น source chapter การเพิ่มบท56หรือ phase16ต้องเปลี่ยน schema และ UI โดยชัดเจนก่อน

## Review และหลักฐาน deployment

เปิด PR และตรวจ Actions จริงที่ head SHA นั้น ต้องผ่าน required checks ของ branch protection ผลทดสอบในเครื่องไม่ใช่ผล Actions ตรวจ frontmatter และ JSON แล้วเปิดบท01/55 ทดสอบ global search และ code blocks ใน browser

| ปลายทาง | วิธี deploy | หลักฐานยอมรับ |
|---|---|---|
| [GitHub Pages](https://indetailsgroup-hue.github.io/monolith-workspace/) | deploy-docs-pages.yml และ auto-deploy-scispace.yml ใช้ deploy-pages | run สำเร็จ, SHA/artifact ที่ deploy และเนื้อหาจริง |
| [SciSpace site](https://0ly1b489.scispace.co/) | กระบวนการ publish ของ SciSpace แยกต่างหาก | หลักฐาน publish และตรวจหน้าเว็บจริงแยกกัน |

Workflow ชื่อ Auto-Deploy SciSpace Site **ไม่ได้** publish ไป scispace.co เว็บเก่าเปิดได้ไม่พิสูจน์ว่า PR ถูก deploy แล้ว บันทึก pending/skipped/failed ตามจริง Lighthouse ต้อง performance≥70 และ accessibility≥90 โดยเก็บรายงาน/ความเห็นก่อน final gate ตัดสินล้มเหลว
