# B12 MONOLITH baseline — catalog evidence

30 September 2026. Base 5caee238e7f7d977353d7659d3c4e45ad0e01e7d. This run builds the product migration chain on a temporary stack; it is not production or post-0199 evidence.

## Result

193/193 migrations applied from zero, in filename order, without a shim or skipped migration. The applied source manifest matches the base commit with recorded CRLF/LF differences only. PostgreSQL 17.6, auth and storage images are recorded by local image ID. The read-only B12 query ran twice with exit zero and equal parsed JSON. Routine/table/role catalog fingerprint before and after was unchanged within the runner's documented fingerprint fields.

Twenty expected identities exist, with no extra overload or missing named role. All twenty are SECURITY DEFINER owned by postgres. EXECUTE counts are anon 18/20, authenticated 19/20, service_role 20/20, authenticator 1/20 and postgres 20/20. PUBLIC EXECUTE appears only on fn_welcome_on_group_bind. Its installed trigger is trg_welcome_group_bind on line_groups. These results match the earlier catalog and the matrix's historical pre-state.

The proposed matrix has sixty named-role cells: 28 need revocation, 28 KEEP cells currently have access, three DENY cells are already denied, and one recorder/authenticated cell needs a decision. These counts are role/function cells, not distinct functions or approved SQL changes. No grants were changed beyond applying the existing migration chain to the new stack.

## Isolation and failed startup

The successful attempt used an internal Docker network, no published ports, and psql inside the owned database container. cron.launch_active_jobs was off and cron.job_run_details had zero rows. All owned containers and the network were removed; the exact generated-credential scan and positive control passed.

The first attempt is retained in the sibling line-b12-monolith-catalog-2026-09-30 folder: host psql could not reach the internal network's port even though the database was accepting local connections. The operator stopped only the owned database; the runner recorded startup failure, exit 3 and cleanup. No project migrations ran in that attempt. Attempt 2 changes transport, not project migration contents. Some inherited runner labels still say aligned/unaligned; both catalog files in attempt 2 are JSON. The logical DSN recorded there selects a container-local role and is not a host connection.

## Recheck and replay

SHA256SUMS.run preserves raw outputs from each run. SHA256SUMS covers the final bundle. Recheck with verify-b12-baseline.py from the product root, optionally --rev COMMIT for Git blobs. The copied catalog-checklist.sql must match scripts/line-b12-catalog.sql at the base. 08-matrix-comparison.json maps every matrix cell to the actual catalog result.

For replay use a separate checkout at the exact base, cached images, a new output directory, and the copied run-b12-catalog.sh with B12_OUT and B12_SQL=scripts/line-b12-catalog.sql. The runner permits the expected branch or detached HEAD, refuses existing owned-resource names/output, resolves local image IDs and disables cron. Do not reuse another worktree or shared stack. No external credentials are needed. Generated secrets stay in the local process and are scrubbed from saved logs.

## What remains unproven

No business RPC, pgTAP/Python behavior suite, independent rerun, GitHub Actions or production test was performed in this round. Owner identity alone does not certify every transitive call chain or production owner privileges. External/manual callers and API exposure remain unknown. The catalog therefore supports the pre-state of the B12 design; it does not approve 0199, settle recorder policy, resolve 0170/0191 integration, fix containment/P0-9 or close Phase A. No push, deployment, real message or cron activation occurred.

## Post-seal amendment (1 October 2026)

The pinned claim linter flagged sentences in this report on the branch's first GitHub Actions run (run 36748427202). The owner approved an open amendment of the report wording. This amendment changes wording and citations only; every result, number and conclusion above is unchanged.

- Thai sentence boundaries are now source line breaks in REPORT.th.md (the rendered text is unchanged), in the catalog-result and scope paragraphs
- Raw outputs and `SHA256SUMS.run` are unchanged; `SHA256SUMS` changes only in the lines of the four REPORT files.
- The pre-amendment REPORT hashes and the full change record are in `docs/governance/evidence/line-ci-remediation-2026-10-01/`.
- This amendment needs independent re-review.
