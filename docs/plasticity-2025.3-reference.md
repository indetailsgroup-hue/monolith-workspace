# Plasticity 2025.3 Complete Reference
## DNA for Monolith Implementation

**Version:** 2025.3
**Source:** https://github.com/KioArts/plasticity-document-revisions
**Date:** January 2026

---

# Table of Contents

1. [Keyboard Shortcuts Master Reference](#1-keyboard-shortcuts-master-reference)
2. [Polymorphic Commands](#2-polymorphic-commands)
3. [In-Command Keyboard Shortcuts](#3-in-command-keyboard-shortcuts)
4. [Curve Commands](#4-curve-commands)
5. [Solid Commands](#5-solid-commands)
6. [CAD Essentials](#6-cad-essentials)
7. [Implementation Guide for Monolith](#7-implementation-guide-for-monolith)

---

# 1. Keyboard Shortcuts Master Reference

## 1.1 Transform Commands

| Shortcut | Command | Description |
|----------|---------|-------------|
| `G` | Move | Move selected objects freely |
| `R` | Rotate | Rotate selected objects |
| `S` | Scale | Scale selected objects |
| `Shift+G` | Slide | Slide CVs along curve/surface |

### Axis Constraints (During Transform)
| Shortcut | Constraint |
|----------|------------|
| `X` | Lock to X axis |
| `Y` | Lock to Y axis |
| `Z` | Lock to Z axis |
| `Shift+X` | Lock to YZ plane |
| `Shift+Y` | Lock to XZ plane |
| `Shift+Z` | Lock to XY plane |

## 1.2 Core Modeling Commands

| Shortcut | Command | Type | Description |
|----------|---------|------|-------------|
| `E` | Extrude | Direct | Extrude regions/curves/faces |
| `L` | Loft | Direct | Loft between profiles |
| `P` | Pipe | Direct | Create pipe along curve (not precise) |
| `Shift+P` | Sweep | Direct | Sweep profile along path (precise) |
| `B` | Fillet | Polymorphic | Fillet curves/vertices/edges |
| `C` | Cut | Direct | Cut solids with curves/faces |
| `Q` | Boolean | Direct | Union/Difference/Intersection |
| `T` | Trim | Direct | Trim curves/surfaces |
| `I` | Project | Polymorphic | Project curves/bodies |
| `J` | Join | Polymorphic | Join curves/sheets |
| `O` | Offset | Polymorphic | Offset curves/edges/faces |

## 1.3 Modification Commands

| Shortcut | Command | Description |
|----------|---------|-------------|
| `Shift+S` | Raise Degree | Increase curve/surface degree |
| `Shift+I` | Imprint | Imprint curves onto bodies |
| `Shift+Backspace` | Delete Face | Remove faces from solid |
| `Ctrl+R` | Isoparam | Add isoparam lines to surface |
| `Alt+S` | Subdivide Curve | Subdivide curve segments |

## 1.4 Undo Operations

| Shortcut | Command | Description |
|----------|---------|-------------|
| `Alt+J` | Unjoin | Unjoin curves/faces/shells |
| `Alt+T` | Untrim | Restore original trimmed surface |
| `Alt+D` | Alternative Duplicate | Duplicate and project |

## 1.5 View Commands

| Shortcut | Command | Description |
|----------|---------|-------------|
| `H` | Hide Selected | Hide selected objects |
| `Shift+H` | Hide Unselected | Hide everything except selection |
| `Alt+H` | Unhide All | Show all hidden objects |
| `/` | Focus | Focus camera on selection |
| `.` | Isolate | Isolate selected objects |
| `Alt+Z` | X-Ray Mode | Toggle X-Ray view |
| `Alt+Shift+Z` | Toggle Overlays | Toggle UI overlays |
| `Num 5` | Orthographic | Toggle orthographic view |

## 1.6 Selection Modes

| Shortcut | Mode | Description |
|----------|------|-------------|
| `1` | Object | Select entire objects |
| `2` | Group | Select groups |
| `3` | Face | Select faces |
| `4` | Edge | Select edges |
| `5` | Vertex/CV | Select control vertices |

---

# 2. Polymorphic Commands

Polymorphic commands change behavior based on what is selected.

## 2.1 Fillet (B)

| Selection | Command | Result |
|-----------|---------|--------|
| Curves | Fillet Curve | Round corner between curves |
| Vertices | Fillet Vertex | Round vertex point |
| Edges | Fillet Shell | Round edges of solid |

### Fillet Options
- **Distance**: Fillet radius
- **Shape**: Conic (0-1), Chamfer
- **Continuity**: G1 (tangent), G2 (curvature)

### Fillet Keyboard Shortcuts
| Key | Function |
|-----|----------|
| `Tab` | Toggle Variable mode |
| `D` | Set Distance by mouse |
| `S` | Set Shape by mouse |
| `1/2/3` | Continuity G1/G2/G3 |

## 2.2 Join (J)

| Selection | Command | Result |
|-----------|---------|--------|
| Curves | Join Curves | Merge curves at endpoints |
| Sheets | Join Sheets | Merge sheets at edges |

## 2.3 Offset (O)

| Selection | Command | Result |
|-----------|---------|--------|
| Curves | Offset Planar Curve | Offset in sketch plane |
| Regions | Offset Region | Offset region boundary |
| Edges | Offset Edge | Offset edges on surface |
| Faces | Offset Face Loop | Offset face outline |

### Offset Keyboard Shortcuts
| Key | Function |
|-----|----------|
| `V` | Gap fill (Round/Linear/Natural) |
| `Tab` | Lock equal distances |
| `D` | Set Distance by mouse |
| `I` | Individual mode (faces) |

## 2.4 Project (I)

| Selection | Command | Result |
|-----------|---------|--------|
| Curves → Body | Project Curve Body | Project curve onto body |
| Body → Body | Project Body Body | Project body outline |
| Curve → Curve | Project Curve Curve | Project curve onto curve |

## 2.5 Unjoin (Alt+J)

| Selection | Command | Result |
|-----------|---------|--------|
| Curves | Unjoin Curves | Split at join points |
| Faces | Unjoin Faces | Separate faces from body |
| Solids/Sheets | Unjoin Shells | Explode into faces |

## 2.6 Raise Degree (Shift+S)

| Selection | Command | Result |
|-----------|---------|--------|
| Curves | Raise Curve Degree | Add control vertices |
| Faces | Raise Surface Degree | Add surface CVs |

## 2.7 Rebuild

| Selection | Command | Result |
|-----------|---------|--------|
| Curves | Rebuild Curve | Rebuild with new params |
| Faces | Rebuild Face | Rebuild surface |

## 2.8 Reverse

| Selection | Command | Result |
|-----------|---------|--------|
| Curves | Reverse Curve | Flip curve direction |
| Sheets | Reverse Sheet | Flip surface normal |

---

# 3. In-Command Keyboard Shortcuts

While a command is active, these shortcuts modify behavior.

## 3.1 Universal Shortcuts

| Key | Function | Commands |
|-----|----------|----------|
| `Tab` | Toggle mode/Lock | Most commands |
| `D` | Distance by mouse | Offset, Pipe, Sweep, Extrude |
| `A` | Angle by mouse | Pipe, Sweep, Extrude |
| `F` | Freestyle mode | Transform commands |
| `Ctrl` | Preview toggle | Slide, Deform |

## 3.2 Continuity Shortcuts

| Key | Continuity | Description |
|-----|------------|-------------|
| `G` / `0` | G0 | Position only |
| `1` | G1 | Tangent |
| `2` | G2 | Curvature |
| `3` | G3 | Acceleration |

## 3.3 Boolean Shortcuts (Q)

| Key | Operation |
|-----|-----------|
| `Q` | Union |
| `W` | Difference |
| `Shift+Q` | Intersection |
| `B` | New Body |
| `T` | Keep Tool |

## 3.4 Extrude Shortcuts (E)

| Key | Function |
|-----|----------|
| `D` | Distance |
| `A` | Angle (draft) |
| `Tab` | Both Sides |
| `R` | Region mode |
| `F` | Face mode |
| `Shift+Q/Q/W/B/T` | Boolean ops |

## 3.5 Loft Shortcuts (L)

| Key | Function |
|-----|----------|
| `Tab` | Add to selection |
| `G/1/2` | Continuity at ends |
| `T` | Tension |
| `C` | Cycle start point |

## 3.6 Sweep Shortcuts (Shift+P)

| Key | Function |
|-----|----------|
| `D` | Twist angle |
| `Shift+T` | Thickness |

## 3.7 Pipe Shortcuts (P)

| Key | Function |
|-----|----------|
| `D` | Section size |
| `A` | Rotation angle |
| `Shift+T` | Wall thickness |
| `C` | Custom profile |

## 3.8 Slide Shortcuts (Shift+G)

| Key | Function |
|-----|----------|
| `U` | Slide +U direction |
| `Shift+U` | Slide -U direction |
| `V` | Slide +V direction |
| `Shift+V` | Slide -V direction |
| `N` | Slide Normal direction |

---

# 4. Curve Commands

## 4.1 Fillet Curve

**Shortcut:** `B` (with curves selected)

Creates rounded corners between curves.

**Options:**
- Distance: Fillet radius
- Trim: Auto-trim input curves

## 4.2 Fillet Vertex

**Shortcut:** `B` (with vertices selected)

Rounds vertex points on curves.

## 4.3 Offset Planar Curve

**Shortcut:** `O` (with curves selected)

Offsets curves in sketch plane.

**Keyboard Shortcuts:**
| Key | Function |
|-----|----------|
| `V` | Gap fill mode |
| `Tab` | Lock distances |
| `D` | Distance by mouse |

## 4.4 Join Curves

**Shortcut:** `J` (with curves selected)

Joins curves at their endpoints.

**Options:**
- Tolerance: Max gap to join

## 4.5 Unjoin Curves

**Shortcut:** `Alt+J` (with curves selected)

Splits curves at join points.

## 4.6 Trim

**Shortcut:** `T`

Trims curves at intersections.

**Usage:**
1. Select cutting curves
2. Press T
3. Click portions to remove

## 4.7 Extend Curve

Extends curve end to target.

**Options:**
- Natural: Follow curve curvature
- Linear: Straight extension
- Soft: Gradual blend

## 4.8 Rebuild Curve

Rebuilds curve with new parameters.

**Options:**
- Points: Number of control points
- Degree: Curve degree (1-5)

## 4.9 Raise Curve Degree

**Shortcut:** `Shift+S` (with curves selected)

Increases curve degree without changing shape.

## 4.10 Reverse Curve

Flips curve direction (start ↔ end).

## 4.11 Subdivide Curve

**Shortcut:** `Alt+S`

Subdivides curve into segments.

**Warning:** Destructive operation, cannot undo.

## 4.12 Slide Curve CVs

**Shortcut:** `Shift+G` (with curve CVs selected)

Slides control vertices along curve direction.

## 4.13 Project Curve

**Shortcut:** `I`

Projects curves onto surfaces/bodies.

**Options:**
- Direction: View, Normal, Custom
- Bidirectional: Project both ways

## 4.14 Duplicate Curve and Project

**Shortcut:** `Alt+D`

Duplicates and projects in one operation.

---

# 5. Solid Commands

## 5.1 Extrude

**Shortcut:** `E`

Extrudes regions, curves, or faces.

**Selection → Result:**
| Input | Output |
|-------|--------|
| Region | Solid |
| Curve | Sheet |
| Face | Extended solid |

**Options:**
- Distance 1/2: Start and end distances
- Both Sides: Extrude symmetrically
- Angle: Draft angle

## 5.2 Loft

**Shortcut:** `L`

Creates surface between profiles.

**Options:**
- Continuity: G0/G1/G2 at ends
- Tension: Shape control
- Guides: Guide curves

**Loft Variations:**
- Loft Curves: Basic lofting
- Loft Edges: Loft between edges
- Continuous Loft: Multi-profile
- Loop Loft: Closed loop

## 5.3 Sweep

**Shortcut:** `Shift+P`

Sweeps profile along path (precise).

**Options:**
- Twist: Rotation along path
- Scale: End scale
- Alignment: Parallel/Normal
- Corner: Mitre/Round
- Guides: Guide curves

**Guide Methods:**
- Point: Rotate and scale
- Chord: Rotate only
- Curve: Rotate, contact moves

## 5.4 Pipe

**Shortcut:** `P`

Creates pipe along curve (quick, not precise).

**Options:**
- Section size: Pipe diameter
- Thickness: Wall thickness
- Vertex count: Polygon sides (0 = circle)
- Custom profile: Use regions/curves

**Note:** For precise pipes, use Sweep.

## 5.5 Revolve

Revolves profile around axis.

**Options:**
- Angle: Revolution angle
- Thickness: Wall thickness

## 5.6 Boolean

**Shortcut:** `Q`

Boolean operations between solids.

**Operations:**
| Key | Operation | Description |
|-----|-----------|-------------|
| `Q` | Union | Add together |
| `W` | Difference | Subtract tool |
| `Shift+Q` | Intersection | Keep overlap |

**Options:**
- Keep Tool: Don't consume tool
- New Body: Create separate result

## 5.7 Cut

**Shortcut:** `C`

Cuts solid with curve or face.

**Usage:**
1. Select curves/faces as cutters
2. Press C
3. Select bodies to cut
4. Click regions to keep/remove

## 5.8 Fillet Shell

**Shortcut:** `B` (with edges selected)

Fillets edges of solid.

**Options:**
- Distance: Fillet radius
- Shape: Conic value (0-1)
- Continuity: G1/G2/G3
- Variable: Variable radius

**Fillet Types:**
- Uniform: Same radius
- Conic: Shape control
- Chamfer: Flat bevel
- Variable: Changing radius

## 5.9 Hollow

Creates shell from solid.

**Options:**
- Thickness 1/2: Inside/outside offset
- Open faces: Faces to remove

## 5.10 Offset Face / Push Face

Default command when face is selected.

**Options:**
- Distance: Offset amount
- Angle Adjacent: Draft angle
- Grow: Moving/Fixed/None

**Dependant Offset:**
Select secondary face to match/intersect.

## 5.11 Draft Face

Adds draft angle to faces.

## 5.12 Match Face

Replaces face with another surface.

**Options:**
- Grow: Moving/Fixed/None
- Side: Front face match

## 5.13 Delete Face

**Shortcut:** `Shift+Backspace`

Removes faces from solid, heals if possible.

## 5.14 Imprint

**Shortcut:** `Shift+I`

Imprints curves/bodies onto surfaces.

**Types:**
- Imprint Curve Body: Curve → Body
- Imprint Body Body: Body → Body

## 5.15 Isoparam

**Shortcut:** `Ctrl+R`

Adds isoparam lines to surface.

**Usage:** Click on surface to add lines.

## 5.16 Thicken

Adds thickness to sheet.

**Options:**
- Thickness 1/2: Each side thickness
- Tab: Lock equal distances

## 5.17 Join Sheets

**Shortcut:** `J` (with sheets selected)

Joins sheets at matching edges.

## 5.18 Unjoin Faces

**Shortcut:** `Alt+J` (with faces selected)

Separates faces from body.

## 5.19 Unjoin Shells

**Shortcut:** `Alt+J` (with solids selected)

Explodes solid into individual faces.

## 5.20 Bridge Surface

Bridges gap between edges.

**Options:**
- Continuity: G0/G1/G2
- Tension: Shape control

## 5.21 Patch

Creates surface from boundary.

**Use Cases:**
1. Patch from Curves: Closed curves
2. Patch Holes: Fill holes in surface
3. Patch with Guides: Use guide curves
4. Patch Multiple: Fill multiple holes

**Options:**
- Continuity: Planar/G0/G1/G2
- Faces: Single/Minimal/Quality

## 5.22 Constrained Surface

Creates surface tangent to surrounding.

## 5.23 Extend Sheet

Extends sheet edges.

**Options:**
- Distance: Extension amount
- Type: Natural/Linear/Soft

## 5.24 Untrim

**Shortcut:** `Alt+T`

Restores original untrimmed surface.

**Options:**
- Keep edges: Preserve trim lines

## 5.25 Unwrap Face

Unwraps surface to 2D (UV unwrap).

## 5.26 Deform Solid and Sheet

Deforms geometry using UVN coordinates.

**Options:**
- UVN Space: Deform relative to surface

## 5.27 Remove Fillets From Shell

Removes fillets from solid.

**Options:**
- Max Radius: Only remove up to this size
- Convexity: Any/Convex/Concave

## 5.28 Remove Nominal Surface

Reveals hidden surface spans.

## 5.29 Reverse Sheet

Flips surface normal direction.

## 5.30 Rebuild Face

Rebuilds surface with new parameters.

**Methods:**
1. Explicit Control (Studio): Set degree/spans
2. Tolerance: Auto-fit with tolerance

## 5.31 Raise Surface Degree

**Shortcut:** `Shift+S` (with faces selected)

Adds surface control vertices.

## 5.32 Create Instance

Creates linked copy (reference original).

**Instance vs Duplicate:**
| Type | Memory | Editing |
|------|--------|---------|
| Instance | Shared (light) | Edit original = all change |
| Duplicate | Copied (heavy) | Independent |

## 5.33 Realize Instances

Converts instances to independent copies.

**Warning:** Increases memory usage.

## 5.34 Find Boundary Edges

Finds open edges in sheets.

## 5.35 Toggle Surface Curvature

Shows curvature comb visualization.

**Options:**
- Comb Scale: Adjust visibility

---

# 6. CAD Essentials

## 6.1 NURBS Overview

### What is NURBS?

**Non-Uniform Rational Basis-Splines**

Mathematical model for curves and surfaces.

| Component | Meaning |
|-----------|---------|
| Non-Uniform | Variable knot spacing |
| Rational | Weighted control points |
| Basis-Splines | Piecewise polynomials |

### NURBS Components

#### Control Points (CVs)
- Define shape (like magnets pulling curve)
- Not on curve, but influence it
- More CVs = more control (but complexity)

#### Degree
| Degree | Name | CVs/Span | Use |
|--------|------|----------|-----|
| 1 | Linear | 2 | Straight lines |
| 2 | Quadratic | 3 | Simple curves |
| **3** | **Cubic** | **4** | **Most common** |
| 4 | Quartic | 5 | Smoother |
| 5 | Quintic | 6 | Very smooth |

**Order = Degree + 1**

#### Spans
Segments between knots.

#### Knots
Values dividing parameter space.

#### Weight
CV influence strength.
- Higher = sharper (pulls closer)
- Lower = flatter (less influence)

### NURBS vs Polygons

| Feature | NURBS | Polygons |
|---------|-------|----------|
| Accuracy | Mathematical | Approximate |
| Smoothness | Always smooth | Needs subdivision |
| Scalability | Resolution-independent | More polys needed |
| Use | CAD/CAM/CAE | VFX/Games |

## 6.2 UVN Coordinate System

### What is UVN?

Local coordinate system for surfaces.

| Vector | Type | Direction |
|--------|------|-----------|
| **U** | Tangent | First parametric direction |
| **V** | Tangent | Second parametric (⊥ to U) |
| **N** | Normal | Perpendicular to surface |

### UVN vs XYZ

| Feature | XYZ | UVN |
|---------|-----|-----|
| Type | Global/World | Local/Surface |
| Fixed? | Yes | Changes per point |
| Purpose | Object position | Surface behavior |
| Use | Where objects are | How surfaces work |

### UVN Applications
- Texture mapping
- Lighting/shading calculations
- Surface deformation
- CNC toolpath direction

## 6.3 Continuity (G0/G1/G2/G3)

### What is Continuity?

How smoothly curves/surfaces connect.

### Curve Continuity

| Level | Name | Matches | Visual |
|-------|------|---------|--------|
| **G0** | Position | Position only | May have corner |
| **G1** | Tangent | + Direction | Smooth but kink visible |
| **G2** | Curvature | + Curvature | Smooth reflections |
| **G3** | Acceleration | + Rate of change | Perfect smoothness |

### Surface Continuity

| Level | What Matches |
|-------|--------------|
| G0 | Position only |
| G1 | + Tangent |
| G2 | + Curvature |

### Mathematical Definition

| Level | Derivative | Meaning |
|-------|------------|---------|
| G0 | f(x) | Functions meet |
| G1 | f'(x) equal | Same slope |
| G2 | f''(x) equal | Same curvature |
| G3 | f'''(x) equal | Same acceleration |

### Visual Analysis

| Method | Shows |
|--------|-------|
| Zebra Stripes | Reflection quality |
| Curvature Comb | Curvature distribution |
| Environment Map | Overall smoothness |

### Industry Standards

| Class | Visibility | Minimum |
|-------|------------|---------|
| Class A | User-facing | G2+ |
| Class B | Sometimes visible | G1+ |
| Body/White | Hidden | G0+ |

## 6.4 Fillet Order of Operations

### Basic Rule: Large → Small

**Always** apply larger fillets before smaller ones.

```
✅ Correct: 200mm → 100mm → 50mm
❌ Wrong: 50mm → 100mm → 200mm
```

### Why?
- Larger fillets establish geometry
- Smaller fillets fit into larger
- Reverse causes bad corners

### Equal-Sized Fillets

When all fillets are same size:
1. Evaluate angles between surfaces
2. Apply to **larger/open angles first**
3. Then tighter angles

## 6.5 Studio License Features

These commands require Studio License:

| Command | Function |
|---------|----------|
| **Align** | Align objects precisely |
| **Square** | xNURBS quad surfaces |
| **XNurbs** | N-sided high-quality surfaces |
| **Rebuild Face (Explicit)** | Manual degree/spans |

---

# 7. Implementation Guide for Monolith

## 7.1 Phase 1: Core Transform (Implemented ✅)

```typescript
// Already implemented
G = Move cabinet
R = Rotate cabinet 90°
Delete = Remove cabinet
Ctrl+D = Duplicate cabinet
```

## 7.2 Phase 2: View Controls (Priority)

```typescript
// To implement
H = Hide selected cabinets
Shift+H = Hide unselected
Alt+H = Unhide all
/ = Focus camera on selection
. = Isolate selection
Alt+Z = X-Ray mode (see through panels)
```

## 7.3 Phase 3: Selection Modes

```typescript
// To implement
1 = Cabinet mode (select whole cabinet)
2 = Compartment mode
3 = Panel mode (select individual panels)
4 = Edge mode (for edgebanding)
5 = Hardware mode (hinges, slides)
```

## 7.4 Phase 4: Manufacturing Commands

```typescript
// To implement
B = Fillet edge profile
O = Offset panel edge
E = Extrude (for custom panels)
```

## 7.5 Polymorphic Pattern Implementation

```typescript
interface PolymorphicCommand {
  shortcut: string;
  handlers: Map<SelectionType, CommandHandler>;
}

function executePolymorphic(
  command: PolymorphicCommand,
  selection: Selection
) {
  const handler = command.handlers.get(selection.type);
  if (handler) {
    handler.execute(selection);
  }
}

// Example: B key
const filletCommand: PolymorphicCommand = {
  shortcut: 'B',
  handlers: new Map([
    ['panel', filletPanelEdge],
    ['edge', filletEdge],
    ['corner', filletCorner],
  ])
};
```

## 7.6 In-Command Modifier Pattern

```typescript
interface ActiveCommand {
  name: string;
  shortcuts: Map<string, () => void>;
  onKeyDown: (key: string) => void;
}

// Example: Move command
const moveCommand: ActiveCommand = {
  name: 'Move',
  shortcuts: new Map([
    ['Tab', toggleFreestyle],
    ['X', lockToX],
    ['Y', lockToY],
    ['Z', lockToZ],
    ['Shift+X', lockToYZ],
  ]),
  onKeyDown(key) {
    const handler = this.shortcuts.get(key);
    if (handler) handler();
  }
};
```

## 7.7 Monolith-Specific Commands

| Shortcut | Command | Description |
|----------|---------|-------------|
| `G` | Move Cabinet | Move in scene |
| `R` | Rotate 90° | Rotate cabinet |
| `D` | Drill Map | Toggle drill visualization |
| `E` | Export | Open export dialog |
| `F` | Focus | Focus on cabinet |
| `Space` | Command Palette | Open command palette |

---

# Appendix A: Quick Reference Card

## Transform
```
G     Move
R     Rotate
S     Scale
Shift+G  Slide CVs
```

## Creation
```
E     Extrude
L     Loft
P     Pipe (quick)
Shift+P  Sweep (precise)
```

## Modification
```
B     Fillet
C     Cut
Q     Boolean
T     Trim
O     Offset
I     Project
J     Join
```

## Modifiers
```
Shift+S     Raise Degree
Shift+I     Imprint
Ctrl+R      Isoparam
Alt+S       Subdivide
```

## Undo Operations
```
Alt+J    Unjoin
Alt+T    Untrim
Alt+D    Alt Duplicate
```

## View
```
H        Hide Selected
Shift+H  Hide Unselected
Alt+H    Unhide All
/        Focus
.        Isolate
Alt+Z    X-Ray
```

## Selection
```
1   Object Mode
2   Group Mode
3   Face Mode
4   Edge Mode
5   Vertex Mode
```

## In-Command
```
Tab     Toggle/Lock
D       Distance
A       Angle
X/Y/Z   Axis Lock
G/1/2/3 Continuity
```

---

# Appendix B: Continuity Quick Reference

```
G0 = Position      (corners allowed)
G1 = Tangent       (smooth direction)
G2 = Curvature     (smooth reflections)
G3 = Acceleration  (perfect smoothness)
```

**Rule:** Class-A surfaces need G2 minimum.

---

# Appendix C: Fillet Order

```
Always: LARGE → SMALL

200mm → 100mm → 50mm  ✅
50mm → 100mm → 200mm  ❌
```

---

*Document generated for Monolith Project*
*Source: Plasticity 2025.3 Documentation*
