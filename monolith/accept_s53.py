"""
accept_s53.py
Two-pass accept for S53 tracked insertions.
Pattern mirrors accept_s52.py exactly.
"""
import zipfile, shutil, re, os

SRC  = "/home/sandbox/monolith_project_summary_v25_accepted.docx"
BAK  = "/home/sandbox/monolith_project_summary_v25_accepted_pre_accept_s53_backup.docx"
TMP  = SRC + ".tmp_s53"

# ── backup ────────────────────────────────────────────────────────────────────
shutil.copy(SRC, BAK)
print(f"Backup: {os.path.getsize(BAK):,} bytes → {BAK}")

# ── read document.xml ─────────────────────────────────────────────────────────
with zipfile.ZipFile(SRC, "r") as z:
    xml = z.read("word/document.xml").decode("utf-8")

print(f"Original w:ins count : {len(re.findall(r'<w:ins[ >]', xml))}")

# ── PASS 1: unwrap <w:ins ...>...</w:ins> keeping inner content ────────────────
# Removes the w:ins wrapper tags, leaves the content they wrap intact.
xml = re.sub(r'<w:ins\b[^>]*>', '', xml)
xml = re.sub(r'</w:ins>',        '', xml)

after_pass1 = len(re.findall(r'<w:ins[ >]', xml))
print(f"After pass 1 (unwrap) : {after_pass1}")

# ── PASS 2: safety — remove any residual w:ins open/close tags ─────────────────
xml = re.sub(r'<w:ins\b[^>]*/>', '', xml)      # self-closing remnants
after_pass2 = len(re.findall(r'<w:ins[ >]', xml))
print(f"After pass 2 (safety) : {after_pass2}")

# ── spot-checks ───────────────────────────────────────────────────────────────
checks = {
    "S53 (Go-Live Operations Plan)": "Go-Live Operations Plan",
    "S52 (Vendor Onboarding Protocol)": "Vendor Onboarding",
    "S51 (Procurement Framework)": "Procurement",
    "GL-CHK-10":     "GL-CHK-10",
    "Phase 3 Readiness Gate": "Phase 3 Readiness Gate",
    "Cutover Schedule": "Cutover Schedule",
    "BAU Transition": "BAU Transition",
    "insideH intact": "insideH",
    "insideV intact": "insideV",
}
for label, token in checks.items():
    found = token in xml
    print(f"  {label}: {found}")

insideH = len(re.findall(r'w:insideH', xml))
insideV = len(re.findall(r'w:insideV', xml))
print(f"  insideH count: {insideH}")
print(f"  insideV count: {insideV}")

# ── write back ────────────────────────────────────────────────────────────────
with zipfile.ZipFile(SRC, "r") as z_in, zipfile.ZipFile(TMP, "w", zipfile.ZIP_DEFLATED) as z_out:
    for item in z_in.infolist():
        if item.filename == "word/document.xml":
            z_out.writestr(item, xml.encode("utf-8"))
        else:
            z_out.writestr(item, z_in.read(item.filename))

shutil.copy(TMP, SRC)
os.remove(TMP)

final_size = os.path.getsize(SRC)
print(f"\nFinal file: {final_size:,} bytes")
print("accept_s53.py complete.")
