# Session Report — LINE OA Outbound Trust + Repair Phase 0 (Wave 3.x / Phase A)

**Edition:** English
**Report compiled:** 30 September 2026
**All work committed (per git):** 1 August 2026
**Worktree:** `MONOLITH Repair Intelligence/.worktrees/repair-intelligence-phase0-trust`
**Branch:** `codex/repair-intelligence-phase0-trust` — 62 commits ahead of `main` · **not pushed anywhere**
**Repair Phase 0 status:** `EVIDENCE_INCOMPLETE` / `PENDING_OWNER_APPROVAL` — **unchanged**
**Live customer messaging:** not enabled; no cron, no activation of any kind

> **Rules held throughout:** separate "present in real code" from "spec only" on every claim · always cite `file:line` · tests passing ≠ wired into the live path · never relax a security criterion to make something pass · builder ≠ reviewer (SoD) · close work with real test output, not assertions

---

## 1. Roles and method (as the owner directed)

| Role | Who | Responsibility |
|---|---|---|
| Planner + acceptance gate | Claude | Decompose work, verify real status from code, **re-run every test independently**, commit on pass, accept no claims at face value |
| Builder | Codex | Write code/migrations/tests TDD-style (RED first) — **never commits** |
| Cross-vendor reviewer | Sol (separate Codex line) | Adversarial review before any wave is accepted — holds veto |

**Loop:** Codex builds → Claude verifies + commits → Sol reviews → on REJECT the whole round is reworked.

Key observation this round: **cross-vendor review caught something real every single time.** Of 7 waves submitted, Sol rejected 5, and every rejection carried verifiable `file:line` evidence — no vague objections.

---

## 2. Part 1 — Verifying the real state of the LINE OA system

The findings were recorded as a new PRD — Thai `docs/PRD-LINE-OA.th.md` · English `docs/PRD-LINE-OA.en.md` (now at edition 1.2, which adds the post-Phase-A status).

### 2.1 ✅ Actually working (wired, with callers on the live path)

| Capability | Evidence |
|---|---|
| Inbound: `line-webhook` forwards raw body + signature to the RPC, returns 401 on invalid signature | `supabase/functions/line-webhook/index.ts:87-127` |
| Replay protection via `webhook_event_id` UNIQUE | `00000000000022_line_oa_ingest_webhook.sql` |
| Group router (`#ผูก` bind, `#ปัญหา` issue, photos, acceptance card) | `0097_line_group_bot_flows.sql:101` |
| Fail-closed customer-group guard (non-customer templates cannot enter a customer group) | `0095_line_groups_identity.sql:102,145` + re-wire `0101_scrutiny3_fixes.sql:16` |
| Staff notifications + 1-minute cron, SKIP LOCKED, backoff, dead-letter | `0089_cron_schedules.sql:87-96`, claim v3 `0084` |
| Staff LINE Login + binding + consent | `0105_staff_bind_login.sql:86-92` |
| Token rotation cron | `0154_line_token_rotation.sql:77` |
| Enqueueing of outbound messages (~60 direct insert sites) | `0097:140`, `0098:93`, `0100:513`, `0101`, `0107`, `0111`, `0114:94`, `0127`, `0134`, `0136`, `0143` |

### 2.2 🔴 Confirmed defects (B1–B9)

| # | Defect | Evidence |
|---|---|---|
| B1 | Queue pickup had no row lock → overlapping runs duplicate sends | `line-outbound-sender/index.ts:589-602` (pre-fix) |
| B2 | **Result recording rejected for every row** — the sender uses the service role, but the RPC checked roles from JWT `app_metadata` and granted EXECUTE only to `authenticated` | `00000000000041:162`, `00000000000000_c12_foundation.sql:36`, `00000000000041:253-258` |
| B3 | Group rows could never record a result (INNER JOIN against conversations) | `00000000000041:143-148` vs `0097:140` |
| B4 | No transition guard → `sent`→`failed` flips and duplicate audit rows possible | `00000000000041:143,194-210` |
| B5 | A single send failure was permanently terminal | `00000000000041:179-199` |
| B6 | **No cron invokes the customer sender** (`line-outbound-sender`) anywhere in the repo | grep `cron.schedule` across migrations |
| B7 | Existing tests were blind to B1–B4 (all dependencies faked) | `tests/line-oa-commerce/ts/senderClaimAndRecord.integration.test.ts:43` |
| B8 | **A failed handler is counted as processed + the event is lost permanently** (`handler_error`) | `0097:281` (return), `0097:437-438` (skip list misses the prefix), `0097:454` (counts processed), `0097:429-433` (dedupe swallows redelivery) |
| B9 | `line-login` consumes no OAuth `state` / OIDC `nonce` | `supabase/functions/line-login/index.ts:2,9` |

> B8 and B9 surfaced first in the product repo's 31 July 2026 research document and were then confirmed present here as well — the defects match line-for-line, so both repos carry the same code lineage.

### 2.3 ⚫ Complete code, passing tests, **zero callers**

| Subsystem | Defined at | grep result |
|---|---|---|
| Autonomy gate + ≤200-char brand voice (`rpc_send_line_outbound`) | `00000000000040:131` | **0 callers** — referenced only in tests/spec/comments |
| Ordering (`rpc_create_line_order`, `line_oa_orders`) | `00000000000050:397` | 0 callers |
| Forecast sync (`rpc_sync_line_forecast`) | `00000000000060:88` | 0 callers |
| R-03 identity merge | `00000000000021:96` | 0 callers |
| 24-hour auto-close | `00000000000061:50` | `cron.schedule` sits inside a comment |
| TCCK vertical | spread across the schema | no wired flow |

### 2.4 📝 Spec only

- **Customer-side consent** — no column exists at all, and no pre-send consent check anywhere (staff have `identity_binding.consent_at`, `0088:10`)
- Admin UI for message templates (today templates are seeded by migration only)

### 2.5 Correcting previously overstated records

`docs/PRD.md:512` and `docs/LINE-Architecture-System-Complete.md:40` claimed "LINE OA Commerce ✅ complete 20/20", which **does not hold for the live path**. Both files (Markdown and HTML) now carry a ⚠️ banner pointing to `docs/PRD-LINE-OA.th.md` / `docs/PRD-LINE-OA.en.md`.

---

## 3. Part 2 — LINE Phase A: fixing the outbound path (owner-approved)

### 3.1 Sequence and review outcomes

| Round | Built | Commit | Sol verdict |
|---|---|---|---|
| **A1** | `0193` — claim RPC + replacement record RPC (group rows, service role, transition guard, retry bound) | `a70da502` | ❌ **REJECT** — the RPC had no caller (the sender still used the old SELECT) + P0-6 had no transient/permanent split |
| **A2** | `0194` + wired the sender to the RPC, `next_attempt_at`, `claim_token` fencing, `X-Line-Retry-Key`, suite registered in CI | `ff564c85` | ❌ **REJECT** — failure classification still wrong + backoff broken by timezone |
| **A3** | `0195` — propagate previously discarded errors, timezone-safe backoff | `1b6769ff` | ❌ **REJECT** — **over-corrected**, permanently killing the 0097 `#ผูก` onboarding flow + `sent_at` still unsafe |
| **A4** | `0196` — restore the monolith fallback for unbound groups, `sent_at := now()`, UUID guard, HTTP 408 transient | `46a203a6` | ✅ **ACCEPT PHASE A4** |

### 3.2 What is fixed on the executable path

- **B1 duplicate sends** — `claimPending` now calls `rpc_claim_line_outbound_batch` (`index.ts:676-687`); claims use `FOR UPDATE SKIP LOCKED` with timeout-based reclaim plus `claim_token` fencing so a stale lease holder cannot overwrite the current claimant.
- **B2 service role** — service context is detected from the **SQL role** (`current_setting('role')`), not the JWT, so forged JWT claims fail; the human path (governance/site access) is not relaxed at all.
- **B3 group rows** — LEFT JOIN, vertical from `line_groups` with the 0097 `monolith` fallback, NULL site in the audit row.
- **B4 transition guard** — only a still-`pending` row can be recorded; a finished row returns `recorded=false` with no duplicate audit.
- **B5 / P0-6 retry** — transient (network/timeout/5xx/429/408/lookup errors) is separated from permanent (genuinely absent config, inactive template, slot mismatch, other 4xx), with exponential backoff and a 5-attempt bound.
- **P0-5** — `X-Line-Retry-Key = outbound row id` on every push type (text/flex/image); reply is untouched because reply tokens are single-use.
- **Two timezone defects that would have been severe** — `next_attempt_at` and `sent_at` were assigned `timezone('utc', now())` (a timestamp WITHOUT time zone) into `timestamptz` columns, so east of UTC the backoff collapsed to zero and send times were stamped ~7 hours early. Both were reproduced by the gate before fixing.

### 3.3 Evidence (run independently by the gate, not the builder)

- **pgTAP 70/70** under the rollback wrapper `BEGIN; 0193; 0194; 0195; 0196; suite; ROLLBACK` — including regressions executed under `set local timezone='Asia/Bangkok'` for both backoff and `sent_at`
- **vitest: 18 files / 73 tests** passing
- **No leaks on the shared stack** (post-run column check = 0)
- **No cron** (`cron.schedule`) in 0193–0196 and no activation of live sending

### 3.4 What is **not** proven (stated by Sol — do not overstate)

- Python property suites were **never executed** (python is not installed on this machine)
- The two-client claim-race harness **skips** because it requires an explicitly designated ephemeral DSN
- **No CI run, no real Edge Function run, no real LINE API run** has happened
- LINE-side retry-key behaviour is an external guarantee — the database fence alone does not stop two lease-expired workers from both reaching LINE
- **P0-9 (B8) has not been built** (`handler_error`), although it is inside the approved Phase A scope

---

## 4. Part 3 — Repair Phase 0: Wave 3 → 3.4

| Wave | Substance | Sol verdict |
|---|---|---|
| **3** | LOW-1 organization status load-bearing, LOW-4 full sha256, accepted-risks register, negative-control harness | ❌ REJECT — (1) a context minted before org deactivation could still mutate (2) the harness overclaimed "every gate" |
| **3.1** | `0192` org+site recheck at consume time (pgTAP 18→21), honest harness, honest accepted-risks, regenerated exit review | ❌ REJECT — the final gate accepted missing reports + the exit review cited stale 18-assertion evidence |
| **3.2** | `REQUIRED_REPORT_MANIFEST` (28 reports, deleting any fails the gate), fresh 21/21 TAP, `0192` fail-fast on a divergent overload, ranges 0189–0192 | ✅ **ACCEPT** |
| **3.3** | Evidence issuer stopped hardcoding `verified:false`, `build-evidence-manifest.mjs` + CI wiring, TAP name mapping, db-verify through 0192, docs verifier covering governance docs | ❌ REJECT — (1) a self-consistent forged manifest still signed (2) the final gate accepted a bare `{"verified":true}` and ignored the evidence job result |
| **3.4** | Issuer recomputes sha256 from real report bytes + pins git/CI identity, requires `RELEASE_SIGNER_KEY_IDS` + https + distinct origins, final gate validates the attestation, conflicting TAP → `EVIDENCE_CONFLICT` | ❌ REJECT — the issuer still **does not read the meaning** of those bytes (never re-derives pass/fail counts) and does not pin itself |

**Notable environmental defect found on the way:** the shared stack (127.0.0.1:54322) carries `consume_verified_action_context(uuid,text,boolean)` from another branch, making 2-argument calls ambiguous (42725). `0192` now fails fast with an explicit message on such a database.

---

## 5. Files produced this round

| File | Purpose |
|---|---|
| `docs/PRD-LINE-OA.th.md` / `docs/PRD-LINE-OA.en.md` (+ HTML in both languages) | **PRD for the whole LINE system**, edition 1.2 — four-tier real status + post-Phase-A status + requirements + owner decisions |
| `supabase/migrations/0193_line_outbound_claim_and_record.sql` | Claim RPC + replacement record RPC |
| `supabase/migrations/0194_line_outbound_retry_and_claim_fencing.sql` | `next_attempt_at`, `p_failure_class`, `claim_token` |
| `supabase/migrations/0195_line_outbound_timezone_safe_backoff.sql` | Timezone-safe backoff |
| `supabase/migrations/0196_line_outbound_timezone_safe_sent_at.sql` | `sent_at := now()` plus a full sweep |
| `supabase/tests/line_outbound_claim_record.sql` | pgTAP, 70 assertions (incl. Asia/Bangkok regressions) |
| `supabase/functions/line-outbound-sender/index.ts` | Calls the claim RPC, classifies failures, passes the claim token, sets `X-Line-Retry-Key` |
| `tests/line-oa-commerce/ts/*.unit.test.ts` (6 new files) | Wiring / classification / fencing / retry-key / CI-registration tests |
| `tests/line-oa-commerce/concurrency/claim-race.mjs` | Two-client harness (requires an explicit ephemeral DSN) |
| `supabase/migrations/0192_repair_phase0_consume_org_recheck.sql` | Phase 0: org/site recheck at consume + fail-fast on the divergent overload |
| `scripts/trust-kernel/evidence-manifest-integrity.mjs` | Shared module keeping builder/issuer/gate derivations from drifting |
| `scripts/trust-kernel/build-evidence-manifest.mjs` | Builds EvidenceManifestV1 from the CI report tree |

---

## 6. Decisions awaiting the owner (still unanswered — not to be assumed)

| # | Question | Blocks |
|---|---|---|
| 1 | Does the real environment have a cron invoking `line-outbound-sender`? (The repo definitively has none.) | If one exists, the defect is live and the fixes need deploying urgently |
| 2 | Is human approval required before sending to customers? | P1 |
| 3 | Autonomy gate + brand voice: wire it live, or formally retire it and correct `tasks.md:157`? | P0-7 |
| 4 | Is sending to customers without a consent gate acceptable for now (PDPA)? | P0-8 / P1 |
| 5 | Dead subsystems (ordering/forecast/R-03/auto-close/TCCK): keep or remove? | P2 |
| 6 | Is an admin UI for templates needed? | P2 |
| 7 | Which repo is authoritative for the LINE subsystem (this one vs the product repo with Trust Kernel `0171–0179`)? | Cross-repo adoption of this work |

**New information on #7:** the product repo's 26 July 2026 amendment confirms the product repo owns the LINE Trust Kernel roadmap, where `0178` = atomic outbox, overlapping our P0-1. Phase A work here is therefore built as **portable per-defect patches** and does not claim reserved migration numbers.

---

## 7. Next queue

1. **P0-9 (B8)** — `handler_error` must not count as processed, and needs **its own retry state** (LINE redelivery is not guaranteed and must not be relied upon)
2. **Wave 3.5** — the issuer must re-derive pass/fail from real report bytes, pin itself and the integrity module, and require a clean tracked tree
3. **Phase C (needs answers to #1, #2, #4)** — register the real cron + consent gate + human approval before enabling customer sends
4. **Phase D (needs answers to #5, #6)** — retire or wire the dead subsystems + admin UI

---

## 8. Lessons recorded for future rounds

1. **"DB-layer batch" is not enough** — a correct RPC with no caller fixes nothing (Sol caught this at A1). Every batch must now verify its consumer.
2. **Over-cautious fixes are also dangerous** — A3 permanently killed the onboarding flow by treating "no row found" as a failure.
3. **A builder session does not die with its timeout** — the MCP call aborts at 30 minutes while the process keeps writing files, which once produced a duplicated import and edits racing the gate. Builders now write a completion sentinel and the gate waits for a stable tree before committing.
4. **The builder sandbox cannot write git worktree metadata** (`.git/worktrees`) → builders do not commit; the gate commits on their behalf and says so in every commit message.
