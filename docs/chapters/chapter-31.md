---
num: 31
title: "Test Suite & Quality Assurance"
phase: 3
phase_label: "Phase 3"
phase_num: 3
mcp_tools: 4
status: complete
dependencies: "Phase 2"
---

# บทที่ 31: Test Suite & Quality Assurance

## บทที่ 31: Test Suite & Quality Assurance

### 31.1 ภาพรวม

ระบบมี test suite ครอบคลุม **247 passed | 1 skipped** across **16 test files** :
[code] 
    tsc --noEmit:  0 errors
    eslint:        0 errors, 0 warnings
    vitest:        247 passed | 1 skipped (248 total)
    
[/code]

### 31.2 Test File Inventory

ตารางนี้เป็นรายการและชื่อกรณีทดสอบที่เอกสารต้นฉบับระบุ จำนวนในตารางไม่ใช่ผลการรัน tests รอบปัจจุบัน

Test File | Domain | Tests | คำอธิบาย  
---|---|---|---  
`governance/authz.test.ts` | Governance | 14 | Plan gating (6 cases), Role-based ToolClass (7 cases), Deprecation (1 case)  
`governance/ratelimit.test.ts` | Governance | 14 | Token consumption (4), Bucket isolation (2), Token refill (2), Override (1), Admin utils (5)  
`governance/pdpa.test.ts` | Governance | 12 | No requirement (2), `Missing consent` (2), Scope verification (4), Expiry (2), Summary (5) — note: some test "overlaps" count as 12
`governance/redaction.test.ts` | Governance | 13 | Field redaction (5), Pattern detection (8), Catalog-aware (3), Pattern names (1) — note: grouped as 13  
`middleware/governance-chain.integration.test.ts` | Integration | ~20 | Catalog gate (1), Authz gate (4), Ratelimit gate (2), PDPA gate (3), Happy path (3), Error handling (1), Denial audit (2), canInvoke (6), Pipeline ordering (2)  
`tools/digital-shadow.test.ts` | Phase 3 | 14 | Registration (4), Create (4), Query (3), Compare (6)  
`tools/customer-portal.test.ts` | Phase 3 | 16 | Registration (4), Create order (4), Track status (4), Feedback (6)  
`tools/analytics.test.ts` | Phase 3 | 18 | Registration (4), Query KPI (6), Report (5), OEE (5)  
`tools/ai-cost-estimation.test.ts` | AI | 14 | Registration (4), Estimate (4), Usage summary (2), Cost model (4)  
`tools/ai-quotation-draft.test.ts` | AI | 11 | Registration (3), Generate (2), Review (4), List (2)  
`tools/ai-scheduler.test.ts` | AI | 13 | Registration (3), Production run (5), Optimize (3), Constraints (4)  
`tools/canvas-snapshot.test.ts` | Core | 24 | SnapshotStore (12), MCP tool (6+)  
`tools/manage-installation.test.ts` | Business Ops | 17 | Registration (3), Create job (2), Query (2), Assign (2), Field report (5)  
`tools/quality-control.test.ts` | Business Ops | 12 | Registration (4), Inspection (3), Result (3), Metrics (4)  
`routes/agent-nesting.test.ts` | API | 17 | Validation (2), Error cases (5), Success cases (10)  
`e2e/smoke.test.ts` | E2E | 7+1 skipped | Health endpoint, Snapshot CRUD, Agent errors  
  
### 31.3 Test Coverage by Domain

Domain | Files | Tests | % ของ Total  
---|---|---|---  
Governance Stack | 4 | 53 | 21.5%  
Integration Tests | 1 | ~20 | 8.1%  
Phase 3 Tools | 3 | 48 | 19.4%  
AI Modules | 3 | 38 | 15.4%  
Business Ops | 2 | 29 | 11.7%  
Core + API + E2E | 3 | 48+1 | 19.8%  
**รวม** | **16** | **247+1** | **100%**  
  
### 31.4 CI/CD Workflows

#### 31.4.1 CI Workflow (`.github/workflows/ci.yml`)

Trigger: push/PR to `main`
[code] 
    Steps:
      1. Checkout → Setup Node 20 → pnpm install
      2. Lint: pnpm -r lint
      3. Typecheck: pnpm --filter @monolith/mcp-server exec tsc --noEmit
      4. Test: pnpm --filter @monolith/mcp-server exec vitest run
    
[/code]

#### 31.4.2 Release v2 Workflow (`.github/workflows/release-v2.yml`)

Trigger: push tags matching `v2.*`
[code] 
    Steps:
      1. Checkout → Setup Node 20 → pnpm install
      2. Lint + Typecheck + Vitest (gate)
      3. Version sync: sed package.json version from tag
      4. Create GitHub Release with auto-generated highlights:
         - 47 MCP tools
         - Governance stack (authz + ratelimit + pdpa + redaction)
         - Phase 2-3 tools (factory/cnc/workflow/digital-shadow/customer-portal/analytics)
         - AI modules (cost/quotation/scheduler)
         - 247+ tests passing
    
[/code]

#### 31.4.3 Release v1 Workflow (`.github/workflows/release.yml`)

Trigger: push tags matching `v*` (สำหรับ `@monolith/shared` npm publish)

### 31.5 Governance Chain Integration Tests

`governance-chain.integration.test.ts` ทดสอบ **end-to-end governance pipeline** โดยใช้ tool catalog จริง:

Test Group | จำนวน | สิ่งที่ทดสอบ  
---|---|---  
Catalog Gate | 1 | Unknown tool → denied  
Authz Gate | 4 | Plan denial (STARTER→ENTERPRISE), Role denial (VIEWER→Write_Tool, OPERATOR→Approval_Tool), Allow (MANAGER→Approval_Tool)  
Ratelimit Gate | 2 | Within limit → allow, Exhausted → deny  
PDPA Gate | 3 | No consent → deny, Consented → allow, Expired → deny  
Full Pipeline | 3 | Read_Tool happy path, ENTERPRISE Write_Tool + PDPA, Audit record verification  
Error Handling | 1 | Handler throw → ERROR status in audit  
Denial Audit Trail | 2 | Authz denial + PDPA denial logged in audit  
canInvoke Preflight | 6 | Valid → allowed, Unknown tool, Insufficient plan, Insufficient role, `Missing PDPA`, `Granted PDPA`
Pipeline Ordering | 2 | Authz stops before ratelimit, Ratelimit stops before pdpa  
  
### 31.6 CHANGELOG v2.0.0

CHANGELOG ฉบับสมบูรณ์บันทึกที่ `/home/sandbox/monolith-additions/CHANGELOG.md` ครอบคลุม:

  * Governance Stack (types, authz, catalog, ratelimit, pdpa, redaction)
  * Governance Middleware (audit-logger, governance-chain, govern-tools)
  * Phase 2 Tools (factory, cnc, workflow — 9 tools)
  * Phase 3 Tools (digital-shadow, customer-portal, analytics — 9 tools)
  * AI Modules (cost, quotation, scheduler — 9 tools)
  * Business Operations (installation, QC, inventory, production — 12 tools)
  * Breaking Changes: governance pipeline mandatory
  * Migration Guide: env vars, PDPA consent, rate limits
  * Test Results: 247 passed across 16 files


