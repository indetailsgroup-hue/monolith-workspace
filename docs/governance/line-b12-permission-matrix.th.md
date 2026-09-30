# ตารางสิทธิ์ B12 ราย identity และแผนตรวจรับ

30 กันยายน 2026 ฐาน source c4c76717b9d64a51ad1c0b4421148587be7ba285 สถานะ DESIGN / ยังไม่เปลี่ยนสิทธิ์ อนุมัติให้เตรียมแล้ว แต่สิทธิ์รายตัวยังขึ้นกับข้อมูล caller และมติรวมระบบ ยังไม่สร้าง 0199

## ทางเลือกและข้อเสนอ

คงสิทธิ์เดิมลดผลกระทบแต่ B12 ยังเปิด ถอนทั้งหมดเสี่ยงทำ ingress, sender และ field-app พัง แนะนำถอนราย identity โดยคงผู้เรียกธุรกิจที่อนุมัติและเส้นทาง owner ไว้ การไม่มีหลักฐาน caller ไม่ใช่หลักฐานว่าไม่ได้ใช้

## ตารางราย identity

Current A/U/S คือ EXECUTE ที่มีผลจริงของ anon/authenticated/service_role โดย t=มี f=ไม่มี จาก catalog ที่ commit da252d18a เป็นหลักฐาน local เดิม ไม่ใช่ production หรือ catalog ที่รันใหม่ ทั้ง 20 identity อยู่ public เป็น SECURITY DEFINER และ owner postgres ในรอบนั้น Target เป็นข้อเสนอสิทธิ์สุดท้าย ไม่ใช่คำสั่ง GRANT ใหม่ DENY ครอบคลุมสิทธิ์ผ่าน PUBLIC/membership ส่วน KEEP คือคงเดิมชั่วคราว ไม่ได้อนุมัติ caller ทุกคน DECIDE คือขอบเขตธุรกิจที่ต้องตัดสิน

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
| B12-15 | `rpc_record_line_send_result(uuid,text,text,text,uuid)` | f/t/t | DENY | DECIDE | KEEP | SENDER |
| B12-16 | `rpc_request_customer_acceptance(uuid,text)` | t/t/t | DENY | KEEP | KEEP | FIELD |
| B12-17 | `rpc_resolve_conversation_site(uuid,text,text)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |
| B12-18 | `rpc_send_line_outbound(uuid,text,jsonb,text,boolean,boolean,boolean)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |
| B12-19 | `rpc_sweep_line_session_timeouts()` | t/t/t | DENY | DENY | KEEP | SERVICE |
| B12-20 | `rpc_sync_line_forecast(text,text,text)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |

เป้าหมาย PUBLIC: ไม่มี EXECUTE ทั้ง 20 identity โดย catalog เดิมมีเฉพาะ welcome trigger คง owner, เนื้อฟังก์ชัน, SELECT ตาราง, membership และ default ACL ในขอบเขตนี้ ไม่แก้ authenticator เพียงเพราะปัจจุบันได้สิทธิ์ผ่าน PUBLIC แต่ต้องตรวจสิทธิ์ที่มีผลจริงหลังแก้ด้วย

## กลุ่ม caller และมติที่ยังขาด

INTERNAL: ถอนการเรียกตรงของ role หลังพิสูจน์ว่า owner chain และ trigger ที่ติดตั้งยังทำงาน fn_prod_curated ต้องประสาน manufacturing กลุ่ม SERVICE: คงทางเข้า service และยืนยัน principal ของ cron จริงโดยไม่เปิด cron กลุ่ม FIELD: คงงานผู้ใช้ที่มีสิทธิ์และทดสอบปฏิเสธข้าม site กลุ่ม CALLER-UNKNOWN: คง authenticated/service รอ inventory การไม่พบ caller ในโค้ดไม่ให้สิทธิ์ถอนเพิ่ม และ dogfood runbook ระบุ rpc_create_line_order ไว้จริง

SENDER: claim คง service-only ส่วน recorder ปัจจุบันให้ authenticated เรียกและตรวจ governance/site ใน 0197:122–129 แนะนำให้เป็น service-only ถ้า ops และเจ้าของยืนยันว่าไม่มีขั้นตอนบันทึกผลโดยผู้ใช้ หากยังต้องใช้ ให้คงเส้นทางผู้ใช้พร้อมทดสอบ guard โดยตรง ห้ามเลือกแทนโดยเงียบ

ทุกแถวต้องอ้างทะเบียน ops หรือระบุ unresolved การอนุมัติต้องระบุ signature จริง มติ recorder ผู้เรียก service ที่คงไว้ principal ของ trigger/cron และการประสาน factory ตรวจ overload และเลข 0199 ใหม่บนฐานรวมก่อนเขียน SQL

## แผนตรวจรับ — ยังไม่ได้รัน

| การตรวจ | หลักฐานที่ต้องได้ |
| --- | --- |
| Baseline | owner, identity 20 ตัวกับ overload ที่เกินมา, สิทธิ์จริงของ role, PUBLIC และ inheritance โดยไม่สมมติ production |
| RED | ใช้เทสต์ชุดเดียวกับ baseline พิสูจน์ว่าสิทธิ์ที่ต้องห้ามยังมี ใช้ input ชนิดถูกต้องและ rollback ไม่เปิด sender/cron/channel จริง |
| Denial | ทุก DENY ต้องเป็น false จากสิทธิ์จริง ordinary function ต้องได้ 42501 permission denied for function ไม่ใช่ล้มที่ schema หรือใน body |
| ข้อยกเว้น trigger | ตรวจ ACL และผล trigger จากการ bind จริง การเรียก trigger function ผิดรูปแบบโดยตรงไม่พิสูจน์การห้ามสิทธิ์ |
| งานที่ต้องคงไว้ | ingest ลงลายเซ็น, service identity, claim/record, field 5 เส้นทาง, RPC ที่คงไว้พร้อม guard, owner sweep, welcome trigger และ factory owner chain ตรวจผลข้อมูลและการปฏิเสธผิด site |
| สิทธิ์ตกค้าง | จำลอง inherited grant และ grantor อื่นด้วย role ชั่วคราว migration ต้องล้มแบบปิดโดยไม่เพิ่มสิทธิ์หรือแก้ membership เอง |
| Atomicity | รัน migration จริงภายใต้ transaction ที่ตั้งใจใช้ เปรียบ ACL/owner หลังล้ม และทดสอบรันซ้ำ |
| Integration | migration chain และ suite ครบ Python 12 ไฟล์ race กับการห้ามเขียนตรงของ 0198 containment ต้องคงเป็นล้มจนแก้จริง |
| หลักฐาน | ชุดใหม่ไม่ทับเดิม ระบุ source คำสั่ง UTC exit ผลดิบ checksum secret scan และ cleanup ตรวจอิสระ และ CI จริงหลังอนุมัติ push แยก |

ข้อมูล fixture และ role ชั่วคราวอยู่เฉพาะ stack ใหม่แยก ปิด cron ไม่ใช้ credential จริง เทสต์ลบต้องไม่รัน outbound worker จริง rollback ผลข้อมูลหรือถอด stack ทิ้ง เอกสารนี้ไม่อ้างว่าทดสอบผ่านแล้ว

## ขอบเขตรวมระบบและ deploy

เจ้าของ manufacturing ต้องพิจารณาลำดับ 0170/0191 และสิทธิ์ overload สุดท้าย ห้ามคัดลอกฟังก์ชันที่ขาดมาเป็น shim เทสต์ P0-9 ยังต้องมีมติ branch/tenant นโยบาย default grant สำหรับฟังก์ชันใหม่หรือสร้างซ้ำเป็นมติแยก แผนนี้ครอบคลุมเพียง 20 identity เดิม ห้ามเรียกว่าปิดความปลอดภัยทั้งระบบ

ก่อน deploy ต้องอนุมัติตรวจ production catalog แยกเพื่อเทียบ owner, ACL, caller ภายนอก/ทำมือ และ API exposure แผนนี้ไม่อนุญาตเข้า production, merge, push, ส่งลูกค้า หรือเปิด cron

## รีวิวข้อความออกแบบและข้อปรับปรุง

Opus 5.5 ตรวจเฉพาะย่อหน้าข้อกำหนดที่ตัดข้อมูลลับผ่าน Claude CLI โดยปิด tools/MCP ไม่ได้ตรวจ source ไฟล์ หรือฐานข้อมูล ข้อทักท้วงสามเรื่องคือ caller ที่ได้สิทธิ์ผ่าน PUBLIC, สิทธิ์กลับมาหลังสร้างใหม่ และสมมติฐานเรื่อง owner chain/เทสต์ trigger นี่คือข้อคิดเห็นออกแบบ ไม่ใช่การรับรอง implementation อิสระ

ทุก identity ต้องบันทึกที่มาสิทธิ์ ได้แก่ direct grant กับ grantor, PUBLIC, inheritance หรือ ownership สำหรับ grantee ที่พบทั้งหมด ไม่ใช่สาม role เท่านั้น KEEP ต้องยืนยันว่าสิทธิ์จริงยังมีหลังแก้ ส่วน DECIDE คง grant เดิมจนมีมติ หากถอน PUBLIC แล้วกระทบ caller ที่ยังไม่อยู่ใน matrix ให้หยุดเพื่อตัดสิน ไม่เพิ่ม replacement grant เอง snapshot เดิมมี named grant ให้ role ที่คงไว้ แต่ catalog เป้าหมายใหม่ต้องยืนยันอีกครั้ง การห้าม anon เปลี่ยน 18 identity ส่วน claim กับ recorder ห้ามอยู่แล้วและใช้ตรวจ regression

สำรวจทุก overload ของชื่อที่ครอบคลุม หลัง create/recreate หรือรวมระบบที่อนุมัติ ต้องตรวจ matrix อีกครั้งและล้มเมื่อพบ overload ใหม่ที่ยังไม่จัดประเภท ไม่ขยายนโยบายห้ามทั่ว schema ในงานนี้ นโยบาย default ACL ในอนาคตยังแยกต่างหาก

ไล่ principal ที่ทำงานจริงตลอด helper chain รวมจุด DEFINER/INVOKER และ owner ต้องพิสูจน์ว่า principal นั้นยังมี EXECUTE ไม่สมมติว่าทุก caller เป็น postgres หาก inherited access ทำให้ DENY ไม่สำเร็จต้องหยุด migration ไม่ถือว่าอนุมัติแก้ membership เทสต์ ordinary function ต้องยืนยัน schema USAGE และไม่มีผลข้างเคียงในฟังก์ชัน สำหรับ welcome ให้แยก ACL assertion ออกจาก trigger non-regression และทดสอบว่าผู้รัน migration/restore ที่ตั้งใจใช้สร้าง trigger ใหม่ได้บน stack แยก ห้ามใช้ trigger เดิมที่ทำงานผ่านเป็นหลักฐานสิทธิ์ของ caller

## แหล่งหลักฐาน

- [ผล catalog](evidence/line-p010-catalog-2026-09-30/08-analysis.txt): ส่วน E มี signature/สิทธิ์จริง ส่วน G มี default ACL
- [ผลสำรวจ integration และ caller](line-p010-integration-b12-followup.th.md): ตำแหน่ง source และ dependency 0170/0191
- [ทะเบียน ops](line-rpc-caller-register.th.md): environment และเจ้าของผู้รับผิดชอบยังรอยืนยัน
- ../../supabase/migrations/0197_line_outbound_unicode_error_detail.sql:122–129: ทางอนุญาต recorder สำหรับ service และผู้ใช้
- ../dogfood/first-house-runbook.md:35: RPC สร้าง order แบบทำมือที่ระบุไว้
