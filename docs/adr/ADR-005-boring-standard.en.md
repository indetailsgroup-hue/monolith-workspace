# ADR-005 — `MON-BS-001` Internal Boring and Drilling Profile

- **Status:** Proposed
- **Date:** 2026-07-19
- **Decision authority:** MONOLITH Platform Governance with Manufacturing/Safety review
- **Related:** ADR-002 Component Master; ADR-003 Finish Library

## Context

The 32 mm cabinetmaking system is a de facto geometry convention, not a published ISO/EN/DIN geometry standard identified by the current evidence. Performance standards for furniture and hardware answer different questions: strength, durability, stability, and safety rather than universal hole coordinates. Waiting for a future CEN/ISO geometry standard would leave current CAD/CAM output ungoverned.

Current primary-source corrections include:

- [ISO 4769:2022](https://www.iso.org/standard/80333.html) — vertical-axis furniture hinges, published.
- [ISO 12808:2024](https://www.iso.org/standard/84112.html) — furniture extension elements and components, published.
- [ISO 25131:2025](https://www.iso.org/standard/89083.html) — horizontal-axis hinges/stays, published.
- [ISO 7170:2021](https://www.iso.org/standard/76864.html) — assembled storage-unit strength, durability, and stability test methods, published.
- ISO 7171:2019 is withdrawn and revised by ISO 7170:2021; it must not be presented as current.

## Decision

MONOLITH publishes **`MON-BS-001`**, a versioned internal interoperability profile now. It is not described as an ISO, EN, DIN, CEN, Blum, Hettich, Grass, or Häfele standard.

## Profile structure

1. **Core reference system:** coordinate origin, panel faces, orientation, units, 32 mm pitch semantics, reference-line semantics, and hole-operation representation.
2. **Generic profile:** common nominal values used by the reference engine, each with provenance and explicit tolerances rather than an unqualified universal claim.
3. **Supplier/series variants:** exact cup, plate, runner, connector, setback, depth, pitch, and tolerance requirements from a named technical source and revision.
4. **Machine profiles:** supported tools, spindle/aggregate faces, datum conventions, coordinate transforms, post-processor identity, and calibration evidence.
5. **Project pin:** every project pins profile ID/version, supplier series, machine profile, and post-processor version.

## Safety and standards separation

Geometry conformance proves that the model/output matches the selected profile. It does not prove hardware strength, cabinet stability, installation safety, machine safety, or compliance with ISO/EN performance tests. Those require separate tested evidence. Supplier technical instructions override generic defaults for that supplier series; conflicts block manufacturing rather than being silently reconciled.

## Versioning and change

- Major version: any coordinate, datum, face, tolerance, or transformation change that can alter machining.
- Minor version: additive variant/tool metadata that leaves existing output unchanged.
- Patch version: non-behavioural provenance or wording correction.
- Pinned projects never auto-upgrade.
- Deprecated profiles remain readable and reproducible; new manufacturing requires an explicit migration or approved legacy exception.

## Conformance tests

At minimum, automated tests must verify coordinate origin, unit, pitch, sequence, diameter/depth constraints, panel breakthrough, edge distance, profile/version identity, supplier-series compatibility, machine/tool availability, coordinate transforms, and deterministic output checksum. Physical factory qualification adds calibrated coupon measurement, first-article inspection, and sampled production checks.

## Migration and rollback

Existing `32mm-generic`, Blum, Hettich, Grass, Häfele, and machine-specific rules are imported as separate Proposed variants with source revisions. Unknown values remain unknown. Rollback restores the previous profile/post-processor pin and requires a new output checksum; already machined parts are quarantined for inspection rather than assumed reversible.

## Ratification gate

`MON-BS-001` remains Proposed until:

1. The machine-readable profile and schema validate.
2. All 19 seed specs that require machining reference a compatible profile or explicitly declare `any`/proprietary geometry.
3. Golden coordinate/checksum tests cover connector, hinge, runner, shelf-row, and proprietary-machine cases.
4. At least one calibrated physical coupon and first article match the selected profile tolerances.
5. Manufacturing and safety authorities approve the profile; documentation or software tests alone cannot ratify production machining.
