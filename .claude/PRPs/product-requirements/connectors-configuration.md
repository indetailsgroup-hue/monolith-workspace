# Connectors Configuration System - PRP

## Overview
Create a unified connector configuration system with UI panels for all connector types.
Follow the established MinifixConfigPanel pattern.

---

## Context

### Codebase Locations
- **Existing Pattern**: `src/components/ui/MinifixConfigPanel.tsx` (REFERENCE)
- **Hardware Types**: `src/core/manufacturing/hardware/hardwareTypes.ts`
- **Minifix Catalog**: `src/core/catalog/MinifixHardware.ts`
- **Hardware Panel**: `src/components/ui/HardwarePanel.tsx`
- **Packet Types**: `src/factory/packet/types.ts`

### Existing Connector Types (from hardwareTypes.ts)
```typescript
type HardwareKind =
  | 'MINIFIX'    // ✅ Fully implemented
  | 'HINGE'      // ⚠️ Types only, no UI
  | 'SHELF_PIN'  // ⚠️ Types only, no UI
  | 'DOWEL'      // ⚠️ Types only, no UI
  | 'CONFIRMAT'  // ⚠️ Types only, no UI
  | 'SLIDE'      // ⚠️ Types only
  | 'SOFT_CLOSE' // ⚠️ Types only
  | 'HANDLE'     // ⚠️ Types only
  | 'LIGHTING';  // ⚠️ Types only
```

### UI Theme (Dark Mode)
```typescript
background: '#1a1a2e'
border: '#3a3a5a'
accent: '#8b5cf6'  // Purple
success: '#22c55e' // Green
warning: '#f59e0b' // Amber
```

---

## Requirements

### Phase 1: Unified Connector Manager (Priority)

1. **ConnectorManager.tsx** - Main tabbed interface
   - Tabs: Minifix | Hinges | Shelf Pins | Dowels
   - Each tab renders the appropriate config panel
   - Shared preset dropdown at top
   - Apply/Reset buttons

2. **HingeConfigPanel.tsx** - Following MinifixConfigPanel pattern
   - Hinge types: Blum Clip-Top, Hettich Sensys, Grass Tiomos
   - Parameters: cup diameter (35mm), boring depth, overlay, opening angle
   - Quantity selector (2-6 hinges per door)
   - Auto-spacing calculator

3. **ShelfPinConfigPanel.tsx**
   - Pin diameter: 5mm (standard System 32)
   - Hole depth: 10-13mm
   - Row count selector
   - Spacing: 32mm (System 32)
   - Pattern preview

4. **DowelConfigPanel.tsx**
   - Dowel sizes: 6x25, 6x30, 8x30, 8x35, 10x40
   - Quantity per joint
   - Edge distance
   - Alignment mode

### Phase 2: Catalog & Presets

5. **ConnectorCatalog.ts** - Unified catalog
   ```typescript
   interface ConnectorCatalog {
     hinges: HingeSpec[];
     shelfPins: ShelfPinSpec[];
     dowels: DowelSpec[];
     minifix: MinifixHousingSpec[]; // existing
   }
   ```

6. **Preset Persistence**
   - Extend HardwareLibrary pattern
   - LocalStorage key: `monolith.connectors.presets`
   - Import/Export as JSON

---

## Implementation Guidance

### Follow MinifixConfigPanel Pattern
```tsx
// Structure to follow:
<Section title="Connector Type" icon={Icon}>
  <DimensionSlider
    label="Parameter"
    value={value}
    onChange={onChange}
    min={0}
    max={100}
    unit="mm"
  />
</Section>
```

### Use Existing UI Components
- `Section` from `src/components/layout/Section.tsx`
- `DimensionSlider` pattern from MinifixConfigPanel
- `CounterInput` for quantities
- Dark theme colors

### Store Integration
- Use `useCabinetStore` for cabinet data access
- Create `useConnectorConfigStore` for connector UI state
- Pattern: Zustand + immer

---

## Validation Commands

```bash
# TypeScript check
npx tsc --noEmit --skipLibCheck

# Run related tests
npx vitest run src/components/ui --reporter=verbose

# Lint check
npx eslint src/components/ui/connectors/ --ext .ts,.tsx
```

---

## Success Criteria

- [ ] ConnectorManager.tsx renders with 4 tabs
- [ ] HingeConfigPanel.tsx shows hinge presets dropdown
- [ ] ShelfPinConfigPanel.tsx shows System 32 grid preview
- [ ] DowelConfigPanel.tsx shows dowel size options
- [ ] All panels follow dark theme (#1a1a2e)
- [ ] TypeScript compiles without errors
- [ ] No console errors when switching tabs

---

## File Structure (Create)

```
src/components/ui/connectors/
├── ConnectorManager.tsx      # Main tabbed interface
├── HingeConfigPanel.tsx      # Hinge configuration
├── ShelfPinConfigPanel.tsx   # Shelf pin configuration
├── DowelConfigPanel.tsx      # Dowel configuration
├── index.ts                  # Exports
└── connectorPresets.ts       # Preset data

src/core/catalog/
├── HingeCatalog.ts           # Hinge specifications
├── ShelfPinCatalog.ts        # Shelf pin specs
└── DowelCatalog.ts           # Dowel specs
```

---

## Completion Signal

When all success criteria are met, output:

```
<promise>CONNECTORS_CONFIG_COMPLETE</promise>
```
