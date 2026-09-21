---
num: 23
title: "ระบบจัดซื้อจัดจ้าง (Procurement)"
phase: "Foundation"
phase_num: 0
mcp_tools: 0
status: complete
dependencies: "—"
---

# บทที่ 23: ระบบจัดซื้อจัดจ้าง (Procurement)

## บทที่ 23: ระบบจัดซื้อจัดจ้าง (Procurement)

### 23.1 ภาพรวมและวัตถุประสงค์

ระบบจัดซื้อจัดจ้างเชื่อมต่อ supply chain ภายนอกเข้ากับ operations ภายใน Vukman et al. ระบุว่า supply chain tracking เป็นหนึ่งใน industry-adapted CSFs สำหรับอุตสาหกรรมไม้ [6] Liu et al. เน้นว่า cloud platform สามารถลดต้นทุน supply chain ได้อย่างมีนัยสำคัญ [4]

**วัตถุประสงค์หลัก:**

  * จัดการ supplier database พร้อม evaluation
  * สร้างและติดตาม purchase orders (PO)
  * เปรียบเทียบราคา supplier (price comparison)
  * ติดตาม lead time ของแต่ละ supplier
  * จัดการ purchase approval workflow
  * คำนวณ material costing



### 23.2 สถาปัตยกรรมของ Module

#### 23.2.1 Database Schema
[code] 
    Table: suppliers
      - id: UUID (PK)
      - name: VARCHAR(200)
      - code: VARCHAR(20) UNIQUE
      - type: ENUM ('material', 'hardware', 'service', 'subcontractor')
      - contacts: JSONB [{name, role, phone, email}]
      - address: TEXT
      - payment_terms: ENUM ('cod', 'net_15', 'net_30', 'net_45', 'net_60')
      - tax_id: VARCHAR(20)
      - bank_details: JSONB
      - rating: DECIMAL -- 1-5, auto-calculated
      - status: ENUM ('active', 'inactive', 'blacklisted', 'pending_approval')
      - materials_supplied: UUID[] -- FK → materials
      - created_at: TIMESTAMPTZ
    
    Table: supplier_evaluations
      - id: UUID (PK)
      - supplier_id: UUID (FK → suppliers)
      - period: VARCHAR(20)
      - criteria: JSONB [{name, weight, score, max_score}]
        -- quality, delivery_timeliness, price_competitiveness,
        -- communication, flexibility, defect_rate
      - overall_score: DECIMAL
      - evaluator_id: UUID (FK → employees)
      - notes: TEXT
      - evaluated_at: TIMESTAMPTZ
    
    Table: purchase_orders
      - id: UUID (PK)
      - po_number: VARCHAR(20) UNIQUE
      - supplier_id: UUID (FK → suppliers)
      - status: ENUM ('draft', 'pending_approval', 'approved', 'sent',
                       'acknowledged', 'partially_received', 'fully_received',
                       'cancelled', 'disputed')
      - items: JSONB [{material_id, description, quantity, unit, unit_price,\
                        total, required_by}]
      - subtotal: DECIMAL
      - tax: DECIMAL
      - total: DECIMAL
      - payment_terms: VARCHAR(50)
      - expected_delivery_date: DATE
      - actual_delivery_date: DATE NULL
      - notes: TEXT
      - approval_chain: JSONB [{approver_id, status, approved_at, comments}]
      - created_by: UUID (FK → employees)
      - created_at: TIMESTAMPTZ
    
    Table: price_lists
      - id: UUID (PK)
      - supplier_id: UUID (FK → suppliers)
      - material_id: UUID (FK → materials)
      - unit_price: DECIMAL
      - min_order_quantity: DECIMAL
      - lead_time_days: INTEGER
      - valid_from: DATE
      - valid_to: DATE
      - currency: VARCHAR(3)
      - notes: TEXT
    
    Table: purchase_requisitions
      - id: UUID (PK)
      - requested_by: UUID (FK → employees)
      - department: VARCHAR(50)
      - items: JSONB [{material_id, quantity, reason, urgency}]
      - status: ENUM ('draft', 'submitted', 'approved', 'converted_to_po', 'rejected')
      - linked_po_id: UUID NULL (FK → purchase_orders)
      - created_at: TIMESTAMPTZ
    
[/code]

#### 23.2.2 API Endpoints

Method | Endpoint | Description  
---|---|---  
GET | `/api/v1/procurement/suppliers` | รายการ suppliers  
POST | `/api/v1/procurement/suppliers` | เพิ่ม supplier  
GET | `/api/v1/procurement/suppliers/:id/evaluation` | ดู supplier evaluation  
POST | `/api/v1/procurement/suppliers/:id/evaluate` | ประเมิน supplier  
POST | `/api/v1/procurement/purchase-orders` | สร้าง PO  
PATCH | `/api/v1/procurement/purchase-orders/:id` | แก้ไข PO  
POST | `/api/v1/procurement/purchase-orders/:id/approve` | approve PO  
POST | `/api/v1/procurement/purchase-orders/:id/send` | ส่ง PO ให้ supplier  
GET | `/api/v1/procurement/price-compare` | เปรียบเทียบราคา suppliers  
POST | `/api/v1/procurement/requisitions` | สร้าง purchase requisition  
GET | `/api/v1/procurement/analytics/spend` | วิเคราะห์ค่าใช้จ่าย  
GET | `/api/v1/procurement/analytics/lead-times` | วิเคราะห์ lead times  
  
#### 23.2.3 UI Screens

  1. **Procurement Dashboard** — pending POs, spend overview, supplier performance
  2. **Supplier Directory** — รายชื่อ suppliers พร้อม rating, materials, contacts
  3. **Supplier Scorecard** — evaluation criteria + historical trends per supplier
  4. **PO Builder** — สร้าง PO จาก reorder alert หรือ requisition พร้อม price comparison
  5. **Price Comparison Tool** — เปรียบเทียบราคาจาก multiple suppliers สำหรับ material เดียวกัน
  6. **PO Tracking Board** — สถานะ PO ทั้งหมดแบบ Kanban
  7. **Spend Analytics** — charts แสดง spend by category, supplier, period
  8. **Requisition Queue** — รายการ requisitions รอ review



### 23.3 Workflow Diagrams

#### 23.3.1 Purchase Order Lifecycle
[code] 
    ขั้นตอนที่ 1: Trigger
      → Auto: reorder alert จาก Inventory (บทที่ 16) → สร้าง draft PO
      → Manual: department submits purchase requisition → Procurement review
    
    ขั้นตอนที่ 2: Supplier Selection
      → ระบบแนะนำ supplier จาก price lists + evaluation scores
      → Price comparison สำหรับ multiple suppliers
      → Procurement Officer เลือก supplier
    
    ขั้นตอนที่ 3: PO Creation & Approval
      → สร้าง PO → ส่งเข้า approval chain
      → PO < 50,000 บาท → Procurement Manager approve
      → PO 50,000–500,000 → + Operations Manager
      → PO > 500,000 → + Director
    
    ขั้นตอนที่ 4: PO Sent to Supplier
      → ส่ง PO ทาง email/portal → supplier acknowledge
      → Supplier ยืนยัน delivery date
    
    ขั้นตอนที่ 5: Receiving
      → วัสดุมาถึง → Warehouse receive (link บทที่ 16)
      → Match กับ PO → partial/full receive
      → QC inspection (link บทที่ 15)
    
    ขั้นตอนที่ 6: Settlement
      → GRN + PO match → สร้าง payment record → ส่ง Finance
      → หากมี discrepancy → dispute resolution
    
    ขั้นตอนที่ 7: Supplier Evaluation Update
      → ทุก delivery → auto-update supplier score (timeliness, quality)
    
[/code]

### 23.4 TypeScript Interface Definitions
[code] 
    interface Supplier {
      id: string;
      name: string;
      code: string;
      type: 'material' | 'hardware' | 'service' | 'subcontractor';
      contacts: SupplierContact[];
      address: string;
      paymentTerms: PaymentTerms;
      taxId: string;
      rating: number;
      status: 'active' | 'inactive' | 'blacklisted' | 'pending_approval';
      materialsSupplied: string[];
    }
    
    interface SupplierContact {
      name: string;
      role: string;
      phone: string;
      email: string;
    }
    
    type PaymentTerms = 'cod' | 'net_15' | 'net_30' | 'net_45' | 'net_60';
    
    interface PurchaseOrder {
      id: string;
      poNumber: string;
      supplierId: string;
      status: PoStatus;
      items: PoItem[];
      subtotal: number;
      tax: number;
      total: number;
      paymentTerms: string;
      expectedDeliveryDate: Date;
      actualDeliveryDate: Date | null;
      notes: string;
      approvalChain: ApprovalEntry[];
      createdBy: string;
      createdAt: Date;
    }
    
    type PoStatus =
      | 'draft' | 'pending_approval' | 'approved' | 'sent'
      | 'acknowledged' | 'partially_received' | 'fully_received'
      | 'cancelled' | 'disputed';
    
    interface PoItem {
      materialId: string;
      description: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      total: number;
      requiredBy: Date;
    }
    
    interface SupplierEvaluation {
      id: string;
      supplierId: string;
      period: string;
      criteria: EvalCriterion[];
      overallScore: number;
      evaluatorId: string;
      notes: string;
      evaluatedAt: Date;
    }
    
    interface EvalCriterion {
      name: string;
      weight: number;
      score: number;
      maxScore: number;
    }
    
    interface PriceComparison {
      materialId: string;
      materialName: string;
      suppliers: SupplierPrice[];
      recommendedSupplierId: string;
    }
    
    interface SupplierPrice {
      supplierId: string;
      supplierName: string;
      unitPrice: number;
      minOrderQuantity: number;
      leadTimeDays: number;
      rating: number;
      validUntil: Date;
    }
    
[/code]

### 23.5 Integration กับ Modules อื่น

Module | ทิศทาง | รายละเอียด  
---|---|---  
Inventory (บทที่ 16) | Inbound | reorder alerts → trigger PO; receiving → stock update  
Quality Control (บทที่ 15) | Inbound | incoming QC results → supplier quality score  
Production Planning (บทที่ 19) | Inbound | material requirements → purchase requisitions  
BI Dashboard (บทที่ 21) | Outbound | spend analytics, supplier performance  
Inter-Dept Communication (บทที่ 14) | Outbound | PO approval notifications, delivery alerts  
  
### 23.6 Role-Based Access Control (RBAC)

Role | สิทธิ์  
---|---  
Procurement Officer | สร้าง PO, จัดการ suppliers, price comparison  
Procurement Manager | approve PO ≤ 500k, evaluate suppliers, analytics  
Operations Manager | approve PO > 50k, ดู procurement analytics  
Director | approve PO > 500k  
Department Requester | สร้าง purchase requisitions  
Warehouse Staff | ดู PO status สำหรับ receiving (read-only)  
  
### 23.7 Mobile/Responsive Design Considerations

  * **Approval on mobile** : approve/reject PO จาก push notification
  * **Supplier lookup** : ค้นหา supplier + contact info ได้จาก mobile
  * **Price comparison** : เปรียบเทียบราคาได้จาก tablet ณ จุด receiving
  * **Receipt scanning** : scan delivery note/invoice ด้วยกล้อง mobile



### 23.8 KPIs และ Metrics

KPI | คำอธิบาย | เป้าหมาย  
---|---|---  
Supplier On-Time Delivery | % deliveries ที่ตรงเวลา | ≥ 90%  
Purchase Cost Variance | actual cost vs budgeted cost | ≤ ±5%  
PO Approval Cycle Time | เวลาเฉลี่ยตั้งแต่สร้างถึง approve | ≤ 24 ชั่วโมง  
Supplier Defect Rate | % วัสดุจาก supplier ที่ QC fail | ≤ 2%  
Emergency Purchase Rate | % PO ที่เป็น urgent/emergency | ≤ 10%  
Average Supplier Rating | คะแนนเฉลี่ยของ active suppliers | ≥ 4.0/5.0  
  
### 23.9 อ้างอิงจากงานวิจัย

Vukman et al. ระบุว่า supply chain tracking เป็น industry-adapted CSF สำหรับอุตสาหกรรมไม้ ซึ่งครอบคลุมทั้งการจัดการ supplier และการติดตามวัสดุตลอด supply chain [6] Liu et al. นำเสนอ cloud platform ที่มุ่งลดต้นทุน supply chain โดยการ share resources ข้ามหลาย manufacturing centers ซึ่ง procurement module สามารถใช้ประโยชน์จาก centralized supplier database และ bulk purchasing ข้ามโรงงาน [4] Lü et al. แสดงให้เห็นว่า WMS ที่ผสานกับ ERP ช่วยให้ข้อมูล inventory availability เป็น input สำคัญสำหรับ automated reorder [1]
