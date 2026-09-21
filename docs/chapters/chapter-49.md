---
num: 49
title: "Customer Feedback & Analytics Module"
phase: "Phase 12"
phase_num: 12
mcp_tools: 3
status: complete
dependencies: "Phase 7, Phase 11"
---

# Chapter 49: Customer Feedback & Analytics Module (Phase 12)  
  
## 49.1 Overview

The Customer Feedback & Analytics Module captures, processes, and analyses customer satisfaction signals across all touchpoints. It implements a three-metric feedback framework (CSAT, NPS, CES), automatic sentiment analysis, and topic extraction — feeding into the CRM performance reporting pipeline.

The module closes the operational loop: production data drives order quality, which drives ticket volume, which drives CSAT/NPS scores, which are analysed here to identify root-cause improvement areas — all within the Monolith platform.

**Module scope:** 3 MCP tools, STARTER/PROFESSIONAL plan tiers, zero external NLP dependency (rule-based topic extraction with scoring-based sentiment classification).

## 49.2 Feedback Metrics Framework

Metric | Scale | Measures | Calculation  
---|---|---|---  
CSAT (Customer Satisfaction) | 1-5 stars | Post-interaction satisfaction | % responses rating 4-5  
NPS (Net Promoter Score) | 0-10 | Loyalty and advocacy likelihood | % Promoters (9-10) − % Detractors (0-6)  
CES (Customer Effort Score) | 1-7 | Ease of getting help (lower = easier) | Mean CES score  
  
NPS segment classification:

  * **Promoters** (9-10): Loyal customers, likely to recommend
  * **Passives** (7-8): Satisfied but neutral
  * **Detractors** (0-6): Dissatisfied, at-risk of churn; trigger follow-up alert



## 49.3 Tool Reference

### 49.3.1 collect_customer_feedback

**Purpose:** Collect and store customer feedback from multiple channels with automatic sentiment classification and topic extraction.

**Actions:**

Action | Description  
---|---  
`submit` | Record single feedback entry; auto-classifies sentiment and topics  
`get` | Retrieve single feedback entry by ID  
`list` | List entries with sentiment/channel filters  
`bulk_import` | Import CSV/API batch of feedback records  
  
**Supported Channels:** email, portal, phone, in_app, survey, social

**Sentiment Classification Logic:**

Sentiment is derived from the highest-confidence signal available:

  1. If NPS provided: `sentimentScore = (npsScore - 5) / 5` → range [-1.0, +1.0]
  2. If CSAT provided: `sentimentScore = (csatScore - 3) / 2` → range [-1.0, +1.0]
  3. `positive` if score > 0.2, `negative` if score < -0.2, else `neutral`



**Topic Extraction:** Rule-based keyword matching against a topic dictionary (installation, support, quality, billing, dxf_export, ui, production). Topics feed the `analyze_feedback_trends` clustering pipeline.

**NPS Detractor Alert:**

When `npsScore ≤ 6`, the response includes:
[code] 
    { "alert": "NPS Detractor detected — flagged for follow-up" }
    
[/code]

This triggers the Phase 4 Notification Module to assign a follow-up task to the account manager within 48 hours.

### 49.3.2 analyze_feedback_trends

**Purpose:** Identify patterns in feedback data using sentiment trend analysis, topic clustering, NPS driver decomposition, CSAT heatmaps, and channel effectiveness comparison.

**Analysis Types:**

Type | Description  
---|---  
`sentiment_trend` | Weekly sentiment scores + period-over-period change  
`topic_clustering` | Top topics by mention count, sentiment avg, trend direction  
`nps_drivers` | Promoter/passive/detractor breakdown + common themes per segment  
`csat_heatmap` | CSAT score by hour-of-day and day-of-week  
`channel_comparison` | CSAT/NPS/response rate by feedback channel  
  
**Topic Trend Classification:**

  * `rising` — mention count up > 20% vs previous period
  * `declining` — mention count down > 20% vs previous period
  * `stable` — within ±20% of previous period



**Actionable Insights:** Every analysis response includes a ranked list of improvement recommendations derived from the analysis output — e.g., "DXF export accuracy issues rising — assign engineering ticket."

### 49.3.3 generate_crm_report

**Purpose:** Generate comprehensive CRM performance reports combining ticket resolution KPIs with CSAT/NPS/CES metrics, agent performance rankings, and customer retention analysis.

**Report Types:**

Type | Key Content  
---|---  
`executive_summary` | 8 KPIs with status, top issue, strategic recommendation  
`ticket_resolution` | Total/resolved counts, avg resolution time, FCR rate  
`agent_performance` | Ranked agents by CSAT, resolved count, SLA breaches, FCR  
`customer_satisfaction` | CSAT/NPS/CES breakdown with period comparisons  
`channel_effectiveness` | Per-channel ticket volume, CSAT, and resolution time  
`retention_analysis` | Retention/churn rate, at-risk customers, recovery actions  
  
**At-Risk Customer Detection:**

The `retention_analysis` report flags customers with `riskScore > 0.7` based on composite signals:

  * Multiple unresolved tickets (> 2)
  * Low NPS score (≤ 4)
  * Multiple billing complaints
  * Extended inactivity (no contact > 14 days)



## 49.4 Feedback Collection Flow
[code] 
    Customer Interaction
            │
            ↓
    collect_customer_feedback (submit)
            │
            ├─→ Sentiment Score Calculation
            │         (NPS/CSAT/CES → [-1.0, +1.0])
            │
            ├─→ Topic Extraction
            │         (keyword match → topic tags)
            │
            ├─→ NPS Detractor Check
            │         (score ≤ 6 → Phase 4 alert)
            │
            └─→ Feedback DB (append)
                      │
                      ↓
            analyze_feedback_trends  ←── Scheduled nightly
                      │
                      ↓
            generate_crm_report  ←── On-demand / Monthly
    
[/code]

## 49.5 KPI Baselines (Phase 12 Demo Data)

KPI | Baseline Value | Target  
---|---|---  
CSAT Score | 4.4 / 5.0 | ≥ 4.5  
NPS | 52 | ≥ 60  
CES | 2.8 / 7.0 | ≤ 2.5  
First Contact Resolution (FCR) | 74.2% | ≥ 80%  
Avg Resolution Time | 14.3h | ≤ 12h  
SLA Compliance | 94.8% | ≥ 97%  
Detractor Follow-up Rate | 100% | 100%  
Retention Rate | 94.7% | ≥ 96%  
  
## 49.6 Unit Tests

**collect_customer_feedback (7 tests):**

  1. Submit NPS=9 → sentimentLabel=positive, alert=null
  2. Submit NPS=3 → sentimentLabel=negative, alert contains "Detractor"
  3. Submit with feedbackText mentioning "DXF export" and "installation" → topics contain both
  4. List → returns avgCsat, avgNps, sentimentBreakdown, entries array
  5. List with sentimentFilter=positive → all entries are positive
  6. Get single entry → returns feedback object with feedbackId
  7. Bulk import → returns imported > 0



**analyze_feedback_trends (4 tests):**

  1. topic_clustering → topicInsights array with trend and sentimentAvg fields
  2. nps_drivers → promoters/passives/detractors, npsScore=52
  3. csat_heatmap → byHour (24 entries), byDayOfWeek (7 entries)
  4. Any type → includes actionableInsights array



**generate_crm_report (4 tests):**

  1. executive_summary → kpis array, has recommendation field
  2. agent_performance → agents array, first agent has rank=1
  3. retention_analysis → retentionRate, atRiskCustomers with riskScore
  4. ticket_resolution → data.ticketResolutionStats present



## 49.7 Integration Points

Integrated With | Integration Type | Description  
---|---|---  
CRM Management (Ch 48) | Upstream | Ticket resolution triggers CSAT survey submission  
Phase 11 Audit Trail | Consumer | All feedback submissions logged as data events  
Phase 4 Notification | Consumer | Detractor alerts → 48h follow-up task creation  
Phase 3 Customer Portal | Provider | Customers submit feedback via portal survey widget  
Phase 5 AI Module | Consumer | analyze_feedback_trends feeds AI recommendation engine  
Phase 8 Financial | Cross-reference | Retention analysis cross-refs billing dispute history  
  
## 49.8 Benchmark Results

Metric | Value  
---|---  
collect_customer_feedback (submit) | < 0.02 ms  
collect_customer_feedback (list, 100 entries) | < 0.03 ms  
analyze_feedback_trends (topic_clustering, 30 days) | < 0.05 ms  
generate_crm_report (executive_summary) | < 0.04 ms  
Concurrent load (100 users, Phase 12) | < 1.5 ms P99  
  
## 49.9 Persona Mapping — Phase 12

Persona | Primary Tools | Use Case  
---|---|---  
Sales Manager | generate_crm_report (retention_analysis) | Identify at-risk accounts for proactive outreach  
Support Team Lead | get_sla_dashboard | Monitor real-time SLA compliance and agent workload  
Support Agent | create_support_ticket, update_ticket_status | Day-to-day ticket handling and escalation  
Customer (via Portal) | collect_customer_feedback | Submit post-service satisfaction rating  
Operations Director | generate_crm_report (executive_summary) | Monthly CRM performance review  
Quality Manager | analyze_feedback_trends | Identify product/service quality gaps from customer signals  
Installation Technician | create_support_ticket (linked to project) | Log on-site issues and request engineering support
