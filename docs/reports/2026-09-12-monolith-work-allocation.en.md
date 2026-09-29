# MONOLITH — SciSpace and Codex work allocation

12 September 2026 · EN · Management recommendation based on inspected work

**Recommendation:** SciSpace leads research, requirements reconciliation, SOPs and supplier knowledge. Codex coordinates the engineering backlog, verifies source and tests, implements agreed changes and prepares integration. The owner decides business scope and accepts operational results. Preserve and reuse the code SciSpace has already delivered.

This document allocates work for review. No assignment message was sent to SciSpace, no running task was interrupted, and no repository permission, production setting or approval was changed.

## Evidence boundary

The signed-in SciSpace Monolith folder showed **9 chats, 10 notebooks and 0 files in the folder's Files tab**. Chat attachments exist separately. The latest visible activity or summary in all 9 chats was inspected; notebook titles were inventoried. Full chat histories, all notebook contents and attached archives were not audited.

Both local Git roots were checked separately, with CONTEXT and the 21 July scope correction read:

| Source | Revision / scope | Existing changes |
|---|---|---|
| Parent governance root, `C:/Users/thai3/determined-williams (2)` | `aa1b30e509ece9d8efad3d68e949860aa79bdecf`, `guardrails/claim-linters`; roadmap and intake evidence | 11 tracked changes; 591 untracked entries before this report |
| Nested product root, `determined-williams/` | `9c4bee6759f6d1919a320a2f56088ce683287f58`, `fix/dxf-truth-chain`; separate active product repository | 22 tracked changes; 61 untracked entries; preserved |
| GitHub remote | `1c554a3cdf33c43ae4971ce1b984d39572f5d47a`; CI snapshot at approximately 07:47 ICT | Current integration evidence below; distinct from both local revisions |

No new runtime tests were run for this allocation. Source presence, a passing workflow and operational acceptance are separate states. The current CI findings refer to GitHub remote, not either older local checkout.

## What the actual SciSpace work shows

| Inspected chat | Latest visible work | Recommended handoff |
|---|---|---|
| [MONOLITH Manufacturing OS](https://scispace.com/chat/8fe0bb23-1325-4cf5-98c5-5e05b740286f) | Sprint 15, Team Pulse Check migration/types/store and Sentiment Timeline admin work; reports commit `8387a825` | Preserve the implementation. SciSpace supplies user requirements; Codex verifies and continues UI/tests against the existing contract |
| [Security Audit Session Roadmap](https://scispace.com/chat/240be26b-287a-4ada-8ab0-f181ffe8e788) | Root test repairs and exclusions; pending security-report updates | Codex owns test coverage and security evidence; SciSpace updates the narrative from verified results |
| [Integrated Operational Framework](https://scispace.com/chat/80c1d8ef-3d73-41ac-ad74-c890b6e278cd) | Round 23 database fixes and Round 24 handoff, alongside SOP artifacts | SciSpace owns SOP consistency. Codex reconciles the old technical backlog with current commits before implementation |
| [Elastic Monolith Review](https://scispace.com/chat/c8c7d395-868d-488f-835e-caafa146e675) | A newer 36-file reconciliation package and dashboard; CON-013 still shown blocked; PFMEA and programme items shown closed | SciSpace reconciles this newer package with the intake. Codex verifies source links and implementation implications; retain actual owner decisions with their evidence |
| [Barausse Manual Guide](https://scispace.com/chat/abcf131c-4325-49f4-af02-38af4d5555d6) | SC-17/18 domain-verification documents and central index; reports publication pending | SciSpace hands over the package and provenance; Codex checks the remote before importing anything |
| [Modular Monolithic Furniture](https://scispace.com/chat/e677e193-a431-48b9-96e6-96c81c07d9ae) | Blum BOM, comparison, RFQ and checklist; reports local commit `573cf73` with push pending | SciSpace verifies product facts and commercial assumptions; Codex checks publication and document compatibility. “Ready to push” is not remote acceptance |
| [Here are the thread names 1 Fix Missing](https://scispace.com/chat/770b95f7-6594-426b-81a3-fb1bba44d646) | Secret-name/hook work and a request for a LINE Notify token | Codex reconciles current workflow configuration. Replace the obsolete LINE Notify task; credentials go through account settings, never chat |
| [ระบบ accounting ในระบบ Monolith การจัดการบัญชีแบบรวมศูนย์](https://scispace.com/chat/0ea95798-2ce9-467d-a450-6e7c8b5962b1) | Actively following CI at inspection time | Receive its current engineering handoff; do not allocate by the accounting title alone |
| [Supplier Portal (พอร์ทัลซัพพลายเออร์ หรือ Vendor Portal) ของ Monolith ทั้งระบบ](https://scispace.com/chat/883b1d71-3e68-4f56-9ee6-be3b5612814f) | TPC database-policy fix `1c554a3c` and active CI polling | Preserve the fix and receive the handoff; supplier-portal completion cannot be inferred from this chat title |

## Start with these work packages

Priorities express order, not promised dates. “Owner” below is the proposed lead for the work, not an appointment of a named human approver.

| ID / priority | Lead | Deliverable | Completion evidence |
|---|---|---|---|
| O-01 / immediate | Account owner, Codex supporting | Revoke or rotate the GitHub credentials visibly exposed in SciSpace command history; restore required connections through secure settings | Owner records completion without publishing values; required access checked. Current token validity was not tested |
| C-01 / P1 | Codex | Map each test group to its runtime/configuration and CI trigger; correct exclusions or dedicated runners where needed | Every affected group has an executable lane, nonzero expected tests and retained results at the same revision; preserve the existing edge empty-suite guard |
| C-02 / P1 | Codex | Prepare PR #106 against current main, preserving SciSpace changes and checking lint/allowlist policy changes | Reviewable combined candidate, fresh relevant checks, no lost changes. Keep integration separate from operational release |
| C-03 / P1 | Codex; SciSpace supplies notification needs | Repair billing-report workflow configuration and design a supported notification path | Report generation works independently of notification delivery; selected channel has tested failure handling. Any real message requires an authorized recipient and send |
| C-04 / P2 | Codex | Diagnose the reported Chromatic component error | Explain the actual component failure and validate the fix; do not accept a baseline merely to hide an error |
| C-05 / next agreed product slice | Codex; SciSpace requirements | TPC user interface and tests using the existing store/schema, if retained in the selected delivery scope | Plan gating, response permission, DRAFT→ACTIVE→CLOSED, failure/rollback and tenant boundaries covered; UI and user acceptance linked |
| S-01 / P1, parallel | SciSpace; Codex verifies evidence | One source index and corrected decision/status register covering the newer package | Source/version and disposition for every SC-01–18 stream; resolve stale CON-013 using the existing roadmap; reconcile closed items with recorded decisions and scope |
| S-02 / P1, parallel | SciSpace; architecture/product owner decides | AIE/GAP semantic matrix, namespace glossary and VS-01 naming proposal | Preserve all distinct capabilities; distinguish SOP S17 from manufacturing S17-1…5; no automatic GAP-16 or silently retired requirement; versioned decision before dependent implementation |
| S-03 / before pilot implementation | SciSpace; Codex implements/tests | Pilot SOP, agent/API requirements and field/PFMEA action table | Inputs, outputs, roles, retry, escalation, evidence and acceptance examples specified; distinguish classify/notify/halt/resume per domain; Codex traces consumers and tests boundaries 7/8/9 |
| S-04 / conditional on pilot | SciSpace; domain owner reviews; Codex imports | Barausse/Blum source register, BOM and installation checklist | Supplier-native codes, source edition, units, rights and compatibility reviewed; dimensions/quantities and actual costs confirmed by responsible people; remote import tracked |
| S-05 / business or later phase | SciSpace; owner prioritizes | BOI/business evidence, research, training and later AI/knowledge requirements | Current primary sources and explicit assumptions; Codex provides demonstrated product facts. External commitments and programme closure require the appropriate owner decision |

## Why the engineering queue changed

At the pinned main snapshot, [Full Verify](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34662443159), [FPR](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34662443157) and [DB Verify](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34662443140) succeeded. [pgTAP](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34662443146) was still running. [Billing](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34662442748) failed with no job listed. These are dated observations, not an “all green” declaration.

- **Test coverage needs verification:** [ecf48605](https://github.com/indetailsgroup-hue/monolith-workspace/commit/ecf48605a3981e50419d3a59e941e9982de6ba25) added broad `tests/**`, `supabase/**` and `entitlement-db/**` exclusions. The inspected [workflow test](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c554a3cdf33c43ae4971ce1b984d39572f5d47a/tests/workflow/ts/captureMediaWorker.unit.test.ts) uses Vitest. [Edge](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c554a3cdf33c43ae4971ce1b984d39572f5d47a/.github/workflows/edge-fn-verify.yml) and [entitlement](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c554a3cdf33c43ae4971ce1b984d39572f5d47a/.github/workflows/entitlement-db-verify.yml) workflows also invoke Vitest without an explicit alternative config. This source-level mismatch warrants C-01; it is not a fresh reproduction of every affected lane.
- **Avoid duplicate repairs:** EST and TPC `user_profiles` references were already changed upstream. Reconcile the old 33 root failures with upstream fixes and coverage before assigning them again. [PR #106](https://github.com/indetailsgroup-hue/monolith-workspace/pull/106) remains Draft/Open at `43ed3720`, behind main; one open PR and zero open issues were found in this snapshot. Open-issue count is not the project backlog count.
- **Billing needs a current channel:** the [workflow](https://github.com/indetailsgroup-hue/monolith-workspace/blob/1c554a3cdf33c43ae4971ce1b984d39572f5d47a/.github/workflows/billing-report.yml) references secrets in conditions and LINE Notify. The precise startup failure annotation was not verified. LINE officially ended Notify on **31 March 2025**; obtaining a new Notify token is not a viable task. See the [LINE announcement](https://developers.line.biz/en/news/2025/04/01/line-notify/).
- **Other scoped evidence:** [Chromatic run](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34662132678/job/103466643573) reported one component error at `8387a825`. The inspected `src/culture-metrics` tree at main contains TPC types/store but no dedicated TPC UI/story/test; this is a scoped finding, not a whole-repository absence claim.
- **Credential exposure:** live command history displayed GitHub credentials. Their validity and any misuse are unknown. Revoke/rotate them without copying values into reports or messages, consistent with [GitHub guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

## Shared working agreement

1. Use one backlog with work ID, lead, reviewer, source revision, affected files, dependencies, status and acceptance evidence. SciSpace's chat title is not the work ID.
2. Let running SciSpace engineering tasks finish or reach a handoff before another agent writes the same files. Record their final revision and unfinished work. This review did not stop them.
3. SciSpace may provide code or prototypes in an isolated, task-specific branch. Codex reviews, tests and prepares integration through a PR. Recommend one integration coordinator; no direct simultaneous editing of main and no duplicate migration allocation.
4. Every handoff contains the artifact/source version, what changed, what remains uncertain, decisions already authorized, expected tests and the next recipient. Never include credentials.
5. Use explicit states: proposed, active, delivered for review, verified, accepted. A generated document, local commit, successful upload or selected passing tests does not alone establish programme completion.
6. Produce project documents in TH/EN Markdown and matching standalone HTML. SciSpace owns content quality; Codex checks source links and technical assertions before publication.

The owner selects the pilot and field-app path, accepts the canonical AIE/GAP map, confirms domain-specific PFMEA rules, budgets and real manufacturing acceptance. Prepare concrete options and evidence before requesting those decisions. Continue independent R0 work while decisions are pending. Later AI expansion remains in R5 unless an accepted pilot dependency changes the order.

## Coverage of the existing roadmap

S-01 covers SC-01/04/08 and CON-011/013. S-02 covers SC-03/05/06/07/15 and CON-001–010. S-03 covers SC-02/03/09/10/11/12/13/14 and CON-012. S-04 covers SC-17/18 and the newly inspected Blum handoff. S-05 covers SC-16 and later research/training/AI scope. C-01–05 implement and verify the applicable delivery work; this mapping does not promise to build every historical proposal.

Read together with the [delivery roadmap](../roadmap/2026-09-11-monolith-delivery-roadmap.en.md), [intake corrections](2026-09-11-scispace-reconciliation-intake.en.md) and repository-scope correction (`docs/reports/2026-07-21-ima-schelling-monolith-repository-scope-correction.en.md`; local source in the parent governance root).

The newer 36-file SciSpace package has not been equated with the earlier six-file intake or assigned its hash. Reported PFMEA approvals and programme closure must be reconciled with their actual decision records; neither their presence nor absence is inferred from a chat summary.

[Thai edition](2026-09-12-monolith-work-allocation.th.md)
