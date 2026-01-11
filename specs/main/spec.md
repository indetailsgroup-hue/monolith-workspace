# IIMOS Designer Workspace v2.0 - Specification

## Overview

**IIMOS Designer Workspace v2.0** is a parametric cabinet design and manufacturing system for modern furniture manufacturing. The system enables designers to create cabinet designs while maintaining manufacturing precision and validating against CNC machine constraints.

**Core Philosophy**: "Design is Free — Manufacturing is Deterministic"

The project bridges creative design freedom with deterministic manufacturing requirements through a three-layer architecture that separates visual representation from manufacturing truth.

## Project Goals

1. Enable intuitive 3D parametric cabinet design
2. Ensure manufacturing accuracy and CNC compatibility
3. Provide multi-stakeholder visualization (designers, contractors, machine operators)
4. Prevent non-compliant designs from reaching production through safety gates
5. Support flexible material composition (core + surface + edge)
6. Maintain real-time cost and environmental impact (CO2) tracking

## Context

### Target Users

1. **Cabinet Designers**: Create parametric designs with visual feedback
2. **Manufacturing Engineers**: Validate designs against production constraints
3. **CNC Operators**: Export machine-ready DXF files with drilling patterns
4. **Project Managers**: Track costs, materials, and project versions

### Technical Context

- Modern furniture manufacturing environment
- CNC machine integration required (DXF export)
- Multi-machine support (Homag CENTATEQ, Biesse Rover A, KDT-1320)
- Thai market focus (THB currency, local material suppliers)

## Functional Requirements

### FR1: Cabinet Configuration

#### FR1.1: Cabinet Type Selection
**User can select cabinet type from predefined structures**

**Acceptance Criteria:**
- Support BASE, WALL, TALL, DRAWER, and CORNER cabinet types
- Each type has specific default dimensions and panel configurations
- Type selection automatically generates appropriate panel structure

#### FR1.2: Parametric Dimensions
**User can configure cabinet dimensions with real-time validation**

**Acceptance Criteria:**
- Width: 200mm - 1200mm (warn above 1200mm)
- Height: 300mm - 2400mm (warn above 2400mm)
- Depth: 300mm - 1000mm (warn above 1000mm)
- Toe-kick height: 0mm - 150mm
- All dimensions in millimeters (mm)
- Real-time dimension input with validation feedback

#### FR1.3: Structure Configuration
**User can configure cabinet internal structure**

**Acceptance Criteria:**
- Toggle back panel (ON/OFF)
- Set back panel inset (default 20mm)
- Configure shelf count (0-8 shelves, warn above 5)
- Configure divider count (0-3 dividers)
- Set top/bottom joint types (INSET or OVERLAY)

### FR2: Material System

#### FR2.1: Three-Layer Material Stack
**System supports core material + dual surface layers + edge banding**

**Acceptance Criteria:**
- Core materials: Particle Board, MDF, HMR Green, Marine Plywood (16-18mm typical)
- Surface materials: Melamine, HPL, Veneer (0.3-3.0mm)
- Edge materials: PVC, ABS (0.5-2.0mm)
- Support 100+ pre-configured surface finishes (woods, solids, stones)
- Each material has cost/m² and CO2 emissions tracking

#### FR2.2: Material Assignment
**User can assign materials at cabinet and panel levels**

**Acceptance Criteria:**
- Set default materials for entire cabinet
- Override materials per individual panel
- Assign Face A and Face B surface materials independently
- Configure edge banding per side (Top, Bottom, Left, Right)
- Visual material preview with textures

#### FR2.3: Material Catalog
**System provides comprehensive material catalog with visual previews**

**Acceptance Criteria:**
- Material thumbnails (texture previews)
- Material specifications (thickness, cost, CO2)
- Color codes (hex values)
- Texture URLs for 3D rendering
- Grain direction information

### FR3: Panel Management

#### FR3.1: Automatic Panel Generation
**System automatically generates panels based on cabinet configuration**

**Acceptance Criteria:**
- Generate 7+ panel types: Left Side, Right Side, Top, Bottom, Back, Shelves, Dividers
- Panels update automatically when dimensions change
- Each panel has role, dimensions, and material assignments
- Panel visibility control

#### FR3.2: Panel Configuration
**User can configure individual panel properties**

**Acceptance Criteria:**
- Edit panel finish dimensions (width, height)
- Assign core material per panel
- Assign surface materials (Face A/B) per panel
- Configure edge banding per side
- Set grain direction (HORIZONTAL or VERTICAL)
- View computed values (real thickness, cut size, cost, CO2)

#### FR3.3: Panel Selection
**User can select panels for editing via 3D 3D viewport**

**Acceptance Criteria:**
- Click panel in 3D to select
- Visual highlight for selected panel
- Keyboard shortcut (E) to edit selected panel
- Deselect with Esc key

### FR4: Manufacturing Intelligence

#### FR4.1: Real Thickness Calculation
**System calculates actual panel thickness including all layers**

**Formula:**
```
T_real = T_core + T_surfaceA + T_surfaceB + (2 × T_glue)
```

**Acceptance Criteria:**
- Glue thickness: 0.1-0.2mm per layer
- Accurate calculation for all panels
- Display in panel configuration UI

#### FR4.2: Cut Size Calculation
**System calculates precise cut dimensions for CNC machines**

**Formula:**
```
CutSize = FinishSize − (EdgeThickness₁ + EdgeThickness₂) + PreMill
```

**Acceptance Criteria:**
- Pre-milling allowance: 0.5-1.0mm per edged side
- Account for edge banding thickness
- Validate cut size > 0mm (fail if not)

#### FR4.3: Manufacturing Constants
**System enforces manufacturing standards**

**Constants:**
- Glue thickness: 0.1-0.2mm
- Pre-milling: 0.5-1.0mm
- Groove depth: 8-10mm
- Back panel void: 19-20mm
- Safety gaps: 1-2mm
- Shelf setback (front): 20mm

### FR5: 3D Visualization

#### FR5.1: Six-View Camera System
**System provides six functionally meaningful camera views**

**Views:**
1. **Perspective**: 45° isometric for design thinking
2. **Front**: Contractor-friendly frontal view
3. **Left**: Side profile for depth verification
4. **Install**: 3/4 angle installation reference
5. **Factory**: Top-down manufacturing truth
6. **CNC**: Machine coordinate alignment

**Acceptance Criteria:**
- Smooth camera transitions between views
- OrbitControls for free rotation in each view
- Preset camera positions, targets, and FOV per view

#### FR5.2: 3D Panel Rendering
**System renders cabinet panels in 3D with materials**

**Acceptance Criteria:**
- Render each panel as 3D mesh
- Apply base color from surface material
- Apply texture mapping from material texture URL
- Edge highlighting (black stroke)
- Selection state visual feedback (color highlight)
- Interactive raycast for click selection

#### FR5.3: Scene Setup
**3D scene includes proper lighting, shadows, and environment**

**Acceptance Criteria:**
- Ambient light (0.4 intensity)
- Directional light with shadows (1.2 intensity, 2048² shadow map)
- Studio environment preset for reflections
- Infinite grid for reference
- Real-world scale (1 unit = 1mm)

#### FR5.4: Dimension Labels
**User can toggle dimension labels in 3D 3D viewport**

**Acceptance Criteria:**
- Keyboard shortcut (D) to toggle labels
- Display width, height, depth labels
- Position labels appropriately in 3D space

### FR6: Validation & Safety Gates

#### FR6.1: Specification States
**System manages specification lifecycle states**

**States:**
- **DRAFT**: Active design, changes allowed
- **FROZEN**: Locked for review, no changes
- **RELEASED**: Approved for manufacturing, read-only

**Acceptance Criteria:**
- Transition DRAFT → FROZEN → RELEASED
- Ability to unfreeze from FROZEN → DRAFT
- Visual state indicator in UI
- Cannot release without passing validation

#### FR6.2: Validation Rules
**System validates designs against manufacturing constraints**

**Rule Categories:**
1. **Dimensional**: Min/max width, height, depth checks
2. **Structural**: Panel count, shelf span, load capacity
3. **Material**: Compatibility, grain direction alignment
4. **Machine**: CNC machine dimension limits
5. **Safety**: Joint strength, clearances

**Acceptance Criteria:**
- Each rule has status: PASS, WARN, or FAIL
- Real-time validation on dimension changes
- Validation result summary (pass/warn/fail counts)
- Detailed rule messages with affected panel IDs

#### FR6.3: Gate Status
**System determines manufacturing readiness**

**Acceptance Criteria:**
- Gate status: OK, WARNING, or BLOCKED
- `canFreeze`: No FAIL rules
- `canRelease`: FROZEN state + no FAIL rules
- `canExport`: RELEASED state only
- Display blocker list if BLOCKED

### FR7: Cost & Environmental Tracking

#### FR7.1: Real-Time Cost Calculation
**System calculates total cabinet cost**

**Cost Components:**
- Core material cost (THB/m²)
- Surface material cost (THB/m²)
- Edge banding cost (THB/meter)
- Hardware/fitting costs

**Acceptance Criteria:**
- Calculate cost per panel
- Sum total cabinet cost (THB)
- Display cost breakdown by material type
- Update in real-time on material changes

#### FR7.2: CO2 Emissions Tracking
**System tracks environmental impact**

**Acceptance Criteria:**
- CO2 emissions per material (kg CO2/m²)
- Calculate total cabinet CO2 footprint
- Display CO2 by material category
- Environmental impact summary

#### FR7.3: Area & Length Calculations
**System calculates material quantities**

**Acceptance Criteria:**
- Total surface area (m²) for all panels
- Total edge length (meters) for all edges
- Per-panel area and edge calculations
- Panel count summary

### FR8: Hardware System

#### FR8.1: Hardware Catalog
**System provides comprehensive hardware/fitting catalog**

**Hardware Types:**
- Hinges (concealed, overlay, inset)
- Drawer slides (undermount, side-mount)
- Lift mechanisms
- Shelf supports

**Acceptance Criteria:**
- Safety ranking: SAFE, WARN, UNSAFE
- Load capacity specifications
- Compatibility matrix (thickness range, door size limits)
- Drilling pattern definitions (System 32, Confirmat, Minifix)

#### FR8.2: Hardware Selection
**User can select and configure hardware**

**Acceptance Criteria:**
- Select hardware by type and specification
- View compatibility warnings
- Generate Bill of Materials (BOM)
- Include hardware in cost calculation

### FR9: Project Management

#### FR9.1: Auto-Save
**System automatically saves project state**

**Acceptance Criteria:**
- Auto-save to localStorage every 2 seconds (debounced)
- Save on significant state changes
- Visual indicator when saving
- Last saved timestamp display

#### FR9.2: Manual Save/Load
**User can manually manage projects**

**Acceptance Criteria:**
- Save project with custom name
- Load from saved projects list
- Delete saved projects
- Rename projects

#### FR9.3: Export/Import
**User can export/import projects as files**

**Acceptance Criteria:**
- Export project as JSON file
- Import project from JSON file
- Include all project data (cabinet, materials, metadata)
- Validate imported data structure

#### FR9.4: Project Metadata
**System tracks project information**

**Metadata:**
- Project name
- Version number
- Created timestamp
- Updated timestamp
- Author information
- Change history

### FR10: CNC Export

#### FR10.1: DXF Generation
**System exports CNC-ready DXF files**

**DXF Layers:**
- `CUT_OUT`: Panel outline
- `DRILL_V_8_D20`: Vertical drilling (8mm dia, 20mm depth)
- `DRILL_H_5_Z9_D10`: Horizontal drilling
- `SAW_GROOVE_D8`: Routing/grooving
- `HINGE_CUP_35`: Hinge drilling
- `ANNOTATION`: Non-cutting labels

**Acceptance Criteria:**
- Generate DXF per panel
- Layer-based organization
- Mirror logic for Face B operations
- Include drilling patterns for hardware
- Validate export against gate status

#### FR10.2: Machine Profiles
**System supports multiple CNC machine profiles**

**Supported Machines:**
- Homag CENTATEQ
- Biesse Rover A
- KDT-1320

**Acceptance Criteria:**
- Select machine profile
- Validate panel dimensions against machine limits
- Generate machine-specific operation codes
- Export format compatibility

### FR11: User Interface

#### FR11.1: Three-Panel Layout
**Application uses three-panel layout**

**Layout:**
- **Left Panel**: Designer Intent (Catalog, Materials, Hardware, Versions)
- **Center Panel**: 3D Viewport with camera controls
- **Right Panel**: Parametric Contract (Dimensions, Export)

**Acceptance Criteria:**
- Responsive panel sizing
- Collapsible panels
- Tab navigation within panels

#### FR11.2: Material Selector
**Expandable material selection interface**

**Acceptance Criteria:**
- Expandable card UI with animations
- Material grid with texture previews
- Filter by category (Core/Surface/Edge)
- Real-time material stack preview (thickness calculation)
- Apply mode: selected panel vs all panels

#### FR11.3: Panel Configuration Modal
**Modal interface for detailed panel editing**

**Acceptance Criteria:**
- Modal opens on panel selection + Edit (E key)
- Display finish dimensions
- Material assignment UI (Core, Face A/B, Edges)
- Real-time thickness breakdown visualization
- Save/Cancel actions

#### FR11.4: Safety & Gate Dashboard
**Manufacturing OS themed dashboard for validation**

**Acceptance Criteria:**
- Job ID and snapshot tracking
- Safety verdict display (PASS/WARN/FAIL)
- Rules validation table with margins
- Panels & fittings summary
- Export integrity checks
- History & audit trail

#### FR11.5: Keyboard Shortcuts
**System supports keyboard shortcuts for efficiency**

**Shortcuts:**
- `E`: Edit selected panel
- `Esc`: Deselect panel / Close modal
- `G`: Toggle Safety & Gate page
- `D`: Toggle dimension labels
- `Ctrl+S` / `Cmd+S`: Save project

## Non-Functional Requirements

### NFR1: Performance

#### NFR1.1: 3D Rendering Performance
**3D viewport maintains 60 FPS target frame rate**

**Acceptance Criteria:**
- Maintain 60 FPS (±5 FPS) on modern hardware (Intel i5/Ryzen 5, 8GB RAM, integrated GPU)
- Smooth camera transitions complete within 300ms
- Frame time <16.67ms during panel selection (no frame drops)
- Texture loading <500ms per texture
- Maximum frame time: 33ms (30 FPS minimum) under heavy load
**Measurement:** Use browser DevTools Performance profiler

#### NFR1.2: State Update Performance
**State changes propagate efficiently**

**Acceptance Criteria:**
- Dimension updates reflect in <100ms
- Material changes update visuals in <200ms
- Validation runs in <500ms for typical cabinet
- Auto-save debounce prevents excessive saves

### NFR2: Usability

#### NFR2.1: Intuitive Controls
**Interface is intuitive for target users with measurable usability**

**Acceptance Criteria:**
- **Task Success Rate:** 90% of new users complete basic cabinet creation without documentation
  - Basic task: Create cabinet → Set dimensions → Choose materials → Save project
  - Test with 10 users (5 designers, 5 manufacturing engineers)
- **Time to Proficiency:** Users can complete advanced tasks (multi-panel material assignment) within 30 minutes
- **Error Recovery:** Clear visual feedback for all interactions within 200ms
- **Error Clarity:** Error messages include specific issue + suggested fix (100% of validation errors)
- **UI Consistency:** All modal dialogs use consistent button placement (Save right, Cancel left)
**Measurement:** Conduct usability testing sessions with target users

#### NFR2.2: Accessibility
**Interface supports basic accessibility needs**

**Acceptance Criteria:**
- Keyboard navigation support (arrow keys, tab, enter, space)
- Clear contrast ratios (WCAG AA compliance)
- Readable font sizes (minimum 12px)
- Logical tab order with visual focus indicators
- ARIA labels for screen readers on interactive elements
- Screen reader compatibility (NVDA, JAWS tested)
- Keyboard shortcuts documented in UI

**Implementation Status (v2.1):**
- ✅ SortableList component: Full keyboard navigation + ARIA support
- ✅ Focus indicators: Blue ring (ring-2 ring-blue-500/50)
- ⏳ Global keyboard shortcuts (T014): In progress
- ⏳ Screen reader testing: Pending

### NFR3: Reliability

#### NFR3.1: Data Persistence
**User data is reliably saved**

**Acceptance Criteria:**
- Auto-save prevents data loss
- LocalStorage backup on every significant change
- Graceful handling of storage limits
- Recovery from corrupted data

#### NFR3.2: Calculation Accuracy
**Manufacturing calculations are accurate**

**Acceptance Criteria:**
- No rounding errors in dimension calculations
- Consistent precision (0.1mm)
- Validated formulas against manufacturing standards
- Unit test coverage for core calculations

### NFR4: Maintainability

#### NFR4.1: Code Organization
**Codebase is well-organized and maintainable**

**Acceptance Criteria:**
- Clear separation of concerns (layers, stores, components)
- Type safety throughout (strict TypeScript)
- Comprehensive JSDoc comments
- No 'any' types in core logic

#### NFR4.2: Testing
**Critical logic achieves minimum 80% test coverage**

**Acceptance Criteria:**
- **Core Logic Coverage:** ≥80% line coverage for `src/core/engines/` (manufacturing calculations)
- **Validation Coverage:** 100% coverage for all validation rules in `useSpecStore.ts`
- **Formula Verification:** All mathematical formulas (T_real, CutSize) have test cases covering:
  - Normal cases (typical values)
  - Edge cases (min/max values, zero thickness)
  - Error cases (negative results, invalid inputs)
- **State Management:** ≥70% coverage for Zustand stores (useCabinetStore, useProjectStore)
- **Integration Tests:** At least 10 integration test scenarios covering end-to-end workflows
**Measurement:** Use Jest coverage reports (jest --coverage)

### NFR5: Extensibility

#### NFR5.1: Plugin Architecture
**System supports future extensions**

**Acceptance Criteria:**
- Modular material catalog
- Pluggable validation rules
- Extensible hardware catalog
- Machine profile abstraction

#### NFR5.2: Configuration
**System behavior is configurable**

**Acceptance Criteria:**
- Manufacturing constants in config files
- Material catalogs editable without code changes
- Validation thresholds configurable
- Machine profiles as JSON

## User Stories

### US1: Create Basic Cabinet
**As a cabinet designer, I want to create a basic cabinet with dimensions and materials, so that I can start my design process quickly.**

**Acceptance Criteria:**
- Select cabinet type (BASE)
- Set dimensions (800mm × 720mm × 560mm)
- Choose materials (core, surface, edge)
- View 3D preview
- Save project

**Priority:** High
**Estimated Effort:** Core feature (already implemented)

### US2: Configure Shelves
**As a designer, I want to add shelves to my cabinet and see them update in 3D, so that I can visualize internal organization.**

**Acceptance Criteria:**
- Increase shelf count (1-8)
- Shelves appear in 3D 3D viewport
- Shelf dimensions auto-calculated
- Material applied to shelves
- Cost updates with shelf count

**Priority:** High
**Estimated Effort:** Core feature (already implemented)

### US3: Select Different Material Per Panel
**As a designer, I want to use different materials for interior vs exterior surfaces, so that I can optimize cost and aesthetics.**

**Acceptance Criteria:**
- Select individual panel
- Override default materials
- Assign Face A and Face B independently
- View material stack preview
- Cost recalculates automatically

**Priority:** High
**Estimated Effort:** Core feature (already implemented)

### US4: Validate Design Before Export
**As a manufacturing engineer, I want to validate the design against production constraints, so that I can catch errors before CNC export.**

**Acceptance Criteria:**
- Run validation command
- View validation results table
- See PASS/WARN/FAIL status per rule
- Identify blocking issues
- Cannot export if FAIL rules exist

**Priority:** High
**Estimated Effort:** Core feature (already implemented)

### US5: Export CNC Files
**As a CNC operator, I want to export machine-ready DXF files, so that I can load them into the CNC machine.**

**Acceptance Criteria:**
- Design must be RELEASED state
- Select machine profile
- Export generates DXF per panel
- DXF includes drilling patterns
- Files named with panel IDs

**Priority:** High
**Estimated Effort:** Partial (structure exists, integration pending)

### US6: Track Project Costs
**As a project manager, I want to see real-time cost breakdown, so that I can make informed material decisions.**

**Acceptance Criteria:**
- View total project cost (THB)
- See cost breakdown by material type
- Track CO2 emissions
- Compare material options
- Export cost report

**Priority:** Medium
**Estimated Effort:** Core feature (already implemented)

### US7: Save and Load Projects
**As a designer, I want to save my work and continue later, so that I don't lose progress.**

**Acceptance Criteria:**
- Auto-save every 2 seconds
- Manual save with custom name
- Load from saved projects list
- Export/import as JSON files
- View last saved timestamp

**Priority:** High
**Estimated Effort:** Core feature (already implemented)

### US8: Switch Camera Views
**As a multi-role user, I want to switch between camera views optimized for different purposes, so that I can focus on relevant aspects.**

**Acceptance Criteria:**
- 6 camera view options
- Smooth transitions between views
- Free orbit in each view
- View optimized for role (designer/contractor/operator)

**Priority:** Medium
**Estimated Effort:** Core feature (already implemented)

### US9: Add Shelves/Dividers via Compartment Right-Click
**As a designer, I want to right-click on a compartment to add shelves or dividers, so that I can quickly customize cabinet internal organization without navigating menus.**

**Acceptance Criteria:**
- Right-click on any compartment shows green dashed highlight
- Plus (+) button appears at compartment center
- Click + button opens menu with "Add Shelf" and "Add Divider" options
- Second popup allows quantity input (1-10)
- Multiple items are evenly distributed in the compartment
- Sub-compartments (created by partial dividers) are independently selectable
- Cancel/Escape closes the popup without changes

**Priority:** High
**Estimated Effort:** Core feature (implemented v2.5)

### US10: Editable Compartment Dimensions
**As a designer, I want to click dimension labels on the 3D viewport to edit compartment widths and heights, so that I can fine-tune cabinet organization visually.**

**Acceptance Criteria:**
- Blue dimension labels show compartment width and height
- Click on label opens inline input for editing
- Width changes move the adjacent divider
- Height changes adjust shelf position (gapFromBelow)
- Orange labels show partial divider positions (left/right distances)
- Click partial divider labels to reposition within sub-compartment

**Priority:** Medium
**Estimated Effort:** Core feature (implemented v2.5)

### US11: Per-Panel Position Overrides
**As a designer, I want to configure individual shelf/divider positions, so that I can create custom layouts that deviate from auto-calculated positions.**

**Acceptance Criteria:**
- Shelf/Divider panels show "Position Overrides" section in Panel Config Modal
- Front Setback slider: 0-100mm from cabinet front
- Back Setback slider: 0-100mm from cabinet back (LED space)
- Gap Height slider: Manual Y position for shelves
- "Reset to Auto" button restores default positioning
- Custom position indicator (*) shows on per-panel dimension labels

**Priority:** Medium
**Estimated Effort:** Core feature (implemented v2.5)

## Edge Cases

### EC1: Extreme Dimensions
**Scenario:** User enters dimension outside recommended range (e.g., 2000mm height)

**Expected Behavior:**
- System shows WARNING status (not FAIL)
- Explanation: "Height exceeds recommended maximum (2400mm). Manufacturing may be challenging."
- Allow user to proceed with warning acknowledgment
- Do not block export for warnings only

### EC2: Zero Thickness Edge
**Scenario:** User selects "No Edge" for a panel side

**Expected Behavior:**
- Edge thickness = 0mm for that side
- Cut size calculation adjusts accordingly
- Visual 3D rendering shows unedged side (no edge highlight)
- Validation warns about exposed core edge if visible face

### EC3: Material Texture Load Failure
**Scenario:** Material texture URL fails to load

**Expected Behavior:**
- Fall back to base color only
- Log error to diagnostics store
- Show warning icon on material in catalog
- Allow design to continue without texture
- Do not block export

### EC4: LocalStorage Quota Exceeded
**Scenario:** Browser localStorage is full, auto-save fails

**Expected Behavior:**
- Show error notification: "Auto-save failed: Storage full"
- Prompt user to export project as JSON file
- Offer to delete old saved projects
- Mark project as "dirty" with visible indicator
- Prevent data loss by keeping in-memory state

### EC5: Validation Rule Conflict
**Scenario:** Two validation rules contradict (e.g., one requires X, another forbids X)

**Expected Behavior:**
- Log conflict to diagnostics
- Show FAIL status for conflicting rules
- Display explanation in Safety & Gate dashboard
- Provide remediation guidance
- Escalate to spec owner for rule resolution

### EC6: Panel Selection in Factory View
**Scenario:** User tries to select panel in top-down Factory view where overlapping panels are hard to distinguish

**Expected Behavior:**
- Highlight panel on hover with semi-transparent overlay
- Show panel name tooltip on hover
- Allow cycling through overlapping panels with Tab key
- Provide panel list in UI for direct selection
- Selected panel gets distinct highlight color

### EC7: Negative Cut Size
**Scenario:** Thick edge banding (e.g., 2mm each side) on small panel results in negative cut size

**Expected Behavior:**
- Validation shows FAIL status
- Message: "Cut size is negative or zero for panel [ID]. Reduce edge thickness or increase finish dimensions."
- Highlight affected panel in 3D
- Block export until resolved
- Suggest edge thickness reduction

### EC8: Import Corrupted Project
**Scenario:** User imports JSON file with invalid or incomplete data

**Expected Behavior:**
- Validate JSON structure before import
- Show error message listing missing/invalid fields
- Do not overwrite current project
- Offer partial import if some data is salvageable
- Log detailed error to diagnostics

### EC9: Rapid Dimension Changes
**Scenario:** User rapidly drags dimension slider, triggering many updates

**Expected Behavior:**
- Debounce validation (run after 300ms of no changes)
- Update 3D 3D viewport immediately (optimistic rendering)
- Queue state updates to prevent race conditions
- Show loading indicator during heavy recalculation
- Maintain UI responsiveness

### EC10: Export in DRAFT State
**Scenario:** User attempts to export CNC files while spec is in DRAFT state

**Expected Behavior:**
- Block export action
- Show modal: "Cannot export in DRAFT state. Freeze and validate design first."
- Provide "Freeze Design" button in modal
- Explain workflow: DRAFT → FROZEN → validation → RELEASED → export
- Do not allow bypassing safety gate

## Success Metrics

### Primary Metrics

1. **Design Time Reduction**: Reduce cabinet design time by 50% vs traditional CAD
2. **Error Rate**: <5% of designs require revision after validation
3. **Export Success Rate**: >95% of RELEASED designs export without issues
4. **User Satisfaction**: >80% positive feedback from target users

### Secondary Metrics

1. **Material Waste**: Track material waste via cut optimization
2. **Cost Accuracy**: Estimated cost within ±10% of actual manufacturing cost
3. **Adoption Rate**: Number of active users per month
4. **Feature Usage**: Track which features are most/least used

## Constraints

### Technical Constraints

1. **Browser Compatibility**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
2. **3D Hardware**: Requires WebGL 2.0 support
3. **Screen Size**: Minimum 1280×720 resolution
4. **Storage**: Requires 10MB+ localStorage available
5. **Performance**: Minimum 8GB RAM, modern GPU recommended

### Business Constraints

1. **Budget**: Development using open-source technologies only
2. **Timeline**: Incremental releases every 2-4 weeks
3. **Market**: Initial focus on Thai furniture market
4. **Currency**: Thai Baht (THB) only (no multi-currency)

### Regulatory Constraints

1. **Manufacturing Standards**: Comply with Thai Industrial Standards (TIS)
2. **Safety**: All designs must pass safety validation before export
3. **Data Privacy**: User projects stored locally only (no cloud sync in v2.0)

## Dependencies

### External Dependencies

1. **React 18.2**: UI framework
2. **React Three Fiber 8.15**: 3D rendering
3. **Three.js 0.158**: 3D engine
4. **Zustand 4.4**: State management
5. **Tailwind CSS 3.3**: Styling
6. **TypeScript 5.2**: Type safety
7. **Vite 5.0**: Build tool

### Internal Dependencies

1. Material catalog data files
2. Hardware/fitting catalog
3. Machine profile definitions
4. Validation rule configuration
5. Manufacturing constant definitions

## Out of Scope (v2.0)

The following features are explicitly out of scope for version 2.0:

1. **Cloud Sync**: Multi-device project synchronization
2. **Collaboration**: Real-time multi-user editing
3. **Advanced Hardware**: Drawer box assembly, complex lift mechanisms
4. **Cut Optimization**: Automatic nesting for minimal waste
5. **Multi-Room Planning**: Kitchen layout with multiple cabinets
6. **Customer Quotes**: Automated quote generation for end customers
7. **Supplier Integration**: Direct ordering from material suppliers
8. **Mobile Support**: Responsive design for tablets/phones
9. **Animation**: Door opening animations, drawer slide simulations
10. **AR/VR**: Augmented/Virtual reality visualization

These features may be considered for future versions based on user feedback and business priorities.

---

**Document Version:** 1.1
**Created:** 2026-01-09
**Last Updated:** 2026-01-11
**Author:** Claude (via Spec Kit Analysis)
**Status:** DRAFT

---

## Changelog

### v1.1 (2026-01-11)
- Added US9: Add Shelves/Dividers via Compartment Right-Click
- Added US10: Editable Compartment Dimensions
- Added US11: Per-Panel Position Overrides
- Features implemented: Sub-compartment detection, quantity input popup, multiple item distribution
