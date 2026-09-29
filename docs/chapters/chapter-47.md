---
num: 47
title: "Regulatory Reporting Module"
phase: 11
phase_label: "Phase 11"
phase_num: 11
mcp_tools: 3
status: complete
dependencies: "Phase 10"
---

# Chapter 47: Regulatory Reporting Module (Phase 11)  
  
## 47.1 Overview

The Regulatory Reporting module automates compliance report generation for Thai regulatory authorities (BOI, Revenue Department, DBD) and international standards (ISO 9001, ISO 27001, PDPA). It provides scheduled compliance checks with finding tracking, remediation workflows, and a real-time compliance dashboard.

### Module Summary

Attribute | Value  
---|---  
**Phase** | 11  
**Package** | `@monolith/mcp-server`  
**Source** | `src/tools/regulatory-reporting.ts`  
**Tools** | 3 (`create_regulatory_report`, `schedule_compliance_check`, `get_compliance_dashboard`)  
**Lines of Code** | ~393  
**Test Cases** | 10  
**Dependencies** | `zod`, `@modelcontextprotocol/sdk`  
  
### Supported Regulatory Bodies

Code | Authority | Frequency | Report Type  
---|---|---|---  
`boi` | Board of Investment Thailand | Annual | Operations, investment utilization  
`revenue_dept` | Revenue Department | Semi-annual | Tax filing, financial statements  
`dbd` | Department of Business Development | Annual | Financial statements, director changes  
`pdpa` | Personal Data Protection Act | Monthly | Data protection impact assessment  
`iso_9001` | ISO Quality Management | Quarterly | Quality management review  
`iso_27001` | ISO Information Security | Semi-annual | ISMS assessment  
`iso_14001` | ISO Environmental Management | Annual | Environmental impact report  
`osha` | Occupational Safety & Health | Quarterly | Workplace safety compliance  
  
## 47.2 Data Model

### RegulatoryReport
[code] 
    interface RegulatoryReport {
      reportId: string;
      regulatoryBody: RegulatoryBody;
      reportName: string;
      reportPeriod: string;
      generatedAt: string;
      dueDate: string;
      status: "draft" | "review" | "submitted" | "accepted" | "rejected";
      sections: ReportSection[];
      attachments: string[];
      submittedBy?: string;
      submittedAt?: string;
    }
    
[/code]

### ComplianceCheck
[code] 
    interface ComplianceCheck {
      checkId: string;
      framework: RegulatoryBody;
      scheduledAt: string;
      frequency: ReportFrequency;    // monthly | quarterly | semi_annual | annual | on_demand
      controlsTotal: number;
      controlsPassed: number;
      controlsFailed: number;
      complianceScore: number;       // 0–100
      lastRunAt?: string;
      nextRunAt: string;
      findings: ComplianceFinding[];
    }
    
[/code]

### ComplianceFinding
[code] 
    interface ComplianceFinding {
      findingId: string;
      controlId: string;
      controlName: string;
      severity: "critical" | "high" | "medium" | "low";
      description: string;
      remediation: string;
      dueDate: string;
      assignedTo: string;
      status: "open" | "in_progress" | "resolved" | "accepted_risk";
    }
    
[/code]

### ComplianceDashboard
[code] 
    interface ComplianceDashboard {
      overallScore: number;
      frameworks: FrameworkStatus[];
      upcomingDeadlines: Deadline[];
      openFindings: number;
      criticalFindings: number;
      recentReports: RecentReport[];
    }
    
[/code]

## 47.3 Regulatory Report Workflow
[code] 
    Step 1: Schedule              Step 2: Generate           Step 3: Review
    ┌──────────────────┐    ┌──────────────────────┐    ┌──────────────────┐
    │schedule_compliance│    │ create_regulatory_   │    │ Internal Review  │
    │_check             │───▶│ report               │───▶│ & Approval       │
    │ (set frequency)   │    │ (auto-populate data) │    │                  │
    └──────────────────┘    └──────────────────────┘    └────────┬─────────┘
                                                                 │
    Step 6: Track              Step 5: Submit           Step 4: Sign
    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
    │get_compliance_   │◀───│ Submit to        │◀───│ E-Signature      │
    │dashboard         │    │ Regulatory Body  │    │ (authorize)      │
    │ (monitor status) │    └──────────────────┘    └──────────────────┘
    └──────────────────┘
    
[/code]

## 47.4 Tool Schemas

### Tool 1: create_regulatory_report

Parameter | Type | Required | Description  
---|---|---|---  
`regulatoryBody` | enum | Yes | Target authority: `boi`, `revenue_dept`, `dbd`, `pdpa`, `iso_9001`, `iso_27001`, `iso_14001`, `osha`, `custom`  
`reportPeriod` | string | Yes | Reporting period (e.g., "2026-Q3")  
`reportName` | string | No | Custom report name  
`includeFinancials` | boolean | No | Include financial summary section  
`includeProduction` | boolean | No | Include operational overview  
`includeHr` | boolean | No | Include workforce summary  
`format` | enum | No | `json`, `pdf`, `xlsx`  
`language` | enum | No | `th` (Thai), `en` (English)  
  
**Auto-populated sections:**

Section | Data Source | Key Metrics  
---|---|---  
Executive Summary | System aggregation | Period, framework, generation date  
Operational Overview | Production module | Orders, OEE, capacity utilization, defect rate  
Financial Summary | Financial module | Revenue, costs, profit, VAT, withholding tax  
Workforce Summary | HR module | Headcount, hires, terminations, training, safety  
  
### Tool 2: schedule_compliance_check

Parameter | Type | Required | Description  
---|---|---|---  
`action` | enum | Yes | `schedule`, `run_now`, `list_checks`, `update_finding`  
`framework` | enum | No | Regulatory framework to check  
`frequency` | enum | No | `monthly`, `quarterly`, `semi_annual`, `annual`, `on_demand`  
`checkId` | string | No | Existing check ID for run/update  
`findingId` | string | No | Finding ID for status updates  
`findingUpdate` | object | No | `{ status, assignedTo, notes }`  
  
**Actions:**

Action | Purpose | Output  
---|---|---  
`schedule` | Create recurring compliance check | Check ID, frequency, next run date  
`run_now` | Execute immediate compliance assessment | Compliance score, passed/failed controls, findings  
`list_checks` | List all scheduled checks with scores | Check list, next due dates  
`update_finding` | Update finding status/assignment | Updated finding with audit trail  
  
### Tool 3: get_compliance_dashboard

Parameter | Type | Required | Description  
---|---|---|---  
`tenantId` | string | No | Tenant identifier  
`includeDetails` | boolean | No | Include detailed framework breakdowns  
  
**Dashboard data:**

Section | Content  
---|---  
Overall Score | Weighted average compliance score (0–100)  
Framework Status | Per-framework score, controls passed/total, last/next assessment  
Upcoming Deadlines | Report due dates with days remaining and risk status  
Open Findings | Total and critical finding counts  
Recent Reports | Last submitted reports with acceptance status  
  
## 47.5 Compliance Framework Detail

### ISO 9001 Quality Management

Control Area | Controls | Description  
---|---|---  
Document Control | 8 | Version management, approval workflows  
Process Monitoring | 12 | Production KPIs, defect tracking  
Corrective Actions | 6 | Non-conformance handling  
Management Review | 4 | Quarterly review documentation  
Internal Audit | 5 | Audit schedule and findings  
Customer Feedback | 4 | Complaint resolution tracking  
Training Records | 3 | Competency verification  
**Total** | **42** |   
  
### PDPA Data Protection

Control Area | Controls | Description  
---|---|---  
Data Inventory | 5 | Personal data mapping, purpose limitation  
Consent Management | 4 | Consent collection, withdrawal tracking  
Access Controls | 6 | RBAC, minimum privilege, access logging  
Data Subject Rights | 5 | Access, correction, deletion, portability  
Breach Notification | 3 | Detection, assessment, reporting (72-hour)  
Privacy Impact | 3 | DPIA for new processing activities  
Cross-border Transfer | 2 | Adequate protection verification  
**Total** | **28** |   
  
## 47.6 Test Coverage

Test File | Test Cases | Coverage  
---|---|---  
`regulatory-reporting.test.ts` | 10 | create_regulatory_report (4), schedule_compliance_check (4), get_compliance_dashboard (2)  
  
### Key Test Scenarios

**create_regulatory_report (4 tests):**

  1. BOI report with all sections → returns 4 sections (exec, ops, financial, HR)
  2. ISO 9001 report without financials → returns 2 sections
  3. PDPA report with Thai language → returns language=th
  4. Custom report with custom name → returns provided name



**schedule_compliance_check (4 tests):**

  1. Schedule quarterly ISO 9001 check → returns check ID, next run date
  2. Run immediate check → returns score, findings
  3. List all checks → returns 4 checks with scores
  4. Update finding status → returns updated finding with audit trail



**get_compliance_dashboard (2 tests):**

  1. Default dashboard → returns overall score, 5 frameworks, deadlines
  2. Dashboard with details → returns extended framework breakdowns



## 47.7 Integration Points

Integrated With | Integration Type | Description  
---|---|---  
Audit Trail | Data Source | Compliance checks logged as audit events  
Financial Module | Data Source | Revenue/cost/tax data for regulatory reports  
HR Module | Data Source | Workforce data for BOI/OSHA reports  
Production Module | Data Source | OEE, defect rate for ISO 9001 reports  
E-Signature | Workflow | Sign and authorize report submissions  
Notification Module | Consumer | Alert on upcoming deadlines and finding due dates  
Customer Portal | Publishing | Share compliance certificates with customers  
  
## 47.8 Benchmark Results

Metric | Value  
---|---  
create_regulatory_report (4 sections) | < 0.10 ms  
schedule_compliance_check (schedule) | < 0.05 ms  
schedule_compliance_check (run_now, 42 controls) | < 0.15 ms  
get_compliance_dashboard | < 0.05 ms  
Concurrent load (25 users) | < 1.0 ms P99  
  
## 47.9 Dashboard Example
[code] 
    ┌─────────────────────────────────────────────────────────────┐
    │ Compliance Dashboard                    Overall Score: 95.7 │
    ├─────────────────────────────────────────────────────────────┤
    │ Framework       │ Score │ Status             │ Next Review   │
    │─────────────────│───────│────────────────────│───────────────│
    │ ISO 9001        │ 95.2  │ ✓ Compliant        │ 2026-12-01   │
    │ PDPA            │ 98.1  │ ✓ Compliant        │ 2026-10-15   │
    │ BOI             │ 92.8  │ △ Partial           │ 2027-06-01   │
    │ ISO 27001       │ 96.5  │ ✓ Compliant        │ 2027-01-01   │
    │ Revenue Dept    │100.0  │ ✓ Compliant        │ 2027-03-31   │
    ├─────────────────────────────────────────────────────────────┤
    │ Open Findings: 4  │  Critical: 0  │  Upcoming: PDPA Oct 15 │
    └─────────────────────────────────────────────────────────────┘
    
[/code]

## 47.10 Persona Mapping — Phase 11

Persona | Tools Used | Primary Actions  
---|---|---  
**Compliance Officer** | All 6 tools | Schedule checks, generate reports, monitor dashboard  
**Factory Manager** | get_compliance_dashboard, query_audit_log | Monitor ISO 9001 compliance, review production audit  
**HR Manager** | create_regulatory_report, get_compliance_dashboard | Generate OSHA/BOI workforce reports  
**Finance Manager** | create_regulatory_report, query_audit_log | Generate tax reports, audit financial transactions  
**IT Security** | manage_audit_trail, generate_audit_report | Verify chain integrity, access review, incident timeline  
**Installation Technician** | query_audit_log | View own field activity audit log  
**Management** | get_compliance_dashboard | Executive compliance overview
