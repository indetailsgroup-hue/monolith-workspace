# Requirements Document

## Introduction

This document defines requirements for **LINE OA Commerce (Module B5)** — a full-featured LINE Official Account capability delivered as a **dual-vertical shared SaaS platform module**. A single set of platform logic (webhook ingestion, conversation/identity, order intake, outbound messaging, forecasting sync, audit) serves **both** business verticals operating on the platform:

- **MONOLITH** — furniture / interior-design manufacturing business.
- **TCCK** — Thai Curry Cloud Kitchen (food) business.

The module accepts a **Vertical_Context** (tenant context) on every conversation, order, and identity record, and reuses ONE shared implementation across both verticals. Vertical-specific behavior — for example furniture order fields versus food menu items, or brand voice and message-template wording — is isolated behind adapters / extension points and is **never** forked into parallel implementations.

LINE OA Commerce covers three core domains: **CHAT** (inbound/outbound messaging), **SALES / ORDERING** (capturing orders through LINE), and **CRM / Customer Identity** (binding a LINE userId to a canonical customer). Strategically, the LINE OA is the platform's **owned / direct channel** and the heart of aggregator defence.

**Build-vs-Buy:** the messaging surface itself is **Buy** (LINE Official Account Manager / Messaging API). This module owns the **integration layer**: webhook ingestion, order intake normalization, customer identity resolution, and CRM.

LINE OA Commerce builds strictly on the shipped shared-platform primitives and does **not** redefine them:

- **A1 (Enterprise Structure & Topology)** owns the canonical site list. This module treats `public.get_active_site_codes()` — which returns `(site_code, company_id, location_type)` for active locations — as the only source of valid Site_Codes.
- **C12 (Security & Access Federation)** owns roles and `site_codes`. This module reuses the existing helpers `public.current_app_roles()`, `public.has_any_app_role(text[])`, `public.has_site_access(text)`, `public.is_governance_role()`, and `public.resolve_actor()`, with RLS policies gated `TO authenticated` and all writes through SECURITY DEFINER RPCs.
- **The existing Forecasting input pipeline** is reused via `Sync_Source='line'` through `record_input_sync`, writing to the append-only `forecast_input_sync_log`. This module does not redefine the forecasting contract.
- **D2 (AI Autonomy Ladder)** owns autonomy governance. This module constrains all AI actions to its guardrails.

**Webhook security:** LINE signature verification is mandatory. Requests with a missing or invalid signature are rejected. Each channel's access token and secret are stored as per-channel secrets and never appear in code or logs. Secret resolution is dynamic per channel so the platform is multi-tenant ready across verticals.

## Topology

The platform uses a **Centralized_OA_Topology**: one LINE Official Account per vertical channel serving all branches of that vertical, rather than one account per branch. Because the LINE webhook payload does **not** carry a Site_Code, the Site_Code is resolved at the application layer and stored as state on the Conversation.

While the branch is not yet known, the Conversation remains in the **Site_Unresolved** state until the Site_Code is resolved either through a postback that conforms to the **Postback_Data_Contract** or by an operator setting it manually. Each Conversation carries a 24-hour **Session_Timeout** after which it auto-closes.

Each inbound webhook is also associated with a **Vertical_Context** resolved from the receiving Channel_Identifier, so the centralized topology operates independently per vertical while sharing one implementation.

## Scope

### In scope

- **CHAT**: webhook ingestion with mandatory signature verification and dynamic per-channel secret resolution (multi-tenant ready); conversation routing; reply and push messaging; message templates.
- **Conversation state**: Site_Code carried as conversation state; Site_Unresolved status; 24-hour Session_Timeout with auto-close.
- **SALES / ORDERING**: Postback_Data_Contract plus Manual Order Entry; stamping `origin_channel_id='line_oa'`; Order Intake Normalization feeding the Order Lifecycle / downstream queue; idempotency on webhook redelivery.
- **CRM / Identity**: resolving a LINE userId to a canonical Customer_Id via CustomerIdentity.
- **Forecasting sync**: `Sync_Source='line'`.
- **Brand voice** on outbound messages.
- **AI constraint**: AI may perform only slot-filling bound to active Message_Templates (template-bound); no free-text generation.
- **Vertical-awareness**: every conversation, order, and identity record carries a Vertical_Context; brand voice and message templates may be vertical-scoped.
- Branch scoping, RBAC/RLS, audit, D2 governance, and secret handling.

### Deferred (out of scope for this wave)

- AI free-text reply generation (this wave blocks AI to slot-filling only).
- LIFF storefront / mini-app.
- Full Customer 360.
- Loyalty / Points / Wallet.
- Cross-channel identity / wallet auto-merge (this wave defines only guardrail R-03: a Match_Confidence threshold plus Manual_Review_Required that blocks auto-merge).
- Rich menu / broadcast marketing.

## Glossary

- **LINE_OA_Commerce_Manager**: the LINE OA Commerce module — the system that ingests webhooks, manages conversations and identity, captures orders, sends outbound messages, synchronizes forecasting input, and records audit, across both verticals.
- **Vertical_Context**: the tenant/business-vertical dimension (e.g. `monolith` for furniture, `tcck` for food) carried on every Conversation, Line_Order, and CustomerIdentity record; resolved from the receiving Channel_Identifier and used to select vertical-scoped adapters, brand voice, and message templates while reusing one platform implementation.
- **Webhook_Event**: a single event delivered by the LINE Messaging API to the platform webhook endpoint.
- **LINE_Signature**: the `x-line-signature` header value LINE sends with each Webhook_Event, used to verify authenticity.
- **Channel_Secret**: the per-channel secret used to compute and verify the LINE_Signature; stored as a secret, never in code or logs.
- **Channel_Access_Token**: the per-channel token used to call the LINE Messaging API for outbound messages; stored as a secret, never in code or logs.
- **Channel_Identifier**: the identifier of the LINE channel that received a Webhook_Event, used to resolve the Channel_Secret, Channel_Access_Token, and Vertical_Context.
- **LINE_User_Id**: the LINE-provided opaque user identifier (per channel) of a messaging counterpart.
- **Webhook_Event_Id**: the stable, unique identifier of a Webhook_Event used for idempotency on redelivery.
- **Conversation**: the stateful thread between the platform and a LINE_User_Id, carrying Vertical_Context, Site_Code state (possibly Site_Unresolved), and Session_Timeout.
- **Inbound_Message**: a message received from a LINE_User_Id within a Conversation.
- **Outbound_Message**: a message sent from the platform to a LINE_User_Id (a Reply_Message or a Push_Message).
- **Message_Template**: a pre-approved, possibly vertical-scoped outbound message definition with named slots that AI may fill.
- **Reply_Message**: an Outbound_Message sent using a LINE reply token in response to an Inbound_Message.
- **Push_Message**: an Outbound_Message sent proactively to a LINE_User_Id without a reply token.
- **CustomerIdentity**: the binding between a LINE_User_Id (within a Vertical_Context) and a canonical Customer_Id.
- **Customer_Id**: the platform's canonical customer identifier.
- **Match_Confidence**: a numeric score (0.0–1.0) expressing confidence that a LINE_User_Id corresponds to an existing Customer_Id.
- **Match_Confidence_Threshold**: the configured minimum Match_Confidence (default `0.90`) required to propose an identity link.
- **Manual_Review_Required**: a state flag that blocks any automatic cross-channel identity merge and routes the decision to a human.
- **Origin_Channel_Id**: the channel-origin stamp on an order; for this module the value is `'line_oa'`.
- **Line_Order**: an order captured through LINE OA, carrying Vertical_Context and `origin_channel_id='line_oa'`.
- **Manual_Order_Entry**: an order created by an operator on behalf of a LINE_User_Id within a Conversation.
- **Order_Intake_Normalization**: the transformation of a captured Line_Order (postback or manual) into the canonical order shape consumed by the Order_Lifecycle, applying the vertical's order adapter.
- **Order_Lifecycle**: the downstream order-processing flow (e.g. kitchen queue for TCCK, production/fulfilment intake for MONOLITH) that consumes normalized orders.
- **Sync_Source**: the origin of a forecasting input synchronization; for this module the value is `'line'`.
- **Forecast_Input_Sync_Log**: the existing append-only forecasting input sync log written via `record_input_sync`.
- **Brand_Voice_Guideline**: the (possibly vertical-scoped) outbound style rule — short and warm, with a maximum length of 200 characters per message segment.
- **Site_Code**: the unique identifier of a Location from A1 (format `{CITY}-{AREA}-{SEQ}`). The canonical set of valid Site_Codes is the output of `public.get_active_site_codes()`.
- **Active_Site_Code**: a Site_Code present in `public.get_active_site_codes()` (a Location with `is_active = true`).
- **Governance_Role**: a C12 role that may read across all Site_Codes (`admin`, `operations`, `finance`, `executive_owner`), recognized by `public.is_governance_role()`.
- **Branch_Role**: a C12 role restricted to specific Site_Codes (`branch_manager`, `branch_operator`).
- **Autonomy_Tier**: the D2 Autonomy Ladder risk-class/tier governing whether an AI action may proceed autonomously or requires human gating.
- **LINE_OA_Audit_Log**: the append-only audit table recording webhook, conversation, identity, order, messaging, and governance events for LINE OA Commerce.
- **Centralized_OA_Topology**: the topology in which one LINE Official Account per vertical serves all branches, requiring application-layer Site_Code resolution.
- **Site_Unresolved**: the Conversation state in which the Site_Code is not yet known.
- **Postback_Data_Contract**: the defined structure of LINE postback payloads used to convey actionable state (including Site_Code resolution and order selections) back to the platform.
- **Session_Timeout**: the 24-hour inactivity window after which a Conversation auto-closes.

## Requirements

### Requirement 1: Webhook Ingestion and LINE Signature Verification

**User Story:** As a platform integrator, I want every inbound LINE webhook authenticated before processing, so that only genuine LINE traffic enters the platform and per-channel secrets are never exposed.

#### Acceptance Criteria

1. WHEN a Webhook_Event is received at the LINE OA webhook endpoint, THE LINE_OA_Commerce_Manager SHALL resolve the Channel_Secret, Channel_Access_Token, and Vertical_Context from the Channel_Identifier of the receiving channel before processing the event.
2. WHEN a Webhook_Event is received, THE LINE_OA_Commerce_Manager SHALL verify the LINE_Signature against the request body using the resolved Channel_Secret before any further processing.
3. IF a Webhook_Event arrives without a LINE_Signature, THEN THE LINE_OA_Commerce_Manager SHALL reject the request and SHALL NOT process the event.
4. IF a Webhook_Event arrives with a LINE_Signature that does not match the request body, THEN THE LINE_OA_Commerce_Manager SHALL reject the request and SHALL NOT process the event.
5. THE LINE_OA_Commerce_Manager SHALL resolve the Channel_Secret and Channel_Access_Token dynamically per Channel_Identifier from secret storage and SHALL exclude their values from all code, logs, and error messages.
6. IF the Channel_Identifier of a Webhook_Event cannot be resolved to a configured channel, THEN THE LINE_OA_Commerce_Manager SHALL reject the request and record the rejection without exposing secret values.
7. WHEN a Webhook_Event passes signature verification, THE LINE_OA_Commerce_Manager SHALL accept the event for processing and record its receipt in the LINE_OA_Audit_Log.

### Requirement 2: Webhook Delivery Idempotency

**User Story:** As a platform integrator, I want redelivered webhooks handled exactly once, so that LINE retries never create duplicate conversations, messages, or orders.

#### Acceptance Criteria

1. WHEN a verified Webhook_Event is accepted, THE LINE_OA_Commerce_Manager SHALL record its Webhook_Event_Id before producing any downstream side effect.
2. WHEN a Webhook_Event is received whose Webhook_Event_Id has already been processed, THE LINE_OA_Commerce_Manager SHALL acknowledge the event without repeating any side effect.
3. THE LINE_OA_Commerce_Manager SHALL ensure that processing the same Webhook_Event_Id more than once produces the same persisted state as processing it once (idempotent processing).
4. IF a Webhook_Event redelivery occurs after a partial failure, THEN THE LINE_OA_Commerce_Manager SHALL complete processing without creating duplicate Conversation, Inbound_Message, Outbound_Message, or Line_Order records for that Webhook_Event_Id.
5. THE LINE_OA_Commerce_Manager SHALL enforce uniqueness of Webhook_Event_Id at the persistence layer.
6. IF persistence of internal state for a Webhook_Event fails, THEN THE LINE_OA_Commerce_Manager SHALL prevent all external side effects, including LINE Messaging API calls and notifications, for that Webhook_Event, to ensure strict consistency.

### Requirement 3: Inbound Message Handling, Conversation Routing, and State Management

**User Story:** As a branch operator, I want each inbound LINE message routed to a stateful conversation that knows its vertical and (once known) its branch, so that I can serve customers in context across the centralized account.

#### Acceptance Criteria

1. WHEN a verified Webhook_Event carries an inbound message, THE LINE_OA_Commerce_Manager SHALL record an Inbound_Message associated with a Conversation keyed by the LINE_User_Id and Vertical_Context.
2. IF no open Conversation exists for the LINE_User_Id within the Vertical_Context, THEN THE LINE_OA_Commerce_Manager SHALL create a new Conversation in the Site_Unresolved state.
3. WHILE a Conversation is in the Site_Unresolved state, THE LINE_OA_Commerce_Manager SHALL store the Conversation without a resolved Site_Code and SHALL continue to accept Inbound_Messages.
4. WHEN a postback conforming to the Postback_Data_Contract conveys a Site_Code for a Conversation, THE LINE_OA_Commerce_Manager SHALL resolve the Conversation's Site_Code state to that Site_Code.
5. WHEN an operator manually assigns a Site_Code to a Conversation, THE LINE_OA_Commerce_Manager SHALL set the Conversation's Site_Code state to that Site_Code.
6. IF a Site_Code supplied for a Conversation is absent from `public.get_active_site_codes()`, THEN THE LINE_OA_Commerce_Manager SHALL reject the resolution and return an error indicating the site_code is unknown or inactive.
7. WHILE a Conversation has not received activity within the Session_Timeout of 24 hours, THE LINE_OA_Commerce_Manager SHALL auto-close the Conversation.
8. WHEN an Inbound_Message arrives for a LINE_User_Id whose previous Conversation has auto-closed, THE LINE_OA_Commerce_Manager SHALL open a new Conversation rather than reopening the closed one.

### Requirement 4: Outbound Replies and Push Messaging

**User Story:** As a branch operator, I want to reply to and proactively message customers through the LINE API, so that I can complete conversations and order updates reliably.

#### Acceptance Criteria

1. WHEN the platform sends a Reply_Message in response to an Inbound_Message, THE LINE_OA_Commerce_Manager SHALL call the LINE Messaging API using the Channel_Access_Token resolved for the Conversation's Channel_Identifier.
2. WHEN the platform sends a Push_Message to a LINE_User_Id, THE LINE_OA_Commerce_Manager SHALL call the LINE Messaging API using the Channel_Access_Token resolved for that Conversation's Channel_Identifier.
3. THE LINE_OA_Commerce_Manager SHALL record every Outbound_Message in the originating Conversation with its delivery status.
4. IF an outbound send to the LINE Messaging API fails, THEN THE LINE_OA_Commerce_Manager SHALL record the failure with an error detail and SHALL NOT mark the Outbound_Message as delivered.
5. WHERE a Reply_Message requires a reply token that is unavailable or expired, THE LINE_OA_Commerce_Manager SHALL send the message as a Push_Message instead.
6. THE LINE_OA_Commerce_Manager SHALL exclude the Channel_Access_Token value from all logs and error messages when sending Outbound_Messages.

### Requirement 5: Message Templates and AI Constraints

**User Story:** As a governance lead, I want AI confined to filling slots in approved templates, so that the platform never sends unapproved free-text AI content in this wave.

#### Acceptance Criteria

1. THE LINE_OA_Commerce_Manager SHALL maintain Message_Templates that define the permitted outbound message shapes, each with named slots and an active/inactive status.
2. WHERE a Message_Template is vertical-scoped, THE LINE_OA_Commerce_Manager SHALL make that Message_Template available only to Conversations whose Vertical_Context matches the template's scope.
3. WHEN AI composes an Outbound_Message, THE LINE_OA_Commerce_Manager SHALL restrict AI to filling the named slots of an active Message_Template (template-bound slot-filling).
4. IF AI attempts to produce outbound content that is not bound to an active Message_Template, THEN THE LINE_OA_Commerce_Manager SHALL reject the content and SHALL NOT send it, regardless of whether the content is free text or structured-but-unbound content.
5. IF a Message_Template referenced for an Outbound_Message is inactive or does not exist, THEN THE LINE_OA_Commerce_Manager SHALL reject the send and return an error.
6. THE LINE_OA_Commerce_Manager SHALL record, for each AI-composed Outbound_Message, the Message_Template identifier and the slot values used.
7. THE LINE_OA_Commerce_Manager SHALL treat template-bound outbound content and free-text outbound content as mutually exclusive categories, classifying any outbound content not bound to an active Message_Template as free-text content.

### Requirement 6: Customer Identity Resolution

**User Story:** As a CRM owner, I want each LINE userId resolved to a canonical customer where confidence is high, so that conversations and orders attach to the real customer record.

#### Acceptance Criteria

1. WHEN an Inbound_Message is recorded for a LINE_User_Id within a Vertical_Context, THE LINE_OA_Commerce_Manager SHALL attempt to resolve a CustomerIdentity binding the LINE_User_Id to a Customer_Id within that Vertical_Context.
2. IF a CustomerIdentity already exists for the LINE_User_Id within the Vertical_Context, THEN THE LINE_OA_Commerce_Manager SHALL associate the Conversation with the bound Customer_Id.
3. IF no CustomerIdentity exists for the LINE_User_Id within the Vertical_Context, THEN THE LINE_OA_Commerce_Manager SHALL create a new Customer_Id and bind the LINE_User_Id to it within that Vertical_Context.
4. THE LINE_OA_Commerce_Manager SHALL enforce uniqueness of (LINE_User_Id, Vertical_Context) in CustomerIdentity bindings.
5. THE LINE_OA_Commerce_Manager SHALL persist each CustomerIdentity with its Vertical_Context.

### Requirement 7: Cross-Channel Identity Merge Guardrail (R-03)

**User Story:** As a governance lead, I want cross-channel identity merges blocked behind a confidence threshold and human review, so that no two customer records are auto-merged incorrectly in this wave.

#### Acceptance Criteria

1. WHEN the platform evaluates whether a LINE_User_Id corresponds to an existing Customer_Id, THE LINE_OA_Commerce_Manager SHALL compute a Match_Confidence between 0.0 and 1.0.
2. IF the computed Match_Confidence is below the Match_Confidence_Threshold (default 0.90), THEN THE LINE_OA_Commerce_Manager SHALL NOT propose an identity link.
3. WHERE a cross-channel identity merge is contemplated, THE LINE_OA_Commerce_Manager SHALL set Manual_Review_Required and SHALL NOT perform any automatic merge in this wave.
4. IF Manual_Review_Required is set for a cross-channel identity merge, THEN THE LINE_OA_Commerce_Manager SHALL block all automatic merge execution and route the decision to a human.
5. THE LINE_OA_Commerce_Manager SHALL require manual review for every cross-channel identity merge regardless of the computed Match_Confidence, including a Match_Confidence of 0.99, and SHALL NOT auto-merge in this wave.
6. WHEN the Match_Confidence meets or exceeds the Match_Confidence_Threshold, THE LINE_OA_Commerce_Manager SHALL record a merge candidate flagged Manual_Review_Required for a human decision rather than merging automatically.
7. THE LINE_OA_Commerce_Manager SHALL record every merge-candidate evaluation, including the Match_Confidence and the Manual_Review_Required outcome, in the LINE_OA_Audit_Log.

### Requirement 8: Order Intake from LINE OA

**User Story:** As a branch operator, I want orders captured through LINE — via postback or manual entry — normalized into the platform order shape, so that they flow into the downstream order lifecycle for the correct vertical and branch.

#### Acceptance Criteria

1. WHEN a postback conforming to the Postback_Data_Contract conveys an order selection, THE LINE_OA_Commerce_Manager SHALL create a Line_Order stamped with `origin_channel_id='line_oa'` and the Conversation's Vertical_Context.
2. WHEN an operator submits a Manual_Order_Entry for a Conversation, THE LINE_OA_Commerce_Manager SHALL create a Line_Order stamped with `origin_channel_id='line_oa'` and the Conversation's Vertical_Context.
3. WHEN a Line_Order is created, THE LINE_OA_Commerce_Manager SHALL apply Order_Intake_Normalization using the vertical's order adapter to produce the canonical order shape consumed by the Order_Lifecycle.
4. IF Order_Intake_Normalization runs but fails to produce valid canonical output, THEN THE LINE_OA_Commerce_Manager SHALL reject the Line_Order and return an error rather than submitting invalid or empty output to the Order_Lifecycle.
5. IF a Line_Order is created for a Conversation that is still Site_Unresolved, THEN THE LINE_OA_Commerce_Manager SHALL require resolution of the Site_Code before submitting the order to the Order_Lifecycle.
6. IF the Site_Code associated with a Line_Order is absent from `public.get_active_site_codes()`, THEN THE LINE_OA_Commerce_Manager SHALL reject the order and return an error indicating the site_code is unknown or inactive.
7. WHEN the same order-bearing Webhook_Event is redelivered, THE LINE_OA_Commerce_Manager SHALL NOT create a duplicate Line_Order for that Webhook_Event_Id.
8. THE LINE_OA_Commerce_Manager SHALL persist each Line_Order with its Vertical_Context, Site_Code, Customer_Id, and `origin_channel_id='line_oa'`.

### Requirement 9: Brand Voice on Outbound Messages

**User Story:** As a brand owner, I want outbound messages kept short, warm, and on-brand for each vertical, so that customers get a consistent voice on the direct channel.

#### Acceptance Criteria

1. WHEN an Outbound_Message is composed, THE LINE_OA_Commerce_Manager SHALL apply the Brand_Voice_Guideline applicable to the Conversation's Vertical_Context.
2. THE LINE_OA_Commerce_Manager SHALL constrain each Outbound_Message segment to a maximum of 200 characters.
3. IF a composed Outbound_Message segment exceeds 200 characters, THEN THE LINE_OA_Commerce_Manager SHALL reject the segment and return an error rather than sending it.
4. WHERE a Brand_Voice_Guideline is vertical-scoped, THE LINE_OA_Commerce_Manager SHALL apply the guideline that matches the Conversation's Vertical_Context.

### Requirement 10: Forecasting Pipeline Synchronization

**User Story:** As a forecasting consumer, I want LINE OA order data fed into the existing forecasting input pipeline, so that owned-channel demand contributes to per-branch forecasts without redefining the pipeline.

#### Acceptance Criteria

1. WHEN LINE OA order data is synchronized to forecasting for a Site_Code, THE LINE_OA_Commerce_Manager SHALL invoke `record_input_sync` with `Sync_Source='line'`.
2. THE LINE_OA_Commerce_Manager SHALL write each LINE synchronization to the append-only Forecast_Input_Sync_Log via the existing pipeline and SHALL NOT modify the forecasting contract.
3. IF a forecasting synchronization for a Site_Code fails, THEN THE LINE_OA_Commerce_Manager SHALL record the failure status through the existing pipeline while preserving the most recent successfully synchronized data.
4. THE LINE_OA_Commerce_Manager SHALL associate each forecasting synchronization with the Site_Code of the contributing Line_Orders.
5. IF order data lacks a resolved Site_Code, THEN THE LINE_OA_Commerce_Manager SHALL exclude it from forecasting synchronization until the Site_Code is resolved.

### Requirement 11: AI Autonomy Governance for LINE Actions

**User Story:** As a governance lead, I want every AI action on LINE gated by the D2 Autonomy Ladder, so that only low-risk actions proceed autonomously and high-risk actions stay human-gated.

#### Acceptance Criteria

1. WHEN an AI action on a LINE Conversation is contemplated, THE LINE_OA_Commerce_Manager SHALL classify the action against its D2 Autonomy_Tier before execution.
2. THE LINE_OA_Commerce_Manager SHALL complete the D2 Autonomy_Tier classification of an AI action before making any approval or withholding decision for that action.
3. WHERE an AI action falls in a low-risk Autonomy_Tier permitted to proceed autonomously, THE LINE_OA_Commerce_Manager SHALL allow the action within the D2 guardrails.
4. IF an AI action falls in an Autonomy_Tier that requires human approval, THEN THE LINE_OA_Commerce_Manager SHALL withhold the action until a human approves it.
5. IF the approval mechanism for a high-risk AI action fails or is unavailable, THEN THE LINE_OA_Commerce_Manager SHALL block the AI action as a fail-safe and SHALL NOT proceed without approval.
6. THE LINE_OA_Commerce_Manager SHALL constrain all autonomous AI outbound messaging to template-bound slot-filling as defined in Requirement 5.
7. THE LINE_OA_Commerce_Manager SHALL record every AI action, its Autonomy_Tier classification, and its approval outcome in the LINE_OA_Audit_Log.

### Requirement 12: Access Control and Branch Isolation

**User Story:** As an IT admin, I want LINE OA data governed by the existing C12 roles and site_codes, so that branches see only their own conversations and orders without redefining the auth model.

#### Acceptance Criteria

1. WHILE a principal holds a Branch_Role, THE LINE_OA_Commerce_Manager SHALL allow that principal to read Conversation, Inbound_Message, Outbound_Message, Line_Order, and CustomerIdentity records only for Site_Codes for which `public.has_site_access()` returns true.
2. WHILE a principal holds a Governance_Role, THE LINE_OA_Commerce_Manager SHALL allow that principal to read LINE OA data for all Site_Codes.
3. IF a Branch_Role principal requests LINE OA data for a Site_Code for which `public.has_site_access()` returns false, THEN THE LINE_OA_Commerce_Manager SHALL return no rows for that Site_Code.
4. THE LINE_OA_Commerce_Manager SHALL enforce access control through Supabase RLS policies gated `TO authenticated` that reuse `public.has_any_app_role()`, `public.has_site_access()`, and `public.is_governance_role()`, without redefining the auth model and without bypassing security via service_role from the client.
5. THE LINE_OA_Commerce_Manager SHALL perform every conversation-state, identity, order, and messaging mutation through SECURITY DEFINER functions that re-check the caller's role inside the function and resolve the actor via `public.resolve_actor()` rather than trusting client-supplied actor identifiers.
6. IF a principal attempts a mutation without a role permitted for that operation and Site_Code, THEN THE LINE_OA_Commerce_Manager SHALL reject the operation and return a permission denied error.
7. WHILE a Conversation is Site_Unresolved, THE LINE_OA_Commerce_Manager SHALL block all Branch_Roles from reading or modifying that Conversation and SHALL permit access only to Governance_Roles and operators permitted to resolve it, until a Site_Code is assigned.

### Requirement 13: LINE OA Audit Trail

**User Story:** As a compliance or finance user, I want an immutable record of webhook, conversation, identity, order, messaging, and governance events, so that I can trace who or what did what and when.

#### Acceptance Criteria

1. WHEN a Webhook_Event is accepted or rejected, a Conversation changes state, a CustomerIdentity or merge candidate is recorded, a Line_Order is created, an Outbound_Message is sent, or an AI action is governed, THE LINE_OA_Commerce_Manager SHALL record a LINE_OA_Audit_Log entry containing event_type, Vertical_Context, site_code (where known), the affected entity reference, performed_by (via `public.resolve_actor()`), and performed_at (UTC timestamp).
2. THE LINE_OA_Commerce_Manager SHALL store LINE_OA_Audit_Log entries in an append-only table that enforces immutability through database-level constraints, including triggers and permissions, that reject UPDATE and DELETE operations independently of application-level protection.
3. THE LINE_OA_Commerce_Manager SHALL exclude Channel_Secret and Channel_Access_Token values from all LINE_OA_Audit_Log entries.
4. WHEN a Governance_Role or a Branch_Role with access to a Site_Code queries the LINE_OA_Audit_Log, THE LINE_OA_Commerce_Manager SHALL support filtering by event_type, Vertical_Context, site_code, performed_by, and a performed_at date range, returning only entries the principal is permitted to read.
