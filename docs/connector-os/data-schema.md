# Connector OS v1.0 - Data Schema

## 1. Geometry Level: BoreFeature

Defines drill coordinates and characteristics in 3D panel space.

```typescript
type Axis = 'U' | 'V' | 'N'; // U=Width, V=Depth, N=Normal (Thickness)
type RefFrame = 'CORE' | 'FINISHED';
type RefSurface = 'INNER_FACE' | 'OUTER_FACE';
type RefEdge = 'JOIN_EDGE' | 'FRONT_EDGE' | 'BACK_EDGE';
type FeatureRole = 'STRUCTURAL' | 'AUXILIARY';

interface BoreFeature {
  id: string;
  kind: 'FACE_BORE' | 'EDGE_BORE' | 'POCKET';
  role: FeatureRole;
  diaMm: number;
  depthMm: number; // Referenced along N-axis

  // Placement Semantic
  refFrame: RefFrame;          // Default: 'CORE'
  refSurface: RefSurface;
  refEdgePrimary: RefEdge;     // e.g. 'JOIN_EDGE'
  offsetPrimaryMm: number;     // Distance B
  axisPrimary: Axis;           // Deterministic Axis
  refEdgeSecondary: RefEdge;   // e.g. 'FRONT_EDGE'
  offsetSecondaryMm: number;   // Distance S
  axisSecondary: Axis;

  // Per-Feature Transform (supports Target J10 offset formula)
  transform?: { type: 'OFFSET_DELTA'; deltaMm: number };
}
```

### Field Reference

| Field | Description | Example |
|-------|-------------|---------|
| `id` | Feature identifier | `'CAM'`, `'BOLT'`, `'PINION'`, `'DOWEL'` |
| `kind` | Bore type | `'FACE_BORE'` (on panel face), `'EDGE_BORE'` (on panel edge) |
| `role` | Structural importance | `'STRUCTURAL'` for load-bearing connectors |
| `refFrame` | Thickness reference | `'CORE'` for structural (18mm), `'FINISHED'` for visual (19.6mm) |
| `refEdgePrimary` | Primary edge reference | `'JOIN_EDGE'` for U-axis distance B |
| `offsetPrimaryMm` | Distance from primary edge | `24` (Minifix B=24), `9.5` (Target J10) |
| `refEdgeSecondary` | Secondary edge reference | `'FRONT_EDGE'` for V-axis System 32 |
| `offsetSecondaryMm` | Distance from secondary edge | `37` (System 32 first hole) |
| `transform` | Per-feature coordinate transform | `{ type: 'OFFSET_DELTA', deltaMm: -25 }` |

---

## 2. ConnectorSpec

Groups all BoreFeatures belonging to a single connector product.

```typescript
interface ConnectorSpec {
  connectorId: string;
  brand: string;
  family: 'MINIFIX' | 'TARGET_J' | 'RASTEX';
  features: BoreFeature[];
}
```

### Example: Minifix 15 (B=24)

```json
{
  "connectorId": "HAFELE_MINIFIX_15_B24",
  "brand": "Hafele",
  "family": "MINIFIX",
  "features": [
    {
      "id": "CAM",
      "kind": "FACE_BORE",
      "role": "STRUCTURAL",
      "diaMm": 15,
      "depthMm": 12.5,
      "refFrame": "CORE",
      "refSurface": "INNER_FACE",
      "refEdgePrimary": "JOIN_EDGE",
      "offsetPrimaryMm": 24,
      "axisPrimary": "U",
      "refEdgeSecondary": "FRONT_EDGE",
      "offsetSecondaryMm": 37,
      "axisSecondary": "V"
    },
    {
      "id": "BOLT",
      "kind": "EDGE_BORE",
      "role": "STRUCTURAL",
      "diaMm": 8,
      "depthMm": 34,
      "refFrame": "CORE",
      "refSurface": "INNER_FACE",
      "refEdgePrimary": "JOIN_EDGE",
      "offsetPrimaryMm": 0,
      "axisPrimary": "U",
      "refEdgeSecondary": "FRONT_EDGE",
      "offsetSecondaryMm": 37,
      "axisSecondary": "V"
    }
  ]
}
```

### Example: Target J10

```json
{
  "connectorId": "IF_TARGET_J10",
  "brand": "Italiana Ferramenta",
  "family": "TARGET_J",
  "features": [
    {
      "id": "PINION",
      "kind": "FACE_BORE",
      "role": "STRUCTURAL",
      "diaMm": 10,
      "depthMm": 13,
      "refFrame": "CORE",
      "refSurface": "INNER_FACE",
      "refEdgePrimary": "JOIN_EDGE",
      "offsetPrimaryMm": 9.5,
      "axisPrimary": "U",
      "refEdgeSecondary": "FRONT_EDGE",
      "offsetSecondaryMm": 37,
      "axisSecondary": "V",
      "transform": { "type": "OFFSET_DELTA", "deltaMm": -25 }
    },
    {
      "id": "DOWEL",
      "kind": "EDGE_BORE",
      "role": "STRUCTURAL",
      "diaMm": 10,
      "depthMm": 12,
      "refFrame": "CORE",
      "refSurface": "INNER_FACE",
      "refEdgePrimary": "JOIN_EDGE",
      "offsetPrimaryMm": 0,
      "axisPrimary": "U",
      "refEdgeSecondary": "FRONT_EDGE",
      "offsetSecondaryMm": 37,
      "axisSecondary": "V"
    }
  ]
}
```

---

## 3. ConnectorPlacementProfile (Factory Policy)

Separates placement policy from hardware spec, enabling Gate auditing.

```typescript
interface ConnectorPlacementProfile {
  id: string;
  system32: {
    firstHole: number;  // 37mm
    pitch: number;      // 32mm
    endOffset: number;  // 40mm
  };
  constraints: {
    minPerJoint: number;
    maxSpacingMm: number; // Default max
    loadOverrides: Record<'LIGHT' | 'STANDARD' | 'HEAVY', { maxSpacingMm: number }>;
  };
}
```

### Load Class Spacing Rules

| Load Class | Max Spacing (mm) | Use Case |
|------------|------------------|----------|
| LIGHT | 128 | Shelves, decorative panels |
| STANDARD | 128 | General cabinet construction |
| HEAVY | 96 | Kitchen base units, heavy loads |

### Example Profile

```json
{
  "id": "KITCHEN_PREMIUM",
  "system32": { "firstHole": 37, "pitch": 32, "endOffset": 40 },
  "constraints": {
    "minPerJoint": 2,
    "maxSpacingMm": 128,
    "loadOverrides": {
      "LIGHT": { "maxSpacingMm": 128 },
      "STANDARD": { "maxSpacingMm": 128 },
      "HEAVY": { "maxSpacingMm": 96 }
    }
  }
}
```

---

## 4. MaterialStackPreset

Defines the material composition and resolved thicknesses.

```typescript
interface MaterialStackPreset {
  id: string; // e.g. "HMR18_HPL0p8x2_PVC1"
  core: { material: string; thickness: number };
  surface: { material: string; thickness: number; sides: number };
  edge: { material: string; thickness: number };
  resolved: {
    coreThk: number;      // 18.0
    finishedThk: number;  // 19.6 = 18 + (0.8 * 2)
    edgeThk: number;      // 1.0
  };
}
```
