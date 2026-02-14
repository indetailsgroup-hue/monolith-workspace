# DXF Export Specifications

**Project:** MONOLITH Designer Workspace v2.0
**Document Version:** 1.0
**Date:** 2026-01-10
**Status:** Active

---

## Table of Contents

1. [Overview](#overview)
2. [DXF Format Structure](#dxf-format-structure)
3. [Layer Definitions](#layer-definitions)
4. [Entity Types](#entity-types)
5. [Coordinate System](#coordinate-system)
6. [Panel Layout Strategy](#panel-layout-strategy)
7. [Operation Encoding](#operation-encoding)
8. [Machine Profiles](#machine-profiles)
9. [Validation Rules](#validation-rules)
10. [Implementation Guide](#implementation-guide)

---

## 1. Overview

### 1.1 Purpose

The DXF (Drawing Exchange Format) export feature converts cabinet design data into machine-readable files for CNC routers and panel saws. This document defines the exact specifications for generating DXF files that are compatible with Thai furniture manufacturing equipment.

### 1.2 Target Machines

| Machine Type | Brand/Model | Layer Support | Special Requirements |
|--------------|-------------|---------------|---------------------|
| **CNC Router** | SCM Accord, Homag BMG | Full | Requires drilling operations on separate layer |
| **Panel Saw** | Holzher, Altendorf | OUTLINE only | Requires optimization pattern |
| **Edge Bander** | Homag KAL, IMA | EDGE layer | Edge sequence matters |
| **Drilling Machine** | Gannomat, Morbidelli | DRILL layer | 32mm system holes |

### 1.3 DXF Version

**Target Version:** AutoCAD R2018 DXF (AC1032)

**Reasons:**
- ✅ Wide compatibility with CNC software
- ✅ Supports all entity types we need
- ✅ UTF-8 text encoding (Thai language support)
- ✅ Stable specification (no breaking changes)

---

## 2. DXF Format Structure

### 2.1 File Header

```dxf
  0
SECTION
  2
HEADER
  9
$ACADVER
  1
AC1032
  9
$INSUNITS
 70
     4
  9
$MEASUREMENT
 70
     1
  0
ENDSEC
```

**Key Settings:**
- `$ACADVER`: AC1032 (AutoCAD 2018)
- `$INSUNITS`: 4 (Millimeters)
- `$MEASUREMENT`: 1 (Metric)

### 2.2 Tables Section

```dxf
  0
SECTION
  2
TABLES
  0
TABLE
  2
LAYER
 70
    10
  0
LAYER
  2
OUTLINE
 70
     0
 62
     7
  6
CONTINUOUS
  0
LAYER
  2
DRILL
 70
     0
 62
     1
  6
CONTINUOUS
  0
ENDTAB
  0
ENDSEC
```

### 2.3 Entities Section

```dxf
  0
SECTION
  2
ENTITIES
  0
LWPOLYLINE
  8
OUTLINE
 90
     4
 70
     1
 10
0.0
 20
0.0
 10
600.0
 20
0.0
 10
600.0
 20
720.0
 10
0.0
 20
720.0
  0
CIRCLE
  8
DRILL
 10
37.0
 20
37.0
 40
2.5
  0
ENDSEC
```

---

## 3. Layer Definitions

### 3.1 Standard Layers

| Layer Name | Color | Line Type | Purpose | Required |
|-----------|-------|-----------|---------|----------|
| **OUTLINE** | White (7) | Continuous | Panel perimeter cutting path | ✅ Yes |
| **DRILL** | Red (1) | Continuous | Drilling operations (circles) | ✅ Yes |
| **GROOVE** | Yellow (2) | Continuous | Grooving operations (polylines) | ❌ Optional |
| **EDGE_TOP** | Cyan (4) | Continuous | Top edge banding path | ❌ Optional |
| **EDGE_BOTTOM** | Cyan (4) | Continuous | Bottom edge banding path | ❌ Optional |
| **EDGE_LEFT** | Cyan (4) | Continuous | Left edge banding path | ❌ Optional |
| **EDGE_RIGHT** | Cyan (4) | Continuous | Right edge banding path | ❌ Optional |
| **TEXT** | Green (3) | Continuous | Panel ID, grain direction | ❌ Optional |
| **DIMENSIONS** | Magenta (6) | Continuous | Reference dimensions | ❌ Optional |

### 3.2 Custom Layers (Extended)

| Layer Name | Purpose | Usage |
|-----------|---------|-------|
| **PANEL_{ID}** | Group all entities for a specific panel | Multi-panel exports |
| **HINGE_35MM** | 35mm hinge holes (Ø35mm, depth 12mm) | Door panels |
| **SHELF_PIN_5MM** | Shelf pin holes (Ø5mm, depth 10mm) | Side panels |
| **CONFIRMAT_7MM** | Confirmat screw holes (Ø7mm, depth 50mm) | Assembly |
| **DOWEL_8MM** | Dowel holes (Ø8mm, depth 40mm) | Traditional joinery |

### 3.3 Layer Properties

```typescript
interface LayerDefinition {
  name: string
  color: number // ACI color index (1-255)
  lineType: 'CONTINUOUS' | 'DASHED' | 'DOTTED'
  lineWeight: number // 0.00 - 2.11 mm
  plotStyle: string
  description: string
}

const LAYERS: LayerDefinition[] = [
  {
    name: 'OUTLINE',
    color: 7, // White
    lineType: 'CONTINUOUS',
    lineWeight: 0.25,
    plotStyle: 'Normal',
    description: 'Panel cutting perimeter'
  },
  {
    name: 'DRILL',
    color: 1, // Red
    lineType: 'CONTINUOUS',
    lineWeight: 0.13,
    plotStyle: 'Normal',
    description: 'Drilling operations (all diameters)'
  },
  // ... more layers
]
```

---

## 4. Entity Types

### 4.1 LWPOLYLINE (Panel Outline)

**Purpose:** Define panel perimeter for cutting.

```dxf
  0
LWPOLYLINE
  8
OUTLINE
 90
     4
 70
     1
 43
0.0
 10
0.0
 20
0.0
 10
600.0
 20
0.0
 10
600.0
 20
720.0
 10
0.0
 20
720.0
```

**Group Codes:**
- `0`: Entity type (LWPOLYLINE)
- `8`: Layer name
- `90`: Number of vertices
- `70`: Polyline flag (1 = closed)
- `10`: X coordinate
- `20`: Y coordinate

**Requirements:**
- ✅ Must be closed (flag 70 = 1)
- ✅ Vertices in clockwise order
- ✅ First vertex = last vertex (closed path)
- ✅ No self-intersecting paths

### 4.2 CIRCLE (Drilling Operations)

**Purpose:** Represent drill holes.

```dxf
  0
CIRCLE
  8
DRILL
 10
37.0
 20
37.0
 40
2.5
```

**Group Codes:**
- `0`: Entity type (CIRCLE)
- `8`: Layer name
- `10`: Center X
- `20`: Center Y
- `40`: Radius (half of diameter)

**Standard Diameters:**
- Hinge: 35mm (Ø35)
- Shelf pins: 5mm (Ø5)
- Confirmat: 7mm (Ø7)
- Dowel: 8mm (Ø8)

### 4.3 LINE (Groove/Dado)

**Purpose:** Represent grooves for back panels or shelves.

```dxf
  0
LINE
  8
GROOVE
 10
50.0
 20
0.0
 11
50.0
 21
720.0
```

**Group Codes:**
- `10, 20`: Start point (X, Y)
- `11, 21`: End point (X, Y)

### 4.4 TEXT (Annotations)

**Purpose:** Panel identification, grain direction.

```dxf
  0
TEXT
  8
TEXT
 10
300.0
 20
360.0
 40
20.0
  1
PANEL-001
 50
0.0
 72
     1
 73
     2
```

**Group Codes:**
- `10, 20`: Insertion point
- `40`: Text height
- `1`: Text string
- `50`: Rotation angle
- `72`: Horizontal justification (1 = center)
- `73`: Vertical justification (2 = middle)

**Standard Annotations:**
- Panel ID: `PANEL-{role}-{index}` (e.g., `PANEL-LEFT-001`)
- Grain direction: `GRAIN: ↑` or `GRAIN: →`
- Material code: `MAT: PB18-MEL-WHITE`

---

## 5. Coordinate System

### 5.1 Origin and Orientation

```
Y (Height)
↑
|
|     ┌─────────────────┐
|     │                 │
|     │   PANEL FACE    │
|     │   (Front View)  │
|     │                 │
|     └─────────────────┘
|
└────────────────────────→ X (Width)
(0,0)
```

**Rules:**
- ✅ Origin (0,0) = Bottom-left corner of panel
- ✅ X-axis = Panel width direction
- ✅ Y-axis = Panel height direction
- ✅ All coordinates are positive
- ✅ Units = Millimeters

### 5.2 Panel Orientation

**Front Face = Visible face when installed**

```
TOP edge
   ↓
┌──────────────┐
│              │ ← RIGHT edge
│   PANEL      │
│   FRONT      │
│              │ ← LEFT edge
└──────────────┘
   ↑
BOTTOM edge
```

**Grain Direction:**
- Vertical panels (doors, sides): Grain runs vertically (Y-axis)
- Horizontal panels (shelves, tops): Grain runs horizontally (X-axis)

### 5.3 Multi-Panel Layout

**Nesting Strategy:**

```
┌────────────┬──────┬──────┐
│            │      │      │
│  PANEL 1   │ P2   │ P3   │
│  600×720   │300×  │300×  │
│            │720   │720   │
└────────────┴──────┴──────┘
   ↑                  ↑
 (0,0)         (600,0) (900,0)

Each panel offset by previous panel width + GAP
```

**Gap between panels:** 10mm (saw kerf + safety margin)

---

## 6. Panel Layout Strategy

### 6.1 Single Panel Export

**Use Case:** Export one panel at a time for immediate cutting.

```typescript
interface PanelExportOptions {
  panelId: string
  includeAnnotations: boolean
  includeDimensions: boolean
  origin: { x: number; y: number } // Usually (0, 0)
}
```

**Output:** One DXF file per panel
- Filename: `{projectName}_{panelRole}_{index}.dxf`
- Example: `Kitchen-Upper-01_LEFT_001.dxf`

### 6.2 Nested Panel Export

**Use Case:** Optimize material usage by nesting multiple panels on a sheet.

```typescript
interface NestedExportOptions {
  sheetWidth: number // e.g., 2440mm (standard board width)
  sheetHeight: number // e.g., 1220mm (standard board height)
  gap: number // Minimum gap between panels (default: 10mm)
  algorithm: 'FIRST_FIT' | 'BEST_FIT' | 'GUILLOTINE'
}
```

**Nesting Algorithms:**

1. **FIRST_FIT:** Place panels in order, left to right, top to bottom
2. **BEST_FIT:** Place largest panels first, fill gaps with smaller panels
3. **GUILLOTINE:** Recursive binary splitting for optimal cutting path

**Output:** One DXF file with all panels
- Filename: `{projectName}_nested_sheet{N}.dxf`
- Each panel on separate layer or grouped by panel ID

### 6.3 Sheet Optimization

```typescript
interface SheetOptimization {
  totalSheets: number
  efficiency: number // 0-1 (material utilization)
  waste: number // mm² of unused material
  layout: PanelPlacement[]
}

interface PanelPlacement {
  panelId: string
  sheetIndex: number
  position: { x: number; y: number }
  rotation: 0 | 90 // Degrees (0 = no rotation, 90 = rotated)
}
```

---

## 7. Operation Encoding

### 7.1 Drilling Operations

#### Standard Hole Types

```typescript
enum HoleType {
  HINGE_35 = 'hinge-35mm',
  SHELF_PIN_5 = 'shelf-pin-5mm',
  SHELF_PIN_8 = 'shelf-pin-8mm',
  CONFIRMAT_7 = 'confirmat-7mm',
  DOWEL_8 = 'dowel-8mm',
  CUSTOM = 'custom'
}

interface DrillingOperation {
  type: HoleType
  position: { x: number; y: number }
  diameter: number // mm
  depth: number // mm (0 = through hole)
  angle: number // degrees (0 = perpendicular, 90 = horizontal)
}
```

#### Hinge Holes (35mm Blum System)

```
Standard Pattern (Overlay Door):

     37mm from top edge
        ↓
    ┌───────────┐
    │   ●       │ ← Ø35mm, depth 12mm
    │           │
    │           │
    │           │
    │   ●       │
    │           │
    └───────────┘
    ↑
    37mm from edge
```

**DXF Encoding:**

```dxf
  0
CIRCLE
  8
HINGE_35MM
 10
37.0
 20
37.0
 40
17.5
  0
CIRCLE
  8
HINGE_35MM
 10
37.0
 20
683.0
 40
17.5
```

#### Shelf Pin Holes (32mm System)

```
32mm system grid:

│←32→│←32→│←32→│
┌────┬────┬────┐
│ ●  │ ●  │ ●  │
├────┼────┼────┤
│ ●  │ ●  │ ●  │
├────┼────┼────┤
│ ●  │ ●  │ ●  │
└────┴────┴────┘

Vertical spacing: 32mm
Horizontal offset: 37mm from front edge
```

**DXF Encoding:**

```dxf
  0
CIRCLE
  8
SHELF_PIN_5MM
 10
37.0
 20
96.0
 40
2.5
  0
CIRCLE
  8
SHELF_PIN_5MM
 10
37.0
 20
128.0
 40
2.5
```

### 7.2 Grooving Operations

**Use Case:** Back panel groove, shelf dado.

```typescript
interface GrooveOperation {
  type: 'BACK_PANEL' | 'SHELF_DADO'
  startPoint: { x: number; y: number }
  endPoint: { x: number; y: number }
  width: number // mm (usually 3-5mm for back panel)
  depth: number // mm (usually 10-12mm)
  offset: number // mm from edge (usually 10mm)
}
```

**DXF Encoding:**

```dxf
  0
LINE
  8
GROOVE
 10
10.0
 20
0.0
 11
10.0
 21
720.0
 39
3.0
```

**Group Code 39:** Line thickness (represents groove width)

### 7.3 Edge Banding Encoding

**Method 1: Separate Layers per Edge**

```dxf
  0
LINE
  8
EDGE_TOP
 10
0.0
 20
720.0
 11
600.0
 21
720.0
```

**Method 2: Extended Entity Data (XDATA)**

```dxf
  0
LINE
  8
OUTLINE
 10
0.0
 20
720.0
 11
600.0
 21
720.0
1001
MONOLITH
1000
EDGE
1070
     1
1000
PVC_WHITE_1MM
```

**XDATA Structure:**
- `1001`: Application name (`MONOLITH`)
- `1000`: String value (`EDGE`)
- `1070`: Integer (1 = apply edge banding)
- `1000`: Material code

---

## 8. Machine Profiles

### 8.1 Profile Definition

```typescript
interface MachineProfile {
  id: string
  name: string
  manufacturer: string
  model: string
  capabilities: MachineCapabilities
  constraints: MachineConstraints
  exportSettings: ExportSettings
}

interface MachineCapabilities {
  maxSheetWidth: number // mm
  maxSheetHeight: number // mm
  minCutWidth: number // mm
  maxDrillDiameter: number // mm
  minDrillDiameter: number // mm
  maxDrillDepth: number // mm
  supportsAngledDrilling: boolean
  supportsGrooving: boolean
  toolChangeAutomatic: boolean
}

interface MachineConstraints {
  minEdgeDistance: number // mm (min distance from hole to edge)
  minHoleSpacing: number // mm (min distance between holes)
  sawKerf: number // mm (blade thickness)
  tolerance: number // mm (+/- cutting tolerance)
}
```

### 8.2 Standard Profiles

#### Profile 1: SCM Accord CNC Router

```json
{
  "id": "scm-accord-25fx",
  "name": "SCM Accord 25 FX",
  "manufacturer": "SCM Group",
  "model": "Accord 25 FX",
  "capabilities": {
    "maxSheetWidth": 3200,
    "maxSheetHeight": 1600,
    "minCutWidth": 50,
    "maxDrillDiameter": 35,
    "minDrillDiameter": 3,
    "maxDrillDepth": 100,
    "supportsAngledDrilling": true,
    "supportsGrooving": true,
    "toolChangeAutomatic": true
  },
  "constraints": {
    "minEdgeDistance": 10,
    "minHoleSpacing": 5,
    "sawKerf": 4.5,
    "tolerance": 0.1
  },
  "exportSettings": {
    "layers": ["OUTLINE", "DRILL", "GROOVE"],
    "coordinateSystem": "BOTTOM_LEFT",
    "units": "MM"
  }
}
```

#### Profile 2: Homag BMG CNC

```json
{
  "id": "homag-bmg-512",
  "name": "Homag BMG 512",
  "manufacturer": "Homag Group",
  "model": "BMG 512",
  "capabilities": {
    "maxSheetWidth": 5200,
    "maxSheetHeight": 1600,
    "minCutWidth": 50,
    "maxDrillDiameter": 35,
    "minDrillDiameter": 5,
    "maxDrillDepth": 60,
    "supportsAngledDrilling": false,
    "supportsGrooving": true,
    "toolChangeAutomatic": true
  },
  "constraints": {
    "minEdgeDistance": 15,
    "minHoleSpacing": 10,
    "sawKerf": 5.0,
    "tolerance": 0.15
  }
}
```

### 8.3 Profile Selection UI

```tsx
function MachineProfileSelector() {
  const [selectedProfile, setSelectedProfile] = useState<string>('scm-accord-25fx')
  const profiles = useMachineProfiles()

  return (
    <select value={selectedProfile} onChange={e => setSelectedProfile(e.target.value)}>
      {profiles.map(profile => (
        <option key={profile.id} value={profile.id}>
          {profile.name} ({profile.manufacturer})
        </option>
      ))}
    </select>
  )
}
```

---

## 9. Validation Rules

### 9.1 Pre-Export Validation

```typescript
interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

function validateForDXFExport(
  cabinet: Cabinet,
  profile: MachineProfile
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  cabinet.panels.forEach(panel => {
    // Check panel dimensions
    if (panel.dimensions.width > profile.capabilities.maxSheetWidth) {
      errors.push({
        type: 'DIMENSION_EXCEEDED',
        message: `Panel ${panel.id} width exceeds machine capacity`,
        panelId: panel.id
      })
    }

    // Check edge distances
    panel.operations.forEach(op => {
      if (op.type === 'DRILL') {
        const distanceFromEdge = Math.min(
          op.position.x,
          panel.dimensions.width - op.position.x,
          op.position.y,
          panel.dimensions.height - op.position.y
        )

        if (distanceFromEdge < profile.constraints.minEdgeDistance) {
          warnings.push({
            type: 'EDGE_DISTANCE',
            message: `Hole at (${op.position.x}, ${op.position.y}) is too close to edge`,
            panelId: panel.id
          })
        }
      }
    })
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}
```

### 9.2 Validation Checklist

| Check | Severity | Description |
|-------|----------|-------------|
| **Panel size** | Error | Panel dimensions within machine capacity |
| **Hole edge distance** | Warning | Holes at least 10mm from edge |
| **Hole spacing** | Warning | Holes at least 5mm apart |
| **Through holes** | Info | Through holes require backing board |
| **Grain direction** | Info | Ensure grain direction is marked |
| **Material thickness** | Error | Drill depth doesn't exceed thickness |

---

## 10. Implementation Guide

### 10.1 DXF Writer Class

```typescript
class DXFWriter {
  private entities: string[] = []
  private layers: Map<string, Layer> = new Map()

  constructor(private units: 'MM' | 'INCH' = 'MM') {}

  addLayer(name: string, color: number): void {
    this.layers.set(name, { name, color, lineType: 'CONTINUOUS' })
  }

  addPolyline(layer: string, points: Point[], closed: boolean): void {
    let dxf = `  0\nLWPOLYLINE\n  8\n${layer}\n 90\n${points.length}\n 70\n${closed ? 1 : 0}\n`
    points.forEach(p => {
      dxf += ` 10\n${p.x.toFixed(1)}\n 20\n${p.y.toFixed(1)}\n`
    })
    this.entities.push(dxf)
  }

  addCircle(layer: string, center: Point, radius: number): void {
    const dxf = `  0\nCIRCLE\n  8\n${layer}\n 10\n${center.x.toFixed(1)}\n 20\n${center.y.toFixed(1)}\n 40\n${radius.toFixed(1)}\n`
    this.entities.push(dxf)
  }

  addText(layer: string, position: Point, text: string, height: number): void {
    const dxf = `  0\nTEXT\n  8\n${layer}\n 10\n${position.x.toFixed(1)}\n 20\n${position.y.toFixed(1)}\n 40\n${height.toFixed(1)}\n  1\n${text}\n`
    this.entities.push(dxf)
  }

  toString(): string {
    return this.generateHeader() +
           this.generateTables() +
           this.generateEntities() +
           this.generateFooter()
  }

  toBlob(): Blob {
    return new Blob([this.toString()], { type: 'application/dxf' })
  }

  private generateHeader(): string {
    return `  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1032\n  9\n$INSUNITS\n 70\n     4\n  0\nENDSEC\n`
  }

  private generateTables(): string {
    let tables = `  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nLAYER\n 70\n${this.layers.size}\n`

    this.layers.forEach(layer => {
      tables += `  0\nLAYER\n  2\n${layer.name}\n 70\n     0\n 62\n${layer.color}\n  6\n${layer.lineType}\n`
    })

    tables += `  0\nENDTAB\n  0\nENDSEC\n`
    return tables
  }

  private generateEntities(): string {
    return `  0\nSECTION\n  2\nENTITIES\n${this.entities.join('')}  0\nENDSEC\n`
  }

  private generateFooter(): string {
    return `  0\nEOF\n`
  }
}
```

### 10.2 Usage Example

```typescript
async function exportCabinetToDXF(cabinet: Cabinet): Promise<Blob> {
  const writer = new DXFWriter('MM')

  // Add layers
  writer.addLayer('OUTLINE', 7)
  writer.addLayer('DRILL', 1)
  writer.addLayer('TEXT', 3)

  cabinet.panels.forEach(panel => {
    // Panel outline
    const outline = [
      { x: 0, y: 0 },
      { x: panel.dimensions.width, y: 0 },
      { x: panel.dimensions.width, y: panel.dimensions.height },
      { x: 0, y: panel.dimensions.height }
    ]
    writer.addPolyline('OUTLINE', outline, true)

    // Drilling operations
    panel.operations
      .filter(op => op.type === 'DRILL')
      .forEach(op => {
        writer.addCircle('DRILL', op.position, op.dimensions!.width / 2)
      })

    // Panel ID text
    writer.addText(
      'TEXT',
      { x: panel.dimensions.width / 2, y: panel.dimensions.height / 2 },
      panel.id,
      20
    )
  })

  return writer.toBlob()
}
```

### 10.3 Download Handler

```typescript
function downloadDXF(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Usage
const dxfBlob = await exportCabinetToDXF(cabinet)
downloadDXF(dxfBlob, 'Kitchen-Upper-01.dxf')
```

---

## 11. Testing & Quality Assurance

### 11.1 Test Cases

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| DXF-001 | Export single panel with outline only | Valid DXF, opens in AutoCAD |
| DXF-002 | Export panel with 35mm hinge holes | Circles at correct positions |
| DXF-003 | Export nested panels (3 panels) | All panels visible, correct spacing |
| DXF-004 | Export with Thai text annotations | UTF-8 encoding, readable text |
| DXF-005 | Export with groove operations | Lines on GROOVE layer |
| DXF-006 | Validate edge distances | No holes closer than 10mm |
| DXF-007 | Validate material efficiency | Efficiency > 80% |

### 11.2 Validation Tools

**AutoCAD Validation:**
```bash
# Open DXF in AutoCAD and run:
AUDIT
PURGE
```

**Online Validators:**
- [DXF Validator](https://www.autodesk.com/products/autocad/dxf)
- [ShareCAD.org](https://sharecad.org/) - Online viewer

---

## 12. Future Enhancements

### 12.1 Planned Features (Phase 3)

- [ ] G-Code export (direct CNC control)
- [ ] 3D DXF export (include Z-depth for drilling)
- [ ] Automatic tool path optimization
- [ ] Multi-sheet optimization with genetic algorithms
- [ ] Real-time preview of nested layout
- [ ] Integration with MES (Manufacturing Execution System)

### 12.2 Advanced Operations

- [ ] Angled drilling (for Euro hinges)
- [ ] Pocket milling (for handles)
- [ ] Edge profiling (router bits)
- [ ] Laminate trimming paths

---

## 13. References

1. [AutoCAD DXF Reference (Autodesk)](https://help.autodesk.com/view/OARX/2024/ENU/)
2. [DXF Format Specification](https://images.autodesk.com/adsk/files/autocad_2012_pdf_dxf-reference_enu.pdf)
3. [CNC Programming Handbook](https://www.cnccookbook.com/)
4. [Homag woodWOP Documentation](https://www.homag.com/)
5. [32mm System Standards (European Cabinet Making)](https://www.cabinetmakerfdm.com/32mm-system/)

---

**Document Control:**
- **Version:** 1.0
- **Last Updated:** 2026-01-10
- **Next Review:** 2026-04-10
- **Owner:** MONOLITH Manufacturing Team
- **Status:** ✅ Active
