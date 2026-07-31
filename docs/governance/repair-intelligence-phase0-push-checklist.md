# Repair Intelligence Phase 0 — First-Push Checklist & CI Negative Control

Status: the branch `codex/repair-intelligence-phase0-trust` is **not pushed**.
This runbook is the ordered ritual for the first pusher. Its purpose is to move
the Phase 0 exit evidence from `EVIDENCE_INCOMPLETE` to `VERIFIED` **without ever
trusting a green CI gate that has not first been seen to fail on a deliberate
violation**.

This is an operations runbook (dev-facing), not a project-facing control
document; it is intentionally English-only.

---

## 0. Preconditions (run locally, all must pass)

```bash
git status --short          # expect clean (only intended Phase 0 files, committed)
npm run tk:phase0-local      # server · verifier · containment · route-ledger · repair-ledger · repair-docs
npm run test:node            # governance + ledger validator tests
node scripts/trust-kernel/final-gate-check.selftest.mjs
npm run gate:negative-control   # proves every LOCAL gate rejects a deliberate break
```

`gate:negative-control` is the local half of the trust ritual: it injects a
violation into each gate (skip/todo/empty/missing report, malformed ledger,
empty/hostile HTML, an unguarded byte route) and asserts the gate rejects it. A
green run means the local gates bite. The CI gate still must be proven the same
way (section 3) before it is trusted.

## 1. Provision CI secrets (owner)

The shadow-E2E and signed-evidence legs are **fail-closed without secrets** — a
missing secret keeps the gate red, never green. Set, in the repository's CI
secret store:

| Secret | Leg it unlocks |
|---|---|
| `E2E_BASE_URL` | shadow E2E — the running app endpoint |
| `E2E_SUPABASE_ANON_KEY` | shadow E2E — anon key for the E2E stack |
| `E2E_DESIGNER_A_JWT` | shadow E2E — first human (freeze) |
| `E2E_APPROVER_B_JWT` | shadow E2E — second human (release, four-eyes) |
| `E2E_TENANT_002_JWT` | shadow E2E — cross-tenant coexistence |
| `EVIDENCE_SIGNER_URL` | signed evidence attestation — separate signer |
| `EVIDENCE_SIGNER_KEY_ID` | signed evidence attestation — key id (never a private key) |
| `EVIDENCE_VERIFY_URL` | signed evidence attestation — verify endpoint |

## 2. Push and watch the workflows

```bash
git push -u origin codex/repair-intelligence-phase0-trust
```

Confirm both workflows are discovered and every job is green:

- **`trust-kernel-verify.yml`** — matrix tests (ubuntu + windows), edge + pgTAP,
  shadow E2E, pinned claim linters, evidence self-verify, and the **final
  acceptance gate**.
- **`db-verify.yml`** — a from-zero `supabase start` applying the full
  187-migration chain through `0192`, then all 9 pgTAP suites. This is the
  canonical clean-DB apply that a local run cannot reproduce.

## 3. CI negative control — prove the gate FAILS before trusting it green

A green CI gate is meaningless until it has been seen to fail on purpose. On a
throwaway commit (revert after each), verify the final gate rejects each class:

1. **Skipped test** — add `it.skip(...)` to any `server/src/trust-kernel` test →
   push → the final gate must FAIL with a skipped-assertion violation. Revert.
2. **Dropped report** — remove one report's `upload-artifact` step (e.g.
   `pgtap-trust_kernel_safety.tap`) → push → the gate must FAIL with
   `missing required report`. Revert.
3. **Perturbed packet** — change one byte of
   `test-vectors/factory-packet-v3/valid-minimal/packet.zip` on one OS path →
   push → the gate must FAIL with a cross-platform golden-sha MISMATCH. Revert.

Only after each deliberate break is caught should the green gate be trusted.

## 4. Generate the evidence-derived exit review from real CI reports

Download the CI report artifacts into `reports/phase0/`, then:

```bash
node scripts/trust-kernel/build-repair-phase0-exit-review.mjs reports/phase0
```

With the E2E and signed-attestation reports present and green, the builder emits
`Phase 0 implementation evidence: VERIFIED`. The exit decision stays
`PENDING_OWNER_APPROVAL` — no automated step can change it.

## 5. Present to the owner

Provide the commit list, the full report hashes (the exit review now prints
complete sha256 digests — re-checkable with `sha256sum`), the CI run URL, the
residual-risk and accepted-risk registers, and the rollback pack. The owner
alone approves the Phase 0 exit.

---

**Do not** add an override, allowlist, `continue-on-error`, or status-only
substitute for evidence anywhere in the workflows. The gate has no escape hatch
by design.
