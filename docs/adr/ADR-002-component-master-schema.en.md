# ADR-002 — Component Master Two-Layer Schema

- **Status:** Proposed
- **Date:** 2026-07-19
- **Decision authority:** MONOLITH Platform Owner, Architecture Authority, and Component Master Governance
- **Consulted pilot:** Daph provides workflow evidence but has no platform-wide ratification or canonical-write authority
- **Bounded context:** Component Master
- **Related:** ADR-001 Tenant Boundary; ADR-003 Finish Library IP; ADR-005 Boring Standard
- **Evidence source preserved:** `All aboute kitchen/adr-002-component-master-schema.md`

## Context

Kitchen and cabinet design needs stable functional intent, while procurement needs exact manufacturer parts, packs, availability, contracts, and regional catalog revisions. Combining those clocks in one identifier makes every supplier change a design change. Treating supplier brand names as generic component classes also weakens interoperability and can misuse trademarks.

The governing tenant policy now exists in ADR-001. It requires a MONOLITH-owned shared kernel, tenant-scoped memberships and overlays, authenticated tenant context, and isolation across all storage and execution planes. ADR-003 separately governs finish identity and supplier-native intellectual property. ADR-005 governs boring geometry and supplier/machine variants.

## Decision

MONOLITH adopts a two-layer Component Master.

### Layer 1 — Component Specification

Layer 1 records MONOLITH canonical design intent. It is tenant-agnostic, versioned, read-only to tenants, and writable only through MONOLITH governance.

Every specification must contain:

| Field | Required meaning |
| --- | --- |
| `spec_id` | Immutable functional identifier using generic terminology |
| `spec_version` | Semantic version; projects pin the version |
| `category` | Controlled Component Master category |
| `function_i18n` | Functional description, not supplier marketing copy |
| `parameters` | Typed design, fit, load, material, and interface constraints |
| `boring_profile_refs` | Versioned `MON-BS-001` core/variant references when machining applies |
| `assembly_sequence` | Ordered operations with tools, safety, and evidence references |
| `symbols` | Governed symbol identifiers, not embedded unlicensed artwork |
| `substitutability_class` | Candidate-equivalence classification, never automatic proof |
| `provenance` | Source, revision/date, locator, rights, and evidence class |
| `governance_status` | `Proposed`, `Ratified`, `Deprecated`, or `Withdrawn` |

Generic names are canonical. Supplier trademarks such as product-line names remain aliases on supplier records, never the canonical category.

### Layer 2 — Supplier SKU Instance

Layer 2 records the exact commercial realization of one Layer-1 specification.

| Field | Required meaning |
| --- | --- |
| `sku_id` | Immutable supplier-instance identifier |
| `spec_id` / `spec_version_range` | Foreign key and declared compatibility range |
| `supplier_id` | Supplier-master reference |
| `manufacturer_part_no` | Lossless native part number |
| `supplier_finish_ref` | Supplier-native finish mapped under ADR-003 |
| `dimensions` / `tolerances` | Sourced physical realization data |
| `pack_qty` / `order_unit` | Procurement packaging facts |
| `availability` | Region and effective-date scoped availability |
| `provenance` | Catalog/source revision, locator, retrieval date, and rights |
| `lifecycle` | Effective, discontinued, successor, and last-verified dates |

Default public catalog facts may live in the governed shared catalog. Contract prices, negotiated MOQ, preferred suppliers, approvals, and project selections are tenant overlays governed by ADR-001. Tenant deletion removes tenant overlays without deleting the canonical specification or permitted shared catalog facts.

## Resolution and substitution

1. Design selects and pins a `spec_id` plus version.
2. Tenant policy produces candidate SKUs visible and permitted for that tenant.
3. A rules engine evaluates dimensional, boring, material, load, finish, regulatory, region, lifecycle, machine, and project constraints.
4. Human approval is required when the evidence class, tolerance, finish, safety impact, or tenant policy demands it.
5. BOM and purchasing outputs pin the chosen SKU and commercial snapshot; CAM pins the exact boring/profile variant rather than inferring it from a generic specification.

Sharing a `spec_id` means “candidate for evaluated substitution,” not “interchangeable without checks.” A different hole diameter, tolerance, machine dependency, finish evidence, load class, or regulatory scope blocks silent substitution. Cross-`spec_id` replacement is a design revision.

## Ownership and tenant boundary

- MONOLITH governance alone creates, changes, ratifies, deprecates, or withdraws canonical specifications.
- Suppliers and tenants may submit evidence and mapping proposals; they cannot directly mutate the shared kernel.
- Global identity identifies a person; tenant membership and role authorize each tenant action.
- Customer profiles, contracts, pricing, preferences, approvals, and project selections are tenant-local.
- Daph is one consulted pilot tenant and has no privileged platform authority.
- Support access follows ADR-001 break-glass-only controls.

## Versioning and lifecycle

- A breaking functional, fit, geometry, safety, or semantic change requires a new major specification version or a new `spec_id` when identity changes.
- Additive metadata may use a minor version only when existing interpretation and output remain unchanged.
- Corrections with no semantic/output effect may use a patch version with an audit reason.
- Existing projects keep pinned versions. Upgrades require impact analysis, regenerated outputs, and approval.
- Deprecated records remain readable and reproducible but are not selectable for new work by default.

## Security, provenance, and IP

Every write records actor, authority, tenant context when applicable, reason, before/after hash, evidence, and timestamp. Supplier-native text, codes, trademarks, images, CAD, textures, and catalog layouts retain source identity and rights metadata. A citation proves provenance, not permission to redistribute. Supplier finish data follows ADR-003; geometry follows ADR-005.

## Migration

1. Copy existing source modules and documents into the Component Master package without rewriting the evidence originals.
2. Import records as `Proposed` with evidence classes; unknown values remain unknown.
3. Seed the 15 connector specifications enumerated by Book 11, plus two hinge and two drawer-runner specifications as explicit expansion records: 19 total.
4. Import supplier parts as Layer-2 instances only where native identity and source anchors are retained.
5. Map legacy model-name references to candidate specifications; ambiguous names enter a review queue.
6. Pin versions in sample projects and compare BOM, CNC/CAM, installation, and procurement outputs before cutover.

## Rollback

Rollback restores the prior catalog/version pins and resolution policy. It never deletes audit history or supplier-native records. Materialized project snapshots remain reproducible. Flattening the two layers or changing canonical ownership requires a superseding ADR and an export demonstrating that specifications, SKUs, provenance, tenant overlays, and project pins remain lossless.

## Alternatives considered

### Manufacturer SKU as canonical identity — rejected

It couples design intent to supplier catalog churn and prevents governed cross-supplier evaluation.

### One record with supplier aliases — rejected

It conflates stable functional constraints with volatile commercial attributes and makes version ownership ambiguous.

### Model names only — rejected

They cannot reliably drive validation, BOM, procurement, machining, substitution, or traceable field service.

## Acceptance and ratification gates

This ADR remains Proposed until all of the following have auditable evidence:

1. Schema and validators reject malformed IDs, invalid versions, orphan SKUs, untyped dimensions, missing provenance, and unsafe substitutions.
2. The first 19-spec seed and its SKU instances pass count, uniqueness, foreign-key, provenance, and round-trip tests.
3. Coverage expands to at least 50 specifications across at least eight categories and 300 SKU instances across at least five independent suppliers; the 19-record seed alone is not ratification evidence.
4. At least one positive and one blocked cross-supplier substitution are demonstrated with unchanged/changed BOM and CAM evidence as appropriate.
5. ADR-001 tenant-isolation tests prove no tenant can read or mutate another tenant's overlays or the canonical kernel.
6. Finish mappings and boring variants pass ADR-003 and ADR-005 gates.
7. Procurement, design, manufacturing, installation, service, security/privacy, and legal/IP reviewers record results and unresolved risks.
8. MONOLITH Platform Owner, Architecture Authority, and Component Master Governance ratify; pilot acceptance is consulted evidence only.

## Supersession

- **Supersedes:** the decision-authority and ungoverned tenant-policy portions of the preserved original draft; the original remains historical evidence.
- **Superseded by:** none.
- Any schema, ownership, or layer collapse requires a new ADR with migration, rollback, and evidence-impact analysis.

## Evidence status

| Claim | Status on 2026-07-19 |
| --- | --- |
| Two-layer model and governance decision | Owner-approved decision, documented as Proposed |
| ADR-001/003/005 dependencies | Proposed governing decisions |
| First 19 specifications | Planned until machine-readable data and tests exist |
| Production database, tenant enforcement, and hosted deployment | No evidence / not implemented |
| Daph workflow validation | Consulted evidence not yet recorded; never a ratification authority |
