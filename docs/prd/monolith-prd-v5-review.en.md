# PRD v5.1 Review (Evidence-Control Revision) — AI Implementation Review

Review date: 2026-07-11 (v2.2 — round 3: correct evidence tiering + PRD/roadmap into repo)
Reviewer: **AI Implementation Reviewer (Claude) — advisory review, non-authoritative**
Accountable approvers: **Product Owner, Tech Lead, Security Owner, Factory Owner** (accepting the PRD as canonical and authorizing any factory pilot are human decisions only)
Document under review: `monolith-complete-prd-v5.th.md` (v5.1, audited at commit `d7b1c879`)

---

## 1. Proposed Verdict (for human approval)

> **The AI reviewer recommends approving PRD v5.1 as the Target-State Canonical. It is not approved as production-ready.**
> **The Day-30 commitment is limited to closing all five P0 blockers plus one controlled factory pilot on one machine profile.**
> **All new FRs are frozen unless directly required by the pilot.**

What makes this PRD trustworthy is not its vision but its **evidence discipline**: Evidence Tiers E0-E4, a Claim Ledger, an As-Built matrix that pins blockers to file:line, a Promotion Rule, and the golden sentence in §3: *"No requirement in this PRD may be claimed production-ready until code, test, deployment and operational proof exist."* — exactly matching the system's own claim guardrails (ADR-052/056/062).

ADR-064 (canonical acceptance) should be created **after** the Product Owner, Tech Lead, **Security Owner** and Factory Owner sign off on this scope (S17 involves IAM, signatures and key custody — the Security Owner must co-sign) — not merely because an AI reviewer recommends it.

## 2. Blocker Verification (checked against real code)

| Blocker | Result | Implementer's note |
| --- | --- | --- |
| `AB-EXP-01` CNC export allowed at FROZEN | ✅ **Real** — `AppShell.tsx: canExport = gate OK && state !== 'DRAFT'` | **The AI reviewer's own miss** — "export at FROZEN succeeded" was even used as demo evidence; the GateToolbar CNC menu checks RELEASED correctly, but the main button does not: two doors, two rules |
| `AB-AUTH-01` role from localStorage + server trusts x-actor-role header | ✅ Real | Previously noted as latent; escalation to P0 is correct because packet store/verify now binds actor identity from client-controlled headers |
| `AB-PKT-01` random jobId + non-deterministic ZIP | ✅ Real — `job-${Date.now()}-random` | Violates our own "Manufacturing is Deterministic" |
| `AB-PKT-02` shallow server verify (whole-zip hash only) | ✅ Real — migration 0161 checks only the aggregate sha | No manifest per-file check, no signature, no gate/revision/machine-profile check |
| `AB-KEY-01` production pubkey placeholder | ✅ Real — `publicKeyBase64: ""` | The quietest danger on the list — signature scaffolding exists with an empty key |

**Conclusion: the P0 blocker entries in the As-Built matrix are corroborated against real code, all five of them.** This review did not re-audit all 17 FRs; other cells stand on the original auditor.

## 3. Strong Agreement

1. **Center of gravity = manufacturing truth + field execution** (§1) and the Non-Goals in §6 — matching the human-in-loop iron rules of ADR-062/063 word for word
2. **FR-03 Spatial Evidence Compiler as "evidence proposer for human verification"** — a superset of ADR-063 (step 0 = manual tracing; SpatialLM = the next step once ROI justifies)
3. **Promotion Rule §34.5** — the same "prove live before claiming" discipline used throughout this project
4. **Concept Sandbox separated from the truth chain on paper from day one** (FR-02)

## 4. Reservations / Strict Interpretations

1. **Scope trap**: 17 FRs exceed the current business stage — FR-02/03/07/17 are major new investments while the real dogfood pilot has not started → **FR freeze until the first customer pilot closes** (except pieces the pilot directly requires)
2. **Session/manual-test evidence counts only as `E0 candidate / REVERIFY`** — FR-13/14/16 do have real E2E runs (e.g. MCP Pending Invocation passed full-loop locally + prod smoke, Jul 10), but until artifacts are bound to commit + environment + test date in CI they do not pass the gate under the Promotion Rule. The correct work is converting that evidence into CI artifacts, not disputing the status.
3. **AB-DB-01**: psql-based testing has covered RLS/negative cases across 160+ migrations in scripted-manual form — the true gap is "no CI DB artifact", to be closed under item 2.

## 5. P0 Closure Plan — dependency-ordered (all five are hard gates before pilot; none may slip)

| Order | Work | Rationale |
| --- | --- | --- |
| 1 | **Server-owned identity** (closes AB-AUTH-01) | Everything after this must know "who acted" unspoofably first |
| 2 | **RELEASED-only invariant at every exit** (closes AB-EXP-01) | Enforced server/exporter-side at every entry point — not a UI button fix |
| 3 | **Canonical packet specification** | Define identity before implementing: `packetContentId` = hash of canonical content · `jobRunId` = per-run ID · signed identity includes released revision + machine profile version + exporter version + schema version (supersedes the v1 proposal "project+revision", which collides when one revision targets multiple machines/exporter versions) |
| 4 | **Deterministic packet generation** (closes AB-PKT-01) | Control timestamps, ZIP metadata, file order, serialization per the spec in step 3 |
| 5 | **Full verifier** (closes AB-PKT-02) | Manifest per-file hashes + signature + gate/revision/machine — with a **tamper corpus** and proven fail-closed behavior |
| 6 | **Key ceremony** (closes AB-KEY-01) | Custody, rotation, revocation, ceremony evidence + negative tests — requires an owner decision on custody |

**Realistic estimate** (corrected from v1, which underestimated): ~**2 weeks implementation/integration + 2 weeks verification, dry runs and evidence** — this is not merely code changes; it includes trust-boundary changes, spoofing tests, tamper corpus and ceremony work.

## 6. Documentation Debt

- ✅ EN edition (`monolith-prd-v5-review.en.md` / `.en.html`) — created per project documentation rules
- ✅ All four documents moved into the git repo + SHA-256 manifest (v2.1 — fixing "commit mentions but does not pin content")

## 7. Freshness Note (explicit baselines)

| Item | Commit |
| --- | --- |
| Code audit baseline (PRD §34) | `d7b1c879` |
| Review v1 reference | `2ce27cbf` |
| S17 governance update | `8d42710a` |
| P0 closure commits | **none** as of v2.1 — findings remain current |

This review set (4 files + SHA-256 manifest) is under version control at `determined-williams/docs/prd/` as of v2.1 — **correct evidence tiering: the review = Git-pinned E3 synthesis (content-addressed/tamper-evident — commits are unsigned, so not "immutable"); the code/tests it cites = E0; the commit itself is E0 for proving "this review content was recorded", not for proving "every conclusion is correct"**; parent-folder copies are superseded; the reviewed PRD v5 + roadmap v1 are now in the same repo (v2.2).
