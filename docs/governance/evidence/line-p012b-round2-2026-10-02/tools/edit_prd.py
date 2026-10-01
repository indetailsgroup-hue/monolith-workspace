"""PRD-LINE-OA edition 1.15 (2 October 2026), EN and TH. Each replacement must match once.
usage: python edit_prd.py <repo>"""
import sys
from pathlib import Path

root = Path(sys.argv[1])
EN, TH = root / "docs/PRD-LINE-OA.en.md", root / "docs/PRD-LINE-OA.th.md"
en, th = EN.read_text(encoding="utf-8"), TH.read_text(encoding="utf-8")
EXCERPT = "`docs/governance/evidence/line-p012b-round2-2026-10-02/01-github-actions-excerpt.txt`"


def rep(s, old, new):
    assert s.count(old) == 1, old[:90]
    return s.replace(old, new)


en = rep(en, "> **Edition:** 1.14 · 30 September 2026 (1.13, 1.12,",
         "> **Edition:** 1.15 · 2 October 2026 (1.14, 1.13, 1.12,")
th = rep(th, "> **ฉบับ:** 1.14 · 30 กันยายน 2026 (1.13, 1.12,",
         "> **ฉบับ:** 1.15 · 2 ตุลาคม 2026 (1.14, 1.13, 1.12,")

en_old5 = next(l for l in en.split("\n") if l.startswith("> **What changed in 1.14:**"))
en = rep(en, en_old5,
         "> **What changed in 1.15:** PR #133 ran on GitHub Actions for the first time. At a97c3c847, DB Verify passed the five LINE suites (107/133/28/82/23, claim race zero overlap) while its full verdict failed on `trust_kernel_containment` (storage was disabled in `supabase/config.toml`) and on the known `repair_phase0_containment`. Commit 48b72d4c7 cleared the claim-linter findings (eight sealed evidence REPORTs were amended openly under owner option A), enabled storage and added a shadow-E2E preflight; on that commit claim linters passed and `trust_kernel_containment` ran 16/16. A builder-side pre-review then strengthened the 0199 tests (round 2): realistic anon write probes, a missing-identity case and function-ACL message checks, with new RED-A, mutant and GREEN evidence. Independent review is still pending, deployment stays blocked, and Phase A remains `EVIDENCE_INCOMPLETE`.")
th_old5 = next(l for l in th.split("\n") if l.startswith("> **สิ่งที่เปลี่ยนในฉบับ 1.14:**"))
th = rep(th, th_old5,
         "> **สิ่งที่เปลี่ยนในฉบับ 1.15:** PR #133 รันบน GitHub Actions ครั้งแรก ที่ a97c3c847 DB Verify ผ่าน suite LINE ทั้ง 5 ชุด (107/133/28/82/23 และ claim race ซ้ำ 0) แต่ผลรวมล้มที่ `trust_kernel_containment` (เพราะ `supabase/config.toml` ปิด storage) และที่ `repair_phase0_containment` ซึ่งรู้อยู่แล้ว commit 48b72d4c7 แก้ข้อค้นพบของ claim linter (แก้ REPORT ของชุดหลักฐานที่ปิดผนึก 8 ชุดแบบเปิดเผยตามทางเลือก ก ของเจ้าของ) เปิด storage และเพิ่ม preflight ของ shadow E2E ใน commit นั้น claim linters ผ่าน และ `trust_kernel_containment` ได้ 16/16 จากนั้นการตรวจฝั่งผู้สร้างก่อนส่งตรวจทำให้เทสต์ของ 0199 เข้มขึ้น (รอบ 2) คือ probe แบบ anon ที่เขียนข้อมูลได้จริง case identity หาย และการตรวจข้อความ ACL ของฟังก์ชัน พร้อมหลักฐาน RED-A, mutant และ GREEN ใหม่ ยังรอผู้ตรวจอิสระ ยังห้าม deploy และ Phase A ยังเป็น `EVIDENCE_INCOMPLETE`")

en = rep(en, "## 0. Implementation status (edition 1.14)", "## 0. Implementation status (edition 1.15)")
th = rep(th, "## 0. สถานะการดำเนินการ (ฉบับ 1.14)", "## 0. สถานะการดำเนินการ (ฉบับ 1.15)")

en = rep(en, "There, the local fourteen-suite runner fails only the existing containment suite.",
         "There, the local fourteen-suite runner fails only the existing containment suite. Round 2 (2 October 2026, `docs/governance/evidence/line-p012b-red-a-2026-10-02/`, `-red-mutants-` and `-green-`) strengthened the tests on 48b72d4c7 without changing 0199. Without 0199 the matrix suite fails exactly 47 assertions, including the new write probe, which shows four realistic anon calls writing before their rollback, and the original suite fails exactly 23, 41 and 43. Mutant B fails exactly 12 and mutant C (identity check removed) exactly 2 fail-closed assertions. GREEN gives matrix 82/82, 0199 fail-closed 27/27, original 107/107, P0-10 133/133, 0198 fail-closed 28/28, Python 72/72 and claim race zero overlap.")
th = rep(th, "ในรอบนั้น runner 14 suite ในเครื่องล้มเฉพาะ suite containment เดิม",
         "ในรอบนั้น runner 14 suite ในเครื่องล้มเฉพาะ suite containment เดิม รอบ 2 (2 ตุลาคม 2026, `docs/governance/evidence/line-p012b-red-a-2026-10-02/`, `-red-mutants-` และ `-green-`) ทำให้เทสต์เข้มขึ้นบน 48b72d4c7 โดยไม่แก้ 0199 เมื่อไม่มี 0199 suite matrix ล้มตรง 47 ข้อ รวม probe การเขียนข้อใหม่ซึ่งแสดงว่าการเรียกแบบ anon ด้วยค่าจริง 4 แบบเขียนข้อมูลได้ก่อน rollback และ suite เดิมล้มตรงข้อ 23, 41 และ 43 mutant B ล้มตรง 12 ข้อ และ mutant C (ตัดการตรวจ identity) ล้มตรง 2 ข้อของ fail-closed ส่วน GREEN ได้ matrix 82/82, fail-closed ของ 0199 27/27, suite เดิม 107/107, P0-10 133/133, fail-closed ของ 0198 28/28, Python 72/72 และ claim race ซ้ำ 0")

en = rep(en, "| Defect | Status as of edition 1.14 |", "| Defect | Status as of edition 1.15 |")
th = rep(th, "| บั๊ก | สถานะ ณ ฉบับ 1.14 |", "| บั๊ก | สถานะ ณ ฉบับ 1.15 |")

en = rep(en, "| GitHub Actions | NOT RUN; source helper tests 46/46 and synthetic wiring 27/27 local only | Approved push and actual workflow conclusion; current DB workflow has no Python suites |",
         f"| GitHub Actions | RUN on push for PR #133: DB Verify at a97c3c847 passed the five LINE suites and failed the full verdict (containment); Trust Kernel Verify at 48b72d4c7 passed claim linters and `trust_kernel_containment`, and failed on `repair_phase0_containment`, shadow E2E (secrets not provisioned) and the final gate; excerpt in {EXCERPT} | Main-branch `pull_request` workflows wait for the merge-conflict resolution; the DB workflow still has no Python suites |")
th = rep(th, "| GitHub Actions | ยังไม่รัน; helper 46/46 กับ wiring จำลอง 27/27 เป็น local | อนุมัติ push และผล workflow จริง; DB workflow ปัจจุบันไม่มี Python suites |",
         f"| GitHub Actions | รันแล้วเมื่อ push ของ PR #133: DB Verify ที่ a97c3c847 ผ่าน suite LINE ทั้ง 5 ชุดแต่ผลรวมล้ม (containment) และ Trust Kernel Verify ที่ 48b72d4c7 ผ่าน claim linters และ `trust_kernel_containment` แต่ล้มที่ `repair_phase0_containment`, shadow E2E (ยังไม่ได้ตั้ง secret) และ final gate ข้อความที่คัดมาอยู่ใน {EXCERPT} | workflow แบบ `pull_request` ของ main รอแก้ merge conflict ก่อน และ DB workflow ยังไม่มี Python suites |")

en = rep(en, "| Req | Description | Acceptance criteria (tests against real Postgres, RED first) | Status (1.14) |",
         "| Req | Description | Acceptance criteria (tests against real Postgres, RED first) | Status (1.15) |")
th = rep(th, "| Req | รายละเอียด | Acceptance criteria (เทสต์ชน Postgres จริง, RED ก่อน) | สถานะ (1.14) |",
         "| Req | รายละเอียด | Acceptance criteria (เทสต์ชน Postgres จริง, RED ก่อน) | สถานะ (1.15) |")

en = rep(en, "| 🟡 built in 0199 with RED-A/RED-B/GREEN evidence; awaiting independent review; deploy blocked on ops and manufacturing answers |",
         "| 🟡 built in 0199 with RED-A/RED-B/GREEN evidence; tests strengthened in round 2 (RED-A/mutants/GREEN); LINE suites pass on GitHub Actions at a97c3c847; awaiting independent review; deploy blocked on ops and manufacturing answers |")
th = rep(th, "| 🟡 สร้างใน 0199 พร้อมหลักฐาน RED-A/RED-B/GREEN; รอผู้ตรวจอิสระ; ห้าม deploy จนกว่าจะได้คำตอบจาก ops และ manufacturing |",
         "| 🟡 สร้างใน 0199 พร้อมหลักฐาน RED-A/RED-B/GREEN; เทสต์เข้มขึ้นในรอบ 2 (RED-A/mutant/GREEN); suite LINE ผ่านบน GitHub Actions ที่ a97c3c847; รอผู้ตรวจอิสระ; ห้าม deploy จนกว่าจะได้คำตอบจาก ops และ manufacturing |")

en = rep(en, "- **Status (1.14):** local LINE pgTAP 107/133/28/82/23 and Python 72/72 pass, with claim race 10+10 and zero overlap (0199 GREEN). All fourteen suites ran; full pgTAP remains failed because containment is incomplete. No GitHub Actions result exists. Step 1 is not closed.",
         "- **Status (1.15):** local LINE pgTAP 107/133/28/82/27 and Python 72/72 pass, with claim race 10+10 and zero overlap (round-2 GREEN). All fourteen suites ran; full pgTAP remains failed because containment is incomplete. On GitHub Actions the five LINE suites passed at a97c3c847 (run 36748427203). Step 1 is not closed.")
th = rep(th, "- **สถานะ (1.14):** pgTAP LINE ในเครื่อง 107/133/28/82/23 และ Python 72/72 ผ่าน claim race 10+10 ซ้ำ 0 (GREEN ของ 0199) รันครบทั้ง 14 suite แต่ pgTAP เต็มยังไม่ผ่านเพราะ containment รันไม่ครบ ยังไม่มีผล GitHub Actions ขั้นที่ 1 ยังไม่ปิด",
         "- **สถานะ (1.15):** pgTAP LINE ในเครื่อง 107/133/28/82/27 และ Python 72/72 ผ่าน claim race 10+10 ซ้ำ 0 (GREEN รอบ 2) รันครบทั้ง 14 suite แต่ pgTAP เต็มยังไม่ผ่านเพราะ containment รันไม่ครบ บน GitHub Actions suite LINE ทั้ง 5 ชุดผ่านที่ a97c3c847 (run 36748427203) ขั้นที่ 1 ยังไม่ปิด")

en = rep(en, "- **Status (1.14):** the full local loop runs all fourteen suites and preserves the containment failure while the LINE suites pass. No filtered run is substituted for full CI. GitHub Actions has not run; push remains unapproved.",
         f"- **Status (1.15):** the full local loop runs all fourteen suites and preserves the containment failure while the LINE suites pass. No filtered run is substituted for full CI. GitHub Actions ran on push after owner approval (runs 36748427202 and 36748427203 at a97c3c847, 36795389505 at 48b72d4c7; excerpt in {EXCERPT}); the full verdict is still failed.")
th = rep(th, "- **สถานะ (1.14):** full loop ในเครื่องรันครบ 14 suite เก็บ failure ของ containment ตามจริง ขณะที่ LINE ผ่าน ไม่ใช้ผลรันที่กรอง suite แทน CI เต็ม ยังไม่ได้รัน GitHub Actions และยังไม่อนุมัติ push",
         f"- **สถานะ (1.15):** full loop ในเครื่องรันครบ 14 suite เก็บ failure ของ containment ตามจริง ขณะที่ LINE ผ่าน ไม่ใช้ผลรันที่กรอง suite แทน CI เต็ม GitHub Actions รันแล้วเมื่อ push หลังเจ้าของอนุมัติ (run 36748427202 และ 36748427203 ที่ a97c3c847 และ 36795389505 ที่ 48b72d4c7 ข้อความที่คัดมาอยู่ใน {EXCERPT}) ผลรวมยังล้ม")
EN.write_text(en, encoding="utf-8", newline="\n")
TH.write_text(th, encoding="utf-8", newline="\n")
print("PRD 1.15 written (EN and TH)")
