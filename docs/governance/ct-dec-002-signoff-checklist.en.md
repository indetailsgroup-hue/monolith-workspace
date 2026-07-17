# CT-DEC-002 / S17-3 — Human Role Sign-Off Checklist

**Spec**: Canonical Factory Packet Specification v0.4.1 — supersedes v0.4/v0.3 · reviewed artifact committed `d3fb617fcb42e72085cce46cad03b5478b71e16d`
**Hash anchor to sign**: `monolith-s17-v041-review-input.sha256` (sha256 **v3** `f7b35734bc3283e7fcc8a27b1842119178f79d2179fcfde1983e44e3e6381a16`)
**Anchor v3 (17 Jul evening, owner decision ก):** `.gitattributes` removed from the frozen set (now 43 pure spec-content files) — it is repo config that must stay mutable as new evidence types land (this time: binary exceptions protecting PNGs during the KDT library landing); same structural reasoning as removing the checklist earlier · **TL/FO signatures (anchor v2 `de2a1ccf...`) remain binding** — per-file proof shows all 43 spec-content files byte-identical at v3 creation (no re-sign needed) · SO signs against v3.
**Re-pin 16 Jul 2026 (owner decision ก):** the previous anchor `75cbc3e1...2046` was re-pinned for two reasons — (1) `package.json` drifted via owner-directed FS-B1-01/B1-02 work after round-4 (delta = test:node scripts + vite 6/vitest 3.2.7 security bumps; every spec/schema file byte-identical), and (2) a from-birth circularity fix: this checklist (the signing surface, which must be edited to sign) sat inside the frozen set itself, failing verification since `7cd09e81` and guaranteeing anchor breakage on signature — the new 44-file set excludes the checklist (which is pinned separately by `ct-dec-002-signoff-checklist.sha256` per signing event).
**Aggregate schema digest**: `sha256:aed32029309278053aec251b5eaef1468d1921f42f81ee6755cd76a4e8d62f55`
**Independent re-review verdict**: READY FOR HUMAN ROLE REVIEW (round-4 clean; low-S constant verified = floor(n/2); advisory, non-authoritative)

> A signature is a human accountability record that the signer performed the review; it is not the act of rubber-stamping an AI verdict. AI does not sign on a person's behalf. Once all three signatures are in, CT-DEC-002 = APPROVED and Track B (S17-4/5) unlocks.
> Enforced until all three sign: DRAFT · Track B LOCKED · NO_CUT · no P0 closure · no bare `PKT_OK` in shadow mode.

## 0. Pre-sign (every role does this first)

- [x] Confirm you are reviewing the exact bytes pinned in `monolith-s17-v041-review-input.sha256`.
- [x] Verify the aggregate schema digest from `schema-bundle.aggregate.sha256` with an independent tool (do not trust it merely because the manifest carries it).
- [x] Read the complete round-4 independent re-review and understand that a review verdict is not approval.

## 1. Tech Lead — Contract Correctness & Implementability

- [x] Schema bundle complete: 10 schemas, every array carries `x-monolith-orderBy`, every object is `additionalProperties:false`, aggregate digest bound.
- [x] Identity model: `packetContentId` (hash of canonical content) / `jobRunId` (server-owned, excluded from the content hash) / signed identity binding released revision + machine-profile ver + exporter ver + schema ver — no collision.
- [x] Determinism implementable without guessing: JCS, integer micrometres, UTF-8 byte ordering, and the ZIP byte profile are fully specified (S17-4 can build without interpretation).
- [x] Verifier check order (S12) + result codes (S13) are deterministic (NFP-missing -> clear `PKT_FILE_MISSING`, first-fail-wins).
- [x] Confirm S17-4/S17-5 have enough contract to begin implementation (after all signatures).

## 2. Factory Owner — Factory Operability & Safety

- [x] NFP/NO_CUT enforced: shadow mode cannot cut for real · maximum result `PKT_OK_SHADOW_ONLY / VERIFIED_SHADOW_ONLY / NO_CUT` · bare `PKT_OK` is not emittable.
- [x] Machine profile binding: id + version + digest (a forged profile fails -> `PKT_MACHINE_PROFILE_MISMATCH`).
- [x] Verifier fail-closed: damaged packet / lookup outage -> never reaches a machine (`PKT_AUTHORITY_UNAVAILABLE` -> FAIL/NO_CUT, not "warn and pass").
- [x] Exporter allowlist + gate evidence binding (gate not PASS -> `PKT_GATE_FAILED`).
- [x] Approve the `kdt_mvp_v1` contract for shadow implementation under the §17.1 approval question, using ADR-070 documented-profile-first onboarding.
- [ ] **Real-machine activation remains CONDITIONAL:** `kdt_mvp_v1` matches the physical machine + controller (confirmed by the factory).
  - **Owner decision 17 Jul 2026 (ADR-070):** accept documented-level evidence (`docs/evidence/machines/kdt-kn-2409lp/`; the source assessment declares `PROHIBITED · NOT_ASSESSED`) for shadow implementation only · **engineer bench verification at the machine = hard gate before real work** (assessment Gate E + CT-DEC-002 §11.6 "machine profile calibrated") · rationale: multi-machine onboarding — documented-profile first; no real cutting until the bench gates pass.

## 3. Security Owner — Signature / Trust / Key

> **ADR-068 resolution (15 July)**: the Owner selected AWS KMS `ECC_NIST_P256` and `ECDSA_SHA_256`; v0.4 replaced the Ed25519 signature layer of v0.3. The checks below remain PENDING until the Security Owner reviews the exact bytes and hash anchor of round 4.

- [x] **ECDSA-vs-KMS reconciled**: the protected algorithm is `ECDSA_P256_SHA256`; KMS `Sign` uses `ECC_NIST_P256` + `ECDSA_SHA_256` + `MessageType=DIGEST` against the exact SHA-256 digest.
- [x] Signature encoding: KMS DER is converted to raw `r‖s` 64-byte Base64; the signer emits low-S; the verifier rejects DER/high-S/out-of-range with `PKT_SIGNATURE_INVALID`.
- [x] Non-determinism boundary: the signature is a run-specific allowlist, excluded from `packetContentId`; the verifier verifies only, never recomputes.
- [x] Public-key registry: pin canonical DER SPKI (`id-ecPublicKey` + `prime256v1`) whose BIT STRING is uncompressed `0x04‖X‖Y`; a packet-supplied key must not establish trust by itself.
- [x] Key lifecycle (S10.2): ACTIVE/RETIRED/REVOKED, `notBefore/notAfter`, anti-rollback, registry-unavailable = fail-closed.
- [x] Trusted-key registry: a public key inside a packet must not establish trust for itself (`PKT_KEY_UNKNOWN/REVOKED/EXPIRED`).
- [x] Server-owned actor bound to S17-1 (JWT-derived, not a client header) — attestation uses an unforgeable identity.
- [x] Tamper corpus (S14) covers enough + custody model matches ADR-064 / the custody decision (KMS/HSM non-exportable).

## 4. Signature Block

| Role | Name | Reviewed artifact commit | Review anchor SHA-256 | Date | Status |
| --- | --- | --- | --- | --- | --- |
| Tech Lead | Dave | `d3fb617fcb42e72085cce46cad03b5478b71e16d` | `de2a1ccfa476271c4ca5949ec374a79bce786702d6b65a94b9e3435a6439a2c7` | 2026-07-17 | SIGNED |
| Factory Owner | Dave | `d3fb617fcb42e72085cce46cad03b5478b71e16d` | `de2a1ccfa476271c4ca5949ec374a79bce786702d6b65a94b9e3435a6439a2c7` | 2026-07-17 | SIGNED — SHADOW CONTRACT; ACTIVATION PENDING |
| Security Owner | Dave | `d3fb617fcb42e72085cce46cad03b5478b71e16d` | `f7b35734bc3283e7fcc8a27b1842119178f79d2179fcfde1983e44e3e6381a16` | 2026-07-17 | SIGNED |

> The Tech Lead attestation was recorded from Dave's direct confirmation in the guided review session on 2026-07-17: the reviewer personally observed the matching anchor, 44/44 manifest PASS with 0 FAIL, independently reproduced the aggregate schema digest, observed the passing schema structural test, and answered TL-1 through TL-5. Codex mechanically recorded this direct instruction; it did not sign or approve on the human's behalf.

> The Factory Owner attestation was recorded from Dave's direct answers in the guided review session on 2026-07-17: Dave selected A for FO-1 through FO-4 individually and issued ADR-070 for FO-5, accepting a documented profile for shadow implementation while holding physical activation CONDITIONAL until an engineer completes the at-machine gates. Codex recorded that direct decision and scope; it did not inspect the machine or sign on the human's behalf.

> The Security Owner attestation was recorded from Dave's direct instruction ("sign now") in the guided review session on 2026-07-17, after every item's evidence was displayed live: §10 items 3–7 (ECDSA/KMS parameters, DER→P1363 r‖s 64-byte strict encoding, mandatory low-S, no self-trust), §4.1 run allowlist, §10.2 SPKI/lifecycle/anti-rollback, §14 tamper corpus, and the custody kickoff (non-exportable HSM, Security Owner = Key Owner) — with the **low-S constant recomputed live via BigInt in front of the signer, matching digit-for-digit**. The signer **explicitly acknowledged (SO-7)** that the S17-1 server-owned actor is staging-only with prod-apply following at the pilot window. Pre-sign at signing moment: anchor v3 matched + 43/43 PASS, 0 FAIL. Claude recorded this direct instruction; it did not sign or approve on the human's behalf.

> ✅ **All three roles signed on 17 Jul 2026 → CT-DEC-002 = APPROVED · Track B (S17-4 determinism + S17-5 verifier) UNLOCKED** — per §5 · Unchanged: NO_CUT/NFP until the four real-cut gate conditions pass, S17-1/2 prod-apply waits for the pilot window, KDT machines remain PROHIBITED until bench verification · Updating the spec file's own "DRAFT" status line is the Control Tower's (author's) task.

## 5. Effect once all three sign

- CT-DEC-002 = APPROVED
- Track B unlocks: S17-4 determinism + S17-5 verifier
- S17-5 must be implemented/reviewed by someone independent of the S17-3/4 builder (SoD, ADR-065)
- NFP/NO_CUT remains until the four real-cut gate conditions pass (S17x5 + ADR-064 complete + dogfood >=1 + machine profile calibrated)

## 6. Advisory cautions

1. If one person holds multiple roles (e.g. a 2-of-2 pilot ceremony) they sign each role separately and deliberately — no bundled signature.
2. The Security Owner should sign last: signature/key behavior binds to the S17-1 server-owned actor, which is still staging-only (real prod deploy happens at pilot).
3. This sign-off does not close P0, does not authorize merge/prod-apply, and does not authorize real cutting — it unlocks only Track B implementation.

---

*Advisory checklist — human approval required. The exact v0.4 review bytes are pinned by `monolith-s17-v041-review-input.sha256`; this checklist does not change DRAFT/PENDING/Track B LOCKED/NO_CUT until all three roles sign.*
