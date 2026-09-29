# MONOLITH + LINE Human Surface: board deep-research report

- **Edition:** English (EN)
- **Decision date:** 2 August 2026
- **Decision scope:** governed product direction and one-tenant pilot; this is neither a production-deployment attestation nor legal advice.

## 1. Board decision

**Recommendation: conditional GO for local prototype work only; NO-GO for broader customer messaging.** Daph is one pilot tenant, not the product boundary. Daph customer messaging remains gated until every Trust P0 control in Section 8 passes freshly in the target environment; promotion beyond Daph requires the later board gates as well.

- **[Proposal]** Define MONOLITH as a multi-tenant, revision-controlled project and product operating system. Treat LINE as a replaceable Human Surface adapter over governed domain services, never as the system of record.
- **[Verified local fact]** The parent Git root contains a standalone LINE Flex Studio model, presets, JSON builder, validator, action transaction, demo receipt, DOM shell, and tests at parent commit `eca050ac8e7b76a1cb690e5d2cc4e3687c476bd7` (`LineOS/line-flex-*.mjs`, `LineOS/line-flex-studio.html`, `LineOS/tests/line-flex-*.test.mjs`). This proves source and test presence in that root only.
- **[Verified local fact]** The nested active-product Git root contains LINE ingress/outbound, audit/schema migrations, acceptance, notification, and security test sources at nested commit `a1e9006add32fe3ce5346eb6ca94e8bdce1d13ab` (`supabase/functions/line-webhook/index.ts`, `supabase/functions/line-outbound-sender/index.ts`, `supabase/migrations/00000000000022_line_oa_ingest_webhook.sql`, `supabase/migrations/00000000000040_line_oa_send_outbound.sql`, `tests/line-oa-commerce/`). This is repository evidence, not target-environment evidence.
- **[Inference]** The two roots together show useful presentation and trust-foundation ingredients, while the release decision still depends on cross-root integration evidence, tenant-isolation proof, operational telemetry, accessibility results, and recovery drills.
- **[Unknown]** Live LINE, Supabase, identity-provider, and production-signature status for a target tenant is outside the inspected evidence set.

## 2. Research method and evidence discipline

Three Perplexity Deep Research tracks—LINE technical lifecycle; trust/security/human factors; and interior-design lifecycle/ecosystem—were synthesized into the approved design specification on 1 August 2026. The archived source of record is the parent-root file `LineOS/docs/superpowers/specs/2026-08-01-monolith-line-flex-studio-design.en.md` at parent commit `eca050ac8e7b76a1cb690e5d2cc4e3687c476bd7`, with its aligned Thai edition beside it. On 2 August, fresh calls to the configured Perplexity research tool were attempted separately for all three tracks and each stopped with `401 insufficient_quota` before returning a result. This report therefore uses the approved specification as the archived synthesis and independently rechecks technical statements against the primary sources linked here. Raw Perplexity transcripts were not retained as separate artifacts; that provenance gap remains **[Unknown]**.

Evidence labels are deliberately narrow:

| Label | Meaning in this report |
|---|---|
| **Official constraint** | A mandatory requirement or limit from a standards body, platform owner, regulator, or manufacturer installation/compatibility document; a catalogue or tool capability description alone does not qualify. |
| **Verified local fact** | A file, test, or commit directly inspected in the named Git root. |
| **Inference** | A bounded conclusion derived from cited evidence; it is not itself a platform guarantee. |
| **Proposal** | A board choice, control, target, or workflow awaiting authorization and implementation. |
| **Unknown** | Evidence remains unavailable, unverified, or environment-specific. |

**[Proposal]** Every future decision record should preserve source URL, retrieval date, root/commit for local evidence, owner, expiry, and the verification artifact. Numeric KPIs in Section 16 are hypotheses until baselined. Manufacturer examples are input-shape evidence, never a universal cabinet standard.

## 3. Two-root current-state map

The topology conclusion relies on two **untracked working-tree evidence** documents inspected 2026-08-02. They are absent from parent commit `eca050ac8e7b76a1cb690e5d2cc4e3687c476bd7` and are **not commit or deployment evidence**: `CONTEXT.md` has SHA-256 `715E4865B1A4498AC08C6E9AC7A0C7881A54645A645C088B130FE0572A92DE99`; `docs/reports/2026-07-21-ima-schelling-monolith-repository-scope-correction.en.md` has SHA-256 `6966AB9BB1C3B97E3856A66A35190E2D404627E5B88BFFE720462E96C296FD42`. At those exact hashes, they identify the parent as governance/bootstrap and `determined-williams/` as the separate active-product Git root. This report preserves that provisional provenance and does not promote either document into commit history.

| Root and evidence | What it supports | What the board may conclude |
|---|---|---|
| Parent `C:\Users\thai3\determined-williams (2)` @ `eca050a…`: `LineOS/line-flex-model.mjs`, `line-flex-presets.mjs`, `line-flex-json.mjs`, `line-flex-validator.mjs`, `line-flex-actions.mjs`, `line-flex-receipt.mjs`, `line-flex-studio.mjs`, `line-flex-studio.html`, tests | Deterministic local Flex-composition and demo interaction contracts; five preset IDs; safe demo receipt label. | **[Verified local fact]** Standalone source/test capability exists in the governance root. |
| Nested `C:\Users\thai3\determined-williams (2)\determined-williams` @ `a1e9006…`: webhook/sender functions, LINE migrations, `tests/line-oa-commerce/`, `src/workflow/notification/quiet-hours.ts` | Product-side source for signature handling, ingest/outbound pathways, audit records, acceptance and notification controls. | **[Verified local fact]** Product ingredients exist in the active-product root. |
| Cross-root runtime, live credentials, deployed migrations, telemetry, accessibility study, recovery drill | Target-environment evidence has not been supplied to this review. | **[Unknown]** Release maturity cannot be inferred from source inventory. |

**[Inference]** The correct migration shape is adapter integration, not copying the parent studio into the nested product as a second domain model. Domain objects, authorization, revision state, audit, and outbox live behind a stable application boundary; the Human Surface renders and submits commands through it.

## 4. LINE as a replaceable Human Surface

LINE supports replies and push delivery to users, groups, and multi-person rooms; all members in a group or room can see bot messages, and only one LINE Official Account can participate in a group at a time. Narrowcast targets users but not groups. **[Official constraint]** Sources: [sending messages](https://developers.line.biz/en/docs/messaging-api/sending-messages/) and [group chats](https://developers.line.biz/en/docs/messaging-api/group-chats/).

**[Proposal]** The adapter boundary is:

1. receive a signed platform event;
2. resolve `tenant + principal + conversation` through server-side bindings;
3. authorize a named command against resource and revision;
4. append immutable intent/audit evidence and enqueue an outbox item;
5. render a channel-specific response from governed data;
6. record delivery acceptance separately from business completion.

**[Inference]** This boundary lets web, email, or another chat surface replace LINE without migrating project truth. Conversation IDs and user IDs are routing identifiers, not tenant authority. The platform documents multiple user-ID acquisition paths, and provider boundaries affect identifier consistency. **[Official constraint]** Sources: [getting user IDs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/) and [LINE Login FAQ](https://developers.line.biz/en/faq/tags/line-login/).

**[Proposal]** Default group-chat behavior is low-noise: status digests, explicit mentions, safe read-only cards, and deep links. Price acceptance, scope change, release-to-manufacture, refund, credential, and privacy actions move into a stronger authenticated surface with revision confirmation.

## 5. Flex Message and LIFF interaction contract

Flex messages require `type`, `altText`, and `contents`; `altText` supports up to 1,500 characters. A bubble JSON object is limited to 30 KB, a carousel to 50 KB, and a carousel to 12 bubbles. Image URLs must use HTTPS with TLS 1.2 or later and supported JPEG/PNG constraints. Postback data and display text each support up to 300 characters; URI values support up to 1,000 characters. **[Official constraint]** Source: [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/). The official overview, action taxonomy, element model, and Flex workflow are documented at [Messaging API](https://developers.line.biz/en/docs/messaging-api/), [actions](https://developers.line.biz/en/docs/messaging-api/actions/), [Flex elements](https://developers.line.biz/en/docs/messaging-api/flex-message-elements/), and [using Flex messages](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/).

| Interaction | Channel contract | MONOLITH treatment |
|---|---|---|
| Read-only status card | concise alt text, visible owner/revision/state, single primary next step | **[Proposal]** Safe in 1:1 and approved group contexts after tenant binding. |
| Postback command | opaque command reference; server resolves current resource/revision | **[Proposal]** Never encode authority, price truth, or personal data in the client payload. |
| URI/deep link | HTTPS destination with authenticated server-side resolution | **[Proposal]** Suitable for complex, sensitive, or high-assurance work. |
| LIFF form | LINE Login channel, declared scopes, HTTPS endpoint, server token verification | **[Official constraint]** LIFF scopes and endpoint rules are defined in the [LIFF server API](https://developers.line.biz/en/reference/liff-server/). |

LIFF guidance requires sending an access token or ID token to the server and verifying it with LINE instead of trusting client-provided profile data. Sensitive data should stay out of LIFF URLs, and user tracking or cross-service linking requires appropriate consent. **[Official constraint]** Sources: [using profile information](https://developers.line.biz/en/docs/liff/using-user-profile/) and [LIFF development guidelines](https://developers.line.biz/en/docs/liff/development-guidelines/).

**[Unknown]** LINE currently recommends LINE MINI App for new app construction in parts of its LIFF documentation; the product choice and migration horizon require a current platform review at execution time. Source: [LIFF server API](https://developers.line.biz/en/reference/liff-server/).

## 6. Developer Console and channel lifecycle

Since September 2024, a Messaging API channel is enabled from a LINE Official Account in Official Account Manager rather than created directly in Developers Console; the selected provider cannot later be moved. **[Official constraint]** Source: [Messaging API getting started](https://developers.line.biz/en/docs/messaging-api/getting-started/). A LIFF app belongs to a LINE Login channel, and consistent user IDs across Messaging API and LINE Login depend on channels being under the same provider. **[Official constraint]** Sources: [LINE Login getting started](https://developers.line.biz/en/docs/line-login/getting-started/) and [LINE Login FAQ](https://developers.line.biz/en/faq/tags/line-login/).

**[Proposal]** Govern the lifecycle as an evidence-bearing change:

| Phase | Required evidence | Stop condition |
|---|---|---|
| Provider/channel design | tenant owner, data classification, region, naming, provider relationship, least scopes | Ambiguous provider ownership or shared credential boundary. |
| Credential issuance | named custodian, secret-store reference, rotation date, separate environments | Secret present in source, chat, browser storage, or report. |
| Webhook activation | HTTPS endpoint, signature test, empty-event verification, replay/idempotency test | Any unsigned or transformed-body path reaches business processing. |
| LIFF publication | exact redirect URI, PKCE/nonce design, declared scopes, consent copy, accessibility check | Broad scopes or client-trusted identity. |
| Operations | delivery/error dashboards, owner, quiet hours, incident and rollback runbooks | Missing alert owner or unverifiable tenant boundary. |
| Retirement | disable webhook, revoke tokens, preserve required audit, confirm routing shutdown | Active credentials or unresolved queued work. |

The platform supports disabling webhook use and revoking channel access tokens as retirement controls. **[Official constraint]** Source: [stop using the Messaging API](https://developers.line.biz/en/docs/messaging-api/stop-using-messaging-api/).

Webhook activation also carries delivery-lifecycle controls: verify HMAC over the raw body before parsing, acknowledge promptly and process asynchronously, deduplicate redelivery by event ID, use retry keys only under documented conditions, and monitor webhook/error statistics. **[Official constraint]** Sources: [signature verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/), [receiving and redelivery](https://developers.line.biz/en/docs/messaging-api/receiving-messages/), [retry keys](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/), and [error statistics](https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/).

## 7. Trust Kernel operating model

NIST zero trust removes implicit trust based on network location and requires authentication and authorization before a session to a resource; its logical model emphasizes per-session, least-privilege access to individual resources. **[Official constraint]** Sources: [NIST SP 800-207 landing page](https://csrc.nist.gov/pubs/sp/800/207/final) and [SP 800-207 PDF](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-207.pdf).

**[Proposal]** The Trust Kernel evaluates the tuple `tenant, principal, role, resource, revision, command, grant, risk, assurance, time`. Its minimum records are:

- tenant and project membership with effective dates;
- principal bindings for LINE user/conversation and stronger identity;
- resource ownership and revision lineage;
- role plus explicit grants, delegations, constraints, and expiry;
- command risk tier and required assurance;
- idempotency, intent, authorization decision, outbox, delivery, and business outcome evidence;
- revocation, retention, export, and deletion state.

**[Proposal]** Its policy result is one of four explicit states: `PERMIT` executes under the recorded constraints; `DENY` rejects and records the reason; `STEP_UP` requires stronger authentication, an additional approver, or a current revision; `QUARANTINE` preserves the intent without executing until an authorized operator resolves ambiguity. Default and evaluation-error outcomes are `DENY` or `QUARANTINE`, never implicit permission.

**[Inference]** A signed webhook authenticates origin, not the human's business authority. A LINE profile identifies a platform subject, not a MONOLITH tenant role. A successful send API response acknowledges platform acceptance, not human receipt or command completion. These separations follow the platform signature, identity, and retry semantics documented in Sections 4, 5, and 9.

OAuth 2.0 security best current practice requires exact redirect-URI matching and PKCE protections for public clients; it also describes sender-constrained access tokens as a defense against token replay. **[Official constraint]** Source: [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html). LINE Login requires matching `redirect_uri`, supports PKCE parameters, and documents ID-token/nonce validation. **[Official constraint]** Sources: [LINE Login API reference](https://developers.line.biz/en/reference/line-login/) and [secure login process](https://developers.line.biz/en/docs/line-login/secure-login-process/).

## 8. Trust P0–P3 evidence ledger

| Priority | Control and fresh pass evidence | Board rule |
|---|---|---|
| P0 — Trust foundation | Raw-body HMAC-SHA256 signature verification before parsing; tenant resolved server-side; deny-by-default authorization at resource/revision/command; idempotent webhook and command handling; transactional intent + outbox; secret isolation/rotation; immutable security audit; tested revocation; fail-closed behavior | **[Proposal]** Every item must pass in the target environment before any customer message. |
| P0 | Cross-tenant negative tests for direct object access, conversation rebinding, stale revision, forged postback, replay, expired delegation, and administrator override | **[Proposal]** Any leak, ambiguous result, or missing log is a release stop. |
| P1 — Governed experience | Delivery/error observability, quiet hours/digests, accessible alternatives, incident runbook, restore/reconciliation drill, data export and deletion workflow | **[Proposal]** Required before expanding the Daph pilot's scenario set. |
| P2 — Lifecycle intelligence | Per-tenant templates/policy, delegated approvals, recovery journeys, role analytics, multilingual content governance, and revision-linked project/product insight | **[Proposal]** Required before adding a second tenant. |
| P3 — Controlled scale | Optimized channel orchestration, machine-assisted composition, advanced personalization, additional Human Surface adapters | **[Proposal]** Eligible only after P0–P2 evidence stays healthy. |

Webhook signatures use HMAC-SHA256 over the exact received request body and channel secret; validation must occur before deserialization, and invalid requests must not be processed. **[Official constraint]** Source: [verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/).

Webhook redelivery may duplicate events, alter delivery order, and remains non-guaranteed; `webhookEventId` and `isRedelivery` support duplicate detection. **[Official constraint]** Source: [receiving messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/). Retry keys make repeated API execution safer for selected server errors and timeouts, but an accepted request can still fail to reach a user. **[Official constraint]** Source: [retrying an API request](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/).

## 9. Threat model and failure containment

| Threat/failure | Mechanism | Required control and evidence |
|---|---|---|
| Forged webhook | attacker fabricates event | **[Proposal]** Exact raw-body signature test, invalid-signature denial, secret rotation drill. |
| Cross-tenant confused deputy | routing identifier treated as authority | **[Proposal]** Server binding plus tenant-scoped queries and negative isolation tests. |
| Replay/duplicate execution | webhook redelivery or client retry | **[Proposal]** Unique event/command keys, atomic state transition, deterministic replay result. |
| Stale approval | old Flex card invokes current resource | **[Proposal]** Expected revision in server record; mismatch returns read-only refresh path. |
| Forwarded link | an authenticated link reaches another person or context | **[Proposal]** Short life, audience binding, single-use/nonce where appropriate, and server reauthorization. |
| Unknown group actor | shared group context has an unresolved principal binding | **[Proposal]** Read-only response; `STEP_UP` in 1:1/authenticated web; actor authority requires an explicit principal binding. |
| Wrong audience | sensitive or tenant-specific content is sent to an unintended recipient/conversation | **[Proposal]** Audience classification, recipient preview, server binding, minimum-data template, and reconciliation/incident route. |
| duplicate-send | webhook redelivery, client retry, or sender retry executes twice | **[Proposal]** Persist a stable retry key; enforce sender idempotency and command uniqueness; measure zero duplicate business execution. |
| unknown-after-send | timeout or ambiguous response leaves delivery acceptance unresolved | **[Proposal]** Persist request/retry identifiers and acceptance state; reconcile outcome; route ambiguity to operator resolution; never blind resend. **[Official constraint]** LINE documents that an accepted retry can still fail to reach a user: [retry semantics](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/). |
| Identity substitution | client profile or redirect result trusted | **[Proposal]** Server token validation, nonce, PKCE, exact redirect URI, short-lived command token. |
| Notification abuse | excessive prompts create pressure | **[Proposal]** quiet hours, digest, per-role relevance, opt-down, escalation caps, complaint/recovery route. |
| Vendor or channel outage | LINE unavailable or account disabled | **[Proposal]** durable work queue, web fallback, operator runbook, replaceable adapter contract. |
| Audit tampering | actor alters or suppresses decision history | **[Proposal]** Append-only/immutable controls, restricted query path, integrity monitoring, retention policy, independent review. |
| Unsafe manufacturing release | approval bypasses source revision or compatibility evidence | **[Proposal]** high-assurance step-up, four-eyes gate, frozen BOM/drawing/CAM package, signed release record. |

LINE exposes webhook delivery statistics and error causes, including server response timing/error classes; its documentation calls for prompt webhook responses and asynchronous processing. **[Official constraint]** Sources: [receiving messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/) and [webhook error statistics](https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/).

## 10. Human factors, accessibility, and ethical retention

A randomized one-day field experiment with 247 participants found that disabling smartphone notifications reduced interruption and strain and improved performance in that setting. **[Inference]** This supports testing quiet hours and digests; it does not establish a MONOLITH baseline or universal effect. Source: [peer-reviewed original study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10244611/).

WCAG 2.2 AA includes requirements relevant to this surface: programmatic relationships, keyboard operation, focus visibility/not-obscured behavior, minimum target size, error identification, redundant-entry reduction, and accessible authentication. **[Official constraint]** Source: [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

**[Proposal]** Human-surface policy:

- one primary action per card; plain-language consequence, owner, due date, revision, and undo/recovery route;
- alt text that conveys task and urgency without requiring the visual layout;
- keyboard/screen-reader-capable web fallback and a non-chat route for sensitive work;
- quiet hours by tenant and role, digest-by-default for noncritical group updates, capped escalation, and explicit opt-down;
- separate service messages from marketing, disclose why a recipient is contacted, and avoid countdown pressure, disguised ads, forced continuity, or obstructed cancellation;
- complaint, correction, export, and deletion pathways with named service owner.
- portable project/customer export in a documented format, plus a channel-independent route to continue work or leave without punitive friction.

The US FTC documents interface patterns that mislead or manipulate users, including disguised advertising, buried terms, difficult cancellation, and data-extraction tricks. **[Official constraint]** This is policy evidence, not a jurisdiction-specific legal conclusion. Source: [FTC report](https://www.ftc.gov/reports/bringing-dark-patterns-light). ISO 10002 describes an open, effective complaint-handling process and using complaint analysis to improve services. **[Official constraint]** Source: [ISO 10002:2018](https://www.iso.org/standard/71580.html).

## 11. Interior-design lifecycle and revision spine

The RIBA Plan of Work structures built-environment work from strategic definition and preparation/brief through concept, spatial coordination, technical design, manufacturing/construction, handover, and use. **[Official constraint]** It is used here as a lifecycle analogue, not a universal studio mandate. Source: [RIBA Plan of Work 2020 template](https://www.architecture.com/-/media/GatherContent/Test-resources-page/Additional-Documents/2020RIBAPlanofWorktemplatepdf.pdf).

**[Proposal]** MONOLITH project states and control points. LINE is not the system of record: each route below carries the user to an action, while the authoritative object and decision remain revisioned in MONOLITH.

| State | Human Surface path | Authoritative MONOLITH record/fields | Required revision evidence | High-risk exit gate |
|---|---|---|---|---|
| Lead / qualify | OA 1:1 intake; personal push only after consent | tenant, project/lead, customer, consent, conversation, principal, owner, intent | source, consent version, qualification revision | accepted brief owner |
| Discover / survey | OA 1:1 assignment; groups for approved field coordination; Flex→LIFF for survey upload | tenant/project, resource/revision, survey/evidence, principal, issue owner | site, datum, units, tolerances, photos, constraints | survey approval and issue log |
| Brief / concept | OA 1:1 and personal push for tasks; groups for read-only coordination; Flex→LIFF for selection | project/customer, consent, resource/revision, brief, option, decision, audit | requirements, options, assumptions, room/product links | selected concept and budget band |
| Spatial coordination | groups for approved-team digest; OA 1:1 for assigned issue; Flex→LIFF for resolution | project, resource/revision, drawing/evidence, issue, decision, audit | dimensions, interfaces, clashes, utilities, accessibility | coordinated revision |
| Technical design | personal push for assigned review; groups for safe digest; Flex→LIFF for high-risk approval | project, resource/revision, drawing, spec, BOM, grant, decision, audit | drawings, specs, schedules, product compatibility, approvals | frozen issue package |
| Price / contract / change | OA 1:1 summary and personal push; Flex→LIFF for price/change acceptance | tenant/project/customer, price, change, resource/revision, grant, decision, audit | priced revision, inclusions, exclusions, taxes, dependencies | authorized commercial baseline |
| Procurement / manufacture | personal push for exceptions; groups for approved operations; Flex→LIFF for release | project, BOM, drawing, spec, supplier evidence, revision, grant, decision, audit, outbox | supplier, lead-time, CAM/CNC package, QA plan | release to manufacture |
| Logistics / install | personal push for assigned event; groups for approved crew; Flex→LIFF for exception/acceptance | project, logistics, delivery, install, QA/evidence, revision, outbox, audit | pack/location IDs, delivery condition, site readiness, installation checks | installed acceptance |
| Handover / warranty / referral | OA 1:1 service; consented personal push; Flex→LIFF for defect, acceptance, or privacy choice | tenant/project/customer, consent, as-built, warranty, defect, delivery, decision, audit | as-built record, manuals, defects, warranty, consented follow-up | closeout and service ownership |

ISO 19650-1 addresses exchanging, recording, versioning, and organizing information across the asset lifecycle; the published 2018 edition is currently marked for revision. **[Official constraint]** Source: [ISO 19650-1](https://www.iso.org/standard/68078.html). ISO 10007 describes configuration-management principles across a product or service lifecycle. **[Official constraint]** Source: [ISO 10007:2017](https://www.iso.org/standard/70400.html).

## 12. Product-family and parameter model

**[Proposal]** A product family is a governed schema, not a fixed width table. Minimum fields are family/version, source URL/document revision, market, intended application, geometry parameters, material/finish, hardware/appliance interfaces, clearance/ventilation/service zones, load and tolerance assumptions, manufacturing method, certifications, effective dates, substitutions, and approval evidence.

| Family | Example parameters | Evidence rule |
|---|---|---|
| Base, wall, tall/larder, vanity, wardrobe, media, office, island, shelving, custom | width/height/depth, carcass thickness, reveals, plinth, backs, scribes, service voids, equipment/cable zones | **[Proposal]** Values require current market/manufacturer/project source. Custom remains governed by project engineering and source evidence. |
| Door, drawer, lift-up, sliding, pocket | front geometry, overlay/inset, gap, mass, hinge/runner/lift capacity, opening envelope | **[Proposal]** Compatibility resolves against the exact hardware family/revision. |
| Sink, hob, hood, oven, refrigerator, dishwasher, laundry | cutout, ventilation, heat/moisture clearance, utilities, service access | **[Proposal]** Appliance installation document governs; larger safety clearance prevails. |
| Panel, stone, glass, metal, upholstery, finish | stock size, thickness, grain/direction, edge, bend/radius, seam, batch, care | **[Proposal]** Source and batch/revision travel into BOM and QA. |

**Primary-source capability fact:** IKEA's Thailand METOD buying guide shows multiple base, wall, and high-cabinet dimensions; it is a dated, market-specific example rather than a universal standard. Source: [METOD buying guide](https://www.ikea.com/th/en/files/pdf/ea/22/ea22e971/metod_bg_apr21_th.pdf). Blum publishes product data, technical drawings, CAD data, and configurator collision checks; Häfele publishes application-specific connector families. Sources: [Blum product database](https://www.blum.com/gb/en/services/planning-construction-product-selection/product-database/), [Blum cabinet configurator](https://www.blum.com/gb/en/services/planning-construction-product-selection/cabinet-configurator/index.html), and [Häfele connectors](https://www.hafele.com/us/en/products/furniture-fittings-living-solutions/connectors-shelf-supports/connectors/50/). These catalogue/configurator descriptions support schema and workflow design; exact installation compatibility still requires the current product and project documents.

**[Inference]** Configurations should be data with provenance and compatibility rules. A generated cabinet or room remains a revisioned instance of sourced parameters, never evidence that one brand's dimensions fit another market or application.

## 13. Materials, survey, CAD/BIM, CAM/CNC, and factory chain

RICS measured-survey guidance requires the client and surveyor to agree survey purpose, accuracy, control, datum, content, and deliverables. **[Official constraint]** Source: [RICS measured surveys](https://www.rics.org/profession-standards/rics-standards-and-guidance/sector-standards/land-standards/measured-surveys-of-land-buildings-and-utilities). IFC is an open, vendor-neutral schema for built-environment data, with IFC 4.3 ADD2 published as ISO 16739-1:2024. **[Official constraint]** Source: [buildingSMART IFC](https://www.buildingsmart.org/standards/bsi-standards/industry-foundation-classes/?lang=en).

**Primary-source capability fact:** HOMAG describes SmartWOP as generating CNC programs, panel-cutting parts lists, fitting lists, and technical drawings and transferring production data to machine/production applications; its woodWOP CAM tooling imports external 3D models and simulates machining/collisions. Sources: [HOMAG SmartWOP](https://digital.homag.com/en/smart-wop/) and [woodWOP CAM plugin](https://www.homag.com/en/software-detail/software/work-preparation/woodwop-cam-plugin). Biesse describes B_SOLID as 3D CAD/CAM with machining simulation and virtual prototyping. Source: [Biesse B_SOLID](https://biesse.com/gb/en/software/b_solid/). These vendor capability statements do not qualify a particular MONOLITH job, machine, tooling, material, or post-processor.

**[Proposal]** The evidence chain is `survey source → coordinated model → approved product revision → drawing/specification/BOM → machine-specific post-process → simulation → first-article/QA → pack/location → installation → as-built/warranty`. Native and exchange files are linked by revision and checksum; the machine operator approves the post-processed program for the named machine/tooling/material. CAD/BIM exchange is coordination evidence, while CAM output is machine-context evidence.

Appliance instructions may impose ventilation, clearances, local-condition checks, and the rule that the larger stated safety distance governs. **[Official constraint]** Source: [Bosch installation instructions](https://media3.bosch-home.com/Documents/9000952998_A.pdf). FSC chain-of-custody certification relies on identifying, separating, and tracking certified material through the supply chain. **[Official constraint]** Source: [FSC chain of custody](https://connect.fsc.org/certification/chain-custody-certification).

## 14. Role and accountability scorecard

| Role | Accountable outcomes | Human Surface default | Step-up events |
|---|---|---|---|
| Executive / board / product owner | risk appetite, investment, tenant boundary, stop rules | portfolio digest | expansion or risk acceptance |
| Tenant owner / studio director | policy, memberships, retention, escalation | operational digest | role/grant/retention change |
| Sales / relationship lead | qualified lead, consented contact, commercial handoff | lead tasks and reminders | offer or discount approval |
| Project manager | baseline, scope, schedule, dependencies, change control | exception and approval cards | baseline/change release |
| Designer / architect | brief, model, drawings, coordinated revision | review cards and issue links | design freeze |
| Surveyor | datum, accuracy, constraints, signed survey issue | survey checklist | survey acceptance |
| Estimator / quantity surveyor | quantities, rates, assumptions, exclusions | variance card | commercial baseline |
| Procurement / supplier | approved item, provenance, lead time, substitution | exception card | substitution acceptance |
| Engineer / technical checker | compatibility, structural/services constraints | issue card | technical release |
| CAM/CNC programmer / factory planner | post-process, machine setup, simulation, cut list | release queue | manufacture release |
| QA / logistics / installer | inspection, pack/location, condition, readiness, as-built | checklist and exception | shipment/install acceptance |
| Finance | invoice, payment allocation, refund evidence | status only | refund/write-off |
| Partner / consultant / trade contractor | bounded deliverable, interface, evidence, expiry | assigned package/issue only | delegation, substitution, or release |
| Customer approver | explicit scope/design/price acceptance | clear read-only summary + secure link | binding approval |
| Customer-of-customer / occupant | consented updates, access needs, defect reporting | minimum necessary update | identity-sensitive access or privacy choice |
| Support / warranty / privacy / security operator | recovery, complaint, rights request, incident | routed case card | override, deletion, disclosure, breach action |

**[Proposal]** Each scorecard entry resolves to named commands, data fields, assurance, service level, escalation, and substitute owner. “Administrator” is never universal authority: overrides are resource-scoped, time-bounded, reason-coded, and independently reviewed.

## 15. Capability matrix: now, next, and later

| Capability and current local evidence | Gap | Owner | Dependency | Principal risk | Measurable outcome |
|---|---|---|---|---|---|
| Flex composition — **[Verified local fact]** Parent @ `eca050a…`: presets/JSON/validator | governed domain adapter and tenant templates | Human Surface lead | stable resource/revision API | presentation becomes a second truth | deterministic render + template version in every card |
| Demo actions — **[Verified local fact]** Parent @ `eca050a…`: actions/receipt; receipt states `DEMO — NOT A PRODUCTION SIGNATURE` | server-issued command, current authz, production-grade evidence | Trust lead | identity, grants, revision, audit | demo gesture mistaken for approval | 100% high-risk commands bind authorized expected revision |
| Webhook/outbound/audit — **[Verified local fact]** Nested @ `a1e9006…`: functions, migrations, LINE tests | deployed P0 proof, outbox/reconciliation telemetry | Platform/security lead | target environment and secret custody | forgery, replay, cross-tenant send | 100% P0 fresh pass; zero duplicate business execution |
| Quiet hours — **[Verified local fact]** Nested @ `a1e9006…`: `quiet-hours.ts` and tests | tenant/role policy and digest experiment | Service design lead | consent/preferences and scheduler | fatigue or missed urgent work | baseline burden/opt-out; owned critical bypasses |
| Project/product truth — **[Verified local fact]** Nested is active-product root per scope correction | stable adapter API for revision/grants/audit | Product/domain lead | command/resource ontology | cross-root duplication/drift | one authoritative revision returned across surfaces |
| Product/factory chain — **[Proposal]** Sections 12–13 | controlled family/supplier/machine/first article | Technical/factory lead | survey, catalogues, CAM post-processor, QA | unsafe or untraceable release | complete release provenance and first-article sign-off |

Source presence does not prove deployment or production readiness.

**[Unknown]** A single executable cross-root pilot path, current deployed-schema state, live platform credentials, and target-environment telemetry await verification. The matrix intentionally separates repository presence from operational proof.

## 16. KPI hypotheses and baseline plan

Every number below is a **[Proposal]** hypothesis, not a current result or commitment. Baseline for four weeks in a consented internal/Daph-only cohort, record median and P90 where useful, then set board thresholds from observed distributions and risk appetite.

| KPI hypothesis | Definition | Initial hypothesis for test |
|---|---|---|
| Trust P0 pass rate | passed fresh P0 checks / applicable P0 checks | 100% is the only promotion condition |
| Cross-tenant isolation | unauthorized cross-tenant successes / negative attempts | 0 successes |
| Duplicate business execution | commands with more than one business transition / commands | 0 |
| Revision-safe completion | high-risk commands executed against authorized expected revision / completed high-risk commands | 100% |
| Message usefulness | recipients marking task useful / surveyed recipients | baseline first; seek sustained improvement without pressure |
| Notification burden | noncritical messages per active person per workday; after-hours contacts | baseline by role; reduce P90 with digest/quiet hours |
| Accessibility completion | representative tasks completed with keyboard/screen reader / attempted tasks | baseline with users; every critical task has viable path |
| Recovery time | elapsed time from failed/withdrawn action to reconciled state | baseline by scenario; rehearse P0 recovery |
| Design-to-release rework | revisions reopened after technical/manufacturing release / releases | baseline by cause, never suppress legitimate correction |
| Evidence completeness | required provenance/revision/owner fields complete / controlled objects | 100% at release gate |
| Complaint closure quality | resolved with reason, remedy, owner, and recurrence tag / closed complaints | 100% evidence completeness; satisfaction measured separately |
| Conversion | qualified, consented leads reaching the named next state / qualified, consented leads | baseline by journey; interpret with burden and complaint metrics |
| Approval latency | elapsed time from approval-ready revision to valid decision | baseline median/P90 by risk tier; never bypass review to improve it |
| Notification opt-out | recipients reducing or ending nonessential notifications / recipients offered the control | baseline by role/journey; investigate pressure or irrelevance |
| Quarantine age | elapsed time unresolved commands remain in `QUARANTINE` | baseline median/P90; every item has owner and expiry |
| SLA breach | owned cases missing the declared service target / eligible cases | baseline by severity and tenant; evidence cause and recovery |
| Delivery reliability | reconciled intended messages with known accepted/delivery outcome / queued intended messages | baseline by channel/result; acceptance is not human receipt |
| Service recovery | cases restored to an agreed state with reason/remedy / recoverable failures | baseline outcome and time; review recurrence |
| Adoption | eligible active roles completing the governed journey / eligible active roles | baseline after access/usability validation; voluntary use only |

**[Proposal]** Pair conversion or speed metrics with burden, complaint, accessibility, override, and recovery metrics. A growth outcome never overrides a trust stop rule.

## 17. Phased roadmap and migration sequence

| Phase | Deliverable | Exit evidence |
|---|---|---|
| P0 Trust closure | freeze boundary; implement signature, binding/authz, idempotency, intent/outbox, secret/audit/revocation; run negative and recovery drills | every P0 fresh pass in target environment, approved threat/data maps, rollback owner |
| Bounded Daph pilot | one low-risk workflow and one product family; read-only first, then controlled command | consented cohort, stable telemetry, accessibility/recovery evidence, owned P1 exceptions |
| Five governed journeys | qualify/brief; design/revision review; commercial change; procurement/manufacture release; handover/warranty | named roles, evidence schema, service/recovery targets, fresh gate per journey |
| Tenant-2 shadow | replay sanitized or consented events without external messaging or business mutation | independent isolation/portability review, policy/config diff, zero cross-tenant result |
| Controlled scale | board-authorized second tenant and/or additional Human Surface | P0–P2 current over observation window; incident, complaint, reliability and adoption review |

**[Proposal]** Migration uses strangler seams: adapter interfaces first, read-only views second, low-risk commands third, high-risk commands last. Each step has routing rollback, queued-work reconciliation, and evidence expiry. Parent-root demo components may inform presentation contracts; nested-root domain/trust components remain product authority.

## 18. Board GO/NO-GO gates and rollback

**GO now** for research, architecture, P0 implementation, local test development, controlled source integration, and a non-customer Daph rehearsal. **Conditional GO** for Daph customer messaging only after every P0 item passes freshly in the target environment and owners accept remaining P1 risk. **NO-GO for broader customer messaging** until P0 remains fully green across a defined observation window and P1 operational/accessibility/recovery evidence is approved. Daph is one pilot tenant.

Immediate stop conditions are: signature bypass; tenant ambiguity; cross-tenant access; stale-revision execution; unowned secret or credential exposure; double business execution; missing immutable audit; unreconciled outbox; inaccessible critical path; coercive or unconsented messaging; missing incident/rollback owner; or manufacture release without frozen evidence.

| Mandatory gate | Owner | Required evidence | Failure response | Rollback |
|---|---|---|---|---|
| Trust P0 | Trust/security lead + independent reviewer | fresh target-environment P0 ledger and negative tests | stop messaging and quarantine ambiguity | disable command/outbound path; preserve queue/audit |
| Tenant/audience isolation | Platform lead | cross-tenant, group-actor, forwarded-link, wrong-audience tests | incident triage and affected-tenant review | revoke binding/token; reconcile sends |
| Revision and high-risk approval | Product/domain + accountable business owner | expected-revision/step-up/four-eyes test and immutable decision | deny release; reopen controlled revision | invalidate command links; restore last approved baseline |
| Human/accessibility | Service design/accessibility owner | representative critical-task results, quiet-hours/opt-down, complaint route | pause affected journey and provide assisted alternative | route to accessible web/operator support |
| Delivery/recovery | Operations lead | outbox reconciliation, error dashboard, restore/retirement drill | stop expansion; recover ambiguous work | pause worker, reconcile, disable webhook/revoke token if needed |
| Manufacture release | Technical/factory/QA leads | frozen survey/model/BOM/drawing/CAM, simulation, first article | quarantine package and stop machine release | revert to last signed package; re-post-process and reapprove |

**[Proposal]** Rollback sequence: disable affected command policy; stop outbound worker while retaining the durable queue; preserve intent/audit evidence; reconcile ambiguous requests; route users to authenticated web/operator support; revoke or rotate channel credentials when compromise is suspected; disable webhook use for channel retirement; notify impacted tenant owners under the approved incident process; and require a new P0 evidence set before restoration. Platform retirement controls are documented by LINE at [stop using the Messaging API](https://developers.line.biz/en/docs/messaging-api/stop-using-messaging-api/).

## 19. Evidence ledger

| URL/evidence | Publisher | Date/version | Classification | Supported claim | Caveat |
|---|---|---|---|---|---|
| [Messaging API](https://developers.line.biz/en/docs/messaging-api/), [reference](https://developers.line.biz/en/reference/messaging-api/nojs/), [signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/), [redelivery](https://developers.line.biz/en/docs/messaging-api/receiving-messages/), [retry](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/) | LINE Developers | retrieved 2026-08-02 | Official constraint | message types/limits, origin validation, redelivery/retry semantics | platform rules can change; acceptance is not human receipt |
| [Getting started](https://developers.line.biz/en/docs/messaging-api/getting-started/), [LINE Login](https://developers.line.biz/en/docs/line-login/getting-started/), [LIFF](https://developers.line.biz/en/reference/liff-server/) | LINE Developers | retrieved 2026-08-02 | Official constraint | provider/channel/LIFF lifecycle | current docs flag MINI App direction for new work |
| [SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final) | NIST | 2020 | Official constraint | zero-trust resource/session reasoning | framework, not MONOLITH implementation proof |
| [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html) | IETF/RFC Editor | 2025 | Official constraint | OAuth exact redirect/PKCE/token protections | apply per client and threat model |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | W3C | Recommendation 2023 | Official constraint | accessible interaction criteria | conformance requires evaluation with actual content/UI |
| [RIBA Plan of Work](https://www.architecture.com/-/media/GatherContent/Test-resources-page/Additional-Documents/2020RIBAPlanofWorktemplatepdf.pdf), [ISO 19650-1](https://www.iso.org/standard/68078.html), [RICS surveys](https://www.rics.org/profession-standards/rics-standards-and-guidance/sector-standards/land-standards/measured-surveys-of-land-buildings-and-utilities) | RIBA / ISO / RICS | 2020 / 2018 / current page | Official constraint | lifecycle, information revision, survey framing | analogues/guidance; project requirements still govern |
| [IKEA METOD](https://www.ikea.com/th/en/files/pdf/ea/22/ea22e971/metod_bg_apr21_th.pdf), [Blum](https://www.blum.com/gb/en/services/planning-construction-product-selection/product-database/), [Häfele](https://www.hafele.com/us/en/products/furniture-fittings-living-solutions/connectors-shelf-supports/connectors/50/), [HOMAG](https://digital.homag.com/en/smart-wop/), [Biesse](https://biesse.com/gb/en/software/b_solid/) | official manufacturers | retrieved 2026-08-02; document-specific versions | Primary-source capability fact | catalogue dimensions, configuration and CAD/CAM tool capabilities | descriptive and market/product/machine specific; not installation compatibility or qualification |
| [Bosch installation instructions](https://media3.bosch-home.com/Documents/9000952998_A.pdf), [FSC chain of custody](https://connect.fsc.org/certification/chain-custody-certification) | Bosch / FSC | retrieved 2026-08-02; document-specific versions | Official constraint | appliance installation clearances and certified-material traceability | applies only to the exact product/certification scope and current revision |
| Parent root `LineOS/line-flex-*.mjs`, studio and tests @ `eca050a…` | local parent Git root | inspected 2026-08-02 | Verified local fact | standalone composition/demo contracts | repository evidence only |
| Nested LINE functions/migrations/tests/quiet-hours @ `a1e9006…` | local nested Git root | inspected 2026-08-02 | Verified local fact | active-product ingredients | repository evidence only; dirty tree preserved |
| Sections 3–17 | this synthesis | 2026-08-02 | Inference | boundary, priorities, lifecycle synthesis | requires validation in context |
| P0–P3, KPIs, roadmap, gates | board proposal | 2026-08-02 | Proposal | authorization and verification plan | targets remain hypotheses until approved/baselined |
| Live deployment, telemetry, user evidence, transcripts | unavailable evidence | 2026-08-02 | Unknown | blocks maturity/broader release claims | must be resolved with fresh artifacts |

## 20. Limitations, open questions, and conclusion

This is a source-and-primary-research decision report. It does not attest a production deployment, a live LINE/Supabase integration, a legal or regulatory conclusion, universal accessibility, universal furniture dimensions, real-machine qualification, or a production receipt signature. The 2 August Perplexity calls returned quota errors; the approved 1 August design specification is the archived synthesis source, and independent primary-source verification is visible in this report. Manufacturer documents are time-, market-, product-, and machine-specific. Standards and platform guidance can change, so owners must revalidate them at implementation and evidence-expiry dates.

Open questions remain **[Unknown]**: target tenant/legal entity and regions; data-retention and lawful-basis decisions; identity-provider and provider/channel ownership; command risk classification; deployed schema/migration state; secret custody; load/error budgets; LINE plan/account limits; representative accessibility participants; factory machines/post-processors; supplier markets; recovery objectives; and who independently signs each P0 result.

The board should authorize the Daph-only evidence program, appoint one Trust P0 owner and one independent reviewer, select a single low-risk workflow and product family, and require a new decision record before any tenant or scenario expansion.

**Conclusion:** MONOLITH should be a multi-tenant, revision-controlled project and product operating system. LINE is a replaceable Human Surface. Daph is one pilot tenant. Broader customer messaging remains NO-GO until every Trust P0 gate passes with fresh evidence.
