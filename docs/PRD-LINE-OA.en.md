# PRD — The Complete LINE OA Communication System (MONOLITH Repair Intelligence)

> **Language:** English · Thai edition: `docs/PRD-LINE-OA.th.md` · HTML: `docs/PRD-LINE-OA.en.html` / `docs/PRD-LINE-OA.th.html`
> **Edition:** 1.2 · 30 September 2026 (1.1 = 1 Aug 2026 · 1.0 = 26 Jul 2026)
> **What changed in 1.2:** added §0 implementation status after Phase A, added a status column to the §6 P0 table, corrected the guard evidence filename in §2.1, marked the B1 evidence as pre-fix code, added the amendment information to question 7 — the original §2 findings are kept intact as the verification record
> **Document status:** awaiting the owner's (Dave's) decisions on the open questions in §8 before Phases B–D
> **Writing rule:** every row separates "actually working / code present but not wired / spec only" and cites file:line — status verified against real code on 26 Jul and 1 Aug 2026 unless marked "from the earlier audit"
> **Truth note:** older documents (`docs/LINE-Architecture-System-Complete.md:40`, `docs/PRD.md:512`) claim "LINE OA Commerce ✅ 20/20", which is overstated for the live path — this document is the more truthful status record

---

## 0. Implementation status (edition 1.2)

**Phase A (P0-1 to P0-6) is built and has passed cross-vendor review — but only on a branch: not pushed and not deployed**

- **Branch:** `codex/repair-intelligence-phase0-trust` · accepted commit: `46a203a6` (1 Aug 2026)
- **Migrations:** `0193_line_outbound_claim_and_record.sql`, `0194_line_outbound_retry_and_claim_fencing.sql`, `0195_line_outbound_timezone_safe_backoff.sql`, `0196_line_outbound_timezone_safe_sent_at.sql` plus changes to `supabase/functions/line-outbound-sender/index.ts`
- **Cross-vendor review:** rounds A1, A2 and A3 were rejected (each with file:line evidence) → round A4 received `SOL VERDICT: ACCEPT PHASE A4`
- **Evidence run by the acceptance gate itself:** pgTAP 70/70 in a rollback wrapper (0193→0196, including tests executed under the `Asia/Bangkok` timezone) · vitest 18 files / 73 tests · no leakage into the shared stack · no `cron.schedule` in 0193–0196
- **Effect on real environments:** because nothing is deployed, every environment running the old code still has defects B1–B6

| Defect | Status as of edition 1.2 |
|---|---|
| B1 queue pickup without a lock | ✅ fixed on the branch — the sender calls `rpc_claim_line_outbound_batch` (`index.ts:676-687`), `FOR UPDATE SKIP LOCKED`, timeout-based reclaim, `claim_token` fencing |
| B2 service role cannot record results | ✅ fixed on the branch — service context is detected from the SQL role (`current_setting('role')`), not the JWT; user checks are not relaxed |
| B3 group rows cannot record results | ✅ fixed on the branch — LEFT JOIN + vertical from `line_groups` + the 0097 `monolith` fallback |
| B4 no transition guard | ✅ fixed on the branch — only still-`pending` rows can be recorded; finished rows return `recorded=false` with no duplicate audit |
| B5 one failure is permanently terminal | ✅ fixed on the branch — transient/permanent split + exponential backoff (1 second × 2^n, capped at 5 minutes) + a 5-attempt bound |
| B6 no cron | ⏸ deliberately not added — Phase C work awaiting §8 questions 1, 2, 4 |
| B7 blind tests | ✅ new tests hit real Postgres (pgTAP) plus tests proving the sender is wired to the RPC |
| B8 `handler_error` counted as success | 🔴 not fixed — P0-9 has not been built |
| B9 `line-login` without state/nonce | 🔴 not fixed — in P1 |

**Not yet proven (do not overstate):** Python property suites were never executed (the machine used has no python) · the two-client claim race test was skipped because it requires an explicitly designated ephemeral stack DSN · no CI run, real Edge Function run or real LINE API run has happened · `X-Line-Retry-Key` behaviour on the LINE side is an external guarantee — the database fence alone does not stop two lease-expired workers from both reaching LINE

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
| B8 | **A failed handler is counted as processed and the event is lost forever** — `fn_line_handle_group_event` catches the exception and returns `'handler_error:...'`, but the ingest skip list does not include that prefix → the inbound row, audit entry and `events_processed` count are written as normal, and because the inbound row now exists, a LINE redelivery is dropped as a duplicate → the failed event disappears permanently while being reported as success (first found in the product repo's 31 Jul 2026 research, confirmed in this repo on 1 Aug) | `0097:281` (return), `0097:437-438` (skip list), `0097:454` (counts processed), `0097:429-433` (dedupe) |
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
4. **No changes to the manufacturing OS repo** — a separate system
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

| Req | Description | Acceptance criteria (tests against real Postgres, RED first) | Status (1.2) |
|---|---|---|---|
| P0-1 | **Atomic queue claim:** add `claimed_at/claimed_by` + `rpc_claim_line_outbound_batch` — `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING` (no new enum value, to avoid the `ALTER TYPE` limitation and the impact on status readers) | Two clients claiming at once → no duplicated rows; a claim stuck past the timeout → re-claimable | ✅ on the branch (0193 + sender wiring) — the two-client test has not been run |
| P0-2 | **Service context can record results:** grant + teach `rpc_record_line_send_result` to recognise the service role as a system actor without relaxing user role checks | Called with the service role → recorded; a user without a role → rejected as before | ✅ on the branch (0193) |
| P0-3 | **Group rows can record results:** LEFT JOIN + take vertical/audit data from `line_groups` when `conversation_id` is NULL | A group row → recordResult succeeds with a complete audit | ✅ on the branch (0193 + 0196 fallback) |
| P0-4 | **Transition guard:** results can be recorded only for rows still `pending`; finished rows → `recorded=false` no-op | Duplicate recording / a `sent`→`failed` flip → rejected, no duplicate audit | ✅ on the branch (0193 + 0194 fencing) |
| P0-5 | **LINE-level dedupe:** set `X-Line-Retry-Key` = outbound id on push | Closes the duplicate-send window across a timeout (sent but recording failed) | ✅ on the branch — LINE-side behaviour not yet proven |
| P0-6 | **Bounded retry for transient failures** (following the 0084 claim v3 pattern) + dead-letter | LINE answers 5xx → retried with backoff; over the bound → `failed` with a reason | ✅ on the branch (0194–0196) |
| P0-7 | **Decide on the autonomy gate (§8 question 3) and act on it:** wire it live or remove it + correct `tasks.md:157` | No code left that claims to govern but does not | ⏸ awaiting decision 3 |
| P0-8 | **Written decisions on cron + consent (§8 questions 1, 2, 4)** before switching on real sending | The runbook lists the required crons; the consent decision is documented | ⏸ awaiting decisions 1, 2, 4 |
| P0-9 | **A failed handler must not count as processed (B8):** for `handler_error`, events whose handler failed need our own retry state (retry rows + a sweep like the 0084 claim v3) — never rely on LINE redelivery, which LINE does not guarantee — not counted as processed and never dropped by dedupe | Simulate a handler failure → the event enters an internal retry queue and is reprocessed until success or the bound → dead-letter + audit; no false success | 🔴 not built |

### P1 — should follow soon

- **B9 — make staff login use state and nonce:** change `line-login` to bind a server-issued state, single use, short expiry — AC: replayed `code` or callback swap is rejected, normal login passes (P1 rather than P0 because it is the staff login path, not the customer send path, but it blocks the trustworthiness of identity/audit and must be done soon)
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
| 7 | **Two-repo coordination:** the LINE code in this repo and in the product repo (`determined-williams`, worktree `line-trust-wave1-main`) share one lineage (defects match line-for-line, e.g. `0097:281`) — which repo is authoritative for the LINE subsystem: fix here and port, wait for the Trust Kernel, or keep them independent? | Architecture/business | Does not block Phase A, but blocks merging or adopting the work across repos |

**Additional information for question 7:** the product repo's amendment plan (26 Jul 2026, `docs/superpowers/plans/2026-07-26-line-trust-kernel-wave-1-amendment.th.md`) confirms that the product repo owns the LINE Trust Kernel roadmap — it allocates `0171`–`0174` to Wave 1 and reserves `0175`–`0179`, where `0178` = atomic outbox, which overlaps our P0-1. Phase A work in this repo therefore uses numbers `0193`–`0196` (outside the reserved band) and is built as clean per-defect patches so it can be ported.

---

## 9. Phasing

1. **Phase A — ✅ built on the branch except P0-9:** P0-1 to P0-6 have passed cross-vendor review (§0); P0-9 remains — built as portable patches (migration + a clean diff per defect) so no work is wasted if decision 7 makes the product repo authoritative
2. **Phase B (after decision 3):** P0-7 — wire or remove the autonomy gate + correct the spec
3. **Phase C (after decisions 1, 2, 4):** push + deploy the Phase A work, register the real cron, add the consent gate and human approval if decided → switch on customer messaging
4. **Phase D (after decisions 5, 6):** clean up the dead subsystems + admin UI

**Exit conditions for every phase:** real test output attached, no claims accepted on assertion; never log tokens; never relax security rules to make something pass; every wave passes cross-vendor review before acceptance
