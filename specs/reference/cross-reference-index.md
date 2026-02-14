# Cross-Reference Index
# ดัชนีอ้างอิงข้ามเอกสาร

**Version:** 1.0.0
**Last Updated:** 2026-01-10
**Status:** Navigation Guide
**Scope:** All Specification Documents

---

## บทนำ (Introduction)

เอกสารนี้เป็น **แผนที่นำทาง** สำหรับค้นหาข้อมูลในระบบเอกสาร MONOLITH Designer เพื่อแก้ปัญหา:
- ไม่มี Cross-reference ระหว่างเอกสาร
- ค้นหาข้อมูลที่ต้องการได้ยาก
- ไม่รู้ว่าเอกสารไหนเป็น authoritative source

---

## ส่วนที่ 1: Document Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MONOLITH SPEC DOCUMENT MAP                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   specs/reference/ (Single Source of Truth)                                 │
│   ├── master-hardware-database.md  ◄── Hardware items, SKUs, dimensions     │
│   ├── formula-reference.md         ◄── All calculation formulas             │
│   └── cross-reference-index.md     ◄── This file (navigation)               │
│                                                                              │
│   specs/manufacturing/                                                       │
│   ├── hardware-drilling-specifications.md  ◄── Drilling patterns, CNC       │
│   ├── door-drawer-complete-guide.md        ◄── Door/Drawer engineering      │
│   ├── cut-optimization-algorithms.md       ◄── Nesting, sheet optimization  │
│   └── kerf-bending-algorithms.md           ◄── Curved panels                │
│                                                                              │
│   specs/technical/                                                           │
│   ├── parametric-cabinet-calculations.md   ◄── Cabinet dimensions           │
│   ├── cabinet-snap-system.md               ◄── Snap algorithm, history      │
│   └── collision-clearance-system.md        ◄── OBB collision, Gate          │
│                                                                              │
│   specs/export/                                                              │
│   └── dxf-export-specs.md                  ◄── CAD export formats            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ส่วนที่ 2: Topic → Document Mapping

### 2.1 Hardware & Fittings

| Topic | Primary Document | Section | Notes |
|-------|------------------|---------|-------|
| **Blum MOVENTO runners** | [master-hardware-database.md](./master-hardware-database.md) | §1.1 | SKUs, load ratings |
| **Blum TANDEM runners** | [master-hardware-database.md](./master-hardware-database.md) | §1.2 | SKUs, load ratings |
| **Blum LEGRABOX** | [master-hardware-database.md](./master-hardware-database.md) | §1.3 | Height codes, cutlist |
| **Blum hinges** | [master-hardware-database.md](./master-hardware-database.md) | §1.4 | Clip Top series |
| **Häfele Minifix** | [master-hardware-database.md](./master-hardware-database.md) | §2.1 | Cam, bolts, sleeves |
| **Häfele dowels** | [master-hardware-database.md](./master-hardware-database.md) | §2.2 | Fluted, pre-glued |
| **Häfele hinges** | [master-hardware-database.md](./master-hardware-database.md) | §2.3 | Metalla 510 |
| **Blum ↔ Häfele equivalence** | [master-hardware-database.md](./master-hardware-database.md) | §3 | Cross-reference |

### 2.2 Calculation Formulas

| Topic | Primary Document | Section | Notes |
|-------|------------------|---------|-------|
| **Drawer width (MOVENTO/TANDEM)** | [formula-reference.md](./formula-reference.md) | §1 | LW - 42mm |
| **Drawer width (Standard)** | [formula-reference.md](./formula-reference.md) | §1 | Opening - 26mm |
| **LEGRABOX cutlist** | [formula-reference.md](./formula-reference.md) | §7 | Bottom, back panels |
| **Kerf width values** | [formula-reference.md](./formula-reference.md) | §2 | Saw vs Router |
| **Shelf setback** | [formula-reference.md](./formula-reference.md) | §3 | S_front, S_rear |
| **Door size overlay** | [formula-reference.md](./formula-reference.md) | §4 | Full, Half, Inset |
| **Hinge positions** | [formula-reference.md](./formula-reference.md) | §5 | Y-coordinates |
| **Minifix joint** | [formula-reference.md](./formula-reference.md) | §6 | Sleeve height, count |
| **Cost calculation** | [formula-reference.md](./formula-reference.md) | §8 | Material, labor |
| **Tolerances** | [formula-reference.md](./formula-reference.md) | §9 | Manufacturing limits |

### 2.3 Drilling & CNC

| Topic | Primary Document | Section | Notes |
|-------|------------------|---------|-------|
| **System 32 basics** | [hardware-drilling-specifications.md](../manufacturing/hardware-drilling-specifications.md) | §1 | Grid layout |
| **Hinge boring patterns** | [hardware-drilling-specifications.md](../manufacturing/hardware-drilling-specifications.md) | §3 | 35mm cup |
| **Minifix drilling** | [hardware-drilling-specifications.md](../manufacturing/hardware-drilling-specifications.md) | §4 | Cam, bolt, sleeve |
| **Runner mounting holes** | [hardware-drilling-specifications.md](../manufacturing/hardware-drilling-specifications.md) | §8-9 | MOVENTO, TANDEM |
| **Shelf pin holes** | [hardware-drilling-specifications.md](../manufacturing/hardware-drilling-specifications.md) | §2 | 5mm dia |
| **Minifix 3D visualization** | [hardware-drilling-specifications.md](../manufacturing/hardware-drilling-specifications.md) | §23 | Errata, best practices |
| **CAM/G-code generation** | [hardware-drilling-specifications.md](../manufacturing/hardware-drilling-specifications.md) | §12+ | CNC output |

### 2.4 Door & Drawer Engineering

| Topic | Primary Document | Section | Notes |
|-------|------------------|---------|-------|
| **Door types (Overlay/Inset)** | [door-drawer-complete-guide.md](../manufacturing/door-drawer-complete-guide.md) | §1 | Size formulas |
| **Hinge count calculation** | [door-drawer-complete-guide.md](../manufacturing/door-drawer-complete-guide.md) | §2 | Weight/height matrix |
| **Drawer box components** | [door-drawer-complete-guide.md](../manufacturing/door-drawer-complete-guide.md) | §3 | Sides, bottom, back |
| **Wood Drawer Architect Engine** | [door-drawer-complete-guide.md](../manufacturing/door-drawer-complete-guide.md) | §9 | MOVENTO/TANDEM |
| **LEGRABOX Kinetics Engine** | [door-drawer-complete-guide.md](../manufacturing/door-drawer-complete-guide.md) | §10 | Auto height selection |
| **Slide selection** | [door-drawer-complete-guide.md](../manufacturing/door-drawer-complete-guide.md) | §4 | Load, length |
| **Validation rules** | [door-drawer-complete-guide.md](../manufacturing/door-drawer-complete-guide.md) | §8 | Min/max dimensions |

### 2.5 Cabinet Parametric Design

| Topic | Primary Document | Section | Notes |
|-------|------------------|---------|-------|
| **Cabinet types** | [parametric-cabinet-calculations.md](../technical/parametric-cabinet-calculations.md) | §1 | Base, Wall, Tall |
| **Panel dimensions** | [parametric-cabinet-calculations.md](../technical/parametric-cabinet-calculations.md) | §2 | Side, top, bottom |
| **Shelf depth calculation** | [parametric-cabinet-calculations.md](../technical/parametric-cabinet-calculations.md) | §3 | Setback rules |
| **Construction types** | [parametric-cabinet-calculations.md](../technical/parametric-cabinet-calculations.md) | §4 | Frameless, Face frame |
| **Edge cases** | [parametric-cabinet-calculations.md](../technical/parametric-cabinet-calculations.md) | §5 | Corner, appliance |
| **Cost optimization** | [parametric-cabinet-calculations.md](../technical/parametric-cabinet-calculations.md) | §6 | Material, cut layout |
| **3D visualization** | [parametric-cabinet-calculations.md](../technical/parametric-cabinet-calculations.md) | §6.3 | Edge banding shader |

### 2.6 Cut Optimization

| Topic | Primary Document | Section | Notes |
|-------|------------------|---------|-------|
| **Guillotine algorithm** | [cut-optimization-algorithms.md](../manufacturing/cut-optimization-algorithms.md) | §2 | Nesting logic |
| **Sheet sizes** | [cut-optimization-algorithms.md](../manufacturing/cut-optimization-algorithms.md) | §1 | Standard panels |
| **Waste calculation** | [cut-optimization-algorithms.md](../manufacturing/cut-optimization-algorithms.md) | §3 | Efficiency % |
| **Grain direction** | [cut-optimization-algorithms.md](../manufacturing/cut-optimization-algorithms.md) | §4 | Orientation rules |
| **Database schema** | [cut-optimization-algorithms.md](../manufacturing/cut-optimization-algorithms.md) | §1.3 | PostgreSQL |

### 2.7 Kerf Bending

| Topic | Primary Document | Section | Notes |
|-------|------------------|---------|-------|
| **Kerf pattern types** | [kerf-bending-algorithms.md](../manufacturing/kerf-bending-algorithms.md) | §1 | Parallel, radial |
| **Bend radius calculation** | [kerf-bending-algorithms.md](../manufacturing/kerf-bending-algorithms.md) | §2 | Formula |
| **Kerf spacing** | [kerf-bending-algorithms.md](../manufacturing/kerf-bending-algorithms.md) | §3 | Density |
| **Material selection** | [kerf-bending-algorithms.md](../manufacturing/kerf-bending-algorithms.md) | §5 | MDF, plywood |
| **Pre-flight checks** | [kerf-bending-algorithms.md](../manufacturing/kerf-bending-algorithms.md) | §6.4 | Validation |

### 2.8 Cabinet Snap System

| Topic | Primary Document | Section | Notes |
|-------|------------------|---------|-------|
| **Snap types** | [cabinet-snap-system.md](../technical/cabinet-snap-system.md) | §2 | SIDE_JOIN, STACK, etc. |
| **Anchor planes** | [cabinet-snap-system.md](../technical/cabinet-snap-system.md) | §1.2 | FACE_LEFT/RIGHT/etc. |
| **Snap algorithm** | [cabinet-snap-system.md](../technical/cabinet-snap-system.md) | §3 | Candidate, Score, Solve |
| **Snap constants** | [cabinet-snap-system.md](../technical/cabinet-snap-system.md) | §Overview | 50mm threshold, 1mm gap |
| **Feature history** | [cabinet-snap-system.md](../technical/cabinet-snap-system.md) | §4 | CABINET_SNAP feature |
| **Validation** | [cabinet-snap-system.md](../technical/cabinet-snap-system.md) | §3.4 | Collision, gap check |

### 2.9 Collision & Clearance System

| Topic | Primary Document | Section | Notes |
|-------|------------------|---------|-------|
| **OBB collision** | [collision-clearance-system.md](../technical/collision-clearance-system.md) | §4 | SAT algorithm |
| **Spatial hash** | [collision-clearance-system.md](../technical/collision-clearance-system.md) | §3 | Broad-phase 500mm cells |
| **SpatialHashV3** | [collision-clearance-system.md](../technical/collision-clearance-system.md) | §10.1 | AABB cache, reverse index |
| **Quaternion transform** | [collision-clearance-system.md](../technical/collision-clearance-system.md) | §10.2 | No gimbal lock |
| **Overlap scoring** | [collision-clearance-system.md](../technical/collision-clearance-system.md) | §10.3 | Face overlap for snap |
| **Door swing envelope** | [collision-clearance-system.md](../technical/collision-clearance-system.md) | §5.1 | 110°, 8 samples |
| **Drawer pull envelope** | [collision-clearance-system.md](../technical/collision-clearance-system.md) | §5.2 | 6 samples |
| **Gate validation** | [collision-clearance-system.md](../technical/collision-clearance-system.md) | §6 | ERROR/WARNING policy |
| **Constants** | [collision-clearance-system.md](../technical/collision-clearance-system.md) | §Overview | cell=500mm, padding=150mm |

---

## ส่วนที่ 3: Workflow → Document Flow

### 3.1 Design to Manufacturing Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DESIGN → MANUFACTURING WORKFLOW                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. PARAMETRIC DESIGN                                                        │
│     └── parametric-cabinet-calculations.md                                   │
│         ├── Cabinet dimensions                                               │
│         ├── Panel sizes                                                      │
│         └── Output: Cutlist                                                  │
│                  │                                                           │
│                  ▼                                                           │
│  2. HARDWARE SELECTION                                                       │
│     └── master-hardware-database.md                                          │
│         ├── Select runners (MOVENTO/LEGRABOX)                                │
│         ├── Select hinges                                                    │
│         └── Output: Hardware BOM                                             │
│                  │                                                           │
│                  ▼                                                           │
│  3. DRAWER/DOOR ENGINEERING                                                  │
│     └── door-drawer-complete-guide.md                                        │
│         ├── Calculate door sizes                                             │
│         ├── Calculate drawer box sizes                                       │
│         └── Output: Component dimensions                                     │
│                  │                                                           │
│                  ▼                                                           │
│  4. CUT OPTIMIZATION                                                         │
│     └── cut-optimization-algorithms.md                                       │
│         ├── Nest parts on sheets                                             │
│         ├── Minimize waste                                                   │
│         └── Output: Cutting layout                                           │
│                  │                                                           │
│                  ▼                                                           │
│  5. DRILLING PATTERNS                                                        │
│     └── hardware-drilling-specifications.md                                  │
│         ├── Generate drilling positions                                      │
│         ├── Apply System 32                                                  │
│         └── Output: CNC drilling program                                     │
│                  │                                                           │
│                  ▼                                                           │
│  6. DXF EXPORT                                                               │
│     └── dxf-export-specs.md                                                  │
│         ├── Layer naming                                                     │
│         ├── Format conversion                                                │
│         └── Output: DXF files for CNC                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Curved Panel Flow (Kerf Bending)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CURVED PANEL WORKFLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Design curved component                                                  │
│     └── parametric-cabinet-calculations.md (radius, arc length)             │
│                  │                                                           │
│                  ▼                                                           │
│  2. Calculate kerf pattern                                                   │
│     └── kerf-bending-algorithms.md (spacing, depth)                         │
│                  │                                                           │
│                  ▼                                                           │
│  3. Add to cut optimization                                                  │
│     └── cut-optimization-algorithms.md (include kerf waste)                 │
│                  │                                                           │
│                  ▼                                                           │
│  4. Generate CNC program                                                     │
│     └── hardware-drilling-specifications.md (kerf cuts)                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ส่วนที่ 4: Common Questions → Answers

### 4.1 Quick Lookup

| Question | Answer Location |
|----------|-----------------|
| "What's the drawer width for MOVENTO?" | [formula-reference.md §1](./formula-reference.md#1-drawer-width-calculations) → LW - 42mm |
| "What's the drawer width for standard slides?" | [formula-reference.md §1](./formula-reference.md#1-drawer-width-calculations) → Opening - 26mm |
| "What kerf width for bending?" | [formula-reference.md §2](./formula-reference.md#2-kerf-width-clarification) → 3.0-3.5mm |
| "What kerf width for CNC routing?" | [formula-reference.md §2](./formula-reference.md#2-kerf-width-clarification) → 6-10mm |
| "Blum runner SKU for 500mm?" | [master-hardware-database.md §1.1](./master-hardware-database.md) → 760H5000S |
| "Häfele Minifix 15 cam part number?" | [master-hardware-database.md §2.1](./master-hardware-database.md) → 262.26.034 |
| "How many hinges for 1200mm door?" | [formula-reference.md §5.2](./formula-reference.md#5-hinge-position-formulas) → 3-4 hinges |
| "Sleeve height for B24 bolt?" | [formula-reference.md §6.1](./formula-reference.md#6-minifix-joint-formulas) → 14mm (B - 10) |
| "LEGRABOX height code for 180mm front?" | [formula-reference.md §7.3](./formula-reference.md#7-legrabox-cutlist-formulas) → K |
| "Is Blum hinge compatible with Häfele?" | [master-hardware-database.md §3](./master-hardware-database.md) → Yes (same 35mm boring) |

---

## ส่วนที่ 5: Authoritative Source Matrix

### 5.1 Which Document is Authoritative?

| Topic | Authoritative Source | Other Documents |
|-------|---------------------|-----------------|
| **Hardware SKUs** | master-hardware-database.md | Import only |
| **Calculation formulas** | formula-reference.md | Reference only |
| **Drilling patterns** | hardware-drilling-specifications.md | — |
| **Door/Drawer sizing** | door-drawer-complete-guide.md | — |
| **Cabinet dimensions** | parametric-cabinet-calculations.md | — |
| **Cut nesting** | cut-optimization-algorithms.md | — |
| **Kerf patterns** | kerf-bending-algorithms.md | — |

### 5.2 Conflict Resolution

```
If you find conflicting information between documents:

1. Check formula-reference.md first (consolidated formulas)
2. Check master-hardware-database.md for hardware specs
3. The reference/ folder documents take precedence
4. Report conflicts to update the authoritative source
```

---

## ส่วนที่ 6: Version Tracking

### 6.1 Document Versions

| Document | Version | Last Updated | Architecture |
|----------|---------|--------------|--------------|
| master-hardware-database.md | 1.0.0 | 2026-01-10 | — |
| formula-reference.md | 1.0.0 | 2026-01-10 | — |
| cross-reference-index.md | 1.0.0 | 2026-01-10 | — |
| hardware-drilling-specifications.md | 1.0 | 2026-01-10 | v2.5-v14.0 |
| door-drawer-complete-guide.md | 1.0 | 2026-01-10 | v12.0 |
| parametric-cabinet-calculations.md | 1.0 | 2026-01-10 | — |
| cut-optimization-algorithms.md | 1.0 | 2026-01-10 | — |
| kerf-bending-algorithms.md | 1.0 | 2026-01-10 | — |

### 6.2 Architecture Version Notes

```
The internal "Architecture v11.0", "v12.0", "v14.0" references in documents
refer to design iterations for specific subsystems:

- v12.0: LEGRABOX Kinetics Engine
- v14.0: Blum Wooden Drawer System
- v11.0: MOVENTO Runner Integration
- v2.5-v3.5: Minifix/Joint Systems

These are NOT document versions but feature/design version numbers.
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-10 | Initial creation |

---

**Quick Links:**
- [Master Hardware Database](./master-hardware-database.md)
- [Formula Reference](./formula-reference.md)
- [Hardware Drilling Specifications](../manufacturing/hardware-drilling-specifications.md)
- [Door & Drawer Complete Guide](../manufacturing/door-drawer-complete-guide.md)
- [Parametric Cabinet Calculations](../technical/parametric-cabinet-calculations.md)
