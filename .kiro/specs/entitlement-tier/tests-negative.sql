-- =====================================================================
-- Entitlement & Multi-Tier — Negative Tests (v0.3) · scratch DB เท่านั้น
-- ใช้กับ: schema-draft-v0.3.sql (รันก่อน) บน Supabase local / branch DB
-- วิธีรัน: supabase db reset แล้ว psql -f tests-negative.sql
-- แนวทาง: จำลอง JWT ด้วย set_config('request.jwt.claims', ...) ต่อ role
-- ครอบ Correctness Properties 1–5 ของ requirements.md
-- หมายเหตุ: เมื่อ landing จริง (Phase 1.3) ให้แปลงเป็น pgTAP ใน supabase/tests/
-- =====================================================================

begin;

-- ---------- fixtures: 2 users · 2 orgs ----------
-- สมมติ auth.users มี u1/u2 แล้ว (supabase local: สร้างผ่าน auth admin ก่อน หรือ insert ตรงใน scratch)
-- แทนที่ UUID ด้านล่างด้วยของจริงจาก auth.users ในเครื่องทดสอบ
\set u1 '''00000000-0000-0000-0000-0000000000a1'''
\set u2 '''00000000-0000-0000-0000-0000000000a2'''

-- [v0.3.1] fixtures จำลอง bootstrap path จริง: membership แรกสร้างผ่าน service role
-- (org-creation RPC/Edge Function) — insert เปล่า ๆ จะโดน trg_seat_quota →
-- feature_limit → assert_org_access ซึ่ง fail-closed สำหรับ non-member
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles(id, full_name) values (:u1,'User A'),(:u2,'User B') on conflict do nothing;
insert into public.organizations(id, name, slug) values
  ('00000000-0000-0000-0000-00000000000a','Org A','org-a'),
  ('00000000-0000-0000-0000-00000000000b','Org B','org-b') on conflict do nothing;
insert into public.memberships(org_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000000a', :u1, 'owner'),
  ('00000000-0000-0000-0000-00000000000b', :u2, 'owner') on conflict do nothing;
-- Org A = free (ไม่มี subscription → fallback free), Org B = advance
insert into public.subscriptions(org_id, plan_code, status) values
  ('00000000-0000-0000-0000-00000000000b','advance','active') on conflict do nothing;

-- helper: สวมบท user
create or replace function _as_user(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;

-- ---------- P1: Cross-org isolation ----------
do $$ begin
  perform _as_user('00000000-0000-0000-0000-0000000000a1');
  -- u1 (Org A) ต้องมองไม่เห็น Org B
  if exists (select 1 from public.organizations where slug = 'org-b') then
    raise exception 'FAIL P1.1: user A เห็น org B ผ่าน RLS';
  end if;
  -- consume ข้าม org ต้องได้ org_access_denied
  begin
    perform public.consume('00000000-0000-0000-0000-00000000000b','ai.design_assist',1);
    raise exception 'FAIL P1.2: consume ข้าม org สำเร็จ (ต้องถูกปฏิเสธ)';
  exception when insufficient_privilege then null; -- expected
  end;
  -- has_feature ข้าม org ต้องถูกปฏิเสธเช่นกัน
  begin
    perform public.has_feature('00000000-0000-0000-0000-00000000000b','export.p2p_native');
    raise exception 'FAIL P1.3: has_feature ข้าม org สำเร็จ';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS P1: cross-org isolation';
end $$;

-- ---------- P3: Roadmap hard-block ----------
do $$ begin
  perform _as_user('00000000-0000-0000-0000-0000000000a2');
  -- Org B = advance; cam.kerf_bending map = true แต่ status = roadmap → ต้อง false
  if public.has_feature('00000000-0000-0000-0000-00000000000b','cam.kerf_bending') then
    raise exception 'FAIL P3.1: roadmap feature ถูกปลดด้วย plan';
  end if;
  -- ai.design_assist (roadmap, metered) → limit ต้องเป็น 0
  if public.feature_limit('00000000-0000-0000-0000-00000000000b','ai.design_assist') <> 0 then
    raise exception 'FAIL P3.2: roadmap metered limit ต้องเป็น 0';
  end if;
  -- beta override ปลดได้
  set local role postgres;  -- จำลอง service role เขียน override
  insert into public.entitlement_overrides(org_id, feature_key, bool_value, reason)
  values ('00000000-0000-0000-0000-00000000000b','cam.kerf_bending',true,'beta')
  on conflict (org_id, feature_key) do update set bool_value = true;
  perform _as_user('00000000-0000-0000-0000-0000000000a2');
  if not public.has_feature('00000000-0000-0000-0000-00000000000b','cam.kerf_bending') then
    raise exception 'FAIL P3.3: beta override ต้องปลด roadmap ได้';
  end if;
  raise notice 'PASS P3: roadmap block + beta override';
end $$;

-- ---------- P4: Fallback free ----------
do $$ begin
  perform _as_user('00000000-0000-0000-0000-0000000000a1');
  -- Org A ไม่มี subscription → effective_plan = free → export.gcode (✓ free) ต้อง true
  if not public.has_feature('00000000-0000-0000-0000-00000000000a','export.gcode') then
    raise exception 'FAIL P4.1: org ไร้ subscription ต้องได้สิทธิ์ระดับ free';
  end if;
  -- ของ Advance-only ต้อง false
  if public.has_feature('00000000-0000-0000-0000-00000000000a','export.p2p_native') then
    raise exception 'FAIL P4.2: free ปลดของ advance ได้';
  end if;
  -- projects limit = 3 ตาม free
  if public.feature_limit('00000000-0000-0000-0000-00000000000a','platform.projects') <> 3 then
    raise exception 'FAIL P4.3: free projects limit ต้อง = 3';
  end if;
  raise notice 'PASS P4: fallback free';
end $$;

-- ---------- P2: Quota block (stock trigger) ----------
do $$ declare i int; begin
  perform _as_user('00000000-0000-0000-0000-0000000000a1');
  -- Org A (free): projects limit 3 → ใบที่ 4 ต้องล้ม
  for i in 1..3 loop
    insert into public.projects(org_id, name) values ('00000000-0000-0000-0000-00000000000a','p'||i);
  end loop;
  begin
    insert into public.projects(org_id, name) values ('00000000-0000-0000-0000-00000000000a','p4');
    raise exception 'FAIL P2.1: insert เกิน quota สำเร็จ';
  exception when check_violation then null; -- expected
  end;
  raise notice 'PASS P2: stock quota trigger';
end $$;

-- ---------- P5: Seed completeness ----------
do $$ declare v_missing int; begin
  select count(*) into v_missing
  from public.plans p cross join public.features f
  left join public.plan_entitlements pe on pe.plan_code = p.code and pe.feature_key = f.key
  where pe.plan_code is null;
  if v_missing > 0 then
    raise exception 'FAIL P5: matrix ขาด % ช่อง (ต้อง 53×4 ครบ)', v_missing;
  end if;
  raise notice 'PASS P5: seed ครบ 53×4';
end $$;

-- ---------- P1b: anon เห็นเฉพาะ plan สาธารณะ ----------
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  if exists (select 1 from public.plans where code = 'enterprise') then
    raise exception 'FAIL P1b: anon เห็น enterprise plan (is_public=false)';
  end if;
  raise notice 'PASS P1b: anon pricing scope';
end $$;

rollback;   -- ทดสอบเสร็จ ไม่ทิ้งข้อมูล
-- =====================================================================
-- NOTE: concurrency test ของ P2 (สอง session พร้อมกัน) ทำใน pgTAP/สคริปต์แยก
--       เพราะต้องเปิดสอง connection — ดู tasks Phase 1.3
-- =====================================================================
