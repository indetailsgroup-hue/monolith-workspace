# PRD — The Complete LINE OA Communication System (MONOLITH Repair Intelligence)

> **Language:** English · Thai edition: `docs/PRD-LINE-OA.th.md` · HTML: `docs/PRD-LINE-OA.en.html` / `docs/PRD-LINE-OA.th.html`
> **Edition:** 1.18 · 2 October 2026 (1.17, 1.16 and 1.15 = 2 Oct 2026 · 1.14, 1.13, 1.12, 1.11, 1.10, 1.9, 1.8, 1.7, 1.6, 1.5, 1.4, 1.3 and 1.2 = 30 Sep 2026 · 1.1 = 1 Aug 2026 · 1.0 = 26 Jul 2026)
> **What changed in 1.18:** round 3 of P0-9 (1902a8eea, verifier fix 20132e1b4) on `claude/line-p009-ingest-retry`. A second independent same-vendor review of round 2 gave ACCEPT WITH FOLLOW-UPS from both reviewers, with no blocker or major. Closed test-first: an expired row already ingested elsewhere is closed instead of dead-lettered, expiry keeps the error that queued the row, the attempt count is capped at the bound, first deliveries also store a timezone-safe `received_at`, and the fail-closed check covers column-level reads; case C now proves the migration file ran, and a `--recheck` mode lets a reviewer repeat the evidence checks later. RED 48 of 53 failing, GREEN 53/53, fourteen suite mutants and two race mutants caught. Still not pushed; cross-vendor review pending.
> **What changed in 1.17:** round 2 of P0-9 (fb9bfd967) on `claude/line-p009-ingest-retry`. An independent same-vendor review of round 1 found 0 blockers, 5 majors and 15 minors (Codex/Sol unavailable until 7 October 2026). Fixed test-first: stale rows expire instead of replaying late, a row's uncaught error no longer wedges the queue, timezone-safe `received_at`, `last_error` cleared on success, no MAINTAIN for service_role, a fail-closed privilege check, a race that proves overlap, two-event and fail-closed tests, and committed mutant evidence. RED 43 of 48 failing, GREEN 48/48, nine suite mutants and two race mutants caught. New finding B13 (postback branch) is recorded for the owner. Still not pushed; cross-vendor review pending.
> **What changed in 1.16:** P0-9 (B8) was built test-first in migration 0200 on a separate local branch `claude/line-p009-ingest-retry` (base 29e5e78d3, code commit 18a24483e), on the owner's instruction and ahead of the §8 question 7 decision on P0-9 versus line-trust `0175`. A failed group handler is no longer counted as processed: the event goes to the new `line_oa_inbound_retry` queue, a redelivery of a queued event is a duplicate, and the service-only `rpc_line_inbound_retry_sweep` reprocesses due rows (backoff 1/2/4/8 s, dead-letter with an audit entry at attempt 5). No cron is added. Evidence at 0a355e29b: RED (chain without 0200) fails 31 of 35 new assertions, and assertion 1 records `events_processed` 1 for the failed handler; GREEN passes 35/35, the two-client sweep race claims each of 20 rows once, and the other suites and every Python outcome are unchanged. Not merged into this branch, not pushed; awaiting independent review.
> **What changed in 1.15:** PR #133 ran on GitHub Actions for the first time. At a97c3c847, DB Verify passed the five LINE suites (107/133/28/82/23, claim race zero overlap) while its full verdict failed on `trust_kernel_containment` (storage was disabled in `supabase/config.toml`) and on the known `repair_phase0_containment`. Commit 48b72d4c7 cleared the claim-linter findings (eight sealed evidence REPORTs were amended openly under owner option A), enabled storage and added a shadow-E2E preflight; on that commit claim linters passed and `trust_kernel_containment` ran 16/16. A builder-side pre-review then strengthened the 0199 tests (round 2): realistic anon write probes, a missing-identity case and function-ACL message checks, with new RED-A, mutant and GREEN evidence. Independent review is still pending, deployment stays blocked, and Phase A remains `EVIDENCE_INCOMPLETE`.
> **Document status:** awaiting the owner's (Dave's) decisions on the open questions in §8 — no step proposed in §9 enables cron or sends messages to real customers
> **Writing rule:** every row separates "actually working / code present but not wired / spec only" and cites file:line, and separates evidence that is "reproducible (raw output in the repo)" from evidence that is "reported (no raw output in the repo)"
> **Truth note:** older documents (`docs/LINE-Architecture-System-Complete.md:41`, `docs/PRD.md:514`) claim "LINE OA Commerce ✅ 20/20", which is overstated for the live path — this document is the more truthful status record

---

## 0. Implementation status (edition 1.18)

**The earlier P0-1 to P0-6 implementation passed cross-vendor review; P0-11 at 00651a6cd has also passed independent cross-vendor acceptance; P0-10 (0198) passed independent code-and-evidence review at 87930836a (no reviewer rerun), and its source/recorded-evidence follow-up has bounded acceptance; independent database rerun and cross-vendor acceptance remain outstanding; B12 (0199) is built locally and awaits independent review; P0-9 (0200) is built on a separate local branch and awaits cross-vendor review — Phase A is not closed**

**Phase A evidence status:** `EVIDENCE_INCOMPLETE` — the latest local run (0199 GREEN) passes Python 72/72 and LINE pgTAP 107/133/28/82/23. The complete fourteen-suite loop runs, but `repair_phase0_containment` fails (6 of 8; missing function). GitHub Actions has run on push for PR #133 (table below) but its full verdict is failed, and there is no production verification; B12 (0199) awaits independent review. On branch `claude/line-p009-ingest-retry`, the P0-9 round-3 GREEN run (1902a8eea) passes the new suite 53/53 and its fifteen-suite loop fails only `repair_phase0_containment`; P0-9 awaits cross-vendor review. Follow-up source/recorded-evidence review is complete within the limits below; database rerun and cross-vendor acceptance remain outstanding.

- **Branch:** `codex/repair-intelligence-phase0-trust` · accepted commit: `46a203a6` (1 Aug 2026) · not pushed and not deployed
- **Migrations:** `0193_line_outbound_claim_and_record.sql`, `0194_line_outbound_retry_and_claim_fencing.sql`, `0195_line_outbound_timezone_safe_backoff.sql`, `0196_line_outbound_timezone_safe_sent_at.sql` plus changes to `supabase/functions/line-outbound-sender/index.ts`
- **Effect on real environments:** because nothing is deployed, every environment running the old code still has defects B1–B6

**Reproducible evidence (raw output in the repo):** bundle `docs/governance/evidence/line-phase-a-2026-09-30/`, run on 2026-09-30 04:46:33–04:46:37 UTC at HEAD `5aa52315`, where the code under test (`supabase/`, `tests/line-oa-commerce/`) is byte-identical to `46a203a6`

| File | What it records | Result |
|---|---|---|
| `00-context.txt` | UTC time, SHA, proof that the code matches `46a203a6`, tool versions, commands used, exit codes | pgTAP exit 0 · vitest exit 0 |
| `01-precheck.txt` / `04-postcheck.txt` | 7 values checked before and after the run: the count of A1–A4 columns, function `rpc_claim_line_outbound_batch`, the 5-argument `rpc_record_line_send_result`, the pgTAP extension, and row counts of 3 LINE tables | all 7 checked values match before and after (both files share one sha256) and the run ends with ROLLBACK; nothing left behind was found within the scope checked |
| `02-pgtap-wrapper.sql` / `03-pgtap-output.tap` | the rollback wrapper and raw TAP output | 70/70 ok, 0 not ok, ends with ROLLBACK |
| `05-vitest-output.txt` | raw vitest output | 18 files / 73 tests passed |
| `06-git-integration-check.txt` | git findings for §8.1, bound to SHAs | see §8.1 |
| `SHA256SUMS` | hash of every file in the bundle | verify with `sha256sum -c SHA256SUMS` |

**Limitations of this bundle:** its completeness is verifiable by hash, but it cannot yet be independently re-run in full — `02-pgtap-wrapper.sql` uses absolute paths from the machine that ran it, and no baseline of the shared stack was recorded before the test (applied migrations and a schema fingerprint); the before/after checks cover 7 values only, not a whole-database snapshot — the next bundle must meet the §9.1 criteria

**Reported evidence (no raw output in the repo):** the A1–A4 runs of 1 Aug 2026 are in the builder ledgers (`artifacts/wA1-ledger.md` to `artifacts/wA4-ledger.md`, not tracked in git) and in commit messages · the cross-vendor verdicts (A1–A3 rejected, A4 `SOL VERDICT: ACCEPT PHASE A4`) come from review threads not stored in the repo

**Step 1 evidence on a throwaway stack** (reproducible — raw output, a script run from the repository root, and `SHA256SUMS` in each bundle):

| Bundle | SHA tested | Result |
|---|---|---|
| `docs/governance/evidence/line-phase-a-step1-2026-09-30/` (attempt 1) | `ae990b4a` | stopped at the first migration because `auth.jwt()` was unavailable in the bare database baseline — no tests ran, no shims added |
| `docs/governance/evidence/line-phase-a-step1-attempt2-2026-09-30/` (attempt 2) | `13e3cd9d` | migration chain from zero 191/191 · pgTAP 70/70 · claim race 10+10 rows, 0 overlap · Python 56 passed / 8 failed / 8 skipped (every skip caused by the probe `resolve_actor()` not matching the real signature `resolve_actor(text)`) |
| `docs/governance/evidence/line-phase-a-step1-attempt3-2026-09-30/` (attempt 3) | `d48cfb6c` (probe fix only, 8 lines) | migration chain from zero 191/191 · pgTAP 70/70 · claim race 10+10 rows, 0 overlap · Python 63 passed / 9 failed / 0 skipped |

**Step 1 environment:** a small stack from locally cached images (postgres 17.6.1.158 + gotrue v2.195.0 + storage-api v1.66.4) on a throwaway docker network, never touching the shared stack and removed after the run — not identical to CI (`supabase start`) in every service, so this is machine-level evidence, not a CI result

**P0-11 evidence (30 September 2026):** `docs/governance/evidence/line-p011-red-attempt4-2026-09-30/` proves RED: original 70 pass, 31 of 37 new checks fail, unchanged failure property fails. `docs/governance/evidence/line-p011-green-2026-09-30/` proves GREEN: 192 migrations from zero, pgTAP 107/107, claim race 10+10 with zero overlap, Python 64 passed / 8 B10 failures / 0 skipped. Both runner verification gates exit 0; pytest exits 1 as recorded. The tested working tree is identified by base HEAD plus source hashes/patch, not HEAD alone. Generated-credential scan passes. Listed pre/post counters match after excluding capture time; owned containers/network are removed. Three earlier startup attempts stopped before migrations/tests and are retained as incomplete startup records. Dedicated bridge, loopback-only DB port and cron job execution disabled; no shared stack or live credentials. The 0197 addition postdates the SHA-bound comparison in §8.1.

**Cross-vendor acceptance — reported evidence (30 September 2026):** the owner supplied the independent reviewer’s ACCEPT decision for P0-11/B11 at commit `00651a6cd`. The reviewer reports a clean-tree rerun on an ephemeral stack: migrations 192/192, pgTAP 107/107, claim race 10+10 with zero overlap, Python 64 passed / 8 P0-10 failures / 0 skipped, verification passed and containers removed. Raw rerun files remain in the reviewer’s external scratchpad and have not been independently inspected or imported in this documentation update. Reported hash prefixes: pgTAP `9f5870b5…`, pytest `7362d613…`, verifier `8c4b8f8d…`; these are identifiers, not full checksums that can verify files. Source-byte qualification remains as recorded in GREEN `12-source-verification.txt`: 20 inputs match Git blobs byte-for-byte; 207 differ only by CRLF/LF. Acceptance closes B11/P0-11 and restores P0-6’s accepted status; it does not close Phase A, approve P0-10, or authorize push/deploy.

**P0-10 catalog evidence (30 September 2026, commit da252d18a):** `docs/governance/evidence/line-p010-catalog-2026-09-30/` ran the approved read-only checklist on a throwaway stack built from zero at base 6a41ebb69 (192/192 migrations). All eight tables are owned by `postgres`; the 20 candidate writers are 20 SECURITY DEFINER identities owned by `postgres`, so their write rights come from ownership, not from membership in `service_role`; no view or rule depends on the tables; default ACLs re-grant new tables and functions to the three roles. The independent reviewer confirmed the checksums against Git blobs and found the evidence sufficient to propose 0198 (review supplied by the owner). One limitation stands: that the gate blocked that commit is reported by the builder, not shown in the bundle. This proves only the reconstructed chain, not production.

**P0-10 implementation evidence (30 September 2026, historical submission; code/evidence review recorded below):** the owner approved 0198 with `service_role` in scope. `docs/governance/evidence/line-p010-red-2026-09-30/` (base da252d18a without 0198) shows 192 migrations, original pgTAP 107/107, new P0-10 pgTAP 19 pass and exactly the 114 write-privilege assertions fail, claim race zero overlap, Python 64 passed / 8 B10 failures / 0 skipped. `docs/governance/evidence/line-p010-green-2026-09-30/` (the same base plus 0198, identical test bytes) shows 193 migrations, pgTAP 107/107 and 133/133, claim race zero overlap, Python 72/72 with none skipped, and a catalog with zero write privilege for the three roles on 8/8 tables while the owner keeps full rights and EXECUTE is unchanged. Each run's verifier exits 0, the in-run credential scan passes and the containers and network are removed. The builder does not accept its own work; P0-10 stays open until independent acceptance.

**Independent review of 87930836a — reported (30 September 2026):** the owner supplied the reviewer's result. The commit passed code and evidence review with no finding that blocks acceptance within the 0198 scope. The reviewer confirmed the 27 gate checks, the Git-blob checksums including the transcript, the gated tree `021e96f6…`, the migration and test identity between RED and GREEN, the raw results, the catalog (zero client writes, owner rights kept, function bodies, EXECUTE, membership and default ACLs unchanged), and the HTML/renderer match. The reviewer did not rerun the database. Two follow-ups were requested: prove the fail-closed path, and register the new suite in CI.

**P0-10 follow-up evidence (30 September 2026, local, awaiting independent review):** `docs/governance/evidence/line-p010-failclosed-red-2026-09-30/` runs the new suite `supabase/tests/line_oa_client_write_revoke_fail_closed.sql` against a mutant copy of 0198 that lacks only the residual check. It fails exactly the eight rejection and rollback assertions, with SQLSTATE 00000 where 42501 was expected. `docs/governance/evidence/line-p010-failclosed-green-2026-09-30/` runs the same suite against the real 0198 and gets 13/13. That run also gets P0-10 pgTAP 133/133, original 107/107, claim race zero overlap and Python 72/72 with none skipped; 0198 itself is unchanged. The run includes the database steps of the modified `db-verify.yml`, run locally. The pgTAP step stops at `repair_phase0_containment.sql:74`, which checks a 12-argument `rpc_factory_job_record_packet` that only `0170_factory_jobs_list_real_fields.sql` on origin/main creates. The same loop body run with only the three LINE suites passes (107, 133 and 13). These are local results, not GitHub Actions results.

**P0-10 CI hardening evidence (30 September 2026, local, awaiting independent review):** base `a0ea86320`; new bundles `docs/governance/evidence/line-p010-ci-hardening-red-2026-09-30/` and `docs/governance/evidence/line-p010-ci-hardening-green-2026-09-30/`. RED has exactly 20 expected rejection/rollback failures against the residual-guard mutant. GREEN passes fail-closed 28/28, original 107/107, P0-10 133/133, Python 72/72 without skips and claim race 10+10 with zero overlap. TAP validator unit tests pass 22/22. The full local loop now reaches every suite and records stdout, stderr and exit code. Only the known containment suite fails: exit 3, 6/8 results, missing the specific 12-argument function. The summary correctly reports LINE passed and full pgTAP failed; the verifier rejects any different failure. Local metadata does not claim a GitHub Actions run. 0198 and older evidence are unchanged.

**B12 / P0-12 evidence (30 September 2026, local, awaiting independent review):** the owner approved building the matrix in one step and decided that recording send results is service-only. `supabase/migrations/0199_line_oa_restrict_definer_execute.sql` revokes EXECUTE on the twenty identities, with the following result:

- anon holds none;
- the three internal helpers are owner-only;
- service entry points keep service_role;
- field and unknown-caller RPCs keep authenticated and service_role;
- PUBLIC holds none.

It grants nothing and fails closed. `docs/governance/evidence/line-p012-red-a-2026-09-30/` (base 5119396a7 without 0199) shows the new matrix suite failing exactly its 46 matrix, PUBLIC and denial assertions, while all preserved-path assertions pass. `docs/governance/evidence/line-p012-red-b-2026-09-30/` shows the fail-closed suite failing exactly its 12 rejection and rollback assertions against a mutant without the post-revoke verification. `docs/governance/evidence/line-p012-green-2026-09-30/` shows 194 migrations, matrix 82/82, 0199 fail-closed 23/23, original 107/107, P0-10 133/133, 0198 fail-closed 28/28, Python 72/72 and claim race zero overlap. There, the local fourteen-suite runner fails only the existing containment suite. Round 2 (2 October 2026, `docs/governance/evidence/line-p012b-red-a-2026-10-02/`, `-red-mutants-` and `-green-`) strengthened the tests on 48b72d4c7 without changing 0199. Without 0199 the matrix suite fails exactly 47 assertions, including the new write probe, which shows four realistic anon calls writing before their rollback, and the original suite fails exactly 23, 41 and 43. Mutant B fails exactly 12 and mutant C (identity check removed) exactly 2 fail-closed assertions. GREEN gives matrix 82/82, 0199 fail-closed 27/27, original 107/107, P0-10 133/133, 0198 fail-closed 28/28, Python 72/72 and claim race zero overlap.

Two existing tests changed with the policy. The original suite's recorder check now expects no authenticated EXECUTE. The P0-10 suite reaches `fn_prod_curated` through `rpc_field_create_appointment` instead of calling it as service_role. The ops caller register and the manufacturing sign-off for `fn_prod_curated` are still missing, so deployment stays blocked until they arrive and the production catalog is checked.

**P0-9 / B8 evidence (2 October 2026, local, awaiting cross-vendor review):** the owner chose P0-9 for test-first work before the §8 question 7 decision, so it is built on its own local branch `claude/line-p009-ingest-retry` from 29e5e78d3 and is not merged into this branch. `supabase/migrations/0200_line_inbound_handler_retry.sql` changes only the group branch of `rpc_ingest_line_webhook` (the rest of the 0097 body, the signature and the 0199 EXECUTE matrix are unchanged; group rows now get a timezone-safe `received_at`) and adds the `line_oa_inbound_retry` table and the service-only `rpc_line_inbound_retry_sweep`. Two independent same-vendor reviews shaped it (Codex was unavailable until 7 October 2026): round 2 (fb9bfd967) answered 0 blockers, 5 majors and 15 minors; round 3 (1902a8eea) closes the follow-ups of the second review, where both reviewers answered ACCEPT WITH FOLLOW-UPS with no blocker or major. The sweep dead-letters a row queued for more than 10 minutes (reason expired, last error kept) without running the handler unless another delivery already ingested the event, fails only the row that raises any error, caps the attempt count at the bound and clears `last_error` on success; service_role holds SELECT only, and the migration ends with a fail-closed privilege check that also covers column-level reads. The suite `supabase/tests/line_inbound_handler_retry.sql` has 53 assertions; failures are injected by a test-only trigger inside its rollback. `docs/governance/evidence/line-p009-r3-red-2026-10-02/` (chain without 0200) shows 48 of 53 failing; 7, 39, 40 and 41 are controls, 48 re-runs the migration file itself, and assertion 1 records `events_processed` 1 for the failed handler, which is B8. Many RED failures only show that the queue objects are missing, so `docs/governance/evidence/line-p009-r3-mutants-2026-10-02/` applies fourteen deliberately broken copies of 0200 and shows each caught by its named assertions; it also shows the two-client race failing for a sweep with plain `FOR UPDATE` or no claim lock, while the round-1 harness still passed the plain `FOR UPDATE` copy. `docs/governance/evidence/line-p009-r3-green-2026-10-02/` (195 migrations) shows 53/53, the fifteen-suite loop failing only `repair_phase0_containment`, the race with proven overlap (client B ran inside client A's open transaction; each claimed 10 of 20 rows), the outbound claim race at zero overlap, CI harness tests passing, and every Python suite (106 cases: 93 passed, 13 skipped as known probe gaps, 0 failed) with each outcome equal to RED; the 72/72 figure above counts only the required suites on the outbound record/claim path. A reviewer can repeat every check except the per-run credential scan with `scripts/verify-line-p009-evidence.py <bundle> <mode> --recheck`, which passes at 20132e1b4 for all three round-3 bundles. The round-1 and round-2 bundles (`line-p009-*` and `line-p009-r2-*`) are kept as history and are superseded. No cron schedules the sweep, so this adds no activation.

**P0-9 open items:**

- Cross-vendor review of round 3 (Codex/Sol is available again after 7 October 2026)
- Owner decisions: the 10-minute expiry window; how long dead-letter payloads, which contain message text, are kept; whether the service-only sweep joins the owner-approved B12 matrix (`docs/governance/line-b12-permission-matrix.en.md` covers the twenty earlier identities)
- Known limits: the age is measured from the time the row was queued, not from the LINE event time; inside the 10-minute window a retried event can still land after a later event of the same group (for example `memberJoined` retried after `memberLeft`); `query_canceled` (statement timeout) still aborts a whole sweep call; two concurrent first deliveries of the same failing event are argued by code review, not tested
- B13 (below) is outside P0-9: it needs a handler change in `0107`
- CI: the push triggers do not include `claude/**`; a pull request (for example one stacked on `codex/repair-intelligence-phase0-trust`) runs both workflows
- Integration: `origin/main` (110890a3f) now carries migrations up to `0224`, including two other `0200_*` files and its own `0208_outbound_dead_letter.sql`, so §8 question 7 must also settle migration numbering for this branch

**Why Phase A is not closed:**

- **P0-9 (B8) is built but not accepted** — 0200 on local branch `claude/line-p009-ingest-retry` (round 3, 1902a8eea) awaits cross-vendor review; it may overlap `0175` unified ingress planned by branch `codex/line-trust-wave1-main` (still a reservation, no code), so §8 question 7 still decides which branch owns it
- **The required Python suites pass only with 0198:** without it, 64 pass and 8 B10 grant checks fail; with it, 72/72 pass with none skipped (local runs)
- **B12 is built but not accepted:** 0199 awaits independent review, and deployment is blocked until the ops caller register and the manufacturing sign-off for `fn_prod_curated` arrive (`docs/governance/line-b12-permission-matrix.en.md`)
- **CI is not passed:** all fourteen suites now run locally, including all five LINE suites (fifteen and six on `claude/line-p009-ingest-retry`). The known containment failure is retained as failed, not scored as passed. Resolving its dependency needs the branch-integration decision or a separately scoped fix; no manufacturing source is changed here.

| Defect | Status as of edition 1.18 |
|---|---|
| B1 queue pickup without a lock | ✅ implemented on the branch — the sender calls `rpc_claim_line_outbound_batch` (`index.ts:740-744`), `FOR UPDATE SKIP LOCKED`, timeout-based reclaim, `claim_token` fencing — the two-client test passes on the throwaway stack (attempts 2 and 3: 10+10 rows, 0 overlap); no CI result yet |
| B2 service role cannot record results | ✅ implemented on the branch — service context is detected from the SQL role (`current_setting('role')`), not the JWT; user checks are not relaxed |
| B3 group rows cannot record results | ✅ implemented on the branch — LEFT JOIN + vertical from `line_groups` + the 0097 `monolith` fallback |
| B4 no transition guard | ✅ implemented on the branch — only still-`pending` rows can be recorded; finished rows return `recorded=false` with no duplicate audit |
| B5 one failure is permanently terminal | ✅ implemented on the branch — transient/permanent split + exponential backoff (1 second × 2^n, capped at 5 minutes) + a 5-attempt bound |
| B6 no cron | ⏸ deliberately not added — Phase C work awaiting §8 questions 1, 2, 4 |
| B7 blind tests | ✅ new tests hit real Postgres (pgTAP) plus tests proving the sender is wired to the RPC |
| B8 `handler_error` counted as success | 🟡 fixed in 0200 on local branch `claude/line-p009-ingest-retry` — round 3 at 1902a8eea with RED/GREEN/mutant evidence; awaiting cross-vendor review; not merged, not pushed, not deployed; may overlap line-trust's reserved `0175` (decision 7) |
| B9 `line-login` without state/nonce | 🔴 not fixed — in P1; may overlap line-trust's reserved `0176` |
| B10 client roles hold write and TRUNCATE privileges on LINE tables | 🟡 fixed on the branch in 0198 — independent code-and-evidence review passed at 87930836a (no reviewer rerun); fail-closed test and CI registration built; source/evidence accepted with limits; CI not run; not deployed |
| B11 failures recorded with a whitespace-only error detail | ✅ implemented in 0197; local RED/GREEN passes; cross-vendor acceptance passed at 00651a6cd |
| B12 client roles can EXECUTE SECURITY DEFINER writers | 🟡 fixed on the branch in 0199 — local RED-A/RED-B/GREEN passes; awaiting independent review; deploy blocked on the ops caller register and manufacturing sign-off; production exposure unknown |
| B13 the postback branch turns a transient error into an ignored result | 🔴 found in the P0-9 review on 2 Oct 2026, not fixed — needs a handler change in `0107` and the owner's decision |

**Correction of earlier information:** earlier editions attributed the missing Python runs to an unavailable interpreter. That explanation was environment-specific and cannot describe every host or sandbox. The attempt-3 context records Python 3.14.2 with pytest, hypothesis and psycopg and actual suite execution; it does not establish why the earlier session could not run Python.

**Not yet proven (do not overstate):** CI · results on a stack identical to CI in every service · any real Edge Function or LINE API run · `X-Line-Retry-Key` behaviour on the LINE side (moved to gate G-C1 before real sending — §9.2) — the database fence alone does not stop two lease-expired workers from both reaching LINE

**Additional defects found and fixed during Phase A:** `next_attempt_at` and `sent_at` were assigned `timezone('utc', now())` (a timestamp without time zone) into `timestamptz` columns, so in Thailand the backoff collapsed to zero and send times were recorded ~7 hours early — fixed in 0195/0196 with tests under `Asia/Bangkok`

---

**Evidence follow-up (30 September 2026, base 3bdd6f3e):** the new validator tests first gave 22 pass / 11 fail against the old implementation, then 33/33 with the fix. `docs/governance/evidence/line-p010-evidence-followup-2026-09-30/` records the new local run; old bundles are immutable. `fullPgTapPass` is explicitly pgTAP-only; compatibility aliases `fullPass/pass` have the same scope, and `workflowPass=null` means not evaluated. `provenanceComplete` checks supplied field formats, not external authenticity. The local runner supplies provenance; the unchanged Actions workflow does not yet supply a source digest. A separate Codex agent reported code/evidence review of 3bdd6f3e and the follow-up patch; this is not a database rerun or cross-vendor acceptance. The decision packet `docs/governance/line-p010-integration-b12-followup.en.md` records the 0170-after-0191 grant risk and B12 caller decisions. Neither containment nor B12 is fixed by this delivery.

**Actions provenance and local acceptance:** E1/E2/E3 at `e7e2c52ce169b07978802c026255f08f71221d39` received accept-with-limits from a separate read-only Codex reviewer: 93 evidence checksums, 252 source rows, captured 33/33 unit tests and 72 Python tests were checked from Git. This accepts source and recorded local evidence, not a reviewer database rerun or cross-vendor/production acceptance. The next patch captures a deterministic allowlisted source manifest before database startup, passes its digest through GITHUB_ENV and uploads it with the migration count. Workflow wiring is validated locally; no Actions result exists. Earlier paragraphs record the pre-wiring state. `docs/governance/line-rpc-caller-register.en.md` is ready for ops completion; external callers and the manufacturing/integration owner remain unconfirmed. Containment, B12 and P0-9 remain open.

### Current acceptance boundaries

This table is the current status authority. Earlier dated run paragraphs preserve submission-time states. E1/E2/E3 acceptance is reported in the committed REVIEW.txt at f8fc5b632; it is not an independent database execution certificate.

| Layer | Current status | Remaining work |
| --- | --- | --- |
| Source and recorded local evidence | ACCEPT WITH LIMITS for E1/E2/E3; Actions source wiring reviewed | Preserve scope of reviewer findings |
| Independent database rerun / cross-vendor follow-up | NOT COMPLETE | Separate reviewer execution and verdict |
| Local behavior | LINE 107/133/28 and Python 72 pass in recorded runs; containment fails | Resolve integrated factory dependency without weakening assertions |
| GitHub Actions | RUN on push for PR #133: DB Verify at a97c3c847 passed the five LINE suites and failed the full verdict (containment); Trust Kernel Verify at 48b72d4c7 passed claim linters and `trust_kernel_containment`, and failed on `repair_phase0_containment`, shadow E2E (secrets not provisioned) and the final gate; excerpt in `docs/governance/evidence/line-p012b-round2-2026-10-02/01-github-actions-excerpt.txt` | Main-branch `pull_request` workflows wait for the merge-conflict resolution; the DB workflow still has no Python suites |
| Phase A / production | EVIDENCE_INCOMPLETE / NOT AUTHORIZED | P0-9 and B12 review, integration and complete acceptance; separate production and sending gates |

Owner and ops handoff fields are in [the caller register](governance/line-rpc-caller-register.en.md). Current approval permits status reconciliation and handoff preparation; exact B12 grants and architecture decisions remain pending inputs. No new migration or push is authorized by this status table.

## 1. Problem Statement

MONOLITH uses LINE as its main channel to customers and field technicians (Thai customers live on LINE). The inbound side (webhook, groups, acceptance cards) is fully wired with strong guards, but the outbound side to customers cannot yet be switched on: the sender (`line-outbound-sender`) has serious defects that would, if run for real, resend every message to customers in an endless loop, and nothing in the repo schedules it (no cron), while several nightly sweeps enqueue customer messages every day. If these gaps are not closed before customer messaging expands, the risk is spamming customer groups and immediate damage to brand trust.

---

## 2. Verified Status Matrix

> B1–B9 record the 26 July / 1 August 2026 audit before Phase A; B10–B12 are findings from the 30 September 2026 evidence runs and catalog capture. See §0 for post-fix status.

### 2.1 ✅ Actually working — fully wired, with callers on the live path

| Capability | Evidence | Verification |
|---|---|---|
| **Inbound:** `line-webhook` → `rpc_ingest_line_webhook` verifies HMAC, deduplicates via `webhook_event_id` UNIQUE, separates group / 1:1 | `supabase/functions/line-webhook/index.ts:87-127`, `00000000000022_line_oa_ingest_webhook.sql`, HMAC `00000000000010` | confirmed 1 Aug 2026 |
| **Group flows:** router `fn_line_handle_group_event` — `#ผูก` (bind), `#ปัญหา` (issue), photos → capture, Flex acceptance card | `0097_line_group_bot_flows.sql:101` | earlier audit + insert paths confirmed 26 Jul |
| **Customer-group guard:** `fn_line_guard_customer_group` fails closed — templates not marked `audience='customer'` cannot enter a customer group | `0095_line_groups_identity.sql:102,145` + re-wire `0101_scrutiny3_fixes.sql:16` | confirmed 1 Aug 2026 |
| **Staff notifications:** `notification-retry-worker` + 1-minute cron, `FOR UPDATE SKIP LOCKED` claim, 5-step exponential backoff, dead-letter | cron `0089_cron_schedules.sql:87`, claim v3 `0084` | cron confirmed 26 Jul |
| **Staff LINE Login + binding + consent:** `line-login` → `rpc_line_login_upsert` stores `consent_at` at binding | `0105_staff_bind_login.sql:86-92` | confirmed 26 Jul |
| **Token rotation:** cron `wf-line-token-refresh` three times a month | `0154_line_token_rotation.sql:77` | confirmed 26 Jul |
| **Enqueueing of outbound messages** (from webhook flows + nightly sweeps) — ~60 direct insert sites | `0097:140`, `0098:93`, `0100:513`, `0101`, `0107`, `0111`, `0114:94`, `0127`, `0134`, `0136`, `0143` | confirmed 26 Jul |

### 2.2 🔴 Code present and tests passing, but not usable for real (verified defects)

| # | Defect | Evidence |
|---|---|---|
| B1 | **Queue pickup without a lock** — `claimPending` was a plain `SELECT ... status='pending' ... limit` with no `FOR UPDATE SKIP LOCKED` and no claim marker → overlapping runs send duplicates | `line-outbound-sender/index.ts:589-602` (pre-fix code — replaced on the branch) |
| B2 | **Result recording rejected for every row** — the sender calls `rpc_record_line_send_result` with the service role, but the RPC checks `is_governance_role() or has_site_access()`, which reads roles from JWT `app_metadata` (absent for the service role → `[]`), and EXECUTE is granted only to `authenticated` → the send succeeds on LINE but cannot be recorded → the row stays `pending` → **every row is resent in an endless loop** | `00000000000041:162`, `00000000000000_c12_foundation.sql:36`, `00000000000041:253-258`, sender side `index.ts:576-584, 664-669` (pre-fix) |
| B3 | **Group rows can never record a result** — the RPC INNER JOINs `line_oa_conversations`, but group rows (from 0097 onward) have a NULL `conversation_id` → always "not found" | `00000000000041:143-148` versus `0097:140` |
| B4 | **No transition guard** — `v_current_status` is loaded and locked but never checked → a `sent` row can be flipped to `failed`, recorded twice, audited twice | `00000000000041:143` (load), `:194-210` (unchecked update) |
| B5 | **A single failed send is permanently terminal** — `failed` is a final state and no migration ever moves it back to `pending` | `00000000000041:179-199` + grep across migrations |
| B6 | **No cron in the repo invokes the customer sender** — the crons that exist are notification-retry/sla/digest (`0089:87-96`), media-fetch (`0099:140`), token refresh (`0154:77`) → customer messages from nightly sweeps (`0114`, `0116`, `0140`) pile up in the queue | grep `cron.schedule` across migrations |
| B7 | **Tests blind to B1–B4** — the integration test injects a fully fake dependency set and never touches real Postgres or real permissions | `tests/line-oa-commerce/ts/senderClaimAndRecord.integration.test.ts:43` |
| B8 | **A failed handler is counted as processed and the event is lost forever** — `fn_line_handle_group_event` catches the exception and returns `'handler_error:...'`, but the ingest skip list does not include that prefix → the inbound row, audit entry and `events_processed` count are written as normal, and because the inbound row now exists, a LINE redelivery is dropped as a duplicate → the failed event disappears permanently while being reported as success (first found in the 31 Jul 2026 research on branch `codex/line-trust-wave1-main`, confirmed on this branch on 1 Aug — both branches descend from the same base, so they share the defect) | `0097:281` (return), `0097:437-438` (skip list), `0097:454` (counts processed), `0097:429-433` (dedupe) |
| B9 | **Staff login uses no OAuth state / OIDC nonce** — `line-login` accepts only `{code, redirect_uri, bind_token?}` → callback swap / replay risk (first-time binding is mitigated by an office-issued `bind_token`, but later logins have no such check) | `supabase/functions/line-login/index.ts:2,9` |
| B10 | **Client-facing roles retain direct write privileges on all eight LINE tables** — attempt-3 failures show INSERT/UPDATE/DELETE/TRUNCATE for seven tables; `line_oa_audit_log` retains INSERT/TRUNCATE because 0005 already revokes UPDATE/DELETE. This is an observed grant gap on the reconstructed image/chain, not proof of exploitation or of its sole cause. RLS does not govern TRUNCATE. No remote truncation path is demonstrated by this evidence. Shared-stack TRUNCATE findings remain reported-only (no raw output here). | `test_clients_hold_no_write_grants` in attempt-3 `07-pytest-output.txt`; `00000000000005_line_oa_audit_immutability.sql:67-80` |
| B11 | **Whitespace-only failure details remain unreadable** — `rpc_record_line_send_result` uses `btrim()`, which does not remove carriage return, newline or tab with its default character set. Hypothesis produced detail `\r` and observed the same stored value, violating the non-empty-after-trimming assertion. The earlier probe skip hid this test failure. | `0196_line_outbound_timezone_safe_sent_at.sql:162`; `00000000000041_line_oa_record_send_result.sql:180`; `test_failure_handling` in attempt-3 `07-pytest-output.txt` |
| B12 | **Client roles can EXECUTE SECURITY DEFINER writers** — platform default ACLs grant EXECUTE on new functions to `anon`, `authenticated` and `service_role`, while migrations revoke EXECUTE only from PUBLIC. On the reconstructed chain `anon` can EXECUTE 18 of the 20 DEFINER routines that write `line_oa_*` tables, including `fn_prod_curated`, which queues customer-group pushes with no caller check. A DEFINER routine runs as its owner, so 0198 does not close this path. Whether production exposes these functions through PostgREST is unknown. | catalog `line-p010-catalog-2026-09-30/08-analysis.txt` section E; `0107_factory_group_milestones.sql:50-61`; survey `docs/governance/line-p010-execute-survey.en.md` |
| B13 | **The postback branch hides transient failures** — `fn_line_handle_group_event` catches every error inside the postback block and returns `postback_malformed_ignored`; that result is not on the ingest skip list, so the event is stored and counted as processed and a redelivery is a duplicate → a customer's approve/reject tap can be lost when, for example, a lock timeout hits `installation_approvals ... for update` (found by the independent P0-9 review, 2 Oct 2026; no test reproduces it yet) | `0107:402-416` |

### 2.3 ⚫ Complete code with passing tests but zero callers (fully dead) — keep-or-remove decision pending

| Subsystem | Defined at | Caller check |
|---|---|---|
| **Autonomy gate + ≤200-character brand voice** (`rpc_send_line_outbound`) | `00000000000040:131` | **0 callers** — referenced only in tests / spec / comments; every real send path inserts directly into the queue, so it has never governed a single real message |
| **Ordering** (`rpc_create_line_order`, `line_oa_orders`) | `00000000000050:397` | 0 callers outside tests/spec |
| **Forecast sync** (`rpc_sync_line_forecast`) | `00000000000060:88` | 0 callers outside tests/spec |
| **R-03 identity merge** (`rpc_evaluate_identity_merge_candidate`) | `00000000000021:96` | 0 callers outside tests/spec |
| **24-hour auto-close** (session timeout sweep) | `00000000000061:50` | the `cron.schedule` sits inside a comment — never actually scheduled |
| **TCCK vertical** (multi-vertical food) | spread across the schema (`vertical_context`) | no TCCK-side flow is wired (from the earlier audit) |

### 2.4 📝 Spec only — no code yet

- **Customer consent (PDPA):** customers have no consent field at all, and no send path checks consent before sending
- **The consent that exists is staff-only:** `identity_binding.consent_at` (`0088:10`), deliberately left as "Phase 1.8 — never backfill consent that never happened" (`0088:14-15`)
- **Template admin UI:** templates are currently seeded by migration only
- **Parts of guardrails G4/G5/G7/G12:** see `docs/LINE-Architecture-System-Complete.md` §6

---

## 3. Goals

1. **Zero duplicate messages:** switch on the customer sender only after proving with tests against real Postgres that overlapping runs or mid-run failures cause no duplicate sends
2. **Every message reaches an outcome:** every queue row ends as `sent` or `failed` with a reason — nothing stays `pending` beyond SLA, and transient failures are retried
3. **Spec matches reality:** every subsystem in `.kiro/specs/line-oa-commerce/tasks.md` is marked with its real status (live / dead / removed) — no "✅ 20/20" that does not hold for the live path
4. **PDPA has an owner:** a written owner decision on whether a customer consent gate is required before expansion, or the temporary risk is accepted
5. **Ops can verify:** a clear list of the crons and deployments that must exist in the real environment (building on `docs/OPS-RUNBOOK-Wave2.md`)

## 4. Non-Goals

1. **No free-text / LLM replies to customers** — the template-only iron rule stays (fix the wiring, never relax the criteria)
2. **No revival of ordering/forecast/TCCK in this phase** — awaiting the keep-or-remove decision (§8 question 5); no silent wiring
3. **No template admin UI in this phase** — awaiting a decision (§8 question 6)
4. **No changes to the manufacturing OS — a separate system (system boundary):** no code, migration or document of the manufacturing OS is changed, even within the same product repo or branch — finding that the two worktrees share one repo does not widen the scope of this work
5. **No other checkout or worktree is touched (checkout boundary):** including `codex/line-trust-wave1-main` — branch integration may happen only after the owner approves the §8 question 7 plan
6. **No relaxation of user-level RLS or permissions** — fixing B2 means teaching the system to recognise the service context, not removing human checks
7. **Deployment notifications are outside Phase A:** governance-repository Slack removal and any future LINE deployment notifier are separate work. They do not change this product branch, its manufacturing OS boundary or Phase A acceptance criteria.

---

## 5. User Stories

**Customer (message recipient):**

- As a customer, I receive each repair-status message once per event, so I do not feel spammed
- As a customer, I receive only messages appropriate for the customer group, with no internal messages leaking — already in place (guard 0095)

**Technician / team lead (internal group):**

- As a technician, when I post a photo or `#ปัญหา` (issue) in the group, the system captures it as capture/issue — already in place (0097)

**Office staff:**

- As a staff member, I receive work notifications over LINE with correct backoff — already in place (0084/0089)

**Owner (Dave):**

- As the owner, I know how every customer message row ended (sent/failed + reason + audit) and can trust that nothing was sent twice
- As the owner, I see the system's real status, not the status claimed by documents that say it is finished

---

## 6. Requirements

### P0 — required before switching on real customer messaging (fixes B1–B8, B10, B11; B12 proposed)

| Req | Description | Acceptance criteria (tests against real Postgres, RED first) | Status (1.15) |
|---|---|---|---|
| P0-1 | **Atomic queue claim:** add `claimed_at/claimed_by` + `rpc_claim_line_outbound_batch` — `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING` (no new enum value, to avoid the `ALTER TYPE` limitation and the impact on status readers) | Two clients claiming at once → no duplicated rows; a claim stuck past the timeout → re-claimable | ✅ implemented (0193 + sender wiring) + two-client evidence on an ephemeral stack (attempts 2–3); CI awaits step 5 |
| P0-2 | **Service context can record results:** grant + teach `rpc_record_line_send_result` to recognise the service role as a system actor without relaxing user role checks | Called with the service role → recorded; a user without a role → rejected as before | ✅ implemented + pgTAP evidence (0193); since 0199 the user recording path is withdrawn: recording is service-only by owner decision |
| P0-3 | **Group rows can record results:** LEFT JOIN + take vertical/audit data from `line_groups` when `conversation_id` is NULL | A group row → recordResult succeeds with a complete audit | ✅ implemented + evidence (0193 + 0196 fallback) |
| P0-4 | **Transition guard:** results can be recorded only for rows still `pending`; finished rows → `recorded=false` no-op | Duplicate recording / a `sent`→`failed` flip → rejected, no duplicate audit | ✅ implemented + evidence (0193 + 0194 fencing) |
| P0-5 | **LINE-level dedupe:** set `X-Line-Retry-Key` = outbound id on push | Phase A (our side): every push carries the header = outbound id, reply does not; a 409 carrying `x-line-accepted-request-id` → treated as sent, not retried; a 409 without that header → permanent · Phase C (LINE side): gate G-C1 in §9.2 | ✅ our side has unit-test evidence (`senderRetryKey.unit.test.ts`, `senderFailureClassification.unit.test.ts:84`) · the LINE side moved to gate G-C1, not a Phase A closure criterion |
| P0-6 | **Bounded retry for transient failures** (following the 0084 claim v3 pattern) + dead-letter | LINE answers 5xx → retried with backoff; over the bound → `failed` with a reason | ✅ retry and readable-detail implementation (0194–0197); 107/107 pgTAP passes; P0-11 cross-vendor acceptance passed at 00651a6cd |
| P0-7 | **Decide on the autonomy gate (§8 question 3) and act on it:** wire it live or remove it + correct `tasks.md:157` | No code left that claims to govern but does not | ⏸ awaiting decision 3 |
| P0-8 | **Written decisions on cron + consent (§8 questions 1, 2, 4)** before switching on real sending | The runbook lists the required crons; the consent decision is documented | ⏸ awaiting decisions 1, 2, 4 |
| P0-9 | **A failed handler must not count as processed (B8):** for `handler_error`, events whose handler failed need our own retry state (retry rows + a sweep like the 0084 claim v3) — never rely on LINE redelivery, which LINE does not guarantee — not counted as processed and never dropped by dedupe | Simulate a handler failure → the event enters an internal retry queue and is reprocessed until success or the bound → dead-letter + audit; no false success | 🟡 built in 0200 on local branch `claude/line-p009-ingest-retry` (round 3 at 1902a8eea with RED/GREEN/mutant evidence) — awaiting cross-vendor review; may overlap line-trust's reserved `0175`, decision 7 still open |
| P0-10 | **Close direct-write grants (B10):** revoke INSERT, UPDATE, DELETE and TRUNCATE on the eight `line_oa_*` tables from `anon`, `authenticated` and `service_role` (owner-approved scope; PUBLIC holds no such grant); preserve SELECT, EXECUTE and every other privilege | Criteria in §9.1 step 1b | 🟡 0198 passed independent code-and-evidence review at 87930836a (no reviewer rerun); follow-up source/evidence accepted with limits; database rerun and cross-vendor acceptance outstanding; CI not run |
| P0-11 | **Failures need a nonblank reason (B11):** use the existing placeholder for Python-whitespace-only details | Unchanged failure property passes; 29 whitespace codepoints, mixed input, readable text and token scrubbing covered by 37 added pgTAP cases | ✅ implemented in 0197; cross-vendor acceptance passed at 00651a6cd |
| P0-12 | **Restrict EXECUTE on SECURITY DEFINER writers (B12)** to the owner-approved exact-identity matrix | Matrix and plan in `docs/governance/line-b12-permission-matrix.en.md`: every DENY cell is refused at the function ACL, kept paths still work by their data, and the migration fails closed on residual rights, lost keeps and unclassified overloads | 🟡 built in 0199 with RED-A/RED-B/GREEN evidence; tests strengthened in round 2 (RED-A/mutants/GREEN); LINE suites pass on GitHub Actions at a97c3c847; awaiting independent review; deploy blocked on ops and manufacturing answers |

### P1 — should follow soon

- **B9 — make staff login use state and nonce:** change `line-login` to bind a server-issued state, single use, short expiry — AC: replayed `code` or callback swap is rejected, normal login passes (P1 rather than P0 because it is the staff login path, not the customer send path; may overlap line-trust's reserved `0176` identity step-up)
- **Customer consent gate before sending** (if §8 question 4 = required): a customer-side consent field + a check in claim/send
- **Human approval before sending to customers** (if §8 question 2 = required)
- **Metrics/alerts:** `pending` rows beyond SLA, `failed` rate, dead-letter
- **LINE quota/cost awareness:** push/multicast consume quota (reply does not) — a monthly counter plus an alert before hitting the cap

> **Interim SLA definition (until ops sets the real one):** a `pending` row must be picked up within 15 minutes of the cron being enabled — wherever this document says "SLA", use this value for now

### P2 — future (not before a decision)

- Revive or remove ordering / forecast / R-03 / auto-close / TCCK (§8 question 5)
- Template admin UI (§8 question 6)

---

## 7. Success Metrics

- **Leading (immediate):** duplicate-send rate = 0 in a concurrent-claim load test; 100% of queue rows end `sent/failed` within SLA; RED→GREEN tests for every AC
- **Lagging (30–90 days):** no customer reports of duplicate messages; dead-letter rows below 1% per week; spec-versus-reality mismatches = 0

---

## 8. Open questions — awaiting Dave's decision (never to be assumed)

| # | Question | Type | Blocks |
|---|---|---|---|
| 1 | Does the real environment have a cron invoking `line-outbound-sender`? (The repo definitely has none — only ops can confirm) | Ops | P0-8; if one exists, defects B1–B5 are live right now, because the fixes are not deployed |
| 2 | Is human approval required before sending to real customers? | Business | P1 |
| 3 | Autonomy gate + brand voice: wire it live or formally retire it + correct `tasks.md` | Business/architecture | P0-7 |
| 4 | Is sending to customers without a consent gate acceptable temporarily, or is it required before expansion (PDPA)? | Legal/business | P0-8, P1 |
| 5 | Fully dead subsystems (§2.3): keep for later wiring, or remove + correct the spec | Business | P2 |
| 6 | Is an admin UI needed so staff can manage templates themselves? | Business | P2 |
| 7 | **Branch integration plan:** this branch (`codex/repair-intelligence-phase0-trust`) and `codex/line-trust-wave1-main` are branches of the same product repo — approve the integration order, choose the canonical tenant model, decide ownership of the work that may overlap (P0-1–P0-6 versus `0178`, P0-9 versus `0175`, B9 versus `0176`), and decide who resolves the conflicts in manufacturing OS files, based on the findings below | Architecture/business | P0-9, pushing/merging both branches, Phase C |

### 8.1 Branch integration findings (question 7)

> Checked on 2026-09-30 04:52 UTC from local git refs only (no fetch, no checkout, no ref change, no other worktree touched) — raw output: `docs/governance/evidence/line-phase-a-2026-09-30/06-git-integration-check.txt` · these findings only inform the decision; finding that this is one repo does **not** authorise integrating the branches or widening scope into the manufacturing OS

| Topic | Finding |
|---|---|
| Repo | the worktrees of this branch and of line-trust use the same `.git` of `determined-williams` and the same origin `github.com/indetailsgroup-hue/monolith-workspace` — the governance root `determined-williams (2)` remains a separate repository |
| SHAs checked | this branch `5aa52315` · line-trust `69c87930` · merge-base `dd1119af` (18 Jul 2026) |
| Commits after the merge-base | this branch 65 (at `5aa52315`) · line-trust 129 (at `69c87930`) — this branch's figure grows with every documentation commit |
| Against `origin/main` | local ref `57b69513` (1 Aug 2026 — not fetched): this branch 65 ahead / 118 behind · line-trust 47 ahead / 36 behind |
| Direct migration number collisions | none — this branch has `0180`–`0196`, line-trust has `0171`–`0173` (plus `0163`, `0170` from main) |
| Migrations this branch lacks | `0163_storage_hash_verdict_semantics.sql` and `0170_factory_jobs_list_real_fields.sql` (already on main) |
| Trust Kernel `0180`–`0188` | exist only on this branch — not on main and not on line-trust |
| In-memory trial merge (`git merge-tree`) | 7 conflicting files — 4 shared infrastructure files: `.github/workflows/db-verify.yml`, `.gitignore`, `package.json`, `package-lock.json` · 3 manufacturing OS factory files: `server/src/api/routes/factory.ts`, `supabase/functions/factory-api/index.ts`, `supabase/functions/factory-api/index.test.ts` — no LINE runtime file |
| Duplicate-name git refs | two exist: `refs/heads/codex/repair-intelligence-phase0-trust (1)` and `refs/remotes/origin/main (1)` — git warns and skips them; the cause is unconfirmed (presumed to be a file-sync tool); not deleted, the repo owner must remove them before integrating |
| LINE runtime | line-trust does not modify `line-outbound-sender`, `line-webhook`, `line-login` or `_shared/line-oa` |

**Duplicated or possibly overlapping behaviour**

| Topic | Type | This branch | line-trust | Integration risk |
|---|---|---|---|---|
| Tenant / organization / site / membership model | already duplicated — code on both sides | `monolith_tenant`, `monolith_organization`, `monolith_site`, `monolith_membership*`, `verified_action_context` (0180, 0189) | `tenants`, `organizations`, `sites`, `tenant_memberships`, `access_grants`, `auth_subjects`, `project_parties` (0171) | two sources of truth for tenancy and permissions; table names do not collide but the data would diverge; a canonical model must be chosen before integrating |
| Authority of service callers | already duplicated — code on both sides | checks the SQL role `current_setting('role')` = `service_role` (0193) | `service_principals` table + `rpc_authorize_business_action` (0173) | two mechanisms for granting service authority — decide whether the sender must pass the 0173 policy decision |
| LINE outbound queue | may overlap by plan — the other side is still a reservation | claim, fencing, backoff on `line_oa_outbound_messages` (0193–0196) | reserves `0178` = atomic outbox (no code yet) | if line-trust later builds a new outbox there will be two queue designs; and 0194 drops the 3-argument `rpc_record_line_send_result` that line-trust's schema still has |
| Failed ingest lost (B8) | may overlap by plan — code on this side only (0200, local branch, not merged) | P0-9 built in 0200 on `claude/line-p009-ingest-retry`: `line_oa_inbound_retry` + `rpc_line_inbound_retry_sweep` | reserves `0175` = unified ingress with processing state, retry, dead letter | building both would produce two ingest retry mechanisms — needs a single owner |
| Staff login (B9) | may overlap by plan — no code on either side yet | P1 not built | reserves `0176` = identity binding + step-up | should be done on one side only |
| Shared LINE tables | compatibility must be proven | the sender reads `line_groups.vertical_context` and `line_oa_channels.channel_access_token_ref` | 0171/0172 add `tenant_id` (nullable, FK NOT VALID) to `line_oa_channels`, and `tenant_id`, `canonical_site_id` + a constraint to `line_groups` | probably compatible because columns are only added, but unproven — this branch's pgTAP must run on the integrated schema |
| Migration number order | ordering risk | `0180`–`0196` | `0171`–`0173` and reserves `0174`–`0179` | if any environment applies this branch's `0180`+ first and line-trust's `0174`–`0179` arrive later, they would apply out of order — requires a line-trust amendment, or a ban on applying `0180`+ until the order is agreed |

---

## 9. Phasing

1. **Phase A — 🟡 not closed:** `EVIDENCE_INCOMPLETE`; P0-9 is built in 0200 on a local branch and awaits cross-vendor review, P0-10 passed code/evidence review at 87930836a; its hardening source/evidence follow-up has bounded acceptance; independent database rerun and cross-vendor acceptance remain outstanding, P0-11 is accepted at 00651a6cd, B12 is open, and CI evidence is outstanding (§9.1).
2. **Phase B (after decision 3):** P0-7 — wire or remove the autonomy gate + correct the spec
3. **Phase C (after decisions 1, 2, 4 and after Phase A closes):** push + deploy the Phase A work, pass the gates in §9.2, register the real cron, add the consent gate and human approval if decided → switch on customer messaging
4. **Phase D (after decisions 5, 6):** clean up the dead subsystems + admin UI

**Exit conditions for every phase:** real test output attached, no claims accepted on assertion; never log tokens; never relax security rules to make something pass; every wave passes cross-vendor review before acceptance

### 9.1 Proposed next steps to close Phase A (awaiting approval)

> **Prohibited in every step:** enabling any cron, deploying, sending messages to real customers, pushing without the owner's approval, or changing the manufacturing OS — any new retry/sweep function is callable only from tests or by hand until Phase C
>
> **Accepted evidence format:** raw output in the repo with the SHA of the commit tested, the commands used, UTC time, exit codes and `SHA256SUMS` — results that are only "reported" do not count as closure evidence
>
> **Independently re-runnable (added after the 2026-09-30 bundle):** the wrapper and every command run from the repository root with relative paths (for example `\ir` in psql), with no absolute path from the machine that ran them; record the database baseline before testing — the applied migrations (`supabase_migrations.schema_migrations`) and a schema fingerprint (sha256 of `pg_dump --schema-only`) — or build the database from zero with the migration chain of the SHA under test; record the before/after checks stating exactly what was checked, and claim results only within the scope checked

> **Secret-scan gate:** before committing evidence, check output files for passwords, JWTs and password-bearing DSNs. Findings or scanner errors must stop the commit; printing a result is insufficient. The P0-10 bundles carry their gate scripts; the P0-10 implementation commit also carries a wrapper that runs the gate before committing and a transcript of that run. That the commit was actually conditional on the gate remains reported evidence of execution; the wrapper code and the recorded gated tree can be checked independently. The follow-up gate allows exactly one known non-secret value: the Supabase CLI's documented local default DSN already present in `db-verify.yml`.

#### Step 1 — close the outstanding test evidence for P0-1 to P0-6 (can start now, independent of the decisions)

- **Status (1.15):** local LINE pgTAP 107/133/28/82/27 and Python 72/72 pass, with claim race 10+10 and zero overlap (round-2 GREEN). All fourteen suites ran; full pgTAP remains failed because containment is incomplete. On GitHub Actions the five LINE suites passed at a97c3c847 (run 36748427203). Step 1 is not closed.

- Run `tests/line-oa-commerce/concurrency/claim-race.mjs` against an ephemeral Postgres created from zero, not the shared stack
- **Acceptance criteria:** two connections claim the same set of pending rows at once → overlapping rows = 0 and the union of claimed rows = the total row count; fixture cleanup verifies zero remaining outbound rows and conversations created by this harness; this does not certify the whole database
- **Required Python suites:** every file in `tests/line-oa-commerce/py/` that references `rpc_record_line_send_result`, `rpc_claim_line_outbound_batch` or `line_oa_outbound_messages` — 12 files as checked on 30 Sep 2026: `test_access_control_config_smoke.py`, `test_ai_action_audit_property.py`, `test_failure_handling_property.py`, `test_idempotent_processing_property.py`, `test_outbound_status_recording_property.py`, `test_reply_push_fallback_property.py`, `test_rls_read_scoping_property.py`, `test_schema_structure_smoke.py`, `test_secret_non_exposure_property.py`, `test_signature_verification_property.py`, `test_strict_consistency_property.py`, `test_unauthorized_mutation_denial_property.py`
- **Acceptance criteria:** all 12 files must actually run and pass — if a required suite is skipped for any reason (including environmental reasons), the reason may be recorded but it does not count as passing; the evidence status stays `EVIDENCE_INCOMPLETE` and step 5 cannot close

#### Step 1b — close B10 and B11 (P0-10 reviewed, follow-up source/evidence accepted with limits; database rerun and cross-vendor acceptance outstanding; P0-11 accepted)

**B10 / P0-10 — read-only impact assessment (30 Sep 2026, repository source only; kept as the pre-approval record; superseded where the catalog evidence below differs):**

- **Tables and proposed privileges:** INSERT, UPDATE, DELETE and TRUNCATE on `line_oa_channels`, `line_oa_conversations`, `line_oa_inbound_messages`, `line_oa_outbound_messages`, `line_oa_customer_identity`, `line_oa_message_templates`, `line_oa_orders` and `line_oa_audit_log`. Preserve existing SELECT grants; this is not a new certification of read isolation.
- **Client roles and PUBLIC:** the handoff reports no direct PostgREST writer found in `supabase/functions`, `src` or `server`. Treat that source search as preliminary; inspect dynamic callers, inherited grants and effective privileges before concluding compatibility. PUBLIC is a grant target, not a login role.
- **Service role, assessed separately:** the sender reads three tables in the `line_oa_*` set (`line_oa_conversations`, `line_oa_channels`, `line_oa_message_templates` at `line-outbound-sender/index.ts:770-835`). It also reads other resources, including `line_groups`, outside this eight-table proposal. Proposed write revocation preserves SELECT; ops must identify external service-key writers before approval. RLS bypass does not replace ordinary table privilege checks.
- **Database writers:** the handoff reports an approximate scan of 33 writers marked `SECURITY DEFINER`. That alone does not prove revocation is safe: verify effective function definitions, owners, their privileges, EXECUTE grants and call chains on the reconstructed schema. The scan is not a verified complete inventory.
- **Fixtures:** the inspected pgTAP and `test_rls_read_scoping_property.py` fixtures use the session owner (`postgres`); role changes wrap RPC calls and are reset. That reduces the apparent fixture risk, but all required tests must still run after any privilege change.
- **Integration:** the handoff reports that line-trust 0171–0173 do not alter these table grants. Recheck the chosen integration SHAs and migration-number occupancy immediately before implementation. `0198` is a proposed number; 0197 is now used by P0-11. 0198 is not an approved reservation.
- **Optional audit safeguard, requires a decision:** a statement-level TRUNCATE trigger can reject ordinary TRUNCATE while enabled. It cannot guarantee append-only history against an owner or superuser who can disable/drop the trigger; that requires separate operational controls.

**Catalog evidence and decisions (30 Sep 2026):** the catalog capture (da252d18a) replaces the approximate writer count above with 20 verified DEFINER identities owned by the table owner, and shows that PUBLIC holds no write grant. Ops reported, through the owner, that no external tool writes these tables with a service key; this is an attestation, not a verification. The owner approved the scope below with `service_role` included.

**Migration (code/evidence reviewed at 87930836a; follow-up source/evidence accepted with limits; rerun and cross-vendor acceptance outstanding):** `supabase/migrations/0198_line_oa_revoke_client_write_grants.sql` revokes INSERT, UPDATE, DELETE and TRUNCATE on the eight tables from `anon`, `authenticated` and `service_role` where those roles exist (0005 pattern), without CASCADE. SELECT, EXECUTE, REFERENCES, TRIGGER, MAINTAIN, ownership, membership and default privileges are unchanged. It fails closed: if any of the three roles still holds an effective table or column write privilege afterwards, it raises and rolls back.

**P0-10 acceptance criteria and evidence:** the new suite `supabase/tests/line_oa_client_write_revoke.sql` (133 assertions) checks effective privileges for 3 roles × 8 tables × 4 privileges plus column level. It makes 96 real write attempts with SET LOCAL ROLE that must fail with 42501 and the exact message "permission denied for table", and checks that schema USAGE is kept, so the denial is not schema-level. It also checks service-role SELECT on the three sender tables and the DEFINER paths by their data: webhook ingress, the welcome trigger, `fn_prod_curated`, claim and record. RED and GREEN results are in §0. 0198 passed independent code-and-evidence review at 87930836a; the reviewer did not rerun the database.

**P0-10 follow-up (built; bounded source/evidence acceptance):** the fail-closed suite now has 28 assertions. It executes the real 0198 inside savepoints and checks five residual cases: anon inherited INSERT/UPDATE, anon column UPDATE from a second grantor, authenticated inherited DELETE, service_role inherited TRUNCATE, and anon column INSERT from a second grantor. Membership inheritance is explicit. It checks the targeted 42501 error and restoration of direct grants after the harness rollback; table/column ACLs and membership options/grantor are compared. This proves this transaction/savepoint boundary, not every possible migration runner. The strict TAP parser requires a complete ordered plan, exit zero and no failure/skip/TODO; stderr and per-suite verdicts are uploaded. The post-0198 check requires eight tables and three roles. Commit gates hash staged files and stop on tree/hash errors. Still required: independent database rerun and cross-vendor acceptance, full CI after authorized push, resolution of the separate containment dependency, and a separate production catalog gate before deploy.

**B12 / P0-12 (0199, built, awaiting independent review):** the matrix, the owner decisions and the evidence are in §0 and `docs/governance/line-b12-permission-matrix.en.md`. Before deployment the missing ops caller register and manufacturing sign-off must be supplied, CI must run after an approved push, and the production catalog must be checked read-only; recreated or new functions still receive default EXECUTE, which remains a separate policy decision.

**B11 / P0-11 implementation:** owner approved this session to build 0197. The recorder trims the 29 characters matching Python 3.14.2 `str.strip()` using an explicit Unicode set, including U+00A0 and U+3000. Signature, ACLs, guards, fencing, retry, timestamps and token scrub are unchanged. The existing Python assertion passes; only its inaccurate btrim comment changed. The original 70 pgTAP checks plus 37 regressions pass. Independent cross-vendor acceptance passed at 00651a6cd; no deployment or push is authorized.

#### Step 2 — decide the branch integration plan (§8 question 7)

- Delete the two duplicate-name git refs (done by the repo owner)
- Choose the canonical tenant model: `monolith_*` or `tenants/organizations/sites`
- Decide ownership of the work that may overlap: outbound queue (0193–0196 versus 0178), ingest retry (P0-9 versus 0175), staff login (B9 versus 0176)
- Decide the migration number order (a line-trust amendment, or a temporary ban on applying `0180`+)
- Decide who resolves the conflicts in the 3 manufacturing OS factory files — not this work, per §4 non-goal 4
- **Acceptance criteria:** all five decisions recorded in writing in both Thai and English and referenced from this document

#### Step 3 — build P0-9 on the branch chosen in step 2

- **Acceptance criteria:** RED first — simulate a handler failure and prove that today it produces an inbound row + an `events_processed` increment (false success); GREEN — the failed event is not counted as processed, is not deduplicated away, enters an internal retry queue, is reprocessed until success or the bound, then goes to dead-letter with an audit entry; no reliance on LINE redelivery; no new cron; passes cross-vendor review
- **Status (1.16):** built ahead of step 2 on the owner's instruction, on local branch `claude/line-p009-ingest-retry` (code 18a24483e, evidence 0a355e29b); round-1 RED and GREEN were recorded in a473c718e (superseded). Still open: cross-vendor review and the step 2 decision on which branch owns ingest retry
- **Status (1.17):** round 2 at fb9bfd967 answers the independent same-vendor review; RED 43 of 48, GREEN 48/48 and mutant evidence were recorded in 7f0eacc2c (superseded). Still open: cross-vendor review, the owner decisions listed in §0, and the step 2 decision
- **Status (1.18):** round 3 at 1902a8eea closes the second review's follow-ups; RED 48 of 53, GREEN 53/53 and fourteen suite mutants plus two race mutants caught, as set out in §0. Still open: cross-vendor review, the owner decisions listed in §0, and the step 2 decision

#### Step 4 — integrate the branches locally and verify on the integrated schema (only after the step 2 decisions)

- **Acceptance criteria:** the 4 shared-infrastructure conflicts resolved (the suite list in `db-verify.yml` must contain both sides' suites); the 3 manufacturing OS factory conflicts resolved by whoever the decision names, not by this work; the whole migration chain applies from zero in number order; both branches' pgTAP suites and vitest pass on the integrated schema; the integration result passes cross-vendor review before a push is requested

#### Step 5 — close Phase A

- **Status (1.15):** the full local loop runs all fourteen suites and preserves the containment failure while the LINE suites pass. No filtered run is substituted for full CI. GitHub Actions ran on push after owner approval (runs 36748427202 and 36748427203 at a97c3c847, 36795389505 at 48b72d4c7; excerpt in `docs/governance/evidence/line-p012b-round2-2026-10-02/01-github-actions-excerpt.txt`); the full verdict is still failed.
- **Acceptance criteria:** steps 1, 1b and 2–4 pass with no required test failed or skipped; after the owner approves a push, CI (`db-verify.yml` including the `line_outbound_claim_record` suite) actually runs green; only then can the evidence status leave `EVIDENCE_INCOMPLETE` — the LINE-side behaviour of P0-5 is not a Phase A closure criterion (it is gate G-C1 in §9.2); no cron and no customer messages

### 9.2 Gates before real sending (Phase C)

- **G-C1 — confirm the retry key on the LINE side (P0-5):** check `X-Line-Retry-Key` behaviour on a LINE test channel: send the same push twice with the same retry key to an internal test recipient who is not a customer — **Acceptance criteria:** the recipient receives the message once; the second request returns HTTP 409 with `x-line-accepted-request-id`; the queue row is recorded as `sent` exactly once; raw output attached in the §9.1 format — requires the owner's approval before running, and no customer channel or customer recipient may be used
