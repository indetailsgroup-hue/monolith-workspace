---
num: 39
title: "Financial Management & Invoicing"
phase: "Phase 8"
phase_num: 8
mcp_tools: 3
status: complete
dependencies: "Phase 6, Phase 7"
---

# บทที่ 39: Financial Management & Invoicing (Phase 8)  
  
## 39.1 ภาพรวม

Phase 8 เพิ่มระบบการเงินและการออกใบแจ้งหนี้ครบวงจร ตั้งแต่การสร้างใบเสนอราคา (Quotation) ไปจนถึงการออกใบเสร็จรับเงิน (Receipt) โดยรองรับภาษีมูลค่าเพิ่ม (VAT), ภาษีหัก ณ ที่จ่าย (Withholding Tax), partial payments, และหลากหลาย payment terms

### เป้าหมาย

  * ลดเวลาจัดทำใบเสนอราคาจาก 2 ชั่วโมง เหลือ 5 นาที
  * ตัดข้อผิดพลาดในการคำนวณภาษีให้เป็น 0%
  * รองรับ multi-currency (THB, USD, EUR, JPY, CNY, SGD)
  * สร้าง audit trail ครบถ้วนสำหรับทุกธุรกรรม



## 39.2 MCP Tools — Financial Management

### 39.2.1 `create_quotation`

สร้างใบเสนอราคาใหม่พร้อมรายการสินค้า/บริการ

**Parameters:**

Parameter | Type | Required | Description  
---|---|---|---  
`customerId` | string | ✅ | รหัสลูกค้า  
`customerName` | string | ✅ | ชื่อลูกค้า/บริษัท  
`projectName` | string | ✅ | ชื่อโปรเจกต์  
`lineItems` | LineItem[] | ✅ | รายการสินค้า/บริการ  
`currency` | Currency | ❌ | สกุลเงิน (default: THB)  
`paymentTerms` | PaymentTerms | ❌ | เงื่อนไขชำระเงิน (default: net_30)  
`validDays` | number | ❌ | จำนวนวันที่ใบเสนอราคามีผล (default: 30)  
`notes` | string | ❌ | หมายเหตุ  
`discount` | number | ❌ | ส่วนลดรวม (%)  
  
**LineItem Structure:**
[code] 
    interface QuotationLineItem {
      description: string;   // รายละเอียดสินค้า/บริการ
      quantity: number;       // จำนวน
      unitPrice: number;      // ราคาต่อหน่วย
      unit: string;           // หน่วยนับ (ชิ้น, ชุด, เมตร, etc.)
      discount?: number;      // ส่วนลดรายการ (%)
    }
    
[/code]

**Response:**
[code] 
    {
      "quotation": {
        "id": "QT-20260919-001",
        "status": "draft",
        "subtotal": 140000,
        "vatAmount": 9800,
        "totalAmount": 149800,
        "currency": "THB",
        "validUntil": "2026-10-19",
        "lineItems": [...]
      }
    }
    
[/code]

### 39.2.2 `approve_quotation`

อนุมัติหรือปฏิเสธใบเสนอราคา

**Parameters:**

Parameter | Type | Required | Description  
---|---|---|---  
`quotationId` | string | ✅ | รหัสใบเสนอราคา  
`action` | "approve" \ | "reject" \ | "revise"  
`approverName` | string | ✅ | ชื่อผู้อนุมัติ  
`comments` | string | ❌ | ความเห็น  
  
**Status Flow:**
[code] 
    draft → sent → approved → invoiced
                  ↘ rejected
                  ↘ revision_requested → draft
    
[/code]

### 39.2.3 `financial_report`

ดึงรายงานสรุปทางการเงิน

**Parameters:**

Parameter | Type | Required | Description  
---|---|---|---  
`period` | "daily" \ | "weekly" \ | "monthly" \  
`year` | number | ✅ | ปี  
`month` | number | ❌ | เดือน (สำหรับ daily/weekly/monthly)  
  
**Response includes:** totalRevenue, totalExpenses, netProfit, outstandingInvoices, overduePayments, quotationConversionRate, averagePaymentDays

## 39.3 MCP Tools — Invoicing

### 39.3.1 `create_invoice`

สร้างใบแจ้งหนี้จากใบเสนอราคาที่อนุมัติแล้ว

**Parameters:**

Parameter | Type | Required | Description  
---|---|---|---  
`quotationId` | string | ❌ | รหัสใบเสนอราคาอ้างอิง  
`customerId` | string | ✅ | รหัสลูกค้า  
`customerName` | string | ✅ | ชื่อลูกค้า  
`lineItems` | InvoiceLineItem[] | ✅ | รายการ  
`currency` | Currency | ❌ | สกุลเงิน  
`paymentTerms` | PaymentTerms | ❌ | เงื่อนไขชำระ  
`taxRate` | number | ❌ | อัตราภาษี (default: 7%)  
`dueDate` | string | ✅ | วันครบกำหนดชำระ  
  
### 39.3.2 `record_payment`

บันทึกการรับชำระเงิน

**Parameters:**

Parameter | Type | Required | Description  
---|---|---|---  
`invoiceId` | string | ✅ | รหัสใบแจ้งหนี้  
`amount` | number | ✅ | จำนวนเงินที่ชำระ  
`paymentMethod` | PaymentMethod | ✅ | วิธีชำระ  
`reference` | string | ✅ | เลขอ้างอิง  
`bankAccount` | string | ❌ | บัญชีธนาคาร  
`withholdingTax` | number | ❌ | ภาษีหัก ณ ที่จ่าย (%)  
`notes` | string | ❌ | หมายเหตุ  
  
**Payment Methods:**`bank_transfer`, `cash`, `cheque`, `credit_card`, `promptpay`, `other`

**Partial Payment Support:**
[code] 
    Invoice Total: 149,800 THB
      Payment 1: 70,000 THB → status: partially_paid, remaining: 79,800
      Payment 2: 79,800 THB → status: paid, remaining: 0
    
[/code]

### 39.3.3 `generate_receipt`

ออกใบเสร็จรับเงิน

**Parameters:**

Parameter | Type | Required | Description  
---|---|---|---  
`invoiceId` | string | ✅ | รหัสใบแจ้งหนี้  
`paymentId` | string | ✅ | รหัสการชำระเงิน  
`format` | "pdf" \ | "html" | ❌  
`language` | "th" \ | "en" | ❌  
`includeCompanyLogo` | boolean | ❌ | แสดงโลโก้บริษัท  
  
## 39.4 Complete Workflow — Quotation to Receipt
[code] 
    ┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
    │ create_quotation │────▶│ approve_quotation │────▶│  create_invoice   │
    │                 │     │ (approve/reject)  │     │  (from quotation) │
    └─────────────────┘     └──────────────────┘     └──────────────────┘
                                                              │
                                                              ▼
                            ┌──────────────────┐     ┌──────────────────┐
                            │ generate_receipt  │◀────│  record_payment   │
                            │ (PDF/HTML)        │     │ (partial/full)    │
                            └──────────────────┘     └──────────────────┘
                                                              │
                                                              ▼
                                                     ┌──────────────────┐
                                                     │ financial_report  │
                                                     │ (summary/audit)   │
                                                     └──────────────────┘
    
[/code]

## 39.5 Types & Enums

### Currency

`THB` | `USD` | `EUR` | `JPY` | `CNY` | `SGD`

### PaymentTerms

Value | Description  
---|---  
`net_30` | ชำระภายใน 30 วัน  
`net_60` | ชำระภายใน 60 วัน  
`net_90` | ชำระภายใน 90 วัน  
`cod` | ชำระเมื่อส่งมอบ (Cash on Delivery)  
`advance_50` | มัดจำ 50% ล่วงหน้า  
`milestone` | ชำระตามขั้นตอน  
  
### QuotationStatus

`draft` → `sent` → `approved` / `rejected` / `revision_requested` → `expired` / `invoiced`

### InvoiceStatus

`draft` → `sent` → `partially_paid` → `paid` / `overdue` → `cancelled` / `written_off`

## 39.6 VAT & Withholding Tax Calculation
[code] 
    Subtotal       = Σ (quantity × unitPrice × (1 - itemDiscount/100))
    VAT Amount     = Subtotal × taxRate / 100    (default 7%)
    Total Amount   = Subtotal + VAT Amount
    
    Withholding Tax = amount × withholdingTaxRate / 100
    Net Payment     = amount - Withholding Tax
    
[/code]

## 39.7 Governance Integration

Aspect | Implementation  
---|---  
Authentication | Bearer token required for all endpoints  
Authorization | CEO + Finance role for approve_quotation  
Rate Limiting | 50 req/min for create_*, 100 req/min for read  
PDPA | Customer data redaction on financial_report  
Audit Trail | Every status change logged with timestamp + actor  
Data Retention | 7 years per Thai Revenue Department requirements  
  
## 39.8 API Endpoints

Method | Path | Tool  
---|---|---  
POST | `/mcp/finance/quotation` | create_quotation  
PATCH | `/mcp/finance/quotation/approve` | approve_quotation  
GET | `/mcp/finance/report` | financial_report  
POST | `/mcp/finance/invoice` | create_invoice  
POST | `/mcp/finance/payment` | record_payment  
POST | `/mcp/finance/receipt` | generate_receipt  
  
## 39.9 Test Coverage

  * **Unit Tests:** 18 test cases (8 financial-management + 10 invoicing)
  * **E2E Integration:** ครอบคลุม 84 tools ทั้งหมด
  * **Scenarios tested:**



\- Create quotation with multi-line items

\- VAT calculation accuracy

\- Quotation approval/rejection flow

\- Invoice creation from quotation

\- Partial payment recording

\- Withholding tax deduction

\- Receipt generation (PDF/HTML)

\- Financial report aggregation

\- Error handling (invalid IDs, duplicate payments, overpayment)
