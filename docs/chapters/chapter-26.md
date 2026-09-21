---
num: 26
title: "MCP Governance Stack"
phase: "Foundation"
phase_num: 0
mcp_tools: 0
status: complete
dependencies: "—"
---

# บทที่ 26: MCP Governance Stack

## บทที่ 26: MCP Governance Stack

### 26.1 ภาพรวม

Governance Stack เป็นชั้นควบคุมการเข้าถึง (Access Control Layer) สำหรับ MCP Server ทั้ง 47 tools โดยออกแบบให้สอดคล้องกับ monolith-workspace `src/mcp/` architecture จริง ครอบคลุม:

  * **Authorization (authz)** — Plan gating + Role-based ToolClass permission
  * **Rate Limiting** — Token bucket per tenant × tool
  * **PDPA Compliance** — พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล consent enforcement
  * **Data Redaction** — PII field masking สำหรับ audit logs



ทุก tool invocation ต้องผ่าน governance pipeline ก่อนเข้าถึง handler:
[code] 
    catalog lookup → authorization → rate limit → pdpa consent → execute → redact → audit
    
[/code]

### 26.2 Type System (`src/governance/types.ts`)

#### 26.2.1 ToolClass Enum

จำแนก MCP tools เป็น 3 ระดับตาม authorization requirement:

ToolClass | คำอธิบาย | ตัวอย่าง  
---|---|---  
`Read_Tool` | Read-only queries — authorization ต่ำสุด | `preview_layout`, `query_qc_metrics`, `monitor_oee_metrics`  
`Write_Tool` | State-mutating writes — ต้องการ write permission | `validate_panel_design`, `generate_cutting_list`, `manage_inventory`  
`Approval_Tool` | Approval/review — ต้องการ elevated permission (manager/admin) | `approve_stage_transition`, `manage_cost_model`  
  
#### 26.2.2 PlanTier Enum

ระบบ SaaS plan tier กำหนด tool availability:

PlanTier | ระดับ | Tools ที่เข้าถึงได้  
---|---|---  
`STARTER` | 0 | Core tools: validate_panel_design, generate_cutting_list, export_dxf, preview_layout, QC tools, inventory basics  
`PROFESSIONAL` | 1 | \+ optimize_nesting, export_step_file, installation, production planning, factory, CNC, workflow, customer portal, analytics  
`ENTERPRISE` | 2 | \+ AI cost estimation, AI quotation, AI scheduler, digital shadow, analytics report generation  
  
#### 26.2.3 UserRole Enum & Permission Mapping

ลำดับชั้น: `ADMIN > MANAGER > OPERATOR > VIEWER`
[code] 
    const ROLE_PERMISSIONS: Record<UserRole, Set<ToolClass>> = {
      VIEWER:   Set([Read_Tool]),
      OPERATOR: Set([Read_Tool, Write_Tool]),
      MANAGER:  Set([Read_Tool, Write_Tool, Approval_Tool]),
      ADMIN:    Set([Read_Tool, Write_Tool, Approval_Tool]),
    };
    
[/code]

#### 26.2.4 PdpaConsentScope Enum

สอดคล้องกับ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562:

Scope | คำอธิบาย | Tools ที่ต้องการ  
---|---|---  
`GENERAL_PERSONAL` | ข้อมูลส่วนบุคคลทั่วไป | —  
`CONTACT_INFO` | ข้อมูลการติดต่อ | manage_installation_jobs  
`LOCATION` | ข้อมูลตำแหน่งที่ตั้ง | manage_installation_jobs, submit_field_report  
`FINANCIAL` | ข้อมูลการเงิน | manage_cost_model, generate_quotation_draft  
`EMPLOYEE` | ข้อมูลพนักงาน | assign_installer  
`CUSTOMER` | ข้อมูลลูกค้า | generate_quotation_draft, manage_customer_feedback  
`SENSITIVE` | ข้อมูลอ่อนไหว (สุขภาพ, ชีวภาพ, ประวัติอาชญากรรม) | —  
  
#### 26.2.5 Core Interfaces
[code] 
    interface CatalogEntry {
      name: string;                          // Tool name (e.g. "validate_panel_design")
      label: string;                         // Human-readable label
      description: string;                   // What the tool does
      toolClass: ToolClass;                  // Read_Tool | Write_Tool | Approval_Tool
      sourceModule: string;                  // src/ path in monolith-workspace
      requiredPlan: PlanTier;                // Minimum plan required
      availableSince: string;                // ISO 8601 date
      deprecatedAt?: string;                 // ISO 8601 if deprecated
      rateLimitOverride?: RateLimitConfig;   // Custom rate limit
      requiredConsentScopes?: PdpaConsentScope[]; // PDPA consent required
      piiFields?: string[];                  // Fields to redact in audit
    }
    
    interface GovernanceContext {
      toolName: string;
      catalogEntry: CatalogEntry;
      tenantId: string;
      userId: string;
      userRole: UserRole;
      planTier: PlanTier;
      input: Record<string, unknown>;
      consentRecords?: PdpaConsentRecord[];
      requestedAt: string;
    }
    
    interface GovernanceResult {
      allowed: boolean;
      deniedBy?: string;   // e.g. "authz:plan_gate", "ratelimit", "pdpa:expired_consent"
      reason?: string;
    }
    
    interface AuditRecord {
      id: string;               // UUID
      toolName: string;
      toolClass: ToolClass;
      status: InvocationStatus; // PENDING → RUNNING → DONE | ERROR | CANCELLED
      tenantId: string;
      invokedBy: string;
      userRole: UserRole;
      invokedAt: string;
      durationMs?: number;
      errorMessage?: string;
      piiRedacted: boolean;
      idempotencyKey?: string;
    }
    
[/code]

### 26.3 Authorization Module (`src/governance/authz.ts`)

#### 26.3.1 `checkAuthorization(ctx: GovernanceContext): GovernanceResult`

ตรวจสอบ 2 เงื่อนไข:

  1. **Plan Gate** — `PLAN_LEVEL[ctx.planTier] >= PLAN_LEVEL[catalogEntry.requiredPlan]`



\- ถ้าไม่ผ่าน: `deniedBy: "authz:plan_gate"`

  1. **Role-based ToolClass** — `ROLE_PERMISSIONS[ctx.userRole].has(catalogEntry.toolClass)`



\- ถ้าไม่ผ่าน: `deniedBy: "authz:role_check"`

#### 26.3.2 `isToolDeprecated(ctx): string | undefined`

คืน `deprecatedAt` date string ถ้า tool ถูก deprecated (ยังใช้ได้แต่ emit warning ใน audit log)

### 26.4 Tool Catalog (`src/governance/catalog.ts`)

Central registry ที่เก็บ metadata ของทุก tool — **48 entries** (47 tools + read_skill)

ฟังก์ชัน | คำอธิบาย  
---|---  
`getCatalogEntry(name)` | ค้นหา tool ตามชื่อ  
`getAllCatalogEntries()` | ดึง entries ทั้งหมด  
`getActiveCatalogEntries()` | เฉพาะ tools ที่ไม่ deprecated  
`getCatalogByClass(toolClass)` | กรองตาม ToolClass  
`getCatalogByPlan(plan)` | กรองตาม PlanTier  
  
#### ตารางสรุป Catalog (47 Tools)

กลุ่ม | Tools | ToolClass | Plan | PDPA Scopes  
---|---|---|---|---  
**Core Panel** | validate_panel_design, generate_cutting_list, export_dxf, preview_layout, calculate_material_cost | Write/Read | STARTER | —  
**Advanced** | optimize_nesting, canvas_snapshot, export_step_file | Write/Read | STARTER–PROF | —  
**Installation** | manage_installation_jobs, assign_installer, submit_field_report | Write | PROF | LOCATION, CONTACT_INFO, EMPLOYEE  
**QC** | create_qc_inspection, record_qc_result, query_qc_metrics | Write/Read | STARTER | —  
**Inventory** | manage_inventory, track_material_movement, get_inventory_report | Write/Read | STARTER | —  
**Production** | create_production_plan, manage_work_order, get_production_dashboard | Write/Read | PROF | —  
**AI Cost** | estimate_ai_cost, get_ai_usage_summary, manage_cost_model | Read/Approval | ENTERPRISE | FINANCIAL  
**AI Quotation** | generate_quotation_draft, review_quotation_draft, list_quotation_drafts | Write/Read/Approval | ENTERPRISE | CUSTOMER, FINANCIAL  
**AI Scheduler** | create_production_run, optimize_schedule, manage_schedule_constraints | Write/Read | ENTERPRISE | —  
**Factory** | manage_factory_floor, configure_machine, monitor_factory_metrics | Write/Read | PROF | —  
**CNC** | submit_cnc_program, monitor_cnc_status, manage_tool_library | Write/Read | PROF | —  
**Workflow** | manage_workflow_stage, approve_stage_transition, get_workflow_status | Write/Approval/Read | PROF | —  
**Digital Shadow** | create_digital_shadow, query_shadow_state, compare_shadow_physical | Write/Read | ENTERPRISE | —  
**Customer Portal** | create_customer_order, track_order_status, manage_customer_feedback | Write/Read | PROF | CUSTOMER  
**Analytics** | query_production_kpi, generate_analytics_report, monitor_oee_metrics | Read/Write | PROF–ENT | —  
**Utility** | read_skill | Read | STARTER | —  
  
### 26.5 Rate Limiting Module (`src/governance/ratelimit.ts`)

#### 26.5.1 Token Bucket Algorithm

ใช้ in-memory token bucket per `tenantId:toolName` pair:
[code] 
    DEFAULT_LIMITS:
      Read_Tool:     { maxTokens: 120, refillRate: 2/s,   refillInterval: 1000ms }
      Write_Tool:    { maxTokens: 60,  refillRate: 1/s,   refillInterval: 1000ms }
      Approval_Tool: { maxTokens: 30,  refillRate: 0.5/s, refillInterval: 1000ms }
    
[/code]

  * แต่ละ tool สามารถ override ได้ผ่าน `CatalogEntry.rateLimitOverride`
  * Token refill คำนวณจาก elapsed time ตั้งแต่ last refill
  * ถ้า tokens < 1: `deniedBy: "ratelimit"` พร้อม retry-after ms



#### 26.5.2 Admin Functions

ฟังก์ชัน | คำอธิบาย  
---|---  
`getBucketState(tenantId, toolName)` | ดู token state ปัจจุบัน  
`resetAllBuckets()` | ล้าง buckets ทั้งหมด (testing)  
`resetBucket(tenantId, toolName)` | ล้าง bucket เฉพาะ tenant+tool  
  
### 26.6 PDPA Compliance Module (`src/governance/pdpa.ts`)

สอดคล้องกับ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (Thailand PDPA Act)

#### 26.6.1 `checkPdpaConsent(ctx): GovernanceResult`

ขั้นตอนตรวจสอบ:

  1. ถ้า tool ไม่มี `requiredConsentScopes` → **อนุญาต** (pass-through)
  2. ถ้าไม่มี `consentRecords` → `deniedBy: "pdpa:no_consent_records"`
  3. ตรวจแต่ละ scope ที่ต้องการ:



\- ไม่พบ record → `deniedBy: "pdpa:missing_consent"`

\- `consented = false` → `deniedBy: "pdpa:missing_consent"`

\- Retention expired (`consentedAt + retentionDays < now`) → `deniedBy: "pdpa:expired_consent"`

#### 26.6.2 `getConsentSummary(ctx)`

คืน per-scope status (`granted` | `missing` | `expired`) — ใช้สำหรับ UI แสดงว่า user ต้อง consent อะไรก่อนใช้ tool

### 26.7 Data Redaction Module (`src/governance/redaction.ts`)

#### 26.7.1 PII Pattern Detection (6 patterns)

Pattern | Regex | Replacement  
---|---|---  
`thai_phone` | `0[689]\d-?\d{3,4}-?\d{4}` | `***-****-****`  
`email` | `[\w.+-]+@[\w-]+\\.[\w.]+` | `***@***.***`  
`thai_id` | `\d-\d{4}-\d{5}-\d{2}-\d` | `*-****-*****-**-*`  
`credit_card` | `\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}` | `****-****-****-****`  
`ip_address` | `\d{1,3}\\.\d{1,3}\\.\d{1,3}\\.\d{1,3}` | `***.***.***.***`  
`lat_lng` | `[-+]?\d{1,3}\\.\d{4,}` | `**.****`  
  
#### 26.7.2 Functions

ฟังก์ชัน | คำอธิบาย  
---|---  
`redactFields(data, piiFields)` | Mask specified fields (shallow + dot-notation) → `[REDACTED]`  
`redactPatterns(text)` | Scan free text for PII patterns and replace  
`redactForAudit(data, catalogEntry)` | Catalog-aware redaction using `catalogEntry.piiFields`  
`getPiiPatternNames()` | List all 6 pattern names  
  
> **สำคัญ:** Redaction ใช้กับ **audit logs เท่านั้น** — Live tool responses ไม่ถูก redact
