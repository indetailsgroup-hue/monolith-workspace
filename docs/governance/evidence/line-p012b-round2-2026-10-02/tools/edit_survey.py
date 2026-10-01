"""Round-2 edits to docs/governance/line-p010-execute-survey.{en,th}.md: point each
absence cell of rows 29-35 of the remediation ledger at real evidence (a re-check
or the defining lines) instead of relying on the grant citation alone.
usage: python edit_survey.py <repo>"""
import sys
from pathlib import Path

root = Path(sys.argv[1])
EN = root / "docs/governance/line-p010-execute-survey.en.md"
TH = root / "docs/governance/line-p010-execute-survey.th.md"
en, th = EN.read_text(encoding="utf-8"), TH.read_text(encoding="utf-8")


def rep(s, old, new):
    assert s.count(old) == 1, old[:90]
    return s.replace(old, new)


# fn_prod_curated: caller claim
th = rep(th, "| fn_prod_curated | 23 จุดในฟังก์ชัน DEFINER อื่น (0107 ถึง 0143) ไม่มีผู้เรียกจาก edge หรือ frontend |",
         "| fn_prod_curated | 23 จุดในฟังก์ชัน DEFINER อื่น (0107 ถึง 0143) ไม่มีผู้เรียกจาก edge หรือ frontend (ตรวจซ้ำ R1) |")
en = rep(en, "| fn_prod_curated | 23 call sites inside other DEFINER functions (0107 to 0143); no edge or frontend caller |",
         "| fn_prod_curated | 23 call sites inside other DEFINER functions (0107 to 0143); no edge or frontend caller (re-check R1) |")
# fn_lead_followup_sweep: guard claim
th = rep(th, "| service_role เท่านั้น (`0116_lead_followup.sql:223-225`) | ไม่มี |",
         "| service_role เท่านั้น (`0116_lead_followup.sql:223-225`) | ไม่มี (นิยามล่าสุด `0130_scrutiny5_fixes.sql:332-387` ไม่ตรวจผู้เรียก) |")
en = rep(en, "| service_role only (`0116_lead_followup.sql:223-225`) | none |",
         "| service_role only (`0116_lead_followup.sql:223-225`) | none (the latest definition, `0130_scrutiny5_fixes.sql:332-387`, has no caller check) |")
# fn_welcome_on_group_bind: grant claim
th = rep(th, "| ไม่มี และ PUBLIC ก็มี EXECUTE |",
         "| ไม่มี (ตรวจซ้ำ R2) และ PUBLIC ก็มี EXECUTE (`evidence/line-p010-catalog-2026-09-30/08-analysis.txt:135`) |")
en = rep(en, "| none; PUBLIC also holds EXECUTE |",
         "| none (re-check R2); PUBLIC also holds EXECUTE (`evidence/line-p010-catalog-2026-09-30/08-analysis.txt:135`) |")
# rpc_send_line_outbound and the three "none in code" rows
th = rep(th, "| ไม่มีผู้เรียกจริง (ทราบตั้งแต่ 26 กรกฎาคม 2026) |", "| ไม่มีผู้เรียกจริง (ทราบตั้งแต่ 26 กรกฎาคม 2026; ตรวจซ้ำ R1) |")
en = rep(en, "| none live (known since 26 July 2026) |", "| none live (known since 26 July 2026; re-check R1) |")
for name in ("rpc_create_line_order", "rpc_evaluate_identity_merge_candidate", "rpc_resolve_conversation_site"):
    th = rep(th, f"| {name} | ไม่มีในโค้ด |", f"| {name} | ไม่มีในโค้ด (ตรวจซ้ำ R1) |")
    en = rep(en, f"| {name} | none in code |", f"| {name} | none in code (re-check R1) |")

TH_NOTE = """
ตรวจซ้ำ 2 ตุลาคม 2026 ที่ `48b72d4c7` ในขอบเขตเดียวกับหัวข้อวิธีสำรวจ (ไม่รวม migration และเทสต์):

- R1: `git grep -nF <ชื่อ routine> -- src server packages supabase/functions tools e2e scripts` พบเพียง `scripts/line-b12-catalog.sql` ซึ่งเป็นรายการของ catalog query ไม่ใช่การเรียก และ comment ใน `supabase/functions/_shared/line-oa/autonomyGate.ts`, `brand-voice.ts`, `templates.ts` และ `supabase/functions/_shared/order-adapter.ts`
- R2: `git grep -nE "grant execute on function public.fn_welcome_on_group_bind" -- supabase/migrations` ที่ `48b72d4c7` ไม่พบผล
"""
EN_NOTE = """
Re-checked on 2 October 2026 at `48b72d4c7`, in the same scope as the method section (migrations and tests excluded):

- R1: `git grep -nF <routine name> -- src server packages supabase/functions tools e2e scripts` finds only `scripts/line-b12-catalog.sql`, a catalog-query list rather than a call, and comments in `supabase/functions/_shared/line-oa/autonomyGate.ts`, `brand-voice.ts`, `templates.ts` and `supabase/functions/_shared/order-adapter.ts`.
- R2: `git grep -nE "grant execute on function public.fn_welcome_on_group_bind" -- supabase/migrations` at `48b72d4c7` returns nothing.
"""


def add_note(s, header, note):
    lines = s.split("\n")
    start = next(i for i, l in enumerate(lines) if l.startswith(header))
    end = next(i for i in range(start, len(lines)) if not lines[i].strip())
    return "\n".join(lines[:end] + note.rstrip("\n").split("\n") + lines[end:])


th = add_note(th, "| Routine |", TH_NOTE)
en = add_note(en, "| Routine |", EN_NOTE)
EN.write_text(en, encoding="utf-8", newline="\n")
TH.write_text(th, encoding="utf-8", newline="\n")
print("survey updated (EN and TH)")
