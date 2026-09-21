---
num: 34
title: "Architecture Decision Records (ADR)"
phase: 5
phase_label: "Phase 5"
phase_num: 5
mcp_tools: 4
status: complete
dependencies: "Phase 4"
---

# Chapter 34: Architecture Decision Records (ADR)

## Chapter 34: Architecture Decision Records (ADR)

### 34.1 บทนำ

Architecture Decision Records (ADR) คือเอกสารที่บันทึกการตัดสินใจด้านสถาปัตยกรรมที่สำคัญของ Monolith MCP Server ตลอดทุก phase ของการ migrate จาก monolith ไปสู่ MCP-based platform แต่ละ ADR ใช้รูปแบบ Michael Nygard format: Context → Decision → Consequences

### 34.2 ADR Index

ADR | Title | Phase | Status | Date  
---|---|---|---|---  
ADR-001 | MCP Protocol Selection | Foundation | Accepted | 2024-01-15  
ADR-002 | Multi-Tenant Architecture | Foundation | Accepted | 2024-01-15  
ADR-003 | Governance Chain Middleware | Foundation | Accepted | 2024-06-01  
ADR-004 | PDPA Compliance Strategy | Foundation | Accepted | 2024-06-01  
ADR-005 | 5-Phase Migration Plan | All | Accepted | 2024-07-01  
ADR-006 | Tool Classification System | Foundation | Accepted | 2024-01-15  
ADR-007 | Plan-Tier Gating | Foundation | Accepted | 2024-02-01  
ADR-008 | Adapter Pattern for Pipeline | Foundation | Accepted | 2024-01-15  
ADR-009 | AI Module Integration | Phase 1 | Accepted | 2024-06-01  
ADR-010 | Digital Shadow Architecture | Phase 3 | Accepted | 2024-08-01  
ADR-011 | Real-time WebSocket Events | Foundation | Accepted | 2024-03-01  
ADR-012 | TypeScript SDK Design | Foundation | Accepted | 2024-03-15  
ADR-013 | CI/CD Hardening Strategy | Phase 5 | Accepted | 2026-09-18  
ADR-014 | Culture & Organization Metrics | Phase 5 | Accepted | 2026-09-18  
ADR-015 | Phase 6: Analytics & Monitoring | Phase 6 | Proposed | 2026-09-19  
  
### 34.3 Phase Coverage Map
[code] 
    Foundation (Phase 0): ADR-001 → ADR-008, ADR-011, ADR-012
      ├── MCP Protocol + Multi-Tenant + Governance + PDPA
      ├── Tool Classification + Plan-Tier + Adapter Pattern
      └── WebSocket Events + SDK Design
    
    Phase 1 (AI Tools):   ADR-009
      └── AI Cost Estimation + Quotation Draft + Scheduler
    
    Phase 2 (Factory):    Covered by ADR-005
      └── Factory Management + CNC + Workflow
    
    Phase 3 (Digital):    ADR-010
      └── Digital Shadow + Customer Portal + Analytics
    
    Phase 4 (Operations): Covered by ADR-005
      └── Notification + Reporting + Backup
    
    Phase 5 (Culture):    ADR-013, ADR-014
      └── CI/CD Hardening + Organization + Culture Metrics
    
    Phase 6 (Analytics):  ADR-015
      └── Analytics Dashboard + Real-time Monitoring
    
[/code]

### 34.4 ADR-001: MCP Protocol Selection

**Status:** Accepted | **Phase:** Foundation | **Date:** 2024-01-15

**Context:**

Monolith Manufacturing OS ต้องการ AI-agent communication protocol ที่ให้ language models (Gemini, GPT, Claude) สามารถ invoke manufacturing operations ได้อย่างมาตรฐาน ปลอดภัย และค้นพบได้อัตโนมัติ (discoverable) ตัวเลือกที่พิจารณา:

  1. Custom REST API — Standard HTTP + OpenAPI
  2. gRPC — High-performance binary + Protobuf
  3. Model Context Protocol (MCP) — Anthropic's open standard
  4. LangChain Tool Protocol — LangChain-specific function calling



**Decision:**

เลือก **MCP with Streamable HTTP transport** เป็น primary AI-agent interface เพราะ:

  * **Vendor-neutral:** รองรับ Claude, Gemini (via adapters), GPT — ไม่ lock-in
  * **Tool discovery:**`tools/list` method ให้ agent ค้นพบ operations runtime
  * **Streamable HTTP:** ทำงานผ่าน HTTP/S มาตรฐาน รองรับ load balancing, WAF
  * **Session management:**`Mcp-Session-Id` header ในตัว



Complementary REST endpoints สำหรับงานที่ไม่เหมาะกับ tool paradigm:

  * `POST /snapshot/:jobId` — Binary PNG upload
  * `GET /snapshot` — List snapshots
  * `POST /agent/nesting-optimize` — Synchronous agentic loop



**Consequences:**
[code] 
    - (+) AI agents discover 71+ tools ผ่าน single protocol
    - (+) Ecosystem เติบโต — TypeScript SDK, community tools
    - (-) MCP ยังใหม่ ต้อง monitor spec changes
    - (-) ต้อง maintain REST endpoints คู่ขนาน
    
[/code]

### 34.5 ADR-002: Multi-Tenant Architecture

**Status:** Accepted | **Phase:** Foundation | **Date:** 2024-01-15

**Context:**

Monolith เป็น multi-tenant SaaS — ต้องแยก data ระหว่าง tenants อย่างปลอดภัย ตัวเลือก:
[code] 
    1. Database-per-tenant — แยก database ต่อ tenant
    2. Schema-per-tenant — แยก schema ใน shared database
    3. Shared tables + Row-Level Security (RLS) — Supabase/PostgreSQL RLS
    
[/code]

**Decision:**

ใช้ **Shared Supabase/PostgreSQL + RLS policies** ที่ `tenant_id` column เป็น discriminator ทุก table:
[code] 
    ALTER TABLE panels ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON panels
      USING (tenant_id = current_setting('app.current_tenant')::uuid);
    
[/code]

**Consequences:**
[code] 
    - (+) Cost-effective — single database instance
    - (+) Supabase ecosystem — Auth, Realtime, Edge Functions ทำงานร่วมกับ RLS
    - (+) Zero-code tenant isolation
    - (-) Performance at extreme scale ต้อง monitor index usage
    - (-) Cross-tenant reporting ต้องใช้ service-role bypass
    
[/code]

### 34.6 ADR-003: Governance Chain Middleware

**Status:** Accepted | **Phase:** Foundation | **Date:** 2024-06-01

**Context:**

เมื่อ MCP tools เพิ่มจาก 8 → 71 ตัว ต้องมี centralized governance ที่ enforce policies ทุกครั้ง:
[code] 
      - RBAC (Role-Based Access Control) — VIEWER/OPERATOR/MANAGER/ADMIN
      - Plan-tier gating — STARTER/PROFESSIONAL/ENTERPRISE
      - PDPA consent enforcement
      - Rate limiting per tenant
      - PII redaction ก่อน audit
    
[/code]

**Decision:**

สร้าง **5-stage Governance Chain Pipeline** ที่ทุก tool invocation ผ่าน:
[code] 
    Request → [1.Catalog Lookup] → [2.AuthZ Check] → [3.PDPA Consent]
           → [4.Rate Limiter] → [5.Audit + Redaction] → Tool Handler
    
[/code]

Middleware เป็น `GovernanceChain` class ที่ chain stages ตามลำดับ หาก stage ใดปฏิเสธจะ short-circuit ทันที

**Consequences:**
[code] 
      - (+) Single enforcement point — เพิ่ม tool ใหม่ไม่ต้องเขียน auth ซ้ำ
      - (+) Audit trail ครบทุก invocation พร้อม PII redaction
      - (+) Rate limiting ป้องกัน abuse
      - (-) Latency overhead 2-5ms ต่อ invocation
      - (-) Governance catalog ต้อง sync กับ tool registration
    
[/code]

### 34.7 ADR-004: PDPA Compliance Strategy

**Status:** Accepted | **Phase:** Foundation | **Date:** 2024-06-01

**Context:**

PDPA (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล) กำหนดให้ต้องมีการจัดการ consent สำหรับ personal data processing โดยเฉพาะใน manufacturing context ที่มีข้อมูลพนักงาน ลูกค้า และ supplier

**Decision:**

Implement **6 consent scopes** ที่ enforced ผ่าน governance chain:

Scope | Description | Required For  
---|---|---  
`manufacturing_data` | ข้อมูลการผลิต | Panel/CNC/Schedule tools  
`quality_inspection` | ข้อมูลการตรวจสอบ | QC/Inspection tools  
`employee_data` | ข้อมูลพนักงาน | Organization/Culture tools  
`financial_data` | ข้อมูลการเงิน | Cost/Quotation/Invoice tools  
`customer_data` | ข้อมูลลูกค้า | Customer Portal tools  
`analytics_data` | ข้อมูล analytics | Dashboard/KPI/Monitoring tools  
  
PII patterns ที่ redact อัตโนมัติ: Thai phone, email, Thai national ID, credit card, IP address, lat/lng coordinates

**Consequences:**
[code] 
      - (+) PDPA compliant — consent-per-scope ตรงตามกฎหมาย
      - (+) PII redaction 6 patterns ป้องกัน data leak ใน audit logs
      - (-) UX complexity — ต้อง prompt consent per scope
      - (-) ต้อง maintain consent mapping เมื่อเพิ่ม tools
    
[/code]

### 34.8 ADR-005: 5-Phase Migration Plan

**Status:** Accepted | **Phase:** All | **Date:** 2024-07-01

**Context:**

monolith-workspace repository มี 20+ modules ที่ต้อง migrate เป็น MCP tools การ migrate ทั้งหมดในครั้งเดียว ("big bang") เสี่ยงเกินไป

**Decision:**

แบ่ง migration เป็น **5 phases** ด้วย pace 9 tools/month:

Phase | Focus | Tools | Timeline  
---|---|---|---  
Phase 1 | AI Integration | 9 tools | Month 1-2  
Phase 2 | Factory/CNC/Workflow | 9 tools | Month 3-4  
Phase 3 | Digital Shadow/Portal/Analytics | 9 tools | Month 5-6  
Phase 4 | Notification/Reporting/Backup | 9 tools | Month 7-8  
Phase 5 | Organization/Culture/CI-CD | 9 tools | Month 9-10  
  
Phase 6 (Analytics Dashboard/Monitoring) เป็น stretch goal หลัง Phase 5 เสร็จ

**Consequences:**
[code] 
      - (+) Incremental delivery — value ทุก 2 เดือน
      - (+) Manageable scope — 9 tools ต่อ phase
      - (+) Rollback granularity — ถอย phase เดียว ไม่กระทบทั้งระบบ
      - (-) 10 เดือน total — ช้ากว่า big bang
      - (-) Adapter layer ต้อง maintain dual mode ระหว่าง migration
    
[/code]

### 34.9 ADR-006: Tool Classification System

**Status:** Accepted | **Phase:** Foundation | **Date:** 2024-01-15

**Context:**

71 MCP tools มีระดับความเสี่ยงต่างกัน — read-only query กับ delete production data ไม่ควรมี access control เหมือนกัน

**Decision:**

แบ่ง tools เป็น 3 **ToolClass** categories:

ToolClass | Description | Min Role | Examples  
---|---|---|---  
`Read` | Query/list only, no side effects | VIEWER | get_dashboard_data, get_live_metrics  
`Write` | Create/update/delete data | OPERATOR | create_dashboard, configure_monitor  
`Approval` | High-impact operations requiring manager | MANAGER | approve_stage_transition  
  
RBAC matrix:
[code] 
      - VIEWER → Read only
      - OPERATOR → Read + Write
      - MANAGER → Read + Write + Approval
      - ADMIN → All + system configuration
    
[/code]

### 34.10 ADR-007: Plan-Tier Gating

**Status:** Accepted | **Phase:** Foundation | **Date:** 2024-02-01

**Context:**

Monolith SaaS มี 3 pricing tiers — tools บางตัวต้อง restrict ตาม plan

**Decision:**

Implement **3-tier gating** ใน governance catalog:

Tier | Price Point | Tool Access  
---|---|---  
STARTER | Basic | Core tools (panel, cutting list, export)  
PROFESSIONAL | Mid | \+ AI tools, scheduling, reporting  
ENTERPRISE | Premium | \+ Governance, digital shadow, analytics, monitoring  
  
Enforcement: `checkPlanTier()` stage ใน governance chain ตรวจ `minimumPlan` field ใน catalog

### 34.11 ADR-008: Adapter Pattern for Pipeline

**Status:** Accepted | **Phase:** Foundation | **Date:** 2024-01-15

**Context:**

MCP tools ต้อง communicate กับ backend pipelines — แต่ production backend กับ test environment ต่างกัน

**Decision:**

ใช้ **Adapter Pattern** ด้วย 3 adapter types:
[code] 
      1. **PipelineAdapter** — ต่อ `@monolith/pipeline` production
      2. **CustomAdapter** — ต่อ third-party services
      3. **StubAdapter** — In-memory stub สำหรับ testing
    
[/code]

ทุก tool รับ `adapter` parameter — swap implementation ได้โดยไม่แก้ tool logic

### 34.12 ADR-009: AI Module Integration

**Status:** Accepted | **Phase:** Phase 1 | **Date:** 2024-06-01

**Context:**

Phase 1 ต้องเพิ่ม AI capabilities — cost estimation, quotation drafting, production scheduling ที่ใช้ Gemini/GPT

**Decision:**

สร้าง 3 AI tool modules ที่ใช้ **dual-currency support** (THB/USD) และ multi-model:
[code] 
      - `ai-cost-estimation` — estimate\_material\_cost, predict\_labor\_hours, calculate\_total\_cost
      - `ai-quotation-draft` — generate\_quotation\_draft, review\_quotation\_draft, list\_quotation\_drafts
      - `ai-scheduler` — create\_production\_run, optimize\_schedule, manage\_schedule\_constraints
    
[/code]

ทุก AI tool ส่ง prompt ผ่าน adapter → LLM → structured JSON response

### 34.13 ADR-010: Digital Shadow Architecture

**Status:** Accepted | **Phase:** Phase 3 | **Date:** 2024-08-01

**Context:**

Factory floor ต้องการ "digital twin" ของ production line — แต่ real-time sync ทุก sensor มี bandwidth cost สูง

**Decision:**

ใช้ **Digital Shadow** (snapshot-based) แทน full Digital Twin:
[code] 
        - `create_digital_shadow` — สร้าง snapshot ของ production state
        - `query_shadow_state` — query historical state
        - `compare_shadow_physical` — detect drift ระหว่าง shadow กับ physical
    
[/code]

Shadow update ทุก 30 วินาที แทนที่ continuous stream — ลด bandwidth 80%

### 34.14 ADR-011: Real-time WebSocket Events

**Status:** Accepted | **Phase:** Foundation | **Date:** 2024-03-01

**Decision:**

สร้าง **WebSocket event taxonomy** ที่ใช้ Supabase Realtime channels:
[code] 
        - `job:*` — Job lifecycle events (created, status\_changed, completed)
        - `machine:*` — Machine status (online, offline, error, maintenance)
        - `alert:*` — Alert triggers (threshold\_breach, anomaly\_detected)
        - `metrics:*` — Live metric updates (oee, throughput)
    
[/code]

Event format: `{ type, payload, tenantId, timestamp, correlationId }`

### 34.15 ADR-012: TypeScript SDK Design

**Status:** Accepted | **Phase:** Foundation | **Date:** 2024-03-15

**Decision:**

สร้าง `@monolith/sdk` เป็น **REST + WebSocket dual client** :
[code] 
        - `MonolithClient` — REST client สำหรับ tool invocation
        - `MonolithWSClient` — WebSocket client สำหรับ real-time events
        - Type-safe — ทุก tool parameter/response มี TypeScript types
        - Auto-retry + exponential backoff
    
[/code]

### 34.16 ADR-013: CI/CD Hardening Strategy

**Status:** Accepted | **Phase:** Phase 5 | **Date:** 2026-09-18

**Decision:**

Implement **3-tier deployment strategy** :
[code] 
        1. `deploy_canary` — 5% traffic → canary instance
        2. `promote_deployment` — Gradual rollout 25% → 50% → 100%
        3. `rollback_deployment` — Instant rollback ด้วย previous version
    
[/code]

Pipeline stages: Lint → Type Check → Unit Test → Build → Canary → Promote

### 34.17 ADR-014: Culture & Organization Metrics

**Status:** Accepted | **Phase:** Phase 5 | **Date:** 2026-09-18

**Decision:**

Integrate **Psychological Safety metrics** เข้ากับ MCP tools:
[code] 
        - `measure_psychological_safety` — 7-Likert scale survey
        - `submit_anonymous_feedback` — Anonymous feedback channel
        - `get_culture_analytics` — Aggregated culture dashboard
    
[/code]

Score interpretation: 1.0–2.0 Low → 2.1–3.0 Moderate → 3.1–4.0 High → 4.1–5.0 Very High

### 34.18 ADR-015: Phase 6 — Analytics Dashboard & Real-time Monitoring

**Status:** Proposed | **Phase:** Phase 6 | **Date:** 2026-09-19

**Context:**

หลัง Phase 5 เสร็จ (71 tools) ยังขาด centralized analytics dashboard และ real-time monitoring ที่ managers สามารถ configure เองได้

**Decision:**

เพิ่ม **6 MCP tools** ใน 2 modules ใหม่:

**Analytics Dashboard Module:**
[code] 
          - `create_dashboard` — สร้าง customizable dashboard ด้วย grid layout
          - `manage_dashboard_widget` — จัดการ widgets (KPI card, line chart, bar chart, gauge, table, heatmap)
          - `get_dashboard_data` — ดึง widget data พร้อม sparklines และ threshold status
    
[/code]

**Real-time Monitoring Module:**
[code] 
          - `configure_monitor` — ตั้งค่า metric stream monitoring
          - `get_live_metrics` — ดึง live metrics แบบ batch พร้อม trend analysis
          - `manage_alert_rule` — จัดการ alert rules (threshold, rate\_of\_change, anomaly, absence)
    
[/code]

**Consequences:**
[code] 
          - (+) Managers สร้าง dashboard เองได้ — ไม่ต้องรอ dev
          - (+) Alert rules ลด MTTR ผ่าน auto-notification
          - (-) Phase 6 ยังเป็น "Proposed" — ต้อง validate กับ production workload
          - (-) In-memory store ต้อง migrate ไป Supabase
    
[/code]

### 34.19 สรุป ADR Statistics
[code] 
    Total ADRs:     15
    Accepted:       14
    Proposed:        1 (ADR-015: Phase 6)
    Phase Coverage:  Foundation (10), Phase 1 (1), Phase 3 (1), Phase 5 (2), Phase 6 (1)
    Date Range:      2024-01-15 → 2026-09-19
    Format:          Michael Nygard (Context → Decision → Consequences)
    Location:        packages/mcp-server/docs/adr/
    
[/code]
