-- C12 Foundation — Security federation helpers (DAPH / determined-williams, standalone)
--
-- Phase 4 Task 0 (verify-before-build): ปิด dependency gap ที่ตรวจพบ —
-- line_oa_* migrations (และ monolith-workflow-copilot ในอนาคต) อ้าง C12 helpers
-- (resolve_actor, has_any_app_role, has_site_access, is_governance_role,
-- current_app_roles, get_active_site_codes) แต่ helper เหล่านี้ถูก define เฉพาะใน
-- cp06-clean-cowork (TCCK) ไม่อยู่ใน determined-williams เอง → bare `supabase db reset`
-- จะ fail "function does not exist"
--
-- การตัดสิน (อ้างหลักฐาน):
--   Q1 standalone — invariant "Self-contained" (ubiquitous-language.md) +
--      separate-monolith-tcck (MONOLITH↔TCCK shared code = 0) → port เข้ามาเอง ไม่พึ่ง TCCK
--   Q2 reuse-not-fork — port implementation จริงของ JWT-helpers ตรง ๆ; ปรับเฉพาะ
--      "role vocabulary" ของ is_governance_role เป็นของ DAPH (configuration ไม่ใช่ fork)
--      หลักฐาน roles: .kiro/specs/line-oa-commerce/requirements.md §Glossary
--        Governance_Role = {admin, operations, finance, executive_owner}
--        Branch_Role     = {branch_manager, branch_operator}
--   Q3 single-site (lean, flippable) — DAPH เป็นบริษัทเดียว vertically-integrated
--      (ไม่มี topology แฟรนไชส์แบบ TCCK locations/company_id/location_type);
--      consumers เรียก get_active_site_codes() ใช้แค่คอลัมน์ site_code →
--      return single constant row. *** รอเจ้าของยืนยันแผนขยายสาขา ***
--      ถ้าขยายหลายสาขา: เปลี่ยน body เป็น query ตาราง locations ของ DAPH (flip จุดเดียว)
--
-- helper เหล่านี้พึ่ง auth.jwt()/auth.uid() (Supabase built-in) เท่านั้น — ไม่มี table dep
-- ต้อง apply ก่อน 00000000000002_line_oa_schema.sql (จุดที่ C12 ถูกอ้างครั้งแรก)

-- ---------------------------------------------------------------------------
-- JWT claim readers (ported verbatim — reuse implementation, ไม่ fork)
-- ---------------------------------------------------------------------------

create or replace function public.current_app_roles()
returns jsonb
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb);
$$;

create or replace function public.current_site_codes()
returns jsonb
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' -> 'site_codes', '[]'::jsonb);
$$;

-- Audit actor: JWT email → auth.uid() → fallback (Req 12.5 — ไม่เชื่อ id จาก client)
create or replace function public.resolve_actor(p_fallback text default 'system')
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    nullif(auth.uid()::text, ''),
    nullif(p_fallback, ''),
    'system'
  );
$$;

-- ---------------------------------------------------------------------------
-- Role / site predicates (ported verbatim)
-- ---------------------------------------------------------------------------

create or replace function public.has_app_role(p_role text)
returns boolean
language sql
stable
as $$
  select public.current_app_roles() ? p_role;
$$;

create or replace function public.has_any_app_role(p_roles text[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from unnest(coalesce(p_roles, array[]::text[])) as role_name
    where public.current_app_roles() ? role_name
  );
$$;

create or replace function public.has_site_access(p_site_code text)
returns boolean
language sql
stable
as $$
  select p_site_code is not null and public.current_site_codes() ? p_site_code;
$$;

-- ---------------------------------------------------------------------------
-- Governance role set — ADAPTED to DAPH (configuration, ไม่ใช่ fork)
-- DAPH Governance_Role = {admin, operations, finance, executive_owner}
-- (TCCK ใช้ central_operator/knowledge_curator/food_science/qa_release — ไม่เกี่ยวกับ DAPH)
-- ---------------------------------------------------------------------------

create or replace function public.is_governance_role()
returns boolean
language sql
stable
as $$
  select public.has_any_app_role(array[
    'admin',
    'operations',
    'finance',
    'executive_owner'
  ]);
$$;

-- ---------------------------------------------------------------------------
-- A1 active Site_Code source — DAPH single-site (lean Q3, flippable)
-- consumers ใช้แค่คอลัมน์ site_code → return single-column table 1 แถว
-- ค่าต้องตรง convention Site_Code = {CITY}-{AREA}-{SEQ} (line-oa Glossary; ไม่มี CHECK ที่ DB
--   แต่คงให้ตรงกัน convention ไม่ให้ขัดเงียบ ๆ)
-- *** placeholder 'BKK-HQ-01' (สมมติ HQ กทม.) — รอเจ้าของยืนยันรหัสจริง + แผนขยายสาขา ***
--   - single-site ถาวร  → คงรูปนี้ (แก้ค่าให้ตรงรหัสจริงของ DAPH)
--   - ขยายหลายสาขา      → replace body ด้วย: select site_code from public.locations where is_active
-- ---------------------------------------------------------------------------

create or replace function public.get_active_site_codes()
returns table (site_code text)
language sql
stable
as $$
  select 'BKK-HQ-01'::text as site_code;
$$;

comment on function public.current_app_roles() is 'C12: JWT app_metadata.roles for RLS/RPC guards (ported from platform C12, standalone for DAPH).';
comment on function public.resolve_actor(text) is 'C12: audit actor from JWT email/uid before fallback (Req 12.5).';
comment on function public.is_governance_role() is 'C12 (DAPH-adapted): governance roles = admin/operations/finance/executive_owner.';
comment on function public.get_active_site_codes() is 'A1 (DAPH single-site placeholder BKK-HQ-01, format {CITY}-{AREA}-{SEQ}): returns one active Site_Code. Confirm real code + flip to locations query if DAPH expands to multi-branch (Q3 pending).';
