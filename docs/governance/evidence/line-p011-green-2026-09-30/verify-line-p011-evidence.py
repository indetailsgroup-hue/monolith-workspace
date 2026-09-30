from pathlib import Path
import os,re,sys,xml.etree.ElementTree as ET
out=Path(sys.argv[1]); mode=sys.argv[2]
def require(value,message):
    if not value: raise AssertionError(message)
    print('PASS:',message)
secrets=[os.environ[k].encode() for k in ('P011_SCAN_PW','P011_SCAN_JWT','P011_SCAN_ANON','P011_SCAN_SERVICE')]
require(all(len(s)>20 for s in secrets),'generated credential inputs supplied')
def hits(data): return any(s in data for s in secrets)
require(hits(b'control='+secrets[0]),'credential scanner positive control detects a generated credential')
found=[p.name for p in out.iterdir() if p.is_file() and hits(p.read_bytes())]
require(not found,'no generated credential bytes in captured artifacts (findings='+repr(found)+')')
require(sys.argv[3:5]==['0','0'],'psql and two-client race exit zero')
tap=(out/'05-pgtap-output.tap').read_text(encoding='utf-8')
results=re.findall(r'^(not ok|ok) (\d+)(?:\s|$)',tap,re.M)
require('1..107' in tap and len(results)==107,'TAP plan and complete 107 results')
require(all(state=='ok' for state,n in results if int(n)<=70),'all original 70 assertions pass')
failed=[int(n) for state,n in results if state=='not ok']
require(bool(failed) if mode=='red' else not failed,'P0-11 RED has failures / GREEN has none: '+repr(failed))
root=ET.parse(out/'07-pytest-junit.xml').getroot()
cases=root.findall('.//testcase'); skipped=[c for c in cases if c.find('skipped') is not None]
fails=[c for c in cases if c.find('failure') is not None or c.find('error') is not None]
require(not skipped,'no required Python test skipped')
if mode=='red': require(len(cases)==1 and len(fails)==1 and 'test_failure_handling' in fails[0].get('name',''),'unchanged failure property reproduces RED')
else:
    require(len(cases)==72 and len(fails)==8,'Python 64 passed, 8 failed, 0 skipped')
    require(all(c.get('name','').startswith('test_clients_hold_no_write_grants[') for c in fails),'only the eight unapproved P0-10 grant checks fail')
    require(any(c.get('name')=='test_failure_handling' and c not in fails for c in cases),'unchanged failure property passes')
require(sys.argv[5]=='1','pytest exit 1 agrees with recorded failures')
clean=lambda name:'\n'.join(l for l in (out/name).read_text().splitlines() if not l.startswith('captured_utc:'))
require(clean('04-precheck.txt')==clean('08-postcheck.txt'),'listed pre/post counters match excluding capture timestamp')
teardown=(out/'09-teardown.txt').read_text()
require('containers_present_after_removal: []' in teardown and 'network_present_after_removal: []' in teardown,'owned containers and network removed')
actual=[n for n in range(sys.maxunicode+1) if chr(n).isspace()]
expected=[9,10,11,12,13,28,29,30,31,32,133,160,5760,*range(8192,8203),8232,8233,8239,8287,12288]
require(actual==expected,'explicit 29 codepoints equal this Python runtime str.strip whitespace')
print('Codepoints:', ' '.join(f'U+{n:04X}' for n in actual))
print('RESULT: P0-11 stage verified; Phase A remains EVIDENCE_INCOMPLETE; cross-vendor review pending')
