"""
accept_s51.py
Two-pass accept of tracked insertions in monolith_project_summary_v25_accepted.docx
Same pattern as accept_s50.py — strips all <w:ins> tags, keeps content
Pass 1: unwrap <w:ins ...>content</w:ins> → content
Pass 2: strip orphaned <w:ins .../> self-closing and opening tags
Spot-check regex uses <w:ins[ >] to avoid matching <w:insideH>/<w:insideV>
"""
import zipfile, re, shutil, os

SRC = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
DST = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
BAK = '/home/sandbox/monolith_project_summary_v25_accepted_pre_accept_s51_backup.docx'

shutil.copy(SRC, BAK)
print(f'Backup: {BAK}')

with zipfile.ZipFile(SRC, 'r') as z:
    xml = z.read('word/document.xml').decode('utf-8')
    all_files = {name: z.read(name) for name in z.namelist()}

before_count = len(re.findall(r'<w:ins[ >]', xml))
print(f'w:ins before accept: {before_count}')

# Pass 1: unwrap <w:ins ...>content</w:ins> keeping inner content
xml = re.sub(r'<w:ins\b[^>]*/>', '', xml)          # remove self-closing <w:ins .../>
xml = re.sub(r'<w:ins\b[^>]*>(.*?)</w:ins>', r'\1', xml, flags=re.DOTALL)

# Pass 2: strip any remaining orphaned opening tags
xml = re.sub(r'<w:ins\b[^>]*>', '', xml)

after_count = len(re.findall(r'<w:ins[ >]', xml))
inside_h = len(re.findall(r'<w:insideH', xml))
inside_v = len(re.findall(r'<w:insideV', xml))
print(f'w:ins after accept: {after_count}')
print(f'w:insideH intact: {inside_h}')
print(f'w:insideV intact: {inside_v}')

# Verify S51 content survived
s51_ok = (
    'RFP-GAP05-001' in xml and
    'P2-CHK-08' in xml and
    'AIE-001' in xml and
    'Section 51' in xml and
    'Vendor Evaluation Criteria' in xml
)
print(f'S51 content intact: {s51_ok}')

all_files['word/document.xml'] = xml.encode('utf-8')

with zipfile.ZipFile(DST, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
    for name, data in all_files.items():
        zout.writestr(name, data)

print(f'File size: {os.path.getsize(DST):,} bytes')
print('Done.')
