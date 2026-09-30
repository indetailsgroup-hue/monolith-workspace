# B12 / P0-12: migration 0199 และหลักฐาน

วันที่: 30 กันยายน 2026 ฐาน: 5119396a7c66c3f0d33547b57902ddefa2aefe07 บน codex/repair-intelligence-phase0-trust สถานะ: สร้างแล้ว รอผู้ตรวจอิสระ ผลทั้งหมดเป็นผลรันในเครื่อง ไม่ใช่ผล GitHub Actions หรือ production ไม่ได้ push หรือ deploy และห้าม deploy จนกว่าจะได้ caller register ของ ops และการยืนยันจากเจ้าของ manufacturing เรื่อง fn_prod_curated

## สิ่งที่เปลี่ยน

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| supabase/migrations/0199_line_oa_restrict_definer_execute.sql | revoke EXECUTE บน 20 identity ตาม matrix โดยไม่ grant เพิ่ม หยุดเมื่อไม่พบ identity หรือพบ overload ที่ไม่ได้จัดประเภท (55000) และ raise 42501 พร้อม rollback หากหลัง revoke สิทธิ์ที่มีผลจริงต่างจากเป้าหมาย หรือ PUBLIC ยังมี EXECUTE |
| supabase/tests/line_oa_definer_execute_matrix.sql | ใหม่ 82 assertion: matrix และ PUBLIC, การเรียกจริง 29 ครั้งที่ต้องถูกปฏิเสธที่ ACL ของฟังก์ชัน, ไม่มีผลข้างเคียง, RPC ที่คงไว้ยังเรียกได้ และตรวจเส้นทางที่คงไว้จากข้อมูลจริง |
| supabase/tests/line_oa_definer_execute_fail_closed.sql | ใหม่ 23 assertion: สิทธิ์สืบทอด, grantor อื่น, สิทธิ์ที่ต้องคงหายไปเพราะมาจาก PUBLIC, overload ที่ไม่ได้จัดประเภท และการรันปกติ |
| supabase/tests/line_outbound_claim_record.sql | assertion 23 เปลี่ยนเป็นตรวจว่า authenticated ไม่มี EXECUTE บน recorder แล้ว (มติเจ้าของ: service-only) |
| supabase/tests/line_oa_client_write_revoke.sql | assertion 131 เรียก fn_prod_curated ผ่าน rpc_field_create_appointment แทนการเรียกตรงด้วย service_role |
| scripts/run-line-db-suites.sh, scripts/line-ci-tap.mjs, tests/line-oa-commerce/ci/tap-evidence.test.mjs | ลงทะเบียน 2 suite ใหม่ (รวม 14 suite, LINE 5 suite) ให้ suite fail-closed ใช้ path ของ 0199 จริง และปรับเทสต์ของ harness |

## เส้นทางที่คงไว้ ตรวจจากข้อมูลจริง

| เส้นทาง | ผลใน GREEN |
|---|---|
| Ingress 1:1 ที่ลงลายเซ็น และ group join ที่ลงลายเซ็น (ผ่าน fn_line_handle_group_event) ด้วย service_role | เขียน inbound, identity และ bind prompt |
| line_oa_resolve_customer_identity ด้วย service_role | สร้าง identity |
| Trigger welcome เมื่อ service_role ผูกกลุ่มลูกค้า และ owner สร้าง trigger ใหม่ | welcome pack เข้าคิว และสร้าง trigger ใหม่ได้ |
| fn_prod_curated ผ่าน rpc_field_create_appointment (ผู้ใช้ของ site) และ rpc_factory_report_station (ผู้ใช้ governance) | tpl_appointment และ tpl_prod_started เข้าคิว |
| fn_lead_followup_sweep ด้วย service_role และด้วย owner (principal ของ cron) รวมถึง rpc_sweep_line_session_timeouts | ทำงานทั้งหมด |
| Claim และ record ด้วย service_role | claim แล้วบันทึกเป็น sent |
| RPC ของ field-app 5 ตัว: ผู้ใช้ที่มีสิทธิ์ และผู้ใช้ของ site อื่น | สำเร็จ 4 ตัวโดยตรวจจากข้อมูล ส่วน drawing revision ผ่าน guard ได้ การเรียกจาก site อื่นถูกปฏิเสธโดย guard ในเนื้อฟังก์ชันทุกตัว |

## ผลลัพธ์

| การตรวจ | RED-A (ไม่มี 0199) | RED-B (mutant) | GREEN (0199) |
|---|---|---|---|
| Migrate จากศูนย์ | 193 | 194 | 194 |
| Suite matrix | ผ่าน 36 ล้มตรง 46 | ไม่ได้รัน | 82/82 |
| Fail-closed ของ 0199 | ไม่ได้รัน | ล้มตรง 12 (กรณี A-C) | 23/23 |
| Suite เดิม / P0-10 / fail-closed ของ 0198 | ล้มเฉพาะข้อ 23 / 133 / 28 | ไม่ได้รัน | 107 / 133 / 28 |
| Python / claim race | 72/72 / ซ้ำ 0 | ไม่ได้รัน | 72/72 / ซ้ำ 0 |
| CI harness / CI suite runner ในเครื่อง | ไม่ได้รัน | ไม่ได้รัน | ผ่าน / ล้มเฉพาะ suite containment เดิม |

## สิ่งที่ยังไม่ยืนยัน

- caller register ของ ops (ผู้เรียกภายนอกหรือเรียกด้วยมือ, principal ของ cron, เจ้าหน้าที่ที่บันทึกผลเอง) และความเห็นของเจ้าของ manufacturing เรื่อง fn_prod_curated ทั้งสองยังเป็นสมมติฐานจนกว่าจะได้คำตอบ
- Production: ยังไม่ทราบ grant, grantor, owner และการเปิดผ่าน PostgREST การตรวจ production catalog แบบอ่านอย่างเดียวยังเป็นด่านแยก
- GitHub Actions: ยังไม่ได้ push และ suite containment จะยังล้มที่นั่น
- ฟังก์ชันที่สร้างใหม่หรือสร้างซ้ำภายหลังยังได้ EXECUTE ตาม default ซึ่งเป็นการตัดสินนโยบายแยก

## ไฟล์

ผลดิบของแต่ละรอบอยู่ใน SHA256SUMS.run และ REPLAY.txt ระบุคำสั่งที่รันจริง gate-p012.py และ commit-p012.sh คือ gate และ wrapper ที่ใช้ commit ส่วน transcript อยู่ใน docs/governance/evidence/line-p012-commit-2026-09-30/
