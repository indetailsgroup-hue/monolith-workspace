"""
accept_s56.py  — two-pass XML strip (same pattern as accept_s51–s55)
Accepts all tracked insertions in S56 (and all prior sections).
"""
import zipfile, re, shutil, os

SRC = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
BAK = '/home/sandbox/monolith_project_summary_v25_accepted_pre_accept_s56_backup.docx'
TMP = SRC + '.tmp_accept_s56'

shutil.copy(SRC, BAK)
print(f"Backup: {BAK}")

with zipfile.ZipFile(SRC, 'r') as z:
    xml = z.read('word/document.xml').decode('utf-8')

before = len(re.findall(r'<w:ins[ >]', xml))
print(f"w:ins before accept: {before}")

# Pass 1 — unwrap <w:ins ...>...</w:ins> (keep inner content)
xml = re.sub(r'<w:ins\b[^>]*/>', '', xml)
xml = re.sub(r'<w:ins\b[^>]*>(.*?)</w:ins>', r'\1', xml, flags=re.DOTALL)

# Pass 2 — remove any residual open/close tags
xml = re.sub(r'</?w:ins\b[^>]*>', '', xml)

after = len(re.findall(r'<w:ins[ >]', xml))
print(f"w:ins after accept : {after}")

with zipfile.ZipFile(SRC, 'r') as z_in, zipfile.ZipFile(TMP, 'w', zipfile.ZIP_DEFLATED) as z_out:
    for item in z_in.infolist():
        if item.filename == 'word/document.xml':
            z_out.writestr(item, xml.encode('utf-8'))
        else:
            z_out.writestr(item, z_in.read(item.filename))

shutil.copy(TMP, SRC)
os.remove(TMP)

with zipfile.ZipFile(SRC, 'r') as z:
    vxml = z.read('word/document.xml').decode('utf-8')

fsize = os.path.getsize(SRC)
insideH = len(re.findall(r'w:insideH', vxml))
insideV = len(re.findall(r'w:insideV', vxml))
remaining = len(re.findall(r'<w:ins[ >]', vxml))

print(f"\n=== ACCEPT RESULTS ===")
print(f"Remaining w:ins      : {remaining}")
print(f"w:insideH intact     : {insideH}")
print(f"w:insideV intact     : {insideV}")
print(f"S56 Onboarding       : {'Phase 3 Vendor Onboarding' in vxml}")
print(f"S55 RFP intact       : {'Phase 3 RFP' in vxml}")
print(f"S54 PDD intact       : {'Phase 3 Programme Definition' in vxml}")
print(f"S53 Go-Live intact   : {'Go-Live Operations Plan' in vxml}")
print(f"S51 intact           : {'GL-CHK-10' in vxml}")
print(f"P3-ONB-CHK-12        : {'P3-ONB-CHK-12' in vxml}")
print(f"P3-VND-CHK-10 intact : {'P3-VND-CHK-10' in vxml}")
print(f"GAP-15 drift         : {'drift alert' in vxml}")
print(f"File size            : {fsize:,} bytes")
