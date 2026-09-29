---
num: 24
title: "ระบบความปลอดภัยและมาตรฐาน (Safety)"
phase: 0
phase_label: "Foundation"
phase_num: 0
mcp_tools: 0
status: complete
dependencies: "—"
---

# บทที่ 24: ระบบความปลอดภัยและมาตรฐาน (Safety & Compliance)

## บทที่ 24: ระบบความปลอดภัยและมาตรฐาน (Safety & Compliance)

### 24.1 ภาพรวมและวัตถุประสงค์

ระบบความปลอดภัยและมาตรฐานเป็น module ที่ SLR ระบุว่าเป็น gap ที่สำคัญอีกแห่ง — ไม่มีงานวิจัยใดที่ศึกษา safety compliance modules ภายใน MES/ERP สำหรับเฟอร์นิเจอร์โดยเฉพาะ [7] อย่างไรก็ตาม Vukman et al. เน้นว่า data security เป็น CSF สำคัญสำหรับ ERP implementation [6] Module นี้ครอบคลุมทั้งความปลอดภัยของบุคลากร (occupational safety) และการปฏิบัติตามมาตรฐาน (regulatory compliance)

**วัตถุประสงค์หลัก:**

  * จัดการ safety protocols สำหรับทุกขั้นตอนการผลิต
  * ติดตาม regulatory compliance (ISO, สมอ., กฎหมายแรงงาน)
  * บันทึก audit trail สำหรับทุกการเปลี่ยนแปลงในระบบ
  * จัดการ incident reporting และ investigation
  * ติดตาม PPE (Personal Protective Equipment)
  * จัดการ machine safety certification



### 24.2 สถาปัตยกรรมของ Module

#### 24.2.1 Database Schema
[code] 
    Table: safety_protocols
      - id: UUID (PK)
      - title: VARCHAR(200)
      - area: ENUM ('workshop', 'warehouse', 'spray_booth', 'cnc_area',
                    'assembly', 'loading_dock', 'installation_site', 'office')
      - category: ENUM ('general', 'machine_specific', 'chemical', 'fire',
                         'electrical', 'ergonomic', 'fall_prevention', 'dust')
      - content: TEXT -- full protocol document
      - version: INTEGER
      - effective_date: DATE
      - review_date: DATE
      - approved_by: UUID (FK → employees)
      - status: ENUM ('draft', 'active', 'under_review', 'archived')
      - attachments: JSONB [{url, filename}]
    
    Table: incidents
      - id: UUID (PK)
      - incident_number: VARCHAR(20) UNIQUE
      - type: ENUM ('near_miss', 'first_aid', 'medical_treatment',
                    'lost_time_injury', 'fatality', 'property_damage',
                    'environmental', 'fire')
      - severity: ENUM ('minor', 'moderate', 'serious', 'critical')
      - location: VARCHAR(100)
      - date_time: TIMESTAMPTZ
      - description: TEXT
      - involved_employees: UUID[]
      - witnesses: JSONB [{name, statement}]
      - photos: JSONB [{url, caption}]
      - immediate_actions: TEXT
      - root_cause: TEXT NULL
      - corrective_actions: JSONB [{action, responsible_id, deadline, status}]
      - investigation_status: ENUM ('reported', 'investigating', 'root_cause_identified',
                                     'corrective_actions_assigned', 'closed')
      - reported_by: UUID (FK → employees)
      - investigated_by: UUID NULL (FK → employees)
      - created_at: TIMESTAMPTZ
      - closed_at: TIMESTAMPTZ NULL
    
    Table: ppe_tracking
      - id: UUID (PK)
      - employee_id: UUID (FK → employees)
      - ppe_type: ENUM ('helmet', 'safety_glasses', 'ear_protection', 'dust_mask',
                         'respirator', 'gloves', 'safety_shoes', 'high_vis_vest',
                         'face_shield', 'apron')
      - issued_date: DATE
      - expiry_date: DATE NULL
      - condition: ENUM ('new', 'good', 'worn', 'damaged', 'replaced')
      - serial_number: VARCHAR(50) NULL
      - notes: TEXT NULL
    
    Table: compliance_requirements
      - id: UUID (PK)
      - standard: VARCHAR(100) -- 'ISO 9001', 'ISO 14001', 'ISO 45001', 'TIS'
      - clause: VARCHAR(50)
      - description: TEXT
      - responsible_department: VARCHAR(50)
      - evidence_required: TEXT
      - status: ENUM ('compliant', 'non_compliant', 'in_progress', 'not_applicable')
      - last_audit_date: DATE NULL
      - next_audit_date: DATE
      - findings: TEXT NULL
    
    Table: machine_safety_certs
      - id: UUID (PK)
      - machine_id: UUID (FK → machines)
      - certification_type: VARCHAR(100) -- 'annual_inspection', 'electrical_safety', 'guard_check'
      - issued_date: DATE
      - expiry_date: DATE
      - inspector: VARCHAR(200)
      - certificate_url: VARCHAR(500)
      - status: ENUM ('valid', 'expiring_soon', 'expired', 'suspended')
    
    Table: audit_trail
      - id: UUID (PK)
      - user_id: UUID (FK → employees)
      - action: VARCHAR(100)
      - entity_type: VARCHAR(50)
      - entity_id: UUID
      - old_values: JSONB NULL
      - new_values: JSONB NULL
      - ip_address: VARCHAR(45)
      - user_agent: VARCHAR(500)
      - timestamp: TIMESTAMPTZ
    
[/code]

#### 24.2.2 API Endpoints

Method | Endpoint | Description  
---|---|---  
GET | `/api/v1/safety/protocols` | รายการ safety protocols  
POST | `/api/v1/safety/incidents` | รายงาน incident  
GET | `/api/v1/safety/incidents/:id` | รายละเอียด incident  
PATCH | `/api/v1/safety/incidents/:id/investigate` | อัปเดตการสอบสวน  
GET | `/api/v1/safety/ppe/:employeeId` | PPE ของพนักงาน  
POST | `/api/v1/safety/ppe/issue` | ออก PPE ใหม่  
GET | `/api/v1/safety/compliance` | compliance status ทั้งหมด  
PATCH | `/api/v1/safety/compliance/:id` | อัปเดต compliance status  
GET | `/api/v1/safety/machine-certs` | ใบรับรองเครื่องจักร  
GET | `/api/v1/safety/audit-trail` | ดู audit trail  
GET | `/api/v1/safety/analytics` | safety analytics  
  
#### 24.2.3 UI Screens

  1. **Safety Dashboard** — incident summary, compliance status, expiring certs, PPE alerts
  2. **Incident Report Form** — ฟอร์มรายงาน incident พร้อม photo upload
  3. **Incident Investigation Board** — Kanban board ของ incidents ตาม investigation status
  4. **Compliance Matrix** — ตาราง standards × requirements + compliance status
  5. **PPE Tracker** — inventory PPE, expiry alerts, issuance log
  6. **Machine Safety Register** — สถานะ certification ของทุกเครื่อง
  7. **Audit Trail Viewer** — ค้นหาและ filter audit logs
  8. **Safety Protocol Library** — ห้องสมุด safety documents



### 24.3 Workflow Diagrams

#### 24.3.1 Incident Reporting & Investigation Workflow
[code] 
    ขั้นตอนที่ 1: เกิดเหตุ → ดำเนินมาตรการฉุกเฉินเบื้องต้น (first aid, evacuate)
    ขั้นตอนที่ 2: พนักงาน/supervisor รายงาน incident ผ่าน app/web
    ขั้นตอนที่ 3: ระบบจัดหมวดหมู่ severity → แจ้ง Safety Officer ทันที
      → Critical/Serious → แจ้ง Management + หน่วยงานภายนอกถ้าจำเป็น
    ขั้นตอนที่ 4: Safety Officer เริ่มสอบสวน → เก็บข้อมูล, สัมภาษณ์
    ขั้นตอนที่ 5: ระบุ root cause → 5 Why Analysis / Fishbone
    ขั้นตอนที่ 6: กำหนด corrective actions → assign ผู้รับผิดชอบ + deadline
    ขั้นตอนที่ 7: ติดตาม corrective actions จนเสร็จ
    ขั้นตอนที่ 8: ปิด incident → สรุปบทเรียน (lessons learned) → อัปเดต protocol ถ้าจำเป็น
    ขั้นตอนที่ 9: Feed data เข้า BI (บทที่ 21) สำหรับ trend analysis
    
[/code]

### 24.4 TypeScript Interface Definitions
[code] 
    interface SafetyProtocol {
      id: string;
      title: string;
      area: WorkArea;
      category: SafetyCategory;
      content: string;
      version: number;
      effectiveDate: Date;
      reviewDate: Date;
      approvedBy: string;
      status: 'draft' | 'active' | 'under_review' | 'archived';
      attachments: Attachment[];
    }
    
    type WorkArea =
      | 'workshop' | 'warehouse' | 'spray_booth' | 'cnc_area'
      | 'assembly' | 'loading_dock' | 'installation_site' | 'office';
    
    type SafetyCategory =
      | 'general' | 'machine_specific' | 'chemical' | 'fire'
      | 'electrical' | 'ergonomic' | 'fall_prevention' | 'dust';
    
    interface Incident {
      id: string;
      incidentNumber: string;
      type: IncidentType;
      severity: 'minor' | 'moderate' | 'serious' | 'critical';
      location: string;
      dateTime: Date;
      description: string;
      involvedEmployees: string[];
      witnesses: { name: string; statement: string }[];
      photos: { url: string; caption: string }[];
      immediateActions: string;
      rootCause: string | null;
      correctiveActions: CorrectiveAction[];
      investigationStatus: InvestigationStatus;
      reportedBy: string;
      investigatedBy: string | null;
      closedAt: Date | null;
    }
    
    type IncidentType =
      | 'near_miss' | 'first_aid' | 'medical_treatment'
      | 'lost_time_injury' | 'fatality' | 'property_damage'
      | 'environmental' | 'fire';
    
    type InvestigationStatus =
      | 'reported' | 'investigating' | 'root_cause_identified'
      | 'corrective_actions_assigned' | 'closed';
    
    interface CorrectiveAction {
      action: string;
      responsibleId: string;
      deadline: Date;
      status: 'pending' | 'in_progress' | 'completed' | 'overdue';
    }
    
    interface PpeRecord {
      id: string;
      employeeId: string;
      ppeType: PpeType;
      issuedDate: Date;
      expiryDate: Date | null;
      condition: 'new' | 'good' | 'worn' | 'damaged' | 'replaced';
      serialNumber: string | null;
    }
    
    type PpeType =
      | 'helmet' | 'safety_glasses' | 'ear_protection' | 'dust_mask'
      | 'respirator' | 'gloves' | 'safety_shoes' | 'high_vis_vest'
      | 'face_shield' | 'apron';
    
    interface ComplianceRequirement {
      id: string;
      standard: string;
      clause: string;
      description: string;
      responsibleDepartment: string;
      evidenceRequired: string;
      status: 'compliant' | 'non_compliant' | 'in_progress' | 'not_applicable';
      lastAuditDate: Date | null;
      nextAuditDate: Date;
      findings: string | null;
    }
    
    interface AuditTrailEntry {
      id: string;
      userId: string;
      action: string;
      entityType: string;
      entityId: string;
      oldValues: Record<string, unknown> | null;
      newValues: Record<string, unknown> | null;
      ipAddress: string;
      timestamp: Date;
    }
    
[/code]

### 24.5 Integration กับ Modules อื่น

Module | ทิศทาง | รายละเอียด  
---|---|---  
HR (บทที่ 20) | Bidirectional | PPE assignments, safety certifications → skill matrix  
Production Planning (บทที่ 19) | Inbound | machine safety status → scheduling constraints  
Training (บทที่ 25) | Outbound | safety incidents → training needs analysis  
BI Dashboard (บทที่ 21) | Outbound | safety KPIs, incident trends  
All Modules | Inbound | audit trail data จากทุก action  
  
### 24.6 Role-Based Access Control (RBAC)

Role | สิทธิ์  
---|---  
Safety Officer | จัดการ protocols, investigate incidents, manage compliance  
Safety Manager | approve protocols, ดู analytics, set policies  
Department Head | ดู incidents ในแผนก, ดู compliance status  
All Employees | รายงาน incidents, ดู protocols ที่เกี่ยวข้อง  
Auditor (External) | ดู compliance matrix, audit trail (read-only)  
System Admin | ดู/export audit trail  
  
### 24.7 Mobile/Responsive Design Considerations

  * **Quick incident reporting** : ฟอร์ม simplified สำหรับรายงาน incident ทันทีจาก mobile
  * **Safety protocol viewer** : ดู protocol ที่เกี่ยวข้องกับ area ปัจจุบัน (GPS/NFC tag)
  * **PPE check-in** : scan PPE barcode → verify ว่าพนักงานมี PPE ครบก่อนเข้า area
  * **Offline reporting** : รายงาน incident ได้แม้ offline



### 24.8 KPIs และ Metrics

KPI | คำอธิบาย | เป้าหมาย  
---|---|---  
Lost Time Injury Frequency Rate (LTIFR) | จำนวน LTI ต่อล้านชั่วโมงทำงาน | ≤ 2.0  
Total Recordable Incident Rate (TRIR) | จำนวน recordable incidents ต่อ 200,000 ชั่วโมง | ≤ 4.0  
Near Miss Reporting Rate | จำนวน near miss reports ต่อเดือน | ≥ 10 (encourage reporting)  
Corrective Action Completion Rate | % corrective actions ที่เสร็จตาม deadline | ≥ 95%  
PPE Compliance Rate | % พนักงานที่มี PPE ครบและยังไม่หมดอายุ | 100%  
Machine Certification Currency | % เครื่องที่มี certification ปัจจุบัน | 100%  
ISO Compliance Score | % ข้อกำหนด ISO ที่ comply | ≥ 95%  
Days Without Lost Time Incident | จำนวนวันต่อเนื่องที่ไม่มี LTI | maximize  
  
### 24.9 อ้างอิงจากงานวิจัย

SLR ระบุว่า safety compliance เป็นหนึ่งใน modules ที่ "not explicitly examined in any of the included studies" ภายใน MES/ERP framework สำหรับเฟอร์นิเจอร์ [7] Vukman et al. เน้นว่า data security เป็น CSF ที่สำคัญสำหรับ ERP implementation ซึ่ง audit trail เป็นส่วนหนึ่งของมาตรการรักษาความปลอดภัยของข้อมูล [6] การออกแบบ audit trail ในระบบนี้จึงครอบคลุมทั้ง data security (ตามที่ Vukman et al. แนะนำ) และ occupational safety ซึ่งสำคัญอย่างยิ่งในโรงงานที่ใช้เครื่อง CNC, เครื่องตัด, ห้องพ่นสี และสารเคมี
