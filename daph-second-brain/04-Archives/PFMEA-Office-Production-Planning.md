---
domain: Process
doc_type: PFMEA
group: Office
units: ["Production Planning"]
status: revise
owner: null
document_set: office/production-planning
source_file: "DAPH PFMEA, Producting Planning(1).xlsx"
tags: [domain/process, group/office, unit/production-planning, type/pfmea, status/revise]
---

# PFMEA-Office-Production-Planning

## สรุป

เอกสารประเภท **PFMEA** ในกลุ่มกระบวนการ **Office** ของหน่วยกระบวนการ **Production Planning**

### เนื้อหาที่แตกได้ (ตัวอย่าง)

```
FILE: DAPH PFMEA, Producting Planning(1).xlsx
SHEETS: DAPH PFMEA
===== SHEET: DAPH PFMEA (rows=68, cols=19) =====
R7: Process: DAPH Production Planning | Prepared by: DAPH Production planning Team
R8: Process Owner: DAPH Production Planning | Revision Date: Oct 2020   Rev 00
R10: Process Step | Requirement
(ความต้องการ) | Potential Failure Mode
(ปัญหาที่คาดว่าจะเกิดขึ้น) | Potential Failure Effects
(ผลกระทบต่อปัญหาที่เกิดขึ้น) | SEV
(Severity) | Potential Causes of Failure
(ความน่าจะเป็นต้นเหตุของปัญหา) | OCC
(Occurrence) | Current Process Controls Prevention
(การป้องกันก่อนเกิดปัญหา) | Current Process Detection
(ป้องกันไม่ให้ปัญหาหลุดลอด) | Detection | RPN | Actions Recommended | Owner | Due Date | Actions Taken | SEV | OCC | DET | RPN
R11: 1.การขึ้น Model Construction | ศึกษาแบบ 3D จากดีไซเนอร์ | พนักงานไม่ได้ทำการเช็คแบบ 3D โดยละเอียด ทำให้ข้อมูลในการขึ้นห้องและเฟอร์นิเจอร์ไม่ครบถ้วน | DAPH : Scrap 100%
Customer :  Scrap 100% | ไม่มีความละเอียดรอบคอบและรีบร้อนในการทำงาน / ไม่เข้าใจแบบที่ได้รับและไม่สอบถามในจุดที่ติดปัญหา | ศึกษาแบบก่อนทำการขึ้นห้องหรือเฟอร์นิเจอร์แต่ละชิ้น หากติดปัญหาจุดไหนให้สอบถามไปยังดีไซน์เนอร์ผู้ออกแบบ | จัดอบรมวิธีการทำงานที่ถูกต้อง ทดสอบวิธีการอ่านแบบ และขั้นตอนการขึ้นงานเป็นลำดับขั้นตอน | 0 | 0
R12: รับข้อมูลวัสดุ จากดีไซเนอร์ | ดูรหัสวัสดุผิด ใส่รหัสวัสดุไม่ครบ | ไม่ใส่ใจ | ใส่ใจรายละเอียดงานทุกจุด | ตรวจสอบว่ารายละเอียดตรงกับที่ดีไซเนอร์ให้มาหรือไม่
R13: เช็คระยะพื้นที่อย่างละเอียดจากไฟล์ 3D กับข้อมูลส่วนกลางของลูกค้า | ดูรายละเอียดไม่ครบ
R14: ใช
…
```

## ไฟล์ต้นฉบับ
![[DAPH PFMEA, Producting Planning(1).xlsx]]

## การนำทางตามกระบวนการ
- ◀️ ก่อนหน้า: [[3D-Perspective-MOC|3D Perspective]]
- ▶️ ถัดไป: (ไม่มี — เป็นจุดสิ้นสุดของกลุ่ม)

## คำย่อที่เกี่ยวข้อง
[[Glossary#PFMEA|PFMEA]], [[Glossary#RPN|RPN]], [[Glossary#Pytha|Pytha]], [[Glossary#MaxCut|MaxCut]]

## ชุดเอกสารที่เกี่ยวข้อง (Document Set)
- **Office/Production Planning**: [[SOS-Office-Main-Process]] · [[JES-Office-Main-Process]] · [[PFMEA-Office-Main-Process]] · [[Process-Control-Plan-Office-Main-Process]]
