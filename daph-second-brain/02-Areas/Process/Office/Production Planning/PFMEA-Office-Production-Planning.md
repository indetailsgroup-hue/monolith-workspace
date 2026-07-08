---
domain: Process
doc_type: PFMEA
group: Office
units: ["Production Planning"]
status: active
owner: null
document_set: office/production-planning
source_file: "DAPH PFMEA, Producting Planning.xlsx"
tags: [domain/process, group/office, unit/production-planning, type/pfmea, status/active]
---

# PFMEA-Office-Production-Planning

## สรุป

เอกสารประเภท **PFMEA** ในกลุ่มกระบวนการ **Office** ของหน่วยกระบวนการ **Production Planning**

### เนื้อหาที่แตกได้ (ตัวอย่าง)

```
FILE: DAPH PFMEA, Producting Planning.xlsx
SHEETS: DAPH PFMEA
===== SHEET: DAPH PFMEA (rows=66, cols=20) =====
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
R11: 1.การขึ้น Model Construction | ศึกษาแบบ 3D จากดีไซเนอร์ | DAPH : Scrap 100%
Customer :  Scrap 100% | ควรเช็คระยะในแบบก่อนการทำแบบ | สอบถามผู้เกี่ยวข้องทุกครั้งก่อนเริ่มงานหากแบบไม่ชัดเจน | 0 | 0
R12: เช็คระยะพื้นที่อย่างละเอียดจากไฟล์ 3D กับข้อมูลส่วนกลางของลูกค้า
R13: ขึ้นผนังใน Pytha | ขึ้นระยะผิดจากแบบวัดพื้นที่ ที่ได้มา | ตัวเลขในแบบวัดพื้นที่ไม่ชัดเจน
R14: ใส่ระยะประตู และหน้าต่าง | ระยะพื้นที่ประตูหน้าต่างมาไม่ครบ รายละเอียดไม่ชัดเจน | ระยะของพื้นที่ขาดหายไป ด้านในด้านหนึ่ง ทำให้พื้นที่ทั้ง 4 ด้านไม่ลงตัว | 0
R15: ใส่ระยะปลั๊กไฟ | ระยะปลั๊กที่ได้มาไม่ชัดเจน ไม่ครบถ้วน | วัดระยะปลั๊กมาไม่ครบตามพื้นที่หน้างาน | เช็คจำนวนปลั๊กหน้างานว่ามีระยะครบทุกจุดหรือไม่ | 0 | 0
```

## ไฟล์ต้นฉบับ
![[DAPH PFMEA, Producting Planning.xlsx]]

## การนำทางตามกระบวนการ
- ◀️ ก่อนหน้า: [[3D-Perspective-MOC|3D Perspective]]
- ▶️ ถัดไป: (ไม่มี — เป็นจุดสิ้นสุดของกลุ่ม)

## คำย่อที่เกี่ยวข้อง
[[Glossary#PFMEA|PFMEA]], [[Glossary#RPN|RPN]], [[Glossary#Pytha|Pytha]], [[Glossary#MaxCut|MaxCut]]

## ชุดเอกสารที่เกี่ยวข้อง (Document Set)
- **Office/Production Planning**: [[SOS-Office-Main-Process]] · [[JES-Office-Main-Process]] · [[PFMEA-Office-Main-Process]] · [[Process-Control-Plan-Office-Main-Process]]
