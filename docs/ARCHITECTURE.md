# MONOLITH — Architecture Document

## 1. System Identity

**MONOLITH** is a **multi-tenant SaaS Manufacturing Operating System**.

It is NOT a system built for one company. It is a **platform** that serves multiple manufacturing businesses (tenants). Each tenant (organization) registers, selects a plan, and operates independently within an isolated workspace.

### Example Tenants
| Tenant | Industry | Plan |
|--------|----------|------|
| DAPH Decor | Interior decoration | PROFESSIONAL |
| ABC Kitchen | Kitchen manufacturing | STARTER |
| XYZ Joinery | Custom woodwork | ENTERPRISE |

---

## 2. Multi-Tenant Architecture

### 2.1 Tenant Model
```
User (auth.users) ──M:N──▶ Organization (organizations)
                              │
                    via org_members (role-based)
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
                  Jobs    Quotations  Invoices  ... (all scoped by org_id)
```

### 2.2 Isolation Strategy

| Layer | Mechanism |
|-------|-----------|
| Database | Postgres RLS — every table has `org_id` column + policy |
| Application | `useTenant()` hook provides org context; `scopeToOrg()` helper for queries |
| API | Edge Functions validate `org_id` matches JWT claims |
| Frontend | `<OrgGuard>` and `<FeatureGate>` components prevent UI access |
| Storage | Supabase Storage buckets scoped by `org_id/` prefix |

### 2.3 Data Flow
```
Browser → React (TenantProvider) → Supabase Client (org-scoped query)
                                         ↓
                                   Postgres (RLS enforces org_id = get_user_org_id())
                                         ↓
                                   Returns only tenant's data
```

---

## 3. Authentication & Authorization

### 3.1 Auth Stack
- **Supabase Auth** — email/password, OAuth (Google), magic link
- **JWT** — contains `user_id`, consumed by RLS functions
- **org_members** — maps user to org(s) with role

### 3.2 Role Hierarchy
```
OWNER (100) > ADMIN (80) > DESIGNER/FACTORY/FINANCE (60) > INSTALLER (40) > VIEWER (10)
```

### 3.3 Permission Matrix
| Capability | OWNER | ADMIN | DESIGNER | FACTORY | FINANCE | VIEWER |
|-----------|-------|-------|----------|---------|---------|--------|
| Manage Members | ✓ | ✓ | — | — | — | — |
| Manage Billing | ✓ | — | — | — | — | — |
| Create Jobs | ✓ | ✓ | ✓ | — | — | — |
| Transition Status | ✓ | ✓ | ✓ | ✓ | — | — |
| View Finance | ✓ | ✓ | — | — | ✓ | — |
| Manage Settings | ✓ | ✓ | — | — | — | — |
| Export Data | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| View Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 4. Plan-Based Feature Gating

Features are controlled at the organization level via `plan`:

```typescript
// In component
<FeatureGate feature="curved_panels">
  <CurvedPanelEditor />
</FeatureGate>

// In logic
if (tenant.hasFeature('dxf_export')) {
  await exportDxf(panels);
}
```

Plan limits are enforced both in UI (disable/hide) and API (reject if over quota).

---

## 5. Onboarding Flow

```
New User Signs Up (Supabase Auth)
       │
       ▼
 No org_members record?
       │ YES
       ▼
 /onboarding route
       │
       ├── Step 1: Company Info (name, industry)
       ├── Step 2: Plan Selection
       ├── Step 3: Workspace Config (locale, prefix)
       └── Step 4: Confirm → Create Organization + OrgMember(OWNER)
              │
              ▼
        Redirect to /jobs (main dashboard)
```

Existing users can be **invited** to an org via email:
1. Admin creates invitation (email + role)
2. Invitee receives link with secure token
3. On acceptance: create `org_member` record
4. Invitee accesses org workspace

---

## 6. Job Lifecycle (per tenant)

```
DRAFT → QUOTED → APPROVED → IN_PRODUCTION → QC → DELIVERED → INVOICED → CLOSED
```

All jobs carry `org_id`. The job code prefix comes from `org.settings.jobCodePrefix`.

---

## 7. Realtime Architecture

```
Supabase Realtime (postgres_changes)
       │
       ▼
useSupabaseRealtimeChannel (filters by org_id)
       │
       ▼
Zustand Store (single source of truth)
       │
       ▼
React Components re-render
```

Channel subscriptions are scoped to the tenant's org_id to prevent cross-tenant event leakage.

---

## 8. Deployment

| Component | Platform | URL Pattern |
|-----------|----------|-------------|
| Frontend | Vercel | monolith.app |
| Database | Supabase | *.supabase.co |
| Edge Functions | Supabase | *.supabase.co/functions/v1/* |
| Storage | Supabase | *.supabase.co/storage/v1/* |

### Environment Variables
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY (server-side only)
```

---

## 9. Security Considerations

1. **RLS everywhere** — No table without RLS policies
2. **Service role key** — Never exposed to frontend
3. **Invitation tokens** — Cryptographically random, time-limited
4. **Cross-org checks** — `assertOrgOwnership()` before mutations
5. **Plan enforcement** — Server-side validation (not just UI gates)
6. **Audit trail** — All state transitions logged with user_id + timestamp

---

## 10. Future Roadmap

- [ ] SSO / SAML integration (ENTERPRISE plan)
- [ ] Custom domains per tenant
- [ ] White-label theming (logo, colors, fonts)
- [ ] Usage-based billing (Stripe metering)
- [ ] Tenant data export (GDPR compliance)
- [ ] Multi-region deployment
- [ ] Webhooks for external integrations
