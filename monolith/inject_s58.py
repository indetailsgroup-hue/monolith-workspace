"""
inject_s58.py
Inject S58 — BAU Governance Charter
into monolith_project_summary_v25_accepted.docx as tracked changes.

Sections:
    58.1 Overview & Purpose
    58.2 Governance Committee Structure
    58.3 KPI Review Cadence
    58.4 Programme Closure Certificate
    58.5 Post-Programme Audit Plan
IDs start at 2830 (continuing from inject_s57.py which used 2771–2829)
"""
import zipfile, re, shutil, os

SRC = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
BAK = '/home/sandbox/monolith_project_summary_v25_accepted_pre_s58_backup.docx'
TMP = SRC + '.tmp_s58'

AUTHOR = "Scispace Agent"
DATE   = "2026-09-04T00:00:00Z"

_id = [2830]
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

def rpr_bold_gold():
    return ('<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
            '<w:b/><w:bCs/><w:color w:val="c9a84c"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>')

def rpr_cert():
    return ('<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
            '<w:b/><w:bCs/><w:color w:val="1f2d5a"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>')

def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

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

def cert_line(text, gold=False):
    ppr = ('<w:pPr><w:ind w:left="400"/><w:jc w:val="center"/>'
           '<w:spacing w:after="60"/></w:pPr>')
    rpr = rpr_bold_gold() if gold else rpr_cert()
    run = f'<w:r>{rpr}<w:t xml:space="preserve">{esc(text)}</w:t></w:r>'
    return ins(f'<w:p>{ppr}{run}</w:p>')

def spacer():
    return ins('<w:p><w:pPr><w:spacing w:after="40"/></w:pPr></w:p>')

def tbl_hdr_row(cells, fill="1f2d5a"):
    tcs = ''
    for cell in cells:
        rpr = ('<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
               '<w:b/><w:bCs/><w:color w:val="FFFFFF"/>'
               '<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>')
        tc = (
            f'<w:tc><w:tcPr>'
            f'<w:shd w:val="clear" w:color="auto" w:fill="{fill}"/>'
            '<w:tcBorders>'
            f'<w:top w:val="single" w:sz="4" w:space="0" w:color="{fill}"/>'
            f'<w:left w:val="single" w:sz="4" w:space="0" w:color="{fill}"/>'
            f'<w:bottom w:val="single" w:sz="4" w:space="0" w:color="{fill}"/>'
            f'<w:right w:val="single" w:sz="4" w:space="0" w:color="{fill}"/>'
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

def table(header_cells, data_rows, hdr_fill="1f2d5a"):
    rows_xml = tbl_hdr_row(header_cells, fill=hdr_fill)
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

# ── Build S58 XML ─────────────────────────────────────────────────────────────
S58 = ''

# ── 58.1 Overview & Purpose ───────────────────────────────────────────────────
S58 += heading1("Section 58 — BAU Governance Charter")
S58 += spacer()
S58 += heading2("58.1 Overview & Purpose")
S58 += body(
    "This section documents the MONOLITH BAU Governance Charter "
    "(MONOLITH-S58-BAUGOV-001 v1.0), establishing the permanent governance "
    "framework for the MONOLITH AI Platform following Phase 3 Go-Live (S57). "
    "The charter is activated upon achievement of P3-M4 (Phase 3 Programme Delivery "
    "Milestone) and SC Chair final approval (P3-GL-CHK-10). It defines the "
    "committee structure, KPI review cadence, formal programme closure, and "
    "post-programme audit obligations to sustain 92% BAU automation coverage "
    "across all 28 MONOLITH agents."
)
S58 += label_value("Document reference", "MONOLITH-S58-BAUGOV-001 v1.0")
S58 += label_value("Charter status", "ACTIVE — triggered by P3-GL-CHK-10 SC Chair approval and P3-M4 milestone")
S58 += label_value("Activation date", "P3-M4 Go-Live date (post T+72h SC review confirmation)")
S58 += label_value("Scope", "All 28 MONOLITH agents; WS-A (GAP-01/02), WS-B (GAP-03/04), WS-C (GAP-13/14/15); KPI-001–024")
S58 += label_value("Charter validity", "Permanent; reviewed annually by Steering Committee; amendments require SC Chair approval")
S58 += label_value("Parent documents",
    "S57 MONOLITH-S57-P3GOLIVE-001 (Phase 3 Go-Live) · "
    "S54 MONOLITH-S54-P3PDD-001 (Phase 3 PDD) · "
    "S50 Phase 2 PDD · S38 AMD-004 PDD")
S58 += label_value("Programme total", "THB 18.2M — Phase 1 (5.2M) + Phase 2 (6.0M) + Phase 3 (7.0M)")
S58 += label_value("Coverage achieved", "92% BAU AI coverage across 28 agents (baseline 56%); net +36 percentage points")
S58 += spacer()

# ── 58.2 Governance Committee Structure ───────────────────────────────────────
S58 += heading2("58.2 Governance Committee Structure")
S58 += body(
    "The BAU governance framework comprises four interlocking committees, each with "
    "defined authority, membership, and reporting lines. The Steering Committee (SC) "
    "holds apex authority and delegates operational oversight to the Programme "
    "Governance Board (PGB). Technical matters are governed by the Technical Advisory "
    "Group (TAG) and day-to-day operations by the Agent Operations Committee (AOC)."
)
S58 += table(
    ["Committee", "Chair", "Scope & Authority", "Meeting Cadence", "Quorum"],
    [
        ["Steering Committee (SC)",
         "SC Chair",
         "Apex governance body; approves charter amendments, major budget reallocations, and programme-level decisions; receives quarterly KPI report from PGB",
         "Quarterly + ad hoc (P1 incident escalation)",
         "3 of 5 members"],
        ["Programme Governance Board (PGB)",
         "Programme Director",
         "Operational oversight; reviews full KPI-001–024 dashboard monthly; approves vendor SLA amendments; escalates P1/P2 incidents to SC; budget management ≤ THB 500K",
         "Monthly (KPI review) + bi-weekly (operations)",
         "4 of 6 members"],
        ["Technical Advisory Group (TAG)",
         "Technical Lead",
         "Technical standards and agent performance; reviews model drift (GAP-15), security posture, integration health (WS-A/B/C); approves model version updates; governs SLA measurement methodology",
         "Bi-monthly + on-demand (model updates)",
         "3 of 5 members"],
        ["Agent Operations Committee (AOC)",
         "Operations Manager",
         "Day-to-day operations; reviews weekly SLA compliance, incident log, L1/L2 escalations; manages on-call rota; approves hotfix deployments within defined risk parameters",
         "Weekly (SLA review) + daily (stand-up during hypercare)",
         "2 of 3 members"],
    ]
)
S58 += spacer()

# ── 58.3 KPI Review Cadence ───────────────────────────────────────────────────
S58 += heading2("58.3 KPI Review Cadence")
S58 += body(
    "The following review cadence governs ongoing monitoring of all 24 KPIs "
    "(KPI-001–024) across the seven Phase 3 GAPs. Coverage trajectory target is "
    "maintained at 92% minimum, with TAG responsible for alerting PGB if any "
    "three-month rolling average falls below threshold. The KPI framework references "
    "SLA minimums defined in S56 Section 56.3 and S57 Section 57.5."
)
S58 += table(
    ["Review Type", "Frequency", "KPI Scope", "Owner", "Output"],
    [
        ["SLA Compliance Check",
         "Weekly",
         "GAP-01 accuracy ≥90%; GAP-02 gate accuracy ≥95%; GAP-03 recall ≥92%; "
         "GAP-04 completeness ≥95%; GAP-13 NPS accuracy ≥80%; GAP-14 ESG coverage ≥80%; "
         "GAP-15 drift alert ≤1h",
         "AOC — Operations Manager",
         "Weekly SLA log; P1/P2 incidents escalated to PGB within 4h"],
        ["Full KPI Dashboard Review",
         "Monthly",
         "All 24 KPIs (KPI-001–024); coverage trajectory; vendor SLA compliance; "
         "incident trend analysis; budget tracking vs. THB 18.2M baseline",
         "PGB — Programme Director",
         "Monthly KPI report to SC; action items for TAG/AOC"],
        ["SC Strategic Review",
         "Quarterly",
         "Coverage trajectory vs. 92% target; programme ROI; charter compliance; "
         "risk register review; vendor performance scorecard; budget vs. actuals",
         "SC — SC Chair",
         "Governance decision minutes; charter amendments if required"],
        ["Agent Performance Benchmark",
         "Semi-annual",
         "Model accuracy benchmarking (all 7 GAPs); drift analysis (GAP-15); "
         "security posture review; integration health (WS-A/B/C APIs); SLA methodology review",
         "TAG — Technical Lead",
         "Performance report to PGB; model update recommendations"],
        ["Full Programme Audit",
         "Annual",
         "Complete audit: governance charter compliance; all 28 agents; KPI-001–024 "
         "baseline vs. actuals; vendor contract compliance; data privacy (GAP-14 ESG); "
         "post-go-live incident history",
         "External Auditor + TAG",
         "Annual audit certificate; findings and remediation plan to SC"],
    ]
)
S58 += spacer()

# ── 58.4 Programme Closure Certificate ───────────────────────────────────────
S58 += heading2("58.4 Programme Closure Certificate")
S58 += body(
    "This certificate formally closes the MONOLITH DAPH Decor AI Agent Programme "
    "upon achievement of all three phase milestones (P1-M4, P2-M4, P3-M4) and "
    "SC Chair authorisation under P3-GL-CHK-10. The programme is declared COMPLETE "
    "and transitions to permanent BAU governance under this charter "
    "(MONOLITH-S58-BAUGOV-001 v1.0)."
)
S58 += spacer()
S58 += cert_line("MONOLITH DAPH DECOR AI AGENT PROGRAMME", gold=True)
S58 += cert_line("PROGRAMME CLOSURE CERTIFICATE")
S58 += cert_line("MONOLITH-S58-CLOSECERT-001 v1.0")
S58 += spacer()
S58 += label_value("Programme reference", "MONOLITH DAPH Decor AI Agent Programme — 3-Phase AI Integration")
S58 += label_value("Programme document", "AMD-004 (S38) · S1–S58 (58 sections, 58 SOP documents)")
S58 += label_value("Phase 1 closure",
    "CLOSED — Phase 1 Go-Live (S49 GL-CHK-10); "
    "Coverage: 56% → 68% (+12pp); Investment: THB 5.2M; "
    "GAPs certified: GAP-01 / GAP-02 / GAP-03 / GAP-04 / GAP-07 / GAP-08")
S58 += label_value("Phase 2 closure",
    "CLOSED — Phase 2 Go-Live (S53 GL-CHK-10); "
    "Coverage: 68% → 80% (+12pp); Investment: THB 6.0M; "
    "GAPs certified: GAP-05 / GAP-06 / GAP-09 / GAP-10 / GAP-11 / GAP-12")
S58 += label_value("Phase 3 closure",
    "CLOSED — Phase 3 Go-Live (S57 P3-GL-CHK-10); "
    "Coverage: 80% → 92% (+12pp); Investment: THB 7.0M; "
    "GAPs certified: GAP-01 / GAP-02 / GAP-03 / GAP-04 / GAP-13 / GAP-14 / GAP-15")
S58 += label_value("Total programme investment", "THB 18,200,000 (Phase 1: 5.2M + Phase 2: 6.0M + Phase 3: 7.0M)")
S58 += label_value("Baseline vs. final coverage", "56% (pre-programme baseline) → 92% (BAU final) — net improvement: +36 percentage points")
S58 += label_value("Agents deployed", "28 of 28 MONOLITH AI agents in production BAU (WS-A: 8, WS-B: 11, WS-C: 9)")
S58 += label_value("Programme milestones", "P1-M4 CLOSED · P2-M4 CLOSED · P3-M4 CLOSED — all programme milestones achieved")
S58 += label_value("SOP package", "S1–S58 complete; 58 sections; MONOLITH_SOP_Package_v2.5; 195,663 bytes")
S58 += label_value("Authorisation", "SC Chair — P3-GL-CHK-10 final approval; BAU Governance Charter active")
S58 += label_value("Certificate reference", "MONOLITH-S58-CLOSECERT-001 v1.0 — issued upon P3-M4 milestone achievement")
S58 += spacer()

# ── 58.5 Post-Programme Audit Plan ────────────────────────────────────────────
S58 += heading2("58.5 Post-Programme Audit Plan")
S58 += body(
    "Following programme closure, a structured post-programme audit schedule "
    "ensures BAU governance charter compliance, SLA adherence, and continuous "
    "improvement. Audits are conducted jointly by the TAG and external auditors "
    "as specified. All audit outputs are reported to PGB and escalated to SC "
    "if critical findings are identified. The post-programme audit plan is "
    "governed by the AOC for scheduling and the TAG for technical scope."
)
S58 += table(
    ["Audit", "Timing", "Scope", "Auditor", "Output"],
    [
        ["First BAU Audit",
         "T+30 days post go-live",
         "SLA compliance for all 7 GAPs; KPI-001–024 vs. go-live baseline; "
         "incident log review; rollback readiness confirmation; agent health across WS-A/B/C",
         "TAG (Internal) + Programme Manager",
         "30-day BAU report to PGB; immediate remediation plan if SLA breach found"],
        ["Process Audit",
         "T+60 days post go-live",
         "Agent workflow compliance; escalation procedure adherence (L1–L4); "
         "vendor SLA reporting accuracy; change management process; AOC rota coverage",
         "TAG + Operations Manager",
         "Process audit findings to PGB; updated runbooks if required"],
        ["Full BAU Audit",
         "T+90 days post go-live",
         "92% coverage confirmation (3-month rolling); full governance charter "
         "compliance check; all vendor contracts; data privacy (GAP-14 ESG); "
         "KPI-001–024 trend analysis; P3-M4 milestone retrospective",
         "External Auditor + TAG + PGB",
         "90-day audit certificate to SC Chair; BAU governance sign-off; "
         "charter amendments if required"],
        ["Year-1 Programme Audit",
         "12 months post go-live",
         "Full scope: all 28 agents; all 24 KPIs; vendor performance vs. SLAs; "
         "programme ROI (THB 18.2M investment vs. efficiency gains); "
         "governance charter compliance; GAP closure sustainability",
         "External Audit Firm + TAG",
         "Annual audit certificate; SC strategic review input; "
         "recommendations for Year-2 BAU roadmap"],
        ["Ongoing BAU Audit Cycle",
         "Annual (Year 2 onwards)",
         "Continuous improvement: KPI benchmark refresh; SLA renegotiation if "
         "coverage exceeds 95%; model version review; agent retirement/replacement "
         "roadmap; governance charter annual review; TAG performance assessment",
         "External Auditor + PGB + TAG",
         "Annual audit report to SC; charter amendment decisions; "
         "BAU roadmap update approved by SC Chair"],
    ],
    hdr_fill="2d7a4f"
)
S58 += spacer()

# ── Inject into DOCX ──────────────────────────────────────────────────────────
shutil.copy(SRC, BAK)
print(f"Backup: {BAK}")

with zipfile.ZipFile(SRC, 'r') as zin:
    doc_xml = zin.read('word/document.xml').decode('utf-8')

ANCHOR = '</w:body>'
if ANCHOR not in doc_xml:
    raise RuntimeError("Cannot find </w:body> anchor in document.xml")

doc_xml = doc_xml.replace(ANCHOR, S58 + ANCHOR)

with zipfile.ZipFile(SRC, 'r') as zin, zipfile.ZipFile(TMP, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == 'word/document.xml':
            data = doc_xml.encode('utf-8')
        zout.writestr(item, data)

os.replace(TMP, SRC)

# ── Verify ────────────────────────────────────────────────────────────────────
with zipfile.ZipFile(SRC, 'r') as z:
    out_xml = z.read('word/document.xml').decode('utf-8')

ins_count   = len(re.findall(r'<w:ins[ >]', out_xml))
max_id_used = _id[0] - 1
insideH     = out_xml.count('w:insideH')
insideV     = out_xml.count('w:insideV')
file_size   = os.path.getsize(SRC)

print("\n=== INJECTION RESULTS ===")
print(f"w:ins tracked insertions   : {ins_count}")
print(f"Max ID used                : {max_id_used}")
print(f"w:insideH intact           : {insideH}")
print(f"w:insideV intact           : {insideV}")
print(f"S58 (BAU Governance)       : {'Section 58' in out_xml}")
print(f"S57 (Go-Live) intact       : {'Phase 3 Go-Live Operations' in out_xml}")
print(f"S56 (Onboarding) intact    : {'Phase 3 Vendor Onboarding' in out_xml}")
print(f"BAUGOV-001 present         : {'MONOLITH-S58-BAUGOV-001' in out_xml}")
print(f"Closure cert present       : {'MONOLITH-S58-CLOSECERT-001' in out_xml}")
print(f"Committee structure        : {'Steering Committee' in out_xml}")
print(f"KPI review cadence         : {'KPI Review Cadence' in out_xml}")
print(f"Post-programme audit       : {'Post-Programme Audit' in out_xml}")
print(f"THB 18.2M present          : {'18,200,000' in out_xml}")
print(f"92% coverage present       : {'92%' in out_xml}")
print(f"File size                  : {file_size:,} bytes")
print(f"IDs used: 2830 – {max_id_used} (total {max_id_used - 2830 + 1} IDs allocated)")
