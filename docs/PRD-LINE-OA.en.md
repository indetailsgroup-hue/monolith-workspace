# PRD — The Complete LINE OA Communication System (MONOLITH Repair Intelligence)

> **Language:** English · Thai edition: `docs/PRD-LINE-OA.th.md` · HTML: `docs/PRD-LINE-OA.en.html` / `docs/PRD-LINE-OA.th.html`
> **Edition:** 1.5 · 30 September 2026 (1.4, 1.3 and 1.2 = 30 Sep 2026 · 1.1 = 1 Aug 2026 · 1.0 = 26 Jul 2026)
> **What changed in 1.5:** limited the "nothing left behind" claim to the 7 values actually checked; stated the re-run limitations of the 2026-09-30 evidence bundle; added database-baseline and relative-path criteria for the next evidence bundle (edition 1.4 separated the manufacturing OS and worktree restrictions, defined `EVIDENCE_INCOMPLETE`, resolved P0-5 evidence and attached raw evidence)
> **Document status:** awaiting the owner's (Dave's) decisions on the open questions in §8 — no step proposed in §9 enables cron or sends messages to real customers
> **Writing rule:** every row separates "actually working / code present but not wired / spec only" and cites file:line, and separates evidence that is "reproducible (raw output in the repo)" from evidence that is "reported (no raw output in the repo)"
> **Truth note:** older documents (`docs/LINE-Architecture-System-Complete.md:41`, `docs/PRD.md:514`) claim "LINE OA Commerce ✅ 20/20", which is overstated for the live path — this document is the more truthful status record

---

## 0. Implementation status (edition 1.5)

**P0-1 to P0-6 are implemented on the branch and have passed cross-vendor review — but Phase A is not closed**

**Phase A evidence status:** `EVIDENCE_INCOMPLETE` — it can change only when every criterion in §9.1 passes, with no required suite skipped

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

**Why Phase A is not closed:**

- **P0-9 (B8) has not been built** — and it may overlap `0175` unified ingress planned by branch `codex/line-trust-wave1-main` (still a reservation, no code), so ownership must be decided first (§8 question 7)
- **Test evidence is outstanding:** the two-client claim race test has never actually run · the 12 required Python property suites (defined in §9.1) have never run · no CI run including the `line_outbound_claim_record` suite has happened

| Defect | Status as of edition 1.5 |
|---|---|
| B1 queue pickup without a lock | 🟡 implemented on the branch — the sender calls `rpc_claim_line_outbound_batch` (`index.ts:740-744`), `FOR UPDATE SKIP LOCKED`, timeout-based reclaim, `claim_token` fencing — two-client test evidence missing |
| B2 service role cannot record results | ✅ implemented on the branch — service context is detected from the SQL role (`current_setting('role')`), not the JWT; user checks are not relaxed |
| B3 group rows cannot record results | ✅ implemented on the branch — LEFT JOIN + vertical from `line_groups` + the 0097 `monolith` fallback |
| B4 no transition guard | ✅ implemented on the branch — only still-`pending` rows can be recorded; finished rows return `recorded=false` with no duplicate audit |
| B5 one failure is permanently terminal | ✅ implemented on the branch — transient/permanent split + exponential backoff (1 second × 2^n, capped at 5 minutes) + a 5-attempt bound |
| B6 no cron | ⏸ deliberately not added — Phase C work awaiting §8 questions 1, 2, 4 |
| B7 blind tests | ✅ new tests hit real Postgres (pgTAP) plus tests proving the sender is wired to the RPC |
| B8 `handler_error` counted as success | 🔴 not fixed — P0-9 has not been built; may overlap line-trust's reserved `0175` |
| B9 `line-login` without state/nonce | 🔴 not fixed — in P1; may overlap line-trust's reserved `0176` |

**Not yet proven (do not overstate):** the two-client claim test · the Python property suites · CI · any real Edge Function or LINE API run · `X-Line-Retry-Key` behaviour on the LINE side (moved to gate G-C1 before real sending — §9.2) — the database fence alone does not stop two lease-expired workers from both reaching LINE

**Additional defects found and fixed during Phase A:** `next_attempt_at` and `sent_at` were assigned `timezone('utc', now())` (a timestamp without time zone) into `timestamptz` columns, so in Thailand the backoff collapsed to zero and send times were recorded ~7 hours early — fixed in 0195/0196 with tests under `Asia/Bangkok`

---

## 1. Problem Statement

MONOLITH uses LINE as its main channel to customers and field technicians (Thai customers live on LINE). The inbound side (webhook, groups, acceptance cards) is fully wired with strong guards, but the outbound side to customers cannot yet be switched on: the sender (`line-outbound-sender`) has serious defects that would, if run for real, resend every message to customers in an endless loop, and nothing in the repo schedules it (no cron), while several nightly sweeps enqueue customer messages every day. If these gaps are not closed before customer messaging expands, the risk is spamming customer groups and immediate damage to brand trust.

---

## 2. Verified Status Matrix

> This section is the audit record from 26 Jul and 1 Aug 2026 (before Phase A) — for post-fix status see §0

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

### P0 — required before switching on real customer messaging (fixes B1–B8)

| Req | Description | Acceptance criteria (tests against real Postgres, RED first) | Status (1.5) |
|---|---|---|---|
| P0-1 | **Atomic queue claim:** add `claimed_at/claimed_by` + `rpc_claim_line_outbound_batch` — `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING` (no new enum value, to avoid the `ALTER TYPE` limitation and the impact on status readers) | Two clients claiming at once → no duplicated rows; a claim stuck past the timeout → re-claimable | 🟡 implemented (0193 + sender wiring) — two-client test evidence missing |
| P0-2 | **Service context can record results:** grant + teach `rpc_record_line_send_result` to recognise the service role as a system actor without relaxing user role checks | Called with the service role → recorded; a user without a role → rejected as before | ✅ implemented + pgTAP evidence (0193) |
| P0-3 | **Group rows can record results:** LEFT JOIN + take vertical/audit data from `line_groups` when `conversation_id` is NULL | A group row → recordResult succeeds with a complete audit | ✅ implemented + evidence (0193 + 0196 fallback) |
| P0-4 | **Transition guard:** results can be recorded only for rows still `pending`; finished rows → `recorded=false` no-op | Duplicate recording / a `sent`→`failed` flip → rejected, no duplicate audit | ✅ implemented + evidence (0193 + 0194 fencing) |
| P0-5 | **LINE-level dedupe:** set `X-Line-Retry-Key` = outbound id on push | Phase A (our side): every push carries the header = outbound id, reply does not; a 409 carrying `x-line-accepted-request-id` → treated as sent, not retried; a 409 without that header → permanent · Phase C (LINE side): gate G-C1 in §9.2 | ✅ our side has unit-test evidence (`senderRetryKey.unit.test.ts`, `senderFailureClassification.unit.test.ts:84`) · the LINE side moved to gate G-C1, not a Phase A closure criterion |
| P0-6 | **Bounded retry for transient failures** (following the 0084 claim v3 pattern) + dead-letter | LINE answers 5xx → retried with backoff; over the bound → `failed` with a reason | ✅ implemented + pgTAP evidence (0194–0196) |
| P0-7 | **Decide on the autonomy gate (§8 question 3) and act on it:** wire it live or remove it + correct `tasks.md:157` | No code left that claims to govern but does not | ⏸ awaiting decision 3 |
| P0-8 | **Written decisions on cron + consent (§8 questions 1, 2, 4)** before switching on real sending | The runbook lists the required crons; the consent decision is documented | ⏸ awaiting decisions 1, 2, 4 |
| P0-9 | **A failed handler must not count as processed (B8):** for `handler_error`, events whose handler failed need our own retry state (retry rows + a sweep like the 0084 claim v3) — never rely on LINE redelivery, which LINE does not guarantee — not counted as processed and never dropped by dedupe | Simulate a handler failure → the event enters an internal retry queue and is reprocessed until success or the bound → dead-letter + audit; no false success | 🔴 not built — may overlap line-trust's reserved `0175`, awaiting decision 7 |

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
| Failed ingest lost (B8) | may overlap by plan — no code on either side yet | P0-9 not built | reserves `0175` = unified ingress with processing state, retry, dead letter | building both would produce two ingest retry mechanisms — needs a single owner |
| Staff login (B9) | may overlap by plan — no code on either side yet | P1 not built | reserves `0176` = identity binding + step-up | should be done on one side only |
| Shared LINE tables | compatibility must be proven | the sender reads `line_groups.vertical_context` and `line_oa_channels.channel_access_token_ref` | 0171/0172 add `tenant_id` (nullable, FK NOT VALID) to `line_oa_channels`, and `tenant_id`, `canonical_site_id` + a constraint to `line_groups` | probably compatible because columns are only added, but unproven — this branch's pgTAP must run on the integrated schema |
| Migration number order | ordering risk | `0180`–`0196` | `0171`–`0173` and reserves `0174`–`0179` | if any environment applies this branch's `0180`+ first and line-trust's `0174`–`0179` arrive later, they would apply out of order — requires a line-trust amendment, or a ban on applying `0180`+ until the order is agreed |

---

## 9. Phasing

1. **Phase A — 🟡 not closed:** evidence status `EVIDENCE_INCOMPLETE` — P0-1 to P0-6 are implemented and have passed cross-vendor review (§0), but P0-9 has not been built and test evidence is outstanding — see §9.1 for the closure steps
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

#### Step 1 — close the outstanding test evidence for P0-1 to P0-6 (can start now, independent of the decisions)

- Run `tests/line-oa-commerce/concurrency/claim-race.mjs` against an ephemeral Postgres created from zero, not the shared stack
- **Acceptance criteria:** two connections claim the same set of pending rows at once → overlapping rows = 0 and the union of claimed rows = the total row count; no objects left behind afterwards
- **Required Python suites:** every file in `tests/line-oa-commerce/py/` that references `rpc_record_line_send_result`, `rpc_claim_line_outbound_batch` or `line_oa_outbound_messages` — 12 files as checked on 30 Sep 2026: `test_access_control_config_smoke.py`, `test_ai_action_audit_property.py`, `test_failure_handling_property.py`, `test_idempotent_processing_property.py`, `test_outbound_status_recording_property.py`, `test_reply_push_fallback_property.py`, `test_rls_read_scoping_property.py`, `test_schema_structure_smoke.py`, `test_secret_non_exposure_property.py`, `test_signature_verification_property.py`, `test_strict_consistency_property.py`, `test_unauthorized_mutation_denial_property.py`
- **Acceptance criteria:** all 12 files must actually run and pass — if a required suite is skipped for any reason (including environmental reasons), the reason may be recorded but it does not count as passing; the evidence status stays `EVIDENCE_INCOMPLETE` and step 5 cannot close

#### Step 2 — decide the branch integration plan (§8 question 7)

- Delete the two duplicate-name git refs (done by the repo owner)
- Choose the canonical tenant model: `monolith_*` or `tenants/organizations/sites`
- Decide ownership of the work that may overlap: outbound queue (0193–0196 versus 0178), ingest retry (P0-9 versus 0175), staff login (B9 versus 0176)
- Decide the migration number order (a line-trust amendment, or a temporary ban on applying `0180`+)
- Decide who resolves the conflicts in the 3 manufacturing OS factory files — not this work, per §4 non-goal 4
- **Acceptance criteria:** all five decisions recorded in writing in both Thai and English and referenced from this document

#### Step 3 — build P0-9 on the branch chosen in step 2

- **Acceptance criteria:** RED first — simulate a handler failure and prove that today it produces an inbound row + an `events_processed` increment (false success); GREEN — the failed event is not counted as processed, is not deduplicated away, enters an internal retry queue, is reprocessed until success or the bound, then goes to dead-letter with an audit entry; no reliance on LINE redelivery; no new cron; passes cross-vendor review

#### Step 4 — integrate the branches locally and verify on the integrated schema (only after the step 2 decisions)

- **Acceptance criteria:** the 4 shared-infrastructure conflicts resolved (the suite list in `db-verify.yml` must contain both sides' suites); the 3 manufacturing OS factory conflicts resolved by whoever the decision names, not by this work; the whole migration chain applies from zero in number order; both branches' pgTAP suites and vitest pass on the integrated schema; the integration result passes cross-vendor review before a push is requested

#### Step 5 — close Phase A

- **Acceptance criteria:** steps 1–4 pass with no required suite skipped; after the owner approves a push, CI (`db-verify.yml` including the `line_outbound_claim_record` suite) actually runs green; only then can the evidence status leave `EVIDENCE_INCOMPLETE` — the LINE-side behaviour of P0-5 is not a Phase A closure criterion (it is gate G-C1 in §9.2); no cron and no customer messages

### 9.2 Gates before real sending (Phase C)

- **G-C1 — confirm the retry key on the LINE side (P0-5):** check `X-Line-Retry-Key` behaviour on a LINE test channel: send the same push twice with the same retry key to an internal test recipient who is not a customer — **Acceptance criteria:** the recipient receives the message once; the second request returns HTTP 409 with `x-line-accepted-request-id`; the queue row is recorded as `sent` exactly once; raw output attached in the §9.1 format — requires the owner's approval before running, and no customer channel or customer recipient may be used
