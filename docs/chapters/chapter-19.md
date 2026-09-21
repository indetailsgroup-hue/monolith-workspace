---
num: 19
title: "ระบบวางแผนการผลิต (Production Planning)"
phase: "Foundation"
phase_num: 0
mcp_tools: 0
status: complete
dependencies: "—"
---

# บทที่ 19: ระบบวางแผนการผลิต (Production Planning)

## บทที่ 19: ระบบวางแผนการผลิต (Production Planning)

### 19.1 ภาพรวมและวัตถุประสงค์

ระบบวางแผนการผลิตเป็น module ที่ได้รับการสนับสนุนจากงานวิจัยมากที่สุดใน SLR โดย Lü et al. นำเสนอ intelligent scheduling system ที่ผสาน ERP/MES/APS/WMS สำหรับแก้ปัญหาหลักของเฟอร์นิเจอร์แบบ custom — ความขัดแย้งระหว่าง large-scale production กับ individualized demands ที่ก่อให้เกิด "chaos in production scheduling, resource waste, and low collaborative efficiency" [1] Yang et al. นำเสนอ platform ที่ ERP สร้าง production tasks และ drawings แล้วส่งผ่าน interface ไปยัง MES ที่จัดการ production control ผ่าน central control module [5]

**วัตถุประสงค์หลัก:**

  * Job scheduling สำหรับ small-batch, multi-variety orders
  * Capacity planning และ machine allocation
  * Gantt chart visualization
  * Bottleneck detection และ workload balancing
  * Priority management สำหรับ urgent orders
  * Production calendar ที่เชื่อมกับทุกแผนก



### 19.2 สถาปัตยกรรมของ Module

#### 19.2.1 Database Schema
[code] 
    Table: production_jobs
      - id: UUID (PK)
      - job_number: VARCHAR(20) UNIQUE
      - order_id: UUID (FK → orders)
      - product_type: VARCHAR(100)
      - bom_id: UUID (FK → bill_of_materials)
      - status: ENUM ('queued', 'scheduled', 'material_pending', 'ready',
                       'in_progress', 'paused', 'qc_pending', 'completed',
                       'rework', 'cancelled')
      - priority: ENUM ('low', 'normal', 'high', 'urgent', 'rush')
      - scheduled_start: TIMESTAMPTZ
      - scheduled_end: TIMESTAMPTZ
      - actual_start: TIMESTAMPTZ NULL
      - actual_end: TIMESTAMPTZ NULL
      - quantity: INTEGER
      - completed_quantity: INTEGER DEFAULT 0
      - defect_quantity: INTEGER DEFAULT 0
      - created_at: TIMESTAMPTZ
    
    Table: production_operations
      - id: UUID (PK)
      - job_id: UUID (FK → production_jobs)
      - operation_type: ENUM ('cutting', 'edge_banding', 'drilling', 'cnc_routing',
                               'assembly', 'surface_finishing', 'packing')
      - sequence: INTEGER
      - machine_id: UUID NULL (FK → machines)
      - worker_id: UUID NULL (FK → employees)
      - status: ENUM ('pending', 'scheduled', 'in_progress', 'completed',
                       'paused', 'skipped')
      - estimated_duration_minutes: INTEGER
      - actual_duration_minutes: INTEGER NULL
      - scheduled_start: TIMESTAMPTZ
      - scheduled_end: TIMESTAMPTZ
      - actual_start: TIMESTAMPTZ NULL
      - actual_end: TIMESTAMPTZ NULL
      - setup_time_minutes: INTEGER DEFAULT 0
    
    Table: machines
      - id: UUID (PK)
      - name: VARCHAR(100)
      - type: ENUM ('panel_saw', 'cnc_router', 'edge_bander', 'drilling_machine',
                    'sanding_machine', 'spray_booth', 'press', 'packaging_line')
      - capacity_per_hour: DECIMAL
      - status: ENUM ('available', 'in_use', 'maintenance', 'breakdown', 'retired')
      - current_job_id: UUID NULL (FK → production_jobs)
      - maintenance_schedule: JSONB
      - location: VARCHAR(50)
    
    Table: production_calendar
      - id: UUID (PK)
      - date: DATE
      - shift: ENUM ('morning', 'afternoon', 'night')
      - is_working_day: BOOLEAN
      - available_machines: JSONB [{machine_id, available_hours}]
      - available_workers: JSONB [{worker_id, shift_hours}]
      - planned_capacity_hours: DECIMAL
      - actual_capacity_hours: DECIMAL NULL
      - notes: TEXT
    
    Table: bottleneck_logs
      - id: UUID (PK)
      - detected_at: TIMESTAMPTZ
      - bottleneck_type: ENUM ('machine', 'material', 'worker', 'qc', 'upstream_delay')
      - resource_id: UUID -- machine_id, material_id, or worker_id
      - affected_jobs: UUID[]
      - severity: ENUM ('low', 'medium', 'high', 'critical')
      - estimated_delay_hours: DECIMAL
      - resolution: TEXT NULL
      - resolved_at: TIMESTAMPTZ NULL
    
[/code]

#### 19.2.2 API Endpoints

Method | Endpoint | Description  
---|---|---  
GET | `/api/v1/production/jobs` | รายการ production jobs  
POST | `/api/v1/production/jobs` | สร้าง job (จาก confirmed order)  
GET | `/api/v1/production/jobs/:id` | รายละเอียด job  
PATCH | `/api/v1/production/jobs/:id/status` | อัปเดตสถานะ  
GET | `/api/v1/production/schedule/gantt` | ข้อมูล Gantt chart  
POST | `/api/v1/production/schedule/optimize` | auto-schedule/optimize  
GET | `/api/v1/production/capacity` | capacity overview  
GET | `/api/v1/production/machines` | รายการเครื่องจักร + สถานะ  
POST | `/api/v1/production/machines/:id/allocate` | จัดสรรเครื่อง  
GET | `/api/v1/production/bottlenecks` | ดู active bottlenecks  
GET | `/api/v1/production/calendar` | production calendar  
POST | `/api/v1/production/jobs/:id/operations/:opId/start` | เริ่ม operation  
POST | `/api/v1/production/jobs/:id/operations/:opId/complete` | จบ operation  
  
#### 19.2.3 UI Screens

  1. **Production Dashboard** — ภาพรวมงานทั้งหมด, machine utilization, output today
  2. **Gantt Chart View** — interactive Gantt chart แสดง jobs/operations vs time, drag-to-reschedule
  3. **Capacity Planning Board** — capacity ของแต่ละ machine/station vs demand
  4. **Machine Allocation View** — สถานะเครื่องจักรทั้งหมดแบบ real-time
  5. **Bottleneck Detector** — visual alerts สำหรับ bottlenecks พร้อมคำแนะนำ
  6. **Workload Balancer** — เปรียบเทียบ workload ระหว่าง stations/workers
  7. **Production Calendar** — ปฏิทินรวมงาน, วันหยุด, maintenance, shifts
  8. **Job Detail** — timeline ของแต่ละ job, BOM, operations, QC results



### 19.3 Workflow Diagrams

#### 19.3.1 Job Scheduling Workflow
[code] 
    ขั้นตอนที่ 1: Order confirmed → ระบบ parse BOM → สร้าง production job + operations
    ขั้นตอนที่ 2: ตรวจสอบ material availability (link inventory บทที่ 16)
      → ครบ → status: 'ready'
      → ไม่ครบ → status: 'material_pending' → แจ้ง Procurement (บทที่ 23)
    
    ขั้นตอนที่ 3: Scheduling Engine (APS)
      → คำนวณ optimal schedule based on:
        - Order priority & deadline
        - Machine availability & capacity
        - Worker availability & skills
        - Material availability dates
        - Setup times & changeover constraints
        - Dependency ระหว่าง operations
    
    ขั้นตอนที่ 4: Planner review → approve schedule หรือ manual adjust
    ขั้นตอนที่ 5: ปล่อยงาน → MES ส่ง work orders ไปยัง shop-floor
    
    ขั้นตอนที่ 6: Shop-Floor Execution
      → Worker scan เริ่มงาน → electronic tag tracking (ตาม Yang et al.)
      → ระบบ track progress real-time → update Gantt chart
    
    ขั้นตอนที่ 7: Operation completed → trigger QC checkpoint (บทที่ 15)
    ขั้นตอนที่ 8: หาก bottleneck detected → alert Planner → re-schedule affected jobs
    
    ขั้นตอนที่ 9: Job completed → handoff ไป Warehouse → Logistics → Installation
    
[/code]

#### 19.3.2 Bottleneck Detection & Resolution
[code] 
    ขั้นตอนที่ 1: ระบบ monitor real-time: machine utilization, queue lengths, cycle times
    ขั้นตอนที่ 2: เมื่อ queue ยาวเกินเกณฑ์ หรือ utilization > 95% → flag bottleneck
    ขั้นตอนที่ 3: ระบบวิเคราะห์ root cause (machine, material, worker)
    ขั้นตอนที่ 4: แนะนำ resolution:
      → Machine: redirect ไปเครื่องสำรอง / เพิ่มกะ
      → Material: expedite procurement / substitute material
      → Worker: reallocate / overtime
    ขั้นตอนที่ 5: Planner ตัดสินใจ → ระบบ re-schedule → แจ้งผู้ได้รับผลกระทบ
    
[/code]

### 19.4 TypeScript Interface Definitions
[code] 
    interface ProductionJob {
      id: string;
      jobNumber: string;
      orderId: string;
      productType: string;
      bomId: string;
      status: ProductionJobStatus;
      priority: JobPriority;
      scheduledStart: Date;
      scheduledEnd: Date;
      actualStart: Date | null;
      actualEnd: Date | null;
      quantity: number;
      completedQuantity: number;
      defectQuantity: number;
      operations: ProductionOperation[];
    }
    
    type ProductionJobStatus =
      | 'queued' | 'scheduled' | 'material_pending' | 'ready'
      | 'in_progress' | 'paused' | 'qc_pending' | 'completed'
      | 'rework' | 'cancelled';
    
    type JobPriority = 'low' | 'normal' | 'high' | 'urgent' | 'rush';
    
    interface ProductionOperation {
      id: string;
      jobId: string;
      operationType: OperationType;
      sequence: number;
      machineId: string | null;
      workerId: string | null;
      status: OperationStatus;
      estimatedDurationMinutes: number;
      actualDurationMinutes: number | null;
      scheduledStart: Date;
      scheduledEnd: Date;
      actualStart: Date | null;
      actualEnd: Date | null;
      setupTimeMinutes: number;
    }
    
    type OperationType =
      | 'cutting' | 'edge_banding' | 'drilling' | 'cnc_routing'
      | 'assembly' | 'surface_finishing' | 'packing';
    
    type OperationStatus = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'paused' | 'skipped';
    
    interface Machine {
      id: string;
      name: string;
      type: MachineType;
      capacityPerHour: number;
      status: 'available' | 'in_use' | 'maintenance' | 'breakdown' | 'retired';
      currentJobId: string | null;
      maintenanceSchedule: MaintenanceEntry[];
      location: string;
    }
    
    type MachineType =
      | 'panel_saw' | 'cnc_router' | 'edge_bander' | 'drilling_machine'
      | 'sanding_machine' | 'spray_booth' | 'press' | 'packaging_line';
    
    interface BottleneckLog {
      id: string;
      detectedAt: Date;
      bottleneckType: 'machine' | 'material' | 'worker' | 'qc' | 'upstream_delay';
      resourceId: string;
      affectedJobs: string[];
      severity: 'low' | 'medium' | 'high' | 'critical';
      estimatedDelayHours: number;
      resolution: string | null;
      resolvedAt: Date | null;
    }
    
    interface GanttData {
      jobs: GanttJob[];
      machines: GanttMachine[];
      timeRange: { start: Date; end: Date };
    }
    
    interface GanttJob {
      jobId: string;
      jobNumber: string;
      orderId: string;
      priority: JobPriority;
      operations: GanttOperation[];
    }
    
    interface GanttOperation {
      operationId: string;
      type: OperationType;
      machineId: string;
      start: Date;
      end: Date;
      status: OperationStatus;
      progress: number; // 0-100
    }
    
[/code]

### 19.5 Integration กับ Modules อื่น

Module | ทิศทาง | รายละเอียด  
---|---|---  
CRM (บทที่ 18) | Inbound | confirmed orders → production jobs  
Inventory (บทที่ 16) | Bidirectional | material availability → scheduling; material reservation/issue  
Quality Control (บทที่ 15) | Bidirectional | QC checkpoints; rework → reschedule  
HR & Team (บทที่ 20) | Inbound | worker availability, skills, shifts  
Logistics (บทที่ 17) | Outbound | completed jobs → shipping schedule  
BI Dashboard (บทที่ 21) | Outbound | production metrics, efficiency data  
Inter-Dept Communication (บทที่ 14) | Outbound | schedule changes, bottleneck alerts  
  
### 19.6 Role-Based Access Control (RBAC)

Role | สิทธิ์  
---|---  
Production Planner | สร้าง/แก้ไข schedules, จัดสรร machines, approve jobs  
Shop-Floor Supervisor | ดู schedule, อัปเดต status, report issues  
Machine Operator | ดูงานของตน, scan start/complete  
Production Manager | ดู Gantt chart, bottleneck analysis, capacity planning  
Operations Director | ดู cross-plant analytics (read-only)  
  
### 19.7 Mobile/Responsive Design Considerations

  * **Shop-floor terminals** : touch-screen UI สำหรับ scan start/complete operations
  * **Supervisor tablet** : ดู Gantt chart, bottleneck alerts, reassign workers
  * **Worker mobile** : ดูงานวันนี้, scan job tags, report issues
  * **Real-time updates** : WebSocket สำหรับ live Gantt chart updates



### 19.8 KPIs และ Metrics

KPI | คำอธิบาย | เป้าหมาย  
---|---|---  
On-Time Completion Rate | % jobs ที่เสร็จตามกำหนด | ≥ 90%  
Overall Equipment Effectiveness (OEE) | Availability × Performance × Quality | ≥ 85%  
Machine Utilization Rate | % เวลาที่เครื่องทำงานจริง | ≥ 80%  
Schedule Adherence | % ของ schedule ที่ทำได้ตามแผน | ≥ 85%  
Average Lead Time | เวลาเฉลี่ยตั้งแต่รับ order ถึงผลิตเสร็จ | ลดลง 20%  
Bottleneck Frequency | จำนวน bottleneck events ต่อสัปดาห์ | ลดลง 50%  
Setup Time Ratio | % เวลา setup ต่อ total machine time | ≤ 15%  
  
### 19.9 อ้างอิงจากงานวิจัย

บทนี้ได้รับการสนับสนุนจากงานวิจัยอย่างแข็งแกร่ง Lü et al. นำเสนอ intelligent scheduling system ที่ผสาน ERP, MES, APS และ WMS โดยระบุว่าระบบดังกล่าว "effectively overcomes limitations such as coarse-grained planning, delayed execution, and information islands" สำหรับเฟอร์นิเจอร์แผ่นแบบ custom ด้วย empirical evidence ที่แสดงว่าสามารถลดต้นทุนการผลิตได้ [1] Yang et al. อธิบาย platform ที่ ERP สร้าง production tasks และ drawings แล้วส่งต่อไปยัง MES ซึ่งมี production central control module ที่วิเคราะห์งานและควบคุมทุกขั้นตอนผ่าน flexible production line พร้อม electronic tagging สำหรับ real-time tracking [5] Liu et al. ขยายแนวคิดไปสู่ multi-center cloud platform ที่ช่วยให้หลายโรงงานแชร์ capacity กัน [4]
