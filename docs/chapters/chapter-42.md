---
num: 42
title: "Employee Self-Service Module"
phase: "Phase 9"
phase_num: 9
mcp_tools: 2
status: complete
dependencies: "Phase 8"
---

# Chapter 42: Employee Self-Service Module (Phase 9)  
  
## 42.1 Overview

Employee Self-Service module เปิดให้พนักงานเข้าถึงข้อมูลตัวเองผ่าน MCP tools โดยตรง — ส่ง timesheet, ดู payslip, และ personal dashboard ครบวงจร ไม่ต้องผ่าน HR ทุกเรื่อง ลด administrative workload ได้ 40-60%

Tool | Description | Operations  
---|---|---  
`submit_timesheet` | สร้าง/ส่ง timesheet — regular hours, overtime, project allocation | create / submit / get / list  
`request_payslip` | ดึง/สร้าง payslip — salary breakdown, deductions, net pay | get / list / generate  
`employee_dashboard` | Dashboard ส่วนตัว — leave balance, attendance, pending items | single view  
  
## 42.2 Data Model

### Timesheet
[code] 
    interface Timesheet {
      timesheetId: string;          // Auto-generated: "TS-XXXXXXX"
      employeeId: string;
      periodStart: string;          // YYYY-MM-DD
      periodEnd: string;
      entries: TimesheetEntry[];
      totalRegularHours: number;    // Sum of all regularHours
      totalOvertimeHours: number;   // Sum of all overtimeHours
      status: TimesheetStatus;      // draft | submitted | approved | rejected | revised
      submittedAt?: string;
    }
    
    interface TimesheetEntry {
      date: string;                 // YYYY-MM-DD
      projectId?: string;           // Optional project reference
      taskDescription: string;
      regularHours: number;         // 0-8 typical
      overtimeHours: number;        // 0+ hours beyond regular
    }
    
[/code]

### Payslip
[code] 
    interface Payslip {
      payslipId: string;            // "PS-{employeeId}-{period}"
      employeeId: string;
      period: string;               // "YYYY-MM"
      baseSalary: number;
      earnings: PayslipLine[];
      deductions: PayslipLine[];
      grossPay: number;
      totalDeductions: number;
      netPay: number;
      issuedAt: string;
    }
    
    interface PayslipLine {
      component: PayrollComponent;
      label: string;
      amount: number;
      isDeduction: boolean;
    }
    
    type PayrollComponent = "base_salary" | "overtime" | "allowance" | "bonus"
      | "social_security" | "provident_fund" | "withholding_tax" | "other_deduction";
    
[/code]

## 42.3 Payroll Breakdown

ตัวอย่าง payslip สำหรับพนักงานตำแหน่ง CNC Operator (เงินเดือน 35,000 บาท, OT 10 ชั่วโมง):

### Earnings

Component | Label | Calculation | Amount (THB)  
---|---|---|---  
`base_salary` | Base Salary | Fixed monthly | 35,000  
`overtime` | Overtime (10 hrs) | 10 × 1.5 × (35,000 ÷ 30 ÷ 8) | 3,750  
`allowance` | Position Allowance | Fixed | 2,000  
**Gross Pay** |  |  | **40,750**  
  
### Deductions

Component | Label | Calculation | Amount (THB)  
---|---|---|---  
`social_security` | Social Security (5%) | 5% of 15,000 cap = 750 | 750  
`provident_fund` | Provident Fund (5%) | 5% × 35,000 | 1,750  
`withholding_tax` | Withholding Tax | Simplified progressive | 1,500  
**Total Deductions** |  |  | **4,000**  
  
### Summary

Item | Amount (THB)  
---|---  
Gross Pay | 40,750  
Total Deductions | 4,000  
**Net Pay** | **36,750**  
  
### Social Security Calculation (ประกันสังคม)

ตาม พ.ร.บ.ประกันสังคม มาตรา 33:

  * อัตราสมทบ: 5% ของฐานเงินเดือน
  * เพดานค่าจ้างขั้นสูง: 15,000 บาท
  * สมทบสูงสุด: 750 บาท/เดือน (15,000 × 5%)
  * นายจ้างสมทบเท่ากัน: 750 บาท/เดือน



## 42.4 Timesheet Workflow
[code] 
    Employee creates timesheet (status: "draft")
            │
            ▼
      ┌─────────────┐
      │    Draft     │ ← Edit entries, add hours
      └──────┬──────┘
             │
       Employee submits
             │
             ▼
      ┌─────────────┐
      │  Submitted   │ ← Locked for editing
      └──────┬──────┘
             │
        Manager reviews
             │
        ┌────┴────┐
        ▼         ▼
    ┌────────┐ ┌────────┐
    │Approved│ │Rejected│
    └───┬────┘ └───┬────┘
        │          │
        ▼          ▼
     Payroll    Revised
     input     (edit & resubmit)
    
[/code]

Key rules:

  1. **Draft → Submit:** ต้องมี entries[] ไม่น้อยกว่า 1 รายการ
  2. **Submit lock:** เมื่อ submit แล้วไม่สามารถแก้ไข entries ได้
  3. **Reject → Revised:** manager reject แล้วพนักงานสามารถ revise และ submit ใหม่
  4. **Overtime calculation:** OT rate = 1.5× ปกติ (วันธรรมดา), 2× (วันหยุด) ตามกฎหมายแรงงาน
  5. **Period validation:** periodStart ≤ periodEnd, ไม่เกิน 15 วัน per timesheet



## 42.5 Employee Dashboard

Dashboard แสดงข้อมูลสำคัญของพนักงาน ณ เวลาปัจจุบัน:
[code] 
    interface EmployeeDashboardData {
      employeeId: string;
      name: string;
      department: string;
      leaveBalance: {
        annual: number;             // Remaining annual leave
        sick: number;
        personal: number;
        maternity: number;
        paternity: number;
        compensatory: number;
      };
      currentMonthAttendance: {
        presentDays: number;        // Days present (including remote)
        totalWorkDays: number;      // Working days in month
        lateDays: number;           // Late arrivals
        remoteDays: number;         // Work from home days
      };
      pendingLeaveRequests: number; // Awaiting approval
      pendingTimesheets: number;    // Draft timesheets not submitted
      lastPayslipPeriod: string;    // Latest payslip period "YYYY-MM"
      announcements: string[];      // Company-wide announcements
    }
    
[/code]

Dashboard widgets:

  1. **Leave Balance Card** — แสดงวันลาคงเหลือแต่ละประเภท พร้อม progress bar
  2. **Attendance Summary** — Present rate เดือนปัจจุบัน + late warning
  3. **Pending Actions** — จำนวน leave requests / timesheets ที่ต้องดำเนินการ
  4. **Last Payslip** — Quick link ไปดู payslip ล่าสุด
  5. **Announcements** — ประกาศจากบริษัท (เรียงตามวันที่ล่าสุด)



## 42.6 Tool Schemas

### submit_timesheet
[code] 
    {
      "name": "submit_timesheet",
      "input_schema": {
        "action": "create | submit | get | list",
        "timesheetId": "string (optional — for submit/get)",
        "employeeId": "string (optional)",
        "periodStart": "string YYYY-MM-DD (optional — for create)",
        "periodEnd": "string YYYY-MM-DD (optional — for create)",
        "entries": [\
          {\
            "date": "YYYY-MM-DD",\
            "projectId": "string (optional)",\
            "taskDescription": "string",\
            "regularHours": "number",\
            "overtimeHours": "number"\
          }\
        ]
      }
    }
    
[/code]

### request_payslip
[code] 
    {
      "name": "request_payslip",
      "input_schema": {
        "action": "get | list | generate",
        "employeeId": "string",
        "period": "string YYYY-MM (optional — for get/generate)",
        "year": "number (optional — for list)"
      }
    }
    
[/code]

### employee_dashboard
[code] 
    {
      "name": "employee_dashboard",
      "input_schema": {
        "employeeId": "string"
      }
    }
    
[/code]

## 42.7 Security & Access Control

Role | manage_employee | approve_leave | attendance_report | submit_timesheet | request_payslip | employee_dashboard  
---|---|---|---|---|---|---  
Employee | self-get | submit/cancel own | self only | own timesheets | own payslips | own dashboard  
Manager | team-list | approve/reject team | department scope | approve team | — | —  
HR Admin | full CRUD | all operations | company scope | all timesheets | generate any | —  
CEO/Owner | read-only | — | company scope | — | — | —  
  
## 42.8 Integration Points

Module | Connection  
---|---  
HR Management (Ch. 41) | Employee records → manage_employee feeds into payroll  
Financial Management (Ch. 39) | Payroll feeds into financial_report as expense  
Notification (Ch. 30) | Leave approval triggers notification to employee  
Analytics Dashboard (Ch. 35) | Attendance data feeds into workforce KPI  
Workflow Management (Ch. 29) | Timesheet approval integrated into workflow engine  
Organization Module (Ch. 33) | Department hierarchy determines approval chain  
  
## 42.9 Persona Mapping — Phase 9

Persona | Primary Tools | Use Case  
---|---|---  
สมชาย ดีไซน์เนอร์ | submit_timesheet, employee_dashboard | บันทึกเวลาทำงาน project design, ดู leave balance  
สมหญิง ผู้จัดการ | approve_leave_request, attendance_report | อนุมัติลา, ดูรายงานเข้างานแผนก production  
สมศักดิ์ ผู้ประกอบการ | attendance_report (company), manage_employee | ดูภาพรวมกำลังคน, จัดการพนักงาน  
สมปอง ช่างฝีมือ | submit_timesheet, request_payslip | ส่ง timesheet OT, ดู payslip ประจำเดือน  
สมบูรณ์ ช่างติดตั้ง | submit_timesheet, employee_dashboard | บันทึกเวลาหน้างาน, ดูสิทธิ์ลาคงเหลือ
