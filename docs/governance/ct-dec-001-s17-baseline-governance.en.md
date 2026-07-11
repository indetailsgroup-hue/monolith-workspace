# CT-DEC-001 — S17 Baseline Reconciliation and Execution Governance

Effective date: 2026-07-11  
Status: **RECORDED — human decision**  
Scope: MONOLITH S17 P0 closure  
Pinned baseline: `9ac7cff39d02d9430879275645e377728bc0abc5`  
Former Control Tower chat labels: `SESSION 01A — D-1 Baseline Reconciliation` and `AMENDMENT-01`  
Document authority: human decision; the AI Control Tower and Codex are advisory/non-authoritative

## 1. Authority register

| Decision | Approving role | Authority scope |
| --- | --- | --- |
| 1. Unlock Track A | **Tech Lead** | dependency order and authorization to begin implementation from the baseline |
| 2. Classify CI E0 | **Tech Lead** | scope-limited technical evidence classification |
| 3. Preserve three tracks + separation of duties | **Tech Lead** and **Security Owner**, recorded separately | execution architecture and independent verification |
| 4. Durable evidence archive | **Tech Lead** | CI evidence retention and provenance |
| 5. S17-3 approval matrix | **Tech Lead** and **Security Owner**, recorded separately | specification authority, trust boundary, and key semantics |

One human may hold both roles, but the record must preserve them separately. Approval in one role is not automatically counted for the other.

## 2. Reconciled facts

### 2.1 Reproducible commit deltas

| Commit range | Measured result | Measurement method |
| --- | --- | --- |
| `f9740559..9ac7cff3` | **26 files**; code/CI **8 files** (`.github/workflows` 1 + `src` 6 + `tools` 1) | run `git diff --name-only f9740559 9ac7cff3`, count the list; count code/CI only under the three stated paths |
| `d7b1c879..9ac7cff3` | **31 files** | run `git diff --name-only d7b1c879 9ac7cff3`, count the list |

The floating statement “26/31 files” is prohibited without its commit range and measurement method.

### 2.2 CI bound to the baseline

- Main run `29142280872`: successful `verify-full`, full commit SHA matches the baseline, full typecheck + **4,553/4,553** automated tests + build + evidence artifact
- Branch run `29142279488`: successful at the same full commit SHA; corroborating run
- Main artifact `8245562223`, SHA-256 `6fb49466fee477b54f05c8e1d2470cacc6c83cba91e889700cc1cdde7f6886fd`, 90-day retention
- Durable record: `docs/evidence/ci/9ac7cff3/`

## 3. Decision 1 — Unlock Track A immediately (Tech Lead)

`S17-1 Server-owned identity` → `S17-2 RELEASED-only invariant` **may begin implementation now**, subject to all of the following:

1. Create a clean worktree at exact baseline `9ac7cff39d02d9430879275645e377728bc0abc5`
2. Do not use a dirty worktree or share a working directory with Track B/Human-Ops
3. Identity precedes the RELEASED invariant, following the dependency order in Review §5
4. This authorization does not extend to S17-3/4/5 and is not P0 closure

Rationale: identity does not depend on the Canonical Packet Spec. Holding Track A for the packet contract contradicts the approved dependency order and burns schedule margin that is approximately zero.

**Track B implementation for S17-4/S17-5 remains locked** until S17-3 completes its approval matrix. Drafting S17-3 may begin immediately in DRAFT status.

## 4. Decision 2 — Withdraw “missing CI E0” (Tech Lead)

The correct status is:

> **E0 CI PASS — scope-limited**: full typecheck + 4,553/4,553 automated tests + build on `ubuntu-latest / node v22.23.1` at `9ac7cff3`; main run `29142280872`, branch run `29142279488`, main artifact `8245562223`, 90-day retention

The following exclusion list is part of the claim and must never be detached from it:

1. Two invariants in `tools/vault-builder/src/pipeline.test.ts` return before assertion on CI when `_daph_extract` is unavailable; their evidence remains local-only
2. DB/psql tests (`AB-DB-01`) are not in the workflow
3. E2E is not in the workflow
4. This E0 does not prove deployment, operational readiness, production readiness, or any P0 closure

## 5. Decision 3 — Do not create a fourth Track C (Tech Lead + Security Owner)

Preserve the **three-track** execution model in ADR-065:

| Track | Scope |
| --- | --- |
| Track A | S17-1 → S17-2 |
| Track B | S17-3 → S17-4 → S17-5 |
| Human/Ops | custody, machine confirmation/calibration, factory slot, approver ceremony |

Add this constraint as an amendment to ADR-065:

> **S17-5 Full Verifier must be implemented and reviewed by a party independent from the S17-3/S17-4 builder; the builder may not approve its own verification work.**

Independence may be achieved through a separate reviewer/account/time-box within the existing three tracks. It does not create Track C or silently add an execution stream.

## 6. Decision 4 — Durable evidence archive (Tech Lead)

CI evidence with finite retention must be archived under `docs/evidence/` before expiry and contain at least:

- the workflow-produced `verify-evidence.json`
- run URL, run ID, commit, environment, and date
- artifact ID, expiry date, and SHA-256 digest of the artifact ZIP
- exclusion list and evidence classification
- an LF UTF-8, lowercase-hex manifest

The artifact ZIP itself need not be committed when digest and provenance are preserved. However, a GitHub artifact-metadata digest must not be represented as an independently computed digest; its source must remain explicit.

## 7. Decision 5 — S17-3 approval matrix (Tech Lead + Security Owner)

The Canonical Packet Spec (`CT-DEC-002 / S17-3`) requires human approval in all three roles before S17-4/S17-5 are unlocked:

| Approver | Minimum scope |
| --- | --- |
| Tech Lead | schema, canonicalization, determinism contract, implementation feasibility |
| Factory Owner | file contract, machine-profile binding, verifier usability, factory operating fit |
| Security Owner | signature, trust boundary, key semantics, fail-closed behavior |

The Security Owner must review at least signature/trust-boundary/key-semantics sections. The three approval roles remain separate record fields.

## 8. Governance cleanup effective immediately

1. Control Tower decision IDs use `CT-DEC-xxx`; `D-x` is prohibited because it collides with repository task IDs
2. `SESSION 01A` is registered as **CT-DEC-001**
3. Use **pinned/frozen + tamper-evident**; never call an unsigned Git commit immutable
4. The operational branch rule for Track A in this round is exact SHA `9ac7cff3`; this specifically replaces ADR-065's dynamic “latest origin/main” rule for this Track A run
5. Chat transcripts remain advisory provenance; durable authority resides in this repository record + manifest + commit

## 9. Unchanged boundaries

- PRD v5.1 is Target-State Canonical, not production-ready
- This decision closes no P0 blocker
- ADR-064 still requires Product Owner + Tech Lead + Security Owner + Factory Owner across all four roles
- Track B implementation remains locked until CT-DEC-002/S17-3 is fully approved
- **No real workpiece may be cut from a packet** until S17 closes and all four real-cut gate conditions pass

## 10. Single next governance action

Draft the **CT-DEC-002 / S17-3 Canonical Packet Specification** defining at minimum `packetContentId`, `jobRunId`, signed identity binding released revision + machine-profile version + exporter version + schema version, per-file manifest format, signature/trust boundary, full-verifier contract, and the existing `NOT_FOR_PRODUCTION.txt` + `NFP-` prefix at the baseline.

CT-DEC-002 remains DRAFT until all three approval roles sign.
