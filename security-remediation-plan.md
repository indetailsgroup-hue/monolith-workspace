# Security Remediation Plan — Issue #38
**Monolith Workspace · Server Dependency Vulnerabilities**
**Evidence date:** 2026-08-09 · **Plan authored:** 2026-08-28 · **Owner:** @indetailsgroup-hue

---

## Executive Summary

`npm audit --prefix server --json` identified **14 vulnerable packages** spanning **18 unique GitHub advisories** (1 critical, 5 high, 8 moderate). Based on full dependency-path tracing, **5 packages are production-reachable** and require immediate remediation. The remaining 9 are development/test-chain only and are lower urgency but still carry mandatory upgrade SLAs.

All vulnerabilities are in `server/` (`monolith-factory-server v0.13.2`). The frontend workspace has no overlapping vulnerable paths from these advisories.

---

## Priority Classification Matrix

| Tier | Criteria | Action |
|------|----------|--------|
| **P0 — Critical** | 1 CVE; direct dep; condition not yet reachable but exposure opens with any dev mistake | Upgrade within **3 days** |
| **P1 — High / Prod-Reachable** | Direct or transitive prod dep; advisory condition is in code path | Upgrade within **7 days** |
| **P2 — High / Dev-Only** | In test/build chain only; no production entrypoint import | Upgrade within **14 days** |
| **P3 — Moderate** | Low exploitability or dev-only; confirmed not reachable from prod surface | Upgrade within **30 days** |

---

## P0 — Critical (Upgrade within 3 days)

### `vitest@1.6.1` → Target: `vitest@^3.x` (or `^4.x` if compatible)
- **Advisory:** GHSA-5xrq-8626-4rwp / **CVE-2026-47429**
- **Path:** `server → vitest` (direct devDependency)
- **Current production reachability:** NOT reachable from `server/src/api` or `server/src/worker` — no entrypoint imports Vitest or Vite at runtime. The vulnerable condition (listening UI server exposed to the network) does not occur when running headlessly.
- **Risk trigger:** Any developer or CI operator who runs `vitest --ui` and exposes the port (even accidentally with `--host 0.0.0.0`) immediately opens the critical path.

**Remediation steps:**
```bash
# In server/
npm install --save-dev vitest@^3.0.0
# Run server test suite
npm run test:run
# Confirm advisory absent
npm audit --prefix server --json | jq '[.vulnerabilities | to_entries[] | select(.value.severity == "critical")]'
```

**Temporary controls (active until upgrade):**
1. All CI jobs MUST use `vitest run` (headless) — never `vitest --ui` or `vitest --reporter=html`.
2. Block port 51204 (Vitest default) in CI runner firewall rules.
3. Add a `.vitest.config.ts` override: `server: { host: '127.0.0.1' }` to prevent accidental network binding.

**Compatibility note:** Vitest 3+ is the minimum that resolves this CVE. Vitest 4 adds breaking changes to workspace resolution — run the full `test:s17-4` suite and `test:run` before merging.

---

## P1 — High, Production-Reachable (Upgrade within 7 days)

### `yauzl@3.2.0` → Target: `^3.3.0` or `^4.x` (check patch availability)
- **Advisory:** GHSA-gmq8-994r-jv83 / **CVE-2026-31988**
- **Path:** `server → yauzl` (direct production dependency)
- **Entrypoint:** `src/cli/zipExtract.ts → receiptVerify.ts`
- **Reachability:** REACHABLE when an operator runs the CLI with an operator-supplied ZIP file. An attacker who can supply the ZIP can exploit this.

**Remediation steps:**
```bash
npm install yauzl@latest --prefix server
# Verify patch
npm audit --prefix server --json | jq '.vulnerabilities.yauzl'
# Run CLI smoke test
node server/dist/cli/receiptVerify.js --help
```

**Temporary controls (active until upgrade):**
1. Only process ZIPs from trusted, internal sources (factory-generated packets).
2. Validate ZIP size before processing: reject files > 50 MB.
3. Run the CLI inside an isolated subprocess with no network access.
4. Log every ZIP path and operator identity to the audit trail before processing.

---

### `uuid@9.0.1` + `uuid@11.1.0` → Target: `uuid@^10.x` (consolidated)
- **Advisory:** GHSA-w5hq-g745-h8pq / **CVE-2026-41907**
- **Paths:** `server → uuid` (direct); `server → bullmq → uuid@11.1.0` (transitive)
- **Reachability:** UUID is used in production API and worker. Current call sites use `v4()` only. The advisory affects `v3()`, `v5()`, `v6()` when a caller-provided buffer is passed.

**Remediation steps:**
```bash
# Upgrade direct dep
npm install uuid@^10.0.0 --prefix server
# Audit transitive (bullmq ships its own uuid — will be fixed when bullmq upgrades)
npm audit --prefix server --json | jq '.vulnerabilities.uuid'
# Grep to confirm no v3/v5/v6 with buffer usage exists
grep -rn "uuid\.v[356]" server/src/
```

**Temporary control:** Prohibit `v3`, `v5`, `v6` calls with a caller-provided buffer via eslint rule in `server/eslint.config.js`.

---

### `bullmq@5.66.5` → Target: latest stable `^5.x`
- **Advisory:** Inherited GHSA-w5hq-g745-h8pq / CVE-2026-41907 (via `uuid@11.1.0`)
- **Path:** `server → bullmq → uuid@11.1.0`
- **Reachability:** BullMQ worker is a production process. The uuid advisory is inherited transitively; the specific buffer-path APIs are not called by BullMQ's public queue/worker API.

**Remediation steps:**
```bash
npm install bullmq@latest --prefix server
# Verify uuid version bundled by bullmq
npm ls uuid --prefix server
```

---

### `path-to-regexp@0.1.12` → Target: `express@5.x` (bundles patched version)
- **Advisory:** GHSA-37ch-88jc-xwx2 / **CVE-2026-4867**
- **Path:** `server → express → path-to-regexp`
- **Reachability:** Express route matching is always active. Current routes do not use the multi-parameter-per-segment pattern that triggers the advisory, but new routes added by any developer could introduce the vulnerable pattern unknowingly.

**Remediation steps:**
```bash
# Option A: Upgrade Express to v5 (ships patched path-to-regexp)
npm install express@^5.0.0 --prefix server
npm install --save-dev @types/express@^5 --prefix server
# Option B: Pin path-to-regexp directly (npm overrides)
# Add to server/package.json:
# "overrides": { "path-to-regexp": "^8.0.0" }

# Test all routes
npm run test:run --prefix server
```

**Temporary control:** Add an ESLint/custom lint rule that rejects Express route strings matching `/:param1:param2` (collocated multi-parameter) patterns.

---

## P2 — High, Development/Build Chain Only (Upgrade within 14 days)

These packages are exclusively in the test/build chain. No production API or worker imports them. Exploitation requires an attacker to compromise the developer's machine or CI environment.

| Package | Version | Advisory | Fix |
|---------|---------|---------|-----|
| `vite@5.4.21` | transitive dev | GHSA-4w7w-66w2-5vf9 (CVE-2026-39365), GHSA-v6wh-96g9-6wx3 (CVE-2026-53632), GHSA-fx2h-pf6j-xcff (CVE-2026-53571) | Resolved by upgrading `vitest` to v3+ (pulls Vite 6+) |
| `vite-node@1.6.1` | transitive dev | Inherited Vite advisories | Resolved by upgrading `vitest` |
| `esbuild@0.21.5` | transitive dev | GHSA-67mh-4wv8-2f99 | Resolved by upgrading `vitest` / `vite` |

**Single action:** All P2 items are resolved by the P0 `vitest` upgrade, since they are all pulled in through `vitest → vite → esbuild`.

---

## P3 — Moderate (Upgrade within 30 days)

| Package | Version | Advisory | CVE | Production Path | Notes |
|---------|---------|---------|-----|-----------------|-------|
| `body-parser@1.20.4` | transitive prod | GHSA-v422-hmwv-36x6 | CVE-2026-12590 | `server → express → body-parser` | Fixed limit of `50mb` means invalid-limit condition not triggered; resolved by Express v5 upgrade |
| `qs@6.14.1` | transitive prod | GHSA-w7fw-mjwx-w883 (CVE-2026-2391), GHSA-q8mj-m7cp-5q26 (CVE-2026-8723) | two | `server → express → qs` + `body-parser → qs` | App uses JSON parser only; no direct `qs.stringify`; resolved by Express v5 upgrade |
| `nanoid@3.3.11` | transitive dev | GHSA-28wg-ghj8-5hjv (CVE-2026-67214), GHSA-2v37-7h3g-55p8 (CVE-2026-67213) | two | `server → vitest → vite → postcss → nanoid` | Build/test chain only; resolved by vitest upgrade |
| `postcss@8.5.6` | transitive dev | GHSA-qx2v-qp2m-jg93 (CVE-2026-41305), GHSA-6g55-p6wh-862q (CVE-2026-45623), GHSA-r28c-9q8g-f849, GHSA-fxqj-rqcc-2cmp (CVE-2026-69153) | four | `server → vitest → vite → postcss` | Dev chain only; resolved by vitest upgrade |
| `rollup@4.55.1` | transitive dev | GHSA-mw96-cpmx-2vgc | CVE-2026-27606 | `server → vitest → vite → rollup` | Dev chain only; resolved by vitest upgrade |

**Note:** All P3 items are either resolved by the P0 vitest upgrade (dev-chain) or by the P1 Express v5 upgrade (production transitive).

---

## Consolidated Upgrade Sequence

Execute in this order to avoid regressions:

```
Step 1 (Day 1–3)   → Upgrade vitest: resolves P0 + all P2 + all P3 dev-chain items
Step 2 (Day 3–5)   → Upgrade yauzl: resolves critical CLI vulnerability
Step 3 (Day 4–6)   → Upgrade uuid + bullmq: resolves uuid buffer CVE
Step 4 (Day 5–7)   → Upgrade express to v5: resolves path-to-regexp, body-parser, qs
Step 5 (Day 7)     → Run full audit clean: `npm audit --prefix server --json`
                     Confirm: 0 critical, 0 high, 0 moderate advisories remain
Step 6 (Day 7)     → Run full test suite: `npm run test:run` + `npm run test:s17-4`
Step 7 (Day 7)     → Update `server/package-lock.json` and commit
Step 8 (Day 7)     → Close issue #38 with audit evidence attached
```

---

## Closure Criteria

Issue #38 is closed **only** when all of the following are met:

- [ ] `npm audit --prefix server --json` returns 0 critical, 0 high vulnerabilities
- [ ] All 18 GHSA advisories listed in the issue are absent from the audit output
- [ ] `server` build passes: `npm run build --prefix server`
- [ ] All server unit tests pass: `npm run test:run --prefix server`
- [ ] API/worker focused regression tests pass (job board, payment, worker queue)
- [ ] Receipt CLI regression test passes with known-good and adversarial ZIPs
- [ ] `npm audit fix --force` was NOT used — only targeted version upgrades with explicit compatibility testing
- [ ] Production-reachability re-assessment is documented (especially for express v5 migration)
- [ ] Lockfile (`server/package-lock.json`) updated and committed

---

## Governance Note

Per the issue's own governance block: **Repair Operations G−0 = DISABLED, G−1 = BLOCKED**. This plan does not authorize deployment, live migration, or production data access. All upgrades must go through the standard PR review and CI gate before merge.

---

## Open Issue Analysis — Added to Roadmap 2026-08-28

The following open GitHub issues were reviewed during the v16.8.0 deep-research pass and added to this roadmap. Neither was in the original issue #38 dependency scope, but both affect the overall security and governance posture of the Monolith Workspace.

---

### Issue #37 — ProjectContext Identity Reconciliation and Fail-Closed Enforcement
**Priority:** `P1` — Identity Security | **Labels:** `security` `P1` `identity-security` `v16.8.0`

**Type:** Security-adjacent identity seam fix

**Root Cause:**
`ProjectContext` relied on browser-generated Work Item IDs as the binding identity for `installation_projects`. This created a drift vector where a client-asserted ID diverged from the server's authoritative record. Bridge v1 exposed a `direct-create` flow that allowed authenticated users to inject arbitrary Work Item IDs into local state without server-side reconciliation.

**Security Impact (HIGH):**
- **Ambient local-state injection:** Any authenticated user who can craft a `workItemId` in browser localStorage/context can have it accepted by the server without challenge.
- **Work Item ID spoofing:** Manual ID injection enables cross-project data association, potentially leaking quotation or job data across `installation_projects` boundaries.
- **Bridge v1 exposure:** `authenticated` role retains access to `rpc_create_work_item_direct` (or equivalent) — a path that should be service-role-only.

**Fix Scope:**
1. Establishes `installation_projects` as the server-authoritative binding anchor.
2. Replaces browser-generated IDs with server-issued Work Item resolution.
3. Revokes `authenticated` role from Bridge v1 / direct-create path.
4. Adds pgTAP evidence: 79/79 ProjectContext + 11/11 workflow assertions.

**⚠️ Branch note:** Base is `codex/repair-operations-phase-a-adr` (commit `3dc814f24343feee8ad131d62a43a2768fc8a0d9`). Do NOT retarget to `main` until Phase A ADR set is complete.

**Closure Criteria:**
- [ ] 79/79 ProjectContext pgTAP assertions pass
- [ ] 11/11 workflow pgTAP assertions pass
- [ ] Bridge v1 / direct-create path revoked from `authenticated` role
- [ ] `installation_projects` FK enforced server-side (no browser-generated IDs accepted)
- [ ] Security sign-off before merge to `codex/repair-operations-phase-a-adr`

---

### Issue #31 — Kitchen Knowledge Kernel: Bootstrap Governed Reference Artifacts
**Priority:** `P3` — Architecture Governance | **Labels:** `architecture` `P3`

**Type:** Architecture / bounded-context governance (not a runtime security vulnerability)

**Scope:**
Bootstraps the Kitchen Knowledge Kernel with ADR-001/002/003/005 structural decisions, 15 bounded-context placeholder directories, Component Master with 19 `Proposed` spec entries, and 20 SKUs requiring ratification.

**Why it appears in this roadmap:**
Unverified SKU substitution without a `Ratified` spec could silently introduce untested components into production manufacturing runs. The three verifier tests (`verify:bom`, `verify:spec-completeness`, `verify:sku-registry`) are the governance gate preventing unverified specs from reaching factory workers. Until all SKUs are `Ratified` or explicitly `Deferred`, this represents an unquantified operational risk.

**Security/Governance Impact (LOW — governance-level only):**
- No runtime auth or tenant-isolation code is modified.
- Risk is incorrect component selection at the factory workflow layer, not a cryptographic or authorization failure.

**Remediation Action:**
1. All 35 Node + 27 Python + 3 verifier CI tests must pass before merge.
2. All 19 `Proposed` specs promoted to `Ratified` or marked `Deferred` before v17.0 branch cut.
3. Merge to ADR feature branch only — NOT to `main`.
4. SKU registry completeness tracked as a v17.0 pre-release gate.

**Closure Criteria:**
- [ ] 35/35 Node tests pass
- [ ] 27/27 Python tests pass
- [ ] 3/3 verifier tests pass (`verify:bom`, `verify:spec-completeness`, `verify:sku-registry`)
- [ ] All 20 SKUs have `Ratified` spec or explicit `Deferred` notation
- [ ] No `Proposed` specs unresolved at v17.0 branch cut
- [ ] Merge target is the designated ADR feature branch (NOT `main`)

---

## Rollback Migrations — CI Idempotency

Three rollback migration files were generated on 2026-08-28 to enable forward-and-back CI idempotency testing of the v16.8.0 security hardening migrations:

| File | Undoes | Key Operations |
|------|--------|----------------|
| `0173_rollback.sql` | `0173_rls_isolation_hardening.sql` | Drop 21 tenant-isolation policies; DROP org_id columns (7 tables) + indexes; DISABLE RLS on invitations/digest-queue/metrics; restore Realtime publication |
| `0174_rollback.sql` | `0174_secdef_rpc_hardening.sql` | Drop 9 org-scoped policies; DISABLE RLS on job/quotation/invoice; DROP `is_platform_super_admin()`, `rpc_approve_quotation`, `get_search_suggestions`; DROP NOT NULL on org_id (3 tables); DROP quarantine table; DROP platform_search_logs.org_id |
| `0175_rollback.sql` | `0175_child_table_rls.sql` | Drop 12 child-table policies; DISABLE RLS on job_panel/quotation_line/invoice_payment |

**⚠️ All rollback files are for CI idempotency testing only. Do NOT run on production.**
