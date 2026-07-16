# CT-DEC-003-A2 — S17 Status Update (append-only supersession)

Effective date: 2026-07-15
Status: **RECORDED — human Tech Lead confirmation**
Prior record: `CT-DEC-003` (2026-07-11) — **unchanged**
Decision authority: Tech Lead
Document author: Claude, advisory/non-authoritative
Sibling addendum: `CT-DEC-003-A1` (governance tooling bytes, §4.2) — a separate, parallel scope; renumbered from "Addendum A" to A2 to avoid colliding with A1 (identifier-only correction, no normative change per §5.5)

> This addendum follows **CT-DEC-003 §5 (append-only rule)** — it supersedes only the named point-in-time status facts below. It does not rewrite CT-DEC-003's text, does not approve CT-DEC-002, does not close any P0, and does not unlock Track B.

## 1. Intent and scope (append-only)

CT-DEC-003 is a measured record as of 2026-07-11. All of its original text remains authoritative within its original scope and remains auditable in Git history (tamper-evident provenance). This addendum **adds new dated facts only**, per CT-DEC-003 §5.2–§5.3: it names the prior record, the exact scope superseded, the authority, the reason, and the effective date.

Reason: four days elapsed (11 → 15 July) and execution events overtook **three status facts** in CT-DEC-003. Confirming CT-DEC-003 as the current picture without an addendum would violate the discipline the document itself establishes.

## 2. Superseded status facts (scope-exact)

| Referenced in CT-DEC-003 | Recorded (11 Jul) | Measured update (15 Jul) + evidence anchor |
| --- | --- | --- |
| §1 register row "Return CT-DEC-002 for v0.2" · §2 | CT-DEC-002 → v0.2, six blockers | All six blocker areas remediated across v0.2 → v0.3 → v0.4 → **v0.4.1**; independent re-review verdict = **READY FOR HUMAN ROLE REVIEW** (round-4 clean; low-S = floor(n/2)) · anchor: commit `d3fb617fcb42e72085cce46cad03b5478b71e16d`, `monolith-s17-v041-review-input.sha256` (sha256 `75cbc3e1501b3499515fcf86b973001314fa52c8f0ff25d0c4ae188233ee2046`), aggregate `sha256:aed32029309278053aec251b5eaef1468d1921f42f81ee6755cd76a4e8d62f55` |
| §6 | S17-1 = **NOT STARTED / NO REPOSITORY EVIDENCE** | S17-1/S17-2 implemented; hosted-E0 auth proof on `monolith-s17-staging` = **13/13 cases pass** · anchor: `s17-hosted-auth-evidence.json` (sha256 `60a84080538328c20f4b68e7024a44c772b06050a64cbf3deb2100ff859e99cc`) |
| §8 controlled actions | (1) submit v0.2 for second review · (3) start Track A from baseline | (1) resubmitted continuously through round 4 → v0.4.1 READY · (3) Track A now has repo + hosted evidence · (2) hardened writer/verifier **still CANDIDATE — pending independent re-review** (unchanged) |

> ⚠️ **READY FOR HUMAN ROLE REVIEW ≠ APPROVED** — v0.4.1 is ready for the three human roles to review/sign, but no approval signature exists yet.

## 3. Scope that remains fully in force (untouched by this addendum)

- **CT-DEC-002 remains DRAFT — NOT APPROVED** (v0.4.1 = READY FOR REVIEW only); the 3-role sign-off is still **PENDING**.
- **Track B (S17-4/S17-5) remains LOCKED** until the S17-3 approval matrix is fully signed.
- No P0 blocker is closed; ADR-064 still requires all four human roles.
- CT-DEC-003 §3 (jobRunId ownership), §4 (tooling **YELLOW/CANDIDATE — NOT OFFICIAL**), §5 (append-only rule), §7 (scope unchanged) — **all remain fully in force**.
- No real cutting from a packet until S17 closes and the real-cut gate passes all four conditions.

## 4. Evidence anchors (verifiable)

```text
d3fb617fcb42e72085cce46cad03b5478b71e16d   commit: CT-DEC-002 v0.4.1 (ECDSA P-256 + low-S fix)
75cbc3e1501b3499515fcf86b973001314fa52c8f0ff25d0c4ae188233ee2046   monolith-s17-v041-review-input.sha256 (anchor self-hash)
aed32029309278053aec251b5eaef1468d1921f42f81ee6755cd76a4e8d62f55   schema-bundle.aggregate (v0.4.1)
60a84080538328c20f4b68e7024a44c772b06050a64cbf3deb2100ff859e99cc   s17-hosted-auth-evidence.json (S17-1/2 hosted-E0, 13/13)
077452a7                                                           commit: CT-DEC-002 sign-off bundle regen -> v0.4.1
```

Hosted-E0 target = `monolith-s17-staging` (Supabase preview branch `wlivqsdgvwcjlbqqtcwt`) — staging only; the real prod deploy happens at pilot (ADR-066: human-driven infra).

## 5. Authority and effect

The Tech Lead (Dave) confirms record CT-DEC-003 and adopts this addendum as a dated supersession of the named status facts as of 2026-07-15. The portions authored by Claude are advisory/non-authoritative; the decision authority is the Tech Lead's. There is no normative change to CT-DEC-003 §3/§4/§5/§7.
