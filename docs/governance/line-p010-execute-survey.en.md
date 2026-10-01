# EXECUTE exposure of the LINE SECURITY DEFINER writers: read-only survey

Date: 30 September 2026. Source base: da252d18a on codex/repair-intelligence-phase0-trust. Status: SURVEY ONLY. No EXECUTE grant was changed. This does not claim that production exposes these functions through its API.

## Why this survey exists

The P0-10 catalog capture (da252d18a) showed that anon can EXECUTE 18 of the 20 SECURITY DEFINER routines that write line_oa_* tables. The RED and GREEN runs of 0198 captured the same catalog again: 0198 removes direct table writes but leaves EXECUTE unchanged (anon 18/20, authenticated 19/20, service_role 20/20). A DEFINER routine runs as its owner, so revoking table grants does not stop a client role from calling it.

## Method

- Callers: every tracked file under src, server, supabase/functions, packages, tools, scripts and e2e was searched by name, plus all migrations (calls inside other functions, triggers and cron jobs). Tests were counted, not treated as callers.
- Intended grants: the GRANT and REVOKE statements written in the migrations.
- Guards: the final definition of each routine was read. A guard means an explicit caller check in the body, such as is_governance_role, has_site_access, auth.uid or the LINE signature check.
- Classes used below: FOUND (seen in the repository), INFERENCE (reasoned from the source, not executed) and UNKNOWN.

## Root cause (FOUND)

No migration issues ALTER DEFAULT PRIVILEGES (re-checked 2026-10-01 at `a97c3c847`: `git grep -niF "alter default privileges" -- supabase/migrations` returns nothing). The catalog shows default ACLs from the platform roles postgres and supabase_admin that grant EXECUTE on new functions to anon, authenticated and service_role. The migrations then revoke EXECUTE only from PUBLIC, for example 0107_factory_group_milestones.sql line 61, and grant to authenticated or service_role. The direct default grant to anon is never removed.

## Findings per routine

| Routine | In-repo callers (FOUND) | Grant written in migrations | Caller check in body | Exposure to anon |
|---|---|---|---|---|
| fn_prod_curated | 23 call sites inside other DEFINER functions (0107 to 0143); no edge or frontend caller | revoke from PUBLIC only (`0107_factory_group_milestones.sql:61`) | none (`0107_factory_group_milestones.sql:50-60`) | High (INFERENCE): queues a pending push into a project's customer group with caller-chosen slot text, given a project id |
| fn_line_handle_group_event | only rpc_ingest_line_webhook (`0097_line_group_bot_flows.sql:435`) | revoke from PUBLIC only (`0097_line_group_bot_flows.sql:285`) | none; it trusts that the caller verified the LINE signature | High (INFERENCE): a direct call skips signature verification. Binding needs a valid bind code and approval postbacks need the approve token, but join, leave and member events are not gated; a forged leave event archives a bound group whose LINE group id is known (`0107_factory_group_milestones.sql:235-240`) |
| line_oa_resolve_customer_identity | edge customer-design-view (index.ts:102, service client); ingest, order and approval functions | revoke from PUBLIC only (`00000000000020_line_oa_identity_resolution.sql:135`) | none | Medium (INFERENCE): creates an identity row for any LINE user id and returns the customer id |
| fn_lead_followup_sweep | cron job wf-lead-followup-sweep (`0116_lead_followup.sql:192`) | service_role only (`0116_lead_followup.sql:223-225`) | none | Medium (INFERENCE): anyone can trigger lead follow-up pushes and escalations on demand |
| rpc_sweep_line_session_timeouts | no in-repo caller outside tests | revoke from PUBLIC (`00000000000061_line_oa_session_timeout_sweep.sql:136`), then service_role only (`00000000000061_line_oa_session_timeout_sweep.sql:141`) | none | Low (INFERENCE): closes sessions already past the timeout |
| rpc_ingest_line_webhook | edge line-webhook (index.ts:201, service key) | authenticated and service_role (`00000000000022_line_oa_ingest_webhook.sql:344-356`) | LINE HMAC signature before any write | Low (INFERENCE): forgery needs the channel secret; a rejected call still appends one audit row |
| fn_welcome_on_group_bind | trigger trg_welcome_group_bind (`0136_customer_docs.sql:185-186`) | none; PUBLIC also holds EXECUTE | trigger-only function | Low (INFERENCE): PostgreSQL refuses to call a trigger function directly (not tested here) |
| rpc_send_line_outbound | none live (known since 26 July 2026) | authenticated (`00000000000040_line_oa_send_outbound.sql:442`) | is_governance_role, has_site_access, 42501 | Low (INFERENCE): the body denies callers without a site role |
| rpc_create_line_order | none in code | authenticated (`00000000000050_line_oa_create_order.sql:643`) | is_governance_role, has_site_access, 42501 | Low (INFERENCE) |
| rpc_evaluate_identity_merge_candidate | none in code | authenticated (`00000000000021_line_oa_identity_merge_candidate.sql:265`) | is_governance_role, 42501 | Low (INFERENCE) |
| rpc_resolve_conversation_site | none in code | authenticated (`00000000000030_line_oa_resolve_conversation_site.sql:254`) | is_governance_role, has_site_access, 42501 | Low (INFERENCE) |
| rpc_sync_line_forecast | none in code | authenticated (`00000000000060_line_oa_sync_forecast.sql:278`) | is_governance_role, has_site_access, 42501 | Low (INFERENCE) |
| rpc_request_customer_acceptance | field-app LeadPanel.tsx:43 | authenticated and service_role (`0098_customer_acceptance_flex.sql:110-113`) | is_governance_role, has_site_access | Low (INFERENCE) |
| rpc_field_assign_lead | none in code | authenticated and service_role (`0116_lead_followup.sql:205-220`) | auth.uid, is_governance_role, has_site_access | Low (INFERENCE) |
| rpc_field_close_lead | field-app SaleHome.tsx:34 | authenticated and service_role (`0116_lead_followup.sql:205-220`) | is_governance_role, has_site_access | Low (INFERENCE) |
| rpc_field_set_lead_source | field-app SaleHome.tsx:42 | authenticated and service_role (`0151_turnkey_lead_source.sql:264-273`) | is_governance_role, has_site_access | Low (INFERENCE) |
| rpc_field_send_photo_to_customer | field-app PhotoSendCard.tsx:33 | authenticated and service_role (`0134_sender_image.sql:69-74`) | is_governance_role, has_site_access | Low (INFERENCE) |
| rpc_field_shop_drawing_revision | field-app DesignerToolsPanel.tsx:69 | authenticated and service_role (`0143_qms_factory_design.sql:478-487`) | is_governance_role, has_site_access | Low (INFERENCE) |

"Low" means only that the body appears to deny anon. It still depends on each guard being correct on every path, which this survey did not test.

## Unknown

- Callers outside this repository: other apps, scripts, automation or manual tools. Finding no caller in the repository does not prove there is none.
- Production: its EXECUTE grants, default ACLs and PostgREST schema exposure were not read. Nothing here shows that production exposes these functions.
- Runtime behaviour of each guard for anon, and whether PostgreSQL refuses a direct trigger-function call in this setup: not executed.

## Proposed remediation (needs separate approval; nothing done)

1. A new migration (proposed 0199) revokes EXECUTE from anon on all 18 routines. It also revokes EXECUTE from authenticated where no in-repo caller needs it: fn_prod_curated, fn_line_handle_group_event, fn_welcome_on_group_bind (also PUBLIC), fn_lead_followup_sweep, rpc_sweep_line_session_timeouts, line_oa_resolve_customer_identity and rpc_ingest_line_webhook. For the three internal helpers (fn_prod_curated, fn_line_handle_group_event, fn_welcome_on_group_bind) service_role would lose EXECUTE too. DEFINER callers keep working because they run as the owner.
2. Tests with the same RED/GREEN shape as P0-10: a has_function_privilege matrix; a real call as anon expecting 42501 permission denied for function; and positive paths for field-app RPCs as authenticated with claims, edge paths as service_role, the cron function as its owner and the welcome trigger.
3. Coordinate with the manufacturing OS owner before changing fn_prod_curated grants, because factory functions call it (0107, 0124, 0143). No factory code would change.
4. Changing default privileges for future functions is a broader, separate decision.
5. A read-only production catalog check stays a separate gate before any deploy.
