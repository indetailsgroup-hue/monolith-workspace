---
num: 41
title: "HR Management Module"
phase: "Phase 9"
phase_num: 9
mcp_tools: 2
status: complete
dependencies: "Phase 8"
---

# Chapter 41: HR Management Module (Phase 9)

## 41.1 Overview

HR Management module จัดการข้อมูลพนักงาน (Employee Master Data), ระบบลางาน (Leave Management), และการติดตามการเข้างาน (Attendance Tracking) ครบวงจร ออกแบบตามกฎหมายแรงงานไทยโดยตรง รวม 3 MCP tools:

Tool | Description | Operations  
---|---|---  
`manage_employee` | CRUD พนักงาน — master data, department, position, leave balances | create / update / get / list  
`approve_leave_request` | Submit, approve, reject leave — ครบ 7 ประเภทลาตามกฎหมายแรงงาน | submit / approve / reject / cancel / list  
`attendance_report` | รายงานการเข้างาน — รายบุคคล, รายแผนก, หรือทั้งบริษัท | employee / department / company scope  
  
## 41.2 Data Model

### Employee
[code] 
    interface Employee {
      employeeId: string;           // Auto-generated: "EMP-XXXXXXX"
      firstName: string;
      lastName: string;
      department: Department;       // 9 departments
      position: string;
      status: EmployeeStatus;       // active | probation | suspended | resigned | terminated
      startDate: string;            // YYYY-MM-DD
      email: string;
      phone?: string;
      managerId?: string;           // Direct manager reference
      salary: number;               // Monthly salary (THB)
      leaveBalance: Record<LeaveType, number>;
    }
    
    type Department = "design" | "production" | "installation" | "quality"
      | "warehouse" | "finance" | "hr" | "sales" | "management";
    
[/code]

### Leave Request
[code] 
    interface LeaveRequest {
      requestId: string;            // Auto-generated: "LR-XXXXXXX"
      employeeId: string;
      leaveType: LeaveType;
      startDate: string;
      endDate: string;
      totalDays: number;            // Calculated: endDate - startDate + 1
      reason: string;
      status: LeaveStatus;          // pending | approved | rejected | cancelled
      approverId?: string;
      approverComments?: string;
      createdAt: string;
    }
    
    type LeaveType = "annual" | "sick" | "personal" | "maternity"
      | "paternity" | "compensatory" | "unpaid";
    
[/code]

### Attendance Record & Report
[code] 
    interface AttendanceRecord {
      date: string;
      employeeId: string;
      status: AttendanceStatus;     // present | absent | late | half_day | remote | holiday | leave
      checkIn?: string;
      checkOut?: string;
      hoursWorked: number;
      overtime: number;
      notes?: string;
    }
    
    interface AttendanceReport {
      employeeId: string;
      period: string;
      totalWorkDays: number;
      presentDays: number;
      absentDays: number;
      lateDays: number;
      leaveDays: number;
      remoteDays: number;
      totalHoursWorked: number;
      totalOvertime: number;
      attendanceRate: number;       // percentage (e.g. 95.5)
    }
    
[/code]

## 41.3 Leave Balances — Thai Labor Law Compliance

Default leave balances สำหรับพนักงานใหม่ เป็นไปตาม พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541:

Leave Type | Thai Name | Default Days | Legal Basis  
---|---|---|---  
`annual` | ลาพักร้อน | 6 | มาตรา 30: ไม่น้อยกว่า 6 วัน/ปี  
`sick` | ลาป่วย | 30 | มาตรา 32: ไม่เกิน 30 วัน/ปี (มีเงินเดือน)  
`personal` | ลากิจ | 3 | มาตรา 34: ไม่น้อยกว่า 3 วัน/ปี  
`maternity` | ลาคลอด | 98 | มาตรา 41: ไม่เกิน 98 วัน (จ่ายเงิน 45 วัน)  
`paternity` | ลาไปเลี้ยงบุตร | 15 | ระเบียบบริษัท (สิทธิเพิ่ม)  
`compensatory` | ลาชดเชย | 0 | สะสมจากทำงานล่วงเวลา  
`unpaid` | ลาไม่รับค่าจ้าง | 0 | ตามอนุมัติ  
  
## 41.4 Leave Approval Workflow
[code] 
    Employee submits leave request
            │
            ▼
      ┌─────────────┐
      │   Pending    │ ← LR created, status = "pending"
      └──────┬──────┘
             │
        Manager reviews
             │
        ┌────┴────┐
        ▼         ▼
    ┌────────┐ ┌────────┐
    │Approved│ │Rejected│  Manager sets comments
    └───┬────┘ └────────┘
        │
        ▼
     Balance deducted
     (leaveType -= totalDays)
    
[/code]

Key business rules:

  1. **Validation:** startDate ≤ endDate, totalDays คำนวณอัตโนมัติ
  2. **Balance check:** ระบบตรวจสอบ leaveBalance[type] >= totalDays ก่อน submit
  3. **Approver chain:** ส่งถึง managerId ของพนักงานโดยอัตโนมัติ
  4. **Cancellation:** พนักงานสามารถ cancel ได้เฉพาะ status "pending" เท่านั้น
  5. **Maternity/Paternity:** ไม่ต้องมี balance check (สิทธิตามกฎหมาย)



## 41.5 Attendance Report Scopes

Scope | Description | Use Case  
---|---|---  
`employee` | รายงานรายบุคคล | พนักงานดูสถิติตัวเอง  
`department` | รายงานรายแผนก | หัวหน้าแผนกดูภาพรวม  
`company` | รายงานทั้งบริษัท | HR/Management ดู KPI  
  
Period options: `daily`, `weekly`, `monthly`, `quarterly`

Report metrics:

  * **Attendance Rate** = (presentDays + remoteDays) / totalWorkDays × 100
  * **Overtime Hours** = sum of overtime across period
  * **Late Arrivals** = count of lateDays in period



## 41.6 Tool Schemas

### manage_employee
[code] 
    {
      "name": "manage_employee",
      "input_schema": {
        "action": "create | update | get | list",
        "employeeId": "string (optional — required for update/get)",
        "firstName": "string (optional)",
        "lastName": "string (optional)",
        "department": "enum[9 values] (optional)",
        "position": "string (optional)",
        "email": "string (optional)",
        "phone": "string (optional)",
        "managerId": "string (optional)",
        "salary": "number (optional)",
        "status": "active | probation | suspended | resigned | terminated (optional)"
      }
    }
    
[/code]

### approve_leave_request
[code] 
    {
      "name": "approve_leave_request",
      "input_schema": {
        "action": "submit | approve | reject | cancel | list",
        "requestId": "string (optional — for approve/reject/cancel)",
        "employeeId": "string (optional — for submit/list)",
        "leaveType": "enum[7 values] (optional — for submit)",
        "startDate": "string YYYY-MM-DD (optional — for submit)",
        "endDate": "string YYYY-MM-DD (optional — for submit)",
        "reason": "string (optional)",
        "approverId": "string (optional)",
        "comments": "string (optional)"
      }
    }
    
[/code]

### attendance_report
[code] 
    {
      "name": "attendance_report",
      "input_schema": {
        "tenantId": "string",
        "scope": "employee | department | company",
        "employeeId": "string (optional — for employee scope)",
        "department": "string (optional — for department scope)",
        "period": "daily | weekly | monthly | quarterly",
        "month": "string YYYY-MM (optional)"
      }
    }
    
[/code]

## 41.7 Integration Points

Upstream | Connection | Downstream  
---|---|---  
Organization Module (Phase 5) | Department structure → department field | Analytics Dashboard (Phase 6)  
Quality Control (Phase 2) | Attendance affects QC scheduling | Payroll (employee_self_service)  
Workflow Management (Phase 2) | Leave auto-updates resource planning | Notification (Phase 4)  
Digital Shadow (Phase 3) | Real-time headcount sync | Financial Report (Phase 8)
