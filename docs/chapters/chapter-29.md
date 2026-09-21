---
num: 29
title: "Factory, CNC, Workflow Tools"
phase: 2
phase_label: "Phase 2"
phase_num: 2
mcp_tools: 9
status: complete
dependencies: "Phase 1"
---

# บทที่ 29: Phase 2 Tools — Factory, CNC, Workflow  
  
## บทที่ 29: Phase 2 Tools — Factory, CNC, Workflow

### 29.1 ภาพรวม

Phase 2 ตาม Migration Plan ครอบคลุม 9 tools ใน 3 modules:

Module | Tools | Maps to  
---|---|---  
Factory Management | manage_factory_floor, configure_machine, monitor_factory_metrics | src/factory/ (233 items)  
CNC Operations | submit_cnc_program, monitor_cnc_status, manage_tool_library | src/cnc/ (113 items)  
Workflow Management | manage_workflow_stage, approve_stage_transition, get_workflow_status | src/workflow/ (88 items)  
  
### 29.2 Factory Management (`src/tools/factory-management.ts`)

#### 29.2.1 `manage_factory_floor`

จัดการ factory zones และ workstations:
[code] 
    // Operations
    - "create_zone": สร้าง zone ใหม่ (CNC, ASSEMBLY, PAINTING, PACKAGING, STORAGE, QC, STAGING)
    - "add_workstation": เพิ่ม workstation ใน zone
    - "list_zones": แสดง zones ทั้งหมดพร้อม capacity/load
    
[/code]

**Zone Types:** CNC | ASSEMBLY | PAINTING | PACKAGING | STORAGE | QC | STAGING

#### 29.2.2 `configure_machine`

จัดการ machine configuration:
[code] 
    // Operations
    - "register": ลงทะเบียนเครื่องจักร (type, specs, zone assignment)
    - "update_status": เปลี่ยนสถานะ (online/offline/maintenance/error/idle)
    - "get_config": ดึง configuration ปัจจุบัน
    
[/code]

**Machine Types:** CNC | LASER_CUTTING | EDGE_BANDING | ASSEMBLY | PAINTING | QUALITY_CHECK | PACKAGING

#### 29.2.3 `monitor_factory_metrics`

KPI monitoring ระดับโรงงาน:

Metric | คำอธิบาย  
---|---  
OEE (Overall Equipment Effectiveness) | % availability × performance × quality  
Throughput | จำนวนชิ้นงานต่อชั่วโมง  
Downtime | เวลาหยุดเครื่องจักร (นาที)  
Utilization | % เครื่องจักรที่ใช้งาน  
Defect Rate | % ของเสีย  
  
### 29.3 CNC Operations (`src/tools/cnc-operations.ts`)

#### 29.3.1 `submit_cnc_program`

ส่ง G-code program ไปยังเครื่อง CNC:
[code] 
    {
      machineId: string;
      jobId: string;
      fileName: string;
      format: "G-CODE" | "ISO" | "BIESSE_CIX" | "HOMAG_MPR";
      gcode: string;         // G-code content
    }
    
[/code]

**Status Lifecycle:**`queued → running → completed | error | cancelled`

#### 29.3.2 `monitor_cnc_status`

ดูสถานะเครื่อง CNC แบบ real-time:
[code] 
    {
      machineId: string;
      status: "idle" | "running" | "error" | "maintenance";
      currentProgram?: string;
      progress: number;        // 0-100%
      spindleRpm: number;
      feedRate: number;        // mm/min
      toolInUse?: string;
      temperature: number;     // °C
      alarms: string[];
    }
    
[/code]

#### 29.3.3 `manage_tool_library`

จัดการ cutting tool inventory:

**Tool Categories:** drill | mill | router | saw | edge_trim | groove

### 29.4 Workflow Management (`src/tools/workflow-management.ts`)

#### 29.4.1 `manage_workflow_stage`

สร้างและจัดการ workflow stages:
[code] 
    // Operations
    - "create": สร้าง workflow ใหม่สำหรับ job
    - "update_stage": อัปเดต stage status
    - "add_stage": เพิ่ม stage ใน workflow
    
[/code]

#### 29.4.2 `approve_stage_transition` (Approval_Tool)

อนุมัติการเปลี่ยน stage — ต้องการ **MANAGER** role ขึ้นไป:
[code] 
    {
      workflowId: string;
      stageId: string;
      decision: "approve" | "reject";
      comment?: string;
    }
    
[/code]

  * ต้องมี approvals ครบตาม `requiredApprovals` ถึงจะ transition ได้



#### 29.4.3 `get_workflow_status`

ดูสถานะ workflow พร้อม metrics:
[code] 
    {
      workflowId: string;
      status: "active" | "completed" | "paused" | "cancelled";
      progress: number;             // 0-100%
      completedStages: number;
      totalStages: number;
      estimatedCompletionDate: string;
      bottleneck?: string;           // stage ที่ช้าที่สุด
    }
    
[/code]
