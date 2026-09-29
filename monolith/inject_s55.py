"""
inject_s55.py
Inject S55 — Phase 3 RFP & Vendor Selection Framework
into monolith_project_summary_v25_accepted.docx as tracked changes.

Sections:
    55.1 Overview & Scope
    55.2 RFP Framework & Procurement Strategy (RFP-P3-WSA-001 / WSB-001 / WSC-001)
    55.3 5-Stage Vendor Evaluation Process
    55.4 Evaluation Criteria & Scoring Matrix
    55.5 SLA Targets & Acceptance Criteria per GAP
    55.6 Vendor Selection Checklist (P3-VND-CHK-01–10)
IDs start at 2571 (continuing from inject_s54.py which used 2258–2570)
"""
import zipfile, re, shutil, os

SRC = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
BAK = '/home/sandbox/monolith_project_summary_v25_accepted_pre_s55_backup.docx'
TMP = SRC + '.tmp_s55'

AUTHOR = "Scispace Agent"
DATE   = "2026-09-04T00:00:00Z"

_id = [2571]
def nid():
    v = _id[0]; _id[0] += 1; return v

# ── XML helpers ──────────────────────────────────────────────────────────────
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

# ── Build S55 XML ─────────────────────────────────────────────────────────────
S55 = ''

# ── 55.1 Overview & Scope ────────────────────────────────────────────────────
S55 += heading1("Section 55 — Phase 3 RFP & Vendor Selection Framework")
S55 += spacer()
S55 += heading2("55.1 Overview & Scope")
S55 += body(
    "This section documents the Phase 3 RFP & Vendor Selection Framework "
    "(MONOLITH-S55-P3RFP-001 v1.0) governing the procurement and appointment of vendors "
    "for all seven Phase 3 GAPs: GAP-01 (Biophilic Design Enhancement), GAP-02 (Design "
    "Freeze Gate AI), GAP-03 (Sensory Commissioning Full Automation), GAP-04 "
    "(Post-Occupancy Evaluation AI), GAP-13 (Client Experience Intelligence Platform), "
    "GAP-14 (Sustainable Materials & Procurement Intelligence), and GAP-15 (Continuous "
    "Learning & Model Governance Engine). The framework aligns with MONOLITH-S55-P3RFP-001 "
    "and mirrors the Phase 2 procurement methodology established in S51."
)
S55 += label_value("Document reference", "MONOLITH-S55-P3RFP-001 v1.0")
S55 += label_value("Parent document", "MONOLITH-S54-P3PDD-001 v1.0 (Phase 3 PDD, S54)")
S55 += label_value("Phase 2 precedent", "MONOLITH-S51-PRF-001 v1.0 (RFP-GAP05-001, S51)")
S55 += label_value("Trigger", "P3-CHK-01 confirmed (GL-CHK-10 SC approval); P3-CHK-02 — budget THB 7.0M released")
S55 += label_value("Total procurement scope", "3 RFPs covering 7 GAPs across Workstreams A, B, and C")
S55 += label_value("Procurement authority", "Phase 3 Programme Director; SC approval required for awards > THB 1.0M per vendor")
S55 += label_value("Ledger agent role", "Tracks all Phase 3 vendor contracts, payments, and performance in real-time")
S55 += label_value("Guardian agent role", "Compliance review of all vendor contracts; PDPA and data security verification")
S55 += spacer()

# ── 55.2 RFP Framework & Procurement Strategy ───────────────────────────────
S55 += heading2("55.2 RFP Framework & Procurement Strategy")
S55 += body(
    "Phase 3 vendor procurement is organised into three RFP packages aligned with the "
    "three Programme Workstreams defined in S54. Each RFP package covers the GAPs within "
    "its workstream and may be awarded to a single integrated vendor or split across "
    "specialist providers, subject to Programme Director and SC approval."
)
S55 += body("RFP Package Overview:")
S55 += label_value(
    "RFP-P3-WSA-001",
    "Workstream A — GAP-01 (Biophilic Design Enhancement AI) and GAP-02 (Design Freeze Gate AI); "
    "total envelope THB 2.0M; integration with AIE-001 (Aria Creative Engine) and "
    "AIE-002 (Core API Gateway) mandatory"
)
S55 += label_value(
    "RFP-P3-WSB-001",
    "Workstream B — GAP-03 (Sensory Commissioning Full Automation) and GAP-04 "
    "(Post-Occupancy Evaluation AI); total envelope THB 1.7M; integration with "
    "AIE-003 (Signal Hub) and AIE-004 (Nova Analytics) mandatory"
)
S55 += label_value(
    "RFP-P3-WSC-001",
    "Workstream C — GAP-13 (CX Intelligence Platform), GAP-14 (Sustainable Materials & "
    "Procurement Intelligence), and GAP-15 (Continuous Learning & Model Governance Engine); "
    "total envelope THB 2.4M; integration with all AIE-001–005 endpoints mandatory"
)
S55 += body("Procurement strategy principles:")
S55 += bullet("Phase 2 incumbent vendor (GAP-05 AI Creative Engine provider) has right of first refusal for RFP-P3-WSA-001 and RFP-P3-WSB-001, subject to Phase 2 SLA performance review by Vega and Rex")
S55 += bullet("All Phase 2 SLA data (AIE-001–005 uptime, accuracy, latency) to be reviewed by Vega before issuing any Phase 3 RFP to existing vendors")
S55 += bullet("New capability vendors (GAP-13/14/15) require specialist AI/ML credentials; minimum 3 years enterprise AI deployment experience")
S55 += bullet("Split award permitted for RFP-P3-WSC-001 (GAP-13 and GAP-14/15 may be awarded separately) if no single vendor demonstrates capability across all three GAPs")
S55 += bullet("All vendors must pass Guardian compliance check (PDPA, data residency, InfoSec) before contract award")
S55 += bullet("Ledger agent integration for invoicing and payment milestones is mandatory for all Phase 3 vendor contracts")
S55 += spacer()

# ── 55.3 5-Stage Vendor Evaluation Process ─────────────────────────────────
S55 += heading2("55.3 5-Stage Vendor Evaluation Process")
S55 += body(
    "The Phase 3 vendor selection process follows the same five-stage methodology "
    "established in the Phase 2 Procurement Framework (S51), adapted for Phase 3 scope "
    "and timeline. Each stage has defined gate criteria and a mandatory SC checkpoint "
    "before proceeding."
)
S55 += label_value("Stage 1 — RFI & Market Engagement", "Timeline: 2 weeks from P3-CHK-01")
S55 += bullet("Publish Request for Information (RFI) for each workstream on approved procurement portal")
S55 += bullet("Minimum 5 vendors per RFP package to be invited to respond; open market plus Phase 2 incumbents")
S55 += bullet("RFI response evaluation by Programme Director, Core (technical), and Ledger (commercial)")
S55 += bullet("Gate: minimum 3 qualified respondents per RFP before proceeding to Stage 2")
S55 += label_value("Stage 2 — Shortlisting", "Timeline: 1 week from RFI close")
S55 += bullet("Technical shortlisting using P3 capability matrix (see Section 55.4)")
S55 += bullet("Maximum 3 vendors shortlisted per RFP package; shortlist requires Programme Director approval")
S55 += bullet("Shortlisted vendors issued full RFP document with technical specifications, SLA targets (Section 55.5), and commercial terms")
S55 += bullet("Gate: SC notification of shortlist; no SC approval required at this stage")
S55 += label_value("Stage 3 — RFP Issue & Proposal Submission", "Timeline: 3 weeks from shortlist issue")
S55 += bullet("Full RFP documents (RFP-P3-WSA-001, RFP-P3-WSB-001, RFP-P3-WSC-001) issued to shortlisted vendors")
S55 += bullet("RFP includes: technical scope, SLA targets, integration specifications, pricing template, and SC governance requirements")
S55 += bullet("Vendor presentations (maximum 2 hours per vendor) to Programme Director and technical leads")
S55 += bullet("Gate: all proposals received within RFP deadline; late submissions disqualified")
S55 += label_value("Stage 4 — Technical & Commercial Evaluation", "Timeline: 2 weeks from proposal receipt")
S55 += bullet("Technical evaluation by Workstream lead agents (Aria/Core for WSA, Signal/Nova for WSB, Nexus/Guardian/Ledger for WSC)")
S55 += bullet("Scoring matrix applied per Section 55.4: Technical 40%, Commercial 25%, SLA Compliance 20%, Integration 15%")
S55 += bullet("Reference checks: minimum 2 enterprise AI references per vendor; Vega to verify Phase 2 incumbent SLA performance")
S55 += bullet("Legal and compliance review by Rex (contract terms, IP, liability, PDPA clauses)")
S55 += bullet("Gate: evaluation report presented to SC; SC approval required for awards > THB 1.0M per vendor")
S55 += label_value("Stage 5 — Award & Contract Execution", "Timeline: 1 week from SC approval")
S55 += bullet("Programme Director issues Letter of Award (LOA) to selected vendor(s) within 5 working days of SC approval")
S55 += bullet("Contract execution: Phase 3 Master Services Agreement (MSA) + Workstream-specific Statement of Work (SOW)")
S55 += bullet("Ledger agent registers all contracts; payment milestones linked to P3-M1/M2/M3/M4 deliverable gates")
S55 += bullet("P3-CHK-04 (WSA), P3-CHK-05 (WSB), P3-CHK-06 (WSC) confirmed upon contract execution")
S55 += bullet("Gate: P3-VND-CHK-08 — all Phase 3 vendor contracts executed before P3-M1 kick-off declares complete")
S55 += spacer()

# ── 55.4 Evaluation Criteria & Scoring Matrix ───────────────────────────────
S55 += heading2("55.4 Evaluation Criteria & Scoring Matrix")
S55 += body(
    "All vendor proposals are evaluated using the following weighted scoring matrix. "
    "Scores are assigned by the evaluation panel (Programme Director, Workstream leads, "
    "and Core technical reviewer) on a scale of 0–10 per criterion. The weighted total "
    "determines vendor ranking."
)
S55 += body("Scoring weights by category (total 100%):")
S55 += label_value(
    "Technical Capability (40%)",
    "AI/ML model quality, demonstrated accuracy benchmarks, relevant project experience, "
    "team credentials, and architecture fit with AIE-001–005 backbone"
)
S55 += bullet("Sub-criterion: AI/ML technical approach and model methodology — 15%")
S55 += bullet("Sub-criterion: Demonstrated benchmark performance against Phase 3 SLA targets (Section 55.5) — 15%")
S55 += bullet("Sub-criterion: Team experience and key personnel credentials — 10%")
S55 += label_value(
    "Commercial Proposal (25%)",
    "Total cost of ownership, payment milestone alignment with P3-M1–M4, pricing transparency, "
    "and value for money assessment against THB envelope"
)
S55 += bullet("Sub-criterion: Total fixed-price cost within approved GAP budget envelope — 15%")
S55 += bullet("Sub-criterion: Payment milestone structure and cash-flow profile — 10%")
S55 += label_value(
    "SLA Compliance Commitment (20%)",
    "Contractual commitment to Phase 3 SLA targets, penalty regime acceptance, "
    "uptime guarantees, and escalation procedures"
)
S55 += bullet("Sub-criterion: SLA target commitments and penalty/credit regime — 12%")
S55 += bullet("Sub-criterion: Proposed monitoring, reporting, and escalation protocols — 8%")
S55 += label_value(
    "Integration & Interoperability (15%)",
    "Demonstrated or planned integration with AIE-001–005 APIs, MONOLITH data architecture, "
    "and GAP-15 Model Governance Engine (where applicable)"
)
S55 += bullet("Sub-criterion: AIE backbone integration plan and API readiness — 10%")
S55 += bullet("Sub-criterion: GAP-15 governance integration (model registry, drift hooks) — 5%")
S55 += body("Minimum qualifying scores:")
S55 += bullet("Technical Capability minimum: 6.0/10 (vendors below threshold are disqualified regardless of total score)")
S55 += bullet("SLA Compliance Commitment minimum: 6.5/10 (SLA commitment below threshold is disqualified)")
S55 += bullet("Overall weighted minimum: 65/100 to qualify for award consideration")
S55 += spacer()

# ── 55.5 SLA Targets & Acceptance Criteria per GAP ─────────────────────────
S55 += heading2("55.5 SLA Targets & Acceptance Criteria per GAP")
S55 += body(
    "The following SLA targets and acceptance criteria apply to all Phase 3 vendor contracts. "
    "These targets are incorporated verbatim into all Phase 3 RFP documents and Statements of Work. "
    "Vendors must commit to these targets contractually; failure to meet targets triggers "
    "the penalty regime defined in each MSA."
)
S55 += body("Workstream A — GAP-01 & GAP-02:")
S55 += label_value(
    "GAP-01 SLA — Biophilic Design Enhancement",
    "Biophilic compliance score accuracy ≥90% against expert benchmark; "
    "analysis latency ≤3 seconds per design brief; "
    "system uptime ≥99.5% (AIE-001 API integration); "
    "model drift alert to GAP-15 ≤1 hour of detection"
)
S55 += bullet("Penalty: 2% of monthly contract value per 0.5% accuracy shortfall below 90%")
S55 += bullet("Measurement: Monthly benchmark testing using SC-approved biophilic expert panel (minimum 50 designs/month)")
S55 += bullet("Lead agent: Aria (primary SLA monitor); Vega (monthly audit report)")
S55 += label_value(
    "GAP-02 SLA — Design Freeze Gate AI",
    "Gate decision accuracy ≥95% (correctly classify freeze/not-freeze events); "
    "false escalation rate ≤2% of total gate events; "
    "SC notification latency ≤5 minutes from gate trigger; "
    "change impact report generation ≤15 minutes"
)
S55 += bullet("Penalty: 3% of monthly contract value per 1% false escalation rate above 2%")
S55 += bullet("Measurement: Automated logging of all gate events; monthly review by Core and Programme Director")
S55 += bullet("Lead agent: Core (API Gateway integration monitor); Rex (compliance review)")
S55 += body("Workstream B — GAP-03 & GAP-04:")
S55 += label_value(
    "GAP-03 SLA — Sensory Commissioning Full Automation",
    "Automated sign-off accuracy ≥97% (correctly pass/fail sensor calibration); "
    "sensor anomaly detection recall ≥92% (true positive rate); "
    "manual override rate ≤3% of total commissioning events; "
    "system uptime ≥99.5% (AIE-003 Signal Hub integration)"
)
S55 += bullet("Penalty: 3% of monthly contract value per 1% recall shortfall below 92%")
S55 += bullet("Measurement: Commissioning event logs from AIE-003 Signal Hub; weekly Ops review")
S55 += bullet("Lead agent: Signal (primary SLA monitor); Vega (monthly audit)")
S55 += label_value(
    "GAP-04 SLA — Post-Occupancy Evaluation AI",
    "POE dashboard completeness ≥95% (all required metrics populated on time); "
    "predictive occupant satisfaction accuracy ≥85%; "
    "quarterly POE report generation ≤24 hours post-period close; "
    "data pipeline uptime ≥99% (AIE-004 Nova Analytics integration)"
)
S55 += bullet("Penalty: 2% of monthly contract value per 5% completeness shortfall below 95%")
S55 += bullet("Measurement: Automated completeness checks by Nova; quarterly report delivery timestamp logs")
S55 += bullet("Lead agent: Nova (analytics integration monitor); Ops (dashboard access SLA)")
S55 += body("Workstream C — GAP-13, GAP-14 & GAP-15:")
S55 += label_value(
    "GAP-13 SLA — Client Experience Intelligence Platform",
    "CX score refresh cycle ≤5 minutes (all 28 agent touchpoints updated); "
    "NPS prediction model accuracy ≥80% versus actual NPS (rolling 90-day validation); "
    "client satisfaction alert delivery ≤2 minutes to Ops and Signal; "
    "agent integration coverage: 28/28 agents (100% mandatory)"
)
S55 += bullet("Penalty: 5% of monthly contract value if agent integration coverage falls below 28/28")
S55 += bullet("Measurement: Real-time integration monitoring by Nexus; monthly NPS accuracy validation by Vega")
S55 += bullet("Lead agent: Nexus (CX platform primary); Signal (alert delivery monitor)")
S55 += label_value(
    "GAP-14 SLA — Sustainable Materials & Procurement Intelligence",
    "Supplier ESG scoring coverage ≥80% of active MONOLITH supplier base; "
    "carbon-footprint estimate accuracy within ±10% of independent auditor benchmark; "
    "procurement recommendation adoption rate ≥60% (SC-validated 6-month rolling); "
    "scorecard generation latency ≤4 hours per supplier update"
)
S55 += bullet("Penalty: 3% of monthly contract value per 5% ESG coverage shortfall below 80%")
S55 += bullet("Measurement: Ledger procurement database integration; bi-annual independent ESG audit")
S55 += bullet("Lead agent: Ledger (procurement data primary); Guardian (compliance and ESG audit)")
S55 += label_value(
    "GAP-15 SLA — Continuous Learning & Model Governance Engine",
    "Model drift alert latency ≤1 hour from drift detection to alert (all registered agents); "
    "retraining pipeline success rate ≥95% (no failed retraining jobs without alert); "
    "Model Registry completeness: 100% of MONOLITH production models registered; "
    "Governance Audit Log completeness: 100% (SC-accessible, tamper-evident)"
)
S55 += bullet("Penalty: 5% of monthly contract value per hour of drift alert latency above 1 hour threshold")
S55 += bullet("Penalty: 3% of monthly contract value per retraining failure not alerted within 30 minutes")
S55 += bullet("Measurement: Automated monitoring by Vega; monthly SC governance report; Rex compliance audit quarterly")
S55 += bullet("Lead agent: Vega (audit primary); Rex (compliance); Nexus (operational monitoring)")
S55 += spacer()

# ── 55.6 Vendor Selection Checklist P3-VND-CHK-01–10 ───────────────────────
S55 += heading2("55.6 Vendor Selection Checklist (P3-VND-CHK-01–10)")
S55 += body(
    "The following checklist constitutes the vendor selection sign-off record for Phase 3 "
    "(MONOLITH-S55-P3RFP-001). All items must be complete before Phase 3 P3-M1 kick-off "
    "is declared fully operational. P3-VND-CHK-08 through P3-VND-CHK-10 are gate conditions "
    "for P3-M1 final completion and must be confirmed before P3-M2 commences."
)
S55 += label_value("P3-VND-CHK-01", "RFI published for RFP-P3-WSA-001, RFP-P3-WSB-001, and RFP-P3-WSC-001 on approved procurement portal; Programme Director sign-off")
S55 += label_value("P3-VND-CHK-02", "RFI responses received: minimum 3 qualified respondents per RFP package; gate passed")
S55 += label_value("P3-VND-CHK-03", "Vendor shortlist (maximum 3 per package) approved by Programme Director; SC notified")
S55 += label_value("P3-VND-CHK-04", "Full RFP documents issued to shortlisted vendors: RFP-P3-WSA-001, RFP-P3-WSB-001, RFP-P3-WSC-001")
S55 += label_value("P3-VND-CHK-05", "All vendor proposals received within deadline; vendor presentations completed for all shortlisted vendors")
S55 += label_value("P3-VND-CHK-06", "Technical and commercial evaluation complete; scoring matrix applied; evaluation report signed by Programme Director")
S55 += label_value("P3-VND-CHK-07", "Guardian compliance review complete for all shortlisted vendors (PDPA, InfoSec, data residency); Rex sign-off")
S55 += label_value("P3-VND-CHK-08", "SC approval received for all Phase 3 vendor awards (for awards > THB 1.0M per vendor); LOAs issued")
S55 += label_value("P3-VND-CHK-09", "All Phase 3 MSA and SOW contracts executed (RFP-P3-WSA-001 / WSB-001 / WSC-001); Ledger registration complete")
S55 += label_value("P3-VND-CHK-10", "P3-CHK-04, P3-CHK-05, and P3-CHK-06 confirmed: all workstream vendor contracts in place; Phase 3 programme fully resourced")
S55 += body(
    "Upon P3-VND-CHK-10 completion, the Phase 3 vendor selection process is formally closed. "
    "Ongoing vendor performance monitoring transitions to Workstream leads (Aria, Signal, Nexus) "
    "with monthly SLA reporting to SC via Vega. Any contract variations require SC Change Request "
    "(CR-P3-XXX) and must be registered in Ledger within 3 working days of approval."
)
S55 += label_value("Document owner", "Phase 3 Programme Director (MONOLITH-S55-P3RFP-001)")
S55 += label_value("Review cycle", "Vendor selection checklist reviewed at each P3 milestone SC checkpoint")
S55 += label_value("Related documents",
    "S51 (Phase 2 Procurement Framework) · S54 (Phase 3 PDD) · "
    "MONOLITH-S52-ONB-001 (Vendor Onboarding Protocol)")

# ── INJECT ────────────────────────────────────────────────────────────────────
shutil.copy(SRC, BAK)
print(f"Backup: {BAK}")

with zipfile.ZipFile(SRC, 'r') as z:
    xml = z.read('word/document.xml').decode('utf-8')

INJECT_BEFORE = '</w:body>'
if INJECT_BEFORE not in xml:
    raise RuntimeError("Injection point '</w:body>' not found")

xml_new = xml.replace(INJECT_BEFORE, S55 + INJECT_BEFORE, 1)

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
print(f"w:ins tracked insertions: {ins_count}")
print(f"Max ID used: {max_id}")
print(f"w:insideH intact: {insideH}")
print(f"w:insideV intact: {insideV}")
print(f"S55 (Phase 3 RFP) present: {'Phase 3 RFP' in vxml}")
print(f"S54 (Phase 3 PDD) intact: {'Phase 3 Programme Definition' in vxml}")
print(f"S53 (Go-Live) intact: {'Go-Live Operations Plan' in vxml}")
print(f"RFP-P3-WSA-001 present: {'RFP-P3-WSA-001' in vxml}")
print(f"RFP-P3-WSB-001 present: {'RFP-P3-WSB-001' in vxml}")
print(f"RFP-P3-WSC-001 present: {'RFP-P3-WSC-001' in vxml}")
print(f"P3-VND-CHK-10 present: {'P3-VND-CHK-10' in vxml}")
print(f"SLA targets (GAP-15 drift) present: {'drift alert' in vxml}")
print(f"5-stage process present: {'Stage 1' in vxml}")
print(f"File size: {fsize:,} bytes")
print(f"IDs used: {2571} – {_id[0]-1} (total {_id[0]-2571} IDs allocated)")
