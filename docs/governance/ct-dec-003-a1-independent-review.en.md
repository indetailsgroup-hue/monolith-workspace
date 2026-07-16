# CT-DEC-003-A1 Independent Source Review — Governance Tooling Bytes

Effective date: 2026-07-16
Status: **RECORDED — independent review evidence (advisory, non-authoritative)**
Reviewed record: `CT-DEC-003-A1` (2026-07-15) — **unchanged**
Reviewer: **Claude** — independent of Codex, the tooling author/modifier (builder ≠ reviewer, ADR-065/066)
Purpose: close the **independent-source-review leg** that CT-DEC-003 §4 requires before OFFICIAL classification

> This record is review evidence only. It does not itself grant OFFICIAL status (that is the Tech Lead's human decision), does not approve CT-DEC-002, does not unlock Track B, and does not close any P0 blocker.

## 1. Scope and independence

- Reviewed the four files at their exact pinned bytes (matching CT-DEC-003-A1 §2):

```text
d7e05ddc8ef3b7e5e56c7b68a07adf5555f0366bb9e2c7a6f00796b7487c198a  scripts/render-standalone-markdown.mjs
3cd69ca33cfc1fec7657fd0a242668f24706f38ba52b27be7021579d8e58a584  scripts/write-sha256-manifest.mjs
9fbbf53519a2d45e3298a5d7d7e7b0df6481396b40a440cd707206b359ea2cb8  scripts/verify-sha256-manifest.mjs
cef610700abc1e17258373b99cd0243c757407cfd75f92e6ddbf1e0b07fe8093  scripts/governance-tooling.test.mjs
```

- **Independence**: the tooling author/modifier is Codex; the reviewer is Claude (a different agent) — this closes the SoD leg CT-DEC-003 §4 requires; it is not a self-review.
- **Method**: full line-by-line source read + reproduced the test suite + **adversarial empirical probes** of controls the existing tests did not cover.

## 2. Per-file verdict

| File | Verdict | Principal controls confirmed in source |
| --- | --- | --- |
| `write-sha256-manifest.mjs` | **SOUND** | two-layer containment (logical `relative` + physical `realpath`), canonical path (NFC / reject `..` / backslash / win32-absolute / control char / Windows reserved name / trailing dot-space), dedup + case-fold, reject self-listing, reject symlink input/output, sort via `Buffer.compare` unsigned UTF-8 |
| `verify-sha256-manifest.mjs` | **SOUND** | reject: BOM, CR/CRLF, non-UTF-8 (fatal decode), blank line, trailing-LF ≠ 1, malformed entry, non-lowercase-64hex digest, non-canonical path, dup/case-fold, unsorted, symlink, traversal, self-reference (`fileReal === manifestReal`), digest mismatch |
| `render-standalone-markdown.mjs` | **SOUND** | no raw-HTML passthrough, escape-first-then-construct, link scheme allowlist `https?`/`mailto` (blocks `javascript:`/`data:`/`vbscript:`/`//`/control-char), NUL reject, unclosed-fence throw, `rel=noopener noreferrer` |
| `governance-tooling.test.mjs` | **MEANINGFUL** | asserts exact output bytes + exit status on real negatives — not a hollow test |

## 3. Adversarial empirical probes (controls not covered by the existing tests — exercised live)

| Probe | Input | Result |
| --- | --- | --- |
| BOM manifest | `﻿` + entry | ✅ INVALID |
| Self-reference | manifest listing itself | ✅ INVALID |
| Non-lowercase hex | uppercased digest | ✅ INVALID |
| `data:` link | `[x](data:text/html,<script>…)` | ✅ rejected |
| Protocol-relative | `[x](//evil.example/x)` | ✅ rejected |
| Case-fold | `File.txt` vs `file.txt` (verify + write) | ✅ rejected |
| Sanity | valid manifest + safe document | ✅ **PASS** (not a reject-everything tool) |

## 4. Reproduced + newly-locked tests

- `governance-tooling.test.mjs` (cef61070): **5/5 pass** (reproduced)
- **NEW** `governance-tooling-controls.test.mjs` (`08f472431cb7ccffc38623478efa9fd82d1e3ac17586e7de8add6be1195f5ca8`): **7/7 pass** — locks controls that had no dedicated regression test: BOM / non-lowercase-hex / malformed-hex / trailing-LF / self-reference / case-fold / renderer schemes (`data:`/`vbscript:`/`//`) / inline NUL / writer self-list

> The new test file is deliberately a **separate file** so the four files pinned by A1 §2 stay **byte-identical** (their OFFICIAL classification is not affected) — confirmed that all four hashes still match A1 §2 after adding the tests.

## 5. Observations (low severity — not blockers, consistent with the residuals A1 §3 discloses)

1. A leading-space path segment is not rejected (a trailing dot/space is) — no containment impact, cosmetic.
2. NUL is rejected only in inline text, not inside fenced-code bodies — browsers ignore NUL, trusted input, negligible.
3. TOCTOU read race (lstat → realpath → read) — already disclosed in A1 §3.
4. A manifest verifies the integrity of listed files, not set completeness — inherent, not over-claimed.
5. Windows `CONIN$`/`CONOUT$` are not in the reserved-name regex — extremely marginal.

No **high or medium** severity defect found.

## 6. SoD status for OFFICIAL (per CT-DEC-003 §4)

| Condition | Status |
| --- | --- |
| independent source review | ✅ **DONE** — this record (Claude ≠ Codex) |
| reproduce negative tests | ✅ DONE — 5/5 + 7/7 + 7 probes |
| human decision (Tech Lead ratifies OFFICIAL) | ⬜ PENDING — the Tech Lead's prerogative |

## 7. Verdict + endorsement

At the exact pinned bytes, the tooling **implements the A1 §3 controls in full** for the disclosed scope (governance-document manifests + standalone HTML); the residual limits are honestly disclosed; **no high/medium defect** was found. The OFFICIAL-for-governance-docs classification is therefore **defensible** and I endorse it, conditioned on:

- (a) binding to the **exact bytes** — any byte change reverts that tool to CANDIDATE (already enforced by A1 §5);
- (b) the supplementary regression suite now added (§4) to prevent silent regression of these controls.

The remaining step is the **Tech Lead's deliberate ratification** — not a builder self-elevation.

## 8. Boundaries unchanged

- CT-DEC-002 remains DRAFT — the three role approvals remain PENDING.
- Track B (S17-4/5) remains LOCKED · no P0 closed · ADR-064 still needs all four roles.
- Real dogfood remains `AUTHORIZED/PREPARED — NOT STARTED`.
- `verify-sha256-manifest.mjs` is **not** the S17-5 factory packet verifier (no schema-bundle validation / NFP precedence / registry lookup / ECDSA raw r‖s / KMS trust / machine admission).
- Output from these governance tools must not emit or imply bare `PKT_OK` / `CUT` / production readiness / approval authority.
