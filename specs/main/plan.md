# MONOLITH Designer Workspace v2.0 - Implementation Plan

## Architecture Overview

### Three-Layer Architecture Pattern

The system implements a strict separation between **Visual Layer** (magic), **UI Layer** (interaction), and **Truth Layer** (deterministic manufacturing data).

```
┌─────────────────────────────────────────────┐
│  VISUAL LAYER (Magic - Not Manufacturing)   │
│  - Cabinet3D.tsx                            │
│  - ViewportController.tsx                   │
│  - 3D mesh rendering                        │
│  - Camera views                             │
│  - Interactive selection                    │
└─────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────┐
│  UI/INTERACTION LAYER                       │
│  - Material selectors                       │
│  - Dimension editors                        │
│  - Panel configuration                      │
│  - Project management                       │
└─────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────┐
│  TRUTH LAYER (Deterministic)                │
│  - Core types (Cabinet.ts)                  │
│  - State stores (useCabinetStore.ts)        │
│  - Manufacturing engines                    │
│  - Validation rules                         │
│  - DXF export                               │
└─────────────────────────────────────────────┘
```

**Critical Principle:** The 3D visual layer is **never** used for manufacturing truth. All manufacturing data flows from the Truth Layer.

## Technology Stack

### Core Technologies

| Technology | Version | Purpose | Justification |
|-----------|---------|---------|---------------|
| **React** | 18.2 | UI framework | Industry standard, excellent ecosystem, hooks for state |
| **TypeScript** | 5.2 | Type safety | Prevents runtime errors in critical manufacturing calculations |
| **Vite** | 5.0 | Build tool | Lightning-fast HMR, modern ESM support |
| **Zustand** | 4.4 | State management | Minimal boilerplate, excellent TypeScript support, middleware |
| **Immer** | 10.0 | Immutable updates | Safe state mutations without boilerplate |

### 3D & Graphics

| Technology | Version | Purpose | Justification |
|-----------|---------|---------|---------------|
| **Three.js** | 0.158 | 3D engine | Industry standard WebGL abstraction |
| **React Three Fiber** | 8.15 | Declarative 3D | React-native 3D with component model |
| **@react-three/drei** | 9.88 | 3D utilities | OrbitControls, Grid, Environment, Edges |
| **Framer Motion** | 12.23 | Animations | Smooth UI transitions, spring physics |

### UI & Styling

| Technology | Version | Purpose | Justification |
|-----------|---------|---------|---------------|
| **Tailwind CSS** | 3.3 | Styling | Utility-first, rapid development, small bundle |
| **Lucide React** | 0.562 | Icons | Modern icon library, tree-shakeable |
| **PostCSS** | 8.4 | CSS processing | Tailwind requirement, autoprefixer |

### Build & Development

| Tool | Version | Purpose |
|------|---------|---------|
| **@vitejs/plugin-react** | 4.2 | React FastRefresh |
| **Autoprefixer** | 10.4 | CSS vendor prefixes |

## Data Model

### Core Types (`src/core/types/Cabinet.ts`)

#### Cabinet

```typescript
interface Cabinet {
  // Identity
  id: string
  name: string
  type: CabinetType  // 'BASE' | 'WALL' | 'TALL' | 'DRAWER' | 'CORNER'

  // Parametric dimensions (all in mm)
  dimensions: CabinetDimensions

  // Structure configuration
  structure: CabinetStructure

  // Material assignments
  materials: CabinetMaterials

  // Manufacturing parameters
  manufacturing: ManufacturingConfig

  // Generated panels
  panels: CabinetPanel[]

  // Computed values (derived, never input)
  computed: ComputedCabinetData

  // Metadata
  createdAt: number
  updatedAt: number
}
```

#### CabinetDimensions

```typescript
interface CabinetDimensions {
  width: number       // mm, 200-1200 (warn >1200)
  height: number      // mm, 300-2400 (warn >2400)
  depth: number       // mm, 300-1000 (warn >1000)
  toeKickHeight: number  // mm, 0-150
}
```

#### CabinetStructure

```typescript
interface CabinetStructure {
  topJoint: JointType       // 'INSET' | 'OVERLAY'
  bottomJoint: JointType
  hasBackPanel: boolean
  backPanelInset: number    // mm, default 20
  shelfCount: number        // 0-8 (warn >5)
  dividerCount: number      // 0-3
}
```

#### CabinetPanel

```typescript
interface CabinetPanel {
  id: string
  role: PanelRole  // 'LEFT_SIDE' | 'RIGHT_SIDE' | 'TOP' | 'BOTTOM' | etc.
  name: string

  // Finish dimensions (after edge banding)
  finishWidth: number   // mm
  finishHeight: number  // mm

  // Material stack
  coreMaterialId: string
  faces: {
    faceA: string | null  // Surface material ID
    faceB: string | null
  }
  edges: {
    top: string | null     // Edge material ID
    bottom: string | null
    left: string | null
    right: string | null
  }
  grainDirection: 'HORIZONTAL' | 'VERTICAL'

  // Computed manufacturing values
  computed: {
    realThickness: number  // T_real = T_core + T_surfaceA + T_surfaceB + (2×T_glue)
    cutWidth: number       // CutSize = FinishSize − (E1 + E2) + PreMill
    cutHeight: number
    surfaceArea: number    // m²
    edgeLength: number     // meters
    cost: number           // THB
    co2: number            // kg CO2
  }

  // 3D positioning (visual only, not manufacturing truth)
  position: [number, number, number]
  rotation: [number, number, number]
  visible: boolean
  selected: boolean
}
```

#### Material Types

```typescript
interface CoreMaterial {
  id: string
  name: string
  type: 'PARTICLE_BOARD' | 'MDF' | 'HMR_GREEN' | 'MARINE_PLYWOOD'
  thickness: number     // mm
  costPerSqm: number    // THB/m²
  co2PerSqm: number     // kg CO2/m²
}

interface SurfaceMaterial {
  id: string
  name: string
  type: 'MELAMINE' | 'HPL' | 'VENEER'
  thickness: number     // mm (0.3-3.0)
  costPerSqm: number
  co2PerSqm: number
  color: string         // Hex color code
  textureUrl?: string   // Texture image URL or Base64
  thumbnail?: string    // Preview thumbnail
}

interface EdgeMaterial {
  id: string
  name: string
  code: string          // e.g., 'PVC-W-1.0'
  thickness: number     // mm (0.5-2.0)
  height: number        // mm (typical 22-45mm)
  costPerMeter: number  // THB/m
  color: string         // Hex color
}
```

### State Management Architecture

#### Store Structure

```
useCabinetStore (Primary)
├── Cabinet state
├── Material catalogs (inline)
├── Panel generation logic
├── Dimension setters
└── Material assignment actions

useSpecStore (Validation)
├── Spec state (DRAFT/FROZEN/RELEASED)
├── Validation rules
├── Gate status
└── Validation actions

useProjectStore (Persistence)
├── Project metadata
├── Save/load logic
├── Export/import
└── Auto-save

useMeasureStore (Tools)
useFittingStore (Hardware)
useDiagnosticsStore (Logging)
```

#### useCabinetStore Design

- **Size:** ~2000 lines (largest store)
- **Pattern:** Zustand + Immer middleware
- **Selectors:** Fine-grained for performance
- **Actions:** Atomic updates with cascading recalculation

**Key Actions:**
```typescript
// Initialization
initializeCabinet(type: CabinetType)

// Dimension updates
setDimension(dim: 'width'|'height'|'depth'|'toeKickHeight', value: number)

// Structure updates
setShelfCount(count: number)
addShelf()
removeShelf(index: number)
toggleBackPanel()
setJointType(position: 'top'|'bottom', type: JointType)

// Material updates
setDefaultCore(materialId: string)
setDefaultSurface(materialId: string)
setDefaultEdge(materialId: string)
updatePanelMaterial(panelId: string, coreId: string, faceAId?: string, faceBId?: string)
updatePanelEdge(panelId: string, side: 'top'|'bottom'|'left'|'right', edgeId?: string)

// Panel management
selectPanel(panelId: string | null)
updatePanelDimensions(panelId: string, width: number, height: number)
setPanelGrainDirection(panelId: string, direction: 'HORIZONTAL'|'VERTICAL')

// Computed value triggers (internal)
recalculatePanelDimensions()
recalculateCosts()
recalculateCO2()
```

## Component Architecture

### App Layout

```
App.tsx
└── AppShell.tsx (Layout container)
    ├── Header (Project name, spec state, gate status)
    ├── DesignerIntentPanel (Left sidebar)
    │   ├── CatalogTab
    │   ├── MaterialsTab
    │   ├── HardwareTab
    │   └── VersionsTab
    ├── 3D Viewport (Center - Canvas)
    │   ├── Canvas (React Three Fiber)
    │   │   ├── Lights
    │   │   ├── Environment
    │   │   ├── Grid (InfiniteGrid)
    │   │   ├── Cabinet3D (Main 3D object)
    │   │   └── OrbitControls
    │   ├── ViewportController (Camera presets)
    │   └── MeasureLayer (Dimension overlays)
    ├── ParametricContractPanel (Right sidebar)
    │   ├── ContractTab (Dimensions editor)
    │   └── ExportTab (CNC export UI)
    └── Footer (Validation status, machine compatibility)
```

### Key Components

#### Cabinet3D.tsx (3D Rendering)

**Purpose:** Render cabinet panels as 3D meshes with materials and textures

**Implementation:**
```typescript
// For each panel in cabinet.panels:
<mesh
  position={panel.position}
  rotation={panel.rotation}
  onClick={() => selectPanel(panel.id)}
>
  <boxGeometry args={[width, height, thickness]} />
  <meshStandardMaterial
    color={getSurfaceMaterialColor(panel)}
    map={getSurfaceMaterialTexture(panel)}
    metalness={0.1}
    roughness={0.8}
  />
  {panel.selected && <Edges color="blue" linewidth={2} />}
</mesh>
```

**Key Features:**
- Raycast-based click selection
- Texture loading with caching
- Edge highlighting for selection
- Real-world scale (1 unit = 1mm)

#### ViewportController.tsx (Camera Management)

**Purpose:** Manage 6 preset camera views with smooth transitions

**Camera Presets:**
```typescript
const CAMERA_PRESETS = {
  perspective: {
    position: [1500, 1200, 2000],
    target: [400, 360, 280],
    fov: 50,
    purpose: 'Design thinking, presentations'
  },
  front: {
    position: [0, 400, 2500],
    target: [0, 400, 0],
    fov: 35,
    purpose: 'Contractor-friendly frontal view'
  },
  left: {
    position: [-2500, 400, 0],
    target: [0, 400, 0],
    fov: 35,
    purpose: 'Side profile verification'
  },
  install: {
    position: [1800, 900, 1800],
    target: [400, 360, 280],
    fov: 45,
    purpose: 'Installation reference'
  },
  factory: {
    position: [0, 2500, 0],
    target: [400, 0, 280],
    fov: 50,
    purpose: 'Top-down manufacturing'
  },
  cnc: {
    position: [0, 0, 2500],
    target: [0, 0, 0],
    fov: 35,
    purpose: 'Machine coordinate alignment'
  }
}
```

**Implementation:**
- Smooth camera transitions with `lerp` (300ms duration)
- OrbitControls integration
- View switching via UI buttons or keyboard shortcuts

#### MaterialSelector.tsx (Material Selection)

**Purpose:** Expandable card interface for material selection with texture previews

**Features:**
- Category tabs (Core, Surface, Edge)
- Material grid with thumbnails
- Search/filter (future)
- Apply mode (selected panel vs all panels)
- Real-time thickness preview

**State:**
- Expanded state (collapsed/expanded)
- Selected category
- Selected material

#### SortableList.tsx (Sortable List Component)

**Purpose:** Accessible, keyboard-navigable sortable list with drag-and-drop reordering

**Features:**
- Drag-and-drop reordering with smooth animations
- Full keyboard navigation support
- WCAG accessibility compliance
- Performance optimized with React.memo
- Two variants: Generic SortableList and PanelSortableList

**Keyboard Shortcuts:**
```typescript
// Generic SortableList
ArrowUp/Down    // Navigate between items
Home/End        // Jump to first/last item
Enter/Space     // Toggle completion
Delete/Backspace // Remove item

// PanelSortableList (Cabinet-specific)
ArrowUp/Down    // Select previous/next panel
Enter/Space     // Select panel
Home/End        // Jump to first/last panel
```

**Accessibility Features:**
- ARIA labels (`role="list"`, `role="listitem"`)
- `aria-selected` for panel selection state
- `aria-checked` for checkbox state
- Screen reader support with descriptive labels
- Keyboard focus indicators (blue ring)
- `tabIndex` management for focus control

**Performance Optimizations:**
- `React.memo` on list items prevents unnecessary re-renders
- `useCallback` for event handlers
- Staggered animations (`delay: index * 0.03`)
- Smooth spring transitions via motion/react

**Usage Example:**
```tsx
// Generic sortable list
<SortableList
  items={items}
  setItems={setItems}
  onCompleteItem={handleComplete}
  onRemoveItem={handleRemove}
  enableKeyboardNav={true}
  ariaLabel="Task list"
  renderItem={(item, index, onComplete, onRemove) => (
    <SortableListItem {...props} />
  )}
/>

// Panel-specific sortable list
<PanelSortableList
  panels={cabinetPanels}
  selectedId={selectedPanelId}
  onSelectPanel={setSelectedPanelId}
  onReorder={handlePanelReorder}
  enableKeyboardNav={true}
  ariaLabel="Cabinet panels"
/>
```

**Integration Points:**
- Future panel management UI (T015)
- Material favorites list (T013)
- Hardware configuration lists

**Note:** For lists >50 items, virtual scrolling (react-virtual/react-window) is recommended for optimal performance.

#### PanelConfigModal.tsx (Panel Editor)

**Purpose:** Detailed panel configuration modal

**Sections:**
1. **Dimensions:** Finish width/height display (read-only in v2.0)
2. **Core Material:** Dropdown selector
3. **Surface Materials:** Face A and Face B selectors
4. **Edge Banding:** Per-side (Top, Bottom, Left, Right) selectors
5. **Grain Direction:** Toggle HORIZONTAL/VERTICAL
6. **Computed Values:** Real thickness, cut size, area, cost display

**Actions:**
- Save changes (updates useCabinetStore)
- Cancel (discard changes)

#### GateToolbar.tsx (Safety Gate Controls)

**Purpose:** Display validation status and gate controls

**Elements:**
- Spec state indicator (DRAFT/FROZEN/RELEASED)
- Gate status badge (OK/WARNING/BLOCKED)
- Validation summary (X pass, Y warn, Z fail)
- "Run Validation" button
- "Freeze Design" button (DRAFT → FROZEN)
- "Release Design" button (FROZEN → RELEASED, requires validation pass)

#### ExportPanel.tsx (CNC Export UI)

**Purpose:** Export interface for DXF generation

**Elements:**
- Machine profile selector
- Export button (gated by spec state)
- Panel list with export status
- Export options (layers, drilling patterns)
- Export history

## Manufacturing Engine Design

### ManufacturingCalculator.ts

**Purpose:** Core manufacturing formulas

**Key Functions:**

```typescript
/**
 * Calculate real panel thickness including all layers
 *
 * Formula: T_real = T_core + T_surfaceA + T_surfaceB + (2 × T_glue)
 *
 * @param coreThickness - Core material thickness (mm)
 * @param surfaceAThickness - Face A surface thickness (mm, 0 if none)
 * @param surfaceBThickness - Face B surface thickness (mm, 0 if none)
 * @param glueThickness - Glue layer thickness per side (mm, default 0.1)
 * @returns Real thickness in mm (precision 0.1mm)
 */
function calculateRealThickness(
  coreThickness: number,
  surfaceAThickness: number,
  surfaceBThickness: number,
  glueThickness: number = 0.1
): number

/**
 * Calculate cut dimensions for CNC machine
 *
 * Formula: CutSize = FinishSize − (EdgeThickness₁ + EdgeThickness₂) + PreMill
 *
 * @param finishSize - Final dimension after edge banding (mm)
 * @param edge1Thickness - Thickness of edge on side 1 (mm, 0 if no edge)
 * @param edge2Thickness - Thickness of edge on opposite side (mm, 0 if no edge)
 * @param preMilling - Pre-milling allowance per edged side (mm, default 0.5)
 * @returns Cut size in mm (precision 0.1mm)
 */
function calculateCutSize(
  finishSize: number,
  edge1Thickness: number,
  edge2Thickness: number,
  preMilling: number = 0.5
): number

/**
 * Calculate panel cost
 *
 * @param panel - Panel with material assignments
 * @param materials - Material catalogs
 * @returns Cost in THB
 */
function calculatePanelCost(
  panel: CabinetPanel,
  materials: MaterialCatalogs
): number

/**
 * Calculate panel CO2 emissions
 *
 * @param panel - Panel with material assignments
 * @param materials - Material catalogs
 * @returns CO2 in kg
 */
function calculatePanelCO2(
  panel: CabinetPanel,
  materials: MaterialCatalogs
): number
```

**Manufacturing Constants:**
```typescript
export const MANUFACTURING_CONSTANTS = {
  GLUE_THICKNESS: 0.1,          // mm per layer
  PRE_MILLING: 0.5,             // mm per edged side
  GROOVE_DEPTH: 8,              // mm for back panel
  BACK_PANEL_VOID: 20,          // mm standard void
  SAFETY_GAP: 2,                // mm clearance
  SHELF_SETBACK_FRONT: 20,      // mm from front edge
  SHELF_SETBACK_BACK: 10,       // mm from back
  MIN_SHELF_THICKNESS: 16,      // mm for structural integrity
  MAX_SHELF_SPAN: 900,          // mm without center support
}
```

### StructuralCheck.ts

**Purpose:** Validate structural integrity

**Checks:**
1. **Shelf Span Analysis**
   - Formula: `MaxLoad = (Thickness³ × Material.Strength) / (Span² × SafetyFactor)`
   - Safety factor: 3.0
   - Warn if span > 900mm without support

2. **Joint Strength**
   - INSET joints: 70% strength vs OVERLAY
   - Validate thickness vs joint type

3. **Load Capacity**
   - Calculate max weight per shelf
   - Validate against typical use cases (books: 150kg/m², dishes: 80kg/m²)

### ToleranceEngine.ts

**Purpose:** Precision and clearance validation

**Checks:**
1. **Machine Tolerances**
   - ±0.1mm for cut dimensions
   - ±0.5mm for drilling positions
   - ±1.0mm for edge banding placement

2. **Clearance Validation**
   - Minimum 2mm gap between moving parts
   - Validate door/drawer clearances

### DXFGenerator.ts

**Purpose:** Generate CNC-ready DXF files

**Layer Convention:**
- `CUT_OUT`: Panel perimeter
- `DRILL_V_{diameter}_D{depth}`: Vertical drilling
- `DRILL_H_{diameter}_Z{center}_D{depth}`: Horizontal drilling
- `SAW_GROOVE_D{depth}`: Routing operations
- `HINGE_CUP_{size}`: Hinge cup drilling
- `ANNOTATION`: Non-cutting labels

**Implementation:**
```typescript
interface DXFLayer {
  name: string
  entities: DXFEntity[]
}

interface DXFEntity {
  type: 'LINE' | 'CIRCLE' | 'ARC' | 'TEXT'
  points: [number, number][]  // 2D coordinates
  properties: Record<string, any>
}

function generatePanelDXF(panel: CabinetPanel, face: 'A' | 'B'): DXFLayer[]
function generateCabinetDXF(cabinet: Cabinet): Map<string, DXFLayer[]>  // panelId → layers
```

**Mirror Logic:**
- Face B operations mirrored across Y-axis
- Drilling patterns adjusted for face orientation

## Validation & Safety Gate System

### Validation Rules

#### Rule Structure

```typescript
interface ValidationRule {
  id: string
  name: string
  category: 'DIMENSIONAL' | 'STRUCTURAL' | 'MATERIAL' | 'MACHINE' | 'SAFETY'
  check: (cabinet: Cabinet) => ValidationRuleResult
}

interface ValidationRuleResult {
  status: 'PASS' | 'WARN' | 'FAIL'
  message: string
  affectedPanelIds?: string[]
  suggestedFix?: string
}
```

#### Implemented Rules

| Rule ID | Category | Condition | Status | Blocker |
|---------|----------|-----------|--------|---------|
| DIM-001 | Dimensional | width < 200mm | FAIL | Yes |
| DIM-002 | Dimensional | width > 1200mm | WARN | No |
| DIM-003 | Dimensional | height < 300mm | FAIL | Yes |
| DIM-004 | Dimensional | height > 2400mm | WARN | No |
| DIM-005 | Dimensional | depth < 300mm | FAIL | Yes |
| DIM-006 | Dimensional | depth > 1000mm | WARN | No |
| STR-001 | Structural | panelCount = 0 | FAIL | Yes |
| STR-002 | Structural | cutWidth ≤ 0 or cutHeight ≤ 0 | FAIL | Yes |
| STR-003 | Structural | shelfCount > 5 | WARN | No |
| STR-004 | Structural | shelfSpan > 900mm | WARN | No |
| MAT-001 | Material | coreMaterial = null | FAIL | Yes |
| MAT-002 | Material | incompatible core/surface combo | WARN | No |
| MAC-001 | Machine | panelDimension > machine.maxDim | FAIL | Yes |
| SAF-001 | Safety | clearance < 2mm | WARN | No |

### Gate Status Logic

```typescript
interface GateStatus {
  canFreeze: boolean      // No FAIL rules in current state
  canRelease: boolean     // FROZEN && No FAIL rules
  canExport: boolean      // RELEASED
  blockers: string[]      // List of FAIL rule IDs
}

function calculateGateStatus(
  specState: SpecState,
  validationResult: ValidationResult
): GateStatus {
  const failRules = validationResult.rules.filter(r => r.status === 'FAIL')

  return {
    canFreeze: failRules.length === 0,
    canRelease: specState === 'FROZEN' && failRules.length === 0,
    canExport: specState === 'RELEASED',
    blockers: failRules.map(r => r.id)
  }
}
```

### Workflow State Machine

```
DRAFT ──[Freeze (if no FAIL rules)]──> FROZEN
  ↑                                       │
  │                                       │
  └──[Unfreeze]──────────────────────────┘
                                          │
                                          │
                                          ↓
                                     [Validate]
                                          │
                                          │
                                          ↓
                                    RELEASED ──[Export]──> DXF Files
```

**State Transitions:**
- `DRAFT → FROZEN`: Requires no FAIL rules
- `FROZEN → DRAFT`: Always allowed (unfreeze)
- `FROZEN → RELEASED`: Requires validation pass (no FAIL rules)
- `RELEASED → FROZEN`: Not allowed in v2.0 (one-way transition)

## File Organization

### Directory Structure

```
src/
├── App.tsx                             # Entry point
│
├── components/
│   ├── canvas/                         # 3D components
│   │   ├── Cabinet3D.tsx              # Main 3D rendering
│   │   ├── ViewportController.tsx     # Camera management
│   │   └── InfiniteGrid.tsx           # Ground plane
│   │
│   ├── layout/                         # App layout
│   │   ├── AppShell.tsx               # Main container
│   │   ├── DesignerIntentPanel.tsx    # Left sidebar
│   │   └── ParametricContractPanel.tsx # Right sidebar
│   │
│   ├── ui/                             # Reusable UI components
│   │   ├── MaterialSelector.tsx       # Material picker
│   │   ├── PanelConfigModal.tsx       # Panel editor
│   │   ├── GateToolbar.tsx            # Safety gate UI
│   │   ├── ExportPanel.tsx            # Export UI
│   │   ├── AnimatedNumber.tsx         # Animated counters
│   │   ├── SortableList.tsx           # Keyboard-nav sortable list (v2.1)
│   │   └── ... (15+ more components)
│   │
│   ├── materials/                      # Advanced materials
│   │   └── TriplanarMaterial.tsx      # Triplanar shader
│   │
│   ├── tools/                          # User tools
│   │   └── MeasureLayer.tsx           # Measurement overlays
│   │
│   ├── pages/                          # Full pages
│   │   └── SafetyGatePage.tsx         # Manufacturing OS dashboard
│   │
│   └── icons/                          # Custom icons
│       └── MaterialIcons.tsx          # SVG icons
│
└── core/                               # Business logic (Truth Layer)
    │
    ├── types/                          # TypeScript types
    │   ├── Cabinet.ts                 # Core data types (366 lines)
    │   └── Production.ts              # CNC operation types
    │
    ├── store/                          # Zustand stores
    │   ├── useCabinetStore.ts         # Primary store (2000+ lines)
    │   ├── useSpecStore.ts            # Validation & gates
    │   ├── useProjectStore.ts         # Save/load
    │   ├── useMeasureStore.ts         # Measurement tools
    │   ├── useToolStore.ts            # Tool state
    │   ├── useMaterialStore.ts        # Material library
    │   └── useDiagnosticsStore.ts     # Logging
    │
    ├── engines/                        # Manufacturing logic
    │   ├── ManufacturingCalculator.ts # Core formulas
    │   ├── StructuralCheck.ts         # Load validation
    │   └── ToleranceEngine.ts         # Precision checking
    │
    ├── materials/                      # Material system
    │   ├── MaterialRegistry.ts        # Catalog
    │   └── PanelMaterialSystem.ts     # Composition logic
    │
    ├── fitting/                        # Hardware system
    │   ├── FittingCatalogue.ts        # Hardware specs
    │   └── useFittingStore.ts         # Hardware state
    │
    ├── export/                         # Export logic
    │   └── DXFGenerator.ts            # DXF file generation
    │
    ├── diagnostics/                    # Debugging
    │   └── useDiagnosticsStore.ts     # Logging system
    │
    └── utils/                          # Utilities
        ├── SmartPanelUV.ts            # Texture mapping
        └── StructureUtils.ts          # Cabinet helpers
```

### Import Policy

**Core Layer:**
- Use relative imports only (no `@/` alias)
- No dependencies on `components/` layer
- Can import from other `core/` modules

**Component Layer:**
- Can import from `core/`
- Can use `@/` alias for convenience (if configured)
- Should not create circular dependencies

**Example:**
```typescript
// ✅ Good (core/)
import { Cabinet } from '../types/Cabinet'
import { useCabinetStore } from '../store/useCabinetStore'

// ✅ Good (components/)
import { Cabinet } from '@/core/types/Cabinet'
import { useCabinetStore } from '@/core/store/useCabinetStore'

// ❌ Bad (core/ importing components/)
import { Cabinet3D } from '../../components/canvas/Cabinet3D'  // NEVER
```

## Build & Deployment

### Build Configuration

**vite.config.ts:**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src'  // Optional alias
    }
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: true
  }
})
```

### Build Commands

```bash
# Development server (HMR enabled)
npm run dev

# Production build
npm run build  # → tsc && vite build

# Preview production build
npm run preview
```

### Build Output

```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js    # Main bundle (~500KB gzipped)
│   ├── vendor-[hash].js   # Dependencies (~300KB gzipped)
│   └── index-[hash].css   # Styles (~50KB gzipped)
└── textures/              # Texture assets (copied from public/)
```

## Performance Considerations

### Critical Performance Paths

1. **3D Rendering**
   - Target: 60 FPS
   - Optimization: Geometry instancing (future)
   - Texture loading: Lazy with caching

2. **State Updates**
   - Dimension change → Panel recalculation: <100ms
   - Material change → 3D update: <200ms
   - Validation run: <500ms

3. **Auto-Save**
   - Debounce: 2 seconds
   - Batch updates to localStorage
   - Background serialization

### Bundle Size Optimization

- Code splitting by route (future)
- Tree-shaking via ESM
- Lazy load modals and panels
- Image optimization (WebP for textures)

### Memory Management

- Dispose Three.js geometries and materials on unmount
- Limit texture cache size (50 textures max)
- Clear diagnostics log periodically

## Testing Strategy

### Unit Tests (Critical)

**Manufacturing Calculations:**
```typescript
describe('ManufacturingCalculator', () => {
  describe('calculateRealThickness', () => {
    it('should calculate thickness correctly with dual surfaces')
    it('should handle no surfaces (core only)')
    it('should account for glue layers')
  })

  describe('calculateCutSize', () => {
    it('should calculate cut size with edges on both sides')
    it('should handle no edges')
    it('should apply pre-milling')
    it('should return negative if edge thickness exceeds finish size')
  })
})
```

**Validation Rules:**
```typescript
describe('ValidationRules', () => {
  it('should FAIL when width < 200mm')
  it('should WARN when width > 1200mm')
  it('should FAIL when cutSize <= 0')
  it('should PASS when all constraints met')
})
```

### Integration Tests

- Panel generation from cabinet config
- Material assignment propagation
- Gate status calculation
- Project save/load roundtrip

### E2E Tests (Future)

- Create cabinet → Edit → Validate → Export
- Material selector flow
- Panel configuration flow

## Security Considerations

### Data Storage

- LocalStorage only (no server)
- No user authentication required in v2.0
- No sensitive data (all business data)

### Input Validation

- Dimension inputs: Numeric bounds checking
- Material IDs: Validate against catalog
- File imports: JSON schema validation

### XSS Prevention

- React auto-escapes content
- No `dangerouslySetInnerHTML` usage
- Texture URLs sanitized before loading

## Browser Compatibility

### Requirements

- **Chrome:** 90+ (recommended)
- **Firefox:** 88+
- **Safari:** 14+
- **Edge:** 90+

### Feature Dependencies

- WebGL 2.0 (for Three.js)
- ES2020 features (optional chaining, nullish coalescing)
- LocalStorage (minimum 10MB)
- Web Workers (future for heavy calculations)

### Polyfills

None required for target browsers.

## Deployment

### Static Hosting

Compatible with:
- Vercel
- Netlify
- GitHub Pages
- AWS S3 + CloudFront
- Any static file server

### Configuration

**Environment Variables (future):**
```env
VITE_API_URL=https://api.monolith.com  # Future backend
VITE_TEXTURE_CDN=https://cdn.monolith.com/textures
```

### Deployment Steps

1. `npm run build`
2. Upload `dist/` folder to hosting
3. Configure SPA fallback (`index.html` for all routes)
4. Set cache headers (1 year for assets, no-cache for `index.html`)

## Monitoring & Diagnostics

### Diagnostics Store

**useDiagnosticsStore:**
- Log all state changes
- Track performance metrics (render time, validation time)
- Capture errors with context
- Export diagnostic report as JSON

### Error Handling

- Try-catch around critical operations
- Graceful degradation (e.g., texture load failure)
- User-friendly error messages
- Technical details in diagnostics log

## Future Enhancements (Post v2.0)

### Phase 2 (v2.1)
1. **Cut Optimization**: Nest panels on sheet materials
2. **Advanced Hardware**: Drawer boxes, complex lifts
3. **Multi-Machine Export**: Machine-specific DXF variants

### Phase 3 (v2.2)
1. **Collaboration**: Cloud sync, multi-user editing
2. **Advanced Validation**: FEA simulation for load analysis
3. **Cost Optimization**: Material substitution suggestions

### Phase 4 (v3.0)
1. **Multi-Room Planning**: Full kitchen layout
2. **AR Visualization**: Mobile AR preview
3. **Supplier Integration**: Direct material ordering

## Conclusion

This implementation plan provides a comprehensive blueprint for the MONOLITH Designer Workspace v2.0. The architecture prioritizes:

1. **Separation of Concerns**: Visual (magic) vs Manufacturing (truth)
2. **Type Safety**: TypeScript throughout critical paths
3. **Manufacturing Accuracy**: Formula-driven calculations
4. **Extensibility**: Modular catalogs and validation rules
5. **User Experience**: Real-time feedback and intuitive controls

The plan balances current implementation (v2.0) with future extensibility, ensuring the system can grow while maintaining its core architectural principles.

---

**Document Version:** 1.0
**Created:** 2026-01-09
**Last Updated:** 2026-01-09
**Author:** Claude (via Spec Kit Analysis)
**Status:** DRAFT
