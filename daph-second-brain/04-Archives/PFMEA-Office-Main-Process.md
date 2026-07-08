---
domain: Process
doc_type: PFMEA
group: Office
units: ["Sale", "Area Measurement", "Designer", "3D Perspective", "Production Planning"]
status: revise
owner: null
document_set: null
source_file: "DAPH PFMEA, Main Process (Revise 1).xlsx"
tags: [domain/process, group/office, unit/sale, unit/area-measurement, unit/designer, unit/3d-perspective, unit/production-planning, type/pfmea, status/revise]
---

# PFMEA-Office-Main-Process

## สรุป

เอกสารประเภท **PFMEA** ในกลุ่มกระบวนการ **Office** ครอบคลุมหน่วยกระบวนการ: Sale, Area Measurement, Designer, 3D Perspective, Production Planning

### เนื้อหาที่แตกได้ (ตัวอย่าง)

```
FILE: DAPH PFMEA, Main Process (Revise 1).xlsx
SHEETS: Sheet1 | DAPH PFMEA
===== SHEET: Sheet1 (rows=18, cols=3) =====
===== SHEET: DAPH PFMEA (rows=80, cols=19) =====
R7: Process: DAPH Main Process | Prepared by: DAPH Team
R8: Process Owner: DAPH Main Process | Revision Date: Oct 2020   Rev 00
R10: Process Step | Requirement
(ความต้องการ) | Potential Failure Mode
(ปัญหาที่คาดว่าจะเกิดขึ้น) | Potential Failure Effects
(ผลกระทบต่อปัญหาที่เกิดขึ้น) | SEV
(Severity) | Potential Causes of Failure
(ความน่าจะเป็นต้นเหตุของปัญหา) | OCC
(Occurrence) | Current Process Controls Prevention
(การป้องกันก่อนเกิดปัญหา) | Current Process Detection
(ป้องกันไม่ให้ปัญหาหลุดลอด) | Detection | RPN | Actions Recommended | Owner | Due Date | Actions Taken | SEV | OCC | DET | RPN
R11: The process step in which the X occurs | The key input (X) under consideration | How the key input input fails | The overall list of impacts on downstream Customers (internal or external) | How Severe the impact is on the Customer | The cause of the key input failing | How likely the cause is to occur | The package of existing controls along the causal path: Cause -> FM -> Effect | (Detection) | How well the package of controls prevents or detects the causal path occuring | Risk Priority Number | The planned actions for reducing the RPN | Individual responsible for the action | When Action will be complete | The actual actions taken | New Severity rating | New Occurrence Rating | New Deection Rating | New Risk Prority
…
```

## ไฟล์ต้นฉบับ
![[DAPH PFMEA, Main Process (Revise 1).xlsx]]

## หน่วยกระบวนการในเอกสารนี้ (รายชีต)

### Sale
สรุปขั้นตอน/ชีตของหน่วย **Sale** ในเอกสารนี้

### Area Measurement
สรุปขั้นตอน/ชีตของหน่วย **Area Measurement** ในเอกสารนี้

### Designer
สรุปขั้นตอน/ชีตของหน่วย **Designer** ในเอกสารนี้

### 3D Perspective
สรุปขั้นตอน/ชีตของหน่วย **3D Perspective** ในเอกสารนี้

### Production Planning
สรุปขั้นตอน/ชีตของหน่วย **Production Planning** ในเอกสารนี้

## การนำทางตามกระบวนการ
- ◀️ ก่อนหน้า: (ไม่มี — เป็นจุดเริ่มของกลุ่ม)
- ▶️ ถัดไป: [[Area-Measurement-MOC|Area Measurement]]

## ความเชื่อมโยงกับ Process Model (ADR-015)

เอกสารนี้ใช้ชื่อตามต้นฉบับ (document fidelity) และครอบคลุม process step ต่อไปนี้ของ Knowledge_Export:
- **3D_Presentation** ← §1 "1.3D Model" ของเอกสารนี้
- **3D_Rendering_Final** ← §2 "2.3D Rendering" ของเอกสารนี้

## คำย่อที่เกี่ยวข้อง
[[Glossary#PFMEA|PFMEA]], [[Glossary#RPN|RPN]], [[Glossary#Pytha|Pytha]]

## ชุดเอกสารที่เกี่ยวข้อง (Document Set)
- **Office/Sale**: [[SOS-Office-Main-Process]] · [[JES-Office-Main-Process]] · [[Process-Control-Plan-Office-Main-Process]]
- **Office/Area Measurement**: [[SOS-Office-Main-Process]] · [[JES-Office-Main-Process]] · [[PFMEA-Office-Area-Measurement]] · [[Process-Control-Plan-Office-Main-Process]]
- **Office/Designer**: [[SOS-Office-Main-Process]] · [[JES-Office-Main-Process]] · [[PFMEA-Office-Designer]] · [[Process-Control-Plan-Office-Main-Process]]
- **Office/3D Perspective**: [[SOS-Office-Main-Process]] · [[JES-Office-Main-Process]] · [[PFMEA-Office-3D-Perspective]] · [[Process-Control-Plan-Office-Main-Process]]
- **Office/Production Planning**: [[SOS-Office-Main-Process]] · [[JES-Office-Main-Process]] · [[Process-Control-Plan-Office-Main-Process]]
