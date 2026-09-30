# LINE RPC caller register — ops completion required

30 September 2026. Source survey at e7e2c52ce. Owner instruction: external RPC callers are not confirmed; survey first. Status: SOURCE INVENTORY / EXTERNAL UNKNOWN. This document does not authorize 0199 or access to external/production systems.

## Known source paths

| Register ID | Source-observed path | Required access indicated | Operational owner | Environments / active use / last use | Ops evidence |
| --- | --- | --- | --- | --- | --- |
| RPC-01 | line-webhook → rpc_ingest_line_webhook | service_role | UNASSIGNED | UNKNOWN | Pending |
| RPC-02 | customer-design-view → line_oa_resolve_customer_identity | service_role | UNASSIGNED | UNKNOWN | Pending |
| RPC-03 | line-outbound-sender → rpc_claim_line_outbound_batch / rpc_record_line_send_result | service_role; authenticated recorder boundary undecided | UNASSIGNED | UNKNOWN | Pending |
| RPC-04 | field-app LeadPanel → rpc_request_customer_acceptance | Authenticated user with business guards | UNASSIGNED | UNKNOWN | Pending |
| RPC-05 | field-app SaleHome → rpc_field_close_lead / rpc_field_set_lead_source | Authenticated user with business guards | UNASSIGNED | UNKNOWN | Pending |
| RPC-06 | field-app PhotoSendCard / DesignerToolsPanel → photo send / drawing revision RPCs | Authenticated user with business guards | UNASSIGNED | UNKNOWN | Pending |
| RPC-07 | Ingress → fn_line_handle_group_event | DEFINER owner chain | UNASSIGNED | UNKNOWN | Pending |
| RPC-08 | Manufacturing/business functions → fn_prod_curated | DEFINER owner chain; manufacturing coordination | UNASSIGNED | UNKNOWN | Pending |
| RPC-09 | Binding trigger → fn_welcome_on_group_bind | Trigger/owner execution | UNASSIGNED | UNKNOWN | Pending |
| RPC-10 | Registered database cron → fn_lead_followup_sweep | Actual deployed scheduler principal must be confirmed | UNASSIGNED | UNKNOWN | Pending |
| RPC-11 | Dogfood runbook Field Operator → rpc_create_line_order | Actual manual credential class unknown | UNASSIGNED | UNKNOWN | Pending |
| RPC-12 | Other writers with no executable callsite found in bounded scan | Do not infer unused; see survey | UNASSIGNED | UNKNOWN | Pending |

Paths, line references and exact writer names are in [the integration/B12 packet](line-p010-integration-b12-followup.en.md). These rows establish source/documented paths, not production deployment or external absence. No n8n/Make/Zapier match was found in the bounded tracked scan; that is not a hosted-system inventory.

## Per-environment confirmation fields

For each row, record application/job and accountable operator; environment; active/disabled status and last use; exact RPC name/signature or endpoint; call chain and scheduler; authentication class only (user JWT/service/database role); required business capability; retain/retire/migrate decision; redacted configuration or log reference with time/outcome. Add rows for systems not listed.

Explicitly inventory hosted automation, backend services, dashboards, admin/BI scripts, ad hoc SQL tools and manual dogfood work. Include sender, timeout sweeps and lead follow-up schedules. Supply no tokens, keys, authorization headers, credential-bearing URLs, customer identifiers or request bodies. Store a redacted evidence reference rather than raw logs with customer data.

Non-response remains UNKNOWN. A claim of absence needs defined system/environment coverage, accountable confirmation and corroborating evidence; it cannot be inferred from repository search. Existing ops attestation about direct table writes does not answer this RPC question.

## Decisions before grants or integration

| Decision | Current state | Minimum decision needed |
| --- | --- | --- |
| Manufacturing/integration owner | UNASSIGNED; owner asked to name a person/session | Named accountable owner for 0170/0191 order, final privileges and factory compatibility |
| External/manual RPC callers | UNKNOWN | Completed register and redacted supporting references |
| B12 function/role matrix | PROPOSED, not approved | Exact signatures, retained access, authenticated recorder policy and factory coordination |
| Tenant/service authority and overlapping work | UNDECIDED | Canonical model and owners for 0175/0176/0178 overlap before P0-9 |
| Push and actual CI | NOT APPROVED | Owner authorization after reviewed local changes; actual Actions conclusion required |

No grant, migration, ref, branch integration, deployment or external message is performed by creating this register. The E1/E2/E3 evidence acceptance does not decide these questions.
