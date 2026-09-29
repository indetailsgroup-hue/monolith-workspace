---
num: 15
title: "ระบบควบคุมคุณภาพ (QC)"
phase: 0
phase_label: "Foundation"
phase_num: 0
mcp_tools: 0
status: complete
dependencies: "—"
---

# บทที่ 15: ระบบควบคุมคุณภาพ (Quality Control)

## บทที่ 15: ระบบควบคุมคุณภาพ (Quality Control)

### 15.1 ภาพรวมและวัตถุประสงค์

ระบบควบคุมคุณภาพเป็น module ที่ครอบคลุมทุกจุดตรวจสอบ (checkpoint) ตลอดสายการผลิต ตั้งแต่การรับวัตถุดิบจนถึงการตรวจรับหน้างานติดตั้ง Hoa et al. เป็นงานวิจัยที่กล่าวถึง AI-based quality inspection สำหรับกระบวนการผลิตไม้โดยเฉพาะ โดยเสนอการใช้ AI ตรวจสอบคุณภาพการกลึง/ตัดในบางขั้นตอน [3] Vukman et al. เน้นว่า integration กับ production machinery เป็น critical success factor ที่เชื่อมโยงโดยตรงกับ quality outcomes [6]

**วัตถุประสงค์หลัก:**

  * กำหนด QC checkpoints ทุกขั้นตอนของ production workflow
  * ติดตาม defect tracking ตลอดสายการผลิต
  * รองรับ AI-powered quality detection สำหรับงานตัด, เจาะ, ทำสีผิว
  * จัดทำรายงาน QC และ inspection workflows
  * จัดการการตรวจรับก่อนส่งมอบ (pre-delivery inspection) และตรวจรับหน้างาน (on-site acceptance)



### 15.2 สถาปัตยกรรมของ Module

#### 15.2.1 Database Schema
[code] 
    Table: qc_checkpoints
      - id: UUID (PK)
      - name: VARCHAR(100)
      - stage: ENUM ('incoming_material', 'cutting', 'edge_banding', 'drilling',
                      'assembly', 'surface_finishing', 'pre_packing', 'pre_delivery',
                      'on_site_installation')
      - checklist_template: JSONB [{item_id, description, measurement_type,\
                                     tolerance_min, tolerance_max, unit, is_critical}]
      - ai_enabled: BOOLEAN
      - ai_model_id: VARCHAR(100) NULL
      - is_mandatory: BOOLEAN
      - created_at: TIMESTAMPTZ
    
    Table: qc_inspections
      - id: UUID (PK)
      - checkpoint_id: UUID (FK → qc_checkpoints)
      - job_id: UUID (FK → production_jobs)
      - order_id: UUID (FK → orders)
      - inspector_id: UUID (FK → employees)
      - batch_id: VARCHAR(50)
      - status: ENUM ('pending', 'in_progress', 'passed', 'failed',
                       'conditional_pass', 'rework_required')
      - results: JSONB [{item_id, measured_value, passed, notes, photo_url}]
      - ai_results: JSONB NULL [{defect_type, confidence, bounding_box, image_url}]
      - overall_score: DECIMAL
      - started_at: TIMESTAMPTZ
      - completed_at: TIMESTAMPTZ NULL
    
    Table: defects
      - id: UUID (PK)
      - inspection_id: UUID (FK → qc_inspections)
      - job_id: UUID (FK → production_jobs)
      - component_id: VARCHAR(50)
      - defect_type: ENUM ('dimensional', 'surface', 'structural', 'color',
                            'edge_quality', 'hardware', 'material', 'assembly')
      - severity: ENUM ('minor', 'major', 'critical')
      - description: TEXT
      - root_cause: ENUM ('material', 'machine', 'operator', 'design',
                           'environment', 'unknown') NULL
      - photos: JSONB [{url, annotation}]
      - corrective_action: TEXT NULL
      - status: ENUM ('open', 'rework_in_progress', 'rework_completed',
                       'accepted_as_is', 'scrapped', 'closed')
      - detected_by: ENUM ('manual', 'ai_vision', 'measurement', 'customer_report')
      - created_at: TIMESTAMPTZ
      - resolved_at: TIMESTAMPTZ NULL
    
    Table: qc_reports
      - id: UUID (PK)
      - report_type: ENUM ('daily', 'weekly', 'monthly', 'job_specific', 'audit')
      - period_start: DATE
      - period_end: DATE
      - summary: JSONB {total_inspected, passed, failed, defect_rate,
                         top_defects, trend_data}
      - generated_by: UUID (FK → employees)
      - generated_at: TIMESTAMPTZ
    
    Table: ai_quality_models
      - id: UUID (PK)
      - model_name: VARCHAR(100)
      - model_version: VARCHAR(20)
      - defect_categories: VARCHAR[] -- ประเภท defect ที่ตรวจจับได้
      - accuracy: DECIMAL
      - checkpoint_stage: VARCHAR(50)
      - model_url: VARCHAR(500)
      - is_active: BOOLEAN
      - trained_at: TIMESTAMPTZ
      - deployed_at: TIMESTAMPTZ
    
[/code]

#### 15.2.2 API Endpoints

Method | Endpoint | Description  
---|---|---  
GET | `/api/v1/qc/checkpoints` | รายการ QC checkpoints ทั้งหมด  
POST | `/api/v1/qc/inspections` | สร้างการตรวจสอบใหม่  
PATCH | `/api/v1/qc/inspections/:id` | อัปเดตผลการตรวจสอบ  
GET | `/api/v1/qc/inspections/:id` | ดูรายละเอียดการตรวจสอบ  
POST | `/api/v1/qc/inspections/:id/ai-detect` | เรียก AI defect detection  
POST | `/api/v1/qc/defects` | บันทึก defect ใหม่  
PATCH | `/api/v1/qc/defects/:id` | อัปเดตสถานะ defect  
GET | `/api/v1/qc/defects` | รายการ defects (filterable)  
GET | `/api/v1/qc/reports` | รายการ QC reports  
POST | `/api/v1/qc/reports/generate` | สร้างรายงาน QC  
GET | `/api/v1/qc/analytics/defect-trends` | วิเคราะห์แนวโน้ม defect  
GET | `/api/v1/qc/analytics/checkpoint-performance` | ประสิทธิภาพแต่ละ checkpoint  
  
#### 15.2.3 UI Screens

  1. **QC Dashboard** — ภาพรวม defect rate, pass rate, จำนวน pending inspections พร้อม trend charts
  2. **Inspection Form** — ฟอร์มตรวจสอบแบบ step-by-step ตาม checklist template พร้อมช่องกรอกค่า measurement
  3. **AI Detection View** — แสดงรูปถ่ายชิ้นงานพร้อม bounding boxes ที่ AI ตรวจพบ defect + confidence score
  4. **Defect Tracker** — รายการ defects ทั้งหมดพร้อม filter ตาม type, severity, status, root cause
  5. **QC Report Builder** — สร้างรายงาน QC แบบ custom ด้วย date range, checkpoint, product type
  6. **Pre-Delivery Inspection** — ฟอร์มตรวจรับก่อนส่งมอบเฉพาะ
  7. **On-Site Acceptance** — ฟอร์มตรวจรับหน้างาน (ใช้บน tablet)



### 15.3 Workflow Diagrams

#### 15.3.1 QC Checkpoint Workflow (ทุกขั้นตอน)
[code] 
    ขั้นตอนที่ 1: Incoming Material Inspection
      → รับวัตถุดิบ → ตรวจสอบเกรดไม้, ขนาด, ความชื้น, สี
      → ผ่าน → เข้าคลัง (บทที่ 16) | ไม่ผ่าน → แจ้ง Procurement (บทที่ 23) → return supplier
    
    ขั้นตอนที่ 2: Cutting Inspection
      → ตัดเสร็จ → วัดขนาดชิ้นงาน ± tolerance (เช่น ±0.5mm)
      → AI Vision: ตรวจ chip, crack, edge quality
      → ผ่าน → ไป Edge Banding | ไม่ผ่าน → rework/scrap
    
    ขั้นตอนที่ 3: Edge Banding Inspection
      → ตรวจ adhesion, สี edge band ตรงกับแผ่น, ไม่มีฟอง
      → AI Vision: ตรวจ bubbles, misalignment, excess glue
    
    ขั้นตอนที่ 4: Drilling Inspection
      → ตรวจตำแหน่งรู, ความลึก, ขนาดรู ตาม drawing
      → ใช้ jig template matching
    
    ขั้นตอนที่ 5: Assembly Inspection (ถ้ามี pre-assembly)
      → ตรวจ fit, alignment, hardware installation
      → ทดสอบ drawer slides, hinges, soft-close
    
    ขั้นตอนที่ 6: Surface Finishing Inspection
      → ตรวจสีผิว, ความเงา, รอยขีดข่วน, ฝุ่น
      → AI Vision: ตรวจ surface defects ด้วย high-res camera
    
    ขั้นตอนที่ 7: Pre-Packing Inspection
      → ตรวจชิ้นงานทั้งหมดของ order → จับคู่กับ packing list
      → ตรวจ hardware kit ครบถ้วน → assembly instructions ถูกต้อง
    
    ขั้นตอนที่ 8: Pre-Delivery Inspection
      → สุ่มตรวจก่อนขึ้นรถ → ตรวจ packaging integrity
      → ลงนามอนุมัติ → handoff ไปยัง Logistics
    
    ขั้นตอนที่ 9: On-Site Installation Acceptance
      → ช่างติดตั้งเสร็จ → ตรวจรับร่วมกับลูกค้า
      → ลูกค้าลงนามรับงาน → ถ้าไม่ผ่าน → สร้าง defect → rework flow
    
[/code]

### 15.4 TypeScript Interface Definitions
[code] 
    interface QcCheckpoint {
      id: string;
      name: string;
      stage: QcStage;
      checklistTemplate: QcChecklistItem[];
      aiEnabled: boolean;
      aiModelId: string | null;
      isMandatory: boolean;
    }
    
    type QcStage =
      | 'incoming_material' | 'cutting' | 'edge_banding' | 'drilling'
      | 'assembly' | 'surface_finishing' | 'pre_packing' | 'pre_delivery'
      | 'on_site_installation';
    
    interface QcChecklistItem {
      itemId: string;
      description: string;
      measurementType: 'pass_fail' | 'numeric' | 'visual' | 'ai_assisted';
      toleranceMin: number | null;
      toleranceMax: number | null;
      unit: string | null;
      isCritical: boolean;
    }
    
    interface QcInspection {
      id: string;
      checkpointId: string;
      jobId: string;
      orderId: string;
      inspectorId: string;
      batchId: string;
      status: InspectionStatus;
      results: InspectionResult[];
      aiResults: AiDetectionResult[] | null;
      overallScore: number;
      startedAt: Date;
      completedAt: Date | null;
    }
    
    type InspectionStatus =
      | 'pending' | 'in_progress' | 'passed' | 'failed'
      | 'conditional_pass' | 'rework_required';
    
    interface InspectionResult {
      itemId: string;
      measuredValue: number | string | boolean;
      passed: boolean;
      notes: string;
      photoUrl: string | null;
    }
    
    interface AiDetectionResult {
      defectType: string;
      confidence: number;
      boundingBox: { x: number; y: number; width: number; height: number };
      imageUrl: string;
    }
    
    interface Defect {
      id: string;
      inspectionId: string;
      jobId: string;
      componentId: string;
      defectType: DefectType;
      severity: 'minor' | 'major' | 'critical';
      description: string;
      rootCause: RootCause | null;
      photos: { url: string; annotation: string }[];
      correctiveAction: string | null;
      status: DefectStatus;
      detectedBy: 'manual' | 'ai_vision' | 'measurement' | 'customer_report';
      createdAt: Date;
      resolvedAt: Date | null;
    }
    
    type DefectType =
      | 'dimensional' | 'surface' | 'structural' | 'color'
      | 'edge_quality' | 'hardware' | 'material' | 'assembly';
    
    type RootCause =
      | 'material' | 'machine' | 'operator' | 'design' | 'environment' | 'unknown';
    
    type DefectStatus =
      | 'open' | 'rework_in_progress' | 'rework_completed'
      | 'accepted_as_is' | 'scrapped' | 'closed';
    
[/code]

### 15.5 Integration กับ Modules อื่น

Module | ทิศทาง | รายละเอียด  
---|---|---  
Production Planning (บทที่ 19) | Inbound | ข้อมูล job, tolerance specs, drawings  
Inventory (บทที่ 16) | Bidirectional | incoming material QC → approve/reject stock, scrap → stock adjustment  
Inter-Dept Communication (บทที่ 14) | Outbound | แจ้ง defect alerts, QC results  
Installation (บทที่ 13) | Bidirectional | on-site acceptance results, installation defect feedback  
After-Sales (บทที่ 22) | Inbound | customer defect reports → feed เข้า defect tracking  
BI Dashboard (บทที่ 21) | Outbound | QC metrics, defect trends, AI accuracy  
Procurement (บทที่ 23) | Outbound | material rejection → supplier quality score  
  
### 15.6 Role-Based Access Control (RBAC)

Role | สิทธิ์  
---|---  
QC Inspector | สร้าง/ดำเนินการ inspections, บันทึก defects, ถ่ายรูป  
QC Supervisor | อนุมัติ conditional pass, กำหนด root cause, override AI  
QC Manager | กำหนด checkpoints, จัดการ AI models, สร้างรายงาน  
Production Worker | ดูผล QC ของงานตนเอง (read-only)  
Operations Manager | ดู QC analytics ภาพรวม  
  
### 15.7 Mobile/Responsive Design Considerations

  * **Tablet-optimized inspection forms** : หน้าจอตรวจสอบออกแบบสำหรับ tablet ใช้ใน shop-floor
  * **Camera + AI overlay** : ถ่ายรูปชิ้นงาน → AI highlight defect area ทันที
  * **Quick defect logging** : ใช้ voice-to-text บันทึก defect description
  * **Offline inspection** : ทำงานได้แม้ offline → sync เมื่อเชื่อมต่อ



### 15.8 KPIs และ Metrics

KPI | คำอธิบาย | เป้าหมาย  
---|---|---  
First Pass Yield (FPY) | % ชิ้นงานที่ผ่าน QC ตั้งแต่ครั้งแรก | ≥ 98%  
Defect Rate (DPMO) | Defects per million opportunities | ≤ 3,400 (≈3.5 sigma)  
AI Detection Accuracy | ความแม่นยำของ AI defect detection | ≥ 95%  
Inspection Cycle Time | เวลาเฉลี่ยในการตรวจสอบต่อ batch | ลดลง 30% ด้วย AI  
Rework Cost Ratio | % ต้นทุน rework ต่อ total production cost | ≤ 2%  
Customer Defect Escape Rate | % defect ที่หลุดไปถึงลูกค้า | ≤ 0.5%  
Root Cause Resolution Time | เวลาเฉลี่ยในการหา root cause | ≤ 48 ชั่วโมง  
  
### 15.9 อ้างอิงจากงานวิจัย

Hoa et al. เสนอการใช้ AI สำหรับควบคุมคุณภาพในบางขั้นตอนของกระบวนการผลิตไม้ — โดยเฉพาะการตรวจสอบคุณภาพงานกลึงและตัด — ซึ่งเป็นพื้นฐานของ AI-powered quality detection ใน module นี้ นอกจากนี้ IoT ยังถูกนำเสนอเป็นเครื่องมือสำหรับเชื่อมต่อเซ็นเซอร์วัดค่าต่างๆ เข้ากับระบบจัดการส่วนกลาง [3] Yang et al. ใช้ electronic tagging เพื่อ track สถานะชิ้นงานแบบ real-time ซึ่งช่วยให้ QC inspector สามารถติดตามประวัติการผลิตของชิ้นงานแต่ละชิ้นได้ [5] Vukman et al. ระบุว่า integration with production machinery เป็น CSF ที่เชื่อมโยงโดยตรงกับการปรับปรุงคุณภาพ เนื่องจากข้อมูลจากเครื่องจักรสามารถ feed เข้าสู่ระบบ QC ได้อัตโนมัติ [6]
