# MONOLITH Repair Intelligence — Phase 0 Accepted Risks (EN)

Status: PENDING_OWNER_REVIEW · Phase 1A–3 capabilities: DISABLED
Expert Label Protocol: PROPOSED / NOT RUN
Gate B: NOT PASSED
Immutable infrastructure: NOT CLAIMED

This register records the LOW-severity findings from the two-vendor phase-gate
review that are resolved by a **reviewed, deliberate decision** rather than a
code change. Each is a conscious accepted risk with a rationale, not an
oversight. The HIGH and MEDIUM findings were fixed in code. The two other LOW
findings are tracked separately: **LOW-1 fix implemented in 0192, pending cross-vendor re-review**;
LOW-4 exit-review report hashes were corrected and
reviewed. Neither is an accepted-risk entry here.

## 1. Trust-root registry tables stay tenant-scoped

**Finding.** Migration 0189 moved site-scoped tables to organization/site-grant
RLS, but the trust-root registry tables from migration 0183 —
`trust_authority_key`, `trust_key_revocation`,
`trust_profile_attestation_revocation`, `trust_warning_grant_revocation` —
remain tenant-scoped, so any member of a tenant can read them.

**Decision: accepted, tenant scope is correct.**

- A signing key and its revocation are **tenant-level trust roots**. Two of the
  four tables (`trust_authority_key`, `trust_key_revocation`) are **keyed only at
  the tenant level** (their scope column is `tenant_id`), so tenant is already
  the finest boundary available to scope them by.
- A key, attestation, or warning-grant **revocation is a safety broadcast** that
  every site in the tenant must observe. Narrowing a revocation to one
  organization would hide a safety signal from the sites that need it, which is
  a worse posture than the metadata exposure the finding describes.
- The ids and effective times are revocation metadata within one tenant, not a
  locator or cross-tenant data. However, `reason` is unconstrained free text
  copied into every site's trust bundle. It is not intrinsically P2-safe: P2
  exposure depends on operator discipline. This remains an **open risk**.

**Revisit trigger.** If a future phase introduces per-organization signing keys
(a `site_id`/`organization_id` on the key tables), re-scope the revocation
tables to match at that time. Also revisit when the free-text `reason` can be
replaced or constrained by coded reasons, validation, and redaction.

## 2. Migration numbers 0189–0192 may diverge from the Trust Kernel donor line

**Finding.** This branch assigned `0189`–`0192` to Repair Phase 0 migrations.
The Trust Kernel donor branch (`trust-kernel/shadow-e0`) may carry different
content at nearby numbers, so a future reconciliation could collide.

**Decision: accepted, reconciliation is a deliberate manual step.**

- Phase 0 **deliberately transplanted only the 24-commit Trust Kernel series**
  (`43301f96`..`8dfe0cc0`); it never auto-merges the donor line, so no silent
  collision can occur inside this plan.
- Any future donor reconciliation **must renumber, not silently merge**,
  colliding migration numbers. This rule is stated in the header of
  `0191_repair_phase0_revoke_legacy_mutation_authority.sql` and here.
- Migrations are additive and forward-only; a renumber during reconciliation is
  a rename, not a data change.

**Revisit trigger.** Before the next transplant from the donor line, diff the
`018x`/`019x` ranges on both branches and renumber the Repair migrations if they
collide.

---

Owner action: acknowledge these two accepted risks as part of the Phase 0 exit
review, or direct that either be converted into a code change before approval.
