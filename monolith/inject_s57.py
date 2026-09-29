"""
inject_s57.py
Inject S57 — Phase 3 Go-Live Operations Plan
into monolith_project_summary_v25_accepted.docx as tracked changes.

Sections:
    57.1 Overview & Scope
    57.2 Phase 3 Cutover Schedule (T-5 → T+72h)
    57.3 BAU Transition Plan (4-phase, 90-day, 92% coverage)
    57.4 Phase 3 Readiness Gate Criteria (P3-GL-CHK-01–10)
    57.5 Post-Go-Live Monitoring & Programme Milestone P3-M4
IDs start at 2771 (continuing from inject_s56.py which used 2700–2770)
"""
import zipfile, re, shutil, os

SRC = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
BAK = '/home/sandbox/monolith_project_summary_v25_accepted_pre_s57_backup.docx'
TMP = SRC + '.tmp_s57'

AUTHOR = "Scispace Agent"
DATE   = "2026-09-04T00:00:00Z"

_id = [2771]
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

def tbl_hdr_row(cells):
    tcs = ''
    for cell in cells:
        rpr = ('<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
               '<w:b/><w:bCs/><w:color w:val="FFFFFF"/>'
               '<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>')
        tc = (
            '<w:tc><w:tcPr>'
            '<w:shd w:val="clear" w:color="auto" w:fill="1f2d5a"/>'
            '<w:tcBorders>'
            '<w:top w:val="single" w:sz="4" w:space="0" w:color="1f2d5a"/>'
            '<w:left w:val="single" w:sz="4" w:space="0" w:color="1f2d5a"/>'
            '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="1f2d5a"/>'
            '<w:right w:val="single" w:sz="4" w:space="0" w:color="1f2d5a"/>'
            '</w:tcBorders>'
            '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>'
            '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>'
            f'</w:tcPr><w:p><w:r>{rpr}<w:t xml:space="preserve">{esc(cell)}</w:t></w:r></w:p></w:tc>'
        )
        tcs += tc
    return f'<w:tr>{tcs}</w:tr>'

def tbl_row(cells, bold_first=False):
    tcs = ''
    for i, cell in enumerate(cells):
        rpr = rpr_bold() if (i == 0 and bold_first) else rpr_bullet()
        tc = (
            '<w:tc><w:tcPr>'
            '<w:tcBorders>'
            '<w:top w:val="single" w:sz="4" w:space="0" w:color="C0C0C0"/>'
            '<w:left w:val="single" w:sz="4" w:space="0" w:color="C0C0C0"/>'
            '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="C0C0C0"/>'
            '<w:right w:val="single" w:sz="4" w:space="0" w:color="C0C0C0"/>'
            '</w:tcBorders>'
            '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>'
            '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>'
            f'</w:tcPr><w:p><w:r>{rpr}<w:t xml:space="preserve">{esc(cell)}</w:t></w:r></w:p></w:tc>'
        )
        tcs += tc
    return f'<w:tr>{tcs}</w:tr>'

def table(header_cells, data_rows):
    rows_xml = tbl_hdr_row(header_cells)
    for row in data_rows:
        rows_xml += tbl_row(row, bold_first=True)
    tbl = (
        '<w:tbl><w:tblPr>'
        '<w:tblW w:w="9000" w:type="dxa"/>'
        '<w:tblBorders>'
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="C0C0C0"/>'
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="C0C0C0"/>'
        '</w:tblBorders>'
        '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>'
        '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>'
        f'</w:tblPr>{rows_xml}</w:tbl>'
    )
    return ins(tbl)

# ── Build S57 XML ─────────────────────────────────────────────────────────────
S57 = ''

# ── 57.1 Overview & Scope ─────────────────────────────────────────────────────
S57 += heading1("Section 57 — Phase 3 Go-Live Operations Plan")
S57 += spacer()
S57 += heading2("57.1 Overview & Scope")
S57 += body(
    "This section documents the Phase 3 Go-Live Operations Plan "
    "(MONOLITH-S57-P3GOLIVE-001 v1.0), governing the cutover execution, BAU transition, "
    "and post-go-live monitoring for all seven Phase 3 GAPs following successful "
    "completion of vendor onboarding (S56). Phase 3 Go-Live marks the achievement of "
    "the programme's 92% automation coverage target across all 28 MONOLITH agents, "
    "completing the three-phase journey from baseline 56% (pre-programme) through "
    "Phase 1 (68%), Phase 2 (80%), and Phase 3 (92%). This plan mirrors "
    "MONOLITH-S53-GOLIVE-001 (Phase 2 Go-Live, S53) and extends it to Phase 3 scope "
    "covering GAP-01, GAP-02, GAP-03, GAP-04, GAP-13, GAP-14, and GAP-15."
)
S57 += label_value("Document reference", "MONOLITH-S57-P3GOLIVE-001 v1.0")
S57 += label_value("Parent documents", "S56 (Phase 3 Vendor Onboarding) · S54 (Phase 3 PDD) · S53 (Phase 2 Go-Live)")
S57 += label_value("Programme milestone", "P3-M4 — Phase 3 Go-Live & Programme Closure Gate")
S57 += label_value("Coverage target", "92% automation coverage (28/28 agents); up from 80% at Phase 2 Go-Live")
S57 += label_value("Trigger condition", "P3-ONB-CHK-01–12 complete (S56); all 7 GAP SLA acceptance tests passed; P3-GL-CHK-08 Go/No-Go SC approval")
S57 += label_value("Go-Live window", "P3-M4 — maintenance window 23:00–03:00 ICT (Sunday night); 4-hour cutover")
S57 += label_value("MONOLITH agents", "All 28 agents — Nexus (gateway), Guardian (compliance), Ledger (audit), Signal/Aria/Core (WS leads), Vega (monitoring)")
S57 += label_value("Phase 2 precedent", "S53 MONOLITH-S53-GOLIVE-001; GL-CHK-10 SC approval confirmed; 80% coverage achieved")
S57 += spacer()

# ── 57.2 Phase 3 Cutover Schedule ─────────────────────────────────────────────
S57 += heading2("57.2 Phase 3 Cutover Schedule (T-5 Days to T+72 Hours)")
S57 += body(
    "The Phase 3 cutover follows the same T-timeline framework as Phase 2 (S53), "
    "adapted for three workstreams and seven GAPs. All times are ICT (UTC+7). "
    "The cutover lead is the Phase 3 Programme Director supported by all three "
    "Workstream Leads (Signal, Aria, Core) and vendor TAMs."
)
S57 += table(
    ["Time Point", "Activity", "Owner", "Success Criterion"],
    [
        ["T-5 days", "Final system freeze — no configuration changes to WS-A/B/C integrations; vendor change freeze activated", "Programme Director", "Change freeze confirmed by all 3 vendors; Nexus freeze log created"],
        ["T-5 days", "Data migration validation — seed data verified for GAP-01/02/03/04/13/14/15 baseline models", "Signal/Aria/Core + Vendors", "Zero critical data discrepancies; Ledger sign-off"],
        ["T-3 days", "Parallel running start — Phase 3 systems active alongside Phase 2 BAU; output comparison monitoring", "Vega (monitoring)", "Parallel divergence rate < 5%; no P1 alerts"],
        ["T-2 days", "Rollback rehearsal — full rollback procedure executed in staging; timing verified ≤ 2 hours", "Tech Lead + Nexus", "Rollback completes in staging within 2h; documented P3-GL-CHK-05"],
        ["T-1 day", "Go/No-Go review — P3-GL-CHK-01–09 verified; SC Chair final confirmation (P3-GL-CHK-08)", "SC Checkpoint", "All P3-GL-CHK-01–09 PASS; SC Chair sign-off recorded"],
        ["T+0 (23:00)", "Cutover window opens — MONOLITH maintenance mode activated; user access suspended", "Nexus + Programme Director", "Maintenance mode confirmed; Guardian audit log opened"],
        ["T+0 (23:30)", "WS-A cutover — GAP-01/02 production traffic switched to Phase 3 integration", "Signal + WS-A Vendor TAM", "API health check pass; GAP-01/02 production endpoints responding"],
        ["T+0 (00:00)", "WS-B cutover — GAP-03/04 production pipeline switched to Phase 3 integration", "Aria + WS-B Vendor TAM", "Pipeline health check pass; first batch run queued"],
        ["T+0 (00:30)", "WS-C cutover — GAP-13/14/15 webhook + Kafka streams switched to Phase 3", "Core + WS-C Vendor TAM", "GAP-15 drift stream live; NPS webhook test events confirmed"],
        ["T+0 (01:00)", "Full system health check — all 28 agents, all 7 GAP endpoints, Vega dashboard green", "Vega + All WS Leads", "All 28 agents responding; 0 P1 incidents"],
        ["T+0 (03:00)", "Maintenance window closes — user access restored; Phase 3 live", "Programme Director", "Cutover complete; P3-M4 Go-Live declared"],
        ["T+4 hours", "First post-go-live health check — GAP-01–04/13–15 SLA metrics reviewed", "Signal/Aria/Core", "All SLA metrics within ±5% of acceptance test results"],
        ["T+24 hours", "Day-1 stand-up — all 3 vendor TAMs, all WS Leads; P1/P2 incident review", "Programme Director", "Zero unresolved P1 incidents; daily hypercare cadence established"],
        ["T+72 hours", "72-hour post-go-live review — SC briefing; coverage achievement confirmed; hypercare status", "SC Chair + Programme Director", "92% coverage confirmed; zero P1 open; SC acceptance of P3-M4 milestone"],
    ]
)
S57 += spacer()

# ── 57.3 BAU Transition Plan ───────────────────────────────────────────────────
S57 += heading2("57.3 BAU Transition Plan — 92% Coverage Achievement")
S57 += body(
    "Following Go-Live (T+0), the programme enters a structured 90-day BAU transition "
    "mirroring the Phase 2 transition framework (S53). The target is stable 92% "
    "automation coverage across all 28 MONOLITH agents, with all SLA groups meeting "
    "their contracted targets and no outstanding programme remediation items."
)
S57 += table(
    ["BAU Phase", "Period", "Coverage KPI", "Key Activities", "Owner"],
    [
        ["Phase 1 — Stabilisation", "Day 1–30 (P3-M4 post-GL)", "≥ 90% (stabilising to 92%)", "Daily incident review; hypercare intensive; SLA tuning per GAP if < target; Vega dashboard live", "Programme Director + All WS Leads"],
        ["Phase 2 — Optimisation", "Day 31–60", "≥ 91%", "Weekly SLA review; GAP model retraining if GAP-01/03/13 below target; hypercare active phase", "WS Leads + Vendor TAMs"],
        ["Phase 3 — Consolidation", "Day 61–90", "≥ 92%", "Monthly SC update; SLA performance report to Ledger; hypercare transition to standard support", "Signal/Aria/Core + Ledger"],
        ["BAU Operations", "Day 91+ (post P3-M4)", "Maintain ≥ 92%", "Quarterly SC governance; ITIL standard support; Vega continuous monitoring; annual GAP review cycle", "Ongoing — WS Leads + Vega"],
    ]
)
S57 += spacer()
S57 += body("92% Coverage Breakdown by Workstream and SLA Group:")
S57 += bullet("WS-A (GAP-01/02): Signal agent — Biophilic scoring active for all MONOLITH projects; Design Freeze Gate automated across all applicable milestones")
S57 += bullet("WS-B (GAP-03/04): Aria agent — Sensory commissioning reports auto-generated for all completed rooms; POE analytics live for all occupied spaces")
S57 += bullet("WS-C (GAP-13): Core agent — NPS accuracy ≥ 80% maintained across all 28 agents; Kelly/Signal/Aria/Blaze/Nova at Group A target (≥ 95%)")
S57 += bullet("WS-C (GAP-14): Ledger agent — ESG coverage ≥ 80% across all active material procurement events; quarterly ESG report auto-generated")
S57 += bullet("WS-C (GAP-15): Vega agent — Drift monitoring live for all 28 agents; alert latency ≤ 1h; model retraining triggered within 24h of confirmed drift")
S57 += bullet("Programme total: Phase 1 (68%) + Phase 2 (80%) + Phase 3 (92%) — THB 18.2M over three phases")
S57 += spacer()

# ── 57.4 Phase 3 Readiness Gate Criteria ──────────────────────────────────────
S57 += heading2("57.4 Phase 3 Readiness Gate Criteria (P3-GL-CHK-01–10)")
S57 += body(
    "The Phase 3 Go-Live readiness gate (P3-GL-CHK-01–10) must be fully satisfied "
    "before the Go/No-Go meeting (P3-GL-CHK-08) and SC final approval (P3-GL-CHK-10). "
    "This checklist mirrors GL-CHK-01–10 from S53 (Phase 2 Go-Live) and is mandatory "
    "for the P3-M4 milestone gate. P3-GL-CHK-08 and P3-GL-CHK-10 are hard SC gates."
)
S57 += table(
    ["CHK ID", "Readiness Criterion", "Owner", "Evidence Required"],
    [
        ["P3-GL-CHK-01", "P3-ONB-CHK-01–12 fully complete — all vendors onboarded, SLA tests passed (S56)", "Programme Director", "S56 completion report signed by Programme Director"],
        ["P3-GL-CHK-02", "All 7 GAP SLA acceptance tests passed — no remediation windows open", "Tech Lead", "SLA test result certificates per GAP (per S56 §56.4)"],
        ["P3-GL-CHK-03", "72-hour clean data pipeline run — WS-A/B/C all pipelines < 1% data drop", "Signal/Aria/Core", "Vega pipeline monitoring report (72h window)"],
        ["P3-GL-CHK-04", "Security penetration test complete — zero critical vulnerabilities open", "Guardian", "Guardian pen-test sign-off certificate"],
        ["P3-GL-CHK-05", "Rollback procedure rehearsed — staging rollback ≤ 2 hours; documented", "Tech Lead + Nexus", "Rollback rehearsal report with timestamps"],
        ["P3-GL-CHK-06", "Phase 3 cutover plan approved — cutover schedule (§57.2) distributed to all stakeholders", "Programme Director", "Signed cutover plan; stakeholder distribution list"],
        ["P3-GL-CHK-07", "Hypercare TAMs confirmed — all 3 vendors TAMs assigned; Slack channels live; escalation ladder active", "Programme Director", "Hypercare activation confirmation (per S56 §56.5)"],
        ["P3-GL-CHK-08", "Go/No-Go meeting held — P3-GL-CHK-01–07 reviewed; SC Chair present; formal decision recorded", "SC Chair + Programme Director", "Go/No-Go meeting minutes with formal Go decision"],
        ["P3-GL-CHK-09", "92% coverage baseline confirmed — pre-go-live agent coverage audit validates 92% target achievable", "Vega + Nexus", "Coverage audit report — all 28 agents; 7 GAPs active"],
        ["P3-GL-CHK-10", "SC Chair final approval — Phase 3 Go-Live authorised; P3-M4 milestone formally approved", "SC Chair", "SC resolution MONOLITH-SC-P3GL-001 signed and lodged with Ledger"],
    ]
)
S57 += spacer()
S57 += body(
    "Note: P3-GL-CHK-10 (SC Chair final approval) mirrors GL-CHK-10 from S53, which "
    "triggered Phase 3 programme initiation. P3-GL-CHK-10 completes the Phase 3 delivery "
    "cycle and authorises transition to BAU operations. Any failure at P3-GL-CHK-08 "
    "(Go/No-Go) triggers a 5-working-day remediation window before re-assessment."
)
S57 += spacer()

# ── 57.5 Post-Go-Live Monitoring & P3-M4 Milestone ────────────────────────────
S57 += heading2("57.5 Post-Go-Live Monitoring & Programme Milestone P3-M4")
S57 += body(
    "Following Phase 3 Go-Live and 72-hour review, the programme enters the P3-M4 "
    "milestone completion phase. P3-M4 represents the final programme delivery milestone "
    "of the three-phase MONOLITH/DAPH Decor AI Agent Programme. Completion of P3-M4 "
    "triggers formal programme closure activities and transition to MONOLITH BAU "
    "governance under the SC."
)
S57 += bullet("Vega agent: Continuous 24/7 monitoring of all 28 agents; daily SLA scorecards to Programme Director; weekly dashboard to SC")
S57 += bullet("Nexus agent: API gateway health monitoring; rate limiting and capacity management for production Phase 3 load")
S57 += bullet("Guardian agent: Ongoing PDPA and security compliance monitoring; monthly security posture report to SC")
S57 += bullet("Ledger agent: Contract performance tracking — monthly SLA reports per vendor; payment milestone management per MSA")
S57 += bullet("Core agent: GAP-13/14/15 BAU performance monitoring; NPS accuracy trending; ESG quarterly report generation")
S57 += bullet("Signal agent: GAP-01/02 BAU accuracy monitoring; biophilic scoring quality review; design freeze gate accuracy trending")
S57 += bullet("Aria agent: GAP-03/04 commissioning completion rates; POE survey completion monitoring; sensory data quality review")
S57 += spacer()
S57 += body("P3-M4 Milestone Completion Criteria:")
S57 += bullet("T+72h post-go-live review complete; SC acceptance of P3-M4 milestone confirmed")
S57 += bullet("All P3-GL-CHK-01–10 verified and signed off; documented in Ledger")
S57 += bullet("92% coverage confirmed across all 28 agents; Vega coverage report accepted by SC")
S57 += bullet("No unresolved P1 incidents at P3-M4 gate date")
S57 += bullet("Hypercare active for all 3 vendors; transition to BAU support schedule confirmed")
S57 += bullet("Programme financial reconciliation: THB 18.2M total actuals vs. budget; Ledger variance report < 5%")
S57 += bullet("Phase 3 Programme Closure Report (MONOLITH-S57-P3GOLIVE-001) signed by Programme Director and SC Chair")
S57 += spacer()
S57 += label_value("P3-M4 gate owner", "Phase 3 Programme Director with SC Chair ratification")
S57 += label_value("Programme closure", "Post-P3-M4: MONOLITH BAU Governance Charter activated; quarterly SC review cycle; annual GAP effectiveness review")
S57 += label_value("Coverage trajectory", "Baseline 56% → Phase 1 68% (THB 5.2M) → Phase 2 80% (THB 6.0M) → Phase 3 92% (THB 7.0M) → Programme total THB 18.2M")
S57 += label_value("Related documents",
    "S56 (Phase 3 Vendor Onboarding) · S55 (Phase 3 RFP) · S54 (Phase 3 PDD) · "
    "S53 (Phase 2 Go-Live, GL-CHK-10) · MONOLITH-S57-P3GOLIVE-001 v1.0")
S57 += spacer()

# ── INJECT ────────────────────────────────────────────────────────────────────
shutil.copy(SRC, BAK)
print(f"Backup: {BAK}")

with zipfile.ZipFile(SRC, 'r') as z:
    xml = z.read('word/document.xml').decode('utf-8')

INJECT_BEFORE = '</w:body>'
if INJECT_BEFORE not in xml:
    raise RuntimeError("Injection point '</w:body>' not found")

xml_new = xml.replace(INJECT_BEFORE, S57 + INJECT_BEFORE, 1)

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

fsize      = os.path.getsize(SRC)
ins_count  = len(re.findall(r'<w:ins[ >]', vxml))
max_id     = max(int(x) for x in re.findall(r'w:id="(\d+)"', vxml))
insideH    = len(re.findall(r'w:insideH', vxml))
insideV    = len(re.findall(r'w:insideV', vxml))

print(f"\n=== INJECTION RESULTS ===")
print(f"w:ins tracked insertions   : {ins_count}")
print(f"Max ID used                : {max_id}")
print(f"w:insideH intact           : {insideH}")
print(f"w:insideV intact           : {insideV}")
print(f"S57 (Phase 3 Go-Live)      : {'Phase 3 Go-Live Operations' in vxml}")
print(f"S56 (Onboarding) intact    : {'Phase 3 Vendor Onboarding' in vxml}")
print(f"S55 (RFP) intact           : {'Phase 3 RFP' in vxml}")
print(f"S54 (PDD) intact           : {'Phase 3 Programme Definition' in vxml}")
print(f"P3-GL-CHK-10 present       : {'P3-GL-CHK-10' in vxml}")
print(f"P3-GL-CHK-01 present       : {'P3-GL-CHK-01' in vxml}")
print(f"92% coverage present       : {'92%' in vxml}")
print(f"Cutover schedule present   : {'Cutover Schedule' in vxml}")
print(f"BAU transition present     : {'BAU Transition' in vxml}")
print(f"P3-M4 milestone present    : {'P3-M4' in vxml}")
print(f"THB 18.2M present          : {'18.2M' in vxml}")
print(f"File size                  : {fsize:,} bytes")
print(f"IDs used: {2771} – {_id[0]-1} (total {_id[0]-2771} IDs allocated)")
