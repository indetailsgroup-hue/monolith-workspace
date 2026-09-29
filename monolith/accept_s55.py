"""
accept_s55.py
Two-pass accept for S55 tracked insertions.
Pattern mirrors accept_s54.py exactly.
"""
import zipfile, shutil, re, os

SRC  = "/home/sandbox/monolith_project_summary_v25_accepted.docx"
BAK  = "/home/sandbox/monolith_project_summary_v25_accepted_pre_accept_s55_backup.docx"
TMP  = SRC + ".tmp_s55"

shutil.copy(SRC, BAK)
print(f"Backup: {os.path.getsize(BAK):,} bytes → {BAK}")

with zipfile.ZipFile(SRC, "r") as z:
    xml = z.read("word/document.xml").decode("utf-8")

print(f"Original w:ins count : {len(re.findall(r'<w:ins[ >]', xml))}")

xml = re.sub(r'<w:ins\b[^>]*>', '', xml)
xml = re.sub(r'</w:ins>',        '', xml)
after_pass1 = len(re.findall(r'<w:ins[ >]', xml))
print(f"After pass 1 (unwrap) : {after_pass1}")

xml = re.sub(r'<w:ins\b[^>]*/>', '', xml)
after_pass2 = len(re.findall(r'<w:ins[ >]', xml))
print(f"After pass 2 (safety) : {after_pass2}")

checks = {
    "S55 (Phase 3 RFP Framework)":  "Phase 3 RFP",
    "RFP-P3-WSA-001":               "RFP-P3-WSA-001",
    "RFP-P3-WSB-001":               "RFP-P3-WSB-001",
    "RFP-P3-WSC-001":               "RFP-P3-WSC-001",
    "P3-VND-CHK-10":                "P3-VND-CHK-10",
    "5-stage process":              "Stage 1",
    "SLA drift ≤1h":                "drift alert",
    "S54 (Phase 3 PDD)":            "Phase 3 Programme Definition",
    "S53 (Go-Live) intact":         "Go-Live Operations Plan",
    "S51 (Procurement) intact":     "Procurement",
    "insideH intact":               "insideH",
    "insideV intact":               "insideV",
}
for label, token in checks.items():
    print(f"  {label}: {token in xml}")

insideH = len(re.findall(r'w:insideH', xml))
insideV = len(re.findall(r'w:insideV', xml))
print(f"  insideH count: {insideH}")
print(f"  insideV count: {insideV}")

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
print("accept_s55.py complete.")
