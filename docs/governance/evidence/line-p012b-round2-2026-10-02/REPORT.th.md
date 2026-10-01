# การแก้ข้อบกพร่องก่อนส่งตรวจของ 0199 และการแก้ CI (รอบ 2)

วันที่: 2 ตุลาคม 2026 (เวลาไทย เวลาใน runner เป็น UTC) ฐาน: 48b72d4c7c3f0d3bab197cb19483ca973807add2 บน codex/repair-intelligence-phase0-trust สถานะ: สร้างในเครื่องแล้ว รอผู้ตรวจอิสระ migration 0199 ไม่เปลี่ยน รอบนี้แก้ suite เทสต์ 3 ชุด เอกสาร และ comment ใน workflow 1 จุด

## การอนุมัติของเจ้าของ (2 ตุลาคม 2026)

เจ้าของอนุมัติทั้ง 3 ข้อในรอบเดียว และให้ push หลัง gate ผ่าน คือ แก้ข้อบกพร่องที่พบใน 48b72d4c7 ทำให้เทสต์ของ 0199 เข้มขึ้นพร้อมหลักฐาน RED/GREEN ใหม่บน stack ชั่วคราว และแก้ matrix doc ที่ล้าสมัย

## ที่มาของข้อค้นพบ

agent 2 ตัวที่ไม่มี context ของผู้สร้างตรวจ a97c3c847 และ 48b72d4c7 แบบอ่านอย่างเดียวฝั่งผู้สร้าง นี่คือการหาข้อบกพร่องฝั่งผู้สร้าง ไม่ใช่การตรวจรับอิสระ ผู้ตรวจอิสระยังต้องตรวจทั้งสอง commit และรอบนี้ ผู้สร้างตรวจซ้ำข้อสำคัญด้วยตัวเองก่อนแก้

## ข้อค้นพบและการจัดการ

| ข้อค้นพบ | การจัดการ |
|---|---|
| assertion 54 ของ suite matrix ล้มไม่ได้ เพราะทุก probe rollback เสมอ | แก้แล้ว: assertion 54 เรียกแบบ anon ด้วยค่าจริงกับฟังก์ชันเขียน 4 ตัว และเทียบ fingerprint ของ 7 ตารางภายในแต่ละ probe ก่อน rollback ส่วน RED-A แสดงว่าทั้ง 4 ตัวเขียนข้อมูลได้เมื่อไม่มี 0199 |
| `order by 1` ในเทสต์ fail-closed เรียงตามค่าคงที่ | แก้แล้ว: aggregate ทั้งสองเรียงตามค่าจริง |
| assertion "ไม่เปลี่ยนหลัง error" ของ fail-closed พิสูจน์แค่ว่ามี error | ปรับคำอธิบายให้ตรงกับสิ่งที่ตรวจ (สถานะหลัง rollback ถึง savepoint เท่ากับก่อนรัน) และหัวไฟล์ระบุว่า atomicity เป็นความหมายของ statement ใน PostgreSQL ส่วน owner ยังไม่ได้เทียบ |
| กรณีไม่พบ identity (55000) ยังไม่มีเทสต์ | แก้แล้ว: case F เปลี่ยนชื่อ identity หนึ่งตัวออกไปและคาด 55000 ส่วน mutant C (ตัดการตรวจ identity) ล้มตรง 2 ข้อของ case F |
| assertion 41 และ 43 ของ suite เดิมผ่านเพราะ ACL ของฟังก์ชัน แต่คำอธิบายพูดถึง guard ใน body | แก้แล้ว: ทั้งสองข้อต้องได้ข้อความ "permission denied for function rpc_record_line_send_result" และ RED-A แสดงว่าทั้งสองล้มเมื่อไม่มี 0199 (`line-p012b-red-a-2026-10-02/04c-original.tap:73`, `line-p012b-red-a-2026-10-02/04c-original.tap:78`) |
| assertion 55–60 ของ suite matrix ยอมรับ error ใดก็ได้ที่ไม่ใช่ ACL | แก้แล้ว: แยกประเภท schema denial และฟังก์ชันที่หาไม่เจอออก ไม่นับเป็น "body reached" |
| เทสต์ 69 เรียก owner ของ migration ว่า principal ของ cron | ปรับคำ: เป็น principal ที่สมมติ และไม่ได้ตรวจ cron.job |
| หัวไฟล์ suite matrix บอกว่าทุกข้อล้มใน RED | แก้แล้ว: ระบุ regression control 4 ข้อ (9, 35, 36, 46) |
| matrix doc มีฐานเก่า คำว่า DECIDE ย่อหน้า SENDER และหัวข้อ "รันในเครื่องแล้ว" ที่ล้าสมัย | แก้แล้วทั้ง TH และ EN แผนตรวจรับมีคอลัมน์สถานะ พร้อมข้อที่ทำบางส่วนและข้อที่ยังค้าง |
| 48b72d4c7: REPORT ที่แก้ 16 ไฟล์ชี้ไปยัง hash ก่อนแก้ที่ชุดหลักฐานยังไม่มี | แก้แล้ว: `line-ci-remediation-2026-10-01/12-pre-amendment-hashes.txt:38` (32 รายการ ทุกตัวเท่ากับ blob ฐาน) |
| 48b72d4c7: แถวใน survey ผ่าน linter ด้วยการอ้างบรรทัด grant แทนหลักฐานเรื่องผู้เรียก guard หรือ grant | แก้แล้ว: survey อ้างการตรวจซ้ำ R1 และ R2 ที่ 48b72d4c7 และบรรทัดนิยาม `0130_scrutiny5_fixes.sql:332-387` และ ledger ของการแก้ระบุแล้ว |
| 48b72d4c7: จำนวนการปรับถ้อยคำ ขอบเขต consent ที่แคบลง `src/mcp/pdpa.ts:34` การอ้างที่อ่อน และ longpaths | เปิดเผยในหัวข้อการแก้ไขของ `line-ci-remediation-2026-10-01/REPORT.th.md` ส่วน REPORT ที่ปิดผนึกของ 8 ชุดไม่แก้ซ้ำ |
| ข้ออ้างเรื่อง CI ไม่มีหลักฐานที่เก็บไว้ | แก้แล้ว: `01-github-actions-excerpt.txt:1` มี URL, head SHA, ผลของ job, hash ของ log และบรรทัดที่ตรงสำหรับ run 36748427202, 36748427203 และ 36795389505 |
| ป้ายใน workflow ของ trust kernel บอกว่า workflow ไม่เคยรัน | แก้แล้ว: ป้ายระบุ 2 run และระบุว่า final gate ยังไม่เคยผ่าน |
| membership แบบ SET อย่างเดียวจะผ่านการตรวจ (`has_function_privilege` นับเฉพาะสิทธิ์ที่ inherit) | ยังค้าง: เป็นกรณีทางทฤษฎี catalog ในเครื่องของ 3 role ไม่มี membership แบบนี้ (รายการ membership ที่ `line-p010-catalog-2026-09-30/08-analysis.txt:107`) production ต้องตรวจ catalog แยก |
| หัวไฟล์ 0199 บอกว่า migration ก่อนหน้าถอนสิทธิ์จาก PUBLIC เท่านั้น แต่ 0193 และ 0194 ถอนจาก anon และ authenticated ด้วย | ค้างโดยตั้งใจ: แก้ byte ของ 0199 จะทำให้หลักฐานของ commit ที่รอตรวจใช้ไม่ได้ จึงแจ้งผู้ตรวจไว้ที่นี่ |
| ทางที่ PUBLIC ยังเหลือสิทธิ์ใน 0199 ยังไม่มี case เฉพาะ | ยังค้าง: ซ้ำซ้อนเมื่อยังมี anon เพราะ anon inherit จาก PUBLIC |
| main ใช้เลข migration 0199 ขึ้นไปแล้ว และแถว KEEP อาจทำให้ 0199 หยุดใน production ถ้าสิทธิ์มาจาก PUBLIC อย่างเดียว | เป็นความเสี่ยงของการรวม branch (PRD §8 ข้อ 7) และการตรวจ catalog ของ production |

## สิ่งที่เปลี่ยน

| Path | การเปลี่ยน |
|---|---|
| `supabase/tests/line_oa_definer_execute_matrix.sql` | probe การเขียนพร้อม fingerprint ของตาราง (assertion 54) แยกประเภทผลให้เข้มขึ้น และแก้หัวไฟล์กับคำอธิบาย ยังคง 82 assertion |
| `supabase/tests/line_oa_definer_execute_fail_closed.sql` | เรียงตามค่า คำอธิบายตรงความจริง และ case F ใหม่ จาก 23 เป็น 27 assertion |
| `supabase/tests/line_outbound_claim_record.sql` | assertion 41 และ 43 ต้องได้ข้อความ ACL ของฟังก์ชัน แก้ comment และบรรทัด 429 ไม่เลื่อน |
| `docs/governance/line-b12-permission-matrix.{en,th}.md` | แก้ส่วนที่ล้าสมัย เพิ่มคอลัมน์สถานะ และหลักฐานรอบ 2 |
| `docs/governance/line-p010-execute-survey.{en,th}.md` | การตรวจซ้ำ R1 และ R2 และบรรทัดนิยามสำหรับช่องที่อ้างว่าไม่มี |
| `docs/governance/evidence/line-ci-remediation-2026-10-01/` | เพิ่ม hash ก่อนแก้ แก้ REPORT ส่วน `SHA256SUMS.run` คงเดิม |
| `docs/PRD-LINE-OA.{en,th}.md` | ฉบับ 1.15: ผล GitHub Actions หลักฐานรอบ 2 และตัวเลข |
| `.github/workflows/trust-kernel-verify.yml` | แก้เฉพาะ comment ป้าย |

HTML ที่เปลี่ยนทั้งหมดเท่ากับผล renderer ของ repository จาก Markdown ของตัวเอง

## หลักฐาน

| ชุด | ผล |
|---|---|
| `line-p012b-red-a-2026-10-02` | 193 migration โดยข้าม 0199 suite matrix ล้มตรง 47 ข้อ (4–8, 10–34, 37–45, 47–54) assertion 54 แสดงการเขียน 4 แบบ suite เดิมล้มตรงข้อ 23, 41 และ 43 P0-10 133/133 fail-closed ของ 0198 28/28 Python 72/72 claim race ซ้ำ 0 และ verifier ผ่าน 21 ข้อ |
| `line-p012b-red-mutants-2026-10-02` | มี 0199: mutant B ล้มตรง 12 ข้อ (3–6, 8–11, 13–16) mutant C ล้มตรง 2 ข้อ (23, 24) mutant ทั้งสองแค่ลบบรรทัด และ verifier ผ่าน 18 ข้อ |
| `line-p012b-green-2026-10-02` | 194 migration: matrix 82/82, fail-closed ของ 0199 27/27, suite เดิม 107/107, P0-10 133/133, fail-closed ของ 0198 28/28, Python 72/72, claim race ซ้ำ 0 runner 14 suite ในเครื่องล้มเฉพาะ repair_phase0_containment และ verifier ผ่าน 25 ข้อ |
| `line-p012b-round2-2026-10-02` | รายงานนี้ ข้อความที่คัดจาก GitHub Actions สคริปต์แก้ไขและสคริปต์สร้าง REPLAY gate และ wrapper สำหรับ commit ส่วน `02-gate-negative-controls.txt:10` เป็นต้นไปแสดงว่า gate ยอมรับชุดที่อนุมัติ และปฏิเสธการละเมิดที่ตั้งใจใส่ 8 แบบ แต่ละแบบด้วยข้อตรวจที่ตั้งใจไว้ |

ชุดของ runner ทุกชุดบันทึกคำสั่ง เวลา UTC exit code สำเนา source fingerprint ของ catalog ก่อนและหลังเทสต์ การถอด container และการสแกนข้อมูลลับระหว่างรันพร้อม positive control และ runner เขียน `SHA256SUMS.run` เอง

## ข้อจำกัด

- เป็นผลจาก stack ชั่วคราวในเครื่องเท่านั้น GitHub Actions จะรัน suite ที่แก้หลัง push ไม่มีการเข้า production, deploy, รัน cron หรือส่งข้อความจริง
- การตรวจอิสระของ a97c3c847, 48b72d4c7 และรอบนี้ยังค้าง ชุดหลักฐานที่ถูกแก้ต้องตรวจซ้ำ
- ยังห้าม deploy จนกว่าจะได้ caller register ของ ops การยืนยันจาก manufacturing เรื่อง `fn_prod_curated` การรวม branch (PRD §8 ข้อ 7) และการตรวจ catalog ของ production Phase A ยังเป็น `EVIDENCE_INCOMPLETE`
