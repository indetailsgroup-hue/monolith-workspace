# Dependency Advisory Triage — MONOLITH (FS-B1-01)

Date: 2026-07-16 · Authorized by: Tech Lead (owner) · Method: `npm audit` on the
pinned lockfiles (root + `server/`), then per-advisory runtime-reachability mapping.

> Evidence record. Advisory identifiers are public; no PII. `npm audit` sends the
> dependency manifest to the npm advisory endpoint — run with explicit owner
> authorization.

## 1. Headline

**No critical or high advisory reaches the production runtime (the shipped client
bundle).** Every critical/high finding is in **dev/build tooling** or an
**unreachable transitive dependency**. They are dev supply-chain hygiene, not a
production release blocker on their own — but every available fix is a **breaking
major upgrade**, so they must be remediated in a controlled, test-validated
upgrade, never a blind `npm audit fix --force`.

## 2. Advisory counts (from the pinned lockfiles)

| Graph | critical | high | moderate | low | total |
| --- | ---: | ---: | ---: | ---: | ---: |
| root | 3 | 8 | 9 | 1 | 21 |
| server | 1 | 3 | 9 | 0 | 13 |

## 3. Reachability map — critical/high (root)

| Package | Sev | Classification | Production-runtime reachable? |
| --- | --- | --- | --- |
| `vitest`, `@vitest/ui`, `@vitest/coverage-v8` | critical | devDependency (test runner) | **No** — not shipped. RCE advisory needs the Vitest API/UI server running + visiting a malicious site (dev machine only). |
| `vite` | high | devDependency (dev server + bundler) | **No** — dev server / build only; the deployed app is static assets. |
| `rollup` | high | transitive of vite (bundler) | **No** — build-time only. |
| `ws` | high | transitive of vite (HMR socket) | **No** — dev server only. |
| `minimatch`, `picomatch` | high | transitive of build/test tooling | **No** — build/test glob matching. |
| `flatted`, `tmp` | high | transitive of vitest/tooling | **No** — dev/test only. |
| `xlsx@0.18.5` | high (**no fix**) | transitive of `@daph/vault-builder` (internal tool) | **No** — 0 imports in `src/**`, absent from `dist/`; used only by the internal vault-builder tool on trusted repo files. |

## 4. Reachability map — critical/high (server)

| Package | Sev | Classification | Reachable? |
| --- | --- | --- | --- |
| `vitest` | critical | devDependency | **No** — test runner. |
| `vite`, `rollup` | high | dev/build tooling | **No** — build-time. |
| `path-to-regexp` | high | transitive (express routing) | **Deferred** — the factory server is not production-deployed (FS-B0-01 NO_CUT / Track B locked); the boundary is fail-closed (FS-B0-02). Remediate before any real deployment. |

## 5. Why not `npm audit fix --force` now

`npm audit fix` (non-force, SemVer-safe) resolves **none** of the critical/high —
all require breaking majors:

- `vite@5 → vite@8.1.5` (major; would break the build config + the manualChunks
  tuning just landed in FS-B2-02, and the vitest/@vitejs/plugin-react pairing)
- `vitest` breaking upgrade (risks the 4570-test suite + the fs config)
- `xlsx → exceljs@3.4.0` (a different library; API rewrite in vault-builder)

Forcing these unreviewed would very likely red the build and the full test suite.

## 6. Recommendation

1. **Do not treat these as a production-release blocker on their own** — no
   critical/high reaches the shipped runtime (Section 3–4).
2. **Controlled dev-tooling upgrade (separate, test-validated effort)**: bump
   `vite` + `vitest` + `@vitejs/plugin-react` together to the current patched
   line, then re-run typecheck + full suite (4570) + `db-verify` / `e2e-verify` /
   `mcp-smoke` / `edge-fn-verify` + a `vite preview` smoke, and re-tune
   manualChunks if the bundler config changed. Gate on all green.
3. **`xlsx`**: since it is only in the internal vault-builder on trusted inputs
   and not shipped, keep it tracked; migrate to `exceljs` (or a maintained reader)
   when that tool is next touched, or drop the dependency if the xlsx path is
   unused.
4. **`path-to-regexp` (server)**: fold into the server's pre-deployment hardening
   (it is already behind the fail-closed FS-B0-02 boundary and not deployed).
5. **Moderate/low (18 total)**: batch with the controlled upgrade; none are
   runtime-reachable on current evidence.

## 7. Evidence commands (reproducible)

```text
npm audit --json                 # root: 3 critical / 8 high / 9 moderate / 1 low
(cd server && npm audit --json)  # server: 1 critical / 3 high / 9 moderate
npm ls xlsx                      # xlsx@0.18.5 <- @daph/vault-builder (tool only)
grep -r "xlsx" src/ --include=*.ts --include=*.tsx   # 0 app imports
grep -rl xlsx dist/assets/*.js   # absent from the built client bundle
npm audit fix --dry-run          # non-force fixes none of the crit/high; all need --force (breaking)
```

## 8. Update (2026-07-16) — controlled upgrade executed

Recommendation #2 was carried out as a validated, minimal upgrade rather than a
blind `--force`:

- `vite ^5.0.0 → ^6.4.3` (clears the `<=6.4.2` path-traversal advisory; the
  smallest major that fixes it — not the `vite@8` the auto-fixer proposed)
- `vitest / @vitest/ui / @vitest/coverage-v8 ^3.0.0 → ^3.2.7` (patches the RCE
  advisory within the 3.x line)
- `@vitejs/plugin-react` left at `4.7.0` (its peer range already allows vite 6)

**Result: root critical 3 → 0.** All gates re-validated green before commit:
typecheck (`tsc -b`), production build (vite 6, chunk sizes unchanged), full
Vitest suite (4573 pass; one transient isolation flake that passes 100/100 in
isolation and cleared on re-run — not upgrade-related), `test:node` 13/13, and a
`vite preview` smoke (HTTP 200, no new console errors, 3D scene renders).

Remaining 8 high are **all dev/build tooling** — `vite` (needs a further major to
`vite@8`), its transitives (`rollup`, `ws`, `minimatch`, `picomatch`, `flatted`,
`tmp`), and `xlsx` (no fix; vault-builder tool only). None are production-runtime
reachable (Section 3). Advancing to `vite@8` is deferred as a separate,
higher-risk effort with no runtime-exposure benefit.
