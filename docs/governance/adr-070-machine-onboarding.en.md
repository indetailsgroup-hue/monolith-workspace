# ADR-070 — Machine Onboarding: documented-profile first, bench verification before real work

Date: 17 July 2026
Status: **ACCEPTED — OWNER DECISION**
Scope: MONOLITH machine evidence catalog and shadow implementation
Out of scope: physical-machine certification, production release, or real-cut authority

## Context

DAPH must onboard several machines. Collecting every nameplate, controller/HMI version, tool table, origin, and delivery channel at every machine is not practical during initial development. The owner supplied an assessment and owner-answered profile for the KDT KN-2409LP. Those documents explicitly declare `NOT_ASSESSED`, `MANUFACTURING RELEASE: PROHIBITED`, and `machine_verification_pending`.

Exact source bytes are stored on the governance branch at commit `765c326c2ea289d10688a4704a46335e60d6a152`:

- `docs/evidence/machines/kdt-kn-2409lp/assessment.html`
- `docs/evidence/machines/kdt-kn-2409lp/machine-profile.html`
- the bilingual intake record and SHA-256 manifest in the same directory

## Decision

1. **Documented-profile first:** a machine may enter the evidence catalog from documents. Every value must carry provenance such as confirmed, documented, verify-at-machine, or unknown. Unknown values must not be replaced with defaults.
2. **Shadow implementation may continue:** a candidate profile may support generator, simulator, verifier, and operational-workflow development under NFP/NO_CUT only.
3. **Per-machine activation is a separate gate:** before real work, an engineer at the machine must verify machine identity/nameplate, controller/HMI and version, postprocessor/import path, delivery channel, tool table, WCS/origin/axis mapping, and working envelope.
4. **Results must be demonstrated:** activation requires a known-good job, simulation, dry-run/air-cut, first article, and human acceptance, with evidence bound to the machine instance and profile version/digest.
5. **Fail closed:** until activation passes, retain `manufacturing_release: PROHIBITED`, `automatic_machine_release: false`, `NO_CUT`, and prohibit bare `PKT_OK`.

## Effect on CT-DEC-002

- The Factory Owner may approve the `kdt_mvp_v1` contract for **shadow implementation** without claiming that a physical machine has been calibrated.
- FO-5 physical activation remains **CONDITIONAL/PENDING** until an engineer passes the at-machine gates.
- ADR-070 alone neither approves CT-DEC-002 nor unlocks Track B. Track B unlocks only after the complete S17-3 approval matrix required by the canonical specification.
- Even after Track B unlocks, CT-DEC-002 §11.6 blocks real cutting until S17-1..5 close, ADR-064 is complete, at least one full-chain dogfood job exists, and a machine profile is calibrated.

## Pattern for subsequent machines

Use `docs/evidence/machines/<machine-id>/` with at least:

- exact-byte source assessment and source profile;
- bilingual intake record (TH/EN Markdown + HTML);
- a non-self-listing SHA-256 manifest;
- a later activation record naming the engineer, timestamp, machine instance, profile version/digest, each gate result, and evidence links.

## Acceptance condition for real-machine activation

Status may leave `PROHIBITED` only after every at-machine gate passes and the Factory Owner explicitly accepts the result for that machine instance. Activation never carries across machines, even for identical models.
