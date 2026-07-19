# Identity & Tenancy — ADR-001 Contract Package

**Status:** Proposed contract fixtures; not production enforcement evidence.

This package turns the owner-approved ADR-001 decisions into machine-readable contracts and a negative isolation matrix. It does not implement an identity provider, PostgreSQL RLS, KMS, object storage, queues, webhooks, backups, or a hosted control plane.

## Governing decisions

- Bridge isolation: pooled tenants by default, governed route to dedicated storage when contract/law, residency, customer-managed keys, SLA/load, or containment requires it.
- One global identity with tenant-scoped membership and exactly one active tenant per request.
- Customer profiles, contracts, pricing, preferences, approvals, and project selections remain tenant-local.
- Shared canonical kernel is writable only through MONOLITH governance.
- Support has no standing access; tenant data access is break-glass only, scoped, approved, expiring, and immutably audited.
- Tenant context propagates through database, object storage, cache, jobs, events, webhooks, and audit.
- Runtime database roles cannot be superuser, table owner, or `BYPASSRLS`; `FORCE ROW LEVEL SECURITY` and a separate migration role are required.
- Each tenant uses a tenant-specific DEK under KMS envelope encryption; dedicated tenants may use a customer-managed key.
- `home_region` is immutable and silent cross-region failover is forbidden.
- Raw cross-tenant analytics and AI training are denied by default; irreversible aggregates are the default permitted form and broader use needs contractual opt-in.
- Standard objectives are RPO ≤15 minutes and RTO ≤4 hours, with tenant-scoped restore.
- Offboarding targets are export within 7 days, recovery through day 30, production deletion by day 30, and backup data unusable by day 90, subject only to controlled legal hold.

## Artifacts

- `contracts/tenant-boundary.schema.json` validates the authenticated request tenant context and carries the governing policy vocabulary.
- `contracts/isolation-test-matrix.json` defines cross-tenant denial cases for every required plane plus break-glass, restore, and migration evidence.
- `tests/identity_tenancy/test_contracts.py` ensures these fixtures remain aligned with ADR-001.

## Required implementation evidence

Ratification requires adapters that run the matrix against real services, database roles and `FORCE RLS` inspection, object/cache/queue/webhook isolation traces, KMS key-policy and erase drills, tenant-scoped restore evidence, deletion/backup expiry evidence, home-region tests, break-glass audit and notification records, and approvals from Platform Owner, Architecture, and Security/Privacy. Daph is consulted pilot evidence only.

## Explicit non-claims

Passing the fixture tests proves document consistency only. It does not prove production isolation, security, privacy compliance, disaster recovery, data deletion, residency, or operational readiness.
