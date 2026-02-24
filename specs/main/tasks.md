# MONOLITH Designer Workspace v2.0 - Task List

## Task Organization

Tasks are organized by **phase** and marked with `[P]` if they can be executed in **parallel** with other tasks in the same phase.

**Status Legend:**
- `[ ]` Not started
- `[x]` Completed
- `[~]` In progress
- `[!]` Blocked

---

## Phase 1: Documentation & Consistency (Current Phase)

### T001: Create Comprehensive Spec Documentation `[x]`
**Description:** Document existing system specifications based on codebase analysis
**Files:** `specs/main/spec.md`
**Priority:** High
**Estimated Effort:** 4 hours
**Status:** Completed

### T002: Create Implementation Plan `[x]`
**Description:** Document current architecture, tech stack, and design decisions
**Files:** `specs/main/plan.md`
**Priority:** High
**Estimated Effort:** 3 hours
**Status:** Completed

### T003: Create Task List `[x]`
**Description:** Generate actionable task list for improvements and future work
**Files:** `specs/main/tasks.md`
**Priority:** High
**Estimated Effort:** 2 hours
**Status:** Completed

### T004: Run Spec-Kit Analysis `[ ]`
**Description:** Run `/speckit.analyze` to identify inconsistencies, duplications, and gaps across spec.md, plan.md, and tasks.md
**Command:** `/speckit.analyze`
**Prerequisites:** T001, T002, T003
**Priority:** High
**Estimated Effort:** 1 hour
**Status:** Not started

---

## Phase 2: Critical Bug Fixes & Stability

### T005: Fix Total Area Calculation Display `[x]` [P]
**Description:** Fix the "Total Area calculation display" issue mentioned in recent commits
**Files:**
- `src/core/store/useCabinetStore.ts` (computed values)
- `src/components/ui/ExportPanel.tsx` (display)
**Related Commits:** 7dfa914, 9ebbe41, aeb624e, afebe54, 12e4635
**Fix Applied:**
- Changed `surfaceArea: area` to `surfaceArea: area * 2` (both faces) at lines 1311 and 1496
- Total Area now correctly displays full surface material usage
**Priority:** High
**Estimated Effort:** 2 hours
**Status:** Completed
**Completed:** 2026-01-09

### T006: Verify Material Selector Integration `[x]` [P]
**Description:** Test the recently integrated MaterialSelector component for bugs
**Files:**
- `src/components/ui/MaterialSelector.tsx`
- `src/components/ui/__tests__/MaterialSelector.test.tsx` (586 lines, 22 tests)
**Test Cases:**
- ✅ Material selection in all categories (Core/Surface/Edge)
- ✅ Apply to selected panel vs all panels
- ✅ Expandable/collapsible animation
- ✅ Texture preview loading
- ✅ Filter functionality, color themes, empty states
**Priority:** High
**Estimated Effort:** 2 hours
**Status:** Completed
**Completed:** 2026-02-24

### T007: Test Panel Configuration Modal `[x]` [P]
**Description:** Comprehensive testing of PanelConfigModal functionality
**Files:**
- `src/components/ui/PanelConfigModal.tsx`
- `src/components/ui/__tests__/PanelConfigModal.test.tsx` (484 lines, 33 tests)
**Test Cases:**
- ✅ Per-panel material override (core, face A/B)
- ✅ Edge banding per side
- ✅ Face A/B synchronization
- ✅ Real-time thickness calculation (manufacturing data)
- ✅ Save/Cancel actions (modal close/done)
- ✅ Position controls for shelves/dividers
**Priority:** High
**Estimated Effort:** 2 hours
**Status:** Completed
**Completed:** 2026-02-24

---

## Phase 3: Core Feature Completion

### T008: Complete DXF Export Integration `[x]`
**Description:** Finish DXF export functionality (structure exists, integration pending)
**Files:**
- `src/core/export/DXFGenerator.ts` (DXF R12 format generator)
- `src/core/export/dxfExportFromOperationGraph.ts` (packet→graph→DXF pipeline)
- `src/core/export/operationGraphToDxf.ts` (OperationGraph→DXF converter)
- `src/core/export/cabinetToDxf.ts` (cabinet→PanelProductionData with drilling patterns)
- `src/core/export/exportPipeline.ts` (pipeline orchestrator)
- `src/core/export/monolith/` (factory package export with nesting)
- `src/components/ui/ExportPanel.tsx` (1,325-line UI with full integration)
- `src/core/export/__tests__/` (DXF export tests, OperationGraph tests, tool parser tests)
**Subtasks:**
1. ✅ Integrate DXFGenerator with ExportPanel UI (DXF section, progress, download)
2. ✅ Implement machine profile selection (dropdown with manufacturer/dialect)
3. ✅ Add per-panel export progress tracking (Map<panelId, state>, progress bar)
4. ✅ Generate DXF download files (ZIP with manifest, G10 safety gate)
5. ✅ Test with sample cabinet designs (fixtures, unit tests)
**Architecture:** Cabinet → FactoryPacket → OperationGraph → DXF → G10 Safety Gate → ZIP
**Prerequisites:** None
**Priority:** High
**Estimated Effort:** 8 hours
**Status:** Completed
**Completed:** 2026-02-24

### T009: Implement Hardware Drilling Patterns UI `[x]`
**Description:** Create UI for hardware drilling pattern configuration
**Files:**
- `src/components/ui/HardwarePanel.tsx` (311 lines, "Drilling" tab)
- `src/components/ui/DrillingPatternView.tsx` (306 lines)
- `src/core/fitting/FittingCatalogue.ts` (547 lines)
**Subtasks:**
1. ✅ Design drilling pattern selector UI (DrillingPatternView)
2. ✅ Integrate with FittingCatalogue
3. ✅ Display drilling positions in 3D viewport (DrillMapOverlay)
4. ✅ Include patterns in DXF export (cabinetToDxf.ts)
**Prerequisites:** T008 (DXF export)
**Priority:** Medium
**Estimated Effort:** 6 hours
**Status:** Completed
**Completed:** 2026-02-24

### T010: Implement Advanced Tolerance Checking `[x]`
**Description:** Enhance ToleranceEngine with comprehensive checks
**Files:**
- `src/core/engines/ToleranceEngine.ts` (924 lines)
- `src/core/engines/__tests__/ToleranceEngine.test.ts` (724 lines, 8 describe blocks)
**Subtasks:**
1. ✅ Machine tolerance validation (±0.1mm cuts, ±0.5mm drilling)
2. ✅ Clearance validation (2mm minimum gaps)
3. ✅ Edge banding placement tolerance (±0.3mm)
4. ✅ Add tolerance rules to validation system (runAdvancedToleranceChecks)
**Prerequisites:** None
**Priority:** Medium
**Estimated Effort:** 5 hours
**Status:** Completed
**Completed:** 2026-02-24

---

## Phase 4: User Experience Enhancements

### T011: Add Search/Filter to Material Selector `[x]` [P]
**Description:** Implement search and filter functionality in MaterialSelector
**Files:** `src/components/ui/MaterialSelector.tsx`
**Subtasks:**
1. ✅ Add search input field (with Search icon, clear button)
2. ✅ Implement text-based filtering (name, type, manufacturer)
3. ✅ Add category filters (type-based filter tabs)
4. ✅ Highlight search matches
5. ✅ Filter preferences in UI state
**Prerequisites:** T006 (MaterialSelector testing)
**Priority:** Medium
**Estimated Effort:** 4 hours
**Status:** Completed
**Completed:** 2026-02-24

### T012: Implement Recent Materials History `[x]` [P]
**Description:** Track and display recently used materials for quick access
**Files:**
- `src/core/materials/useMaterialHistoryStore.ts` (85 lines, MAX_HISTORY_SIZE=15)
- `src/core/materials/__tests__/useMaterialHistoryStore.test.ts` (135 lines)
**Subtasks:**
1. ✅ Add recentMaterials state (useMaterialHistoryStore)
2. ✅ Track material usage (limit to 15 recent)
3. ✅ Display "Recent" tab in MaterialSelector
4. ✅ Persist recent history to localStorage
**Prerequisites:** T006
**Priority:** Low
**Estimated Effort:** 3 hours
**Status:** Completed
**Completed:** 2026-02-24

### T013: Implement Favorite Materials Bookmarking `[x]` [P]
**Description:** Allow users to bookmark favorite materials
**Files:**
- `src/core/materials/useMaterialFavoritesStore.ts` (87 lines)
- `src/core/materials/__tests__/useMaterialFavoritesStore.test.ts` (147 lines)
**Subtasks:**
1. ✅ Add favoriteMaterials state (useMaterialFavoritesStore)
2. ✅ Add star/bookmark icon to material cards
3. ✅ Display "Favorites" tab in MaterialSelector
4. ✅ Persist favorites to localStorage
5. ✅ isFavorite, addFavorite, removeFavorite methods
**Prerequisites:** T006
**Priority:** Low
**Estimated Effort:** 3 hours
**Status:** Completed
**Completed:** 2026-02-24

### T014: Implement All Keyboard Shortcuts `[x]` [P]
**Description:** Implement and test all keyboard shortcuts specified in FR11.5
**Files:**
- `src/core/ui/useGlobalHotkeys.ts` (486 lines, comprehensive shortcut system)
**Subtasks:**
1. ✅ Ctrl+D — Duplicate selected
2. ✅ E key — Boolean Intersect / Edit mode
3. ✅ Escape — Close overlays, deselect
4. ✅ G key — Toggle Safety Gate
5. ✅ Ctrl+S / Cmd+S — Save project
6. ✅ Additional: F (search), Tab (cycle), R/Q/W (gizmo), H (hardware), ? (help), / (command), number keys, Delete
**Prerequisites:** None
**Priority:** Medium
**Estimated Effort:** 6 hours
**Status:** Completed
**Completed:** 2026-02-24

### T015: Enhance Panel Selection UX `[x]` [P]
**Description:** Improve panel selection in overlapping scenarios (e.g., Factory view)
**Files:**
- `src/components/canvas/Cabinet3D.tsx` (hover highlighting, tooltips)
- `src/core/ui/useGlobalHotkeys.ts` (Tab cycling)
**Subtasks:**
1. ✅ Add hover highlight with emissive color changes (RAF-gated)
2. ✅ Show panel name tooltip on hover/selection
3. ✅ Implement Tab key cycling through overlapping panels
4. ✅ Distinct highlight color for selected vs hovered panel
5. ✅ Sync selection between 3D viewport and panel list
**Prerequisites:** None
**Priority:** Medium
**Estimated Effort:** 5 hours
**Status:** Completed
**Completed:** 2026-02-24

### T015a: Document SortableList Component `[x]` [P]
**Description:** Create comprehensive documentation for SortableList component
**Files:**
- `src/components/ui/SortableList.tsx` (inline JSDoc)
- `specs/main/plan.md` (component documentation)
- `specs/main/spec.md` (accessibility requirements)
**Deliverables:**
- ✅ Keyboard shortcuts documentation (inline comments)
- ✅ Accessibility features documentation
- ✅ Performance optimization notes
- ✅ Usage examples for both variants (SortableList & PanelSortableList)
- ✅ Integration points documented in plan.md
**Prerequisites:** None
**Priority:** High
**Estimated Effort:** 1 hour
**Status:** Completed
**Completed:** 2026-01-09

---

## Phase 5: Performance Optimization

### T016: Optimize Texture Loading `[x]` [P]
**Description:** Improve texture loading performance and caching
**Files:**
- `src/core/materials/textureCache.ts` (LRU blob cache, 50 entries)
- `src/core/materials/useObjectUrlTexture.ts` (THREE.Texture cache with ref counting)
- `src/core/materials/textureThumb.ts` (256px thumbnail generation)
- `src/core/store/useMaterialStore.ts` (two-tier loading)
**Subtasks:**
1. ✅ Implement texture cache with size limit (50 textures max)
2. ✅ Add lazy loading for textures
3. ✅ Implement texture preloading for visible materials
4. ✅ Use lower-resolution previews for thumbnails (256px)
5. ✅ Add loading indicators
**Prerequisites:** None
**Priority:** Medium
**Estimated Effort:** 5 hours
**Status:** Completed
**Completed:** 2026-02-24

### T017: Optimize State Update Performance `[x]` [P]
**Description:** Profile and optimize state update performance
**Files:** `src/core/store/useCabinetStore.ts`
**Subtasks:**
1. ✅ Single-pass calculateTotals (reduced from 3 iterations to 1)
2. ✅ Implement memoization for computed values (shallowEqual selectors)
3. ✅ Debounce validation runs (300ms)
4. ✅ Optimize panel recalculation (batch updates)
5. ✅ Add performance monitoring to diagnostics
**Prerequisites:** None
**Priority:** Medium
**Estimated Effort:** 6 hours
**Status:** Completed
**Completed:** 2026-02-24

### T018: Implement Code Splitting `[x]` [P]
**Description:** Split bundle by routes/features for faster initial load
**Files:** `vite.config.ts`, `src/App.tsx`, `src/routes/index.tsx`
**Subtasks:**
1. ✅ Lazy load SafetyGatePage (already in routes/index.tsx)
2. ✅ Lazy load modals (PanelConfigModal, etc. already in App.tsx)
3. ✅ Lazy load heavy components (CADDrillMapView, CommandPalette, etc.)
4. ✅ Configure Vite code splitting (function-based manualChunks with Windows path normalization)
5. ✅ Measure bundle size reduction (App: 1889KB → 740KB, 61% reduction)
**Key Fix:** Removed stale `vite.config.js` that was overriding `vite.config.ts`
**Prerequisites:** None
**Priority:** Low
**Estimated Effort:** 4 hours
**Status:** Completed
**Completed:** 2026-02-24

---

## Phase 6: Testing & Quality Assurance

### T019: Write Unit Tests for Manufacturing Calculations `[x]` [P]
**Description:** Comprehensive unit tests for ManufacturingCalculator
**Files:**
- `src/core/engines/__tests__/ManufacturingCalculator.test.ts` (1,376 lines, 127+ test cases)
- `src/core/engines/ManufacturingCalculator.ts`
**Test Coverage:**
- ✅ `calculateRealThickness` (all scenarios)
- ✅ `calculateCutSize` (including edge cases)
- ✅ `calculatePanelCost`
- ✅ `calculatePanelCO2`
**Prerequisites:** None
**Priority:** High
**Estimated Effort:** 6 hours
**Status:** Completed
**Completed:** 2026-02-24

### T020: Write Unit Tests for Validation Rules `[x]` [P]
**Description:** Test all validation rules comprehensively
**Files:**
- `src/core/store/__tests__/useSpecStore.test.ts` (1,384 lines, 106+ test cases)
- `src/core/store/useSpecStore.ts`
**Test Coverage:**
- ✅ All dimensional rules (DIM-001 to DIM-006)
- ✅ All structural rules (STR-001 to STR-004)
- ✅ All material rules (MAT-001, MAT-002)
- ✅ All machine rules (MAC-001)
- ✅ All safety rules (SAF-001)
- ✅ Gate status calculation
**Prerequisites:** None
**Priority:** High
**Estimated Effort:** 8 hours
**Status:** Completed
**Completed:** 2026-02-24

### T021: Write Integration Tests for Panel Management `[x]` [P]
**Description:** Test panel generation and material assignment flows
**Files:**
- `src/core/store/__tests__/useCabinetStore.test.ts` (1,660 lines, 28 describe blocks)
- `src/core/store/__tests__/useCabinetStore.panel.test.ts` (395 lines, panel management integration)
**Test Coverage:**
- ✅ Panel generation from cabinet config
- ✅ Material assignment propagation
- ✅ Dimension updates cascading to panels
- ✅ Cost/CO2 recalculation
- ✅ Multi-cabinet management, scene positioning, hardware config
**Prerequisites:** T019, T020
**Priority:** Medium
**Estimated Effort:** 6 hours
**Status:** Completed
**Completed:** 2026-02-24

### T022: Write Integration Tests for Project Save/Load `[x]` [P]
**Description:** Test project persistence roundtrip
**Files:** `src/core/store/__tests__/useProjectStore.test.ts` (109 tests)
**Test Coverage:**
- ✅ Save project to localStorage
- ✅ Load project from localStorage
- ✅ Export project as JSON
- ✅ Import project from JSON
- ✅ Auto-save functionality
- ✅ Data integrity validation
**Prerequisites:** None
**Priority:** Medium
**Estimated Effort:** 4 hours
**Status:** Completed
**Completed:** 2026-02-24

### T023: Test Auto-Save and Data Recovery Scenarios `[x]` [P]
**Description:** Comprehensive testing of data persistence reliability (NFR3)
**Files:**
- `src/core/store/__tests__/useProjectStore.test.ts` (42 tests for auto-save/recovery)
- `src/core/store/useProjectStore.ts`
**Test Coverage:**
- ✅ Auto-save failure handling (EC4: localStorage quota exceeded)
- ✅ Recovery from corrupted project data (EC8)
- ✅ Auto-save debouncing under rapid changes
- ✅ Data integrity after import/export roundtrip
- ✅ Browser crash recovery (data in localStorage)
- ✅ Manual save during auto-save in progress
**Prerequisites:** None
**Priority:** High
**Estimated Effort:** 4 hours
**Status:** Completed
**Completed:** 2026-02-24

---

## Phase 7: Documentation & Developer Experience

### T024: Add JSDoc Comments to Core Functions `[ ]` [P]
**Description:** Comprehensive JSDoc for all core manufacturing functions
**Files:**
- `src/core/engines/ManufacturingCalculator.ts`
- `src/core/engines/StructuralCheck.ts`
- `src/core/engines/ToleranceEngine.ts`
**Format:**
```typescript
/**
 * Brief description
 *
 * @param param1 - Description
 * @param param2 - Description
 * @returns Description
 * @throws Error condition
 * @example
 * // Usage example
 */
```
**Prerequisites:** None
**Priority:** Medium
**Estimated Effort:** 4 hours
**Status:** Not started

### T025: Create User Manual `[ ]`
**Description:** Write comprehensive user manual for designers and operators
**Files:** `docs/user-manual.md` (new)
**Sections:**
1. Getting Started
2. Cabinet Configuration
3. Material Selection
4. Panel Management
5. Validation & Safety Gates
6. Export to CNC
7. Keyboard Shortcuts
8. Troubleshooting
**Prerequisites:** None
**Priority:** Low
**Estimated Effort:** 8 hours
**Status:** Not started

### T026: Create Developer Guide `[ ]`
**Description:** Write developer onboarding guide
**Files:** `docs/developer-guide.md` (new)
**Sections:**
1. Architecture Overview
2. Setup Instructions
3. Code Organization
4. State Management Patterns
5. Adding New Materials
6. Adding New Validation Rules
7. Testing Guidelines
8. Deployment Process
**Prerequisites:** None
**Priority:** Low
**Estimated Effort:** 6 hours
**Status:** Not started

---

## Phase 8: Future Enhancements (v2.1 Prep)

### T027: Design Cut Optimization Algorithm `[ ]`
**Description:** Research and design sheet nesting algorithm for minimal waste
**Files:** `docs/cut-optimization-design.md` (new)
**Deliverables:**
1. Algorithm research document
2. Proof-of-concept implementation
3. Performance benchmarks
4. Integration plan
**Prerequisites:** None
**Priority:** Low
**Estimated Effort:** 16 hours
**Status:** Not started

### T028: Design Multi-Machine Export System `[ ]`
**Description:** Design abstraction layer for multiple CNC machine profiles
**Files:** `docs/multi-machine-design.md` (new)
**Deliverables:**
1. Machine profile schema
2. DXF dialect variations documentation
3. Machine-specific operation codes
4. Integration plan
**Prerequisites:** T008 (DXF export completion)
**Priority:** Low
**Estimated Effort:** 12 hours
**Status:** Not started

### T029: Design Cloud Sync Architecture `[ ]`
**Description:** Design cloud-based project synchronization for v3.0
**Files:** `docs/cloud-sync-design.md` (new)
**Deliverables:**
1. Backend API specification
2. Authentication design
3. Sync conflict resolution strategy
4. Data migration plan
**Prerequisites:** None
**Priority:** Low
**Estimated Effort:** 20 hours
**Status:** Not started

---

## Phase 9: Configuration & Extensibility

### T030: Externalize Manufacturing Constants `[ ]` [P]
**Description:** Move manufacturing constants to JSON config file
**Files:**
- `src/core/config/manufacturing-constants.json` (new)
- `src/core/engines/ManufacturingCalculator.ts` (refactor)
**Subtasks:**
1. Create JSON schema for constants
2. Create default config file
3. Implement config loader
4. Refactor code to use config
5. Add UI for config editing (future)
**Prerequisites:** None
**Priority:** Medium
**Estimated Effort:** 4 hours
**Status:** Not started

### T031: Create Material Catalog Editor `[ ]`
**Description:** Build UI for editing material catalogs without code changes
**Files:**
- `src/components/admin/MaterialCatalogEditor.tsx` (new)
- `src/core/materials/MaterialRegistry.ts`
**Subtasks:**
1. Design admin UI layout
2. Implement CRUD operations for materials
3. Add texture upload functionality
4. Validate material data
5. Export/import catalog as JSON
**Prerequisites:** None
**Priority:** Low
**Estimated Effort:** 12 hours
**Status:** Not started

### T032: Create Validation Rule Configuration UI `[ ]`
**Description:** Build UI for configuring validation thresholds
**Files:**
- `src/components/admin/ValidationRuleEditor.tsx` (new)
- `src/core/store/useSpecStore.ts`
**Subtasks:**
1. Design rule configuration UI
2. Implement threshold editors
3. Enable/disable rules
4. Create custom rules (advanced)
5. Export/import rule config as JSON
**Prerequisites:** None
**Priority:** Low
**Estimated Effort:** 10 hours
**Status:** Not started

---

## Phase 10: Advanced Features (Future)

### T033: Implement Drawer Box Assembly `[ ]`
**Description:** Add drawer box configuration and assembly instructions
**Files:**
- `src/core/types/Cabinet.ts` (extend DrawerPanel type)
- `src/components/ui/DrawerConfigModal.tsx` (new)
**Subtasks:**
1. Design drawer box data model
2. Add drawer front, sides, back, bottom panels
3. Configure drawer slide mounting
4. Generate assembly instructions
5. Include in DXF export
**Prerequisites:** T008
**Priority:** Low
**Estimated Effort:** 20 hours
**Status:** Not started

### T034: Implement Multi-Cabinet Kitchen Layout `[ ]`
**Description:** Support multiple cabinets in a kitchen layout
**Files:**
- `src/core/types/Kitchen.ts` (new)
- `src/core/store/useKitchenStore.ts` (new)
**Subtasks:**
1. Design kitchen layout data model
2. Implement cabinet positioning in 2D layout
3. Add cabinet-to-cabinet constraints (alignment, spacing)
4. Generate combined BOM and cost
5. Export entire kitchen
**Prerequisites:** None
**Priority:** Low
**Estimated Effort:** 40 hours
**Status:** Not started

### T035: Implement AR Visualization `[ ]`
**Description:** Add augmented reality preview for mobile devices
**Files:**
- `src/components/ar/ARViewer.tsx` (new)
**Subtasks:**
1. Research WebXR API or 8th Wall
2. Implement AR scene setup
3. Export cabinet model for AR
4. Add AR preview button
5. Test on iOS and Android
**Prerequisites:** None
**Priority:** Low
**Estimated Effort:** 30 hours
**Status:** Not started

---

## Task Summary

### By Phase
- **Phase 1 (Documentation):** 4 tasks (3 completed, 1 pending)
- **Phase 2 (Bug Fixes):** 3 tasks (3 completed: T005, T006, T007)
- **Phase 3 (Core Features):** 3 tasks (3 completed: T008, T009, T010)
- **Phase 4 (UX Enhancements):** 6 tasks (6 completed: T011-T015, T015a)
- **Phase 5 (Performance):** 3 tasks (3 completed: T016, T017, T018)
- **Phase 6 (Testing):** 5 tasks (5 completed: T019-T023)
- **Phase 7 (Documentation):** 3 tasks
- **Phase 8 (Future Prep):** 3 tasks
- **Phase 9 (Configuration):** 3 tasks
- **Phase 10 (Advanced):** 3 tasks

**Total:** 36 tasks

### By Priority
- **High:** 11 tasks
- **Medium:** 12 tasks
- **Low:** 13 tasks

### By Status
- **Completed:** 25 tasks (T001-T003, T005-T023, T015a)
- **In Progress:** 0 tasks
- **Not Started:** 11 tasks (T004, T024-T035)
- **Blocked:** 0 tasks

### Recent Completions (2026-02-24)
- ✅ **T006:** Verify MaterialSelector Integration — 22 tests
- ✅ **T007:** Test PanelConfigModal — 33 tests
- ✅ **T008:** Complete DXF Export Integration — Full pipeline with G10 safety gates
- ✅ **T009:** Hardware Drilling Patterns UI — DrillingPatternView + FittingCatalogue integration
- ✅ **T010:** Advanced Tolerance Checking — 924-line engine with 724-line test suite
- ✅ **T011:** Search/Filter in MaterialSelector — Full search with type-based filters
- ✅ **T012:** Recent Materials History — useMaterialHistoryStore (15 items) with tests
- ✅ **T013:** Favorite Materials Bookmarking — useMaterialFavoritesStore with tests
- ✅ **T014:** Keyboard Shortcuts — 486-line useGlobalHotkeys (20+ shortcuts)
- ✅ **T015:** Panel Selection UX — Hover highlight, tooltips, Tab cycling
- ✅ **T016:** Optimize Texture Loading — LRU blob cache, ref-counted THREE.Texture, 256px thumbnails
- ✅ **T017:** Optimize State Update Performance — Single-pass totals, shallowEqual selectors, debounced validation
- ✅ **T018:** Implement Code Splitting — App bundle 1889KB → 740KB (61% reduction), fixed vite.config.js override
- ✅ **T019:** Manufacturing Calculation Tests — 127+ test cases covering all public functions
- ✅ **T020:** Validation Rule Tests — 106+ test cases covering all rule categories
- ✅ **T021:** Panel Management Integration Tests — 2,055 lines across 2 test files
- ✅ **T022:** Project Save/Load Tests — 67 tests for persistence roundtrip
- ✅ **T023:** Auto-Save/Recovery Tests — 42 tests for reliability scenarios

### Earlier Completions (2026-01-09)
- ✅ **T005:** Fix Total Area Calculation Display
- ✅ **T015a:** Document SortableList Component

---

## Dependencies Graph

```
Phase 1 (Documentation)
├── T004 (Analysis) ← depends on T001, T002, T003
│
Phase 2 (Bug Fixes) [All can run in parallel]
├── T005 (Area Calc Fix)
├── T006 (MaterialSelector Test)
└── T007 (PanelConfigModal Test)
│
Phase 3 (Core Features)
├── T008 (DXF Export)
├── T009 (Drilling Patterns) ← depends on T008
└── T010 (Tolerance Checking)
│
Phase 4 (UX Enhancements) [Most can run in parallel]
├── T011 (Material Search) ← depends on T006
├── T012 (Recent Materials) ← depends on T006
├── T013 (Favorite Materials) ← depends on T006
├── T014 (Dimension Labels)
└── T015 (Selection UX)
│
Phase 5 (Performance) [All can run in parallel]
├── T016 (Texture Loading)
├── T017 (State Performance)
└── T018 (Code Splitting)
│
Phase 6 (Testing) [Can run in parallel, except T021]
├── T019 (Manufacturing Tests)
├── T020 (Validation Tests)
├── T021 (Integration Tests) ← depends on T019, T020
└── T022 (Save/Load Tests)
│
Phase 7 (Documentation) [All can run in parallel]
├── T023 (JSDoc Comments)
├── T024 (User Manual)
└── T025 (Developer Guide)
│
Phase 8 (Future Prep) [All independent]
├── T026 (Cut Optimization Design)
├── T027 (Multi-Machine Design) ← depends on T008
└── T028 (Cloud Sync Design)
│
Phase 9 (Configuration) [All can run in parallel]
├── T029 (Constants Config)
├── T030 (Material Editor)
└── T031 (Validation Config)
│
Phase 10 (Advanced) [All independent]
├── T032 (Drawer Boxes) ← depends on T008
├── T033 (Kitchen Layout)
└── T034 (AR Visualization)
```

---

## Next Immediate Actions

### Critical Path (Remaining)
1. **T004:** Run `/speckit.analyze` for consistency validation (Phase 1, High)
2. **T024:** Add comprehensive JSDoc to core functions (Phase 7, Medium — partial)
3. **T025:** Create User Manual (Phase 7, Low)
4. **T026:** Create Developer Guide (Phase 7, Low)

### Quick Wins
1. **T024:** Complete JSDoc on ManufacturingCalculator, StructuralCheck, ToleranceEngine
2. **T030:** Externalize manufacturing constants to JSON

### v2.0 Release Status
- ✅ All Phase 2 bug fixes complete (T005-T007)
- ✅ All Phase 3 core features complete (T008-T010)
- ✅ All Phase 4 UX enhancements complete (T011-T015)
- ✅ All Phase 5 performance optimizations complete (T016-T018)
- ✅ All Phase 6 testing complete (T019-T023)
- Remaining: Documentation (T024-T026), Configuration (T030-T032), Future (T027-T029, T033-T035)

---

**Document Version:** 1.0
**Created:** 2026-01-09
**Last Updated:** 2026-02-24
**Author:** Claude (via Spec Kit Analysis)
**Status:** DRAFT
