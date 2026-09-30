# P0-10 follow-up: fail-closed test and CI registration

Date: 30 September 2026. Base: 87930836a87852cac32efd80920b1d19f62b48f2 on codex/repair-intelligence-phase0-trust. Status: BUILT, awaiting independent review. These are local results, not GitHub Actions results. Nothing was pushed or deployed, and P0-10 and Phase A are not closed.

## What changed

| File | Change |
|---|---|
| supabase/tests/line_oa_client_write_revoke_fail_closed.sql | New pgTAP suite, 13 assertions. It runs the real 0198 file with \ir inside savepoints and checks the fail-closed path. 0198 itself is unchanged. |
| .github/workflows/db-verify.yml | Registers line_oa_client_write_revoke and the new suite with the same begin wrapper as line_outbound_claim_record. Adds a step that checks 0198 left no client write privilege, and adds both suites to the evidence summary. The upload already includes tap/*.tap. |

## The fail-closed suite

| Assertions | What they prove |
|---|---|
| 1 | Scope guard: 8 tables and anon exist, and anon starts with no write privilege (0198 applied) |
| 2-6 | Case A. anon inherits INSERT/UPDATE on line_oa_orders from a throwaway role, and has a direct INSERT on line_oa_channels. 0198 must raise 42501 with a message that starts with "P0-10: write privileges remain after revoke" and names anon:line_oa_orders. After the error, every table ACL, column ACL and membership must equal the state before, and the direct INSERT must be back. |
| 7-11 | Case B. anon holds a column UPDATE on line_oa_message_templates.body granted by a second grantor, plus the same direct INSERT. Same four checks, naming anon:line_oa_message_templates. |
| 12-13 | Case C. With nothing surviving, 0198 completes, and it revokes both an owner-granted direct INSERT and an owner-granted column UPDATE. |

Case B needs a second grantor because a table-level REVOKE also removes column privileges granted by the same grantor, as case C shows. Facts are captured in psql variables inside each case. The assertions run after the case's savepoint is rolled back, so pgTAP's own records are never undone. Throwaway roles and grants are rolled back; after the runs no p010 role remains and the catalog fingerprint is unchanged.

## Results

| Check | RED (mutant) | GREEN (real 0198) |
|---|---|---|
| Migration chain from zero | 193/193, real 0198 last | 193/193, real 0198 last |
| Fail-closed suite | 5 pass; exactly 3-6 and 8-11 fail; both rejections show SQLSTATE 00000 | 13/13 |
| P0-10 suite / original suite | not run | 133/133 / 107/107 |
| Claim race / 12 Python files | not run | overlap 0 / 72 of 72, none skipped |
| Cron runs, fingerprint, teardown, credential scan, verifier | 0; unchanged; clean; pass; exit 0 | 0; unchanged; clean; pass; exit 0 |

The mutant is 0198 with only the residual-privilege check loop and its RAISE removed: the diff has 20 removed lines and no added line. It was never placed in the migration chain.

## Local run of the workflow's database steps

| Step | Exit | Note |
|---|---|---|
| pgTAP suites (as written) | 3 | Stops at repair_phase0_containment.sql:74; the 8 earlier suites report all ok |
| Claim race | 0 | overlap 0 |
| Confirm chain reaches 0192 | 0 | |
| Confirm 0198 removed client writes (new) | 0 | |
| Assemble evidence | 0 | pgtap.pass = false; the three LINE suites have no TAP because the loop stopped |
| pgTAP loop body with only the three LINE suites | 0 | all ok: 107, 133 and 13 assertions |

Two existing problems surfaced here; neither was changed:

1. repair_phase0_containment.sql checks rpc_factory_job_record_packet with a 12-argument signature that exists only through 0170_factory_jobs_list_real_fields.sql on origin/main, a migration this branch lacks. On GitHub Actions the pgTAP step would stop there, so the LINE suites would not run, and the next three steps would be skipped. CI cannot yet serve as P0-10 closure evidence. Resolving this belongs to the branch-integration decision (PRD §8 question 7) or a separately approved fix.
2. The "Assemble evidence" script scored the stopped suite as passing (6 ok, 0 not ok, 8 planned), because it does not compare results with the plan.

## Not established

- Any GitHub Actions result: nothing was pushed.
- Production grants, grantors and owners: the read-only production catalog check before deploy remains a separate gate.
- B12 (EXECUTE) and 0199 remain separate and unapproved.

## Files

The raw outputs are listed in each bundle's SHA256SUMS.run, and REPLAY.txt gives the exact commands. gate-p010-followup.py and commit-p010-followup.sh are the gate and wrapper used for the commit; the transcript is in docs/governance/evidence/line-p010-followup-commit-2026-09-30/. The gate allows exactly one known non-secret value: the Supabase CLI's documented local default DSN in db-verify.yml and its recorded copies.
