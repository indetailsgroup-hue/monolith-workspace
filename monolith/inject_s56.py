"""
inject_s56.py
Inject S56 — Phase 3 Vendor Onboarding & Integration Protocol
into monolith_project_summary_v25_accepted.docx as tracked changes.

Sections:
    56.1 Overview & Scope
    56.2 Vendor Onboarding Checklist (P3-ONB-CHK-01–12)
    56.3 Integration Protocol by Workstream (WS-A / WS-B / WS-C)
    56.4 SLA Acceptance Testing Matrix
    56.5 90-Day Hypercare & Escalation Framework
    56.6 Phase Gate: P3-M2 Completion Criteria
IDs start at 2700 (continuing from inject_s55.py which used 2571–2699)
"""
import zipfile, re, shutil, os

SRC = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
BAK = '/home/sandbox/monolith_project_summary_v25_accepted_pre_s56_backup.docx'
TMP = SRC + '.tmp_s56'

AUTHOR = "Scispace Agent"
DATE   = "2026-09-04T00:00:00Z"

_id = [2700]
def nid():
    v = _id[0]; _id[0] += 1; return v

# ── XML helpers ───────────────────────────────────────────────────────────────
def ins(xml_content):
    i = nid()
    return (
        f'<w:ins w:id="{i}" w:author="{AUTHOR}" w:date="{DATE}">'
        f'{xml_content}'
        f'</w:ins>'
    )

def rpr_heading1():
    return ('<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
            '<w:b/><w:bCs/><w:color w:val="1f2d5a"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr>')

def rpr_heading2():
    return ('<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
            '<w:b/><w:bCs/><w:color w:val="2e75b6"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>')

def rpr_body():
    return ('<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
            '<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>')

def rpr_bullet():
    return ('<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
            '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>')

def rpr_bold():
    return ('<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
            '<w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>')

def esc(t):
    return t.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

def heading1(text):
    ppr = ('<w:pPr><w:pStyle w:val="Heading1"/>'
           '<w:spacing w:before="320" w:after="100"/></w:pPr>')
    run = f'<w:r>{rpr_heading1()}<w:t xml:space="preserve">{esc(text)}</w:t></w:r>'
    return ins(f'<w:p>{ppr}{run}</w:p>')

def heading2(text):
    ppr = ('<w:pPr><w:pStyle w:val="Heading2"/>'
           '<w:spacing w:before="200" w:after="80"/></w:pPr>')
    run = f'<w:r>{rpr_heading2()}<w:t xml:space="preserve">{esc(text)}</w:t></w:r>'
    return ins(f'<w:p>{ppr}{run}</w:p>')

def body(text):
    ppr = ('<w:pPr><w:ind w:left="400"/>'
           '<w:spacing w:after="80"/></w:pPr>')
    run = f'<w:r>{rpr_body()}<w:t xml:space="preserve">{esc(text)}</w:t></w:r>'
    return ins(f'<w:p>{ppr}{run}</w:p>')

def bullet(text):
    ppr = ('<w:pPr><w:ind w:left="600" w:hanging="200"/>'
           '<w:spacing w:after="60"/></w:pPr>')
    run = f'<w:r>{rpr_bullet()}<w:t xml:space="preserve">• {esc(text)}</w:t></w:r>'
    return ins(f'<w:p>{ppr}{run}</w:p>')

def label_value(label, value):
    ppr = ('<w:pPr><w:ind w:left="400"/>'
           '<w:spacing w:after="60"/></w:pPr>')
    r1 = f'<w:r>{rpr_bold()}<w:t xml:space="preserve">{esc(label)}: </w:t></w:r>'
    r2 = f'<w:r>{rpr_bullet()}<w:t xml:space="preserve">{esc(value)}</w:t></w:r>'
    return ins(f'<w:p>{ppr}{r1}{r2}</w:p>')

def spacer():
    return ins('<w:p><w:pPr><w:spacing w:after="40"/></w:pPr></w:p>')

def tbl_row(cells, bold_first=False):
    """Build a plain table row — each cell is a w:tc with a single paragraph."""
    tcs = ''
    for i, cell in enumerate(cells):
        use_bold = (i == 0 and bold_first)
        rpr = rpr_bold() if use_bold else rpr_bullet()
        tc = (
            '<w:tc>'
            '<w:tcPr>'
            '<w:tcBorders>'
            '<w:top w:val="single" w:sz="4" w:space="0" w:color="C0C0C0"/>'
            '<w:left w:val="single" w:sz="4" w:space="0" w:color="C0C0C0"/>'
            '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="C0C0C0"/>'
            '<w:right w:val="single" w:sz="4" w:space="0" w:color="C0C0C0"/>'
            '</w:tcBorders>'
            '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>'
            '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>'
            '</w:tcPr>'
            f'<w:p><w:r>{rpr}<w:t xml:space="preserve">{esc(cell)}</w:t></w:r></w:p>'
            '</w:tc>'
        )
        tcs += tc
    return f'<w:tr>{tcs}</w:tr>'

def tbl_hdr_row(cells):
    """Header row with navy background."""
    tcs = ''
    for cell in cells:
        rpr = ('<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
               '<w:b/><w:bCs/><w:color w:val="FFFFFF"/>'
               '<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>')
        tc = (
            '<w:tc>'
            '<w:tcPr>'
            '<w:shd w:val="clear" w:color="auto" w:fill="1f2d5a"/>'
            '<w:tcBorders>'
            '<w:top w:val="single" w:sz="4" w:space="0" w:color="1f2d5a"/>'
            '<w:left w:val="single" w:sz="4" w:space="0" w:color="1f2d5a"/>'
            '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="1f2d5a"/>'
            '<w:right w:val="single" w:sz="4" w:space="0" w:color="1f2d5a"/>'
            '</w:tcBorders>'
            '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>'
            '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>'
            '</w:tcPr>'
            f'<w:p><w:r>{rpr}<w:t xml:space="preserve">{esc(cell)}</w:t></w:r></w:p>'
            '</w:tc>'
        )
        tcs += tc
    return f'<w:tr>{tcs}</w:tr>'

def table(header_cells, data_rows):
    """Build a full table wrapped in w:ins."""
    rows_xml = tbl_hdr_row(header_cells)
    for i, row in enumerate(data_rows):
        rows_xml += tbl_row(row, bold_first=True)
    tbl = (
        '<w:tbl>'
        '<w:tblPr>'
        '<w:tblW w:w="9000" w:type="dxa"/>'
        '<w:tblBorders>'
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="C0C0C0"/>'
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="C0C0C0"/>'
        '</w:tblBorders>'
        '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>'
        '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>'
        '</w:tblPr>'
        f'{rows_xml}'
        '</w:tbl>'
    )
    return ins(tbl)

# ── Build S56 XML ─────────────────────────────────────────────────────────────
S56 = ''

# ── 56.1 Overview & Scope ─────────────────────────────────────────────────────
S56 += heading1("Section 56 — Phase 3 Vendor Onboarding & Integration Protocol")
S56 += spacer()
S56 += heading2("56.1 Overview & Scope")
S56 += body(
    "This section documents the Phase 3 Vendor Onboarding & Integration Protocol "
    "(MONOLITH-S56-P3ONB-001 v1.0) governing the structured onboarding, technical "
    "integration, and SLA acceptance testing of all vendors appointed through the "
    "Phase 3 RFP process (S55). Three vendors are onboarded across Workstreams A, B, "
    "and C, covering all seven Phase 3 GAPs: GAP-01 (Biophilic Design Enhancement), "
    "GAP-02 (Design Freeze Gate AI), GAP-03 (Sensory Commissioning Full Automation), "
    "GAP-04 (Post-Occupancy Evaluation AI), GAP-13 (Client Experience Intelligence), "
    "GAP-14 (Sustainable Materials & Procurement Intelligence), and GAP-15 (Continuous "
    "Learning & Model Governance). This protocol mirrors MONOLITH-S52-ONB-001 (Phase 2 "
    "Vendor Onboarding, S52) and extends it to Phase 3 scope."
)
S56 += label_value("Document reference", "MONOLITH-S56-P3ONB-001 v1.0")
S56 += label_value("Parent documents", "S55 (Phase 3 RFP Framework) · S54 (Phase 3 PDD) · S52 (Phase 2 Onboarding)")
S56 += label_value("Phase 3 vendors", "WS-A Vendor (GAP-01/02) · WS-B Vendor (GAP-03/04) · WS-C Vendor (GAP-13/14/15)")
S56 += label_value("Onboarding window", "P3-M1 Weeks 1–4 (contract & access) through P3-M2 Weeks 1–4 (SLA acceptance)")
S56 += label_value("Budget allocation", "Onboarding costs included within THB 7.0M Phase 3 programme budget (S54)")
S56 += label_value("MONOLITH agents", "Nexus (API gateway) · Guardian (compliance) · Ledger (contracts) · Signal (WS-A) · Aria (WS-B) · Core (WS-C)")
S56 += label_value("Trigger condition", "P3-VND-CHK-08–10 gate complete (S55) and SC approval of vendor shortlist")
S56 += spacer()

# ── 56.2 Vendor Onboarding Checklist ─────────────────────────────────────────
S56 += heading2("56.2 Vendor Onboarding Checklist P3-ONB-CHK-01–12")
S56 += body(
    "The following twelve-point checklist governs onboarding of all three Phase 3 "
    "vendors. Items P3-ONB-CHK-01–06 must be completed by end of P3-M1 Week 2 (contract "
    "& access phase). Items P3-ONB-CHK-07–10 must be completed by end of P3-M1 Week 4 "
    "(integration smoke-test phase). Items P3-ONB-CHK-11–12 gate P3-M2 commencement."
)
S56 += table(
    ["CHK ID", "Checklist Item", "Owner", "Gate / Deadline"],
    [
        ["P3-ONB-CHK-01", "NDA & MSA execution — all 3 Phase 3 vendors signed", "Ledger + Legal", "P3-M1 Wk 1"],
        ["P3-ONB-CHK-02", "Vendor access provisioning — MONOLITH Dev & Staging environments", "Nexus", "P3-M1 Wk 1"],
        ["P3-ONB-CHK-03", "API credential issuance — DAPH API Gateway (per workstream)", "Nexus", "P3-M1 Wk 2"],
        ["P3-ONB-CHK-04", "Data pipeline config — WS-A sensor feeds (GAP-01/02 biophilic & freeze-gate)", "Signal", "P3-M1 Wk 2"],
        ["P3-ONB-CHK-05", "Data pipeline config — WS-B sensory/POE feeds (GAP-03/04)", "Aria", "P3-M1 Wk 2"],
        ["P3-ONB-CHK-06", "Data pipeline config — WS-C NPS/ESG/drift feeds (GAP-13/14/15)", "Core", "P3-M1 Wk 2"],
        ["P3-ONB-CHK-07", "UAT environment setup & baseline data load (all vendors)", "Nexus + Vendors", "P3-M1 Wk 3"],
        ["P3-ONB-CHK-08", "Integration smoke test — per workstream (end-to-end data flow verified)", "Signal/Aria/Core", "P3-M1 Wk 4"],
        ["P3-ONB-CHK-09", "SLA acceptance test execution — all 7 GAPs (per 56.4 matrix)", "Tech Lead + Vendors", "P3-M2 Wk 4"],
        ["P3-ONB-CHK-10", "Security penetration test sign-off (Guardian compliance review)", "Guardian", "P3-M2 Wk 3"],
        ["P3-ONB-CHK-11", "Hypercare support structure agreed — TAM assigned, Slack channel live", "Programme Director", "P3-M2 Wk 1"],
        ["P3-ONB-CHK-12", "P3-M2 gate readiness confirmed — all vendors operational, 0 P1 incidents open", "SC Checkpoint", "P3-M2 End"],
    ]
)
S56 += spacer()

# ── 56.3 Integration Protocol by Workstream ───────────────────────────────────
S56 += heading2("56.3 Integration Protocol by Workstream")

# WS-A
S56 += body("Workstream A — GAP-01 Biophilic Design Enhancement & GAP-02 Design Freeze Gate AI (WS-A Vendor)")
S56 += bullet("Integration method: REST API (JSON payload, OAuth 2.0) + MQTT sensor stream for real-time biophilic data ingestion")
S56 += bullet("DAPH API Gateway (Nexus) routes: /api/v3/gap01/biophilic-score · /api/v3/gap02/freeze-gate-check")
S56 += bullet("Latency SLA: API response ≤ 500 ms (p95) under 50 concurrent requests")
S56 += bullet("Data schema: Signal defines biophilic sensor schema v3.1; vendor must comply within P3-M1 Wk 4")
S56 += bullet("Acceptance criteria: GAP-01 accuracy ≥ 90% (500-image blind test) · GAP-02 gate accuracy ≥ 95% (200-scenario milestone test)")
S56 += bullet("Fallback: Manual design review protocol activates if API latency > 2 s for > 5 consecutive calls; Signal triggers alert to Atlas")
S56 += spacer()

# WS-B
S56 += body("Workstream B — GAP-03 Sensory Commissioning Full Automation & GAP-04 POE Analytics (WS-B Vendor)")
S56 += bullet("Integration method: RTSP sensor feed (commissioning data) + nightly batch ETL pipeline (PostgreSQL → DAPH Data Lake)")
S56 += bullet("DAPH API Gateway routes: /api/v3/gap03/sensory-report · /api/v3/gap04/poe-analytics")
S56 += bullet("Batch window: nightly 01:00–03:00 ICT; Aria monitors pipeline; alert threshold > 5% data drop")
S56 += bullet("Data schema: Aria defines sensory schema v2.0 and POE survey schema v1.5; vendor compliance verified at smoke test")
S56 += bullet("Acceptance criteria: GAP-03 recall ≥ 92% (48-hour commissioning run) · GAP-04 completeness ≥ 95% (30-room POE survey)")
S56 += bullet("Fallback: Manual commissioning checklist (Aria escalates to Shore for on-site verification if sensor feed drops > 10 min)")
S56 += spacer()

# WS-C
S56 += body("Workstream C — GAP-13 Client Experience Intelligence, GAP-14 ESG Reporting & GAP-15 Drift Monitoring (WS-C Vendor)")
S56 += bullet("Integration method: Webhook (NPS events, real-time) + ESG data lake batch (weekly) + real-time drift stream (Kafka topic)")
S56 += bullet("DAPH API Gateway routes: /api/v3/gap13/nps-score · /api/v3/gap14/esg-coverage · /api/v3/gap15/drift-alert")
S56 += bullet("Real-time requirement: GAP-15 drift alert must propagate to Vega dashboard within ≤ 1 hour of detection")
S56 += bullet("Agent coverage: GAP-13 NPS scoring covers all 28 MONOLITH agents (Core agent coordination)")
S56 += bullet("Acceptance criteria: GAP-13 NPS accuracy ≥ 80% (28/28 agents) · GAP-14 ESG coverage ≥ 80% (Q1 ESG report audit) · GAP-15 drift alert ≤ 1h (50-event stress test)")
S56 += bullet("Fallback: Vega activates manual drift-review protocol if Kafka stream delay > 2 hours; Guardian flags compliance risk")
S56 += spacer()

# ── 56.4 SLA Acceptance Testing Matrix ───────────────────────────────────────
S56 += heading2("56.4 SLA Acceptance Testing Matrix")
S56 += body(
    "Each GAP has a defined SLA acceptance test that must be passed before the vendor "
    "transitions from onboarding to hypercare. Tests are executed by the MONOLITH Tech "
    "Lead with vendor support. Failure of any test triggers a 5-working-day remediation "
    "window; second failure escalates to Programme Director and may trigger contract penalty."
)
S56 += table(
    ["GAP", "SLA Metric", "Minimum Target", "Test Method", "Test Owner", "Deadline"],
    [
        ["GAP-01", "Accuracy", "≥ 90%", "500-image blind test (diverse biophilic scenarios)", "Signal + WS-A Vendor", "P3-M1 Wk 4"],
        ["GAP-02", "Gate Accuracy", "≥ 95%", "200-milestone scenario simulation", "Signal + WS-A Vendor", "P3-M1 Wk 4"],
        ["GAP-03", "Recall", "≥ 92%", "48-hour full commissioning run (10 rooms)", "Aria + WS-B Vendor", "P3-M2 Wk 2"],
        ["GAP-04", "Completeness", "≥ 95%", "30-room POE survey end-to-end", "Aria + WS-B Vendor", "P3-M2 Wk 2"],
        ["GAP-13", "NPS Accuracy", "≥ 80% (28/28 agents)", "Agent benchmark — 200 NPS records per agent", "Core + WS-C Vendor", "P3-M2 Wk 4"],
        ["GAP-14", "ESG Coverage", "≥ 80%", "Q1 ESG report audit vs. manual reference", "Core + WS-C Vendor", "P3-M2 Wk 4"],
        ["GAP-15", "Drift Alert Latency", "≤ 1 hour", "50-event stress test (injected drift signals)", "Core + WS-C Vendor", "P3-M2 Wk 4"],
    ]
)
S56 += spacer()

# ── 56.5 90-Day Hypercare & Escalation Framework ─────────────────────────────
S56 += heading2("56.5 90-Day Hypercare & Escalation Framework")
S56 += body(
    "Following SLA acceptance sign-off (P3-ONB-CHK-09), all three vendors enter a "
    "90-day hypercare period aligned to Phase 3 milestones P3-M2 through P3-M4. The "
    "hypercare framework defines support intensity, escalation SLAs, and transition "
    "conditions to BAU operations."
)
S56 += table(
    ["Hypercare Phase", "Period", "Support Cadence", "P1 Response SLA", "Review Forum"],
    [
        ["Intensive Hypercare", "Days 1–30 (P3-M2)", "Daily stand-up · Dedicated vendor TAM per WS", "≤ 2 hours", "Daily Tech Stand-up (Signal/Aria/Core)"],
        ["Active Hypercare", "Days 31–60 (P3-M3)", "Weekly review · Shared Slack channel per WS", "≤ 4 hours", "Weekly WS Lead Review"],
        ["Transition Hypercare", "Days 61–90 (P3-M4)", "Monthly review · Standard support queue", "≤ 8 hours", "Monthly SC Programme Update"],
        ["BAU Operations", "Day 91+ (post P3-M4)", "ITIL standard support · SLA as per MSA", "Per MSA SLA", "Quarterly SC Governance"],
    ]
)
S56 += spacer()
S56 += body("Escalation Path (all workstreams):")
S56 += bullet("L1 — Vendor TAM: Initial triage and resolution (P1 ≤ 2h, P2 ≤ 8h, P3 ≤ 24h during intensive hypercare)")
S56 += bullet("L2 — MONOLITH Workstream Lead (Signal / Aria / Core): Technical escalation if L1 unresolved within SLA")
S56 += bullet("L3 — MONOLITH Tech Lead: Cross-workstream impact or systemic integration failure")
S56 += bullet("L4 — Phase 3 Programme Director: Contract breach, SLA miss > 3 consecutive incidents, or P3 milestone at risk")
S56 += bullet("Guardian agent: Invoked for any security or PDPA-related incident; independent of L1–L4 escalation ladder")
S56 += bullet("Ledger agent: Records all P1/P2 incidents, resolutions, and SLA performance data in real-time for SC reporting")
S56 += spacer()

# ── 56.6 Phase Gate: P3-M2 Completion Criteria ───────────────────────────────
S56 += heading2("56.6 Phase Gate: P3-M2 Completion Criteria")
S56 += body(
    "The P3-M2 milestone gate (end of month 2, 8 weeks after programme kickoff) is the "
    "Vendor Onboarding Complete gate. All conditions below must be met and verified by "
    "the Phase 3 Programme Director before SC approves P3-M3 commencement and releases "
    "the next tranche of programme budget."
)
S56 += bullet("P3-ONB-CHK-01–12: All twelve onboarding checklist items confirmed complete")
S56 += bullet("SLA acceptance: All 7 GAP acceptance tests passed (per 56.4 matrix); no outstanding remediation windows open")
S56 += bullet("Security: Guardian pen-test sign-off complete (P3-ONB-CHK-10); zero critical vulnerabilities open")
S56 += bullet("Hypercare live: All 3 vendor TAMs assigned; Slack channels operational; daily stand-up cadence established")
S56 += bullet("Zero P1 incidents: No unresolved P1 incidents at gate date across all three workstreams")
S56 += bullet("Data pipelines stable: 72-hour clean run of all WS-A/B/C data pipelines with < 1% data drop rate")
S56 += bullet("SC documentation: Onboarding completion report (MONOLITH-S56-P3ONB-001) signed off and lodged with Ledger")
S56 += label_value("Gate owner", "Phase 3 Programme Director with SC Chair ratification")
S56 += label_value("SC checkpoint", "P3-M2 SC Checkpoint — formal agenda item; pass/fail determination by Programme Director")
S56 += label_value("Failure path", "If gate fails: immediate P3-CHK escalation raised; SC convenes within 5 working days to review remediation plan")
S56 += label_value("Related documents",
    "S55 (Phase 3 RFP Framework) · S54 (Phase 3 PDD) · S52 (Phase 2 Vendor Onboarding) · "
    "MONOLITH-S52-ONB-001 (Phase 2 Onboarding Protocol)")
S56 += spacer()

# ── INJECT ────────────────────────────────────────────────────────────────────
shutil.copy(SRC, BAK)
print(f"Backup: {BAK}")

with zipfile.ZipFile(SRC, 'r') as z:
    xml = z.read('word/document.xml').decode('utf-8')

INJECT_BEFORE = '</w:body>'
if INJECT_BEFORE not in xml:
    raise RuntimeError("Injection point '</w:body>' not found")

xml_new = xml.replace(INJECT_BEFORE, S56 + INJECT_BEFORE, 1)

with zipfile.ZipFile(SRC, 'r') as z_in, zipfile.ZipFile(TMP, 'w', zipfile.ZIP_DEFLATED) as z_out:
    for item in z_in.infolist():
        if item.filename == 'word/document.xml':
            z_out.writestr(item, xml_new.encode('utf-8'))
        else:
            z_out.writestr(item, z_in.read(item.filename))

shutil.copy(TMP, SRC)
os.remove(TMP)

# ── Verify ────────────────────────────────────────────────────────────────────
with zipfile.ZipFile(SRC, 'r') as z:
    vxml = z.read('word/document.xml').decode('utf-8')

fsize = os.path.getsize(SRC)
ins_count  = len(re.findall(r'<w:ins[ >]', vxml))
max_id_matches = re.findall(r'w:id="(\d+)"', vxml)
max_id     = max(int(x) for x in max_id_matches) if max_id_matches else 0
insideH    = len(re.findall(r'w:insideH', vxml))
insideV    = len(re.findall(r'w:insideV', vxml))

print(f"\n=== INJECTION RESULTS ===")
print(f"w:ins tracked insertions : {ins_count}")
print(f"Max ID used              : {max_id}")
print(f"w:insideH intact         : {insideH}")
print(f"w:insideV intact         : {insideV}")
print(f"S56 (Phase 3 Onboarding) present : {'Phase 3 Vendor Onboarding' in vxml}")
print(f"S55 (Phase 3 RFP) intact         : {'Phase 3 RFP' in vxml}")
print(f"S54 (Phase 3 PDD) intact         : {'Phase 3 Programme Definition' in vxml}")
print(f"P3-ONB-CHK-12 present            : {'P3-ONB-CHK-12' in vxml}")
print(f"P3-ONB-CHK-01 present            : {'P3-ONB-CHK-01' in vxml}")
print(f"WS-A/B/C integration present     : {'Workstream A' in vxml}")
print(f"SLA acceptance matrix present    : {'SLA Acceptance Testing' in vxml}")
print(f"90-Day Hypercare present         : {'Hypercare' in vxml}")
print(f"P3-M2 gate criteria present      : {'P3-M2 Completion' in vxml}")
print(f"GAP-15 drift alert present       : {'drift alert' in vxml}")
print(f"File size                        : {fsize:,} bytes")
print(f"IDs used: {2700} – {_id[0]-1} (total {_id[0]-2700} IDs allocated)")
