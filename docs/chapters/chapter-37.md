---
num: 37
title: "Supply Chain Management & Vendor Portal Tools"
phase: 7
phase_label: "Phase 7"
phase_num: 7
mcp_tools: 3
status: complete
dependencies: "Phase 5, Phase 6"
---

# 37\. Phase 7: Supply Chain Management & Vendor Portal

## 37\. Phase 7: Supply Chain Management & Vendor Portal

Phase 7 ขยายขีดความสามารถของ Monolith Manufacturing OS ไปสู่ระบบจัดการ Supply Chain และ Vendor Portal ครบวงจร รองรับกระบวนการ procurement, logistics tracking, supplier relationship management, และ vendor collaboration ผ่าน MCP tools 6 ตัว แบ่งเป็น 2 modules:

### 37.1 Module Overview

Module | Tool Count | Scope  
---|---|---  
Supply Chain Management | 3 | Purchase Orders, Shipment Tracking, Supplier Management  
Vendor Portal | 3 | Vendor Access Control, RFQ Workflows, Performance Reporting  
  
**Phase 7 MCP Tools Catalog (6 entries):**

# | Tool Name | Module | Description  
---|---|---|---  
73 | `create_purchase_order` | Supply Chain | Create, update, cancel, and submit purchase orders  
74 | `track_shipment` | Supply Chain | Track shipments, manage carriers, add checkpoints  
75 | `manage_supplier` | Supply Chain | Register, evaluate, tier-manage, and query suppliers  
76 | `manage_vendor_access` | Vendor Portal | Manage vendor portal access, permissions, API keys  
77 | `vendor_quote_request` | Vendor Portal | RFQ workflow — create, respond, review, expire quotes  
78 | `vendor_performance_report` | Vendor Portal | Generate performance reports with metrics and trends  
  
### 37.2 Supply Chain Management Module

#### 37.2.1 Architecture
[code] 
    ┌─────────────────────────────────────────────────────────────┐
    │                  Supply Chain Management                     │
    │                                                             │
    │  ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐  │
    │  │ Purchase Orders   │  │  Shipments   │  │  Suppliers   │  │
    │  │                  │  │              │  │              │  │
    │  │ • create         │  │ • create     │  │ • register   │  │
    │  │ • update         │  │ • track      │  │ • update     │  │
    │  │ • cancel         │  │ • update     │  │ • evaluate   │  │
    │  │ • submit         │  │ • checkpoint │  │ • query      │  │
    │  │                  │  │              │  │ • deactivate │  │
    │  └──────┬───────────┘  └──────┬───────┘  └──────┬───────┘  │
    │         │                     │                  │          │
    │         └─────────────┬───────┘──────────────────┘          │
    │                       │                                     │
    │              ┌────────▼────────┐                            │
    │              │ Governance Chain │                            │
    │              │ authz → ratelimit│                            │
    │              │ → pdpa → audit   │                            │
    │              └─────────────────┘                            │
    └─────────────────────────────────────────────────────────────┘
    
[/code]

#### 37.2.2 create_purchase_order

จัดการ Purchase Orders ทั้งวงจร ตั้งแต่สร้าง draft ไปจนถึง submit ส่งให้ supplier

**Input Schema:**
[code] 
    {
      action: "create" | "update" | "cancel" | "submit";
      poId?: string;              // required for update/cancel/submit
      supplierId?: string;        // required for create
      items?: Array<{
        materialId: string;
        description: string;
        quantity: number;          // positive
        unitPrice: number;         // non-negative
        currency: string;          // default "THB"
      }>;
      expectedDelivery?: string;  // ISO date
      notes?: string;
    }
    
[/code]

**Order Status Lifecycle:**
[code] 
    draft → submitted → acknowledged → in_production → shipped → delivered
      │
      └──→ cancelled
    
[/code]

**Business Logic:**

  * `create`: คำนวณ `totalAmount` อัตโนมัติจาก quantity × unitPrice ทุก item
  * `submit`: เปลี่ยนสถานะจาก draft เป็น submitted — triggers notification workflow
  * `cancel`: ยกเลิก PO ได้เฉพาะก่อนสถานะ shipped
  * `update`: แก้ไข items และ expectedDelivery ได้ โดย recalculate totalAmount



#### 37.2.3 track_shipment

ติดตามสถานะการจัดส่งวัสดุ รองรับหลาย carrier และ checkpoint-based tracking

**Input Schema:**
[code] 
    {
      action: "create" | "track" | "update_status" | "add_checkpoint";
      shipmentId?: string;
      poId?: string;                // required for create
      carrier?: string;             // required for create
      trackingNumber?: string;
      origin?: string;
      destination?: string;
      status?: "pending" | "picked_up" | "in_transit" | "customs"
             | "out_for_delivery" | "delivered" | "returned";
      checkpoint?: {
        location: string;
        status: string;
      };
    }
    
[/code]

**Shipment Status Flow:**
[code] 
    pending → picked_up → in_transit → customs → out_for_delivery → delivered
                                                                        │
                                                              returned ◄┘
    
[/code]

**Key Features:**

  * Auto-generate tracking number format: `TRK-XXXXXXXX`
  * Checkpoint history — ทุก update จะ append location + timestamp
  * Estimated arrival — auto-set 7 days จากวันสร้าง
  * Link กลับ Purchase Order ผ่าน `poId`



#### 37.2.4 manage_supplier

ระบบจัดการ Supplier Relationship แบบครบวงจร รวม quality scoring และ auto-tier

**Input Schema:**
[code] 
    {
      action: "register" | "update" | "evaluate" | "query" | "deactivate";
      supplierId?: string;
      name?: string;
      tier?: "strategic" | "preferred" | "approved" | "provisional";
      materials?: string[];
      leadTimeDays?: number;
      qualityScore?: number;       // 0-100
      onTimeDeliveryRate?: number; // 0-100
      certifications?: string[];
      contactEmail?: string;
      queryFilter?: {
        tier?: SupplierTier;
        material?: string;
        minQualityScore?: number;
      };
    }
    
[/code]

**Supplier Tier System:**

Tier | Composite Score | Benefits  
---|---|---  
Strategic | ≥ 90 | Priority allocation, long-term contracts, co-development  
Preferred | ≥ 75 | Preferred pricing, flexible terms  
Approved | ≥ 60 | Standard terms, regular review cycles  
Provisional | < 60 | Probationary, limited volume, frequent audits  
  
**Auto-Tier Calculation:**
[code] 
    compositeScore = qualityScore × 0.6 + onTimeDeliveryRate × 0.4
    
[/code]

**Query Capabilities:**

  * Filter by tier level
  * Filter by supplied material type
  * Filter by minimum quality score
  * Returns only active suppliers



### 37.3 Vendor Portal Module

#### 37.3.1 Architecture
[code] 
    ┌─────────────────────────────────────────────────────────────────┐
    │                       Vendor Portal                             │
    │                                                                 │
    │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
    │  │  Access Control   │  │  RFQ Workflow    │  │  Performance │  │
    │  │                  │  │                  │  │   Reports    │  │
    │  │ • create account │  │ • create RFQ     │  │              │  │
    │  │ • set permissions│  │ • vendor respond │  │ • 30d/90d/   │  │
    │  │ • manage modules │  │ • review & decide│  │   180d/1y    │  │
    │  │ • rotate API key │  │ • expire quotes  │  │ • KPIs       │  │
    │  │ • enable MFA     │  │ • list/filter    │  │ • Trends     │  │
    │  └──────────────────┘  └──────────────────┘  └──────────────┘  │
    │                                                                 │
    │  Security Layer:                                                │
    │  ┌─────────────────────────────────────────────────────────┐    │
    │  │ MFA │ API Key Rotation │ Module-level ACL │ Audit Log   │    │
    │  └─────────────────────────────────────────────────────────┘    │
    └─────────────────────────────────────────────────────────────────┘
    
[/code]

#### 37.3.2 manage_vendor_access

จัดการ Portal Access สำหรับ vendor ทุกราย พร้อม granular permission control

**Input Schema:**
[code] 
    {
      action: "create" | "update" | "revoke" | "get" | "rotate_api_key";
      vendorId: string;
      accessLevel?: "view_only" | "submit_quotes" | "manage_orders" | "full_access";
      enabledModules?: string[];
      mfaEnabled?: boolean;
    }
    
[/code]

**Access Level Hierarchy:**

Level | Capabilities  
---|---  
`view_only` | Browse orders, view invoices, read-only dashboard  
`submit_quotes` | All of above + submit RFQ responses  
`manage_orders` | All of above + create/update purchase orders  
`full_access` | All of above + admin settings, API key management  
  
**Security Features:**

  * MFA toggle — สามารถบังคับ 2FA ต่อ vendor
  * API Key Rotation — หมุน API key ได้ทันที พร้อม return prefix ใหม่
  * Module-level ACL — เปิด/ปิด modules เฉพาะ (orders, invoices, quotes, reports)
  * Audit trail — ทุก action ถูก log ผ่าน governance chain



#### 37.3.3 vendor_quote_request

ระบบ RFQ (Request for Quotation) workflow ครบวงจร

**Input Schema:**
[code] 
    {
      action: "create" | "respond" | "review" | "list" | "expire";
      quoteId?: string;
      vendorId?: string;
      items?: Array<{
        materialId: string;
        description: string;
        quantity: number;
        specifications: string;
      }>;
      deadline?: string;
      quotedAmount?: number;
      quotedLeadDays?: number;
      decision?: "accept" | "reject";
      notes?: string;
    }
    
[/code]

**RFQ Lifecycle:**
[code] 
    requested → submitted → under_review → accepted
                                         → rejected
                            → expired
    
[/code]

**Workflow Steps:**

  1. **create** — Procurement สร้าง RFQ ระบุ items + specifications + deadline
  2. **respond** — Vendor ตอบกลับด้วย quotedAmount + quotedLeadDays
  3. **review** — Procurement ตัดสินใจ accept หรือ reject
  4. **expire** — RFQ ที่เลยกำหนดถูก mark เป็น expired
  5. **list** — ดูรายการ RFQ ทั้งหมด สามารถ filter ตาม vendorId



#### 37.3.4 vendor_performance_report

สร้างรายงาน Performance ของ vendor พร้อม metrics, trend analysis, และ recommendations

**Input Schema:**
[code] 
    {
      vendorId: string;
      period: "30d" | "90d" | "180d" | "1y";  // default "90d"
      includeRecommendations: boolean;          // default true
    }
    
[/code]

**Report Metrics:**

Metric | Description  
---|---  
`totalOrders` | จำนวน orders ทั้งหมดในช่วงเวลา  
`onTimeDeliveries` | จำนวน orders ที่ส่งตรงเวลา  
`lateDeliveries` | จำนวน orders ที่ส่งล่าช้า  
`qualityRejects` | จำนวน items ที่ถูก reject จาก QC  
`averageLeadDays` | เวลาเฉลี่ยจาก PO ถึง delivery  
`totalSpend` | ยอดใช้จ่ายรวม (THB)  
`costVariance` | ส่วนต่างระหว่างราคาที่ quote กับจ่ายจริง  
  
**Trend Indicators:**

Trend | Condition | Action  
---|---|---  
`improving` | On-time rate ≥ 90% | พิจารณาเลื่อน tier + เพิ่ม volume  
`stable` | On-time rate 75–89% | รักษาระดับ engagement ปัจจุบัน  
`declining` | On-time rate < 75% | เริ่ม supplier development program  
  
**Auto-Generated Recommendations:**

  * Late deliveries สูง → Negotiate lead time improvement / consider backup supplier
  * Quality rejects > 2% → Schedule quality audit
  * Declining trend → Initiate supplier development program
  * Improving trend → Consider tier promotion



### 37.4 Data Model

#### 37.4.1 Entity Relationship
[code] 
    ┌────────────────┐     1:N     ┌────────────────┐     1:N     ┌──────────────┐
    │   Supplier     │────────────▸│ Purchase Order  │────────────▸│   Shipment   │
    │                │             │                │             │              │
    │ supplierId     │             │ poId           │             │ shipmentId   │
    │ name           │             │ supplierId     │             │ poId         │
    │ tier           │             │ items[]        │             │ carrier      │
    │ qualityScore   │             │ totalAmount    │             │ trackingNo   │
    │ onTimeRate     │             │ status         │             │ checkpoints[]│
    │ materials[]    │             │ expectedDeliv  │             │ status       │
    └────────────────┘             └────────────────┘             └──────────────┘
            │
            │ 1:N
            ▼
    ┌────────────────┐
    │ Vendor Access  │
    │                │             ┌────────────────┐
    │ vendorId       │             │ Quote Request  │
    │ accessLevel    │◂────────────│                │
    │ modules[]      │     1:N     │ quoteId        │
    │ mfaEnabled     │             │ vendorId       │
    │ apiKeyHash     │             │ items[]        │
    └────────────────┘             │ status         │
                                   │ quotedAmount   │
                                   └────────────────┘
    
[/code]

#### 37.4.2 TypeScript Type Definitions
[code] 
    // Order Status Lifecycle
    type OrderStatus =
      | "draft" | "submitted" | "acknowledged"
      | "in_production" | "shipped" | "delivered" | "cancelled";
    
    // Shipment Status
    type ShipmentStatus =
      | "pending" | "picked_up" | "in_transit" | "customs"
      | "out_for_delivery" | "delivered" | "returned";
    
    // Supplier Tier
    type SupplierTier = "strategic" | "preferred" | "approved" | "provisional";
    
    // Access Level
    type AccessLevel = "view_only" | "submit_quotes" | "manage_orders" | "full_access";
    
    // Quote Status
    type QuoteStatus = "requested" | "submitted" | "under_review"
                     | "accepted" | "rejected" | "expired";
    
[/code]

### 37.5 Integration Points

#### 37.5.1 Cross-Module Dependencies

Source Module | Target Module | Integration  
---|---|---  
Supply Chain → Inventory | Auto-update stock on delivery | `track_material_movement`  
Supply Chain → Production | PO triggers production planning | `create_production_plan`  
Vendor Portal → Notification | RFQ status change alerts | `send_notification`  
Vendor Portal → Analytics | Performance data feeds dashboard | `get_dashboard_data`  
Supplier → Digital Shadow | Compare quoted vs actual specs | `compare_shadow_physical`  
Shipment → Real-time Monitor | Live tracking on dashboard | `get_live_metrics`  
  
#### 37.5.2 Governance Chain Integration

ทุก Phase 7 tool ผ่าน governance chain เต็มรูปแบบ:
[code] 
    // Governance middleware applied to all Phase 7 tools
    const governanceChain = [\
      authzMiddleware,      // Role-based access control\
      rateLimitMiddleware,  // Per-tenant rate limiting\
      pdpaMiddleware,       // PDPA compliance (supplier PII)\
      auditMiddleware,      // Full audit trail\
    ];
    
[/code]

**PDPA Considerations:**

  * Supplier contact email — classified as personal data, redacted in audit logs
  * Vendor login history — retention period 90 days per PDPA compliance
  * Performance reports — aggregate data only, no individual employee identification



### 37.6 Test Coverage

Phase 7 tools มี unit tests ครอบคลุม 23 test cases:

Test File | Tests | Coverage  
---|---|---  
`supply-chain.test.ts` | 10 | PO lifecycle, shipment CRUD, supplier CRUD + auto-tier  
`vendor-portal.test.ts` | 13 | Access control, RFQ workflow, performance report, edge cases  
  
**Test Results:**
[code] 
    ✓ supply-chain.test.ts (10 tests)
    ✓ vendor-portal.test.ts (13 tests)
    Total: 23 passed, 0 failed
    
[/code]

### 37.7 Future Enhancements

  1. **Multi-Currency Support** — Real-time exchange rate conversion for international suppliers
  2. **Automated PO Generation** — AI-triggered purchase orders based on inventory reorder points
  3. **Supplier Onboarding Workflow** — Multi-step onboarding with document verification
  4. **Shipment Analytics Dashboard** — Carrier performance comparison, route optimization
  5. **Vendor Self-Service Portal UI** — React frontend for vendor-side interactions
  6. **Blockchain-Based PO Verification** — Immutable purchase order audit trail
  7. **EDI Integration** — Electronic Data Interchange for automated PO/invoice exchange


