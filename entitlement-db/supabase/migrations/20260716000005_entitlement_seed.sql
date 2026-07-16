-- =====================================================================
-- MONOLITH Entitlement DB (separate Supabase project — ADR-034)
-- seed: 4 plans + 53 features + 212 plan_entitlement rows (D-2: seed must be complete)
-- SPLIT VERBATIM from .kiro/specs/entitlement-tier/schema-draft-v0.3.sql
--   (v0.3 = SSOT; passed security reviews v0.1->v0.2 S1-S4/L5-L9, v0.2->v0.3 F1-F4)
--   lines 430-569 — DO NOT edit here without updating the spec SSOT first.
-- Ordering note: tasks.md says "init -> RLS -> functions -> ..." loosely, but the
--   RLS policies call is_member() so the dependency-correct chain is
--   init -> functions -> RLS -> triggers -> seed (matches the draft own run order).
-- =====================================================================

-- =====================================================================
-- 7. SEED — 4 plans · 53 features (status ตามหลักฐานโค้ดจริง) · 212 rows [F3][F4]
-- =====================================================================
insert into public.plans(code,name,price_cents,billing_interval,sort_order,is_public) values
  ('free','Free',0,'month',0,true),
  ('plus','Plus',59000,'month',1,true),
  ('advance','Advance',290000,'month',2,true),
  ('enterprise','Enterprise',0,'custom',3,false)
on conflict (code) do nothing;

insert into public.features(key,name,category,kind,unit,status) values
  -- Design (implemented — มีจริงใน MONOLITH: generator/compartment/clearance/snap)
  ('design.create_component','Create new component','design','boolean',null,'implemented'),
  ('design.cabinet_generator','Parametric Cabinet Generator','design','boolean',null,'implemented'),
  ('design.divide_cell','Divide frame/cell','design','boolean',null,'implemented'),
  ('design.door_drawer_builder','Door/drawer auto-builder','design','boolean',null,'implemented'),
  ('design.clearance_check','Collision & clearance check','design','boolean',null,'implemented'),
  ('design.multi_cabinet','Multi-cabinet snap layout','design','boolean',null,'implemented'),
  ('design.custom_hardware_lib','Custom hardware library (org)','design','boolean',null,'roadmap'),
  -- Fitting
  ('fitting.manual','Manual Fitting','fitting','boolean',null,'implemented'),
  ('fitting.auto','Auto Fitting','fitting','boolean',null,'implemented'),
  ('fitting.drawer_slide','Drawer slide','fitting','boolean',null,'implemented'),
  ('hardware.engine_packs','Hardware engine packs (AVENTOS/Box/Lamello/Ixconnect)','fitting','boolean',null,'roadmap'),
  -- Detailing
  ('edge.manual','Edge Banding Manual','detailing','boolean',null,'implemented'),
  ('edge.auto','Edge Banding Auto','detailing','boolean',null,'implemented'),
  -- BOM
  ('bom.basic','Basic BOM','bom','boolean',null,'implemented'),
  ('bom.advance','Advance BOM','bom','boolean',null,'implemented'),
  ('bom.export_xlsx','Export XLSX','bom','boolean',null,'implemented'),
  -- Label (ยังไม่พบระบบ label ในโค้ด → roadmap ทั้งกลุ่ม)
  ('label.basic','Label Basic','label','boolean',null,'roadmap'),
  ('label.advance','Label Advance (barcode/QR)','label','boolean',null,'roadmap'),
  ('label.no_watermark','No watermark','label','boolean',null,'roadmap'),
  -- Nesting (โค้ดมี FFDH rectangular; true-shape/offcut/SA-GA = design)
  ('nest.basic','Nesting Basic (rectangular FFDH)','nest','boolean',null,'implemented'),
  ('nest.advance','Nesting Advance (true-shape/NFP)','nest','boolean',null,'roadmap'),
  ('nest.max_sheets','Max nest sheets/job','nest','limit_param','sheets/job','implemented'),
  ('nest.offcut_inventory','Offcut inventory','nest','boolean',null,'roadmap'),
  ('nest.optimizer_pro','Nesting Optimizer Pro (SA/GA + cut sequence)','nest','boolean',null,'roadmap'),
  -- CAM / Export
  ('cam.dogbone','Dog Bone','cam','boolean',null,'roadmap'),
  ('cam.machine_origin','Machine Origin Setting','cam','boolean',null,'implemented'),
  ('cam.advance_machine','Advance Machine (tool table/feeds)','cam','boolean',null,'implemented'),
  ('cam.kerf_bending','Kerf bending / curved panels','cam','boolean',null,'roadmap'),
  ('cam.tool_wear','Tool Wear Intelligence','cam','boolean',null,'implemented'),
  ('export.gcode','G-code export','cam','boolean',null,'implemented'),
  ('export.dxf','DXF export','cam','boolean',null,'implemented'),
  ('export.p2p_native','P2P native export (Biesse CIX/Homag MPR/XXL)','cam','boolean',null,'implemented'),
  ('export.panel_saw','Panel saw cutting-list','cam','boolean',null,'implemented'),
  ('export.six_side_drill','Six-side drilling data','cam','boolean',null,'roadmap'),
  ('export.step','STEP 3D export','cam','boolean',null,'implemented'),
  ('export.pdf_report','PDF report export','cam','boolean',null,'implemented'),
  ('export.cutlist_dialects','Cut-list CSV dialects (HOMAG/BIESSE/SCM)','cam','boolean',null,'implemented'),
  ('machine.profiles','Machine profiles','cam','stock_quota','count','implemented'),
  -- Platform (cloud sync ยังไม่มีจริง — โค้ดเป็น localStorage/local-first)
  ('storage.cloud_enabled','Cloud storage enabled','platform','boolean',null,'roadmap'),
  ('storage.cloud_mb','Cloud storage','platform','stock_quota','MB','roadmap'),
  ('platform.projects','Projects','platform','stock_quota','count','implemented'),
  ('platform.cabinets_per_project','Cabinets per project','platform','limit_param','count','implemented'),
  ('platform.seats','Seats (multi-user org)','platform','stock_quota','count','roadmap'),
  ('platform.local_first','Offline / local-first','platform','boolean',null,'implemented'),
  ('report.co2','CO2 / sustainability report','platform','boolean',null,'implemented'),
  -- Trust (มีจริง: Ed25519 receipt + offline verify + manifest/merkle)
  ('trust.signed_export','Signed export + offline verify (Ed25519)','trust','boolean',null,'implemented'),
  ('trust.audit_chain','Audit manifest chain + Merkle proof','trust','boolean',null,'implemented'),
  -- Advanced / Integration (ยังไม่มีจริงทั้งกลุ่ม)
  ('ai.design_assist','AI design assist','advanced','metered_quota','runs/month','roadmap'),
  ('integration.erp','ERP integration','advanced','boolean',null,'roadmap'),
  ('integration.api','Public API','advanced','boolean',null,'roadmap'),
  ('platform.sso','SSO / SAML','advanced','boolean',null,'roadmap'),
  ('platform.self_host','Self-host / on-prem','advanced','boolean',null,'roadmap'),
  ('support.priority','Priority support / SLA','advanced','boolean',null,'implemented')
on conflict (key) do nothing;

-- tier matrix 53 × 4 = 212 แถว (ค่า tier คงเดิม + แถวใหม่ 11 ตัว)
-- ⚠️ roadmap features ยังใส่ mapping ตาม tier ที่ตั้งใจขายในอนาคต —
--    resolver [F2] จะบล็อกให้เองจนกว่า status จะพลิกเป็น implemented
insert into public.plan_entitlements(plan_code,feature_key,bool_value,limit_value) values
  -- ✓ ทุก tier
  ('free','design.create_component',true,null),('plus','design.create_component',true,null),('advance','design.create_component',true,null),('enterprise','design.create_component',true,null),
  ('free','design.cabinet_generator',true,null),('plus','design.cabinet_generator',true,null),('advance','design.cabinet_generator',true,null),('enterprise','design.cabinet_generator',true,null),
  ('free','fitting.manual',true,null),('plus','fitting.manual',true,null),('advance','fitting.manual',true,null),('enterprise','fitting.manual',true,null),
  ('free','fitting.drawer_slide',true,null),('plus','fitting.drawer_slide',true,null),('advance','fitting.drawer_slide',true,null),('enterprise','fitting.drawer_slide',true,null),
  ('free','edge.manual',true,null),('plus','edge.manual',true,null),('advance','edge.manual',true,null),('enterprise','edge.manual',true,null),
  ('free','bom.basic',true,null),('plus','bom.basic',true,null),('advance','bom.basic',true,null),('enterprise','bom.basic',true,null),
  ('free','label.basic',true,null),('plus','label.basic',true,null),('advance','label.basic',true,null),('enterprise','label.basic',true,null),
  ('free','nest.basic',true,null),('plus','nest.basic',true,null),('advance','nest.basic',true,null),('enterprise','nest.basic',true,null),
  ('free','export.gcode',true,null),('plus','export.gcode',true,null),('advance','export.gcode',true,null),('enterprise','export.gcode',true,null),
  ('free','export.dxf',true,null),('plus','export.dxf',true,null),('advance','export.dxf',true,null),('enterprise','export.dxf',true,null),
  ('free','storage.cloud_enabled',true,null),('plus','storage.cloud_enabled',true,null),('advance','storage.cloud_enabled',true,null),('enterprise','storage.cloud_enabled',true,null),
  ('free','platform.local_first',true,null),('plus','platform.local_first',true,null),('advance','platform.local_first',true,null),('enterprise','platform.local_first',true,null),
  -- ✓ Plus ขึ้นไป
  ('free','design.divide_cell',false,null),('plus','design.divide_cell',true,null),('advance','design.divide_cell',true,null),('enterprise','design.divide_cell',true,null),
  ('free','design.door_drawer_builder',false,null),('plus','design.door_drawer_builder',true,null),('advance','design.door_drawer_builder',true,null),('enterprise','design.door_drawer_builder',true,null),
  ('free','design.clearance_check',false,null),('plus','design.clearance_check',true,null),('advance','design.clearance_check',true,null),('enterprise','design.clearance_check',true,null),
  ('free','design.multi_cabinet',false,null),('plus','design.multi_cabinet',true,null),('advance','design.multi_cabinet',true,null),('enterprise','design.multi_cabinet',true,null),
  ('free','fitting.auto',false,null),('plus','fitting.auto',true,null),('advance','fitting.auto',true,null),('enterprise','fitting.auto',true,null),
  ('free','edge.auto',false,null),('plus','edge.auto',true,null),('advance','edge.auto',true,null),('enterprise','edge.auto',true,null),
  ('free','bom.advance',false,null),('plus','bom.advance',true,null),('advance','bom.advance',true,null),('enterprise','bom.advance',true,null),
  ('free','bom.export_xlsx',false,null),('plus','bom.export_xlsx',true,null),('advance','bom.export_xlsx',true,null),('enterprise','bom.export_xlsx',true,null),
  ('free','label.advance',false,null),('plus','label.advance',true,null),('advance','label.advance',true,null),('enterprise','label.advance',true,null),
  ('free','label.no_watermark',false,null),('plus','label.no_watermark',true,null),('advance','label.no_watermark',true,null),('enterprise','label.no_watermark',true,null),
  ('free','nest.advance',false,null),('plus','nest.advance',true,null),('advance','nest.advance',true,null),('enterprise','nest.advance',true,null),
  ('free','cam.dogbone',false,null),('plus','cam.dogbone',true,null),('advance','cam.dogbone',true,null),('enterprise','cam.dogbone',true,null),
  ('free','cam.machine_origin',false,null),('plus','cam.machine_origin',true,null),('advance','cam.machine_origin',true,null),('enterprise','cam.machine_origin',true,null),
  ('free','export.pdf_report',false,null),('plus','export.pdf_report',true,null),('advance','export.pdf_report',true,null),('enterprise','export.pdf_report',true,null),
  ('free','report.co2',false,null),('plus','report.co2',true,null),('advance','report.co2',true,null),('enterprise','report.co2',true,null),
  -- ✓ Advance ขึ้นไป
  ('free','nest.offcut_inventory',false,null),('plus','nest.offcut_inventory',false,null),('advance','nest.offcut_inventory',true,null),('enterprise','nest.offcut_inventory',true,null),
  ('free','nest.optimizer_pro',false,null),('plus','nest.optimizer_pro',false,null),('advance','nest.optimizer_pro',true,null),('enterprise','nest.optimizer_pro',true,null),
  ('free','hardware.engine_packs',false,null),('plus','hardware.engine_packs',false,null),('advance','hardware.engine_packs',true,null),('enterprise','hardware.engine_packs',true,null),
  ('free','cam.advance_machine',false,null),('plus','cam.advance_machine',false,null),('advance','cam.advance_machine',true,null),('enterprise','cam.advance_machine',true,null),
  ('free','cam.kerf_bending',false,null),('plus','cam.kerf_bending',false,null),('advance','cam.kerf_bending',true,null),('enterprise','cam.kerf_bending',true,null),
  ('free','cam.tool_wear',false,null),('plus','cam.tool_wear',false,null),('advance','cam.tool_wear',true,null),('enterprise','cam.tool_wear',true,null),
  ('free','export.p2p_native',false,null),('plus','export.p2p_native',false,null),('advance','export.p2p_native',true,null),('enterprise','export.p2p_native',true,null),
  ('free','export.panel_saw',false,null),('plus','export.panel_saw',false,null),('advance','export.panel_saw',true,null),('enterprise','export.panel_saw',true,null),
  ('free','export.six_side_drill',false,null),('plus','export.six_side_drill',false,null),('advance','export.six_side_drill',true,null),('enterprise','export.six_side_drill',true,null),
  ('free','export.step',false,null),('plus','export.step',false,null),('advance','export.step',true,null),('enterprise','export.step',true,null),
  ('free','export.cutlist_dialects',false,null),('plus','export.cutlist_dialects',false,null),('advance','export.cutlist_dialects',true,null),('enterprise','export.cutlist_dialects',true,null),
  ('free','trust.signed_export',false,null),('plus','trust.signed_export',false,null),('advance','trust.signed_export',true,null),('enterprise','trust.signed_export',true,null),
  ('free','integration.erp',false,null),('plus','integration.erp',false,null),('advance','integration.erp',true,null),('enterprise','integration.erp',true,null),
  ('free','support.priority',false,null),('plus','support.priority',false,null),('advance','support.priority',true,null),('enterprise','support.priority',true,null),
  -- ✓ Enterprise เท่านั้น
  ('free','design.custom_hardware_lib',false,null),('plus','design.custom_hardware_lib',false,null),('advance','design.custom_hardware_lib',false,null),('enterprise','design.custom_hardware_lib',true,null),
  ('free','trust.audit_chain',false,null),('plus','trust.audit_chain',false,null),('advance','trust.audit_chain',false,null),('enterprise','trust.audit_chain',true,null),
  ('free','integration.api',false,null),('plus','integration.api',false,null),('advance','integration.api',false,null),('enterprise','integration.api',true,null),
  ('free','platform.sso',false,null),('plus','platform.sso',false,null),('advance','platform.sso',false,null),('enterprise','platform.sso',true,null),
  ('free','platform.self_host',false,null),('plus','platform.self_host',false,null),('advance','platform.self_host',false,null),('enterprise','platform.self_host',true,null),
  -- quotas / params (null = ∞)
  ('free','nest.max_sheets',null,5),('plus','nest.max_sheets',null,50),('advance','nest.max_sheets',null,null),('enterprise','nest.max_sheets',null,null),
  ('free','machine.profiles',null,1),('plus','machine.profiles',null,3),('advance','machine.profiles',null,null),('enterprise','machine.profiles',null,null),
  ('free','storage.cloud_mb',null,500),('plus','storage.cloud_mb',null,20000),('advance','storage.cloud_mb',null,200000),('enterprise','storage.cloud_mb',null,null),
  ('free','platform.projects',null,3),('plus','platform.projects',null,null),('advance','platform.projects',null,null),('enterprise','platform.projects',null,null),
  ('free','platform.cabinets_per_project',null,20),('plus','platform.cabinets_per_project',null,null),('advance','platform.cabinets_per_project',null,null),('enterprise','platform.cabinets_per_project',null,null),
  ('free','platform.seats',null,1),('plus','platform.seats',null,3),('advance','platform.seats',null,10),('enterprise','platform.seats',null,null),
  -- metered
  ('free','ai.design_assist',null,5),('plus','ai.design_assist',null,100),('advance','ai.design_assist',null,1000),('enterprise','ai.design_assist',null,null)
on conflict (plan_code,feature_key) do nothing;
