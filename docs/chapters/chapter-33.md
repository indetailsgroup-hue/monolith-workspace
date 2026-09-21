---
num: 33
title: "Organization, Culture & CI/CD Hardening Tools"
phase: 5
phase_label: "Phase 5"
phase_num: 5
mcp_tools: 5
status: complete
dependencies: "Phase 4"
---

# บทที่ 33: Phase 5 — Organization, Culture & CI/CD Hardening

## บทที่ 33: Phase 5 — Organization, Culture & CI/CD Hardening

### 33.1 ภาพรวม Phase 5

Phase 5 เป็นเฟสสุดท้ายของ Migration Plan — เพิ่ม MCP Tools 9 ตัว สำหรับ organizational management, culture measurement, และ CI/CD pipeline automation:

โมดูล | Tool File | จำนวน Tools | ToolClass  
---|---|---|---  
Organization Management | `organization-management.ts` | 3 | Read / Write / Read  
Culture Management | `culture-management.ts` | 3 | Read / Write / Write  
CI/CD Management | `cicd-management.ts` | 3 | Write / Approval / Read  
  
แมปกับ monolith-workspace: `src/org/`, `src/culture/`, `src/cicd/`

# Section 60

### 33.2 Organization Management Module

#### 33.2.1 get_org_structure (Read_Tool)

ดึงผังองค์กร — filter ตาม department, level, หรือค้นหาตามชื่อ/ตำแหน่ง

**Parameters:**

Field | Type | Required | Description  
---|---|---|---  
`tenantId` | `string` | ✅ | Tenant ID  
`department` | `string` | optional | filter ตามแผนก  
`level` | `number` (0–10) | optional | filter ตามระดับ hierarchy  
`search` | `string` | optional | ค้นหาตามชื่อหรือตำแหน่ง  
  
**Response:**
[code] 
    {
      "tenantId": "TENANT-001",
      "totalNodes": 15,
      "departments": ["Executive", "Engineering", "Production", "Quality", "Sales"],
      "maxLevel": 3,
      "nodes": [\
        {\
          "nodeId": "ceo",\
          "name": "CEO",\
          "role": "Chief Executive Officer",\
          "department": "Executive",\
          "parentId": null,\
          "level": 0,\
          "directReports": 4,\
          "email": "ceo@company.com",\
          "hiredAt": "2020-01-01"\
        }\
      ],
      "queriedAt": "2025-01-15T10:00:00.000Z"
    }
    
[/code]

**Default Org Tree:** สร้าง template อัตโนมัติสำหรับ tenant ใหม่ — 15 nodes ครอบคลุม 5 แผนก, 4 ระดับ hierarchy

#### 33.2.2 update_org_chart (Write_Tool)

เพิ่ม, อัปเดต, หรือลบ node ในผังองค์กร

**Parameters:**

Field | Type | Required | Description  
---|---|---|---  
`tenantId` | `string` | ✅ | Tenant ID  
`action` | `"add" \ | "update" \ | "remove"`  
`nodeId` | `string` | ✅ | Node ID  
`name` | `string` | optional | ชื่อบุคคลหรือตำแหน่ง  
`role` | `string` | optional | ตำแหน่งงาน  
`department` | `string` | optional | แผนก  
`parentId` | `string` | optional | Node หัวหน้าที่รายงานต่อ  
  
**Behaviors:**

  * **add:** สร้าง node ใหม่, อัปเดต directReports ของ parent, คำนวณ level อัตโนมัติ
  * **update:** แก้ไข name/role/department/parentId, reassign reporting line อัตโนมัติ
  * **remove:** ลบ node, reassign orphaned children ให้ parent ของ node ที่ถูกลบ



#### 33.2.3 get_org_health_score (Read_Tool)

วิเคราะห์สุขภาพองค์กรใน 5 มิติ — ให้คะแนน, เกรด, และคำแนะนำ

**5 Health Dimensions:**

  1. **Span of Control** — อัตราส่วน direct reports ต่อ manager
  2. **Hierarchy Depth** — ความลึกของ hierarchy (optimal: 3-5 levels)
  3. **Communication Flow** — ประสิทธิภาพการสื่อสารตาม structure
  4. **Role Clarity** — ความชัดเจนของตำแหน่งและหน้าที่
  5. **Team Balance** — การกระจายทีมข้ามแผนก



**Response:**
[code] 
    {
      "tenantId": "TENANT-001",
      "overallScore": 78,
      "grade": "B",
      "dimensions": [\
        { "name": "Span of Control", "score": 82, "weight": 0.25, "status": "healthy" },\
        { "name": "Hierarchy Depth", "score": 75, "weight": 0.20, "status": "moderate" }\
      ],
      "recommendations": [\
        "Consider flattening hierarchy — current depth 5 exceeds optimal 3-4",\
        "Engineering department has 12 direct reports under one manager — split recommended"\
      ],
      "generatedAt": "2025-01-15T10:00:00.000Z"
    }
    
[/code]

**Grading:** A (≥80), B (≥70), C (≥60), D (<60)

# Section 61

### 33.3 Culture Management Module

#### 33.3.1 get_culture_dashboard (Read_Tool)

ดึง dashboard วัฒนธรรมองค์กร — คะแนน 6 มิติ พร้อม benchmark และ trend

**6 Culture Dimensions:**

  1. **Psychological Safety** — ความปลอดภัยทางจิตใจ
  2. **Collaboration** — การทำงานร่วมกัน
  3. **Innovation** — นวัตกรรมและความคิดสร้างสรรค์
  4. **Accountability** — ความรับผิดชอบ
  5. **Continuous Improvement** — การปรับปรุงอย่างต่อเนื่อง
  6. **Work-Life Balance** — สมดุลชีวิตและการทำงาน



**Parameters:**

Field | Type | Required | Description  
---|---|---|---  
`tenantId` | `string` | ✅ | Tenant ID  
`period` | `"current_quarter" \ | "last_quarter" \ | "last_6_months" \  
`department` | `string` | optional | filter ตามแผนก  
  
**Response:**
[code] 
    {
      "tenantId": "TENANT-001",
      "period": "current_quarter",
      "department": "all",
      "overallScore": 76,
      "grade": "B",
      "dimensionScores": [\
        {\
          "dimension": "psychological_safety",\
          "score": 82,\
          "benchmark": 75,\
          "trend": "up",\
          "responseCount": 45,\
          "percentile": 85\
        }\
      ],
      "aboveBenchmark": 4,
      "belowBenchmark": 2,
      "alerts": ["accountability: declining trend"],
      "totalResponses": 270,
      "generatedAt": "2025-01-15T10:00:00.000Z"
    }
    
[/code]

#### 33.3.2 submit_culture_survey (Write_Tool)

จัดการ culture survey — สร้าง, เปิด, ปิด, หรือดึงข้อมูล

**Actions:**

Action | Description | Required Params  
---|---|---  
`create` | สร้าง survey ใหม่ (status: draft) | title, dimensions  
`launch` | เปิด survey ให้พนักงานตอบ | surveyId  
`close` | ปิด survey + วิเคราะห์ผล | surveyId  
`get` | ดึงข้อมูล survey เฉพาะ | surveyId  
`list` | แสดงรายการ surveys ทั้งหมดของ tenant | —  
  
**Survey Dimensions:** กำหนดเองได้ จากชุด 6 dimensions ของ culture framework

**PDPA Compliance:** ต้องมี `EMPLOYEE` consent scope เพราะเก็บข้อมูล sentiment ของพนักงาน

#### 33.3.3 log_leadership_action (Write_Tool)

บันทึกและสืบค้นกิจกรรมผู้นำ — สำหรับ culture impact analysis

**Actions:**

Action | Description  
---|---  
`log` | บันทึกกิจกรรมใหม่ (ต้องมี leaderId, actionType, description)  
`query` | สืบค้นประวัติกิจกรรม (filter ตาม leaderId, actionType, category)  
  
**Action Types:**`mentoring`, `recognition`, `team_intervention`, `strategic_decision`, `training`, `conflict_resolution`

**Impact Levels:**`high`, `medium`, `low`

**Query Response:** รวม summary — byType count, byImpact distribution

# Section 62

### 33.4 CI/CD Management Module

#### 33.4.1 manage_ci_pipeline (Write_Tool)

จัดการ CI/CD pipeline configuration — CRUD + list

**Parameters:**

Field | Type | Required | Description  
---|---|---|---  
`tenantId` | `string` | ✅ | Tenant ID  
`action` | `"create" \ | "update" \ | "get" \  
`pipelineId` | `string` | for update/get/delete | Pipeline ID  
`name` | `string` | optional | ชื่อ pipeline  
`branch` | `string` | optional | Git branch (default: main)  
`stages` | `string[]` | optional | ชื่อ stage (default: lint, test, build, deploy)  
`triggers` | `("push" \ | "pull_request" \ | "tag" \  
`environment` | `Environment` | optional | target environment  
`deployStrategy` | `"rolling" \ | "blue_green" \ | "canary" \  
`autoRollback` | `boolean` | optional | auto-rollback on failure  
`healthCheckUrl` | `string` | optional | URL สำหรับตรวจ health  
  
**Pipeline Stages (default):**`lint` → `test` → `build` → `deploy`

**Deploy Strategies:**

  * **Rolling:** ทยอยอัปเดตทีละ instance
  * **Blue-Green:** สลับ traffic ระหว่าง 2 environments
  * **Canary:** ส่ง traffic ส่วนน้อยไปก่อน แล้วค่อย ๆ เพิ่ม
  * **Recreate:** หยุด instance เก่าทั้งหมด แล้วสร้างใหม่



#### 33.4.2 trigger_deployment (Approval_Tool)

สั่ง deploy pipeline run — ต้อง MANAGER+ role (Approval_Tool)

**Parameters:**

Field | Type | Required | Description  
---|---|---|---  
`tenantId` | `string` | ✅ | Tenant ID  
`pipelineId` | `string` | ✅ | Pipeline ID  
`commitSha` | `string` | optional | Git commit SHA  
`environment` | `Environment` | optional | override target env  
`triggeredBy` | `string` | optional | ผู้สั่ง deploy (default: ai-agent)  
  
**Response:**
[code] 
    {
      "pipelineRun": {
        "runId": "run-abc123",
        "pipelineId": "pipe-xyz",
        "status": "success",
        "branch": "main",
        "commitSha": "a1b2c3d4",
        "environment": "staging",
        "stages": [\
          { "name": "lint", "status": "success", "durationMs": 8500 },\
          { "name": "test", "status": "success", "durationMs": 25000 },\
          { "name": "build", "status": "success", "durationMs": 18000 },\
          { "name": "deploy", "status": "success", "durationMs": 12000 }\
        ],
        "triggeredBy": "ai-agent",
        "durationMs": 63500,
        "artifacts": ["dist-a1b2c3d4.tar.gz", "coverage-report.html"]
      },
      "deployment": {
        "deploymentId": "deploy-abc123",
        "environment": "staging",
        "strategy": "rolling",
        "status": "healthy",
        "replicas": { "desired": 3, "ready": 3, "available": 3 },
        "healthChecks": { "passed": 5, "failed": 0 }
      },
      "summary": {
        "allStagesPassed": true,
        "totalDurationMs": 63500,
        "artifactCount": 2
      }
    }
    
[/code]

#### 33.4.3 get_deployment_status (Read_Tool)

ดึงสถานะ deployment ข้าม environments — แสดง replica health, history, metrics

**Parameters:**

Field | Type | Required | Description  
---|---|---|---  
`tenantId` | `string` | ✅ | Tenant ID  
`environment` | `"development" \ | "staging" \ | "production" \  
`limit` | `number` (1–50) | optional | จำนวน records (default: 10)  
  
**Response includes:**

  * `deployments` — array ของ DeploymentRecord
  * `recentRuns` — array ของ PipelineRun
  * `environmentSummary` — สถานะล่าสุดแต่ละ environment
  * `metrics` — totalDeployments, totalRuns, successRate, avgDurationMs



**Deployment Statuses:**`pending`, `in_progress`, `healthy`, `degraded`, `rolled_back`, `failed`

# Section 63

### 33.5 Governance Integration

ทั้ง 9 tools ผ่าน governance pipeline ครบถ้วน:

Tool | ToolClass | Min Plan | PDPA Scopes  
---|---|---|---  
get_org_structure | Read_Tool | PROFESSIONAL | EMPLOYEE  
update_org_chart | Write_Tool | ENTERPRISE | EMPLOYEE  
get_org_health_score | Read_Tool | PROFESSIONAL | —  
get_culture_dashboard | Read_Tool | PROFESSIONAL | EMPLOYEE  
submit_culture_survey | Write_Tool | ENTERPRISE | EMPLOYEE  
log_leadership_action | Write_Tool | ENTERPRISE | EMPLOYEE  
manage_ci_pipeline | Write_Tool | ENTERPRISE | —  
trigger_deployment | Approval_Tool | ENTERPRISE | —  
get_deployment_status | Read_Tool | PROFESSIONAL | —  
  
### 33.6 Unit Tests

ผลลัพธ์ unit tests สำหรับ Phase 5:

  * `organization-management.test.ts` — tests สำหรับ get_org_structure, update_org_chart (add/update/remove), get_org_health_score
  * `culture-management.test.ts` — tests สำหรับ get_culture_dashboard, submit_culture_survey (create/launch/close/get/list), log_leadership_action (log/query)
  * `cicd-management.test.ts` — tests สำหรับ manage_ci_pipeline (create/list/get/delete), trigger_deployment, get_deployment_status



### 33.7 E2E Integration Test

`e2e-all-tools.test.ts` — ครอบคลุม 66 catalog entries (65 tools + read_skill) ทั้งระบบ:

Test Suite | จำนวน Tests | Description  
---|---|---  
Catalog Completeness | 5 | ตรวจ 66 entries, unique names, required fields, Phase 4-5 inclusion  
All 66 Tools via Governance | 66 | ENTERPRISE ADMIN execute ทุก tool ผ่าน pipeline  
canInvoke Preflight | 66 | Pre-check authorization ทุก tool  
Audit Trail | 1 | ตรวจ audit records ทุกการ invoke  
Role Denial Matrix | 10 | VIEWER denied on Write/Approval, allowed on Read  
Plan Tier Denial | 8 | STARTER denied on PROFESSIONAL/ENTERPRISE tools  
PDPA Consent Enforcement | 14 | denied without consent, allowed with consent  
Rate Limiting | 1 | 150 rapid requests → bucket exhaustion  
Unknown Tool Denial | 1 | non-existent tool ถูกปฏิเสธ  
Tool Class Distribution | 2 | Read, Write, Approval class balance  
  
### 33.8 สรุป Build Statistics
[code] 
    Total MCP Tools:  65 (+ read_skill = 66 catalog entries)
    Phase 1-3:        47 tools
    Phase 4:           9 tools (Notification + Reporting + Backup)
    Phase 5:           9 tools (Organization + Culture + CI/CD)
    Governance Catalog: 66 entries
    
    Build Results:
      tsc --noEmit:     0 errors
      ESLint:           0 errors
      Vitest:           502 passed | 1 skipped | 23 test files
    
[/code]
