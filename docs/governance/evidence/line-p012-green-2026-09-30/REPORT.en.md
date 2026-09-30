# B12 / P0-12: migration 0199 and its evidence

Date: 30 September 2026. Base: 5119396a7c66c3f0d33547b57902ddefa2aefe07 on codex/repair-intelligence-phase0-trust. Status: BUILT, awaiting independent review. These are local results, not GitHub Actions or production results. Nothing was pushed or deployed. Deployment stays blocked until the ops caller register and the manufacturing sign-off for fn_prod_curated arrive.

## What changed

| File | Change |
|---|---|
| supabase/migrations/0199_line_oa_restrict_definer_execute.sql | Revokes EXECUTE on the twenty identities to the matrix and grants nothing. Stops on a missing identity or an unclassified overload (55000). Raises 42501 and rolls back if any effective right differs from the target afterwards or PUBLIC still holds EXECUTE. |
| supabase/tests/line_oa_definer_execute_matrix.sql | New, 82 assertions: matrix and PUBLIC, 29 real calls refused at the function ACL, no side effects, retained RPCs still execute, and kept paths checked by their data |
| supabase/tests/line_oa_definer_execute_fail_closed.sql | New, 23 assertions: inherited right, other grantor, keep lost through PUBLIC, unclassified overload, normal run |
| supabase/tests/line_outbound_claim_record.sql | Assertion 23 now expects no authenticated EXECUTE on the recorder (owner decision: service-only) |
| supabase/tests/line_oa_client_write_revoke.sql | Assertion 131 reaches fn_prod_curated through rpc_field_create_appointment instead of calling it as service_role |
| scripts/run-line-db-suites.sh, scripts/line-ci-tap.mjs, tests/line-oa-commerce/ci/tap-evidence.test.mjs | The two new suites are registered (fourteen suites, five LINE suites), the fail-closed suite gets the real 0199 path, and the harness tests are updated |

## Kept paths checked by their data

| Path | Result on GREEN |
|---|---|
| Signed 1:1 ingress and signed group join (through fn_line_handle_group_event) as service_role | inbound, identity and bind prompt written |
| line_oa_resolve_customer_identity as service_role | identity created |
| Welcome trigger when service_role binds a customer group; the owner recreating the trigger | welcome pack queued; trigger recreated |
| fn_prod_curated through rpc_field_create_appointment (site user) and rpc_factory_report_station (governance user) | tpl_appointment and tpl_prod_started queued |
| fn_lead_followup_sweep as service_role and as the owner (cron principal); rpc_sweep_line_session_timeouts | all run |
| Claim and record as service_role | row claimed and recorded as sent |
| Five field-app RPCs: authorised user and a user of another site | four succeed by data, and the drawing revision passes its guard; every other-site call is refused by the body's own guard |

## Results

| Check | RED-A (no 0199) | RED-B (mutant) | GREEN (0199) |
|---|---|---|---|
| Migrations from zero | 193 | 194 | 194 |
| Matrix suite | 36 pass; exactly 46 fail | not run | 82/82 |
| 0199 fail-closed | not run | exactly 12 fail (cases A-C) | 23/23 |
| Original / P0-10 / 0198 fail-closed | only assertion 23 fails / 133 / 28 | not run | 107 / 133 / 28 |
| Python / claim race | 72/72 / overlap 0 | not run | 72/72 / overlap 0 |
| CI harness / local CI suite runner | not run | not run | pass / only the existing containment suite fails |

## Not established

- The ops caller register (external or manual callers, the cron principal, any staff recording) and the manufacturing owner's view on fn_prod_curated. Both are assumptions until answered.
- Production: grants, grantors, owners and PostgREST exposure are unknown. The read-only production catalog check remains a separate gate.
- GitHub Actions: nothing was pushed, and the containment suite would still fail there.
- Functions created or recreated later still receive default EXECUTE; that policy is a separate decision.

## Files

The raw outputs of each run are listed in SHA256SUMS.run, and REPLAY.txt gives the exact commands. gate-p012.py and commit-p012.sh are the gate and wrapper used for the commit; the transcript is in docs/governance/evidence/line-p012-commit-2026-09-30/.
