---
num: 18
title: "ระบบจัดการลูกค้า (CRM)"
phase: "Foundation"
phase_num: 0
mcp_tools: 0
status: complete
dependencies: "—"
---

# บทที่ 18: ระบบจัดการลูกค้า (CRM)

## บทที่ 18: ระบบจัดการลูกค้า (CRM)

### 18.1 ภาพรวมและวัตถุประสงค์

ระบบ CRM สำหรับ Monolith Manufacturing OS ออกแบบเฉพาะสำหรับอุตสาหกรรมเฟอร์นิเจอร์โมดูลาร์ ที่กระบวนการขายมีลักษณะเป็น project-based (ไม่ใช่ transactional ทั่วไป) — ตั้งแต่การให้คำปรึกษา, ทำ quotation, ออกแบบร่วมกับลูกค้า, สั่งผลิต, ส่งมอบ, ติดตั้ง จนถึง after-sales Barni et al. แสดงให้เห็นถึง customer-facing dimension ที่ผสานประสบการณ์การซื้อ (buying experience) เข้ากับ distributed manufacturing โดยตรง [2]

**วัตถุประสงค์หลัก:**

  * จัดการ quotation lifecycle ตั้งแต่ request → revision → approval → order
  * ติดตาม order lifecycle ตลอดสาย
  * เก็บ customer profile และ communication history
  * จัดการ satisfaction survey และ complaint handling
  * สร้าง project portfolio สำหรับแต่ละลูกค้า



### 18.2 สถาปัตยกรรมของ Module

#### 18.2.1 Database Schema
[code] 
    Table: customers
      - id: UUID (PK)
      - customer_type: ENUM ('individual', 'corporate', 'developer', 'designer')
      - name: VARCHAR(200)
      - company_name: VARCHAR(200) NULL
      - tax_id: VARCHAR(20) NULL
      - contacts: JSONB [{type, value, is_primary}] -- phone, email, LINE
      - addresses: JSONB [{label, address, lat, lng, is_default}]
      - source: ENUM ('walk_in', 'referral', 'website', 'social_media', 'exhibition')
      - assigned_sales_id: UUID (FK → employees)
      - tags: VARCHAR[]
      - lifetime_value: DECIMAL DEFAULT 0
      - created_at: TIMESTAMPTZ
    
    Table: quotations
      - id: UUID (PK)
      - quotation_number: VARCHAR(20) UNIQUE
      - customer_id: UUID (FK → customers)
      - version: INTEGER DEFAULT 1
      - status: ENUM ('draft', 'sent', 'revision_requested', 'revised',
                       'approved', 'rejected', 'expired', 'converted')
      - items: JSONB [{product_type, description, specifications, quantity,\
                        unit_price, discount, total}]
      - subtotal: DECIMAL
      - discount_total: DECIMAL
      - tax: DECIMAL
      - grand_total: DECIMAL
      - valid_until: DATE
      - notes: TEXT
      - attachments: JSONB [{url, filename}] -- drawings, 3D renders
      - created_by: UUID (FK → employees)
      - approved_by: UUID NULL (FK → employees)
      - created_at: TIMESTAMPTZ
      - sent_at: TIMESTAMPTZ NULL
    
    Table: orders
      - id: UUID (PK)
      - order_number: VARCHAR(20) UNIQUE
      - quotation_id: UUID (FK → quotations)
      - customer_id: UUID (FK → customers)
      - status: ENUM ('confirmed', 'design_phase', 'production', 'qc',
                       'ready_to_ship', 'in_transit', 'delivered', 'installing',
                       'completed', 'warranty_active', 'closed', 'cancelled')
      - payment_status: ENUM ('pending_deposit', 'deposit_paid', 'partial_paid',
                               'fully_paid', 'refunded')
      - deposit_amount: DECIMAL
      - total_amount: DECIMAL
      - expected_delivery_date: DATE
      - actual_delivery_date: DATE NULL
      - installation_date: DATE NULL
      - completion_date: DATE NULL
      - created_at: TIMESTAMPTZ
    
    Table: communication_logs
      - id: UUID (PK)
      - customer_id: UUID (FK → customers)
      - order_id: UUID NULL (FK → orders)
      - channel: ENUM ('phone', 'email', 'line', 'in_person', 'sms', 'portal')
      - direction: ENUM ('inbound', 'outbound')
      - subject: VARCHAR(200)
      - content: TEXT
      - attachments: JSONB
      - logged_by: UUID (FK → employees)
      - created_at: TIMESTAMPTZ
    
    Table: satisfaction_surveys
      - id: UUID (PK)
      - order_id: UUID (FK → orders)
      - customer_id: UUID (FK → customers)
      - survey_type: ENUM ('post_delivery', 'post_installation', 'periodic', 'nps')
      - responses: JSONB [{question_id, question, rating, comment}]
      - overall_score: DECIMAL
      - nps_score: INTEGER NULL -- -100 to 100
      - submitted_at: TIMESTAMPTZ NULL
      - sent_at: TIMESTAMPTZ
    
    Table: complaints
      - id: UUID (PK)
      - customer_id: UUID (FK → customers)
      - order_id: UUID NULL (FK → orders)
      - category: ENUM ('product_quality', 'delivery', 'installation',
                         'communication', 'pricing', 'design', 'other')
      - severity: ENUM ('low', 'medium', 'high', 'critical')
      - description: TEXT
      - attachments: JSONB
      - status: ENUM ('open', 'acknowledged', 'investigating', 'resolved',
                       'closed', 'reopened')
      - resolution: TEXT NULL
      - assigned_to: UUID (FK → employees)
      - sla_deadline: TIMESTAMPTZ
      - resolved_at: TIMESTAMPTZ NULL
      - created_at: TIMESTAMPTZ
    
[/code]

#### 18.2.2 API Endpoints

Method | Endpoint | Description  
---|---|---  
GET | `/api/v1/crm/customers` | รายการลูกค้า  
POST | `/api/v1/crm/customers` | สร้างลูกค้าใหม่  
GET | `/api/v1/crm/customers/:id/portfolio` | project portfolio ของลูกค้า  
POST | `/api/v1/crm/quotations` | สร้าง quotation  
PATCH | `/api/v1/crm/quotations/:id` | แก้ไข quotation  
POST | `/api/v1/crm/quotations/:id/send` | ส่ง quotation ให้ลูกค้า  
POST | `/api/v1/crm/quotations/:id/convert` | แปลง quotation เป็น order  
GET | `/api/v1/crm/orders/:id/timeline` | timeline ของ order  
POST | `/api/v1/crm/communications` | บันทึกการสื่อสาร  
POST | `/api/v1/crm/surveys/send` | ส่ง satisfaction survey  
POST | `/api/v1/crm/complaints` | สร้าง complaint  
PATCH | `/api/v1/crm/complaints/:id/resolve` | resolve complaint  
GET | `/api/v1/crm/analytics/sales-pipeline` | วิเคราะห์ sales pipeline  
  
#### 18.2.3 UI Screens

  1. **CRM Dashboard** — sales pipeline, revenue forecast, customer counts, top accounts
  2. **Customer 360 View** — ข้อมูลลูกค้าครบ: profile, orders, communications, complaints, portfolio
  3. **Quotation Builder** — สร้าง/แก้ไข quotation พร้อม product catalog, auto-calculate pricing
  4. **Order Tracker** — visual timeline ของ order ตั้งแต่ confirmed ถึง warranty
  5. **Communication Hub** — ประวัติการสื่อสารทั้งหมดกับลูกค้า ข้าม channels
  6. **Survey Manager** — สร้าง/ส่ง/ดูผล satisfaction surveys
  7. **Complaint Board** — Kanban board ของ complaints ตาม status
  8. **Customer Portal** — portal สำหรับลูกค้า: ดูสถานะ order, tracking, invoices



### 18.3 Workflow Diagrams

#### 18.3.1 Quotation-to-Order Lifecycle
[code] 
    ขั้นตอนที่ 1: ลูกค้าติดต่อ (walk-in/online) → Sales สร้าง customer profile
    ขั้นตอนที่ 2: ให้คำปรึกษา → วัดหน้างาน → สร้าง draft quotation
    ขั้นตอนที่ 3: ทีมออกแบบสร้าง preliminary design → แนบใน quotation
    ขั้นตอนที่ 4: ส่ง quotation ให้ลูกค้า (email/LINE/portal)
    ขั้นตอนที่ 5: ลูกค้า review → ขอแก้ไข (revision) → สร้าง version ใหม่ (วน loop)
    ขั้นตอนที่ 6: ลูกค้าอนุมัติ → Sales กำหนด payment terms
    ขั้นตอนที่ 7: ลูกค้าจ่าย deposit → ระบบแปลง quotation → order (status: confirmed)
    ขั้นตอนที่ 8: Order เข้าสู่ design phase → handoff ไปทีมออกแบบ (บทที่ 14)
    ขั้นตอนที่ 9: ตลอด lifecycle → ลูกค้าดูสถานะผ่าน portal
    ขั้นตอนที่ 10: หลังติดตั้งเสร็จ → ส่ง satisfaction survey อัตโนมัติ
    
[/code]

### 18.4 TypeScript Interface Definitions
[code] 
    interface Customer {
      id: string;
      customerType: 'individual' | 'corporate' | 'developer' | 'designer';
      name: string;
      companyName: string | null;
      taxId: string | null;
      contacts: ContactInfo[];
      addresses: CustomerAddress[];
      source: CustomerSource;
      assignedSalesId: string;
      tags: string[];
      lifetimeValue: number;
      createdAt: Date;
    }
    
    interface ContactInfo {
      type: 'phone' | 'email' | 'line' | 'whatsapp';
      value: string;
      isPrimary: boolean;
    }
    
    interface CustomerAddress {
      label: string;
      address: string;
      lat: number;
      lng: number;
      isDefault: boolean;
    }
    
    type CustomerSource = 'walk_in' | 'referral' | 'website' | 'social_media' | 'exhibition';
    
    interface Quotation {
      id: string;
      quotationNumber: string;
      customerId: string;
      version: number;
      status: QuotationStatus;
      items: QuotationItem[];
      subtotal: number;
      discountTotal: number;
      tax: number;
      grandTotal: number;
      validUntil: Date;
      notes: string;
      attachments: Attachment[];
      createdBy: string;
      approvedBy: string | null;
      createdAt: Date;
      sentAt: Date | null;
    }
    
    type QuotationStatus =
      | 'draft' | 'sent' | 'revision_requested' | 'revised'
      | 'approved' | 'rejected' | 'expired' | 'converted';
    
    interface QuotationItem {
      productType: string;
      description: string;
      specifications: Record<string, unknown>;
      quantity: number;
      unitPrice: number;
      discount: number;
      total: number;
    }
    
    interface Order {
      id: string;
      orderNumber: string;
      quotationId: string;
      customerId: string;
      status: OrderStatus;
      paymentStatus: PaymentStatus;
      depositAmount: number;
      totalAmount: number;
      expectedDeliveryDate: Date;
      actualDeliveryDate: Date | null;
      installationDate: Date | null;
      completionDate: Date | null;
    }
    
    type OrderStatus =
      | 'confirmed' | 'design_phase' | 'production' | 'qc'
      | 'ready_to_ship' | 'in_transit' | 'delivered' | 'installing'
      | 'completed' | 'warranty_active' | 'closed' | 'cancelled';
    
    type PaymentStatus =
      | 'pending_deposit' | 'deposit_paid' | 'partial_paid'
      | 'fully_paid' | 'refunded';
    
    interface Complaint {
      id: string;
      customerId: string;
      orderId: string | null;
      category: ComplaintCategory;
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      attachments: Attachment[];
      status: ComplaintStatus;
      resolution: string | null;
      assignedTo: string;
      slaDeadline: Date;
      resolvedAt: Date | null;
      createdAt: Date;
    }
    
    type ComplaintCategory =
      | 'product_quality' | 'delivery' | 'installation'
      | 'communication' | 'pricing' | 'design' | 'other';
    
    type ComplaintStatus =
      | 'open' | 'acknowledged' | 'investigating'
      | 'resolved' | 'closed' | 'reopened';
    
[/code]

### 18.5 Integration กับ Modules อื่น

Module | ทิศทาง | รายละเอียด  
---|---|---  
Production Planning (บทที่ 19) | Outbound | confirmed order → production jobs  
Installation (บทที่ 13) | Bidirectional | customer address, installation status  
Logistics (บทที่ 17) | Inbound | delivery tracking info → customer portal  
After-Sales (บทที่ 22) | Bidirectional | complaints, warranty claims  
BI Dashboard (บทที่ 21) | Outbound | sales data, customer analytics  
Inter-Dept Communication (บทที่ 14) | Outbound | order status updates cross-department  
  
### 18.6 Role-Based Access Control (RBAC)

Role | สิทธิ์  
---|---  
Sales Representative | สร้าง/จัดการ quotations, orders, customer profiles  
Sales Manager | approve quotations ที่เกินวงเงิน, ดู pipeline analytics  
Customer Service | จัดการ complaints, communications, surveys  
Customer (Portal) | ดูสถานะ, อนุมัติ quotation, ส่ง complaint  
Finance | ดู payment status, invoices (read-only)  
  
### 18.7 Mobile/Responsive Design Considerations

  * **Sales mobile app** : สร้าง quotation หน้างาน, ถ่ายรูปพื้นที่, บันทึกขนาด
  * **Customer portal** : responsive web สำหรับ desktop + mobile
  * **Push notifications** : แจ้งลูกค้าทุกการเปลี่ยนสถานะ order
  * **LINE Official Account integration** : ส่ง quotation, tracking links ผ่าน LINE



### 18.8 KPIs และ Metrics

KPI | คำอธิบาย | เป้าหมาย  
---|---|---  
Quotation Conversion Rate | % quotation ที่แปลงเป็น order | ≥ 40%  
Average Quote Response Time | เวลาเฉลี่ยตั้งแต่ request ถึงส่ง quote | ≤ 48 ชั่วโมง  
Customer Satisfaction (CSAT) | คะแนนเฉลี่ย | ≥ 4.5/5.0  
Net Promoter Score (NPS) | คะแนน NPS | ≥ 50  
Complaint Resolution Time | เวลาเฉลี่ยในการ resolve complaints | ≤ 72 ชั่วโมง  
Customer Retention Rate | % ลูกค้ากลับมาซื้อซ้ำ | ≥ 30%  
Lifetime Value (LTV) | มูลค่าเฉลี่ยตลอดชีวิตของลูกค้า | เพิ่มขึ้น YoY  
  
### 18.9 อ้างอิงจากงานวิจัย

Barni et al. เป็นงานวิจัยที่ address customer-facing dimension มากที่สุดในกลุ่มที่ SLR คัดเลือก โดยออกแบบระบบที่ผสานประสบการณ์การซื้อของลูกค้า (buying experience) เข้ากับ distributed manufacturing ซึ่งทดสอบในสภาพแวดล้อมจริง (shopping mall) ที่ลูกค้าสามารถออกแบบและสั่งผลิตได้ในขั้นตอนเดียว [2] อย่างไรก็ตาม SLR พบว่างานวิจัยทั้งหมดมุ่งเน้นที่กระบวนการ design-to-manufacturing เป็นหลัก โดยไม่มีการศึกษา CRM, quotation management หรือ complaint handling ภายใน MES/ERP framework อย่างเป็นระบบ [7]
