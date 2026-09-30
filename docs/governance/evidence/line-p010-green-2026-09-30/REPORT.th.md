# หลักฐาน RED/GREEN ของ P0-10 สำหรับ migration 0198

วันที่: 30 กันยายน 2026 ฐาน: da252d18a10d12e18bfc2afed3a82f4f79001090 บน codex/repair-intelligence-phase0-trust สถานะ: สร้างแล้ว รอการตรวจรับอิสระ ผลนี้ไม่ได้ปิด P0-10 หรือ Phase A และไม่ได้ push หรือ deploy

## สิ่งที่เปลี่ยน

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| supabase/migrations/0198_line_oa_revoke_client_write_grants.sql | revoke INSERT, UPDATE, DELETE และ TRUNCATE บน 8 ตาราง line_oa_* จาก anon, authenticated และ service_role เมื่อ role นั้นมีอยู่ โดยไม่ใช้ CASCADE จากนั้น raise และ rollback หากยังมี role ใดใน 3 role นี้มีสิทธิ์เขียนที่มีผลจริงระดับตารางหรือคอลัมน์ |
| supabase/tests/line_oa_client_write_revoke.sql | suite pgTAP ใหม่ 133 assertion (รายละเอียดด้านล่าง) |

ไม่เปลี่ยน SELECT, EXECUTE, REFERENCES, TRIGGER, MAINTAIN, owner, role membership และ default privileges และไม่แตะไฟล์ manufacturing OS, worktree อื่น, stack ที่แชร์ หรือ production

## Suite ใหม่

| Assertion | สิ่งที่พิสูจน์ |
|---|---|
| 1-4 | ตรวจขอบเขต (8 ตาราง, 3 role, 32 คำสั่ง), USAGE ของ schema ยังอยู่, PUBLIC ไม่มีสิทธิ์เขียน, owner ของแต่ละตารางยังมีสิทธิ์เขียนครบ 4 อย่าง |
| 5-28 | 3 role × 8 ตาราง: ไม่มี INSERT, UPDATE, DELETE หรือ TRUNCATE ที่มีผลจริงระดับตาราง และไม่มี INSERT หรือ UPDATE ระดับคอลัมน์ |
| 29-124 | ลองเขียนจริง 96 ครั้งด้วย SET LOCAL ROLE ตารางละ INSERT, UPDATE, DELETE และ TRUNCATE ต่อ role และ rollback ทุกครั้ง นับผ่านเฉพาะ SQLSTATE 42501 ที่มีข้อความ "permission denied for table" ตรงตัว |
| 125-127 | service_role ยังอ่านคอลัมน์ที่ sender ใช้จาก line_oa_channels, line_oa_conversations และ line_oa_message_templates ได้ |
| 128-129 | rpc_ingest_line_webhook ด้วย service_role รับ event จำลองที่ลงลายเซ็นถูกต้อง และเขียน conversation, inbound message, customer identity และ audit receipt |
| 130 | การผูกกลุ่มลูกค้าด้วย service_role ทำให้ fn_welcome_on_group_bind ใส่ tpl_welcome_pack เข้าคิว |
| 131 | fn_prod_curated ด้วย service_role ใส่ข้อความ push สถานะ pending ให้กลุ่มนั้นเพียง 1 แถว |
| 132-133 | rpc_claim_line_outbound_batch claim แถวนั้นพร้อม claim token และ rpc_record_line_send_result (เรียกด้วย named argument แบบเดียวกับ sender) บันทึกเป็น sent |

ข้อมูลทั้งหมดเป็นข้อมูลจำลองและถูก rollback stack ไม่มี edge runtime และปิด cron scheduler จึงส่งข้อความ LINE ไม่ได้

## ผลลัพธ์

| การตรวจ | RED (ไม่มี 0198) | GREEN (มี 0198) |
|---|---|---|
| Migrate จากศูนย์ | 192/192 | 193/193 |
| pgTAP เดิม | 107/107 | 107/107 |
| pgTAP ใหม่ของ P0-10 | ผ่าน 19 และล้มตรง 114 ข้อที่ตรวจสิทธิ์เขียน | 133/133 |
| Claim race | 10+10 ซ้ำ 0 | 10+10 ซ้ำ 0 |
| Python ที่จำเป็น 12 ไฟล์ | ผ่าน 64 ล้ม 8 (เฉพาะ test_clients_hold_no_write_grants) skip 0 | 72/72 skip 0 |
| Catalog: สิทธิ์เขียนของ anon / authenticated / service_role | 8/8 ตารางทุก role | 0/8 ทุก role |
| Catalog: สิทธิ์ owner, SELECT ของ service_role, EXECUTE บน 20 ฟังก์ชัน | ครบ; 8/8; 18/19/20 | ครบ; 8/8; 18/19/20 (ไม่เปลี่ยน) |
| Fingerprint ไม่เปลี่ยนจากเทสต์, จำนวน cron ที่รัน, teardown, credential scan | ใช่; 0; สะอาด; ผ่าน | ใช่; 0; สะอาด; ผ่าน |
| Exit ของตัวตรวจและ runner | 0 และ 0 | 0 และ 0 |

ใน RED probe 6 ข้อที่ผ่านคือ UPDATE และ DELETE บน audit log ซึ่ง 0005 revoke ไว้แล้ว probe ที่ล้มแสดงสิ่งที่ 0198 ถอนออก: service_role insert, update และ delete แถวจริงได้ และ truncate ได้ 7 ตาราง ส่วน anon และ authenticated ก็ truncate ได้ 7 ตารางเช่นกัน โดย insert ถูกหยุดด้วย RLS เท่านั้น line_oa_conversations truncate ไม่ได้ทุก role เพราะมี foreign key การลองทั้งหมดถูก rollback

## สิ่งที่ยังไม่ยืนยัน

- Production: grant, grantor, owner และ default ACL อาจต่างออกไป การตรวจ production catalog แบบอ่านอย่างเดียวก่อน deploy ยังเป็นด่านแยก
- CI: suite ใหม่ยังไม่อยู่ใน .github/workflows/db-verify.yml และยังไม่ได้ push
- สิทธิ์ EXECUTE (B12): 0198 ไม่ได้เปลี่ยน ดู docs/governance/line-p010-execute-survey.th.md
- Claim race และ Python รันบน stack ชั่วคราวของเครื่องนี้ ไม่ใช่ stack ที่เหมือน CI

## ไฟล์

ผลดิบของแต่ละรอบอยู่ใน SHA256SUMS.run ของชุดนั้น REPLAY.txt ของแต่ละชุดระบุคำสั่งที่รันจริง SHA256SUMS ครอบคลุมทุกไฟล์ยกเว้นตัวมันเอง commit-p010.sh และ gate-p010-change.py คือ wrapper และ gate ที่ใช้ commit ส่วน transcript ของการรันนั้นอยู่ใน docs/governance/evidence/line-p010-commit-2026-09-30/
