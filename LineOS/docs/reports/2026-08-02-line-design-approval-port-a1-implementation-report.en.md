# MONOLITH LINE Design Approval Port A1 Implementation Report

**Edition:** English
**Evidence captured:** 3 August 2026
**Evidence class:** Local sandbox contract with durable automated and browser observations

> **Decision:** `NO-GO_RUNTIME_INTEGRATION`

## Executive decision

A1 is accepted only as a governance/bootstrap-root sandbox contract harness. It demonstrates a bounded Human Surface review of an adapter-owned revision and produces a `Sandbox Verification Record — Demo · No Business Effect`.

Evidence-time decision: NO-GO_RUNTIME_INTEGRATION; runtime integration = false.

No production credential, LINE delivery, database mutation, cryptographic production signature, or production audit record was exercised.

## Scope

The verified slice is limited to the `design-approval` preset. The other four presets retain their legacy local demo journey. A1 uses a non-secret opaque review token, a session-only ledger, a deterministic integrity digest, and explicit no-business-effect copy.

This is evidence-time sandbox proof only; it is not runtime integration, production readiness, customer delivery, or approval authority.

## Two-root provenance and dirty scope

Evidence-time snapshot: base commit a816bf8d3ddc2f98c9c8e9ef42238df0593f2a8e and an immutable captured 11-path Task 8 status manifest.

The base commit must remain an existing ancestor of the current isolated-lane `HEAD`; the contract intentionally does not require the live dirty state or live `HEAD` to equal the evidence-time capture after a checkpoint commit.

| Root | Evidence-time snapshot | Live gate |
|---|---|---|
| Governance/bootstrap isolated worktree | `C:\tmp\monolith-lineos-design-approval-a1`; captured branch `codex/lineos-design-approval-a1`; captured status SHA-256 `2EE67628F4974E75167AE349D98BE680BC389DA8513D72BD45AEDE778D988157` | Base commit exists and is an ancestor; live status may become clean or move to a descendant. |
| Active nested product repository | `C:\Users\thai3\determined-williams (2)\determined-williams`; capture commit `a1e9006add32fe3ce5346eb6ca94e8bdce1d13ab`; 67 captured entries; captured status SHA-256 `7612E07AEBC75AB1269A60106976BCB0BEE1B424A42176D2A4BFCC4EA51B2998` | No live A1/LineOS-targeted path; mutable branch, commit, count, and unrelated status are not compared with the capture. |

The nested capture persists all 67 entries so its count and hash are internally reproducible. This follows `CONTEXT.md` and the 21 July 2026 repository-scope correction: the parent root cannot establish product absence, and source presence cannot establish production readiness.

## Changed files

Task 8 owns exactly these 11 paths:

1. `LineOS/tests/docs-contract.test.mjs`
2. `LineOS/tests/line-design-approval-browser-evidence.py`
3. `LineOS/artifacts/line-design-approval-a1/browser-observed.json`
4. `LineOS/artifacts/line-design-approval-a1/full-suite.junit.xml`
5. `LineOS/artifacts/line-design-approval-a1/desktop-1440.png`
6. `LineOS/artifacts/line-design-approval-a1/mobile-390.png`
7. `LineOS/artifacts/line-design-approval-a1/verification-summary.json`
8. `LineOS/docs/reports/2026-08-02-line-design-approval-port-a1-implementation-report.en.md`
9. `LineOS/docs/reports/2026-08-02-line-design-approval-port-a1-implementation-report.th.md`
10. `LineOS/docs/reports/2026-08-02-line-design-approval-port-a1-implementation-report.en.html`
11. `LineOS/docs/reports/2026-08-02-line-design-approval-port-a1-implementation-report.th.html`

No production module, nested MONOLITH source, migration, credential, or delivery configuration changed.

## TDD RED → GREEN evidence

The initial artifact/report contract RED was 87 tests: 82 passed and 5 failed as expected. The accepted-review-fix RED was 89 tests: 86 passed and 3 failed, with zero cancelled, skipped, or `todo`. The three failures were the missing schema-2 capture, immutable provenance, and new visible-report claims.

The producer-safety RED was 90 tests: 88 passed and 2 failed. It proved that canonical raw evidence had become stale and that `--help` executed a browser capture before the explicit output modes existed.

The final transactional-publish and Gate-model RED was 90 tests: 86 passed and 4 failed, with zero cancelled, skipped, or `todo`. The failures established the missing sibling staging/rollback guarantees, failure seam, explicit Gate 1 closure, and reader-visible ordered gate statuses. The focused producer regression then passed 1/1, including exact canonical byte/mtime preservation, zero staging/backup residue, and port 4179 release after the forced failure.

The canonical-LF portability RED was 91 tests: 89 passed and 2 failed, with zero cancelled, skipped, or `todo`. Its new synthetic regression passed while the stale summary/report bindings failed: representative JUnit, JSON, Python-producer, and served-source LF, CRLF, and lone-CR forms produced identical canonical-LF hashes and byte counts, while content mutation changed the hash.

GREEN requires durable raw artifacts, internally coherent evidence-time manifests, visible bilingual claims, full PNG dimensions, and derived rather than self-asserted browser aggregates.

## Automated verification

The durable successful post-review JUnit artifact is `artifacts/line-design-approval-a1/full-suite.junit.xml`: 38,260 canonical-LF bytes, canonical-LF SHA-256 `8A7384801EACA8795BC8451BFA0609108087AE0E307578D4454E31E9C2198469`, 336 `<testcase>` elements, and Node footer totals of 351 tests, 351 passed, with zero fail, cancelled, skipped, or `todo`.

The 336 XML elements and 351 Node summary tests are different reporter concepts and are both parsed by the executable contract. The stored canonical-LF hash identifies the chosen timing-dependent observed run independent of Git checkout line endings; it is not replaced by an arbitrary hexadecimal claim.

After implementing the accepted review and portability fixes, the canonical-LF docs contract passed 91/91 and the current full GREEN revalidation executed 351 tests: 351 passed, with zero fail, cancelled, skipped, or `todo`.

The durable file is the stored observed run identified above. The latest logical revalidation after final schema/report edits also returned 351/351 with the same zero-failure totals; its temporary JUnit XML is not retained because timing-only identity differs from the durable observed artifact.

Claim lint must exit 0 with no new debt, deterministic HTML rendering must match Markdown, and `git diff --check` must remain clean.

## Browser evidence matrix

The repository producer `tests/line-design-approval-browser-evidence.py` starts an in-process `ThreadingHTTPServer` on `127.0.0.1`, opens `http://localhost:4179/line-flex-studio.html` in native headless Chromium `149.0.7827.55`, waits for `networkidle`, and explicitly shuts the server down.

Each English/Thai × 1440/390 cell separates three UI-driven journeys — `success`, `cancel`, `legacy_preset` — from three in-page port-contract probes — `replay`, `stale_revision`, `expired`. The probes call the local sandbox port inside the loaded page; they are not end-to-end UI journeys.

| Language | Width | UI-driven | In-page probes | Overflow | Rows | Focus |
|---|---:|---|---|---:|---:|---|
| English | 1440 | 3/3 PASS | 3/3 PASS | 0 px | 18 | PASS |
| English | 390 | 3/3 PASS | 3/3 PASS | 0 px | 18 | PASS |
| Thai | 1440 | 3/3 PASS | 3/3 PASS | 0 px | 18 | PASS |
| Thai | 390 | 3/3 PASS | 3/3 PASS | 0 px | 18 | PASS |

Observed outcomes were `sandbox_recorded`, `cancelled_locally`, `legacy_demo_receipt`, and `sandbox_replayed`; rejection probes recorded error codes `stale_revision` and `expired`. Reduced motion was `0.01 ms`, and both success and cancel restored focus.

## Network and error evidence

Derived from 56 raw request events: external 0; failed 0; HTTP errors 0; console errors 0; page errors 0.

The raw arrays live in `artifacts/line-design-approval-a1/browser-observed.json`: 20,439 canonical-LF bytes, canonical-LF SHA-256 `B0DFF5533024445A613169A18A1BA864F0335789A55A483AF32B4DE937E008CC`. Canonical output provenance records the repository-relative directory `artifacts/line-design-approval-a1`, so the evidence remains valid across clean worktrees. The summary recomputes counts and localhost-only hosts from those arrays. Four pages each requested the same 14 local resources; no LINE, Supabase, analytics, credential, or external message endpoint was contacted.

The producer identity is 31,785 canonical-LF bytes with canonical-LF SHA-256 `8BDEA0AD16721A222E02BEA52939FA26E59681C4380FBC09B5B2009FAF9AB160`.

## Record forbidden-field scan

The observed success record was recursively scanned for the approved 22 authority-like keys. It contained zero matches and zero occurrences. The raw record inventory exposes 21 approved keys; `approvalRequestRef` remains a non-authoritative reference.

Observed record digest: `98aa18f7ac400d7739ba66b9c9dc876f5df3ffbc9a6aae582e0fb10b8b046861`.

## Screenshot and source binding

The explicitly path-sorted 14-file served-resource manifest has canonical-LF source snapshot SHA-256 `B1289E1BF03136CA4BE362B711786590B844249DBE5CAAF5C06D5F6D060D8DC4`.

The browser recapture, both screenshots, and this served-source snapshot record historical capture commit `d0d2db69c66d850871633bb62cde9ad3ee7d3964`. Commit IDs are historical metadata, not replay/rebase ancestry authority. The portable authority is the explicitly sorted manifest, its aggregate hash, and the per-file hashes that the contract recomputes from the checked-out files.

| Evidence | Dimensions | SHA-256 | Inspection |
|---|---:|---|---|
| `artifacts/line-design-approval-a1/desktop-1440.png` | 1440 × 1000 | `C1E35E86FDE474203F89393F1B6584FF728E3B519E939E766A0A9C3B780C4CB3` | PASS |
| `artifacts/line-design-approval-a1/mobile-390.png` | 390 × 844 | `7499CED9BCA4A24DB15961D4491CE23E4CE1D3D973CEC8BC2CCAA42CF61E9BD7` | PASS |

Every Git-text evidence identity and byte count uses `normalization = canonical-lf`, converting CRLF and lone CR to LF before SHA-256 and counting. PNG hashes, signatures, and dimensions use raw bytes. The contract verifies these semantics, the source snapshot, raw observation, captured-status hashes, and the syntax of historical commit identifiers without coupling validity to the current clone's ancestry.

Uncoordinated substitution is detected; coordinated edits are not signature/tamper proof.

## Review gates

The accepted Task 8 review fixes now require immutable evidence-time provenance, durable JUnit and browser artifacts, event-derived network assertions, honest UI/probe classification, reader-visible claims, exact PNG dimensions, and the approved 11-path capture.

The document contract excludes Markdown comments and fences and excludes HTML comments, scripts, and styles. English and Thai mutation fixtures prove that hidden headings, decisions, network/error evidence, runtime boundaries, and whole-claim inline code are rejected.

The producer now requires either an isolated existing `--output-dir` or explicit `--publish-canonical`. Canonical capture runs in a fresh validated sibling staging directory; the complete raw observation and both PNGs are validated before a three-file backup-and-replace transaction. Any capture, assertion, browser, server, or publish failure restores the exact prior canonical bytes and mtimes, removes staging/backup residue, and releases port 4179. `--help` exits without starting the server, browser, or writes; regression tests cover help, a rejected implicit canonical path, a forced failure after staged desktop capture, and a complete isolated temp capture.

## Residual risks

- The ledger is session-only; replay evidence resets after reload or browser restart.
- The adapter and token are local fixtures; no server-owned revision, user identity, authorization, or tenant boundary was exercised.
- The digest is integrity metadata, not a production signature.
- Replay, stale-revision, and expiry results are in-page port-contract probes, not UI journeys or deployed LIFF evidence.
- Unit/browser evidence does not prove LINE delivery, persistence, audit durability, operational recovery, or production readiness.
- The nested product remains independently dirty and needs its own current runtime, security, database, and deployment verification.

## A2 promotion gates

Gate 1 — A1 contract and browser evidence — CLOSED / SATISFIED.

Gate 2 — canonical server-owned revision source — OPEN.

Gate 3 — tenant–organization–site mapping — OPEN.

Gate 4 — customer-design-view database contract tests — OPEN.

Gate 5 — narrow LIFF confirmation transport design — OPEN.

Gate 6 — rollback, idempotency, audit, and error semantics — OPEN.

Gate 7 — local environment and secret-handling authority — OPEN.

Only Gates 2–7 remain A2 blockers. Gate 1 closes solely on fresh A1 sandbox contract, browser, task-review, and whole-scrutiny evidence; its closure does not authorize runtime integration, production readiness, customer delivery, approval authority, or A2 promotion.

## Final boundary

The defensible outcome is a durable, bilingual, browser-observed sandbox contract. The executive decision remains `NO-GO_RUNTIME_INTEGRATION`. Promotion requires separate owner approval after Gates 2–7 close with fresh evidence.
