# Designer Logic Panel - UI Mock Spec

> UI specification for the Designer Intent evaluation panel.
> Shows rule evaluation results, hardware selection, and gate status.

## Overview

The Designer Logic Panel provides real-time feedback on cabinet design decisions. It evaluates designer intent against manufacturing rules and displays:

1. **Gate Status** - PASS/WARN/BLOCK indicators
2. **Hardware Selection** - Auto-selected hardware with quantities
3. **Drilling Plan** - Symbolic drill operations
4. **Assembly Sequence** - Step-by-step instructions

---

## Panel Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Designer Logic                                    [Expand ▼] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ GATE STATUS                                         │    │
│  │ ┌──────┐  ┌──────┐  ┌──────┐                       │    │
│  │ │ ✓ OK │  │ ⚠ 2  │  │ ✗ 0  │                       │    │
│  │ └──────┘  └──────┘  └──────┘                       │    │
│  │  Blocks    Warns     Info                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ACTIVE EFFECTS                                      │    │
│  │ ┌───────────────────────────────────────────────┐   │    │
│  │ │ ⚠️ PUSH_OPEN_REQUIRES_SYNC_BAR               │   │    │
│  │ │   ลิ้นชัก Push-Open ต้องมี Sync Bar          │   │    │
│  │ └───────────────────────────────────────────────┘   │    │
│  │ ┌───────────────────────────────────────────────┐   │    │
│  │ │ ℹ️ COMPOSITION_LEFT_TO_RIGHT                 │   │    │
│  │ │   ประกอบตู้จากซ้ายไปขวา (มาตรฐานโรงงาน)      │   │    │
│  │ └───────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ TABS ──────────────────────────────────────────────┐    │
│  │ [Hardware] [Drilling] [Assembly]                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ HARDWARE SELECTION                                  │    │
│  │ ─────────────────────────────────────────────────   │    │
│  │ MINIFIX-CAM-15       แคมล็อค Minifix Ø15      8    │    │
│  │ MINIFIX-BOLT-S200    สลัก Minifix S200        8    │    │
│  │ SHELF-PIN-5          พินรับชั้น Ø5            4    │    │
│  │ UNDERMOUNT-SLIDE     รางลิ้นชักใต้ฐาน         2    │    │
│  │ SYNC-BAR             Sync Bar                 1    │    │
│  │ ─────────────────────────────────────────────────   │    │
│  │ Notes:                                              │    │
│  │ • พินรับชั้น 1 ชั้น (4 ตัว/ชั้น)                   │    │
│  │ • รางลิ้นชักใต้ฐาน 1 ชุด (2 ราง/ลิ้นชัก)           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Gate Status Badge

Shows the evaluation result with color-coded indicators.

```tsx
interface GateStatusBadgeProps {
  blocked: boolean;
  warningCount: number;
  infoCount: number;
}

// Colors
const GATE_COLORS = {
  ok: '#22c55e',      // Green
  warn: '#f59e0b',    // Amber
  block: '#ef4444',   // Red
};

// Usage
<GateStatusBadge
  blocked={evaluation.gate.blocked}
  warningCount={evaluation.gate.warnings.length}
  infoCount={0}
/>
```

### 2. Active Effects List

Displays all triggered rule effects with severity indicators.

```tsx
interface ActiveEffectItemProps {
  code: string;
  severity: 'block' | 'warn' | 'info';
  messageTH: string;
  messageEN?: string;
}

// Icons
const SEVERITY_ICONS = {
  block: '✗',
  warn: '⚠️',
  info: 'ℹ️',
};

// Colors
const SEVERITY_COLORS = {
  block: '#ef4444',
  warn: '#f59e0b',
  info: '#8b5cf6',
};
```

### 3. Hardware Selection Table

Lists selected hardware with quantities.

```tsx
interface HardwareTableProps {
  hardware: HardwareItemPDF[];
  notesTH: string[];
}

// Columns
| Column    | Width  | Content                    |
|-----------|--------|----------------------------|
| Catalog   | 140px  | Hardware catalog ID        |
| Name (TH) | flex   | Thai name                  |
| Qty       | 60px   | Quantity (right-aligned)   |
```

### 4. Drilling Operations Tab

Shows symbolic drill operations grouped by panel.

```tsx
interface DrillOperationsTabProps {
  operations: DrillOpPDF[];
  system32: { firstHole: number; pitch: number };
  notesTH: string[];
}

// Display format
┌───────────────────────────────────────────────────────────┐
│ LEFT_SIDE                                                 │
│ ├── CAM_L_0    Ø15 x 12.5mm  รู Minifix Cam Ø15          │
│ ├── CAM_L_1    Ø15 x 12.5mm  รู Minifix Cam Ø15          │
│ ├── SHELF_LINE_L_FRONT  Ø5 x 8mm  รูพินรับชั้น            │
│ └── GROOVE_L   6 x 8mm       ร่องหลังตู้                  │
└───────────────────────────────────────────────────────────┘
```

### 5. Assembly Steps Tab

Shows step-by-step assembly sequence.

```tsx
interface AssemblyStepsTabProps {
  steps: AssemblyStepPDF[];
  totalMinutes: number;
  assemblyDirection: 'LEFT_TO_RIGHT' | 'RIGHT_TO_LEFT';
  notesTH: string[];
}

// Display format
┌───────────────────────────────────────────────────────────┐
│ Assembly Direction: ซ้าย → ขวา                            │
│ Total Time: ~45 นาที                                      │
├───────────────────────────────────────────────────────────┤
│ 1. วางแผงข้างซ้ายลงบนโต๊ะ (หงายออก)            [1 นาที]   │
│ 2. ยึดแผงล่างกับแผงข้างซ้าย (Minifix)            [2 นาที]   │
│ 3. ยึดแผงบนกับแผงข้างซ้าย (Minifix)             [2 นาที]   │
│ 4. ยึดแผงข้างขวากับแผงบน/ล่าง (Minifix)         [3 นาที]   │
│ 5. พลิกตู้ ยืนตั้งตรง                          [1 นาที]   │
│ ...                                                       │
└───────────────────────────────────────────────────────────┘
```

---

## State Management

### Store Integration

```tsx
// Option 1: Dedicated store
const useDesignerLogicStore = create<DesignerLogicState>((set) => ({
  evaluation: null,
  setEvaluation: (eval) => set({ evaluation: eval }),
}));

// Option 2: Extend useCabinetStore
interface CabinetState {
  // ... existing state
  designerEvaluation: DesignerEvaluationPDF | null;
  evaluateDesignerIntent: () => void;
}
```

### Real-time Evaluation

```tsx
// Trigger evaluation on intent change
useEffect(() => {
  const intent = buildIntentFromCabinet(cabinet);
  const evaluation = evaluateIntent(intent);
  setDesignerEvaluation(evaluation);
}, [cabinet.doors, cabinet.drawers, cabinet.shelves, cabinet.dimensions]);
```

---

## Interactions

### 1. Effect Click → Navigate to Setting

When user clicks an effect, navigate to the relevant setting panel.

```tsx
const EFFECT_NAVIGATION = {
  'SHELF_14MM_REQUIRES_DEDICATED_SLOT': 'panel:shelf-settings',
  'PUSH_OPEN_REQUIRES_SYNC_BAR': 'panel:drawer-settings',
  'JET_REQUIRES_DEEP_SHELF': 'panel:door-settings',
  'MINIFIX_REQUIRES_16MM': 'panel:material-settings',
};

function handleEffectClick(code: string) {
  const target = EFFECT_NAVIGATION[code];
  if (target) {
    navigateToPanel(target);
  }
}
```

### 2. Hardware Item Click → Show Drill Locations

```tsx
function handleHardwareClick(catalogId: string) {
  const relatedDrills = evaluation.drilling.operations
    .filter(op => op.symbolRef.includes(catalogId));

  highlightDrillsIn3D(relatedDrills);
}
```

### 3. Assembly Step Click → Highlight Panel

```tsx
function handleStepClick(step: AssemblyStepPDF) {
  highlight3DPanel(step.panel);
  showStepAnimation(step.stepNumber);
}
```

---

## Responsive Layout

### Desktop (width >= 1200px)

- Full panel visible on right sidebar
- All tabs visible simultaneously

### Tablet (768px <= width < 1200px)

- Panel in collapsible drawer
- Tabs as horizontal scroll

### Mobile (width < 768px)

- Full-screen modal on button tap
- Single tab visible at a time

---

## Accessibility

### ARIA Labels

```tsx
<section aria-label="Designer Logic Evaluation">
  <div role="status" aria-live="polite">
    Gate Status: {blocked ? 'Blocked' : 'Pass'}
  </div>

  <ul role="list" aria-label="Active Effects">
    {effects.map(e => (
      <li role="listitem" key={e.code}>
        <span aria-label={`${e.severity}: ${e.messageEN}`}>
          {e.messageTH}
        </span>
      </li>
    ))}
  </ul>
</section>
```

### Keyboard Navigation

- `Tab` to navigate between sections
- `Enter` to expand/collapse sections
- `Arrow keys` to navigate within lists

---

## Sample Component Implementation

```tsx
import { evaluateIntent, createDefaultIntentPDF } from '@/core/designerIntent';

export function DesignerLogicPanel() {
  const [intent, setIntent] = useState(createDefaultIntentPDF);
  const evaluation = useMemo(() => evaluateIntent(intent), [intent]);

  return (
    <div className="designer-logic-panel" style={panelStyles}>
      <h2>Designer Logic</h2>

      <GateStatusBadge
        blocked={evaluation.gate.blocked}
        warningCount={evaluation.gate.warnings.length}
        infoCount={0}
      />

      <ActiveEffectsList effects={evaluation.effects} />

      <Tabs defaultValue="hardware">
        <TabsList>
          <TabsTrigger value="hardware">Hardware</TabsTrigger>
          <TabsTrigger value="drilling">Drilling</TabsTrigger>
          <TabsTrigger value="assembly">Assembly</TabsTrigger>
        </TabsList>

        <TabsContent value="hardware">
          <HardwareTable
            hardware={evaluation.hardware.hardware}
            notesTH={evaluation.hardware.notesTH}
          />
        </TabsContent>

        <TabsContent value="drilling">
          <DrillOperationsTab
            operations={evaluation.drilling.operations}
            system32={evaluation.drilling.system32}
            notesTH={evaluation.drilling.notesTH}
          />
        </TabsContent>

        <TabsContent value="assembly">
          <AssemblyStepsTab
            steps={evaluation.assembly.steps}
            totalMinutes={evaluation.assembly.totalMinutes}
            assemblyDirection={evaluation.assembly.assemblyDirection}
            notesTH={evaluation.assembly.notesTH}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const panelStyles = {
  background: '#1a1a2e',
  border: '1px solid #3a3a5a',
  borderRadius: '8px',
  padding: '16px',
  color: '#fff',
};
```

---

## Integration Points

### 1. CNC Module

```typescript
// Export drilling plan to CNC
import { drillingPlanToCNCOverlay } from '@/core/cnc/overlay';

const cncOverlay = drillingPlanToCNCOverlay(evaluation.drilling);
```

### 2. BOM Module

```typescript
// Export hardware to BOM
import { hardwareToBOMItems } from '@/core/bom/hardware';

const bomItems = hardwareToBOMItems(evaluation.hardware);
```

### 3. Factory Release

```typescript
// Include evaluation in factory manifest
const manifest = {
  // ...other fields
  designerEvaluation: evaluation,
  gateStatus: evaluation.gate,
};
```

---

## File References

| File | Purpose |
|------|---------|
| `src/core/designerIntent/types.ts` | Type definitions |
| `src/core/designerIntent/ruleEngine.ts` | Rule evaluation |
| `src/core/designerIntent/mappers/` | Output mappers |
| `src/components/ui/DesignerLogicPanel.tsx` | Main UI component |
