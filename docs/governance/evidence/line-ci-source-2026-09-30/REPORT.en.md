# Actions source provenance — delivery

30 September 2026. Base: `e7e2c52ce169b07978802c026255f08f71221d39`. This bundle contains local source/wiring tests only. It contains no new database or GitHub Actions result.

## Changes and validation

Actions captures a deterministic source manifest after checkout and before starting Supabase. The helper reads only required/allowlisted source files, rejects missing required files, traversal and symlinks, normalizes CRLF to LF, and records paths with SHA256. It exports the exact manifest digest through GITHUB_ENV. The workflow shares run_id/run_attempt across steps and uploads the manifest and migration count alongside TAP evidence.

Tests first failed because the new helper did not exist. After implementation, all 46 tests passed with zero skips: 33 existing validator tests and 13 new manifest tests. Local workflow wiring checks passed 27/27, including actual source capture and environment-file handoff to the assembler. The twelve TAP inputs in that wiring check are synthetic fixtures; their passing verdict does not establish any database behavior or CI success.

The manifest refusal to overwrite an existing output is deliberate. A detached checkout records manifest ref HEAD, while the existing summary uses GITHUB_REF. The commit SHA and source hashes identify the captured inputs; the branch labels serve different purposes.

## Acceptance and operational handoff

A separate read-only Codex reviewer accepted E1/E2/E3 at e7e2c52ce for source and recorded local evidence, with limits. The reviewer also found no blocking issue in the new Actions diff. Neither review reran a database or provided cross-vendor/production acceptance. Details are recorded in REVIEW.txt.

PRD 1.12 records that bounded acceptance. The bilingual caller register lists known source/manual paths and fields for ops to confirm real environments, users, schedules and exact RPC access. External callers remain UNKNOWN, and the manufacturing/integration owner has not been identified. Creating the register does not contact ops or access external systems.

## Remaining gates

No push or actual Actions run occurred. Prior database evidence remains unchanged: LINE checks passed but containment failed on the missing 12-argument factory function. This patch does not fix containment, implement P0-9, decide tenant/branch integration, create 0199, change default ACLs or authorize production inspection/deployment. Phase A stays EVIDENCE_INCOMPLETE.

The current source metadata wiring is locally validated, not yet confirmed on GitHub's runner. Source/code checks and pattern-based secret scanning are not independent execution attestation or proof of detecting every possible secret format. Opus authored helper/tests from requirements only; Codex integrated and verified them. No secret files were supplied to Opus.

## Post-seal amendment (1 October 2026)

The pinned claim linter flagged sentences in this report on the branch's first GitHub Actions run (run 36748427202). The owner approved an open amendment of the report wording. This amendment changes wording and citations only; every result, number and conclusion above is unchanged.

- Thai sentence boundaries are now source line breaks in REPORT.th.md (the rendered text is unchanged), in the scope paragraph
- Raw outputs and `SHA256SUMS.run` are unchanged; `SHA256SUMS` changes only in the lines of the four REPORT files.
- The pre-amendment REPORT hashes and the full change record are in `docs/governance/evidence/line-ci-remediation-2026-10-01/`.
- This amendment needs independent re-review.
