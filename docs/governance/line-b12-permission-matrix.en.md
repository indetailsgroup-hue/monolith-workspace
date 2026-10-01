# B12 exact-identity permission matrix and acceptance plan

30 September 2026, tests revised 2 October 2026. The matrix was drafted on c4c76717b9d64a51ad1c0b4421148587be7ba285 and implemented in 0199 (commit a97c3c847 on base 5119396a7). IMPLEMENTED LOCALLY, awaiting independent review; not deployed. The recorder choice is decided (service-only). Caller-register and manufacturing answers are still missing and block deployment.

## Owner decisions and implementation (30 September 2026)

- Recorder: `rpc_record_line_send_result` is service-only (owner decision). B12-15 authenticated is DENY.
- Build: the owner approved building the whole matrix in one step before the ops caller register and the manufacturing sign-off arrived. The SERVICE-row authenticated denials and the `fn_prod_curated` service_role denial are therefore implemented on assumption, and deployment stays blocked until those answers exist.
- Implementation: `supabase/migrations/0199_line_oa_restrict_definer_execute.sql` revokes EXECUTE only and grants nothing. It stops (55000) on a missing identity or an unclassified overload (`0199_line_oa_restrict_definer_execute.sql:66`, `0199_line_oa_restrict_definer_execute.sql:75`), and it raises 42501 and rolls back if any effective right differs from the target afterwards or PUBLIC still holds EXECUTE (`0199_line_oa_restrict_definer_execute.sql:111`).
- Tests: `supabase/tests/line_oa_definer_execute_matrix.sql` (82 assertions) and `supabase/tests/line_oa_definer_execute_fail_closed.sql` (27; 23 at a97c3c847). Round 2 (2 October 2026) made assertion 54 run realistic anon calls that fingerprint the tables inside each probe, added case F (missing identity, 55000), and made the original suite's assertions 41 and 43 require the function-ACL message. Two existing tests changed with the policy. The original suite's recorder check now expects no authenticated EXECUTE (`line_outbound_claim_record.sql:429`), and the P0-10 suite reaches `fn_prod_curated` through `rpc_field_create_appointment` instead of calling it as service_role.
- Evidence: `evidence/line-p012-red-a-2026-09-30/`, `evidence/line-p012-red-b-2026-09-30/` and `evidence/line-p012-green-2026-09-30/`; round 2 in `evidence/line-p012b-red-a-2026-10-02/`, `evidence/line-p012b-red-mutants-2026-10-02/` and `evidence/line-p012b-green-2026-10-02/`. These are local runs, awaiting independent review; they are not production results.

## Alternatives and recommendation

Keeping existing rights avoids disruption but leaves B12 open. Blanket revocation risks breaking signed ingress, sender and field-app paths. Recommend selective denial by exact identity, preserving approved business callers and owner chains. Missing caller evidence is not evidence of non-use.

## Exact matrix

Current A/U/S means effective EXECUTE for anon/authenticated/service_role, t=yes, f=no, from the committed reconstructed catalog at da252d18a. It is historical local evidence, not production or a fresh catalog. All twenty identities are public, SECURITY DEFINER and owned by postgres in that capture. Target columns are proposed final effective rights, not new GRANT instructions. DENY includes rights inherited through PUBLIC/membership; KEEP preserves current access provisionally and does not approve every caller. No row is DECIDE any more: the only one (B12-15) was settled by the owner as service-only.

| ID | public identity | Current A/U/S | Target anon | Target authenticated | Target service_role | Class |
| --- | --- | --- | --- | --- | --- | --- |
| B12-01 | `fn_lead_followup_sweep()` | t/t/t | DENY | DENY | KEEP | SERVICE |
| B12-02 | `fn_line_handle_group_event(jsonb,text,text)` | t/t/t | DENY | DENY | DENY | INTERNAL |
| B12-03 | `fn_prod_curated(uuid,text,jsonb)` | t/t/t | DENY | DENY | DENY | INTERNAL |
| B12-04 | `fn_welcome_on_group_bind()` | t/t/t | DENY | DENY | DENY | INTERNAL |
| B12-05 | `line_oa_resolve_customer_identity(text,text)` | t/t/t | DENY | DENY | KEEP | SERVICE |
| B12-06 | `rpc_claim_line_outbound_batch(integer,integer)` | f/f/t | DENY | DENY | KEEP | SENDER |
| B12-07 | `rpc_create_line_order(uuid,jsonb,text,text)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |
| B12-08 | `rpc_evaluate_identity_merge_candidate(text,text,uuid,jsonb,numeric)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |
| B12-09 | `rpc_field_assign_lead(uuid,uuid)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |
| B12-10 | `rpc_field_close_lead(uuid,text,text)` | t/t/t | DENY | KEEP | KEEP | FIELD |
| B12-11 | `rpc_field_send_photo_to_customer(uuid,uuid,text)` | t/t/t | DENY | KEEP | KEEP | FIELD |
| B12-12 | `rpc_field_set_lead_source(uuid,text)` | t/t/t | DENY | KEEP | KEEP | FIELD |
| B12-13 | `rpc_field_shop_drawing_revision(uuid,text,text,boolean,boolean)` | t/t/t | DENY | KEEP | KEEP | FIELD |
| B12-14 | `rpc_ingest_line_webhook(text,text,text)` | t/t/t | DENY | DENY | KEEP | SERVICE |
| B12-15 | `rpc_record_line_send_result(uuid,text,text,text,uuid)` | f/t/t | DENY | DENY (owner decision) | KEEP | SENDER |
| B12-16 | `rpc_request_customer_acceptance(uuid,text)` | t/t/t | DENY | KEEP | KEEP | FIELD |
| B12-17 | `rpc_resolve_conversation_site(uuid,text,text)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |
| B12-18 | `rpc_send_line_outbound(uuid,text,jsonb,text,boolean,boolean,boolean)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |
| B12-19 | `rpc_sweep_line_session_timeouts()` | t/t/t | DENY | DENY | KEEP | SERVICE |
| B12-20 | `rpc_sync_line_forecast(text,text,text)` | t/t/t | DENY | KEEP | KEEP | CALLER-UNKNOWN |

PUBLIC target: no EXECUTE on all twenty identities; the historical catalog shows only the welcome trigger function has it. Keep owners, function bodies, table SELECT, memberships and default ACLs unchanged in this bounded design. Do not alter authenticator merely because it currently benefits from PUBLIC. Effective authenticator privileges must still be inspected after changes.

## Caller classes and unresolved decisions

- INTERNAL: remove direct role access only after proving owner call chains and the installed trigger still work; fn_prod_curated needs manufacturing coordination.
- SERVICE: preserve service entry points; confirm deployed cron principal without activating cron.
- FIELD: preserve authenticated business calls and test both authorized and cross-site denial.
- CALLER-UNKNOWN: retain authenticated/service access pending inventory; absence of a code call does not justify further revocation — the dogfood runbook explicitly names rpc_create_line_order.

SENDER: claim remains service-only. Before 0199 the recorder permitted authenticated execution and checked governance/site access in 0197:122–129. The owner decided service-only recording on 30 September 2026 and 0199 implements it. Ops should still confirm that no staff member or tool records results by hand.

Every row needs an ops register reference or an explicit unresolved entry. Approval must identify exact signatures, recorder choice, retained service callers, trigger/cron principal and factory coordination. Recheck overloads and 0199 availability on the chosen integration base immediately before SQL.

## Acceptance plan and local status

Status after the local runs of 0199 (round 1) and its strengthened tests (round 2): executed, partly, or open.

| Check | Required evidence | Status |
| --- | --- | --- |
| Baseline | Catalog owners, twenty exact identities plus unexpected overloads, effective rights for named roles, PUBLIC and inheritance; no production assumptions | executed for owners, identities, overloads, the three roles, PUBLIC and inheritance; authenticator after 0199 is open (see the PUBLIC paragraph) |
| RED | Same test bytes on baseline demonstrate expected forbidden access still exists; calls use valid typed inputs and transaction rollback, with no sender/cron/external channel | executed; round 2 adds realistic anon calls that are shown to write when 0199 is absent |
| Denial | After migration each DENY is false by effective privilege checks; ordinary-function calls produce 42501 permission denied for function, not a schema or body failure | executed |
| Trigger exception | Check ACL and actual binding-trigger effects; invalid direct invocation of a trigger function is not proof of permission denial | executed |
| Preserved behavior | Signed ingest, service identity, claim/record, five known field paths, retained guarded RPCs, owner sweep, welcome trigger and factory owner chain; assert resulting data and denied wrong-site cases | executed |
| Residual grants | Simulate inherited/direct other-grantor access on temporary roles; migration must fail closed without silently granting broader rights or changing memberships | executed (fail-closed cases A–C) |
| Atomicity | Run the real migration under the intended transaction boundary; compare before/after ACL and owner state after failure; test rerun behavior | partly: after a failing run and the savepoint rollback, ACLs and memberships equal the pre-state, and a rerun is clean (case E); atomicity itself is PostgreSQL statement semantics, and owners are not compared |
| Integration | Complete migration chain and full suites, Python twelve files, race and 0198 direct-write denial; containment remains a real failure until resolved | executed locally (only the existing containment suite fails); GitHub Actions ran the five LINE suites at a97c3c847 |
| Evidence | New immutable bundle, source identities, commands/UTC/exit, raw results, checksums, secret scan and stack cleanup; independent review; actual CI after separate push approval | local bundles produced; independent review open |

Fixture rows and temporary roles are confined to a fresh isolated stack with cron off and no live credentials. Negative tests must not execute a live outbound worker. Test data effects are rolled back or the isolated stack is removed. Local results are in the line-p012 and line-p012b bundles. GitHub Actions results are excerpted in the line-p012b green bundle; no production result is claimed.

## Integration and deployment boundaries

A manufacturing owner must review 0170/0191 ordering and final overload privileges. Do not copy a missing factory function into a test shim. The full branch/tenant decision remains required before P0-9. Default grants for future/recreated functions need a separate policy decision; this design only covers these existing twenty identities and must not be described as comprehensive security closure.

Prior to deployment, separately authorized production catalog review must compare owners, ACLs, external/manual callers and API exposure. No production access, merge, push, customer message or cron activation is authorized by this plan.

## Design-text review and refinements

Opus 5.5 reviewed only a sanitized requirements paragraph through Claude CLI with tools/MCP disabled; it did not inspect source, files or a database. Its three concerns were loss of access supplied through PUBLIC, recurrence after recreation, and assumptions about owner chains/trigger tests. This is design feedback, not independent implementation acceptance.

For each identity, record grant origin (direct grant and grantor, PUBLIC, inheritance or ownership) for all observed grantees, not just three roles. KEEP requires post-state effective EXECUTE, while DECIDE preserves the existing grant until an explicit decision (no row remains DECIDE). Recording grant origin for grantees other than the three roles is still open. If PUBLIC removal would break an unlisted caller, stop for disposition; do not add replacement grants automatically. The historical snapshot has named grants for retained named roles, but a new target catalog must confirm that fact. Anonymous denial changes eighteen identities; the claim and recorder already deny anon and are regression controls.

Inventory every overload of each covered name. After an authorized create/recreate or integration, reassert the approved matrix and fail on a new unclassified overload. Do not introduce a schema-wide deny policy under this bounded work. Broader future default-ACL policy remains separate.

Trace each helper call chain's actual execution principal, including DEFINER/INVOKER boundaries and owners. Require that principal's effective EXECUTE to survive; do not assume every caller shares postgres ownership. Inherited access that defeats DENY stops the migration rather than authorizing membership changes. For ordinary denial tests assert schema USAGE and absence of function side effects. For the welcome function, separate ACL assertions from trigger non-regression, and test that the intended migration/restore principal can create or recreate its trigger on the isolated stack. Do not treat a successful installed trigger as proof of its caller ACL.

## Evidence references

- [Catalog analysis](evidence/line-p010-catalog-2026-09-30/08-analysis.txt): section E provides exact signatures/current rights; section G default ACLs.
- [Integration and caller findings](line-p010-integration-b12-followup.en.md): source paths and 0170/0191 dependency.
- [Ops caller register](line-rpc-caller-register.en.md): all environments and accountable owners remain to be confirmed.
- ../../supabase/migrations/0197_line_outbound_unicode_error_detail.sql:122–129: recorder service and user authorization branches.
- ../dogfood/first-house-runbook.md:35: documented manual order RPC.
