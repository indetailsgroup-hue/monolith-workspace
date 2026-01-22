# Monolith Implementation Progress

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

- [x] **v0.11 DXF Export** - CAD-ready DXF with drilling patterns
  - `src/core/export/cabinetToDxf.ts`
  - `src/core/export/exportPipeline.ts` - Added DXF helpers
  - System 32, Confirmat holes, Hinge cups, Back groove

- [x] **P9 Spec Lineage Anchor** - Cryptographic chain-of-custody (FE)
  - `src/core/lineage/lineageTypes.ts` - Event types, ChangeClass
  - `src/core/lineage/lineageWriter.ts` - Append-only JSONL writer
  - `src/core/lineage/lineageReader.ts` - Query, graph building
  - `src/core/store/useSpecStore.ts` - Auto-record on freeze/release
  - `src/components/ui/LineageTimeline.tsx` - Timeline UI

- [x] **P9.1 Server-Anchored Lineage** - Export success linked to revision
  - `server/src/lineage/lineageTypes.ts` - Server event types
  - `server/src/lineage/lineageStorage.ts` - Append-only JSONL (server-derived)
  - `server/src/lineage/lineageRoute.ts` - GET /factory/jobs/:jobId/lineage
  - `server/src/export/exportServiceP22a.ts` - Record EXPORT_SUCCESS_LINK
  - Storage: `LINEAGE_DIR/<jobId>/lineage.jsonl`

- [x] **Phase A: Gate → UI Integration** - Visual feedback for Gate validation
  - `src/gate/ui/gateTypes.ts` - Type definitions (GateFinding, GatePatch, GateResult)
  - `src/gate/ui/gateStore.ts` - Zustand store for Gate UI state
  - `src/gate/ui/selectionResolvers.ts` - Cabinet → DrillMapPoint resolution
  - `src/gate/ui/focusEntity.ts` - Camera focus on entity positions
  - `src/gate/ui/applyGatePatch.ts` - JSON Patch applier with security validation
  - `src/gate/ui/GateStatusIndicator.tsx` - Compact pass/fail badge
  - `src/gate/ui/SafetyPanel.tsx` - Left sidebar Safety tab content
  - `src/gate/ui/RightInspectorSafetySection.tsx` - Contextual findings for selected cabinet
  - `src/gate/ui/GateSceneHighlights.tsx` - R3F markers at affected entity positions
  - Integration: Safety tab in DesignerIntentPanel, section in RightInspector

### Pending

- [ ] **v0.12** - TBD (next feature)
- [ ] Push changes to GitHub (waiting for auth)

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
- [x] **Construction Type Selector** - Face Frame / Frameless selection
  - `src/components/ui/ConstructionTypeSelector.tsx`
- [x] **BIM Classification Badge** - OmniClass/Uniclass codes
  - `src/components/ui/BIMClassificationBadge.tsx`

### Pending

- [ ] Drawer system
- [ ] Door/hinge system
- [ ] Hardware catalog

## 3D Scene Tools

### Completed

- [x] **Transform Controls** - Move/Rotate cabinets with TransformControls
  - `src/components/canvas/CabinetTransformControls.tsx`
  - V5 Snap Session with intent detection, sticky selection
- [x] **Snap System** - Edge/grid/vertex/wall snapping
  - `src/core/utils/snapSystem.ts`
  - `src/components/canvas/SnapGuides.tsx`
- [x] **Plasticity-Style Hotkeys** - Professional 3D modeling shortcuts
  - `src/core/ui/useGlobalHotkeys.ts`
  - H/Shift+H/Alt+H - Hide/Show cabinets
  - / - Focus on selected cabinet
  - . - Isolate selected cabinet
  - O - Toggle Orthographic camera
  - X - Toggle X-Ray mode (drill patterns)
  - G/R - Move/Rotate tools
  - Numpad 1/3/7/5 - View presets

## Manufacturing Calculators

### Completed

- [x] **CNC Tool Panel** - Tool selection + Feed/Speed calculator
  - `src/components/ui/CNCToolPanel.tsx`
- [x] **Kerf Bending Calculator** - Calculate kerf count/spacing
  - `src/components/calculators/KerfBendingCalculator.tsx`
  - `src/core/catalog/KerfBending.ts`
- [x] **Hidden Door Hinge Calculator** - Door weight + hinge requirements
  - `src/components/calculators/HiddenDoorHingeCalculator.tsx`
- [x] **Wainscoting Calculator** - Panel layout for wall decoration
  - `src/components/calculators/WainscotingCalculator.tsx`
- [x] **Slat Calculator** - Slat/Batten spacing calculation
  - `src/components/calculators/SlatCalculator.tsx`

## Safety Gate System

### Completed

- [x] **Minifix Connector Validation** - Manufacturing-safe drill validation
  - `src/gate/rules/connectors/validateMinifixConnector.ts`
  - `src/gate/rules/connectors/drillMapIndex.ts`
  - `src/gate/rules/connectors/minifixConstraintTypes.ts`
- [x] **Test Suite** - 78 tests across 5 test files
  - Unit tests, Snapshot tests, Property-based tests, Multi-pair tests
- [x] **CI Pipeline** - GitHub Actions workflow
  - `.github/workflows/gate-tests.yml`
- [x] **Documentation**
  - `docs/SAFETY_GATE.md` - Gate system architecture
  - `CONTRIBUTING.md` - Team development contract

## Export System

### Completed

- [x] Cut list CSV export
- [x] Manifest JSON export
- [x] Trust chain export viewer

### Pending

- [ ] Label generation

---

## CNC Pipeline (v2.1.0 Factory-Ready)

### Completed ✅

**Phase D1: DrillMap → Operation Graph**
- [x] Operation Types (`src/cnc/operation/operationTypes.ts`)
  - DRILL, PECK_DRILL, BORING, COUNTERBORE, COUNTERSINK, TAP, HELICAL_MILL
- [x] DrillMap → Operations Mapping (`src/cnc/mapping/`)
  - `mapDrillMapToOps()`, `mapMinifixToOps()`, `buildOperationGraph()`
- [x] Operation Graph Validation (12 safety validators)
- [x] Machine Profiles: KDT, BIESSE

**Phase D2: Operation Graph → G-code**
- [x] Post Processors (`src/cnc/post/`)
  - FANUC dialect (ISO G-code)
  - BIESSE_ISO dialect
- [x] G-code Builder with deterministic output
- [x] Complete Pipeline: Packet → DrillMap → Ops → G-code

**Phase D3.1: CNC Bundle ZIP**
- [x] Deterministic ZIP creation (fixed timestamps)
- [x] `cnc-manifest.json` schema (`monolith.cnc.manifest@1.0`)
- [x] Trust chain linkage: packetContentHash → opGraphHash → gcodeSha256
- [x] Factory-verifiable bundles

**Phase D3.2: CNC Cache (IndexedDB)**
- [x] Deterministic cache keys (`src/cnc/cache/cncCacheKey.ts`)
- [x] IndexedDB persistence (`src/cnc/cache/indexedDbCncStore.ts`)
- [x] LRU eviction, job-level invalidation

**Phase D3.3: Re-verify on Load**
- [x] Strict verification policy (`src/factory/verify/`)
- [x] Tamper detection: G-code hash, OpGraph hash
- [x] Linkage verification: packetContentHash matching
- [x] Post version mismatch → STALE status
- [x] Auto-invalidation of corrupted entries

**Test Coverage:** 867 tests passing

**Phase D6: Tool Wear & Cost Intelligence**
- [x] D6-A: Wear Model (`src/factory/tooling/wearModel.ts`)
  - Material hardness weights: MDF=1.0, HPL=2.0, MELAMINE=1.3, etc.
  - `calculateWearUnits()` function with weighted depth
- [x] D6-B: Observer (`src/factory/tooling/observer.ts`)
  - `extractToolUsageEventsFromOpGraph()` - OpGraph → ToolUsageEvent[]
  - Deterministic event extraction, machineId/dialect binding
- [x] D6-C: Storage (`src/factory/tooling/storage/`)
  - IndexedDB persistence: `monolith-factory-tooling (v1)`
  - Stores: `toolUsageRecords`, `toolWearThresholds`
  - `appendToolUsageEvents()`, `getToolUsageRecord()`, `setToolWearThreshold()`
- [x] D6-D: Wiring (`src/factory/tooling/wireToolUsage.ts`)
  - `wireToolUsageAfterCncBuild()` - Integration point after G-code generation
  - Non-blocking, swallows errors by default (factory-safe)
- [x] D6-E.1: Query Helpers (`src/factory/tooling/query/`)
  - `getToolHealth()`, `listToolHealth()`, `listNearingLimitTools()`
  - `summarizeWearByMaterial()` - Material breakdown for UI
  - Health status: OK, NEARING_LIMIT (≥85%), OVER_LIMIT (≥100%)
- [x] D6-E.2: UI Surface (`src/factory/components/tooling/`)
  - `ToolHealthStrip.tsx` - CNC tab header strip
  - `ToolHealthBadge.tsx` - Warning badge next to Generate button
  - `ToolHealthModal.tsx` - Detail modal with material breakdown

**Test Coverage:** 50 tests (D6-A: 4, D6-B: 9, D6-C: 8, D6-D: 8, D6-E: 21)

### Pending

- [ ] **D6.1: Threshold & Maintenance UX**
  - Set threshold per tool from UI
  - Reset wear / Mark replaced button
  - Audit note (local only)
- [ ] **D4: Workpiece & Coordinate Mapping**
  - Panel origin, face selection (TOP/BOTTOM)
  - Flip/mirror/rotation transforms
  - Datum policy
- [ ] **D5: Drilling Cycles & Feeds**
  - G83 peck parameters
  - Material-aware feed/speed tables
  - Coolant/spindle control

---

*Last updated: 2026-01-22 (v2.2.0 Tool Health Release)*
