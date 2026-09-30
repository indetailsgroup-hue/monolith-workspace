# ทะเบียนผู้เรียก LINE RPC — รอ ops เติมข้อมูล

30 กันยายน 2026 สำรวจ source ที่ e7e2c52ce เจ้าของสั่งว่ายังไม่ยืนยันผู้เรียก RPC ภายนอก ให้สำรวจก่อน สถานะ SOURCE INVENTORY / EXTERNAL UNKNOWN เอกสารนี้ไม่อนุมัติ 0199 หรือการเข้าระบบภายนอก/production

## เส้นทางที่พบใน source

| รหัส | เส้นทางที่พบใน source | สิทธิ์ที่ source ระบุว่าต้องใช้ | ผู้รับผิดชอบปฏิบัติการ | Environment / ใช้จริง / ใช้ล่าสุด | หลักฐาน ops |
| --- | --- | --- | --- | --- | --- |
| RPC-01 | line-webhook → rpc_ingest_line_webhook | service_role | UNASSIGNED | UNKNOWN | รอ |
| RPC-02 | customer-design-view → line_oa_resolve_customer_identity | service_role | UNASSIGNED | UNKNOWN | รอ |
| RPC-03 | line-outbound-sender → rpc_claim_line_outbound_batch / rpc_record_line_send_result | service_role; ขอบเขต authenticated recorder ยังไม่ตัดสิน | UNASSIGNED | UNKNOWN | รอ |
| RPC-04 | field-app LeadPanel → rpc_request_customer_acceptance | Authenticated user พร้อม business guards | UNASSIGNED | UNKNOWN | รอ |
| RPC-05 | field-app SaleHome → rpc_field_close_lead / rpc_field_set_lead_source | Authenticated user พร้อม business guards | UNASSIGNED | UNKNOWN | รอ |
| RPC-06 | field-app PhotoSendCard / DesignerToolsPanel → photo send / drawing revision RPCs | Authenticated user พร้อม business guards | UNASSIGNED | UNKNOWN | รอ |
| RPC-07 | Ingress → fn_line_handle_group_event | DEFINER owner chain | UNASSIGNED | UNKNOWN | รอ |
| RPC-08 | Manufacturing/business functions → fn_prod_curated | DEFINER owner chain; ประสาน manufacturing | UNASSIGNED | UNKNOWN | รอ |
| RPC-09 | Binding trigger → fn_welcome_on_group_bind | Trigger/owner execution | UNASSIGNED | UNKNOWN | รอ |
| RPC-10 | Database cron ที่ลงทะเบียน → fn_lead_followup_sweep | ต้องยืนยัน scheduler principal ที่ deploy จริง | UNASSIGNED | UNKNOWN | รอ |
| RPC-11 | Field Operator ใน dogfood runbook → rpc_create_line_order | ยังไม่ทราบ credential class ที่ใช้มือจริง | UNASSIGNED | UNKNOWN | รอ |
| RPC-12 | Writer อื่นที่ไม่พบ executable callsite ในขอบเขตค้น | ห้ามอนุมานว่าเลิกใช้ ดู survey | UNASSIGNED | UNKNOWN | รอ |

Path เลขบรรทัดและชื่อ writer ตรงตัวอยู่ใน [เอกสาร integration/B12](line-p010-integration-b12-followup.th.md) แถวเหล่านี้ยืนยันเส้นทางใน source/เอกสาร ไม่ใช่ deployment หรือการไม่มีผู้เรียกภายนอก การไม่พบ n8n/Make/Zapier ใน tracked files ที่ค้นไม่ใช่ inventory ของระบบ hosted

## ข้อมูลยืนยันแยก environment

แต่ละแถวให้เติมชื่อแอป/job และผู้รับผิดชอบ; environment; สถานะเปิด/ปิดและเวลาใช้ล่าสุด; RPC/signature หรือ endpoint ตรงตัว; call chain และ scheduler; ประเภท authentication เท่านั้น (user JWT/service/database role); ความสามารถที่ธุรกิจจำเป็นต้องใช้; มติคง/เลิก/ย้าย; อ้างอิง config/log ที่ปิดข้อมูลลับพร้อมเวลาและผล เพิ่มแถวสำหรับระบบที่ยังไม่อยู่ในรายการ

ให้ครอบคลุม hosted automation, backend, dashboard, admin/BI scripts, SQL tools และ dogfood ที่ทำด้วยมือ รวม sender, timeout sweeps และ lead follow-up schedules ห้ามส่ง token, key, authorization header, URL ที่มีรหัสผ่าน, ตัวระบุลูกค้าหรือ request body เก็บ reference หลักฐานที่ปิดข้อมูลลับ แทน raw logs ที่มีข้อมูลลูกค้า

หากไม่ตอบให้คง UNKNOWN การยืนยันว่าไม่มีต้องระบุขอบเขตระบบ/environment ผู้รับผิดชอบที่รับรองและหลักฐานประกอบ ห้ามอนุมานจากการค้น repo คำยืนยัน ops เดิมเรื่องเขียนตารางตรงไม่ได้ตอบเรื่อง RPC นี้

## การตัดสินใจก่อนแก้ grant หรือรวมงาน

| เรื่อง | สถานะปัจจุบัน | มติขั้นต่ำที่ต้องมี |
| --- | --- | --- |
| เจ้าของ manufacturing/integration | UNASSIGNED; ขอเจ้าของระบุบุคคล/session แล้ว | ผู้รับผิดชอบลำดับ 0170/0191 สิทธิ์ปลายทาง และความเข้ากันได้ factory |
| ผู้เรียก RPC ภายนอก/ทำด้วยมือ | UNKNOWN | ทะเบียนครบพร้อม reference หลักฐานที่ปิดข้อมูลลับ |
| Matrix ฟังก์ชัน/role ของ B12 | PROPOSED ยังไม่อนุมัติ | Signature ตรงตัว สิทธิ์ที่คง นโยบาย authenticated recorder และการประสาน factory |
| Tenant/service authority และงานทับซ้อน | UNDECIDED | โมเดลหลักและเจ้าของงานเทียบ 0175/0176/0178 ก่อน P0-9 |
| Push และ CI จริง | NOT APPROVED | เจ้าของอนุมัติหลังรีวิวการแก้ local และต้องมีผล Actions จริง |

การสร้างทะเบียนนี้ไม่ได้แก้ grant/migration/ref รวม branch deploy หรือส่งข้อความภายนอก การรับ E1/E2/E3 ด้านหลักฐานไม่ได้ตัดสินเรื่องเหล่านี้
