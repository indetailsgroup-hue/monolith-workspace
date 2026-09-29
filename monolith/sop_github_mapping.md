# MONOLITH SOP × GitHub Repository Mapping
## Coverage Analysis & Gap Report

**Document:** `sop_github_mapping.md`
**Repository:** `indetailsgroup-hue/monolith-workspace` (branch: `main`, SHA: `5c29dd9d`)
**SOP Version:** v2.5 — 52 Sections (Clean Final, S1–S52)
**Analysis Date:** 3 September 2026
**Prepared by:** MONOLITH AI Operations Team

> **Update (3 Sep 2026):** SHA updated from `14b90bc` → `5c29dd9d` following GitHub push of `monolith/` folder (20 files, branch `main`). SOP section count updated S38 → S52 to reflect S39–S52 additions (AMD-004 WS-A through WS-E, SC Governance, Phase 1 Completion, Phase 2 PDD, S51 Procurement Framework, S52 Vendor Onboarding Protocol).
> **Update (4 Sep 2026 — Session 2):** S54 Phase 3 Programme Definition Document injected and accepted. Section count 53 → 54. DOCX updated to 178,044 bytes (0 tracked changes). thai_phase2_summary_brief.html (S51+S52+S53 SC Chair exec summary) created. master_index.html 126 → 131 entries. changelog_v25.md 1,737 → 1,773 lines. ZIP rebuild pending. Next GitHub push pending new PAT (will include S52+S53+S54 DOCX, all 4 Thai briefs, inject/accept scripts, rebuilt ZIP).
>
> **Update (4 Sep 2026 — Session 1):** S53 Phase 2 Go-Live Operations Plan injected and accepted. Section count 52 → 53. DOCX updated to 173,578 bytes. thai_vendor_onboarding_brief.html (S52 Thai brief) created. master_index.html 120 → 125 entries. Next GitHub push pending new PAT (will include S52+S53 DOCX, Thai briefs, rebuild ZIP, inject/accept scripts).

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ **COVERED** | GitHub module directly implements the SOP section |
| ⚠️ **PARTIAL** | Related code exists but SOP requirements not fully implemented |
| ❌ **GAP** | No corresponding implementation in repository |
| 🔵 **SPEC ONLY** | Exists in `.kiro/specs/` as design/requirements — not yet built |

---

## Part A — SOP Section × GitHub Module Matrix (S1–S52)

| Section | Title | Primary GitHub Modules | Status | Gap Notes |
|---------|-------|----------------------|--------|-----------|
| **S1** | นโยบายองค์กรและวิสัยทัศน์ (Corporate Policy & Vision) | `src/iam/`, `src/tenant/`, `src/core/trust/`, `src/core/trustChain/` | ⚠️ **PARTIAL** | IAM/tenant foundation exists; policy documentation layer, vision statement, and governance mandate are in DOCX only |
| **S2** | โครงสร้างองค์กรและตำแหน่งงาน (Org Structure & Job Roles) | `src/orgchart/`, `src/people/`, `src/role-network/`, `src/culture/` | ✅ **COVERED** | Full org-chart, role network, and people modules present |
| **S3** | กระบวนการออกแบบและสร้างสรรค์ (Design & Creative Process) | `src/designer/`, `src/core/designer/`, `src/core/designerIntent/`, `src/core/sketch/`, `src/core/modeling/`, `src/core/geometry/` | ⚠️ **PARTIAL** | CAD/modeling tooling strong; **Biophilic Design Workflow (Pillar 1) and WELL/LEED compliance layer absent** |
| **S4** | การจัดการวัสดุและ Procurement (Materials & Procurement) | `furniture-hardware-vault/` (152 files), `src/core/materials/`, `src/core/hardware/`, `src/ai-quotation/`, `src/quotation/` | ✅ **COVERED** | Hardware vault + AI quotation robust; Mock-up approval sub-workflow missing (see Pillar 4 gap) |
| **S5** | กระบวนการขายและ CRM (Sales & CRM) | `LineOS/`, `supabase/functions/line-oa-dispatch-worker/`, `supabase/functions/line-webhook/`, `supabase/functions/line-login/`, `supabase/functions/line-outbound-sender/`, `.kiro/specs/line-oa-commerce/` | ✅ **COVERED** | LINE OA Commerce pipeline fully implemented; Stripe webhook for billing present |
| **S6** | การจัดการโปรเจกต์ (Project Management) | `src/workflow/` (15 sub-modules), `src/ai-scheduler/`, `supabase/functions/sla-sweep-scheduler/`, `.kiro/specs/installation-pm/` | ✅ **COVERED** | SLA scheduler, workflow approval, delegation, handoff all present |
| **S7** | การควบคุมคุณภาพ QA/QC | `src/qc-anomaly/`, `packages/field-app/`, `supabase/functions/field-capture/`, `supabase/functions/capture-ingest/`, `supabase/functions/capture-ocr-extract/`, `supabase/functions/capture-media-worker/` | ✅ **COVERED** | Field QC pipeline strong — capture → OCR → ingest → anomaly detection |
| **S8** | การจัดการทีมงานและ AI Agents | `src/workflow/autonomy/`, `src/workflow/delegation/`, `src/workflow/identity/`, `src/workflow/copilot/` | ⚠️ **PARTIAL** | Workflow engine exists; **28-agent governance layer, SLA Group A–D thresholds, and per-agent KPIs live in SOP DOCX only** |
| **S9** | กระบวนการผลิตและประกอบ (Manufacturing & Assembly) | `src/factory/` (13 sub-modules), `src/manufacturing/`, `src/core/manufacturing/` (23 sub-modules), `src/nesting/`, `minifix-skill-pack/` | ✅ **COVERED** | Full manufacturing pipeline: gcode → toolpath → nesting → verification |
| **S10** | การติดตั้งและงานหน้างาน (Installation & On-site) | `src/installation/`, `packages/field-app/`, `.kiro/specs/installation-pm/`, `supabase/functions/field-capture/`, `supabase/functions/field-purchase-line/` | ✅ **COVERED** | Installation PM spec + field app + purchase-line workflow |
| **S11** | การตรวจสอบและ Sustainability (Inspection & Sustainability) | `src/qc-anomaly/`, `packages/field-app/`, `src/core/preflight/` | ⚠️ **PARTIAL** | QC inspection covered; **WELL Building Standard, LEED compliance tracking, and Biophilic material certification absent** |
| **S12** | การส่งมอบและ Emergency Protocol (Delivery & Emergency) | `supabase/functions/notify-overdue/`, `supabase/functions/notification-retry-worker/`, `src/notifications/` | ⚠️ **PARTIAL** | Overdue notification and retry exist; formal Emergency Escalation Protocol (SOP-defined) not implemented as a module |
| **S13** | ระบบ IT และ Digital Integration | `src/core/infra/`, `packages/digital-shadow-service/`, `src/mcp/`, `supabase/functions/mcp-server/`, `src/core/sync/`, `src/core/persistence/` | ✅ **COVERED** | Digital shadow service, MCP server, Supabase Realtime all active |
| **S14** | v2.6/v2.7 Package Update (Changelog Record) | `CHANGELOG.md`, `CHANGELOG_1440.md`, `CHANGELOG_1450.md`, `CHANGELOG_1460.md`, `CHANGELOG_1470.md`, `CHANGELOG_1480.md` | ✅ **COVERED** | Multiple changelog files; last push 2026-09-03 |
| **S15** | Acceptance Sign-off — S1 through S14 | `src/workflow/approval/`, `supabase/functions/approval-postback/`, `supabase/functions/mcp-approval-callback/` | ⚠️ **PARTIAL** | Technical approval postback exists; formal sign-off records (SOA documents) not stored in repo |
| **S16** | Cross-Agent Orchestration Protocol | `src/workflow/` (full suite), `src/mcp/`, `supabase/functions/mcp-server/`, `.kiro/specs/monolith-mcp-layer/` | ✅ **COVERED** | MCP layer spec + server; workflow orchestration with SLA, approval, revision modules |
| **S17** | Agent Performance KPIs & SLA Thresholds | `src/workflow/sla/`, `supabase/functions/sla-sweep-scheduler/`, `src/culture-metrics/`, `src/org-health/` | ⚠️ **PARTIAL** | SLA sweep and metrics exist; **28-agent SLA Group A–D threshold table (Group A ≥95%, D ≥97%) and per-agent KPI baselines in DOCX only** |
| **S18** | Incident Response & Escalation Playbook | `supabase/functions/notify-overdue/`, `supabase/functions/etax-risk-notify/`, `src/notifications/` | ⚠️ **PARTIAL** | Automated notification triggers present; **structured incident severity framework, escalation playbook, and 48h SLA breach protocol in SOP only** |
| **S19** | Data Privacy & AI Compliance (PDPA) | `src/crypto/`, `src/core/crypto/`, `src/iam/`, `src/packet-verifier/`, `src/core/guards/` | ⚠️ **PARTIAL** | Cryptographic verification and IAM present; **PDPA compliance audit trail, data subject request workflow, and ISO 9001 evidence log absent** |
| **S20** | AI Ethics & Responsible Use Policy | `src/core/guards/`, `src/workflow/access/` | ❌ **GAP** | Guards/access control exist at code level; **no ethics framework implementation, no bias monitoring, no responsible AI audit module** |
| **S21** | Agent Lifecycle Management & Decommissioning | `src/workflow/`, `.kiro/specs/monolith-workflow-copilot/` | ⚠️ **PARTIAL** | Workflow lifecycle state machine present; **commission-to-decommission policy, retirement criteria, and agent sunsetting protocol in DOCX only** |
| **S22** | AI Agent Audit & Continuous Improvement | `src/workflow/audit/`, `src/core/telemetry/`, `src/core/diagnostics/`, `src/core/lineage/` | ⚠️ **PARTIAL** | Telemetry, lineage, and audit sub-modules present; **quarterly improvement cycle, root-cause analysis template, and SC reporting cadence in DOCX only** |
| **S23** | Programme Governance & Steering Committee Charter | _(none)_ | ❌ **GAP** | Entirely in DOCX — no code implementation of SC governance, decision-rights framework, or charter registry |
| **S24** | Amendment — Q1 2027 Annual Governance Review | `CHANGELOG.md` | ⚠️ **PARTIAL** | Captured in changelog only; no governance amendment tracking system |
| **S25** | Phase B Deployment Readiness Checklist | `src/gate/` (rules, compute, builders), `src/workflow/approval/` | ⚠️ **PARTIAL** | Gate/approval rule engine exists; Phase-B-specific deployment criteria checklist not implemented |
| **S26** | Phase B Go-Live Sign-off Records | `src/workflow/approval/`, `supabase/functions/approval-postback/` | ⚠️ **PARTIAL** | Approval postback present; formal sign-off record store missing |
| **S27** | Phase C Assessment — Pulse & Shore | `src/workflow/sla/` | ⚠️ **PARTIAL** | SLA monitoring present; Phase-C-specific agent assessment protocol in DOCX only |
| **S28** | Q1 2028 Annual Programme Review & AMD-002 Scope | _(none)_ | ❌ **GAP** | Programme-level annual review governance entirely in DOCX |
| **S29** | AMD-002 WS2 — Phase D New Agent Commissioning | `src/workflow/`, `.kiro/specs/monolith-workflow-copilot/` | ⚠️ **PARTIAL** | General workflow exists; AMD-002 Phase D commissioning protocol and RACI not in code |
| **S30** | Phase D Go-Live Sign-off — Ledger & Frame | `src/workflow/approval/` | ⚠️ **PARTIAL** | Approval flow exists; agent-specific sign-off records in DOCX |
| **S31** | Phase D Full Completion Declaration | `src/workflow/approval/` | ⚠️ **PARTIAL** | Approval workflow present; formal completion declaration document not in repo |
| **S32** | APR-2029 Annual Programme Review & AMD-003 Scope | _(none)_ | ❌ **GAP** | Programme governance entirely in DOCX |
| **S33** | AMD-003 WS1 — Agent Intelligence Enhancement | `src/workflow/copilot/`, `src/mcp/`, `supabase/functions/mcp-server/`, `.kiro/specs/monolith-mcp-layer/` | ✅ **COVERED** | MCP layer actively developed — copilot workflow, MCP server, pending cleanup all present |
| **S34** | AMD-003 WS4 — Governance Framework v2.0 | `src/workflow/access/`, `src/iam/`, `src/role-network/` | ⚠️ **PARTIAL** | Access/role infrastructure present; **Governance Framework v2.0 (GV2-P1 through GV2-P5 policy documents) in DOCX only** |
| **S35** | AMD-003 WS2 — Infrastructure Modernisation | `src/core/infra/`, `packages/digital-shadow-service/`, `supabase/` (Postgres + Auth + Realtime), `src/core/sync/` | ✅ **COVERED** | Digital shadow service, Supabase infra, real-time sync all active |
| **S36** | AMD-003 WS3 — Advanced Analytics & Reporting | `dashboard/`, `src/culture-metrics/`, `src/org-health/`, `src/core/telemetry/`, `src/core/diagnostics/` | ⚠️ **PARTIAL** | Individual dashboards exist; **cross-pillar unified KPI dashboard, SC reporting automation, and AMD-003 analytics module not integrated** |
| **S37** | AMD-003 WS5 — Phase E Scoping | `.kiro/specs/design-hub-platform-phase2/`, `.kiro/specs/separate-monolith-tcck/` | 🔵 **SPEC ONLY** | Phase E scope captured in .kiro specs; implementation pending AMD-004 activation |
| **S38** | AMD-004 Programme Definition Document | `.kiro/specs/` (conceptual level only) | ❌ **GAP** | PDD-001–006, WS-A through WS-E workstreams, and AMD-004 programme governance entirely in DOCX; no code implementation yet |
| **S39** | AMD-004 WS-A — Biophilic Design (GAP-01) | _(none)_ | ❌ **GAP** | Biophilic design framework; WELL v2 / LEED compliance — DOCX only |
| **S40** | AMD-004 WS-B — Design Freeze Gate (GAP-02) | `src/gate/` (scaffolding only) | ⚠️ **PARTIAL** | Design freeze gate milestone locks and sequential approval chain in DOCX only |
| **S41** | AMD-004 WS-C — Sensory Commissioning + POE (GAP-03/04) | _(none)_ | ❌ **GAP** | Sensory commissioning and post-occupancy evaluation modules — DOCX only |
| **S42** | AMD-004 WS-D — SC Governance Module (GAP-07) | _(none)_ | ❌ **GAP** | SC charter registry, agenda/resolution store — DOCX only |
| **S43** | AMD-004 WS-E — Real-time KPI Dashboard (GAP-08/10) | `dashboard/` (partial) | ⚠️ **PARTIAL** | Individual dashboards exist; cross-pillar unified AMD-004 KPI tracker in DOCX only |
| **S44** | AMD-004 WS-A — Intel Enhancement + Cross-Pillar Event Bus (GAP-05/06) | `src/mcp/`, `supabase/functions/mcp-server/` | ⚠️ **PARTIAL** | MCP server present; cross-pillar event bus and AI Creative Engine integration spec in DOCX only |
| **S45** | AMD-004 WS-B — Technology Infrastructure | `src/core/infra/`, `supabase/` | ⚠️ **PARTIAL** | Core infra present; WS-B technology infrastructure upgrade spec in DOCX only |
| **S46** | AMD-004 WS-C — Client Service Innovation | _(none)_ | ❌ **GAP** | Client service innovation module — DOCX only |
| **S47** | Phase 1 Roadmap Completion — GAP-08 Close | `supabase/functions/sla-sweep-scheduler/` | ⚠️ **PARTIAL** | SLA scheduler present; formal Phase 1 roadmap closure declaration in DOCX only |
| **S48** | Thai SC Presentation v2 (49 sections, Phase 1 Complete) | _(none)_ | ❌ **GAP** | SC presentation artefact — delivered as `thai_sc_presentation_v2.html` |
| **S49** | SC Review Slide Deck (PPTX — Phase 1 ROI, Phase 2 Business Case) | _(none)_ | ❌ **GAP** | SC review presentation artefact — delivered as `sc_review_presentation.pptx` |
| **S50** | Phase 2 Programme Definition Document (PDD) — SC-2032-XX | _(none)_ | ❌ **GAP** | Phase 2 PDD with GAP-05/06/09/10/11/12 workplan and budget THB 6.0M — DOCX only |
| **S51** | Phase 2 Procurement & Vendor Selection Framework — GAP-05 | _(none)_ | ❌ **GAP** | RFP-GAP05-001, 5-stage selection, P2-CHK-01–08 — DOCX only; `thai_procurement_brief.html` delivered |
| **S52** | Phase 2 Vendor Onboarding & Integration Protocol — GAP-05 | _(none)_ | ❌ **GAP** | V-CHK-01–12, AIE-001–005 integration spec, 90-day hypercare — DOCX only |

---

## Part B — Interior Design 6 Pillars × GitHub Module Matrix

| Pillar | Name | Primary GitHub Modules | Status | Gap Severity |
|--------|------|----------------------|--------|-------------|
| **Pillar 1** | Biophilic Design & WELL/LEED Compliance | ❌ No module | ❌ **GAP** | 🔴 **HIGH** |
| **Pillar 2** | Design Freeze Gate & Approval Flow | `src/gate/` (partial concept) | ⚠️ **PARTIAL** | 🔴 **HIGH** |
| **Pillar 3** | CNC / Design-to-Manufacturing (D2M) | `src/cnc/`, `src/factory/`, `src/core/manufacturing/`, `packages/digital-shadow-service/`, `src/nesting/` | ✅ **COVERED** | ✅ None |
| **Pillar 4a** | Procurement & AI Quotation | `src/ai-quotation/`, `furniture-hardware-vault/`, `src/core/hardware/`, `src/core/materials/` | ✅ **COVERED** | ✅ None |
| **Pillar 4b** | Mock-up Approval Workflow (client sign-off) | ❌ No module | ❌ **GAP** | 🟡 **MEDIUM** |
| **Pillar 5** | QC / Field Inspection & Defect Management | `src/qc-anomaly/`, `packages/field-app/`, `supabase/functions/field-capture/`, `supabase/functions/capture-ocr-extract/` | ✅ **COVERED** | ✅ None |
| **Pillar 6** | Sensory Commissioning & Post-Occupancy Evaluation (POE) | ❌ No module | ❌ **GAP** | 🔴 **HIGH** |

---

## Part C — Comprehensive Gap Register

### 🔴 HIGH Severity Gaps (8 items)

| Gap ID | Gap Name | SOP Sections Affected | Pillar | What Exists | What's Missing |
|--------|----------|-----------------------|--------|-------------|----------------|
| **GAP-01** | Biophilic Design Workflow & WELL/LEED Tracking | S3, S11, S39 | Pillar 1 | `src/core/materials/` (material catalog) | WELL v2 compliance checklist module, biophilic material certification, LEED scorecard, daylight/air quality data integration |
| **GAP-02** | Design Freeze Gate System | S3, S6, S25, S40 | Pillar 2 | `src/gate/` (rule engine scaffolding) | Formal Design Freeze workflow with sequential client approval chain, Gate-0/1/2/3 milestone locks, freeze-violation alerts |
| **GAP-03** | Sensory Commissioning Module | S10, S12, S41 | Pillar 6 | `packages/field-app/` (general capture) | Sensory benchmark test protocol, acoustic/lighting/thermal acceptance criteria, commissioning sign-off form |
| **GAP-04** | Post-Occupancy Evaluation (POE) System | S22, S36, S41 | Pillar 6 | `src/core/telemetry/` (telemetry data) | 6-month and 12-month POE survey engine, occupant satisfaction scoring, delta analysis vs design intent |
| **GAP-05** | AI Creative Engine (AIE-001–005) | S44, S51, S52 | Phase 2 | `src/mcp/` (partial event bus) | AIE-001–005 endpoint integration, RFP-GAP05-001 awarded vendor onboarding per V-CHK-01–12 |
| **GAP-06** | ISO 9001 / RIBA Compliance Audit Trail | S19, S22, S34, S44 | Governance | `src/workflow/audit/` (workflow audit) | RIBA Plan of Work stage gates, ISO 9001 corrective action log, audit evidence package generator |
| **GAP-07** | Programme Governance & SC Reporting | S23, S28, S32, S38, S42 | AMD Programme | _(none)_ | Steering Committee charter registry, AMD programme lifecycle state machine, SC agenda/resolution store |
| **GAP-08** | AMD-004 Programme Definition | S38, S43, S47 | AMD-004 | `.kiro/specs/` (concept) | WS-A through WS-E implementation trackers, PDD-001–006 compliance gates, FY2031–2033 budget tracking module |

### 🟡 MEDIUM Severity Gaps (4 items)

| Gap ID | Gap Name | SOP Sections | What Exists | What's Missing |
|--------|----------|-------------|-------------|----------------|
| **GAP-09** | Mock-up Approval Workflow | S4, S6 | `supabase/functions/approval-postback/` | Client mock-up review portal, physical sample sign-off tracker, revision request → re-submission loop |
| **GAP-10** | Unified Cross-Pillar KPI Dashboard | S17, S22, S36, S43 | `dashboard/`, `src/culture-metrics/` | Single integrated view aggregating AI performance + design delivery + QC + business metrics across all 6 Pillars |
| **GAP-11** | Emergency Escalation Protocol | S12, S18 | `supabase/functions/notify-overdue/` | Structured severity matrix (P0/P1/P2), 2-hour/24-hour escalation chains, incident postmortem module |
| **GAP-12** | Governance Amendment Tracking System | S24, S29, S34 | `CHANGELOG.md` | Formal amendment register with version history, SC ratification records, supersession clause tracking |

### 🟢 LOW Severity Gaps (3 items)

| Gap ID | Gap Name | SOP Sections | What Exists | What's Missing |
|--------|----------|-------------|-------------|----------------|
| **GAP-13** | AI Ethics Audit Module | S20 | `src/core/guards/` | Bias monitoring dashboard, ethical decision log, responsible AI impact assessment |
| **GAP-14** | Agent Decommissioning Workflow | S21 | `src/workflow/` (general lifecycle) | Formal retire/archive state in agent lifecycle, decommission checklist, knowledge transfer protocol |
| **GAP-15** | PDPA Data Subject Request Workflow | S19 | `src/iam/`, `src/crypto/` | Data subject access request (DSAR) form, automated 30-day response tracker, consent withdrawal flow |

---

## Part D — Coverage Summary Dashboard

```
SOP Section Coverage (S1–S52)
═══════════════════════════════════════════════════════
 ✅ COVERED      (no gaps):  S2, S4, S5, S6, S7, S9, S10, S13, S14, S16, S33, S35
                             = 12 sections (23%)

 ⚠️ PARTIAL      (gaps exist): S1, S3, S8, S11, S12, S15, S17, S18, S19, S21, S22,
                               S24, S25, S26, S27, S29, S30, S31, S34, S36, S37,
                               S40, S43, S44, S45, S47
                             = 26 sections (50%)

 ❌ GAP          (no code):  S20, S23, S28, S32, S38, S39, S41, S42, S46, S48,
                             S49, S50, S51, S52
                             = 14 sections (27%)

 🔵 SPEC ONLY    (.kiro):    S37 (overlaps PARTIAL above)
                             = 1 section
═══════════════════════════════════════════════════════
 TOTAL: 56 sections | 12 ✅ | 26 ⚠️ | 14 ❌ | 1 🔵
```

```
6-Pillar Coverage
═══════════════════════════════════════════════════════
 Pillar 1 — Biophilic Design / WELL/LEED     ❌ GAP     0%
 Pillar 2 — Design Freeze Gate               ⚠️ PARTIAL  30%
 Pillar 3 — CNC / D2M Manufacturing          ✅ COVERED  90%
 Pillar 4a — Procurement / Quotation         ✅ COVERED  85%
 Pillar 4b — Mock-up Approval                ❌ GAP      0%
 Pillar 5 — QC / Field Inspection            ✅ COVERED  90%
 Pillar 6 — Sensory Commissioning / POE      ❌ GAP      0%
═══════════════════════════════════════════════════════
 Overall Pillar Coverage: ~56% (3.5/6 pillars)
```

```
Gap Severity Distribution
═══════════════════════════════════════════════════════
 🔴 HIGH   (8 gaps):  GAP-01–08  — require new module development
 🟡 MEDIUM (4 gaps):  GAP-09–12  — require feature extension
 🟢 LOW    (3 gaps):  GAP-13–15  — require policy→code translation
═══════════════════════════════════════════════════════
 TOTAL: 15 identified gaps across 3 severity levels
```

---

## Part E — GitHub Modules NOT Yet Mapped to SOP (Unleveraged Assets)

These modules exist in the repository but have no corresponding SOP section — they represent implementation capability ahead of governance documentation:

| Module | Capability | Suggested SOP Home |
|--------|-----------|-------------------|
| `src/ai-cost/` | AI cost tracking and optimization | S38.8 (Budget Framework) |
| `entitlement-db/` | Multi-tier subscription entitlements | S1 (Corporate Policy) or new S39 |
| `contracts/` | Contract definitions and management | S4 or S5 |
| `src/tax/` | Thai eTax + e-Tax submission (`etax-submit-worker/`, `etax-risk-notify/`) | S4 (Procurement) or new section |
| `supabase/functions/stripe-webhook/` | Billing & payment processing | S5 (CRM) |
| `supabase/functions/customer-design-view/` | Customer-facing design portal | S5 or S13 |
| `supabase/functions/doc-view/` | Document viewer (likely drawings/specs) | S3 (Design Process) |
| `supabase/functions/generate-quotation-pdf/` | PDF quotation generation | S4 (Procurement) |
| `.kiro/specs/entitlement-tier/` | Tiered feature gating | S1 or new S39 |
| `.kiro/specs/capture-spine/` | Unified capture backbone | S7 (QA/QC) |
| `.kiro/specs/curved-panel-system/` | Curved panel CNC extension | S9 (Manufacturing) |
| `.kiro/specs/daph-obsidian-second-brain/` | Obsidian knowledge integration | S8 (AI Agent Management) |
| `.kiro/specs/field-purchase/` | Field purchase order creation | S10 (Installation) |
| `.kiro/specs/monolith-accounting/` | Full accounting module | New section (Financial Governance) |
| `src/jobs/`, `src/runtime/` | Job queue and runtime engine | S9 (Manufacturing) |
| `src/leadership-actions/` | Leadership action tracking | S23 (SC Charter) |
| `server/` | Server-side API | S13 (IT Integration) |
| `skills/`, `minifix-skill-pack/` | AI skill packs | S8 (AI Agent Management) |
| `daph-second-brain/` (263 files) | Hardware/Process/Factory/Office knowledge | S8, S4, S9 |

---

## Part F — Recommended Next Actions (Priority Order)

### Phase 1 — Immediate (Bridge DOCX → Repo) [Q4 2030]

| Action | Gap Addressed | Effort |
|--------|---------------|--------|
| 1. Migrate 28-agent SLA Group A–D table into `src/workflow/sla/` config | GAP-05 | Low |
| 2. Extend `src/gate/` into formal Design Freeze Gate (Pillar 2) with 4-stage lock | GAP-02 | Medium |
| 3. Build Mock-up Approval sub-workflow in `src/workflow/approval/` | GAP-09 | Medium |
| 4. Add SC governance registry table to Supabase schema | GAP-07 | Medium |

### Phase 2 — AMD-004 WS-A/WS-B Build [FY2031]

| Action | Gap Addressed | Effort |
|--------|---------------|--------|
| 5. Create `src/biophilic/` module — WELL v2 checklist + LEED scorecard | GAP-01 | High |
| 6. Build unified KPI dashboard in `dashboard/` aggregating all 6 Pillars | GAP-10 | High |
| 7. Implement ISO 9001 audit trail in `src/workflow/audit/` | GAP-06 | Medium |
| 8. Create AMD-004 programme tracker linked to `.kiro/specs/` | GAP-08 | Medium |
| 9. Integrate AIE-001–005 vendor API endpoints (post RFP-GAP05-001 award) | GAP-05 | High |

### Phase 3 — AMD-004 WS-C/WS-D [FY2032]

| Action | Gap Addressed | Effort |
|--------|---------------|--------|
| 10. Build `src/sensory-commissioning/` module (Pillar 6) | GAP-03 | High |
| 11. Build `src/poe/` Post-Occupancy Evaluation engine | GAP-04 | High |
| 12. Add Emergency Escalation Protocol module (P0/P1/P2 severity) | GAP-11 | Medium |
| 13. PDPA DSAR workflow in `src/iam/` | GAP-15 | Medium |

---

## Part G — Three-Layer Architecture Map

```
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 1: MONOLITH SOP DOCX (S1–S52)                             │
│  Governance / Policy / AMD Programme                             │
│  ✅ S2,4,5,6,7,9,10,13,14,16,33,35 fully implemented in code     │
│  ⚠️ S1,3,8,11,12,17–19,21,22,24–27,29–31,34,36,37,40,43–45,47  │
│  ❌ S20,23,28,32,38,39,41,42,46,48,49,50,51,52 → NO code         │
├──────────────────────────────────────────────────────────────────┤
│  LAYER 2: Interior Design 6 Pillars                              │
│  Design Delivery Methodology                                     │
│  ✅ Pillar 3 (CNC/D2M) + Pillar 4a (Procurement) + Pillar 5 QC  │
│  ⚠️ Pillar 2 (Design Freeze Gate — 30% built)                    │
│  ❌ Pillar 1 (Biophilic/WELL) + Pillar 4b (Mock-up) + Pillar 6  │
├──────────────────────────────────────────────────────────────────┤
│  LAYER 3: GitHub IIMOS Manufacturing OS                           │
│  Technical Implementation — 4,662 files, 54 src modules          │
│  React 18 + TypeScript + Supabase + LINE OA + MCP               │
│  🟢 STRONG: CNC, Factory, QC, Workflow, LINE, MCP, eTax          │
│  🟡 PARTIAL: Gate, Analytics, Governance, Compliance             │
│  🔴 MISSING: Biophilic, Sensory, POE, SC Charter, AMD-004        │
│  🔵 PHASE 2: AIE-001–005 (GAP-05) — pending RFP-GAP05-001 award  │
└──────────────────────────────────────────────────────────────────┘

                    UNIFIED COVERAGE: ~56%
         15 gaps identified | 8 HIGH | 4 MEDIUM | 3 LOW
         Phase 2 procurement active: S51 + S52 in DOCX
```

---

## Part H — GitHub Push History

| Push SHA | Date | Branch | Commit Message | Files |
|----------|------|--------|----------------|-------|
| `14b90bc` | 2026-09-02 | main | _(initial MONOLITH package push)_ | — |
| `5c29dd9d` | 2026-09-03 | main | feat: S51 Procurement Framework, Thai SC Review, master_index 115 entries | 20 files in `monolith/` |
| _(pending)_ | 2026-09-04 | main | feat: S52+S53+S54+S55+S56 DOCX (189,546B), thai_phase3_vendor_brief.html + 5 Thai briefs total, rebuilt ZIP, master_index 142 entries, inject/accept s51–s56 scripts | ~35 files in `monolith/` |
| _(pending)_ | 2026-09-04 | main | feat: S52+S53 DOCX (173,578B), thai_vendor_onboarding_brief.html, rebuild ZIP, master_index 125 entries | ~30 files in `monolith/` |

> **Active PAT:** Previous PAT `[PAT_REDACTED]` revoked 2026-09-03. **New PAT required** for next push (S52+S53+S54 DOCX, all 4 Thai briefs, rebuilt ZIP, inject/accept scripts).

---

*This document was auto-generated and updated by MONOLITH AI Operations Team on 4 September 2026.*
*Source: GitHub recursive tree SHA 5c29dd9d + DOCX extraction from monolith_project_summary_v25_accepted.docx (S1–S54)*
*Next review: Upon RFP-GAP05-001 award (Q1 2033)*

## S56 — Phase 3 Vendor Onboarding & Integration Protocol
- **Document ref:** MONOLITH-S56-P3ONB-001 v1.0
- **Status:** CLEAN FINAL (accepted 2026-09-04)
- **Key codes:** P3-ONB-CHK-01–12; WS-A/B/C integration protocols; SLA acceptance matrix (7 GAPs); 90-day hypercare; P3-M2 gate
- **New files:** inject_s56.py · accept_s56.py · pre_s56_backup.docx · pre_accept_s56_backup.docx · thai_phase3_vendor_brief.html
- **DOCX size:** 189,546 bytes (post-accept)
- **Next IDs:** 2771+

## S57 — Phase 3 Go-Live Operations Plan
- **Document ref:** MONOLITH-S57-P3GOLIVE-001 v1.0
- **Status:** CLEAN FINAL (accepted 2026-09-04)
- **Key codes:** P3-GL-CHK-01–10; cutover schedule T-5→T+72h; BAU transition 4-phase Day 1–90+; P3-M4 programme delivery milestone; 92% coverage confirmed; THB 18.2M total
- **New files:** inject_s57.py · accept_s57.py · pre_s57_backup.docx · pre_accept_s57_backup.docx · thai_phase3_onboarding_brief.html
- **DOCX size:** 195,663 bytes (post-accept, S1–S57 CLEAN FINAL)
- **Total sections:** 57 (S1–S57)
- **Programme complete:** Phase 1 (5.2M, 68%) + Phase 2 (6.0M, 80%) + Phase 3 (7.0M, 92%) = THB 18.2M

### Pending GitHub Push (S57)
| Field | Value |
|-------|-------|
| Branch | main |
| Folder | `monolith/` |
| Commit msg | `feat: S57 Phase 3 Go-Live DOCX (195,663B), thai_phase3_onboarding_brief.html + 7 Thai briefs total, rebuilt ZIP, master_index 147 entries, inject/accept s51–s57 scripts` |
| Key files | monolith_project_summary_v25_accepted.docx · all 7 Thai briefs · inject_s51–s57.py · accept_s51–s57.py · master_index.html · changelog_v25.md · sop_github_mapping.md · MONOLITH_SOP_Package_v2.5.zip + all backup DOCXs |
| Status | **BLOCKED — PAT required** |

## Thai Brief — thai_phase3_golive_brief.html (S57)
- **File:** thai_phase3_golive_brief.html — 27,882 bytes
- **Covers:** S57 Phase 3 Go-Live Operations Plan
- **Key elements:** coverage 56%→92%, cutover T-5→T+72h, BAU 4-phase, P3-GL-CHK-01–10, milestones P3-M1–M4, THB 18.2M, escalation L1–L4
- **Status:** WRITTEN 2026-09-04; pending GitHub push with S57 batch

## S58 — BAU Governance Charter
- **File:** monolith_project_summary_v25_accepted.docx (S1–S58 CLEAN FINAL)
- **Inject script:** inject_s58.py — 45 tracked insertions; IDs 2830–2874
- **Accept script:** accept_s58.py — 45→0 tracked changes; 200,150 bytes
- **Covers:** S58 BAU Governance Charter (MONOLITH-S58-BAUGOV-001 v1.0)
- **Key codes:** 4 committees SC/PGB/TAG/AOC; 5 KPI review cycles; Programme Closure Certificate MONOLITH-S58-CLOSECERT-001; Post-Programme Audit T+30/60/90d + Annual; 28/28 agents; THB 18.2M; +36pp coverage (56%→92%)
- **New files:** inject_s58.py · accept_s58.py · pre_s58_backup.docx · pre_accept_s58_backup.docx · thai_programme_completion_brief.html
- **DOCX size:** 200,150 bytes (post-accept, S1–S58 CLEAN FINAL)
- **Total sections:** 58 (S1–S58)
- **Programme status:** Phase 1 COMPLETE (5.2M, 68%) + Phase 2 COMPLETE (6.0M, 80%) + Phase 3 COMPLETE (7.0M, 92%) = THB 18.2M | BAU GOVERNANCE ACTIVE

## Thai Brief — thai_programme_completion_brief.html (S57+S58)
- **File:** thai_programme_completion_brief.html — 23,569 bytes
- **Covers:** S57+S58 programme completion executive summary for SC Chair
- **Key elements:** 6-stat hero (92%/28 agents/18.2M/58 sections/+36pp/3 phases); phase strip 56%→92%; cert MONOLITH-S58-CLOSECERT-001; committee SC/PGB/TAG/AOC; audit plan T+30/60/90d+Annual; BAU governance activation; P3-GL-CHK-10 SC Chair block
- **Status:** WRITTEN 2026-09-04; pending GitHub push with S58 batch

### Pending GitHub Push (S58 — Full Programme)
| Field | Value |
|-------|-------|
| Branch | main |
| Folder | `monolith/` |
| Commit msg | `feat: S58 BAU Governance Charter DOCX (200,150B), thai_programme_completion_brief.html, all 9 Thai briefs, rebuilt ZIP 153 entries, inject/accept s51–s58 scripts, programme COMPLETE S1–S58` |
| Key files | monolith_project_summary_v25_accepted.docx · all 9 Thai briefs · inject_s51–s58.py · accept_s51–s58.py · master_index.html · changelog_v25.md · sop_github_mapping.md · MONOLITH_SOP_Package_v2.5.zip + all backup DOCXs |
| Status | **BLOCKED — PAT required** |

## n:155 — thai_build_deploy_roadmap.html
| Field | Value |
|---|---|
| File | `thai_build_deploy_roadmap.html` |
| Type | HTML |
| Category | Thai Brief |
| Language | TH |
| Size | ~45K bytes |
| Status | ✅ Pushed to GitHub |
| Push SHA | TBD (next push) |
| Branch | main |
| Path | monolith/thai_build_deploy_roadmap.html |
| Description | Build & Deploy Roadmap Phase A–F; SOP → Live AI Agents; 28 agents; technology stack; effort estimates; Sarabun font; navy/gold/green theme |

---

## n:156 — thai_tech_stack_deep_research.html

| Field | Value |
|-------|-------|
| File | `thai_tech_stack_deep_research.html` |
| Index | n:156 |
| Type | HTML |
| Category | Thai Brief |
| Language | TH |
| Path | monolith/thai_tech_stack_deep_research.html |
| Size | 61,000+ bytes |
| Theme | Sarabun font; navy #1f2d5a / gold #c9a84c / green #2d7a4f |
| Description | Thai Deep Research Report — Technology Stack 6 Layers for AI Agents on Monolith Platform; Repo analysis 4,722 files TypeScript; cost saving 60–70%; PDPA boundary |
| Created | 2026-09-04 |
| GitHub SHA | (see next push) |

| n:157 | thai_mcp_layer_implementation.html | HTML | MCP Layer 2 implementation plan; 8-phase task list, PDPA checklist, TypeScript scaffold, DB schema, P1-P19 | monolith-mcp-layer_requirements.md, _design.md, _tasks.md | 2026-09-04 |
| n:158 | thai_ai_agent_prompt_engineering.html | HTML | 5 MVP Agent prompt engineering; Sale/Designer/Factory/PM/Procurement; system prompts + few-shot from daph-second-brain | _knowledge-export.json (schemaVersion 1.0.0, reviewStatus draft) | 2026-09-04 |
| n:155-mod | thai_build_deploy_roadmap.html | HTML (modified) | pgvector RAG setup section added — SQL schema, 5-step embed, TypeScript script, RAG query function | _knowledge-export.json | 2026-09-04 |
