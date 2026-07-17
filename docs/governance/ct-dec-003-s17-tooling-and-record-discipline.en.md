# CT-DEC-003 — S17 Tooling, Ownership, and Append-Only Record Discipline

Effective date: 2026-07-11
Status: **RECORDED — human Tech Lead decision**
Scope: MONOLITH S17 governance, CT-DEC-002 return, and governance tooling
Technical baseline: `9ac7cff39d02d9430879275645e377728bc0abc5`
Reviewed governance input: `7aa63fd085e71c0bcd62f8d9fbee9d1b363ec416`
Decision authority: Tech Lead
Document preparation: Codex, advisory/non-authoritative

> This record preserves the human decision without converting advisory review into approval authority. It closes no P0 blocker, does not approve CT-DEC-002, and does not unlock Track B implementation.

## 1. Decision register

| Decision | Authority | Effect |
| --- | --- | --- |
| Return CT-DEC-002 for v0.2 | Tech Lead | all six independent-review blockers must be remediated; no approval signature is recorded |
| Shadow-only maximum result | Tech Lead | `PKT_OK_SHADOW_ONLY / NO_CUT` is the highest verifier result while shadow mode is active; bare `PKT_OK` is forbidden |
| Add three as-built gaps | Tech Lead | gate evidence run fields, locale sorting, and floating quantization become S17-4 inputs |
| Fix `jobRunId` ownership | Tech Lead | Track A supplies actor/auth/release contract; S17-4 owns transactional allocation |
| Classify and harden governance tooling | Tech Lead | historical use is authorized narrowly; official status requires independent re-review |
| Make historical decision quotes append-only | Tech Lead | corrections use addenda/supersession notes, never silent rewrites |

## 2. CT-DEC-002 return disposition

CT-DEC-002 remains **DRAFT — NOT APPROVED — NOT FOR IMPLEMENTATION AUTHORITY**. Version 0.2 must remediate:

1. protected signature algorithm/key/registry fields
2. gate evidence separation between content and run planes
3. schemas, quantity normalization, canonical array ordering, and field ownership
4. Windows-safe content-ID filename slicing and an exact ZIP byte profile
5. trusted-key lifecycle, revocation, and unavailable-authority semantics
6. stable fail-closed result codes and separate operational disposition

All three approval roles remain PENDING. Track B implementation for S17-4/S17-5 stays locked until the complete S17-3 approval matrix is signed.

During shadow mode, the verifier's successful result ceiling is:

```text
PKT_OK_SHADOW_ONLY / VERIFIED_SHADOW_ONLY / NO_CUT
```

`PKT_OK` is reserved and must not be emitted during the controlled pilot.

## 3. Append-only ownership supersession — `jobRunId`

Historical v0.1 wording associated server-owned `jobRunId` with “S17-1/S17-4.” That text remains recoverable in Git history and must not be rewritten as though it never existed. This section supersedes only its ownership interpretation:

- **Track A / S17-1–2 owns** `actorSubjectId`, authenticated authorization context, and the server-enforced RELEASED-only invariant
- **Track A does not allocate `jobRunId`**
- **S17-4 owns** canonical export-request fingerprinting and durable transactional `jobRunId` allocation after calling the Track A contract
- one `jobRunId` binds to one `packetContentId`; idempotency conflicts fail closed

This scope correction does not delay Track A and does not unlock S17-4 implementation before CT-DEC-002 approval.

## 4. Durable governance-tooling classification

### 4.1 Retroactively authorized historical versions

The following versions at `7aa63fd0` are retroactively authorized as **governance tooling only**:

```text
7976e417cbffc5779aa7b53608ae179324981b6d63b65c59a013013f2f852b6c  render-standalone-markdown.mjs
b42a168489ecf776adf25c8d866444b2badb81da474224d9985e91673d99c62e  write-sha256-manifest.mjs
cc34ad45d4e185065771306e275e3198332bedcae1557106d4f0fa6bd677c05a  verify-sha256-manifest.mjs
```

This authorization does not make them Track implementation, production controls, release gates, or S17-5 evidence.

### 4.2 Hardened candidate versions in this governance revision

```text
d7e05ddc8ef3b7e5e56c7b68a07adf5555f0366bb9e2c7a6f00796b7487c198a  render-standalone-markdown.mjs
d27a6120483569e044f2eb77ee4158d3dfc1bbc4a9b1e157dd750a9e8743ec3c  write-sha256-manifest.mjs
1c67197766ade318f1287b0b88a3001c79a2a1dfd30398d63d679d28a8215672  verify-sha256-manifest.mjs
00c33bd04d722fab8d96424af0c80b0e5db13d7f19612083f08d1ea39c299fa4  governance-tooling.test.mjs
```

The candidate writer/verifier reject path escape, symlinks outside the manifest root, duplicate/case-fold-colliding entries, CRLF/BOM/blank-line manifests, non-canonical paths, and manifest self-reference. The writer records canonical relative paths rather than basename-only entries. The focused built-in Node test suite covers valid nested paths plus traversal, duplicate, blank-line, CRLF, unsafe-link, token-collision, and unclosed-fence negatives.

Classification remains:

| Tool | Current status | Boundary |
| --- | --- | --- |
| `render-standalone-markdown.mjs` | **YELLOW** | trusted repository governance input only |
| `write-sha256-manifest.mjs` | **CANDIDATE — NOT OFFICIAL** | governance manifests only; independent re-review required |
| `verify-sha256-manifest.mjs` | **CANDIDATE — NOT OFFICIAL** | manifest-integrity utility only; independent re-review required |

`verify-sha256-manifest.mjs` is not, and must never be represented as, the S17-5 full packet verifier. Official status may be granted only by a later human decision after independent source review and negative-test reproduction.

## 5. Append-only historical decision-record rule

1. Verbatim human-decision quote blocks and signed/approved fields are append-only after recording
2. A factual correction, changed owner, or changed policy is added as a dated addendum or a new `CT-DEC-xxx` supersession note
3. The new note identifies the prior record, the exact scope superseded, authority/role, reason, and effective date
4. Unaffected prior text remains authoritative in its original scope
5. Rendering, translation, typo, or formatting corrections must not silently change normative meaning; a normative change requires the same supersession discipline
6. Git history is tamper-evident provenance, but an unsigned commit must not be called immutable

## 6. Track A measured status at recording time

Read-only Git inspection on 2026-07-11 found:

- main implementation worktree at `9ac7cff3` on `fix/drillmap-bolt-and-brun-dowels`
- governance worktree at `7aa63fd0` on `governance/s17-control-pack`
- no local or remote Track A/S17-1 branch
- no dedicated clean Track A worktree

Therefore **S17-1 implementation status = NOT STARTED / NO REPOSITORY EVIDENCE** at this record time. This is a measured fact, not a claim about work outside Git. Because the implementation deadline remains approximately 2026-07-25, creating the exact-baseline clean Track A worktree and beginning server-owned actor identity is the highest-priority execution action.

## 7. Unchanged boundaries

- CT-DEC-002 remains DRAFT and has no approval signatures
- Track B implementation remains locked
- no P0 blocker is closed
- no production-ready or deployment-ready claim is made
- ADR-064 still needs all four human roles
- no real workpiece may be cut from any packet until S17 closes and the four-condition real-cut gate passes

## 8. Next controlled actions

1. submit CT-DEC-002 v0.2 plus its hash-anchored diff summary for second independent review
2. independently re-review the hardened writer/verifier before any official-tooling decision
3. start Track A from exact baseline `9ac7cff3` in its own clean worktree without waiting for CT-DEC-002 approval
