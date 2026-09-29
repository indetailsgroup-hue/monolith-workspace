"""
inject_s52.py
Inject Section S52 into monolith_project_summary_v25_accepted.docx
S52: Phase 2 Vendor Onboarding & Integration Protocol — GAP-05 AI Creative Engine
    52.1 Overview & Scope
    52.2 Pre-Onboarding Requirements
    52.3 System Integration Protocol (AIE-001–005)
    52.4 Testing & Acceptance Criteria
    52.5 Go-Live Protocol
    52.6 Post-Integration Support (90-day Hypercare)
    52.7 Vendor Integration Readiness Checklist (V-CHK-01–12)
IDs start at 1777 (continuing from inject_s51.py which used 1527–1776)
"""
import zipfile, re, shutil, os

SRC = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
DST = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
BAK = '/home/sandbox/monolith_project_summary_v25_accepted_pre_s52_backup.docx'

shutil.copy(SRC, BAK)
print(f'Backup: {BAK}')

with zipfile.ZipFile(SRC, 'r') as z:
    xml = z.read('word/document.xml').decode('utf-8')
    all_files = {name: z.read(name) for name in z.namelist()}

_id = 1777

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
# SECTION 52 — Phase 2 Vendor Onboarding & Integration Protocol
#              GAP-05: AI Creative Engine (AIE-001–005)
# ============================================================
S52 = ""

# ── Heading ─────────────────────────────────────────────────
S52 += heading1("Section 52 — Phase 2 Vendor Onboarding & Integration Protocol")

# ── 52.1 Overview & Scope ───────────────────────────────────
S52 += heading2("52.1 Overview & Scope")
S52 += body(
    "This section defines the end-to-end Vendor Onboarding & Integration Protocol applicable to the "
    "selected AI Creative Engine (GAP-05) vendor following award of RFP-GAP05-001. The protocol "
    "governs all onboarding activities from contract execution through to production go-live and "
    "the 90-day hypercare period, covering five AI Engine modules: AIE-001 (Concept Generator), "
    "AIE-002 (Style Harmoniser), AIE-003 (Material Specifier), AIE-004 (Mood Board Assembler), "
    "and AIE-005 (Client Presentation Renderer)."
)
S52 += label_value("Protocol reference", "MONOLITH-S52-ONB-001 v1.0")
S52 += label_value("Applicable gap", "GAP-05 — AI Creative Engine (Phase 2)")
S52 += label_value("Trigger event", "RFP-GAP05-001 contract award (target Q1 2033)")
S52 += label_value("Owner", "Phase 2 Programme Director")
S52 += label_value("Co-owners", "Signal (Technology Integration Lead), Aria (Procurement & Compliance Lead)")
S52 += label_value("Protocol status", "Active — Phase 2 Activation")
S52 += body(
    "The protocol is divided into six operational phases: (1) Pre-Onboarding Requirements, "
    "(2) System Integration Protocol, (3) Testing & Acceptance Criteria, (4) Go-Live Protocol, "
    "(5) Post-Integration Support, and (6) Vendor Integration Readiness Checklist V-CHK-01–12. "
    "Completion of each phase gate is mandatory before progression to the next."
)

# ── 52.2 Pre-Onboarding Requirements ───────────────────────
S52 += heading2("52.2 Pre-Onboarding Requirements")
S52 += body(
    "The following pre-onboarding requirements must be completed within 10 business days of "
    "contract execution. The Phase 2 Programme Director is responsible for tracking completion "
    "against the V-CHK-01–04 readiness gates."
)
S52 += label_value("V-CHK-01 — Contract & Legal", "Executed MSA, SOW, and DPA countersigned; IP ownership schedules attached")
S52 += label_value("V-CHK-02 — NDA & Data Classification", "NDA executed; MONOLITH data classification policy briefing completed by vendor team")
S52 += label_value("V-CHK-03 — Access Provisioning", "VPN credentials, repository access, and MONOLITH sandbox environment provisioned by Signal")
S52 += label_value("V-CHK-04 — Environment Setup", "Vendor development environment verified against MONOLITH infrastructure spec v2.5; AIE-001–005 scaffolding confirmed")
S52 += body(
    "Documentation package required from vendor at pre-onboarding gate:"
)
S52 += bullet("Company registration certificate and relevant professional liability insurance")
S52 += bullet("Technical team CVs for all personnel with production system access")
S52 += bullet("Security posture declaration: ISO 27001 or equivalent certification")
S52 += bullet("Data residency confirmation: all processing within Thailand or approved jurisdictions per PDPA")
S52 += bullet("Emergency contact matrix: 24/7 escalation contacts for all AIE-001–005 module leads")
S52 += label_value("Pre-onboarding gate authority", "Aria (Procurement & Compliance Lead) must countersign before Phase Gate 1 is released")
S52 += label_value("Deadline", "10 business days post contract execution; non-compliance triggers SC escalation")

# ── 52.3 System Integration Protocol (AIE-001–005) ──────────
S52 += heading2("52.3 System Integration Protocol (AIE-001–005)")
S52 += body(
    "The system integration phase covers API endpoint registration, authentication handshake, "
    "data flow validation, and inter-module dependency mapping for all five AIE modules. "
    "Integration must follow the MONOLITH API Gateway specification v2.5 managed by Signal."
)
S52 += label_value("AIE-001 Concept Generator", "REST endpoint registration; input schema: project brief JSON + brand palette; output: concept variants array; latency SLA ≤3s p95")
S52 += label_value("AIE-002 Style Harmoniser", "GraphQL integration; input: concept variant IDs; output: style taxonomy mapping; dependency: AIE-001 output required")
S52 += label_value("AIE-003 Material Specifier", "Webhook-based push model; input: style taxonomy + budget envelope; output: material specification XLSX; dependency: AIE-002")
S52 += label_value("AIE-004 Mood Board Assembler", "Batch API; input: AIE-001–003 outputs; output: mood board package (PDF + asset bundle); SLA ≤30s per board")
S52 += label_value("AIE-005 Client Presentation Renderer", "Streaming API; input: mood board package; output: interactive HTML5 presentation; SLA ≤60s first render")
S52 += body(
    "Authentication & Security requirements for all AIE modules:"
)
S52 += bullet("OAuth 2.0 client credentials flow; tokens issued by MONOLITH identity provider (managed by Core)")
S52 += bullet("All API traffic encrypted via TLS 1.3; certificate pinning required for production endpoints")
S52 += bullet("Rate limiting: 100 requests/minute per AIE module in production; burst allowance 150/minute for 60 seconds")
S52 += bullet("Audit logging: all API calls logged to MONOLITH SIEM (Nexus) with requestor ID, timestamp, input hash, and response code")
S52 += bullet("Data payload encryption: AES-256 at rest; all client project data classified as CONFIDENTIAL")
S52 += label_value("Integration sign-off authority", "Signal (Technology Integration Lead) must approve all endpoint registrations before UAT begins")
S52 += label_value("Integration target", "V-CHK-05 and V-CHK-06 completed within 15 business days of pre-onboarding gate approval")

# ── 52.4 Testing & Acceptance Criteria ──────────────────────
S52 += heading2("52.4 Testing & Acceptance Criteria")
S52 += body(
    "Testing follows a two-track approach: System Integration Testing (SIT) validating "
    "inter-module data flows, and User Acceptance Testing (UAT) validating end-to-end "
    "creative workflow output quality against MONOLITH design standards."
)
S52 += label_value("V-CHK-05 — SIT Pass", "All AIE-001–005 modules pass automated integration test suite (≥98% pass rate); no P1/P2 defects open at SIT sign-off")
S52 += label_value("V-CHK-06 — Performance Benchmarks", "AIE-001 ≤3s p95; AIE-002 ≤5s p95; AIE-003 ≤10s p95; AIE-004 ≤30s p95; AIE-005 ≤60s first render — verified under 50 concurrent sessions")
S52 += label_value("V-CHK-07 — UAT Pass", "10 representative client project briefs processed end-to-end; output quality scored ≥4.0/5.0 by MONOLITH design panel (Aria + 2 senior designers)")
S52 += body(
    "UAT acceptance criteria per module:"
)
S52 += bullet("AIE-001: Concept variants must demonstrate brand guideline compliance ≥90% as assessed by Aria")
S52 += bullet("AIE-002: Style taxonomy outputs must align with MONOLITH style library v2.5 categories ≥85% match rate")
S52 += bullet("AIE-003: Material specifications must reference valid SKUs from MONOLITH approved supplier catalogue")
S52 += bullet("AIE-004: Mood board visual quality score ≥4.0/5.0 from design panel; no duplicate asset usage across variants")
S52 += bullet("AIE-005: Presentation render must be fully navigable in Chrome/Safari; asset resolution ≥300dpi for print export")
S52 += label_value("Defect severity definitions", "P1: system failure / data loss; P2: functional failure blocking workflow; P3: cosmetic / non-blocking")
S52 += label_value("UAT sign-off authority", "Aria (Procurement & Compliance Lead) countersigned by Phase 2 Programme Director")
S52 += label_value("Testing duration", "SIT: 10 business days; UAT: 5 business days; buffer: 5 business days for defect remediation")

# ── 52.5 Go-Live Protocol ────────────────────────────────────
S52 += heading2("52.5 Go-Live Protocol")
S52 += body(
    "Go-live follows a phased cutover approach to minimise risk. Production cutover is "
    "sequenced module-by-module across two cutover windows to ensure rollback capability "
    "is preserved throughout the process."
)
S52 += label_value("V-CHK-08 — Go-Live Readiness Gate", "All V-CHK-01–07 items COMPLETE; zero open P1/P2 defects; rollback plan approved by Signal and Programme Director")
S52 += body(
    "Cutover sequence:"
)
S52 += bullet("Cutover Window 1 (Monday 06:00–10:00 ICT): AIE-001 and AIE-002 production activation; 2-hour parallel run with staging environment")
S52 += bullet("Cutover Window 2 (Wednesday 06:00–10:00 ICT, contingent on Window 1 success): AIE-003, AIE-004, and AIE-005 production activation")
S52 += bullet("Post-cutover monitoring: 48-hour enhanced monitoring by Signal; all P1/P2 alerts escalated to Programme Director within 15 minutes")
S52 += body(
    "Rollback procedure:"
)
S52 += bullet("Rollback trigger: two or more P1 incidents within 4 hours of cutover; or any data integrity failure in AIE module")
S52 += bullet("Rollback authority: Signal (Technology Integration Lead) may unilaterally initiate rollback within first 24 hours; Programme Director approval required thereafter")
S52 += bullet("Rollback target: revert to pre-integration baseline (S51 procurement workflow) within 30 minutes of trigger decision")
S52 += bullet("Post-rollback: root cause analysis report to SC within 5 business days; revised go-live timeline proposed within 10 business days")
S52 += label_value("Go-live sign-off authority", "Phase 2 Programme Director co-signed by Signal and Aria")
S52 += label_value("Target go-live window", "P2-M3 (3 months post Phase 2 kickoff, Q2 2033)")

# ── 52.6 Post-Integration Support (90-day Hypercare) ────────
S52 += heading2("52.6 Post-Integration Support — 90-Day Hypercare Period")
S52 += body(
    "Following production go-live, a mandatory 90-day Hypercare Period applies during which "
    "the vendor must maintain enhanced support levels and MONOLITH retains the right to "
    "invoke remediation obligations without change request overhead."
)
S52 += label_value("Hypercare period", "90 calendar days from production go-live date")
S52 += label_value("Hypercare SLA — P1 response", "≤1 hour acknowledgement; ≤4 hours resolution; 24/7 coverage required")
S52 += label_value("Hypercare SLA — P2 response", "≤4 hours acknowledgement; ≤1 business day resolution")
S52 += label_value("Hypercare SLA — P3 response", "≤1 business day acknowledgement; ≤5 business days resolution")
S52 += label_value("MONOLITH hypercare monitor", "Nova (KPI Dashboard & Monitoring) — real-time SLA compliance dashboard active from go-live day")
S52 += body(
    "Escalation matrix during Hypercare:"
)
S52 += label_value("L1 — Initial triage", "Signal (Technology Integration Lead); response ≤30 minutes")
S52 += label_value("L2 — Technical escalation", "Vendor Module Lead + Signal; response ≤2 hours")
S52 += label_value("L3 — Programme escalation", "Phase 2 Programme Director + Vendor Account Director; response ≤4 hours")
S52 += label_value("L4 — Executive escalation", "SC Chair + Vendor CEO; trigger: unresolved P1 beyond 4 hours or pattern of P2 recurrence ≥3 incidents in 7 days")
S52 += body(
    "Hypercare performance reporting:"
)
S52 += bullet("Weekly hypercare status report issued by vendor every Monday by 09:00 ICT to Signal and Programme Director")
S52 += bullet("Report must cover: incident count by severity, SLA compliance rate, open defect backlog, AIE-001–005 availability metrics")
S52 += bullet("30-day hypercare review: formal SC briefing note; Signal presents availability and performance metrics against V-CHK-09–12")
S52 += bullet("90-day hypercare exit: formal sign-off by Programme Director required to transition to BAU support model")
S52 += label_value("Post-hypercare BAU SLA", "AIE-001–005 availability ≥99.5% monthly; P1 response ≤2 hours; P2 ≤8 hours (per contract schedule)")
S52 += label_value("V-CHK-09 — Hypercare entry", "Vendor emergency contact matrix confirmed active; Nova monitoring dashboard live; Signal acknowledged go-live baseline metrics")

# ── 52.7 Vendor Integration Readiness Checklist V-CHK-01–12 ─
S52 += heading2("52.7 Vendor Integration Readiness Checklist — V-CHK-01 to V-CHK-12")
S52 += body(
    "The following 12-item readiness checklist (V-CHK-01–12) constitutes the definitive gate "
    "control for the vendor onboarding and integration process. No phase may proceed until all "
    "preceding V-CHK items are marked COMPLETE by the designated authority. Any INCOMPLETE item "
    "blocks progression and requires escalation to the Phase 2 Programme Director."
)
S52 += label_value("V-CHK-01", "[PRE-ONB] Contract & Legal — MSA, SOW, DPA executed; IP schedules attached — Authority: Aria")
S52 += label_value("V-CHK-02", "[PRE-ONB] NDA & Data Classification — NDA executed; PDPA briefing complete — Authority: Aria")
S52 += label_value("V-CHK-03", "[PRE-ONB] Access Provisioning — VPN, repo, sandbox environment active — Authority: Signal")
S52 += label_value("V-CHK-04", "[PRE-ONB] Environment Setup — AIE-001–005 scaffolding verified against MONOLITH infra spec v2.5 — Authority: Signal")
S52 += label_value("V-CHK-05", "[SIT] Integration Test Suite Pass — ≥98% pass rate; zero open P1/P2 defects — Authority: Signal")
S52 += label_value("V-CHK-06", "[SIT] Performance Benchmarks — AIE-001–005 latency SLAs met under 50 concurrent sessions — Authority: Signal")
S52 += label_value("V-CHK-07", "[UAT] UAT Acceptance — 10 client briefs processed; design panel score ≥4.0/5.0 — Authority: Aria + Programme Director")
S52 += label_value("V-CHK-08", "[GO-LIVE] Go-Live Readiness Gate — V-CHK-01–07 COMPLETE; rollback plan approved — Authority: Programme Director + Signal")
S52 += label_value("V-CHK-09", "[HYPERCARE] Hypercare Entry — Nova monitoring live; emergency contacts confirmed; baseline metrics acknowledged — Authority: Signal")
S52 += label_value("V-CHK-10", "[HYPERCARE] 30-Day Review — Availability ≥99.5%; zero open P1; P2 backlog ≤5 — Authority: Programme Director")
S52 += label_value("V-CHK-11", "[HYPERCARE] 60-Day Review — AIE-001–005 performance stable; weekly report compliance 100% — Authority: Signal")
S52 += label_value("V-CHK-12", "[HYPERCARE] 90-Day Hypercare Exit — Formal sign-off; DPA countersigned and filed; BAU SLA confirmed — Authority: Programme Director co-signed Core")
S52 += body(
    "Readiness checklist oversight: Programme Director maintains a live V-CHK tracker shared "
    "with SC Chair, Signal, Aria, Core, and Nova. Status is reported at every Phase 2 Programme "
    "Board meeting (fortnightly). Any item marked BLOCKED for more than 5 business days triggers "
    "automatic SC escalation note from Programme Director."
)
S52 += label_value("Checklist document reference", "MONOLITH-S52-VCHK-001 v1.0 (living document; version controlled in MONOLITH document repository)")
S52 += label_value("Final protocol authority", "Steering Committee holds ultimate authority to waive or modify V-CHK gates; SC resolution required for any waiver")

# ============================================================
# ASSEMBLE & INJECT
# ============================================================
NEW_CONTENT = S52

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
    s52_ok = (
        'V-CHK-12' in vxml and
        'AIE-005' in vxml and
        'Section 52' in vxml and
        '90-Day Hypercare' in vxml and
        'MONOLITH-S52-ONB-001' in vxml
    )
    inside_h = len(re.findall(r'<w:insideH', vxml))
    inside_v = len(re.findall(r'<w:insideV', vxml))

print(f"\n=== INJECTION RESULTS ===")
print(f"w:ins tracked insertions: {len(ins_tags)}")
print(f"Max ID used: {max(int(x) for x in all_ids) if all_ids else 0}")
print(f"w:insideH intact: {inside_h}")
print(f"w:insideV intact: {inside_v}")
print(f"S52 (Vendor Onboarding Protocol) present: {s52_ok}")
print(f"File size: {os.path.getsize(DST):,} bytes")
print(f"IDs used: 1777 – {_id - 1} (total {_id - 1777} IDs allocated)")
