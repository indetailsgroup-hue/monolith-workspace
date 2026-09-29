# MONOLITH LINE Flex Studio Design

- **Edition:** English
- **Date:** 1 August 2026
- **Status:** Interactive design approved; written-spec review pending
- **Delivery location:** parent governance/bootstrap repository, under **LineOS/**
- **Product repository:** separate nested repository **determined-williams/**; no product-runtime change is authorized by this design
- **Chosen approach:** Production-shaped Standalone Studio
- **Primary journey:** Design ready for approval → private LIFF-style review → explicit confirmation → Verification Receipt — Demo

## 1. Executive decision

MONOLITH will demonstrate LINE as a Human Surface through a standalone, browser-based Flex Message authoring and decision simulator. The simulator will be useful for executive review, customer-experience design, training, JSON inspection, and future implementation planning without connecting to LINE, Supabase, production credentials, or live customer delivery.

The design has two simultaneous goals:

1. create a warm, premium, high-conversion experience that customers and staff understand immediately; and
2. make the trust boundary visible: a Flex tap is not business approval, LINE is not the system of record, and consequential actions require identity-bound review through LIFF and the MONOLITH Trust Kernel in production.

Broader customer messaging remains **NO-GO** until the existing Trust Foundation P0 gates have complete, fresh evidence.

## 2. Repository and evidence baseline

MONOLITH is a two-root system.

| Root | Verified role for this design | Consequence |
|---|---|---|
| Parent **C:\Users\thai3\determined-williams (2)** | Governance/bootstrap, research, existing LineOS HTML mock-ups and visual artifacts | The new standalone prototype and project-facing documents belong under **LineOS/**. |
| Nested **C:\Users\thai3\determined-williams (2)\determined-williams** | Active product source with LINE webhook, outbound sender, Flex template support, migrations, tests, workflow and approved Trust Foundation design | Existing implementation is evidence and a future integration target. It is not modified by this design and does not prove deployment or production readiness. |

This baseline follows **CONTEXT.md** and the mandatory 21 July 2026 repository-scope correction. Both Git roots were inspected separately. Both contained pre-existing changes; those changes remain outside scope.

The **LineOS/** inventory includes role-based HTML mock-ups, multiple archived variants, a LINE OA/LIFF masterclass, a Coohom research artifact, a Flex block diagram, and North Star approval-flow diagrams. It does not currently contain a working real-time Flex editor, generated JSON validator, Mock LIFF journey, or receipt simulator.

The nested product includes:

- a template composition model and Flex-capable outbound sender;
- LINE OA webhook, identity, order, group, customer-document and approval migrations;
- LINE OA commerce test suites;
- an approved Trust Foundation design and six-wave program plan.

Source presence is not deployment evidence. This design therefore uses the nested source as a production-shaped reference, not as a live dependency.

## 3. Research basis and evidence labels

Three Perplexity Deep Research tracks were completed on 1 August 2026:

1. LINE Messaging API, Flex Message, LIFF, Developer Console, performance and security;
2. Trust Kernel, tenant isolation, step-up, inbox/outbox reliability, audit, privacy and human factors;
3. interior-design-to-installation product completeness, roles, cabinet/millwork variability, tools, service design and ethical adoption.

The implementation report must separate:

- **Official constraint:** stated by LINE, a standard, a regulator, or another primary authority;
- **Verified local fact:** observed in one named Git root and file;
- **Research evidence:** peer-reviewed or authoritative published evidence;
- **Inference:** a conclusion derived from facts;
- **MONOLITH best practice:** a proposed operating rule;
- **Unknown:** not established by current evidence.

No vendor maximum, regional cabinet dimension, or research recommendation becomes canonical product truth without provenance and tenant/project configuration.

## 4. Approved owner decisions

| Decision | Approved outcome |
|---|---|
| Primary story | Design ready for approval → review revision → confirm → receive evidence receipt |
| Visual direction | Trust Concierge: warm, premium and credible |
| Customer-facing brand hierarchy | Tenant-first with a subtle **Secured by MONOLITH** trust mark |
| Internal platform hierarchy | MONOLITH-first with explicit tenant context |
| Simulator layout | Studio Console: editor, phone preview and JSON/validation visible together |
| Delivery boundary | Standalone browser demo; no live LINE or Supabase integration |
| Presets | Five: design approval, quote/order, SLA escalation, curated site update, issue/evidence |
| Receipt integrity | **Verification Receipt — Demo** with digest; no false production-signature claim |
| Implementation approach | Production-shaped standalone modules, not a story-only showroom and not a sandbox integration |
| Language | Thai and English user interface and documents |

## 5. Objectives

The first implementation must:

1. let a user edit Header, Hero, Body and Footer content;
2. update a LINE-like phone preview, generated JSON and validation results in real time;
3. make five approved presets available without sharing mutable state between them;
4. teach the correct boundary between Flex actions, LIFF review and MONOLITH business authority;
5. simulate an exact-action approval journey and create a clearly labelled demo receipt;
6. expose errors, warnings and guidance with bilingual remediation;
7. provide copy, download and reset functions without a network dependency;
8. work at desktop, tablet and mobile widths;
9. support keyboard navigation and readable Thai/English text;
10. provide board-grade bilingual research, installation and decision documentation.

## 6. Non-goals

The first implementation will not:

- send a real LINE message;
- create or modify a LINE Official Account, provider, channel or LIFF app;
- use a channel access token, channel secret, service-role key or production credential;
- call Supabase, LINE APIs, a CDN, analytics or any external endpoint;
- authenticate a real LINE user;
- cryptographically sign a production receipt with a governed private key;
- claim full Messaging API conformance merely because the local validator passes;
- replace the official LINE Flex Message Simulator or real-device testing;
- edit raw JSON directly;
- make LINE the system of record, authorization service or internal chat product;
- define one universal cabinet-size standard;
- modify the nested active product repository.

## 7. Architecture and safety boundary

### 7.1 Browser-only authoring path

The authoring path is:

**Preset Gallery / Block Editor → canonical FlexDraft → Phone Preview + JSON Builder + Validator**

All three outputs read from one immutable draft snapshot. No output maintains independent business state. Changing tenant, recipient, revision, action or expiry updates every derived surface.

### 7.2 Simulated consequential-action path

The approval path is:

**Flex URI action → demo action router → Mock LIFF review → explicit confirmation → Verification Receipt — Demo**

The demo action router binds:

- tenant identity;
- audience and recipient;
- project/resource reference;
- revision;
- canonical action;
- payload digest input;
- created time and expiry;
- correlation identifier.

The Mock LIFF screen shows the exact consequence and refuses confirmation if required bound values are missing, expired, or inconsistent. The simulator then creates a deterministic evidence receipt. This is a teaching and review mechanism, not a production authorization ceremony.

### 7.3 Future production boundary

The documented but disconnected future path is:

**Unified ingress → tenant/resource/principal resolution → Trust Kernel decision → domain command → decision audit + business state + atomic outbox → LINE delivery worker**

The production Trust Kernel returns **PERMIT**, **DENY**, **STEP_UP**, or **QUARANTINE**. The standalone simulator never pretends to execute that path.

### 7.4 Non-bypass invariants

1. A Flex tap never equals business approval.
2. A high-risk action always opens LIFF-style review in the simulator and requires Trust Kernel step-up in production.
3. Tenant identity is explicit in draft, intent and receipt even when the visible customer-facing brand is tenant-first.
4. Quarantined group evidence cannot change workflow state.
5. Generated JSON contains no secret, bearer token, raw personal-data master or authoritative business state.
6. Price, dimensions, revision and status shown in presets are demo data until read from MONOLITH in a future authorized integration.

## 8. User experience architecture

### 8.1 Desktop Studio Console

The desktop layout has three persistent areas:

1. **Left:** tenant/language context, preset gallery, block selector and block field controls;
2. **Center:** LINE-like phone preview and Run Journey control;
3. **Right:** generated JSON, copy/download controls and validation summary.

The header exposes MONOLITH platform identity, current tenant, language and help. Customer-facing previews use tenant-first branding.

### 8.2 Tablet and mobile

At narrower widths, the three areas become tabs:

- Editor;
- Preview;
- JSON & Validation.

Tab changes preserve the same FlexDraft. No information or validation state is discarded. The primary action remains reachable by keyboard and does not depend on hover.

### 8.3 Trust Concierge visual system

The visual system uses:

- warm neutrals for project imagery and hospitality;
- MONOLITH green for trust, primary action and verified state;
- restrained gold for deadlines or attention;
- generous spacing, rounded surfaces and plain-language labels;
- one visually dominant CTA;
- explicit revision, sender, expiry and private-link cues;
- tenant logo/name as the customer-facing lead;
- subtle **Secured by MONOLITH** trust mark.

Motion is optional, brief and disabled by reduced-motion preference. Approval messages do not use celebratory animation before confirmation.

## 9. Canonical draft and derived records

### 9.1 FlexDraft

| Group | Required fields |
|---|---|
| Context | draft version, preset ID, tenant ID/name, audience, language, demo status |
| Header | eyebrow, title, tenant mark, status label |
| Hero | local preview asset ID, exported HTTPS URL placeholder, aspect ratio, aspect mode, accessible description |
| Body | project, resource, revision, requester, amount/scope, deadline, summary and trust note |
| Footer | primary label, secondary label when permitted, action intents |
| Intent | canonical action, risk tier, target mode, target reference, expiry |
| Evidence | correlation ID, created time, recipient reference and digest input |

The draft model contains domain-neutral fields sufficient for the five presets. It does not become a generic workflow engine.

### 9.2 Generated Flex JSON

The JSON Builder produces a LINE Flex message envelope with required alternative text and one bubble containing Header, Hero, Body and Footer in canonical order.

The first version supports one bubble. Carousel authoring, video, rich text spans, raw JSON import and arbitrary component nesting remain out of scope. The validator may teach carousel/video constraints but the editor does not create them.

### 9.3 Demo transaction

The demo transaction is generated when Run Journey is selected. It contains the exact intent and a snapshot digest input. Changing a bound value invalidates the prior transaction and receipt.

### 9.4 Verification Receipt — Demo

The receipt shows:

- an unmistakable **DEMO — NOT A PRODUCTION SIGNATURE** label;
- tenant and customer-facing provider;
- recipient reference;
- project/resource and revision;
- canonical action and outcome;
- created and confirmed timestamps;
- correlation identifier;
- SHA-256 integrity digest of canonical demo fields;
- statement that production signing and audit require the MONOLITH Trust Kernel.

The digest demonstrates change detection. It is not described as non-repudiation, legal signature, immutable archive or production attestation.

## 10. Five preset contracts

| Preset | LINE surface | Flex responsibility | Mock LIFF / MONOLITH responsibility | Prohibited shortcut |
|---|---|---|---|---|
| Design Approval | OA 1:1 or personal push | Summarize revision, consequence, sender and deadline; URI opens review | Bind recipient/tenant/revision/expiry; explicit confirmation; receipt | One-tap postback approval |
| Quote / Structured Order | OA 1:1 | Summarize price and terms; URI opens review; optional message action requests human contact | Select options, confirm order party and delivery details, create structured intent | Treating free text as an order |
| SLA Escalation | Personal push | Postback may acknowledge low-risk receipt; URI opens authoritative work item | Show owner, SLA clock, delegation and exact action; step-up high-risk decisions | Treating acknowledgement as approval or workflow transition |
| Curated Site Update | Customer group | Show human-curated progress; optional URI opens curated gallery | Enforce audience policy and approved evidence set | Automatically forwarding internal photos |
| Issue / Evidence | Internal group | Postback may acknowledge receipt; URI opens review queue | Store provenance; unknown actor evidence enters quarantine; human promotes or rejects | Letting quarantined evidence change business state |

## 11. Flex action versus LIFF decision rule

| Condition | Selected action |
|---|---|
| The intended result is visible conversational text | Message action |
| The choice is low-risk, reversible and fully reauthorized server-side | Postback action with an opaque intent reference |
| The destination is read-only content, a normal website or telephone link | URI action |
| The task needs identity, sensitive details, form input, comparison, accessibility, confirmation or policy explanation | URI action opening LIFF |
| The action changes money, access, scope, revision, release, policy or other difficult-to-reverse state | LIFF plus production Trust Kernel step-up |

LIFF is not a separate Messaging API action type. A Flex button opens LIFF through a URI action. Postback data never carries an authoritative tenant, role, amount or approval truth; production MONOLITH must resolve and reauthorize current state.

## 12. Validation contract

### 12.1 Rule metadata

Every validation rule contains:

- stable rule ID;
- severity;
- affected block and field;
- Thai and English title, explanation and remediation;
- classification as official constraint or MONOLITH best practice;
- primary source URL where applicable;
- last-verified date;
- optional client/version note.

### 12.2 Severity behavior

| Severity | Meaning | UI behavior |
|---|---|---|
| Error | Generated message cannot meet the supported subset or a required safety field is absent | Highlight field/block; preserve input; disable JSON export and Run Journey |
| Warning | Message may render poorly, exceed a MONOLITH soft budget, confuse intent or use an unsafe action pattern | Allow export with visible warning count; provide exact remediation |
| Guidance | Education, official-simulator step, real-device check or production-boundary reminder | Non-blocking, source-linked explanation |

### 12.3 Supported official constraints

The initial registry covers at least:

- required Flex message type, alternative text and contents;
- one bubble with blocks in Header → Hero → Body → Footer order;
- alternative-text maximum of 1,500 characters;
- one-bubble definition size ceiling of 30 KB;
- HTTPS image URL, supported format and declared aspect behavior;
- image URL maximum 2,000 characters, image maximum 1024×1024 pixels and 10 MB as acceptance ceilings;
- button action and button-label requirements;
- Postback and Message data/text limits of 300 characters;
- URI limit of 1,000 characters;
- known feature/version notes where relevant.

Official acceptance ceilings are not performance targets.

### 12.4 MONOLITH best-practice warnings

The initial best-practice registry covers:

- more than one dominant CTA;
- high-risk postback;
- transaction-critical facts only in an image;
- fixed-height text containers;
- excessive copy, likely Thai/English wrapping and unbounded names;
- low contrast or missing textual equivalents;
- unknown image ratio/cropping risk;
- external URL host not approved for a future production allowlist;
- missing deadline, revision, sender, audience or consequence;
- unlabelled demo/prod boundary.

## 13. Performance and rendering contract

1. The prototype ships with local visual assets and makes no external request.
2. User-entered HTTPS image URLs appear in JSON but are not fetched in the first version; preview uses a local placeholder and identifies the exported URL separately.
3. Base64 images are never embedded in generated Flex JSON.
4. Generated bubble JSON is measured in UTF-8 bytes and compared with the official 30 KB ceiling.
5. The UI warns before the ceiling using a MONOLITH soft budget of 24 KB.
6. Preview widths include 320, 360 and 390 pixels, plus desktop canvas scaling.
7. Tests include Thai, English, long names, emoji, currency, dates and explicit line wrapping.
8. Layouts remain shallow and avoid pixel-perfect assumptions across LINE clients.
9. Image and video official maxima are documented as ceilings; the guide recommends substantially smaller optimized media.
10. The simulator remains usable without an image.
11. Reduced-motion preference removes non-essential animation.
12. The standalone application contains no analytics, remote fonts or third-party runtime library.

## 14. Error and state handling

- Invalid fields never delete or reset unrelated user input.
- Validation focuses the exact field and block.
- Preset switching creates a fresh draft snapshot; it never mutates the source preset.
- Reset requires confirmation only when the draft differs from its preset.
- Copy and download report explicit success or failure.
- Run Journey is disabled while blocking errors exist.
- Expired or inconsistent demo transactions fail closed and explain which bound value changed.
- A broken or absent hero uses a local fallback without layout collapse.
- Receipt generation never displays a production-success claim.
- The application survives refresh through optional local draft storage, but approval correctness never depends on storage. Clear Draft removes local demo data.

## 15. Accessibility and ethical adoption

The prototype targets WCAG 2.2 AA practices appropriate to a standalone demonstration:

- semantic headings, labels, buttons, tables and dialogs;
- complete keyboard operation and visible focus;
- no color-only state;
- readable contrast and scalable text;
- bilingual alternative text and validation;
- reduced motion;
- error summary and field-level association;
- plain-language consequence before confirmation.

The service-design guidance prohibits coercive retention, false urgency, preselected consent, hidden refusal, notification spam and success animation before business confirmation. Retention should come from reduced rework, faster decisions, transparency, quiet hours, consent, portability, human support and excellent service recovery.

## 16. Documentation design

Project-facing documents will be produced in English and Thai, each as Markdown and standalone HTML.

| Deliverable | Required coverage |
|---|---|
| Executive Deep Research Report | Three LINE tracks, P0–P3 gaps, threat model, product/domain matrix, role scorecard, ethical adoption, roadmap, KPI hypotheses and board go/no-go |
| Flex Studio User Guide | Presets, editing, preview, validation, copy/download, Mock LIFF and receipt |
| Developer Console Installation Guide | OA/provider/channel/LIFF setup, endpoint/scopes/webhook configuration, validation, test and rollback steps |
| Flex Action vs LIFF Guide | Decision matrix, examples, risk tier and anti-patterns |
| Performance and Rendering Checklist | Payload, media, layout, Thai/English, device/version, accessibility and failure testing |
| Design and Implementation Records | This approved spec, implementation plan, verification report and residual-risk statement |

The installation guide must identify the observed LINE console/document date because interfaces and terminology can change. It will use official LINE sources for technical instructions.

## 17. Planned file boundary

The implementation plan may create files only under **LineOS/** unless a later owner decision expands scope.

| Planned file | Responsibility |
|---|---|
| **LineOS/line-flex-studio.html** | Semantic application shell and dialogs |
| **LineOS/line-flex-studio.css** | Trust Concierge tokens, layout, responsive and print styles |
| **LineOS/line-flex-studio.mjs** | UI controller and event wiring |
| **LineOS/line-flex-model.mjs** | Draft creation, immutable updates and canonicalization |
| **LineOS/line-flex-presets.mjs** | Five immutable bilingual preset definitions |
| **LineOS/line-flex-json.mjs** | Supported-subset Flex JSON generation and byte measurement |
| **LineOS/line-flex-validator.mjs** | Source-labelled validation registry and evaluation |
| **LineOS/line-flex-actions.mjs** | Action-risk selection and demo transaction binding |
| **LineOS/line-flex-receipt.mjs** | Canonical receipt input and SHA-256 digest |
| **LineOS/assets/line-flex-studio/** | Local demo visuals and icons |
| **LineOS/tests/*.test.mjs** | Node built-in unit tests |
| **LineOS/docs/** | Bilingual research, guides, design, plan and reports |

No file in the nested product repository is part of this implementation cycle.

## 18. Verification strategy

### 18.1 Test-first core behavior

Automated tests will be written before production module behavior for:

- immutable preset/draft isolation;
- deterministic JSON;
- required field and byte-limit validation;
- official-constraint versus best-practice classification;
- action selection by intent and risk;
- high-risk postback rejection;
- transaction expiry and bound-value invalidation;
- deterministic receipt digest;
- digest change when tenant, recipient, revision or action changes;
- secret-shaped value rejection where applicable.

### 18.2 Browser verification

Browser checks cover:

- all five presets;
- every editable field and block;
- real-time preview/JSON/validation update;
- copy/download/reset;
- Mock LIFF review and explicit confirmation;
- expired and changed-revision failures;
- receipt label and digest;
- keyboard-only navigation;
- 1440, 1024, 768, 390, 360 and 320 pixel layouts;
- Thai/English long text, broken hero and reduced motion;
- absence of external network requests.

### 18.3 Documentation verification

Checks confirm:

- English/Thai Markdown and HTML pairs exist;
- HTML begins with a doctype, declares the correct language and opens standalone;
- headings, tables, links and code samples render;
- no placeholder, contradictory status, broken internal link or unsupported production claim remains;
- each official technical claim has a primary source.

## 19. Acceptance gates

1. All five presets create deterministic JSON without shared mutable state.
2. Editing every block updates preview, JSON and validation immediately.
3. High-risk actions always open Mock LIFF; postback is limited to low-risk acknowledgement patterns.
4. An invalid draft cannot export or run a journey and receives bilingual field-level remediation.
5. A receipt digest changes when tenant, recipient, revision, action or canonical payload changes.
6. The application makes no external request and contains no secret or live-send path.
7. Keyboard and responsive checks pass at the declared widths.
8. Thai/English wrapping, long text, missing media and payload warnings are verified.
9. Installation and action guidance separates official LINE constraints from MONOLITH best practices.
10. The executive report states **NO-GO** for broader customer messaging until every Trust P0 release gate passes.

## 20. Production expansion gates

The prototype does not change the approved Trust Foundation stop rule. Before broader customer messaging or a second live tenant, MONOLITH must prove:

1. unambiguous tenant mapping for active LINE/project records;
2. unified signature-verified ingress and safe processing leases;
3. OAuth/OIDC state and nonce verification;
4. action-bound, expiring, one-time step-up;
5. group actor authorization and unknown-actor quarantine;
6. atomic business state, decision audit and delivery intent;
7. outbox concurrency, stable retry, duplicate and unknown-after-send recovery;
8. cross-tenant denial, revocation, expiry and non-transitive delegation;
9. tamper-evident audit, retention, purge and secret/PII controls;
10. second-tenant shadow proof with live delivery blocked;
11. backup/restore, monitoring, operator reconciliation and rollback rehearsal;
12. no unresolved Critical or High finding in the Trust Foundation scope.

## 21. Primary references

- [LINE Flex Message elements](https://developers.line.biz/en/docs/messaging-api/flex-message-elements/)
- [Using Flex Messages](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/)
- [Flex Message layout](https://developers.line.biz/en/docs/messaging-api/flex-message-layout/)
- [Messaging API actions](https://developers.line.biz/en/docs/messaging-api/actions/)
- [Registering LIFF apps](https://developers.line.biz/en/docs/liff/registering-liff-apps/)
- [LIFF development guidelines](https://developers.line.biz/en/docs/liff/development-guidelines/)
- [Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- [Retrying API requests](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
- [OAuth 2.0 Security Best Current Practice, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
- [NIST SP 800-207 Zero Trust Architecture](https://csrc.nist.gov/pubs/sp/800/207/final)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Thailand Personal Data Protection Act](https://www.mdes.go.th/uploads/tinymce/source/%E0%B8%AA%E0%B8%84%E0%B8%AA/Personal%20Data%20Protection%20Act%202019.pdf)
- Local **CONTEXT.md**
- Local repository-scope correction dated 21 July 2026
- Nested **docs/superpowers/specs/2026-07-26-line-trust-foundation-design.en.md**
- Nested **docs/superpowers/plans/2026-07-26-line-trust-foundation-program.en.md**

## 22. Completion definition for the design cycle

The design cycle is complete when:

- English and Thai written specs and standalone HTML companions exist;
- the files pass placeholder, consistency, scope and ambiguity review;
- the user approves the written spec;
- a separate bilingual implementation plan is written through the approved planning workflow.

Implementation has not started merely because this design is approved.
