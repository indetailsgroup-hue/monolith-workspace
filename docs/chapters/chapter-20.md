---
num: 20
title: "ระบบจัดการทีมและบุคลากร (HR & Team)"
phase: 0
phase_label: "Foundation"
phase_num: 0
mcp_tools: 0
status: complete
dependencies: "—"
---

# บทที่ 20: ระบบจัดการทีมและบุคลากร (HR & Team Management)

## บทที่ 20: ระบบจัดการทีมและบุคลากร (HR & Team Management)

### 20.1 ภาพรวมและวัตถุประสงค์

ระบบจัดการทีมและบุคลากรเป็น module ที่ SLR ระบุว่าเป็น critical gap — ไม่มีงานวิจัยใดที่ศึกษา HR modules ภายใน MES/ERP framework สำหรับเฟอร์นิเจอร์โดยเฉพาะ [7] อย่างไรก็ตาม Vukman et al. เน้นว่า user experience และ training เป็น critical success factors โดยระบุว่า "human intervention" มีบทบาทสำคัญในการ implement AI อย่างมีประสิทธิภาพ [6] Module นี้จึงออกแบบเพื่อจัดการ worker assignments, skill matrix, shift management, attendance tracking, performance evaluation และ leave management

**วัตถุประสงค์หลัก:**

  * จัดการ worker assignments ให้สอดคล้องกับ production schedule
  * ดูแล skill matrix สำหรับ matching workers กับ tasks
  * จัดตาราง shift และ attendance tracking
  * ติดตาม performance evaluation
  * จัดการ leave management และ overtime tracking



### 20.2 สถาปัตยกรรมของ Module

#### 20.2.1 Database Schema
[code] 
    Table: employees
      - id: UUID (PK)
      - employee_code: VARCHAR(20) UNIQUE
      - name: VARCHAR(200)
      - department: VARCHAR(50)
      - position: VARCHAR(100)
      - role: VARCHAR(50) -- system role for RBAC
      - employment_type: ENUM ('full_time', 'part_time', 'contract', 'temp')
      - hire_date: DATE
      - contact: JSONB {phone, email, line, emergency_contact}
      - is_active: BOOLEAN
      - created_at: TIMESTAMPTZ
    
    Table: skill_matrix
      - id: UUID (PK)
      - employee_id: UUID (FK → employees)
      - skill_category: ENUM ('machine_operation', 'assembly', 'finishing',
                               'installation', 'qc_inspection', 'design',
                               'driving', 'supervision', 'safety')
      - skill_name: VARCHAR(100)
      - proficiency: ENUM ('novice', 'beginner', 'competent', 'proficient', 'expert')
      - certified: BOOLEAN
      - certification_date: DATE NULL
      - certification_expiry: DATE NULL
      - assessed_by: UUID NULL (FK → employees)
      - assessed_at: DATE NULL
    
    Table: shifts
      - id: UUID (PK)
      - name: VARCHAR(50) -- 'Morning A', 'Afternoon B'
      - start_time: TIME
      - end_time: TIME
      - break_minutes: INTEGER
      - working_hours: DECIMAL
      - is_active: BOOLEAN
    
    Table: shift_assignments
      - id: UUID (PK)
      - employee_id: UUID (FK → employees)
      - shift_id: UUID (FK → shifts)
      - date: DATE
      - status: ENUM ('assigned', 'confirmed', 'swapped', 'absent')
      - swap_with_id: UUID NULL (FK → employees)
    
    Table: attendance_records
      - id: UUID (PK)
      - employee_id: UUID (FK → employees)
      - date: DATE
      - clock_in: TIMESTAMPTZ NULL
      - clock_out: TIMESTAMPTZ NULL
      - clock_in_method: ENUM ('fingerprint', 'face_recognition', 'card', 'mobile_gps')
      - total_hours: DECIMAL NULL
      - overtime_hours: DECIMAL DEFAULT 0
      - status: ENUM ('present', 'late', 'early_leave', 'absent', 'on_leave', 'holiday')
      - notes: TEXT NULL
    
    Table: leave_requests
      - id: UUID (PK)
      - employee_id: UUID (FK → employees)
      - leave_type: ENUM ('annual', 'sick', 'personal', 'maternity', 'training', 'unpaid')
      - start_date: DATE
      - end_date: DATE
      - days: DECIMAL
      - reason: TEXT
      - status: ENUM ('pending', 'approved', 'rejected', 'cancelled')
      - approved_by: UUID NULL (FK → employees)
      - created_at: TIMESTAMPTZ
    
    Table: performance_evaluations
      - id: UUID (PK)
      - employee_id: UUID (FK → employees)
      - evaluator_id: UUID (FK → employees)
      - period: VARCHAR(20) -- 'Q3-2026', '2026-H1'
      - criteria: JSONB [{name, weight, score, max_score, comments}]
      - overall_score: DECIMAL
      - strengths: TEXT
      - improvements: TEXT
      - goals: JSONB [{goal, target_date, status}]
      - status: ENUM ('draft', 'submitted', 'reviewed', 'acknowledged')
      - created_at: TIMESTAMPTZ
    
    Table: overtime_records
      - id: UUID (PK)
      - employee_id: UUID (FK → employees)
      - date: DATE
      - hours: DECIMAL
      - reason: TEXT
      - approved_by: UUID (FK → employees)
      - rate_multiplier: DECIMAL -- 1.5, 2.0, 3.0
      - status: ENUM ('pending', 'approved', 'rejected')
    
[/code]

#### 20.2.2 API Endpoints

Method | Endpoint | Description  
---|---|---  
GET | `/api/v1/hr/employees` | รายการพนักงาน  
GET | `/api/v1/hr/employees/:id` | โปรไฟล์พนักงาน  
GET | `/api/v1/hr/employees/:id/skills` | skill matrix ของพนักงาน  
POST | `/api/v1/hr/skills/assess` | ประเมิน skill  
GET | `/api/v1/hr/shifts/schedule` | ตารางกะ  
POST | `/api/v1/hr/shifts/assign` | จัดกะ  
POST | `/api/v1/hr/attendance/clock-in` | ลงเวลาเข้า  
POST | `/api/v1/hr/attendance/clock-out` | ลงเวลาออก  
POST | `/api/v1/hr/leave/request` | ขอลา  
PATCH | `/api/v1/hr/leave/:id/approve` | อนุมัติ/ปฏิเสธ leave  
POST | `/api/v1/hr/evaluations` | สร้าง evaluation  
GET | `/api/v1/hr/overtime` | รายการ OT  
POST | `/api/v1/hr/overtime/request` | ขอ OT  
  
#### 20.2.3 UI Screens

  1. **HR Dashboard** — สรุปจำนวนพนักงาน, attendance today, pending leaves, upcoming evaluations
  2. **Employee Directory** — รายชื่อพนักงานพร้อม search, filter by department/skill
  3. **Skill Matrix Grid** — ตาราง skills vs employees พร้อม heatmap
  4. **Shift Planner** — drag-and-drop shift assignment calendar
  5. **Attendance Board** — สถานะเข้า-ออกของพนักงานแบบ real-time
  6. **Leave Calendar** — ปฏิทินแสดงใครลาวันไหน, balance เหลือ
  7. **Performance Review** — ฟอร์มประเมินผลงาน + goal tracking
  8. **Overtime Tracker** — รายการ OT รอ approve, สรุป OT รายเดือน



### 20.3 Workflow Diagrams

#### 20.3.1 Worker Assignment Workflow
[code] 
    ขั้นตอนที่ 1: Production Planning สร้าง job → กำหนด required skills
    ขั้นตอนที่ 2: ระบบ query skill matrix → หา workers ที่มี skill match + available ในกะ
    ขั้นตอนที่ 3: Supervisor review → assign workers ให้ operations
    ขั้นตอนที่ 4: Workers ได้รับ notification งานที่ได้รับมอบหมาย
    ขั้นตอนที่ 5: Workers clock-in → start operation → ระบบ track เวลา
    ขั้นตอนที่ 6: สิ้นสุดงาน → log actual hours + calculate OT if applicable
    ขั้นตอนที่ 7: Performance data feed → สะสมสำหรับ evaluation cycle
    
[/code]

#### 20.3.2 Leave Management Workflow
[code] 
    ขั้นตอนที่ 1: พนักงานยื่นคำขอลาผ่าน app/web → ระบบตรวจ balance
    ขั้นตอนที่ 2: ระบบตรวจสอบ impact → แจ้งเตือนหากกระทบ production schedule
    ขั้นตอนที่ 3: Supervisor ได้รับ notification → approve/reject
    ขั้นตอนที่ 4: Approved → อัปเดต shift schedule + แจ้ง Production Planning
    ขั้นตอนที่ 5: หากจำเป็น → หา replacement → reassign shift
    
[/code]

### 20.4 TypeScript Interface Definitions
[code] 
    interface Employee {
      id: string;
      employeeCode: string;
      name: string;
      department: string;
      position: string;
      role: string;
      employmentType: 'full_time' | 'part_time' | 'contract' | 'temp';
      hireDate: Date;
      contact: EmployeeContact;
      isActive: boolean;
    }
    
    interface EmployeeContact {
      phone: string;
      email: string;
      line: string;
      emergencyContact: { name: string; phone: string; relation: string };
    }
    
    interface SkillEntry {
      id: string;
      employeeId: string;
      skillCategory: SkillCategory;
      skillName: string;
      proficiency: ProficiencyLevel;
      certified: boolean;
      certificationDate: Date | null;
      certificationExpiry: Date | null;
      assessedBy: string | null;
      assessedAt: Date | null;
    }
    
    type SkillCategory =
      | 'machine_operation' | 'assembly' | 'finishing' | 'installation'
      | 'qc_inspection' | 'design' | 'driving' | 'supervision' | 'safety';
    
    type ProficiencyLevel = 'novice' | 'beginner' | 'competent' | 'proficient' | 'expert';
    
    interface ShiftAssignment {
      id: string;
      employeeId: string;
      shiftId: string;
      date: Date;
      status: 'assigned' | 'confirmed' | 'swapped' | 'absent';
      swapWithId: string | null;
    }
    
    interface AttendanceRecord {
      id: string;
      employeeId: string;
      date: Date;
      clockIn: Date | null;
      clockOut: Date | null;
      clockInMethod: 'fingerprint' | 'face_recognition' | 'card' | 'mobile_gps';
      totalHours: number | null;
      overtimeHours: number;
      status: AttendanceStatus;
    }
    
    type AttendanceStatus = 'present' | 'late' | 'early_leave' | 'absent' | 'on_leave' | 'holiday';
    
    interface LeaveRequest {
      id: string;
      employeeId: string;
      leaveType: LeaveType;
      startDate: Date;
      endDate: Date;
      days: number;
      reason: string;
      status: 'pending' | 'approved' | 'rejected' | 'cancelled';
      approvedBy: string | null;
    }
    
    type LeaveType = 'annual' | 'sick' | 'personal' | 'maternity' | 'training' | 'unpaid';
    
    interface PerformanceEvaluation {
      id: string;
      employeeId: string;
      evaluatorId: string;
      period: string;
      criteria: EvaluationCriterion[];
      overallScore: number;
      strengths: string;
      improvements: string;
      goals: PerformanceGoal[];
      status: 'draft' | 'submitted' | 'reviewed' | 'acknowledged';
    }
    
    interface EvaluationCriterion {
      name: string;
      weight: number;
      score: number;
      maxScore: number;
      comments: string;
    }
    
    interface PerformanceGoal {
      goal: string;
      targetDate: Date;
      status: 'not_started' | 'in_progress' | 'completed' | 'deferred';
    }
    
[/code]

### 20.5 Integration กับ Modules อื่น

Module | ทิศทาง | รายละเอียด  
---|---|---  
Production Planning (บทที่ 19) | Outbound | worker availability, skills → scheduling  
Installation (บทที่ 13) | Outbound | installer skills, shifts, leave → assignment  
Training (บทที่ 25) | Bidirectional | skill gaps → training plans; training completion → skill update  
Safety (บทที่ 24) | Inbound | safety certifications → skill matrix  
BI Dashboard (บทที่ 21) | Outbound | headcount, attendance, OT data  
Payroll (External) | Outbound | attendance, OT, leave data → payroll calculation  
  
### 20.6 Role-Based Access Control (RBAC)

Role | สิทธิ์  
---|---  
HR Administrator | จัดการพนักงานทั้งหมด, skills, evaluations, leaves  
Department Head | ดู/จัดการพนักงานในแผนก, approve leaves, evaluate  
Shift Supervisor | จัดกะ, ดู attendance, assign workers  
Employee (Self) | ดูข้อมูลตนเอง, clock-in/out, ขอลา, ดูผล evaluation  
  
### 20.7 Mobile/Responsive Design Considerations

  * **Self-service app** : clock-in/out ด้วย face recognition หรือ GPS, ขอลา, ดูตารางกะ
  * **Supervisor mobile** : approve leaves, ดู attendance ทีม, reassign
  * **Kiosk mode** : สำหรับ clock-in ที่หน้าโรงงานด้วย fingerprint/face
  * **Offline clock-in** : queue บน device → sync เมื่อเชื่อมต่อ



### 20.8 KPIs และ Metrics

KPI | คำอธิบาย | เป้าหมาย  
---|---|---  
Attendance Rate | % วันที่มาทำงานตามกำหนด | ≥ 97%  
Skill Coverage | % ของ critical skills ที่มีคน certified ≥ 2 คน | ≥ 90%  
Overtime Ratio | OT hours / regular hours | ≤ 15%  
Employee Turnover Rate | % พนักงานลาออกต่อปี | ≤ 10%  
Training Completion Rate | % training ที่เสร็จตามแผน | ≥ 85%  
Performance Improvement | % พนักงานที่ score ดีขึ้นจาก cycle ก่อน | ≥ 70%  
Leave Utilization | % annual leave ที่ใช้จริง | 80–100%  
  
### 20.9 อ้างอิงจากงานวิจัย

SLR ระบุอย่างชัดเจนว่าไม่มีงานวิจัยใดที่ศึกษา HR modules ภายใน MES/ERP สำหรับเฟอร์นิเจอร์ [7] อย่างไรก็ตาม Vukman et al. เน้นว่า user experience และ training เป็น CSFs สำคัญ และ "human intervention in the effective and responsible implementation of artificial intelligence" ชี้ให้เห็นว่าคุณภาพของบุคลากรมีผลโดยตรงต่อความสำเร็จของระบบ [6] การออกแบบ skill matrix ใน module นี้ได้แรงบันดาลใจจากแนวคิด skill matching ในงานของ Lü et al. ที่ต้อง match ความสามารถของเครื่องจักรกับงาน — ซึ่งขยายไปสู่การ match ความสามารถของคนกับงานด้วยหลักการเดียวกัน [1]
