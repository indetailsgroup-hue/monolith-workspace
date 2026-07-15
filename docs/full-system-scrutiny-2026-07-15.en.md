# MONOLITH Full-System Scrutiny

Date: 2026-07-15  
Audited revision: `077452a7cbe8714ed5ac3ed388420565bc19f252` plus the uncommitted S17 v0.4.1 control pack  
Decision: **NO-GO for production, controlled factory cutting, and a claim that dogfood has started**  
Permitted posture: **local development, automated verification, and shadow/NO_CUT preparation only**

## 1. Executive conclusion

MONOLITH is a substantial engineering codebase, not a mock-up. The root application typechecks and builds, the factory server and field app build, 4,553 Vitest assertions passed, and the browser smoke suite passed five tests. Manufacturing geometry, CNC dialects, gates, workflow controls, and packet determinism have meaningful automated coverage.

The system is nevertheless not operationally ready. The release chain is blocked by explicit governance state, an unauthenticated factory-server boundary, critical dependency advisories, broken canonical CI/test commands, an unverified field surface, signature-layer implementation fragmentation, and the absence of live deployment and real dogfood evidence. Code readiness must not be converted into production authority.

## 2. Scope and evidence

The review covered the root Designer/Factory application, `server/`, `packages/field-app/`, Supabase migrations and Edge Functions, LINE/workflow surfaces, GitHub workflows, factory packet/S17 governance, dependency installation, unit tests, builds, browser smoke tests, and local operational evidence.

Evidence was collected from the checked-out repository and read-only GitHub repository metadata. The GitHub connector returned no PR-triggered workflow run or combined status for the audited commit. This is not proof that no push-triggered workflow ever ran; it means no current external CI success could be established from the available evidence. Live Supabase, LINE, Redis, AWS KMS, CNC, GitHub Pages runtime, and customer data were not accessed.

## 3. Verification results

| Check | Result | Interpretation |
|---|---:|---|
| Root TypeScript project references | PASS | `tsc -b tsconfig.build.json` completed |
| Root production build | PASS with warnings | Large chunks and ineffective mixed static/dynamic imports remain |
| Factory server build | PASS | Server compiles after its separate dependency install |
| Field app build | PASS with warning | Tailwind reports missing/empty content configuration |
| Root Vitest command | FAIL | 4,553 tests passed in 262 files; two Node-native test files were incorrectly collected as empty Vitest suites |
| Governance tooling | PASS 5/5 | Canonical manifest writer/verifier and renderer controls passed |
| Schema bundle tooling | PASS 1/1 | Closed bundle and canonical array-order rule passed |
| Factory server test command | FAIL 13/13 | CLI runs and calls `process.exit(0)` during import; test runtime also attempts to mutate a read-only `testPath` |
| Browser smoke | PASS/PARTIAL | 5 passed, 2 skipped; no full E2E or live integration evidence |
| Dependency installation summary | FAIL release gate | Root: 21 advisories including 3 critical; server: 13 advisories including 1 critical |

The advisory counts came from reproducible lockfile installation. Detailed advisory lookup was not performed because it would disclose private-project dependency metadata to the external npm advisory endpoint without specific owner authorization.

## 4. Release-blocking findings

### FS-B0-01 — Governance and real-cut authority remain closed

The canonical packet specification is `DRAFT — NOT APPROVED — NOT FOR IMPLEMENTATION AUTHORITY`. Tech Lead, Factory Owner, and Security Owner are all PENDING. CT-DEC-002 states `Track B LOCKED` and `NO_CUT`. The real-cut gate also requires S17-1..5 closure, all ADR-064 roles, at least one full-chain dogfood job, and a calibrated machine profile. None of those conditions is evidenced as complete.

Required disposition: preserve `NO_CUT`; do not deploy or represent S17-4/S17-5 as approved implementation until the human approval matrix is complete.

### FS-B0-02 — Factory server exposes a production-blocking trust boundary

Both server entry points use unrestricted `cors()` and expose bundle, export, key, state, proof, activity, and download operations without an authentication or authorization middleware visible at the application boundary. JSON bodies allow 50 MB. The signed-URL helper silently falls back to the static secret `dev-secret-change-in-production`. One error handler returns `err.message` to callers.

If either server entry point is network reachable, an untrusted caller may exercise high-impact factory operations; the default HMAC secret also makes signed URLs forgeable. This is a production blocker even if downstream validators are correct.

Required disposition: fail startup when secrets are absent, add explicit authentication and per-operation authorization, restrict origins, rate-limit and bound uploads, redact internal errors, and test the complete boundary before deployment.

### FS-B0-03 — Canonical packet signature implementation is not converged on ADR-068

The v0.4.1 contract requires AWS KMS `ECC_NIST_P256`, `ECDSA_SHA_256`, raw 64-byte `r||s`, low-S rejection, and a non-exportable key. Active factory packet types and mock routes still declare `Ed25519`; the manufacturing verifier is Ed25519-only. A separate ECDSA implementation exists, but it generates an extractable browser key, stores private JWK material locally, and is not the AWS KMS/registry/low-S verifier defined by v0.4.1.

This is partly expected while Track B is locked, but it proves the runtime is not a v0.4.1 implementation and must not be certified as one. Legacy Ed25519 receipt/trust layers should be explicitly classified so they are not confused with the canonical factory-packet attestation layer.

Required disposition: after approval unlocks Track B, implement one packet-attestation path against AWS KMS and the pinned registry; add raw-length, low-S/high-S rejection, public-key-format, KMS non-determinism, and verifier-order tests.

### FS-B0-04 — Real dogfood has not started on auditable evidence

The repository contains a decision to start business/field dogfood in parallel and code for shadow/NOT-FOR-PRODUCTION behavior. It contains no enrolled real-house project ID, start timestamp, accountable operator, first immutable workflow event, session-evidence artifact, or completed LINE-to-acceptance chain. The PRD review explicitly states that the real dogfood pilot has not started.

Required disposition: status must remain `AUTHORIZED/PREPARED — NOT STARTED`. Start only when a real project is enrolled with an evidence ID, owner, rollback path, PDPA classification, legacy-process fallback, and first immutable event.

## 5. Critical and high findings

### FS-B1-01 — Dependency risk is above the release threshold

Lockfile installation reported three critical advisories in the root dependency graph and one critical advisory in the factory server graph, plus high and moderate advisories. The affected packages and reachability remain untriaged.

Action: with owner authorization, run advisory lookup in an approved environment, map each vulnerable path to runtime reachability, upgrade or mitigate, and pin the resulting clean evidence. Do not use `npm audit fix --force` without impact review.

### FS-B1-02 — The canonical full-verification workflow cannot be green as written

`npm run test:run` collects `scripts/governance-tooling.test.mjs` and `scripts/schema-bundle.test.mjs` as Vitest files, even though both use Node's native test runner. All 4,553 Vitest assertions pass, but the command exits non-zero due to two empty-suite failures. `.github/workflows/verify-full.yml` invokes that same command, so its E0 evidence artifact cannot truthfully represent a green full verification until runner boundaries are corrected.

Action: exclude Node-native tests from Vitest and invoke both dedicated npm scripts explicitly in CI. Include the factory server and field app as separate jobs.

### FS-B1-03 — The factory server's own test suite is nonfunctional

Importing `server/src/cli/receiptVerify.ts` immediately executes `main()` and calls `process.exit`, so the verifier is not import-safe. All 13 dedicated server tests fail; the test environment also reports mutation of a read-only `testPath`. This removes trustworthy regression coverage from a security-sensitive verifier.

Action: guard the CLI entry point, keep verification functions side-effect free, use temporary injected key registries instead of modifying production key files, align Vitest versions/configuration, and require a clean 13/13 result.

### FS-B1-04 — Field app is buildable but not verified

`packages/field-app` has no `test` script. Its build warns that Tailwind content is missing or empty, creating a risk that deployed CSS omits required classes. Offline queue, authentication callback, RLS behavior, proof binding, and close-house acceptance lack a field-app-level test gate. This matches the existing PRD classification `PARTIAL / NOT VERIFIED`.

Action: add an app-local Tailwind config, unit/component tests, offline/retry tests, authentication and RLS integration tests, and a controlled field pilot before relying on this surface.

### FS-B1-05 — Live data-plane and deployment claims are unverified

There are 174 migration files and 19 Edge Function directories, but the provisioning runbook remains a checklist and explicitly requires manual `supabase db push`, function deployment, secrets, cron, and end-to-end verification. No live migration parity, RLS probe, secret inventory, LINE webhook signature evidence, Redis worker evidence, Pages deployment evidence, or rollback drill was available.

Action: run a staging ceremony against pinned commit bytes, record migration/function parity, execute negative RLS and webhook tests, capture rollback evidence, and only then schedule a real dogfood start.

### FS-B1-06 — Governance-tool byte classification required an append-only update — REMEDIATED

CT-DEC-003 classified earlier candidate bytes, while the current manifest writer, verifier, and test harness had different hashes. The original record could not be silently rewritten. `CT-DEC-003-A1` now pins the four current tool hashes, records the independent advisory source review and reproduced 5/5 negative-test evidence, and classifies the exact bytes as official for governance-document tooling only.

Disposition: **REMEDIATED FOR THE PINNED BYTES** by `docs/governance/ct-dec-003-a1-current-governance-tool-bytes.*` and `monolith-ct-dec-003-a1-review-input.sha256`. Any byte change returns the changed tool to candidate status. This remediation does not fix the separate CI runner issue in `FS-B1-02` and does not create S17-5, Track B, production, or cutting authority.

## 6. Medium findings and engineering debt

- **FS-B2-01 — Version drift:** `server/package.json` is 0.13.2 while API responses advertise 0.10.0 and 2.0.0-p22a through two entry points. Operators cannot reliably identify the running contract.
- **FS-B2-02 — Build size:** root build emits application/vendor chunks above the 600 kB warning threshold, including an approximately 1.03 MB Three bundle and an approximately 888 kB App chunk. This is material for field connectivity and cold starts.
- **FS-B2-03 — E2E blind spots:** two smoke tests were skipped, including the export flow and OperationGraph-source assertion. The smoke suite does not exercise Supabase, LINE, server authentication, KMS, Redis, or actual packet rejection.
- **FS-B2-04 — No hermetic clean-worktree gate:** build output is tracked under `dist/`, and local verification changed generated assets and a snapshot's working-tree state. CI should build outside tracked release bytes or verify reproducible output without mutating source.
- **FS-B2-05 — Incomplete functions remain in production source:** STEP/PDF export and full drawer drill-map generation contain explicit not-implemented/TODO paths. Product claims must reflect those limits.
- **FS-B2-06 — Encoding/document hygiene:** several tracked workflow and Thai document outputs display mojibake under normal UTF-8 reading, reducing review reliability.

## 7. Strengths that should be preserved

- High automated-test density in geometry, CNC dialects, gates, connector rules, workflow authorization, audit, capture, tax, and factory packet determinism.
- Root, server, and field builds compile successfully after reproducible dependency installation.
- Governance manifest tooling is fail-closed and its tests pass.
- S17 v0.4.1 clearly pins ECDSA encoding, low-S semantics, non-determinism, public-key format, verifier order, and NO_CUT behavior.
- Browser smoke covers application load, WebGL health, X-ray mode, hardware preset behavior, and export-panel access.
- Supabase migrations show deliberate RLS, SECURITY DEFINER, service-role, and append-only audit patterns; these are good design signals, although live enforcement still needs proof.

## 8. Required order of work

1. Keep `NO_CUT`, Track B lock, and the statement that dogfood has not started.
2. Close the factory-server authentication/CORS/default-secret boundary before any network deployment.
3. Obtain owner-approved dependency advisory details and remove or mitigate critical reachable paths.
4. Repair CI runner separation and the factory-server test harness; require green root, governance, schema, server, field, build, and E2E gates.
5. Complete the three-role S17 approval matrix; only then implement the ADR-068 packet-attestation layer.
6. Create staging deployment evidence for migrations, RLS, Edge Functions, LINE, Redis, Pages, secrets, monitoring, and rollback.
7. Enroll one controlled real project and emit the first immutable dogfood event; continue with legacy factory production and shadow/NO_CUT packets.
8. Consider controlled factory cutting only after every four-condition real-cut gate is evidenced.

## 9. Final classification

| Dimension | Status |
|---|---|
| Engineering core | **SUBSTANTIAL / BUILDS / HIGH TEST DENSITY** |
| Canonical automated verification | **RED — runner wiring and server suite** |
| Security boundary | **RED — not safe for network production** |
| S17 packet authority | **DRAFT / PENDING 3 / TRACK B LOCKED / NO_CUT** |
| Field and live data plane | **PARTIAL / NOT VERIFIED** |
| Dogfood | **AUTHORIZED/PREPARED — NOT STARTED** |
| Production release | **NO-GO** |

This scrutiny is an evidence-based review, not an approval signature, security certification, production authorization, or permission to cut a real workpiece.
