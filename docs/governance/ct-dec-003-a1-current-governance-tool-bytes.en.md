# CT-DEC-003-A1 — Current Governance-Tool Bytes and Classification

Effective date: 2026-07-15  
Status: **RECORDED — human Tech Lead follow-up instruction**  
Prior record: `CT-DEC-003 — S17 Tooling, Ownership, and Append-Only Record Discipline` (2026-07-11)  
Supersession scope: **CT-DEC-003 §4.2 hashes and tooling classification only**  
Decision authority: Tech Lead (Dave), direction recorded in the 2026-07-15 review session  
Document preparation and independent advisory source review: Codex, non-signing and non-authoritative  
Technical baseline inspected: `077452a7cbe8714ed5ac3ed388420565bc19f252` plus the uncommitted S17 v0.4.1 control pack

> This addendum completes the append-only classification of the exact governance-tool bytes used for the v0.4.1 review artifacts. It does not approve CT-DEC-002, sign any S17 approval role, unlock Track B, close a P0 blocker, authorize production deployment, or authorize cutting.

## 1. Reason for the addendum

CT-DEC-003 recorded candidate hashes at an earlier governance revision. The renderer remains byte-identical to the recorded candidate, but the writer, verifier, and test harness changed during later remediation. The original decision record must not be silently rewritten. This addendum records the current bytes, review evidence, classification, and unchanged boundaries.

The original CT-DEC-003 document manifest remains valid. Its SHA-256 is:

```text
a586d2414006581af8323d7173af3066ccf803ac4ae37ef9ee7b06de832fb81b  docs/governance/ct-dec-003-s17-tooling-and-record-discipline.sha256
```

## 2. Exact reviewed tool bytes

```text
d7e05ddc8ef3b7e5e56c7b68a07adf5555f0366bb9e2c7a6f00796b7487c198a  scripts/render-standalone-markdown.mjs
3cd69ca33cfc1fec7657fd0a242668f24706f38ba52b27be7021579d8e58a584  scripts/write-sha256-manifest.mjs
9fbbf53519a2d45e3298a5d7d7e7b0df6481396b40a440cd707206b359ea2cb8  scripts/verify-sha256-manifest.mjs
cef610700abc1e17258373b99cd0243c757407cfd75f92e6ddbf1e0b07fe8093  scripts/governance-tooling.test.mjs
```

These bytes are pinned together with this addendum by `monolith-ct-dec-003-a1-review-input.sha256` at the repository root. The anchor does not list itself.

`monolith-s17-v041-review-input.sha256` remains the historical anchor produced at 2026-07-15 19:20 +07:00. CT-DEC-002 checklist bytes were subsequently updated and have their own valid current four-file manifest, so the historical v0.4.1 aggregate must not be represented as the aggregate of the later working tree. This addendum does not rewrite that anchor; the new A1 anchor is the consolidated current-byte anchor.

## 3. Independent advisory source review

The source review confirmed the following controls for the narrow governance-document scope:

1. writer inputs must be regular, non-symlink files inside the manifest directory
2. writer output cannot be a symlink, cannot resolve outside its directory, and cannot list itself
3. canonical paths are NFC, relative, slash-separated, Windows-safe, control-character-free, and reject empty, dot, and dot-dot segments
4. duplicate and case-fold-colliding entries are rejected
5. entries are sorted by unsigned UTF-8 byte order
6. verifier rejects BOM, CR/CRLF, blank lines, malformed entries, uppercase/non-64-hex digests, non-canonical paths, duplicates, unsorted entries, symlinks, traversal, self-reference, and digest mismatches
7. renderer escapes HTML, rejects unsafe or control-character link targets, permits only HTTP(S)/mailto schemes, preserves literal legacy tokens, and rejects unclosed fences

Residual limits are explicit: these tools do not provide signer authenticity, do not protect against a hostile process changing files during a local read race, do not parse packet schemas or ZIP containers, and do not implement KMS signature verification.

## 4. Reproduced evidence

On 2026-07-15, the dedicated Node test command completed:

```text
tests 5
pass 5
fail 0
```

The reproduced suite covered canonical nested paths and negative cases for outside-root inputs, duplicates, traversal, blank lines, CRLF, Windows-invalid paths, unsorted entries, symlink inputs/output/manifest aliases, unsafe links, control-character links, token collision, and unclosed fences.

The original CT-DEC-003 four-file document manifest also verified PASS 4/4 before this addendum was created.

Recursive verification found three legacy manifests whose digests were correct but whose entries predated the current unsigned-UTF-8 ordering rule: CT-DEC-001, the complete PRD, and the PRD v5 review. They were mechanically re-emitted in canonical order without changing any listed document bytes or normative text. The A1 consolidated anchor pins the canonical current manifests; the historical v0.4.1 anchor remains unchanged.

## 5. Narrow official classification

| Tool | Classification from this addendum | Authorized boundary |
|---|---|---|
| `render-standalone-markdown.mjs` | **OFFICIAL — GOVERNANCE DOCUMENT TOOLING** | trusted repository Markdown to standalone HTML only |
| `write-sha256-manifest.mjs` | **OFFICIAL — GOVERNANCE DOCUMENT TOOLING** | SHA-256 manifests for repository governance/review artifacts only |
| `verify-sha256-manifest.mjs` | **OFFICIAL — GOVERNANCE DOCUMENT TOOLING** | byte-integrity checking of those manifests only |
| `governance-tooling.test.mjs` | **OFFICIAL — GOVERNANCE TOOLING TEST HARNESS** | regression evidence for the three scripts only |

This classification attaches only to the exact hashes in §2. Any byte change returns the changed tool to **CANDIDATE — NOT OFFICIAL** until a later append-only review record pins and classifies it.

## 6. Explicit non-equivalence

`verify-sha256-manifest.mjs` is not the S17-5 factory packet verifier. In particular, it does not perform:

- packet schema-bundle validation
- NFP precedence or stable packet result-code evaluation
- authoritative registry lookup or revocation checks
- ECDSA P-256 raw `r||s` validation or low-S rejection
- AWS KMS public-key trust evaluation
- verifier-order enforcement for a factory packet
- operational disposition or machine admission

No output from these governance tools may emit or imply bare `PKT_OK`, `CUT`, production readiness, or approval authority.

## 7. Unchanged authority boundaries

- CT-DEC-002 remains DRAFT and the three approval roles remain PENDING
- Track B remains LOCKED
- shadow mode remains `PKT_OK_SHADOW_ONLY / VERIFIED_SHADOW_ONLY / NO_CUT`
- no P0 blocker is closed
- ADR-064 and every real-cut gate condition remain required
- S17 v0.4.1 remains a review artifact, not implementation authority
- real dogfood remains `AUTHORIZED/PREPARED — NOT STARTED` until a real project emits its first immutable evidence event

## 8. Effect on the full-system scrutiny finding

This addendum remediates `FS-B1-06` for the exact current governance-tool bytes by creating the missing append-only classification and evidence anchor. It does not remediate `FS-B1-02`: the root Vitest/Node-test runner separation and CI workflow wiring still require implementation work.

This record contains no cryptographic human signature. It preserves the human follow-up direction and exact reviewed bytes; any approval signature required by CT-DEC-002 remains a separate deliberate act.
