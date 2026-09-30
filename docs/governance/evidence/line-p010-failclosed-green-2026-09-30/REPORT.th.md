# งานติดตาม P0-10: เทสต์ fail-closed และการลงทะเบียนใน CI

วันที่: 30 กันยายน 2026 ฐาน: 87930836a87852cac32efd80920b1d19f62b48f2 บน codex/repair-intelligence-phase0-trust สถานะ: สร้างแล้ว รอผู้ตรวจอิสระ ผลทั้งหมดเป็นผลรันในเครื่อง ไม่ใช่ผล GitHub Actions ไม่ได้ push หรือ deploy และยังไม่ปิด P0-10 หรือ Phase A

## สิ่งที่เปลี่ยน

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| supabase/tests/line_oa_client_write_revoke_fail_closed.sql | suite pgTAP ใหม่ 13 assertion รันไฟล์ 0198 ตัวจริงด้วย \ir ภายใน savepoint และตรวจเส้นทาง fail-closed โดยไม่แก้ 0198 |
| .github/workflows/db-verify.yml | ลงทะเบียน line_oa_client_write_revoke และ suite ใหม่ด้วย wrapper begin แบบเดียวกับ line_outbound_claim_record เพิ่มขั้นตรวจว่า 0198 ไม่เหลือสิทธิ์เขียนของ client และเพิ่มทั้งสอง suite ในสรุปหลักฐาน การ upload ครอบคลุม tap/*.tap อยู่แล้ว |

## Suite fail-closed

| Assertion | สิ่งที่พิสูจน์ |
|---|---|
| 1 | ตรวจขอบเขต: มี 8 ตารางและ anon และ anon เริ่มต้นโดยไม่มีสิทธิ์เขียน (0198 apply แล้ว) |
| 2-6 | กรณี ก: anon สืบทอด INSERT/UPDATE บน line_oa_orders จาก role จำลอง และมี INSERT โดยตรงบน line_oa_channels 0198 ต้อง raise 42501 ด้วยข้อความขึ้นต้น "P0-10: write privileges remain after revoke" และระบุ anon:line_oa_orders หลัง error ACL ระดับตาราง ACL ระดับคอลัมน์ และ membership ทั้งหมดต้องเท่ากับก่อนรัน และ INSERT โดยตรงต้องกลับมา |
| 7-11 | กรณี ข: anon มี UPDATE ระดับคอลัมน์บน line_oa_message_templates.body ที่ grantor อีกคนให้ พร้อม INSERT โดยตรงแบบเดียวกัน ตรวจ 4 ข้อเหมือนกรณี ก โดยระบุ anon:line_oa_message_templates |
| 12-13 | กรณี ค: เมื่อไม่มีสิทธิ์ใดเหลือ 0198 ทำงานจนจบ และถอนทั้ง INSERT โดยตรงและ UPDATE ระดับคอลัมน์ที่ owner ให้ |

กรณี ข ต้องใช้ grantor คนที่สอง เพราะ REVOKE ระดับตารางจะถอนสิทธิ์ระดับคอลัมน์ที่ grantor คนเดียวกันให้ไปด้วย ตามที่กรณี ค แสดง ข้อมูลของแต่ละกรณีเก็บไว้ในตัวแปร psql ก่อน แล้ว assertion จึงรันหลัง rollback savepoint ของกรณีนั้น บันทึกของ pgTAP จึงไม่ถูกย้อนกลับ role และ grant จำลอง rollback ทั้งหมด หลังรันไม่เหลือ role p010 และ fingerprint ของ catalog ไม่เปลี่ยน

## ผลลัพธ์

| การตรวจ | RED (mutant) | GREEN (0198 จริง) |
|---|---|---|
| Migrate จากศูนย์ | 193/193 โดย 0198 จริงอยู่ท้ายสุด | 193/193 โดย 0198 จริงอยู่ท้ายสุด |
| Suite fail-closed | ผ่าน 5 ล้มตรงข้อ 3-6 และ 8-11 การปฏิเสธทั้งสองจุดได้ SQLSTATE 00000 | 13/13 |
| Suite P0-10 / suite เดิม | ไม่ได้รัน | 133/133 / 107/107 |
| Claim race / Python 12 ไฟล์ | ไม่ได้รัน | ซ้ำ 0 / ผ่าน 72 จาก 72 ไม่มี skip |
| จำนวน cron ที่รัน, fingerprint, teardown, credential scan, ตัวตรวจ | 0; ไม่เปลี่ยน; สะอาด; ผ่าน; exit 0 | 0; ไม่เปลี่ยน; สะอาด; ผ่าน; exit 0 |

Mutant คือ 0198 ที่ตัดเฉพาะ loop ตรวจสิทธิ์คงเหลือและ RAISE ของมัน diff มีบรรทัดที่ลบ 20 บรรทัดและไม่มีบรรทัดที่เพิ่ม และไม่เคยอยู่ใน migration chain

## การรันขั้นฐานข้อมูลของ workflow ในเครื่อง

| ขั้น | Exit | หมายเหตุ |
|---|---|---|
| pgTAP suites (ตามที่เขียน) | 3 | หยุดที่ repair_phase0_containment.sql:74 ส่วน 8 suite ก่อนหน้ารายงาน all ok |
| Claim race | 0 | ซ้ำ 0 |
| ตรวจว่า chain ถึง 0192 | 0 | |
| ตรวจว่า 0198 ถอนสิทธิ์เขียนของ client (ขั้นใหม่) | 0 | |
| Assemble evidence | 0 | pgtap.pass = false เพราะ loop หยุดก่อน จึงไม่มี TAP ของ 3 suite LINE |
| ตัว loop ของ pgTAP ที่รันเฉพาะ 3 suite LINE | 0 | all ok 107, 133 และ 13 assertion |

พบปัญหาเดิม 2 เรื่องที่ไม่ได้แก้ในรอบนี้:

1. repair_phase0_containment.sql ตรวจ rpc_factory_job_record_packet แบบ 12 argument ซึ่งมีเฉพาะใน 0170_factory_jobs_list_real_fields.sql บน origin/main และ branch นี้ไม่มี migration นั้น บน GitHub Actions ขั้น pgTAP จะหยุดที่ suite นี้ จึงไม่ได้รัน suite LINE และอีก 3 ขั้นถัดไปจะถูกข้าม CI จึงยังใช้เป็นหลักฐานปิด P0-10 ไม่ได้ เรื่องนี้ต้องแก้ผ่านมติรวม branch (PRD §8 ข้อ 7) หรือการแก้ที่อนุมัติแยก
2. สคริปต์ "Assemble evidence" นับ suite ที่หยุดกลางทางว่าผ่าน (ok 6, not ok 0, plan 8) เพราะไม่ได้เทียบผลกับ plan

## สิ่งที่ยังไม่ยืนยัน

- ผล GitHub Actions: ยังไม่ได้ push
- Grant, grantor และ owner ของ production: การตรวจ production catalog แบบอ่านอย่างเดียวก่อน deploy ยังเป็นด่านแยก
- B12 (EXECUTE) และ 0199 ยังเป็นงานแยกที่ยังไม่อนุมัติ

## ไฟล์

ผลดิบอยู่ใน SHA256SUMS.run ของแต่ละชุด และ REPLAY.txt ระบุคำสั่งที่รันจริง gate-p010-followup.py และ commit-p010-followup.sh คือ gate และ wrapper ที่ใช้ commit ส่วน transcript อยู่ใน docs/governance/evidence/line-p010-followup-commit-2026-09-30/ gate อนุญาตค่าที่ไม่ใช่ความลับเพียงค่าเดียว คือ DSN ค่าเริ่มต้นสำหรับเครื่อง local ตามเอกสารของ Supabase CLI ใน db-verify.yml และสำเนาที่บันทึกไว้
