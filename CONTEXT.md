# MONOLITH Repository Context

## Purpose

This repository is the governed bootstrap for MONOLITH, a multi-tenant platform serving kitchen brands, studios, dealers, designers, factories, installers, customers, and customers-of-customers. Daph is one pilot tenant and does not own platform governance or shared canonical data.

## Current authority

- Repository state: bootstrap, not production.
- Governance records: Proposed until their evidence and ratification gates pass.
- Runtime claims: none. Contracts, schemas, and reference engines do not prove deployed isolation, manufacturing safety, or field use.
- Canonical shared knowledge: writable only through MONOLITH governance.
- Tenant data: isolated by the ADR-001 Bridge model; runtime implementation remains future work.

## Source evidence

The original kitchen encyclopedia and reference implementation remain under `All aboute kitchen/`. New governed artifacts live under `docs/`, `packages/`, `data/`, and `tests/`. Original evidence is copied into governed structures only when provenance is retained.

## Working rules

1. Distinguish `VERIFIED FACT`, `OWNER DECISION`, `INFERENCE`, `PROPOSAL`, `UNKNOWN`, and `CONTRADICTED`.
2. Never promote a passing unit test into a production-readiness claim.
3. Keep supplier-native codes lossless; canonical mappings must retain provenance and rights metadata.
4. Treat `MON-BS-001` as an internal interoperability profile, never an ISO/EN standard.
5. Produce project-facing deliverables in English and Thai, with standalone HTML aligned to Markdown.
