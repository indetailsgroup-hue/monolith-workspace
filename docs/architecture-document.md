# Monolith — Full Architecture Document
**Manufacturing OS · Multi-Tenant SaaS Platform**
**Version 2.1.0 · Generated from source: 2026-08-28**

---

## Table of Contents

1. [System Identity](#1-system-identity)
2. [Deployment Topology](#2-deployment-topology)
3. [Multi-Tenant Data Model](#3-multi-tenant-data-model)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [Frontend Application Structure](#5-frontend-application-structure)
6. [Source Module Catalog](#6-source-module-catalog)
7. [Server (Factory Server)](#7-server-factory-server)
8. [Database & Migration Layer](#8-database--migration-layer)
9. [Inter-Module Dependency Map](#9-inter-module-dependency-map)
10. [Runtime Data Flow](#10-runtime-data-flow)
11. [Test Architecture](#11-test-architecture)
12. [Key Design Decisions (ADR Summary)](#12-key-design-decisions-adr-summary)

---

## 1. System Identity

**MONOLITH** is a multi-tenant SaaS Manufacturing Operating System. It serves custom manufacturing businesses (cabinet makers, kitchen builders, joinery shops, interior decorators) as isolated tenant organizations. Each tenant gets a fully scoped workspace: jobs, quotations, invoices, factory pipeline, CNC export, and analytics — all isolated at the Postgres row level.

| Attribute | Value |
|-----------|-------|
| Frontend version | 2.1.0 |
| Server version | 0.13.2 (monolith-factory-server) |
| Frontend runtime | React 18 + TypeScript + Vite |
| Backend | Supabase (Postgres 15 + Auth + Realtime + Edge Functions) |
| Deployment | Vercel (frontend) + Supabase (backend) |
| Primary tenant example | DAPH Decor (Interior decoration, Thailand) |

---

## 2. Deployment Topology

```
┌─────────────────────────────────────────────────────────────┐
│                     VERCEL (Frontend)                        │
│    React SPA ─ React Router v6 ─ Zustand ─ Tailwind CSS     │
│    Build: Vite · Testing: Vitest (unit) + Playwright (E2E)  │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS (supabase-js client)
┌────────────────────▼────────────────────────────────────────┐
│                  SUPABASE PLATFORM                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │  PostgreSQL  │  │  Supabase    │  │  Edge Functions    │ │
│  │  (Postgres  │  │  Auth (JWT)  │  │  (Deno, server-   │ │
│  │  RLS, RPC)  │  │              │  │  side validators)  │ │
│  └─────────────┘  └──────────────┘  └────────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐                          │
│  │  Realtime   │  │  Storage     │                          │
│  │  (postgres_ │  │  (org_id/    │                          │
│  │  changes)   │  │  prefix)     │                          │
│  └─────────────┘  └──────────────┘                          │
└────────────────────┬────────────────────────────────────────┘
                     │ Internal queue (BullMQ/Redis)
┌────────────────────▼────────────────────────────────────────┐
│            FACTORY SERVER (Node.js, self-hosted)             │
│  Express API · BullMQ workers · CNC packet verifier          │
│  CLI: receipt-verify (ZIP-based factory packet validation)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Multi-Tenant Data Model

### Core Identity Tables

```sql
organizations (org_id PK, name, slug, plan, status, settings JSONB,
               max_users, max_jobs_per_month, trial_ends_at)

org_members    (member_id PK, org_id FK, user_id FK → auth.users,
               role [OWNER|ADMIN|DESIGNER|FACTORY|INSTALLER|FINANCE|VIEWER],
               is_active)

org_invitations (invitation_id PK, org_id FK, email, role, token,
                status [PENDING|ACCEPTED|EXPIRED], expires_at)
```

### Tenant-Scoped Business Tables

All business tables carry `org_id UUID` and are protected by RLS:

| Table | Scope | RLS Policy |
|-------|-------|-----------|
| `public.jobs` | per org | `org_id = get_user_org_id()` |
| `public.quotations` | per org | `org_id = get_user_org_id()` |
| `public.invoices` | per org | `org_id = get_user_org_id()` |
| `public.ledger_entries` | per org | `org_id = get_user_org_id()` |
| `notifications` | per org + user | `org_id IN member orgs AND user_id = auth.uid()` |
| `notification_preferences` | per user | `user_id = auth.uid()` |
| `audit_logs` | per org (admin read) | `org_id IN member orgs WHERE role IN ADMIN/OWNER` |
| `search_bookmarks` | per user | `user_id = auth.uid()` |

### Key RLS Function

```sql
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM public.org_members
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### Plan Tiers

| Feature | FREE | STARTER | PROFESSIONAL | ENTERPRISE |
|---------|------|---------|--------------|------------|
| Max Users | 2 | 5 | 20 | Unlimited |
| Jobs/month | 10 | 50 | 200 | Unlimited |
| Nesting | — | ✓ | ✓ | ✓ |
| Quotations | — | ✓ | ✓ | ✓ |
| Curved Panels | — | — | ✓ | ✓ |
| DXF Export | — | — | ✓ | ✓ |
| Analytics | — | — | ✓ | ✓ |
| API Access | — | — | — | ✓ |
| SSO | — | — | — | ✓ |

---

## 4. Authentication & Authorization

### Auth Stack
- **Supabase Auth** — email/password, OAuth (Google), magic link, LINE OA
- **JWT** — carries `user_id`, consumed by all RLS functions and Edge Functions
- **org_members** — maps each auth user to one or more orgs with a role

### Role Hierarchy
```
OWNER (100) > ADMIN (80) > DESIGNER / FACTORY / FINANCE (60) > INSTALLER (40) > VIEWER (10)
```

### Permission Matrix

| Capability | OWNER | ADMIN | DESIGNER | FACTORY | FINANCE | VIEWER |
|-----------|:-----:|:-----:|:--------:|:-------:|:-------:|:------:|
| Manage Members | ✓ | ✓ | — | — | — | — |
| Manage Billing | ✓ | — | — | — | — | — |
| Create Jobs | ✓ | ✓ | ✓ | — | — | — |
| Transition Status | ✓ | ✓ | ✓ | ✓ | — | — |
| View Finance | ✓ | ✓ | — | — | ✓ | — |
| Export Data | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Manage Settings | ✓ | ✓ | — | — | — | — |
| View Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### Frontend Enforcement Components

```tsx
// Role guard
<OrgGuard requiredRole="ADMIN">
  <OrgSettings />
</OrgGuard>

// Feature gate
<FeatureGate feature="curved_panels">
  <CurvedPanelEditor />
</FeatureGate>
```

---

## 5. Frontend Application Structure

```
src/
├── tenant/          Multi-tenant core — org context, guards, onboarding, billing
├── jobs/            Job lifecycle board (DRAFT → CLOSED), kanban, analytics
├── quotation/       Quotation builder + PDF generation + invoice pipeline
├── ledger/          Finance, multi-book accounting, bank feed, receivables
├── factory/         Factory dashboard, job queue, CNC ops, packet dispatch
├── designer/        Cabinet designer workspace (3D canvas state management)
├── nesting/         Panel nesting optimizer (FFDH algorithm, grain direction)
├── cnc/             CNC pipeline: machine profiles → operation mapping → G-code
├── spec/            Spec lifecycle: Draft → Frozen → Released (signed packages)
├── export/          Factory artifact export: cut list CSV, DXF, PDF, artifact bundles
├── release/         Signed manifest generation, key management, release packages
├── artifacts/       Immutable artifact store for released factory packages
├── crypto/          SHA-256, Ed25519, ECDSA P-256, key store
├── gate/            Deterministic manufacturing validation rules engine
├── workflow/        Approval workflows, SLA tracking, delegation, copilot
├── mcp/             MCP (Model Context Protocol) tool registry, rate limit, authz
├── notifications/   Notification center, preferences, digest queue, realtime
├── admin/           Super admin dashboard, platform search, search analytics
├── iam/             Row-scoping helpers, secure filter for multi-role queries
├── capture/         Document capture state machine, fraud signals, verify gate
├── bridge/          Field-to-platform bridge (FieldBridgeButton)
├── manufacturing/   Manufacturing domain logic
├── connectors/      External system connectors: BIM, OCR draft, PDM
├── packet-verifier/ Factory packet verification: canonical, checks, crypto, shapes
├── installation/    Installation PM, form templates, offline queue
├── components/      Shared React UI components, canvas, export viewer, materials
├── core/            Shared infrastructure: auth, commands, geometry, history, infra
├── pages/           Page-level components (ValidationScreen, etc.)
├── routes/          React Router v6 route configuration
├── runtime/         Runtime environment schema and admin config
├── ui/              Design-system UI components
└── __tests__/       Integration and unit tests
```

---

## 6. Source Module Catalog

### `src/tenant/` — Multi-Tenant Core
**Responsibility:** The organizational identity layer. Manages the current org context, plan limits, feature gating, self-service onboarding flow, Stripe billing integration, and org-scoped Supabase query helpers.

**Key exports:** `TenantProvider`, `useTenant()`, `useOrgId()`, `useFeatureGate()`, `OrgGuard`, `FeatureGate`, `TenantOnboarding`, `scopeToOrg()`, `withOrgId()`, `assertOrgOwnership()`, `generateRlsPolicy()`

**Depends on:** `core/auth`, `core/infra`, Supabase client

---

### `src/jobs/` — Job Lifecycle
**Responsibility:** Complete job management from DRAFT through CLOSED. Provides kanban board with @dnd-kit drag-and-drop, list view, batch status transitions, job analytics dashboard (throughput, cycle time, overdue tracking), and Supabase Realtime live updates.

**Job FSM:** `DRAFT → QUOTED → APPROVED → IN_PRODUCTION → QC → DELIVERED → INVOICED → CLOSED`

**Key exports:** `useJobStore`, `JobBoard`, `DndKanbanBoard`, `JobDetailPage`, `JobAnalyticsDashboard`, `BatchStatusUpdate`, `useJobBoardRealtime`

**Depends on:** `tenant/`, `core/store`, `notifications/`, Supabase Realtime

---

### `src/quotation/` — Quotation & Invoice Pipeline
**Responsibility:** Quotation builder with line items, PDF generation (including Thai-language support), quotation→invoice atomic promotion, and invoice lifecycle management.

**Key exports:** `useQuotationStore`, `QuotationBuilder`, `buildQuotationPdf`, `estimateUnitPrice`

**Depends on:** `jobs/`, `tenant/`, jsPDF, ExcelJS

---

### `src/ledger/` — Finance & Accounting
**Responsibility:** Multi-book ledger engine, currency handling, bank feed integration with Supabase Realtime, and receivables tracking.

**Files:** `multibook.ts`, `currency.ts`, `bankfeed.ts`, `receivables.ts`, `useBankFeedRealtime.ts`

**Depends on:** `tenant/`, Supabase Realtime

---

### `src/factory/` — Factory Dashboard & Production
**Responsibility:** Factory operator view of the job queue, factory job state management, CNC operation dispatch, factory packet store, and server-side state synchronization. Manages the "factory grade" verification status for jobs.

**Key exports:** `useFactoryStore`, job status helpers (`canVerify`, `canExport`, `canArchive`), `VerifyVerdict`, `ExportRequest`

**Depends on:** `spec/`, `cnc/`, `artifacts/`, `release/`, `packet-verifier/`

---

### `src/designer/` — Cabinet Designer Workspace
**Responsibility:** The 3D cabinet design canvas state layer. Manages designer state, camera, selection, and geometry operations.

**Sub-dirs:** `state/` (Zustand stores for designer session)

**Depends on:** `core/geometry`, `core/sketch`, `core/snap`, `core/gizmo`, `core/world`

---

### `src/nesting/` — Panel Nesting Optimizer
**Responsibility:** Cut optimization algorithm (First-Fit Decreasing Height, FFDH) that packs cabinet panels onto sheets with grain direction constraints. Groups parts by material and resolves sheet configurations.

**Algorithm:** FFDH multi-sheet packing (v2.0.0 with grain direction)

**Key exports:** `runNesting`, `ffdhMultiSheet`, `packSingleSheet`, `extractNestingParts`, `groupByMaterial`

**Depends on:** `core/materials`, `gate/`

---

### `src/cnc/` — CNC Manufacturing Pipeline
**Responsibility:** Full CNC pipeline from factory packet to machine-executable G-code. Phases D1 (machine profiles), D2 (operation mapping + post-processing), D3.1 (verifiable CNC bundle ZIP with trust chain), D3.2 (IndexedDB cache with deterministic keys).

**Key exports:** machine profiles, operation mapping, `buildGcodeBundle`, `CncBundle`, `CncCache`

**Depends on:** `spec/`, `release/`, `crypto/`, `artifacts/`, `core/manufacturing`

---

### `src/spec/` — Spec Lifecycle Management
**Responsibility:** The three-phase factory workflow: `DRAFT → FROZEN (snapshot) → RELEASED (signed package)`. Manages spec state machine, gate runs, approval signatures, and release package generation. The gate step is a mandatory explicit validation before release.

**SpecState FSM:** `DRAFT → FROZEN → RELEASED`

**Key exports:** `createSpecStore`, `useSpecStore`, `canEdit`, `canRunGate`, `canRelease`, `canExport`, `SpecStoreProvider`

**Depends on:** `gate/`, `release/`, `export/`, `crypto/`

---

### `src/gate/` — Manufacturing Validation Rules
**Responsibility:** Deterministic rule engine for manufacturing validation. Enforces cut size constraints, edge allowances, minimum margins, drill depth safety, fitting spacing, and clearance rules. All rules are pure functions with no side effects.

**Rules:** `ruleCutSizeNonNegative`, `ruleEdgeAllowance`, `ruleMinMargins`, `ruleClearanceBackPanel`, `ruleDrillDepthSafety`, `ruleFittingSpacing`

**Key exports:** `runGateV01`, `canReleaseFromGate`, `getBlockers`, `getWarnings`

**Depends on:** nothing (pure domain logic)

---

### `src/export/` — Factory Artifact Export
**Responsibility:** Exports factory artifacts: cut list CSV, DXF (for CNC machines), PDF, and signed artifact bundles. Enforces SpecState (`RELEASED` only) before export. Supports both v1 (mock signing) and v2 (real ECDSA P-256 signing).

**Key exports:** `exportCutListCsv`, `exportOnlyReleased`, `exportOnlyReleasedV2`, `evalExportPolicy`, `verifyArtifactBundle`

**Depends on:** `spec/`, `crypto/`, `release/`, ExcelJS, jsPDF

---

### `src/release/` — Signed Release Packages
**Responsibility:** Generates cryptographically signed release manifests for factory packages. Manages key lifecycle (status, trust, scope, revocation), signing identity, and audit events.

**Key exports:** `buildSignedManifest`, `buildReleasePackageManifest`, `verifyManifestJsonSignature`, `DEFAULT_KEY_POLICY`, key trust helpers

**Depends on:** `crypto/`

---

### `src/crypto/` — Cryptographic Primitives
**Responsibility:** All cryptographic operations: SHA-256 hashing, base64 encoding/decoding, Ed25519 key generation and signing, ECDSA P-256 signing interface, and a browser-local key store (IndexedDB backed).

**Key exports:** `sha256Hex`, `ed25519Sign`, `ed25519Verify`, `WebCryptoEcdsaSigner`, `loadKeyPair`, `saveKeyPair`

**Depends on:** Web Crypto API (browser-native)

---

### `src/artifacts/` — Immutable Artifact Store
**Responsibility:** Stores released factory packages as immutable artifacts. Enforces verification before retrieval. Supports bundle manifest verification and strict enforcement mode (`requireVerifiedRelease`).

**Key exports:** `artifactStore`, `verifyBundleAgainstManifest`, `requireVerifiedRelease`

**Depends on:** `crypto/`

---

### `src/workflow/` — Approval Workflows & Copilot
**Responsibility:** Complex multi-subsystem module managing the full approval workflow engine. Subsystems:

| Subsystem | Purpose |
|-----------|---------|
| `approval/` | Quorum-based approval decisions, multi-approver routing |
| `sla/` | SLA tracking, deadline computation, escalation triggers |
| `delegation/` | Temporary delegation of approval authority |
| `revision/` | Revision gates, discipline-based routing |
| `notification/` | Workflow-triggered notification dispatch |
| `handoff/` | Stage handoff enforcement (strict ordering) |
| `copilot/` | AI-powered workflow suggestion engine |
| `autonomy/` | Automation ladder (fully manual → fully autonomous) |
| `audit/` | Immutable audit trail for all workflow decisions |
| `identity/` | Worker identity binding (auth.uid ↔ employee) |
| `field/` | Field technician lanes and submission |
| `knowledge/` | Knowledge export consumption (PFMEA, RPN, process model) |
| `access/` | Access control for workflow operations |
| `resolver/` | Routing resolver for approval path computation |
| `domain/` | Core workflow domain types |

**Depends on:** `iam/`, `notifications/`, `mcp/`, `capture/`, Supabase

---

### `src/mcp/` — Model Context Protocol Layer
**Responsibility:** Manages AI tool invocations under governance. Provides rate limiting, authorization, idempotency, PDPA compliance (data redaction), expiry handling, untrusted-input sanitization, and a tool catalog/registry.

**Key files:** `authz.ts`, `autonomy.ts`, `catalog.ts`, `ratelimit.ts`, `redaction.ts`, `pdpa.ts`, `expiry.ts`, `idempotency.ts`, `schema.ts`, `untrusted.ts`

**Depends on:** `workflow/autonomy`, `iam/`, `capture/`

---

### `src/notifications/` — Notification System
**Responsibility:** Full notification pipeline: real-time bell/panel UI, user preferences (quiet hours, per-category mute), digest queue management, and Supabase Realtime subscription.

**Key exports:** `NotificationCenter`, `NotificationBell`, `useNotificationStore`, `useNotificationRealtime`, `isInQuietHours`, `DEFAULT_PREFERENCES`

**Depends on:** `tenant/`, Supabase Realtime

---

### `src/admin/` — Super Admin & Platform Search
**Responsibility:** Super-admin dashboard (tenant lifecycle management), platform-wide full-text search across jobs/members/invoices, search analytics dashboard, autocomplete suggestions, saved search bookmarks, and CSV export of analytics.

**Key exports:** `SuperAdminDashboard`, `PlatformSearchPanel`, `SearchAnalyticsDashboard`, `AutocompleteDropdown`, `BookmarkPanel`

**Depends on:** `tenant/`, Supabase FTS (ts_vector ranking)

---

### `src/iam/` — Identity & Access Management Helpers
**Responsibility:** Row-scoping utilities for multi-role queries and a secure filter that prevents unauthorized data exposure in complex joins.

**Files:** `scope.ts`, `secure-filter.ts`

**Depends on:** `tenant/`

---

### `src/capture/` — Document Capture
**Responsibility:** State machine for document capture lifecycle (ingest → extraction → verification → promotion). Includes fraud signal detection, idempotency enforcement, and a verify gate before capture promotion.

**Files:** `state-machine.ts`, `verify-gate.ts`, `verify-rules.ts`, `fraud-signal.ts`, `idempotency.ts`

**Depends on:** `workflow/`, `release/`

---

### `src/bridge/` — Field Bridge
**Responsibility:** Provides `FieldBridgeButton` component that connects the field technician interface to the main platform, enabling field-to-office data handoff.

**Depends on:** `workflow/field`, `installation/`

---

### `src/manufacturing/` — Manufacturing Domain
**Responsibility:** Core manufacturing business logic, material costing, and production planning rules shared across factory and CNC modules.

**Depends on:** `gate/`, `core/materials`

---

### `src/connectors/` — External System Connectors
**Responsibility:** Integration adapters for external systems: BIM (Building Information Modeling), OCR draft extraction, and PDM (Product Data Management).

**Files:** `bim.ts`, `ocr-draft.ts`, `pdm.ts`

---

### `src/packet-verifier/` — Factory Packet Verification
**Responsibility:** Verifies factory packets (ZIP bundles from the CNC pipeline) against their signed manifests. Organized into canonical format handling, check rules, cryptographic verification, container parsing, interoperability, and shape validation.

**Sub-dirs:** `canonical/`, `checks/`, `container/`, `crypto/`, `interop/`, `shapes/`, `testkit/`

**Depends on:** `crypto/`, `release/`

---

### `src/installation/` — Installation Management
**Responsibility:** Installation project management lifecycle: form templates, PM core, issues tracking, lifecycle wiring, and an offline queue for field operations without connectivity.

**Sub-dirs:** `offline-queue/`

**Depends on:** `workflow/field`, `bridge/`

---

### `src/core/` — Shared Infrastructure
The largest module. Houses all shared platform infrastructure:

| Sub-dir | Purpose |
|---------|---------|
| `auth/` | Auth session, user context |
| `geometry/` | 2D/3D geometry primitives, spatial operations |
| `materials/` | Material catalog, thickness contracts |
| `commands/` | Command pattern for undo/redo history |
| `history/` | Undo/redo stack management |
| `store/` | Zustand store factory and persist helpers |
| `infra/` | Supabase client initialization, API wrappers |
| `api/` | Typed Supabase RPC wrappers |
| `config/` | Environment configuration |
| `manufacturing/` | Manufacturing constants and types |
| `schema/` | Shared JSON schema definitions |
| `sync/` | Optimistic state sync helpers |
| `telemetry/` | Lightweight event telemetry |
| `ui/` | Core UI primitives |
| `utils/` | General utility functions |
| `math/` | Numeric and geometric math helpers |
| `snap/` | Snap-to-grid and snap-to-point algorithms |
| `collision/` | Collision detection for canvas objects |
| `clearance/` | Panel clearance computation |
| `drillGuide/` | Drill guide computation |
| `fitting/` | Cabinet fitting geometry |
| `hardware/` | Hardware catalog |
| `sketch/` | Sketch primitives |
| `world/` | 3D world coordinate system |
| `trust/` + `trustChain/` | Trust chain verification |
| `receipt/` + `receiptIngest/` + `receiptViewer/` | Receipt document pipeline |
| `factoryPackage/` | Factory package assembly |
| `manifest/` | Artifact manifest helpers |
| `spec/` | Spec state helpers (core layer) |
| `lineage/` | Artifact lineage tracking |
| `diagnostics/` | Runtime diagnostics |
| `preflight/` | Pre-flight checks before operations |
| `phase1/` | Phase 1 bridge helpers |
| `fixPlan/` | Fix plan computation |
| `flatpart/` | Flat part extraction |
| `worktop/` | Worktop geometry |
| `cplane/` | Construction plane |
| `underlay/` | Underlay rendering |
| `session/` | Session lifecycle |
| `persistence/` | Local persistence (IndexedDB) |
| `skills/` | Skill registry |
| `theme/` | Theme tokens |
| `chainEvents/` | Chain event bus |
| `designerIntent/` | Designer intention capture |
| `cutDirection/` | Cut direction computation |
| `catalog/` | Shared catalog types |
| `connector/` | Core connector interface |
| `engines/` | Engine registry |
| `guards/` | Shared type guards |
| `issues/` | Issue tracking types |
| `jobRegistry/` | Job registry helpers |
| `kernelClient/` | Kernel client interface |
| `modeling/` | Solid modeling primitives |
| `snapshot/` | State snapshot for spec freeze |
| `spatial/` | Spatial indexing |
| `types/` | Global shared types |
| `bundle/` | Bundle assembly helpers |
| `adapter/` | Platform adapter interfaces |
| `drag/` | Drag interaction helpers |
| `gizmo/` | Transform gizmo |
| `model/` | Core data model |

---

### `src/runtime/` — Runtime Environment
**Responsibility:** Schema validation for runtime environment variables and admin configuration loading.

**Files:** `env.ts`, `env.schema.ts`, `admin.ts`, `admin.schema.ts`

---

### `src/routes/` — React Router Configuration
**Responsibility:** Defines all application routes, lazy loading, and route guards.

**Route map:**

| Path | Module | Minimum Role |
|------|--------|-------------|
| `/` | Designer workspace | All |
| `/onboarding` | TenantOnboarding | Unauthenticated |
| `/jobs` | JobBoard | DESIGNER, FACTORY, ADMIN |
| `/jobs/new` | CreateJobWizard | DESIGNER, ADMIN |
| `/jobs/:jobId` | JobDetailPage | DESIGNER, FACTORY, ADMIN |
| `/jobs/analytics` | JobAnalyticsDashboard | ADMIN, FINANCE |
| `/jobs/kanban` | DndKanbanBoard | DESIGNER, FACTORY, ADMIN |
| `/quotations` | QuotationBuilder | FINANCE, ADMIN |
| `/finance` | Ledger/Finance Dashboard | FINANCE, ADMIN |
| `/factory` | Factory Dashboard | FACTORY |
| `/settings` | Org Settings | ADMIN, OWNER |

---

## 7. Server (Factory Server)

`server/` is an independent Node.js package (`monolith-factory-server v0.13.2`) with its own `package.json`.

```
server/src/
├── api/             Express HTTP API (job verification, export requests)
├── worker/          BullMQ worker (async factory packet processing)
├── cli/             receiptVerify CLI (offline packet verification)
├── packet/v2/       Factory packet v2: canonical format, generator, signature, ZIP
└── post/            G-code post-processor: offsetKernel (arc, constraints,
                     cut-side plan, direction policy, entry/exit, join solver,
                     multi-tool routing, self-intersect, tool change planner)
```

**Server dependencies:**

| Package | Role |
|---------|------|
| `express@4.22.1` | HTTP API server |
| `bullmq@5.66.5` | Queue and worker management |
| `ioredis` | Redis client for BullMQ |
| `uuid@9.0.1` | UUID v4 generation |
| `yauzl@3.2.0` | ZIP extraction (CLI receipt verification) |
| `yazl@3.3.1` | ZIP creation (packet assembly) |
| `pdfkit@0.17.2` | PDF generation |
| `cors@2.8.5` | CORS middleware |

---

## 8. Database & Migration Layer

**184 SQL migrations** in `supabase/migrations/`, numbered `0001` through `0172` plus dated migrations (`20260828_*`).

### Migration Timeline

| Range | Theme |
|-------|-------|
| 0001–0020 | Core notifications, RPC foundations, copilot |
| 0021–0050 | Capture pipeline, MCP registry, audit RPCs |
| 0051–0075 | Capture promote/verify/feedback, vendor master, ledger engine, material costing |
| 0076–0100 | Scrutiny waves, site survey, receivables, capture corrections, cloud allow |
| 0101–0130 | Field RPCs, QC gates, payment plans, phase roster, designer matching, scrutiny fixes |
| 0131–0160 | Package registry, variation orders, factory server state, identity binding, floorplan |
| 0161–0172 | Factory packet store, storage hash semantics, bank feed realtime, jobs/quotations/invoices |
| 20260828_* | Audit log metering, multi-tenant schema, platform FTS, search bookmarks, super admin |

### Key Stored Procedures / RPCs

| RPC | Purpose | Auth |
|-----|---------|------|
| `rpc_approve_quotation` | Atomic: update quotation + create invoice + update job | FINANCE/ADMIN |
| `rpc_record_payment` | Atomic: insert payment + recalculate invoice status | FINANCE/ADMIN |
| `rpc_job_board` | Dashboard query: jobs + customer names | DESIGNER/FACTORY/FINANCE/ADMIN |
| `get_user_org_id()` | RLS helper: returns caller's org_id | SECURITY DEFINER |
| `rpc_sla_*` | SLA deadline computation and escalation | Internal |
| `rpc_mcp_invoke_*` | MCP tool invocation under governance | Internal |
| `rpc_capture_*` | Capture lifecycle operations | Internal |

---

## 9. Inter-Module Dependency Map

```
                           ┌─────────────────┐
                           │   src/tenant/   │ ← Auth foundation
                           └────────┬────────┘
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             src/jobs/      src/quotation/   src/ledger/
                    │               │
                    └───────┬───────┘
                            ▼
                    src/notifications/

src/spec/ ──────────────────────────────────────────────────┐
  uses: gate/ → validates parts                             │
  uses: release/ → signs manifests                          │
  uses: export/ → generates artifacts                       │
  uses: crypto/ → hash + sign                               │
                                                            ▼
src/factory/ ──────────────────────────────────► src/artifacts/
  uses: spec/ (reads SpecState)                    (stores released
  uses: cnc/ (dispatches G-code)                   packages)
  uses: packet-verifier/ (validates packets)

src/cnc/ ──────────────────────────────────────────────────┐
  uses: spec/ (reads released spec)                        │
  uses: release/ (reads signed manifests)                  │
  uses: crypto/ (verifies hashes)                          │
  uses: core/manufacturing (material + machine constants)  │
                                                           ▼
                                              server/ (Factory Server)
                                                (receives CNC bundles,
                                                 processes via worker)

src/workflow/ ──────────────────────────────────────────────┐
  uses: iam/ (row scoping)                                  │
  uses: notifications/ (dispatch)                           │
  uses: mcp/ (AI copilot tools)                             │
  uses: capture/ (document capture)                        │
  uses: knowledge/ (PFMEA, RPN, process model)             │
                                                           ▼
                                              src/installation/
                                              src/bridge/

src/core/ ← depended on by ALL modules (geometry, auth, store, infra, utils)

src/admin/ ──── uses: tenant/ (super-admin only)
                uses: Supabase FTS (ts_vector)
```

---

## 10. Runtime Data Flow

### Job Creation → Factory Export

```
User (DESIGNER role)
  └─► CreateJobWizard (src/jobs/)
        └─► useCreateJobSubmit → scopeToOrg() → Supabase INSERT public.jobs
              └─► RLS: org_id = get_user_org_id() ✓
                    └─► useJobBoardRealtime → Zustand jobStore → JobBoard re-renders

Designer finishes design
  └─► SpecStoreProvider (src/spec/)
        ├─► Freeze: createFrozenSnapshot → hash all panels
        ├─► Gate: runGateV01 (src/gate/) → validate cut sizes, drill depths, etc.
        └─► Release: buildSignedManifest (src/release/) → ECDSA P-256 sign
              └─► exportOnlyReleasedV2 (src/export/) → artifact bundle
                    └─► Factory Server (server/) receives bundle
                          └─► BullMQ worker verifies packet → G-code generation (src/cnc/)
                                └─► CNC machine receives G-code bundle
```

### Multi-Tenant Query Isolation

```
Browser → supabase.from('public.jobs').select('*')
             ↓
          Postgres RLS: WHERE org_id = get_user_org_id()
             ↓  (get_user_org_id() reads org_members for auth.uid())
          Returns: only rows where org_id matches caller's org
             ↓
          Realtime channel: also filtered by org_id
```

---

## 11. Test Architecture

| Layer | Tool | Location | Count |
|-------|------|----------|-------|
| Unit tests | Vitest | `src/**/__tests__/` | ~350 files |
| E2E tests | Playwright | `e2e/` | Multiple suites |
| DB invariants | PostgreSQL (SQL tests) | `supabase/tests/` | 1 suite |
| Agent guardrails | Python (pytest) | `tests/agent_guardrails/` | 8 test files |
| Codex skills | Python (pytest) | `tests/codex_skills/` | 6 test files |
| LineOS | Node (vitest) | `LineOS/tests/` | 9 test files |
| Server | Vitest | `server/src/packet/v2/__tests__/` | 6 test files |

### Test Scripts (from package.json)

```bash
pnpm test              # Unit tests (Vitest)
pnpm test:run          # Run once (no watch)
pnpm test:gate         # Gate module tests only
pnpm test:s17-4        # Server packet v2 tests
pnpm e2e               # E2E tests (Playwright)
pnpm e2e:smoke         # Smoke subset
pnpm verify            # Full verification suite
pnpm typecheck:all     # TypeScript type checking
pnpm lint:strict       # ESLint strict mode
```

---

## 12. Key Design Decisions (ADR Summary)

| ADR | Decision | Status |
|-----|---------|--------|
| ADR-001 | Obsidian = static knowledge layer only; all workflow/approval logic on Monolith | Accepted |
| ADR-002 | Reuse `line-oa-commerce` primitives (security, audit, autonomy) — no fork | Accepted |
| ADR-003 | All approvals have a web fallback path; never LINE-only | Accepted |
| ADR-004 | User mute always wins over direct-responsibility Quiet-Hours bypass | Accepted |
| ADR-005 | Design draft sign-off → lead designer only; never escalates to executive | Accepted |
| ADR-006 | All file operations are non-destructive copy-in; junk → Archives, never delete | Accepted |
| ADR-007 | SheetJS for `.xls` reading (exceljs cannot read BIFF legacy format) | Accepted |
| ADR-008 | Phased ERP build: Phase 1 = workflow engine, Phase 2 = CRM/Manufacturing, Phase 3 = Finance | Accepted |
| ADR-009 | Vault_Builder emits machine-readable Knowledge_Export; workflow reads only, never writes back | Accepted |
| ADR-010 | 3D model is two distinct phases: `3D_Presentation` (pre-PP) and `3D_Rendering_Final` (post-PP) | Accepted |
| ADR-011 | Unassessed RPN (null) = fail-safe to human review; never auto-passes | Accepted |
| ADR-012 | Store raw SEV/OCC/DET; compute both RPN and AIAG-VDA Action Priority (dual-standard) | Accepted |
