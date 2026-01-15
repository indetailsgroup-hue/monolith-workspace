# IIMOS Implementation Progress

> Track completed work and remaining tasks.
> Update this file as features are implemented.

## Key Management System

### Completed

- [x] **v0.4 Key Import** - Import Ed25519 keys with metadata
  - `src/release/keys/importExport.ts`
  - `src/components/ui/KeyImportPanel.tsx`

- [x] **v0.5 Scope Enforcement** - ORG | FACTORY | PROJECT scopes
  - `src/release/keys/guards.ts`
  - Factory device binding via `factoryId`

- [x] **v0.6 Admin Override** - Passphrase auth + audit trail
  - `src/runtime/admin.ts` - Admin session management
  - `src/release/keys/audit.ts` - Audit logging
  - `src/components/ui/AdminOverrideDialog.tsx`
  - Scope mismatch → QUARANTINE (allows admin override)

- [x] **v0.7 Signed Revocation Policy** - Policy as release artifact
  - `src/release/policy/revocationPolicyTypes.ts`
  - `src/release/policy/localRevocationPolicyStore.ts`
  - `src/release/policy/buildRevocationPolicyArtifact.ts`
  - `src/release/policy/verifyRevocationPolicyArtifact.ts`
  - `src/release/policy/applyRevocationPolicy.ts`

- [x] **v0.8 Policy Manager UI** - Admin-only CRUD + export
  - `src/components/ui/PolicyManagerPanel.tsx`
  - `src/components/ui/AdminGatePanel.tsx`

- [x] **v0.9 Policy Import + Precedence** - Bundle > Installed > None
  - `src/release/policy/installedPolicyStore.ts`
  - `src/release/policy/policyPrecedence.ts`
  - `src/components/ui/PolicyImportPanel.tsx`

- [x] **v0.10 Auto requirePolicy in FACTORY mode**
  - `src/release/policy/verifyPolicyMode.ts`
  - `src/components/ui/PolicyStatusBanner.tsx`
  - `src/artifacts/verify.ts` - Auto policy check
  - `src/spec/ui/ReleaseCenter.tsx` - Banner + button blocking

### Pending

- [ ] **v0.11** - TBD (next feature)
- [ ] Push v0.9-v0.10 to GitHub (waiting for auth)

## Release Workflow

### Completed

- [x] Spec state machine (DRAFT → FROZEN → GATED → RELEASED)
- [x] Snapshot creation on freeze
- [x] Gate report generation
- [x] Manifest building with SHA-256 hashes
- [x] Ed25519 manifest signing
- [x] Artifact bundle storage
- [x] ReleaseCenter UI with verification

### Pending

- [ ] Multi-signature support for release approval
- [ ] Release history/versioning UI

## Cabinet System

### Completed

- [x] Parametric cabinet calculations
- [x] Panel generation (carcass, face frame, etc.)
- [x] Compartment system (shelves, dividers)
- [x] Material system with textures
- [x] 3D visualization

### Pending

- [ ] Drawer system
- [ ] Door/hinge system
- [ ] Hardware catalog

## Export System

### Completed

- [x] Cut list CSV export
- [x] Manifest JSON export
- [x] Trust chain export viewer

### Pending

- [ ] DXF export for CNC
- [ ] Label generation

---

*Last updated: 2026-01-15 (v0.10 session)*
