# MONOLITH LINE Design Approval Port A1 — Design Specification

- **Edition:** English
- **Design date:** 2 August 2026
- **Status:** Approved design; written specification awaiting owner approval
- **Approved experience:** A — Trust Concierge
- **Approved first slice:** Design Approval
- **Approved adapter level:** A1 — Local sandbox product adapter
- **Decision owner:** MONOLITH owner

> **Design decision:** retain LINE as the natural Human Surface while introducing only a narrow `DesignApprovalPort`. A1 proves the review, stale-revision, idempotency, and receipt contracts with a conspicuous no-business-effect sandbox adapter. It does not create a generic integration gateway, a second workflow source of truth, a production tenant claim, a live LIFF connection, a workflow mutation, or a signed receipt.

## 1. Executive decision

The approved A1 outcome is:

> **Human Surface contract-ready with sandbox adapter — not connected to MONOLITH runtime.**

The first journey is:

`Design ready -> open private review -> inspect bound revision -> confirm sandbox attempt -> receive Sandbox Verification Record — Demo · No Business Effect`

This phase is deliberately smaller than a runtime integration. It proves the client-side port, state machine, failure semantics, display provenance, and contract tests required before a Local Supabase or deployed LIFF adapter is permitted.

## 2. Problem and product principle

MONOLITH uses LINE in three natural communication lanes:

1. LINE OA 1:1 for lead intake, sales discussion, customer identity binding, document delivery, approval requests, and structured orders;
2. personal LINE Push for work notifications, SLA reminders, approvals, and escalation;
3. LINE Groups for field communication, evidence capture, issue reporting, and curated customer updates.

The controlling principle is:

> The front of house may use LINE naturally, but every real business effect must return to MONOLITH's authoritative database, workflow, permissions, and audit controls.

A1 creates no real business effect. It must therefore identify itself as a sandbox at every consequential step and must never imply that MONOLITH workflow state changed.

## 3. Evidence baseline and repository routing

All current-state claims in this specification distinguish the two Git roots.

| Git root | Evidence role | Design-time snapshot | Scope statement |
|---|---|---|---|
| `C:\Users\thai3\determined-williams (2)` | Governance/bootstrap root and the current standalone LineOS Human Surface prototype | `guardrails/claim-linters` / `f0753224b4e2f62df67347e08aa5063284b1a9ff` | Supports claims about Flex Studio, mock review, demo receipt, documents, and this design only. |
| `C:\Users\thai3\determined-williams (2)\determined-williams` | Active MONOLITH TypeScript/React/Supabase product repository | `fix/dxf-truth-chain` / `a1e9006add32fe3ce5346eb6ca94e8bdce1d13ab` | Supports claims about product identity, LIFF gatekeeper, workflow, RLS, approval RPCs, audit, lineage, and trust components. |

Both worktrees contain pre-existing or concurrent changes. The inspected LineOS Flex files and the nested design-view/approval files were clean in targeted status checks. The nested worktree has unrelated existing modifications, including `supabase/functions/_shared/order-adapter.ts`, `tests/line-oa-commerce/ts/orderNormalization.property.test.ts`, generated `dist` assets, and cache files. A1 implementation must not modify or normalize those paths.

The 21 July 2026 repository-scope correction remains controlling: substantial product implementation exists in the nested repository, but production readiness and a canonical platform-tenant boundary are not established. The nested migrations are site-scoped; `site_code` is not automatically a tenant.

## 4. Verified existing substrate

### 4.1 Parent Human Surface

The current standalone LineOS prototype implements this local-only chain:

`preset -> editor -> validator -> Flex JSON -> risk routing -> mock private review -> demo transaction -> Verification Receipt — Demo`

Relevant evidence includes:

- `LineOS/line-flex-studio.html` — standalone Studio and mock dialogs;
- `LineOS/line-flex-studio.mjs` — state, preview, review journey, and receipt rendering;
- `LineOS/line-flex-actions.mjs` — browser-local transaction binding and expiry checks;
- `LineOS/line-flex-receipt.mjs` — SHA-256 demo digest explicitly labelled as non-production;
- `LineOS/line-flex-presets.mjs` — editable demonstration values, not product authority.

The current prototype is not connected to LINE SDKs, MONOLITH APIs, Supabase, workflow, or product audit.

### 4.2 Nested MONOLITH product

The nested product already contains substrate that future integration must reuse rather than rebuild:

- `supabase/functions/customer-design-view/index.ts` verifies a LIFF ID token, resolves canonical customer identity, and calls a server-side allowlist RPC;
- `supabase/migrations/0026_customer_sla_and_design_view.sql` restricts the customer view to matching work items, safe design artifacts, and pending customer approvals;
- `supabase/functions/approval-postback/index.ts` handles signed LINE webhook approval transport;
- `supabase/migrations/0031_order_keyed_process_model.sql` contains current approval decision logic, authorization, optimistic locking, idempotency, quorum effects, and audit writes;
- `supabase/migrations/0003_workflow_audit_immutability.sql` enforces append-only workflow audit rows;
- `src/core/lineage/lineageTypes.ts` defines content-hash revision identities, but the reviewed lineage writer currently persists browser-local JSONL and is not server authority.

Presence is not proof of hosted deployment, current migration state, live tenant isolation, or production qualification.

## 5. Scrutinize outcome and approved alternative

The initial proposal introduced a generic MONOLITH Integration Gateway. End-to-end scrutiny rejected that shape for A1 because it duplicated the existing LIFF gatekeeper and created a second identity/trust boundary.

Three approaches were considered:

| Approach | Result | Decision |
|---|---|---|
| Generic integration gateway | Broad abstraction across identity, project, workflow, audit, and receipt | Rejected: duplicates existing product boundaries and is too large for the first slice. |
| Direct Local Supabase integration | Exercises real schema, RLS, RPCs, and Edge Functions | Deferred to A2: valuable only after revision and tenancy decisions and database contract tests. |
| Narrow `DesignApprovalPort` with sandbox adapter | Proves the Human Surface contract without product mutation | **Approved for A1.** |

The approved simpler architecture is:

`Flex liff_uri with opaque review token -> private review UI -> DesignApprovalPort -> A1 sandbox adapter`

The future production mapping is:

`DesignApprovalPort -> existing customer-design-view identity/read path -> purpose-built LIFF confirmation transport -> existing customer approval RPC + workflow audit`

The production mapping is a design target, not A1 implementation scope.

## 6. Architecture and responsibility boundary

### 6.1 Human Surface responsibilities

LineOS may:

- render the approved Flex Message and Trust Concierge review experience;
- carry an opaque, single-purpose review token;
- display a server- or adapter-owned review snapshot;
- return a server-issued idempotency key during confirmation;
- render bounded outcomes and a sandbox record.

LineOS must not authoritatively set:

- tenant, organization, site, customer identity, actor, role, or permission;
- work-item ownership or approval-request eligibility;
- canonical revision identity, artifact manifest digest, or workflow version;
- approval outcome, audit status, signature status, or business effect.

### 6.2 Product responsibilities

The MONOLITH product remains responsible for all eventual real identity resolution, scope authorization, revision authority, workflow state, idempotency, audit, signing, revocation, and delivery. A1 does not implement those product effects.

### 6.3 No new generic gateway

`DesignApprovalPort` is a use-case boundary, not a new enterprise gateway. It exposes only the two operations required by the approved journey. LINE Push, Groups, orders, SLA acknowledgement, and other presets must not be routed through this port unless separately designed and approved.

## 7. A1 port contract

### 7.1 `openReview(reviewToken)`

The adapter owns identity context internally. UI components never receive or manage a LINE ID token in A1.

The returned `ReviewSnapshot` contains:

- `reviewSessionId` — opaque and short-lived;
- `serverIssuedIdempotencyKey` — bound to this session and action;
- `mode: sandbox`;
- `businessEffect: none`;
- `providerContext` — display provenance, not a tenant assertion;
- `workItemRef` and `approvalRequestRef` — opaque sandbox references;
- `revisionLabel`;
- `revisionId` — adapter-owned content hash;
- `artifactManifestSha256`;
- `digestAlgorithm` and `canonicalizationVersion`;
- `expectedWorkflowVersion`;
- allowlisted review artifacts only;
- requested canonical action and plain-language consequence;
- `issuedAt` and `expiresAt`.

The Flex body is invitation and display content only. A1 must not treat its editable project, revision, recipient, or tenant-like fields as authority.

### 7.2 `confirmReview(input)`

The UI returns only:

- `reviewSessionId`;
- `serverIssuedIdempotencyKey`;
- `expectedRevisionId`;
- `decision: confirm`.

The UI must not submit tenant, customer identity, role, project owner, authoritative approval status, or a caller-selected effect mode.

### 7.3 Outcomes

A1 may return only:

- `sandbox_recorded`;
- `sandbox_replayed`;
- `expired`;
- `stale_revision`;
- `version_conflict`;
- `idempotency_conflict`;
- `unauthorized`;
- `not_available`;
- `invalid_request`;
- `temporarily_unavailable`.

It must never return `approved`, `signed`, `audited`, or any equivalent production claim.

## 8. State machine and idempotency

The allowed state sequence is:

`issued -> opened -> sandbox_recorded -> demo_record`

Terminal alternate states are:

- `expired` when TTL is exceeded;
- `stale_revision` when the bound revision changes;
- `version_conflict` when the workflow snapshot changes concurrently;
- `cancelled` when the user leaves without confirming;
- `not_available` or `unauthorized` when the bounded review cannot be disclosed.

Idempotency rules are:

1. the adapter issues the key; the browser does not choose it;
2. the same key and the same canonical payload return the same record within the A1 session;
3. the same key with a different payload returns `idempotency_conflict`;
4. double-clicks and concurrent calls create one sandbox ledger entry;
5. a failed attempt that did not record an entry may be retried with the same key;
6. button disabling is UX only; the adapter owns duplicate suppression.

Because the A1 ledger is session-only, replay guarantees do not survive a browser restart. The UI and evidence must disclose that limitation.

## 9. Revision integrity contract

A1 binds the review session to:

- approval request reference;
- work item reference;
- revision ID;
- artifact manifest SHA-256;
- expected workflow version;
- canonical action and consequence;
- issue and expiry timestamps;
- canonicalization version.

Before recording a confirmation, the adapter rechecks the bound snapshot. Any mismatch fails closed.

This contract does not establish the production revision source. The current product project schema contains version and timestamps but no canonical server revision digest in the customer design-view response. The product lineage types define content-hash identity, but the reviewed writer is browser-local. A2 is blocked until the owner approves a server-owned revision source and persistence path.

## 10. Identity, tenancy, and security rules

### 10.1 A1 identity

A1 uses a `SandboxIdentityFixture` selected by the adapter. The user interface cannot edit it. The journey displays `SANDBOX — NO BUSINESS EFFECT` at every consequential step.

### 10.2 Future LIFF identity

The future adapter may obtain the LINE ID token from the LIFF runtime and pass it directly to the existing server-side verification boundary. UI components, browser logs, receipt fields, analytics, URLs, and persistent storage must never contain the token.

The server must reverify identity and authorization on both open and confirm. A successful open never authorizes a later confirm by itself.

### 10.3 Tenant boundary

A1 uses `providerContext` or `scopeContext`, not `tenantId`. It must not present Daph or any site as a verified platform tenant. No code may equate `site_code` with tenant or introduce `tenant_id` without the separately approved tenant–organization–site mapping, migration, RLS, uniqueness, key, export, deletion, and denial-test contract.

### 10.4 Threats that must fail closed

The design explicitly covers:

- client-field tampering;
- object-reference enumeration;
- token leakage;
- replay and double submission;
- stale revision and concurrent workflow updates;
- cross-customer or cross-scope disclosure;
- receipt confusion and false production authority;
- raw internal errors or secrets reaching LINE.

## 11. Failure and disclosure contract

| Condition | Contract result | Required UX |
|---|---|---|
| Session expired | `expired` | Disable confirmation and start a new review. |
| Revision changed | `stale_revision` | Load the latest revision; never confirm the old snapshot. |
| Workflow version changed | `version_conflict` | Refresh current status. |
| Same key, different payload | `idempotency_conflict` | Reject and display a correlation ID. |
| Identity or permission failed | `unauthorized` | Neutral unavailable message; disclose no internal identifiers. |
| Lookup miss or other-customer scope | `not_available` | Same neutral message to prevent enumeration. |
| Temporary failure | `temporarily_unavailable` | Retry with the same adapter-issued key. |

Raw SQL errors, stack traces, internal roles, customer IDs, secrets, tokens, and implementation details must not be returned to LINE or shown in the receipt.

## 12. Sandbox ledger and receipt semantics

### 12.1 Sandbox ledger

The A1 `SandboxAttemptLedger` is session-only and has no product database effect. It is not the MONOLITH audit log. Tests may inject a deterministic store to prove idempotency and concurrency. Reload or restart may clear it, and the UI must say so.

### 12.2 Record title

The fixed title is:

> **Sandbox Verification Record — Demo · No Business Effect**

### 12.3 Required record fields

- `recordVersion`;
- `mode: sandbox`;
- `businessEffect: none`;
- `recordId` and `correlationId`;
- `reviewSessionId`;
- provider/scope context;
- work item and approval request references;
- revision label, revision ID, and artifact manifest digest;
- requested canonical action;
- outcome;
- created and confirmed timestamps;
- digest algorithm and canonicalization version;
- record digest.

### 12.4 Prohibited fields and claims

The record must not contain or imply:

- `approved` or an equivalent workflow result;
- a cryptographic signature, `keyId`, or verified-signer status;
- a tenant assertion;
- production audit completion;
- LINE tokens, secrets, or unnecessary personal data.

A digest is integrity metadata, not a signature. Production Signed Receipt remains a separate future artifact gated by Trust Kernel, key custody, verification, revocation, and audit requirements.

## 13. Trust Concierge experience

The approved visual direction is warm, premium, and trustworthy. The journey must:

1. use the Design Approval Flex preset and a primary `liff_uri` action;
2. open a private review rather than mutate business state from the Flex button;
3. show provider provenance, project display name, revision, artifact digest, consequence, and expiry;
4. keep the sandbox warning continuously visible and visually prominent;
5. confirm only a sandbox attempt;
6. render the bounded sandbox record;
7. explain that workflow and approval status did not change.

Premium styling must not reduce, hide, euphemize, or visually subordinate the no-business-effect disclosure.

## 14. Repository and delivery boundary

| Area | A1 action |
|---|---|
| Parent `LineOS/` | Add the port contract, sandbox adapter, review integration, record rendering, and tests. |
| Nested MONOLITH source | Use as evidence and future mapping only; no A1 production runtime or migration changes. |
| Local Supabase | Not started in A1. |
| LINE Platform | No live API call, credential, webhook, push, LIFF deployment, or message send. |

The A1 implementation plan must define exact files after this written specification is approved. It must preserve all unrelated dirty-worktree changes and must not touch the existing nested order-adapter lane.

## 15. Verification and acceptance criteria

A1 is acceptable only when fresh evidence proves:

- the Design Approval Flex action uses `liff_uri`;
- the Flex payload contains no token, tenant authority, or internal secret;
- UI controls cannot edit identity, revision digest, idempotency key, or effect mode;
- revision changes between open and confirm are rejected;
- expired sessions are rejected;
- the same key and payload return the same record within the session;
- the same key with a different payload returns `idempotency_conflict`;
- double-click and concurrent confirmation yield one ledger record;
- the record contains no `approved`, signature, key ID, tenant assertion, or audit-complete claim;
- A1 generates no external network request;
- browser storage and logs contain no token or secret;
- Thai and English desktop, mobile, and keyboard journeys work;
- no browser console or page error occurs;
- all existing Flex Studio tests remain green;
- new unit, contract, state-machine, negative, and browser tests pass;
- claim lint and placeholder/secret scans pass;
- the four bilingual specification files remain aligned and standalone-readable;
- the nested product worktree receives no new A1 diff.

Future production work additionally requires database integration tests for customer-design-view allowlisting, cross-customer denial, not-found non-disclosure, stale revision, optimistic locking, idempotency, concurrent confirmation, audit completeness, and forbidden-artifact leakage.

## 16. Promotion gate to A2 — Local Supabase

A2 requires separate owner approval and may begin only when:

1. A1 contract and browser evidence pass;
2. a canonical server-owned revision source is approved;
3. the tenant–organization–site mapping is approved or the slice is explicitly bounded to a non-tenant scope model;
4. customer-design-view database contract tests exist and pass locally;
5. a narrow LIFF confirmation transport design passes security review;
6. rollback, idempotency, audit, and error semantics are proven;
7. local environment and secret-handling authority are approved.

A2 should reuse the existing design-view and customer approval substrate. It must not revive the rejected generic gateway.

## 17. Non-goals

A1 does not include:

- LINE Login or real LIFF SDK initialization;
- LINE webhook, push, group messaging, or live send;
- Local or hosted Supabase mutation;
- product workflow transition;
- a new product intent table;
- production tenant-isolation claims;
- cryptographic signing or Production Signed Receipt;
- deployment, production credentials, merge, push, PR, or release authorization.

## 18. Implementation sequence after written-spec approval

After the owner approves this written specification, a separate detailed implementation plan will:

1. freeze fresh two-root status and exact file scope;
2. define contract schemas and forbidden-field tests;
3. implement the sandbox adapter test-first;
4. integrate the port into the Design Approval journey;
5. replace ambiguous demo receipt language with the approved sandbox record semantics;
6. add state, idempotency, stale-revision, failure, accessibility, and browser tests;
7. update aligned TH/EN user-facing documentation and HTML;
8. run full LineOS verification, claim lint, secret scans, browser evidence, and exact diff checks;
9. perform code review and final whole-range scrutiny;
10. produce a bounded implementation report.

No implementation code is authorized by this written-spec document alone until the owner explicitly approves it and the implementation plan is produced.

## 19. Written-spec self-review checklist

- **Intent:** the document states the real goal and the smaller approved alternative.
- **Repository truth:** parent Human Surface and nested product evidence are separated.
- **No duplication:** the generic gateway is explicitly rejected.
- **Authority:** client display data is never promoted into product authority.
- **Revision:** the missing canonical server digest is an explicit A2 blocker.
- **Tenancy:** `site_code` is not equated with tenant.
- **Workflow:** A1 has no real approval or product intent table.
- **Receipt:** digest and signature semantics are distinct.
- **Security:** identity, replay, enumeration, stale state, and disclosure failures are fail-closed.
- **Claims:** A1 is contract-ready, not runtime-connected or production-ready.
- **Placeholders:** a pre-publication placeholder and implementation-promise scan is mandatory.
