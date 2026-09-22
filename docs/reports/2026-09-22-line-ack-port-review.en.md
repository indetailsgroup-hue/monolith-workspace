# LINE acknowledgement port review

Baseline: main `fbaf046a1c54299a7fa4c9144a65b877e98a19fc`, observed using git ls-remote origin refs/heads/main on 22 September 2026. Work branch: `codex/reconcile-github-main`, PR #124. Parent governance and nested product worktrees were inspected separately and their existing changes preserved.

## Migration map

- Main ends at `20270327_issue_notification_retry.sql`; the new, unmerged migration is `20270328_line_group_plain_ack.sql`.
- Nested `0163_line_org_id_function_fix.sql` conflicts numerically with main's storage migration and is not copied.
- The effective baseline group handler comes from `0177_field_purchase_line_flow.sql`, not `0097`. The earlier PR version would have removed FPR handling. Its green CI did not establish preservation of that behavior; this review supersedes that conclusion.
- The ingest RPC baseline comes from `0097`. The group branch adds tenant IDs required by the later schema and a metadata-only receipt for the new acknowledgement.

## Port boundary

Add one shared acknowledgement template. After existing command and FPR branches, ordinary text in an active bound group stages one push using that group's org_id. The ingest transaction records an empty JSON receipt; repeated delivery of the same event ID stages no additional push. Unbound groups, archived groups, and other media retain baseline behavior. No existing guard or old template is replaced. No historical migration is edited.

The original nested design also proposed unbound acknowledgements; that behavior is excluded because it has not passed review against the baseline guard. Existing baseline defects are not silently repaired in this port.

## Evidence and limits

- New preservation test failed against the earlier PR handler, then passed against the revised port. Outside the marked acknowledgement block, the handler matches baseline 0177 byte for byte.
- Node contract suite: 2 passed, 0 failed.
- Isolated local PostgreSQL fixture: passed bound acknowledgement, org_id, empty receipt, sequential duplicate, archived/unbound exclusions, non-text exclusion and command precedence. Fixture rolled back.
- The fixture stubs signature verification/channel resolution and does not reproduce the full schema, RLS, sender or LINE delivery. It does not prove cryptographic verification, production tenancy, concurrency or live delivery.
- New CI workflow runs both contract checks. Fresh full-baseline CI on this revision remains to be observed. Prior checks on `74d3914` do not validate this revision.
- No merge or production deployment was performed. Review/signature/required-check requirements still apply.

## Follow-up review of 09333cf

- GitHub reported 35 successful, 4 failing, 8 skipped and 1 expected check. Failures: missing certification evidence in this report and one regex spacing error, which also failed the warning-budget and Full Verify jobs. Evidence is added and the regex corrected without weakening linters.
- Validate Site Files was required but its PR path filter excluded this change. It now runs on every PR targeting main, retaining the validation steps and push filters.
- A new SQL test deliberately rejects an outbound insert. Before the fix it failed with `failed queue persisted an inbound receipt and private content`. The RPC now raises a sanitized exception for handler errors, rolling back the batch without a receipt so delivery can retry. The test then passed. Unrelated unique violations are not classified as duplicates.
- Added 13 full-schema pgTAP assertions for FPR image/amount transitions, bind/issue commands and acknowledgement ownership/content. These use the real 20270326 ownership trigger omitted by the small fixture. New CI is pending; byte equality is not a runtime result.
- GitHub requires verified signatures and one independent approving reviewer with write access. PR author: indetailsgroup-hue. Eligible reviewer suparatyanvinitchai-byte has write access; approval remains outstanding.
- Production schema inspection, deployment and limited Monolith Team delivery verification remain dependent on merge. No live delivery result is claimed.