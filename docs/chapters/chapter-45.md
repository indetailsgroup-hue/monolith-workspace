---
num: 45
title: "E-Signature Module"
phase: 10
phase_label: "Phase 10"
phase_num: 10
mcp_tools: 3
status: complete
dependencies: "Phase 9"
---

# Chapter 45: E-Signature Module (Phase 10)

## 45.1 Overview

The E-Signature module provides a complete digital signature workflow for contracts, approvals, and compliance documents. It supports multi-signer workflows with sequential or parallel signing order, three signature types (electronic, digital, qualified), and cryptographic verification using SHA-256 + RSA-2048 certificates.

**Key Capabilities:**

  * Multi-signer workflows with configurable signing order
  * Three signature types: electronic (image), digital (PKI), qualified (eIDAS)
  * Sequential and parallel signing modes
  * Cryptographic verification with certificate chain validation
  * Automatic expiry and notification management
  * Full audit trail with IP address logging



**Source File:**`src/tools/e-signature.ts` (~370 lines)

## 45.2 Data Model

### SignatureRequest

Field | Type | Description  
---|---|---  
`requestId` | `string` | Unique identifier (auto-generated `SIG-xxxx`)  
`documentId` | `string` | Document to be signed  
`title` | `string` | Request title  
`status` | `SignatureRequestStatus` | Request state  
`signingOrder` | `SigningOrder` | `sequential` or `parallel`  
`signers` | `Signer[]` | List of signers with their status  
`createdBy` | `string` | Creator user ID  
`createdAt` | `string` | ISO 8601 creation timestamp  
`expiresAt` | `string` | Expiry timestamp  
`completedAt` | `string?` | Completion timestamp (when all signers done)  
`message` | `string?` | Notification message to signers  
  
### Signer

Field | Type | Description  
---|---|---  
`signerId` | `string` | Signer email (used as ID)  
`name` | `string` | Full name  
`email` | `string` | Email address  
`role` | `string` | Role (approver, witness, contractor, etc.)  
`order` | `number` | Signing order number  
`status` | `SignerStatus` | pending → notified → viewed → signed/declined/expired  
`signedAt` | `string?` | Signing timestamp  
`ipAddress` | `string?` | IP address at signing  
`signatureType` | `SignatureType` | electronic, digital, or qualified  
  
### SignatureRecord

Field | Type | Description  
---|---|---  
`signatureId` | `string` | Unique signature ID  
`requestId` | `string` | Parent request  
`documentId` | `string` | Signed document  
`signerId` | `string` | Signer ID  
`signerName` | `string` | Signer name  
`signatureType` | `SignatureType` | Type of signature  
`algorithm` | `string` | `SHA-256 + RSA-2048`  
`certificateIssuer` | `string` | CA issuer name  
`certificateSerial` | `string` | Certificate serial number  
`documentHash` | `string` | SHA-256 hash of document  
`signatureHash` | `string` | Signature hash  
`signedAt` | `string` | ISO 8601 timestamp  
`ipAddress` | `string` | Signer's IP  
`isValid` | `boolean` | Validity status  
`validUntil` | `string` | Certificate validity expiry  
  
### VerificationResult

Field | Type | Description  
---|---|---  
`documentId` | `string` | Verified document  
`isValid` | `boolean` | Overall validity  
`verifiedAt` | `string` | Verification timestamp  
`totalSignatures` | `number` | Total signatures found  
`validSignatures` | `number` | Valid signatures count  
`invalidSignatures` | `number` | Invalid signatures count  
`signatures` | `SignatureRecord[]` | Detailed signature records  
`certificateChain` | `object` | Root CA → Intermediate → End Entity  
`integrityCheck` | `object` | Algorithm, document hash, tampered status  
  
## 45.3 Signing Workflow
[code] 
      ┌─────────────────┐
      │  create_request  │  requestedBy creates request with signer list
      └────────┬────────┘
               │
               ▼
      ┌─────────────────┐
      │    pending       │  Signers notified via email
      └────────┬────────┘
               │
               ▼
      ┌─────────────────┐  Sequential: one at a time
      │  in_progress     │  Parallel: all at once
      └────────┬────────┘
               │
         ┌─────┴──────┐
         ▼            ▼
      ┌──────┐   ┌──────────┐
      │ sign │   │ decline  │  Requires consent=true for sign
      └──┬───┘   └──────────┘  Requires consent=false for decline
         │
         ▼
      ┌─────────────────┐
      │   completed      │  All signers have signed
      └─────────────────┘
               │
               ▼
      ┌─────────────────┐
      │ verify_signature │  Cryptographic verification
      └─────────────────┘
    
[/code]

## 45.4 Signature Types

Type | Description | Use Case  
---|---|---  
**electronic** | Image-based signature (base64 PNG) | General contracts, internal approvals  
**digital** | PKI-based with SHA-256 + RSA-2048 | Regulatory compliance, external contracts  
**qualified** | eIDAS-compliant qualified electronic signature | EU cross-border, legal proceedings  
  
## 45.5 Tool Schemas

### create_signature_request

Parameter | Type | Required | Description  
---|---|---|---  
`action` | `enum` | Yes | `create`, `get`, `cancel`, `resend`, `list`  
`requestId` | `string` | Conditional | For get/cancel/resend  
`documentId` | `string` | For create | Document to sign  
`title` | `string` | For create | Request title  
`signingOrder` | `enum` | Optional | `sequential` (default) or `parallel`  
`signers` | `array` | For create | List of signers (name, email, role, order, signatureType)  
`message` | `string` | Optional | Notification message  
`expiryDays` | `number` | Optional | Days until expiry (default 30)  
`createdBy` | `string` | For create | Creator user ID  
  
**Actions:**

  * **create:** Creates signature request, generates `SIG-xxxx` ID, notifies signers
  * **get:** Retrieves request details including all signer statuses
  * **cancel:** Cancels a pending/in-progress request
  * **resend:** Resends notification to pending signers
  * **list:** Returns all requests with optional status filtering



### sign_document

Parameter | Type | Required | Description  
---|---|---|---  
`requestId` | `string` | Yes | Signature request ID  
`signerId` | `string` | Yes | Signer ID (email)  
`signatureType` | `enum` | Optional | Override signature type  
`ipAddress` | `string` | Optional | Signer's IP address  
`consentGiven` | `boolean` | Yes | `true` to sign, `false` to decline  
`signatureData` | `string` | Optional | Base64-encoded signature image  
  
**Behavior:**

  * `consentGiven: true` → Signs the document, creates `SignatureRecord` with cryptographic hash
  * `consentGiven: false` → Declines signing, updates signer status to `declined`
  * Auto-completes request when all signers have signed



### verify_signature

Parameter | Type | Required | Description  
---|---|---|---  
`documentId` | `string` | Yes | Document to verify  
`requestId` | `string` | Optional | Specific request (verifies all if omitted)  
`checkCertificateRevocation` | `boolean` | Optional | Check CRL (default true)  
  
**Response:**`VerificationResult` with:

  * Overall validity boolean
  * Individual signature records with certificate details
  * Certificate chain (Root CA → Intermediate CA → End Entity)
  * Integrity check (algorithm, hash, tampered status)



## 45.6 Security Features

Feature | Implementation  
---|---  
Document integrity | SHA-256 hash computed at signing, verified at any time  
Signature cryptography | RSA-2048 with SHA-256 digest  
Certificate chain | 3-level: Root CA → Intermediate → End Entity  
Non-repudiation | IP address logging, timestamp, consent flag  
Audit trail | Every action logged with actor, timestamp, IP  
Expiry enforcement | Automatic expiry after configurable days  
Tenant isolation | All requests scoped to tenant via RLS  
  
## 45.7 Test Coverage

**Test file:**`src/tools/e-signature.test.ts` — 12 test cases

Test Category | Cases | Coverage  
---|---|---  
create request with signers | 1 | Multi-signer creation, sequential order, status tracking  
get request | 1 | Retrieve by ID, signer details included  
cancel request | 1 | Status transition to cancelled  
resend notifications | 1 | Re-notification for pending signers  
list requests | 1 | Return all requests with metadata  
sign with consent | 1 | Successful signing, signature record creation  
reject without consent | 1 | Decline workflow, status to declined  
signature types | 1 | Electronic, digital, qualified type handling  
verify valid signature | 1 | Certificate chain, integrity check pass  
verify tampered document | 1 | Tampered detection, invalid flag  
verify with CRL check | 1 | Certificate revocation list check  
complete multi-signer | 1 | All signers sign → request completed  
  
## 45.8 Integration Points

System | Integration | Direction  
---|---|---  
Document Management (Phase 10) | Documents sent for signing | Inbound  
Customer Portal (Phase 3) | Client-facing signing portal | Outbound  
Financial (Phase 8) | Invoice/contract signing | Inbound  
Supply Chain (Phase 7) | Vendor contract signatures | Inbound  
HR Management (Phase 9) | Employment contract signing | Inbound  
Notification (Phase 4) | Email notifications to signers | Outbound  
  
## 45.9 Benchmark Results

From the Phase 10 performance benchmark:

Tool | Avg (ms) | Max (ms) | P95 (ms) | Success %  
---|---|---|---|---  
`create_signature_request` | 0.01 | 0.10 | 0.10 | 100%  
`sign_document` | 0.01 | 0.05 | 0.05 | 100%  
`verify_signature` | 0.01 | 0.04 | 0.04 | 100%  
  
All three tools achieve sub-millisecond response times with 100% success rate. The `verify_signature` tool is the fastest in Phase 10 at 0.04ms max — critical for real-time verification during signing workflows.

## 45.10 Compliance Mapping

Standard | Compliance Area | Status  
---|---|---  
Thailand PDPA | Personal data (signer info) encrypted, consent logged | Implemented  
eIDAS (EU) | Qualified electronic signature support | Supported  
ETSI EN 319 411-1 | Certificate policy for qualified certificates | Designed  
ISO 27001 | Document integrity, access control, audit trail | Implemented  
Thai Electronic Transactions Act | Electronic signature legal recognition | Supported  
  
## 45.11 Persona Mapping — Phase 10

Persona | Tools Used | Primary Actions  
---|---|---  
**Factory Manager** | manage_document, search_documents | Create specs, search drawings, manage BOMs  
**CNC Operator** | search_documents, document_version_control | Access latest drawings, check version history  
**Quality Inspector** | manage_document, document_version_control | Upload QC certificates, version control  
**Sales Team** | create_signature_request, verify_signature | Send contracts for signing, verify completed  
**Installation Technician** | search_documents, sign_document | Access installation guides, sign completion forms  
**Management** | verify_signature, search_documents | Verify signed contracts, search reports
