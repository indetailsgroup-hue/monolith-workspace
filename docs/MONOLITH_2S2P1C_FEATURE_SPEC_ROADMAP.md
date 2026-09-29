# MONOLITH × 2S2P1C — Feature Specification, Roadmap & Architecture
## อิงหลักฐานจาก SLR บูรณาการ 756 บทความ (PRISMA 2020)

**เวอร์ชัน:** v17+ Planning Document  
**วันที่:** 28 สิงหาคม 2026  
**อ้างอิง:** SLR บูรณาการ — การออกแบบองค์กรยุค AI: กรอบแนวคิด 2S2P1C และวัฒนธรรมองค์กร

---

## สรุปสำหรับผู้บริหาร

รายงานนี้แปลง insights จากงานวิจัย 756 บทความ (3 SLR ชุด, PRISMA 2020) เป็นแผนพัฒนา MONOLITH Manufacturing OS ในเชิงรูปธรรม ครอบคลุม 3 ส่วน:

1. **Feature Specification** — 5 modules ใหม่ที่อิงหลักฐาน SLR
2. **Roadmap & Prioritization** — 4 phases (v17.0 → v18.5+) พร้อม evidence-based priority
3. **Architecture Recommendation** — Data model, TypeScript types, SQL schema ที่รองรับ 2S2P1C

**Key insight จาก SLR:** People (89%) และ Culture (85%) คือปัจจัยสำคัญสูงสุด — มากกว่า System (81%), Process (77%), Structure (72%) สำหรับธุรกิจไทย/เอเชียที่มี High Power Distance ต้องสร้าง Psychological Safety เป็นพื้นฐานก่อนนำ AI เข้ามา

---

## สารบัญ

1. [ภูมิหลัง: SLR สู่ Product Strategy](#1-ภูมิหลัง)
2. [Part 1 — Feature Specification ตาม 2S2P1C](#2-feature-specification)
   - 2.1 [S1: Structure — OrgChart & Network Module](#21-s1-structure)
   - 2.2 [S2: System — AI-Assist Hub](#22-s2-system)
   - 2.3 [P1: Process — Work Redesign Tools](#23-p1-process)
   - 2.4 [P2: People — HR & Super Employee Module](#24-p2-people)
   - 2.5 [C: Culture — Psychological Safety Dashboard](#25-c-culture)
3. [Part 2 — Roadmap & Prioritization (v17+)](#3-roadmap)
4. [Part 3 — Architecture Recommendation](#4-architecture)
   - 4.1 [Module Structure](#41-module-structure)
   - 4.2 [TypeScript Types](#42-typescript-types)
   - 4.3 [SQL Schema](#43-sql-schema)
   - 4.4 [Plan Feature Gates](#44-plan-feature-gates)
5. [สรุปและขั้นตอนถัดไป](#5-สรุป)

---

## 1. ภูมิหลัง: SLR สู่ Product Strategy {#1-ภูมิหลัง}

### 1.1 ข้อค้นพบหลักจาก SLR (756 บทความ)

| มิติ 2S2P1C | ความสำคัญ (% งานวิจัย) | ผลกระทบต่อ MONOLITH |
|------------|----------------------|---------------------|
| **People (P2)** | **89%** | ต้องเพิ่ม HR module, skills matrix, Super Employee tracking |
| **Culture (C)** | **85%** | ต้องเพิ่ม Psychological Safety survey, anonymous feedback |
| **System (S2)** | **81%** | ต้องเพิ่ม AI-powered features ใน existing modules |
| **Process (P1)** | **77%** | ต้องปรับ job workflow ให้รองรับ Work Redesign |
| **Structure (S1)** | **72%** | ต้องเพิ่ม OrgChart, role network visualization |

### 1.2 Key Findings ที่เกี่ยวข้องโดยตรงกับ MONOLITH

1. **"Super Employees"** — พนักงานที่เสริมพลังด้วย AI ทำงานข้ามบทบาทได้ ลดทรัพยากร 8–33 เท่า → MONOLITH ควรมีเครื่องมือ track Super Employee progress
2. **Hierarchy → Network** — โครงสร้างแบบเครือข่ายยืดหยุ่นกว่า → Multi-tenant + network org view
3. **Work Redesign > Technology Deployment** — การออกแบบงานใหม่สำคัญกว่าการซื้อเทคโนโลยี → AI-assisted workflow redesign
4. **High Power Distance (ไทย)** — Psychological Safety ต้องออกแบบต่างจากตะวันตก → Anonymous feedback, tiered PS surveys
5. **AI Integration Gap** — ช่องว่างระหว่าง tech adoption กับ human change → Change readiness tracker

### 1.3 MONOLITH ปัจจุบัน (v16.0) vs ที่ควรมี (v17+)

| ส่วน | v16.0 (ปัจจุบัน) | v17+ (เป้าหมาย) |
|------|----------------|----------------|
| People | ❌ ไม่มี HR module | ✅ Employee profiles, skills matrix, Super Employee tracking |
| Culture | ❌ ไม่มี | ✅ PS Survey, anonymous feedback, culture metrics |
| AI-Assist | ❌ ไม่มี AI features | ✅ AI cost estimation, AI production planning |
| Process | ⚠️ Job lifecycle พื้นฐาน | ✅ Process templates, SOP library, bottleneck detection |
| Structure | ⚠️ Role list เท่านั้น | ✅ Interactive org chart, network visualization |

---

## 2. Feature Specification ตาม 2S2P1C {#2-feature-specification}

### 2.1 S1: Structure — OrgChart & Network Module {#21-s1-structure}

**Evidence:** 72% ของงานวิจัยเน้น Hierarchy → Network, cross-functional teams, distributed decision-making

**Feature Name:** `OrganizationNetwork` Module

**ฟีเจอร์หลัก:**
- **Interactive OrgChart** — แสดงโครงสร้าง org members แบบ tree/network สลับได้
- **Role Network View** — แสดงความสัมพันธ์ระหว่าง roles ใน job lifecycle (ใครทำงานกับใคร)
- **Cross-functional Team Builder** — สร้าง project team ชั่วคราวข้ามสาย (DESIGNER + FACTORY + INSTALLER)
- **Span of Control Metrics** — แสดง ratio ผู้จัดการ/ลูกน้อง, workload distribution

**Plan Gate:** PROFESSIONAL+

**User Roles:** OWNER, ADMIN

---

### 2.2 S2: System — AI-Assist Hub {#22-s2-system}

**Evidence:** 81% ของงานวิจัยเน้น AI as managed collaborator, Human-AI Collaboration, iterative feedback mechanisms

**Feature Name:** `AIAssist` Module

**ฟีเจอร์หลัก:**
- **AI Cost Estimation** — ใช้ ML model ประมาณ material cost + labor จาก job specs อัตโนมัติ
- **Production Schedule Optimizer** — AI แนะนำ job sequencing เพื่อลด WIP time
- **QC Anomaly Detection** — แจ้งเตือนอัตโนมัติเมื่อ job อยู่ใน QC นานผิดปกติ
- **AI-Generated Quotation** — AI ร่าง quotation template จาก historical data
- **Human Override Log** — บันทึกทุกครั้งที่ user override AI recommendation (audit trail)

**Plan Gate:** ENTERPRISE (AI features), PROFESSIONAL (basic suggestions)

**User Roles:** DESIGNER, ADMIN สำหรับ AI suggestions; OWNER สำหรับ model settings

---

### 2.3 P1: Process — Work Redesign Tools {#23-p1-process}

**Evidence:** 77% เน้น Work Redesign > Technology Deployment, Flow-Based Change Management, process automation

**Feature Name:** `ProcessDesign` Module (ขยายจาก jobs module ที่มีอยู่)

**ฟีเจอร์หลัก:**
- **SOP Library** — คลัง Standard Operating Procedures แบบ per-org, link กับ job stages
- **Job Template Builder** — สร้าง job template สำหรับงานประเภทซ้ำๆ (ตู้ครัว, ประตู, งาน site)
- **Bottleneck Heatmap** — แสดง stage ที่ jobs ค้างนานที่สุด ช่วย identify process improvement
- **Time-in-Stage Tracker** — วัดเวลาเฉลี่ยที่ job ใช้ใน each stage
- **Process Improvement Suggestions** — AI แนะนำขั้นตอนที่ควรปรับปรุงจาก historical data

**Plan Gate:** STARTER+ (SOP Library, Templates), PROFESSIONAL+ (Heatmap, AI suggestions)

---

### 2.4 P2: People — HR & Super Employee Module {#24-p2-people}

**Evidence:** 89% (สูงสุด) เน้น People as key success factor, Super Employees, reskilling, skills matrix

**Feature Name:** `People` Module — **Module สำคัญที่สุด ควร build ก่อน**

**ฟีเจอร์หลัก:**

#### 2.4.1 Employee Profiles
- ข้อมูลพื้นฐาน: ชื่อ, role, แผนก, วันเริ่มงาน
- Avatar, contact info
- Link กับ `auth.users` (ถ้า user มี account) หรือ standalone (พนักงานที่ไม่มี MONOLITH login)

#### 2.4.2 Skills Matrix
- กำหนด skills ที่จำเป็นต่อ role (เช่น FACTORY: CNC Operation, Assembly, Quality Check)
- Rate ระดับ skill ของแต่ละคน (1–5 หรือ Beginner/Intermediate/Advanced/Expert)
- Gap Analysis — แสดงช่องว่างระหว่าง required vs actual skills

#### 2.4.3 Training Tracker
- บันทึก training ที่ผ่านมา (internal/external)
- กำหนด training ที่ต้องทำ (required training)
- Completion tracking + certificate upload

#### 2.4.4 Super Employee Progress Tracker
- **อิง SLR:** Super Employee = พนักงานที่เสริมพลังด้วย AI ทำงานข้ามบทบาทได้
- Track ว่าพนักงานแต่ละคน "AI-ready" ระดับไหน (0–100%)
- Milestone badges: AI-Aware → AI-Assisted → AI-Partner → Super Employee
- แสดง impact metrics (งานที่ทำได้เพิ่มขึ้น, เวลาที่ลดลง)

#### 2.4.5 Workload & Capacity Planning
- แสดง active jobs ของแต่ละคน
- Capacity utilization (% ของ max capacity)
- Overload warnings

**Plan Gate:** STARTER (Employee profiles ≤5 คน), PROFESSIONAL (Skills matrix, Training), ENTERPRISE (Super Employee tracking, AI capacity planning)

---

### 2.5 C: Culture — Psychological Safety Dashboard {#25-c-culture}

**Evidence:** 85% เน้น Culture เป็น success factor; SLR ชุดที่ 3 ยืนยันว่า High Power Distance (ไทย/เอเชีย) ต้องออกแบบ PS แตกต่างจากตะวันตก — ต้องใช้ anonymous feedback, tiered approach

**Feature Name:** `Culture` Module

**ฟีเจอร์หลัก:**

#### 2.5.1 Psychological Safety (PS) Survey
- **Anonymous surveys** — พนักงานตอบได้โดยไม่เปิดเผยตัวตน (สำคัญมากสำหรับบริบทไทย)
- Amy Edmondson's 7-item PS scale ปรับสำหรับบริบทไทย/การผลิต
- ส่งสัปดาห์ละครั้งหรือรายเดือน (configurable)
- Aggregate score แสดงให้ ADMIN/OWNER เห็น แต่ไม่มี individual attribution

#### 2.5.2 Change Readiness Assessment
- แบบประเมิน change readiness ของทีม
- แสดงจุดแข็ง/จุดอ่อนในการรับการเปลี่ยนแปลง
- Action recommendations จาก AI

#### 2.5.3 Anonymous Feedback Channel
- พนักงานส่ง feedback ได้โดยไม่เปิดเผยตัว
- ADMIN จัดการ + respond
- Tagging: Process Improvement / Recognition / Concern / Idea

#### 2.5.4 Culture Metrics Dashboard
- **PS Score Trend** — กราฟ PS score รายสัปดาห์/เดือน
- **Engagement Score** — วัดจาก survey + activity
- **Change Readiness Index**
- **AI Adoption Comfort Score** — วัดว่าทีมพร้อม adopt AI tools แค่ไหน
- Benchmarks: เปรียบเทียบกับ industry average (manufacturing, Thai context)

#### 2.5.5 Leadership Action Tracker
- OWNER/ADMIN กำหนด culture actions (เช่น "จัด training เรื่อง AI" หรือ "ประชุม 1-on-1")
- Track completion
- Link กับ PS score change (before/after action)

**Plan Gate:** PROFESSIONAL+ (PS Survey, Anonymous Feedback), ENTERPRISE (AI recommendations, Benchmarks)

---

## 3. Roadmap & Prioritization (v17+) {#3-roadmap}

### 3.1 หลักการ Prioritization (อิง SLR)

```
Priority Score = Evidence Weight × Business Impact × Implementation Effort⁻¹

People (P2):  89% × High Impact × Medium Effort = Priority 1  ⭐⭐⭐⭐⭐
Culture (C):  85% × High Impact × Medium Effort = Priority 2  ⭐⭐⭐⭐⭐  
System (S2):  81% × High Impact × High Effort   = Priority 3  ⭐⭐⭐⭐
Process (P1): 77% × Medium Impact × Low Effort  = Priority 3  ⭐⭐⭐⭐
Structure(S1):72% × Low Impact × High Effort    = Priority 4  ⭐⭐⭐
```

### 3.2 Phase 1 — v17.0: People & Culture Foundation (Q4 2026)

**เป้าหมาย:** วาง foundation สำหรับมิติที่สำคัญที่สุด (People + Culture)

| Feature | Module | Priority | Plan |
|---------|--------|----------|------|
| Employee Profiles | People | 🔴 Critical | STARTER+ |
| Skills Matrix (basic) | People | 🔴 Critical | PROFESSIONAL+ |
| PS Survey (anonymous) | Culture | 🔴 Critical | PROFESSIONAL+ |
| Anonymous Feedback | Culture | 🟠 High | PROFESSIONAL+ |
| Process Templates | Jobs | 🟠 High | STARTER+ |
| Bottleneck Heatmap | Jobs | 🟡 Medium | PROFESSIONAL+ |

**New SQL Migration:** `20261001_people_culture_schema.sql`  
**New Modules:** `src/people/`, `src/culture/`  
**Estimated effort:** 6–8 สัปดาห์

---

### 3.3 Phase 2 — v17.5: Super Employee & AI-Assist (Q1 2027)

**เป้าหมาย:** Enable Human-AI Collaboration ผ่าน Super Employee framework + AI features แรก

| Feature | Module | Priority | Plan |
|---------|--------|----------|------|
| Super Employee Tracker | People | 🔴 Critical | ENTERPRISE |
| Training Tracker | People | 🟠 High | PROFESSIONAL+ |
| AI Cost Estimation | AI-Assist | 🟠 High | ENTERPRISE |
| AI Production Scheduler | AI-Assist | 🟡 Medium | ENTERPRISE |
| Culture Metrics Dashboard | Culture | 🟠 High | PROFESSIONAL+ |
| Change Readiness Assessment | Culture | 🟡 Medium | PROFESSIONAL+ |

**Estimated effort:** 8–10 สัปดาห์

---

### 3.4 Phase 3 — v18.0: Structure & Advanced AI (Q2 2027)

**เป้าหมาย:** Structural features + Advanced AI integration

| Feature | Module | Priority | Plan |
|---------|--------|----------|------|
| Interactive OrgChart | Structure | 🟡 Medium | PROFESSIONAL+ |
| Role Network View | Structure | 🟡 Medium | PROFESSIONAL+ |
| QC Anomaly Detection | AI-Assist | 🟡 Medium | ENTERPRISE |
| AI Quotation Draft | AI-Assist | 🟡 Medium | ENTERPRISE |
| Leadership Action Tracker | Culture | 🟡 Medium | ENTERPRISE |
| AI Adoption Comfort Score | Culture | 🟢 Low | ENTERPRISE |

---

### 3.5 Phase 4 — v18.5+: Optimization & Analytics (Q3–Q4 2027)

**เป้าหมาย:** Cross-module analytics, benchmarks, advanced automation

| Feature | Module | Priority | Plan |
|---------|--------|----------|------|
| 2S2P1C Org Health Score | Analytics | 🟡 Medium | ENTERPRISE |
| Capacity Planning AI | People | 🟡 Medium | ENTERPRISE |
| Industry Benchmarks | Culture | 🟢 Low | ENTERPRISE |
| Cross-functional Team Builder | Structure | 🟢 Low | PROFESSIONAL+ |
| SOP Library + AI Assistant | Process | 🟢 Low | PROFESSIONAL+ |

---

### 3.6 Roadmap Summary Visual

```
2026 Q4          2027 Q1          2027 Q2          2027 Q3+
┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
│  v17.0     │   │  v17.5     │   │  v18.0     │   │  v18.5+    │
│            │   │            │   │            │   │            │
│ 👥 People  │   │ ⭐ Super   │   │ 🏢 Structure│   │ 📊 Org     │
│  Profiles  │   │  Employee  │   │  OrgChart  │   │  Health    │
│            │   │            │   │            │   │  Score     │
│ 🧠 PS     │   │ 🤖 AI Cost │   │ 🤖 AI QC  │   │            │
│  Survey   │   │  Estimator │   │  Anomaly   │   │ 🎯 Industry│
│           │   │            │   │  Detection │   │  Benchmark │
│ 📝 Process│   │ 📈 Culture │   │            │   │            │
│ Templates │   │  Dashboard │   │            │   │            │
└────────────┘   └────────────┘   └────────────┘   └────────────┘
   FOUNDATION       AUGMENTATION    INTELLIGENCE     OPTIMIZATION
```

---

## 4. Architecture Recommendation {#4-architecture}

### 4.1 Module Structure {#41-module-structure}

```
src/
├── tenant/                    # ✅ Existing v16.0
├── jobs/                      # ✅ Existing, ต้องเพิ่ม Process features
├── quotation/                 # ✅ Existing
├── ledger/                    # ✅ Existing
├── factory/                   # ✅ Existing
├── designer/                  # ✅ Existing
├── nesting/                   # ✅ Existing
│
├── people/                    # 🆕 NEW v17.0 — P2: People
│   ├── types.ts               #   Employee, Skill, EmployeeSkill, Training, SuperEmployeeProgress
│   ├── peopleStore.ts         #   Zustand store
│   ├── EmployeeList.tsx       #   List view + search/filter
│   ├── EmployeeProfile.tsx    #   Detail + skills + training
│   ├── SkillsMatrix.tsx       #   Org-wide skills grid
│   ├── SuperEmployeeTracker.tsx #  Progress tracker
│   ├── TrainingManager.tsx    #   Training records
│   └── peopleQueries.ts       #   Supabase queries (org-scoped)
│
├── culture/                   # 🆕 NEW v17.0 — C: Culture  
│   ├── types.ts               #   PsSurvey, PsScore, AnonymousFeedback, CultureMetrics
│   ├── cultureStore.ts        #   Zustand store
│   ├── PsSurvey.tsx           #   Anonymous PS Survey form
│   ├── CultureDashboard.tsx   #   Metrics, trends, heatmaps
│   ├── AnonymousFeedback.tsx  #   Submit + manage feedback
│   ├── ChangeReadiness.tsx    #   Assessment form + results
│   └── cultureQueries.ts      #   Supabase queries (anonymized)
│
├── ai-assist/                 # 🆕 NEW v17.5 — S2: System (AI)
│   ├── types.ts               #   AiSuggestion, AiModel, HumanOverride
│   ├── aiStore.ts             #   Zustand store
│   ├── CostEstimator.tsx      #   AI cost estimation UI
│   ├── ProductionOptimizer.tsx #  AI schedule optimizer
│   ├── OverrideLog.tsx        #   Human override audit trail
│   └── aiQueries.ts           #   Edge function calls
│
├── org-structure/             # 🆕 NEW v18.0 — S1: Structure
│   ├── OrgChart.tsx           #   D3/react-flow org chart
│   ├── RoleNetwork.tsx        #   Network visualization
│   └── TeamBuilder.tsx        #   Cross-functional team creation
│
└── analytics/                 # 🔄 Extend existing — P1: Process + all
    ├── OrgHealthScore.tsx     # 🆕 2S2P1C composite score
    ├── BottleneckHeatmap.tsx  # 🆕 Process bottleneck view
    └── BenchmarkComparison.tsx # 🆕 Industry benchmarks
```

---

### 4.2 TypeScript Types {#42-typescript-types}

```typescript
// src/people/types.ts

export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';

export type SuperEmployeeStage = 
  | 'AI_UNAWARE'     // ยังไม่รู้จัก AI tools
  | 'AI_AWARE'       // รู้จักแต่ยังไม่ใช้
  | 'AI_ASSISTED'    // ใช้ AI ช่วยทำงานบ้าง
  | 'AI_PARTNER'     // ทำงานร่วมกับ AI สม่ำเสมอ
  | 'SUPER_EMPLOYEE' // AI-augmented, ทำงานข้ามบทบาทได้

export interface Employee {
  id: string;
  org_id: string;
  user_id?: string;            // null ถ้าไม่มี MONOLITH login
  name: string;
  role: OrgRole;               // reuse from tenant/types.ts
  department?: string;
  hire_date?: string;          // ISO date
  avatar_url?: string;
  is_active: boolean;
  super_employee_stage: SuperEmployeeStage;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  org_id: string;
  name: string;                // e.g., "CNC Operation", "AutoCAD", "Client Communication"
  category: 'TECHNICAL' | 'SOFT' | 'AI_TOOL' | 'PROCESS';
  role_relevance: OrgRole[];   // ทักษะนี้เกี่ยวข้องกับ role ไหนบ้าง
  is_ai_skill: boolean;        // true = ทักษะที่ต้องใช้ AI
  created_at: string;
}

export interface EmployeeSkill {
  id: string;
  employee_id: string;
  skill_id: string;
  level: SkillLevel;
  assessed_by?: string;        // employee_id ของคนที่ประเมิน
  assessed_at?: string;
  notes?: string;
}

export interface TrainingRecord {
  id: string;
  employee_id: string;
  org_id: string;
  title: string;
  type: 'INTERNAL' | 'EXTERNAL' | 'ONLINE' | 'ON_JOB';
  skill_ids: string[];         // ทักษะที่ได้รับการพัฒนา
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  start_date?: string;
  end_date?: string;
  hours?: number;
  certificate_url?: string;
  notes?: string;
}

export interface SuperEmployeeProgress {
  id: string;
  employee_id: string;
  org_id: string;
  stage: SuperEmployeeStage;
  stage_date: string;          // วันที่เข้าสู่ stage นี้
  ai_tools_used: string[];     // AI tools ที่ใช้
  productivity_delta?: number; // % เพิ่มขึ้นของ productivity
  jobs_cross_role?: number;    // จำนวน jobs ที่ทำข้ามบทบาท
  notes?: string;
}

// ──────────────────────────────────────────────

// src/culture/types.ts

export type PsSurveyStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';
export type FeedbackCategory = 
  | 'PROCESS_IMPROVEMENT' 
  | 'RECOGNITION' 
  | 'CONCERN' 
  | 'IDEA'
  | 'AI_CONCERN';              // เพิ่มพิเศษสำหรับ concerns เกี่ยวกับ AI adoption

export interface PsQuestion {
  id: string;
  text_th: string;             // ภาษาไทย
  text_en: string;
  scale: 'LIKERT_5' | 'LIKERT_7' | 'YES_NO';
  reverse_scored: boolean;     // บางข้อต้อง reverse score (Amy Edmondson scale)
  dimension: 'VOICE' | 'RISK_TAKING' | 'TRUST' | 'INCLUSION' | 'AI_READINESS';
}

export interface PsSurveyTemplate {
  id: string;
  org_id: string;
  name: string;
  questions: PsQuestion[];
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  status: PsSurveyStatus;
  created_by: string;          // user_id ของ OWNER/ADMIN
  created_at: string;
}

export interface PsSurveyResponse {
  id: string;
  survey_id: string;
  org_id: string;
  // ⚠️ NO user_id — anonymous by design
  anonymous_token: string;     // random UUID, ใช้ตรวจ duplicate แต่ไม่ link กับ user
  responses: { question_id: string; value: number }[];
  submitted_at: string;
}

export interface PsScore {
  id: string;
  org_id: string;
  period: string;              // e.g., "2026-W35" (ISO week) หรือ "2026-09"
  overall_score: number;       // 0–100
  dimension_scores: {
    VOICE: number;
    RISK_TAKING: number;
    TRUST: number;
    INCLUSION: number;
    AI_READINESS: number;
  };
  response_count: number;
  calculated_at: string;
}

export interface AnonymousFeedback {
  id: string;
  org_id: string;
  // ⚠️ NO user_id — anonymous
  category: FeedbackCategory;
  content: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  admin_response?: string;
  created_at: string;
  resolved_at?: string;
}

export interface ChangeReadinessScore {
  id: string;
  org_id: string;
  period: string;
  dimensions: {
    leadership_commitment: number;    // 0–100
    communication_clarity: number;
    employee_participation: number;
    learning_culture: number;
    ai_adoption_comfort: number;      // เพิ่มพิเศษสำหรับ AI context
  };
  overall_score: number;
  response_count: number;
  created_at: string;
}
```

---

### 4.3 SQL Schema {#43-sql-schema}

```sql
-- Migration: 20261001_people_culture_schema.sql
-- MONOLITH v17.0 — People & Culture Foundation (2S2P1C)

BEGIN;

-- ═══════════════════════════════════════
-- PEOPLE MODULE
-- ═══════════════════════════════════════

CREATE TABLE employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),  -- nullable: พนักงานไม่จำเป็นต้องมี login
  name            TEXT NOT NULL,
  role            TEXT NOT NULL,                   -- OrgRole
  department      TEXT,
  hire_date       DATE,
  avatar_url      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  super_employee_stage TEXT NOT NULL DEFAULT 'AI_UNAWARE',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE skills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,               -- TECHNICAL | SOFT | AI_TOOL | PROCESS
  role_relevance  TEXT[] NOT NULL DEFAULT '{}',
  is_ai_skill     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employee_skills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  skill_id        UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  level           TEXT NOT NULL,               -- BEGINNER | INTERMEDIATE | ADVANCED | EXPERT
  assessed_by     UUID REFERENCES employees(id),
  assessed_at     TIMESTAMPTZ,
  notes           TEXT,
  UNIQUE(employee_id, skill_id)
);

CREATE TABLE training_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  type            TEXT NOT NULL,               -- INTERNAL | EXTERNAL | ONLINE | ON_JOB
  skill_ids       UUID[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'PLANNED',
  start_date      DATE,
  end_date        DATE,
  hours           DECIMAL(5,1),
  certificate_url TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE super_employee_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  stage           TEXT NOT NULL,
  stage_date      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ai_tools_used   TEXT[] NOT NULL DEFAULT '{}',
  productivity_delta DECIMAL(5,1),
  jobs_cross_role INTEGER DEFAULT 0,
  notes           TEXT
);

-- ═══════════════════════════════════════
-- CULTURE MODULE
-- ═══════════════════════════════════════

CREATE TABLE ps_survey_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  questions       JSONB NOT NULL DEFAULT '[]',  -- PsQuestion[]
  frequency       TEXT NOT NULL DEFAULT 'MONTHLY',
  status          TEXT NOT NULL DEFAULT 'DRAFT',
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ps_survey_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id       UUID NOT NULL REFERENCES ps_survey_templates(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  -- ⚠️ NO user_id column — anonymous by design
  anonymous_token TEXT NOT NULL,               -- UUID สำหรับตรวจ duplicate
  responses       JSONB NOT NULL DEFAULT '[]', -- { question_id, value }[]
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(survey_id, anonymous_token)           -- ป้องกัน duplicate แต่ไม่ระบุตัวตน
);

CREATE TABLE ps_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  period          TEXT NOT NULL,               -- "2026-W35" or "2026-09"
  overall_score   DECIMAL(5,1) NOT NULL,
  dimension_scores JSONB NOT NULL DEFAULT '{}',
  response_count  INTEGER NOT NULL DEFAULT 0,
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, period)
);

CREATE TABLE anonymous_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  -- ⚠️ NO user_id column — anonymous by design
  category        TEXT NOT NULL,
  content         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'OPEN',
  admin_response  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER employees_updated_at BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER training_records_updated_at BEFORE UPDATE ON training_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER ps_survey_templates_updated_at BEFORE UPDATE ON ps_survey_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════

-- Enable RLS on all new tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_employee_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE ps_survey_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ps_survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ps_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE anonymous_feedback ENABLE ROW LEVEL SECURITY;

-- EMPLOYEES: org members can read, ADMIN/OWNER can write
CREATE POLICY "employees_read" ON employees
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "employees_write_admin" ON employees
  FOR ALL USING (
    org_id = get_user_org_id()
    AND get_user_org_role() IN ('OWNER', 'ADMIN')
  );

-- SKILLS: org members can read, ADMIN/OWNER can write
CREATE POLICY "skills_read" ON skills
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "skills_write_admin" ON skills
  FOR ALL USING (
    org_id = get_user_org_id()
    AND get_user_org_role() IN ('OWNER', 'ADMIN')
  );

-- PS_SURVEY_RESPONSES: insert only (no read by org members — protects anonymity)
-- OWNER/ADMIN can only read aggregate scores (ps_scores), not individual responses
CREATE POLICY "ps_responses_insert" ON ps_survey_responses
  FOR INSERT WITH CHECK (org_id = get_user_org_id());
-- NO SELECT policy on ps_survey_responses — only Edge Function aggregates them

-- PS_SCORES: org members can read aggregates
CREATE POLICY "ps_scores_read" ON ps_scores
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "ps_scores_write_system" ON ps_scores
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

-- ANONYMOUS_FEEDBACK: insert by any member, manage by ADMIN/OWNER
CREATE POLICY "feedback_insert" ON anonymous_feedback
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "feedback_manage_admin" ON anonymous_feedback
  FOR SELECT USING (
    org_id = get_user_org_id()
    AND get_user_org_role() IN ('OWNER', 'ADMIN')
  );

CREATE POLICY "feedback_update_admin" ON anonymous_feedback
  FOR UPDATE USING (
    org_id = get_user_org_id()
    AND get_user_org_role() IN ('OWNER', 'ADMIN')
  );

COMMIT;
```

---

### 4.4 Plan Feature Gates {#44-plan-feature-gates}

```typescript
// src/tenant/types.ts — เพิ่มใน PLAN_LIMITS

export const PLAN_LIMITS = {
  FREE: {
    // ... existing limits ...
    max_employees: 5,
    people_module: false,
    culture_module: false,
    ai_assist: false,
    super_employee: false,
  },
  STARTER: {
    // ... existing limits ...
    max_employees: 10,
    people_module: true,           // Employee profiles only
    culture_module: false,
    ai_assist: false,
    super_employee: false,
  },
  PROFESSIONAL: {
    // ... existing limits ...
    max_employees: 50,
    people_module: true,           // Full: Skills matrix, Training
    culture_module: true,          // PS Survey, Anonymous Feedback
    ai_assist: false,
    super_employee: false,
  },
  ENTERPRISE: {
    // ... existing limits ...
    max_employees: -1,             // Unlimited
    people_module: true,           // Full + Capacity planning
    culture_module: true,          // Full + Benchmarks + AI recommendations
    ai_assist: true,               // AI Cost Estimation, AI Scheduler
    super_employee: true,          // Super Employee Tracker
  },
} satisfies Record<OrgPlan, PlanLimits>;
```

---

## 5. สรุปและขั้นตอนถัดไป {#5-สรุป}

### 5.1 Key Decisions ที่ต้องทำ

1. **✅ ยืนยัน v17.0 scope** — เริ่ม People + Culture module พร้อมกัน (evidence: ทั้งสองสูงมาก 89%/85%)
2. **🔲 กำหนด PS Survey frequency** — Monthly (ง่ายกว่า) หรือ Weekly (ข้อมูลละเอียดกว่า)?
3. **🔲 AI-Assist approach** — Build in-house model หรือ integrate Supabase AI / OpenAI?
4. **🔲 Employee vs OrgMember** — พนักงาน factory ที่ไม่มี MONOLITH account จะจัดการอย่างไร?
5. **🔲 Anonymity guarantee** — จะแจ้ง users อย่างไรว่า PS survey anonymous จริง?

### 5.2 ไฟล์ที่ต้อง create ต่อไป

| ไฟล์ | หมายเหตุ |
|------|---------|
| `src/people/types.ts` | TypeScript types (ตามที่เสนอในส่วน 4.2) |
| `src/people/peopleStore.ts` | Zustand store |
| `src/culture/types.ts` | TypeScript types |
| `src/culture/cultureStore.ts` | Zustand store |
| `20261001_people_culture_schema.sql` | Database migration (ตามส่วน 4.3) |
| `src/people/peopleQueries.ts` | Supabase query helpers |
| `src/culture/cultureQueries.ts` | Supabase query helpers (anonymized) |

### 5.3 Critical Path

```
[เขียน types.ts] → [เขียน SQL migration] → [เขียน Zustand stores]
    → [เขียน Supabase queries] → [เขียน UI components]
    → [เพิ่ม plan gates ใน TenantProvider] → [E2E tests]
```

---

## อ้างอิง

1. SLR บูรณาการ: การออกแบบองค์กรยุค AI — กรอบแนวคิด 2S2P1C และวัฒนธรรมองค์กร (PRISMA 2020, 756 บทความ, สิงหาคม 2026)
2. MONOLITH Manufacturing OS README v16.0 — Multi-Tenant SaaS Platform Documentation
3. MONOLITH Architecture v16.0 — Multi-Tenant Architecture, Auth, RLS, Onboarding Flow
4. Amy Edmondson (1999). Psychological Safety and Learning Behavior in Work Teams. *Administrative Science Quarterly.*
5. MIT Task Force on the Work of the Future — Future of Work Research (2021–2026)

---

*เอกสารนี้จัดทำขึ้นสำหรับทีมพัฒนา MONOLITH โดยอิงจากหลักฐานทางวิชาการ 756 บทความ  
อัปเดตล่าสุด: 28 สิงหาคม 2026*
