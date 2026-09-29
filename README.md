# MONOLITH — Manufacturing OS (Multi-Tenant SaaS Platform)

> **Current product version:** `v17.5.2` — the root `package.json` is the canonical version source. The matching tag and GitHub Release are published only after every production release gate passes.
>
> **MONOLITH** is a multi-tenant SaaS platform for custom manufacturing businesses.
> Each customer organization (e.g., DAPH Decor, kitchen builders, joinery shops) registers as a **tenant** and gets a fully-isolated workspace with its own jobs, quotations, invoices, and factory pipeline.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MONOLITH PLATFORM                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  DAPH Decor  │  │  ABC Kitchen │  │  XYZ Joinery │  ... N orgs  │
│  │  (tenant)    │  │  (tenant)    │  │  (tenant)    │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                      │
│         ▼                  ▼                  ▼                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              Shared Application Layer                        │    │
│  │  Designer │ Factory │ Finance │ Jobs │ Quotations │ Nesting  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              Supabase (Postgres + Auth + Realtime)           │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │  RLS: org_id = get_user_org_id() — TENANT ISOLATION  │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Tenant Isolation** — All data is scoped by `org_id`. Supabase RLS enforces this at the database level. No tenant can ever see another tenant's data.
2. **Self-Service Onboarding** — New customers register, create their org, choose a plan, and are ready to work within minutes.
3. **Role-Based Access** — Each org member has a role (OWNER, ADMIN, DESIGNER, FACTORY, INSTALLER, FINANCE, VIEWER) that controls what they can see and do.
4. **Plan-Based Feature Gates** — Features like curved panels, DXF export, and analytics are gated by the organization's subscription plan.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| State | Zustand (with persist) |
| Styling | Tailwind CSS |
| Backend | Supabase (Postgres, Auth, Realtime, Edge Functions) |
| Database | PostgreSQL with RLS |
| Testing | Vitest (unit) + Playwright (E2E) |
| Drag & Drop | @dnd-kit |
| Export | ExcelJS, jsPDF, html2canvas |
| Deployment | Vercel (frontend) + Supabase (backend) |

---

## Module Map

```
src/
├── tenant/                   # Multi-tenant core (NEW v16.0)
│   ├── types.ts             # Organization, OrgMember, OrgRole, plans
│   ├── tenantStore.ts       # Zustand store for current tenant context
│   ├── TenantProvider.tsx   # React context + hooks + guards
│   ├── TenantOnboarding.tsx # Self-service org registration flow
│   ├── orgScopedQuery.ts    # Supabase query scoping helpers
│   └── index.ts             # Barrel exports
├── jobs/                     # Job lifecycle (DRAFT → CLOSED)
│   ├── types.ts             # Job, JobStatus, transitions
│   ├── jobStore.ts          # Zustand job CRUD + status machine
│   ├── JobBoard.tsx         # Kanban/list view with multi-select
│   ├── JobDetailPage.tsx    # Full job detail + export toolbar
│   ├── JobAnalyticsDashboard.tsx  # Throughput, cycle time, overdue
│   ├── DndKanbanBoard.tsx   # @dnd-kit drag-and-drop board
│   ├── BatchStatusUpdate.tsx # Batch transitions with modal
│   └── ...
├── quotation/                # Quotation builder + PDF generation
├── ledger/                   # Finance & accounting
├── factory/                  # Factory dashboard & production
├── designer/                 # Cabinet designer workspace
├── nesting/                  # Panel nesting optimizer
├── export/                   # XLSX, DXF, PDF batch exports
├── iam/                      # IAM & row-scoping (AUTHZ)
├── core/                     # Shared infra (auth, store, UI, session)
├── routes/                   # React Router v6 configuration
└── __tests__/                # All unit tests
```

---

## Multi-Tenant Data Model

### Organizations Table
```sql
organizations (
  org_id UUID PRIMARY KEY,
  name TEXT,
  slug TEXT UNIQUE,          -- URL: monolith.app/{slug}
  plan TEXT,                 -- FREE | STARTER | PROFESSIONAL | ENTERPRISE
  status TEXT,               -- ACTIVE | TRIAL | SUSPENDED | CANCELLED
  settings JSONB,            -- locale, currency, timezone, feature flags
  max_users INTEGER,
  max_jobs_per_month INTEGER,
  trial_ends_at TIMESTAMPTZ
)
```

### Org Members Table
```sql
org_members (
  member_id UUID PRIMARY KEY,
  org_id UUID → organizations,
  user_id UUID → auth.users,
  role TEXT,                 -- OWNER | ADMIN | DESIGNER | FACTORY | INSTALLER | FINANCE | VIEWER
  is_active BOOLEAN
)
```

### Tenant Isolation (RLS)
Every business table (jobs, quotations, invoices, ledger_entries) has:
- `org_id UUID` column
- RLS policy: `USING (org_id = get_user_org_id())`

---

## Plans & Feature Gates

| Feature | FREE | STARTER | PROFESSIONAL | ENTERPRISE |
|---------|------|---------|--------------|------------|
| Basic Design | ✓ | ✓ | ✓ | ✓ |
| Manual Export | ✓ | ✓ | ✓ | ✓ |
| Nesting | — | ✓ | ✓ | ✓ |
| Quotations | — | ✓ | ✓ | ✓ |
| Curved Panels | — | — | ✓ | ✓ |
| DXF Export | — | — | ✓ | ✓ |
| Analytics | — | — | ✓ | ✓ |
| API Access | — | — | — | ✓ |
| SSO | — | — | — | ✓ |
| Custom Branding | — | — | — | ✓ |
| Max Users | 2 | 5 | 20 | Unlimited |
| Jobs/month | 10 | 50 | 200 | Unlimited |

---

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm
- Supabase project (for backend features)

### Install & Run
```bash
git clone https://github.com/indetailsgroup-hue/monolith-workspace.git
cd monolith-workspace
pnpm install
pnpm dev
```

### Environment Variables
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Run Tests
```bash
pnpm test              # Unit tests (Vitest)
pnpm test:e2e         # E2E tests (Playwright)
```

---

## Route Map

| Path | Component | Access |
|------|-----------|--------|
| `/` | Designer Workspace | All |
| `/onboarding` | Tenant Onboarding | Unauthenticated / new users |
| `/jobs` | Job Board (Kanban/List) | DESIGNER, FACTORY, ADMIN |
| `/jobs/new` | Create Job Wizard | DESIGNER, ADMIN |
| `/jobs/:jobId` | Job Detail | DESIGNER, FACTORY, ADMIN |
| `/jobs/analytics` | Analytics Dashboard | ADMIN, FINANCE |
| `/jobs/kanban` | DnD Kanban Board | DESIGNER, FACTORY, ADMIN |
| `/quotations` | Quotation List | FINANCE, ADMIN |
| `/finance` | Finance Dashboard | FINANCE, ADMIN |
| `/factory` | Factory Dashboard | FACTORY |
| `/settings` | Org Settings | ADMIN, OWNER |

---

## Customer Examples

- **DAPH Decor** — Interior decoration & custom cabinetry (Thailand)
- Furniture manufacturers
- Kitchen builders
- Joinery workshops
- Signage companies
- Metal fabrication shops

Each customer gets their own isolated workspace with custom branding, locale settings, and feature access based on their subscription plan.

---

## Version History

| Version | Milestone |
|---------|-----------|
| v17.5.2 | Release-readiness stabilization, routed business modules, production RLS verification, and Digital Shadow integration |
| v17.5.1 | Super Employee Tracker and AI Cost Estimation foundation |
| v17.5.0 | Training Tracker and Super Employee Tracker |
| v17.0.0 | Process Templates module |
| v16.0.0 | Multi-tenant architecture, org onboarding, RLS isolation |
| v15.5.0 | Analytics dashboard, DnD Kanban, Supabase Realtime |
| v15.4.0 | Toast layout, batch status update, print E2E |
| v15.3.0 | Print/PDF export, Edge Function deploy, notifications |
| v15.2.0 | Job Detail, Thai PDF, optimistic submit |
| v15.1.0 | Job routes, realtime board, E2E tests |
| v15.0.0 | Real auth, job lifecycle, quotation→invoice pipeline |
| v14.x | Finance dashboard, RPC, WebSocket, RBAC |
| v13.x | Curved panel system, nesting, DXF batch export |

---

## License

Proprietary — © indetailsgroup
