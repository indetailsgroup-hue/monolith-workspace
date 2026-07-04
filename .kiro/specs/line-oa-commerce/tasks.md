# Implementation Plan: LINE OA Commerce (Module B5)

## Overview

This plan implements the dual-vertical LINE OA Commerce module strictly from the design. The implementation stack is fixed by the design: PostgreSQL schema + PL/pgSQL `SECURITY DEFINER` RPCs as the only write path, Supabase Vault for channel secrets, and two Supabase Edge Functions (Deno/TypeScript) as the sole HTTP boundary (`line-webhook` forwards raw body + signature into the DB; `line-outbound-sender` claims `pending` rows, resolves the token from Vault, calls LINE, and records the result). LINE signature verification runs inside `rpc_ingest_line_webhook`. Outbound uses the staged `pending → sent/failed` model.

Work proceeds incrementally: schema → constraints → RLS → audit immutability → pure-logic/adapters → RPCs → Edge Functions → forecasting sync → timeout sweep → tests. Each Correctness Property (1–31) is implemented by exactly one property-based test (minimum 100 iterations, tagged `Feature: line-oa-commerce, Property {n}: {text}`), with the LINE Messaging API and the forecasting pipeline (`record_input_sync`) mocked.

## Tasks

- [x] 1. Set up module structure and test harness
  - [x] 1.1 Scaffold migrations, Edge Functions, and the PBT harness
    - Create `supabase/migrations/` for the `line_oa_*` DDL/RPC migration files
    - Create `supabase/functions/line-webhook/` and `supabase/functions/line-outbound-sender/` Deno/TypeScript project skeletons
    - Create the PBT harness: a Python `hypothesis` harness over the DB driver for database-layer properties and `fast-check` for Edge-Function/adapter logic; add a deterministic mock for the LINE Messaging API and a spy/stub mock for `record_input_sync`
    - Add the property-tag comment convention `Feature: line-oa-commerce, Property {n}: {text}` and a 100-iteration default
    - _Requirements: 12.4, 12.5_

- [x] 2. Database schema
  - [x] 2.1 Define enums and create the eight line_oa_* tables
    - Create enums for conversation `status` (`site_unresolved`,`open`,`closed`), outbound `send_type` (`reply`,`push`), outbound `status` (`pending`,`sent`,`failed`)
    - Create `line_oa_channels` (channel_identifier PK, vertical_context, channel_secret_ref, channel_access_token_ref, is_active) storing only Vault references, never plaintext
    - Create `line_oa_conversations`, `line_oa_inbound_messages`, `line_oa_outbound_messages`, `line_oa_customer_identity`, `line_oa_message_templates`, `line_oa_orders`, `line_oa_audit_log` with the documented columns
    - _Requirements: 1.1, 1.5, 2.5, 3.1, 4.3, 4.4, 5.1, 5.6, 6.5, 8.8, 13.1_
  - [x] 2.2 Add uniqueness, partial-unique, and CHECK constraints
    - Partial unique index on conversations: `UNIQUE (line_user_id, vertical_context) WHERE status <> 'closed'`
    - `UNIQUE` on `line_oa_inbound_messages.webhook_event_id`, on `line_oa_customer_identity (line_user_id, vertical_context)`, and on `line_oa_orders.webhook_event_id`
    - CHECK constraints: `match_confidence BETWEEN 0.0 AND 1.0`; `origin_channel_id = 'line_oa'`; templates `PRIMARY KEY (template_key, vertical_context)`
    - _Requirements: 2.5, 3.1, 3.2, 3.8, 6.4, 7.1, 8.1, 8.2, 8.7, 8.8_
  - [x] 2.3 Smoke test schema structure
    - Verify tables, enums, partial unique index, unique constraints, and CHECK constraints exist; verify channels store Vault references (not plaintext)
    - _Requirements: 1.5, 2.5, 6.4, 8.7_

- [x] 3. Row-Level Security and audit immutability
  - [x] 3.1 Enable RLS and add SELECT policies
    - Enable RLS on all eight tables; add SELECT policy `TO authenticated USING (public.is_governance_role() OR public.has_site_access(site_code))`
    - Add no client INSERT/UPDATE/DELETE policies (writes only via SECURITY DEFINER RPCs)
    - Rely on nullable `site_code` so `has_site_access(NULL)=false` blocks Branch_Roles on `site_unresolved`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.7_
  - [x] 3.2 Add audit-log immutability trigger and revoke grants
    - Create trigger `trg_line_oa_audit_log_immutable` raising on UPDATE/DELETE; `REVOKE UPDATE, DELETE` on `line_oa_audit_log` from all roles
    - _Requirements: 13.2_
  - [x] 3.3 Write property test for RLS read scoping
    - **Property 27: Reads return exactly the rows the principal may access (Governance sees all; Branch sees only has_site_access rows; no site_unresolved for Branch)**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.7**
  - [x] 3.4 Write property test for audit immutability
    - **Property 30: Audit log is immutable — any UPDATE/DELETE is rejected at the database level and the row is unchanged**
    - **Validates: Requirements 13.2**
  - [x] 3.5 Smoke test access-control configuration
    - Verify RLS gated `TO authenticated` reusing C12 helpers, no client write policies, no `service_role` from client, secrets stored as Vault references
    - _Requirements: 12.4, 12.5_

- [x] 4. Checkpoint - schema, RLS, and immutability
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Pure-logic adapters and outbound-content helpers
  - [x] 5.1 Implement the order adapter registry (`order_adapter(vertical_context)`)
    - Map vertical-specific raw orders (furniture line items/dimensions vs food menu items/modifiers) into the canonical Order_Lifecycle shape; return rejection for invalid/empty normalization output
    - _Requirements: 8.3, 8.4_
  - [x] 5.2 Write property test for order normalization
    - **Property 20: Normalization yields valid canonical output or rejects; invalid/empty output is never submitted**
    - **Validates: Requirements 8.3, 8.4**
  - [x] 5.3 Implement the brand-voice resolver (`brand_voice(vertical_context)`) and 200-char enforcement
    - Resolve the vertical's Brand_Voice_Guideline; reject any segment exceeding 200 characters
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 5.4 Write property test for brand-voice enforcement
    - **Property 22: Applied guideline matches the conversation vertical; every accepted segment ≤ 200 chars; longer segments are rejected and not sent**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
  - [x] 5.5 Implement template vertical-scope resolution and template-bound classification
    - Resolve templates by `(template_key, vertical_context)` (NULL scope = shared); classify outbound as template-bound vs free-text; substitute named slots only; reject inactive/absent/unbound/free-text/structured-but-unbound content
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.7, 11.6_
  - [x] 5.6 Write property test for vertical-scoped template isolation
    - **Property 12: A vertical-V template is resolvable for a conversation iff its vertical_context equals V (NULL scope resolvable for all)**
    - **Validates: Requirements 5.2**
  - [x] 5.7 Write property test for template-bound classification
    - **Property 13: Classification returns exactly {template-bound, free-text}; unbound content is rejected; accepted outbound equals the active template body with only named slots substituted**
    - **Validates: Requirements 5.3, 5.4, 5.5, 5.7, 11.6**
  - [x] 5.8 Write unit tests for template CRUD
    - Test template create/activate/deactivate and named-slot definitions
    - _Requirements: 5.1_

- [x] 6. Signature verification and channel/Vault resolution
  - [x] 6.1 Implement channel resolution and HMAC-SHA256 signature verification
    - Resolve `channel_secret`, `channel_access_token` ref, and `vertical_context` from `channel_identifier` via Vault inside a SECURITY DEFINER context; verify `x-line-signature` as base64 HMAC-SHA256(secret, raw_body) with constant-time compare; reject missing/invalid signature and unresolvable channel without exposing secrets
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - [x] 6.2 Write property test for signature verification
    - **Property 1: HMAC-SHA256(secret, body) verifies; missing/tampered/wrong-secret signatures fail and produce no persisted state or side effects**
    - **Validates: Requirements 1.2, 1.3, 1.4**
  - [x] 6.3 Write unit tests for channel/secret resolution ordering
    - Test resolution by channel_identifier and rejection of unresolvable channels without secret exposure
    - _Requirements: 1.1, 1.6_

- [x] 7. Identity resolution and merge guardrail
  - [x] 7.1 Implement customer-identity resolution helper
    - Resolve/create exactly one CustomerIdentity per `(line_user_id, vertical_context)`; reuse existing binding or create a new Customer_Id and bind it; persist with vertical_context
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 7.2 Write property test for identity binding uniqueness
    - **Property 14: Exactly one CustomerIdentity row per (user, vertical); existing binding reused, otherwise a new Customer_Id created and bound**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
  - [x] 7.3 Implement `rpc_evaluate_identity_merge_candidate` (SECURITY DEFINER)
    - Re-check role, resolve actor via `public.resolve_actor()`, scrub secrets; compute Match_Confidence in [0.0,1.0]; below threshold (default 0.90) propose no link; for any contemplated cross-channel merge set `manual_review_required = true` and block all auto-merge regardless of confidence (including 0.99/1.0); audit candidate + confidence + outcome
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 12.5, 12.6_
  - [x] 7.4 Write property test for match-confidence range
    - **Property 15: Computed Match_Confidence is within the closed interval [0.0, 1.0]**
    - **Validates: Requirements 7.1**
  - [x] 7.5 Write property test for below-threshold no-link
    - **Property 16: Confidence strictly below the threshold proposes no identity link**
    - **Validates: Requirements 7.2**
  - [x] 7.6 Write property test for the no-auto-merge guardrail (R-03)
    - **Property 17: For any confidence in [0.0,1.0] including 0.99/1.0, no automatic merge executes; candidate recorded manual_review_required and routed to a human**
    - **Validates: Requirements 7.3, 7.4, 7.5, 7.6**
  - [x] 7.7 Write property test for merge-evaluation audit
    - **Property 18: Each merge evaluation writes exactly one audit entry recording Match_Confidence and the manual_review_required outcome**
    - **Validates: Requirements 7.7**
  - [x] 7.8 Write unit test for CustomerIdentity row shape
    - Test persisted identity row includes vertical_context and required fields
    - _Requirements: 6.5_

- [x] 8. Inbound ingestion RPC
  - [x] 8.1 Implement `rpc_ingest_line_webhook` (SECURITY DEFINER)
    - Resolve channel + verify signature (Task 6.1); `INSERT ... ON CONFLICT (webhook_event_id) DO NOTHING` for idempotency; on conflict ack with no side effects; route to the open conversation for `(line_user_id, vertical_context)` or create a new `site_unresolved` conversation with NULL site_code; persist inbound message; resolve identity (Task 7.1); write audit receipt; commit all persistence in one transaction before any send is possible
    - _Requirements: 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.8, 6.1, 13.1_
  - [x] 8.2 Write property test for verified-ingestion receipt
    - **Property 3: A first-time verified Webhook_Event yields exactly one audit receipt for that webhook_event_id**
    - **Validates: Requirements 1.7, 13.1**
  - [x] 8.3 Write property test for idempotent processing
    - **Property 4: N≥1 deliveries (incl. redelivery after partial failure) yield the single-delivery state; at most one Conversation/Inbound/Outbound/Line_Order per webhook_event_id**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 8.7**
  - [x] 8.4 Write property test for strict consistency
    - **Property 5: A persistence failure produces zero external side effects — no LINE call, no notification, no pending/sent outbound row**
    - **Validates: Requirements 2.6**
  - [x] 8.5 Write property test for conversation routing
    - **Property 6: Each inbound attaches to exactly one non-closed conversation; a new site_unresolved one is created if none open; closed conversations never reopen**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.8**

- [x] 9. Checkpoint - ingestion, identity, and pure logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Conversation site resolution RPC
  - [x] 10.1 Implement `rpc_resolve_conversation_site` (SECURITY DEFINER)
    - Re-check role + `has_site_access(site_code)`, resolve actor, scrub secrets; validate `site_code ∈ public.get_active_site_codes()` (reject "unknown or inactive", state unchanged); on success set status `open`, store site_code, audit; support `postback` and `manual` sources
    - _Requirements: 3.4, 3.5, 3.6, 12.5, 12.6, 12.7_
  - [x] 10.2 Write property test for site resolution
    - **Property 7: Conversation resolves to open with site_code iff the code is in get_active_site_codes(); otherwise rejected unchanged**
    - **Validates: Requirements 3.4, 3.5, 3.6**

- [x] 11. Autonomy gating and outbound composition RPC
  - [x] 11.1 Implement D2 Autonomy_Tier classification and fail-safe gate
    - Classify the AI action's Autonomy_Tier before any approve/withhold decision; allow low-risk tiers within guardrails; withhold gated tiers until human approval; block as fail-safe when the approval mechanism is unavailable; audit tier + outcome
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.7_
  - [x] 11.2 Write property test for tier-classification ordering
    - **Property 24: Autonomy_Tier classification completes before any approval/withholding decision**
    - **Validates: Requirements 11.1, 11.2**
  - [x] 11.3 Write property test for the fail-safe gate
    - **Property 25: Gated actions are withheld until approval; if the approval mechanism is unavailable the action is blocked; low-risk actions allowed within guardrails**
    - **Validates: Requirements 11.3, 11.4, 11.5**
  - [x] 11.4 Implement `rpc_send_line_outbound` (SECURITY DEFINER)
    - Re-check role + `has_site_access(conversation.site_code)` and block Branch_Roles on `site_unresolved`; run autonomy gate (Task 11.1); resolve + classify template (Task 5.5), apply brand voice (Task 5.3); decide reply-token vs push (fall back to push when token unavailable/expired); insert outbound row `status='pending'` recording template_key + slot_values; audit; perform no HTTP
    - _Requirements: 4.3, 4.5, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 9.1, 9.2, 9.3, 9.4, 11.6, 12.5, 12.6, 12.7_
  - [x] 11.5 Write property test for outbound delivery-status recording
    - **Property 9: A composed outbound row exists in the originating conversation with status in {pending,sent,failed} recording template_key and slot_values**
    - **Validates: Requirements 4.3, 5.6**
  - [x] 11.6 Write property test for reply→push fallback
    - **Property 11: When the reply token is unavailable/expired, the resolved send_type is push**
    - **Validates: Requirements 4.5**
  - [x] 11.7 Write property test for AI-action audit
    - **Property 26: Each governed AI action writes exactly one audit entry recording the action, its Autonomy_Tier, and its approval outcome**
    - **Validates: Requirements 11.7**

- [x] 12. Outbound result recording RPC
  - [x] 12.1 Implement `rpc_record_line_send_result` (SECURITY DEFINER)
    - Re-check role, resolve actor, scrub token; set status `sent` or `failed`; on failure store `error_detail` and never mark delivered
    - _Requirements: 4.4, 4.6, 12.5_
  - [x] 12.2 Write property test for failure handling
    - **Property 10: A reported failure sets status=failed with non-empty error_detail and is never marked sent**
    - **Validates: Requirements 4.4**

- [x] 13. Order intake RPC
  - [x] 13.1 Implement `rpc_create_line_order` (SECURITY DEFINER)
    - Re-check role, resolve actor, scrub secrets; stamp `origin_channel_id='line_oa'` + conversation `vertical_context`; idempotent on `webhook_event_id`; apply normalization via `order_adapter(vertical_context)` (Task 5.1) and reject invalid/empty canonical output; require resolved `site_code ∈ get_active_site_codes()` before Order_Lifecycle submission; persist + audit; support `postback` and `manual` sources
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 12.5, 12.6_
  - [x] 13.2 Write property test for order stamping
    - **Property 19: Created Line_Orders carry origin_channel_id='line_oa', the conversation vertical_context, and (once resolved) site_code and customer_id**
    - **Validates: Requirements 8.1, 8.2, 8.8**
  - [x] 13.3 Write property test for lifecycle site gating
    - **Property 21: An order is submitted to the Order_Lifecycle only with a resolved active site_code; unresolved/inactive blocks/rejects submission**
    - **Validates: Requirements 8.5, 8.6**

- [x] 14. Checkpoint - operational RPCs
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Forecasting synchronization RPC
  - [x] 15.1 Implement `rpc_sync_line_forecast` (SECURITY DEFINER)
    - For orders with a resolved active `site_code`, invoke `record_input_sync(Sync_Source='line', ...)`; exclude orders lacking a resolved site_code; never modify the forecasting contract; record failure via the existing pipeline while preserving the last good sync; audit
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 12.5_
  - [x] 15.2 Write property test for forecasting selection and tagging
    - **Property 23: The synced subset equals exactly orders with a resolved active site_code, each record associated with its site_code; unresolved orders excluded until resolved**
    - **Validates: Requirements 10.4, 10.5**
  - [x] 15.3 Write integration tests for forecasting invocation (mocked pipeline)
    - Verify `record_input_sync` invoked with `Sync_Source='line'` and append-only write (10.1, 10.2); verify failure status recorded while preserving last good sync (10.3)
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 16. Session timeout sweep
  - [x] 16.1 Implement the 24-hour Session_Timeout auto-close sweep
    - Set status `closed` for conversations whose `last_activity_at` is older than 24h; audit closures
    - _Requirements: 3.7_
  - [x] 16.2 Write property test for timeout auto-close
    - **Property 8: Any conversation idle beyond the 24h Session_Timeout is set to closed by the sweep**
    - **Validates: Requirements 3.7**

- [x] 17. Audit query RPC
  - [x] 17.1 Implement `rpc_query_line_audit` (SECURITY DEFINER, RLS-honoring read helper)
    - Filter by `event_type`, `vertical_context`, `site_code`, `performed_by`, and a `performed_at` range; return only rows the principal may read
    - _Requirements: 13.4_
  - [x] 17.2 Write property test for filtered, permission-bounded audit queries
    - **Property 31: Every returned row satisfies all supplied filters and is within the principal's permitted read set**
    - **Validates: Requirements 13.4**

- [x] 18. Cross-cutting audit, mutation, and secret guarantees
  - [x] 18.1 Write property test for audit completeness
    - **Property 29: Each governed event records an audit entry with event_type, vertical_context, site_code (where known), entity_ref, performed_by (via resolve_actor), and a UTC performed_at**
    - **Validates: Requirements 13.1**
  - [x] 18.2 Write property test for unauthorized-mutation denial
    - **Property 28: A mutation without a permitted role for the operation and site_code is rejected with permission-denied and no state changes**
    - **Validates: Requirements 12.6**
  - [x] 18.3 Write property test for secret non-exposure
    - **Property 2: For any Channel_Secret/Channel_Access_Token and any execution path, no log line, error message, or audit field contains the secret value**
    - **Validates: Requirements 1.5, 4.6, 13.3**

- [x] 19. Edge Functions (HTTP boundary)
  - [x] 19.1 Implement the `line-webhook` Edge Function
    - Read the raw request body and `x-line-signature`, derive `channel_identifier` from the route/destination, forward `(raw_body, signature, channel_identifier)` into `rpc_ingest_line_webhook`; return 200 on accept/duplicate-ack and 4xx on rejection; hold no secrets and perform no business logic
    - _Requirements: 1.2, 1.3, 1.4, 2.2_
  - [x] 19.2 Write integration tests for reply/push send via resolved token (mocked LINE API)
    - Verify `line-outbound-sender` resolves the Channel_Access_Token from Vault and calls the LINE API for reply and push using the resolved token
    - _Requirements: 4.1, 4.2_
  - [x] 19.3 Implement the `line-outbound-sender` Edge Function
    - Claim `pending` rows from `line_oa_outbound_messages`, resolve the Channel_Access_Token from Vault, call the LINE Messaging API (reply or push), then call `rpc_record_line_send_result`; scrub the token from all logs
    - _Requirements: 4.1, 4.2, 4.4, 4.6_
  - [x] 19.4 Write integration test for sender claim-and-record wiring (mocked LINE API)
    - Verify a pending row is claimed, the result RPC marks sent/failed, and tokens never appear in logs
    - _Requirements: 4.4, 4.6_

- [x] 20. Final checkpoint - full suite
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; all property tests run a minimum of 100 iterations and are tagged `Feature: line-oa-commerce, Property {n}: {text}`.
- The LINE Messaging API and the forecasting `record_input_sync` pipeline are mocked for property-based tests; the staged `pending → sent/failed` model keeps outbound HTTP out of the DB transaction.
- All writes go through `SECURITY DEFINER` RPCs that re-check role, resolve the actor via `public.resolve_actor()`, write audit, and scrub secrets; there are no client write policies and no `service_role` use from the client.
- Channel secrets live in Supabase Vault; `line_oa_channels` stores only references. Signature verification happens inside `rpc_ingest_line_webhook`.
- Each task references the requirement sub-clauses it satisfies for traceability; checkpoints provide incremental validation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "5.1", "5.3", "5.5", "11.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "6.1", "5.2", "5.4", "5.6", "5.7", "5.8", "11.2", "11.3"] },
    { "id": 3, "tasks": ["3.1", "3.2", "6.2", "6.3", "7.1", "7.3"] },
    { "id": 4, "tasks": ["3.3", "3.4", "3.5", "7.2", "7.4", "7.5", "7.6", "7.7", "7.8", "8.1", "10.1"] },
    { "id": 5, "tasks": ["8.2", "8.3", "8.4", "8.5", "10.2", "11.4", "12.1", "13.1"] },
    { "id": 6, "tasks": ["11.5", "11.6", "11.7", "12.2", "13.2", "13.3", "15.1", "16.1", "17.1"] },
    { "id": 7, "tasks": ["15.2", "15.3", "16.2", "17.2", "18.1", "18.2", "18.3", "19.1", "19.3"] },
    { "id": 8, "tasks": ["19.2", "19.4"] }
  ]
}
```
