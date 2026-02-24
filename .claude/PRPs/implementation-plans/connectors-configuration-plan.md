# Connectors Configuration - Implementation Plan

## Phase 1: Catalog Files (Foundation)

### Step 1.1: Create HingeCatalog.ts
```typescript
// src/core/catalog/HingeCatalog.ts
- HingeType enum (CLIP_TOP, SENSYS, TIOMOS)
- HingeSpec interface (cup diameter, boring depth, overlay, angles)
- HINGE_CATALOG array with common presets
- Helper: getHingesByOverlay(), getHingesByOpeningAngle()
```

### Step 1.2: Create ShelfPinCatalog.ts
```typescript
// src/core/catalog/ShelfPinCatalog.ts
- ShelfPinType enum (SYSTEM_32, CUSTOM)
- ShelfPinSpec interface (diameter, depth, spacing)
- SHELF_PIN_CATALOG with 5mm standard
- Helper: calculateShelfPinPositions()
```

### Step 1.3: Create DowelCatalog.ts
```typescript
// src/core/catalog/DowelCatalog.ts
- DowelSize type ('6x25' | '6x30' | '8x30' | etc.)
- DowelSpec interface (diameter, length, material)
- DOWEL_CATALOG array
- Helper: getDowelBySize()
```

**Validation**: `npx tsc --noEmit src/core/catalog/*.ts`

---

## Phase 2: Config Panel Components

### Step 2.1: Create HingeConfigPanel.tsx
```
Features:
- Preset dropdown (Blum, Hettich, Grass)
- Cup diameter display (35mm standard)
- Boring depth slider (11-13mm)
- Overlay selector (full, half, inset)
- Opening angle selector (95°, 110°, 155°, 170°)
- Quantity counter (2-6)
- Auto-spacing toggle
```

### Step 2.2: Create ShelfPinConfigPanel.tsx
```
Features:
- System 32 toggle (locks spacing to 32mm)
- Pin diameter (5mm default)
- Hole depth slider (10-13mm)
- Row count selector (1-4 rows)
- Start offset input
- Visual grid preview
```

### Step 2.3: Create DowelConfigPanel.tsx
```
Features:
- Size dropdown (6x25 through 10x50)
- Quantity per joint (2-6)
- Edge distance slider (20-40mm)
- Alignment mode (centered, offset)
- Material selector (wood, plastic)
```

**Validation**: Components render without errors

---

## Phase 3: Connector Manager

### Step 3.1: Create ConnectorManager.tsx
```typescript
// Tabbed interface combining all panels
<DirectionAwareTabs defaultValue="minifix">
  <Tab value="minifix" label="Minifix">
    <MinifixConfigPanel />
  </Tab>
  <Tab value="hinges" label="Hinges">
    <HingeConfigPanel />
  </Tab>
  <Tab value="shelf-pins" label="Shelf Pins">
    <ShelfPinConfigPanel />
  </Tab>
  <Tab value="dowels" label="Dowels">
    <DowelConfigPanel />
  </Tab>
</DirectionAwareTabs>
```

### Step 3.2: Create index.ts exports
```typescript
export * from './ConnectorManager';
export * from './HingeConfigPanel';
export * from './ShelfPinConfigPanel';
export * from './DowelConfigPanel';
```

**Validation**: `npx tsc --noEmit src/components/ui/connectors/index.ts`

---

## Phase 4: Integration & Polish

### Step 4.1: Add to HardwarePanel
- Import ConnectorManager
- Replace or augment existing Catalog tab

### Step 4.2: Preset Persistence
- Extend localStorage pattern from HardwareLibrary
- Save/load connector configs

### Step 4.3: Final Testing
```bash
npx tsc --noEmit
npx vitest run src/components/ui --reporter=verbose
```

---

## Execution Order

```
1. Catalogs (3 files)     → TypeScript compiles
2. Config Panels (3 files) → Components render
3. ConnectorManager        → Tabs work
4. Integration             → Full flow works
```

---

## Estimated Iterations (Ralph)

- Phase 1: ~3-5 iterations (simple data files)
- Phase 2: ~8-12 iterations (UI components)
- Phase 3: ~3-5 iterations (integration)
- Phase 4: ~2-3 iterations (polish)

**Recommended max-iterations: 30**

---

## Quick Start Command

```bash
# Manual execution
# Work through phases sequentially

# Ralph execution (autonomous)
# /ralph-loop with PRP content + --max-iterations 30
```
