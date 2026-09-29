---
num: 27
title: "Governance Middleware & Pipeline"
phase: 0
phase_label: "Foundation"
phase_num: 0
mcp_tools: 1
status: complete
dependencies: "—"
---

# บทที่ 27: Governance Middleware & Pipeline

## บทที่ 27: Governance Middleware & Pipeline

### 27.1 ภาพรวม

Middleware layer เชื่อมต่อ governance modules เข้ากับ MCP Server ประกอบด้วย 3 components:

  1. **Audit Logger** — Immutable audit trail สำหรับทุก invocation
  2. **Governance Chain** — Chain of responsibility pipeline
  3. **Govern Tools** — Server wrapper ที่ wire governance เข้ากับ `McpServer.tool()`



### 27.2 Audit Logger (`src/middleware/audit-logger.ts`)

#### 27.2.1 Architecture

In-memory audit store ขนาด 10,000 records (FIFO eviction) — production จะเปลี่ยนเป็น Supabase/ClickHouse

#### 27.2.2 Audit API

ฟังก์ชัน | คำอธิบาย | สถานะที่บันทึก  
---|---|---  
`logInvocationStart(ctx)` | สร้าง PENDING audit record | `PENDING`  
`logInvocationEnd(record, status, durationMs, opts?)` | อัปเดตเป็น DONE/ERROR | `DONE` / `ERROR`  
`logDenied(ctx, deniedBy, reason)` | บันทึก denied invocation | `CANCELLED`  
  
#### 27.2.3 Query API

ฟังก์ชัน | คำอธิบาย  
---|---  
`getRecentAuditRecords(limit)` | ดึง records ล่าสุด (newest first)  
`getAuditByTenant(tenantId, limit)` | กรองตาม tenant  
`getAuditByTool(toolName, limit)` | กรองตาม tool  
`getAuditSummary()` | นับจำนวนตาม InvocationStatus  
`clearAuditLog()` | ล้าง records ทั้งหมด (testing only)  
  
### 27.3 Governance Chain (`src/middleware/governance-chain.ts`)

#### 27.3.1 `executeWithGovernance()`

Full governance pipeline สำหรับทุก tool invocation:
[code] 
      ┌─────────────────┐
      │ 1. Catalog lookup│ → ไม่พบ? → { denied: "catalog" }
      └────────┬────────┘
               │
      ┌────────▼────────┐
      │ 2. Authorization │ → plan/role ไม่ผ่าน? → { denied: "authz:*" }
      └────────┬────────┘
               │
      ┌────────▼────────┐
      │ 3. Rate Limit    │ → tokens หมด? → { denied: "ratelimit" }
      └────────┬────────┘
               │
      ┌────────▼────────┐
      │ 4. PDPA Consent  │ → consent ไม่ครบ? → { denied: "pdpa:*" }
      └────────┬────────┘
               │
      ┌────────▼────────┐
      │ 5. Execute       │ → รัน handler จริง
      └────────┬────────┘
               │
      ┌────────▼────────┐
      │ 6. Redact        │ → mask PII fields สำหรับ audit
      └────────┬────────┘
               │
      ┌────────▼────────┐
      │ 7. Audit Log     │ → บันทึก result + timing
      └─────────────────┘
    
[/code]

**Parameters:**
[code] 
    async function executeWithGovernance<T>(
      toolName: string,
      input: Record<string, unknown>,
      tenantId: string,
      userId: string,
      userRole: UserRole,
      planTier: PlanTier,
      handler: (input: Record<string, unknown>) => Promise<T>,
      consentRecords?: PdpaConsentRecord[],
      opts?: GovernanceChainOptions,
    ): Promise<{ result?: T; denied?: GovernanceResult; auditId: string }>
    
[/code]

**Pipeline Ordering Guarantee:**

  * authz denial หยุด pipeline **ก่อน** ratelimit consume token
  * ratelimit denial หยุด pipeline **ก่อน** pdpa check
  * ป้องกันการใช้ rate limit token โดยไม่จำเป็น



#### 27.3.2 `canInvoke()` — Preflight Check
[code] 
    function canInvoke(
      toolName: string,
      userRole: UserRole,
      planTier: PlanTier,
      tenantId: string,
      consentRecords?: PdpaConsentRecord[],
    ): GovernanceResult
    
[/code]

รัน authz + PDPA checks โดย **ไม่** consume rate limit token — ใช้สำหรับ UI "can I click this?" decisions

#### 27.3.3 Dev Bypass

เมื่อ `opts.bypassInDev = true` และ `NODE_ENV === "development"`:

  * ข้าม authz, ratelimit, pdpa ทั้งหมด
  * ยังคงมี audit logging



### 27.4 Govern Tools Wrapper (`src/middleware/govern-tools.ts`)

#### 27.4.1 `wrapServerWithGovernance(server: McpServer)`

Monkey-patches `McpServer.tool()` method เพื่อ wrap ทุก handler ที่ register หลังจากเรียก:
[code] 
    const server = new McpServer({ name: "monolith-mcp", version: "2.0.0" });
    wrapServerWithGovernance(server);  // ← เรียกครั้งเดียว ก่อน registerXxx()
    
    // ทุก tool ที่ register หลังจากนี้ผ่าน governance pipeline อัตโนมัติ
    registerValidatePanelDesign(server, adapter);
    registerAiCostEstimation(server, adapter);
    // ...
    
[/code]

#### 27.4.2 Context Resolution

Production: ดึงจาก JWT claims ผ่าน auth middleware

Dev/Test: อ่านจาก environment variables:

Environment Variable | Default | คำอธิบาย  
---|---|---  
`MCP_TENANT_ID` | `"default-tenant"` | Tenant identifier  
`MCP_USER_ID` | `"system"` | User identifier  
`MCP_USER_ROLE` | `ADMIN` | UserRole enum value  
`MCP_PLAN_TIER` | `ENTERPRISE` | PlanTier enum value  
  
#### 27.4.3 Denial Response Format

เมื่อ governance ปฏิเสธ invocation, tool คืน MCP error response:
[code] 
    {
      "content": [{\
        "type": "text",\
        "text": "{\"error\":\"GOVERNANCE_DENIED\",\"deniedBy\":\"authz:plan_gate\",\"reason\":\"Tool requires ENTERPRISE but tenant is on STARTER\",\"auditId\":\"uuid\"}"\
      }],
      "isError": true
    }
    
[/code]

### 27.5 Integration ใน index.ts
[code] 
    // src/index.ts — governance wiring
    import { wrapServerWithGovernance } from "./middleware/govern-tools.js";
    
    const server = new McpServer({
      name: "monolith-mcp",
      version: "2.0.0",
    });
    
    // Wire governance BEFORE all registrations
    wrapServerWithGovernance(server);
    
    // Then register all 47 tools...
    registerValidatePanelDesign(server, adapter);
    registerGenerateCuttingList(server, adapter);
    // ... (47 tools total)
    
[/code]
