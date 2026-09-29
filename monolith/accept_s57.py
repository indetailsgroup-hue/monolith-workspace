"""
accept_s57.py — Two-pass XML strip for S57 tracked insertions
Removes <w:ins ...>...</w:ins> wrapper tags (keeps inner content)
Mirrors accept_s56.py pattern exactly
"""

import zipfile, shutil, re, os

SRC  = "/home/sandbox/monolith_project_summary_v25_accepted.docx"
BACK = "/home/sandbox/monolith_project_summary_v25_accepted_pre_accept_s57_backup.docx"
TMP  = "/home/sandbox/_accept_s57_tmp.docx"

# ── backup ──────────────────────────────────────────────────────────────────
shutil.copy(SRC, BACK)
print(f"Backup: {BACK}")

# ── two-pass strip ───────────────────────────────────────────────────────────
def strip_ins(xml: str) -> str:
    """Pass 1: remove opening <w:ins ...> tags"""
    return re.sub(r'<w:ins\b[^>]*/?>|<w:ins\b[^>]*>', '', xml)

def strip_ins_close(xml: str) -> str:
    """Pass 2: remove closing </w:ins> tags"""
    return xml.replace('</w:ins>', '')

# ── process docx ────────────────────────────────────────────────────────────
with zipfile.ZipFile(SRC, 'r') as zin, zipfile.ZipFile(TMP, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename.endswith('.xml') or item.filename.endswith('.rels'):
            try:
                text = data.decode('utf-8')
                text = strip_ins(text)
                text = strip_ins_close(text)
                data = text.encode('utf-8')
            except Exception:
                pass
        zout.writestr(item, data)

os.replace(TMP, SRC)

# ── verify ───────────────────────────────────────────────────────────────────
with zipfile.ZipFile(SRC, 'r') as z:
    doc_xml = z.read('word/document.xml').decode('utf-8')

ins_remaining   = len(re.findall(r'<w:ins[ >]', doc_xml))
insideH_count   = doc_xml.count('w:insideH')
insideV_count   = doc_xml.count('w:insideV')
s57_present     = 'Phase 3 Go-Live Operations Plan' in doc_xml
s56_present     = 'Phase 3 Vendor Onboarding' in doc_xml
s55_present     = 'Phase 3 RFP' in doc_xml
s54_present     = 'Phase 3 Programme Definition' in doc_xml
chk10_present   = 'P3-GL-CHK-10' in doc_xml
coverage92      = '92%' in doc_xml
cutover_present = 'Cutover Schedule' in doc_xml
bau_present     = 'BAU Transition' in doc_xml
p3m4_present    = 'P3-M4' in doc_xml
file_size       = os.path.getsize(SRC)

print("\n=== ACCEPT RESULTS ===")
print(f"w:ins remaining            : {ins_remaining}")
print(f"w:insideH intact           : {insideH_count}")
print(f"w:insideV intact           : {insideV_count}")
print(f"S57 (Go-Live) present      : {s57_present}")
print(f"S56 (Onboarding) intact    : {s56_present}")
print(f"S55 (RFP) intact           : {s55_present}")
print(f"S54 (PDD) intact           : {s54_present}")
print(f"P3-GL-CHK-10 present       : {chk10_present}")
print(f"92% coverage present       : {coverage92}")
print(f"Cutover schedule present   : {cutover_present}")
print(f"BAU transition present     : {bau_present}")
print(f"P3-M4 milestone present    : {p3m4_present}")
print(f"File size                  : {file_size:,} bytes")

if ins_remaining == 0:
    print("\n✓ ACCEPT S57 COMPLETE — 0 tracked changes remaining")
else:
    print(f"\n✗ WARNING: {ins_remaining} w:ins tags remain — check XML")
