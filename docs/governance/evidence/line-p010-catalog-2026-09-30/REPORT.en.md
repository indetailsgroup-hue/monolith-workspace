# P0-10 catalog evidence: ephemeral stack built from the migration chain

Date: 30 September 2026. Base: 6a41ebb691ff3020838774f34aa4afebe2fdd61c on codex/repair-intelligence-phase0-trust. Status: EVIDENCE COLLECTED, awaiting independent review. This does not close P0-10 or Phase A, does not approve migration 0198, and changes no privilege.

## Approval and scope

The owner approved two things: service_role is inside the P0-10 revoke design target, and the read-only catalog may be collected on a throwaway stack migrated from zero, with only this evidence bundle committed. No 0198, no grant/owner/membership change, no pgTAP, Python or write tests, no push, no deploy, no cron execution, no real message and no shared or production database were part of this run.

## How the evidence was produced

| Item | Value |
|---|---|
| Runner | run-p010-catalog.sh (exact executed bytes, sha256 e64a4445…2c1d) |
| Catalog SQL | catalog-checklist.sql, sha256 5ed8f00dea517687b658401dc570e8ab24b59d71ae0a5b845f808f6887a3d987 (approved hash, unmodified) |
| Stack | supabase/postgres 17.6.1.158 + gotrue v2.195.0 + storage-api v1.66.4, image IDs in 00-context.txt |
| Isolation | network line-p010-net, DB published on 127.0.0.1:55444 only, cron.launch_active_jobs=off |
| Time (UTC) | started 09:25:58, catalog 09:26:49, finished 09:26:53 |
| Clients | psql 18.1, Python 3.14.2, Node v22.21.1, Docker 29.8.0 |

## Run results

| Check | Result | File |
|---|---|---|
| Pre-flight (HEAD, branch, clean supabase/, SQL hash, names, port, images) | passed; nothing existed beforehand | 00-context.txt |
| Migration sources vs base blobs | 192 files: 10 identical, 182 CRLF/LF only, 0 substantive | 02a-migration-sources.txt |
| Migrations from zero | 192 of 192 applied, 0 failed, no shim | 02-migrations-applied.txt |
| Cron | 12 jobs defined by the chain, scheduler off, 0 rows in cron.job_run_details | 03-baseline-after-migrations.txt |
| Catalog checklist | aligned exit 0, unaligned exit 0, 11 result sets each | 04a, 04b |
| Catalog unchanged by the checklist | fingerprint identical before and after | 00-context.txt, 03, 05 |
| Teardown | 0 containers and 0 networks of this run remain | 06-teardown.txt |
| In-run credential scan | positive control detected; 0 generated credential bytes in 18 files | 07-credential-scan.txt |
| Runner exit | 0 | 00-context.txt |

## Catalog findings on this stack

| # | Finding (verified from 04b, derived in 08-analysis.txt) |
|---|---|
| 1 | All 8 target tables are owned by postgres and have RLS enabled but not forced. |
| 2 | anon, authenticated and service_role hold direct INSERT/UPDATE/DELETE/TRUNCATE on 7 tables and INSERT/TRUNCATE on line_oa_audit_log. PUBLIC holds no write grant. No column-level ACL exists. |
| 3 | Effective write privilege: anon 8/8 tables, authenticated 8/8, service_role 8/8, authenticator 0/8 (NOINHERIT, SET ROLE path only), postgres 8/8. |
| 4 | postgres is not a superuser, has BYPASSRLS, and is an inheriting member of anon, authenticated, service_role and authenticator. |
| 5 | All 20 candidate names exist as exactly 20 identities with no overloads. All 20 are SECURITY DEFINER, owned by postgres, with a fixed search_path. |
| 6 | postgres owns all 8 tables, so every definer write right comes from ownership. Rights that depend only on role membership: none. |
| 7 | 27 more routines matched the text search (23 definer, 4 invoker). All are owned by postgres. The 4 invoker routines are fn_wf_render_notification_text, line_oa__ct_equal, line_oa_audit_log_immutable and line_oa_normalize_order; their bodies were not captured. |
| 8 | 10 triggers are on target tables: 8 internal foreign-key triggers (no cascade), the definer guard trg_line_guard_customer_group and the invoker trg_line_oa_audit_log_immutable. 2 are on other tables (installation_projects, line_groups), both calling definer routines. |
| 9 | No view, materialized view or rule depends on the 8 tables. |
| 10 | Default ACLs for creators postgres and supabase_admin in public grant ALL on tables, EXECUTE on functions and sequence rights to anon, authenticated and service_role. |

## What this implies (inference, still to be tested)

On this stack, revoking INSERT/UPDATE/DELETE/TRUNCATE on the 8 tables from anon, authenticated and service_role would not remove the rights the 20 definer routines use, because those rights come from table ownership, not from membership in service_role. Real-operation tests with SQLSTATE 42501 are still required after a separately approved change. Finding 10 means any future table in public receives these grants again unless defaults are changed, which is outside the approved scope.

## New observation outside the table-grant scope

anon can EXECUTE 18 of the 20 definer writers, authenticated 19 and service_role 20. Only rpc_claim_line_outbound_batch is limited to service_role, and rpc_record_line_send_result is not granted to anon. fn_welcome_on_group_bind also has PUBLIC EXECUTE. Migrations revoke EXECUTE only from PUBLIC (for example 0107_factory_group_milestones.sql line 61), while default ACLs grant it directly to the named roles. The source of fn_prod_curated (0107 lines 50 to 60) inserts a pending push into a customer group without any caller check. Revoking table grants therefore does not stop a client role from calling a definer writer. Whether PostgREST in production exposes these functions is unknown. This needs its own owner decision and is not part of the approved 0198 scope.

## Not established by this evidence

- The production catalog: owners, ACLs, memberships, default ACLs and EXECUTE grants may differ from this reconstructed chain.
- Behaviour after a revoke: no revoke or write was attempted in this run.
- Internal authorisation checks in the other 19 routine bodies: the capture holds body hashes, not bodies.
- External service-key writers: only the owner-relayed ops attestation exists.

## Files

The raw run outputs are listed in SHA256SUMS.run. The collector added analyze-p010-catalog.py, 08-analysis.txt, gate-p010-commit.py, REPLAY.txt and these four report files after the run. SHA256SUMS covers every file except itself. REPLAY.txt explains re-checking and replaying.

## Next step

An independent reviewer checks this commit (checksums, owner/ACL, membership, triggers and views) before any request to approve 0198. The EXECUTE observation also goes to the owner as a separate decision. Phase A remains EVIDENCE_INCOMPLETE.
