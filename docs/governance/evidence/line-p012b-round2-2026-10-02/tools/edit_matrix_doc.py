"""Round-2 edits to docs/governance/line-b12-permission-matrix.{en,th}.md.
Each replacement must match exactly once. usage: python edit_matrix_doc.py <repo>"""
import sys
from pathlib import Path

root = Path(sys.argv[1])
EN = root / "docs/governance/line-b12-permission-matrix.en.md"
TH = root / "docs/governance/line-b12-permission-matrix.th.md"
en, th = EN.read_text(encoding="utf-8"), TH.read_text(encoding="utf-8")


def rep(s, old, new):
    assert s.count(old) == 1, old[:80]
    return s.replace(old, new)


en = rep(en, "30 September 2026. Source base c4c76717b9d64a51ad1c0b4421148587be7ba285. IMPLEMENTED LOCALLY in 0199, awaiting independent review; not deployed.",
         "30 September 2026, tests revised 2 October 2026. The matrix was drafted on c4c76717b9d64a51ad1c0b4421148587be7ba285 and implemented in 0199 (commit a97c3c847 on base 5119396a7). IMPLEMENTED LOCALLY, awaiting independent review; not deployed.")
th = rep(th, "30 กันยายน 2026 ฐาน source c4c76717b9d64a51ad1c0b4421148587be7ba285 สถานะ สร้างในเครื่องแล้วใน 0199 รอผู้ตรวจอิสระ ยังไม่ deploy",
         "30 กันยายน 2026 ปรับเทสต์ 2 ตุลาคม 2026 matrix ร่างบน c4c76717b9d64a51ad1c0b4421148587be7ba285 และสร้างใน 0199 (commit a97c3c847 บนฐาน 5119396a7) สถานะ สร้างในเครื่องแล้ว รอผู้ตรวจอิสระ ยังไม่ deploy")

en = rep(en, "and `supabase/tests/line_oa_definer_execute_fail_closed.sql` (23). Two existing tests changed with the policy.",
         "and `supabase/tests/line_oa_definer_execute_fail_closed.sql` (27; 23 at a97c3c847). Round 2 (2 October 2026) made assertion 54 run realistic anon calls that fingerprint the tables inside each probe, added case F (missing identity, 55000), and made the original suite's assertions 41 and 43 require the function-ACL message. Two existing tests changed with the policy.")
th = rep(th, "และ `supabase/tests/line_oa_definer_execute_fail_closed.sql` (23 assertion) เทสต์เดิมเปลี่ยนตามนโยบาย 2 จุด",
         "และ `supabase/tests/line_oa_definer_execute_fail_closed.sql` (27 assertion; 23 ที่ a97c3c847) รอบ 2 (2 ตุลาคม 2026) ทำให้ assertion 54 เรียกแบบ anon ด้วยค่าจริงและเทียบ fingerprint ของตารางภายใน probe เพิ่ม case F (identity หาย, 55000) และให้ assertion 41 กับ 43 ของ suite เดิมตรวจข้อความ ACL ของฟังก์ชัน เทสต์เดิมเปลี่ยนตามนโยบาย 2 จุด")

en = rep(en, "- Evidence: `evidence/line-p012-red-a-2026-09-30/`, `evidence/line-p012-red-b-2026-09-30/` and `evidence/line-p012-green-2026-09-30/`. These are local runs, awaiting independent review; they are not CI or production results.",
         "- Evidence: `evidence/line-p012-red-a-2026-09-30/`, `evidence/line-p012-red-b-2026-09-30/` and `evidence/line-p012-green-2026-09-30/`; round 2 in `evidence/line-p012b-red-a-2026-10-02/`, `evidence/line-p012b-red-mutants-2026-10-02/` and `evidence/line-p012b-green-2026-10-02/`. These are local runs, awaiting independent review; they are not production results.")
th = rep(th, "- หลักฐาน: `evidence/line-p012-red-a-2026-09-30/`, `evidence/line-p012-red-b-2026-09-30/` และ `evidence/line-p012-green-2026-09-30/` เป็นผลรันในเครื่องที่รอผู้ตรวจอิสระ ไม่ใช่ผล CI หรือ production",
         "- หลักฐาน: `evidence/line-p012-red-a-2026-09-30/`, `evidence/line-p012-red-b-2026-09-30/` และ `evidence/line-p012-green-2026-09-30/` และรอบ 2 ใน `evidence/line-p012b-red-a-2026-10-02/`, `evidence/line-p012b-red-mutants-2026-10-02/` และ `evidence/line-p012b-green-2026-10-02/` เป็นผลรันในเครื่องที่รอผู้ตรวจอิสระ ไม่ใช่ผล production")

en = rep(en, "KEEP preserves current access provisionally and does not approve every caller. DECIDE is a blocking business boundary.",
         "KEEP preserves current access provisionally and does not approve every caller. No row is DECIDE any more: the only one (B12-15) was settled by the owner as service-only.")
th = rep(th, "ส่วน KEEP คือคงเดิมชั่วคราว ไม่ได้อนุมัติ caller ทุกคน DECIDE คือขอบเขตธุรกิจที่ต้องตัดสิน",
         "ส่วน KEEP คือคงเดิมชั่วคราว ไม่ได้อนุมัติ caller ทุกคน ตอนนี้ไม่เหลือแถว DECIDE แล้ว แถวเดียวที่เคยเป็น (B12-15) เจ้าของตัดสินเป็น service-only")

en = rep(en, "SENDER: claim remains service-only. The recorder currently permits authenticated execution and checks governance/site access in 0197:122–129. Recommend service-only recording if ops and the owner confirm that no user-driven recording workflow is required. Otherwise retain the guarded user path and test it explicitly. Do not silently choose either branch.",
         "SENDER: claim remains service-only. Before 0199 the recorder permitted authenticated execution and checked governance/site access in 0197:122–129. The owner decided service-only recording on 30 September 2026 and 0199 implements it. Ops should still confirm that no staff member or tool records results by hand.")
th = rep(th, "SENDER: claim คง service-only ส่วน recorder ปัจจุบันให้ authenticated เรียกและตรวจ governance/site ใน 0197:122–129 แนะนำให้เป็น service-only ถ้า ops และเจ้าของยืนยันว่าไม่มีขั้นตอนบันทึกผลโดยผู้ใช้ หากยังต้องใช้ ให้คงเส้นทางผู้ใช้พร้อมทดสอบ guard โดยตรง ห้ามเลือกแทนโดยเงียบ",
         "SENDER: claim คง service-only ก่อน 0199 recorder ให้ authenticated เรียกและตรวจ governance/site ใน 0197:122–129 เจ้าของตัดสินให้บันทึกผลแบบ service-only เมื่อ 30 กันยายน 2026 และ 0199 ทำตามนั้นแล้ว ops ยังควรยืนยันว่าไม่มีพนักงานหรือเครื่องมือใดบันทึกผลด้วยมือ")

en = rep(en, "## Acceptance plan — executed locally in 0199 evidence\n\n| Check | Required evidence |\n| --- | --- |",
         "## Acceptance plan and local status\n\nStatus after the local runs of 0199 (round 1) and its strengthened tests (round 2): executed, partly, or open.\n\n| Check | Required evidence | Status |\n| --- | --- | --- |")
th = rep(th, "## แผนตรวจรับ — รันในเครื่องแล้วในหลักฐานของ 0199\n\n| การตรวจ | หลักฐานที่ต้องได้ |\n| --- | --- |",
         "## แผนตรวจรับและสถานะในเครื่อง\n\nสถานะหลังรัน 0199 ในเครื่อง (รอบ 1) และเทสต์ที่ปรับแล้ว (รอบ 2) คือ รันแล้ว บางส่วน หรือยังค้าง\n\n| การตรวจ | หลักฐานที่ต้องได้ | สถานะ |\n| --- | --- | --- |")

STATUS_EN = {
    "| Baseline |": " executed for owners, identities, overloads, the three roles, PUBLIC and inheritance; authenticator after 0199 is open (see the PUBLIC paragraph) |",
    "| RED |": " executed; round 2 adds realistic anon calls that are shown to write when 0199 is absent |",
    "| Denial |": " executed |",
    "| Trigger exception |": " executed |",
    "| Preserved behavior |": " executed |",
    "| Residual grants |": " executed (fail-closed cases A–C) |",
    "| Atomicity |": " partly: after a failing run and the savepoint rollback, ACLs and memberships equal the pre-state, and a rerun is clean (case E); atomicity itself is PostgreSQL statement semantics, and owners are not compared |",
    "| Integration |": " executed locally (only the existing containment suite fails); GitHub Actions ran the five LINE suites at a97c3c847 |",
    "| Evidence |": " local bundles produced; independent review open |",
}
STATUS_TH = {
    "| Baseline |": " รันแล้วสำหรับ owner, identity, overload, 3 role, PUBLIC และ inheritance ส่วน authenticator หลัง 0199 ยังค้าง (ดูย่อหน้า PUBLIC) |",
    "| RED |": " รันแล้ว รอบ 2 เพิ่มการเรียกแบบ anon ด้วยค่าจริงซึ่งเขียนข้อมูลได้เมื่อไม่มี 0199 |",
    "| Denial |": " รันแล้ว |",
    "| ข้อยกเว้น trigger |": " รันแล้ว |",
    "| งานที่ต้องคงไว้ |": " รันแล้ว |",
    "| สิทธิ์ตกค้าง |": " รันแล้ว (fail-closed case A–C) |",
    "| Atomicity |": " บางส่วน: หลังรันล้มและ rollback ถึง savepoint แล้ว ACL และ membership เท่ากับก่อนรัน และรันซ้ำได้สะอาด (case E) ส่วน atomicity เป็นความหมายของ statement ใน PostgreSQL และยังไม่ได้เทียบ owner |",
    "| Integration |": " รันแล้วในเครื่อง (ล้มเฉพาะ suite containment เดิม) GitHub Actions รัน suite LINE ทั้ง 5 ชุดที่ a97c3c847 |",
    "| หลักฐาน |": " ทำชุดหลักฐานในเครื่องแล้ว การตรวจอิสระยังค้าง |",
}


def add_status(s, table):
    lines = s.split("\n")
    done = 0
    for i, l in enumerate(lines):
        for k, v in table.items():
            if l.startswith(k) and l.endswith(" |") and l.count("|") == 3:
                lines[i] = l + v
                done += 1
    assert done == len(table), (done, len(table))
    return "\n".join(lines)


en, th = add_status(en, STATUS_EN), add_status(th, STATUS_TH)

en = rep(en, "Local results are in the line-p012 bundles; no CI or production result is claimed.",
         "Local results are in the line-p012 and line-p012b bundles. GitHub Actions results are excerpted in the line-p012b green bundle; no production result is claimed.")
th = rep(th, "ผลในเครื่องอยู่ในชุดหลักฐาน line-p012 และไม่อ้างผล CI หรือ production",
         "ผลในเครื่องอยู่ในชุดหลักฐาน line-p012 และ line-p012b ส่วนผล GitHub Actions มีข้อความที่คัดมาในชุด green ของ line-p012b และไม่อ้างผล production")
en = rep(en, "KEEP requires post-state effective EXECUTE, while DECIDE preserves the existing grant until an explicit decision.",
         "KEEP requires post-state effective EXECUTE, while DECIDE preserves the existing grant until an explicit decision (no row remains DECIDE). Recording grant origin for grantees other than the three roles is still open.")
th = rep(th, "KEEP ต้องยืนยันว่าสิทธิ์จริงยังมีหลังแก้ ส่วน DECIDE คง grant เดิมจนมีมติ",
         "KEEP ต้องยืนยันว่าสิทธิ์จริงยังมีหลังแก้ ส่วน DECIDE คง grant เดิมจนมีมติ (ไม่เหลือแถว DECIDE แล้ว) การบันทึกที่มาสิทธิ์ของ grantee อื่นนอกจาก 3 role ยังค้าง")
EN.write_text(en, encoding="utf-8", newline="\n")
TH.write_text(th, encoding="utf-8", newline="\n")
print("matrix doc updated (EN and TH)")
