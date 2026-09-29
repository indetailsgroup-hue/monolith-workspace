---
num: 14
title: "การสื่อสารระหว่างแผนก"
phase: 0
phase_label: "Foundation"
phase_num: 0
mcp_tools: 0
status: complete
dependencies: "—"
---

# บทที่ 14: การสื่อสารระหว่างแผนก (Inter-Department Communication)

## บทที่ 14: การสื่อสารระหว่างแผนก (Inter-Department Communication)

### 14.1 ภาพรวมและวัตถุประสงค์

ปัญหา "information islands" หรือ silo ของข้อมูลเป็นอุปสรรคสำคัญที่งานวิจัยหลายชิ้นระบุอย่างชัดเจน โดย Lü et al. เน้นว่าระบบ scheduling แบบดั้งเดิมประสบปัญหาจาก delayed execution และ information silos ระหว่างแผนก ซึ่งระบบที่ผสาน ERP/MES/APS/WMS สามารถแก้ไขได้ด้วยการสร้าง "deep collaboration between planning, workshop execution, and warehouse logistics" [1] ในทำนองเดียวกัน Liu et al. ส่งเสริม cross-center collaboration ผ่าน cloud platform [4] Module การสื่อสารระหว่างแผนกนี้ออกแบบมาเพื่อเป็น backbone ของการไหลของข้อมูลตลอดสายการผลิตทั้งหมด

**วัตถุประสงค์หลัก:**

  * สร้าง notification flow อัตโนมัติตลอดสาย ออกแบบ → ผลิต → QC → คลัง → ขนส่ง → ติดตั้ง → After-Sales
  * จัดการ task handoff ระหว่างแผนกพร้อม approval chain
  * ตั้ง escalation rules เมื่อเกิดความล่าช้าหรือปัญหา
  * ให้ real-time alerts สำหรับ blocking issues



### 14.2 สถาปัตยกรรมของ Module

#### 14.2.1 Database Schema
[code] 
    Table: notifications
      - id: UUID (PK)
      - recipient_id: UUID (FK → employees)
      - recipient_department: ENUM ('design', 'production', 'qc', 'warehouse',
                                     'logistics', 'installation', 'after_sales',
                                     'procurement', 'hr', 'management')
      - sender_module: VARCHAR(50)
      - type: ENUM ('info', 'action_required', 'approval_request', 'alert',
                    'escalation', 'reminder')
      - title: VARCHAR(255)
      - body: TEXT
      - reference_type: VARCHAR(50) -- e.g., 'order', 'job', 'qc_report'
      - reference_id: UUID
      - priority: ENUM ('low', 'normal', 'high', 'critical')
      - channels: JSONB ['in_app', 'email', 'sms', 'line', 'push']
      - read_at: TIMESTAMPTZ NULL
      - actioned_at: TIMESTAMPTZ NULL
      - created_at: TIMESTAMPTZ
    
    Table: task_handoffs
      - id: UUID (PK)
      - order_id: UUID (FK → orders)
      - from_department: VARCHAR(50)
      - to_department: VARCHAR(50)
      - from_user_id: UUID (FK → employees)
      - to_user_id: UUID NULL (FK → employees)
      - handoff_type: ENUM ('sequential', 'parallel', 'conditional')
      - status: ENUM ('pending', 'accepted', 'rejected', 'completed', 'escalated')
      - payload: JSONB -- ข้อมูลที่ส่งต่อ
      - notes: TEXT
      - deadline: TIMESTAMPTZ
      - accepted_at: TIMESTAMPTZ NULL
      - completed_at: TIMESTAMPTZ NULL
      - created_at: TIMESTAMPTZ
    
    Table: approval_chains
      - id: UUID (PK)
      - chain_type: VARCHAR(100) -- e.g., 'design_change', 'material_substitution'
      - steps: JSONB [{step_order, approver_role, department, is_optional,\
                        timeout_hours, auto_approve_conditions}]
      - is_active: BOOLEAN
      - created_at: TIMESTAMPTZ
    
    Table: approval_requests
      - id: UUID (PK)
      - chain_id: UUID (FK → approval_chains)
      - reference_type: VARCHAR(50)
      - reference_id: UUID
      - current_step: INTEGER
      - status: ENUM ('in_progress', 'approved', 'rejected', 'cancelled', 'timed_out')
      - initiated_by: UUID (FK → employees)
      - steps_log: JSONB [{step, approver_id, decision, comments, decided_at}]
      - created_at: TIMESTAMPTZ
    
    Table: escalation_rules
      - id: UUID (PK)
      - trigger_event: VARCHAR(100)
      - condition: JSONB -- เงื่อนไข เช่น {delay_hours: 4, severity: 'high'}
      - escalation_levels: JSONB [{level, notify_roles, timeout_hours, action}]
      - is_active: BOOLEAN
      - created_at: TIMESTAMPTZ
    
    Table: department_messages
      - id: UUID (PK)
      - channel_id: UUID -- grouped by order or topic
      - sender_id: UUID (FK → employees)
      - sender_department: VARCHAR(50)
      - message: TEXT
      - attachments: JSONB [{url, filename, type}]
      - mentions: UUID[] -- mentioned user IDs
      - created_at: TIMESTAMPTZ
    
[/code]

#### 14.2.2 API Endpoints

Method | Endpoint | Description  
---|---|---  
GET | `/api/v1/notifications` | รายการ notifications ของ user (paginated)  
PATCH | `/api/v1/notifications/:id/read` | mark as read  
POST | `/api/v1/notifications/broadcast` | ส่ง notification ถึงแผนก/กลุ่ม  
POST | `/api/v1/handoffs` | สร้าง task handoff ใหม่  
PATCH | `/api/v1/handoffs/:id/accept` | รับ handoff  
PATCH | `/api/v1/handoffs/:id/reject` | ปฏิเสธ handoff  
POST | `/api/v1/approvals` | สร้าง approval request  
PATCH | `/api/v1/approvals/:id/decide` | อนุมัติ/ปฏิเสธ  
GET | `/api/v1/approvals/pending` | รายการรออนุมัติ  
GET | `/api/v1/messages/channels/:channelId` | ดูข้อความในช่อง  
POST | `/api/v1/messages` | ส่งข้อความ  
GET | `/api/v1/escalations/active` | ดู escalation ที่ active  
  
#### 14.2.3 UI Screens

  1. **Notification Center** — unified inbox แสดง notifications ทั้งหมดพร้อม filter ตาม type, priority, department
  2. **Order Communication Timeline** — timeline view ของทุก handoff, approval, message ที่เกี่ยวกับ order หนึ่ง
  3. **Approval Queue** — รายการ pending approvals สำหรับ manager พร้อม one-click approve/reject
  4. **Escalation Dashboard** — แสดง active escalations พร้อม countdown timer และ severity level
  5. **Department Chat** — ช่อง chat แยกตาม order/topic ให้แต่ละแผนกที่เกี่ยวข้องคุยกัน
  6. **Handoff Board** — Kanban board แสดง pending handoffs ระหว่างแผนก



### 14.3 Workflow Diagrams

#### 14.3.1 Order Lifecycle Communication Flow
[code] 
    ขั้นตอนที่ 1: Design Completion
      → ทีมออกแบบ finalize drawing → ระบบสร้าง handoff ไปยัง Production
      → Notification: "งานออกแบบ #ORD-1234 พร้อมเข้าผลิต"
      → แนบ: production drawings, BOM, cut list
    
    ขั้นตอนที่ 2: Production Acceptance
      → Production Planner ตรวจสอบ → Accept handoff
      → ระบบสร้าง production jobs (link ไปบทที่ 19)
      → หากมีปัญหา (เช่น วัสดุไม่พอ) → Reject + ส่ง message กลับ Design + แจ้ง Procurement
    
    ขั้นตอนที่ 3: Production → QC Handoff
      → ผลิตเสร็จแต่ละ batch → auto-handoff ไปยัง QC
      → QC Inspector ได้รับ action_required notification
    
    ขั้นตอนที่ 4: QC → Warehouse Handoff
      → QC passed → auto-handoff ไปยัง Warehouse
      → หาก QC failed → alert กลับ Production + escalation ถ้า defect rate สูง
    
    ขั้นตอนที่ 5: Warehouse → Logistics Handoff
      → สินค้าครบตาม packing list → handoff ไปยัง Logistics
      → Logistics จัด delivery schedule
    
    ขั้นตอนที่ 6: Logistics → Installation Handoff
      → จัดส่งสำเร็จ → auto-handoff ไปยัง Installation
      → Installation Coordinator จัดตารางช่าง
    
    ขั้นตอนที่ 7: Installation → After-Sales Handoff
      → ติดตั้งเสร็จ → handoff ไปยัง After-Sales
      → เริ่ม warranty period + customer satisfaction survey
    
[/code]

#### 14.3.2 Escalation Flow
[code] 
    ขั้นตอนที่ 1: ระบบตรวจพบว่า handoff ไม่ถูก accept ภายใน SLA (เช่น 4 ชั่วโมง)
    ขั้นตอนที่ 2: Level 1 Escalation → แจ้ง department head ของแผนกปลายทาง
    ขั้นตอนที่ 3: ถ้ายังไม่ดำเนินการภายใน 8 ชั่วโมง → Level 2 → แจ้ง Operations Manager
    ขั้นตอนที่ 4: ถ้ายังไม่ดำเนินการภายใน 24 ชั่วโมง → Level 3 → แจ้ง Plant Director + auto-pause downstream
    
[/code]

### 14.4 TypeScript Interface Definitions
[code] 
    interface Notification {
      id: string;
      recipientId: string;
      recipientDepartment: Department;
      senderModule: string;
      type: NotificationType;
      title: string;
      body: string;
      referenceType: string;
      referenceId: string;
      priority: 'low' | 'normal' | 'high' | 'critical';
      channels: NotificationChannel[];
      readAt: Date | null;
      actionedAt: Date | null;
      createdAt: Date;
    }
    
    type Department =
      | 'design' | 'production' | 'qc' | 'warehouse' | 'logistics'
      | 'installation' | 'after_sales' | 'procurement' | 'hr' | 'management';
    
    type NotificationType =
      | 'info' | 'action_required' | 'approval_request'
      | 'alert' | 'escalation' | 'reminder';
    
    type NotificationChannel = 'in_app' | 'email' | 'sms' | 'line' | 'push';
    
    interface TaskHandoff {
      id: string;
      orderId: string;
      fromDepartment: Department;
      toDepartment: Department;
      fromUserId: string;
      toUserId: string | null;
      handoffType: 'sequential' | 'parallel' | 'conditional';
      status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'escalated';
      payload: Record<string, unknown>;
      notes: string;
      deadline: Date;
      acceptedAt: Date | null;
      completedAt: Date | null;
      createdAt: Date;
    }
    
    interface ApprovalChain {
      id: string;
      chainType: string;
      steps: ApprovalStep[];
      isActive: boolean;
    }
    
    interface ApprovalStep {
      stepOrder: number;
      approverRole: string;
      department: Department;
      isOptional: boolean;
      timeoutHours: number;
      autoApproveConditions: Record<string, unknown> | null;
    }
    
    interface ApprovalRequest {
      id: string;
      chainId: string;
      referenceType: string;
      referenceId: string;
      currentStep: number;
      status: 'in_progress' | 'approved' | 'rejected' | 'cancelled' | 'timed_out';
      initiatedBy: string;
      stepsLog: ApprovalStepLog[];
      createdAt: Date;
    }
    
    interface ApprovalStepLog {
      step: number;
      approverId: string;
      decision: 'approved' | 'rejected' | 'skipped';
      comments: string;
      decidedAt: Date;
    }
    
    interface EscalationRule {
      id: string;
      triggerEvent: string;
      condition: EscalationCondition;
      escalationLevels: EscalationLevel[];
      isActive: boolean;
    }
    
    interface EscalationCondition {
      delayHours?: number;
      severity?: string;
      defectRate?: number;
      customField?: string;
    }
    
    interface EscalationLevel {
      level: number;
      notifyRoles: string[];
      timeoutHours: number;
      action: 'notify' | 'reassign' | 'pause_downstream' | 'alert_management';
    }
    
[/code]

### 14.5 Integration กับ Modules อื่น

module นี้ทำหน้าที่เป็น communication backbone ที่เชื่อมทุก module เข้าด้วยกัน โดยรับ events จากทุกแผนกผ่าน event bus (pub/sub pattern) และกระจาย notifications ตาม subscription rules สอดคล้องกับหลักการ integration ที่ Lü et al. เน้นว่า deep collaboration ระหว่าง planning, workshop execution และ warehouse logistics ต้องอาศัยข้อมูลที่ไหลอย่างต่อเนื่อง [1]

### 14.6 Role-Based Access Control (RBAC)

Role | สิทธิ์  
---|---  
Department Head | ดู/จัดการ notifications, handoffs ของแผนกตนเอง, approve requests  
Department Staff | ดู notifications ของตนเอง, สร้าง/ตอบรับ handoffs  
Operations Manager | ดูทั้งหมด, กำหนด escalation rules, override approvals  
System Admin | กำหนด approval chains, notification templates, escalation rules  
Plant Director | ดู escalation dashboard, override ทั้งหมด  
  
### 14.7 Mobile/Responsive Design Considerations

  * **Push notification hub** : รวม notifications จากทุก module ไว้ที่จุดเดียว
  * **Quick-action buttons** : approve/reject โดยไม่ต้องเปิดแอปเต็มรูปแบบ (actionable notifications)
  * **Badge counts** : แสดงจำนวน pending items แยกตามประเภทบน app icon
  * **Message threading** : คุยต่อเนื่องในแต่ละ order/topic ได้จาก mobile



### 14.8 KPIs และ Metrics

KPI | คำอธิบาย | เป้าหมาย  
---|---|---  
Handoff Acceptance Time | เวลาเฉลี่ยตั้งแต่สร้าง handoff จนถูก accept | ≤ 2 ชั่วโมง  
Approval Turnaround Time | เวลาเฉลี่ยในการอนุมัติ | ≤ 4 ชั่วโมง  
Escalation Rate | % handoffs ที่ต้อง escalate | ≤ 5%  
Notification Read Rate | % notifications ที่ถูกอ่านภายใน 1 ชั่วโมง | ≥ 90%  
Cross-Department Delay | เวลารวมที่สูญเสียจากการรอระหว่างแผนก | ลดลง 50% จาก baseline  
  
### 14.9 อ้างอิงจากงานวิจัย

การออกแบบ module นี้อิงจากข้อค้นพบของ Lü et al. ที่ชี้ว่าปัญหา information islands และ delayed execution เป็นอุปสรรคหลักของระบบผลิตแบบดั้งเดิม และการผสาน ERP/MES/APS/WMS เป็นทางออก [1] Liu et al. ยังเน้นความสำคัญของ cross-center collaboration ผ่าน cloud platform ซึ่ง module นี้ขยายแนวคิดเดียวกันมาใช้ในระดับ inter-department [4] Hoa et al. นำเสนอสถาปัตยกรรมที่ข้อมูลจากทุกขั้นตอนการผลิตถูกจัดเก็บบน cloud ให้ทุกส่วนเข้าถึงได้ ซึ่งเป็นรากฐานของ shared communication layer [3]
