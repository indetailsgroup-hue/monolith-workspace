---
num: 28
title: "AI Module MCP Tools"
phase: "Phase 1"
phase_num: 1
mcp_tools: 9
status: complete
dependencies: "Foundation"
---

# บทที่ 28: AI Module MCP Tools

## บทที่ 28: AI Module MCP Tools

### 28.1 ภาพรวม

AI Module ประกอบด้วย 9 tools สำหรับ ENTERPRISE plan ครอบคลุม:

  * **AI Cost Estimation** — ประมาณค่าใช้จ่าย AI service (GPT, Midjourney, etc.)
  * **AI Quotation Draft** — สร้างและจัดการใบเสนอราคาอัตโนมัติ
  * **AI Scheduler** — วางแผนตารางการผลิตด้วย AI



### 28.2 AI Cost Estimation (`src/tools/ai-cost-estimation.ts`)

Maps to: `monolith-workspace src/ai/cost-estimation/`

#### 28.2.1 Tools

Tool | คำอธิบาย | Plan  
---|---|---  
`estimate_ai_cost` | ประมาณค่าใช้จ่ายตาม cost model (PER_TOKEN / PER_REQUEST) | ENTERPRISE  
`get_ai_usage_summary` | สรุปการใช้ AI ตามช่วงเวลาและ task category | ENTERPRISE  
`manage_cost_model` | CRUD cost models (list/create/deactivate) | ENTERPRISE (Approval_Tool)  
  
#### 28.2.2 Dual Currency System

ทุก cost estimation คืนผลลัพธ์เป็น 2 สกุลเงิน:
[code] 
    {
      estimatedCostUsd: number;   // USD
      estimatedCostThb: number;   // THB (USD × exchange rate)
      exchangeRate: number;        // ค่าเริ่มต้น 35.0
    }
    
[/code]

#### 28.2.3 Seeded Cost Models

Model ID | Provider | Pricing | Unit Cost  
---|---|---|---  
`model-gpt4o` | CHATGPT (gpt-4o) | PER_TOKEN | $0.005/1K tokens  
`model-claude` | ANTHROPIC (claude-3.5) | PER_TOKEN | $0.008/1K tokens  
`model-mj` | MIDJOURNEY (v6) | PER_REQUEST | $0.05/image  
`model-gemini` | GEMINI (gemini-2.5-pro) | PER_TOKEN | $0.003/1K tokens  
`model-dalle` | DALL_E (dall-e-3) | PER_REQUEST | $0.04/image  
  
### 28.3 AI Quotation Draft (`src/tools/ai-quotation-draft.ts`)

Maps to: `monolith-workspace src/ai/quotation/`

#### 28.3.1 Tools

Tool | คำอธิบาย | Plan  
---|---|---  
`generate_quotation_draft` | สร้าง DRAFT ใบเสนอราคาจาก panel designs | ENTERPRISE  
`review_quotation_draft` | เปลี่ยนสถานะ: submit_review / approve / reject | ENTERPRISE (Approval_Tool)  
`list_quotation_drafts` | แสดงรายการ drafts ทั้งหมด (filter by status) | ENTERPRISE  
  
#### 28.3.2 Quotation State Machine
[code] 
    DRAFT → PENDING_REVIEW → APPROVED
                           → REJECTED → (สร้าง draft ใหม่)
    
[/code]

#### 28.3.3 VAT Calculation

Default VAT rate: **7%** (Thailand standard)
[code] 
    {
      subtotal: lineItems.reduce((sum, li) => sum + li.totalPrice, 0),
      vatRate: 0.07,
      vatAmount: subtotal * 0.07,
      grandTotal: subtotal * 1.07,
    }
    
[/code]

#### 28.3.4 PDPA Gating

`generate_quotation_draft` ต้องการ consent scopes: `CUSTOMER`, `FINANCIAL`

พร้อม `piiFields`: `["customerName", "customerAddress", "customerPhone", "customerEmail"]`

### 28.4 AI Scheduler (`src/tools/ai-scheduler.ts`)

Maps to: `monolith-workspace src/ai/scheduler/`

#### 28.4.1 Tools

Tool | คำอธิบาย | Plan  
---|---|---  
`create_production_run` | สร้าง production run ด้วย AUTO/SEMI_AUTO scheduling | ENTERPRISE  
`optimize_schedule` | Optimize existing run (minimize_makespan / maximize_utilisation / balance_load) | ENTERPRISE  
`manage_schedule_constraints` | เพิ่ม/ดู/ปิดการใช้งาน constraints (MACHINE_DOWN, OPERATOR_UNAVAILABLE, etc.) | ENTERPRISE  
  
#### 28.4.2 Scheduling Modes

Mode | คำอธิบาย  
---|---  
`AUTO` | AI จัดตารางทั้งหมดอัตโนมัติ — ใช้ priority sorting  
`SEMI_AUTO` | AI เสนอ แล้วรอ manual confirmation  
  
#### 28.4.3 Priority System
[code] 
    URGENT (4) > HIGH (3) > NORMAL (2) > LOW (1)
    
[/code]

Jobs ถูก sort ตาม priority level ก่อน allocate ไปยัง machines

#### 28.4.4 Constraint Types

Type | คำอธิบาย  
---|---  
`MACHINE_DOWN` | เครื่องจักรหยุดทำงาน  
`OPERATOR_UNAVAILABLE` | พนักงานไม่ว่าง  
`MATERIAL_SHORTAGE` | วัตถุดิบไม่พอ  
`MAINTENANCE_WINDOW` | กำหนดการบำรุงรักษา  
`RUSH_ORDER` | คำสั่งด่วน — override priority  
`CUSTOM` | กำหนดเอง
