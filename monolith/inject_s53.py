"""
inject_s53.py
Inject Section S53 into monolith_project_summary_v25_accepted.docx
S53: Phase 2 Go-Live Operations Plan — GAP-05 AI Creative Engine
    53.1 Overview & Scope
    53.2 Pre Go-Live Readiness Assessment
    53.3 Cutover Schedule (T-5 days to T+72h)
    53.4 BAU Transition Protocol
    53.5 Phase 3 Readiness Gate Criteria
    53.6 Go-Live Operations Checklist (GL-CHK-01–10)
IDs start at 2036 (continuing from inject_s52.py which used 1777–2035)
"""
import zipfile, re, shutil, os

SRC = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
DST = '/home/sandbox/monolith_project_summary_v25_accepted.docx'
BAK = '/home/sandbox/monolith_project_summary_v25_accepted_pre_s53_backup.docx'

shutil.copy(SRC, BAK)
print(f'Backup: {BAK}')

with zipfile.ZipFile(SRC, 'r') as z:
    xml = z.read('word/document.xml').decode('utf-8')
    all_files = {name: z.read(name) for name in z.namelist()}

_id = 2036

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
# SECTION 53 — Phase 2 Go-Live Operations Plan
#              GAP-05: AI Creative Engine (AIE-001–005)
# ============================================================
S53 = ""

# ── Heading ─────────────────────────────────────────────────
S53 += heading1("Section 53 — Phase 2 Go-Live Operations Plan")

# ── 53.1 Overview & Scope ───────────────────────────────────
S53 += heading2("53.1 Overview & Scope")
S53 += body(
    "This section defines the Phase 2 Go-Live Operations Plan governing the production activation "
    "of the GAP-05 AI Creative Engine (AIE-001–005) following successful completion of V-CHK-08 "
    "(Go-Live Readiness Gate). The plan covers the pre-go-live readiness assessment, the "
    "phased cutover schedule, the Business-as-Usual (BAU) transition protocol, and the Phase 3 "
    "readiness gate criteria that must be satisfied before the MONOLITH programme advances to "
    "Phase 3."
)
S53 += label_value("Plan reference", "MONOLITH-S53-GOLIVE-001 v1.0")
S53 += label_value("Applicable gap", "GAP-05 — AI Creative Engine (Phase 2)")
S53 += label_value("Trigger event", "V-CHK-08 COMPLETE — all pre-conditions met, Programme Director sign-off")
S53 += label_value("Owner", "Phase 2 Programme Director")
S53 += label_value("Co-owners", "Signal (Technology Lead), Aria (Compliance & Quality), Nova (KPI Monitoring)")
S53 += label_value("Target go-live", "P2-M3 — Q2 2033 (3 months post Phase 2 kickoff)")
S53 += label_value("Plan status", "Active — awaiting V-CHK-08 clearance")
S53 += body(
    "The Go-Live Operations Plan is structured as six operational components: (1) Pre Go-Live "
    "Readiness Assessment validating all gates; (2) Cutover Schedule covering T-5 days to T+72h "
    "in two windows; (3) BAU Transition Protocol covering the 90-day hypercare arc into steady "
    "state; (4) Phase 3 Readiness Gate Criteria defining the conditions for programme advancement; "
    "(5) Go-Live Operations Checklist GL-CHK-01–10 providing definitive gate control; and "
    "(6) Programme Closure Assessment criteria for Phase 2 formal close."
)

# ── 53.2 Pre Go-Live Readiness Assessment ───────────────────
S53 += heading2("53.2 Pre Go-Live Readiness Assessment")
S53 += body(
    "The Pre Go-Live Readiness Assessment must be completed and formally signed off by the Phase 2 "
    "Programme Director no less than 48 hours before the first cutover window. All items must "
    "be COMPLETE — no exceptions. Partial completion triggers automatic cutover deferral."
)
S53 += label_value("GL-CHK-01 — V-CHK Audit Complete", "Programme Director certifies all V-CHK-01–08 items COMPLETE; zero open P1/P2 defects across AIE-001–005")
S53 += label_value("GL-CHK-02 — Production Environment Validation", "Signal completes final production environment check: config delta between staging and production ≤ defined tolerance; no critical configuration drift; all API endpoints registered and health-check passing")
S53 += label_value("GL-CHK-03 — Rollback Rehearsal", "Rollback procedure rehearsed end-to-end; rollback time confirmed ≤30 minutes; Signal and Programme Director sign off rollback runbook; vendor rollback contact confirmed available 24/7 for cutover window")
S53 += body(
    "Additional pre-go-live requirements:"
)
S53 += bullet("Stakeholder communication plan executed: SC Chair, client-facing teams, and MONOLITH Agent leads (Aria, Signal, Nova, Core, Nexus) notified ≥24 hours before cutover")
S53 += bullet("Nova monitoring dashboard baseline metrics captured from final staging run; alert thresholds set and validated in production environment")
S53 += bullet("Vendor on-call roster confirmed: all AIE-001–005 module leads contactable by Signal within 30 minutes throughout both cutover windows")
S53 += bullet("Change freeze in effect: all non-critical system changes frozen from T-5 days through T+72h; emergency change approval only via Programme Director")
S53 += bullet("Incident response team assembled: Signal (primary), vendor L2, Programme Director (L3), SC Chair (L4 escalation trigger ≥4 hours unresolved P1)")
S53 += label_value("Pre-go-live sign-off deadline", "≥48 hours before Cutover Window 1; late sign-off automatically defers go-live by one week")
S53 += label_value("Authority", "Phase 2 Programme Director co-signed Signal and Aria")

# ── 53.3 Cutover Schedule ────────────────────────────────────
S53 += heading2("53.3 Cutover Schedule")
S53 += body(
    "The production cutover is executed in two sequential windows across one business week. "
    "Window 2 proceeds only if Window 1 achieves STABLE status at the 2-hour parallel-run "
    "checkpoint. The full schedule below is relative to T-0 (first cutover window Monday morning)."
)
S53 += label_value("T-5 days (Wednesday prior)", "Production environment lock imposed; change freeze activated; Nova monitoring in pre-go-live mode; vendor team availability confirmed for go-live week")
S53 += label_value("T-2 days (Saturday)",
    "Final staging-to-production delta validation by Signal; all AIE-001–005 health checks passing; "
    "rollback runbook reviewed and countersigned; vendor on-call roster confirmed active")
S53 += label_value("T-1 day (Sunday)",
    "Programme Director final readiness call with Signal, Aria, and vendor Account Director; "
    "GL-CHK-01–03 formally closed; cutover communication sent to all MONOLITH Agent leads; "
    "SC Chair notified; Nova monitoring shifted to cutover-watch mode")
S53 += label_value("T-0 Window 1 (Monday 06:00–10:00 ICT)",
    "AIE-001 (Concept Generator) and AIE-002 (Style Harmoniser) production activation; "
    "2-hour parallel run: both staging and production serving requests simultaneously; "
    "Signal monitors latency and error rate in real time; "
    "STABLE declaration at 08:00 if: zero P1 incidents, p95 latency within SLA, error rate ≤0.5%; "
    "UNSTABLE at 08:00 triggers immediate rollback — no Window 2 this week")
S53 += label_value("T+4h post-Window 1 (Monday 10:00–14:00 ICT)",
    "Window 1 post-cutover assessment: Signal reviews 4-hour production metrics; "
    "Programme Director issues Window 1 Stable/Unstable declaration; "
    "if STABLE: Window 2 confirmed for Wednesday; if UNSTABLE: rollback executed, root cause analysis within 24h")
S53 += label_value("T+48h Window 2 (Wednesday 06:00–10:00 ICT)",
    "Contingent on Window 1 STABLE declaration: "
    "AIE-003 (Material Specifier), AIE-004 (Mood Board Assembler), AIE-005 (Client Presentation Renderer) production activation; "
    "2-hour parallel run; STABLE criteria same as Window 1 (zero P1, latency SLA, error rate ≤1.0%); "
    "full AIE-001–005 suite live on STABLE declaration")
S53 += label_value("T+72h (Thursday 06:00 ICT)",
    "Post-cutover stability checkpoint: Signal and Nova confirm 72-hour production metrics; "
    "zero P1 incidents across full AIE-001–005 suite; "
    "Programme Director issues formal Go-Live Stable Declaration; "
    "90-day Hypercare Period starts (S52.6); V-CHK-09 closes")
S53 += body(
    "Rollback decision tree:"
)
S53 += bullet("Any P1 incident within 4 hours of cutover window: Signal initiates rollback assessment; Programme Director notified within 15 minutes")
S53 += bullet("Two or more P1 incidents in any 4-hour window: automatic rollback trigger; Signal executes without waiting for Programme Director approval")
S53 += bullet("Data integrity anomaly (any severity): immediate rollback; Nexus security team engaged; SC Chair notified within 1 hour")
S53 += bullet("Rollback target: revert to pre-cutover baseline (S51/S52 procurement workflow) within 30 minutes of trigger decision")
S53 += bullet("Post-rollback: written root cause analysis to Programme Director within 24 hours; revised go-live date to SC within 5 business days")

# ── 53.4 BAU Transition Protocol ────────────────────────────
S53 += heading2("53.4 BAU Transition Protocol")
S53 += body(
    "The BAU Transition Protocol defines the operating model for AIE-001–005 from the "
    "Go-Live Stable Declaration through the end of the 90-day Hypercare Period (S52.6) "
    "and into the steady-state BAU support model. Three transition phases apply."
)
S53 += label_value("Phase A — Days 1–30 (Enhanced Support Mode)",
    "Signal + vendor maintain 24/7 joint on-call; daily stand-up (09:00 ICT) between Signal and vendor module leads; "
    "all incidents logged in MONOLITH SIEM (Nexus); P1 response ≤1h; weekly performance report to Programme Director; "
    "Nova dashboard in hypercare-watch mode (30-minute reporting cycle); "
    "GL-CHK-04 closed at T+72h; GL-CHK-05 at Day 7 stability confirmation")
S53 += label_value("Phase B — Days 31–60 (Standard Hypercare Mode)",
    "Signal + vendor maintain business-hours primary support with 24/7 P1 escalation path; "
    "daily stand-up reduced to Monday/Wednesday/Friday; weekly SLA report issued by vendor; "
    "30-day hypercare review meeting: Programme Director + Signal + vendor Account Director; "
    "Nova reports automated to SC Chair and Programme Director every Monday; "
    "GL-CHK-06 closed at Day 30 hypercare review")
S53 += label_value("Phase C — Days 61–90 (Pre-BAU Assessment)",
    "Transition planning begins; Signal documents AIE-001–005 operational runbooks; "
    "incident playbooks reviewed and updated based on 60-day learnings; "
    "vendor handoff documentation package assembled (architecture diagrams, contact matrix, SLA schedules); "
    "60-day hypercare review: performance stability assessment; "
    "GL-CHK-07 closed at Day 60 review; BAU support model agreed with vendor by Day 75")
S53 += label_value("Phase D — Day 91+ (BAU Mode)",
    "Standard support model per contract schedule: AIE-001–005 availability ≥99.5% monthly; "
    "P1 response ≤2 hours (vs ≤1h hypercare); P2 ≤8 hours; P3 ≤3 business days; "
    "monthly SLA report; quarterly performance review; change management via standard change control; "
    "GL-CHK-08 closed at Day 90 hypercare exit sign-off (Programme Director + Core)")
S53 += body(
    "BAU handoff documentation package (required at GL-CHK-08):"
)
S53 += bullet("AIE-001–005 operational runbooks: startup/shutdown, health check procedures, common incident resolution steps")
S53 += bullet("Incident playbook: severity definitions, escalation contacts, resolution templates for top 10 known issue types")
S53 += bullet("Architecture reference: API endpoint registry, authentication configuration, data flow diagrams, dependency map")
S53 += bullet("Performance baseline: 90-day p50/p95/p99 latency benchmarks and availability records per AIE module")
S53 += bullet("Vendor contact matrix: 24/7 emergency, business-hours, escalation, and account management contacts; updated and countersigned by vendor Account Director")
S53 += label_value("Handoff authority", "Signal (Technology Lead) accepts runbooks; Core accepts vendor commercial documentation; Programme Director signs off full BAU handoff package")

# ── 53.5 Phase 3 Readiness Gate Criteria ────────────────────
S53 += heading2("53.5 Phase 3 Readiness Gate Criteria")
S53 += body(
    "Phase 3 initiation requires the Phase 2 programme to demonstrate achievement of all "
    "Phase 2 coverage targets and system stability milestones. The following gate criteria "
    "must be satisfied before the Steering Committee may authorise Phase 3 commencement."
)
S53 += body(
    "Phase 2 completion requirements (prerequisite for Phase 3 gate):"
)
S53 += bullet("GAP-05 (AI Creative Engine): AIE-001–005 live in production with ≥99.5% availability for minimum 90 consecutive days")
S53 += bullet("GAP-06 (Cross-Pillar Event Bus): EVT-001–005 deployed and integrated; cross-pillar orchestration validated by Signal")
S53 += bullet("GAP-09 (Mock-up Approval Workflow): client mock-up portal live; ≥10 successful client sign-off cycles completed")
S53 += bullet("GAP-10 (Unified KPI Dashboard): Nova dashboard aggregating all 6 Pillars live; SC reporting automation active")
S53 += bullet("GAP-11 (Emergency Escalation Protocol): P0/P1/P2 severity matrix live in MONOLITH SIEM; incident postmortem module active")
S53 += bullet("GAP-12 (Governance Amendment Tracking): amendment register with SC ratification records live; at least one formal amendment cycle completed")
S53 += label_value("Phase 2 coverage target", "80% of MONOLITH coverage metric (Phase 1: 68% → Phase 2: 80%)")
S53 += body(
    "Phase 3 gate criteria (GL-CHK-09–10):"
)
S53 += label_value("GL-CHK-09 — Phase 2 Coverage Verification",
    "SC formally verifies all 6 Phase 2 gaps (GAP-05/06/09/10/11/12) CLOSED per audit by Aria + Signal; "
    "coverage metric independently calculated at ≥80%; "
    "no open P1/P2 incidents across any Phase 2 deliverable for 30 consecutive days prior to gate")
S53 += label_value("GL-CHK-10 — Phase 3 Authorisation",
    "SC resolution passed authorising Phase 3 initiation; "
    "Phase 3 Programme Director appointed; "
    "Phase 3 PDD (Programme Definition Document) approved in principle; "
    "Phase 3 budget envelope (target: GAP-01/02/03/04/13/14/15 closure to 92% coverage) ring-fenced")
S53 += body(
    "Phase 3 scope preview (for planning purposes):"
)
S53 += bullet("GAP-01: Biophilic Design & WELL/LEED Tracking module (Pillar 1) — `src/biophilic/` new module")
S53 += bullet("GAP-02: Design Freeze Gate full implementation (Pillar 2) — Gate-0/1/2/3 milestone locks in `src/gate/`")
S53 += bullet("GAP-03/04: Sensory Commissioning + Post-Occupancy Evaluation (Pillar 6) — `src/sensory-commissioning/`, `src/poe/`")
S53 += bullet("GAP-13: AI Ethics Audit Module — bias monitoring, ethical decision log in `src/core/guards/`")
S53 += bullet("GAP-14: Agent Decommissioning Workflow — formal retire/archive state in `src/workflow/`")
S53 += bullet("GAP-15: PDPA Data Subject Request Workflow — DSAR form and 30-day response tracker in `src/iam/`")
S53 += label_value("Phase 3 coverage target", "92% (Phase 2: 80% → Phase 3: 92%)")
S53 += label_value("Phase 3 timeline estimate", "FY2033–2034 (AMD-004 WS-C/WS-D activation)")
S53 += label_value("Phase 3 gate authority", "Steering Committee — SC resolution required; Programme Director cannot unilaterally initiate Phase 3")

# ── 53.6 Go-Live Operations Checklist GL-CHK-01–10 ──────────
S53 += heading2("53.6 Go-Live Operations Checklist — GL-CHK-01 to GL-CHK-10")
S53 += body(
    "The following 10-item Go-Live Operations Checklist (GL-CHK-01–10) provides definitive "
    "gate control for the production activation and programme transition lifecycle. Items are "
    "sequential — no item may be closed before all preceding items are COMPLETE. Any BLOCKED "
    "item triggers escalation to the Programme Director and, if unresolved within 5 business "
    "days, automatic SC notification."
)
S53 += label_value("GL-CHK-01", "[PRE-GO-LIVE] V-CHK Audit — V-CHK-01–08 all COMPLETE; zero open P1/P2 defects — Authority: Programme Director")
S53 += label_value("GL-CHK-02", "[PRE-GO-LIVE] Production Environment Validation — config delta ≤ tolerance; all API health checks passing — Authority: Signal")
S53 += label_value("GL-CHK-03", "[PRE-GO-LIVE] Rollback Rehearsal — rollback time ≤30 min confirmed; runbook countersigned; vendor on-call confirmed — Authority: Signal + Programme Director")
S53 += label_value("GL-CHK-04", "[CUTOVER] Window 1 Stable — AIE-001/002 live; 2-hour parallel run passed; STABLE declaration issued — Authority: Signal, declared by Programme Director")
S53 += label_value("GL-CHK-05", "[CUTOVER] Window 2 Stable — AIE-003/004/005 live; full suite STABLE; all 5 modules production-active — Authority: Signal, declared by Programme Director")
S53 += label_value("GL-CHK-06", "[POST-CUTOVER] T+72h Stability Confirmed — zero P1 in 72h; 90-day hypercare clock started; V-CHK-09 CLOSED — Authority: Programme Director + Signal")
S53 += label_value("GL-CHK-07", "[HYPERCARE DAY 30] 30-Day Review Passed — availability ≥99.5%; zero open P1; P2 backlog ≤5 — Authority: Programme Director per S52 V-CHK-10")
S53 += label_value("GL-CHK-08", "[HYPERCARE DAY 90] BAU Handoff Complete — runbooks accepted by Signal; commercial docs accepted by Core; hypercare exit signed off — Authority: Programme Director co-signed Core per S52 V-CHK-12")
S53 += label_value("GL-CHK-09", "[PHASE 3 GATE] Phase 2 Coverage ≥80% — all GAP-05/06/09/10/11/12 CLOSED per SC audit; 30-day zero-P1 period confirmed — Authority: Steering Committee")
S53 += label_value("GL-CHK-10", "[PHASE 3 GATE] Phase 3 Authorisation — SC resolution passed; Phase 3 PDD approved in principle; Phase 3 Programme Director appointed — Authority: SC Chair + Board")
S53 += body(
    "Checklist governance: Programme Director maintains the GL-CHK tracker alongside the V-CHK tracker "
    "(S52.7). Both trackers are presented at every Phase 2 Programme Board meeting (fortnightly). "
    "The combined V-CHK + GL-CHK status constitutes the Phase 2 Programme Health Dashboard "
    "reported to the Steering Committee. Upon GL-CHK-10 closure, the Phase 2 programme formally "
    "transitions to Phase 3 and this document (MONOLITH-S53-GOLIVE-001) is archived as a "
    "Phase 2 Programme Close artefact."
)
S53 += label_value("Combined tracker reference", "MONOLITH-S53-GOLIVE-001 v1.0 (living document; version controlled in MONOLITH document repository)")
S53 += label_value("Programme close authority", "Steering Committee resolution required to formally close Phase 2 and open Phase 3; no individual authority may close the programme unilaterally")

# ============================================================
# ASSEMBLE & INJECT
# ============================================================
NEW_CONTENT = S53

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
    s53_ok = (
        'GL-CHK-10' in vxml and
        'Section 53' in vxml and
        'Phase 3 Readiness Gate' in vxml and
        'MONOLITH-S53-GOLIVE-001' in vxml and
        'BAU Transition Protocol' in vxml
    )
    s52_ok = 'V-CHK-12' in vxml and 'Section 52' in vxml
    inside_h = len(re.findall(r'<w:insideH', vxml))
    inside_v = len(re.findall(r'<w:insideV', vxml))

print(f"\n=== INJECTION RESULTS ===")
print(f"w:ins tracked insertions: {len(ins_tags)}")
print(f"Max ID used: {max(int(x) for x in all_ids) if all_ids else 0}")
print(f"w:insideH intact: {inside_h}")
print(f"w:insideV intact: {inside_v}")
print(f"S53 (Go-Live Operations Plan) present: {s53_ok}")
print(f"S52 (Vendor Onboarding Protocol) intact: {s52_ok}")
print(f"File size: {os.path.getsize(DST):,} bytes")
print(f"IDs used: 2036 – {_id - 1} (total {_id - 2036} IDs allocated)")
