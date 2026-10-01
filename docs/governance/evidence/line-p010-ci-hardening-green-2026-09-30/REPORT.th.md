# P0-10 ปรับการตรวจหลักฐาน CI — รายงานส่งมอบ

30 กันยายน 2026 ฐาน `a0ea86320879b44c334c37c8a06127443ba5d59f` branch ผลิตภัณฑ์ `codex/repair-intelligence-phase0-trust`

## ผลลัพธ์

การตรวจ LINE ในเครื่องผ่าน แต่ชุดทดสอบฐานข้อมูลเต็มยังไม่ผ่าน หลักฐานรายงานผลนี้ถูกต้องแล้ว Phase A ยังเป็น `EVIDENCE_INCOMPLETE` และรอผู้ตรวจอิสระ

## สิ่งที่แก้

รัน pgTAP ครบ 12 suite แยก stdout, stderr, exit status และผลแต่ละ suite
ตัวตรวจบังคับให้มี plan เดียว ผลครบตามลำดับ exit ศูนย์ ไม่มี fail, skip หรือ TODO
ค่า `pass` รวมตาม `fullPass` โดยแยกจาก `linePass`
Metadata ระบุผลในเครื่องตามจริง

ตัวตรวจหลัง 0198 บังคับให้พบครบ 8 ตารางและ 3 role เพิ่ม fail-closed จาก 13 เป็น 28 assertions: ระบุ inheritance ชัดเจน เพิ่ม inherited DELETE/TRUNCATE และ column INSERT จากเดิมที่มี inherited INSERT/UPDATE และ column UPDATE เทสต์รัน 0198 จริงผ่าน savepoint และเทียบ ACL ของตาราง/คอลัมน์ รวม options/grantor ของ membership หลัง rollback ผลนี้พิสูจน์ขอบเขตของชุดทดสอบ ไม่ใช่ migration runner ทุกชนิด

0198 ไม่เปลี่ยนแม้แต่ byte เดียว PRD 1.10 บันทึกผลและรักษาหลักฐานย้อนหลัง Wrapper ตรวจขอบเขต staged files ข้อมูลลับ checksum และ tree ก่อน commit

## การทดสอบ

| รายการ | ผล |
| --- | --- |
| Migration จากศูนย์ RED และ GREEN | รอบละ 193 |
| RED ใช้ mutant ที่ตัด guard | ล้มตรง 20 ข้อที่คาด อีกแปดข้อผ่าน |
| GREEN fail-closed | 28/28 |
| LINE suites เดิม | 107/107 และ 133/133 |
| Python 12 ไฟล์ | 72/72 ไม่มี fail หรือ skip |
| Claim race สอง client | 10 + 10 แถว ซ้ำศูนย์ |
| Unit tests ตัวตรวจ TAP | 22/22 |
| pgTAP เต็มในเครื่อง | รันครบ 12 ผ่าน 11 ส่วน containment ล้ม |
| สรุป | linePass=true; fullPass=false; pass=false |
| เก็บกวาด | ไม่มี container/network ค้าง cron ไม่ได้รัน |

Containment จบด้วย exit 3 ที่ `repair_phase0_containment.sql:74` มีผล 6 จาก 8 เพราะไม่มี `rpc_factory_job_record_packet` แบบ 12 arguments ไม่แก้โค้ดหรือเทสต์ manufacturing ตัวตรวจหลักฐานยอมรับเฉพาะ failure นี้และบังคับให้ suite อื่นผ่าน Exit ศูนย์ของตัวตรวจหมายถึงหลักฐานตรงตามที่คาด ไม่ใช่ CI เต็มผ่าน ยังไม่ได้รัน GitHub Actions

## หลักฐานและที่มา

ชุด GREEN นี้และชุด RED ข้างกันเก็บ source ที่ทดสอบ คำสั่ง เวลา UTC exit code fingerprint และผลดิบ `SHA256SUMS.run` คง manifest ตอนจบรัน ส่วน `SHA256SUMS` ครอบคลุมชุดส่งมอบ `REPLAY.txt` บันทึก GREEN ครั้งแรกที่ preflight ปฏิเสธและการใช้พอร์ตเฉพาะที่ว่างในครั้งถัดมา ไม่แก้ชุดหลักฐานเก่า

Claude Opus 5.5 สร้างฉบับเสนอของตัวตรวจ runner unit tests และ SQL ส่วนขยายผ่าน CLI ส่งเฉพาะเนื้อหาที่คัดเลือกและปิดข้อมูลลับ ไม่มีไฟล์ลับและไม่มีสิทธิ์เครื่องมือ/filesystem Codex ตรวจ รวม และทดสอบ โดยแก้รายการเหตุผลที่คาดใน unit test ใหม่หนึ่งจุด พร้อมปรับ workflow/เอกสาร จึงไม่ใช่การตรวจรับอิสระของงานที่เราร่วมกันสร้าง

Wrapper และ transcript เปิดให้ตรวจ tree ที่ผ่าน gate ได้ เป็นบันทึกการทำงาน ไม่ใช่คำรับรองจากภายนอก การตรวจข้อมูลลับมี positive controls แต่ไม่พิสูจน์ว่าจะตรวจพบข้อมูลลับทุกรูปแบบ

## งานที่ยังเหลือ

รอผู้ตรวจอิสระ แก้ dependency ของ containment แยก และอนุมัติ push ก่อน CI จริง ส่วน P0-9, B12/0199 และ production catalog เป็นงานแยก ไม่ได้ push, deploy, ต่อ shared/production, เปิด cron หรือส่งข้อความจริง Stack ชั่วคราวนี้ไม่ได้พิสูจน์สิทธิ์ใน production

## การแก้ไขหลังปิดผนึก (1 ตุลาคม 2026)

claim linter ที่ pin ไว้แจ้งประโยคในรายงานนี้ใน GitHub Actions รอบแรกของ branch (run 36748427202) เจ้าของอนุมัติให้แก้ถ้อยคำในรายงานแบบเปิดเผย การแก้ไขนี้เปลี่ยนเฉพาะถ้อยคำและการอ้างอิง ผล ตัวเลข และข้อสรุปข้างบนคงเดิม

- เส้นแบ่งประโยคภาษาไทยเขียนเป็นการขึ้นบรรทัดใน source (ข้อความที่ render ออกมาเหมือนเดิม) ที่ย่อหน้าผล pgTAP
- ผลดิบและ `SHA256SUMS.run` คงเดิม ส่วน `SHA256SUMS` เปลี่ยนเฉพาะบรรทัดของ REPORT ทั้ง 4 ไฟล์
- hash ของ REPORT ก่อนแก้และบันทึกการเปลี่ยนทั้งหมดอยู่ใน `docs/governance/evidence/line-ci-remediation-2026-10-01/`
- การแก้ไขนี้ต้องให้ผู้ตรวจอิสระตรวจซ้ำ
