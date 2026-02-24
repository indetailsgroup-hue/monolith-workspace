# Connector OS v1.1 - Technical Specification

**Project:** Digital Furniture Synthesis (Monolith)
**Subject:** Digital Joinery Compiler & Manufacturing OS
**Status:** FREEZE v1.1 (Production-Ready)
**Authority:** Gems Connectors v1.1

---

## Overview

**Connector OS v1.0** is a Digital Joinery Compiler that transforms static hardware data into deterministic manufacturing instructions. It replaces manual drill coordinate placement with engineering-driven logic that accounts for material stacks, edge banding, and structural integrity.

### Engineering Foundation

- **System 32 Standard:** 5mm drill holes, 32mm pitch, 37mm backset
- **Rule of Two:** Every joint requires minimum 2 connectors (torsion prevention)
- **Industrial Spacing:** Max 128mm between connectors (AWI Premium standard)
- **Production Truth:** Strict separation of Visual (Finished Envelope) from Production (Core Drilling)

---

## Document Index

| Document | Description |
|----------|-------------|
| [Data Schema](data-schema.md) | BoreFeature, ConnectorSpec, PlacementProfile schemas |
| [Material Stack](material-stack.md) | N-Center Policy, V-Axis Banding Compensation, Manufacturing Modes, 19.6mm logic |
| [Hardware Catalog](hardware-catalog.md) | Minifix 15, Target J10 specs and part numbers |
| [Compiler Pipeline](compiler-pipeline.md) | Selection, Placer, Synthesis, Emission workflow |
| [Gate G11 Audit](gate-g11.md) | Manufacturing audit, test cases, acceptance criteria |

---

## Key Principles

### Coordinate System (Local Panel Space)

| Axis | Direction | Usage |
|------|-----------|-------|
| **U** | Width | Drilling distance B from JOIN_EDGE |
| **V** | Depth | System 32 backset S from FRONT_EDGE |
| **N** | Normal (Thickness) | Center point within panel |

### The Two-World Rule

| World | Thickness | Usage |
|-------|-----------|-------|
| **Core (Production)** | 18.0mm | Structural drilling, N-center, CNC coordinates |
| **Finished (Visual)** | 19.6mm | Clash detection, assembly envelope, visual layout |

### Manufacturing Modes (v1.1)

| Mode | V-Axis | Description |
|------|--------|-------------|
| `DRILL_ON_CORE` | `S - PVC` (36.0mm) | CNC drills raw board before edge banding |
| `DRILL_ON_FINISHED` | `S` (37.0mm) | CNC drills after edge banding is applied |

N-center is **always** `coreThk / 2 = 9.0mm` regardless of mode.

### Compiler Pipeline

```
Selection → Placer → Synthesis → Emission (OPGRAPH)
```

1. **Selection:** Choose connector by core thickness and load class
2. **Placer:** Calculate S-positions along joint using System 32 grid
3. **Synthesis:** Project hardware spec onto real coordinates via CORE Interface
4. **Emission:** Generate OPGRAPH with structured metadata and reason tags

---

## Implementation Roadmap

1. **Phase 1 (Setup):** Implement `BoreFeature` and `ConnectorSpec` schemas
2. **Phase 2 (Logic):** Implement Placer and Compiler with banding compensation
3. **Phase 3 (Testing):** Pass all unit test cases (see [Gate G11](gate-g11.md))
4. **Phase 4 (Pilot):** CNC drill test on 19.6mm stack (HMR 18 + HPL 0.8x2 + PVC 1.0)
