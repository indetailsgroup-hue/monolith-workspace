---
domain: Process
doc_type: PFMEA
group: Office
units: ["3D Perspective"]
status: active
owner: null
document_set: office/3d-perspective
source_file: "DAPH PFMEA, 3D Perspective.xlsx"
tags: [domain/process, group/office, unit/3d-perspective, type/pfmea, status/active]
---

# PFMEA-Office-3D-Perspective

## สรุป

เอกสารประเภท **PFMEA** ในกลุ่มกระบวนการ **Office** ของหน่วยกระบวนการ **3D Perspective**

### เนื้อหาที่แตกได้ (ตัวอย่าง)

```
FILE: DAPH PFMEA, 3D Perspective.xlsx
SHEETS: DAPH PFMEA
===== SHEET: DAPH PFMEA (rows=69, cols=20) =====
R7: Process: DAPH 3D Perspective | Prepared by: DAPH 3D Perpective Team
R8: Process Owner: DAPH 3D Perspective | Revision Date: Oct 2020   Rev 00
R10: Process Step | Requirement
(ความต้องการ) | Potential Failure Mode
(ปัญหาที่คาดว่าจะเกิดขึ้น) | Potential Failure Effects
(ผลกระทบต่อปัญหาที่เกิดขึ้น) | SEV
(Severity) | Potential Causes of Failure
(ความน่าจะเป็นต้นเหตุของปัญหา) | OCC
(Occurrence) | Current Process Controls Prevention
(การป้องกันก่อนเกิดปัญหา) | Current Process Detection
(ป้องกันไม่ให้ปัญหาหลุดลอด) | Detection | RPN | Actions Recommended | Owner | Due Date | Actions Taken | SEV | OCC | DET | RPN
R11: The process step in which the X occurs | The key input (X) under consideration | How the key input input fails | The overall list of impacts on downstream Customers (internal or external) | How Severe the impact is on the Customer | The cause of the key input failing | How likely the cause is to occur | The package of existing controls along the causal path: Cause -> FM -> Effect | (Detection) | How well the package of controls prevents or detects the causal path occuring | Risk Priority Number | The planned actions for reducing the RPN | Individual responsible for the action | When Action will be complete | The actual actions taken | New Severity rating | New Occurrence Rating | New Deection Rating | New Risk Prority Number
R12: 1.3D Model | Build each room | 8
…
```

## ไฟล์ต้นฉบับ
![[DAPH PFMEA, 3D Perspective.xlsx]]

## การนำทางตามกระบวนการ
- ◀️ ก่อนหน้า: [[Designer-MOC|Designer]]
- ▶️ ถัดไป: [[Production-Planning-MOC|Production Planning]]

## ความเชื่อมโยงกับ Process Model (ADR-015)

เอกสารนี้ใช้ชื่อตามต้นฉบับ (document fidelity) และครอบคลุม process step ต่อไปนี้ของ Knowledge_Export:
- **3D_Presentation** ← §1 "1.3D Model" ของเอกสารนี้
- **3D_Rendering_Final** ← §2 "2.3D Rendering" ของเอกสารนี้

## คำย่อที่เกี่ยวข้อง
[[Glossary#PFMEA|PFMEA]], [[Glossary#RPN|RPN]]

## ชุดเอกสารที่เกี่ยวข้อง (Document Set)
- **Office/3D Perspective**: [[SOS-Office-Main-Process]] · [[JES-Office-Main-Process]] · [[Process-Control-Plan-Office-Main-Process]]
