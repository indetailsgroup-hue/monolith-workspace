"""
inject_s54.py
Inject Section S54 into monolith_project_summary_v25_accepted.docx
S54: Phase 3 Programme Definition Document
    54.1 Overview & Scope
    54.2 Phase 3 Programme Structure & GAP Inventory
    54.3 GAP Workplan (GAP-01/02/03/04/13/14/15)
    54.4 Phase 3 Budget Allocation (THB 7.0M)
    54.5 Milestones P3-M1–M4 (Q3 2033–Q2 2034)
    54.6 Phase 3 Readiness Checklist (P3-CHK-01–12)
IDs start at 2258 (continuing from inject_s53.py which used 2036–2257)
"""
import zipfile, re, shutil, os

SRC = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
DST = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
BAK = '/home/sandbox/monolith_project_summary_v25_accepted_pre_s54_backup.docx'

shutil.copy(SRC, BAK)
print(f'Backup: {BAK}')

with zipfile.ZipFile(SRC, 'r') as z:
    xml = z.read('word/document.xml').decode('utf-8')
    all_files = {name: z.read(name) for name in z.namelist()}

_id = 2258

def nid():
    global _id
    v = _id
    _id += 1
    return v

AUTHOR = "Scispace Agent"
DATE   = "2026-09-04T00:00:00Z"

def heading1(text):
    pi, ri = nid(), nid()
    return (
        f'<w:p><w:pPr><w:spacing w:before="320" w:after="100"/>'
        f'<w:rPr><w:ins w:id="{pi}" w:author="{AUTHOR}" w:date="{DATE}"/></w:rPr></w:pPr>'
        f'<w:ins w:id="{ri}" w:author="{AUTHOR}" w:date="{DATE}">'
        f'<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="36"/><w:szCs w:val="36"/>'
        f'<w:color w:val="1f2d5a"/></w:rPr>'
        f'<w:t xml:space="preserve">{text}</w:t></w:r></w:ins></w:p>\n'
    )

def heading2(text):
    pi, ri = nid(), nid()
    return (
        f'<w:p><w:pPr><w:spacing w:before="200" w:after="80"/>'
        f'<w:rPr><w:ins w:id="{pi}" w:author="{AUTHOR}" w:date="{DATE}"/></w:rPr></w:pPr>'
        f'<w:ins w:id="{ri}" w:author="{AUTHOR}" w:date="{DATE}">'
        f'<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/>'
        f'<w:color w:val="2e75b6"/></w:rPr>'
        f'<w:t xml:space="preserve">{text}</w:t></w:r></w:ins></w:p>\n'
    )

def body(text, indent=400):
    pi, ri = nid(), nid()
    return (
        f'<w:p><w:pPr><w:spacing w:before="0" w:after="80"/>'
        f'<w:ind w:left="{indent}"/>'
        f'<w:rPr><w:ins w:id="{pi}" w:author="{AUTHOR}" w:date="{DATE}"/></w:rPr></w:pPr>'
        f'<w:ins w:id="{ri}" w:author="{AUTHOR}" w:date="{DATE}">'
        f'<w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
        f'<w:t xml:space="preserve">{text}</w:t></w:r></w:ins></w:p>\n'
    )

def bullet(text):
    pi, ri = nid(), nid()
    return (
        f'<w:p><w:pPr><w:spacing w:before="0" w:after="60"/>'
        f'<w:ind w:left="600" w:hanging="200"/>'
        f'<w:rPr><w:ins w:id="{pi}" w:author="{AUTHOR}" w:date="{DATE}"/></w:rPr></w:pPr>'
        f'<w:ins w:id="{ri}" w:author="{AUTHOR}" w:date="{DATE}">'
        f'<w:r><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>'
        f'<w:t xml:space="preserve">&#x2022; {text}</w:t></w:r></w:ins></w:p>\n'
    )

def label_value(label, value):
    pi, r1, r2 = nid(), nid(), nid()
    return (
        f'<w:p><w:pPr><w:spacing w:before="0" w:after="60"/>'
        f'<w:ind w:left="600"/>'
        f'<w:rPr><w:ins w:id="{pi}" w:author="{AUTHOR}" w:date="{DATE}"/></w:rPr></w:pPr>'
        f'<w:ins w:id="{r1}" w:author="{AUTHOR}" w:date="{DATE}">'
        f'<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>'
        f'<w:t xml:space="preserve">{label}:  </w:t></w:r></w:ins>'
        f'<w:ins w:id="{r2}" w:author="{AUTHOR}" w:date="{DATE}">'
        f'<w:r><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>'
        f'<w:t xml:space="preserve">{value}</w:t></w:r></w:ins></w:p>\n'
    )

# ============================================================
# SECTION 54 — Phase 3 Programme Definition Document
# ============================================================
S54 = ""

# ── Heading ─────────────────────────────────────────────────
S54 += heading1("Section 54 — Phase 3 Programme Definition Document")

# ── 54.1 Overview & Scope ───────────────────────────────────
S54 += heading2("54.1 Overview & Scope")
S54 += body(
    "This section constitutes the Phase 3 Programme Definition Document (PDD) for the MONOLITH "
    "DAPH Decor AI Agent Programme. Phase 3 is triggered upon SC approval of the Phase 3 "
    "Readiness Gate (GL-CHK-10) and is designed to elevate agent coverage from 80% to 92% by "
    "addressing the seven remaining GAPs: GAP-01 (Biophilic Design Enhancement), GAP-02 "
    "(Design Freeze Gate AI), GAP-03 (Sensory Commissioning Full Automation), GAP-04 "
    "(Post-Occupancy Evaluation AI), GAP-13 (Client Experience Intelligence Platform), "
    "GAP-14 (Sustainable Materials & Procurement Intelligence), and GAP-15 (Continuous "
    "Learning & Model Governance Engine). The total approved budget is THB 7.0M across four "
    "milestones spanning Q3 2033 to Q2 2034."
)
S54 += label_value("PDD reference", "MONOLITH-S54-P3PDD-001 v1.0")
S54 += label_value("Trigger event", "GL-CHK-10 COMPLETE — SC approval of Phase 3 PDD, Phase 2 BAU confirmed")
S54 += label_value("Programme scope", "7 GAPs: GAP-01/02/03/04/13/14/15 — coverage 80% → 92%")
S54 += label_value("Total budget", "THB 7.0M (excluding Phase 1 THB 5.2M and Phase 2 THB 6.0M)")
S54 += label_value("Programme owner", "Phase 3 Programme Director (to be appointed at P3-M1)")
S54 += label_value("SC reference", "SC-2033-P3 (Steering Committee Resolution — Phase 3 Approval)")
S54 += label_value("Target completion", "P3-M4 — Q2 2034 (coverage 92%, full MONOLITH BAU)")
S54 += label_value("PDD status", "Locked — pending GL-CHK-10 trigger")

# ── 54.2 Phase 3 Programme Structure ────────────────────────
S54 += heading2("54.2 Phase 3 Programme Structure & GAP Inventory")
S54 += body(
    "Phase 3 is structured around three workstreams. Workstream A covers GAP-01 and GAP-02, "
    "delivering AI-enhanced biophilic design automation and intelligent design freeze gate "
    "management. Workstream B covers GAP-03 and GAP-04, completing full sensory commissioning "
    "automation and integrating AI-driven post-occupancy evaluation analytics. Workstream C "
    "delivers three new capability platforms: GAP-13 (Client Experience Intelligence), "
    "GAP-14 (Sustainable Materials & Procurement Intelligence), and GAP-15 (Continuous "
    "Learning & Model Governance Engine). All workstreams integrate with the Phase 2 AIE "
    "backbone (AIE-001–005)."
)
S54 += body("Phase 3 GAP Summary:")
S54 += label_value("GAP-01", "Biophilic Design Enhancement — Level 2 AI automation; integrates with AIE-001 (Aria Creative Engine); Phase 1 baseline complete")
S54 += label_value("GAP-02", "Design Freeze Gate AI — Intelligent milestone locking and change-control enforcement; integrates with AIE-002 (Core API Gateway)")
S54 += label_value("GAP-03", "Sensory Commissioning Full Automation — End-to-end sensor calibration and sign-off via AI; integrates with AIE-003 (Signal Hub)")
S54 += label_value("GAP-04", "Post-Occupancy Evaluation AI — Longitudinal client satisfaction analytics; integrates with AIE-004 (Nova Analytics)")
S54 += label_value("GAP-13", "Client Experience Intelligence Platform — Real-time CX scoring, sentiment analysis, and feedback loops across all agent touchpoints")
S54 += label_value("GAP-14", "Sustainable Materials & Procurement Intelligence — AI-assisted sustainable sourcing, supplier ESG scoring, and procurement optimisation")
S54 += label_value("GAP-15", "Continuous Learning & Model Governance Engine — Automated model retraining pipelines, drift detection, version control, and SC-auditable governance logs")
S54 += body("Workstream mapping:")
S54 += bullet("Workstream A (GAP-01/02): Lead — Aria; Technical co-lead — Core; Timeline — P3-M1 to P3-M3")
S54 += bullet("Workstream B (GAP-03/04): Lead — Signal; Technical co-lead — Nova; Timeline — P3-M1 to P3-M3")
S54 += bullet("Workstream C (GAP-13/14/15): Lead — Nexus; Technical co-lead — Guardian, Ledger; Timeline — P3-M2 to P3-M4")
S54 += bullet("Integration & Governance: Lead — Programme Director; Quality — Vega; Compliance — Rex; Timeline — continuous P3-M1 to P3-M4")

# ── 54.3 GAP Workplan ────────────────────────────────────────
S54 += heading2("54.3 GAP Workplan (GAP-01/02/03/04/13/14/15)")
S54 += body("The following workplan defines deliverables, integration points, and acceptance criteria for each Phase 3 GAP.")
S54 += body("GAP-01 — Biophilic Design Enhancement:")
S54 += bullet("Phase 1 baseline: SOP framework and manual workflows complete (S39)")
S54 += bullet("Phase 3 deliverable: AI model for biophilic element detection, scoring, and recommendation (Level 2 automation)")
S54 += bullet("Integration: AIE-001 Aria Creative Engine API — receive design brief, return biophilic compliance score and recommendations")
S54 += bullet("Acceptance criteria: Biophilic compliance score accuracy ≥90% against expert benchmark; latency ≤3s per analysis")
S54 += bullet("Budget: THB 1.2M | Timeline: P3-M1 to P3-M3 | Lead: Aria")
S54 += body("GAP-02 — Design Freeze Gate AI:")
S54 += bullet("Phase 1 baseline: Manual design freeze gate protocol complete (S40)")
S54 += bullet("Phase 3 deliverable: Automated design freeze gate with AI-driven change-impact assessment and SC escalation routing")
S54 += bullet("Integration: AIE-002 Core API Gateway — trigger gate events, generate change impact reports")
S54 += bullet("Acceptance criteria: Gate decision accuracy ≥95%; false escalation rate ≤2%; SC notification latency ≤5 min")
S54 += bullet("Budget: THB 0.8M | Timeline: P3-M1 to P3-M2 | Lead: Core / Aria")
S54 += body("GAP-03 — Sensory Commissioning Full Automation:")
S54 += bullet("Phase 1 baseline: Sensory commissioning protocol and manual sign-off (S41)")
S54 += bullet("Phase 3 deliverable: Full end-to-end IoT sensor calibration automation with AI-based anomaly detection and sign-off")
S54 += bullet("Integration: AIE-003 Signal Hub — sensor data ingestion, real-time calibration commands, automated sign-off certificates")
S54 += bullet("Acceptance criteria: Automated sign-off accuracy ≥97%; sensor anomaly detection recall ≥92%; manual override rate ≤3%")
S54 += bullet("Budget: THB 1.0M | Timeline: P3-M1 to P3-M3 | Lead: Signal")
S54 += body("GAP-04 — Post-Occupancy Evaluation AI:")
S54 += bullet("Phase 1 baseline: POE framework and survey methodology complete (S42)")
S54 += bullet("Phase 3 deliverable: Longitudinal AI analytics for occupant satisfaction, space utilisation, and wellbeing scoring")
S54 += bullet("Integration: AIE-004 Nova Analytics — consume occupancy data streams, generate quarterly POE dashboards")
S54 += bullet("Acceptance criteria: POE dashboard completeness ≥95%; predictive satisfaction accuracy ≥85%; report generation ≤24h post-period")
S54 += bullet("Budget: THB 0.7M | Timeline: P3-M1 to P3-M3 | Lead: Nova")
S54 += body("GAP-13 — Client Experience Intelligence Platform:")
S54 += bullet("New Phase 3 capability: Real-time CX scoring across all 28 agent touchpoints")
S54 += bullet("Deliverable: CX Intelligence Dashboard; NPS prediction model; automated client satisfaction alerts to Ops and Signal")
S54 += bullet("Integration: AIE-001–005 all endpoints — aggregate interaction logs; emit CX events to Signal Hub (AIE-003)")
S54 += bullet("Acceptance criteria: CX score refresh ≤5 min; NPS prediction accuracy ≥80%; integration coverage 28/28 agents")
S54 += bullet("Budget: THB 0.9M | Timeline: P3-M2 to P3-M4 | Lead: Nexus")
S54 += body("GAP-14 — Sustainable Materials & Procurement Intelligence:")
S54 += bullet("New Phase 3 capability: AI-assisted sustainable sourcing engine with ESG supplier scoring")
S54 += bullet("Deliverable: Supplier ESG Scorecard; carbon-footprint estimator per project; procurement recommendation engine")
S54 += bullet("Integration: Ledger (procurement data), Guardian (compliance checks), AIE-002 Core API for procurement approvals")
S54 += bullet("Acceptance criteria: Supplier ESG scoring coverage ≥80% of active suppliers; carbon estimate accuracy within ±10%; recommendation adoption rate ≥60%")
S54 += bullet("Budget: THB 0.8M | Timeline: P3-M2 to P3-M4 | Lead: Ledger / Guardian")
S54 += body("GAP-15 — Continuous Learning & Model Governance Engine:")
S54 += bullet("New Phase 3 capability: Automated model retraining, drift detection, and SC-auditable AI governance")
S54 += bullet("Deliverable: Model Registry (all 28 agents); Drift Alert System (latency ≤1h); Governance Audit Log (SC-accessible)")
S54 += bullet("Integration: All AIE-001–005 model endpoints; Vega (audit); Rex (compliance); SC reporting dashboard")
S54 += bullet("Acceptance criteria: Model drift alert latency ≤1h; retraining pipeline success rate ≥95%; audit log completeness 100%")
S54 += bullet("Budget: THB 0.7M | Timeline: P3-M2 to P3-M4 | Lead: Vega / Nexus")

# ── 54.4 Budget Allocation ──────────────────────────────────
S54 += heading2("54.4 Phase 3 Budget Allocation — THB 7.0M")
S54 += body(
    "The total Phase 3 budget of THB 7.0M is SC-approved subject to GL-CHK-10 confirmation. "
    "Budget is allocated across the seven GAPs plus a 15% contingency reserve. All expenditure "
    "is subject to Steering Committee quarterly review and Ledger agent tracking."
)
S54 += label_value("GAP-01 — Biophilic Design Enhancement", "THB 1.2M")
S54 += label_value("GAP-02 — Design Freeze Gate AI", "THB 0.8M")
S54 += label_value("GAP-03 — Sensory Commissioning Full Automation", "THB 1.0M")
S54 += label_value("GAP-04 — Post-Occupancy Evaluation AI", "THB 0.7M")
S54 += label_value("GAP-13 — Client Experience Intelligence Platform", "THB 0.9M")
S54 += label_value("GAP-14 — Sustainable Materials & Procurement Intelligence", "THB 0.8M")
S54 += label_value("GAP-15 — Continuous Learning & Model Governance Engine", "THB 0.7M")
S54 += label_value("Contingency Reserve (15%)", "THB 0.9M")
S54 += label_value("Total Phase 3 Budget", "THB 7.0M")
S54 += body("Budget governance:")
S54 += bullet("All GAP budgets are fixed-price envelopes; overrun requires SC Change Request (CR-P3-XXX)")
S54 += bullet("Contingency release requires Programme Director authorisation up to THB 0.3M; SC approval above THB 0.3M")
S54 += bullet("Ledger agent tracks all Phase 3 expenditure in real-time; monthly budget burn report to SC")
S54 += bullet("Phase 3 total programme investment across all phases: Phase 1 THB 5.2M + Phase 2 THB 6.0M + Phase 3 THB 7.0M = THB 18.2M")

# ── 54.5 Milestones P3-M1–M4 ───────────────────────────────
S54 += heading2("54.5 Phase 3 Milestones P3-M1–M4")
S54 += body(
    "Phase 3 delivery is structured across four milestones from Q3 2033 to Q2 2034. Each "
    "milestone has defined deliverables, gate criteria, and a formal SC review checkpoint."
)
S54 += label_value("P3-M1 — Q3 2033", "Phase 3 Kick-off & Foundation")
S54 += bullet("P3-CHK-01 and P3-CHK-02 complete: GL-CHK-10 confirmed, Programme Director appointed, budget THB 7.0M released")
S54 += bullet("Workstream A and Workstream B teams fully onboarded (GAP-01/02/03/04 vendors contracted)")
S54 += bullet("Phase 3 development environments provisioned across all workstreams")
S54 += bullet("GAP-01/02 Level 2 AI model design specifications approved by SC")
S54 += bullet("GAP-13/14/15 vendor RFP issued (if external sourcing required)")
S54 += bullet("SC P3-M1 Review: Go/No-Go for Workstream C vendor selection")
S54 += label_value("P3-M2 — Q4 2033", "Core Development & SIT")
S54 += bullet("GAP-01 AI model v1.0 SIT complete: biophilic compliance score ≥90%")
S54 += bullet("GAP-02 Design Freeze Gate AI SIT complete: gate decision accuracy ≥95%")
S54 += bullet("GAP-03 Sensory Commissioning automation SIT complete: anomaly detection recall ≥92%")
S54 += bullet("GAP-04 POE AI analytics SIT complete: dashboard completeness ≥95%")
S54 += bullet("GAP-13/14/15 Workstream C development commenced (vendors contracted by P3-M2)")
S54 += bullet("SC P3-M2 Review: Workstream A+B SIT sign-off; Workstream C development checkpoint")
S54 += label_value("P3-M3 — Q1 2034", "UAT & Phase 3 Integration")
S54 += bullet("GAP-01/02/03/04 UAT complete with client stakeholders: all acceptance criteria met")
S54 += bullet("GAP-13 CX Intelligence Platform integration SIT complete: 28/28 agent coverage")
S54 += bullet("GAP-14 Sustainable Procurement Intelligence SIT complete: ESG scoring coverage ≥80%")
S54 += bullet("GAP-15 Model Governance Engine SIT complete: drift alert latency ≤1h")
S54 += bullet("End-to-end Phase 3 integration test with AIE-001–005 backbone complete")
S54 += bullet("P3-CHK-11 Phase 3 go-live readiness gate: all P3-CHK-01–10 confirmed")
S54 += bullet("SC P3-M3 Review: Phase 3 go-live authorisation (P3-CHK-12)")
S54 += label_value("P3-M4 — Q2 2034", "Phase 3 Go-Live & MONOLITH BAU")
S54 += bullet("Phase 3 cutover executed: all 7 GAPs live in production")
S54 += bullet("Coverage confirmed at 92%: 28 agents operating across full MONOLITH capability stack")
S54 += bullet("GAP-15 Model Governance Engine operational: continuous learning cycle active for all agents")
S54 += bullet("MONOLITH programme BAU: all phases (1/2/3) complete, ongoing operations under BAU governance")
S54 += bullet("SC P3-M4 Review: Programme completion sign-off; MONOLITH DAPH Decor AI Agent Programme declared COMPLETE")
S54 += bullet("Final programme report submitted to SC: THB 18.2M total investment, 92% coverage, 28 agents fully operational")

# ── 54.6 Phase 3 Readiness Checklist (P3-CHK-01–12) ────────
S54 += heading2("54.6 Phase 3 Readiness Checklist (P3-CHK-01–12)")
S54 += body(
    "The P3-CHK checklist constitutes the living document MONOLITH-S54-P3PDD-001 v1.0. "
    "All items must be verified and signed off before Phase 3 proceeds to the subsequent milestone. "
    "P3-CHK-01 through P3-CHK-03 are gate conditions for P3-M1 kick-off. "
    "P3-CHK-11 and P3-CHK-12 are gate conditions for Phase 3 go-live."
)
S54 += label_value("P3-CHK-01", "GL-CHK-10 SC approval confirmed: Phase 3 PDD formally approved by Steering Committee")
S54 += label_value("P3-CHK-02", "Phase 3 Programme Director appointed and THB 7.0M budget released by Finance")
S54 += label_value("P3-CHK-03", "Phase 3 development and test environments provisioned and validated by Technical Lead")
S54 += label_value("P3-CHK-04", "GAP-01/02 vendor/team contracts signed; Workstream A kickoff complete")
S54 += label_value("P3-CHK-05", "GAP-03/04 vendor/team contracts signed; Workstream B kickoff complete")
S54 += label_value("P3-CHK-06", "GAP-13/14/15 vendor selection complete; Workstream C contracts signed")
S54 += label_value("P3-CHK-07", "GAP-01/02/03/04 SIT complete: all acceptance criteria met (P3-M2 gate)")
S54 += label_value("P3-CHK-08", "GAP-13/14/15 SIT complete: all acceptance criteria met (P3-M3 gate)")
S54 += label_value("P3-CHK-09", "Phase 3 end-to-end integration test with AIE-001–005 backbone: PASS")
S54 += label_value("P3-CHK-10", "Phase 3 UAT complete with client stakeholders: all 7 GAPs accepted")
S54 += label_value("P3-CHK-11", "Phase 3 go-live readiness gate confirmed: P3-CHK-01–10 all COMPLETE, Programme Director sign-off")
S54 += label_value("P3-CHK-12", "SC Phase 3 go-live authorisation: Steering Committee formal approval of Phase 3 production deployment")
S54 += body(
    "Upon P3-CHK-12 completion the MONOLITH DAPH Decor AI Agent Programme enters full BAU "
    "operations at 92% agent coverage. The programme governance transitions from SC oversight "
    "to standing BAU governance committee with quarterly performance reviews led by Vega "
    "(audit), Rex (compliance), and Signal (operations monitoring)."
)
S54 += label_value("Living document owner", "Phase 3 Programme Director")
S54 += label_value("Review cadence", "Monthly during active Phase 3; quarterly post-BAU")
S54 += label_value("Escalation", "Programme Director → SC Chair (for P3-CHK-11 and P3-CHK-12 only)")

# ============================================================
# INJECT
# ============================================================
INJECT_MARKER = '</w:body>'
assert INJECT_MARKER in xml, "Injection marker not found!"

# Report injection point
print(f"Injection point: {INJECT_MARKER}")

new_xml = xml.replace(INJECT_MARKER, S54 + INJECT_MARKER, 1)

# Write back
TMP = SRC + '.tmp_s54'
with zipfile.ZipFile(SRC, 'r') as z_in, zipfile.ZipFile(TMP, 'w', zipfile.ZIP_DEFLATED) as z_out:
    for item in z_in.infolist():
        if item.filename == 'word/document.xml':
            z_out.writestr(item, new_xml.encode('utf-8'))
        else:
            z_out.writestr(item, z_in.read(item.filename))

shutil.copy(TMP, DST)
os.remove(TMP)

# ── Verification ─────────────────────────────────────────────
with zipfile.ZipFile(DST, 'r') as z:
    vxml = z.read('word/document.xml').decode('utf-8')

import re as re2
ins_count = len(re2.findall(r'<w:ins[ >]', vxml))
max_id    = max(int(x) for x in re2.findall(r'w:id="(\d+)"', vxml))
iH        = len(re2.findall(r'w:insideH', vxml))
iV        = len(re2.findall(r'w:insideV', vxml))
fsize     = os.path.getsize(DST)

print(f"\n=== INJECTION RESULTS ===")
print(f"w:ins tracked insertions: {ins_count}")
print(f"Max ID used: {max_id}")
print(f"w:insideH intact: {iH}")
print(f"w:insideV intact: {iV}")
print(f"S54 (Phase 3 PDD) present: {'Phase 3 Programme Definition Document' in vxml}")
print(f"S53 (Go-Live Operations Plan) intact: {'Go-Live Operations Plan' in vxml}")
print(f"P3-CHK-12 present: {'P3-CHK-12' in vxml}")
print(f"THB 7.0M present: {'THB 7.0M' in vxml}")
print(f"P3-M4 present: {'P3-M4' in vxml}")
print(f"File size: {fsize:,} bytes")
print(f"IDs used: 2258 – {max_id} (total {max_id - 2258 + 1} IDs allocated)")
