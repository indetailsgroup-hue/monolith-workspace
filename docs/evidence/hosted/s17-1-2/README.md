# S17-1 / S17-2 — Hosted Auth E0 Evidence

Recorded: 2026-07-14 · Status: **E0 CI/hosted PASS — scope-limited** (evidence input for human closure review; does not itself close S17-1/S17-2 or any P0)

## What was proven (13/13 PASS on real hosted Supabase)

Run against the isolated **s17-staging** Supabase branch (`wlivqsdgvwcjlbqqtcwt`, preview branch of `daph-iimos-prod`), NOT production.

- **S17-1 (server-owned identity, AB-AUTH-01)**: expired JWT → 401 · valid no-role JWT → 403 · forged `x-actor-role: DESIGNER` on a FACTORY principal → 403 and the job stays DRAFT (no side effect) · release audit stores `actorSubjectId` = JWT sub, not email (F-4)
- **S17-2 (RELEASED-only invariant, AB-EXP-01)**: FROZEN packet / export / verify → 409 on all three · Designer freeze → FROZEN · release → RELEASED
- **F-3 (least-privilege reads)**: INSTALLER state → 200 but INSTALLER activity → 403
- **RLS-bypass closed on hosted** (from the 0162 SQL apply on this branch): `has_table_privilege('authenticated','factory_jobs','select') = false`

## Anchors (in the evidence JSON)

| Field | Value |
| --- | --- |
| Deployed function commit | `8a6b89c899ce1192a006327fb3281089f6d140f2` (`s17/track-a-identity`) |
| Migration 0162 sha256 | `f3f5bfc6d9bbf11d74a0214e5c28aa9eef0172432c63d9cbc9d78bf4443a59e0` |
| Target | `monolith-s17-staging` / `wlivqsdgvwcjlbqqtcwt` (branch, confirmedNonProduction) |
| Evidence file sha256 | `60a84080538328c20f4b68e7024a44c772b06050a64cbf3deb2100ff859e99cc` |
| Job (synthetic) | `S17-HOSTED-20260713235500` |

The evidence stores only SHA-256 subject anchors — **no raw JWT, anon key, email, or plaintext subject** (independently verified: 0 JWT-like strings in the file).

## Exclusions (verbatim from the evidence)

- does not prove production deployment or operational readiness
- does not close S17-1, S17-2, or any P0
- does not test multi-site isolation; `factory-site-isolation` remains an open hard gate
- creates a synthetic staging job that remains RELEASED for audit preservation
- does not authorize merge, production apply, or real cutting

## How to reproduce (human-driven only — see incident note)

1. `scripts/deploy-staging-guarded.mjs` — deploy factory-api to the branch (allowlists the branch ref, rejects prod + TCCK)
2. Create 4 test users on the branch (`Authentication → Add user`), set `app_metadata.roles` via SQL, reset passwords via `crypt()`
3. `scripts/mint-staging-tokens.ps1` — sign in the 4 users → 4 active JWTs
4. `scripts/craft-expired-token.ps1` — craft a genuinely-expired HS256 JWT
5. `supabase/tests/s17-hosted-auth/run-hosted-auth-evidence.ps1 -ConfirmNonProduction`

**Incident note (2026-07-12):** an agent-driven CLI deploy targeted PROD (`kqzjqqvbrukxpjseqvua`) by mistake and was rolled back; a second attempt drifted toward Thai Curry Kitchen (`xkprmxtzomjckgketszw`). Hosted ops for MONOLITH must be human-driven, never let an agent run the Supabase CLI, and always verify the target is `wlivqsdgvwcjlbqqtcwt` before any deploy. The `deploy-staging-guarded.mjs` allowlist exists because of this.

## Closure

The Q4 closure criteria for S17-1/S17-2 are now technically met (review · F-1 decoupled · F-2 hosted E0 · F-3 · 0162 staging apply). **Closure is a human decision** (Product Owner / Tech Lead), not an AI declaration. This package is the evidence input.
