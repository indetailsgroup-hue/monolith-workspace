---
num: 22
title: "ระบบ After-Sales และการรับประกัน"
phase: 0
phase_label: "Foundation"
phase_num: 0
mcp_tools: 0
status: complete
dependencies: "—"
---

# บทที่ 22: ระบบ After-Sales และการรับประกัน (After-Sales & Warranty)

## บทที่ 22: ระบบ After-Sales และการรับประกัน (After-Sales & Warranty)

### 22.1 ภาพรวมและวัตถุประสงค์

ระบบ After-Sales และการรับประกันเป็นอีก module หนึ่งที่ SLR ระบุว่าเป็น significant gap — ไม่มีงานวิจัยใดที่ให้ "dedicated analysis of installation technician management, warranty tracking, or structured after-sales service modules within an MES/ERP framework for furniture manufacturing" [7] Module นี้จึงออกแบบเพื่อจัดการ warranty tracking, maintenance scheduling, repair requests, customer feedback, defect warranty claims, service history และ SLA management

**วัตถุประสงค์หลัก:**

  * ติดตามสถานะการรับประกัน (warranty tracking) ของทุก order
  * จัดตาราง preventive maintenance และ follow-up
  * จัดการ repair requests จากลูกค้า
  * บันทึก service history สำหรับทุกการบริการ
  * จัดการ SLA ให้ตอบกลับและแก้ปัญหาตามเวลาที่กำหนด
  * วิเคราะห์ warranty claims เพื่อ feedback กลับไปปรับปรุงกระบวนการผลิต



### 22.2 สถาปัตยกรรมของ Module

#### 22.2.1 Database Schema
[code] 
    Table: warranties
      - id: UUID (PK)
      - order_id: UUID (FK → orders)
      - customer_id: UUID (FK → customers)
      - product_items: JSONB [{item_id, description, serial_number}]
      - warranty_type: ENUM ('standard', 'extended', 'premium')
      - start_date: DATE
      - end_date: DATE
      - terms: JSONB {coverage_scope, exclusions, max_claims}
      - status: ENUM ('active', 'expired', 'voided', 'transferred')
      - installation_job_id: UUID (FK → installation_jobs)
      - created_at: TIMESTAMPTZ
    
    Table: warranty_claims
      - id: UUID (PK)
      - claim_number: VARCHAR(20) UNIQUE
      - warranty_id: UUID (FK → warranties)
      - customer_id: UUID (FK → customers)
      - claim_type: ENUM ('defect', 'damage', 'malfunction', 'wear_tear',
                           'color_change', 'structural')
      - description: TEXT
      - photos: JSONB [{url, caption}]
      - status: ENUM ('submitted', 'under_review', 'approved', 'rejected',
                       'repair_scheduled', 'repair_completed', 'replacement_ordered',
                       'replacement_delivered', 'closed')
      - assessment: TEXT NULL
      - resolution_type: ENUM ('repair', 'replacement', 'refund', 'adjustment') NULL
      - assigned_to: UUID NULL (FK → employees)
      - sla_response_deadline: TIMESTAMPTZ
      - sla_resolution_deadline: TIMESTAMPTZ
      - responded_at: TIMESTAMPTZ NULL
      - resolved_at: TIMESTAMPTZ NULL
      - cost: DECIMAL NULL
      - created_at: TIMESTAMPTZ
    
    Table: service_requests
      - id: UUID (PK)
      - customer_id: UUID (FK → customers)
      - order_id: UUID NULL (FK → orders)
      - request_type: ENUM ('warranty_repair', 'paid_repair', 'maintenance',
                             'modification', 'inspection', 'consultation')
      - description: TEXT
      - urgency: ENUM ('low', 'normal', 'high', 'emergency')
      - status: ENUM ('open', 'acknowledged', 'scheduled', 'in_progress',
                       'completed', 'cancelled')
      - scheduled_date: DATE NULL
      - assigned_installer_id: UUID NULL (FK → employees)
      - service_report: TEXT NULL
      - cost_estimate: DECIMAL NULL
      - actual_cost: DECIMAL NULL
      - customer_feedback: JSONB NULL {rating, comment}
      - created_at: TIMESTAMPTZ
    
    Table: service_history
      - id: UUID (PK)
      - customer_id: UUID (FK → customers)
      - order_id: UUID (FK → orders)
      - service_type: VARCHAR(50)
      - description: TEXT
      - performed_by: UUID (FK → employees)
      - performed_at: TIMESTAMPTZ
      - photos: JSONB
      - parts_used: JSONB [{material_id, quantity}]
      - duration_hours: DECIMAL
      - cost: DECIMAL
    
    Table: maintenance_schedules
      - id: UUID (PK)
      - order_id: UUID (FK → orders)
      - customer_id: UUID (FK → customers)
      - schedule_type: ENUM ('3_month', '6_month', '1_year', 'custom')
      - items: JSONB [{check_item, interval_months, last_done, next_due}]
      - status: ENUM ('active', 'paused', 'completed')
      - created_at: TIMESTAMPTZ
    
[/code]

#### 22.2.2 API Endpoints

Method | Endpoint | Description  
---|---|---  
GET | `/api/v1/after-sales/warranties` | รายการ warranties  
GET | `/api/v1/after-sales/warranties/:id` | รายละเอียด warranty  
POST | `/api/v1/after-sales/claims` | สร้าง warranty claim  
PATCH | `/api/v1/after-sales/claims/:id` | อัปเดต claim status  
GET | `/api/v1/after-sales/claims/:id` | ดูรายละเอียด claim  
POST | `/api/v1/after-sales/service-requests` | สร้าง service request  
GET | `/api/v1/after-sales/service-requests` | รายการ service requests  
GET | `/api/v1/after-sales/history/:customerId` | service history ของลูกค้า  
GET | `/api/v1/after-sales/maintenance/upcoming` | รายการ maintenance ที่ใกล้ถึงกำหนด  
GET | `/api/v1/after-sales/analytics/claims` | วิเคราะห์ warranty claims  
POST | `/api/v1/after-sales/feedback` | บันทึก customer feedback  
  
#### 22.2.3 UI Screens

  1. **After-Sales Dashboard** — active warranties, pending claims, upcoming maintenance, SLA status
  2. **Warranty Lookup** — ค้นหา warranty ตาม order number หรือ customer
  3. **Claim Management Board** — Kanban board ของ claims ตาม status
  4. **Service Request Form** — ฟอร์มสร้าง service request (ลูกค้าใช้ผ่าน portal ได้)
  5. **Service History Timeline** — ประวัติบริการทั้งหมดของ order/customer
  6. **Maintenance Calendar** — ปฏิทินแสดง upcoming maintenance calls
  7. **Claim Analytics** — วิเคราะห์ claims ตาม type, product, root cause



### 22.3 Workflow Diagrams

#### 22.3.1 Warranty Claim Workflow
[code] 
    ขั้นตอนที่ 1: ลูกค้ารายงานปัญหา (ผ่าน portal, call center หรือ LINE)
    ขั้นตอนที่ 2: ระบบตรวจสอบ warranty status → active/expired
    ขั้นตอนที่ 3: Customer Service สร้าง claim → ตั้ง SLA timer
    ขั้นตอนที่ 4: Technical team review photos/description → ประเมิน
    ขั้นตอนที่ 5: ตัดสิน:
      → Covered under warranty → approve claim
      → Not covered → แจ้งลูกค้า → เสนอ paid repair option
    
    ขั้นตอนที่ 6: Approved claim → กำหนด resolution type:
      → Repair → สร้าง service request → assign installer (link บทที่ 13)
      → Replacement → สร้าง production job (link บทที่ 19) → จัดส่ง (link บทที่ 17)
      → Refund/Adjustment → ส่งเรื่องไป Finance
    
    ขั้นตอนที่ 7: ดำเนินการ → ลูกค้า confirm → ปิด claim
    ขั้นตอนที่ 8: Claim data → feed กลับไป QC (บทที่ 15) เพื่อ root cause analysis
    ขั้นตอนที่ 9: ส่ง feedback survey → บันทึกใน CRM (บทที่ 18)
    
[/code]

### 22.4 TypeScript Interface Definitions
[code] 
    interface Warranty {
      id: string;
      orderId: string;
      customerId: string;
      productItems: WarrantyItem[];
      warrantyType: 'standard' | 'extended' | 'premium';
      startDate: Date;
      endDate: Date;
      terms: WarrantyTerms;
      status: 'active' | 'expired' | 'voided' | 'transferred';
      installationJobId: string;
    }
    
    interface WarrantyItem {
      itemId: string;
      description: string;
      serialNumber: string;
    }
    
    interface WarrantyTerms {
      coverageScope: string[];
      exclusions: string[];
      maxClaims: number;
    }
    
    interface WarrantyClaim {
      id: string;
      claimNumber: string;
      warrantyId: string;
      customerId: string;
      claimType: ClaimType;
      description: string;
      photos: { url: string; caption: string }[];
      status: ClaimStatus;
      assessment: string | null;
      resolutionType: 'repair' | 'replacement' | 'refund' | 'adjustment' | null;
      assignedTo: string | null;
      slaResponseDeadline: Date;
      slaResolutionDeadline: Date;
      respondedAt: Date | null;
      resolvedAt: Date | null;
      cost: number | null;
      createdAt: Date;
    }
    
    type ClaimType =
      | 'defect' | 'damage' | 'malfunction' | 'wear_tear'
      | 'color_change' | 'structural';
    
    type ClaimStatus =
      | 'submitted' | 'under_review' | 'approved' | 'rejected'
      | 'repair_scheduled' | 'repair_completed' | 'replacement_ordered'
      | 'replacement_delivered' | 'closed';
    
    interface ServiceRequest {
      id: string;
      customerId: string;
      orderId: string | null;
      requestType: ServiceType;
      description: string;
      urgency: 'low' | 'normal' | 'high' | 'emergency';
      status: 'open' | 'acknowledged' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
      scheduledDate: Date | null;
      assignedInstallerId: string | null;
      serviceReport: string | null;
      costEstimate: number | null;
      actualCost: number | null;
      customerFeedback: { rating: number; comment: string } | null;
    }
    
    type ServiceType =
      | 'warranty_repair' | 'paid_repair' | 'maintenance'
      | 'modification' | 'inspection' | 'consultation';
    
    interface MaintenanceSchedule {
      id: string;
      orderId: string;
      customerId: string;
      scheduleType: '3_month' | '6_month' | '1_year' | 'custom';
      items: MaintenanceItem[];
      status: 'active' | 'paused' | 'completed';
    }
    
    interface MaintenanceItem {
      checkItem: string;
      intervalMonths: number;
      lastDone: Date | null;
      nextDue: Date;
    }
    
[/code]

### 22.5 Integration กับ Modules อื่น

Module | ทิศทาง | รายละเอียด  
---|---|---  
Installation (บทที่ 13) | Inbound | completion data → start warranty; service requests → assign installer  
Quality Control (บทที่ 15) | Outbound | claim data → root cause analysis, defect patterns  
CRM (บทที่ 18) | Bidirectional | customer profile, complaints; satisfaction data  
Production Planning (บทที่ 19) | Outbound | replacement orders → production jobs  
Logistics (บทที่ 17) | Outbound | replacement delivery scheduling  
Inventory (บทที่ 16) | Outbound | spare parts usage tracking  
BI Dashboard (บทที่ 21) | Outbound | warranty costs, claim analytics, SLA compliance  
  
### 22.6 Role-Based Access Control (RBAC)

Role | สิทธิ์  
---|---  
After-Sales Manager | จัดการ claims ทั้งหมด, approve resolutions, analytics  
Customer Service Rep | สร้าง/อัปเดต claims, service requests, communicate ลูกค้า  
Technical Assessor | review claims, ประเมิน technical issues  
Field Service Tech | ดำเนินการ service requests, ส่ง service reports  
Customer (Portal) | submit claims, ดูสถานะ, feedback  
  
### 22.7 Mobile/Responsive Design Considerations

  * **Customer claim submission** : ลูกค้าถ่ายรูปปัญหาแล้วส่งผ่าน mobile app/LINE
  * **Field service app** : ช่างดู service request, navigate, submit report
  * **SLA countdown** : แสดง remaining time สำหรับ pending claims
  * **Push notifications** : แจ้งลูกค้าทุก status change ของ claim



### 22.8 KPIs และ Metrics

KPI | คำอธิบาย | เป้าหมาย  
---|---|---  
SLA Response Rate | % claims ที่ respond ภายใน SLA | ≥ 95%  
SLA Resolution Rate | % claims ที่ resolve ภายใน SLA | ≥ 90%  
Warranty Claim Rate | % orders ที่มี warranty claim | ≤ 5%  
Average Resolution Time | เวลาเฉลี่ยในการ resolve claim | ≤ 7 วัน  
Repeat Claim Rate | % claims ที่เกิดซ้ำใน order เดียวกัน | ≤ 2%  
Customer Satisfaction (Post-Service) | คะแนนความพึงพอใจหลังบริการ | ≥ 4.5/5.0  
Warranty Cost Ratio | ต้นทุน warranty ต่อ revenue | ≤ 3%  
  
### 22.9 อ้างอิงจากงานวิจัย

SLR ระบุว่า "None of the included studies provide dedicated analysis of installation technician management, warranty tracking, or structured after-sales service modules within an MES/ERP framework for furniture manufacturing" ซึ่งเป็น significant gap เนื่องจากคุณภาพการติดตั้งและบริการหลังส่งมอบเป็น critical differentiator ในอุตสาหกรรมเฟอร์นิเจอร์โมดูลาร์ [7] การออกแบบ module นี้จึงเป็นการ pioneer ที่ขยายจากหลักการ traceability ของ Yang et al. ที่ใช้ electronic tagging ติดตามชิ้นงานตลอดกระบวนการผลิต โดยขยายต่อไปยัง post-delivery lifecycle ด้วย warranty tracking และ service history [5] Barni et al. เป็นงานวิจัยเดียวที่แตะ customer-facing dimension แต่มุ่งเน้นที่ design-to-manufacturing interface มากกว่า post-delivery [2]
