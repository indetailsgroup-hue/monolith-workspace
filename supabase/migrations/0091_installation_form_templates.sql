-- Migration: installation_form_templates — installation-pm task 1.5c (D-2 form_templates + seed v0.1)
-- Depends on: 0090 (installation_* core, fn_installation_is_member ไม่เกี่ยวตรงนี้), C12 helpers
--
-- ที่มา seed: .kiro/specs/installation-pm/form-templates-installation-v0.1.md — **ผ่าน owner review แล้ว**
--   (Installation.xlsx 2020 + สำหรับคุณชุ.xlsx 2025 — SOP นิ่งใช้จริง 5 ปี; corrections ครบ:
--    P1/P2/P3 = ช่างคนที่ 1/2/3 เลนขนาน · ประปา = conditional item เลน 2 ของ T2 · ไม่แตก variant)
--   เหลือ sanity check กับหัวหน้าทีมตอน rollout จริง (จดใน tasks 1.5c)
--
-- Data model (D-2): versioned + immutable หลัง publish — new version = แถวใหม่ (Req 5)
-- Normalization จาก draft: ทุก item เป็น object {label, optional?, note?, photo_required?}
--   - "Wrapping 📷" → {"label":"Wrapping","photo_required":true} — จุดถ่ายรูปเข้า capture installation_proof
--   - {"item":...,"optional":true} → {"label":...,"optional":true}

create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  version int not null default 1,
  kind text not null default 'checklist' check (kind in ('checklist', 'report')),
  -- ประเภทห้องที่ template ใช้ได้ (jsonb array ของ room_type) — null = ไม่ผูกห้อง (เช่น T0 ระดับบ้าน)
  applies_to jsonb null,
  -- เลนช่าง 1-3 — null = ไม่ผูกเลน (T0 ของหัวหน้าทีม)
  lane int null check (lane between 1 and 3),
  -- ชื่อภาษาคนที่ผู้ใช้เห็น (UX tenet — ห้ามโชว์ template_key หน้าบ้าน)
  title text not null,
  items jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  published_at timestamptz null,
  created_by text not null default public.resolve_actor(),
  created_at timestamptz not null default timezone('utc', now()),
  unique (template_key, version)
);

-- immutable หลัง publish: แก้ได้อย่างเดียวคือ retire (เนื้อหาอื่นห้ามขยับ — อยากแก้ = ออก version ใหม่)
create or replace function public.form_templates_published_immutable()
returns trigger language plpgsql as $$
begin
  if old.status = 'published' then
    if tg_op = 'DELETE' then
      raise exception 'published form template is immutable: DELETE is not permitted'
        using errcode = 'restrict_violation';
    end if;
    if new.status = 'retired'
       and to_jsonb(new) - 'status' = to_jsonb(old) - 'status' then
      return new;  -- อนุญาต retire เท่านั้น (field อื่นต้องไม่เปลี่ยน)
    end if;
    raise exception 'published form template is immutable: publish a new version instead'
      using errcode = 'restrict_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
drop trigger if exists trg_form_templates_immutable on public.form_templates;
create trigger trg_form_templates_immutable
  before update or delete on public.form_templates
  for each row execute function public.form_templates_published_immutable();

-- RLS: template เป็นสมบัติกลางของบริษัท — อ่านได้ทุกคนที่ login, เขียนเฉพาะ governance (template governance)
alter table public.form_templates enable row level security;
create policy form_templates_sel on public.form_templates
  for select to authenticated using (true);
create policy form_templates_ins on public.form_templates
  for insert to authenticated with check (public.is_governance_role());
create policy form_templates_upd on public.form_templates
  for update to authenticated
  using (public.is_governance_role()) with check (public.is_governance_role());

-- ---------------------------------------------------------------------------
-- Seed v1 (published — ผ่าน owner review 5 ก.ค. 2026)
-- ---------------------------------------------------------------------------
insert into public.form_templates (template_key, version, kind, applies_to, lane, title, items, status, published_at)
values
  -- T0: site readiness — หัวหน้าทีมยืนยันก่อน approve start (workflow flow เดิม)
  ('inst_site_readiness', 1, 'checklist', null, null, 'ตรวจความพร้อมหน้างานก่อนเริ่มติดตั้ง',
   jsonb_build_array(
     jsonb_build_object('label', 'Check all area 3D final จาก Production Planning'),
     jsonb_build_object('label', 'Floor checking'),
     jsonb_build_object('label', 'Defect checking'),
     jsonb_build_object('label', 'Electricity checking'),
     jsonb_build_object('label', 'Water supply system'),
     jsonb_build_object('label', 'Wall checking'),
     jsonb_build_object('label', 'Door checking'),
     jsonb_build_object('label', 'Ceiling checking')
   ), 'published', timezone('utc', now())),

  -- T1: ครัว — เลนช่างคนที่ 1
  ('inst_kitchen_tech1', 1, 'checklist', '["master_kitchen","kitchen"]'::jsonb, 1, 'งานครัว — ช่างคนที่ 1',
   jsonb_build_array(
     jsonb_build_object('label', 'เช็คพื้น'), jsonb_build_object('label', 'ตรวจสอบ Defect'),
     jsonb_build_object('label', 'ตรวจสอบฝ้า'), jsonb_build_object('label', 'ประกอบอลูมิเนียม'),
     jsonb_build_object('label', 'ติดตั้งอลูมิเนียม'), jsonb_build_object('label', 'ตรวจสอบขนาดตู้'),
     jsonb_build_object('label', 'จัดตู้วางตำแหน่งแต่ละจุด'), jsonb_build_object('label', 'ติดตั้งผนังระหว่างตู้'),
     jsonb_build_object('label', 'ติดตั้งงาน Top'), jsonb_build_object('label', 'ติดตั้งอุปกรณ์ภายในตู้'),
     jsonb_build_object('label', 'ระบบไฟฟ้า'), jsonb_build_object('label', 'เก็บงานซิลิโคน'),
     jsonb_build_object('label', 'ตรวจสอบหน้าบานให้เรียบร้อย'), jsonb_build_object('label', 'ทำความสะอาด'),
     jsonb_build_object('label', 'Wrapping', 'photo_required', true)
   ), 'published', timezone('utc', now())),

  -- T1: ครัว — เลนช่างคนที่ 2
  ('inst_kitchen_tech2', 1, 'checklist', '["master_kitchen","kitchen"]'::jsonb, 2, 'งานครัว — ช่างคนที่ 2',
   jsonb_build_array(
     jsonb_build_object('label', 'ไฟฟ้าผนัง'), jsonb_build_object('label', 'ระบบน้ำประปา'),
     jsonb_build_object('label', 'ตรวจสอบผนัง'), jsonb_build_object('label', 'ตรวจสอบประตู'),
     jsonb_build_object('label', 'ประกอบอลูมิเนียม'), jsonb_build_object('label', 'ติดตั้งอลูมิเนียม'),
     jsonb_build_object('label', 'ติดตั้งตู้'), jsonb_build_object('label', 'จัดตู้วางตำแหน่งแต่ละจุด'),
     jsonb_build_object('label', 'ติดตั้งผนังระหว่างตู้'), jsonb_build_object('label', 'ติดตั้งงาน Top'),
     jsonb_build_object('label', 'ติดตั้งอุปกรณ์ภายในตู้'), jsonb_build_object('label', 'ระบบไฟฟ้าภายในตู้'),
     jsonb_build_object('label', 'เก็บงานซิลิโคน'), jsonb_build_object('label', 'ตรวจสอบระบบไฟอีกรอบ'),
     jsonb_build_object('label', 'ทำความสะอาด'),
     jsonb_build_object('label', 'Wrapping', 'photo_required', true)
   ), 'published', timezone('utc', now())),

  -- T1: ครัว — เลนช่างคนที่ 3
  ('inst_kitchen_tech3', 1, 'checklist', '["master_kitchen","kitchen"]'::jsonb, 3, 'งานครัว — ช่างคนที่ 3',
   jsonb_build_array(
     jsonb_build_object('label', 'Check point of measure'), jsonb_build_object('label', 'Offset point'),
     jsonb_build_object('label', 'Point of x=0,y=0'), jsonb_build_object('label', 'ตรวจสอบขนาดอลูมิเนียม'),
     jsonb_build_object('label', 'ประกอบอลูมิเนียม'), jsonb_build_object('label', 'ติดตั้งอลูมิเนียม'),
     jsonb_build_object('label', 'ติดตั้งตู้'), jsonb_build_object('label', 'ปรับประตูตู้'),
     jsonb_build_object('label', 'ติดตั้งงาน Top'), jsonb_build_object('label', 'ระบบน้ำประปา'),
     jsonb_build_object('label', 'เก็บงานฝ้า'), jsonb_build_object('label', 'เก็บงานซิลิโคน TOP'),
     jsonb_build_object('label', 'เช็คอุปกรณ์ภายในตู้'), jsonb_build_object('label', 'ทำความสะอาด'),
     jsonb_build_object('label', 'Wrapping', 'photo_required', true)
   ), 'published', timezone('utc', now())),

  -- T2: ห้องทั่วไป — เลนช่างคนที่ 1
  ('inst_room_tech1', 1, 'checklist',
   '["living","home_office","office","master_bedroom","bedroom_2","bedroom_3"]'::jsonb, 1,
   'งานห้องทั่วไป — ช่างคนที่ 1',
   jsonb_build_array(
     jsonb_build_object('label', 'เช็คพื้น'), jsonb_build_object('label', 'ตรวจสอบ Defect'),
     jsonb_build_object('label', 'ตรวจสอบฝ้า'), jsonb_build_object('label', 'ประกอบอลูมิเนียม'),
     jsonb_build_object('label', 'ติดตั้งอลูมิเนียม'), jsonb_build_object('label', 'ตรวจสอบขนาดตู้'),
     jsonb_build_object('label', 'จัดตู้วางตำแหน่งแต่ละจุด'), jsonb_build_object('label', 'ติดตั้งผนังระหว่างตู้'),
     jsonb_build_object('label', 'ติดตั้งอุปกรณ์ภายในตู้'), jsonb_build_object('label', 'ระบบไฟฟ้า'),
     jsonb_build_object('label', 'เก็บงานซิลิโคน'), jsonb_build_object('label', 'ทำความสะอาด'),
     jsonb_build_object('label', 'Wrapping', 'photo_required', true)
   ), 'published', timezone('utc', now())),

  -- T2: ห้องทั่วไป — เลนช่างคนที่ 2 (ประปา = conditional item ตามมติ owner — ไม่แตก variant)
  ('inst_room_tech2', 1, 'checklist',
   '["living","home_office","office","master_bedroom","bedroom_2","bedroom_3"]'::jsonb, 2,
   'งานห้องทั่วไป — ช่างคนที่ 2',
   jsonb_build_array(
     jsonb_build_object('label', 'ไฟฟ้าผนัง'),
     jsonb_build_object('label', 'ระบบน้ำประปา', 'optional', true, 'note', 'เฉพาะห้องที่มีงานประปา เช่น home office/pantry'),
     jsonb_build_object('label', 'ตรวจสอบผนัง'), jsonb_build_object('label', 'ตรวจสอบประตู'),
     jsonb_build_object('label', 'ประกอบอลูมิเนียม'), jsonb_build_object('label', 'ติดตั้งอลูมิเนียม'),
     jsonb_build_object('label', 'ติดตั้งตู้'), jsonb_build_object('label', 'จัดตู้วางตำแหน่งแต่ละจุด'),
     jsonb_build_object('label', 'ติดตั้งผนังระหว่างตู้'), jsonb_build_object('label', 'ติดตั้งอุปกรณ์ภายในตู้'),
     jsonb_build_object('label', 'ระบบไฟฟ้าภายในตู้'), jsonb_build_object('label', 'เก็บงานซิลิโคน'),
     jsonb_build_object('label', 'ทำความสะอาด'),
     jsonb_build_object('label', 'Wrapping', 'photo_required', true)
   ), 'published', timezone('utc', now())),

  -- T2: ห้องทั่วไป — เลนช่างคนที่ 3
  ('inst_room_tech3', 1, 'checklist',
   '["living","home_office","office","master_bedroom","bedroom_2","bedroom_3"]'::jsonb, 3,
   'งานห้องทั่วไป — ช่างคนที่ 3',
   jsonb_build_array(
     jsonb_build_object('label', 'Check point of measure'), jsonb_build_object('label', 'Offset point'),
     jsonb_build_object('label', 'Point of x=0,y=0'), jsonb_build_object('label', 'ตรวจสอบขนาดอลูมิเนียม'),
     jsonb_build_object('label', 'ประกอบอลูมิเนียม'), jsonb_build_object('label', 'ติดตั้งอลูมิเนียม'),
     jsonb_build_object('label', 'ติดตั้งตู้'), jsonb_build_object('label', 'ปรับประตูตู้'),
     jsonb_build_object('label', 'เก็บงานฝ้า'), jsonb_build_object('label', 'ตรวจสอบประตูตู้อีกรอบ'),
     jsonb_build_object('label', 'ตรวจสอบระบบไฟอีกรอบ'), jsonb_build_object('label', 'เช็คอุปกรณ์ภายในตู้'),
     jsonb_build_object('label', 'ทำความสะอาด'),
     jsonb_build_object('label', 'Wrapping', 'photo_required', true)
   ), 'published', timezone('utc', now()))
on conflict (template_key, version) do nothing;

comment on table public.form_templates is
  'installation-pm D-2 (Req 5): checklist/report templates — versioned, immutable หลัง publish (new version = แถวใหม่); seed v1 จาก form-templates-installation-v0.1.md (owner review ผ่าน 5 ก.ค. 2026)';
