# CT-DEC-003-A1 — Tech Lead Ratification

Effective date: 2026-07-16  
Status: **RATIFIED — exact pinned governance-tool bytes**  
Decision authority: Tech Lead (Dave)  
Ratification instruction: `RATIFY CT-DEC-003-A1 exact pinned bytes`  
Record preparation: Codex, documentary/non-signing  
Sibling record: `CT-DEC-003-A2` covers S17 status and is outside this ratification

> This record captures the Tech Lead's deliberate ratification after independent source review. It changes no pinned tool byte and does not rewrite CT-DEC-003, CT-DEC-003-A1, its independent review, or the A1 consolidated anchor.

## 1. Ratified subject

The Tech Lead ratifies the narrow **OFFICIAL — GOVERNANCE DOCUMENT TOOLING** classification in `CT-DEC-003-A1` for these exact bytes only:

```text
d7e05ddc8ef3b7e5e56c7b68a07adf5555f0366bb9e2c7a6f00796b7487c198a  scripts/render-standalone-markdown.mjs
3cd69ca33cfc1fec7657fd0a242668f24706f38ba52b27be7021579d8e58a584  scripts/write-sha256-manifest.mjs
9fbbf53519a2d45e3298a5d7d7e7b0df6481396b40a440cd707206b359ea2cb8  scripts/verify-sha256-manifest.mjs
cef610700abc1e17258373b99cd0243c757407cfd75f92e6ddbf1e0b07fe8093  scripts/governance-tooling.test.mjs
```

The consolidated A1 review-input anchor remains byte-identical and is not regenerated:

```text
649f4b0c7858c0176f9528224ce3d14f387599b57d9d47b1e174dd103daf812d  monolith-ct-dec-003-a1-review-input.sha256
entries: 58
self-listed: no
```

## 2. Evidence accepted by the Tech Lead

The ratification accepts the following evidence:

1. A1 mechanical integrity: exact §2 tool hashes, 58-entry non-self-listing anchor, unchanged historical v0.4.1 anchor, and reorder-only canonicalization of three legacy manifests
2. Codex advisory source review and dedicated governance-tooling tests: 5/5
3. independent Claude source review at commit `e82ac7600dde69ecf75a26a3df73ff38200e86aa`
4. seven separate adversarial control probes: 7/7
5. independent conclusion: no high- or medium-severity defect; OFFICIAL-for-governance-documents classification is defensible for the pinned bytes
6. separation of duties: the independent reviewer was not Codex, which prepared A1

## 3. Effect of ratification

From the effective date, the four exact tool bytes in §1 are official within the narrow boundaries stated by CT-DEC-003-A1:

- trusted repository Markdown rendering to standalone HTML
- writing canonical SHA-256 manifests for governance/review artifacts
- verifying byte integrity of those governance manifests
- regression testing of those three governance scripts

Any byte change automatically returns the changed tool to **CANDIDATE — NOT OFFICIAL** until a later append-only review and Tech Lead ratification pin the replacement hash.

## 4. Explicit exclusions

This ratification does not classify any other script, including the supplementary `scripts/governance-tooling-controls.test.mjs` added by the independent reviewer. That file is separate evidence and was intentionally not one of the four A1 pinned bytes.

The governance manifest verifier remains non-equivalent to S17-5. This ratification does not provide packet-schema validation, ECDSA P-256/low-S verification, AWS KMS trust, registry/revocation checks, verifier-order enforcement, machine admission, or operational disposition.

The leading-space path observation is accepted as low severity and deferred to a future test-first tool revision. It does not block this exact-byte ratification. Implementing it will change a pinned byte and therefore requires a new hash, independent review, and later ratification.

## 5. Unchanged governance boundaries

- CT-DEC-002 remains DRAFT; the three S17 approval roles remain PENDING
- Track B remains LOCKED
- shadow mode remains `PKT_OK_SHADOW_ONLY / VERIFIED_SHADOW_ONLY / NO_CUT`
- no P0 blocker is closed
- no production deployment or real cutting is authorized
- dogfood remains `AUTHORIZED/PREPARED — NOT STARTED` until a real project emits its first immutable evidence event
- A2 status numbering and commit `7523c05a` are unaffected

This is a documentary record of the explicit human instruction in this review session. It contains no cryptographic human signature and does not substitute for any separate signature required by CT-DEC-002.
