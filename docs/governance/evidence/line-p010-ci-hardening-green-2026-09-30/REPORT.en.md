# P0-10 CI evidence hardening — delivery report

30 September 2026. Base: `a0ea86320879b44c334c37c8a06127443ba5d59f`. Product branch: `codex/repair-intelligence-phase0-trust`.

## Outcome

Local LINE checks pass. The complete database suite still fails; evidence now reports that failure accurately. Phase A remains `EVIDENCE_INCOMPLETE`. Independent review is outstanding.

## Changes

All twelve pgTAP suites run, with separate stdout, stderr, exit status and verdicts. The validator requires one complete ordered plan, exit zero, and no failure, skip or TODO. Overall `pass` follows `fullPass`, separately from `linePass`. Metadata identifies local runs.

The post-0198 guard requires eight tables and three roles. Fail-closed coverage grows from 13 to 28 assertions: explicit inheritance, inherited DELETE/TRUNCATE and column INSERT supplement inherited INSERT/UPDATE and column UPDATE. Tests execute real 0198 through savepoints and compare table/column ACLs and membership options/grantors after rollback. This proves the harness boundary, not arbitrary migration runners.

0198 is byte-for-byte unchanged. PRD 1.10 records results and retains historical evidence. The commit wrapper checks staged scope, credentials, checksums and tree identity.

## Verification

| Check | Result |
| --- | --- |
| Fresh migration chain, RED and GREEN | 193 each |
| RED residual-guard mutant | Exactly 20 expected failures; eight other assertions pass |
| GREEN fail-closed | 28/28 |
| Existing LINE suites | 107/107 and 133/133 |
| Python, twelve files | 72/72; no failure or skip |
| Two-client claim race | 10 + 10 rows; zero overlap |
| TAP validator unit tests | 22/22 |
| Full local pgTAP loop | Twelve executed; eleven pass; containment fails |
| Summary | linePass=true; fullPass=false; pass=false |
| Cleanup | No run container/network remains; no cron executions |

Containment exits 3 at `repair_phase0_containment.sql:74`, with six of eight results: the 12-argument `rpc_factory_job_record_packet` is missing. No manufacturing code/tests changed. The verifier accepts only this exact known failure and requires all other suites to pass. Verifier exit zero means evidence matches expectations, not full CI success. GitHub Actions has not run.

## Evidence and provenance

This GREEN bundle and the adjacent RED bundle retain tested sources, commands, UTC times, exit codes, fingerprints and raw outputs. `SHA256SUMS.run` preserves the run manifest; `SHA256SUMS` covers the final bundle. `REPLAY.txt` records the first GREEN preflight refusal and the subsequent unused dedicated port. Older bundles were not edited.

Claude Opus 5.5 produced candidate validator, runner, unit tests and SQL expansion through CLI. Only selected sanitized content was sent, with no secret files or tool/filesystem access. Codex reviewed, integrated and validated it, correcting one new unit-test expected-reason list and updating workflow/docs. This is not independent acceptance of our own coordinated work.

The wrapper and transcript expose the checked tree; they are execution records, not external attestation. Secret scanning includes positive controls, but cannot prove detection of every secret format.

## Remaining work

Independent review, resolution of the separate containment dependency, and approved push followed by actual CI remain outstanding. P0-9, B12/0199 and production catalog review remain separate. No push, deploy, shared/production access, cron activation or real messages occurred. This temporary stack does not prove production grants.

## Post-seal amendment (1 October 2026)

The pinned claim linter flagged sentences in this report on the branch's first GitHub Actions run (run 36748427202). The owner approved an open amendment of the report wording. This amendment changes wording and citations only; every result, number and conclusion above is unchanged.

- Thai sentence boundaries are now source line breaks in REPORT.th.md (the rendered text is unchanged), in the pgTAP result paragraph
- Raw outputs and `SHA256SUMS.run` are unchanged; `SHA256SUMS` changes only in the lines of the four REPORT files.
- The pre-amendment REPORT hashes and the full change record are in `docs/governance/evidence/line-ci-remediation-2026-10-01/`.
- This amendment needs independent re-review.
