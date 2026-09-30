# P0-10 integration and B12 decision packet

30 September 2026. Read-only analysis at product commit `3bdd6f3e5217f3252292cd11c858be151c01f977`. This packet proposes work; it does not authorize a merge, manufacturing change, 0199, production access or deployment.

## Containment: verified cause and handoff

The current `supabase/tests/repair_phase0_containment.sql:70–74` tests the 12-argument `rpc_factory_job_record_packet(text,text,text,text,text,text[],text[],text,text,text,text,integer)`. This branch's latest definition, `0162_factory_server_identity_released_only.sql:173`, has ten arguments.

Local ref `origin/main` at `57b69513ba0a5f0624ea3a40f9b5cea0b04992fb` and line-trust at `69c879304cc2d6c4fcdcf4070105e5a8fc4e25cd` contain `0170_factory_jobs_list_real_fields.sql`. These are local refs, not freshly fetched remote state. 0170 drops the old function, adds p_job_name/p_piece_count and table fields, updates jobs-list behavior and grants the new writer to service_role. Its introduction is e04855f444806c49245741eb9122c89f1a4e840a, with later update edc6ca94db3ef1a5e73a2df1593b5b4982dd9929.

**Ordering risk:** 0191 revokes service execution from all overloads existing when it runs (`0191_repair_phase0_revoke_legacy_mutation_authority.sql:27–38`). Applying 0170 later may recreate a service-executable writer. This is not a missing test fixture that LINE work may silently stub out.

**Proposed owner action:** the repository decision-maker names a manufacturing/integration owner under PRD section 8 question 7. That owner defines the migration/edge compatibility order and tests the integrated schema, including effective EXECUTE on all writer overloads after the final chain. Keep containment failed until authorized integration or a separately justified test correction passes. Do not weaken the assertion or treat LINE-only results as full CI.

A read-only all-ref query encountered invalid ref `refs/heads/codex/repair-intelligence-phase0-trust (1)`; explicit valid-ref queries succeeded. Do not assume the owner has already removed duplicate refs. No ref was deleted.

## B12: proposed bounded scope

Existing catalog/survey evidence reports EXECUTE on twenty writer identities: anon 18, authenticated 19, service_role 20. These reconstructed-stack facts do not establish production API exposure. Do not generalize the table-write attestation from ops into an assertion about external RPC callers.

| Proposed role change | Proposed targets | Required retained behavior |
| --- | --- | --- |
| Deny anon EXECUTE | Its eighteen executable writers in the catalog/survey | Required signed/service and authenticated business paths still work |
| Deny authenticated EXECUTE on internal/service paths | fn_prod_curated, fn_line_handle_group_event, fn_welcome_on_group_bind, fn_lead_followup_sweep, rpc_sweep_line_session_timeouts, line_oa_resolve_customer_identity, rpc_ingest_line_webhook | Field-app RPCs retain their approved guarded access |
| Deny direct service_role EXECUTE on internal helpers | fn_prod_curated, fn_line_handle_group_event, fn_welcome_on_group_bind | Owner-executed DEFINER chains and trigger path still work |
| Remove conflicting PUBLIC grants | Exact identities in the approved matrix, including welcome trigger function | Resolve effective access, including inherited grants, without changing unrelated routines |

Before SQL, approve exact signatures and role matrix, confirm external/manual RPC callers with ops, and coordinate factory-dependent helpers. Proposed number 0199 must be checked again on the chosen integration base. No grant is changed by this packet.

**Additional boundary decision:** authenticated can execute `rpc_record_line_send_result(uuid,text,text,text,uuid)` in the catalog (`line-p010-catalog-2026-09-30/08-analysis.txt:167–169`). This routine is outside the survey's eighteen anon-callable targets. Decide its intended caller boundary explicitly; the proposal must not claim a universal service-only writer boundary while leaving this unexamined.

## Current definitions and tests to use

Use final definitions, not only original creation migrations: lead follow-up sweep is in 0130:332; customer acceptance 0114:22; close lead 0130:280; shop drawing 0143:266; photo send 0134:19; lead source 0151:145. Service edge callers are line-webhook:200–201 and customer-design-view:78,102. Frontend callers are in packages/field-app: LeadPanel.tsx:43, SaleHome.tsx:34,42, PhotoSendCard.tsx:33 and DesignerToolsPanel.tsx:69.

Acceptance proposal: inventory all twenty exact catalog identities and owners; assert effective privileges across named roles, PUBLIC and inheritance; prove actual forbidden ordinary-function calls fail with 42501 for function permission; validate trigger-only routines through the trigger path and ACL checks rather than treating an invalid direct trigger invocation as a permission test; preserve authorized field-app calls with claims, signed/service ingress, identity lookup, owner cron and welcome trigger, manufacturing helper chain, LINE claim/record and direct-write denial. Test the full integrated suite. No real customer messages or cron activation.

## Separate policy and architecture decisions

Default ACLs give direct role grants for routines created by postgres/supabase_admin; revoking PUBLIC alone is insufficient. A bounded existing-function migration does not govern future new/recreated functions. Decide future default-ACL policy separately and do not change REFERENCES, TRIGGER or MAINTAIN under P0-10.

Production catalog must be reviewed separately before deployment. Function/table owners and effective rights can differ from the temporary stack; service-role behavior alone does not prove owner execution will survive.

Before P0-9, select canonical tenancy/service authority, one owner for outbound versus reserved 0178, ingress retries versus 0175 and staff login versus 0176; agree migration ordering and manufacturing conflict resolver. P0-9 must demonstrate failed handlers are not counted/deduplicated as success, enter bounded internal retries and eventually succeed or dead-letter with audit. RED must first reproduce false success; the design must not rely on LINE redelivery and must pass independent review. These remain proposed criteria, not implementation evidence.

## Caller survey requested by the owner

Owner response on 30 September: external RPC callers are not yet confirmed; survey first. The read-only inventory searched the twenty catalog names in tracked source, workflows, migrations and relevant docs, excluding credentials. No production or external integration was queried.

| Caller class | Observed writer calls / evidence | Access to preserve or confirm |
| --- | --- | --- |
| Service ingress | rpc_ingest_line_webhook; supabase/functions/line-webhook/index.ts:200–206 | Service client |
| Service identity | line_oa_resolve_customer_identity; customer-design-view/index.ts:78–82,102 | Service client and owner call chains |
| Sender worker | rpc_claim_line_outbound_batch and rpc_record_line_send_result; line-outbound-sender/index.ts:744,871,959–964 | Service EXECUTE; authenticated recorder scope still needs decision |
| Field user | rpc_request_customer_acceptance; packages/field-app/src/screens/LeadPanel.tsx:43 | Authenticated claims/guards, not an assumption of a deployed logged-in user |
| Field user | rpc_field_close_lead and rpc_field_set_lead_source; SaleHome.tsx:34,42 | Approved authenticated path |
| Field user | rpc_field_send_photo_to_customer; PhotoSendCard.tsx:33 | Approved authenticated path |
| Field user | rpc_field_shop_drawing_revision; DesignerToolsPanel.tsx:69 | Approved authenticated path |
| Internal owner chains | fn_line_handle_group_event at 0097:435; fn_prod_curated at 0107:89,133,135, 0124:149,151 and 0143:122 | Owner authority; coordinate manufacturing |
| Trigger / scheduled DB | fn_welcome_on_group_bind at 0136:185–186; fn_lead_followup_sweep registration at 0116:192 | Trigger/cron principal; deployed principal unknown |
| Documented manual path | rpc_create_line_order; docs/dogfood/first-house-runbook.md:25–35 | Field Operator is a documented role; actual usage/credential class unknown |
| No executable caller found in this scan | rpc_send_line_outbound, rpc_evaluate_identity_merge_candidate, rpc_resolve_conversation_site, rpc_sync_line_forecast, rpc_sweep_line_session_timeouts, rpc_field_assign_lead | Absence not established; owner/ops confirmation required |

Mentions in autonomyGate.ts, brand-voice.ts, templates.ts and order-adapter.ts can be comments rather than calls; evidence harnesses are not deployed callers. No n8n, Make.com or Zapier reference matched the bounded scan, and no exact writer name matched searched workflows. Dynamic calls, external automation and manual tools remain UNKNOWN. postgres is a database owner, not an identified accountable human.

Ops should supply a redacted per-environment register: application/job name and accountable person; active/disabled status and last use; exact RPC/signature or endpoint path; invocation chain and schedule; authentication class only (user JWT/service/database role); required business access and proposed retain/retire decision. Include redacted config/log evidence with timestamp and outcome. Specifically cover hosted automation, backend services, dashboards/admin/BI scripts, SQL tools, sender/sweeps and the manual dogfood runbook. Do not supply tokens, keys, authorization headers, credential-bearing URLs, customer identifiers or request bodies. Missing replies remain unknown; this request does not authorize accessing those systems.

## Review provenance

A separate Codex read-only agent checked the preceding commit's immutable blobs, RED/GREEN checksums and gated tree; it reported only known E1/E2/E3 evidence gaps. Another read-only agent traced the dependencies summarized here. Neither reran databases or supplied cross-vendor acceptance. User authorization covers evidence follow-up and preparation of these decisions; it does not choose their architectural answers.
