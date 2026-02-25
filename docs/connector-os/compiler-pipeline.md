# Connector OS v1.0 - Compiler Pipeline

## Overview

The compiler transforms hardware specifications + placement policies into deterministic drill operations (OPGRAPH). It uses `AdjacencyContext` instead of hardcoded logic to support any panel relationship (Divider/Shelf/Side).

```
Selection → Placer → Synthesis → Emission (OPGRAPH)
```

---

## 1. Selection Phase

Choose connector model based on core thickness and application type.

**Input:** Core thickness, load class, joint type
**Output:** `ConnectorSpec` from Gems Catalog

---

## 2. Placer Phase (S-Position Generator)

Calculates connector positions along a joint using System 32 grid and load class constraints.

```typescript
function getConnectorPositions(
  jointLen: number,
  profile: ConnectorPlacementProfile,
  load: LoadClass
): number[] {
  const sys = profile.system32;
  const constraints = profile.constraints;
  const maxSpacing = constraints.loadOverrides[load].maxSpacingMm;

  const usableLen = jointLen - (sys.endOffset * 2);
  const n = Math.max(constraints.minPerJoint, Math.ceil(usableLen / maxSpacing) + 1);

  const positions: number[] = [];
  let s = sys.firstHole;
  while (s <= jointLen - sys.endOffset && positions.length < n) {
    if (s >= sys.endOffset) positions.push(s);
    s += sys.pitch;
  }
  // Fallback to ensure minimum count
  if (positions.length < n) positions.push(jointLen - sys.endOffset);

  return [...new Set(positions)].sort((a, b) => a - b);
}
```

### System 32 Grid Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| `firstHole` | 37mm | First hole from front edge |
| `pitch` | 32mm | Hole-to-hole spacing |
| `endOffset` | 40mm | Safety margin from panel end |

### Example: 600mm Joint, HEAVY Load

- Max spacing: 96mm
- Required connectors: `ceil((600 - 80) / 96) + 1 = 7`
- Positions: 37, 69, 101, 133, ..., 560mm

---

## 3. Synthesis Phase (Coordinate Projection)

Projects hardware spec features onto real panel coordinates using `AdjacencyContext`.

```typescript
function compileConnectorOps(
  adjContext: AdjacencyContext,
  spec: ConnectorSpec,
  sPositions: number[]
) {
  sPositions.forEach((sPos, index) => {
    spec.features.forEach(feature => {
      // 1. Resolve Transform (if any)
      const finalB = feature.offsetPrimaryMm + (feature.transform?.deltaMm ?? 0);

      // 2. Build Structured Metadata
      const metadata = {
        connectorId: spec.connectorId,
        pairId: `PAIR_${adjContext.id}_${index}`,
        featureId: feature.id,
        instanceIndex: index,
        role: feature.role,
        frame: feature.refFrame
      };

      // 3. Emit To Panel (via AdjacencyContext)
      const targetPanel = resolvePanelByFeatureKind(feature.kind, adjContext);

      targetPanel.addOperation({
        type: 'DRILL',
        params: { dia: feature.diaMm, depth: feature.depthMm, u: finalB, v: sPos, n: 0 },
        meta: metadata,
        tags: [`CONN=${spec.connectorId}`, `ROLE=${feature.role}`]
      });
    });
  });
}
```

### Key Design Decisions

- **AdjacencyContext** replaces hardcoded panel relationships
- **Transform resolution** happens per-feature (supports Target J10's `B = A - 25`)
- **Metadata** is structured (not string-based) for Gate G11 auditing

---

## 4. Emission Phase (OPGRAPH Generation)

The final output is an **OPGRAPH** (Operation Graph) containing all drill operations with full traceability.

### Operation Structure

```typescript
interface DrillOperation {
  type: 'DRILL';
  params: {
    dia: number;    // Drill diameter (mm)
    depth: number;  // Drill depth (mm)
    u: number;      // U-axis coordinate (width)
    v: number;      // V-axis coordinate (depth)
    n: number;      // N-axis coordinate (normal)
  };
  meta: {
    connectorId: string;   // e.g. 'HAFELE_MINIFIX_15_B24'
    pairId: string;        // e.g. 'PAIR_JOINT1_0' - for pairing audit
    featureId: string;     // e.g. 'CAM', 'BOLT'
    instanceIndex: number; // Position index along joint
    role: FeatureRole;     // 'STRUCTURAL'
    frame: RefFrame;       // 'CORE'
  };
  tags: string[];          // ['CONN=MINIFIX_15', 'ROLE=STRUCTURAL']
}
```

### Metadata Purpose

| Field | Audit Use |
|-------|-----------|
| `pairId` | Ensures every bore has its counterpart (Cam↔Bolt). Also canonical key for per-connector preview state — see [`HARDWARE_PREVIEW_KEYS.md`](../architecture/HARDWARE_PREVIEW_KEYS.md) |
| `role` | Validates structural bores use CORE reference |
| `frame` | Gate G11 checks frame compliance |
| `tags` | Human-readable reason tags for traceability |

> **Note:** `mapDrillMapToOps` forwards `pairId`, `anchor`, `normal`, and `edgeSide`
> through `OperationWorkpieceContext.drillmap` for CNC overlay preview transforms.
> See [Hardware Preview Keys](../architecture/HARDWARE_PREVIEW_KEYS.md) for the full contract.

---

## 5. Stack-Aware Compilation

When material stack information is available, the compiler applies banding compensation:

```typescript
function compileWithStack(
  adjContext: AdjacencyContext,
  spec: ConnectorSpec,
  stack: MaterialStackPreset
) {
  const sPosBase = 37.0;
  const edgeOffset = stack.resolved.edgeThk; // 1.0mm

  // 1. Compensate for Edge Banding (S-Axis)
  const finalS = sPosBase - edgeOffset; // = 36.0mm for CNC

  // 2. Resolve Center Point (N-Axis)
  const finalN = stack.resolved.coreThk / 2; // = 9.0mm (CORE center)

  // 3. Emit Operation
  return {
    type: 'DRILL_EDGE',
    params: {
      dia: 8,
      v: finalS,   // 36.0 (CNC drills at 36, result is 37 after PVC)
      n: finalN,   // 9.0 (Core center)
      depth: 34
    },
    meta: {
      frame: 'CORE_CENTERED',
      stack: '18+0.8+0.8'
    }
  };
}
```
