---
num: 44
title: "Document Management Module"
phase: 10
phase_label: "Phase 10"
phase_num: 10
mcp_tools: 3
status: complete
dependencies: "Phase 9"
---

# Chapter 44: Document Management Module (Phase 10)  
  
## 44.1 Overview

The Document Management module provides a centralized repository for all project-related documents — drawings, specifications, BOMs, contracts, reports, manuals, certificates, and correspondence. Every document is tenant-scoped, versioned, and access-controlled with approval workflows built in.

**Key Capabilities:**

  * Full lifecycle management: draft → review → approved → published → archived
  * Full-text search with category, status, tag, project, and date filters
  * Version control with history, rollback, comparison, and lock/unlock
  * Access level enforcement: public, internal, confidential, restricted
  * Checksum integrity verification (SHA-256)



**Source File:**`src/tools/document-management.ts` (~370 lines)

## 44.2 Data Model

### DocumentMeta

Field | Type | Description  
---|---|---  
`documentId` | `string` | Unique identifier (auto-generated `DOC-xxxx`)  
`title` | `string` | Document title  
`category` | `DocumentCategory` | Classification (drawing, specification, bom, contract, report, manual, certificate, correspondence, photo, other)  
`status` | `DocumentStatus` | Lifecycle state (draft, review, approved, published, archived, superseded)  
`accessLevel` | `AccessLevel` | Access restriction (public, internal, confidential, restricted)  
`projectId` | `string?` | Associated project ID  
`version` | `number` | Current version number  
`revision` | `string` | Revision label (e.g., "A", "B")  
`fileSize` | `number` | File size in bytes  
`mimeType` | `string` | MIME type (e.g., application/pdf)  
`checksum` | `string` | SHA-256 hash for integrity  
`tags` | `string[]` | Classification tags  
`createdBy` | `string` | Creator user ID  
`createdAt` | `string` | ISO 8601 creation timestamp  
`updatedBy` | `string` | Last modifier user ID  
`updatedAt` | `string` | ISO 8601 update timestamp  
`approvedBy` | `string?` | Approver user ID  
`approvedAt` | `string?` | Approval timestamp  
`expiresAt` | `string?` | Document expiry date  
  
### DocumentVersion

Field | Type | Description  
---|---|---  
`versionNumber` | `number` | Sequential version number  
`revision` | `string` | Revision label  
`changeDescription` | `string` | Description of changes  
`changedBy` | `string` | User who made the change  
`changedAt` | `string` | Timestamp of change  
`fileSize` | `number` | File size of this version  
`checksum` | `string` | SHA-256 hash  
`status` | `DocumentStatus` | Status at time of version creation  
  
### DocumentSearchResult

Field | Type | Description  
---|---|---  
`documentId` | `string` | Document ID  
`title` | `string` | Document title  
`category` | `DocumentCategory` | Category  
`status` | `DocumentStatus` | Current status  
`version` | `number` | Current version  
`relevanceScore` | `number` | Search relevance (0-1)  
`snippet` | `string` | Matching text snippet  
`updatedAt` | `string` | Last update timestamp  
  
## 44.3 Document Lifecycle
[code] 
                        ┌────────────┐
                        │   draft    │
                        └─────┬──────┘
                              │ submit for review
                        ┌─────▼──────┐
                        │   review   │
                        └─────┬──────┘
                              │ approve
                        ┌─────▼──────┐
                        │  approved  │
                        └─────┬──────┘
                              │ publish
                        ┌─────▼──────┐
                        │  published │
                        └──┬─────┬───┘
                           │     │ supersede (new version)
                  archive  │     │
                     ┌─────▼─┐ ┌─▼──────────┐
                     │archived│ │ superseded │
                     └────────┘ └────────────┘
    
[/code]

## 44.4 Tool Schemas

### manage_document

Parameter | Type | Required | Description  
---|---|---|---  
`action` | `enum` | Yes | `create`, `update`, `get`, `archive`, `publish`, `list`  
`documentId` | `string` | Conditional | Required for update/get/archive/publish  
`title` | `string` | For create | Document title  
`category` | `enum` | For create | drawing, specification, bom, contract, report, manual, certificate, correspondence, photo, other  
`accessLevel` | `enum` | Optional | public, internal, confidential, restricted (default: internal)  
`projectId` | `string` | Optional | Associated project ID  
`tags` | `string[]` | Optional | Classification tags  
`description` | `string` | Optional | Description or change notes  
`approvedBy` | `string` | For publish | Approver user ID  
  
**Actions:**

  * **create:** Creates a new document in `draft` status, generates `DOC-xxxx` ID, SHA-256 checksum
  * **update:** Updates metadata (title, tags, description, access level); increments version
  * **get:** Retrieves full document metadata by ID
  * **archive:** Transitions published/approved document to `archived` status
  * **publish:** Transitions approved document to `published` status; requires `approvedBy`
  * **list:** Returns all documents (with optional status/category filters via tags)



### search_documents

Parameter | Type | Required | Description  
---|---|---|---  
`query` | `string` | Yes | Search query text  
`category` | `enum` | Optional | Filter by category  
`status` | `enum` | Optional | Filter by status  
`projectId` | `string` | Optional | Filter by project  
`tags` | `string[]` | Optional | Filter by tags (AND logic)  
`dateFrom` | `string` | Optional | Filter from date (YYYY-MM-DD)  
`dateTo` | `string` | Optional | Filter to date (YYYY-MM-DD)  
`limit` | `number` | Optional | Max results (default 20)  
`offset` | `number` | Optional | Pagination offset  
  
**Response:** Array of `DocumentSearchResult` with relevance scores and matching snippets.

### document_version_control

Parameter | Type | Required | Description  
---|---|---|---  
`action` | `enum` | Yes | `history`, `create_version`, `rollback`, `compare`, `lock`, `unlock`  
`documentId` | `string` | Yes | Target document ID  
`versionNumber` | `number` | Conditional | For rollback/compare  
`compareWith` | `number` | For compare | Second version to compare  
`changeDescription` | `string` | For create_version | Description of changes  
`changedBy` | `string` | For create_version | User making the change  
  
**Actions:**

  * **history:** Returns full version history with all revisions
  * **create_version:** Creates a new version with change description, increments version number
  * **rollback:** Reverts document to a previous version; creates new version entry recording the rollback
  * **compare:** Compares two versions showing differences in fields (file size, status, revision, description)
  * **lock:** Locks document for exclusive editing by one user
  * **unlock:** Releases the editing lock



## 44.5 Access Control Matrix

Access Level | View | Edit | Delete | Approve | Publish  
---|---|---|---|---|---  
public | All | Owner/Admin | Admin | Admin | Admin  
internal | Tenant members | Owner/Admin | Admin | Admin | Admin  
confidential | Assigned only | Owner only | Admin | Admin | Admin  
restricted | Named users | Owner only | N/A | Admin | Admin  
  
## 44.6 Test Coverage

**Test file:**`src/tools/document-management.test.ts` — 17 test cases

Test Category | Cases | Coverage  
---|---|---  
create document | 2 | Basic creation, metadata generation, default values  
get document | 1 | Retrieve by ID, error for non-existent  
archive document | 1 | Status transition, archived timestamp  
publish document | 1 | Requires approvedBy, status to published  
update document | 1 | Metadata update, version increment  
list documents | 1 | Return all documents in collection  
search with query | 2 | Full-text search, relevance scoring  
search with filters | 2 | Category/status/project/tag/date filters  
version history | 2 | Full history, entries per version  
create version | 1 | New version with description, version bump  
rollback version | 1 | Revert to previous, creates rollback entry  
compare versions | 1 | Field-level diff between two versions  
lock/unlock | 1 | Exclusive editing lock lifecycle  
  
## 44.7 Integration Points

System | Integration | Direction  
---|---|---  
E-Signature (Phase 10) | Documents sent for signing | Outbound  
Quality Control (Phase 2) | QC certificates auto-generated as documents | Inbound  
Production Planning (Phase 2) | BOMs linked to production orders | Bidirectional  
Customer Portal (Phase 3) | Published documents shared with clients | Outbound  
Supply Chain (Phase 7) | Contracts and purchase orders as documents | Inbound  
Financial (Phase 8) | Invoices and receipts stored as documents | Inbound  
  
## 44.8 Benchmark Results

From the Phase 10 performance benchmark:

Tool | Avg (ms) | Max (ms) | P95 (ms) | Success %  
---|---|---|---|---  
`manage_document` | 0.02 | 0.11 | 0.11 | 100%  
`search_documents` | 0.02 | 0.07 | 0.07 | 100%  
`document_version_control` | 0.02 | 0.10 | 0.10 | 100%  
  
All three tools achieve sub-millisecond response times with 100% success rate.
