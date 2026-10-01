"""Apply the owner-approved post-seal amendments (option A, 1 Oct 2026) to the
REPORT Markdown of eight sealed LINE evidence bundles.

Each edit is an exact replacement that must match exactly once, so a drifted
file stops the run instead of being half-edited. Thai paragraphs are split at
their existing sentence boundaries onto separate source lines (the renderer
joins paragraph lines with one space, so the rendered text is unchanged);
real absence claims gain a file:line citation to raw evidence in the same
bundle or to the source. Every REPORT (TH and EN) then gets an amendment
section. Results, numbers and conclusions are not edited.
usage: python amend_bundles.py <repo> [--write]
"""
import sys
from pathlib import Path

REPO = Path(sys.argv[1])
WRITE = "--write" in sys.argv
EV = REPO / "docs/governance/evidence"
RUN = "36748427202"
REMED = "docs/governance/evidence/line-ci-remediation-2026-10-01/"

NL = "\n"
TH_SPLIT = "เส้นแบ่งประโยคภาษาไทยเขียนเป็นการขึ้นบรรทัดใน source (ข้อความที่ render ออกมาเหมือนเดิม)"
EN_SPLIT = "Thai sentence boundaries are now source line breaks in REPORT.th.md (the rendered text is unchanged)"

EDITS = {
    "line-b12-catalog-fixture-2026-09-30": {
        "th": [(
            "--image postgres:18 โฟลเดอร์ผลต้องยังไม่มี และ image ต้อง cache อยู่แล้ว ต้องใช้สิทธิ์ Docker runner สร้างเฉพาะฐานจำลองใหม่ ไม่รับ connection ของฐานที่มีอยู่ ห้ามเพิ่มเข้า CI",
            "--image postgres:18" + NL + "โฟลเดอร์ผลต้องยังไม่มี และ image ต้อง cache อยู่แล้ว" + NL + "ต้องใช้สิทธิ์ Docker" + NL + "runner สร้างเฉพาะฐานจำลองใหม่ ไม่รับ connection ของฐานที่มีอยู่" + NL + "ห้ามเพิ่มเข้า CI",
        )],
        "en": [],
        "th_note": [TH_SPLIT + " ที่ย่อหน้าวิธีรัน"],
        "en_note": [EN_SPLIT + ", in the run-instructions paragraph"],
    },
    "line-b12-monolith-catalog-attempt2-2026-09-30": {
        "th": [
            (
                "ไม่มี overload เพิ่มหรือ named role หาย ทั้ง 20 เป็น SECURITY DEFINER owner postgres จำนวน EXECUTE คือ anon 18/20, authenticated 19/20, service_role 20/20, authenticator 1/20 และ postgres 20/20 พบ PUBLIC EXECUTE เฉพาะ fn_welcome_on_group_bind มี trigger trg_welcome_group_bind บน line_groups ผลตรงกับ",
                "ไม่มี overload เพิ่มหรือ named role หาย" + NL + "ทั้ง 20 เป็น SECURITY DEFINER owner postgres" + NL + "จำนวน EXECUTE คือ anon 18/20, authenticated 19/20, service_role 20/20, authenticator 1/20 และ postgres 20/20" + NL + "พบ PUBLIC EXECUTE เฉพาะ fn_welcome_on_group_bind" + NL + "มี trigger trg_welcome_group_bind บน line_groups" + NL + "ผลตรงกับ",
            ),
            (
                "หรือ production test การรู้ชื่อ owner ไม่รับรอง transitive call chain ทุกเส้นหรือสิทธิ์ owner ใน production ผู้เรียกภายนอก/ทำมือและ API exposure ยังไม่ยืนยัน catalog จึงรองรับ",
                "หรือ production test" + NL + "การรู้ชื่อ owner ไม่รับรอง transitive call chain ทุกเส้นหรือสิทธิ์ owner ใน production" + NL + "ผู้เรียกภายนอก/ทำมือและ API exposure ยังไม่ยืนยัน" + NL + "catalog จึงรองรับ",
            ),
            (
                "และไม่ปิด Phase A ไม่มี push, deploy, ข้อความจริง หรือเปิด cron",
                "และไม่ปิด Phase A" + NL + "ไม่มี push, deploy, ข้อความจริง หรือเปิด cron",
            ),
        ],
        "en": [],
        "th_note": [TH_SPLIT + " ที่ย่อหน้าผล catalog และย่อหน้าขอบเขต"],
        "en_note": [EN_SPLIT + ", in the catalog-result and scope paragraphs"],
    },
    "line-ci-source-2026-09-30": {
        "th": [(
            "ไม่ได้ push หรือรัน Actions จริง หลักฐานฐานข้อมูลเดิมไม่เปลี่ยน: LINE ผ่าน แต่ containment ล้มเพราะไม่มีฟังก์ชัน factory แบบ 12 arguments Patch นี้ไม่ได้แก้ containment สร้าง P0-9 เลือก tenant/รวม branch สร้าง 0199 เปลี่ยน default ACL หรืออนุมัติตรวจ production/deploy Phase A ยัง EVIDENCE_INCOMPLETE",
            "ไม่ได้ push หรือรัน Actions จริง" + NL + "หลักฐานฐานข้อมูลเดิมไม่เปลี่ยน: LINE ผ่าน แต่ containment ล้มเพราะไม่มีฟังก์ชัน factory แบบ 12 arguments" + NL + "Patch นี้ไม่ได้แก้ containment สร้าง P0-9 เลือก tenant/รวม branch สร้าง 0199 เปลี่ยน default ACL หรืออนุมัติตรวจ production/deploy" + NL + "Phase A ยัง EVIDENCE_INCOMPLETE",
        )],
        "en": [],
        "th_note": [TH_SPLIT + " ที่ย่อหน้าขอบเขต"],
        "en_note": [EN_SPLIT + ", in the scope paragraph"],
    },
    "line-p010-catalog-2026-09-30": {
        "th": [
            (
                "โดย commit เฉพาะชุดหลักฐานนี้ รอบนี้ไม่มี 0198 ไม่เปลี่ยน",
                "โดย commit เฉพาะชุดหลักฐานนี้" + NL + "รอบนี้ไม่มี 0198 (`02-migrations-applied.txt:192` จบที่ 0197) ไม่เปลี่ยน",
            ),
            (
                "ส่วน PUBLIC ไม่มีสิทธิ์เขียน และไม่มี ACL ระดับคอลัมน์ |",
                "ส่วน PUBLIC ไม่มีสิทธิ์เขียน (`08-analysis.txt:48`) และไม่มี ACL ระดับคอลัมน์ (`08-analysis.txt:99`) |",
            ),
            (
                "ชื่อผู้สมัครทั้ง 20 มีอยู่จริงเป็น 20 identity ไม่มี overload",
                "ชื่อผู้สมัครทั้ง 20 มีอยู่จริงเป็น 20 identity ไม่มี overload (`08-analysis.txt:185`)",
            ),
            (
                "internal foreign-key 8 ตัว (ไม่มี cascade)",
                "internal foreign-key 8 ตัว (ไม่มี cascade, `08-analysis.txt:237`)",
            ),
        ],
        "en": [
            (
                "No 0198, no grant/owner/membership change,",
                "No 0198 (`02-migrations-applied.txt:192` ends at 0197), no grant/owner/membership change,",
            ),
            (
                "PUBLIC holds no write grant. No column-level ACL exists. |",
                "PUBLIC holds no write grant (`08-analysis.txt:48`). No column-level ACL exists (`08-analysis.txt:99`). |",
            ),
            (
                "exist as exactly 20 identities with no overloads.",
                "exist as exactly 20 identities with no overloads (`08-analysis.txt:185`).",
            ),
            (
                "8 internal foreign-key triggers (no cascade)",
                "8 internal foreign-key triggers (no cascade, `08-analysis.txt:237`)",
            ),
        ],
        "th_note": [
            TH_SPLIT + " ที่ย่อหน้าการอนุมัติและขอบเขต",
            "เพิ่มการอ้าง `02-migrations-applied.txt:192` ให้ข้อความว่ารอบนี้ไม่มี 0198 และเพิ่มการอ้าง `08-analysis.txt` บรรทัด 48, 99, 185 และ 237 ให้ข้อค้นพบข้อ 2, 5 และ 8",
        ],
        "en_note": [
            EN_SPLIT + ", in the approval-and-scope paragraph",
            "A `02-migrations-applied.txt:192` citation supports the no-0198 scope statement, and `08-analysis.txt` lines 48, 99, 185 and 237 are cited for findings 2, 5 and 8",
        ],
    },
    "line-p010-ci-hardening-green-2026-09-30": {
        "th": [(
            "รัน pgTAP ครบ 12 suite แยก stdout, stderr, exit status และผลแต่ละ suite ตัวตรวจบังคับให้มี plan เดียว ผลครบตามลำดับ exit ศูนย์ ไม่มี fail, skip หรือ TODO ค่า `pass` รวมตาม `fullPass` โดยแยกจาก `linePass` Metadata ระบุผลในเครื่องตามจริง",
            "รัน pgTAP ครบ 12 suite แยก stdout, stderr, exit status และผลแต่ละ suite" + NL + "ตัวตรวจบังคับให้มี plan เดียว ผลครบตามลำดับ exit ศูนย์ ไม่มี fail, skip หรือ TODO" + NL + "ค่า `pass` รวมตาม `fullPass` โดยแยกจาก `linePass`" + NL + "Metadata ระบุผลในเครื่องตามจริง",
        )],
        "en": [],
        "th_note": [TH_SPLIT + " ที่ย่อหน้าผล pgTAP"],
        "en_note": [EN_SPLIT + ", in the pgTAP result paragraph"],
    },
    "line-p010-evidence-followup-2026-09-30": {
        "th": [
            (
                "และ digest ของ tested-source manifest ครบ สรุป provenanceComplete=true ไม่มี field ขาด หมายถึงข้อมูลครบ ไม่ใช่รับรองการรันจากภายนอก Base SHA",
                "และ digest ของ tested-source manifest ครบ" + NL + "สรุป provenanceComplete=true ไม่มี field ขาด (`07-ci-local/full/db-verify-evidence.json:14`)" + NL + "หมายถึงข้อมูลครบ ไม่ใช่รับรองการรันจากภายนอก" + NL + "Base SHA",
            ),
            (
                "จึงจะรายงาน provenance ว่าไม่ครบตามจริง งานนี้แก้รอบ local และเปิดเผย field ที่ขาด ไม่อ้างว่า runner ทุกตัวส่งครบ การตรวจข้อมูลลับ",
                "จึงจะรายงาน provenance ว่าไม่ครบตามจริง" + NL + "งานนี้แก้รอบ local และเปิดเผย field ที่ขาด ไม่อ้างว่า runner ทุกตัวส่งครบ" + NL + "การตรวจข้อมูลลับ",
            ),
        ],
        "en": [(
            "The summary reports provenanceComplete=true with no missing fields.",
            "The summary reports provenanceComplete=true with no missing fields (`07-ci-local/full/db-verify-evidence.json:14`).",
        )],
        "th_note": [
            TH_SPLIT + " ที่ย่อหน้า E2 และย่อหน้าข้อจำกัด",
            "เพิ่มการอ้าง `07-ci-local/full/db-verify-evidence.json:14` ให้ข้อความ provenanceComplete",
        ],
        "en_note": [
            EN_SPLIT + ", in the E2 and limitation paragraphs",
            "A `07-ci-local/full/db-verify-evidence.json:14` citation supports the provenanceComplete statement",
        ],
    },
    "line-p010-failclosed-green-2026-09-30": {
        "th": [(
            "บน origin/main และ branch นี้ไม่มี migration นั้น บน GitHub Actions",
            "บน origin/main และ branch นี้ไม่มี migration นั้น (`07-ci-local/full/ci-step-1.log:411`) บน GitHub Actions",
        )],
        "en": [(
            "on origin/main, a migration this branch lacks.",
            "on origin/main, a migration this branch lacks (`07-ci-local/full/ci-step-1.log:411`).",
        )],
        "th_note": ["เพิ่มการอ้าง `07-ci-local/full/ci-step-1.log:411` (psql error ของฟังก์ชัน 12 argument) ให้ข้อความว่า branch นี้ไม่มี 0170"],
        "en_note": ["A `07-ci-local/full/ci-step-1.log:411` citation (the psql error for the 12-argument function) supports the statement that this branch lacks 0170"],
    },
    "line-p012-green-2026-09-30": {
        "th": [
            (
                "หยุดเมื่อไม่พบ identity หรือพบ overload ที่ไม่ได้จัดประเภท (55000) และ raise 42501 พร้อม rollback หากหลัง revoke สิทธิ์ที่มีผลจริงต่างจากเป้าหมาย หรือ PUBLIC ยังมี EXECUTE |",
                "หยุดเมื่อไม่พบ identity หรือพบ overload ที่ไม่ได้จัดประเภท (55000, `0199_line_oa_restrict_definer_execute.sql:66`) และ raise 42501 พร้อม rollback หากหลัง revoke สิทธิ์ที่มีผลจริงต่างจากเป้าหมาย หรือ PUBLIC ยังมี EXECUTE (`0199_line_oa_restrict_definer_execute.sql:111`) |",
            ),
            (
                "ไม่มีผลข้างเคียง, RPC ที่คงไว้ยังเรียกได้",
                "ไม่มีผลข้างเคียง (`line_oa_definer_execute_matrix.sql:200`), RPC ที่คงไว้ยังเรียกได้",
            ),
            (
                "สิทธิ์ที่ต้องคงหายไปเพราะมาจาก PUBLIC,",
                "สิทธิ์ที่ต้องคงหายไปเพราะมาจาก PUBLIC (`line_oa_definer_execute_fail_closed.sql:204`),",
            ),
            (
                "authenticated ไม่มี EXECUTE บน recorder แล้ว (มติเจ้าของ: service-only) |",
                "authenticated ไม่มี EXECUTE บน recorder แล้ว (มติเจ้าของ: service-only, `line_outbound_claim_record.sql:429`) |",
            ),
        ],
        "en": [
            (
                "Stops on a missing identity or an unclassified overload (55000). Raises 42501 and rolls back if any effective right differs from the target afterwards or PUBLIC still holds EXECUTE. |",
                "Stops on a missing identity or an unclassified overload (55000, `0199_line_oa_restrict_definer_execute.sql:66`). Raises 42501 and rolls back if any effective right differs from the target afterwards or PUBLIC still holds EXECUTE (`0199_line_oa_restrict_definer_execute.sql:111`). |",
            ),
            (
                "no side effects, retained RPCs still execute",
                "no side effects (`line_oa_definer_execute_matrix.sql:200`), retained RPCs still execute",
            ),
            (
                "keep lost through PUBLIC,",
                "keep lost through PUBLIC (`line_oa_definer_execute_fail_closed.sql:204`),",
            ),
            (
                "(owner decision: service-only) |",
                "(owner decision: service-only, `line_outbound_claim_record.sql:429`) |",
            ),
        ],
        "th_note": ["เพิ่มการอ้าง source บรรทัดจริงในตารางสิ่งที่เปลี่ยน: 0199 บรรทัด 66 และ 111, matrix suite บรรทัด 200, fail-closed suite บรรทัด 204 และ claim-record suite บรรทัด 429"],
        "en_note": ["Source line citations were added to the what-changed table: 0199 lines 66 and 111, matrix suite line 200, fail-closed suite line 204 and claim-record suite line 429"],
    },
}

def note(lang, items, has_run):
    if lang == "th":
        head = [
            "## การแก้ไขหลังปิดผนึก (1 ตุลาคม 2026)",
            "",
            f"claim linter ที่ pin ไว้แจ้งประโยคในรายงานนี้ใน GitHub Actions รอบแรกของ branch (run {RUN}) เจ้าของอนุมัติให้แก้ถ้อยคำในรายงานแบบเปิดเผย การแก้ไขนี้เปลี่ยนเฉพาะถ้อยคำและการอ้างอิง ผล ตัวเลข และข้อสรุปข้างบนคงเดิม",
            "",
        ]
        tail = [
            ("- ผลดิบและ `SHA256SUMS.run` คงเดิม" if has_run else "- ผลดิบคงเดิม (bundle นี้ใช้ `SHA256SUMS` ไฟล์เดียว)")
            + " ส่วน `SHA256SUMS` เปลี่ยนเฉพาะบรรทัดของ REPORT ทั้ง 4 ไฟล์",
            f"- hash ของ REPORT ก่อนแก้และบันทึกการเปลี่ยนทั้งหมดอยู่ใน `{REMED}`",
            "- การแก้ไขนี้ต้องให้ผู้ตรวจอิสระตรวจซ้ำ",
        ]
    else:
        head = [
            "## Post-seal amendment (1 October 2026)",
            "",
            f"The pinned claim linter flagged sentences in this report on the branch's first GitHub Actions run (run {RUN}). The owner approved an open amendment of the report wording. This amendment changes wording and citations only; every result, number and conclusion above is unchanged.",
            "",
        ]
        tail = [
            ("- Raw outputs and `SHA256SUMS.run` are unchanged" if has_run else "- Raw outputs are unchanged (this bundle keeps a single `SHA256SUMS`)")
            + "; `SHA256SUMS` changes only in the lines of the four REPORT files.",
            f"- The pre-amendment REPORT hashes and the full change record are in `{REMED}`.",
            "- This amendment needs independent re-review.",
        ]
    return NL.join(head + [f"- {i}" for i in items] + tail) + NL

changed = []
for bundle, spec in EDITS.items():
    for lang in ("th", "en"):
        p = EV / bundle / f"REPORT.{lang}.md"
        text = p.read_text(encoding="utf-8")
        if "## การแก้ไขหลังปิดผนึก" in text or "## Post-seal amendment" in text:
            raise SystemExit(f"already amended: {p}")
        for old, new in spec[lang]:
            n = text.count(old)
            if n != 1:
                raise SystemExit(f"{p}: expected 1 match, found {n}: {old[:60]}")
            text = text.replace(old, new)
        if not text.endswith(NL):
            text += NL
        text += NL + note(lang, spec[f"{lang}_note"], (EV / bundle / "SHA256SUMS.run").exists())
        changed.append(p)
        if WRITE:
            p.write_text(text, encoding="utf-8", newline=NL)
for p in changed:
    print(("WROTE " if WRITE else "OK    ") + str(p.relative_to(REPO)).replace("\\", "/"))
