#!/usr/bin/env python3
"""
accept_s58.py — Two-pass XML strip for S58 tracked changes
Accepts all w:ins elements injected by inject_s58.py
"""

import zipfile, shutil, re, os

SRC  = "/home/sandbox/monolith_project_summary_v25_accepted.docx"
DEST = "/home/sandbox/monolith_project_summary_v25_accepted.docx"
BAK  = "/home/sandbox/monolith_project_summary_v25_accepted_pre_accept_s58_backup.docx"

# ── backup ────────────────────────────────────────────────────────────────────
shutil.copy(SRC, BAK)
print(f"Backup: {BAK}")

# ── read document.xml ─────────────────────────────────────────────────────────
with zipfile.ZipFile(SRC, "r") as z:
    xml = z.read("word/document.xml").decode("utf-8")
    names = z.namelist()

before = len(re.findall(r"<w:ins[ >]", xml))
print(f"w:ins before strip : {before}")

# ── PASS 1: unwrap <w:ins ...>...</w:ins> — keep inner content ─────────────────
xml = re.sub(r"<w:ins\b[^>]*>", "", xml)
xml = re.sub(r"</w:ins>",       "", xml)

after_pass1 = len(re.findall(r"<w:ins[ >]", xml))
print(f"w:ins after pass 1 : {after_pass1}")

# ── PASS 2: clean any residual rPrChange / pPrChange artefacts ────────────────
xml = re.sub(r"<w:rPrChange\b[^>]*/?>", "", xml)
xml = re.sub(r"<w:rPrChange\b[^>]*>.*?</w:rPrChange>", "", xml, flags=re.DOTALL)
xml = re.sub(r"<w:pPrChange\b[^>]*/?>", "", xml)
xml = re.sub(r"<w:pPrChange\b[^>]*>.*?</w:pPrChange>", "", xml, flags=re.DOTALL)

after_pass2 = len(re.findall(r"<w:ins[ >]", xml))
print(f"w:ins after pass 2 : {after_pass2}")

# ── spot-checks ───────────────────────────────────────────────────────────────
checks = {
    "insideH intact"       : len(re.findall(r"w:insideH", xml)),
    "insideV intact"       : len(re.findall(r"w:insideV", xml)),
    "S58 BAU Gov present"  : "MONOLITH-S58-BAUGOV-001" in xml,
    "S57 Go-Live intact"   : "Phase 3 Go-Live" in xml,
    "S56 Onboarding intact": "Vendor Onboarding" in xml,
    "Closure cert present" : "MONOLITH-S58-CLOSECERT-001" in xml,
    "Committee structure"  : "PGB" in xml and "TAG" in xml and "AOC" in xml,
    "KPI cadence"          : "Weekly SLA" in xml,
    "Audit plan"           : "Post-Programme Audit" in xml,
    "THB 18.2M present"    : "18.2M" in xml,
    "92% coverage"         : "92%" in xml,
}
print("\n=== SPOT CHECKS ===")
for k, v in checks.items():
    print(f"  {k:30s}: {v}")

# ── write output ──────────────────────────────────────────────────────────────
tmp = DEST + ".tmp"
with zipfile.ZipFile(SRC, "r") as zin:
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename == "word/document.xml":
                zout.writestr(item, xml.encode("utf-8"))
            else:
                zout.writestr(item, zin.read(item.filename))

os.replace(tmp, DEST)
size = os.path.getsize(DEST)
print(f"\nFinal w:ins remaining : {after_pass2}")
print(f"File size             : {size:,} bytes")
print("ACCEPT S58 COMPLETE" if after_pass2 == 0 else "WARNING: residual w:ins found")
