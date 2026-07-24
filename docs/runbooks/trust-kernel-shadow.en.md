# Trust Kernel — Shadow Trust-Ready Runbook (EN)

> **STATUS: `NOT_FOR_PRODUCTION`.** This runbook operates the **Shadow Trust-Ready**
> Production Trust Kernel. P3 distribution and real Factory/machine delivery remain
> **DISABLED**. Passing every step here is **not** Production/GA approval — GA remains
> NO-GO pending a production key ceremony, AAL2 policy, operations drills, an
> authorized factory pilot, machine acceptance, and separate P3 authorization.

## 1. Purpose

Operate and verify the Trust Kernel locally: run the deterministic builder, the
independent verifier, the DB authority (Supabase/pgTAP), the edge transport, the
shadow E2E flow, the route disposition ledger, and the signed evidence bundle. Every
production-shaped artifact stays tenant-bound, two-person authorized, capability-safe,
externally verifiable, revocable, and sealed away from humans as P2 plaintext.

## 2. Local prerequisites

- Node.js 20 or 22 (measured lane: v22.21.1) and npm 11+.
- Docker daemon running (required by `supabase start`).
- Supabase CLI via `npx -y supabase <cmd>` (pinned lane: 2.109.1).
- `psql` 18.x on PATH for direct pgTAP execution.
- Playwright 1.58+ with the Chromium browser installed (`npx playwright install chromium`).
- Python 3.12 only if you run the guardrails claim linters (cross-repo, see §10).

## 3. Environment variables (key IDs / endpoints ONLY — never a private key)

The application stores **signer key IDs only**. Private keys live behind managed
signer ports; never place key material in the environment or in a file.

| Variable | Meaning |
|---|---|
| `EVIDENCE_SIGNER_URL` | Managed **evidence** signer endpoint (purpose `EVIDENCE`). |
| `EVIDENCE_SIGNER_KEY_ID` | Evidence key ID — must be **separate** from any release key. |
| `E2E_BASE_URL` | App origin for the shadow E2E run. |
| `E2E_SUPABASE_ANON_KEY` | Anon apikey for the `/v3/factory` edge. |
| `E2E_DESIGNER_A_JWT` | Bearer for the freeze actor (tenant 001, Site A). |
| `E2E_APPROVER_B_JWT` | Bearer for the release approver (a **distinct** human). |
| `E2E_TENANT_002_JWT` | Bearer for a tenant-002 member (coexistence + isolation). |

If `EVIDENCE_SIGNER_URL`/`EVIDENCE_SIGNER_KEY_ID` are unset, evidence issuance and the
CI evidence job **fail closed** — this is correct, not a bug.

## 4. Provision tenant fixtures (Daph 001 + tenant 002)

Daph is **fixture/onboarding data for tenant 001**, never a runtime constant. Every
coexistence check also provisions **tenant 002**.

1. Start the DB: `npx -y supabase start` (applies the migration chain incl. 0180–0184).
2. Seed tenant 001 (Daph) and tenant 002 memberships, a Site A working revision, and a
   frozen candidate through the user-scoped action-context RPC — **under the caller
   bearer**, never the service role. The freeze actor and the release approver must be
   **two distinct authenticated users**.
3. Confirm the fixture: `releaseStatus` for the working revision returns a projection
   (status + references only — no locator, no URL, no plaintext).

> A service role cannot mint human authority or accept a client-supplied role, name,
> tenant, site, or object path.

## 5. Run the local acceptance sequence

Run in order; every command must exit 0, every suite must have non-zero assertions,
and skips must be zero:

```
npm --prefix server test -- --run src/trust-kernel
npm --prefix server run build
npm test -w tools/factory-packet-verifier -- --run
npm run build -w tools/factory-packet-verifier
npx vitest run supabase/functions/factory-api/index.test.ts
npm run test:run -- src/factory/packet/__tests__/trustKernelContainment.test.ts src/core/api/__tests__/exportApi.containment.test.ts
node scripts/trust-kernel/verify-route-ledger.mjs
npm run typecheck:all
npm run build
npm run e2e -- e2e/trust-kernel
```

Then run the five Trust Kernel pgTAP suites plus the invariants against a freshly
started stack (see §6). Expected: valid vectors pass, P2 human access is denied, and
every hostile vector rejects with its assigned reason code.

## 6. Run the pgTAP suites

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA -v ON_ERROR_STOP=1 \
  -f supabase/tests/trust_kernel_tenancy.sql
```

Repeat for `trust_kernel_governance`, `trust_kernel_release`, `trust_kernel_bundles`,
`trust_kernel_containment`, and `workflow_db_invariants`. A suite passes when it emits
at least one `ok` and zero `not ok`.

> On the SHARED local stack, do **not** run `supabase db reset` or `supabase stop`
> (other lanes share it). Apply via `psql -1 -f`; tests roll back.

## 7. Inspect reason codes

Every denial returns a stable machine-readable reason code (registry:
`server/src/trust-kernel/reasonCodes.ts`). Common shadow codes:

- `AUTH_SOD_VIOLATION` — the same human tried to freeze and release.
- `AUTH_MEMBERSHIP_REVOKED` — membership revoked mid-flow.
- `STATE_CANDIDATE_STALE` / `STATE_RELEASE_AUTHORIZATION_STALE` — candidate mutated after approval.
- `STATE_CONFLICT` — two approvers raced; exactly one wins.
- `STATE_RELEASE_REVOKED` — a revoked release cannot be read or streamed.
- `STORE_PLAINTEXT_ACCESS_DENIED` — a human/client tried to read P2 plaintext or a raw locator.
- `TRUST_FRESHNESS_UNPROVEN` — an offline replay cannot claim current authority.

## 8. Revoke a release

Revoke through the `/v3/factory/.../revoke` authority as the `SAFETY_REVOKER`. Revocation
is **revision-scoped**: the revoked revision stays blocked forever; a correction starts
as a **new draft** and needs fresh four-eyes. After revocation, both human and isolated
P2 reads are denied (recheck at request start).

## 9. Refresh the verifier checkpoint + evidence retention

- **Verifier checkpoint:** the independent verifier (`tools/factory-packet-verifier`)
  rejects first use without a trusted checkpoint (`TRUST_CHECKPOINT_REQUIRED`), a
  sequence rollback (`TRUST_SEQUENCE_ROLLBACK`), and a bundle beyond `maxOfflineStaleness`
  (`TRUST_BUNDLE_EXPIRED`). Refresh by pinning the current trusted bootstrap checkpoint
  and the online-current high-water mark before an offline run.
- **Evidence retention:** `EvidenceAttestationV1` records `retentionDays`; the evidence
  bundle self-verifies (§16.4) under the **separate** `EVIDENCE` key and binds both Git
  roots, exact command/report digests, CI run/workflow identity, and builder/verifier
  binary hashes. A truncated log or a skipped test cannot support a passing claim.

## 10. Guardrails claim linters (cross-repo-pending)

The claim/certification linters (`tools/lint_claims.py`, `tools/lint_certifications.py`)
live in the **MONOLITH governance root**, not this product repo. The CI
`claim-linters` job references the expected path and runs them when a governance
checkout is provided via `MONOLITH_GOVERNANCE_ROOT`; otherwise it reports
**cross-repo-pending** rather than silently passing.

## 11. CI status — UNVERIFIED

`.github/workflows/trust-kernel-verify.yml` has **never run** (this worktree is not
pushed). The first pusher must push a deliberate violation (a skip, a failure, a
deleted report, a one-OS packet perturbation) and confirm the final gate **fails**
before trusting it. There is no `--allowlist`/override escape hatch.
