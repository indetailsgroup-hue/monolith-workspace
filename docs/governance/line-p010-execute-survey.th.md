# สิทธิ์ EXECUTE ของฟังก์ชัน SECURITY DEFINER ที่เขียนตาราง LINE: ผลสำรวจแบบอ่านอย่างเดียว

วันที่: 30 กันยายน 2026 ฐานของ source: da252d18a บน codex/repair-intelligence-phase0-trust สถานะ: สำรวจเท่านั้น ไม่ได้เปลี่ยน grant EXECUTE ใด ๆ และไม่ได้อ้างว่า production เปิดฟังก์ชันเหล่านี้ผ่าน API

## เหตุที่ต้องสำรวจ

ผล catalog ของ P0-10 (da252d18a) แสดงว่า anon EXECUTE ได้ 18 จาก 20 routine แบบ SECURITY DEFINER ที่เขียนตาราง line_oa_* การรัน RED และ GREEN ของ 0198 เก็บ catalog ซ้ำและได้ผลเดิม: 0198 ถอนสิทธิ์เขียนตารางตรง แต่ EXECUTE ไม่เปลี่ยน (anon 18/20, authenticated 19/20, service_role 20/20) routine แบบ DEFINER ทำงานในสิทธิ์ของ owner ดังนั้นการ revoke สิทธิ์ตารางไม่ได้หยุด client role จากการเรียกฟังก์ชันเหล่านี้

## วิธีสำรวจ

- ผู้เรียก: ค้นชื่อในทุกไฟล์ที่ Git track ใต้ src, server, supabase/functions, packages, tools, scripts และ e2e รวมถึง migration ทั้งหมด (การเรียกจากฟังก์ชันอื่น, trigger และ cron job) ส่วนเทสต์นับจำนวนไว้ ไม่ถือเป็นผู้เรียก
- Grant ที่ตั้งใจไว้: คำสั่ง GRANT และ REVOKE ที่เขียนใน migration
- Guard: อ่านนิยามล่าสุดของแต่ละ routine และนับว่ามี guard เมื่อเนื้อฟังก์ชันตรวจผู้เรียกชัดเจน เช่น is_governance_role, has_site_access, auth.uid หรือการตรวจลายเซ็น LINE
- ประเภทที่ใช้ด้านล่าง: พบจริง (เห็นใน repository), ข้ออนุมาน (อนุมานจาก source ไม่ได้รันจริง) และยังไม่ทราบ

## ต้นเหตุ (พบจริง)

ไม่มี migration ใดสั่ง ALTER DEFAULT PRIVILEGES (ตรวจซ้ำ 2026-10-01 ที่ `a97c3c847`: `git grep -niF "alter default privileges" -- supabase/migrations` ไม่พบผล)
แต่ catalog แสดง default ACL จาก role ของแพลตฟอร์ม postgres และ supabase_admin ที่ให้ EXECUTE บนฟังก์ชันใหม่แก่ anon, authenticated และ service_role
จากนั้น migration revoke EXECUTE จาก PUBLIC เท่านั้น เช่น 0107_factory_group_milestones.sql บรรทัด 61 แล้ว grant ให้ authenticated หรือ service_role
สิทธิ์ที่ default ให้ anon โดยตรงจึงไม่เคยถูกถอน

## ผลราย routine

| Routine | ผู้เรียกใน repo (พบจริง) | Grant ที่เขียนใน migration | การตรวจผู้เรียกในเนื้อฟังก์ชัน | ความเสี่ยงต่อ anon |
|---|---|---|---|---|
| fn_prod_curated | 23 จุดในฟังก์ชัน DEFINER อื่น (0107 ถึง 0143) ไม่มีผู้เรียกจาก edge หรือ frontend | revoke จาก PUBLIC เท่านั้น (`0107_factory_group_milestones.sql:61`) | ไม่มี (`0107_factory_group_milestones.sql:50-60`) | สูง (ข้ออนุมาน): ใส่ข้อความ push สถานะ pending เข้ากลุ่มลูกค้าของโปรเจกต์ โดยผู้เรียกกำหนดข้อความใน slot เองได้ หากรู้ project id |
| fn_line_handle_group_event | rpc_ingest_line_webhook เท่านั้น (`0097_line_group_bot_flows.sql:435`) | revoke จาก PUBLIC เท่านั้น (`0097_line_group_bot_flows.sql:285`) | ไม่มี และถือว่าผู้เรียกตรวจลายเซ็น LINE แล้ว | สูง (ข้ออนุมาน): เรียกตรงจะข้ามการตรวจลายเซ็น การผูกกลุ่มต้องใช้รหัสผูกที่ถูกต้องและ postback อนุมัติต้องใช้ approve token แต่ event join, leave และ member ไม่มีด่าน เช่น event leave ปลอมจะ archive กลุ่มที่ผูกแล้วได้ถ้ารู้ LINE group id (`0107_factory_group_milestones.sql:235-240`) |
| line_oa_resolve_customer_identity | edge customer-design-view (index.ts:102 ผ่าน service client) และฟังก์ชัน ingest, order, approval | revoke จาก PUBLIC เท่านั้น (`00000000000020_line_oa_identity_resolution.sql:135`) | ไม่มี | กลาง (ข้ออนุมาน): สร้างแถว identity ให้ LINE user id ใดก็ได้ และคืน customer id |
| fn_lead_followup_sweep | cron job wf-lead-followup-sweep (`0116_lead_followup.sql:192`) | service_role เท่านั้น (`0116_lead_followup.sql:223-225`) | ไม่มี | กลาง (ข้ออนุมาน): ใครก็สั่งให้ส่ง follow-up และ escalate lead ได้ทันที |
| rpc_sweep_line_session_timeouts | ไม่มีผู้เรียกใน repo นอกจากเทสต์ | revoke จาก PUBLIC (`00000000000061_line_oa_session_timeout_sweep.sql:136`) แล้วให้ service_role เท่านั้น (`00000000000061_line_oa_session_timeout_sweep.sql:141`) | ไม่มี | ต่ำ (ข้ออนุมาน): ปิดเฉพาะ session ที่เกินเวลาแล้ว |
| rpc_ingest_line_webhook | edge line-webhook (index.ts:201 ด้วย service key) | authenticated และ service_role (`00000000000022_line_oa_ingest_webhook.sql:344-356`) | ตรวจลายเซ็น HMAC ของ LINE ก่อนเขียนทุกอย่าง | ต่ำ (ข้ออนุมาน): ปลอมได้ต้องรู้ channel secret แต่การเรียกที่ถูกปฏิเสธยังเพิ่มแถว audit 1 แถว |
| fn_welcome_on_group_bind | trigger trg_welcome_group_bind (`0136_customer_docs.sql:185-186`) | ไม่มี และ PUBLIC ก็มี EXECUTE | ใช้ได้เฉพาะเป็น trigger | ต่ำ (ข้ออนุมาน): PostgreSQL ไม่ยอมให้เรียก trigger function ตรง (ไม่ได้ทดสอบในรอบนี้) |
| rpc_send_line_outbound | ไม่มีผู้เรียกจริง (ทราบตั้งแต่ 26 กรกฎาคม 2026) | authenticated (`00000000000040_line_oa_send_outbound.sql:442`) | is_governance_role, has_site_access, 42501 | ต่ำ (ข้ออนุมาน): เนื้อฟังก์ชันปฏิเสธผู้เรียกที่ไม่มีสิทธิ์ site |
| rpc_create_line_order | ไม่มีในโค้ด | authenticated (`00000000000050_line_oa_create_order.sql:643`) | is_governance_role, has_site_access, 42501 | ต่ำ (ข้ออนุมาน) |
| rpc_evaluate_identity_merge_candidate | ไม่มีในโค้ด | authenticated (`00000000000021_line_oa_identity_merge_candidate.sql:265`) | is_governance_role, 42501 | ต่ำ (ข้ออนุมาน) |
| rpc_resolve_conversation_site | ไม่มีในโค้ด | authenticated (`00000000000030_line_oa_resolve_conversation_site.sql:254`) | is_governance_role, has_site_access, 42501 | ต่ำ (ข้ออนุมาน) |
| rpc_sync_line_forecast | ไม่มีในโค้ด | authenticated (`00000000000060_line_oa_sync_forecast.sql:278`) | is_governance_role, has_site_access, 42501 | ต่ำ (ข้ออนุมาน) |
| rpc_request_customer_acceptance | field-app LeadPanel.tsx:43 | authenticated และ service_role (`0098_customer_acceptance_flex.sql:110-113`) | is_governance_role, has_site_access | ต่ำ (ข้ออนุมาน) |
| rpc_field_assign_lead | ไม่มีในโค้ด | authenticated และ service_role (`0116_lead_followup.sql:205-220`) | auth.uid, is_governance_role, has_site_access | ต่ำ (ข้ออนุมาน) |
| rpc_field_close_lead | field-app SaleHome.tsx:34 | authenticated และ service_role (`0116_lead_followup.sql:205-220`) | is_governance_role, has_site_access | ต่ำ (ข้ออนุมาน) |
| rpc_field_set_lead_source | field-app SaleHome.tsx:42 | authenticated และ service_role (`0151_turnkey_lead_source.sql:264-273`) | is_governance_role, has_site_access | ต่ำ (ข้ออนุมาน) |
| rpc_field_send_photo_to_customer | field-app PhotoSendCard.tsx:33 | authenticated และ service_role (`0134_sender_image.sql:69-74`) | is_governance_role, has_site_access | ต่ำ (ข้ออนุมาน) |
| rpc_field_shop_drawing_revision | field-app DesignerToolsPanel.tsx:69 | authenticated และ service_role (`0143_qms_factory_design.sql:478-487`) | is_governance_role, has_site_access | ต่ำ (ข้ออนุมาน) |

"ต่ำ" หมายความเพียงว่าเนื้อฟังก์ชันดูเหมือนจะปฏิเสธ anon ยังขึ้นกับว่า guard แต่ละตัวถูกต้องทุกเส้นทางหรือไม่ ซึ่งรอบนี้ไม่ได้ทดสอบ

## ยังไม่ทราบ

- ผู้เรียกนอก repository เช่น แอปอื่น, script, ระบบอัตโนมัติ หรือเครื่องมือที่ใช้ด้วยมือ การไม่พบผู้เรียกใน repo ไม่ได้พิสูจน์ว่าไม่มี
- Production: ยังไม่ได้อ่าน grant EXECUTE, default ACL และการตั้งค่า schema ที่ PostgREST เปิด ข้อมูลในรายงานนี้ไม่ได้แสดงว่า production เปิดฟังก์ชันเหล่านี้
- พฤติกรรมจริงของ guard แต่ละตัวเมื่อ anon เรียก และการที่ PostgreSQL ปฏิเสธการเรียก trigger function ตรงในระบบนี้: ยังไม่ได้รัน

## แผนแก้ที่เสนอ (ต้องอนุมัติแยก ยังไม่ได้ทำ)

1. Migration ใหม่ (เสนอเลข 0199) revoke EXECUTE จาก anon บนทั้ง 18 routine และ revoke จาก authenticated ในตัวที่ไม่มีผู้เรียกใน repo ต้องใช้ ได้แก่ fn_prod_curated, fn_line_handle_group_event, fn_welcome_on_group_bind (รวม PUBLIC), fn_lead_followup_sweep, rpc_sweep_line_session_timeouts, line_oa_resolve_customer_identity และ rpc_ingest_line_webhook ส่วน helper ภายใน 3 ตัว (fn_prod_curated, fn_line_handle_group_event, fn_welcome_on_group_bind) ให้ถอนจาก service_role ด้วย ผู้เรียกที่เป็น DEFINER ยังทำงานได้เพราะรันในสิทธิ์ owner
2. เทสต์รูปแบบ RED/GREEN เหมือน P0-10: ตาราง has_function_privilege, การเรียกจริงด้วย anon ต้องได้ 42501 permission denied for function และเส้นทางที่ต้องยังทำงาน คือ RPC ของ field-app ด้วย authenticated พร้อม claims, edge ด้วย service_role, ฟังก์ชัน cron ในสิทธิ์ owner และ trigger welcome
3. ประสานกับเจ้าของ manufacturing OS ก่อนเปลี่ยน grant ของ fn_prod_curated เพราะฟังก์ชันฝั่งโรงงานเรียกใช้ (0107, 0124, 0143) โดยไม่ต้องแก้โค้ดโรงงาน
4. การเปลี่ยน default privileges ของฟังก์ชันในอนาคตเป็นเรื่องที่กว้างกว่าและต้องตัดสินแยก
5. การตรวจ production catalog แบบอ่านอย่างเดียวยังเป็นด่านแยกก่อน deploy
