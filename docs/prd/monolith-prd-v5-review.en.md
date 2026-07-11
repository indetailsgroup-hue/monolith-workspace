# PRD v5.1 Review — Consolidated Review Record

Review date: 2026-07-11 · Edition: **v3.1 — Consolidated Complete Edition** (merges all review rounds v1 → v2 → v2.1 → v2.2 into a single record + scrutiny pass)
Reviewer: **AI Implementation Reviewer (Claude) — advisory review, non-authoritative**
Accountable approvers: **Product Owner, Tech Lead, Security Owner, Factory Owner** (accepting the PRD as canonical and authorizing any factory pilot are human decisions only)
Document under review: `docs/prd/monolith-complete-prd-v5.th.md` (v5.1, audited at commit `d7b1c879`)

---

## 1. Proposed Verdict (for human approval)

> **The AI reviewer recommends approving PRD v5.1 as the Target-State Canonical. It is not approved as production-ready.**
> **The Day-30 commitment is limited to closing all five P0 blockers plus one controlled factory pilot on one machine profile.**
> **All new FRs are frozen unless directly required by the pilot.**

What makes this PRD trustworthy is not its vision but its **evidence discipline**: Evidence Tiers E0-E4, a Claim Ledger, an As-Built matrix that pins blockers to file:line, a Promotion Rule, and the golden sentence in §3 (translated; Thai original is verbatim in the TH edition): *"No requirement in this PRD may be used to claim any module production-ready until code, tests, deployment evidence and operational proof support it."* — matching the system's own claim guardrails (ADR-056 marketing claim guardrails; in the same spirit as the re-quote gate in ADR-052 and human-in-loop in ADR-062).

**ADR-064** (canonical acceptance) should be created **after** the Product Owner, Tech Lead, Security Owner and Factory Owner all four sign off on this scope (S17 involves IAM, signatures and key custody — the Security Owner must co-sign) — not merely because an AI reviewer recommends it.

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

1. **Center of gravity = manufacturing truth + field execution** (§1) and the Non-Goals in §6 — matching the human-in-loop iron rules of ADR-062/063
2. **FR-03 Spatial Evidence Compiler as "evidence proposer for human verification"** — a superset of ADR-063 (step 0 = manual tracing; SpatialLM = the next step once ROI justifies)
3. **Promotion Rule §34.5** — the same "prove live before claiming" discipline used throughout this project
4. **Concept Sandbox separated from the truth chain on paper from day one** (FR-02)

## 4. Reservations / Strict Interpretations

1. **Scope trap**: 17 FRs exceed the current business stage — FR-02/03/07/17 are major new investments while the real dogfood pilot has not started → **FR freeze until the first pilot closes** (except pieces the pilot directly requires)
2. **Session/manual-test evidence counts only as `E0 candidate / REVERIFY`** — FR-13/14/16 do have real E2E runs (e.g. MCP Pending Invocation passed full-loop locally + prod smoke, Jul 10), but until artifacts are bound to commit + environment + test date in CI they do not pass the gate under the Promotion Rule. The correct work is converting that evidence into CI artifacts, not disputing the status.
3. **AB-DB-01**: psql-based testing has covered RLS/negative cases across 160+ migrations in scripted-manual form — the true gap is "no CI DB artifact", to be closed under item 2.

## 5. P0 Closure Plan — dependency-ordered (all five are hard gates before pilot; none may slip)

| Order | Work | Rationale |
| --- | --- | --- |
| 1 | **Server-owned identity** (closes AB-AUTH-01) | Everything after this must know "who acted" unspoofably first |
| 2 | **RELEASED-only invariant at every exit** (closes AB-EXP-01) | Enforced server/exporter-side at every entry point — not a UI button fix |
| 3 | **Canonical packet specification** | Define identity before implementing: `packetContentId` = hash of canonical content · `jobRunId` = per-run ID · signed identity includes released revision + machine profile version + exporter version + schema version ("project+revision" is insufficient — it collides when one revision targets multiple machines/exporter versions) |
| 4 | **Deterministic packet generation** (closes AB-PKT-01) | Control timestamps, ZIP metadata, file order, serialization per the spec in step 3 |
| 5 | **Full verifier** (closes AB-PKT-02) | Manifest per-file hashes + signature + gate/revision/machine — with a **tamper corpus** and proven fail-closed behavior |
| 6 | **Key ceremony** (closes AB-KEY-01) | Custody, rotation, revocation, ceremony evidence + negative tests — per the custody decisions in §6 |

**Realistic estimate**: ~**2 weeks implementation/integration + 2 weeks verification, dry runs and evidence** — this is not merely code changes; it includes trust-boundary changes, spoofing tests, tamper corpus and ceremony work.

## 6. Three-Track Execution Plan + Owner Decisions (Jul 11, 2026)

| Track | Executor | Work |
| --- | --- | --- |
| **A** | AI account #1 | S17-1 Server-owned identity → S17-2 RELEASED invariant |
| **B** | AI account #2 | S17-3 Canonical packet spec → S17-4 Determinism → S17-5 Full verifier |
| **Human/Ops** | Humans (starts day one — does not wait for S17-6) | Key custody, machine profile confirmation, factory slot booking, approver roster |

Worktree rule: **Tracks A/B branch clean git worktrees directly from commit `f9740559`** (= origin/main at decision time; main has since advanced with docs-only commits — verified: the entire delta is in `docs/prd/` + `tasks.md`, no code) — never from local `main`, and never share a dirty worktree.

### Key custody decisions

- The private signing key lives in a **managed KMS/HSM, non-exportable**
- **Security Owner = Key Owner** · the Tech Lead handles integration but never sees the raw private key
- create / rotate / revoke require **joint approval by Product Owner + Security Owner**
- Recovery uses **2-of-3** governance when enough humans exist; a two-person pilot may use 2-of-2 with the key still in KMS and a separate recovery procedure
- The Factory Owner approves packet use in the pilot but holds no key
- Separation-of-duties / split-knowledge references: NIST SP 800-57 Part 1 Rev.5, FIPS 140-3

### Machine profile + pilot schedule decisions

- Profile: **`kdt_mvp_v1`** (default export route; reproducible footprint as of the Jul 11 scrutiny: identifier `kdt_mvp_v1` = 7 files / 11 references in src+server code · "KDT" in any context = 82 files / 602 references, of which 26 test files / 346 references — the previously reported "8 files / ~239 refs" could not be reproduced and is withdrawn) — **only if the real machine and controller support the KDT path; never chosen merely because it has the most tests** (pending factory confirmation)
- Booked windows: **dry run/no-cut Jul 29–31, 2026 · controlled cut Aug 4–6 · recovery/re-run buffer Aug 7–9**
- **Schedule note (from scrutiny)**: the 2+2-week estimate starting Jul 11 completes ~Aug 8 — this timetable fits only if Tracks A/B truly run in parallel so implementation finishes ~Jul 25, the Jul 29–31 dry run counts as part of the verification phase, and the Aug 4–6 controlled cut lands at the very end of it (margin ≈ 0) — **if implementation slips past Jul 25, move to the Aug 7–9 buffer or rebook immediately; never compress the verification phase**

## 7. Evidence-Tier Policy for This Record

- This review document = **Git-pinned E3 synthesis** (content-addressed/tamper-evident via git + SHA-256 manifest — commits are unsigned, so not called "immutable")
- The code/tests it cites = **E0**
- The commit itself is E0 for proving *"this review content was recorded"* — not for proving *"every conclusion is correct"*
- The reviewed documents (all 5 PRD v5 files) and roadmap v1 (5 files) are in the same version control at `docs/prd/`; parent-folder copies are superseded
- **Manifest convention (from scrutiny)**: SHA-256 is computed over **LF-normalized UTF-8 bytes** · **lowercase** hex in GNU coreutils format (`<hash><space><space><filename>`) · `docs/prd/**` is forced to `text eol=lf` via `.gitattributes` so bytes are identical on every platform/checkout — previously the PRD/roadmap manifests used uppercase hex (Get-FileHash) and some HTML files were hashed from CRLF bytes, which made standard verifiers report false FAILs — now unified to one convention across the set; the `.sha256` file cannot prove itself, its integrity rests on git history

## 8. Baselines

| Item | Commit |
| --- | --- |
| Code audit baseline (PRD §34) | `d7b1c879` |
| Review v1 reference | `2ce27cbf` |
| S17 governance update | `8d42710a` |
| Review into repo (v2.1) | `8329262e` |
| PRD/roadmap into repo + custody/machine decisions (v2.2) | `c0d2b61a` |
| P0 closure commits | **none** as of v3.0 — findings remain current |

## 9. Revision History

| Edition | Substance |
| --- | --- |
| v1 | Initial review + verification of all five P0s against real code |
| v2 | Per owner meta-review round 1: AI = advisory non-authoritative · 2+2-week estimate · dependency-ordered P0s · three-layer packet identity · E0 candidate/REVERIFY · EN edition added |
| v2.1 | Round 2: review set into version control + SHA-256 manifest · verdict = "recommends approving" · Security Owner among approvers · explicit baselines · conclusions scoped to the five P0s |
| v2.2 | Round 3: correct evidence tiering (E3 synthesis / tamper-evident) · PRD v5 + roadmap v1 into the repo |
| **v3.0** | **Complete edition — all rounds merged into one record + custody / machine-profile / three-track plan / pilot schedule decisions incorporated** |
| **v3.1** | **Scrutiny pass**: §3 quote made verbatim · irreproducible KDT figures withdrawn (replaced with measured values + method) · schedule-margin note added · manifest convention specified (LF + lowercase hex) + `.gitattributes` · note that origin/main advanced after the decision (docs-only delta) · EN "customer pilot" → "pilot" |
