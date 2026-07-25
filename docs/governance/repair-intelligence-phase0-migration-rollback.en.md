# MONOLITH Repair Intelligence — Phase 0 Migration and Rollback Pack

Document ID: repair-intelligence-phase0-migration-rollback
Edition: English (aligned Thai edition: `docs/governance/repair-intelligence-phase0-migration-rollback.th.md`)
Date: 2026-07-25
Execution branch: `codex/repair-intelligence-phase0-trust`

---

## 1. Status

Phase 0 exit: PENDING_OWNER_REVIEW
Expert Label Protocol: PROPOSED / NOT RUN
Gate B: NOT PASSED
Immutable infrastructure: NOT CLAIMED
Phase 1A–3 capabilities: DISABLED

All statuses above are literal governance states. No status in this document may be read as a completion claim; each transitions only by explicit owner decision recorded in a successor governance document.

## 2. Source and Target Commits — 24-Commit Transplant

The execution branch `codex/repair-intelligence-phase0-trust` starts from canonical product `main` at commit `dd1119af6d0bcba0e38d38516ed1b11125bcf19f`. The Trust Kernel series is transplanted onto that base by `git cherry-pick` (24 commits). There is no generated `dist` commit in the transplant; commit `59f61e57` (generated dist) and the unrelated 409 fix `f87c089f` are excluded by design.

| Role | Commit / Range | Notes |
|---|---|---|
| Product baseline (target base) | `dd1119af6d0bcba0e38d38516ed1b11125bcf19f` | Canonical product `main`; branch point for `codex/repair-intelligence-phase0-trust` |
| Trust Kernel series — first commit | `43301f96042bc48242de59fc02f42c725a0b6a73` | Start of the 24-commit cherry-pick series |
| Trust Kernel series — last commit | `8dfe0cc02e6cbbe8f4cefb3893d80a758fc8d49b` | End of the 24-commit cherry-pick series |
| Excluded: generated dist commit | `59f61e57` | Not transplanted; dist output is regenerated in CI, never cherry-picked |
| Excluded: unrelated 409 fix | `f87c089f` | Out of Phase 0 scope; tracked separately |
| Governance root pin | `55557d7f178dcbe00fec15cffb3061df668eaff8` | Governance repository baseline for this pack |

Transplant method: `git cherry-pick 43301f96^..8dfe0cc0` on the execution branch, minus the two exclusions above. Any cherry-pick conflict stops the transplant; conflicts are resolved by revising the series plan, never by ad-hoc merge resolution on the execution branch.

## 3. Preflight Status Checks (Both Git Roots)

Before any migration step, both Git roots MUST be verified clean and pinned. Any drift = stop and revise the baseline; do not proceed on a drifted root.

| Root | Check | Expected result |
|---|---|---|
| Governance root | `git status --short` | Empty output (no uncommitted changes) |
| Governance root | `git rev-parse HEAD` | `55557d7f178dcbe00fec15cffb3061df668eaff8` |
| Product root | `git status --short` | Empty output (no uncommitted changes) |
| Product root (`main`) | `git rev-parse main` | `dd1119af6d0bcba0e38d38516ed1b11125bcf19f` |
| Product root (execution branch) | `git merge-base main codex/repair-intelligence-phase0-trust` | `dd1119af6d0bcba0e38d38516ed1b11125bcf19f` |

Drift handling: if any check returns an unexpected value, the operator stops, records the observed value in the run log under `reports/phase0/`, and the baseline is revised by owner decision before any retry. Preflight re-verification: NOT RUN until execution day.

## 4. Organization Backfill Strategy and Verification

Migration `0189_repair_phase0_organization_scope.sql` introduces `organization` as the parent of `site` and backfills scope in this order:

1. Create a default organization per tenant (default-org backfill), so every existing tenant has exactly one organization before any site is re-parented.
2. Re-parent every `site` to its tenant's default organization (`site.organization_id`).
3. Backfill `membership_organization` grants from existing `membership_site` rows, so no member loses access at cutover.
4. Backfill `verified_action_context.organization_id` from the row's site, then set the column `NOT NULL`.
5. Install trigger `fn_bind_verified_action_context_organization`, which enforces that every new verified action context is bound to an organization the actor holds both org and site grants for.
6. Replace tenant-only SELECT policies with site-grant RLS policies.

Row-count and hash verification (all three counts MUST be 0 before the migration is declared applied):

| Check | SQL (count comparison) | Required result |
|---|---|---|
| Sites without organization | `SELECT count(*) FROM site WHERE organization_id IS NULL;` | 0 |
| Site grants without matching org grant | `SELECT count(*) FROM membership_site ms WHERE NOT EXISTS (SELECT 1 FROM membership_organization mo JOIN site s ON s.organization_id = mo.organization_id WHERE s.id = ms.site_id AND mo.member_id = ms.member_id);` | 0 |
| Verified action contexts without organization | `SELECT count(*) FROM verified_action_context WHERE organization_id IS NULL;` | 0 |

Hash verification: before and after backfill, a deterministic digest of the pre-existing scope data (ordered `md5` aggregate over `membership_site` and `verified_action_context` business columns, excluding the new `organization_id`) MUST be equal, proving the backfill added scope without mutating existing rows. Digest capture: NOT RUN until execution day; the captured values are filed under `reports/phase0/`.

## 5. Rollout Order

`ledger → trust transplant → organization → deny policy → legacy containment → CI`

1. **Ledger** — the progress ledger and run log under `reports/phase0/` are created first, so every subsequent step writes evidence to a location that already exists and is under version control.
2. **Trust transplant** — the 24-commit Trust Kernel series is cherry-picked onto the execution branch per Section 2, and the preflight checks of Section 3 are re-run after the transplant.
3. **Organization** — migration `0189_repair_phase0_organization_scope.sql` is applied and verified per Section 4 before any policy work begins.
4. **Deny policy** — deny-by-default policy flags for Phase 1A–3 capabilities are asserted (capabilities remain DISABLED), so containment lands on a surface that is already denied.
5. **Legacy containment** — migration `0190_repair_phase0_legacy_containment.sql` drops the broad `field_media_insert` / `field_media_select` storage policies and revokes `rpc_field_submit_photo` and `rpc_capture_ingest` from `public`, `anon`, `authenticated`, and `service_role`.
6. **CI** — the CI evidence jobs run last and archive their outputs under `reports/phase0/`, closing the loop on every prior step.

## 6. Compatibility Window and Read-Only Behavior

During the rollout window, the affected repair-intelligence surfaces operate in a declared compatibility window:

- Read paths continue to work throughout the window under the pre-existing grants until step 5 (legacy containment) lands; after step 5, reads flow only through site-grant RLS policies installed in step 3.
- Write paths on legacy routes (`rpc_field_submit_photo`, `rpc_capture_ingest`) are treated as read-only-equivalent from the start of the window: operators are instructed not to rely on them, and any writes they accept before revocation are captured by the ledger for reconciliation.
- No schema element is dropped during the window; `0189` is additive plus constraint-tightening, and `0190` removes only grants and policies, not data.
- The compatibility window closes when the Section 4 counts read 0 and the CI step has archived its evidence. Window closure: PENDING_OWNER_REVIEW.

## 7. Rollback Triggers

A rollback is initiated when any of the following is observed:

1. Failed pgTAP suite — any pgTAP failure in the Phase 0 policy/trigger suites after a rollout step.
2. Cross-org read reproduced — any demonstration that a member of one organization can read another organization's rows through the new policies.
3. Denial bypass discovered — any path that reaches `rpc_field_submit_photo`, `rpc_capture_ingest`, or the dropped storage policies' object surface after step 5.
4. CI evidence incomplete — the CI step cannot produce or archive its required evidence under `reports/phase0/`.
5. Owner order — the owner directs a rollback for any reason; no justification threshold applies.

## 8. Rollback Order and Non-Regression Constraint

Rollback proceeds strictly in this order:

1. **Application routes first** — application-level routes onto the new surfaces are disabled, returning traffic to a known-safe idle state.
2. **Policy flags** — the deny-policy flags from rollout step 4 are restored to their pre-rollout configuration.
3. **Database grants/policies** — grants and policies changed by `0190_repair_phase0_legacy_containment.sql` are reviewed for rollback under the constraint below.
4. **Organization migration** — `0189_repair_phase0_organization_scope.sql` structures are rolled back last, and only if steps 1–3 completed and the constraint below permits.

**Binding constraint:** NO rollback step may re-enable an unsafe raw URI, a broad bucket read, an unsigned artifact byte route, or client actor authority. A rollback that would do so is forbidden; the correct move is a forward-fix on the execution branch instead. In particular, re-creating the broad `field_media_insert` / `field_media_select` policies or re-granting `rpc_field_submit_photo` / `rpc_capture_ingest` to `public`, `anon`, `authenticated`, or `service_role` is forbidden in every rollback path.

Rollback threat/risk table:

| Rollback threat | Guard | Evidence |
|---|---|---|
| Rollback re-enables broad bucket read (`field_media_select`) | Binding constraint above; rollback scripts contain no `CREATE POLICY` for the dropped broad policies | Rollback script review record under `reports/phase0/` |
| Rollback re-grants legacy RPCs to `public`/`anon`/`authenticated`/`service_role` | Binding constraint above; grants may only be restored to named service principals via forward-fix | `\dp` / grant snapshot before and after, filed under `reports/phase0/` |
| Rollback of `0189` orphans `verified_action_context.organization_id` data | `0189` rollback runs last and only after steps 1–3; data columns are preserved, only constraints/trigger are relaxed | pgTAP rollback suite output under `reports/phase0/` |
| Partial rollback leaves policy flags and DB grants inconsistent | Strict rollback order (routes → flags → grants → migration) with a ledger entry per step | Rollback ledger under `reports/phase0/` |
| Rollback executed under time pressure skips verification | Owner order required to initiate; Section 4 counts re-run after every rollback step | Signed rollback run log under `reports/phase0/` |

## 9. Backup and Restore Evidence

- **What is backed up:** full logical dump of the affected schemas (scope tables `organization`, `site`, `membership_site`, `membership_organization`, `verified_action_context`; storage policy catalog; RPC grant catalog) taken immediately before rollout step 3 and again before step 5.
- **Where restore is rehearsed:** restores are rehearsed on a disposable staging database provisioned from the pre-step-3 dump; the rehearsal replays Section 4 verification counts against the restored copy.
- **Evidence file references (under `reports/phase0/`):**
  - `reports/phase0/backup-pre-0189-manifest.txt` — dump manifest and checksums: NOT RUN
  - `reports/phase0/backup-pre-0190-manifest.txt` — dump manifest and checksums: NOT RUN
  - `reports/phase0/restore-rehearsal-log.txt` — staging restore rehearsal log: NOT RUN
  - `reports/phase0/verification-counts.txt` — Section 4 count outputs: NOT RUN

Each evidence file status above transitions from NOT RUN only when the artifact is produced and filed; statuses are updated in a successor revision of this pack.

## 10. Forward-Fix Versus Rollback Decision Authority

- The **owner decides** whether a trigger from Section 7 is answered with a forward-fix or a rollback. No other role holds this decision.
- **Security/IAM recommends:** the Security/IAM reviewer prepares a written recommendation (forward-fix or rollback, with the Section 8 constraint check attached) for the owner.
- **No automated rollback:** no CI job, script, trigger, or agent may initiate rollback automatically. Automation may only halt forward progress and page the owner.
- Where the Section 8 binding constraint forbids a rollback path, the decision space collapses to forward-fix, and the owner's decision is limited to scheduling and scope of that forward-fix.

## 11. Recovery Test and Owner Approval

Recovery test: NOT RUN
Recovery test evidence file: `reports/phase0/recovery-test-log.txt` — status: NOT RUN
Owner approval: PENDING_OWNER_REVIEW
Owner approval record: `reports/phase0/owner-approval-record.md` — status: PENDING_OWNER_REVIEW
Security/IAM recommendation: PENDING (recommendation memo to be filed under `reports/phase0/` before owner review)

No field in this section may be left blank; each field carries an explicit status and transitions only by recorded owner or reviewer action.

---

End of English edition. Thai aligned edition: `docs/governance/repair-intelligence-phase0-migration-rollback.th.md`.
