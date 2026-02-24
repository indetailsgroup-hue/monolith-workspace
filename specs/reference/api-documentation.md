# API Documentation & Interface Reference

**Project:** MONOLITH Designer Workspace v2.0
**Document Version:** 1.0
**Date:** 2026-01-10
**Status:** Active

---

## Table of Contents

1. [Overview](#overview)
2. [Zustand Store API](#zustand-store-api)
3. [React Components API](#react-components-api)
4. [3D Component Props](#3d-component-props)
5. [Type Definitions](#type-definitions)
6. [Utility Functions](#utility-functions)
7. [Event Handlers](#event-handlers)
8. [Manufacturing Engine API](#manufacturing-engine-api)
9. [Export APIs](#export-apis)
10. [Constants & Enums](#constants--enums)

---

## 1. Overview

This document provides a comprehensive reference for all public APIs, interfaces, and type definitions in the MONOLITH Designer Workspace application.

### 1.1 Architecture Overview

```
┌─────────────────────────────────────────┐
│         React Components (UI)           │
│   (Designer Panel, Material Selector)   │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│      Zustand Store (State Management)   │
│     (useCabinetStore, Cabinet State)    │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│    Manufacturing Engines (Business Logic)│
│  (Dimension, Cost, Environmental Impact) │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│       Export APIs (DXF, JSON, PDF)      │
└─────────────────────────────────────────┘
```

---

## 2. Zustand Store API

### 2.1 `useCabinetStore`

Main state management store for cabinet design.

#### Store State

```typescript
interface CabinetStore {
  // ============================================
  // STATE
  // ============================================

  /** Current cabinet design */
  cabinet: Cabinet | null

  /** Selected panel ID for editing */
  selectedPanelId: string | null

  /** Available materials */
  coreMaterials: Record<string, CoreMaterial>
  surfaceMaterials: Record<string, SurfaceMaterial>
  edgeMaterials: Record<string, EdgeMaterial>

  /** Manufacturing calculations cache */
  calculations: {
    cost: number
    co2: number
    totalArea: number
    lastUpdated: number
  }

  /** Validation errors */
  errors: ValidationError[]

  // ============================================
  // ACTIONS
  // ============================================

  /** Initialize new cabinet project */
  initCabinet: (type: CabinetType) => void

  /** Load cabinet from JSON */
  loadCabinet: (data: Cabinet) => void

  /** Update cabinet dimensions */
  setDimensions: (dimensions: Partial<Dimensions>) => void

  /** Select a panel for editing */
  selectPanel: (panelId: string | null) => void

  /** Set default materials */
  setDefaultCore: (materialId: string) => void
  setDefaultSurface: (materialId: string) => void
  setDefaultEdge: (materialId: string) => void

  /** Panel-specific material override */
  setPanelCore: (panelId: string, materialId: string) => void
  setPanelSurface: (panelId: string, side: PanelSide, materialId: string) => void
  setPanelEdge: (panelId: string, edge: EdgeSide, materialId: string) => void

  /** Recalculate manufacturing data */
  recalculate: () => void

  /** Validate design against manufacturing constraints */
  validate: () => ValidationError[]

  /** Export cabinet data */
  exportToJSON: () => string
  exportToDXF: () => Promise<Blob>

  /** Undo/Redo */
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}
```

#### Usage Examples

**Initialize a new cabinet:**

```typescript
import { useCabinetStore } from './store/useCabinetStore'

function NewProjectButton() {
  const initCabinet = useCabinetStore(s => s.initCabinet)

  const handleClick = () => {
    initCabinet('UPPER') // or 'BASE', 'TALL'
  }

  return <button onClick={handleClick}>New Cabinet</button>
}
```

**Update dimensions:**

```typescript
function DimensionInput() {
  const width = useCabinetStore(s => s.cabinet?.dimensions.width || 600)
  const setDimensions = useCabinetStore(s => s.setDimensions)

  return (
    <input
      type="number"
      value={width}
      onChange={e => setDimensions({ width: parseInt(e.target.value) })}
    />
  )
}
```

**Change materials:**

```typescript
function MaterialSelector() {
  const setDefaultSurface = useCabinetStore(s => s.setDefaultSurface)

  return (
    <button onClick={() => setDefaultSurface('melamine-white')}>
      Apply White Melamine
    </button>
  )
}
```

**Get calculations:**

```typescript
function CostDisplay() {
  const cost = useCabinetStore(s => s.calculations.cost)
  const co2 = useCabinetStore(s => s.calculations.co2)

  return (
    <div>
      <p>Cost: ฿{cost.toFixed(2)}</p>
      <p>CO2: {co2.toFixed(2)} kg</p>
    </div>
  )
}
```

### 2.2 Selector Best Practices

**❌ Bad: Re-renders on any state change**
```typescript
function MyComponent() {
  const store = useCabinetStore() // Gets entire store!
  return <div>{store.cabinet?.dimensions.width}</div>
}
```

**✅ Good: Only re-renders when width changes**
```typescript
function MyComponent() {
  const width = useCabinetStore(s => s.cabinet?.dimensions.width)
  return <div>{width}</div>
}
```

**✅ Better: Multiple selectors**
```typescript
function MyComponent() {
  const width = useCabinetStore(s => s.cabinet?.dimensions.width)
  const height = useCabinetStore(s => s.cabinet?.dimensions.height)
  const setDimensions = useCabinetStore(s => s.setDimensions)

  return (
    <div>
      <input value={width} onChange={e => setDimensions({ width: +e.target.value })} />
      <input value={height} onChange={e => setDimensions({ height: +e.target.value })} />
    </div>
  )
}
```

---

## 3. React Components API

### 3.1 `<Cabinet3D>`

Main 3D visualization component.

#### Props

```typescript
interface Cabinet3DProps {
  /** Show dimension labels (toggle with D key) */
  showDimensions?: boolean

  /** Hide tooltip on hover */
  hideTooltip?: boolean

  /** Custom camera position */
  cameraPosition?: [number, number, number]

  /** Camera preset */
  cameraPreset?: 'perspective' | 'front' | 'left' | 'top' | 'install' | 'factory' | 'cnc'

  /** Callback when panel is clicked */
  onPanelClick?: (panelId: string) => void

  /** Callback when panel is hovered */
  onPanelHover?: (panelId: string | null) => void
}
```

#### Usage

```tsx
import { Cabinet3D } from './components/canvas/Cabinet3D'

function App() {
  const [showDims, setShowDims] = useState(false)

  return (
    <Canvas>
      <Cabinet3D
        showDimensions={showDims}
        cameraPreset="perspective"
        onPanelClick={(id) => console.log('Clicked:', id)}
      />
    </Canvas>
  )
}
```

### 3.2 `<MaterialSelector>`

Material selection UI component.

#### Props

```typescript
interface MaterialSelectorProps {
  /** Material category to display */
  category: 'core' | 'surface' | 'edge'

  /** Available materials */
  materials: Record<string, Material>

  /** Currently selected material ID */
  selectedId: string

  /** Callback when material is selected */
  onSelect: (materialId: string) => void

  /** Show search/filter */
  showSearch?: boolean

  /** Show favorites */
  showFavorites?: boolean
}
```

#### Usage

```tsx
import { MaterialSelector } from './components/ui/MaterialSelector'

function MaterialPanel() {
  const surfaceMaterials = useCabinetStore(s => s.surfaceMaterials)
  const selectedId = useCabinetStore(s => s.cabinet?.materials.defaultSurface || '')
  const setDefaultSurface = useCabinetStore(s => s.setDefaultSurface)

  return (
    <MaterialSelector
      category="surface"
      materials={surfaceMaterials}
      selectedId={selectedId}
      onSelect={setDefaultSurface}
      showSearch={true}
    />
  )
}
```

### 3.3 `<DesignerIntentPanel>`

Main design control panel.

#### Props

```typescript
interface DesignerIntentPanelProps {
  /** Panel position */
  position?: 'left' | 'right'

  /** Collapsible sections */
  collapsible?: boolean

  /** Default expanded section */
  defaultSection?: 'dimensions' | 'materials' | 'hardware' | 'export'
}
```

#### Usage

```tsx
import { DesignerIntentPanel } from './components/layout/DesignerIntentPanel'

function App() {
  return (
    <div className="app">
      <DesignerIntentPanel
        position="left"
        collapsible={true}
        defaultSection="dimensions"
      />
      <Canvas>
        <Cabinet3D />
      </Canvas>
    </div>
  )
}
```

### 3.4 `<ViewportController>`

Camera preset controller.

#### Props

```typescript
interface ViewportControllerProps {
  /** Camera transition duration (ms) */
  transitionDuration?: number

  /** Show preset buttons */
  showButtons?: boolean

  /** Custom preset definitions */
  customPresets?: Record<string, CameraPreset>
}

interface CameraPreset {
  position: [number, number, number]
  target: [number, number, number]
  fov?: number
}
```

#### Usage

```tsx
import { ViewportController } from './components/canvas/ViewportController'

<Canvas>
  <ViewportController
    transitionDuration={300}
    showButtons={true}
    customPresets={{
      myView: {
        position: [10, 5, 10],
        target: [0, 0, 0]
      }
    }}
  />
</Canvas>
```

---

## 4. 3D Component Props

### 4.1 `<Panel3D>`

Individual cabinet panel renderer.

#### Props

```typescript
interface Panel3DProps {
  /** Panel data */
  panel: Panel

  /** Is this panel selected? */
  isSelected: boolean

  /** Materials lookup */
  coreMaterials: Record<string, CoreMaterial>
  surfaceMaterials: Record<string, SurfaceMaterial>
  edgeMaterials: Record<string, EdgeMaterial>

  /** Click handler */
  onClick?: () => void

  /** Hover handlers */
  onPointerOver?: () => void
  onPointerOut?: () => void
}
```

#### Usage

```tsx
import { Panel3D } from './components/canvas/Panel3D'

function CabinetPanels() {
  const cabinet = useCabinet()
  const selectedId = useCabinetStore(s => s.selectedPanelId)
  const selectPanel = useCabinetStore(s => s.selectPanel)

  return (
    <group>
      {cabinet.panels.map(panel => (
        <Panel3D
          key={panel.id}
          panel={panel}
          isSelected={panel.id === selectedId}
          onClick={() => selectPanel(panel.id)}
        />
      ))}
    </group>
  )
}
```

---

## 5. Type Definitions

### 5.1 Core Types

#### Cabinet

```typescript
interface Cabinet {
  id: string
  type: CabinetType
  version: string
  dimensions: Dimensions
  materials: MaterialStack
  panels: Panel[]
  hardware: Hardware[]
  metadata: Metadata
  createdAt: number
  updatedAt: number
}

type CabinetType = 'UPPER' | 'BASE' | 'TALL' | 'WALL' | 'CUSTOM'
```

#### Dimensions

```typescript
interface Dimensions {
  /** Width in millimeters */
  width: number

  /** Height in millimeters */
  height: number

  /** Depth in millimeters */
  depth: number

  /** Constraints */
  constraints?: {
    minWidth?: number
    maxWidth?: number
    minHeight?: number
    maxHeight?: number
    minDepth?: number
    maxDepth?: number
  }
}
```

#### Panel

```typescript
interface Panel {
  id: string
  role: PanelRole
  dimensions: {
    width: number
    height: number
    thickness: number
  }
  position: {
    x: number
    y: number
    z: number
  }
  rotation: {
    x: number
    y: number
    z: number
  }
  materials: {
    core: string
    surfaces: {
      front: string
      back: string
    }
    edges: {
      top: string
      bottom: string
      left: string
      right: string
    }
  }
  operations: Operation[]
}

type PanelRole =
  | 'TOP'
  | 'BOTTOM'
  | 'LEFT'
  | 'RIGHT'
  | 'BACK'
  | 'SHELF'
  | 'DIVIDER'
  | 'DOOR'
  | 'DRAWER_FRONT'
```

#### Materials

```typescript
interface CoreMaterial {
  id: string
  name: string
  type: 'PARTICLEBOARD' | 'MDF' | 'PLYWOOD'
  thickness: number // mm
  density: number // kg/m³
  color: string // hex
  costPerSqm: number // THB
  co2PerKg: number
}

interface SurfaceMaterial {
  id: string
  name: string
  type: 'MELAMINE' | 'HPL' | 'FENIX' | 'VENEER' | 'LACQUER'
  thickness: number // mm
  color: string
  textureUrl?: string
  normalMapUrl?: string
  roughness: number // 0-1
  metalness: number // 0-1
  costPerSqm: number
  co2PerSqm: number
}

interface EdgeMaterial {
  id: string
  name: string
  type: 'PVC' | 'ABS' | 'WOOD' | 'ALUMINUM'
  thickness: number // mm
  color: string
  textureUrl?: string
  costPerMeter: number
  co2PerMeter: number
}
```

### 5.2 Manufacturing Types

#### Operation

```typescript
interface Operation {
  id: string
  type: OperationType
  position: { x: number; y: number }
  dimensions?: { width: number; height: number; depth: number }
  parameters: Record<string, any>
}

type OperationType =
  | 'DRILL' // Drilling (hinge holes, shelf pins)
  | 'GROOVE' // Groove/Dado (for back panel, shelves)
  | 'CUT' // Custom cuts (notches, angles)
  | 'EDGE_BAND' // Edge banding (specified separately per edge)
```

#### DrillingPattern

```typescript
interface DrillingPattern {
  type: 'HINGE' | 'SHELF_PIN' | 'DOWEL' | 'CONFIRMAT' | 'CUSTOM'
  holes: Hole[]
}

interface Hole {
  position: { x: number; y: number }
  diameter: number // mm
  depth: number // mm
  throughHole: boolean
}
```

### 5.3 Calculation Types

```typescript
interface CostBreakdown {
  materials: {
    core: number
    surface: number
    edge: number
  }
  operations: {
    cutting: number
    drilling: number
    edgeBanding: number
  }
  hardware: number
  labor: number
  overhead: number
  total: number
  currency: 'THB'
}

interface EnvironmentalImpact {
  co2Total: number // kg CO2e
  breakdown: {
    materials: number
    manufacturing: number
    transport: number
  }
  treesEquivalent: number
}
```

---

## 6. Utility Functions

### 6.1 Dimension Utilities

```typescript
/**
 * Convert millimeters to Three.js units (1 unit = 1mm)
 */
export function mmToUnits(mm: number): number {
  return mm / 1000
}

/**
 * Convert Three.js units to millimeters
 */
export function unitsToMm(units: number): number {
  return units * 1000
}

/**
 * Validate dimension against constraints
 */
export function validateDimension(
  value: number,
  constraints: { min?: number; max?: number }
): { valid: boolean; error?: string } {
  if (constraints.min !== undefined && value < constraints.min) {
    return { valid: false, error: `Minimum value is ${constraints.min}mm` }
  }
  if (constraints.max !== undefined && value > constraints.max) {
    return { valid: false, error: `Maximum value is ${constraints.max}mm` }
  }
  return { valid: true }
}
```

### 6.2 Material Utilities

```typescript
/**
 * Load texture with caching
 */
export async function loadTexture(url: string): Promise<THREE.Texture> {
  const loader = new THREE.TextureLoader()
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject)
  })
}

/**
 * Calculate total material area
 */
export function calculatePanelArea(panel: Panel): number {
  const { width, height } = panel.dimensions
  return (width * height) / 1_000_000 // Convert mm² to m²
}

/**
 * Calculate edge banding length
 */
export function calculateEdgeLength(panel: Panel): number {
  const { width, height } = panel.dimensions
  return (width * 2 + height * 2) / 1000 // Convert mm to m
}
```

### 6.3 Validation Utilities

```typescript
/**
 * Validate entire cabinet design
 */
export function validateCabinet(cabinet: Cabinet): ValidationError[] {
  const errors: ValidationError[] = []

  // Dimension checks
  if (cabinet.dimensions.width < 300 || cabinet.dimensions.width > 1200) {
    errors.push({
      type: 'DIMENSION',
      severity: 'ERROR',
      message: 'Width must be between 300-1200mm'
    })
  }

  // Material checks
  cabinet.panels.forEach(panel => {
    if (!panel.materials.core) {
      errors.push({
        type: 'MATERIAL',
        severity: 'ERROR',
        message: `Panel ${panel.id} missing core material`,
        panelId: panel.id
      })
    }
  })

  return errors
}

interface ValidationError {
  type: 'DIMENSION' | 'MATERIAL' | 'HARDWARE' | 'MANUFACTURING'
  severity: 'ERROR' | 'WARNING' | 'INFO'
  message: string
  panelId?: string
  field?: string
}
```

---

## 7. Event Handlers

### 7.1 3D Interaction Events

```typescript
/**
 * Handle panel selection via raycasting
 */
export function usePanelSelection() {
  const selectPanel = useCabinetStore(s => s.selectPanel)

  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    const panelId = event.object.userData.panelId
    if (panelId) {
      selectPanel(panelId)
    }
  }, [selectPanel])

  return { handlePointerDown }
}

/**
 * Handle hover effects
 */
export function useHoverEffect() {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const handlePointerOver = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    const panelId = event.object.userData.panelId
    setHoveredId(panelId)
    document.body.style.cursor = 'pointer'
  }, [])

  const handlePointerOut = useCallback(() => {
    setHoveredId(null)
    document.body.style.cursor = 'default'
  }, [])

  return { hoveredId, handlePointerOver, handlePointerOut }
}
```

### 7.2 Keyboard Shortcuts

```typescript
/**
 * Global keyboard shortcuts
 */
export function useKeyboardShortcuts() {
  const undo = useCabinetStore(s => s.undo)
  const redo = useCabinetStore(s => s.redo)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
      }

      // Delete: Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Delete selected panel or hardware
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])
}
```

---

## 8. Manufacturing Engine API

### 8.1 Dimension Engine

```typescript
/**
 * Calculate panel dimensions based on cabinet dimensions and constraints
 */
export class DimensionEngine {
  calculatePanelDimensions(
    cabinetDimensions: Dimensions,
    panelRole: PanelRole,
    materialThickness: number
  ): { width: number; height: number; thickness: number } {
    // Implementation in src/core/engines/DimensionEngine.ts
  }

  validateDimensions(dimensions: Dimensions): ValidationError[] {
    // Check against manufacturing constraints
  }
}
```

### 8.2 Cost Engine

```typescript
/**
 * Calculate manufacturing cost
 */
export class CostEngine {
  calculateCost(cabinet: Cabinet): CostBreakdown {
    // Implementation in src/core/engines/CostEngine.ts
  }

  getMaterialCost(panel: Panel, materials: Materials): number {
    // Calculate material cost for single panel
  }

  getOperationCost(operations: Operation[]): number {
    // Calculate CNC operation cost
  }
}
```

### 8.3 Environmental Engine

```typescript
/**
 * Calculate environmental impact
 */
export class EnvironmentalEngine {
  calculateCO2(cabinet: Cabinet): EnvironmentalImpact {
    // Implementation in src/core/engines/EnvironmentalEngine.ts
  }

  getMaterialCO2(panel: Panel, materials: Materials): number {
    // Calculate CO2 for single panel materials
  }
}
```

---

## 9. Export APIs

### 9.1 JSON Export

```typescript
/**
 * Export cabinet to JSON
 */
export function exportToJSON(cabinet: Cabinet): string {
  return JSON.stringify(cabinet, null, 2)
}

/**
 * Import cabinet from JSON
 */
export function importFromJSON(json: string): Cabinet {
  const data = JSON.parse(json)
  // Validate schema
  return data as Cabinet
}
```

### 9.2 DXF Export

```typescript
/**
 * Export cabinet panels to DXF format for CNC
 */
export async function exportToDXF(cabinet: Cabinet): Promise<Blob> {
  const dxf = new DXFWriter()

  // Add each panel
  cabinet.panels.forEach(panel => {
    dxf.addLayer(panel.id, panel.role)
    dxf.addRectangle(
      0, 0,
      panel.dimensions.width,
      panel.dimensions.height
    )

    // Add drilling operations
    panel.operations
      .filter(op => op.type === 'DRILL')
      .forEach(op => {
        dxf.addCircle(op.position.x, op.position.y, op.dimensions!.width / 2)
      })
  })

  return dxf.toBlob()
}
```

---

## 10. Constants & Enums

### 10.1 Manufacturing Constants

```typescript
export const MANUFACTURING_CONSTRAINTS = {
  DIMENSIONS: {
    MIN_WIDTH: 300, // mm
    MAX_WIDTH: 1200,
    MIN_HEIGHT: 300,
    MAX_HEIGHT: 2400,
    MIN_DEPTH: 300,
    MAX_DEPTH: 600
  },
  MATERIALS: {
    CORE_THICKNESSES: [16, 18, 25], // mm
    MIN_EDGE_THICKNESS: 0.4, // mm
    MAX_EDGE_THICKNESS: 3.0
  },
  OPERATIONS: {
    MIN_DRILL_DIAMETER: 5, // mm
    MAX_DRILL_DIAMETER: 35,
    MIN_EDGE_DISTANCE: 10 // mm from panel edge
  }
} as const
```

### 10.2 Camera Presets

```typescript
export const CAMERA_PRESETS = {
  perspective: {
    position: [5, 5, 5],
    target: [0, 0, 0],
    fov: 50
  },
  front: {
    position: [0, 0, 10],
    target: [0, 0, 0],
    fov: 50
  },
  left: {
    position: [-10, 0, 0],
    target: [0, 0, 0],
    fov: 50
  },
  top: {
    position: [0, 10, 0],
    target: [0, 0, 0],
    fov: 50
  },
  install: {
    position: [3, 2, 5],
    target: [0, 1, 0],
    fov: 50
  },
  factory: {
    position: [0, 10, 0],
    target: [0, 0, 0],
    fov: 50
  },
  cnc: {
    position: [0, 5, 0],
    target: [0, 0, 0],
    fov: 30
  }
} as const
```

---

## 11. Hooks Reference

### 11.1 Custom React Hooks

```typescript
/**
 * Get current cabinet data
 */
export function useCabinet(): Cabinet | null {
  return useCabinetStore(s => s.cabinet)
}

/**
 * Get selected panel
 */
export function useSelectedPanel(): Panel | null {
  const cabinet = useCabinet()
  const selectedId = useCabinetStore(s => s.selectedPanelId)
  return cabinet?.panels.find(p => p.id === selectedId) || null
}

/**
 * Get material by ID
 */
export function useMaterial(
  category: 'core' | 'surface' | 'edge',
  materialId: string
): Material | null {
  return useCabinetStore(s => {
    const materials = category === 'core' ? s.coreMaterials :
                      category === 'surface' ? s.surfaceMaterials :
                      s.edgeMaterials
    return materials[materialId] || null
  })
}

/**
 * Get validation errors
 */
export function useValidation(): ValidationError[] {
  return useCabinetStore(s => s.errors)
}
```

---

## 12. Error Handling

### 12.1 Error Types

```typescript
export class CabinetError extends Error {
  constructor(
    public code: string,
    message: string,
    public context?: Record<string, any>
  ) {
    super(message)
    this.name = 'CabinetError'
  }
}

export class ValidationError extends CabinetError {
  constructor(message: string, field?: string) {
    super('VALIDATION_ERROR', message, { field })
    this.name = 'ValidationError'
  }
}

export class ExportError extends CabinetError {
  constructor(message: string, format: string) {
    super('EXPORT_ERROR', message, { format })
    this.name = 'ExportError'
  }
}
```

---

## 13. Testing Utilities

### 13.1 Mock Data Generators

```typescript
/**
 * Generate mock cabinet for testing
 */
export function createMockCabinet(overrides?: Partial<Cabinet>): Cabinet {
  return {
    id: 'test-cabinet-1',
    type: 'UPPER',
    version: '2.0',
    dimensions: { width: 600, height: 720, depth: 350 },
    materials: {
      defaultCore: 'pb-18',
      defaultSurface: 'melamine-white',
      defaultEdge: 'pvc-white'
    },
    panels: [],
    hardware: [],
    metadata: {
      name: 'Test Cabinet',
      description: 'Mock cabinet for testing',
      tags: ['test']
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  }
}
```

---

**Document Control:**
- **Version:** 1.0
- **Last Updated:** 2026-01-10
- **Next Review:** 2026-04-10
- **Owner:** MONOLITH Technical Team
- **Status:** ✅ Active
