# ตารางสิทธิ์ B12 ราย identity และแผนตรวจรับ

30 กันยายน 2026 ปรับเทสต์ 2 ตุลาคม 2026 matrix ร่างบน c4c76717b9d64a51ad1c0b4421148587be7ba285 และสร้างใน 0199 (commit a97c3c847 บนฐาน 5119396a7) สถานะ สร้างในเครื่องแล้ว รอผู้ตรวจอิสระ ยังไม่ deploy เรื่อง recorder ตัดสินแล้ว (service-only) แต่ caller register และคำตอบฝั่ง manufacturing ยังไม่มา และขวางการ deploy

## มติของเจ้าของและการสร้าง (30 กันยายน 2026)

- Recorder: `rpc_record_line_send_result` เป็น service-only ตามมติของเจ้าของ แถว B12-15 ของ authenticated จึงเป็น DENY
- การสร้าง: เจ้าของอนุมัติให้สร้างทั้ง matrix ในรอบเดียวก่อนที่ caller register ของ ops และการยืนยันจากเจ้าของ manufacturing จะมาถึง การปฏิเสธ authenticated ในแถว SERVICE และการปฏิเสธ service_role บน `fn_prod_curated` จึงสร้างตามสมมติฐาน และห้าม deploy จนกว่าจะได้คำตอบเหล่านั้น
- Implementation: `supabase/migrations/0199_line_oa_restrict_definer_execute.sql` revoke EXECUTE อย่างเดียว ไม่ grant เพิ่ม หยุด (55000) เมื่อไม่พบ identity หรือพบ overload ที่ไม่ได้จัดประเภท (`0199_line_oa_restrict_definer_execute.sql:66`, `0199_line_oa_restrict_definer_execute.sql:75`) และ raise 42501 พร้อม rollback หากหลัง revoke สิทธิ์ที่มีผลจริงต่างจากเป้าหมาย หรือ PUBLIC ยังมี EXECUTE (`0199_line_oa_restrict_definer_execute.sql:111`)
- เทสต์: `supabase/tests/line_oa_definer_execute_matrix.sql` (82 assertion) และ `supabase/tests/line_oa_definer_execute_fail_closed.sql` (27 assertion; 23 ที่ a97c3c847) รอบ 2 (2 ตุลาคม 2026) ทำให้ assertion 54 เรียกแบบ anon ด้วยค่าจริงและเทียบ fingerprint ของตารางภายใน probe เพิ่ม case F (identity หาย, 55000) และให้ assertion 41 กับ 43 ของ suite เดิมตรวจข้อความ ACL ของฟังก์ชัน เทสต์เดิมเปลี่ยนตามนโยบาย 2 จุด คือ suite เดิมตรวจว่า authenticated ไม่มี EXECUTE บน recorder แล้ว (`line_outbound_claim_record.sql:429`) และ suite ของ P0-10 เรียก `fn_prod_curated` ผ่าน `rpc_field_create_appointment` แทนการเรียกตรงด้วย service_role
- หลักฐาน: `evidence/line-p012-red-a-2026-09-30/`, `evidence/line-p012-red-b-2026-09-30/` และ `evidence/line-p012-green-2026-09-30/` และรอบ 2 ใน `evidence/line-p012b-red-a-2026-10-02/`, `evidence/line-p012b-red-mutants-2026-10-02/` และ `evidence/line-p012b-green-2026-10-02/` เป็นผลรันในเครื่องที่รอผู้ตรวจอิสระ ไม่ใช่ผล production

## มติของเจ้าของและรายการที่เพิ่ม (3 ตุลาคม 2026)

- `rpc_line_inbound_retry_sweep(integer)` (P0-9, migration 0200 บน branch `claude/line-p009-ingest-retry`) เข้า matrix นี้เป็น B12-21 กลุ่ม SERVICE คือ anon DENY, authenticated DENY, service_role KEEP และ PUBLIC ไม่มี EXECUTE (`0200_line_inbound_handler_retry.sql:536`)
- 0199 ไม่ได้บังคับ B12-21 แต่ 0200 grant EXECUTE ให้ service_role โดยตรง (`0200_line_inbound_handler_retry.sql:547`) และปิดท้ายด้วยการตรวจแบบ fail-closed ที่ raise 42501 เมื่อสิทธิ์ที่มีผลจริงต่างจากเป้าหมาย (`0200_line_inbound_handler_retry.sql:594`)
- เทสต์: assertion 35-36 ของ `supabase/tests/line_inbound_handler_retry.sql` ตรวจสิทธิ์ และ 42-53 ตรวจกรณี fail-closed ส่วน suite ของ 0199 ยังครอบคลุม 20 identity เดิม assertion 82 และ 27 ข้อกับหลักฐานที่อ้างถึงจึงยังใช้ได้
- หลักฐาน: `evidence/line-p009-r3-green-2026-10-02/` (assertion 35 ได้ f/f/t) และ `evidence/line-p009-r3-mutants-2026-10-02/` เป็นการรันในเครื่องที่ 1902a8eea รอการรีวิวข้ามค่าย ไม่ใช่ผลจาก production

| ID | public identity | Current A/U/S | Target anon | Target authenticated | Target service_role | Class |
| --- | --- | --- | --- | --- | --- | --- |
| B12-21 | `rpc_line_inbound_retry_sweep(integer)` | f/f/t (ในเครื่อง, 1902a8eea) | DENY | DENY | KEEP | SERVICE |

## ทางเลือกและข้อเสนอ

คงสิทธิ์เดิมลดผลกระทบแต่ B12 ยังเปิด ถอนทั้งหมดเสี่ยงทำ ingress, sender และ field-app พัง แนะนำถอนราย identity โดยคงผู้เรียกธุรกิจที่อนุมัติและเส้นทาง owner ไว้ การไม่มีหลักฐาน caller ไม่ใช่หลักฐานว่าไม่ได้ใช้

## ตารางราย identity

Current A/U/S คือ EXECUTE ที่มีผลจริงของ anon/authenticated/service_role โดย t=มี f=ไม่มี จาก catalog ที่ commit da252d18a เป็นหลักฐาน local เดิม ไม่ใช่ production หรือ catalog ที่รันใหม่ ทั้ง 20 identity อยู่ public เป็น SECURITY DEFINER และ owner postgres ในรอบนั้น Target เป็นข้อเสนอสิทธิ์สุดท้าย ไม่ใช่คำสั่ง GRANT ใหม่ DENY ครอบคลุมสิทธิ์ผ่าน PUBLIC/membership ส่วน KEEP คือคงเดิมชั่วคราว ไม่ได้อนุมัติ caller ทุกคน ตอนนี้ไม่เหลือแถว DECIDE แล้ว แถวเดียวที่เคยเป็น (B12-15) เจ้าของตัดสินเป็น service-only

| ID | public identity | Current A/U/S | Target anon | Target authenticated | Target service_role | Class |
| --- | --- | --- | --- | --- | --- | --- |
| B12-01 | `fn_lead_followup_sweep()` | t/t/t | DENY | DENY | KEEP | SERVICE |
| B12-02 | `fn_line_handle_group_event(jsonb,text,text)` | t/t/t | DENY | DENY | DENY | INTERNAL |
| B12-03 | `fn_prod_curated(uuid,text,jsonb)` | t/t/t | DENY | DENY | DENY | INTERNAL |
| B12-04 | `fn_welcome_on_group_bind()` | t/t/t | DENY | DENY | DENY | INTERNAL |
| B12-05 | `line_oa_resolve_customer_identity(text,text)` | t/t/t | DENY | DENY | KEEP | SERVICE |
| B12-06 | `rpc_claim_line_outbound_batch(integer,integer)` | f/f/t | DENY | DENY | KEEP | SENDER |
| B12-07 | `rpc_create_line_order(uuid,jsonb,text,text)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |
| B12-08 | `rpc_evaluate_identity_merge_candidate(text,text,uuid,jsonb,numeric)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |
| B12-09 | `rpc_field_assign_lead(uuid,uuid)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |
| B12-10 | `rpc_field_close_lead(uuid,text,text)` | t/t/t | DENY | KEEP | KEEP | FIELD |
| B12-11 | `rpc_field_send_photo_to_customer(uuid,uuid,text)` | t/t/t | DENY | KEEP | KEEP | FIELD |
| B12-12 | `rpc_field_set_lead_source(uuid,text)` | t/t/t | DENY | KEEP | KEEP | FIELD |
| B12-13 | `rpc_field_shop_drawing_revision(uuid,text,text,boolean,boolean)` | t/t/t | DENY | KEEP | KEEP | FIELD |
| B12-14 | `rpc_ingest_line_webhook(text,text,text)` | t/t/t | DENY | DENY | KEEP | SERVICE |
| B12-15 | `rpc_record_line_send_result(uuid,text,text,text,uuid)` | f/t/t | DENY | DENY (มติเจ้าของ) | KEEP | SENDER |
| B12-16 | `rpc_request_customer_acceptance(uuid,text)` | t/t/t | DENY | KEEP | KEEP | FIELD |
| B12-17 | `rpc_resolve_conversation_site(uuid,text,text)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |
| B12-18 | `rpc_send_line_outbound(uuid,text,jsonb,text,boolean,boolean,boolean)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |
| B12-19 | `rpc_sweep_line_session_timeouts()` | t/t/t | DENY | DENY | KEEP | SERVICE |
| B12-20 | `rpc_sync_line_forecast(text,text,text)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |

เป้าหมาย PUBLIC: ไม่มี EXECUTE ทั้ง 20 identity โดย catalog เดิมมีเฉพาะ welcome trigger คง owner, เนื้อฟังก์ชัน, SELECT ตาราง, membership และ default ACL ในขอบเขตนี้ ไม่แก้ authenticator เพียงเพราะปัจจุบันได้สิทธิ์ผ่าน PUBLIC แต่ต้องตรวจสิทธิ์ที่มีผลจริงหลังแก้ด้วย

## กลุ่ม caller และมติที่ยังขาด

- กลุ่ม INTERNAL: ถอนการเรียกตรงของ role หลังพิสูจน์ว่า owner chain และ trigger ที่ติดตั้งยังทำงาน fn_prod_curated ต้องประสาน manufacturing
- กลุ่ม SERVICE: คงทางเข้า service และยืนยัน principal ของ cron จริงโดยไม่เปิด cron
- กลุ่ม FIELD: คงงานผู้ใช้ที่มีสิทธิ์และทดสอบปฏิเสธข้าม site
- กลุ่ม CALLER-UNKNOWN: คง authenticated/service รอ inventory การไม่พบ caller ในโค้ดไม่ให้สิทธิ์ถอนเพิ่ม — dogfood runbook ระบุ rpc_create_line_order ไว้จริง

SENDER: claim คง service-only ก่อน 0199 recorder ให้ authenticated เรียกและตรวจ governance/site ใน 0197:122–129 เจ้าของตัดสินให้บันทึกผลแบบ service-only เมื่อ 30 กันยายน 2026 และ 0199 ทำตามนั้นแล้ว ops ยังควรยืนยันว่าไม่มีพนักงานหรือเครื่องมือใดบันทึกผลด้วยมือ

ทุกแถวต้องอ้างทะเบียน ops หรือระบุ unresolved การอนุมัติต้องระบุ signature จริง มติ recorder ผู้เรียก service ที่คงไว้ principal ของ trigger/cron และการประสาน factory ตรวจ overload และเลข 0199 ใหม่บนฐานรวมก่อนเขียน SQL

## แผนตรวจรับและสถานะในเครื่อง

สถานะหลังรัน 0199 ในเครื่อง (รอบ 1) และเทสต์ที่ปรับแล้ว (รอบ 2) คือ รันแล้ว บางส่วน หรือยังค้าง

| การตรวจ | หลักฐานที่ต้องได้ | สถานะ |
| --- | --- | --- |
| Baseline | owner, identity 20 ตัวกับ overload ที่เกินมา, สิทธิ์จริงของ role, PUBLIC และ inheritance โดยไม่สมมติ production | รันแล้วสำหรับ owner, identity, overload, 3 role, PUBLIC และ inheritance ส่วน authenticator หลัง 0199 ยังค้าง (ดูย่อหน้า PUBLIC) |
| RED | ใช้เทสต์ชุดเดียวกับ baseline พิสูจน์ว่าสิทธิ์ที่ต้องห้ามยังมี ใช้ input ชนิดถูกต้องและ rollback ไม่เปิด sender/cron/channel จริง | รันแล้ว รอบ 2 เพิ่มการเรียกแบบ anon ด้วยค่าจริงซึ่งเขียนข้อมูลได้เมื่อไม่มี 0199 |
| Denial | ทุก DENY ต้องเป็น false จากสิทธิ์จริง ordinary function ต้องได้ 42501 permission denied for function ไม่ใช่ล้มที่ schema หรือใน body | รันแล้ว |
| ข้อยกเว้น trigger | ตรวจ ACL และผล trigger จากการ bind จริง การเรียก trigger function ผิดรูปแบบโดยตรงไม่พิสูจน์การห้ามสิทธิ์ | รันแล้ว |
| งานที่ต้องคงไว้ | ingest ลงลายเซ็น, service identity, claim/record, field 5 เส้นทาง, RPC ที่คงไว้พร้อม guard, owner sweep, welcome trigger และ factory owner chain ตรวจผลข้อมูลและการปฏิเสธผิด site | รันแล้ว |
| สิทธิ์ตกค้าง | จำลอง inherited grant และ grantor อื่นด้วย role ชั่วคราว migration ต้องล้มแบบปิดโดยไม่เพิ่มสิทธิ์หรือแก้ membership เอง | รันแล้ว (fail-closed case A–C) |
| Atomicity | รัน migration จริงภายใต้ transaction ที่ตั้งใจใช้ เปรียบ ACL/owner หลังล้ม และทดสอบรันซ้ำ | บางส่วน: หลังรันล้มและ rollback ถึง savepoint แล้ว ACL และ membership เท่ากับก่อนรัน และรันซ้ำได้สะอาด (case E) ส่วน atomicity เป็นความหมายของ statement ใน PostgreSQL และยังไม่ได้เทียบ owner |
| Integration | migration chain และ suite ครบ Python 12 ไฟล์ race กับการห้ามเขียนตรงของ 0198 containment ต้องคงเป็นล้มจนแก้จริง | รันแล้วในเครื่อง (ล้มเฉพาะ suite containment เดิม) GitHub Actions รัน suite LINE ทั้ง 5 ชุดที่ a97c3c847 |
| หลักฐาน | ชุดใหม่ไม่ทับเดิม ระบุ source คำสั่ง UTC exit ผลดิบ checksum secret scan และ cleanup ตรวจอิสระ และ CI จริงหลังอนุมัติ push แยก | ทำชุดหลักฐานในเครื่องแล้ว การตรวจอิสระยังค้าง |

ข้อมูล fixture และ role ชั่วคราวอยู่เฉพาะ stack ใหม่แยก ปิด cron ไม่ใช้ credential จริง เทสต์ลบต้องไม่รัน outbound worker จริง rollback ผลข้อมูลหรือถอด stack ทิ้ง ผลในเครื่องอยู่ในชุดหลักฐาน line-p012 และ line-p012b ส่วนผล GitHub Actions มีข้อความที่คัดมาในชุด green ของ line-p012b และไม่อ้างผล production

## ขอบเขตรวมระบบและ deploy

เจ้าของ manufacturing ต้องพิจารณาลำดับ 0170/0191 และสิทธิ์ overload สุดท้าย ห้ามคัดลอกฟังก์ชันที่ขาดมาเป็น shim เทสต์ P0-9 ยังต้องมีมติ branch/tenant นโยบาย default grant สำหรับฟังก์ชันใหม่หรือสร้างซ้ำเป็นมติแยก แผนนี้ครอบคลุมเพียง 20 identity เดิม ห้ามเรียกว่าปิดความปลอดภัยทั้งระบบ

ก่อน deploy ต้องอนุมัติตรวจ production catalog แยกเพื่อเทียบ owner, ACL, caller ภายนอก/ทำมือ และ API exposure แผนนี้ไม่อนุญาตเข้า production, merge, push, ส่งลูกค้า หรือเปิด cron

## รีวิวข้อความออกแบบและข้อปรับปรุง

Opus 5.5 ตรวจเฉพาะย่อหน้าข้อกำหนดที่ตัดข้อมูลลับผ่าน Claude CLI โดยปิด tools/MCP ไม่ได้ตรวจ source ไฟล์ หรือฐานข้อมูล ข้อทักท้วงสามเรื่องคือ caller ที่ได้สิทธิ์ผ่าน PUBLIC, สิทธิ์กลับมาหลังสร้างใหม่ และสมมติฐานเรื่อง owner chain/เทสต์ trigger นี่คือข้อคิดเห็นออกแบบ ไม่ใช่การรับรอง implementation อิสระ

ทุก identity ต้องบันทึกที่มาสิทธิ์ ได้แก่ direct grant กับ grantor, PUBLIC, inheritance หรือ ownership สำหรับ grantee ที่พบทั้งหมด ไม่ใช่สาม role เท่านั้น KEEP ต้องยืนยันว่าสิทธิ์จริงยังมีหลังแก้ ส่วน DECIDE คง grant เดิมจนมีมติ (ไม่เหลือแถว DECIDE แล้ว) การบันทึกที่มาสิทธิ์ของ grantee อื่นนอกจาก 3 role ยังค้าง หากถอน PUBLIC แล้วกระทบ caller ที่ยังไม่อยู่ใน matrix ให้หยุดเพื่อตัดสิน ไม่เพิ่ม replacement grant เอง snapshot เดิมมี named grant ให้ role ที่คงไว้ แต่ catalog เป้าหมายใหม่ต้องยืนยันอีกครั้ง การห้าม anon เปลี่ยน 18 identity ส่วน claim กับ recorder ห้ามอยู่แล้วและใช้ตรวจ regression

สำรวจทุก overload ของชื่อที่ครอบคลุม หลัง create/recreate หรือรวมระบบที่อนุมัติ ต้องตรวจ matrix อีกครั้งและล้มเมื่อพบ overload ใหม่ที่ยังไม่จัดประเภท ไม่ขยายนโยบายห้ามทั่ว schema ในงานนี้ นโยบาย default ACL ในอนาคตยังแยกต่างหาก

ไล่ principal ที่ทำงานจริงตลอด helper chain รวมจุด DEFINER/INVOKER และ owner ต้องพิสูจน์ว่า principal นั้นยังมี EXECUTE ไม่สมมติว่าทุก caller เป็น postgres หาก inherited access ทำให้ DENY ไม่สำเร็จต้องหยุด migration ไม่ถือว่าอนุมัติแก้ membership เทสต์ ordinary function ต้องยืนยัน schema USAGE และไม่มีผลข้างเคียงในฟังก์ชัน สำหรับ welcome ให้แยก ACL assertion ออกจาก trigger non-regression และทดสอบว่าผู้รัน migration/restore ที่ตั้งใจใช้สร้าง trigger ใหม่ได้บน stack แยก ห้ามใช้ trigger เดิมที่ทำงานผ่านเป็นหลักฐานสิทธิ์ของ caller

## แหล่งหลักฐาน

- [ผล catalog](evidence/line-p010-catalog-2026-09-30/08-analysis.txt): ส่วน E มี signature/สิทธิ์จริง ส่วน G มี default ACL
- [ผลสำรวจ integration และ caller](line-p010-integration-b12-followup.th.md): ตำแหน่ง source และ dependency 0170/0191
- [ทะเบียน ops](line-rpc-caller-register.th.md): environment และเจ้าของผู้รับผิดชอบยังรอยืนยัน
- ../../supabase/migrations/0197_line_outbound_unicode_error_detail.sql:122–129: ทางอนุญาต recorder สำหรับ service และผู้ใช้
- ../dogfood/first-house-runbook.md:35: RPC สร้าง order แบบทำมือที่ระบุไว้
