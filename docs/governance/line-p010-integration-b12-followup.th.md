# P0-10: ข้อมูลส่งต่องานรวม branch และขอบเขต B12

30 กันยายน 2026 วิเคราะห์แบบอ่านอย่างเดียวจาก product commit `3bdd6f3e5217f3252292cd11c858be151c01f977` เอกสารนี้เป็นข้อเสนองาน ไม่ใช่การอนุมัติ merge แก้ manufacturing สร้าง 0199 ต่อ production หรือ deploy

## Containment: สาเหตุที่ยืนยันและงานส่งต่อ

`supabase/tests/repair_phase0_containment.sql:70–74` ตรวจ `rpc_factory_job_record_packet(text,text,text,text,text,text[],text[],text,text,text,text,integer)` แบบ 12 arguments แต่ definition ล่าสุดใน branch นี้ที่ `0162_factory_server_identity_released_only.sql:173` มีสิบ arguments

Local ref `origin/main` ที่ `57b69513ba0a5f0624ea3a40f9b5cea0b04992fb` และ line-trust ที่ `69c879304cc2d6c4fcdcf4070105e5a8fc4e25cd` มี `0170_factory_jobs_list_real_fields.sql` เป็น ref ในเครื่อง ไม่ได้ fetch สถานะ remote ใหม่ 0170 ลบฟังก์ชันเก่า เพิ่ม p_job_name/p_piece_count และคอลัมน์ ปรับ jobs-list และให้ EXECUTE writer ใหม่แก่ service_role เริ่มใน e04855f444806c49245741eb9122c89f1a4e840a และปรับอีกครั้งใน edc6ca94db3ef1a5e73a2df1593b5b4982dd9929

**ความเสี่ยงเรื่องลำดับ:** 0191 ถอนสิทธิ์ service จาก overload ที่มีอยู่ ณ เวลารัน (`0191_repair_phase0_revoke_legacy_mutation_authority.sql:27–38`) ถ้าลง 0170 ภายหลังอาจสร้าง writer ที่ service เรียกได้กลับมา จึงไม่ใช่ fixture ที่งาน LINE ควรสร้างแทนเงียบ ๆ

**ข้อเสนอให้เจ้าของตัดสิน:** ผู้ตัดสินใจ repo ระบุเจ้าของ manufacturing/integration ตาม PRD ส่วน 8 ข้อ 7 ให้เจ้าของนั้นกำหนดลำดับ migration/edge และทดสอบ schema รวม พร้อมตรวจ EXECUTE ที่มีผลจริงของ writer ทุก overload หลัง chain สุดท้าย รักษา containment ว่าไม่ผ่านจนกว่าจะรวมตามอนุมัติหรือแก้เทสต์อย่างมีเหตุผลในขอบเขตแยกแล้วผ่าน ห้ามลด assertion หรือใช้ LINE-only แทน CI เต็ม

การอ่านทุก ref พบ invalid ref `refs/heads/codex/repair-intelligence-phase0-trust (1)` ส่วน query ที่ระบุ valid ref ทำงานได้
จึงห้ามถือว่าเจ้าของลบ ref ซ้ำแล้ว
ไม่มีการลบ ref ในงานนี้

## B12: ขอบเขตจำกัดที่เสนอ

Catalog/survey เดิมรายงาน EXECUTE ของ writer ยี่สิบ identity: anon 18, authenticated 19, service_role 20 เป็นข้อเท็จจริงบน stack ที่สร้างใหม่ ไม่ได้ยืนยันการเปิด production API และห้ามใช้คำยืนยัน ops เรื่องผู้เขียนตารางตรงมาแทนคำยืนยันผู้เรียก RPC ภายนอก

| การเปลี่ยน role ที่เสนอ | เป้าหมายที่เสนอ | เส้นทางที่ต้องทำงานต่อ |
| --- | --- | --- |
| ถอน EXECUTE ของ anon | สิบแปด writer ที่ catalog/survey พบว่าเรียกได้ | เส้นทาง signed/service และธุรกิจ authenticated ที่จำเป็นยังทำงาน |
| ถอน authenticated บนงานภายใน/service | fn_prod_curated, fn_line_handle_group_event, fn_welcome_on_group_bind, fn_lead_followup_sweep, rpc_sweep_line_session_timeouts, line_oa_resolve_customer_identity, rpc_ingest_line_webhook | Field-app RPCs ยังคงสิทธิ์ที่มี guard ตามอนุมัติ |
| ถอน service_role ที่เรียก helper ภายในโดยตรง | fn_prod_curated, fn_line_handle_group_event, fn_welcome_on_group_bind | DEFINER chain ที่รันด้วย owner และ trigger ยังทำงาน |
| ถอน PUBLIC grants ที่ขัดกับขอบเขต | identity ตรงตาม matrix ที่อนุมัติ รวม welcome trigger function | ตรวจสิทธิ์ที่มีผลจริงและ inherited grants โดยไม่แตะ routine อื่น |

ก่อนเขียน SQL ต้องอนุมัติ signature/role matrix ตรงตัว ยืนยันผู้เรียก RPC จากเครื่องมือภายนอก/การใช้งานมือกับ ops และประสาน helper ที่ factory ใช้ เลข 0199 ยังเป็นข้อเสนอ ต้องตรวจบนฐานที่จะรวมอีกครั้ง เอกสารนี้ไม่เปลี่ยน grant

**ขอบเขตเพิ่มที่ต้องตัดสิน:** catalog ให้ authenticated เรียก `rpc_record_line_send_result(uuid,text,text,text,uuid)` ได้ (`line-p010-catalog-2026-09-30/08-analysis.txt:167–169`) ซึ่งอยู่นอกสิบแปดตัวที่ anon เรียกได้ใน survey ต้องตัดสินผู้เรียกที่ตั้งใจให้ใช้ ห้ามอ้างว่าทุก writer เป็น service-only ขณะที่ยังไม่ตรวจจุดนี้

## Definition และเทสต์ที่ต้องใช้

อ้าง definition สุดท้าย ไม่ใช่แค่ migration ตอนสร้าง: lead follow-up sweep อยู่ 0130:332; customer acceptance 0114:22; close lead 0130:280; shop drawing 0143:266; photo send 0134:19; lead source 0151:145 ผู้เรียก service edge อยู่ line-webhook:200–201 และ customer-design-view:78,102 ฝั่ง frontend อยู่ packages/field-app: LeadPanel.tsx:43, SaleHome.tsx:34,42, PhotoSendCard.tsx:33 และ DesignerToolsPanel.tsx:69

เกณฑ์รับงานที่เสนอ: เก็บ catalog identity/owner ครบยี่สิบตัว ตรวจสิทธิ์จริงของ role ที่ระบุ PUBLIC และ inheritance ลองเรียกฟังก์ชันปกติที่ห้ามจริงแล้วต้องได้ 42501 จาก function permission สำหรับ trigger-only ให้ตรวจผ่าน trigger path และ ACL ไม่ใช้ error จากการเรียก trigger ผิดวิธีแทนเทสต์สิทธิ์ เส้นทาง field-app พร้อม claims, signed/service ingress, identity lookup, owner cron, welcome trigger, manufacturing helper, LINE claim/record และการห้ามเขียนตรงยังต้องทำงาน ทดสอบ suite รวมครบ โดยไม่ส่งข้อความจริงหรือเปิด cron

## นโยบายและสถาปัตยกรรมที่ตัดสินแยก

Default ACL ให้ grant โดยตรงกับ role เมื่อ postgres/supabase_admin สร้าง routine การถอน PUBLIC อย่างเดียวไม่พอ Migration จำกัดฟังก์ชันที่มีอยู่ไม่ครอบคลุมฟังก์ชันใหม่/สร้างใหม่ในอนาคต ต้องตัดสินนโยบาย default ACL แยก และไม่เปลี่ยน REFERENCES, TRIGGER หรือ MAINTAIN ภายใต้ P0-10

Production catalog ต้องตรวจแยกก่อน deploy เพราะ owner และสิทธิ์จริงอาจต่างจาก stack ชั่วคราว พฤติกรรม service-role อย่างเดียวไม่พิสูจน์ว่าการรันด้วย owner จะยังทำงาน

ก่อน P0-9 ต้องเลือก tenancy/service authority หลัก เจ้าของ outbound เทียบเลขจอง 0178, ingress retry เทียบ 0175 และ staff login เทียบ 0176 พร้อมลำดับ migration และคนแก้ conflict manufacturing เกณฑ์ P0-9 คือ handler ที่ล้มไม่ถูกนับ/dedupe เป็นสำเร็จ ต้องเข้าคิว retry ภายในที่มีเพดานจนสำเร็จหรือ dead-letter พร้อม audit ต้องมี RED ที่แสดง false success ก่อน ห้ามพึ่ง LINE redelivery และต้องผ่านผู้ตรวจอิสระ ทั้งหมดเป็นเกณฑ์เสนอ ไม่ใช่หลักฐานว่า implementation มีแล้ว

## สำรวจผู้เรียกตามคำสั่งเจ้าของ

เจ้าของตอบวันที่ 30 กันยายนว่ายังไม่ยืนยันผู้เรียก RPC ภายนอก ให้สำรวจก่อน จึงค้นชื่อยี่สิบตัวจาก catalog ใน tracked source, workflows, migrations และเอกสารที่เกี่ยวข้องแบบอ่านอย่างเดียว ไม่อ่าน credentials ไม่ต่อ production หรือระบบภายนอก

| ประเภทผู้เรียก | Calls ที่พบ / หลักฐาน | สิทธิ์ที่ต้องรักษาหรือยืนยัน |
| --- | --- | --- |
| Service ingress | rpc_ingest_line_webhook; supabase/functions/line-webhook/index.ts:200–206 | Service client |
| Service identity | line_oa_resolve_customer_identity; customer-design-view/index.ts:78–82,102 | Service client และ owner call chains |
| Sender worker | rpc_claim_line_outbound_batch และ rpc_record_line_send_result; line-outbound-sender/index.ts:744,871,959–964 | Service EXECUTE ส่วน authenticated recorder ยังต้องตัดสิน |
| Field user | rpc_request_customer_acceptance; packages/field-app/src/screens/LeadPanel.tsx:43 | Authenticated claims/guards ไม่ใช่ยืนยันว่า production login แล้ว |
| Field user | rpc_field_close_lead และ rpc_field_set_lead_source; SaleHome.tsx:34,42 | เส้นทาง authenticated ที่อนุมัติ |
| Field user | rpc_field_send_photo_to_customer; PhotoSendCard.tsx:33 | เส้นทาง authenticated ที่อนุมัติ |
| Field user | rpc_field_shop_drawing_revision; DesignerToolsPanel.tsx:69 | เส้นทาง authenticated ที่อนุมัติ |
| Owner chain ภายใน | fn_line_handle_group_event ที่ 0097:435; fn_prod_curated ที่ 0107:89,133,135, 0124:149,151 และ 0143:122 | สิทธิ์ owner และประสาน manufacturing |
| Trigger / DB schedule | fn_welcome_on_group_bind ที่ 0136:185–186; ลงทะเบียน fn_lead_followup_sweep ที่ 0116:192 | Principal ของ trigger/cron; ตัวที่ deploy จริงยังไม่ทราบ |
| เส้นทางใช้งานมือในเอกสาร | rpc_create_line_order; docs/dogfood/first-house-runbook.md:25–35 | มีบทบาท Field Operator ในเอกสาร การใช้งานจริงและ credential class ยังไม่ทราบ |
| ไม่พบ executable caller ในการค้นนี้ (source `3bdd6f3e5`) | rpc_send_line_outbound, rpc_evaluate_identity_merge_candidate, rpc_resolve_conversation_site, rpc_sync_line_forecast, rpc_sweep_line_session_timeouts, rpc_field_assign_lead | ไม่ได้พิสูจน์ว่าไม่มี ต้องยืนยันกับเจ้าของ/ops |

ข้อความใน autonomyGate.ts, brand-voice.ts, templates.ts และ order-adapter.ts บางจุดเป็น comment ไม่ใช่ calls และ evidence harness ไม่ใช่ผู้เรียกที่ deploy
ไม่พบชื่อ n8n, Make.com หรือ Zapier ในขอบเขตที่ค้น และไม่พบชื่อ writer ตรงตัวใน workflows ที่ค้น
แต่ dynamic calls, automation ภายนอกและเครื่องมือใช้งานมือยังเป็น UNKNOWN
ส่วน postgres เป็นเจ้าของฐานข้อมูล ไม่ใช่ชื่อผู้รับผิดชอบที่ยืนยันแล้ว

ให้ ops จัด register แบบปิดข้อมูลลับแยก environment: ชื่อแอป/job และผู้รับผิดชอบ; สถานะใช้งาน/ปิดและเวลาใช้ล่าสุด; RPC/signature หรือ endpoint path; chain และ schedule; ประเภท authentication เท่านั้น (user JWT/service/database role); สิทธิ์ที่ธุรกิจต้องใช้และข้อเสนอคง/เลิก พร้อม config/log ที่ปิดข้อมูลลับซึ่งมีเวลาและผล ครอบคลุม hosted automation, backend, dashboard/admin/BI scripts, SQL tools, sender/sweeps และ dogfood ที่ทำด้วยมือ ห้ามส่ง token, key, authorization header, URL ที่มีรหัสผ่าน, ตัวระบุลูกค้าหรือ request body หากไม่ตอบให้คง unknown คำขอนี้ไม่อนุมัติให้เข้าระบบเหล่านั้น

## ที่มาของการตรวจ

Codex agent แยกตรวจ immutable blobs ของ commit ก่อนหน้า checksum RED/GREEN และ gated tree แบบอ่านอย่างเดียว พบเฉพาะช่องว่าง E1/E2/E3 ที่ทราบ อีก agent ไล่ dependency ตามเอกสารนี้ ทั้งสองไม่ได้รันฐานข้อมูลหรือรับรองข้ามค่าย อนุมัติของผู้ใช้ครอบคลุมงานหลักฐานและการเตรียมการตัดสินใจ ไม่ใช่เลือกคำตอบทางสถาปัตยกรรมแทน
