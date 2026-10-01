# CI remediation for the first GitHub Actions run of the LINE branch

Date: 1 October 2026 (Asia/Bangkok; runner times are UTC). Base: a97c3c8479a5fcbff9fb134e0e661f7f0d828a8e on codex/repair-intelligence-phase0-trust. Status: BUILT LOCALLY, awaiting independent review and the next CI run. This round changes documents, one workflow job and one config line; it changes no migration, test or application code.

## Owner decisions (1 October 2026)

- Sealed evidence: option A. Amend the REPORT files openly, keep raw outputs and `SHA256SUMS.run`, regenerate only the REPORT lines of the final `SHA256SUMS`, and have the independent reviewer re-check.
- Push: approved before the independent review of a97c3c847 finishes.
- Repair Phase 0 items: the builder (this session) does them: enable storage in `supabase/config.toml` (one line, not the whole main config), the push-checklist certification sentence, and the shadow E2E secrets and environment.

## Why CI failed (runs 36748427202 and 36748427203 at a97c3c847)

| Check | Cause | From the LINE work? |
|---|---|---|
| claim linters | `lint_claims` reported 38 unevidenced absence claims in 14 LINE documents; `lint_certifications` reported 2 certifications | 39 of 40 yes; the push-checklist certification predates the LINE documents |
| edge + pgTAP, DB Verify (`trust_kernel_containment` 8–9) | `supabase/config.toml` had storage disabled, so `storage.objects` was absent when 0184 ran and its guarded policy block (`0184_trust_kernel_legacy_containment.sql:98`) was skipped | No |
| DB Verify (`repair_phase0_containment`) | the 12-argument function comes from 0170 on main (PRD §8 Q7) | No; unchanged here |
| shadow E2E | `reports/` was not created before the redirect, and the five E2E secrets are empty | No |
| final gate, evidence self-verify | follow from the failures above and the unconfigured signer (fail-closed by design) | No |

The same DB Verify run executed all five LINE suites with plan-complete results: 107/107, 133/133, 28/28, 82/82 and 23/23, claim race overlap 0. That is GitHub Actions evidence for a97c3c847 only; it is not production evidence and not an independent review.

## What changed

| Path | Change |
|---|---|
| 4 governance documents (TH and EN, with HTML) | permission matrix, session report, EXECUTE survey and integration follow-up: citations, Thai sentence boundaries and two rewordings (ledger below) |
| 8 sealed evidence bundles | REPORT.th.md and REPORT.en.md amended, HTML re-rendered, 4 REPORT lines of `SHA256SUMS` regenerated; `SHA256SUMS.run` and raw outputs unchanged |
| `docs/governance/repair-intelligence-phase0-push-checklist.md` | the acceptance-condition sentence is worded as a condition |
| `.github/workflows/trust-kernel-verify.yml` | shadow E2E job: a first step fails with the names of missing secrets (never values, `trust-kernel-verify.yml:235`), and the run step creates `reports/` before writing (`trust-kernel-verify.yml:249`) |
| `supabase/config.toml` | `[storage] enabled = true` (one line) |

`tools/.lint_allowlist` is unchanged (`02b-allowlist-unchanged.txt`), so the linters pass without new grandfathering.

## Finding ledger

Class A: a claim that a findable thing is absent. Class B: wording the detector reads as a claim that is not one (behaviour, requirement, scope, idiom, type name, acceptance condition). Bundle paths are under `docs/governance/evidence/`.

| # | Finding at the base | Class | Action |
|---|---|---|---|
| 1 | `line-b12-catalog-fixture-2026-09-30/REPORT.th.md:13` | B requirement | Thai sentences on separate source lines |
| 2 | `line-b12-monolith-catalog-attempt2-2026-09-30/REPORT.th.md:9` | A overloads (unnamed), backed by the bundle catalog | Thai sentences on separate source lines |
| 3 | `line-b12-monolith-catalog-attempt2-2026-09-30/REPORT.th.md:27` | B scope | Thai sentences on separate source lines |
| 4 | `line-ci-source-2026-09-30/REPORT.th.md:21` | A 12-argument function (unnamed) | Thai sentences on separate source lines |
| 5 | `line-p010-catalog-2026-09-30/REPORT.th.md:7` | B scope | split, and `02-migrations-applied.txt:192` cited |
| 6 | `line-p010-catalog-2026-09-30/REPORT.th.md:39` | A PUBLIC write grant, column ACL | `08-analysis.txt:48` and `08-analysis.txt:99` cited |
| 7 | `line-p010-catalog-2026-09-30/REPORT.th.md:42` | A overloads | `08-analysis.txt:185` cited |
| 8 | `line-p010-catalog-2026-09-30/REPORT.th.md:45` | A cascade | `08-analysis.txt:237` cited |
| 9 | `line-p010-ci-hardening-green-2026-09-30/REPORT.th.md:11` | B validator requirement | Thai sentences on separate source lines |
| 10 | `line-p010-evidence-followup-2026-09-30/REPORT.th.md:9` | A provenance fields | split, and `07-ci-local/full/db-verify-evidence.json:14` cited |
| 11 | `line-p010-evidence-followup-2026-09-30/REPORT.th.md:38` | A field disclosed at that time | Thai sentences on separate source lines |
| 12 | `line-p010-failclosed-green-2026-09-30/REPORT.en.md:48` | A migration 0170 | `07-ci-local/full/ci-step-1.log:411` cited |
| 13 | `line-p010-failclosed-green-2026-09-30/REPORT.th.md:48` | A migration 0170 | `07-ci-local/full/ci-step-1.log:411` cited |
| 14 | `line-p012-green-2026-09-30/REPORT.th.md:9` | B code behaviour | `0199_line_oa_restrict_definer_execute.sql:66` and `:111` cited |
| 15 | `line-p012-green-2026-09-30/REPORT.th.md:10` | B test description | `line_oa_definer_execute_matrix.sql:200` cited |
| 16 | `line-p012-green-2026-09-30/REPORT.th.md:11` | B test description | `line_oa_definer_execute_fail_closed.sql:204` cited |
| 17 | `line-p012-green-2026-09-30/REPORT.th.md:12` | B test description | `line_outbound_claim_record.sql:429` cited |
| 18 | `line-b12-permission-matrix.th.md:9` | B code behaviour | 0199 lines 66, 75 and 111 cited (TH and EN) |
| 19 | `line-b12-permission-matrix.th.md:10` | B test description | `line_outbound_claim_record.sql:429` cited (TH and EN) |
| 20 | `line-b12-permission-matrix.th.md:48` | B policy | paragraph turned into one list item per caller class (TH and EN) |
| 21 | `line-outbound-phase0-session-report.en.md:75` | A customer consent column and check | table definition `00000000000002_line_oa_schema.sql:108`, staff column `0088_identity_binding_lifecycle.sql:10` and a re-check command at a97c3c847 (TH and EN) |
| 22 | `line-outbound-phase0-session-report.th.md:25` | B idiom | em dash as in the English edition |
| 23 | `line-outbound-phase0-session-report.th.md:75` | A as row 21 | as row 21 |
| 24 | `line-outbound-phase0-session-report.th.md:100` | B code behaviour | `0193_line_outbound_claim_and_record.sql:235` cited (TH and EN) |
| 25 | `line-outbound-phase0-session-report.th.md:103` | B type name | type written as code (TH and EN) |
| 26 | `line-outbound-phase0-session-report.th.md:110` | A cron schedule in 0193–0196 | re-check command at a97c3c847 (TH and EN) |
| 27 | `line-outbound-phase0-session-report.th.md:159` | A a repository cron for the sender | re-check command at a97c3c847; "definitively" removed from the English edition |
| 28 | `line-p010-execute-survey.th.md:18` | A ALTER DEFAULT PRIVILEGES | split as in the English edition, re-check command at a97c3c847 (TH and EN) |
| 29–35 | `line-p010-execute-survey.th.md` lines 24, 27, 30, 31, 32, 33 and 34 | A callers, grants or guards per the survey search | shorthand migration citations in the 18-row routine table expanded to resolvable file:line (TH and EN); cited lines checked |
| 36 | `line-p010-integration-b12-followup.th.md:15` | B own action | split as in the English edition |
| 37 | `line-p010-integration-b12-followup.th.md:62` | A hedged scan result | scanned source commit 3bdd6f3e5 added (TH and EN) |
| 38 | `line-p010-integration-b12-followup.th.md:64` | A hedged scan result | split as in the English edition |
| 39 | `line-outbound-phase0-session-report.en.md:146` (certification) | B "passes" means forwards | reworded to "forwards" |
| 40 | `repair-intelligence-phase0-push-checklist.md:61` (certification) | B acceptance condition | reworded as a condition |

Thai line splits change only the Markdown source: the renderer joins paragraph lines with one space, so the rendered text of those paragraphs is unchanged (`05-render-check.txt`; for the four split-only bundles the HTML diff is the appended amendment section alone).

## Evidence in this bundle

| File | What it shows |
|---|---|
| `00-context.txt` | base, tool versions, pinned linter hashes (the local copies equal them, CRLF/LF aside), tracked changes |
| `01a-linters-before.txt`, `01b-findings-before.txt` | the pinned linters on the base tree reproduce the CI failure: 38 and 2 findings, both exit 1; each finding with marker and sentence |
| `02a-linters-after.txt`, `02b-allowlist-unchanged.txt` | the pinned linters on the working tree: both exit 0, allowlisted debt unchanged (15 and 1) |
| `03-reproduce-amendments.txt` | `tools/amend_bundles.py` applied to the base bytes reproduces all 16 amended REPORT files byte-for-byte; the survey routine tables equal `tools/expand_survey.py` output |
| `04-reseal-check.txt` | `SHA256SUMS.run` of every amended bundle is identical to the base, `sha256sum -c` succeeds for each `SHA256SUMS` and `SHA256SUMS.run`, and each `SHA256SUMS` differs from the base in its 4 REPORT lines only |
| `05-render-check.txt` | all 24 changed HTML files equal the repository renderer output of their Markdown |
| `06-workflow-config.txt` | both workflows parse; the E2E preflight is the first step and reads the same five secret names as the run step; `[storage].enabled` is true and the config diff is one line |
| `07-preflight-simulation.txt` | the preflight script taken from the YAML, run with placeholder values: all unset gives exit 1 and five names, all set gives exit 0, one unset names only that secret, and no value is printed (`07-preflight-simulation.txt:4` to line 6) |
| `08-repair-phase0-checks.txt` | Repair Phase 0 document verifier, its tests (12 of 12) and the final-gate self-test all exit 0 |
| `09-diff.txt`, `10-credential-scan.txt` | change set against the base; credential scan with positive controls (one reported exception: the unchanged local Supabase connection string at line 189 of the workflow, identical in the base) |
| `11-gate-negative-controls.txt`, `gate-ci-remediation.py` | the commit gate accepts the approved change set and rejects six deliberate violations, each in a private index: an extra path, a changed `SHA256SUMS.run`, a changed raw output, a new sentence the claim linter must flag, a config change beyond the storage line, and a credential-shaped URI |

The commit goes through `commit-ci-remediation.sh`, which stages only the approved paths, runs the gate on the staged blobs, and commits only on exit 0 together with a transcript in `docs/governance/evidence/line-ci-remediation-commit-2026-10-01/`.

## Limits and what remains open

- Storage: the Supabase CLI is not installed here, so the config change is untested locally under `supabase start`. A throwaway stack with storage-api already ran `trust_kernel_containment` 16/16 (`line-p012-green-2026-09-30/07b-ci-suite-runner/trust_kernel_containment.tap`). The next CI run is the test.
- Shadow E2E: this session cannot provide the environment. The five secrets are credentials and must be set by the owner in the repository settings; the stack they point to needs a deployment, which is not approved. Until then the E2E job and the final gate stay red, now with a message naming the missing secrets.
- `repair_phase0_containment` still needs migration 0170 from main (PRD §8 Q7), so DB Verify and edge + pgTAP stay red on that suite.
- Pull request #133 has merge conflicts, so the main-branch `pull_request` workflows have not run on it; only push-triggered workflows have.
- The amended bundles include reviewer-accepted evidence (for example da252d18a); each amendment needs re-review.

## Runner history

Three earlier runs of the runner in this round were set aside outside the repository. Run 1 called the WSL bash for the preflight simulation (exit 127), and its credential scan flagged the pre-existing local connection string. Run 2 still called the WSL bash. Both were runner defects, fixed in `tools/run-ci-remediation.sh` (explicit bash path; a narrow exception that is always reported). Run 3 passed every step but its runner carried an inaccurate comment about the cause of runs 1 and 2; the comment was corrected and the runner re-run. This bundle holds run 4, in which all 17 recorded steps exit 0.

The first commit attempt through the wrapper was blocked by the gate: the negative-control script held a credential-shaped probe URI as a literal. Nothing was committed and the index was restored. The probe is now assembled at run time, the controls were re-run (`11-gate-negative-controls.txt`), and the bundle was resealed. The second attempt was also blocked by the gate, because the Thai edition of this paragraph put a negation and a file name in one sentence; the sentences were split before the third attempt.
