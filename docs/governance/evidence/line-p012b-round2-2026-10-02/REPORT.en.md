# 0199 and CI-remediation pre-review fixes (round 2)

Date: 2 October 2026 (Asia/Bangkok; runner times are UTC). Base: 48b72d4c7c3f0d3bab197cb19483ca973807add2 on codex/repair-intelligence-phase0-trust. Status: BUILT LOCALLY, awaiting independent review. Migration 0199 is unchanged; this round changes three test suites, documents and one workflow comment.

## Owner approval (2 October 2026)

The owner approved all three proposed items in one round and a push after the gate passes: fix the defects found in 48b72d4c7, strengthen the 0199 tests with new RED/GREEN evidence on a throwaway stack, and update the stale matrix document.

## Where the findings came from

Two fresh-context agents ran a read-only, builder-side pre-review of a97c3c847 and 48b72d4c7. That is defect hunting by the builder's side, not an independent acceptance; the independent reviewer still has to review both commits and this round. The builder re-checked the main findings before acting on them.

## Findings and disposition

| Finding | Disposition |
|---|---|
| 0199 matrix suite assertion 54 could not fail, because every probe rolls back | Fixed: assertion 54 now runs realistic anon calls to four writers and fingerprints seven tables inside each probe before its rollback; RED-A shows all four writing without 0199 |
| The fail-closed suite's `order by 1` sorted by a constant | Fixed: both aggregates order by their values |
| The fail-closed "unchanged after the error" assertions only prove that an error happened | Reworded to say what they check (state after the savepoint rollback equals the pre-state); the header notes that atomicity is PostgreSQL statement semantics; owners are still not compared |
| The missing-identity branch (55000) had no test | Fixed: case F renames one identity away and expects 55000; mutant C (identity check removed) fails exactly case F's two checks |
| Original-suite assertions 41 and 43 passed through the function ACL while describing the body guard | Fixed: both now require the message "permission denied for function rpc_record_line_send_result", and RED-A shows both failing without 0199 (`line-p012b-red-a-2026-10-02/04c-original.tap:73`, `line-p012b-red-a-2026-10-02/04c-original.tap:78`) |
| Matrix suite assertions 55–60 accepted any non-ACL error | Fixed: a schema denial or a missing function is classified separately and no longer counts as "body reached" |
| Test 69 called the migration owner the cron principal | Reworded: assumed principal; cron.job is not inspected |
| Matrix-suite header said every assertion fails on RED | Fixed: names the four regression controls (9, 35, 36, 46) |
| Matrix document stale base, DECIDE wording, SENDER paragraph and "executed locally" heading | Fixed in TH and EN; the acceptance plan now has a status column with partly and open items |
| 48b72d4c7: the 16 amended REPORTs point to pre-amendment hashes that the bundle did not hold | Fixed: `line-ci-remediation-2026-10-01/12-pre-amendment-hashes.txt:38` (32 entries, each equal to the base blob) |
| 48b72d4c7: survey rows passed the linter on grant citations, not on caller, guard or grant evidence | Fixed: the survey now cites re-checks R1 and R2 at 48b72d4c7 and the defining lines `0130_scrutiny5_fixes.sql:332-387`; the remediation ledger says so |
| 48b72d4c7: rewording count, consent-scope narrowing, `src/mcp/pdpa.ts:34`, weak citations, longpaths | Disclosed in a corrections section of `line-ci-remediation-2026-10-01/REPORT.en.md`; sealed REPORTs of the eight bundles are not amended again |
| CI claims carried no captured evidence | Fixed: `01-github-actions-excerpt.txt:1` holds URLs, head SHAs, job conclusions, log hashes and matching lines for runs 36748427202, 36748427203 and 36795389505 |
| Trust-kernel workflow banner said the workflow had never run | Fixed: the banner states the two runs and that the final gate has not passed |
| A SET-only role membership would pass the verification (`has_function_privilege` counts inherited rights only) | Open: theoretical; the local catalog shows no such membership for the three roles (membership edges at `line-p010-catalog-2026-09-30/08-analysis.txt:107`); production needs the separate catalog check |
| The 0199 header says earlier migrations revoked only from PUBLIC, while 0193 and 0194 also revoked from anon and authenticated | Open by choice: changing 0199 bytes would void the evidence of the commit under review; noted here for the reviewer |
| The PUBLIC-survives branch of 0199 has no dedicated case | Open: redundant while anon exists, because anon inherits PUBLIC |
| Main already uses migration numbers 0199 and later; KEEP rows could stop 0199 in production if a right exists only through PUBLIC | Risks for integration (PRD §8 Q7) and the production catalog check |

## What changed

| Path | Change |
|---|---|
| `supabase/tests/line_oa_definer_execute_matrix.sql` | write probes with table fingerprints (assertion 54), stricter outcome classes, header and label fixes; still 82 assertions |
| `supabase/tests/line_oa_definer_execute_fail_closed.sql` | value ordering, honest descriptions, new case F; 23 to 27 assertions |
| `supabase/tests/line_outbound_claim_record.sql` | assertions 41 and 43 require the function-ACL message; comments updated; line 429 unchanged |
| `docs/governance/line-b12-permission-matrix.{en,th}.md` | stale passages fixed; status column; round-2 evidence |
| `docs/governance/line-p010-execute-survey.{en,th}.md` | re-checks R1 and R2 and the defining lines for the absence cells |
| `docs/governance/evidence/line-ci-remediation-2026-10-01/` | pre-amendment hashes added; REPORT corrections; `SHA256SUMS.run` unchanged |
| `docs/PRD-LINE-OA.{en,th}.md` | edition 1.15: GitHub Actions results, round-2 evidence, counts |
| `.github/workflows/trust-kernel-verify.yml` | banner comment only |

All changed HTML equals the repository renderer output of its Markdown.

## Evidence

| Bundle | Result |
|---|---|
| `line-p012b-red-a-2026-10-02` | 193 migrations with 0199 skipped; matrix suite fails exactly 47 assertions (4–8, 10–34, 37–45, 47–54); assertion 54 shows four writes; original suite fails exactly 23, 41 and 43; P0-10 133/133; 0198 fail-closed 28/28; Python 72/72; claim race zero overlap; verifier 21 checks |
| `line-p012b-red-mutants-2026-10-02` | with 0199: mutant B fails exactly 12 (3–6, 8–11, 13–16), mutant C exactly 2 (23, 24); both mutants only remove lines; verifier 18 checks |
| `line-p012b-green-2026-10-02` | 194 migrations; matrix 82/82, 0199 fail-closed 27/27, original 107/107, P0-10 133/133, 0198 fail-closed 28/28, Python 72/72, claim race zero overlap; local fourteen-suite runner fails only repair_phase0_containment; verifier 25 checks |
| `line-p012b-round2-2026-10-02` | this report, the GitHub Actions excerpt, the edit and generator scripts, REPLAY, the gate and the commit wrapper; `02-gate-negative-controls.txt:10` onward shows the gate accepting the approved change set and rejecting eight deliberate violations, each by the check it targets |

Each runner bundle records commands, UTC times, exit codes, source copies, a catalog fingerprint before and after the tests, container teardown, and an in-run credential scan with a positive control; `SHA256SUMS.run` is written by the runner.

## Limits

- Local throwaway stacks only; GitHub Actions will run the changed suites after the push. No production access, deployment, cron run or real message.
- Independent review of a97c3c847, 48b72d4c7 and this round is still open; amended bundles need re-review.
- Deployment stays blocked on the ops caller register, the manufacturing sign-off for `fn_prod_curated`, integration (PRD §8 Q7) and the production catalog check. Phase A remains `EVIDENCE_INCOMPLETE`.
