# MONOLITH Repair Intelligence — Phase 0 Control Pack (English)

Companion edition: `docs/governance/repair-intelligence-phase0-control-pack.th.md` (Thai, section-aligned).

## 1. Status and Phase 0 boundary

Document status block (authoritative literal lines):

- `Phase 0 exit: PENDING_OWNER_REVIEW`
- `Expert Label Protocol: PROPOSED / NOT RUN`
- `Gate B: NOT PASSED`
- `Immutable infrastructure: NOT CLAIMED`
- `Phase 1A–3 capabilities: DISABLED`

Phase 0 scope — what is IN:

- Integration of the existing Trust Kernel into canonical product main.
- Tenant → organization → site scope model (migration `0189`).
- A deny-only Repair capability contract in `server/src/trust-kernel/repair/phase0Policy.ts`, returning the stable reason code `REPAIR_PHASE_NOT_ENABLED` for every Repair capability request.
- Fail-closed legacy containment (migration `0190`): broad `field_media` storage policies are removed; `rpc_field_submit_photo` and `rpc_capture_ingest` execution grants are revoked; legacy signed-URL download and `GET`/`HEAD` `/artifacts/:sha256` byte routes return HTTP `423 (Locked)`; `capture-ocr-extract` rejects client-supplied `raw_uri` by default.

Phase 0 scope — what is OUT (all Phase 1A–3 capabilities are DISABLED):

evidence upload/quarantine/scan, OCR, live AI, human review queue, work order, procurement, payment, professional sign-off, R8–R12 execution, native mobile, BIM authoring.

Any request for an OUT capability is denied by `phase0Policy.ts` with reason code `REPAIR_PHASE_NOT_ENABLED`.

## 2. Accountable ownership and RACI

Owners:

- **Security/IAM** — platform enforcement (RLS, grants, token semantics).
- **Release Governance** — gate decisions, status-line custody, release approval.
- **Manufacturing Engineering** — domain requirements and field-workflow correctness.
- **Platform Engineering** — migrations, routes, edge functions, CI plumbing.
- **Independent QA/Safety** — negative-test verification, evidence audit.
- **Repair Intelligence Governance** — Repair domain steward; owns this control pack and the Phase 0 boundary definition.

RACI (R = Responsible, A = Accountable, C = Consulted, I = Informed):

| Activity | Security/IAM | Release Governance | Manufacturing Eng. | Platform Eng. | Independent QA/Safety | Repair Intelligence Governance |
|---|---|---|---|---|---|---|
| Scope model (migration 0189) | A | I | C | R | C | C |
| Deny-only capability contract (phase0Policy.ts) | C | I | I | R | C | A |
| Legacy containment (migration 0190, 423 routes) | A | I | I | R | C | C |
| Negative-test suite and evidence | C | I | I | C | R | A |
| Phase 0 exit decision | C | A | C | I | R | R |
| This control pack | C | C | C | I | C | R/A |

## 3. Data classification and authority classification

Data classes:

| Class | Name | Definition | Phase 0 handling |
|---|---|---|---|
| P0 | Public projection | Data safe for public/unauthenticated display | Allowed via display-only browser role |
| P1 | Internal review | Operational data for authenticated members within scope | Scope-checked (tenant → organization → site) |
| P2 | Sealed plaintext (workload-only) | Sensitive plaintext readable only by designated workloads | Workload-only; human and browser paths are denied |

Authority classes:

| Class | Definition | Constraints |
|---|---|---|
| Verified human authority | Bearer token + current membership + one-time action context | All three required; stale membership invalidates authority |
| Service-role worker | Backend workload identity, downstream only | Never treated as human authority; cannot originate human actions |
| Display-only browser role | Anonymous/browser projection role | Read P0 projections only; no write, no P1/P2 read |

## 4. Threat model

| Threat | Control | Negative test/evidence |
|---|---|---|
| Identity spoofing | Verified human authority requires bearer token + current membership + one-time action context | `supabase/tests/repair_phase0_organization.sql` assertions on unauthenticated/forged-identity access |
| Stale membership | Membership is checked at request time; revoked membership denies authority | `supabase/tests/repair_phase0_organization.sql` stale-membership denial assertion |
| Cross-tenant access | Tenant boundary in scope model (migration 0189) + RLS | `supabase/tests/repair_phase0_organization.sql` cross-tenant denial assertions |
| Cross-organization access | Organization boundary within tenant (migration 0189) + RLS | `supabase/tests/repair_phase0_organization.sql` cross-organization denial assertions |
| Cross-site access | Site boundary within organization (migration 0189) + RLS | `supabase/tests/repair_phase0_organization.sql` cross-site denial assertions |
| Service-role impersonation | Service-role worker is downstream only, never mapped to human authority | `server/src/trust-kernel/test/repairPhase0Policy.test.ts` service-role denial cases |
| Actor-header spoofing | Actor identity derives from verified token, never from client-supplied headers | `server/src/trust-kernel/test/repairPhase0Policy.test.ts` header-spoof denial cases |
| Raw locator/SSRF via client raw_uri | `capture-ocr-extract` rejects client-supplied `raw_uri` by default | `supabase/functions/capture-ocr-extract/index.test.ts` raw_uri rejection cases |
| Unsigned hash byte access | `GET`/`HEAD` `/artifacts/:sha256` byte routes return 423 | `server/src/trust-kernel/test/repairLegacyRouteContainment.test.ts` 423 assertions |
| Signed-token replay | Legacy signed-URL download path returns 423; one-time action context bounds replay windows | `server/src/trust-kernel/test/repairLegacyRouteContainment.test.ts` signed-URL 423 assertions |
| Broad bucket policy | Migration 0190 removes broad `field_media` storage policies | `supabase/tests/repair_phase0_containment.sql` storage-policy denial assertions |
| Duplicate authority | One-time action context; reuse of an action context is denied | `server/src/trust-kernel/test/repairPhase0Policy.test.ts` duplicate-context denial cases |
| R8–R12 bypass | R8–R12 execution is in the DISABLED set; `phase0Policy.ts` denies with `REPAIR_PHASE_NOT_ENABLED` | `server/src/trust-kernel/test/repairPhase0Policy.test.ts` capability-matrix denial cases |
| Evidence tampering | Ledger verification of Phase 0 evidence and route inventory | `scripts/trust-kernel/verify-repair-phase0-ledger.mjs` mismatch failure |
| CI-report omission | Ledger verifiers require every report and route entry to be present and fail CI otherwise (fail closed) | `scripts/trust-kernel/verify-repair-phase0-ledger.mjs` and `scripts/trust-kernel/verify-route-ledger.mjs` fail-closed completeness checks |
| Break-glass misuse | Break-glass path: BLOCKED in Phase 0; any emergency change requires named-owner review and is logged | Change-review record required; `supabase/tests/repair_phase0_containment.sql` confirms revoked grants stay revoked |

## 5. Control-to-negative-test matrix

| Phase 0 control | Negative test / verifier | Coverage |
|---|---|---|
| Tenant → organization → site scope (migration 0189) | `supabase/tests/repair_phase0_organization.sql` | 14 assertions: cross-tenant, cross-organization, cross-site, stale membership, forged identity |
| Legacy containment (migration 0190) | `supabase/tests/repair_phase0_containment.sql` | 5 assertions: storage policies removed, `rpc_field_submit_photo` revoked, `rpc_capture_ingest` revoked |
| Deny-only capability contract | `server/src/trust-kernel/test/repairPhase0Policy.test.ts` | Every Phase 1A–3 capability denied with `REPAIR_PHASE_NOT_ENABLED`; service-role, header-spoof, duplicate-context cases |
| Legacy route containment (423) | `server/src/trust-kernel/test/repairLegacyRouteContainment.test.ts` | Signed-URL download and `GET`/`HEAD` `/artifacts/:sha256` return 423 |
| raw_uri rejection | `supabase/functions/capture-ocr-extract/index.test.ts` | Client-supplied `raw_uri` rejected by default |
| Phase 0 evidence ledger | `scripts/trust-kernel/verify-repair-phase0-ledger.mjs` | Ledger completeness and hash verification; fails on omission or mismatch |
| Route ledger | `scripts/trust-kernel/verify-route-ledger.mjs` | Route inventory matches declared containment state; fails on drift |

## 6. Privacy, retention, deletion, legal hold, and log redaction

- Repair customer evidence storage in Phase 0: BLOCKED. Ingestion is denied by the containment controls in Section 1 (migration 0190, 423 routes, `raw_uri` rejection, revoked RPCs), so Repair-domain retention, export, and deletion obligations in Phase 0 reduce to verifying that containment holds.
- Logs must not carry raw locators (`raw_uri`, signed URLs, storage paths) or PII. Deny responses log the reason code (`REPAIR_PHASE_NOT_ENABLED`) and scope identifiers only.
- Retention: Phase 0 evidence (test reports, ledgers under `reports/phase0`) is retained per Release Governance policy.
- Deletion responsibilities: Platform Engineering executes deletion mechanics; Security/IAM verifies scope; Release Governance approves.
- Legal hold: Release Governance declares holds; Independent QA/Safety verifies the hold is honored; Repair Intelligence Governance is informed.
- Log redaction: Platform Engineering owns redaction filters; Independent QA/Safety audits samples for raw locators and PII.

## 7. Phase 0 SLO and error-budget measurement boundaries

Phase 0 defines measurement only. No production readiness is claimed, and Phase 0 is NOT production and NOT GA.

Measured signals:

| Signal | Definition | Boundary |
|---|---|---|
| Deny-response availability | Fraction of Repair capability requests answered with the correct deny (`REPAIR_PHASE_NOT_ENABLED` or 423) | Measurement only; no customer-facing SLO commitment |
| CI green rate | Fraction of CI runs where all Section 5 verifiers pass | Measurement only; informs Phase 0 exit review |

Error budgets in Phase 0 exist to calibrate future SLOs; breaching a measurement boundary triggers review, not a release action.

## 8. Incident severity, escalation, kill switch, and evidence preservation

Severity rubric:

| Severity | Definition | Example | Escalation |
|---|---|---|---|
| SEV1 | Containment breach: a disabled capability executed, or evidence bytes served | 200 response from a 423 route; RPC executed after revoke | Immediate: Security/IAM + Release Governance + Repair Intelligence Governance |
| SEV2 | Control degradation without confirmed breach | Ledger verifier failing on main; RLS policy drift detected | Same business day: owning team + Independent QA/Safety |
| SEV3 | Measurement or tooling defect | CI flake in a negative test; report generation error | Normal triage: Platform Engineering |

- Escalation: every incident is escalated to the owner named in Section 2 for the affected control; SEV1 also notifies Release Governance for status-line impact.
- Kill switch: the Phase 0 kill switch is deny-by-default, which is already in place — `phase0Policy.ts` denies all Repair capabilities and containment returns 423. The capability enable path is itself denied by `phase0Policy.ts` in Phase 0; incident response therefore focuses on verifying deny behavior, not disabling features.
- Evidence preservation: preserve `reports/phase0` evidence, ledger outputs, and relevant logs before remediation; Independent QA/Safety takes custody of the evidence snapshot.

## 9. Backup/restore and disaster-recovery responsibilities

| Responsibility | Owner | Notes |
|---|---|---|
| Database backup and restore drills | Platform Engineering | Includes migrations 0189/0190 state; restore must land in the contained (deny) posture |
| Post-restore containment verification | Independent QA/Safety | Re-run `supabase/tests/repair_phase0_containment.sql` and `repair_phase0_organization.sql` after every restore |
| Ledger and evidence backup (`reports/phase0`) | Release Governance | Ledger integrity re-verified via `scripts/trust-kernel/verify-repair-phase0-ledger.mjs` |
| DR runbook custody | Platform Engineering, reviewed by Security/IAM | Fail-closed: if restore state is uncertain, routes remain 423 and RPC grants remain revoked |
| DR decision authority | Release Governance | Repair Intelligence Governance consulted for Repair-domain impact |

A restore that cannot demonstrate the deny posture is treated as SEV1 under Section 8 until verification passes.

## 10. Release gates and explicit non-claims

Restated status lines (identical to Section 1):

- `Phase 0 exit: PENDING_OWNER_REVIEW`
- `Expert Label Protocol: PROPOSED / NOT RUN`
- `Gate B: NOT PASSED`
- `Immutable infrastructure: NOT CLAIMED`
- `Phase 1A–3 capabilities: DISABLED`

Gate rules:

- Phase 0 exit requires named-owner review by Release Governance with Independent QA/Safety and Repair Intelligence Governance sign-off. No automated step — CI job, script, merge, ledger verifier, or scheduled task — may flip `PENDING_OWNER_REVIEW` to approved. Automation may only report; humans decide.
- Gate B remains `NOT PASSED` until its own review completes; this document makes no claim about Gate B beyond that status line.
- Explicit non-claims: this pack does NOT claim production readiness, does NOT claim GA, does NOT claim immutable infrastructure, does NOT claim the Expert Label Protocol has run, and does NOT claim any Phase 1A–3 capability is enabled.
