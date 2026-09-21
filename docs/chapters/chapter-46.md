---
num: 46
title: "Compliance & Audit Trail Module"
phase: "Phase 11"
phase_num: 11
mcp_tools: 3
status: complete
dependencies: "Phase 10"
---

# Chapter 46: Compliance & Audit Trail Module (Phase 11)  
  
## 46.1 Overview

The Compliance & Audit Trail module provides an **immutable, append-only audit log** with SHA-256 chain integrity verification, advanced query capabilities, and automated report generation for regulatory compliance. It supports BOI, ISO 9001, ISO 27001, PDPA, and Thai Revenue Department reporting requirements.

### Module Summary

Attribute | Value  
---|---  
**Phase** | 11  
**Package** | `@monolith/mcp-server`  
**Source** | `src/tools/compliance-audit.ts`  
**Tools** | 3 (`manage_audit_trail`, `query_audit_log`, `generate_audit_report`)  
**Lines of Code** | ~388  
**Test Cases** | 14  
**Dependencies** | `zod`, `@modelcontextprotocol/sdk`  
  
### Design Principles

  1. **Immutability** — Events are append-only with SHA-256 hash chain; no modification or deletion
  2. **PDPA Compliance** — PII masking built-in; configurable retention policies (30d–permanent)
  3. **Chain Integrity** — Cryptographic verification detects any tampering in the event chain
  4. **Multi-tenant Isolation** — Every audit event is tenant-scoped via Supabase RLS
  5. **Auditor-Friendly** — Pre-built report templates for BOI, ISO 9001, and PDPA auditors



## 46.2 Data Model

### AuditEvent
[code] 
    interface AuditEvent {
      eventId: string;           // Unique ID: AE-{timestamp}-{random}
      timestamp: string;         // ISO 8601
      tenantId: string;
      userId: string;
      userName: string;
      action: string;            // e.g. "document.create", "user.login"
      category: AuditEventCategory;
      severity: AuditSeverity;
      resourceType: string;
      resourceId: string;
      previousValue?: string;    // Before-value for change tracking
      newValue?: string;         // After-value for change tracking
      ipAddress: string;
      userAgent: string;
      sessionId: string;
      correlationId: string;     // Links related events across services
      outcome: "success" | "failure" | "denied";
      metadata: Record<string, unknown>;
      checksum: string;          // SHA-256 chain hash
    }
    
[/code]

### AuditEventCategory (10 categories)

Category | Description | Examples  
---|---|---  
`data_access` | Read operations on sensitive data | View customer records, export reports  
`data_modification` | Create/update/delete operations | Document creation, inventory adjustment  
`authentication` | Login/logout/session events | User login, password change, MFA  
`authorization` | Permission checks and role changes | Access denied, role assignment  
`system_config` | Configuration modifications | Retention policy change, feature toggle  
`document_lifecycle` | Document status transitions | Draft → Review → Approved → Published  
`signature_event` | E-signature actions | Signature request, signing, verification  
`financial_transaction` | Financial operations | Invoice creation, payment recording  
`hr_action` | HR management activities | Employee onboarding, leave approval  
`compliance_check` | Compliance assessment events | Audit run, finding resolution  
  
### AuditSeverity

Level | Use Case  
---|---  
`info` | Normal operations (default)  
`warning` | Unusual patterns requiring attention  
`critical` | Security events or policy violations  
`alert` | Immediate action required  
  
### AuditRetentionPolicy

Policy | Duration | Typical Use  
---|---|---  
`30d` | 30 days | Development/testing environments  
`90d` | 90 days | Operational logs  
`1y` | 1 year | Standard business records  
`3y` | 3 years | Default production retention  
`7y` | 7 years | BOI investment records, tax filings  
`permanent` | Indefinite | Legal holds, critical compliance data  
  
### AuditReport
[code] 
    interface AuditReport {
      reportId: string;
      reportType: "activity_summary" | "access_review" | "change_log"
                | "compliance_gap" | "incident_timeline";
      generatedAt: string;
      periodStart: string;
      periodEnd: string;
      totalEvents: number;
      criticalFindings: number;
      summary: string;
      sections: AuditReportSection[];
    }
    
[/code]

## 46.3 Audit Trail Architecture

### Chain Integrity Model
[code] 
    Event N-1                    Event N                      Event N+1
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │ eventId: AE-001 │    │ eventId: AE-002 │    │ eventId: AE-003 │
    │ timestamp: T1   │    │ timestamp: T2   │    │ timestamp: T3   │
    │ action: login   │───▶│ action: create  │───▶│ action: approve │
    │ checksum:       │    │ checksum:       │    │ checksum:       │
    │  SHA256(AE-001  │    │  SHA256(AE-002  │    │  SHA256(AE-003  │
    │  + T1 + prev)   │    │  + T2 + prev)   │    │  + T3 + prev)   │
    └─────────────────┘    └─────────────────┘    └─────────────────┘
    
[/code]

Each event's checksum includes the previous event's hash, creating an immutable chain. The `verify_integrity` action validates the entire chain for a given time range, reporting any broken links.

### Event Flow
[code] 
    User Action
        │
        ▼
    ┌──────────────────┐
    │ Governance Chain  │ ← Every tool call passes through
    │ Middleware        │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐    ┌──────────────────┐
    │ manage_audit_trail│───▶│ Append-Only Store │
    │ (log_event)      │    │ (PostgreSQL +     │
    └──────────────────┘    │  SHA-256 chain)   │
                            └──────────────────┘
                                   │
             ┌─────────────────────┼─────────────────────┐
             ▼                     ▼                     ▼
    ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
    │query_audit_log│    │generate_audit_   │    │ PII Masking  │
    │ (search/     │    │report            │    │ Engine       │
    │  aggregate)  │    │ (5 report types) │    │ (PDPA)       │
    └──────────────┘    └──────────────────┘    └──────────────┘
    
[/code]

## 46.4 Tool Schemas

### Tool 1: manage_audit_trail

Parameter | Type | Required | Description  
---|---|---|---  
`action` | enum | Yes | `log_event`, `configure_retention`, `verify_integrity`, `export_trail`  
`tenantId` | string | No | Tenant identifier (default: "default")  
`event` | object | Conditional | Required for `log_event` — includes action, category, severity, resourceType, resourceId  
`retentionPolicy` | enum | No | `30d`, `90d`, `1y`, `3y`, `7y`, `permanent`  
`verifyRange` | object | No | `{ from: string, to: string }` for integrity verification  
`exportFormat` | enum | No | `json`, `csv`, `pdf`  
  
**Actions:**

Action | Purpose | Output  
---|---|---  
`log_event` | Append a new immutable audit event | Event ID, chain position, checksum  
`configure_retention` | Set tenant retention policy | Previous/new policy, effective date  
`verify_integrity` | Validate hash chain integrity | Verified count, broken links, integrity score  
`export_trail` | Export audit trail to file | Export path, event count, file size  
  
### Tool 2: query_audit_log

Parameter | Type | Required | Description  
---|---|---|---  
`tenantId` | string | No | Tenant identifier  
`filters` | object | No | userId, category, severity, outcome, resourceType, resourceId, dateFrom, dateTo, searchText  
`page` | number | No | Page number (min: 1)  
`pageSize` | number | No | Results per page (10–500, default: 50)  
`sortBy` | enum | No | `timestamp`, `severity`, `category`, `user`  
`sortOrder` | enum | No | `asc`, `desc`  
`aggregate` | enum | No | `by_category`, `by_user`, `by_severity`, `by_hour`, `by_day`  
  
**Aggregation modes** enable analytics without exporting raw data — essential for compliance dashboards.

### Tool 3: generate_audit_report

Parameter | Type | Required | Description  
---|---|---|---  
`reportType` | enum | Yes | `activity_summary`, `access_review`, `change_log`, `compliance_gap`, `incident_timeline`  
`tenantId` | string | No | Tenant identifier  
`periodStart` | string | Yes | Report period start (ISO 8601)  
`periodEnd` | string | Yes | Report period end (ISO 8601)  
`includeDetails` | boolean | No | Include detailed event lists  
`format` | enum | No | `json`, `pdf`, `html`  
`complianceFramework` | enum | No | `iso_9001`, `iso_27001`, `pdpa`, `boi`, `custom`  
  
**Report types:**

Type | Purpose | Audience  
---|---|---  
`activity_summary` | Overall system activity patterns | Management, IT Audit  
`access_review` | Quarterly user access & permission review | ISO 27001 Auditor  
`change_log` | System and configuration change tracking | IT Operations, BOI  
`compliance_gap` | Framework compliance gap analysis | Compliance Officer  
`incident_timeline` | Incident reconstruction with root cause | Security Team  
  
## 46.5 Test Coverage

Test File | Test Cases | Coverage  
---|---|---  
`compliance-audit.test.ts` | 14 | manage_audit_trail (5), query_audit_log (5), generate_audit_report (4)  
  
### Key Test Scenarios

**manage_audit_trail (5 tests):**

  1. Log event with full event object → returns event ID, chain position, checksum
  2. Log event without event object → returns error
  3. Configure retention policy → returns previous/new policy
  4. Verify chain integrity → returns integrity score = 1.0
  5. Export audit trail → returns export path and event count



**query_audit_log (5 tests):**

  1. Query without filters → returns paginated results
  2. Query with aggregation (by_category) → returns category counts
  3. Query with aggregation (by_severity) → returns severity distribution
  4. Query with custom page/pageSize → returns correct pagination
  5. Query with date range filters → returns filtered events



**generate_audit_report (4 tests):**

  1. Activity summary report → returns sections with event counts
  2. Access review report → returns critical findings count
  3. Compliance gap report → returns gap details and remediation plan
  4. Incident timeline report → returns chronological reconstruction



## 46.6 Integration Points

Integrated With | Integration Type | Description  
---|---|---  
Governance Chain | Middleware | Every tool call auto-logged to audit trail  
Document Management | Event Source | Document lifecycle events captured  
E-Signature | Event Source | Signature events with cryptographic proof  
Financial Module | Event Source | Transaction audit for tax compliance  
HR Module | Event Source | Employee action tracking  
Authentication | Event Source | Login/logout/session events  
Notification Module | Consumer | Alert on critical/alert severity events  
  
## 46.7 Benchmark Results

Metric | Value  
---|---  
manage_audit_trail (log_event) | < 0.05 ms  
query_audit_log (search) | < 0.15 ms  
query_audit_log (aggregate) | < 0.50 ms  
generate_audit_report | < 0.20 ms  
Concurrent load (25 users) | < 1.0 ms P99  
Chain verification (50K events) | ~2.3 seconds
