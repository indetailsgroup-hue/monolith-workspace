# CT-DEC-002 / S17-3 — Human Role Sign-Off Checklist

**Spec**: Canonical Factory Packet Specification v0.4.1 — supersedes v0.4/v0.3 · reviewed artifact committed `d3fb617fcb42e72085cce46cad03b5478b71e16d`
**Hash anchor to sign**: `monolith-s17-v041-review-input.sha256` (sha256 `de2a1ccfa476271c4ca5949ec374a79bce786702d6b65a94b9e3435a6439a2c7`)
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

- [ ] NFP/NO_CUT enforced: shadow mode cannot cut for real · maximum result `PKT_OK_SHADOW_ONLY / VERIFIED_SHADOW_ONLY / NO_CUT` · bare `PKT_OK` is not emittable.
- [ ] Machine profile binding: id + version + digest (a forged profile fails -> `PKT_MACHINE_PROFILE_MISMATCH`).
- [ ] Verifier fail-closed: damaged packet / lookup outage -> never reaches a machine (`PKT_AUTHORITY_UNAVAILABLE` -> FAIL/NO_CUT, not "warn and pass").
- [ ] Exporter allowlist + gate evidence binding (gate not PASS -> `PKT_GATE_FAILED`).
- [ ] Machine profile `kdt_mvp_v1` matches the physical machine + controller (confirmed by the factory).

## 3. Security Owner — Signature / Trust / Key

> **ADR-068 resolution (15 July)**: the Owner selected AWS KMS `ECC_NIST_P256` and `ECDSA_SHA_256`; v0.4 replaced the Ed25519 signature layer of v0.3. The checks below remain PENDING until the Security Owner reviews the exact bytes and hash anchor of round 4.

- [ ] **ECDSA-vs-KMS reconciled**: the protected algorithm is `ECDSA_P256_SHA256`; KMS `Sign` uses `ECC_NIST_P256` + `ECDSA_SHA_256` + `MessageType=DIGEST` against the exact SHA-256 digest.
- [ ] Signature encoding: KMS DER is converted to raw `r‖s` 64-byte Base64; the signer emits low-S; the verifier rejects DER/high-S/out-of-range with `PKT_SIGNATURE_INVALID`.
- [ ] Non-determinism boundary: the signature is a run-specific allowlist, excluded from `packetContentId`; the verifier verifies only, never recomputes.
- [ ] Public-key registry: pin canonical DER SPKI (`id-ecPublicKey` + `prime256v1`) whose BIT STRING is uncompressed `0x04‖X‖Y`; a packet-supplied key must not establish trust by itself.
- [ ] Key lifecycle (S10.2): ACTIVE/RETIRED/REVOKED, `notBefore/notAfter`, anti-rollback, registry-unavailable = fail-closed.
- [ ] Trusted-key registry: a public key inside a packet must not establish trust for itself (`PKT_KEY_UNKNOWN/REVOKED/EXPIRED`).
- [ ] Server-owned actor bound to S17-1 (JWT-derived, not a client header) — attestation uses an unforgeable identity.
- [ ] Tamper corpus (S14) covers enough + custody model matches ADR-064 / the custody decision (KMS/HSM non-exportable).

## 4. Signature Block

| Role | Name | Reviewed artifact commit | Review anchor SHA-256 | Date | Status |
| --- | --- | --- | --- | --- | --- |
| Tech Lead | Dave | `d3fb617fcb42e72085cce46cad03b5478b71e16d` | `de2a1ccfa476271c4ca5949ec374a79bce786702d6b65a94b9e3435a6439a2c7` | 2026-07-17 | SIGNED |
| Factory Owner | — | `d3fb617fcb42e72085cce46cad03b5478b71e16d` | `de2a1ccfa476271c4ca5949ec374a79bce786702d6b65a94b9e3435a6439a2c7` | — | PENDING |
| Security Owner | — | `d3fb617fcb42e72085cce46cad03b5478b71e16d` | `de2a1ccfa476271c4ca5949ec374a79bce786702d6b65a94b9e3435a6439a2c7` | — | PENDING |

> The Tech Lead attestation was recorded from Dave's direct confirmation in the guided review session on 2026-07-17: the reviewer personally observed the matching anchor, 44/44 manifest PASS with 0 FAIL, independently reproduced the aggregate schema digest, observed the passing schema structural test, and answered TL-1 through TL-5. Codex mechanically recorded this direct instruction; it did not sign or approve on the human's behalf.

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
