# หลักฐาน catalog ของ P0-10: stack ชั่วคราวที่สร้างจาก migration chain

วันที่: 30 กันยายน 2026 ฐาน: 6a41ebb691ff3020838774f34aa4afebe2fdd61c บน codex/repair-intelligence-phase0-trust สถานะ: เก็บหลักฐานแล้ว รอผู้ตรวจอิสระ ผลนี้ไม่ได้ปิด P0-10 หรือ Phase A ไม่ได้อนุมัติ migration 0198 และไม่ได้เปลี่ยนสิทธิ์ใด ๆ

## การอนุมัติและขอบเขต

เจ้าของอนุมัติ 2 เรื่อง คือ รวม service_role ในเป้าหมายการออกแบบ revoke ของ P0-10 และให้เก็บ catalog แบบอ่านอย่างเดียวบน stack ชั่วคราวที่ migrate จากศูนย์ โดย commit เฉพาะชุดหลักฐานนี้
รอบนี้ไม่มี 0198 (`02-migrations-applied.txt:192` จบที่ 0197) ไม่เปลี่ยน grant/owner/membership ไม่รัน pgTAP, Python หรือการทดสอบเขียน ไม่ push ไม่ deploy ไม่ให้ cron ทำงาน ไม่ส่งข้อความจริง และไม่เชื่อมต่อฐานข้อมูล shared หรือ production

## วิธีสร้างหลักฐาน

| รายการ | ค่า |
|---|---|
| Runner | run-p010-catalog.sh (ไบต์ที่รันจริง sha256 e64a4445…2c1d) |
| Catalog SQL | catalog-checklist.sql sha256 5ed8f00dea517687b658401dc570e8ab24b59d71ae0a5b845f808f6887a3d987 (hash ที่อนุมัติ ไม่ได้แก้) |
| Stack | supabase/postgres 17.6.1.158 + gotrue v2.195.0 + storage-api v1.66.4 image ID อยู่ใน 00-context.txt |
| การแยกสภาพแวดล้อม | network line-p010-net, DB เปิดเฉพาะ 127.0.0.1:55444, cron.launch_active_jobs=off |
| เวลา (UTC) | เริ่ม 09:25:58, catalog 09:26:49, จบ 09:26:53 |
| เครื่องมือ | psql 18.1, Python 3.14.2, Node v22.21.1, Docker 29.8.0 |

## ผลการรัน

| การตรวจ | ผล | ไฟล์ |
|---|---|---|
| Pre-flight (HEAD, branch, supabase/ สะอาด, hash ของ SQL, ชื่อ, พอร์ต, image) | ผ่าน ไม่มีของเดิมค้าง | 00-context.txt |
| ไฟล์ migration เทียบ blob ของฐาน | 192 ไฟล์: เหมือนทุกไบต์ 10, ต่างเฉพาะ CRLF/LF 182, ต่างสาระ 0 | 02a-migration-sources.txt |
| Migrate จากศูนย์ | ผ่าน 192 จาก 192, fail 0, ไม่มี shim | 02-migrations-applied.txt |
| Cron | chain สร้าง 12 job, scheduler ปิด, cron.job_run_details มี 0 แถว | 03-baseline-after-migrations.txt |
| Catalog checklist | แบบ aligned exit 0, แบบ unaligned exit 0, ได้ 11 ชุดผลทั้งสองแบบ | 04a, 04b |
| Checklist ไม่เปลี่ยน catalog | fingerprint ก่อนและหลังเท่ากัน | 00-context.txt, 03, 05 |
| Teardown | ไม่เหลือ container และ network ของรอบนี้ | 06-teardown.txt |
| Credential scan ระหว่างรัน | positive control ตรวจเจอ, ไม่พบไบต์ credential ที่สร้างขึ้นใน 18 ไฟล์ | 07-credential-scan.txt |
| Exit ของ runner | 0 | 00-context.txt |

## ข้อค้นพบจาก catalog ของ stack นี้

| # | ข้อค้นพบ (ยืนยันจาก 04b และสรุปใน 08-analysis.txt) |
|---|---|
| 1 | ตารางเป้าหมายทั้ง 8 มี owner เป็น postgres เปิด RLS แต่ไม่ได้ force |
| 2 | anon, authenticated และ service_role มี INSERT/UPDATE/DELETE/TRUNCATE โดยตรงใน 7 ตาราง และมี INSERT/TRUNCATE ใน line_oa_audit_log ส่วน PUBLIC ไม่มีสิทธิ์เขียน (`08-analysis.txt:48`) และไม่มี ACL ระดับคอลัมน์ (`08-analysis.txt:99`) |
| 3 | สิทธิ์เขียนที่มีผลจริง: anon 8/8 ตาราง, authenticated 8/8, service_role 8/8, authenticator 0/8 (NOINHERIT มีแค่ทาง SET ROLE), postgres 8/8 |
| 4 | postgres ไม่ใช่ superuser มี BYPASSRLS และเป็นสมาชิกแบบ inherit ของ anon, authenticated, service_role และ authenticator |
| 5 | ชื่อผู้สมัครทั้ง 20 มีอยู่จริงเป็น 20 identity ไม่มี overload (`08-analysis.txt:185`) ทั้ง 20 เป็น SECURITY DEFINER, owner คือ postgres และกำหนด search_path ไว้ |
| 6 | postgres เป็นเจ้าของทั้ง 8 ตาราง สิทธิ์เขียนของฟังก์ชัน definer ทุกตัวจึงมาจากความเป็นเจ้าของ สิทธิ์ที่พึ่งการเป็นสมาชิก role อย่างเดียว: ไม่มี |
| 7 | มี routine อื่นอีก 27 ตัวที่ตรงกับการค้นข้อความ (definer 23, invoker 4) owner เป็น postgres ทั้งหมด ตัวที่เป็น invoker คือ fn_wf_render_notification_text, line_oa__ct_equal, line_oa_audit_log_immutable และ line_oa_normalize_order ซึ่งไม่ได้เก็บเนื้อฟังก์ชัน |
| 8 | มี trigger บนตารางเป้าหมาย 10 ตัว: internal foreign-key 8 ตัว (ไม่มี cascade, `08-analysis.txt:237`), guard แบบ definer trg_line_guard_customer_group และ trg_line_oa_audit_log_immutable แบบ invoker อีก 2 ตัวอยู่บนตารางอื่น (installation_projects, line_groups) และเรียก routine แบบ definer ทั้งคู่ |
| 9 | ไม่มี view, materialized view หรือ rule ที่พึ่งพา 8 ตารางนี้ |
| 10 | Default ACL ของผู้สร้าง postgres และ supabase_admin ใน public ให้ ALL บนตาราง, EXECUTE บนฟังก์ชัน และสิทธิ์ sequence แก่ anon, authenticated และ service_role |

## ความหมาย (ข้ออนุมาน ยังต้องทดสอบ)

บน stack นี้ การ revoke INSERT/UPDATE/DELETE/TRUNCATE บน 8 ตารางจาก anon, authenticated และ service_role จะไม่ตัดสิทธิ์ที่ routine definer ทั้ง 20 ใช้ เพราะสิทธิ์นั้นมาจากความเป็นเจ้าของตาราง ไม่ได้มาจากการเป็นสมาชิก service_role แต่ยังต้องทดสอบด้วยการเขียนจริงที่ต้องได้ SQLSTATE 42501 หลังการแก้ที่อนุมัติแยก ข้อ 10 หมายความว่าตารางใหม่ใน public จะได้ grant เหล่านี้กลับมาอีก เว้นแต่จะเปลี่ยน default ซึ่งอยู่นอกขอบเขตที่อนุมัติ

## ข้อสังเกตใหม่นอกขอบเขต table grant

anon EXECUTE ได้ 18 จาก 20 ฟังก์ชัน definer ที่เขียนข้อมูล authenticated ได้ 19 และ service_role ได้ 20 มีเพียง rpc_claim_line_outbound_batch ที่จำกัดให้ service_role และ rpc_record_line_send_result ที่ไม่ได้ให้ anon ส่วน fn_welcome_on_group_bind มี PUBLIC EXECUTE ด้วย migration revoke EXECUTE จาก PUBLIC เท่านั้น (เช่น 0107_factory_group_milestones.sql บรรทัด 61) ขณะที่ default ACL ให้สิทธิ์กับ role ที่มีชื่อโดยตรง source ของ fn_prod_curated (0107 บรรทัด 50 ถึง 60) insert ข้อความ push สถานะ pending เข้ากลุ่มลูกค้าโดยไม่ตรวจผู้เรียก การ revoke table grant จึงไม่ได้หยุด client role จากการเรียกฟังก์ชัน definer ที่เขียนข้อมูล ยังไม่ทราบว่า PostgREST ใน production เปิดฟังก์ชันเหล่านี้หรือไม่ เรื่องนี้ต้องให้เจ้าของตัดสินแยก และไม่อยู่ในขอบเขต 0198 ที่อนุมัติ

## สิ่งที่หลักฐานนี้ยังไม่ยืนยัน

- Catalog ของ production: owner, ACL, membership, default ACL และ EXECUTE อาจต่างจาก chain ที่สร้างใหม่นี้
- พฤติกรรมหลัง revoke: รอบนี้ไม่ได้ทดลอง revoke หรือเขียนข้อมูล
- การตรวจสิทธิ์ภายในเนื้อฟังก์ชันอีก 19 ตัว: เก็บไว้แค่ hash ของเนื้อฟังก์ชัน ไม่ได้เก็บตัวเนื้อ
- ผู้เขียนภายนอกผ่าน service key: มีเพียงคำยืนยันของ ops ที่เจ้าของส่งต่อ

## ไฟล์

ผลดิบของการรันอยู่ใน SHA256SUMS.run ผู้เก็บหลักฐานเพิ่ม analyze-p010-catalog.py, 08-analysis.txt, gate-p010-commit.py, REPLAY.txt และรายงาน 4 ไฟล์นี้หลังการรัน SHA256SUMS ครอบคลุมทุกไฟล์ยกเว้นตัวมันเอง วิธีตรวจซ้ำและรันซ้ำอยู่ใน REPLAY.txt

## ขั้นต่อไป

ผู้ตรวจอิสระตรวจ commit นี้ (checksum, owner/ACL, membership, trigger และ view) ก่อนขออนุมัติ 0198 ส่วนข้อสังเกตเรื่อง EXECUTE ส่งให้เจ้าของตัดสินแยก Phase A ยังคงเป็น EVIDENCE_INCOMPLETE

## การแก้ไขหลังปิดผนึก (1 ตุลาคม 2026)

claim linter ที่ pin ไว้แจ้งประโยคในรายงานนี้ใน GitHub Actions รอบแรกของ branch (run 36748427202) เจ้าของอนุมัติให้แก้ถ้อยคำในรายงานแบบเปิดเผย การแก้ไขนี้เปลี่ยนเฉพาะถ้อยคำและการอ้างอิง ผล ตัวเลข และข้อสรุปข้างบนคงเดิม

- เส้นแบ่งประโยคภาษาไทยเขียนเป็นการขึ้นบรรทัดใน source (ข้อความที่ render ออกมาเหมือนเดิม) ที่ย่อหน้าการอนุมัติและขอบเขต
- เพิ่มการอ้าง `02-migrations-applied.txt:192` ให้ข้อความว่ารอบนี้ไม่มี 0198 และเพิ่มการอ้าง `08-analysis.txt` บรรทัด 48, 99, 185 และ 237 ให้ข้อค้นพบข้อ 2, 5 และ 8
- ผลดิบและ `SHA256SUMS.run` คงเดิม ส่วน `SHA256SUMS` เปลี่ยนเฉพาะบรรทัดของ REPORT ทั้ง 4 ไฟล์
- hash ของ REPORT ก่อนแก้และบันทึกการเปลี่ยนทั้งหมดอยู่ใน `docs/governance/evidence/line-ci-remediation-2026-10-01/`
- การแก้ไขนี้ต้องให้ผู้ตรวจอิสระตรวจซ้ำ
