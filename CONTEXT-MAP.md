# MONOLITH Bounded Context Map

The encyclopedia heading says “12 bounded contexts” but enumerates 14. ADR-002 independently assigns Component Master as a bounded context. This bootstrap therefore records 15 Proposed contexts; the count is an evidence-backed correction, not a ratification claim.

| # | Folder | Purpose | Owns | Primary dependencies |
| --- | --- | --- | --- | --- |
| 1 | `packages/identity-tenancy/` | Identity, tenancy, memberships, entitlements | Actor, Tenant, Membership, Role, Policy Contract | None |
| 2 | `packages/product-configuration/` | Collections, module grids, vertical packs | Collection, Module Grid, Tenant Product Overlay | Identity/Tenancy, Component Master |
| 3 | `packages/component-master/` | Canonical specs, supplier SKUs, finishes, boring profiles | Component Spec, Supplier SKU, Finish, Boring Profile | Governance |
| 4 | `packages/cad-parametric-design/` | Parametric designs and revisions | Design, Revision, Parameter Set | Product Configuration, Geometry Kernel |
| 5 | `packages/geometry-kernel/` | Geometry validation and exchange | Solid, Face, Edge, Topology, STEP/IFC codec | None |
| 6 | `packages/bom-costing/` | Design-to-BOM, estimating, quotes | BOM, Cost Roll-up, Quote Version | CAD, Product Configuration, Component Master |
| 7 | `packages/manufacturing/` | CAM, nesting, CNC, and manufacturing gates | Nest, Toolpath, Machine Program, Gate | Geometry Kernel, BOM, Boring Profile |
| 8 | `packages/workflow/` | Lead-to-warranty project lifecycle | Project, Stage Gate, Site Survey | All business contexts |
| 9 | `packages/procurement/` | Procurement, inventory, MRP, MES | PO, Receipt, WIP, Work Order | BOM, Manufacturing, Component Master |
| 10 | `packages/quality-field-service/` | Quality, installation, warranty, service | Non-conformance, Installation Record, Warranty Case | Workflow, Manufacturing |
| 11 | `packages/finance/` | Accounting, tax, audit, revenue | Journal, Invoice, Tax Registration | BOM/Quote, Procurement, Workflow |
| 12 | `packages/customer-partner/` | Customer, dealer, designer, marketplace, aftercare | Tenant-local Customer, Partner Membership, Digital Twin | Identity/Tenancy, Workflow |
| 13 | `packages/ai-governance/` | RAG, agents, evaluation, AI governance | Agent, Corpus, Eval Suite, Approval Record | Read-only access by governed contract |
| 14 | `packages/platform-api/` | APIs, events, webhooks, SDKs | API Route, Event Contract, SDK | All contexts by explicit contract |
| 15 | `packages/security-observability/` | Audit, incidents, SRE, privacy, compliance | Audit Record, Trace, Incident, DPA | All contexts |

## Dependency rule

Contexts own their write models. Cross-context reads and writes require explicit contracts or events. No context may infer tenant scope from user-controlled identifiers; active tenant context comes from authenticated membership under ADR-001.
