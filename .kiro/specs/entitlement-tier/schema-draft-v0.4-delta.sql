-- =====================================================================
-- Entitlement & Multi-Tier — v0.4 DELTA (additive บน schema-draft-v0.3.sql)
-- เพิ่มหมวด Site PM (Installation PM module) — 8 features · ทั้งหมด status='roadmap'
-- ที่มา: .kiro/specs/installation-pm/ (Req 9) — ข้อเสนอ รอ owner review
-- =====================================================================
-- กติกา v0.3 ที่สืบทอด:
--   [F1] ทุก feature ใหม่ = 'roadmap' จนกว่าจะ ship (resolver hard-block [F2] ทำงานทันที)
--   [F3] seed ครบทุก (plan × feature) — ห้ามมีช่องว่าง (default-deny trap)
--   ผลรวมหลัง delta: 53 → 61 features · seed 212 → 244 rows (61×4)
--   หมายเหตุ P5 (tests-negative.sql): เช็คด้วย cross join — ครอบ delta อัตโนมัติ
--   (ข้อความ "53×4" ใน notice เป็นแค่ label; นับจริงจาก cross join)
-- ความสัมพันธ์: sitepm.photo_storage_gb เป็นโควตา media หน้างาน แยกจาก
--   storage.cloud_mb (cloud project storage) — ตั้งใจไม่รวม (design.md D-8)
-- รันหลัง v0.3 เท่านั้น · idempotent (on conflict do nothing)
-- =====================================================================

insert into public.features(key,name,category,kind,unit,status) values
  -- Site PM (Installation PM — .kiro/specs/installation-pm/) ทั้งหมด roadmap [F1]
  ('sitepm.projects','Installation projects + tasks + board','site_pm','boolean',null,'roadmap'),
  ('sitepm.line_approval','Customer approval via LINE','site_pm','boolean',null,'roadmap'),
  ('sitepm.photo_storage_gb','Site photo storage','site_pm','stock_quota','GB','roadmap'),
  ('sitepm.mobile_offline','Mobile app + offline sync','site_pm','boolean',null,'roadmap'),
  ('sitepm.gantt','Gantt + project dashboard','site_pm','boolean',null,'roadmap'),
  ('sitepm.custom_report','Custom report / digital forms + e-sign','site_pm','boolean',null,'roadmap'),
  ('sitepm.company_dashboard','Company-wide dashboard','site_pm','boolean',null,'roadmap'),
  ('sitepm.ai_voice_report','AI voice reporting','site_pm','metered_quota','runs/month','roadmap')
on conflict (key) do nothing;

insert into public.plan_entitlements(plan_code,feature_key,bool_value,limit_value) values
  -- sitepm.projects: Plus ขึ้นไป
  ('free','sitepm.projects',false,null),('plus','sitepm.projects',true,null),('advance','sitepm.projects',true,null),('enterprise','sitepm.projects',true,null),
  -- sitepm.line_approval: Plus ขึ้นไป
  ('free','sitepm.line_approval',false,null),('plus','sitepm.line_approval',true,null),('advance','sitepm.line_approval',true,null),('enterprise','sitepm.line_approval',true,null),
  -- sitepm.photo_storage_gb: free=0 (ไม่มีสิทธิ์) · plus 20GB · advance 200GB · enterprise ∞
  ('free','sitepm.photo_storage_gb',null,0),('plus','sitepm.photo_storage_gb',null,20),('advance','sitepm.photo_storage_gb',null,200),('enterprise','sitepm.photo_storage_gb',null,null),
  -- sitepm.mobile_offline: Plus ขึ้นไป
  ('free','sitepm.mobile_offline',false,null),('plus','sitepm.mobile_offline',true,null),('advance','sitepm.mobile_offline',true,null),('enterprise','sitepm.mobile_offline',true,null),
  -- sitepm.gantt: Advance ขึ้นไป
  ('free','sitepm.gantt',false,null),('plus','sitepm.gantt',false,null),('advance','sitepm.gantt',true,null),('enterprise','sitepm.gantt',true,null),
  -- sitepm.custom_report: Advance ขึ้นไป
  ('free','sitepm.custom_report',false,null),('plus','sitepm.custom_report',false,null),('advance','sitepm.custom_report',true,null),('enterprise','sitepm.custom_report',true,null),
  -- sitepm.company_dashboard: Enterprise เท่านั้น
  ('free','sitepm.company_dashboard',false,null),('plus','sitepm.company_dashboard',false,null),('advance','sitepm.company_dashboard',false,null),('enterprise','sitepm.company_dashboard',true,null),
  -- sitepm.ai_voice_report: free=0 · plus 50/เดือน · advance 500/เดือน · enterprise ∞
  ('free','sitepm.ai_voice_report',null,0),('plus','sitepm.ai_voice_report',null,50),('advance','sitepm.ai_voice_report',null,500),('enterprise','sitepm.ai_voice_report',null,null)
on conflict (plan_code,feature_key) do nothing;

-- =====================================================================
-- Release flips (ห้ามรันก่อน ship จริง — installation-pm tasks.md §Entitlement Flips)
--   Phase 1: update public.features set status='implemented'
--            where key in ('sitepm.projects','sitepm.line_approval','sitepm.photo_storage_gb');
--   Phase 2: ... 'sitepm.mobile_offline'
--   Phase 3: ... 'sitepm.gantt','sitepm.custom_report'
--   Phase 4: ... 'sitepm.company_dashboard','sitepm.ai_voice_report'
-- =====================================================================
