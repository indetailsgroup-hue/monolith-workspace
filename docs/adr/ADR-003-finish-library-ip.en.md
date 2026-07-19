# ADR-003 — Canonical Finish Library and Supplier-Native IP

- **Status:** Proposed
- **Date:** 2026-07-19
- **Decision authority:** MONOLITH Platform Governance
- **Related:** ADR-002 Component Master; ADR-001 Tenant Boundary

## Context

Supplier finish codes are neither universal nor safely interchangeable. A code may represent coating, color, substrate, texture, sheen, or marketing language. Digital images vary by camera, profile, display, lighting, and compression; they cannot prove physical equivalence. MONOLITH needs cross-supplier search and configuration without erasing supplier identity or copying protected artwork.

## Decision

MONOLITH owns a **canonical finish taxonomy** and maps supplier-native finish records to it without altering or discarding native codes.

- Canonical records express material and appearance semantics.
- Supplier records retain official supplier, collection, name, code, SKU applicability, source, rights, and effective dates.
- Tenant overlays retain internal names, prices, availability, approvals, and project-specific substitutions.
- Tenants and suppliers may propose evidence but cannot directly mutate canonical records.

## Canonical appearance contract

A canonical finish may store:

- substrate/material family and composition;
- coating chemistry, layer build, cure, and repair class when known;
- CIELAB/LCh values with illuminant, observer, instrument geometry, measurement date, and sample ID;
- declared colour-difference method and tolerance; no unlabeled “Delta E” value is accepted;
- gloss value and geometry aligned to ISO 2813 where applicable; ISO 2813 covers plane, opaque, non-textured coatings and cannot represent every textured surface ([ISO 2813:2014](https://www.iso.org/standard/56807.html));
- texture/tactile descriptors and measurement method;
- wood species, cut, veneer match, grain direction, stain, batch/lot, and natural-variation class;
- physical master-sample identity, custody, location, condition, calibration linkage, and expiry/revalidation;
- digital asset colour profile, capture conditions, licence, checksum, and permitted use;
- version, status, provenance, reviewer, and effective period.

CIELAB calculations follow the applicable colourimetry record, including [ISO/CIE 11664-4:2019](https://www.iso.org/standard/74166.html). A coordinate without measurement conditions is incomplete evidence.

## Mapping and substitution rules

1. A supplier finish maps to canonical concepts through a versioned mapping with confidence and evidence classification.
2. Mapping does not imply physical substitutability.
3. Physical substitution requires compatible substrate, coating/performance envelope, colour tolerance under declared conditions, gloss/texture/grain criteria, application constraints, sample approval, and tenant/project approval.
4. Name similarity, RGB/HEX values, rendered images, or a supplier marketing category alone are insufficient.
5. Batch-sensitive and natural materials may be “same finish family” while still requiring project lot control.

## IP and rights

Supplier codes, trademarks, collection names, photos, scans, textures, and catalog layouts remain supplier-native assets. MONOLITH stores identifiers and factual mapping/provenance but does not claim ownership of supplier IP. Asset records must state licence, permitted channels, expiry, territory, and attribution requirements. Original MONOLITH taxonomy, measurement records, mapping logic, and original icons are governed separately from supplier assets.

## Versioning

- Canonical finish IDs are immutable.
- Breaking semantic or acceptance changes create a major version.
- Measurement or provenance additions that do not change meaning create a minor version.
- Corrections create a patch version only when project results cannot change.
- Projects pin taxonomy, mapping, supplier record, physical sample, and batch/lot versions.

## Migration and rollback

Existing supplier codes enter as native records first. Canonical mapping follows only when evidence exists. Unmapped records remain usable as `supplier_native_unmapped`; they must not be guessed. Rollback removes or supersedes a mapping while preserving the supplier record and project pins.

## Ratification gate

This ADR remains Proposed until:

1. Schema and validators reject name/image-only equivalence.
2. At least three suppliers are mapped with lossless native codes and rights metadata.
3. Physical sample workflow, custody, measurement method, tolerance, and revalidation are demonstrated.
4. A metamerism/lighting review and batch/lot exception are tested on real samples.
5. Legal review confirms the intended storage and presentation rights for supplier assets.
6. MONOLITH governance ratifies; pilot tenant approval alone is insufficient.
