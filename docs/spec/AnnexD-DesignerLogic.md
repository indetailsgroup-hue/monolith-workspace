# Annex D: Designer Logic Specification

> Version 1.0
> Date: 2026-01-27

---

## D.1 Overview

The Designer Logic module translates **Designer Intent** into **Factory Truth** through a declarative rule-based evaluation system. It produces:

1. **Hardware Selection** - Auto-selected hardware with quantities
2. **Drilling Plan** - Symbolic drill operations
3. **Assembly Sequence** - Step-by-step factory instructions
4. **Gate Status** - Manufacturing readiness (PASS/WARN/BLOCK)

### D.1.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Designer Intent                              │
│  (Cabinet Type, Composition, Shelves, Doors, Drawers, Materials)   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Rule Engine                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Rules[]   │→ │  Evaluate   │→ │  Effects[]  │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└────────────────────────────┬────────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌───────────┐  ┌───────────┐  ┌───────────┐
       │ Hardware  │  │ Drilling  │  │ Assembly  │
       │  Mapper   │  │  Mapper   │  │  Mapper   │
       └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
             │              │              │
             ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Designer Evaluation                            │
│  (Hardware[], Drilling[], Assembly[], Gate Status)                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## D.2 Designer Intent Schema

### D.2.1 DesignerIntentPDF

The primary input structure for rule evaluation.

```typescript
interface DesignerIntentPDF {
  // Cabinet type classification
  cabinetType: CabinetTypeIntent;  // 'BASE' | 'WALL' | 'TALL' | 'CORNER'

  // Assembly direction
  compositionDirection: CompositionDirection;  // 'LEFT_TO_RIGHT' | 'RIGHT_TO_LEFT'

  // Base/leg configuration
  baseLogic: BaseLogic;  // 'ADJUSTABLE_FOOT' | 'PLINTH' | 'FLOOR'

  // Back panel
  backPanel: boolean;

  // Shelf configuration
  shelf: ShelfIntent2;

  // Divider configuration
  divider: { enabled: boolean };

  // Door configuration
  door: DoorIntentPDF;

  // Drawer configuration
  drawer: DrawerIntentPDF;

  // System 32 usage
  usesSystem32?: boolean;

  // Connector type
  connectorType?: 'MINIFIX' | 'DOWEL' | 'SCREW';

  // Panel thickness
  panelThickness?: number;  // mm

  // Cabinet dimensions
  dimensions?: {
    width: number;   // mm
    height: number;  // mm
    depth: number;   // mm
  };
}
```

### D.2.2 Shelf Configuration

```typescript
interface ShelfIntent2 {
  enabled: boolean;
  supportType?: 'ADJUSTABLE' | 'FIXED';
  count?: number;
  thickness?: number;      // mm
  spanMM?: number;         // mm (for span limit rules)
  midSupport?: boolean;    // center support for long spans
}
```

### D.2.3 Door Configuration

```typescript
interface DoorIntentPDF {
  enabled: boolean;
  doorType?: 'SWING' | 'LIFT' | 'FOLD';
  flapSystem?: 'JET' | 'AVENTOS' | 'NONE';
  overlayType?: 'FULL' | 'HALF' | 'INSET';
  doorCount?: number;
  doorHeight?: number;  // mm
}
```

### D.2.4 Drawer Configuration

```typescript
interface DrawerIntentPDF {
  enabled: boolean;
  drawerCount?: number;
  slideType?: 'UNDERMOUNT' | 'SIDE_MOUNT';
  openMechanism?: 'PUSH_OPEN' | 'HANDLE';
  softClose?: boolean;
  frontHeightMM?: number;  // mm
}
```

---

## D.3 Rule System

### D.3.1 Rule Structure

Each rule consists of conditions (`when`) and effects (`then`).

```typescript
interface DesignerRulePDF {
  id: string;                    // Unique rule identifier
  category: RuleCategory;        // 'structural' | 'shelf' | 'door' | 'drawer' | 'assembly' | 'drilling'
  when: RuleCondition[];         // All must match (AND logic)
  then: RuleEffect[];            // Effects to apply when matched
}

interface RuleCondition {
  path: string;                  // Dot-notation path in intent
  op: ConditionOperator;         // Comparison operator
  value: unknown;                // Value to compare against
}

type ConditionOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'exists';
```

### D.3.2 Rule Effects

```typescript
interface RuleEffect {
  severity: Severity;            // 'block' | 'warn' | 'info'
  code: string;                  // Effect code for UI/logging
  messageTH: string;             // Thai language message
  messageEN?: string;            // English message (optional)
  require?: RuleCondition[];     // Additional requirements
  set?: SetOperation[];          // Modify intent values
  derive?: DeriveOperation[];    // Add derived values
}

interface SetOperation {
  path: string;
  value: unknown;
}

interface DeriveOperation {
  key: string;
  value: unknown;
}
```

### D.3.3 Severity Levels

| Severity | Description | Factory Impact |
|----------|-------------|----------------|
| `block` | Manufacturing not possible | STOP - must resolve |
| `warn` | Requires attention | CAUTION - review needed |
| `info` | Informational | PROCEED - noted |

---

## D.4 Default Rule Set

### D.4.1 Composition Rules

| Rule ID | Condition | Effect |
|---------|-----------|--------|
| `COMPOSITION_LEFT_TO_RIGHT` | `compositionDirection == 'LEFT_TO_RIGHT'` | info: ประกอบตู้จากซ้ายไปขวา |
| `COMPOSITION_RIGHT_TO_LEFT` | `compositionDirection == 'RIGHT_TO_LEFT'` | warn: ประกอบตู้จากขวาไปซ้าย |

### D.4.2 Base Logic Rules

| Rule ID | Condition | Effect |
|---------|-----------|--------|
| `ADJUSTABLE_FOOT_IS_JOINT` | `baseLogic == 'ADJUSTABLE_FOOT'` | info: ขาปรับระดับทำหน้าที่เป็นข้อต่อตู้ |
| `PLINTH_REQUIRES_KICKBOARD` | `baseLogic == 'PLINTH'` | info: ตู้มีขาตั้งต้องมีแผ่นปิดหน้า |
| `FLOOR_MOUNTED_CABINET` | `baseLogic == 'FLOOR'` | info: ตู้วางพื้นโดยตรง |

### D.4.3 Shelf Rules

| Rule ID | Condition | Effect |
|---------|-----------|--------|
| `SHELF_14MM_REQUIRES_DEDICATED_SLOT` | `shelf.thickness == 14` AND `shelf.supportType == 'ADJUSTABLE'` | warn: ชั้นวาง 14mm ต้องใช้ร่องเฉพาะ |
| `SHELF_18MM_SYSTEM_32` | `shelf.thickness >= 18` AND `shelf.supportType == 'ADJUSTABLE'` | info: ชั้นวาง 18mm ใช้ System 32 |
| `SHELF_FIXED_NEEDS_MINIFIX` | `shelf.supportType == 'FIXED'` | info: ชั้นวางตายตัวใช้ Minifix |
| `SHELF_SPAN_LIMIT` | `shelf.spanMM > 800` AND `shelf.midSupport == false` | block: ชั้นวางยาวเกิน 800mm ต้องมีตัวรับกลาง |

### D.4.4 Door Rules

| Rule ID | Condition | Effect |
|---------|-----------|--------|
| `JET_REQUIRES_DEEP_SHELF` | `door.flapSystem == 'JET'` | warn: JET Flap ต้องใช้กับตู้ลึก ≥350mm |
| `LIFT_SYSTEM_AVENTOS` | `door.flapSystem == 'AVENTOS'` | info: ระบบ Aventos สำหรับบานยกขึ้น |
| `DOOR_SWING_CUP_HINGE` | `door.doorType == 'SWING'` | info: บานเปิดใช้บานพับถ้วย |
| `DOOR_OVERLAY_FULL` | `door.overlayType == 'FULL'` | info: บานปิดเต็ม |
| `DOOR_OVERLAY_HALF` | `door.overlayType == 'HALF'` | info: บานปิดครึ่ง |

### D.4.5 Drawer Rules

| Rule ID | Condition | Effect |
|---------|-----------|--------|
| `PUSH_OPEN_REQUIRES_SYNC_BAR` | `drawer.openMechanism == 'PUSH_OPEN'` | warn: Push-Open ต้องมี Sync Bar |
| `UNDERMOUNT_SLIDE_STANDARD` | `drawer.slideType == 'UNDERMOUNT'` | info: รางลิ้นชักใต้ฐาน |
| `SIDE_MOUNT_SLIDE` | `drawer.slideType == 'SIDE_MOUNT'` | info: รางลิ้นชักข้างตู้ |
| `DRAWER_FRONT_MIN_HEIGHT` | `drawer.frontHeightMM < 80` | block: หน้าลิ้นชักต้องสูงอย่างน้อย 80mm |
| `SOFT_CLOSE_DRAWER` | `drawer.softClose == true` | info: ลิ้นชัก Soft-Close |

### D.4.6 Structural Rules

| Rule ID | Condition | Effect |
|---------|-----------|--------|
| `BACK_PANEL_GROOVE` | `backPanel == true` | info: หลังตู้เดินร่อง 8mm |
| `MINIFIX_REQUIRES_16MM` | `connectorType == 'MINIFIX'` AND `panelThickness < 16` | block: Minifix ต้องใช้ไม้ ≥16mm |
| `MINIFIX_DISTANCE_B` | `connectorType == 'MINIFIX'` | info: ระยะ B = 24mm |
| `SYSTEM_32_FIRST_HOLE` | `usesSystem32 == true` | info: รูแรกที่ 37mm, ระยะห่าง 32mm |

---

## D.5 Hardware Mapping

### D.5.1 Hardware Catalog

| Catalog ID | Name (TH) | Type |
|------------|-----------|------|
| `MINIFIX-CAM-15` | แคมล็อค Minifix Ø15 | Connector |
| `MINIFIX-BOLT-S200` | สลัก Minifix S200 | Connector |
| `CUP-HINGE-35` | บานพับถ้วย Ø35 | Hinge |
| `AVENTOS-HF` | Aventos HF | Lift System |
| `JET-FLAP` | JET Flap | Lift System |
| `SHELF-PIN-5` | พินรับชั้น Ø5 | Shelf Support |
| `SHELF-PIN-5-14MM` | พินรับชั้น Ø5 (14mm) | Shelf Support |
| `UNDERMOUNT-SLIDE` | รางลิ้นชักใต้ฐาน | Drawer Slide |
| `SIDE-MOUNT-SLIDE` | รางลิ้นชักข้างตู้ | Drawer Slide |
| `SYNC-BAR` | Sync Bar | Drawer Mechanism |
| `SOFT-CLOSE-DAMPER` | Damper Soft-Close | Drawer Mechanism |
| `LEVELER-ADJ` | ขาปรับระดับ | Leveler |

### D.5.2 Hardware Selection Logic

```
1. Base cabinet always gets 8× Minifix (cam + bolt)
2. If baseLogic == 'ADJUSTABLE_FOOT': add 4× Levelers
3. If shelf.supportType == 'ADJUSTABLE': add 4× Shelf Pins per shelf
4. If shelf.supportType == 'FIXED': add 4× Minifix per shelf
5. If door.doorType == 'SWING': add hinges (2-3 per door based on height)
6. If door.flapSystem == 'AVENTOS': add Aventos hardware
7. If door.flapSystem == 'JET': add JET Flap hardware
8. If drawer.enabled: add slides (2 per drawer)
9. If drawer.openMechanism == 'PUSH_OPEN': add Sync Bar
10. If drawer.softClose: add Soft-Close Dampers
```

---

## D.6 Drilling Plan

### D.6.1 Drill Operation Types

| Type | Diameter | Depth | Purpose |
|------|----------|-------|---------|
| `CAM` | Ø15 | 12.5mm | Minifix cam housing |
| `BOLT` | Ø10 | 17.5mm | Minifix bolt sleeve |
| `SHELF_PIN` | Ø5 | 8mm (6mm for 14mm panel) | Shelf pin holes |
| `HINGE_CUP` | Ø35 | 12mm | Cup hinge boring |
| `PILOT` | Ø3 | 10mm | Screw pilot holes |
| `GROOVE` | 6mm | 8mm | Back panel groove |

### D.6.2 System 32 Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| First Hole | 37mm | Distance from front edge |
| Pitch | 32mm | Hole spacing |
| Lines | 2 | Front and back rows |

### D.6.3 Drill Position Calculation

```
// Shelf pin line positions (from front edge)
frontLine = 37mm
backLine = depth - 37mm

// Shelf pin Y positions (System 32 grid)
for (n = 0; n < maxHoles; n++) {
  yPosition = 37 + (n * 32)
}
```

---

## D.7 Assembly Sequence

### D.7.1 Standard Assembly (Left-to-Right)

| Step | Action | Panel | Instruction (TH) |
|------|--------|-------|------------------|
| 1 | PLACE | LEFT_SIDE | วางแผงข้างซ้ายลงบนโต๊ะ |
| 2 | ATTACH | BOTTOM | ยึดแผงล่างกับแผงข้างซ้าย |
| 3 | ATTACH | SHELF (fixed) | ยึดชั้นวางตายตัว |
| 4 | ATTACH | TOP | ยึดแผงบนกับแผงข้างซ้าย |
| 5 | ATTACH | RIGHT_SIDE | ยึดแผงข้างขวา |
| 6 | FLIP | CARCASS | พลิกตู้ ยืนตั้งตรง |
| 7 | VERIFY | CARCASS | ขันแคมล็อคให้แน่น |
| 8 | INSERT | BACK | สอดแผงหลังเข้าร่อง |
| 9 | ATTACH | BOTTOM | ติดตั้งขาปรับระดับ |
| 10 | ATTACH | SIDES | ยึดรางลิ้นชัก |
| 11 | INSERT | DRAWER | ใส่ลิ้นชักเข้าราง |
| 12 | ATTACH | DOOR | แขวนบานประตู |
| 13 | ADJUST | DOOR | ปรับตั้งบานประตู |
| 14 | INSERT | SHELF_PINS | ใส่พินรับชั้น |
| 15 | PLACE | SHELF | วางชั้นวางบนพิน |

### D.7.2 Time Estimates

| Action | Base Time | Description |
|--------|-----------|-------------|
| PLACE | 1 min | Place panel |
| ATTACH | 2-3 min | Attach with Minifix |
| INSERT | 1-2 min | Insert into groove/slot |
| FLIP | 1 min | Flip cabinet |
| VERIFY | 2 min | Check and tighten |
| ADJUST | 2-3 min | Fine-tune alignment |

---

## D.8 Gate System

### D.8.1 Gate Status

```typescript
interface GateStatus {
  blocked: boolean;           // Any block effects?
  warnings: string[];         // Warning effect codes
  blocks: string[];           // Block effect codes
}
```

### D.8.2 Gate Logic

```
IF blocks.length > 0:
  gate.blocked = true
  → STOP: Cannot release to factory

IF warnings.length > 0 AND blocks.length == 0:
  gate.blocked = false
  → CAUTION: Review warnings before release

IF blocks.length == 0 AND warnings.length == 0:
  gate.blocked = false
  → PASS: Ready for factory release
```

---

## D.9 CNC Integration

### D.9.1 Operation Graph Overlay

The drilling plan can be converted to CNC operation graph format:

```typescript
interface CNCOverlayOperation {
  panelId: PanelId;
  operations: DrillOpPDF[];
  coordinates: DrillCoordinate[];  // Computed from dimensions
}

interface DrillCoordinate {
  x: number;  // mm
  y: number;  // mm
  z: number;  // depth (mm)
  diameter: number;
  type: string;
}
```

### D.9.2 Panel Coordinate System

```
       Width (X)
    ←─────────────→
  ↑ ┌─────────────┐
  │ │             │
H │ │  (0,0)      │  Origin at bottom-left
e │ │   ↓        │
i │ │   →        │
g │ │             │
h │ │             │
t │ │             │
  ↓ └─────────────┘

Face: Z = 0 (surface)
Drill into panel: Z > 0 (positive depth)
```

---

## D.10 API Reference

### D.10.1 Main Functions

```typescript
// Evaluate intent with default rules
function evaluateIntent(intent: DesignerIntentPDF): DesignerEvaluationPDF;

// Create default intent
function createDefaultIntentPDF(): DesignerIntentPDF;

// Evaluate with custom rules
function evaluateDesignerIntent(args: EvaluateArgs): DesignerEvaluationPDF;

// Check single requirement
function checkRequirement(intent: DesignerIntentPDF, requirement: RuleCondition): boolean;

// Get blocked effects
function getBlockedEffects(evaluation: DesignerEvaluationPDF): RuleEffect[];

// Get warning effects
function getWarningEffects(evaluation: DesignerEvaluationPDF): RuleEffect[];
```

### D.10.2 Usage Example

```typescript
import {
  evaluateIntent,
  createDefaultIntentPDF,
} from '@/core/designerIntent';

// Create intent
const intent = createDefaultIntentPDF();
intent.drawer = {
  enabled: true,
  drawerCount: 2,
  slideType: 'UNDERMOUNT',
  openMechanism: 'PUSH_OPEN',
  softClose: true,
};

// Evaluate
const evaluation = evaluateIntent(intent);

// Check gate status
if (evaluation.gate.blocked) {
  console.error('Cannot proceed:', evaluation.gate.blocks);
} else {
  console.log('Hardware:', evaluation.hardware.hardware);
  console.log('Assembly steps:', evaluation.assembly.steps.length);
  console.log('Drill operations:', evaluation.drilling.operations.length);
}
```

---

## D.11 File Structure

```
src/core/designerIntent/
├── index.ts                      # Public API exports
├── types.ts                      # Type definitions
├── ruleEngine.ts                 # Rule evaluation engine
├── designerRules.default.ts      # Default rule set
├── mappers/
│   ├── index.ts                  # Mapper exports
│   ├── hardwareMapper.ts         # Intent → Hardware
│   ├── drillingMapper.ts         # Intent → Drilling
│   └── assemblyMapper.ts         # Intent → Assembly
└── __tests__/
    ├── types.test.ts
    ├── rules.test.ts
    └── mappers.test.ts
```

---

## D.12 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-27 | Initial specification |

---

## D.13 References

- Assembly PDF (Thai) - Factory assembly standards
- Wall System PDF - Wall cabinet specifications
- Day System PDF - Standard cabinet dimensions
- Häfele Minifix S200 Catalog - Connector specifications
- System 32 Standard - European cabinet system
