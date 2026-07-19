# ADR-001 — Tenant Boundary and Isolation Model

- **Status:** Proposed
- **Date:** 2026-07-19
- **Decision authority:** MONOLITH Platform Owner, Architecture Authority, and Security/Privacy Authority
- **Consulted pilot:** Daph and future tenants provide workflow evidence but cannot ratify platform policy
- **Bounded contexts:** Identity & Tenancy; Security & Observability; Platform API

## Context

MONOLITH serves independent organizations whose projects, customers, prices, files, manufacturing records, and service histories must not leak across tenant boundaries. A person or supplier may work with several tenants, while an end customer may hold one global login but must have separate tenant-local business profiles. ADR-002 already refers to tenant policies and overlays, so this ADR governs those references.

PostgreSQL row-level security is useful but not sufficient by itself: superusers, table owners, and roles with `BYPASSRLS` can bypass policies unless roles and `FORCE ROW LEVEL SECURITY` are deliberately controlled. Every API object reference also needs object-level authorization to prevent BOLA. [PostgreSQL RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html) and [OWASP API1:2023](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) are normative implementation references for this proposal.

## Decision

MONOLITH adopts a **Bridge isolation model**.

1. Standard tenants use pooled PostgreSQL with `tenant_id`, database-enforced RLS, and `FORCE ROW LEVEL SECURITY` on every tenant-owned table.
2. A routing layer may move a tenant to a dedicated schema or database when contracts, regulation, home-region requirements, customer-managed keys, SLA/load thresholds, or incident containment require it.
3. Daph is an ordinary pilot tenant. It has no platform-wide write or ratification authority.
4. Shared canonical data is tenant-agnostic, read-only to tenants, and writable only through MONOLITH governance. Tenant-specific prices, labels, supplier preferences, contracts, and mappings live in tenant overlays.

## Identity and authorization boundary

- A person or organization has one global `actor_id`.
- Access is granted only through `tenant_membership(actor_id, tenant_id, roles, validity)`.
- Each request has exactly one active tenant. `tenant_id` comes from authenticated membership, never from a request body, query parameter, or unverified object identifier.
- Suppliers, contractors, and installers spanning tenants receive separate membership and scope in each tenant; multi-tenant membership never creates platform-admin privilege.
- End customers may use a global login, but profile, consent, project, budget, contract, files, and service history remain tenant-local. MONOLITH must not reveal that the same person is a customer elsewhere.

## Propagation invariant

The verified active tenant context must appear in every database transaction, object-storage path, cache key, queue job, event, webhook, search index, export, and audit record. Cross-tenant work is permitted only as an explicitly scoped platform job with authorization, reason, expiry, and audit evidence.

## Runtime role red lines

- Application runtime roles must not be superusers, table owners, or `BYPASSRLS` roles.
- Migration ownership is separate from runtime access.
- RLS policies use both visibility (`USING`) and mutation (`WITH CHECK`) controls as applicable.
- CI must prove tenant A cannot read, create, update, delete, export, enqueue, fetch files, or receive events belonging to tenant B.
- Shared canonical tables must reject tenant writes independently of UI behavior.

## Support access

MONOLITH support has no standing tenant-data access. Access uses break-glass records containing ticket, purpose, tenant, actor, scope, approval, start, expiry, and immutable audit entry. Emergency security access may begin under an incident policy but requires notification and retrospective review within the contractual SLA.

## Analytics and AI

Raw tenant data cannot be used for cross-tenant analytics or AI training by default. Cross-tenant analytics must be aggregated so neither a person nor tenant can be re-identified. Any broader use requires a separate contractual opt-in with scope, purpose, retention, withdrawal, and auditability.

## Encryption and residency

- Each tenant has an encryption-key identity and at least a tenant-specific DEK protected through envelope encryption by KMS.
- Dedicated tenants may use a customer-managed key.
- Destruction of a tenant key is a cryptographic-erasure mechanism requiring two-person approval and immutable audit.
- Every tenant has a `home_region`. Database, object storage, backup, and encryption keys remain in that region.
- Cross-region copying, migration, or failover requires legal/contractual basis, approval, and migration evidence; silent cross-region failover is prohibited.

## Offboarding and recovery

- Deliver an authorized tenant export within 7 days.
- Keep a recoverable offboarding window for 30 days.
- Delete production and object-storage tenant data after 30 days unless a documented legal hold applies.
- Make backup copies unusable within 90 days through expiry and/or governed key destruction.
- Legal holds require reason, approver, scope, and expiry.
- Standard tenant objective: `RPO ≤ 15 minutes`, `RTO ≤ 4 hours`.
- A tenant-scoped restore must not roll back another tenant. Dedicated tenants use stricter contractual objectives and must pass a restore drill before production.

## Migration and rollback

Pool-to-dedicated migration uses a governed tenant route, backfill, verified double-write or write pause, reconciliation, read cutover, monitoring, and a time-bounded rollback copy. A migration cannot complete until row/file counts, checksums, events, access tests, and restore evidence match. Rollback returns routing to the previous store without mixed-tenant writes.

## Consequences

The model keeps standard-tenant economics viable while allowing stronger isolation. It adds routing, migration, key, restore, and test complexity. Cross-tenant reporting becomes a governed exception rather than an implicit database privilege.

## Ratification and evidence gate

This ADR remains Proposed until all of the following exist and pass at the same revision:

1. Database schema and RLS policies for every tenant-owned table.
2. Runtime/migration role tests proving owners and bypass roles are absent from application execution.
3. Complete cross-tenant negative matrix for DB, files, cache, jobs, events, webhooks, exports, search, and support access.
4. Tenant export, deletion, backup-expiry, key-erasure, pool-to-dedicated migration, rollback, and restore drills.
5. Legal/privacy review for GDPR, Thailand PDPA, contracts, residency, and breach procedures.
6. Separate approval by Platform Owner, Architecture Authority, and Security/Privacy Authority; the implementer cannot be the sole approver.

No current artifact proves production isolation. This ADR is an approved owner decision in Proposed governance state.
