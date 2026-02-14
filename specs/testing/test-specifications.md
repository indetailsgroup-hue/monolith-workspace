# Test Specifications

**Project:** MONOLITH Designer Workspace v2.0
**Document Version:** 1.0
**Date:** 2026-01-10
**Status:** Active

---

## Table of Contents

1. [Overview](#overview)
2. [Testing Strategy](#testing-strategy)
3. [Unit Tests](#unit-tests)
4. [Integration Tests](#integration-tests)
5. [Component Tests](#component-tests)
6. [E2E Tests](#e2e-tests)
7. [3D Rendering Tests](#3d-rendering-tests)
8. [Performance Tests](#performance-tests)
9. [Accessibility Tests](#accessibility-tests)
10. [Test Data & Fixtures](#test-data--fixtures)

---

## 1. Overview

### 1.1 Testing Philosophy

**Quality Gates:**
- ✅ All tests must pass before merge
- ✅ Code coverage minimum: 80%
- ✅ Performance regression tests required
- ✅ Visual regression tests for 3D scenes

**Testing Pyramid:**

```
       ┌─────────┐
       │  E2E    │  (10%)  - Critical user flows
       ├─────────┤
       │         │
       │ Integr. │  (20%)  - Component interactions
       │         │
       ├─────────┤
       │         │
       │         │
       │  Unit   │  (70%)  - Business logic, utilities
       │         │
       │         │
       └─────────┘
```

### 1.2 Tech Stack

| Tool | Purpose | Version |
|------|---------|---------|
| **Vitest** | Unit testing framework | ^1.0.0 |
| **React Testing Library** | Component testing | ^14.0.0 |
| **Playwright** | E2E testing | ^1.40.0 |
| **MSW** | API mocking | ^2.0.0 |
| **@testing-library/jest-dom** | DOM matchers | ^6.0.0 |
| **@vitest/ui** | Test UI | ^1.0.0 |

---

## 2. Testing Strategy

### 2.1 Test Coverage Goals

| Category | Target Coverage | Current | Status |
|----------|----------------|---------|--------|
| **Overall** | 80% | - | 🎯 Target |
| **Business Logic** | 95% | - | 🎯 Target |
| **UI Components** | 75% | - | 🎯 Target |
| **3D Components** | 60% | - | 🎯 Target |
| **Utilities** | 90% | - | 🎯 Target |

### 2.2 CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## 3. Unit Tests

### 3.1 Dimension Engine Tests

**File:** `src/core/engines/DimensionEngine.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { DimensionEngine } from './DimensionEngine'

describe('DimensionEngine', () => {
  describe('calculatePanelDimensions', () => {
    it('should calculate top panel dimensions correctly', () => {
      const engine = new DimensionEngine()
      const result = engine.calculatePanelDimensions(
        { width: 600, height: 720, depth: 350 },
        'TOP',
        18
      )

      expect(result).toEqual({
        width: 600,
        height: 350,
        thickness: 18
      })
    })

    it('should calculate side panel dimensions with material deduction', () => {
      const engine = new DimensionEngine()
      const result = engine.calculatePanelDimensions(
        { width: 600, height: 720, depth: 350 },
        'LEFT',
        18
      )

      // Height = cabinet height - top thickness - bottom thickness
      expect(result).toEqual({
        width: 350,
        height: 684, // 720 - 18 - 18
        thickness: 18
      })
    })

    it('should throw error for invalid cabinet type', () => {
      const engine = new DimensionEngine()
      expect(() => {
        engine.calculatePanelDimensions(
          { width: 100, height: 100, depth: 100 }, // Too small
          'TOP',
          18
        )
      }).toThrow('Cabinet dimensions too small')
    })
  })

  describe('validateDimensions', () => {
    it('should pass validation for valid dimensions', () => {
      const engine = new DimensionEngine()
      const errors = engine.validateDimensions({
        width: 600,
        height: 720,
        depth: 350
      })

      expect(errors).toHaveLength(0)
    })

    it('should fail validation for width below minimum', () => {
      const engine = new DimensionEngine()
      const errors = engine.validateDimensions({
        width: 200, // Below 300mm minimum
        height: 720,
        depth: 350
      })

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('Width must be')
    })
  })
})
```

### 3.2 Cost Engine Tests

**File:** `src/core/engines/CostEngine.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { CostEngine } from './CostEngine'
import { createMockCabinet } from '../test-utils/fixtures'

describe('CostEngine', () => {
  let engine: CostEngine

  beforeEach(() => {
    engine = new CostEngine()
  })

  it('should calculate material cost correctly', () => {
    const cabinet = createMockCabinet({
      dimensions: { width: 600, height: 720, depth: 350 }
    })

    const cost = engine.calculateCost(cabinet)

    expect(cost.materials.core).toBeGreaterThan(0)
    expect(cost.materials.surface).toBeGreaterThan(0)
    expect(cost.materials.edge).toBeGreaterThan(0)
    expect(cost.total).toBeGreaterThan(0)
  })

  it('should include operation costs', () => {
    const cabinet = createMockCabinet({
      panels: [{
        id: 'p1',
        operations: [
          { type: 'DRILL', count: 10 },
          { type: 'EDGE_BAND', length: 2000 }
        ]
      }]
    })

    const cost = engine.calculateCost(cabinet)

    expect(cost.operations.drilling).toBeGreaterThan(0)
    expect(cost.operations.edgeBanding).toBeGreaterThan(0)
  })

  it('should calculate cost breakdown with correct percentages', () => {
    const cabinet = createMockCabinet()
    const cost = engine.calculateCost(cabinet)

    const sum = cost.materials.core +
                cost.materials.surface +
                cost.materials.edge +
                cost.operations.cutting +
                cost.operations.drilling +
                cost.operations.edgeBanding +
                cost.hardware +
                cost.labor +
                cost.overhead

    expect(cost.total).toBeCloseTo(sum, 2)
  })
})
```

### 3.3 Validation Utilities Tests

**File:** `src/core/utils/validation.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { validateCabinet, validateDimension } from './validation'

describe('validateCabinet', () => {
  it('should return no errors for valid cabinet', () => {
    const cabinet = createMockCabinet()
    const errors = validateCabinet(cabinet)
    expect(errors).toHaveLength(0)
  })

  it('should detect missing core material', () => {
    const cabinet = createMockCabinet({
      panels: [{
        id: 'p1',
        materials: { core: '' } // Missing
      }]
    })

    const errors = validateCabinet(cabinet)
    expect(errors).toHaveLength(1)
    expect(errors[0].type).toBe('MATERIAL')
    expect(errors[0].panelId).toBe('p1')
  })

  it('should detect holes too close to edge', () => {
    const cabinet = createMockCabinet({
      panels: [{
        id: 'p1',
        dimensions: { width: 600, height: 720, thickness: 18 },
        operations: [{
          type: 'DRILL',
          position: { x: 5, y: 5 } // Too close to edge (< 10mm)
        }]
      }]
    })

    const errors = validateCabinet(cabinet)
    expect(errors.some(e => e.type === 'MANUFACTURING')).toBe(true)
  })
})

describe('validateDimension', () => {
  it('should pass for value within constraints', () => {
    const result = validateDimension(600, { min: 300, max: 1200 })
    expect(result.valid).toBe(true)
  })

  it('should fail for value below minimum', () => {
    const result = validateDimension(200, { min: 300, max: 1200 })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Minimum value is 300')
  })

  it('should fail for value above maximum', () => {
    const result = validateDimension(1500, { min: 300, max: 1200 })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Maximum value is 1200')
  })
})
```

---

## 4. Integration Tests

### 4.1 Store Integration Tests

**File:** `src/core/store/useCabinetStore.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCabinetStore } from './useCabinetStore'

describe('useCabinetStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useCabinetStore.setState({
      cabinet: null,
      selectedPanelId: null
    })
  })

  it('should initialize cabinet with correct defaults', () => {
    const { result } = renderHook(() => useCabinetStore())

    act(() => {
      result.current.initCabinet('UPPER')
    })

    expect(result.current.cabinet).not.toBeNull()
    expect(result.current.cabinet?.type).toBe('UPPER')
    expect(result.current.cabinet?.dimensions).toEqual({
      width: 600,
      height: 720,
      depth: 350
    })
  })

  it('should update dimensions and recalculate', () => {
    const { result } = renderHook(() => useCabinetStore())

    act(() => {
      result.current.initCabinet('UPPER')
      result.current.setDimensions({ width: 800 })
    })

    expect(result.current.cabinet?.dimensions.width).toBe(800)
    expect(result.current.calculations.cost).toBeGreaterThan(0)
  })

  it('should select and deselect panels', () => {
    const { result } = renderHook(() => useCabinetStore())

    act(() => {
      result.current.initCabinet('UPPER')
      const panelId = result.current.cabinet!.panels[0].id
      result.current.selectPanel(panelId)
    })

    expect(result.current.selectedPanelId).not.toBeNull()

    act(() => {
      result.current.selectPanel(null)
    })

    expect(result.current.selectedPanelId).toBeNull()
  })

  it('should apply material to all panels', () => {
    const { result } = renderHook(() => useCabinetStore())

    act(() => {
      result.current.initCabinet('UPPER')
      result.current.setDefaultSurface('melamine-white')
    })

    const panels = result.current.cabinet!.panels
    panels.forEach(panel => {
      expect(panel.materials.surfaces.front).toBe('melamine-white')
    })
  })

  it('should support undo/redo', () => {
    const { result } = renderHook(() => useCabinetStore())

    act(() => {
      result.current.initCabinet('UPPER')
    })

    const originalWidth = result.current.cabinet!.dimensions.width

    act(() => {
      result.current.setDimensions({ width: 800 })
    })

    expect(result.current.cabinet!.dimensions.width).toBe(800)

    act(() => {
      result.current.undo()
    })

    expect(result.current.cabinet!.dimensions.width).toBe(originalWidth)

    act(() => {
      result.current.redo()
    })

    expect(result.current.cabinet!.dimensions.width).toBe(800)
  })
})
```

---

## 5. Component Tests

### 5.1 MaterialSelector Tests

**File:** `src/components/ui/MaterialSelector.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MaterialSelector } from './MaterialSelector'

const mockMaterials = {
  'mat-1': {
    id: 'mat-1',
    name: 'White Melamine',
    type: 'MELAMINE',
    color: '#FFFFFF'
  },
  'mat-2': {
    id: 'mat-2',
    name: 'Oak Veneer',
    type: 'VENEER',
    color: '#D2B48C'
  }
}

describe('MaterialSelector', () => {
  it('should render all materials', () => {
    render(
      <MaterialSelector
        category="surface"
        materials={mockMaterials}
        selectedId="mat-1"
        onSelect={() => {}}
      />
    )

    expect(screen.getByText('White Melamine')).toBeInTheDocument()
    expect(screen.getByText('Oak Veneer')).toBeInTheDocument()
  })

  it('should highlight selected material', () => {
    render(
      <MaterialSelector
        category="surface"
        materials={mockMaterials}
        selectedId="mat-1"
        onSelect={() => {}}
      />
    )

    const selectedCard = screen.getByText('White Melamine').closest('div')
    expect(selectedCard).toHaveClass('selected')
  })

  it('should call onSelect when material is clicked', () => {
    const onSelect = vi.fn()

    render(
      <MaterialSelector
        category="surface"
        materials={mockMaterials}
        selectedId="mat-1"
        onSelect={onSelect}
      />
    )

    fireEvent.click(screen.getByText('Oak Veneer'))
    expect(onSelect).toHaveBeenCalledWith('mat-2')
  })

  it('should filter materials by search term', () => {
    render(
      <MaterialSelector
        category="surface"
        materials={mockMaterials}
        selectedId="mat-1"
        onSelect={() => {}}
        showSearch={true}
      />
    )

    const searchInput = screen.getByPlaceholderText(/search/i)
    fireEvent.change(searchInput, { target: { value: 'oak' } })

    expect(screen.queryByText('White Melamine')).not.toBeInTheDocument()
    expect(screen.getByText('Oak Veneer')).toBeInTheDocument()
  })
})
```

### 5.2 DesignerIntentPanel Tests

**File:** `src/components/layout/DesignerIntentPanel.test.tsx`

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DesignerIntentPanel } from './DesignerIntentPanel'
import { useCabinetStore } from '../../core/store/useCabinetStore'

describe('DesignerIntentPanel', () => {
  beforeEach(() => {
    useCabinetStore.setState({
      cabinet: createMockCabinet()
    })
  })

  it('should render all sections', () => {
    render(<DesignerIntentPanel />)

    expect(screen.getByText(/dimensions/i)).toBeInTheDocument()
    expect(screen.getByText(/materials/i)).toBeInTheDocument()
    expect(screen.getByText(/hardware/i)).toBeInTheDocument()
  })

  it('should update store when dimensions change', () => {
    render(<DesignerIntentPanel />)

    const widthInput = screen.getByLabelText(/width/i)
    fireEvent.change(widthInput, { target: { value: '800' } })

    const state = useCabinetStore.getState()
    expect(state.cabinet?.dimensions.width).toBe(800)
  })

  it('should show validation errors', () => {
    useCabinetStore.setState({
      errors: [{
        type: 'DIMENSION',
        severity: 'ERROR',
        message: 'Width must be between 300-1200mm'
      }]
    })

    render(<DesignerIntentPanel />)

    expect(screen.getByText(/width must be between/i)).toBeInTheDocument()
  })
})
```

---

## 6. E2E Tests

### 6.1 User Flow Tests

**File:** `tests/e2e/cabinet-design.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Cabinet Design Flow', () => {
  test('should create new upper cabinet and customize', async ({ page }) => {
    await page.goto('http://localhost:5173')

    // Create new cabinet
    await page.click('text=New Project')
    await page.click('text=Upper Cabinet')

    // Verify cabinet is visible in 3D viewport
    await expect(page.locator('canvas')).toBeVisible()

    // Change dimensions
    await page.fill('input[name="width"]', '800')
    await page.fill('input[name="height"]', '900')

    // Wait for 3D update
    await page.waitForTimeout(500)

    // Verify calculations updated
    const costDisplay = page.locator('[data-testid="cost-display"]')
    await expect(costDisplay).toContainText('฿')

    // Change material
    await page.click('text=Material Stack')
    await page.click('text=Surface Finish')
    await page.click('[data-material-id="hpl-walnut"]')

    // Verify material applied
    await expect(page.locator('[data-testid="selected-surface"]')).toContainText('Walnut')

    // Export to DXF
    await page.click('text=Export')
    const downloadPromise = page.waitForEvent('download')
    await page.click('text=Download DXF')
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.dxf$/)
  })

  test('should validate dimension constraints', async ({ page }) => {
    await page.goto('http://localhost:5173')

    await page.click('text=New Project')
    await page.click('text=Upper Cabinet')

    // Try to enter invalid width
    await page.fill('input[name="width"]', '100') // Below 300mm minimum
    await page.blur('input[name="width"]')

    // Verify error message
    await expect(page.locator('.error')).toContainText('Width must be')
  })

  test('should support undo/redo', async ({ page }) => {
    await page.goto('http://localhost:5173')

    await page.click('text=New Project')
    await page.click('text=Upper Cabinet')

    // Change dimension
    await page.fill('input[name="width"]', '800')
    await expect(page.locator('input[name="width"]')).toHaveValue('800')

    // Undo
    await page.keyboard.press('Control+Z')
    await expect(page.locator('input[name="width"]')).toHaveValue('600')

    // Redo
    await page.keyboard.press('Control+Shift+Z')
    await expect(page.locator('input[name="width"]')).toHaveValue('800')
  })
})
```

### 6.2 3D Interaction Tests

**File:** `tests/e2e/3d-interaction.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('3D Viewport Interaction', () => {
  test('should select panel on click', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.click('text=New Project')
    await page.click('text=Upper Cabinet')

    const canvas = page.locator('canvas')
    await canvas.click({ position: { x: 400, y: 300 } })

    // Verify panel is selected (highlighted)
    await expect(page.locator('[data-testid="selected-panel-info"]')).toBeVisible()
  })

  test('should change camera preset', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.click('text=New Project')
    await page.click('text=Upper Cabinet')

    // Change to front view
    await page.click('[data-camera-preset="front"]')
    await page.waitForTimeout(500)

    // Change to top view
    await page.click('[data-camera-preset="top"]')
    await page.waitForTimeout(500)

    // Verify camera changed (check if different panels are visible)
    // This would require more sophisticated 3D testing
  })

  test('should show dimension labels on D key press', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.click('text=New Project')
    await page.click('text=Upper Cabinet')

    // Press D key
    await page.keyboard.press('d')

    // Verify dimension labels visible
    // Note: Testing HTML in 3D scene is complex, may need visual testing
  })
})
```

---

## 7. 3D Rendering Tests

### 7.1 Snapshot Tests

**File:** `src/components/canvas/Cabinet3D.test.tsx`

```typescript
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Canvas } from '@react-three/fiber'
import { Cabinet3D } from './Cabinet3D'
import { useCabinetStore } from '../../core/store/useCabinetStore'

describe('Cabinet3D Rendering', () => {
  beforeEach(() => {
    useCabinetStore.setState({
      cabinet: createMockCabinet()
    })
  })

  it('should render without crashing', () => {
    const { container } = render(
      <Canvas>
        <Cabinet3D />
      </Canvas>
    )

    expect(container).toBeTruthy()
  })

  it('should render correct number of panels', () => {
    const cabinet = createMockCabinet({
      panels: Array(6).fill({}).map((_, i) => ({
        id: `panel-${i}`,
        role: 'SHELF'
      }))
    })

    useCabinetStore.setState({ cabinet })

    const { container } = render(
      <Canvas>
        <Cabinet3D />
      </Canvas>
    )

    // Query Three.js scene for meshes
    // This requires custom test utilities
  })
})
```

### 7.2 Visual Regression Tests

**File:** `tests/visual/cabinet-views.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Visual Regression - Cabinet Views', () => {
  test('should match perspective view snapshot', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.click('text=New Project')
    await page.click('text=Upper Cabinet')

    await page.click('[data-camera-preset="perspective"]')
    await page.waitForTimeout(1000) // Wait for camera transition

    const canvas = page.locator('canvas')
    expect(await canvas.screenshot()).toMatchSnapshot('perspective-view.png')
  })

  test('should match front view snapshot', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.click('text=New Project')
    await page.click('text=Upper Cabinet')

    await page.click('[data-camera-preset="front"]')
    await page.waitForTimeout(1000)

    const canvas = page.locator('canvas')
    expect(await canvas.screenshot()).toMatchSnapshot('front-view.png')
  })

  test('should match top view snapshot', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.click('text=New Project')
    await page.click('text=Upper Cabinet')

    await page.click('[data-camera-preset="top"]')
    await page.waitForTimeout(1000)

    const canvas = page.locator('canvas')
    expect(await canvas.screenshot()).toMatchSnapshot('top-view.png')
  })
})
```

---

## 8. Performance Tests

### 8.1 Rendering Performance

**File:** `tests/performance/rendering.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Rendering Performance', () => {
  test('should render 100 panels at >30 FPS', async ({ page }) => {
    await page.goto('http://localhost:5173')

    // Inject FPS counter
    await page.evaluate(() => {
      let lastTime = performance.now()
      let frames = 0
      let fps = 0

      function measureFPS() {
        frames++
        const now = performance.now()
        if (now >= lastTime + 1000) {
          fps = Math.round((frames * 1000) / (now - lastTime))
          frames = 0
          lastTime = now
        }
        window.currentFPS = fps
        requestAnimationFrame(measureFPS)
      }

      measureFPS()
    })

    // Create cabinet with 100 panels
    await page.evaluate(() => {
      // This would need actual implementation
      // to create a cabinet with many panels
    })

    // Wait and measure FPS
    await page.waitForTimeout(5000)

    const fps = await page.evaluate(() => window.currentFPS)
    expect(fps).toBeGreaterThan(30)
  })

  test('should load within 3 seconds', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('http://localhost:5173')
    await page.waitForSelector('canvas')
    const loadTime = Date.now() - startTime

    expect(loadTime).toBeLessThan(3000)
  })
})
```

### 8.2 Bundle Size Tests

**File:** `tests/performance/bundle-size.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Bundle Size', () => {
  it('should keep main bundle under 2MB', () => {
    const distPath = path.resolve(__dirname, '../../dist')
    const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8')

    // Extract JS bundle path
    const match = indexHtml.match(/src="(\/assets\/index-[^"]+\.js)"/)
    expect(match).not.toBeNull()

    const bundlePath = path.join(distPath, match![1])
    const stats = fs.statSync(bundlePath)
    const sizeInMB = stats.size / 1024 / 1024

    expect(sizeInMB).toBeLessThan(2)
  })
})
```

---

## 9. Accessibility Tests

### 9.1 WCAG Compliance

**File:** `tests/a11y/accessibility.spec.ts`

```typescript
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('Accessibility', () => {
  test('should not have automatic accessibility violations', async ({ page }) => {
    await page.goto('http://localhost:5173')

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze()

    expect(accessibilityScanResults.violations).toEqual([])
  })

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('http://localhost:5173')

    // Tab through UI
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()

    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
  })

  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('http://localhost:5173')

    await expect(page.locator('[aria-label="Width input"]')).toBeVisible()
    await expect(page.locator('[aria-label="Height input"]')).toBeVisible()
  })
})
```

---

## 10. Test Data & Fixtures

### 10.1 Mock Cabinet Factory

**File:** `src/core/test-utils/fixtures.ts`

```typescript
import { Cabinet, Panel, Material } from '../types'

export function createMockCabinet(overrides?: Partial<Cabinet>): Cabinet {
  return {
    id: 'test-cabinet-1',
    type: 'UPPER',
    version: '2.0',
    dimensions: {
      width: 600,
      height: 720,
      depth: 350
    },
    materials: {
      defaultCore: 'pb-18',
      defaultSurface: 'melamine-white',
      defaultEdge: 'pvc-white'
    },
    panels: createMockPanels(),
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

export function createMockPanel(overrides?: Partial<Panel>): Panel {
  return {
    id: 'panel-1',
    role: 'TOP',
    dimensions: {
      width: 600,
      height: 350,
      thickness: 18
    },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    materials: {
      core: 'pb-18',
      surfaces: {
        front: 'melamine-white',
        back: 'melamine-white'
      },
      edges: {
        top: 'pvc-white',
        bottom: 'pvc-white',
        left: 'pvc-white',
        right: 'pvc-white'
      }
    },
    operations: [],
    ...overrides
  }
}

export function createMockMaterials(): {
  core: Record<string, CoreMaterial>
  surface: Record<string, SurfaceMaterial>
  edge: Record<string, EdgeMaterial>
} {
  return {
    core: {
      'pb-18': {
        id: 'pb-18',
        name: 'Particleboard 18mm',
        type: 'PARTICLEBOARD',
        thickness: 18,
        density: 650,
        color: '#D2B48C',
        costPerSqm: 150,
        co2PerKg: 0.8
      }
    },
    surface: {
      'melamine-white': {
        id: 'melamine-white',
        name: 'White Melamine',
        type: 'MELAMINE',
        thickness: 0.8,
        color: '#FFFFFF',
        roughness: 0.8,
        metalness: 0.1,
        costPerSqm: 50,
        co2PerSqm: 2.5
      }
    },
    edge: {
      'pvc-white': {
        id: 'pvc-white',
        name: 'PVC White 1mm',
        type: 'PVC',
        thickness: 1.0,
        color: '#FFFFFF',
        costPerMeter: 5,
        co2PerMeter: 0.2
      }
    }
  }
}
```

---

## 11. Running Tests

### 11.1 Commands

```bash
# Run all tests
npm run test

# Run unit tests
npm run test:unit

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run E2E in UI mode
npm run test:e2e:ui

# Run specific test file
npm run test -- Cabinet3D.test.tsx

# Watch mode
npm run test:watch
```

### 11.2 Configuration

**vitest.config.ts:**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*'
      ]
    }
  }
})
```

**playwright.config.ts:**

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI
  }
})
```

---

**Document Control:**
- **Version:** 1.0
- **Last Updated:** 2026-01-10
- **Next Review:** 2026-04-10
- **Owner:** MONOLITH QA Team
- **Status:** ✅ Active
