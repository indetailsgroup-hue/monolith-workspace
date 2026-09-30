# PRD — The Complete LINE OA Communication System (MONOLITH Repair Intelligence)

> **Language:** English · Thai edition: `docs/PRD-LINE-OA.th.md` · HTML: `docs/PRD-LINE-OA.en.html` / `docs/PRD-LINE-OA.th.html`
> **Edition:** 1.3 · 30 September 2026 (1.2 = 30 Sep 2026 · 1.1 = 1 Aug 2026 · 1.0 = 26 Jul 2026)
> **What changed in 1.3:** corrected the "two repos" claim — this is one product repo with two branches; §8 question 7 became a branch integration plan with the findings on duplicated migrations and behaviour; §0 and §9 now state plainly that Phase A is not closed; added next steps with acceptance criteria; fixed citation line numbers that had drifted; re-ran the tests to confirm the evidence on 30 Sep 2026
> **Document status:** awaiting the owner's (Dave's) decisions on the open questions in §8 — no step proposed in §9 enables cron or sends messages to real customers
> **Writing rule:** every row separates "actually working / code present but not wired / spec only" and cites file:line — status verified against real code on 26 Jul, 1 Aug and 30 Sep 2026 unless marked "from the earlier audit"
> **Truth note:** older documents (`docs/LINE-Architecture-System-Complete.md:41`, `docs/PRD.md:514`) claim "LINE OA Commerce ✅ 20/20", which is overstated for the live path — this document is the more truthful status record

---

## 0. Implementation status (edition 1.3)

**P0-1 to P0-6 are implemented on the branch and have passed cross-vendor review — but Phase A is not closed**

- **Branch:** `codex/repair-intelligence-phase0-trust` · accepted commit: `46a203a6` (1 Aug 2026) · not pushed and not deployed
- **Migrations:** `0193_line_outbound_claim_and_record.sql`, `0194_line_outbound_retry_and_claim_fencing.sql`, `0195_line_outbound_timezone_safe_backoff.sql`, `0196_line_outbound_timezone_safe_sent_at.sql` plus changes to `supabase/functions/line-outbound-sender/index.ts`
- **Cross-vendor review:** rounds A1, A2 and A3 were rejected (each with file:line evidence) → round A4 received `SOL VERDICT: ACCEPT PHASE A4`
- **Evidence run by the acceptance gate itself (re-run 30 Sep 2026):** pgTAP 70/70 in a rollback wrapper (0193→0196, including tests executed under the `Asia/Bangkok` timezone) · vitest 18 files / 73 tests · no leakage into the shared stack · no `cron.schedule` in 0193–0196
- **Effect on real environments:** because nothing is deployed, every environment running the old code still has defects B1–B6

**Why Phase A is not closed:**

- **P0-9 (B8) has not been built** — and it overlaps `0175` unified ingress, reserved by branch `codex/line-trust-wave1-main`, so ownership must be decided first (§8 question 7)
- **Part of the test evidence is still outstanding:** the two-client claim race test has never actually run (the harness skips without an ephemeral stack DSN) · the Python property suites have never run (the machine used has no python) · no CI run including the `line_outbound_claim_record` suite has happened
- **Not yet integrated with the other branch of the same repo** — see the integration findings in §8

| Defect | Status as of edition 1.3 |
|---|---|
| B1 queue pickup without a lock | ✅ implemented on the branch — the sender calls `rpc_claim_line_outbound_batch` (`index.ts:740-744`), `FOR UPDATE SKIP LOCKED`, timeout-based reclaim, `claim_token` fencing — the two-client test has not been run |
| B2 service role cannot record results | ✅ implemented on the branch — service context is detected from the SQL role (`current_setting('role')`), not the JWT; user checks are not relaxed |
| B3 group rows cannot record results | ✅ implemented on the branch — LEFT JOIN + vertical from `line_groups` + the 0097 `monolith` fallback |
| B4 no transition guard | ✅ implemented on the branch — only still-`pending` rows can be recorded; finished rows return `recorded=false` with no duplicate audit |
| B5 one failure is permanently terminal | ✅ implemented on the branch — transient/permanent split + exponential backoff (1 second × 2^n, capped at 5 minutes) + a 5-attempt bound |
| B6 no cron | ⏸ deliberately not added — Phase C work awaiting §8 questions 1, 2, 4 |
| B7 blind tests | ✅ new tests hit real Postgres (pgTAP) plus tests proving the sender is wired to the RPC |
| B8 `handler_error` counted as success | 🔴 not fixed — P0-9 has not been built; overlaps line-trust `0175` |
| B9 `line-login` without state/nonce | 🔴 not fixed — in P1; overlaps line-trust `0176` |

**Not yet proven (do not overstate):** the two-client claim test · the Python property suites · CI · any real Edge Function or LINE API run · `X-Line-Retry-Key` behaviour on the LINE side is an external guarantee — the database fence alone does not stop two lease-expired workers from both reaching LINE

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
4. **No changes outside this branch** — no other checkout or worktree (including `codex/line-trust-wave1-main`) is touched in this work; integration with other branches happens only through the §8 question 7 plan after owner approval
5. **No relaxation of user-level RLS or permissions** — fixing B2 means teaching the system to recognise the service context, not removing human checks

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

| Req | Description | Acceptance criteria (tests against real Postgres, RED first) | Status (1.3) |
|---|---|---|---|
| P0-1 | **Atomic queue claim:** add `claimed_at/claimed_by` + `rpc_claim_line_outbound_batch` — `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING` (no new enum value, to avoid the `ALTER TYPE` limitation and the impact on status readers) | Two clients claiming at once → no duplicated rows; a claim stuck past the timeout → re-claimable | 🟡 implemented (0193 + sender wiring) — no evidence yet for the two-client part of the AC |
| P0-2 | **Service context can record results:** grant + teach `rpc_record_line_send_result` to recognise the service role as a system actor without relaxing user role checks | Called with the service role → recorded; a user without a role → rejected as before | ✅ implemented + pgTAP evidence (0193) |
| P0-3 | **Group rows can record results:** LEFT JOIN + take vertical/audit data from `line_groups` when `conversation_id` is NULL | A group row → recordResult succeeds with a complete audit | ✅ implemented + evidence (0193 + 0196 fallback) |
| P0-4 | **Transition guard:** results can be recorded only for rows still `pending`; finished rows → `recorded=false` no-op | Duplicate recording / a `sent`→`failed` flip → rejected, no duplicate audit | ✅ implemented + evidence (0193 + 0194 fencing) |
| P0-5 | **LINE-level dedupe:** set `X-Line-Retry-Key` = outbound id on push | Closes the duplicate-send window across a timeout (sent but recording failed) | 🟡 implemented + unit test — LINE-side behaviour not yet proven |
| P0-6 | **Bounded retry for transient failures** (following the 0084 claim v3 pattern) + dead-letter | LINE answers 5xx → retried with backoff; over the bound → `failed` with a reason | ✅ implemented + pgTAP evidence (0194–0196) |
| P0-7 | **Decide on the autonomy gate (§8 question 3) and act on it:** wire it live or remove it + correct `tasks.md:157` | No code left that claims to govern but does not | ⏸ awaiting decision 3 |
| P0-8 | **Written decisions on cron + consent (§8 questions 1, 2, 4)** before switching on real sending | The runbook lists the required crons; the consent decision is documented | ⏸ awaiting decisions 1, 2, 4 |
| P0-9 | **A failed handler must not count as processed (B8):** for `handler_error`, events whose handler failed need our own retry state (retry rows + a sweep like the 0084 claim v3) — never rely on LINE redelivery, which LINE does not guarantee — not counted as processed and never dropped by dedupe | Simulate a handler failure → the event enters an internal retry queue and is reprocessed until success or the bound → dead-letter + audit; no false success | 🔴 not built — overlaps line-trust `0175`, awaiting decision 7 |

### P1 — should follow soon

- **B9 — make staff login use state and nonce:** change `line-login` to bind a server-issued state, single use, short expiry — AC: replayed `code` or callback swap is rejected, normal login passes (P1 rather than P0 because it is the staff login path, not the customer send path; overlaps line-trust `0176` identity step-up)
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
| 7 | **Branch integration plan:** this branch (`codex/repair-intelligence-phase0-trust`) and `codex/line-trust-wave1-main` are branches of the same product repo — approve the integration order, choose the canonical tenant model, and decide ownership of the overlapping work (P0-1–P0-6 versus `0178`, P0-9 versus `0175`, B9 versus `0176`) based on the findings below | Architecture/business | P0-9, pushing/merging both branches, Phase C |

### 8.1 Branch integration findings (question 7) — checked 30 Sep 2026 from local git refs, without fetching and without touching any other worktree

| Topic | Finding |
|---|---|
| Repo | Both worktrees use the same `.git` of `determined-williams` and the same origin `github.com/indetailsgroup-hue/monolith-workspace` |
| Merge-base | `dd1119af` (18 Jul 2026) — this branch is 64 commits ahead, line-trust is 129 commits ahead |
| Against `origin/main` | local ref at `57b69513` (1 Aug 2026 — not fetched): this branch 64 ahead / 118 behind · line-trust 47 ahead / 36 behind |
| Direct migration number collisions | none — this branch has `0180`–`0196`, line-trust has `0171`–`0173` (plus `0163`, `0170` from main) |
| Migrations this branch lacks | `0163_storage_hash_verdict_semantics.sql` and `0170_factory_jobs_list_real_fields.sql` (already on main) |
| Trust Kernel `0180`–`0188` | exist only on this branch — not on main and not on line-trust |
| In-memory trial merge (`git merge-tree`) | 7 conflicting files: `.github/workflows/db-verify.yml`, `.gitignore`, `package.json`, `package-lock.json`, `server/src/api/routes/factory.ts`, `supabase/functions/factory-api/index.ts`, `supabase/functions/factory-api/index.test.ts` — `tests/line-oa-commerce/py/test_secret_non_exposure_property.py`, changed on both sides, merges cleanly |
| Broken git refs | duplicate refs `refs/heads/codex/repair-intelligence-phase0-trust (1)` and `refs/remotes/origin/main (1)` (probably created by a file-sync tool) — git warns and skips them; not deleted here, the repo owner must remove them before integrating |
| LINE runtime | line-trust does not modify `line-outbound-sender`, `line-webhook`, `line-login` or `_shared/line-oa` — no conflicts in the LINE runtime files |

**Duplicated or overlapping behaviour**

| Topic | This branch | line-trust | Integration risk |
|---|---|---|---|
| Tenant / organization / site / membership model | `monolith_tenant`, `monolith_organization`, `monolith_site`, `monolith_membership*`, `verified_action_context` (0180, 0189) | `tenants`, `organizations`, `sites`, `tenant_memberships`, `access_grants`, `auth_subjects`, `project_parties` (0171) | **Conceptual duplicate** — two sources of truth for tenancy and permissions; table names do not collide but the data would diverge; a canonical model must be chosen before integrating |
| Authority of service callers | checks the SQL role `current_setting('role')` = `service_role` (0193) | `service_principals` table + `rpc_authorize_business_action` (0173) | Two mechanisms for granting service authority — decide whether the sender must pass the 0173 policy decision |
| LINE outbound queue | claim, fencing, backoff on `line_oa_outbound_messages` (0193–0196) | not touched yet, but reserves `0178` = atomic outbox | If line-trust later builds a new outbox there will be two queue designs; and 0194 drops the 3-argument `rpc_record_line_send_result` that line-trust's schema still has |
| Failed ingest lost (B8) | P0-9 not built | reserves `0175` = unified ingress with processing state, retry, dead letter | Building both would produce two ingest retry mechanisms — needs a single owner |
| Staff login (B9) | P1 not built | reserves `0176` = identity binding + step-up | Should be done on one side only |
| Shared LINE tables | the sender reads `line_groups.vertical_context` and `line_oa_channels.channel_access_token_ref` | 0171/0172 add `tenant_id` (nullable, FK NOT VALID) to `line_oa_channels`, and `tenant_id`, `canonical_site_id` + a constraint to `line_groups` | Probably compatible because columns are only added, but unproven — this branch's pgTAP must run on the integrated schema |
| Migration number order | `0180`–`0196` | `0171`–`0173` and reserves `0174`–`0179` | If any environment applies this branch's `0180`+ first and line-trust's `0174`–`0179` arrive later, they would apply out of order — requires a line-trust amendment, or a ban on applying `0180`+ until the order is agreed |

---

## 9. Phasing

1. **Phase A — 🟡 not closed:** P0-1 to P0-6 are implemented and have passed cross-vendor review (§0), but P0-9 has not been built and part of the test evidence is outstanding — see §9.1 for the closure steps
2. **Phase B (after decision 3):** P0-7 — wire or remove the autonomy gate + correct the spec
3. **Phase C (after decisions 1, 2, 4 and after Phase A closes):** push + deploy the Phase A work, register the real cron, add the consent gate and human approval if decided → switch on customer messaging
4. **Phase D (after decisions 5, 6):** clean up the dead subsystems + admin UI

**Exit conditions for every phase:** real test output attached, no claims accepted on assertion; never log tokens; never relax security rules to make something pass; every wave passes cross-vendor review before acceptance

### 9.1 Proposed next steps to close Phase A (awaiting approval)

> **Prohibited in every step:** enabling any cron, deploying, sending messages to real customers, or pushing without the owner's approval — any new retry/sweep function is callable only from tests or by hand until Phase C

#### Step 1 — close the outstanding test evidence for P0-1 to P0-6 (can start now, independent of the decisions)

- Run `tests/line-oa-commerce/concurrency/claim-race.mjs` against an ephemeral Postgres created from zero, not the shared stack
- **Acceptance criteria:** two connections claim the same set of pending rows at once → overlapping rows = 0 and the union of claimed rows = the total row count; no objects left behind afterwards; raw output attached to the ledger
- Run the Python property suites in `tests/line-oa-commerce/py/` on a machine with python
- **Acceptance criteria:** all pass, or skip only for a clearly stated environmental reason — no skips caused by a mismatched function signature
- **Overall criterion:** the acceptance gate re-runs everything itself and gets the same result

#### Step 2 — decide the branch integration plan (§8 question 7)

- Delete the two broken git refs (done by the repo owner)
- Choose the canonical tenant model: `monolith_*` or `tenants/organizations/sites`
- Decide ownership of the overlapping work: outbound queue (0193–0196 versus 0178), ingest retry (P0-9 versus 0175), staff login (B9 versus 0176)
- Decide the migration number order (a line-trust amendment, or a temporary ban on applying `0180`+)
- **Acceptance criteria:** all four decisions recorded in writing in both Thai and English and referenced from this document

#### Step 3 — build P0-9 on the branch chosen in step 2

- **Acceptance criteria:** RED first — simulate a handler failure and prove that today it produces an inbound row + an `events_processed` increment (false success); GREEN — the failed event is not counted as processed, is not deduplicated away, enters an internal retry queue, is reprocessed until success or the bound, then goes to dead-letter with an audit entry; no reliance on LINE redelivery; no new cron; passes cross-vendor review

#### Step 4 — integrate the branches locally and verify on the integrated schema

- **Acceptance criteria:** the 7 conflicts resolved (the suite list in `db-verify.yml` must contain both sides' suites); the whole migration chain applies from zero in number order; both branches' pgTAP suites and vitest pass on the integrated schema; the integration result passes cross-vendor review before a push is requested

#### Step 5 — close Phase A

- **Acceptance criteria:** steps 1–4 pass; after the owner approves a push, CI (`db-verify.yml` including the `line_outbound_claim_record` suite) actually runs green; no cron and no customer messages — switching on real sending remains Phase C
