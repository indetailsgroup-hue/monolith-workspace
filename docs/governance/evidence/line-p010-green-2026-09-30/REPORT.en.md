# P0-10 RED/GREEN evidence for migration 0198

Date: 30 September 2026. Base: da252d18a10d12e18bfc2afed3a82f4f79001090 on codex/repair-intelligence-phase0-trust. Status: BUILT, awaiting independent acceptance. This does not close P0-10 or Phase A, and nothing was pushed or deployed.

## What changed

| File | Change |
|---|---|
| supabase/migrations/0198_line_oa_revoke_client_write_grants.sql | Revokes INSERT, UPDATE, DELETE and TRUNCATE on the eight line_oa_* tables from anon, authenticated and service_role where those roles exist, without CASCADE. It then raises and rolls back if any of the three still holds an effective table or column write privilege. |
| supabase/tests/line_oa_client_write_revoke.sql | New pgTAP suite with 133 assertions (listed below). |

SELECT, EXECUTE, REFERENCES, TRIGGER, MAINTAIN, ownership, role membership and default privileges are unchanged. No manufacturing OS file, other worktree, shared stack or production system was touched.

## The new suite

| Assertions | What they prove |
|---|---|
| 1-4 | Scope guard (8 tables, 3 roles, 32 statements), schema USAGE kept, PUBLIC holds no write grant, each table owner keeps all four write privileges |
| 5-28 | For 3 roles × 8 tables: no effective INSERT, UPDATE, DELETE or TRUNCATE at table level and no INSERT or UPDATE at column level |
| 29-124 | 96 real write attempts under SET LOCAL ROLE, one INSERT, UPDATE, DELETE and TRUNCATE per table and role, each rolled back. Only SQLSTATE 42501 with the exact message "permission denied for table" counts as a pass. |
| 125-127 | service_role still reads the columns the sender reads from line_oa_channels, line_oa_conversations and line_oa_message_templates |
| 128-129 | rpc_ingest_line_webhook as service_role accepts a signed synthetic event and writes the conversation, inbound message, customer identity and audit receipt |
| 130 | Binding a customer group as service_role fires fn_welcome_on_group_bind, which queues tpl_welcome_pack |
| 131 | fn_prod_curated as service_role queues exactly one pending push for the group |
| 132-133 | rpc_claim_line_outbound_batch claims that row with a claim token, and rpc_record_line_send_result (called with the sender's named arguments) records it as sent |

All data is synthetic and rolled back. The stack has no edge runtime and the cron scheduler is off, so no LINE message can be sent.

## Results

| Check | RED (no 0198) | GREEN (with 0198) |
|---|---|---|
| Migrations from zero | 192/192 | 193/193 |
| Original pgTAP | 107/107 | 107/107 |
| New P0-10 pgTAP | 19 pass; exactly the 114 write-privilege assertions fail | 133/133 |
| Claim race | 10+10, overlap 0 | 10+10, overlap 0 |
| 12 required Python files | 64 pass, 8 fail (test_clients_hold_no_write_grants only), 0 skipped | 72/72, 0 skipped |
| Catalog: write privilege of anon / authenticated / service_role | 8/8 tables each | 0/8 each |
| Catalog: owner rights, service_role SELECT, EXECUTE on the 20 writers | full; 8/8; 18/19/20 | full; 8/8; 18/19/20 (unchanged) |
| Fingerprint unchanged by tests, cron runs, teardown, credential scan | yes; 0; clean; pass | yes; 0; clean; pass |
| Verifier and runner exit | 0 and 0 | 0 and 0 |

In RED, the six passing write probes are the audit-log UPDATE and DELETE attempts that 0005 already revoked. The failing probes show what 0198 removes. service_role inserted, updated and deleted real rows, and truncated seven tables. anon and authenticated also truncated seven tables, while their inserts were stopped only by RLS. line_oa_conversations could not be truncated by any role because of its foreign keys. All of these attempts were rolled back.

## Not established

- Production: its grants, grantors, owners and default ACLs may differ. A read-only production catalog check before deploy remains a separate gate.
- CI: the new suite is not yet in .github/workflows/db-verify.yml, and nothing has been pushed.
- EXECUTE exposure (B12): 0198 does not change it. See docs/governance/line-p010-execute-survey.en.md.
- The two-client race and Python suites ran on this machine's throwaway stack, not a CI-identical stack.

## Files

The raw outputs of each run are listed in that bundle's SHA256SUMS.run. REPLAY.txt in each bundle gives the exact command. SHA256SUMS covers every file except itself. commit-p010.sh and gate-p010-change.py are the wrapper and gate used for the commit; the transcript of that run is in docs/governance/evidence/line-p010-commit-2026-09-30/.
