# MONOLITH LINE Design Approval Port A1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended after explicit execution authorization) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Goal:** Build the approved A1 `DesignApprovalPort` sandbox journey so the Design Approval preset reviews an adapter-owned revision and returns a truthful no-business-effect record without connecting to MONOLITH runtime.
- **Estimated tasks:** 8
- **Estimated time:** approximately 7–10 focused hours plus review gates
- **Touches:** Parent LineOS ES modules, standalone HTML/CSS, Node tests, bilingual documentation, and local browser evidence
- **Approved design:** `LineOS/docs/superpowers/specs/2026-08-02-monolith-line-design-approval-port-a1-design.en.md`

## Current Problem / Current Solution

The standalone Flex Studio currently runs every preset through one browser-local demo path:

`editable draft -> demo transaction -> browser confirmation -> SHA-256 Verification Receipt — Demo`

That path binds editable fixture values such as `tenantId`, recipient, target, and revision. Its labels are honest about being a demo, but it does not express the approved A1 boundary: an opaque review token, adapter-owned review snapshot, adapter-issued idempotency key, stale-revision checks, session-only duplicate suppression, and a record that explicitly has no business effect.

The nested MONOLITH repository already contains product identity, customer design-view, approval RPC, RLS, and audit substrate. A1 must not duplicate or modify it. A1 is a parent-only contract harness and remains disconnected from MONOLITH runtime.

## Proposed Approach

Add a narrow, dependency-free `DesignApprovalPort` path only for the `design-approval` preset:

1. Flex JSON carries a non-secret opaque sandbox review token in the existing URI action.
2. The Studio opens a snapshot from a sandbox adapter rather than deriving authority from editable draft fields.
3. The adapter issues the session and idempotency key, rechecks revision/version/expiry, and records one session-only attempt.
4. A separate record builder creates a deeply frozen `Sandbox Verification Record — Demo · No Business Effect` with deterministic SHA-256 integrity metadata.
5. The other four approved presets retain the existing demo journey in A1.
6. Static and browser checks prove zero external requests, no persistent secret/token storage, exact forbidden-field handling, bilingual accessibility, and unchanged nested-product scope.

No new dependency, service, generic gateway, database table, Supabase mutation, LINE SDK, credential, or production signature is introduced.

## Side by Side

| Scenario | Before | After A1 |
|---|---|---|
| Design Approval open | Review is derived from editable Flex draft values. | Review comes from `DesignApprovalPort.openReview(reviewToken)`. |
| Identity/scope display | Demo `tenantId` and recipient fields appear receipt-like. | Adapter-owned `providerContext`/`scopeContext`; no tenant assertion. |
| Confirmation | Browser confirms a local demo transaction. | Browser returns only session, adapter-issued key, expected revision, and `confirm`. |
| Duplicate submit | UI guard and local transaction binding only. | Adapter single-flight and session ledger return one stable record. |
| Revision change | Draft-value comparison only. | Adapter rechecks revision ID, manifest digest, workflow version, and expiry. |
| Receipt | `Verification Receipt — Demo`. | `Sandbox Verification Record — Demo · No Business Effect`. |
| Other presets | Existing demo journey. | Unchanged in A1. |
| MONOLITH runtime | Disconnected. | Still disconnected; contract-ready only. |

## Assumptions & Risks

- **Assumed:** Node.js 22.20.0 or newer and browser Web Crypto remain available; planning observed Node `v22.21.1` and npm `11.6.2`.
- **Assumed:** The existing five-preset Flex model, validator, shell resource allowlist, and four non-design demo journeys remain product requirements.
- **Assumed:** The A1 review token is an opaque non-secret fixture reference. It carries no customer, tenant, role, or authorization claim.
- **Assumed:** A session-only ledger may reset after reload; the UI must disclose that limitation.
- **Risk:** Two journey implementations can drift. Limit branching to one explicit preset predicate and keep shared rendering helpers small.
- **Risk:** Calling a browser digest a signature would create false authority. Schema and copy tests must reject signature/approval language.
- **Risk:** Editable draft data could accidentally re-enter the Design Approval record. Tests must mutate every draft authority-like field and prove the snapshot/record is unchanged.
- **Risk:** Concurrent confirms can race across an async digest. The adapter needs per-key single-flight behavior, not only a `Map.has` check.
- **Risk:** Parent and nested worktrees are dirty. Execution requires an isolated parent worktree and exact-path checks; nested code remains read-only.
- **Risk:** Existing documentation still describes the legacy demo path. The A1 guide must distinguish the Design Approval path from the other four presets.

## Impact

- The Design Approval preset gains the approved A1 contract and truthful sandbox semantics.
- Existing Flex generation and the other four presets remain stable.
- No customer, workflow, tenant, audit, or signing authority is added.
- The next A2 decision receives concrete contract and browser evidence rather than a generic integration abstraction.

## Execution Preconditions and Global Guards

1. REQUIRED SUB-SKILL: use `superpowers:using-git-worktrees` before Task 1. Create an isolated parent worktree from the approved starting commit. Do not create a nested-product worktree because A1 does not modify nested source.
2. Record fresh parent and nested branch, full SHA, status count, Node/npm version, and baseline LineOS test summary. Planning baseline: parent `aae611a6a`, nested `a1e9006add32`, parent 206 status entries, nested 67, LineOS 72/72 passing.
3. Preserve all unrelated changes. The nested files `supabase/functions/_shared/order-adapter.ts` and `tests/line-oa-commerce/ts/orderNormalization.property.test.ts` are explicitly outside scope.
4. Do not commit, push, merge, open a PR, deploy, send LINE messages, or use production credentials under this plan unless the owner separately authorizes that action.
5. Every production-code task must load `superpowers:test-driven-development` and show RED -> GREEN -> REFACTOR evidence.
6. Do not weaken the existing HTML resource allowlist or introduce npm dependencies.
7. All project-facing documentation must have aligned `.en.md`, `.th.md`, `.en.html`, and `.th.html` editions.
8. After Tasks 1–8, use `superpowers:requesting-code-review`, `superpowers:scrutinize`, and `superpowers:verification-before-completion` before any completion claim.

## File Map

| File | Responsibility |
|---|---|
| `LineOS/line-design-approval-contract.mjs` | Allowed shapes, forbidden authority fields, outcomes, canonical contract validation |
| `LineOS/line-design-approval-record.mjs` | Deterministic sandbox record construction, digest, deep freeze, bilingual visible rows |
| `LineOS/line-design-approval-sandbox.mjs` | A1 fixture source, review sessions, expiry/revision/version checks, idempotency and single-flight ledger |
| `LineOS/line-flex-presets.mjs` | Add the non-secret Design Approval review token only |
| `LineOS/line-flex-json.mjs` | Put the opaque token into the Design Approval URI without authority fields |
| `LineOS/line-flex-studio.mjs` | Route only Design Approval through the port; preserve four legacy journeys |
| `LineOS/line-flex-studio.html` | Static sandbox disclosure and semantic review/record hooks |
| `LineOS/line-flex-studio.css` | Trust Concierge sandbox, state, digest, and responsive styles |
| `LineOS/tests/line-design-approval-contract.test.mjs` | Contract and Flex-token RED/GREEN tests |
| `LineOS/tests/line-design-approval-record.test.mjs` | Record integrity, forbidden-field, bilingual-row tests |
| `LineOS/tests/line-design-approval-sandbox.test.mjs` | Session, stale, expiry, idempotency, replay and concurrency tests |
| `LineOS/tests/line-design-approval-security.test.mjs` | Static no-network/no-storage/forbidden-authority inventory |
| Existing LineOS tests | Regression and shell/controller integration coverage |

## Task Overview

> **For implementation tasks:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before editing production code. Each task is a RED -> GREEN -> REFACTOR slice.
> **Parallel-first:** Spawn separate sub-agents for independent lanes after explicit execution authorization. Do not parallelize tasks that can race on the same files, generated HTML, evidence artifacts, or shared tests.

1. **Contract and safe Flex review token** — Lane A | Can run together: none | Must wait for: execution preflight | TDD slice: missing contract/token tests -> minimal validators and URI token -> targeted green
2. **Sandbox verification record** — Lane B | Can run together: Task 4 | Must wait for: Task 1 | TDD slice: missing bounded record -> deterministic frozen record -> targeted green
3. **Sandbox port, ledger, and single-flight** — Lane B | Can run together: Task 4 | Must wait for: Task 2 | TDD slice: session/replay/stale/concurrency failures -> minimal adapter -> targeted green
4. **Trust Concierge sandbox shell** — Lane C | Can run together: Tasks 2–3 | Must wait for: Task 1 | TDD slice: missing semantic disclosure hooks -> minimal HTML/CSS -> structure green
5. **Design Approval controller integration** — Lane A | Can run together: none | Must wait for: Tasks 3–4 | TDD slice: legacy draft-derived journey -> preset-scoped port routing -> controller/regression green
6. **Security inventory and complete automated gate** — Lane D | Can run together: Task 7 | Must wait for: Task 5 | TDD slice: missing fail-closed inventory -> exact static/security tests and scripts -> core/full green
7. **Bilingual A1 operating guide and document contract** — Lane E | Can run together: Task 6 | Must wait for: Task 5 | TDD slice: missing A1 guide manifest -> aligned docs/HTML and contract assertions -> docs green
8. **Browser evidence, implementation report, and final review gates** — Sequential | Can run together: none | Must wait for: Tasks 6–7 | TDD slice: missing evidence/report contract -> observed artifacts and bounded report -> full post-review verification

---

### Task 1: Contract and Safe Flex Review Token

**Files:**

- Create: `LineOS/line-design-approval-contract.mjs`
- Create: `LineOS/tests/line-design-approval-contract.test.mjs`
- Modify: `LineOS/line-flex-presets.mjs:38-74`
- Modify: `LineOS/line-flex-json.mjs:3-14`
- Modify: `LineOS/tests/line-flex-json-validator.test.mjs:149-175`

**REQUIRED SUB-SKILL:** Use `superpowers:test-driven-development` for this production task.

**Parallelization:**

- Can run with: `none`
- Must wait for: isolated-worktree and baseline preflight
- Race risk: contract and URI shape are dependencies of all later tasks

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code.

- [ ] **Step 1: Write failing contract tests**

Cover these exact behaviors:

- the Design Approval preset has one opaque, non-secret `reviewToken` that carries no `tenant`, customer, role, recipient, project, or approval data;
- the built URI contains only the approved demo path, preset, and encoded review token;
- `assertReviewSnapshot` requires the approved A1 fields and exact `mode: sandbox` / `businessEffect: none`;
- nested or top-level authority fields such as tenant assertions, customer identity, approval status, signature, and key material are rejected;
- `assertConfirmReviewInput` accepts only session, adapter-issued key, expected revision, and `decision: confirm`;
- the allowed outcome registry matches the written spec exactly and is deeply frozen.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-design-approval-contract.test.mjs tests/line-flex-json-validator.test.mjs
```

Expected: FAIL because the module, token, and contract behavior are absent; existing Flex tests should continue to execute.

- [ ] **Step 3: Implement the minimum contract and URI change**

Reuse `canonicalize` and `deepFreeze` from `line-flex-model.mjs`. Do not add schema libraries. Keep the token non-editable in the Studio field list. Preserve action selection and all non-design preset JSON byte-for-byte except where existing timestamps or generated formatting make that impossible.

- [ ] **Step 4: Run GREEN and regressions**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-design-approval-contract.test.mjs tests/line-flex-json-validator.test.mjs tests/line-flex-model.test.mjs
```

Expected: all targeted tests PASS; Design Approval remains a `uri` action and no authority field enters Flex JSON.

- [ ] **Step 5: Refactor after green**

Keep validators pure, own-property based, and fail-closed. Rerun the same command.

### Task 2: Sandbox Verification Record

**Files:**

- Create: `LineOS/line-design-approval-record.mjs`
- Create: `LineOS/tests/line-design-approval-record.test.mjs`
- Read-only reference: `LineOS/line-flex-receipt.mjs`
- Read-only reference: `LineOS/line-flex-model.mjs`

**REQUIRED SUB-SKILL:** Use `superpowers:test-driven-development` for this production task.

**Parallelization:**

- Can run with: `Task 4`
- Must wait for: `Task 1`
- Race risk: none; new module and new test only

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development`.

- [ ] **Step 1: Write failing record tests**

Require the exact title `Sandbox Verification Record — Demo · No Business Effect`, exact `mode` and `businessEffect`, bounded identifiers, revision/manifest data, canonicalization version, timestamps, requested action, outcome, and SHA-256 digest. Prove:

- identical canonical inputs return identical digests;
- every bound field changes the digest;
- key order does not change the digest;
- returned records and descendants are frozen;
- record keys and visible TH/EN rows exclude approval, signature, key, tenant, token, and product-audit claims;
- rendering uses `textContent`-ready scalar values only.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-design-approval-record.test.mjs
```

Expected: FAIL because the record builder does not exist.

- [ ] **Step 3: Implement the minimum record builder**

Use browser/Node Web Crypto and the existing canonicalization helper. A digest is integrity metadata only. Do not import or call `ApprovalSigner`, LINE, Supabase, storage, or network APIs.

- [ ] **Step 4: Run GREEN**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-design-approval-record.test.mjs tests/line-flex-actions-receipt.test.mjs
```

Expected: new record tests and legacy receipt tests PASS.

- [ ] **Step 5: Refactor after green**

Keep record construction separate from DOM rendering and rerun the targeted command.

### Task 3: Sandbox Port, Ledger, and Single-Flight

**Files:**

- Create: `LineOS/line-design-approval-sandbox.mjs`
- Create: `LineOS/tests/line-design-approval-sandbox.test.mjs`
- Use: `LineOS/line-design-approval-contract.mjs`
- Use: `LineOS/line-design-approval-record.mjs`

**REQUIRED SUB-SKILL:** Use `superpowers:test-driven-development` for this production task.

**Parallelization:**

- Can run with: `Task 4`
- Must wait for: `Task 2`
- Race risk: none with Task 4; do not edit shell/controller files

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development`.

- [ ] **Step 1: Write failing adapter tests**

Build deterministic dependency injection for clock, ID factory, fixture source, and ledger. Test:

- valid/invalid review token handling without resource enumeration;
- adapter-issued session and idempotency key;
- immutable adapter-owned snapshot unaffected by editable draft data;
- exact expiry boundary and post-expiry rejection;
- stale revision ID, changed manifest, and workflow version conflict;
- same key/payload replay returns the same record;
- same key/different payload returns `idempotency_conflict`;
- `Promise.all` concurrent confirms produce one ledger entry and one stable record;
- a pre-record failure can retry with the same key;
- no browser persistence API is used and a fresh adapter starts with an empty ledger.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-design-approval-sandbox.test.mjs
```

Expected: FAIL because the adapter is absent.

- [ ] **Step 3: Implement the minimum adapter**

Expose `createSandboxDesignApprovalPort(dependencies)`. Use per-key pending-promise/single-flight state so async digest work cannot double-record. Keep fixture identity private to the adapter and return neutral bounded errors.

- [ ] **Step 4: Run GREEN**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-design-approval-sandbox.test.mjs tests/line-design-approval-record.test.mjs
```

Expected: PASS with one ledger entry in concurrent cases and no skips.

- [ ] **Step 5: Refactor after green**

Separate snapshot recheck, ledger resolution, and error mapping only if it reduces duplication. Rerun targeted tests.

### Task 4: Trust Concierge Sandbox Shell

**Files:**

- Modify: `LineOS/line-flex-studio.html:44-53`
- Modify: `LineOS/line-flex-studio.css:36-80`
- Modify: `LineOS/tests/line-flex-structure.test.mjs:208-267`

**REQUIRED SUB-SKILL:** Use `superpowers:test-driven-development` for this production task.

**Parallelization:**

- Can run with: `Tasks 2–3`
- Must wait for: `Task 1`
- Race risk: Task 5 later consumes these exact DOM hooks and must wait

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development`.

- [ ] **Step 1: Write failing semantic-shell tests**

Require local semantic elements for:

- a persistent-in-dialog `SANDBOX — NO BUSINESS EFFECT` warning;
- mode/effect provenance;
- review expiry and digest display;
- bounded outcome/error region;
- sandbox record title and disclosure;
- accessible dialog labels and live-region behavior;
- no new scripts, images, inline handlers, remote resources, or CSS URLs.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-structure.test.mjs
```

Expected: FAIL on missing sandbox hooks, not on the existing resource parser.

- [ ] **Step 3: Implement minimal HTML/CSS**

Retain the one stylesheet/one module resource allowlist. Keep warnings visually prominent at desktop and mobile widths and under reduced motion. Do not use `innerHTML` or dynamic style attributes.

- [ ] **Step 4: Run GREEN**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-structure.test.mjs
```

Expected: all structure/resource/responsive tests PASS.

- [ ] **Step 5: Refactor after green**

Consolidate only repeated sandbox style declarations and rerun the test.

### Task 5: Design Approval Controller Integration

**Files:**

- Modify: `LineOS/line-flex-studio.mjs:1-8,115-218,297-417,484-752`
- Modify: `LineOS/tests/line-flex-studio-state.test.mjs:1-106`
- Modify: `LineOS/tests/line-flex-actions-receipt.test.mjs:24-40` only if routing regression coverage needs a precise assertion
- Use: the three new Design Approval modules

**REQUIRED SUB-SKILL:** Use `superpowers:test-driven-development` for this production task.

**Parallelization:**

- Can run with: `none`
- Must wait for: `Tasks 3–4`
- Race risk: central controller and shared bilingual copy; single owner only

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development`.

- [ ] **Step 1: Write failing controller/state tests**

Add pure exported helpers where needed and prove:

- only `presetId === "design-approval"` selects the port journey;
- the four other preset IDs keep the legacy demo path;
- Design Approval visible rows come from the adapter snapshot/record, not the editable draft;
- switching preset/language, editing a field, cancelling, closing, stale error, or expiry clears the active review safely;
- adapter errors map to exact neutral TH/EN messages;
- the confirm button is busy/disabled during submission but adapter idempotency remains authoritative;
- the final title/copy is the approved sandbox record and says workflow state did not change.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-studio-state.test.mjs tests/line-design-approval-sandbox.test.mjs
```

Expected: FAIL because the controller still uses the legacy transaction for Design Approval.

- [ ] **Step 3: Implement minimal preset-scoped routing**

Allow `bindStudio(doc, options)` to accept an injected port for tests; create the default sandbox port only in browser binding. Reuse safe DOM APIs. Do not delete the legacy modules or migrate the other presets.

- [ ] **Step 4: Run GREEN and focused regression**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-studio-state.test.mjs tests/line-design-approval-contract.test.mjs tests/line-design-approval-record.test.mjs tests/line-design-approval-sandbox.test.mjs tests/line-flex-actions-receipt.test.mjs
```

Expected: all targeted tests PASS, including legacy receipt behavior.

- [ ] **Step 5: Refactor after green**

Extract only small journey-selection or row-render helpers if the controller becomes ambiguous. Rerun the same command.

### Task 6: Security Inventory and Complete Automated Gate

**Files:**

- Create: `LineOS/tests/line-design-approval-security.test.mjs`
- Modify: `LineOS/package.json:6-10`
- Modify: existing tests only where an exact new security invariant belongs

**REQUIRED SUB-SKILL:** Use `superpowers:test-driven-development` for this production task.

**Parallelization:**

- Can run with: `Task 7`
- Must wait for: `Task 5`
- Race risk: do not modify `docs-contract.test.mjs`; Task 7 owns it

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development`.

- [ ] **Step 1: Write failing inventory tests**

Recursively inspect the A1 modules and shell for:

- `fetch`, XHR, WebSocket, EventSource, `sendBeacon`, LINE SDK, Supabase, authorization headers, service keys, token logging, `localStorage`, `sessionStorage`, IndexedDB, cookies, and dynamic remote imports;
- forbidden receipt/record authority keys and production-claim copy;
- draft-to-record authority leakage;
- unclassified network-capable or persistent-storage calls;
- exact local module/resource inventory.

The test should fail closed when a synthetic unsafe fixture is introduced.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-design-approval-security.test.mjs
```

Expected: initial FAIL on missing inventory/allowlist behavior.

- [ ] **Step 3: Implement minimal tests and scripts**

Add `test:design-approval` and include the new tests in `test:core`. Do not broaden external-resource allowlists.

- [ ] **Step 4: Run GREEN and full suite**

```powershell
npm.cmd --prefix LineOS run test:design-approval
npm.cmd --prefix LineOS run test:core
npm.cmd --prefix LineOS run test
```

Expected: complete untruncated summaries, zero failures/skips/todos, and the prior 72-test baseline plus the new tests.

- [ ] **Step 5: Refactor after green**

Remove duplicate scanner code without weakening exact source inventories. Rerun all three commands.

### Task 7: Bilingual A1 Operating Guide and Document Contract

**Files:**

- Create: `LineOS/docs/guides/line-design-approval-sandbox-a1-guide.en.md`
- Create: `LineOS/docs/guides/line-design-approval-sandbox-a1-guide.th.md`
- Generate: matching `.en.html` and `.th.html`
- Modify: `LineOS/tests/docs-contract.test.mjs`
- Read: approved A1 spec and this plan

**Parallelization:**

- Can run with: `Task 6`
- Must wait for: `Task 5`
- Race risk: Task 8 later extends `docs-contract.test.mjs` and must wait

- [ ] **Step 0: Document the docs/config exception**

This task changes documentation and its executable manifest. Use a failing docs-contract assertion instead of a production-code TDD test.

- [ ] **Step 1: Add failing document-contract assertions**

Require the approved A1 spec/plan and new guide in TH/EN Markdown/HTML. Require exact statements for:

- contract-ready but runtime-disconnected status;
- Design Approval-only A1 routing;
- opaque non-secret review token;
- session-only reset limitation;
- `providerContext` rather than tenant authority;
- exact sandbox record title;
- no workflow mutation, LINE send, database write, signature, or audit claim;
- future A2 promotion gates.

- [ ] **Step 2: Run the failing contract**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
```

Expected: FAIL because the new guide editions are missing.

- [ ] **Step 3: Write aligned TH/EN guides and render HTML**

```powershell
python tools/render_docs.py LineOS/docs/guides/line-design-approval-sandbox-a1-guide.en.md LineOS/docs/guides/line-design-approval-sandbox-a1-guide.th.md LineOS/docs/superpowers/plans/2026-08-02-monolith-line-design-approval-port-a1-implementation.en.md LineOS/docs/superpowers/plans/2026-08-02-monolith-line-design-approval-port-a1-implementation.th.md
```

- [ ] **Step 4: Run docs GREEN gates**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
python tools/lint_claims.py LineOS/docs/guides/line-design-approval-sandbox-a1-guide.en.md LineOS/docs/guides/line-design-approval-sandbox-a1-guide.th.md LineOS/docs/superpowers/specs/2026-08-02-monolith-line-design-approval-port-a1-design.en.md LineOS/docs/superpowers/specs/2026-08-02-monolith-line-design-approval-port-a1-design.th.md
```

Expected: docs contract PASS; claim lint exit 0 without new debt.

- [ ] **Step 5: Verify Markdown/HTML parity**

Check language tags, headings, tables, key claims, standalone resources, trailing whitespace, and replacement characters.

### Task 8: Browser Evidence, Implementation Report, and Final Review Gates

**Files:**

- Create: `LineOS/artifacts/line-design-approval-a1/desktop-1440.png`
- Create: `LineOS/artifacts/line-design-approval-a1/mobile-390.png`
- Create: `LineOS/artifacts/line-design-approval-a1/verification-summary.json`
- Create: `LineOS/docs/reports/2026-08-02-line-design-approval-port-a1-implementation-report.en.md`
- Create: `LineOS/docs/reports/2026-08-02-line-design-approval-port-a1-implementation-report.th.md`
- Generate: matching report `.en.html` and `.th.html`
- Modify: `LineOS/tests/docs-contract.test.mjs`
- Do not modify: nested MONOLITH product source

**Parallelization:**

- Can run with: `none`
- Must wait for: `Tasks 6–7`
- Race risk: shared evidence summary, report, and docs contract require one owner

- [ ] **Step 0: Load verification and browser disciplines**

Use `superpowers:webapp-testing`, `superpowers:requesting-code-review`, `superpowers:scrutinize`, and `superpowers:verification-before-completion` at their required gates.

- [ ] **Step 1: Add failing evidence/report contract**

Extend `docs-contract.test.mjs` to require:

- exact repository commit/worktree provenance and dirty-scope disclosure;
- automated command and complete pass/fail/skip/todo counts;
- TH/EN, desktop/mobile, keyboard journey results;
- one successful sandbox confirmation, replay, stale revision, expiry, cancellation, and legacy-preset regression;
- zero external requests and zero console/page errors;
- receipt forbidden-field scan;
- nested HEAD and targeted status evidence;
- explicit `NO-GO_RUNTIME_INTEGRATION` and A2 blockers.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
```

Expected: FAIL because fresh evidence and reports do not exist.

- [ ] **Step 3: Run the complete automated suite before browser evidence**

```powershell
npm.cmd --prefix LineOS run test
python tools/lint_claims.py LineOS/docs
git diff --check
```

Record complete untruncated summaries. Do not create the JSON summary from expected values.

- [ ] **Step 4: Serve locally and collect browser evidence**

Serve `LineOS/` over localhost, not `file://`. Verify at least widths 1440 and 390 in both languages. Exercise the Design Approval success/replay/stale/expired/cancel paths, one non-design legacy journey, keyboard focus return, reduced-motion behavior, and record copy/readability. Capture every request and prove all are localhost with zero external requests. Capture console and page errors.

- [ ] **Step 5: Write observed evidence only**

Create `verification-summary.json` from observed values using `apply_patch`. Bind it to exact hashes for the two screenshots and the final source/commit snapshot. Label the record as sandbox and runtime integration as false.

- [ ] **Step 6: Write aligned implementation reports and render HTML**

Include scope, two-root provenance, changed files, TDD evidence, complete test counts, browser matrix, network record, review findings/fixes, residual risks, A2 gates, and the exact decision `NO-GO_RUNTIME_INTEGRATION`.

```powershell
python tools/render_docs.py LineOS/docs/reports/2026-08-02-line-design-approval-port-a1-implementation-report.en.md LineOS/docs/reports/2026-08-02-line-design-approval-port-a1-implementation-report.th.md
```

- [ ] **Step 7: Run review gates and fix findings test-first**

Request task-scoped code review, then whole-change scrutiny. Every accepted behavioral fix starts with or updates a failing regression test. Re-run affected targeted tests after each fix.

- [ ] **Step 8: Run the final fresh complete gate**

```powershell
npm.cmd --prefix LineOS run test
python tools/lint_claims.py LineOS/docs
git diff --check
git status --short
git -C determined-williams rev-parse HEAD
git -C determined-williams status --short
```

Expected: full LineOS suite PASS with complete counts; claim lint exit 0 without new debt; diff check silent; parent status contains only authorized A1 files plus preserved pre-existing changes; nested HEAD remains the authorized baseline and no A1 path appears there.

## Plan Validation Checklist

- [ ] Every production task has RED -> GREEN -> REFACTOR steps and an exact command.
- [ ] Tasks 2/3 and 4 have disjoint write scopes and may run concurrently; central controller work remains sequential.
- [ ] No task modifies nested product runtime, migrations, the dirty order adapter, or production credentials.
- [ ] The four legacy preset journeys remain explicit regression scope.
- [ ] Session-only replay limitation and no-business-effect copy are testable acceptance criteria.
- [ ] Record digest and production signature remain distinct.
- [ ] Tenant, customer identity, workflow status, and audit authority remain outside browser control.
- [ ] All project-facing docs are planned in TH/EN Markdown and standalone HTML.
- [ ] No task asks an implementer to commit or push.
- [ ] A2 blockers remain explicit rather than hidden inside A1 tasks.
