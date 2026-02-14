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

### T006: Verify Material Selector Integration `[ ]` [P]
**Description:** Test the recently integrated MaterialSelector component for bugs
**Files:** `src/components/ui/MaterialSelector.tsx`
**Test Cases:**
- Material selection in all categories (Core/Surface/Edge)
- Apply to selected panel vs all panels
- Expandable/collapsible animation
- Texture preview loading
**Priority:** High
**Estimated Effort:** 2 hours
**Status:** Not started

### T007: Test Panel Configuration Modal `[ ]` [P]
**Description:** Comprehensive testing of PanelConfigModal functionality
**Files:** `src/components/ui/PanelConfigModal.tsx`
**Test Cases:**
- Per-panel material override
- Edge banding per side
- Face A/B synchronization
- Real-time thickness calculation
- Save/Cancel actions
**Priority:** High
**Estimated Effort:** 2 hours
**Status:** Not started

---

## Phase 3: Core Feature Completion

### T008: Complete DXF Export Integration `[ ]`
**Description:** Finish DXF export functionality (structure exists, integration pending)
**Files:**
- `src/core/export/DXFGenerator.ts` (existing)
- `src/components/ui/ExportPanel.tsx` (UI)
**Subtasks:**
1. Integrate DXFGenerator with ExportPanel UI
2. Implement machine profile selection
3. Add per-panel export progress tracking
4. Generate DXF download files
5. Test with sample cabinet designs
**Prerequisites:** None
**Priority:** High
**Estimated Effort:** 8 hours
**Status:** Not started

### T009: Implement Hardware Drilling Patterns UI `[ ]`
**Description:** Create UI for hardware drilling pattern configuration
**Files:**
- `src/components/ui/HardwarePanel.tsx` (existing)
- `src/core/fitting/FittingCatalogue.ts` (data source)
**Subtasks:**
1. Design drilling pattern selector UI
2. Integrate with FittingCatalogue
3. Display drilling positions in 3D viewport (optional overlay)
4. Include patterns in DXF export
**Prerequisites:** T008 (DXF export)
**Priority:** Medium
**Estimated Effort:** 6 hours
**Status:** Not started

### T010: Implement Advanced Tolerance Checking `[ ]`
**Description:** Enhance ToleranceEngine with comprehensive checks
**Files:** `src/core/engines/ToleranceEngine.ts`
**Subtasks:**
1. Machine tolerance validation (±0.1mm cuts, ±0.5mm drilling)
2. Clearance validation (2mm minimum gaps)
3. Edge banding placement tolerance
4. Add tolerance rules to validation system
**Prerequisites:** None
**Priority:** Medium
**Estimated Effort:** 5 hours
**Status:** Not started

---

## Phase 4: User Experience Enhancements

### T011: Add Search/Filter to Material Selector `[ ]` [P]
**Description:** Implement search and filter functionality in MaterialSelector
**Files:** `src/components/ui/MaterialSelector.tsx`
**Subtasks:**
1. Add search input field
2. Implement text-based filtering (name, code)
3. Add category filters (wood types, colors, finishes)
4. Highlight search matches
5. Persist filter preferences to localStorage
**Prerequisites:** T006 (MaterialSelector testing)
**Priority:** Medium
**Estimated Effort:** 4 hours
**Status:** Not started

### T012: Implement Recent Materials History `[ ]` [P]
**Description:** Track and display recently used materials for quick access
**Files:**
- `src/components/ui/MaterialSelector.tsx`
- `src/core/store/useMaterialStore.ts`
**Subtasks:**
1. Add recentMaterials state to useMaterialStore
2. Track material usage (limit to 10 recent)
3. Display "Recent" tab in MaterialSelector
4. Persist recent history to localStorage
**Prerequisites:** T006
**Priority:** Low
**Estimated Effort:** 3 hours
**Status:** Not started

### T013: Implement Favorite Materials Bookmarking `[ ]` [P]
**Description:** Allow users to bookmark favorite materials
**Files:**
- `src/components/ui/MaterialSelector.tsx`
- `src/core/store/useMaterialStore.ts`
- `src/components/ui/SortableList.tsx` (for favorites list)
**Subtasks:**
1. Add favoriteMaterials state to useMaterialStore
2. Add star/bookmark icon to material cards
3. Display "Favorites" tab in MaterialSelector with SortableList
4. Persist favorites to localStorage
5. Enable drag-to-reorder in favorites list
**Prerequisites:** T006
**Priority:** Low
**Estimated Effort:** 3 hours
**Status:** Not started
**Notes:** Uses SortableList component for drag-to-reorder favorites

### T014: Implement All Keyboard Shortcuts `[ ]` [P]
**Description:** Implement and test all keyboard shortcuts specified in FR11.5
**Files:**
- `src/components/tools/MeasureLayer.tsx` (D key)
- `src/components/canvas/Cabinet3D.tsx` (E, Esc keys)
- `src/components/pages/SafetyGatePage.tsx` (G key)
- `src/core/store/useProjectStore.ts` (Ctrl+S key)
**Subtasks:**
1. **D Key - Dimension Labels Toggle**
   - Add dimension label rendering in MeasureLayer
   - Toggle visibility state
   - Position labels appropriately in 3D space
2. **E Key - Edit Selected Panel**
   - Open PanelConfigModal when panel selected + E pressed
   - Show "No panel selected" message if none selected
3. **Esc Key - Deselect/Close**
   - Deselect panel if panel selected
   - Close modal if modal open
   - Priority: modal > panel selection
4. **G Key - Toggle Safety Gate Page**
   - Switch between main view and SafetyGatePage
   - Preserve state when switching
5. **Ctrl+S / Cmd+S - Save Project**
   - Trigger manual save action
   - Show save confirmation toast
   - Prevent browser default "Save Page" behavior
6. **Add keyboard shortcut tests** (all 5 shortcuts)
**Prerequisites:** None
**Priority:** Medium
**Estimated Effort:** 6 hours (increased from 4)
**Status:** Not started

### T015: Enhance Panel Selection UX `[ ]` [P]
**Description:** Improve panel selection in overlapping scenarios (e.g., Factory view)
**Files:**
- `src/components/canvas/Cabinet3D.tsx`
- `src/components/ui/SortableList.tsx` (PanelSortableList)
**Subtasks:**
1. Add hover highlight with semi-transparent overlay
2. Show panel name tooltip on hover
3. Implement Tab key cycling through overlapping panels
4. Add PanelSortableList in UI for direct selection with keyboard nav
5. Use distinct highlight color for selected panel
6. Sync selection between 3D viewport and panel list
**Prerequisites:** None
**Priority:** Medium
**Estimated Effort:** 5 hours (increased from 4)
**Status:** Not started
**Notes:** Uses PanelSortableList component for accessible panel navigation

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

### T016: Optimize Texture Loading `[ ]` [P]
**Description:** Improve texture loading performance and caching
**Files:**
- `src/components/canvas/Cabinet3D.tsx`
- `src/core/utils/SmartPanelUV.ts`
**Subtasks:**
1. Implement texture cache with size limit (50 textures max)
2. Add lazy loading for textures
3. Implement texture preloading for visible materials
4. Use lower-resolution previews for thumbnails
5. Add loading indicators
**Prerequisites:** None
**Priority:** Medium
**Estimated Effort:** 5 hours
**Status:** Not started

### T017: Optimize State Update Performance `[ ]` [P]
**Description:** Profile and optimize state update performance
**Files:** `src/core/store/useCabinetStore.ts`
**Subtasks:**
1. Profile dimension update performance
2. Implement memoization for computed values
3. Debounce validation runs (300ms)
4. Optimize panel recalculation (batch updates)
5. Add performance monitoring to diagnostics
**Prerequisites:** None
**Priority:** Medium
**Estimated Effort:** 6 hours
**Status:** Not started

### T018: Implement Code Splitting `[ ]` [P]
**Description:** Split bundle by routes/features for faster initial load
**Files:** `vite.config.ts`, `src/App.tsx`
**Subtasks:**
1. Lazy load SafetyGatePage
2. Lazy load modals (PanelConfigModal, etc.)
3. Lazy load heavy components (MaterialSelector)
4. Configure Vite code splitting
5. Measure bundle size reduction
**Prerequisites:** None
**Priority:** Low
**Estimated Effort:** 4 hours
**Status:** Not started

---

## Phase 6: Testing & Quality Assurance

### T019: Write Unit Tests for Manufacturing Calculations `[ ]` [P]
**Description:** Comprehensive unit tests for ManufacturingCalculator
**Files:**
- `src/core/engines/ManufacturingCalculator.test.ts` (new)
- `src/core/engines/ManufacturingCalculator.ts`
**Test Coverage:**
- `calculateRealThickness` (all scenarios)
- `calculateCutSize` (including edge cases)
- `calculatePanelCost`
- `calculatePanelCO2`
**Prerequisites:** None
**Priority:** High
**Estimated Effort:** 6 hours
**Status:** Not started

### T020: Write Unit Tests for Validation Rules `[ ]` [P]
**Description:** Test all validation rules comprehensively
**Files:**
- `src/core/store/useSpecStore.test.ts` (new)
- `src/core/store/useSpecStore.ts`
**Test Coverage:**
- All dimensional rules (DIM-001 to DIM-006)
- All structural rules (STR-001 to STR-004)
- All material rules (MAT-001, MAT-002)
- All machine rules (MAC-001)
- All safety rules (SAF-001)
- Gate status calculation
**Prerequisites:** None
**Priority:** High
**Estimated Effort:** 8 hours
**Status:** Not started

### T021: Write Integration Tests for Panel Management `[ ]` [P]
**Description:** Test panel generation and material assignment flows
**Files:** `src/core/store/useCabinetStore.test.ts` (new)
**Test Coverage:**
- Panel generation from cabinet config
- Material assignment propagation
- Dimension updates cascading to panels
- Cost/CO2 recalculation
**Prerequisites:** T019, T020
**Priority:** Medium
**Estimated Effort:** 6 hours
**Status:** Not started

### T022: Write Integration Tests for Project Save/Load `[ ]` [P]
**Description:** Test project persistence roundtrip
**Files:** `src/core/store/useProjectStore.test.ts` (new)
**Test Coverage:**
- Save project to localStorage
- Load project from localStorage
- Export project as JSON
- Import project from JSON
- Auto-save functionality
- Data integrity validation
**Prerequisites:** None
**Priority:** Medium
**Estimated Effort:** 4 hours
**Status:** Not started

### T023: Test Auto-Save and Data Recovery Scenarios `[ ]` [P]
**Description:** Comprehensive testing of data persistence reliability (NFR3)
**Files:**
- `src/core/store/useProjectStore.test.ts` (new)
- `src/core/store/useProjectStore.ts`
**Test Coverage:**
- Auto-save failure handling (EC4: localStorage quota exceeded)
- Recovery from corrupted project data (EC8)
- Auto-save debouncing under rapid changes
- Data integrity after import/export roundtrip
- Browser crash recovery (data in localStorage)
- Manual save during auto-save in progress
**Prerequisites:** None
**Priority:** High
**Estimated Effort:** 4 hours
**Status:** Not started

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
- **Phase 2 (Bug Fixes):** 3 tasks (1 completed: T005)
- **Phase 3 (Core Features):** 3 tasks
- **Phase 4 (UX Enhancements):** 6 tasks (added T015a)
- **Phase 5 (Performance):** 3 tasks
- **Phase 6 (Testing):** 5 tasks (added T023)
- **Phase 7 (Documentation):** 3 tasks
- **Phase 8 (Future Prep):** 3 tasks
- **Phase 9 (Configuration):** 3 tasks
- **Phase 10 (Advanced):** 3 tasks

**Total:** 36 tasks

### By Priority
- **High:** 11 tasks (added T023, T015a)
- **Medium:** 12 tasks
- **Low:** 13 tasks

### By Status
- **Completed:** 5 tasks (T001-T003, T005, T015a)
- **In Progress:** 0 tasks
- **Not Started:** 31 tasks
- **Blocked:** 0 tasks

### Recent Completions (2026-01-09)
- ✅ **T005:** Fix Total Area Calculation Display
  - Fixed `surfaceArea` calculation to account for both panel faces
  - Total Area now shows correct material usage
- ✅ **T015a:** Document SortableList Component
  - Added full keyboard navigation (Arrow keys, Home, End, Enter, Space, Delete)
  - Implemented WCAG accessibility (ARIA labels, screen reader support)
  - Performance optimized with React.memo and useCallback
  - Documented in plan.md and spec.md

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

### Critical Path (Next 2 weeks)
1. ✅ **T004:** Run `/speckit.analyze` to validate consistency
2. **T005:** Fix total area calculation display bug
3. **T006:** Test MaterialSelector integration
4. **T007:** Test PanelConfigModal
5. **T008:** Complete DXF export integration

### Quick Wins (High value, low effort)
1. **T014:** Add dimension labels toggle (D key)
2. **T015:** Enhance panel selection UX
3. **T023:** Add JSDoc comments to core functions

### Must-Have Before v2.0 Release
1. **T005-T007:** All bug fixes
2. **T008:** DXF export completion
3. **T019-T020:** Core unit tests (Manufacturing & Validation)

---

**Document Version:** 1.0
**Created:** 2026-01-09
**Last Updated:** 2026-01-09
**Author:** Claude (via Spec Kit Analysis)
**Status:** DRAFT
