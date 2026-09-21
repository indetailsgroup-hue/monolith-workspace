---
num: 13
title: "ระบบจัดการช่างติดตั้ง (Installation Module)"
phase: "Foundation"
phase_num: 0
mcp_tools: 0
status: complete
dependencies: "—"
---

# บทที่ 13: ระบบจัดการช่างติดตั้ง (Installation Module)

## บทที่ 13: ระบบจัดการช่างติดตั้ง (Installation Module)

### 13.1 ภาพรวมและวัตถุประสงค์

ระบบจัดการช่างติดตั้งเป็น module ที่ออกแบบมาเพื่อบริหารจัดการกระบวนการทั้งหมดตั้งแต่การจัดตารางงานติดตั้ง (scheduling) ไปจนถึงการรายงานผลหน้างาน (field report) สำหรับอุตสาหกรรมเฟอร์นิเจอร์โมดูลาร์ ผลจากการทบทวนวรรณกรรมอย่างเป็นระบบ (SLR) พบว่าไม่มีงานวิจัยใดที่ศึกษาระบบจัดการช่างติดตั้งภายใน MES/ERP framework สำหรับอุตสาหกรรมเฟอร์นิเจอร์โดยเฉพาะ — แม้ว่าคุณภาพการติดตั้งและบริการหลังส่งมอบจะเป็นปัจจัยสำคัญในการสร้างความแตกต่างทางการแข่งขัน [7] การออกแบบ module นี้จึงขยายจากหลักการ real-time tracking ด้วย electronic tagging ของ Yang et al. [5] และ distributed operations ของ Barni et al. [2] มาประยุกต์ใช้กับงานภาคสนาม

**วัตถุประสงค์หลัก:**

  * บริหารจัดการตารางงานติดตั้งและจัดสรร (assign) ช่างตาม skill matching
  * ติดตามตำแหน่งช่างแบบ real-time ผ่าน GPS tracking
  * จัดการ checklist, field report และถ่ายรูปก่อน-หลังติดตั้ง ผ่าน mobile app
  * เชื่อมต่อกับระบบ Logistics (บทที่ 17) และ After-Sales (บทที่ 22) แบบ seamless



### 13.2 สถาปัตยกรรมของ Module

#### 13.2.1 Database Schema
[code] 
    Table: installation_jobs
      - id: UUID (PK)
      - order_id: UUID (FK → orders)
      - customer_id: UUID (FK → customers)
      - site_address: JSONB {lat, lng, address, floor, unit}
      - scheduled_date: TIMESTAMPTZ
      - estimated_duration_hours: DECIMAL
      - status: ENUM ('pending_assignment', 'assigned', 'en_route', 'in_progress',
                       'paused', 'completed', 'rework_required', 'cancelled')
      - priority: ENUM ('low', 'medium', 'high', 'urgent')
      - created_at: TIMESTAMPTZ
      - updated_at: TIMESTAMPTZ
    
    Table: installer_assignments
      - id: UUID (PK)
      - job_id: UUID (FK → installation_jobs)
      - installer_id: UUID (FK → employees)
      - role: ENUM ('lead', 'assistant', 'specialist')
      - assigned_at: TIMESTAMPTZ
      - accepted_at: TIMESTAMPTZ NULL
      - completed_at: TIMESTAMPTZ NULL
    
    Table: installation_checklists
      - id: UUID (PK)
      - job_id: UUID (FK → installation_jobs)
      - template_id: UUID (FK → checklist_templates)
      - items: JSONB [{item_id, description, is_checked, checked_at, notes, photo_url}]
      - completed_at: TIMESTAMPTZ NULL
    
    Table: field_reports
      - id: UUID (PK)
      - job_id: UUID (FK → installation_jobs)
      - installer_id: UUID (FK → employees)
      - report_type: ENUM ('arrival', 'progress', 'completion', 'issue', 'rework')
      - content: TEXT
      - photos: JSONB [{url, caption, taken_at, type: 'before'|'after'|'issue'}]
      - gps_location: POINT
      - submitted_at: TIMESTAMPTZ
    
    Table: installer_gps_logs
      - id: UUID (PK)
      - installer_id: UUID (FK → employees)
      - location: POINT
      - accuracy_meters: DECIMAL
      - battery_level: INTEGER
      - recorded_at: TIMESTAMPTZ
    
    Table: installer_skills
      - id: UUID (PK)
      - installer_id: UUID (FK → employees)
      - skill_type: ENUM ('cabinet', 'countertop', 'wardrobe', 'kitchen',
                           'bathroom', 'office_partition', 'electrical', 'plumbing')
      - proficiency_level: ENUM ('beginner', 'intermediate', 'advanced', 'expert')
      - certified_at: DATE NULL
      - expiry_date: DATE NULL
    
[/code]

#### 13.2.2 API Endpoints

Method | Endpoint | Description  
---|---|---  
GET | `/api/v1/installations` | รายการงานติดตั้งทั้งหมด (filterable)  
POST | `/api/v1/installations` | สร้างงานติดตั้งใหม่  
GET | `/api/v1/installations/:id` | ดูรายละเอียดงานติดตั้ง  
PATCH | `/api/v1/installations/:id/status` | อัปเดตสถานะงาน  
POST | `/api/v1/installations/:id/assign` | จัดสรรช่างให้งาน  
GET | `/api/v1/installations/:id/checklist` | ดู checklist ของงาน  
PATCH | `/api/v1/installations/:id/checklist` | อัปเดต checklist items  
POST | `/api/v1/installations/:id/reports` | ส่ง field report  
POST | `/api/v1/installations/:id/photos` | อัปโหลดรูปภาพ  
GET | `/api/v1/installers/available` | ดูช่างที่ว่างตาม date range  
GET | `/api/v1/installers/:id/location` | ตำแหน่ง GPS ล่าสุดของช่าง  
POST | `/api/v1/installers/:id/gps` | บันทึกตำแหน่ง GPS  
GET | `/api/v1/installations/schedule` | ดู calendar view ของตาราง  
POST | `/api/v1/installations/:id/skill-match` | หาช่างที่ skill match  
  
#### 13.2.3 UI Screens

  1. **Installation Dashboard** — ภาพรวมงานติดตั้งทั้งหมดในรูปแบบ Kanban board แบ่งตาม status พร้อม map view แสดงตำแหน่งงานและช่าง
  2. **Scheduling Calendar** — drag-and-drop calendar สำหรับจัดตารางงาน แสดง availability ของช่างแต่ละคน
  3. **Job Detail Screen** — รายละเอียดงานพร้อม checklist, photos, field reports และ timeline
  4. **Mobile Installer App** — หน้าจอหลักสำหรับช่าง: งานวันนี้, navigation, checklist, camera, report form
  5. **GPS Tracking Map** — แผนที่ real-time แสดงตำแหน่งช่างทั้งหมดพร้อมสถานะงาน
  6. **Skill Matrix View** — ตาราง skills ของช่างทั้งหมดพร้อมสถานะ certification



### 13.3 Workflow Diagrams

#### 13.3.1 Installation Job Lifecycle
[code] 
    ขั้นตอนที่ 1: Job Creation
      → ระบบ Logistics ยืนยันจัดส่งสำเร็จ → สร้าง installation job อัตโนมัติ
      → หรือ Coordinator สร้าง job ด้วยตนเอง
    
    ขั้นตอนที่ 2: Skill Matching & Assignment
      → ระบบวิเคราะห์ประเภทงาน (เช่น ครัว, ตู้เสื้อผ้า)
      → จับคู่กับ skill matrix ของช่าง + ตรวจ availability + คำนวณระยะทาง
      → แนะนำช่างที่เหมาะสมที่สุด → Coordinator อนุมัติ
    
    ขั้นตอนที่ 3: Notification & Acceptance
      → Push notification ไปยัง mobile app ของช่าง
      → ช่างยืนยันรับงาน (accept) หรือปฏิเสธพร้อมเหตุผล
      → หากปฏิเสธ → กลับไปขั้นตอนที่ 2
    
    ขั้นตอนที่ 4: En Route
      → ช่างกดเริ่มเดินทาง → GPS tracking เปิดอัตโนมัติ
      → ลูกค้าได้รับ SMS/LINE แจ้ง ETA
    
    ขั้นตอนที่ 5: Site Arrival & Pre-Installation
      → ช่างกด check-in ด้วย GPS geofence verification
      → ถ่ายรูป "ก่อนติดตั้ง" (before photos)
      → ตรวจสอบ site readiness checklist
    
    ขั้นตอนที่ 6: Installation Execution
      → ดำเนินการติดตั้งตาม checklist แต่ละรายการ
      → บันทึก progress ผ่าน mobile app เป็นระยะ
      → หากพบปัญหา → สร้าง issue report + แจ้ง supervisor ทันที
    
    ขั้นตอนที่ 7: Post-Installation
      → ถ่ายรูป "หลังติดตั้ง" (after photos)
      → ลูกค้าตรวจรับงาน + ลงนามดิจิทัล
      → กรอก completion report
    
    ขั้นตอนที่ 8: Handoff to After-Sales
      → Job status → 'completed'
      → ข้อมูลส่งต่อไปยังระบบ After-Sales & Warranty (บทที่ 22)
      → เริ่มนับระยะเวลาการรับประกัน
    
[/code]

#### 13.3.2 Rework Workflow
[code] 
    ขั้นตอนที่ 1: ระบุปัญหา → ช่างหรือลูกค้ารายงาน defect
    ขั้นตอนที่ 2: Supervisor ประเมินและจัดหมวดหมู่ (manufacturing defect / installation error / damage in transit)
    ขั้นตอนที่ 3: สร้าง rework job → จัดสรรช่างใหม่ (หรือช่างเดิม)
    ขั้นตอนที่ 4: หากต้องการชิ้นงานใหม่ → แจ้ง Production Planning (บทที่ 19)
    ขั้นตอนที่ 5: ดำเนินการแก้ไข → ถ่ายรูปก่อน-หลัง → ลูกค้าตรวจรับ
    ขั้นตอนที่ 6: ปิดงาน → บันทึก root cause เพื่อ feed กลับไปยัง QC (บทที่ 15)
    
[/code]

### 13.4 TypeScript Interface Definitions
[code] 
    interface InstallationJob {
      id: string;
      orderId: string;
      customerId: string;
      siteAddress: SiteAddress;
      scheduledDate: Date;
      estimatedDurationHours: number;
      status: InstallationStatus;
      priority: Priority;
      assignments: InstallerAssignment[];
      checklist: InstallationChecklist | null;
      fieldReports: FieldReport[];
      createdAt: Date;
      updatedAt: Date;
    }
    
    interface SiteAddress {
      lat: number;
      lng: number;
      address: string;
      floor?: string;
      unit?: string;
      accessInstructions?: string;
    }
    
    type InstallationStatus =
      | 'pending_assignment' | 'assigned' | 'en_route' | 'in_progress'
      | 'paused' | 'completed' | 'rework_required' | 'cancelled';
    
    interface InstallerAssignment {
      id: string;
      jobId: string;
      installerId: string;
      installerName: string;
      role: 'lead' | 'assistant' | 'specialist';
      assignedAt: Date;
      acceptedAt: Date | null;
      completedAt: Date | null;
    }
    
    interface InstallationChecklist {
      id: string;
      jobId: string;
      templateId: string;
      items: ChecklistItem[];
      completedAt: Date | null;
    }
    
    interface ChecklistItem {
      itemId: string;
      description: string;
      isChecked: boolean;
      checkedAt: Date | null;
      notes: string;
      photoUrl: string | null;
    }
    
    interface FieldReport {
      id: string;
      jobId: string;
      installerId: string;
      reportType: 'arrival' | 'progress' | 'completion' | 'issue' | 'rework';
      content: string;
      photos: FieldPhoto[];
      gpsLocation: GpsPoint;
      submittedAt: Date;
    }
    
    interface FieldPhoto {
      url: string;
      caption: string;
      takenAt: Date;
      type: 'before' | 'after' | 'issue';
    }
    
    interface GpsPoint {
      lat: number;
      lng: number;
    }
    
    interface InstallerSkill {
      id: string;
      installerId: string;
      skillType: SkillType;
      proficiencyLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
      certifiedAt: Date | null;
      expiryDate: Date | null;
    }
    
    type SkillType =
      | 'cabinet' | 'countertop' | 'wardrobe' | 'kitchen'
      | 'bathroom' | 'office_partition' | 'electrical' | 'plumbing';
    
    interface SkillMatchRequest {
      jobId: string;
      requiredSkills: SkillType[];
      preferredDate: Date;
      siteLocation: GpsPoint;
      maxTravelDistanceKm: number;
    }
    
    interface SkillMatchResult {
      installerId: string;
      installerName: string;
      matchScore: number; // 0-100
      skills: InstallerSkill[];
      distanceKm: number;
      availableSlots: DateRange[];
    }
    
[/code]

### 13.5 Integration กับ Modules อื่น

Module | ทิศทาง | รายละเอียด  
---|---|---  
Logistics & Delivery (บทที่ 17) | Inbound | เมื่อจัดส่งสำเร็จ → trigger สร้าง installation job  
Production Planning (บทที่ 19) | Inbound | ข้อมูล BOM และ assembly instructions  
Quality Control (บทที่ 15) | Bidirectional | ผลตรวจ QC ก่อนส่ง + feedback จากหน้างานกลับเข้า QC  
After-Sales & Warranty (บทที่ 22) | Outbound | ส่งข้อมูล completion + photos เพื่อเริ่มนับ warranty  
CRM (บทที่ 18) | Bidirectional | ข้อมูลลูกค้า/ที่อยู่ + อัปเดตสถานะให้ลูกค้าเห็น  
HR & Team Management (บทที่ 20) | Inbound | ข้อมูล skill matrix, shift, ใบลา ของช่าง  
Inter-Dept Communication (บทที่ 14) | Outbound | แจ้ง escalation, ปัญหาหน้างาน  
  
### 13.6 Role-Based Access Control (RBAC)

Role | สิทธิ์  
---|---  
Installation Coordinator | สร้าง/แก้ไข jobs, จัดสรรช่าง, ดู GPS tracking, อนุมัติ reports  
Lead Installer | ดูงานที่ได้รับมอบหมาย, อัปเดต checklist, ส่ง reports, ถ่ายรูป  
Assistant Installer | ดูงาน (read-only), ส่ง reports เฉพาะตนเอง  
QC Inspector | ดู field reports, ตรวจรับงาน on-site  
Operations Manager | ดู dashboard ภาพรวม, GPS tracking ทั้งหมด, analytics  
Customer (Portal) | ดูสถานะงาน, ETA, ลงนามตรวจรับ  
  
### 13.7 Mobile/Responsive Design Considerations

การออกแบบ mobile app สำหรับช่างติดตั้งเป็นหัวใจของ module นี้ เนื่องจากงานทั้งหมดเกิดขึ้นในภาคสนาม สอดคล้องกับที่ Vukman et al. ระบุว่า mobile access เป็นหนึ่งใน critical success factors สำหรับ ERP ในทศวรรษหน้า [6]

  * **Offline-first architecture** : ช่างต้องทำงานได้แม้ไม่มีสัญญาณ internet โดยใช้ local SQLite cache + sync เมื่อออนไลน์
  * **Camera integration** : ถ่ายรูปได้โดยตรงจาก checklist items พร้อม auto-tag ตำแหน่ง GPS และ timestamp
  * **Simplified UI** : ปุ่มใหญ่ เหมาะสำหรับใช้งานด้วยถุงมือ, high-contrast colors สำหรับใช้กลางแจ้ง
  * **Push notifications** : แจ้งงานใหม่, เปลี่ยนแปลงกำหนดการ, ข้อความจาก coordinator
  * **Battery optimization** : GPS tracking แบบ batched intervals (ทุก 2 นาทีขณะเดินทาง, ทุก 10 นาทีขณะติดตั้ง)
  * **Digital signature pad** : ลูกค้าลงนามรับงานบนหน้าจอ mobile



### 13.8 KPIs และ Metrics

KPI | คำอธิบาย | เป้าหมาย  
---|---|---  
First-Time Fix Rate | % งานที่เสร็จสมบูรณ์โดยไม่ต้อง rework | ≥ 95%  
Average Installation Time | เวลาเฉลี่ยตั้งแต่เริ่มจนเสร็จ | ตาม benchmark ของแต่ละประเภทงาน  
On-Time Arrival Rate | % ที่ช่างถึงหน้างานตามกำหนด | ≥ 90%  
Customer Satisfaction Score | คะแนนความพึงพอใจหลังติดตั้ง | ≥ 4.5/5.0  
Skill Utilization Rate | % เวลาที่ช่างทำงานตรง skill | ≥ 80%  
Rework Rate | % งานที่ต้อง rework | ≤ 5%  
Checklist Completion Rate | % checklist items ที่กรอกครบ | 100%  
GPS Compliance Rate | % เวลาที่ GPS tracking ทำงาน | ≥ 95%  
  
### 13.9 อ้างอิงจากงานวิจัย

การออกแบบ module นี้ได้รับแนวคิดจากหลักการ real-time production tracking ด้วย electronic tagging ที่ Yang et al. นำเสนอสำหรับการติดตามสถานะการผลิตบน shop-floor โดยขยายแนวคิดเดียวกันไปยัง field operations ด้วย GPS tracking และ mobile check-in [5] แนวคิด distributed design and production ของ Barni et al. ที่ทดสอบระบบในสถานที่จริง (shopping mall) ก็เป็นต้นแบบของการบริหาร operations ที่กระจายตัวทางภูมิศาสตร์ [2] อย่างไรก็ตาม SLR พบว่าไม่มีงานวิจัยใดที่ศึกษาระบบจัดการช่างติดตั้งภายใน MES/ERP สำหรับเฟอร์นิเจอร์โดยเฉพาะ ทำให้ module นี้เป็นส่วนที่ต้อง pioneer ในการออกแบบ [7]
