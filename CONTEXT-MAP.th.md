# แผนที่ MONOLITH Bounded Context

หัวข้อใน Encyclopedia เขียนว่า “12 bounded contexts” แต่ตารางแจกแจงจริง 14 รายการ และ ADR-002 กำหนด Component Master เป็น bounded context แยกต่างหาก Bootstrap นี้จึงบันทึก 15 contexts ในสถานะ Proposed ซึ่งเป็นการแก้ contradiction ตามหลักฐาน ไม่ใช่การกล่าวอ้างว่า ratify แล้ว

| # | โฟลเดอร์ | วัตถุประสงค์ | สิ่งที่เป็นเจ้าของ | การพึ่งพาหลัก |
| --- | --- | --- | --- | --- |
| 1 | `packages/identity-tenancy/` | Identity, tenancy, memberships และ entitlements | Actor, Tenant, Membership, Role, Policy Contract | ไม่มี |
| 2 | `packages/product-configuration/` | Collections, module grids และ vertical packs | Collection, Module Grid, Tenant Product Overlay | Identity/Tenancy, Component Master |
| 3 | `packages/component-master/` | Canonical specs, supplier SKUs, finishes และ boring profiles | Component Spec, Supplier SKU, Finish, Boring Profile | Governance |
| 4 | `packages/cad-parametric-design/` | Parametric designs และ revisions | Design, Revision, Parameter Set | Product Configuration, Geometry Kernel |
| 5 | `packages/geometry-kernel/` | ตรวจ geometry และแลกเปลี่ยนข้อมูล | Solid, Face, Edge, Topology, STEP/IFC codec | ไม่มี |
| 6 | `packages/bom-costing/` | Design-to-BOM, estimation และ quote | BOM, Cost Roll-up, Quote Version | CAD, Product Configuration, Component Master |
| 7 | `packages/manufacturing/` | CAM, nesting, CNC และ manufacturing gates | Nest, Toolpath, Machine Program, Gate | Geometry Kernel, BOM, Boring Profile |
| 8 | `packages/workflow/` | วงจร project ตั้งแต่ lead ถึง warranty | Project, Stage Gate, Site Survey | ทุก business context |
| 9 | `packages/procurement/` | Procurement, inventory, MRP และ MES | PO, Receipt, WIP, Work Order | BOM, Manufacturing, Component Master |
| 10 | `packages/quality-field-service/` | Quality, installation, warranty และ service | Non-conformance, Installation Record, Warranty Case | Workflow, Manufacturing |
| 11 | `packages/finance/` | Accounting, tax, audit และ revenue | Journal, Invoice, Tax Registration | BOM/Quote, Procurement, Workflow |
| 12 | `packages/customer-partner/` | Customer, dealer, designer, marketplace และ aftercare | Tenant-local Customer, Partner Membership, Digital Twin | Identity/Tenancy, Workflow |
| 13 | `packages/ai-governance/` | RAG, agents, evaluation และ AI governance | Agent, Corpus, Eval Suite, Approval Record | อ่านผ่าน governed contract เท่านั้น |
| 14 | `packages/platform-api/` | APIs, events, webhooks และ SDKs | API Route, Event Contract, SDK | ทุก context ผ่าน explicit contract |
| 15 | `packages/security-observability/` | Audit, incident, SRE, privacy และ compliance | Audit Record, Trace, Incident, DPA | ทุก context |

## กติกาการพึ่งพา

แต่ละ context เป็นเจ้าของ write model ของตน การอ่าน/เขียนข้าม context ต้องผ่าน contract หรือ event ที่ประกาศชัด ห้าม context ใดหา tenant scope จาก identifier ที่ผู้ใช้ควบคุม; active tenant context ต้องมาจาก authenticated membership ตาม ADR-001
