# MONOLITH Manufacturing OS — Deep Technical Review (ฉบับเจาะลึก)

> **Version:** v16.0.0 · **วันที่ Review:** 28 สิงหาคม 2026  
> **Scope:** ทุกองค์ประกอบ — Architecture, Security, Type System, State Management, People Module, 2S2P1C Integration, Code Quality, Performance, Roadmap  
> **อ้างอิง:** README.md, ARCHITECTURE.md, types.ts, tenantStore.ts, orgScopedQuery.ts, 20260828_multi_tenant_schema.sql, SECURITY_REVIEW_RLS.md, src/people/types.ts, src/people/peopleStore.ts, MONOLITH_2S2P1C_FEATURE_SPEC_ROADMAP.md

---

## Executive Summary

MONOLITH v16.0 คือ multi-tenant SaaS Manufacturing OS ที่สร้างบน React 18 + TypeScript + Zustand + Supabase สำหรับธุรกิจผลิตเฟอร์นิเจอร์และตู้ครัวในประเทศไทย โดยมี DAPH Decor เป็น primary tenant

การ review ครอบคลุม 10 ไฟล์หลัก (รวม 3,990 บรรทัด) พบ:

| ด้าน | ประเมิน | หมายเหตุ |
|------|---------|---------|
| Multi-tenant Architecture | ⭐⭐⭐⭐ (4/5) | Design ดี แต่ get_user_org_id() พัง |
| Database Schema | ⭐⭐⭐⭐ (4/5) | Normalized, indexes ดี |
| Security / RLS | ⭐⭐ (2/5) | **2 Critical, 2 High issues** |
| TypeScript Type System | ⭐⭐⭐⭐⭐ (5/5) | Excellent — strict, mapper, helper ครบ |
| State Management (Zustand) | ⭐⭐⭐⭐⭐ (5/5) | Patterns สม่ำเสมอ, granular loading |
| People Module (NEW) | ⭐⭐⭐⭐ (4/5) | ครอบคลุม, SLR-aligned, persist ถูกต้อง |
| 2S2P1C Integration | ⭐⭐⭐⭐ (4/5) | Evidence-based, roadmap ชัดเจน |
| Code Quality | ⭐⭐⭐⭐ (4/5) | Consistent, readable, ขาด tests |
| Performance Readiness | ⭐⭐⭐ (3/5) | ดีพอ prototype, ต้องปรับก่อน scale |
| 2S2P1C Coverage (v16.0) | System 80% / People 40% / Culture 10% | gap ใหญ่ที่ Culture |

**สรุป:** Foundation แข็งแกร่งมาก — type system, architecture, และ patterns เป็น production-quality แต่ต้องแก้ security ก่อน launch และต้องสร้าง Culture module เพิ่ม

---

## สารบัญ

1. [System Architecture](#1-system-architecture)
2. [Multi-tenant Design](#2-multi-tenant-design)
3. [Database Schema & Migration](#3-database-schema--migration)
4. [Security & RLS Deep Dive](#4-security--rls-deep-dive)
5. [TypeScript Type System](#5-typescript-type-system)
6. [State Management — Zustand](#6-state-management--zustand)
7. [People Module — Full Analysis](#7-people-module--full-analysis)
8. [2S2P1C Framework Integration](#8-2s2p1c-framework-integration)
9. [Code Quality & Maintainability](#9-code-quality--maintainability)
10. [Performance & Scalability](#10-performance--scalability)
11. [Gap Analysis — What's Missing](#11-gap-analysis--whats-missing)
12. [Strategic Roadmap Recommendations](#12-strategic-roadmap-recommendations)
13. [สรุปและ Action Items](#13-สรุปและ-action-items)

---

## 1. System Architecture

### 1.1 Overview

```
Browser (React 18 + Vite)
  └─ Zustand Stores (state management)
       └─ Supabase Client (REST + Realtime)
            └─ Supabase Cloud
                 ├─ PostgreSQL (data + RLS)
                 ├─ Auth (email/OAuth/magic link)
                 ├─ Realtime (WebSocket subscriptions)
                 ├─ Storage (files/images)
                 └─ Edge Functions (server-side logic)
```

MONOLITH เป็น **client-heavy SPA** — ไม่มี custom backend server ทั้งหมดพึ่ง Supabase managed services Trade-off: development speed สูง แต่ vendor lock-in กับ Supabase

### 1.2 Tech Stack Assessment

| Component | Technology | Assessment |
|-----------|-----------|-----------|
| Frontend | React 18 + Vite | ✅ Modern, fast HMR, good ecosystem |
| Language | TypeScript (strict) | ✅ Excellent type safety |
| State | Zustand + persist | ✅ Lightweight, performant, simple API |
| Styling | Tailwind CSS | ✅ Consistent, rapid UI |
| Backend | Supabase (BaaS) | ⚠️ Vendor lock-in, limited custom logic |
| Database | PostgreSQL + RLS | ✅ Battle-tested, RLS เป็น best practice |
| Auth | Supabase Auth | ✅ Covers email/OAuth/magic link |
| Realtime | Supabase Realtime | ⚠️ Connection limits ตาม plan |
| Testing | Vitest + Playwright | ⚠️ Listed แต่ยังไม่มี tests จริง |
| Deployment | Vercel + Supabase | ✅ Zero-config deployment |
| Export | ExcelJS + jsPDF | ✅ Good for Thai manufacturing context |

### 1.3 Module Map (v16.0)

```
src/
├── tenant/           ✅ COMPLETE — Multi-tenant core
├── jobs/             ✅ COMPLETE — Job lifecycle, kanban, analytics
├── quotation/        ⚠️ PARTIAL — Quotation builder
├── ledger/           ⚠️ PARTIAL — Finance & accounting
├── factory/          ⚠️ PARTIAL — Factory dashboard
├── designer/         ⚠️ PARTIAL — Cabinet designer
├── nesting/          ⚠️ PARTIAL — Panel nesting optimizer
├── export/           ✅ COMPLETE — XLSX, DXF, PDF
├── iam/              ✅ COMPLETE — Role-based access
├── core/             ✅ COMPLETE — Auth, store, UI primitives
├── routes/           ✅ COMPLETE — React Router v6
├── people/           🆕 NEW — HR & People module (types + store done)
└── culture/          ❌ NOT STARTED — Psychological Safety
```

### 1.4 Route Map Analysis

| Path | Access Control | Status |
|------|---------------|--------|
| `/` | All | ✅ |
| `/onboarding` | New users | ✅ |
| `/jobs` | DESIGNER, FACTORY, ADMIN | ✅ |
| `/jobs/analytics` | ADMIN, FINANCE | ✅ |
| `/quotations` | FINANCE, ADMIN | ⚠️ Partial |
| `/factory` | FACTORY | ⚠️ Partial |
| `/settings` | ADMIN, OWNER | ✅ |
| `/people` | ADMIN, OWNER | 🆕 New — route ยังไม่มีใน routes/ |
| `/culture` | All | ❌ Not built |

**ข้อสังเกต:** People module มี types + store แล้ว แต่ยังต้องสร้าง components + routes

---

## 2. Multi-tenant Design

### 2.1 Isolation Strategy

MONOLITH ใช้ **Shared Database, Shared Schema** model — approach ที่ cost-effective และ simple ที่สุด

| Layer | Mechanism | Quality |
|-------|----------|---------|
| Database | PostgreSQL RLS — `org_id = get_user_org_id()` | ⚠️ Critical bug in function |
| Application | `useTenant()` hook + `scopeToOrg()` helper | ✅ Well-designed |
| API | Edge Functions validate org_id | ✅ Defense in depth |
| Frontend | `<OrgGuard>` + `<FeatureGate>` components | ✅ Good DX |
| Storage | Supabase buckets scoped by `org_id/` prefix | ✅ |

### 2.2 Organization Data Model

```typescript
Organization {
  orgId: string;       // UUID PK
  name: string;
  slug: string;        // unique URL key: monolith.app/{slug}
  plan: OrgPlan;       // FREE | STARTER | PROFESSIONAL | ENTERPRISE
  status: OrgStatus;   // ACTIVE | SUSPENDED | TRIAL | CANCELLED
  maxUsers: number;
  maxJobsPerMonth: number;
  settings: OrgSettings;  // JSONB — locale, currency, timezone, feature flags
  trialEndsAt?: string;
}
```

**จุดแข็ง:**
- `slug` ทำให้ URL เป็น human-readable
- `settings` เป็น JSONB ยืดหยุ่นดีแต่ต้องระวัง schema drift
- `maxUsers` / `maxJobsPerMonth` enforce plan limits ที่ DB level ได้

**จุดที่ควรปรับ:**
- `trialEndsAt` ถูกจัดเก็บ โดย DB-level enforcement ติดตามอยู่ใน Security Issue 7
- `settings` ควรมี JSON Schema validation

### 2.3 Role Hierarchy

```
OWNER (100) → สร้าง org, จัดการ billing, ลบ org
ADMIN (80)  → จัดการ members, settings
DESIGNER (60) → สร้าง jobs, quotations
FACTORY (60)  → อัพเดต production status
FINANCE (60)  → ดู/จัดการ invoices, ledger
INSTALLER (40) → อัพเดต delivery status
VIEWER (10)   → อ่านอย่างเดียว
```

**การใช้ numeric weight เป็น pattern ที่ดี** — `hasPermission(member, 'DESIGNER')` ตรวจ `weight >= 60` ได้ง่าย แต่ DESIGNER / FACTORY / FINANCE อยู่ที่ weight เดียวกัน (60) ทำให้ logic ที่ต้องแยก role-specific permissions ต้องใช้ exact role check แทน weight check

### 2.4 Feature Gates

```typescript
PLAN_LIMITS: Record<OrgPlan, { maxUsers; maxJobsPerMonth; features: string[] }>
```

Pattern นี้ดี — single source of truth แต่:
- Feature names เป็น string literals อาจ typo ได้ ควรทำเป็น `as const` enum
- ไม่มี server-side validation ที่ Edge Function (ถ้ามี) ต้องตรวจซ้ำ

---

## 3. Database Schema & Migration

### 3.1 Schema Quality Assessment

**`organizations` table:**
```sql
✅ gen_random_uuid() เป็น default — ดีกว่า auto-increment สำหรับ multi-tenant
✅ slug UNIQUE constraint ถูกต้อง
✅ plan + status มี CHECK constraints
✅ settings JSONB มี sensible defaults
✅ trial_ends_at TIMESTAMPTZ — type ถูกต้อง
⚠️ ไม่มี updated_at trigger บาง tables (trigger มีแค่ organizations)
```

**`org_members` table:**
```sql
✅ UNIQUE(org_id, user_id) — ป้องกัน duplicate membership
✅ CASCADE DELETE — ลบ org แล้วลบ members โดยอัตโนมัติ
✅ role CHECK constraint ครบ
⚠️ email column ซ้ำซ้อน (มีอยู่ใน auth.users) → potential inconsistency
```

**`org_invitations` table:**
```sql
✅ token UNIQUE + DEFAULT encode(gen_random_bytes(32), 'hex') — secure token generation
✅ expires_at DEFAULT (now() + interval '7 days') — ดี
🔴 ไม่มี RLS — CRITICAL ISSUE
⚠️ ไม่มี index บน (org_id, status) สำหรับ active invitations query
```

### 3.2 Index Strategy

```sql
-- มีอยู่แล้ว ✅
idx_organizations_slug         -- fast slug lookup
idx_org_members_user           -- fast user → orgs lookup
idx_org_members_org            -- fast org → members lookup
idx_org_invitations_token      -- fast token verification
idx_org_invitations_email      -- fast email lookup

-- ควรเพิ่ม ⚠️
idx_org_invitations_org_status -- (org_id, status) สำหรับ active invites
idx_jobs_org_status            -- (org_id, status) สำหรับ kanban queries
idx_employees_org_active       -- (org_id, is_active) สำหรับ people list
```

### 3.3 Migration Strategy Assessment

| Aspect | Current | Recommended |
|--------|---------|------------|
| Naming | `YYYYMMDD_description.sql` ✅ | Keep |
| Idempotency | `IF NOT EXISTS` ✅ | Keep |
| Rollback | ❌ ไม่มี | เพิ่ม down migrations |
| Tracking | ❌ ไม่มี migration history table | เพิ่ม `schema_migrations` table |
| Testing | ❌ ไม่มี | Test migrations ใน CI |
| Version Control | ✅ Git | Keep |

### 3.4 Data Types Review

```sql
✅ UUID สำหรับ primary keys — ปลอดภัยสำหรับ multi-tenant
✅ TIMESTAMPTZ สำหรับ timestamps — timezone-aware ถูกต้อง
✅ TEXT สำหรับ enums + CHECK constraint — flexible
✅ JSONB สำหรับ settings — queryable JSON
⚠️ org_id บน legacy tables เป็น NULLABLE (jobs, quotations, invoices, ledger)
   ควรเพิ่ม NOT NULL constraint หลัง data migration
```

---

## 4. Security & RLS Deep Dive

> อ้างอิง: SECURITY_REVIEW_RLS.md (414 lines, 9 issues)

### 4.1 Severity Summary

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | `org_invitations` ไม่มี RLS | 🔴 Critical | ❌ ยังไม่แก้ |
| 2 | `get_user_org_id()` ใช้ `LIMIT 1` — พัง multi-org | 🔴 Critical | ❌ ยังไม่แก้ |
| 3 | `organizations` ขาด INSERT + DELETE policy | 🟠 High | ❌ ยังไม่แก้ |
| 4 | ADMIN ลบ OWNER ได้ | 🟠 High | ❌ ยังไม่แก้ |
| 5 | Write ops ไม่ตรวจ role | 🟡 Medium | ❌ ยังไม่แก้ |
| 6 | ไม่มี Audit Trail | 🟡 Medium | ❌ ยังไม่แก้ |
| 7 | Trial expiry ไม่ enforce ที่ DB | 🟡 Medium | ❌ ยังไม่แก้ |
| 8 | `_tenant_insert` policies ซ้ำซ้อน | 🔵 Low | ❌ ยังไม่แก้ |
| 9 | Policy ไม่ใช้ helper function สม่ำเสมอ | 🔵 Low | ❌ ยังไม่แก้ |

### 4.2 Critical Issue 1 — `org_invitations` ไม่มี RLS

```sql
-- ปัจจุบัน: table สร้างแล้วแต่ RLS ไม่ได้ enable
-- ผลกระทบ: ทุก authenticated user อ่าน/เขียน invitations ของทุก org ได้

-- Fix ทันที:
ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_select_own_org" ON public.org_invitations
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "invitations_insert_admin" ON public.org_invitations
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN') AND is_active = true
    )
  );
```

### 4.3 Critical Issue 2 — `get_user_org_id()` พัง Multi-org

```sql
-- ปัจจุบัน (BROKEN):
CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS UUID AS $$
  SELECT org_id FROM public.org_members
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;   -- ⚠️ user ใน 2 orgs → คืน org แรกเสมอ
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Fix — ใช้ session variable:
CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := current_setting('app.current_org_id', true)::UUID;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = auth.uid() AND org_id = v_org_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'TENANT_ISOLATION: user is not a member of org %', v_org_id;
  END IF;
  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

**ฝั่ง TypeScript — set session เมื่อ switch org:**
```typescript
// tenantStore.ts → setCurrentOrg() / switchOrg()
async function setOrgSession(orgId: string) {
  await supabase.rpc('set_config', {
    setting_name: 'app.current_org_id',
    new_value: orgId,
    is_local: true,
  });
}
```

### 4.4 Defense-in-Depth Analysis

```
Layer 1: Supabase Auth (JWT) — ✅ ทำงานได้
Layer 2: get_user_org_id() RLS — 🔴 Critical bug
Layer 3: Application scopeToOrg() — ✅ ทำงาน แต่ bypass ได้หาก RLS พัง
Layer 4: assertOrgOwnership() — ✅ ดี แต่ opt-in (ไม่ enforce อัตโนมัติ)
Layer 5: FeatureGate + OrgGuard — ✅ UI-level gate
```

**ปัญหา:** Layer 2 พัง ทำให้ tenant isolation ทั้งหมดอยู่บน Layer 3 ที่ application code เขียนถูกต้อง ซึ่งไม่ปลอดภัยพอ

### 4.5 Role-Based Write Protection Gap

ปัจจุบัน policies บน jobs/quotations/invoices/ledger ตรวจแค่ `org_id` ไม่ได้ตรวจ role:

```sql
-- ปัจจุบัน: VIEWER ลบ job ได้!
CREATE POLICY "jobs_tenant_isolation" ON public.jobs
  USING (org_id = public.get_user_org_id());

-- ควรเป็น:
CREATE POLICY "jobs_delete_admin" ON public.jobs
  FOR DELETE USING (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = auth.uid()
        AND org_id = public.get_user_org_id()
        AND role IN ('OWNER', 'ADMIN')
        AND is_active = true
    )
  );
```

### 4.6 Security Checklist (Pre-Launch)

```
[ ] 🔴 Enable RLS + policies บน org_invitations
[ ] 🔴 แก้ get_user_org_id() ให้ใช้ session variable
[ ] 🟠 เพิ่ม INSERT + DELETE policy บน organizations
[ ] 🟠 ป้องกัน ADMIN ลบ/แก้ role ของ OWNER
[ ] 🟡 เพิ่ม role checks บน write operations ทุก table
[ ] 🟡 สร้าง audit_log table + triggers
[ ] 🟡 เพิ่ม is_org_active() check ใน write policies
[ ] 🔵 ลบ _tenant_insert policies ที่ซ้ำซ้อน
[ ] 🔵 Standardize การใช้ get_user_org_id() ทุก policy
```

---

## 5. TypeScript Type System

### 5.1 Overall Assessment: ⭐⭐⭐⭐⭐ (Excellent)

Type system ของ MONOLITH เป็นหนึ่งในจุดแข็งที่สุด ออกแบบด้วย 3-layer architecture:

```
Layer 1: DB Row Types (snake_case)
  └─ EmployeeRow, SkillRow, TrainingRecordRow, ...

Layer 2: Domain Types (camelCase)
  └─ Employee, Skill, TrainingRecord, ...

Layer 3: UI/Derived Types
  └─ EmployeeWithSkills, SkillGapAnalysis, PeopleDashboardMetrics, ...
```

### 5.2 Tenant Types (types.ts)

```typescript
// ✅ Pattern ดี: Union types สำหรับ enums
export type OrgPlan = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
export type OrgRole = 'OWNER' | 'ADMIN' | 'DESIGNER' | 'FACTORY' | 'INSTALLER' | 'FINANCE' | 'VIEWER';

// ✅ Const object — single source of truth สำหรับ role weights
export const ORG_ROLE_HIERARCHY: Record<OrgRole, number> = {
  OWNER: 100, ADMIN: 80, DESIGNER: 60, FACTORY: 60, INSTALLER: 40, FINANCE: 60, VIEWER: 10,
};

// ✅ PLAN_LIMITS — feature gate config ครบ
export const PLAN_LIMITS: Record<OrgPlan, { maxUsers; maxJobsPerMonth; features: string[] }> = ...

// ✅ Helper functions — pure, testable
export function hasPermission(member: OrgMember, requiredRole: OrgRole): boolean
export function canAccessFeature(org: Organization, feature: string): boolean
export function isTrialExpired(org: Organization): boolean
```

**จุดที่ควรปรับ:**
- Feature names ใน `PLAN_LIMITS.features` เป็น `string[]` ควรทำเป็น `const` array ของ union type
- ควรเพิ่ม Branded Types สำหรับ IDs: `type OrgId = string & { readonly _brand: 'OrgId' }`

### 5.3 People Module Types (src/people/types.ts — 606 lines)

```typescript
// ✅ SkillLevel + numeric score — clean, calculable
export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export const SKILL_LEVEL_SCORE: Record<SkillLevel, number> = {
  BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3, EXPERT: 4,
};

// ✅ SuperEmployeeStage — SLR-aligned, 5 stages
export type SuperEmployeeStage = 'AI_UNAWARE' | 'AI_AWARE' | 'AI_ASSISTED' | 'AI_PARTNER' | 'SUPER_EMPLOYEE';
export const SUPER_EMPLOYEE_STAGE_SCORE: Record<SuperEmployeeStage, number> = {
  AI_UNAWARE: 0, AI_AWARE: 25, AI_ASSISTED: 50, AI_PARTNER: 75, SUPER_EMPLOYEE: 100,
};

// ✅ Thai labels — localizable
export const SUPER_EMPLOYEE_STAGE_LABEL_TH: Record<SuperEmployeeStage, string> = {
  AI_UNAWARE: 'ยังไม่รู้จัก AI', AI_AWARE: 'รู้จัก AI แล้ว', ...
};

// ✅ DB Row Types → Domain Mappers — explicit, no magic
export function mapEmployee(row: EmployeeRow): Employee { ... }
export function mapSkill(row: SkillRow): Skill { ... }

// ✅ Pure Helper Functions — testable in isolation
export function filterEmployees(employees: Employee[], filters: EmployeeFilters): Employee[]
export function computeSkillGap(employee, skills, employeeSkills, trainingRecords): SkillGapAnalysis
export function computePeopleDashboardMetrics(employees, skills, allEmployeeSkills, trainingRecords): PeopleDashboardMetrics
export function getNextStage(current: SuperEmployeeStage): SuperEmployeeStage | null
```

**จุดดีเด่น:** Derived types (EmployeeWithSkills, SkillGapItem, SkillMatrixRow, PeopleDashboardMetrics) ทำให้ component code clean มาก

**จุดที่ควรปรับ:**
- `computeSkillGap` กำหนด `requiredLevel = 'INTERMEDIATE'` เหมือนกันทั้ง AI และ non-AI skills ควรใช้ `skill.aiPartnerThreshold` สำหรับ AI skills

---

## 6. State Management — Zustand

### 6.1 Pattern Consistency

ทั้ง `tenantStore` และ `peopleStore` ใช้ pattern เดียวกัน:

```typescript
// Pattern ✅ — State + Actions แยกชัดเจน
interface XxxState { /* data + loading flags + error */ }
interface XxxActions { /* all action methods */ }
type XxxStore = XxxState & XxxActions;

// ✅ create<XxxStore>()(persist(...))
export const useXxxStore = create<XxxStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      // actions...
    }),
    {
      name: 'monolith-xxx-store',
      partialize: (state) => ({ /* only lightweight data */ }),
    }
  )
);
```

### 6.2 tenantStore Analysis

**จุดดี:**
- `computePermissions()` เป็น pure function แยกออกมา — testable
- `partialize` persist เฉพาะ `currentOrg`, `currentMember`, `userOrgs` — ถูกต้อง
- `clear()` ใช้ `set(initialState)` — clean
- `updatePlan()` sync `maxUsers` + `maxJobsPerMonth` กับ `PLAN_LIMITS` โดยอัตโนมัติ

**จุดที่ควรปรับ:**
- `switchOrg()` ทำแค่ set currentOrg แต่ไม่ fetch member record สำหรับ new org — comment บอกว่า "In real app, would fetch member record" แสดงว่ายังไม่ implement
- `createInvitation()` / `acceptInvitation()` เป็น optimistic updates ล้วนๆ ไม่มี Supabase call — ยังไม่เชื่อมกับ DB

### 6.3 peopleStore Analysis

**จุดดี:**
- **13 granular loading flags** — UX ดีมาก ไม่ต้อง block UI ทั้งหมดระหว่าง single operation
- **Lazy loading** — `employeeSkillsByEmployee` / `trainingByEmployee` / `progressByEmployee` load on demand ไม่ load ทั้งหมดตั้งแต่ต้น
- **Defence-in-depth** บน mutations: `.eq('id', id).eq('org_id', orgId)` ทำให้แม้ RLS พัง application filter ยัง scope ถูก
- **`loadAllEmployeeSkills`** scope ผ่าน `employeeIds` array เพราะ `employee_skills` table ไม่มี `org_id` column — แก้ปัญหาได้ elegant

**จุดที่ควรปรับ:**
- `deleteSkill()` purge cache จาก `employeeSkillsByEmployee` ถูกต้อง แต่ไม่ invalidate `trainingByEmployee` ที่ reference `skillIds` → stale data
- `advanceSuperEmployeeStage()` ทำ 2 DB calls แยก (insert progress → update employee) ควรทำเป็น database transaction หรือ stored procedure
- ไม่มี retry logic สำหรับ network failures

### 6.4 Persist Strategy Comparison

| Store | Persisted | Not Persisted | Rationale |
|-------|----------|--------------|-----------|
| tenantStore | currentOrg, currentMember, userOrgs | loading, invitations, members | ✅ Context ต้องรอดหลัง refresh |
| peopleStore | employees, skills, filters | employeeSkills, training, progress, all loading/error | ✅ Relationships always fresh |

Pattern นี้ถูกต้อง — persist เฉพาะ stable catalogue data ไม่ persist relationship data ที่เปลี่ยนบ่อย

---

## 7. People Module — Full Analysis

### 7.1 Scope & Motivation

People module ออกแบบตาม **P2 (People)** dimension ของ 2S2P1C — มี evidence weight สูงสุดจาก SLR (89%) People ที่ได้รับการ empower ด้วย AI tools สามารถ reduce resource usage 8–33x เมื่อเทียบกับ traditional employees

### 7.2 Data Model Design

```
employees ─────────────────── org_id (tenant scope)
    │
    ├─── employee_skills ───── skill_id
    │         │                    │
    │         │               skills (org catalogue)
    │         │
    ├─── training_records ──── skill_ids[] (targets skills)
    │
    └─── super_employee_progress ─── immutable audit trail
```

**จุดดีในการออกแบบ:**
- `user_id` บน `Employee` เป็น nullable — รองรับ factory workers ที่ไม่มี MONOLITH account
- `employee_skills` ใช้ upsert pattern บน conflict `(employee_id, skill_id)` — ไม่มี duplicate
- `super_employee_progress` เป็น immutable audit trail — ไม่มี UPDATE เฉพาะ INSERT → stage progression history ไม่สูญหาย
- `roleRelevance: OrgRole[]` บน Skill ทำให้ gap analysis รู้ว่า skill ไหน required สำหรับ role ไหน

### 7.3 Derived Types Quality

```typescript
// EmployeeWithSkills — UI rendering
interface EmployeeWithSkills extends Employee {
  skills: EmployeeSkillWithDetails[];  // embedded Skill object
  trainingRecords: TrainingRecord[];
  progressHistory: SuperEmployeeProgress[];
}

// SkillGapAnalysis — per-employee gap report
interface SkillGapAnalysis {
  employee: Employee;
  items: SkillGapItem[];   // required vs actual per skill
  coverageScore: number;   // 0–100
}

// SkillMatrixRow — org-wide matrix
interface SkillMatrixRow {
  skill: Skill;
  employeeLevels: Record<string, SkillLevel>;  // employeeId → level
  proficientCount: number;
  gapCount: number;
}

// PeopleDashboardMetrics — dashboard KPIs
interface PeopleDashboardMetrics {
  totalEmployees: number;
  activeEmployees: number;
  avgSuperEmployeeScore: number;   // 0–100
  superEmployeeCount: number;
  aiPartnerCount: number;
  trainingCompletionRate: number;
  skillCoverageRate: number;
  topSkillGaps: Array<{ skillName: string; gapCount: number }>;
}
```

**Assessment:** Derived types ออกแบบ data-first — component code จะ clean มากเพราะไม่ต้อง compute อะไรใน JSX

### 7.4 Store Action Coverage

| Area | Actions | Complete? |
|------|---------|----------|
| Employee CRUD | load, create, update, deactivate | ✅ |
| Skills Catalogue | load, create, update, delete | ✅ |
| Employee ↔ Skill | loadOne, loadAll, set (upsert), remove | ✅ |
| Training Records | load, add, update | ✅ (ขาด delete) |
| Super Employee | loadHistory, advance | ✅ |
| Computed Selectors | filtered, withSkills, gap, dashboard | ✅ |
| Filters | set, reset | ✅ |

**ขาด:** `deleteTrainingRecord()` action

### 7.5 People Module — What's Still Needed

```
Components (ยังไม่มีเลย):
├── PeoplePage.tsx           — main People hub
├── EmployeeList.tsx         — filterable list + KPI bar
├── EmployeeCard.tsx         — summary card
├── EmployeeProfile.tsx      — full profile + skills + training
├── SkillsMatrix.tsx         — org-wide matrix view
├── TrainingTimeline.tsx     — individual training history
└── SuperEmployeeJourney.tsx — stage progress visualization

Routes (ยังไม่เพิ่ม):
/people                 — PeoplePage
/people/:employeeId     — EmployeeProfile
/people/skills-matrix   — SkillsMatrix
/people/training        — Training Management

SQL Migration (ยังไม่มี):
20261001_people_culture_schema.sql — employees, skills, employee_skills, training_records, super_employee_progress tables + RLS
```

---

## 8. 2S2P1C Framework Integration

### 8.1 Evidence Base

SLR 756 บทความ (PRISMA 2020) ให้ evidence weights:

| Dimension | Weight | MONOLITH Coverage (v16.0) | Gap |
|-----------|--------|--------------------------|-----|
| People (P2) | 89% | 40% — types + store done, no UI | High |
| Culture (C) | 85% | 10% — types planned, nothing built | Critical |
| System (S2) | 81% | 80% — jobs, quotations, finance mostly done | Low |
| Process (P1) | 77% | 60% — job lifecycle done, no work redesign tools | Medium |
| Structure (S1) | 72% | 30% — org chart not built | Medium |

### 8.2 People Dimension (P2) Assessment

**Built:**
- `src/people/types.ts` — full type system ✅
- `src/people/peopleStore.ts` — full Zustand store ✅
- Super Employee stage tracking (5 stages) ✅
- Skill gap analysis algorithm ✅
- Training records CRUD ✅

**Still Needed:**
- People module UI components ❌
- SQL migration for people tables ❌
- Performance review workflow ❌
- AI coaching recommendations ❌
- Bulk employee import (CSV) ❌

### 8.3 Culture Dimension (C) — Critical Gap

SLR finding: "High Power Distance organizations (Thailand, Southeast Asia) require specially designed psychological safety mechanisms" — anonymous feedback, tiered surveys, no top-down attribution

**Needed features:**
```
src/culture/
├── types.ts       — PsSurveyTemplate, PsSurveyResponse (NO user_id), PsScore, AnonymousFeedback
├── cultureStore.ts — survey management, response collection, score computation
├── PsSurveyPage.tsx — anonymous survey UI
├── CultureDashboard.tsx — PS trend charts, dimension breakdown
└── AnonymousFeedbackBox.tsx — anonymous suggestion box
```

**Key design constraint:** `ps_survey_responses` table **ต้องไม่มี `user_id`** — ใช้ `anonymous_token` แทน เพื่อรับประกัน anonymity ใน High Power Distance context

### 8.4 Super Employee Program — SLR Alignment

```
SLR Finding: Super Employees (AI-augmented workers) reduce resource usage 8–33x
MONOLITH Implementation:
  AI_UNAWARE (score: 0)  → ยังไม่รู้จัก AI
  AI_AWARE (score: 25)   → รู้จัก แต่ยังไม่ได้ใช้
  AI_ASSISTED (score: 50) → ใช้ AI เป็นเครื่องมือ
  AI_PARTNER (score: 75)  → ทำงานร่วมกับ AI อย่างสม่ำเสมอ
  SUPER_EMPLOYEE (100)    → AI-augmented เต็มรูปแบบ

Org-level AI Readiness Score = average(SUPER_EMPLOYEE_STAGE_SCORE[e.stage]) across all active employees
```

### 8.5 Roadmap Alignment

ตาม `MONOLITH_2S2P1C_FEATURE_SPEC_ROADMAP.md`:

```
v17.0 (Q4 2026) — Foundation
  ✅ People module types + store (DONE)
  ❌ People UI components
  ❌ SQL migration (people tables)
  ❌ org_invitations security fix

v17.5 (Q1 2027) — Culture Layer
  ❌ culture/types.ts + cultureStore.ts
  ❌ PsSurvey UI (anonymous)
  ❌ Culture dashboard

v18.0 (Q2 2027) — AI-Assist Hub
  ❌ AI cost estimation
  ❌ Production planning AI

v18.5+ (Q3 2027) — Structure + Process Tools
  ❌ OrgChart + Network visualization
  ❌ Work Redesign tools
  ❌ SOP library
```

---

## 9. Code Quality & Maintainability

### 9.1 Strengths

**Consistency:**
- Zustand store pattern สม่ำเสมอทั้ง tenantStore และ peopleStore
- Error handling pattern: try/catch → `set({ error: message })` → finally `set({ loadingX: false })`
- Naming conventions ชัดเจน: camelCase (TS), snake_case (SQL), PascalCase (types/components)

**Readability:**
- JSDoc comments บน complex functions (`computeSkillGap`, `loadAllEmployeeSkills`, `advanceSuperEmployeeStage`)
- Type definitions มี inline comments อธิบาย business logic
- `initialState` แยกออกมา — ทำให้ `clear()` implement ได้ clean

**Defensive Programming:**
- `.eq('org_id', orgId)` บน mutations เป็น double-check นอกจาก RLS
- `assertOrgOwnership()` ใน orgScopedQuery.ts
- Stage forward-only validation ใน `advanceSuperEmployeeStage`

### 9.2 Issues Found

**No Tests:**
```
src/__tests__/  — directory referenced ใน README แต่ไม่มี test files จริง
```
ฟังก์ชัน pure เช่น `computeSkillGap()`, `filterEmployees()`, `computePeopleDashboardMetrics()` testable ได้ทันที — ควร write unit tests

**Missing Error Boundary:**
ไม่มี React Error Boundary components ถ้า component crash ทั้ง app จะ crash

**No Logging:**
ไม่มี centralized error logging (Sentry, Datadog, etc.) ในทุก `catch` block มีแค่ `set({ error: message })` แต่ไม่ log ออก

**orgScopedQuery.ts — generateRlsPolicy() Risk:**
```typescript
// SQL injection risk — ชื่อ table inject โดยไม่ sanitize
export function generateRlsPolicy(tableName: string): string {
  return `CREATE POLICY ... ON public.${tableName} ...`  // ⚠️
}
```
ควรใช้ allowlist ของ table names แทน

### 9.3 Technical Debt Register

| Issue | Priority | Effort | Impact |
|-------|----------|--------|--------|
| Security RLS fixes (9 issues) | P0 | M | Critical |
| Add automated tests | P1 | L | High |
| Setup error logging (Sentry) | P1 | S | High |
| Complete People UI components | P1 | L | High |
| Create people SQL migration | P1 | M | High |
| Culture module (types + store + UI) | P2 | XL | High |
| Mobile responsive improvements | P2 | L | Medium |
| Migration tracking table | P2 | S | Medium |
| Bundle optimization / code splitting | P3 | M | Medium |
| Branded types for IDs | P3 | S | Low |

---

## 10. Performance & Scalability

### 10.1 Frontend Performance

**จุดดี:**
- Vite + React 18 — fast initial load
- Zustand granular loading flags ป้องกัน unnecessary re-renders
- Lazy loading ของ relationship data (employeeSkills, training, progress)

**จุดที่ควรปรับ:**
- ไม่มี code splitting — ทุก module load ตั้งแต่ต้น
- `employees` array ทั้งหมด persist ลง localStorage — ถ้ามี 500 คน JSON ใหญ่มาก
- ไม่มี pagination สำหรับ large lists

### 10.2 Database Performance

**Potential Bottlenecks:**

| Query Pattern | Issue | Fix |
|--------------|-------|-----|
| `loadAllEmployeeSkills` | `.in('employee_id', employeeIds)` อาจช้าถ้า array ใหญ่ | เพิ่ม index บน `employee_id` |
| `loadEmployees` | Load ทุก employee ทุกครั้ง | เพิ่ม pagination + cursor |
| RLS `get_user_org_id()` | Execute ทุก query | Cache ใน session variable |
| Skill gap computation | In-memory O(n×m) | Pre-compute ด้วย materialized view |

### 10.3 Realtime Scalability

```
Supabase Free: 200 concurrent realtime connections
Supabase Pro: 500 concurrent connections
Supabase Enterprise: unlimited

สำหรับ manufacturing floor: 50-100 concurrent users → Pro plan พอ
สำหรับ multi-tenant SaaS ที่มี 50+ orgs: ต้องระวัง connection pooling
```

**แนะนำ:** Subscribe Realtime เฉพาะ jobs table (high-churn) ไม่ต้อง subscribe employees/skills ที่เปลี่ยนน้อย

### 10.4 Scalability Limits

| Metric | Current Estimate | Scale Target |
|--------|----------------|-------------|
| Max employees/org | ~500 (localStorage limit) | 2,000 |
| Max concurrent users | ~100 (Realtime) | 1,000 |
| Max orgs (tenants) | Unlimited (DB) | 1,000 |
| Max jobs/month | Per plan limits | ∞ (ENTERPRISE) |

---

## 11. Gap Analysis — What's Missing

### 11.1 Critical (Block Launch)

```
🔴 Security: 9 RLS issues (2 Critical, 2 High)
🔴 SQL Migration: people + culture tables ไม่มี
🔴 People UI: components ทั้งหมดยังไม่ได้สร้าง
```

### 11.2 High Priority (v17.0)

```
🟠 Culture module: types + store + UI (85% SLR weight)
🟠 Route configuration: /people route ยังไม่เพิ่ม
🟠 Automated tests: unit tests สำหรับ pure functions
🟠 Error logging: Sentry / similar
🟠 Mobile responsive: factory floor users บน tablet/phone
```

### 11.3 Medium Priority (v17.5 → v18.0)

```
🟡 AI-Assist Hub: AI cost estimation, production planning
🟡 Performance review workflow
🟡 OrgChart / Network visualization
🟡 Training management UI
🟡 Analytics: People KPIs, trend charts
```

### 11.4 Lower Priority (v18.5+)

```
🔵 SSO / SAML (ENTERPRISE)
🔵 Custom domains per tenant
🔵 Payroll integration
🔵 ERP integration (SAP, Oracle)
🔵 Multi-region deployment
🔵 GDPR compliance / data export
```

---

## 12. Strategic Roadmap Recommendations

### Phase 1: Security & Foundation (เดือน 1-2)

**Priority: แก้ก่อน launch**

```sql
-- Week 1: Critical Security
[ ] แก้ get_user_org_id() ให้ใช้ session variable
[ ] เพิ่ม RLS บน org_invitations
[ ] เพิ่ม INSERT/DELETE policy บน organizations
[ ] ป้องกัน ADMIN ลบ OWNER

-- Week 2: Schema & Tests
[ ] Create 20261001_people_culture_schema.sql
[ ] Write unit tests สำหรับ types.ts helper functions
[ ] Setup Sentry error logging
[ ] Setup CI/CD pipeline
```

### Phase 2: People Module UI (เดือน 2-3)

**Priority: Feature completion**

```
People Hub
├── PeoplePage.tsx — dashboard + employee list + KPI bar
├── EmployeeProfile.tsx — full profile + skill tags + training timeline
├── SkillsMatrix.tsx — org-wide visual matrix
├── SuperEmployeeJourney.tsx — stage progression chart
├── AddEmployeeModal.tsx — form + validation
└── TrainingRecordForm.tsx — add/update training
```

### Phase 3: Culture Module (เดือน 3-4)

**Priority: SLR evidence gap**

```
Culture Foundation
├── src/culture/types.ts — PsQuestion, PsSurveyTemplate, PsSurveyResponse (NO user_id), PsScore
├── src/culture/cultureStore.ts — survey management, anonymous response handling
├── PsSurveyPage.tsx — mobile-friendly anonymous survey
├── CultureDashboard.tsx — PS trend, dimension breakdown, benchmarks
└── AnonymousFeedbackBox.tsx — always-available suggestion widget
```

**Design constraint:** ต้องออกแบบ anonymity ให้ explicit — Thai High Power Distance context ทำให้ honest feedback เป็นไปได้เฉพาะเมื่อ anonymity รับประกันอย่างชัดเจน

### Phase 4: AI Integration (เดือน 5-8)

**Priority: Differentiation**

```
AI-Assist Hub
├── AI Cost Estimation — ML model ประมาณ material cost จาก job specs
├── Production Scheduling — AI-assisted production planning
├── Skill Coaching — AI แนะนำ training path ตาม skill gaps + stage
├── Demand Forecasting — predict job volume trends
└── Quality Prediction — predict QC failure risk ก่อน production
```

### Phase 5: Structure + Process (เดือน 9-12)

**Priority: Complete 2S2P1C**

```
Structure (S1)
├── OrgChart — interactive D3 tree/network toggle
├── Role Network View — who collaborates with whom
└── Span of Control Metrics

Process (P1)
├── Work Redesign Templates
├── SOP Library
├── Bottleneck Detection
└── Process Performance KPIs
```

---

## 13. สรุปและ Action Items

### 13.1 คะแนนรวม

| มิติ | คะแนน | หมายเหตุ |
|------|--------|---------|
| Architecture | 4/5 | Solid, แต่ multi-org bug ร้ายแรง |
| Security | 2/5 | 2 Critical ต้องแก้ก่อน production |
| Type System | 5/5 | Excellent — model ให้ทีมอื่น follow |
| State Mgmt | 5/5 | Patterns สม่ำเสมอ, granular loading |
| People Module | 4/5 | Types + Store ครบ รอแค่ UI + SQL |
| 2S2P1C Alignment | 4/5 | Evidence-based, roadmap ชัด |
| Code Quality | 4/5 | Clean แต่ขาด tests |
| Performance | 3/5 | ดีพอ prototype, ต้องปรับก่อน scale |
| **Overall** | **3.9/5** | Strong foundation, critical security gaps |

### 13.2 Top 5 Actions (เรียงตาม priority)

```
1. 🔴 IMMEDIATE: แก้ get_user_org_id() + เพิ่ม RLS บน org_invitations
   → ถ้า deploy production ก่อนแก้ นี่คือ data breach ที่รอวัน

2. 🟠 THIS SPRINT: สร้าง 20261001_people_culture_schema.sql
   → People module พร้อม launch ทันทีที่มี migration

3. 🟠 THIS SPRINT: เพิ่ม role-based write policies บน jobs/quotations/ledger
   → ปัจจุบัน VIEWER ลบ job ได้

4. 🟡 NEXT SPRINT: สร้าง People UI components ครบ
   → types + store รอ UI อยู่แล้ว เป็น quick win

5. 🟡 NEXT SPRINT: เพิ่ม unit tests สำหรับ pure functions
   → computeSkillGap, filterEmployees, computePeopleDashboardMetrics testable ได้เลย
```

### 13.3 Architecture Decisions to Lock In

```
✅ KEEP: Zustand + persist pattern
✅ KEEP: 3-layer type system (Row → Domain → UI)
✅ KEEP: Granular loading flags
✅ KEEP: Defence-in-depth (.eq org_id ทุก mutation)
✅ KEEP: Immutable audit trail สำหรับ progress history
✅ KEEP: Lazy loading สำหรับ relationship data

🔄 CHANGE: get_user_org_id() → session variable
🔄 CHANGE: advanceSuperEmployeeStage() → database transaction
🔄 ADD: Branded types สำหรับ IDs
🔄 ADD: Feature name union type (แทน string[])
```

---

*MONOLITH Deep Review — สร้างจากการวิเคราะห์ source code 3,990 บรรทัด + SLR evidence 756 บทความ*  
*รายงานนี้ cover ทุก layer: Architecture → Security → Types → State → Module → Roadmap*
