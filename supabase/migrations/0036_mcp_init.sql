-- Migration: mcp_init — monolith-mcp-layer Phase 2 (task 1.1)
-- Depends on: C12 (resolve_actor/has_any_app_role/has_site_access/is_governance_role/get_active_site_codes),
--             0031+ workflow-copilot (approval_request / work_item — reuse, ไม่ fork)
--
-- Data layer ของ MCP Layer: enums + 5 ตาราง + RLS SELECT TO authenticated (reuse C12), ไม่มี client write policy.
-- หมายเหตุ enum: task 1.1 ระบุ enums; ค่าตรงกับ CHECK list ใน design.md (reuse-not-fork, repo convention เดียวกับ workflow-copilot).
-- มาตรฐาน naming migration: ต่อท้าย global sequence (workflow-copilot ใช้ 0001–0035 ใน folder เดียวกัน) — แผน tasks.md (0001_mcp_init) map → on-disk 0036.

-- ---------------------------------------------------------------------------
-- enums (idempotent guard ผ่าน DO block — pg ไม่มี create type if not exists)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'mcp_tool_class') then
    create type public.mcp_tool_class as enum ('Read_Tool', 'Write_Tool', 'Approval_Tool');
  end if;
  if not exists (select 1 from pg_type where typname = 'mcp_invocation_status') then
    create type public.mcp_invocation_status as enum ('executed', 'pending', 'rejected', 'expired', 'throttled', 'error');
  end if;
  if not exists (select 1 from pg_type where typname = 'mcp_pending_status') then
    create type public.mcp_pending_status as enum ('pending', 'executed', 'rejected', 'expired');
  end if;
  if not exists (select 1 from pg_type where typname = 'mcp_scope_kind') then
    create type public.mcp_scope_kind as enum ('Principal', 'MCP_Client', 'Tool_Class');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- mcp_tool_registry — catalog ของ MCP_Tool (Req 1)
-- ---------------------------------------------------------------------------
create table if not exists public.mcp_tool_registry (
  tool_name             text primary key,
  tool_class            public.mcp_tool_class not null,
  input_schema          jsonb not null,
  output_schema         jsonb not null,
  requires_approval     boolean not null,                -- true สำหรับ Write/Approval (Req 1.6)
  default_autonomy_tier text not null,
  -- invariant Req 1.6: requires_approval ต้องสอดคล้อง Tool_Class (Read = false; Write/Approval = true)
  constraint mcp_registry_approval_matches_class check (
    (tool_class = 'Read_Tool' and requires_approval = false)
    or (tool_class in ('Write_Tool', 'Approval_Tool') and requires_approval = true)
  )
);

-- ---------------------------------------------------------------------------
-- tool_invocation — บันทึกทุก Tool_Invocation (Req 2, 11, 18)
-- ---------------------------------------------------------------------------
create table if not exists public.tool_invocation (
  id               uuid primary key default gen_random_uuid(),
  tool_name        text not null references public.mcp_tool_registry (tool_name),
  tool_class       public.mcp_tool_class not null,
  principal        text not null,                        -- resolve_actor() (text, email-based) (Req 2.5) — ไม่เชื่อ client
  site_code        text,
  autonomy_tier    text not null,
  status           public.mcp_invocation_status not null,
  idempotency_key  text,
  model_provenance jsonb not null default '{"model":"unknown","provider":"unknown"}'::jsonb,  -- Req 18
  result_ref       jsonb,
  created_at       timestamptz not null default timezone('utc', now())
);
create index if not exists ix_tool_invocation_principal on public.tool_invocation (principal);
create index if not exists ix_tool_invocation_tool on public.tool_invocation (tool_name);

-- ---------------------------------------------------------------------------
-- pending_invocation — async Human_Approval_Gate state machine (Req 5, 16)
-- ---------------------------------------------------------------------------
create table if not exists public.pending_invocation (
  id                  uuid primary key default gen_random_uuid(),
  tool_invocation_id  uuid not null references public.tool_invocation (id),
  approval_request_id uuid not null,                     -- โยงเข้า workflow-copilot approval_request (reuse)
  status              public.mcp_pending_status not null default 'pending',
  invocation_expiry   timestamptz not null,              -- default now()+72h; ช่วง 1h–30d บังคับใน RPC (Req 16.1)
  created_at          timestamptz not null default timezone('utc', now())
);
create index if not exists ix_pending_invocation_status on public.pending_invocation (status, invocation_expiry);

-- ---------------------------------------------------------------------------
-- mcp_idempotency_record — (Idempotency_Key, Principal) (Req 17)
-- ---------------------------------------------------------------------------
create table if not exists public.mcp_idempotency_record (
  idempotency_key    text not null,
  principal          text not null,
  input_hash         text not null,                      -- conflict detection (Req 17.8)
  result_ref         jsonb,
  tool_invocation_id uuid references public.tool_invocation (id),
  created_at         timestamptz not null default timezone('utc', now()),
  primary key (idempotency_key, principal),              -- Req 17.1
  constraint mcp_idempotency_key_len check (length(idempotency_key) between 1 and 255)  -- Req 17.7
);

-- ---------------------------------------------------------------------------
-- mcp_rate_limit_counter — atomic counter ต่อ scope (Req 15)
-- ---------------------------------------------------------------------------
create table if not exists public.mcp_rate_limit_counter (
  scope_kind       public.mcp_scope_kind not null,
  scope_key        text not null,
  window_start     timestamptz not null,
  invocation_count int not null default 0,
  accrued_cost     numeric not null default 0,
  primary key (scope_kind, scope_key, window_start)      -- atomic upsert (Req 15.7)
);

-- ---------------------------------------------------------------------------
-- RLS: เปิดทุกตาราง, SELECT TO authenticated (reuse C12), ไม่มี client write policy.
-- ตารางที่ไม่มี site_code ใช้ predicate ที่เหมาะกับ scope ของตน (catalog=ทุกคน, principal-scoped, governance-only).
-- ---------------------------------------------------------------------------
alter table public.mcp_tool_registry      enable row level security;
alter table public.tool_invocation        enable row level security;
alter table public.pending_invocation     enable row level security;
alter table public.mcp_idempotency_record enable row level security;
alter table public.mcp_rate_limit_counter enable row level security;

-- catalog: อ่านได้ทุก authenticated (การกรองตามสิทธิ์ทำที่ discovery/Tool_Catalog — Property 1 ระดับแอป)
drop policy if exists mcp_tool_registry_sel on public.mcp_tool_registry;
create policy mcp_tool_registry_sel on public.mcp_tool_registry
  for select to authenticated using (true);

-- tool_invocation: site-scoped (มี site_code) — มาตรฐานเดียวกับ work_item
drop policy if exists tool_invocation_sel on public.tool_invocation;
create policy tool_invocation_sel on public.tool_invocation
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code));

-- pending_invocation: ไม่มี site_code → derive ผ่าน tool_invocation ที่อ้างถึง
drop policy if exists pending_invocation_sel on public.pending_invocation;
create policy pending_invocation_sel on public.pending_invocation
  for select to authenticated
  using (
    public.is_governance_role()
    or exists (
      select 1 from public.tool_invocation ti
      where ti.id = pending_invocation.tool_invocation_id
        and public.has_site_access(ti.site_code)
    )
  );

-- idempotency: principal-scoped (เจ้าของ record เห็นของตน; governance เห็นทั้งหมด)
drop policy if exists mcp_idempotency_record_sel on public.mcp_idempotency_record;
create policy mcp_idempotency_record_sel on public.mcp_idempotency_record
  for select to authenticated
  using (public.is_governance_role() or principal = public.resolve_actor());

-- rate-limit counter: operational data → governance เท่านั้น
drop policy if exists mcp_rate_limit_counter_sel on public.mcp_rate_limit_counter;
create policy mcp_rate_limit_counter_sel on public.mcp_rate_limit_counter
  for select to authenticated
  using (public.is_governance_role());
