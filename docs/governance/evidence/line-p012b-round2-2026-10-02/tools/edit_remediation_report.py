"""Round-2 corrections to docs/governance/evidence/line-ci-remediation-2026-10-01/REPORT.{en,th}.md
(found by the builder-side pre-review of 48b72d4c7). usage: python edit_remediation_report.py <repo>"""
import sys
from pathlib import Path

d = Path(sys.argv[1]) / "docs/governance/evidence/line-ci-remediation-2026-10-01"
EN, TH = d / "REPORT.en.md", d / "REPORT.th.md"
en, th = EN.read_text(encoding="utf-8"), TH.read_text(encoding="utf-8")


def rep(s, old, new):
    assert s.count(old) == 1, old[:90]
    return s.replace(old, new)


en = rep(en, "citations, Thai sentence boundaries and two rewordings (ledger below) |",
         "citations, Thai sentence boundaries and several rewordings (ledger rows 20, 22, 25, 27 and 39, plus the dash in the matrix CALLER-UNKNOWN item; the count was corrected on 2 October 2026) |")
th = rep(th, "เพิ่มการอ้างอิง แยกประโยคภาษาไทย และปรับถ้อยคำ 2 จุด (ดูตารางด้านล่าง) |",
         "เพิ่มการอ้างอิง แยกประโยคภาษาไทย และปรับถ้อยคำหลายจุด (แถว 20, 22, 25, 27 และ 39 ของตาราง และขีดยาวในข้อ CALLER-UNKNOWN ของ matrix ซึ่งแก้จำนวนเมื่อ 2 ตุลาคม 2026) |")

en = rep(en, "staff column `0088_identity_binding_lifecycle.sql:10` and a re-check command at a97c3c847 (TH and EN) |",
         "staff column `0088_identity_binding_lifecycle.sql:10` and a re-check command at a97c3c847 (TH and EN). Disclosed on 2 October 2026: the wording narrowed from the whole schema to the `line_oa_customer_identity` table, and the re-check covered only `supabase/migrations` and `supabase/functions`; `src/mcp/pdpa.ts:34` holds an MCP-layer PDPA consent gate that the LINE send path does not use |")
th = rep(th, "คอลัมน์ของพนักงาน `0088_identity_binding_lifecycle.sql:10` และคำสั่งตรวจซ้ำที่ a97c3c847 (TH และ EN) |",
         "คอลัมน์ของพนักงาน `0088_identity_binding_lifecycle.sql:10` และคำสั่งตรวจซ้ำที่ a97c3c847 (TH และ EN) เปิดเผยเพิ่มเมื่อ 2 ตุลาคม 2026: ถ้อยคำแคบลงจากทั้ง schema เป็นตาราง `line_oa_customer_identity` และการตรวจซ้ำครอบคลุมแค่ `supabase/migrations` กับ `supabase/functions` ส่วน `src/mcp/pdpa.ts:34` มีด่าน PDPA consent ของชั้น MCP ซึ่งเส้นทางส่ง LINE ไม่ได้ใช้ |")

en = rep(en, "shorthand migration citations in the 18-row routine table expanded to resolvable file:line (TH and EN); cited lines checked |",
         "shorthand migration citations in the 18-row routine table expanded to resolvable file:line (TH and EN); cited lines checked. Correction of 2 October 2026: those citations point to grant, revoke or trigger lines and do not by themselves show the absence of callers, guards or grants; round 2 adds that evidence in the survey (re-checks R1 and R2 at 48b72d4c7 and the defining lines `0130_scrutiny5_fixes.sql:332-387`) |")
th = rep(th, "ขยายการอ้าง migration แบบย่อในตาราง routine 18 แถวเป็น file:line ที่เปิดได้จริง (TH และ EN) และตรวจบรรทัดที่อ้างแล้ว |",
         "ขยายการอ้าง migration แบบย่อในตาราง routine 18 แถวเป็น file:line ที่เปิดได้จริง (TH และ EN) และตรวจบรรทัดที่อ้างแล้ว แก้ไขเมื่อ 2 ตุลาคม 2026: การอ้างเหล่านั้นชี้บรรทัด grant, revoke หรือ trigger ซึ่งลำพังไม่ได้แสดงว่าผู้เรียก guard หรือ grant ไม่มีอยู่ รอบ 2 เพิ่มหลักฐานนั้นใน survey แล้ว (การตรวจซ้ำ R1 และ R2 ที่ 48b72d4c7 และบรรทัดนิยาม `0130_scrutiny5_fixes.sql:332-387`) |")

EN_CORR = """## Corrections and updates (2 October 2026)

A builder-side pre-review of 48b72d4c7 (not an independent acceptance) found the points below. Round 2 corrects them in commit-ready files; the sealed REPORTs of the eight bundles are not amended again.

- The 16 amended REPORTs say the pre-amendment hashes are in this bundle. That became true only in round 2, when `12-pre-amendment-hashes.txt` was added: 32 entries, each pre-amendment hash equal to the base blob at a97c3c847 (`12-pre-amendment-hashes.txt:38`).
- The commit message of 48b72d4c7 and the docstring of `tools/amend_bundles.py` say real absence claims gained citations. Ledger rows 2, 4, 11 and 38 were cleared by sentence splitting only, and rows 29–35 by citations to grant lines (round-2 evidence in the survey, see row 29–35).
- Two weak citations stay as written in sealed REPORTs: `line-p010-catalog-2026-09-30/08-analysis.txt:237` is the trigger-section header (the noaction lines are 238–245), and the p012-green Thai table cites line 66 for both the identity check and the overload check (the overload check is `0199_line_oa_restrict_definer_execute.sql:75`).
- The CI facts in this report (runs 36748427202 and 36748427203) are excerpted with their URLs in `line-p012b-round2-2026-10-02/01-github-actions-excerpt.txt:1`, together with run 36795389505 at 48b72d4c7, where claim linters passed and `trust_kernel_containment` ran 16/16 with storage enabled.
- The negative-control script asserts only a non-zero gate exit; `11-gate-negative-controls.txt:5` onward shows which check fired in each case.
- Found after the commit: on this host the commit-mode gate (`gate-ci-remediation.py --rev`) stops with "Filename too long" unless Git runs with `core.longpaths=true`; with it, the gate passed all 104 checks on 48b72d4c7.
"""
TH_CORR = """## การแก้ไขและข้อมูลเพิ่ม (2 ตุลาคม 2026)

การตรวจฝั่งผู้สร้างก่อนส่งตรวจของ 48b72d4c7 (ไม่ใช่การตรวจรับอิสระ) พบประเด็นด้านล่าง รอบ 2 แก้ในไฟล์ที่จะ commit ส่วน REPORT ของชุดหลักฐาน 8 ชุดที่ปิดผนึกไม่แก้ซ้ำ

- REPORT ที่แก้ทั้ง 16 ไฟล์บอกว่า hash ก่อนแก้อยู่ในชุดนี้ ข้อความนั้นเป็นจริงตั้งแต่รอบ 2 ที่เพิ่ม `12-pre-amendment-hashes.txt` แล้วเท่านั้น: 32 รายการ hash ก่อนแก้ทุกตัวเท่ากับ blob ฐานที่ a97c3c847 (`12-pre-amendment-hashes.txt:38`)
- commit message ของ 48b72d4c7 และ docstring ของ `tools/amend_bundles.py` บอกว่าข้ออ้างว่าไม่มีที่เป็นจริงได้การอ้างอิงแล้ว แต่แถว 2, 4, 11 และ 38 ผ่านด้วยการแยกประโยคอย่างเดียว และแถว 29–35 ผ่านด้วยการอ้างบรรทัด grant (หลักฐานรอบ 2 อยู่ใน survey ดูแถว 29–35)
- การอ้างที่อ่อน 2 จุดคงไว้ตามเดิมใน REPORT ที่ปิดผนึก: `line-p010-catalog-2026-09-30/08-analysis.txt:237` เป็นหัวส่วน trigger (บรรทัด noaction คือ 238–245) และตารางภาษาไทยของ p012-green อ้างบรรทัด 66 ทั้งการตรวจ identity และ overload (การตรวจ overload อยู่ที่ `0199_line_oa_restrict_definer_execute.sql:75`)
- ข้อเท็จจริงเรื่อง CI ในรายงานนี้ (run 36748427202 และ 36748427203) คัดพร้อม URL ไว้ใน `line-p012b-round2-2026-10-02/01-github-actions-excerpt.txt:1` รวมถึง run 36795389505 ที่ 48b72d4c7 ซึ่ง claim linters ผ่าน และ `trust_kernel_containment` ได้ 16/16 เมื่อเปิด storage
- สคริปต์ negative control ตรวจแค่ว่า gate exit ไม่เป็นศูนย์ ส่วน `11-gate-negative-controls.txt:5` เป็นต้นไปแสดงว่าแต่ละกรณีถูกตรวจข้อใด
- พบหลัง commit: บนเครื่องนี้ gate แบบ commit mode (`gate-ci-remediation.py --rev`) หยุดด้วย "Filename too long" ถ้า Git ไม่ได้เปิด `core.longpaths=true` เมื่อเปิดแล้ว gate ผ่านครบ 104 ข้อบน 48b72d4c7
"""
en = rep(en, "## Runner history", EN_CORR + "\n## Runner history")
th = rep(th, "## ประวัติการรัน runner", TH_CORR + "\n## ประวัติการรัน runner")
EN.write_text(en, encoding="utf-8", newline="\n")
TH.write_text(th, encoding="utf-8", newline="\n")
print("remediation report corrected (EN and TH)")
