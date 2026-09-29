"""
inject_s51.py
Inject Section S51 into monolith_project_summary_v25_accepted.docx
S51: Phase 2 Procurement & Vendor Selection Framework — GAP-05 AI Creative Engine
    51.1 Overview & Scope
    51.2 Procurement Strategy
    51.3 Vendor Evaluation Criteria
    51.4 RFP Framework (RFP-GAP05-001)
    51.5 Selection Process (5 stages)
    51.6 Contract Management & SLA KPIs
    51.7 Phase 2 Procurement Readiness Checklist (P2-CHK-01–08)
IDs start at 1527 (continuing from inject_s50.py which used 1257–1526)
"""
import zipfile, re, shutil, os

SRC = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
DST = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
BAK = '/home/sandbox/monolith_project_summary_v25_accepted_pre_s51_backup.docx'

shutil.copy(SRC, BAK)
print(f'Backup: {BAK}')

with zipfile.ZipFile(SRC, 'r') as z:
    xml = z.read('word/document.xml').decode('utf-8')
    all_files = {name: z.read(name) for name in z.namelist()}

_id = 1527

def nid():
    global _id
    v = _id
    _id += 1
    return v

AUTHOR = "Scispace Agent"
DATE   = "2026-09-03T00:00:00Z"

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
# SECTION 51 — Phase 2 Procurement & Vendor Selection Framework
#              GAP-05: AI Creative Engine
# ============================================================
S51 = ""
S51 += heading1("Section 51 — Phase 2 Procurement & Vendor Selection Framework (GAP-05 AI Creative Engine)")
S51 += body(
    "Section 51 establishes the procurement and vendor selection framework for GAP-05 "
    "(AI Creative Engine), the highest-budget item in Phase 2 at THB 1.5M. This section "
    "defines the competitive tender process, evaluation criteria, RFP structure, five-stage "
    "selection methodology, contract management requirements, and Phase 2 procurement "
    "readiness checklist. All procurement activities are authorised under SC Resolution "
    "SC-2032-XX and governed by the Phase 2 Programme Definition Document (S50)."
)

# 51.1 ─────────────────────────────────────────────────────
S51 += heading2("51.1  ภาพรวมและขอบเขต (Overview & Scope)")
S51 += body(
    "ส่วนที่ 51.1 กำหนดขอบเขตการจัดซื้อจัดจ้างสำหรับ GAP-05 AI Creative Engine ซึ่งประกอบด้วย "
    "5 Module ได้แก่ AIE-001 (Concept Generation), AIE-002 (Style Transfer), AIE-003 "
    "(Asset Rendering), AIE-004 (Quality Assurance), และ AIE-005 (Integration Gateway) "
    "การจัดซื้อนี้เป็นส่วนหนึ่งของ Phase 2 Programme ที่มีเป้าหมายเพิ่ม SOP Coverage จาก 68% เป็น 80%"
)
S51 += label_value("Section", "S51 (Phase 2 Procurement Framework — GAP-05)")
S51 += label_value("Authorisation", "SC Resolution SC-2032-XX; Phase 2 PDD S50.2")
S51 += label_value("Scope", "GAP-05 AI Creative Engine — 5 modules: AIE-001, AIE-002, AIE-003, AIE-004, AIE-005")
S51 += label_value("Budget", "THB 1.5M (Phase 2 allocation; contingency covered by Phase 2 THB 0.6M reserve)")
S51 += label_value("Lead agent", "Aria (Group A, SLA ≥95%) — Creative Engine owner")
S51 += label_value("Supporting agents", "Nova (Group A, ≥95%) — AI model QA; Signal (Group A, ≥95%) — integration; Atlas (Group C, ≥94%) — spatial context")
S51 += label_value("Timeline", "P2-M1 kickoff (Q1 2033) → P2-M2 vendor award (Q2 2033) → P2-M3 UAT (Q3 2033)")
S51 += label_value("SOP section created", "S51 (this Procurement Framework); implementation SOP to follow in S52+")
S51 += label_value("Reference", "inject_s51.py · SC-2032-XX · AMD-004 WS-A (Aria delivery baseline)")

# 51.2 ─────────────────────────────────────────────────────
S51 += heading2("51.2  กลยุทธ์การจัดซื้อ (Procurement Strategy)")
S51 += body(
    "กลยุทธ์การจัดซื้อสำหรับ GAP-05 ใช้วิธี Restricted Tender เนื่องจากมูลค่าสัญญา THB 1.5M "
    "อยู่ในเกณฑ์ที่กำหนด กระบวนการจัดซื้อต้องได้รับการอนุมัติจาก SC ก่อนออก RFP และต้องมีผู้เสนอราคา "
    "ที่มีคุณสมบัติครบถ้วนอย่างน้อย 3 ราย"
)
S51 += label_value("Procurement method", "Restricted Tender (value THB 1.5M; ≥3 qualified vendors required)")
S51 += label_value("Tender reference", "RFP-GAP05-001")
S51 += label_value("Approval authority", "Phase 2 Programme Director + SC Chair (SC-2032-XX mandate)")
S51 += label_value("Market approach", "Pre-qualification questionnaire (PQQ) issued to AI/ML vendor longlist")
S51 += label_value("Procurement phases",
    "Phase A — PQQ & longlist (P2-M1, 2 weeks); "
    "Phase B — RFP issue & response (P2-M1+2w to P2-M1+6w); "
    "Phase C — Evaluation & shortlist (P2-M1+7w to P2-M1+9w); "
    "Phase D — Demo & BAFO (P2-M1+10w to P2-M1+12w); "
    "Phase E — Award & contract (P2-M2, week 13–16)")
S51 += label_value("Vendor longlist target", "Minimum 5 vendors; AI generative design, interior design vertical preferred")
S51 += label_value("Module packaging",
    "Single-vendor award preferred (AIE-001–005 integrated); "
    "split award permitted for AIE-003 (rendering) if integration SLA met")
S51 += label_value("Exclusions",
    "Vendors with conflict of interest with MONOLITH DAPH clients; "
    "vendors unable to demonstrate 99.5% uptime SLA; "
    "vendors without ISO/IEC 27001 data security certification")
S51 += bullet("AIE-001 Concept Generation: generative AI design concept creation from brief input")
S51 += bullet("AIE-002 Style Transfer: automated style application across design deliverables")
S51 += bullet("AIE-003 Asset Rendering: high-fidelity 3D render generation pipeline")
S51 += bullet("AIE-004 Quality Assurance: automated AI output validation and scoring")
S51 += bullet("AIE-005 Integration Gateway: API connector to Supabase, Atlas spatial, Signal event bus")

# 51.3 ─────────────────────────────────────────────────────
S51 += heading2("51.3  เกณฑ์การประเมินผู้ขาย (Vendor Evaluation Criteria)")
S51 += body(
    "เกณฑ์การประเมินผู้ขายแบ่งเป็น 4 หมวด โดยคะแนนรวม 100 คะแนน ผู้ขายต้องผ่านคะแนนขั้นต่ำ "
    "70/100 เพื่อผ่านเข้าสู่รอบ Demo และ Best and Final Offer (BAFO)"
)
S51 += label_value("Minimum passing score", "70 / 100 (technical + commercial combined)")
S51 += label_value("Criterion A — Technical capability (40 pts)",
    "AI model performance benchmarks (15 pts); "
    "integration compatibility with Supabase + event bus (10 pts); "
    "security & data governance (ISO 27001) (8 pts); "
    "scalability & API throughput ≥500 req/min (7 pts)")
S51 += label_value("Criterion B — Commercial (20 pts)",
    "Total cost of ownership within THB 1.5M (10 pts); "
    "payment milestone alignment (5 pts); "
    "pricing transparency & no hidden costs (5 pts)")
S51 += label_value("Criterion C — Operational readiness (25 pts)",
    "SLA uptime guarantee ≥99.5% (10 pts); "
    "response time ≤200ms (P95) (8 pts); "
    "AI model accuracy ≥85% on DAPH test dataset (7 pts)")
S51 += label_value("Criterion D — Track record & references (15 pts)",
    "Interior design / creative industry deployments (8 pts); "
    "client references ≥2 live implementations (4 pts); "
    "team qualifications & Thai language support (3 pts)")
S51 += label_value("Disqualification criteria",
    "Score <40/70 on technical criteria; "
    "failure to provide proof of concept on AIE-001; "
    "commercial bid exceeds THB 1.5M ceiling; "
    "unable to meet P2-M3 UAT target date")
S51 += label_value("Evaluation panel",
    "Aria (chair, technical lead); Nova (AI QA assessor); "
    "Signal (integration assessor); Core (governance); Ledger (commercial/finance)")
S51 += label_value("Conflict of interest", "Panel members must declare and recuse per SC governance rules (S43)")

# 51.4 ─────────────────────────────────────────────────────
S51 += heading2("51.4  กรอบ RFP (RFP Framework — RFP-GAP05-001)")
S51 += body(
    "เอกสาร RFP-GAP05-001 คือชุดเอกสารประกวดราคาหลักสำหรับ GAP-05 AI Creative Engine "
    "ประกอบด้วย 3 ส่วนหลัก: Technical Proposal, Proof of Concept (PoC), และ Commercial Proposal "
    "ผู้ขายต้องส่งเอกสารครบทั้ง 3 ส่วนภายในกำหนดเวลาที่ระบุ"
)
S51 += label_value("Document reference", "RFP-GAP05-001")
S51 += label_value("Issue date", "P2-M1 + 2 weeks (target Q1 2033 week 3)")
S51 += label_value("Submission deadline", "P2-M1 + 6 weeks (4-week response window)")
S51 += label_value("Clarification window", "P2-M1 + 2w to P2-M1 + 4w (Q&A period; responses published to all bidders)")
S51 += label_value("Technical Proposal requirements",
    "AI model architecture description; benchmark results on standard datasets; "
    "AIE-001–005 module delivery plan; security & compliance certifications; "
    "team CV and experience; proposed SLA commitments")
S51 += label_value("Proof of Concept (PoC) requirements",
    "Live demonstration of AIE-001 Concept Generation on DAPH sample brief; "
    "AIE-002 style transfer on 3 reference interior design images; "
    "API response time log (minimum 50 requests, P95 ≤200ms); "
    "PoC acceptance criteria: AI output scored ≥3.5/5 by Aria panel")
S51 += label_value("Commercial Proposal requirements",
    "Itemised pricing per module AIE-001–005; "
    "milestone payment schedule (30/40/30 split); "
    "ongoing maintenance and support costs (Year 2+); "
    "THB pricing; VAT-inclusive total")
S51 += label_value("Submission format", "Sealed digital submission via designated SC procurement portal; PDF + native editable")
S51 += label_value("Late submissions", "Not accepted; automatic disqualification")
S51 += label_value("RFP evaluation timeline",
    "Week 1–2: administrative compliance check (Aria + Core); "
    "Week 3–4: technical scoring (Aria, Nova, Signal); "
    "Week 5: commercial scoring (Ledger); "
    "Week 6: consolidated scorecards + shortlist recommendation to Programme Director")

# 51.5 ─────────────────────────────────────────────────────
S51 += heading2("51.5  กระบวนการคัดเลือก 5 ขั้นตอน (5-Stage Selection Process)")
S51 += body(
    "กระบวนการคัดเลือกผู้ขาย GAP-05 ประกอบด้วย 5 ขั้นตอนเพื่อให้ได้ผู้ขายที่มีคุณภาพสูงสุด "
    "ในงบประมาณที่กำหนด แต่ละขั้นตอนมีเกณฑ์ Pass/Fail หรือ Minimum Score ที่ชัดเจน"
)
S51 += label_value("Stage 1 — Administrative Screening",
    "Mandatory pass/fail; checklist: complete submission package, valid entity registration, "
    "ISO/IEC 27001 certificate, no conflict of interest declaration, signed non-disclosure agreement; "
    "Timeline: P2-M1+6w to P2-M1+7w; Outcome: qualified / disqualified")
S51 += label_value("Stage 2 — Technical Evaluation",
    "Scoring against Criteria A + C + D (maximum 80 pts combined); "
    "minimum score to advance: 56/80 (70%); "
    "conducted by evaluation panel with independent moderation; "
    "Timeline: P2-M1+7w to P2-M1+9w")
S51 += label_value("Stage 3 — Shortlist Demonstration",
    "Maximum 2 vendors shortlisted; live PoC demonstration to full evaluation panel + Programme Director; "
    "PoC scored by Aria-led panel (3.5/5 minimum acceptance); "
    "Vendor Q&A session (30 min per vendor); "
    "Timeline: P2-M1+10w (2-day vendor demo event)")
S51 += label_value("Stage 4 — Best and Final Offer (BAFO)",
    "Shortlisted vendors submit revised commercial proposal; "
    "clarification of SLA commitments; "
    "negotiation window: 5 business days; "
    "final consolidated scorecard: Technical (70%) + Commercial (30%) weighted; "
    "Timeline: P2-M1+11w to P2-M1+12w")
S51 += label_value("Stage 5 — SC Endorsement & Award",
    "Programme Director recommendation report to SC; "
    "SC endorsement required (SC-2032-XX mandate); "
    "contract award letter issued within 5 business days of SC endorsement; "
    "contract execution: P2-M2 target; "
    "Timeline: P2-M2 (Q2 2033)")
S51 += label_value("Award criteria", "Highest combined score (technical 70% + commercial 30%), subject to PoC acceptance")
S51 += label_value("Tie-break", "Aria panel qualitative assessment of vendor AI model roadmap and long-term partnership fit")
S51 += label_value("No-award clause",
    "If no vendor achieves minimum 70/100, RFP may be re-issued with revised scope; "
    "Programme Director reports to SC within 10 business days")

# 51.6 ─────────────────────────────────────────────────────
S51 += heading2("51.6  การบริหารสัญญาและ SLA KPI (Contract Management & SLA KPIs)")
S51 += body(
    "สัญญา GAP-05 AI Creative Engine เป็น Time-and-Materials Contract พร้อม Milestone Payments "
    "กำหนด SLA KPI ที่ชัดเจนเพื่อให้ Aria และทีมสามารถกำกับดูแลผู้ขายได้ตลอดช่วงสัญญา "
    "และมีบทปรับในกรณีที่ผู้ขายไม่ปฏิบัติตามเงื่อนไข"
)
S51 += label_value("Contract type", "Time-and-Materials with fixed milestone deliverables and SLA KPIs")
S51 += label_value("Contract value", "THB 1.5M (ceiling price; variations require Programme Director approval)")
S51 += label_value("Payment schedule",
    "30% on contract award (P2-M2); "
    "40% on UAT acceptance (P2-M3); "
    "30% on go-live and Phase 2 milestone sign-off (P2-M4)")
S51 += label_value("Contract duration", "6 months delivery + 12 months warranty/support from go-live")
S51 += label_value("SLA KPI — Uptime", "≥99.5% monthly uptime for AIE-001–005 services")
S51 += label_value("SLA KPI — Response time", "P95 ≤200ms for API calls; P99 ≤500ms")
S51 += label_value("SLA KPI — AI model accuracy", "≥85% on DAPH production dataset (monthly benchmark by Nova)")
S51 += label_value("SLA KPI — Error rate", "≤0.5% failed AI generation requests per 10,000 calls")
S51 += label_value("SLA KPI — Security", "Zero critical vulnerabilities (CVSS ≥7.0) in quarterly pen-test")
S51 += label_value("Penalty — Uptime breach",
    "0.5% of monthly contract value per 0.1% below 99.5% threshold; "
    "cap at 5% per month; 3 consecutive months breach triggers termination review")
S51 += label_value("Penalty — Delay beyond P2-M3",
    "0.5% of contract value per week delay; "
    "cap at 10%; delay >8 weeks triggers SC notification and contract review")
S51 += label_value("Governance — Contract manager", "Aria (primary); Core (governance oversight); Ledger (financial monitoring)")
S51 += label_value("Reporting cycle",
    "Monthly vendor SLA report to Aria; "
    "quarterly review to Programme Director; "
    "milestone gate reviews at P2-M2, P2-M3, P2-M4")
S51 += label_value("Change management",
    "Scope changes >THB 50,000 require Programme Director approval; "
    ">THB 200,000 require SC approval; "
    "change requests documented in src/gap05/change-log/")
S51 += label_value("Termination for convenience", "30 days written notice; pro-rata payment for work completed")
S51 += label_value("Intellectual property",
    "All AI models, training data derivatives, and integration code developed under contract "
    "are MONOLITH DAPH property; vendor retains pre-existing IP; "
    "joint IP to be agreed in Schedule C of contract")
S51 += label_value("Data governance",
    "All DAPH client design data processed by AI engine governed by Data Processing Agreement (DPA); "
    "vendor must not use DAPH data for model training without explicit consent; "
    "data residency: Thailand or Singapore only")

# 51.7 ─────────────────────────────────────────────────────
S51 += heading2("51.7  รายการตรวจสอบความพร้อมการจัดซื้อ Phase 2 (Procurement Readiness Checklist)")
S51 += body(
    "รายการตรวจสอบ P2-CHK-01 ถึง P2-CHK-08 ต้องได้รับการยืนยันจาก Programme Director และ "
    "Aria ก่อนออก RFP-GAP05-001 รายการทุกข้อต้องมีสถานะ COMPLETE ก่อนเริ่ม Phase B ของกระบวนการจัดซื้อ"
)
S51 += bullet("P2-CHK-01: SC-2032-XX mandate verified and countersigned by SC Chair + Programme Director")
S51 += bullet("P2-CHK-02: Phase 2 budget THB 1.5M for GAP-05 confirmed in Phase 2 allocation (S50.4)")
S51 += bullet("P2-CHK-03: AIE-001–005 technical specifications finalised and approved by Aria + Nova")
S51 += bullet("P2-CHK-04: RFP-GAP05-001 document reviewed by Core (governance) and Ledger (finance)")
S51 += bullet("P2-CHK-05: Evaluation panel constituted — Aria (chair), Nova, Signal, Core, Ledger — conflicts declared")
S51 += bullet("P2-CHK-06: Legal review of contract template and DPA complete (external legal counsel)")
S51 += bullet("P2-CHK-07: Vendor longlist ≥5 candidates identified and pre-qualified by Aria")
S51 += bullet("P2-CHK-08: UAT acceptance criteria for AIE-001–005 defined and approved by Aria + Programme Director")
S51 += label_value("Readiness gate authority", "Phase 2 Programme Director co-sign with Aria before RFP issue")
S51 += label_value("Target readiness date", "P2-M1 + 2 weeks (within 2 weeks of Phase 2 kickoff Q1 2033)")
S51 += label_value("Non-compliance", "Any INCOMPLETE checklist item blocks RFP issue; escalation to SC Chair")
S51 += label_value("Post-award checklist",
    "P2-CHK-09: Vendor onboarding complete (access credentials, environments); "
    "P2-CHK-10: Development environment AIE-001–005 scaffolding verified by Signal; "
    "P2-CHK-11: KPI monitoring dashboard active (Nova); "
    "P2-CHK-12: DPA countersigned and filed (Core)")

# ============================================================
# ASSEMBLE & INJECT
# ============================================================
NEW_CONTENT = S51

if '</w:body>' in xml:
    xml = xml.replace('</w:body>', NEW_CONTENT + '</w:body>', 1)
    print("Injection point: </w:body>")
else:
    raise ValueError("Cannot find </w:body> in document XML")

all_files['word/document.xml'] = xml.encode('utf-8')

with zipfile.ZipFile(DST, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
    for name, data in all_files.items():
        zout.writestr(name, data)

# Verify
with zipfile.ZipFile(DST, 'r') as z:
    vxml = z.read('word/document.xml').decode('utf-8')
    ins_tags = re.findall(r'<w:ins[ >]', vxml)
    all_ids = re.findall(r'w:id="(\d+)"', vxml)
    s51_ok = (
        'RFP-GAP05-001' in vxml and
        'P2-CHK-08' in vxml and
        'AIE-001' in vxml and
        'Section 51' in vxml and
        'Vendor Evaluation Criteria' in vxml
    )
    inside_h = len(re.findall(r'<w:insideH', vxml))
    inside_v = len(re.findall(r'<w:insideV', vxml))

print(f"\n=== INJECTION RESULTS ===")
print(f"w:ins tracked insertions: {len(ins_tags)}")
print(f"Max ID used: {max(int(x) for x in all_ids) if all_ids else 0}")
print(f"w:insideH intact: {inside_h}")
print(f"w:insideV intact: {inside_v}")
print(f"S51 (Procurement Framework) present: {s51_ok}")
print(f"File size: {os.path.getsize(DST):,} bytes")
print(f"IDs used: 1527 – {_id - 1} (total {_id - 1527} IDs allocated)")
