# GATE 10: DXF Safety Gate

> **North Star**: "Golden DXF = Manufacturing Contract"
>
> DXF output is the final machine-readable specification sent to CNC.
> Any defect here = physical damage, wasted material, or safety hazard.

---

## Overview

| Gate | Name | Purpose | Severity |
|------|------|---------|----------|
| **G10.1** | DXF Deterministic | Byte-for-byte reproducibility | BLOCK |
| **G10.2** | DXF Semantic | Manufacturing safety validation | BLOCK/WARN |

---

## Bypass-Proof Invariants

> **POLICY**: These rules are NON-NEGOTIABLE. Any bypass = audit failure.

### Single Choke Point

```
┌─────────────────────────────────────────────────────────────┐
│  ALL DXF exports MUST flow through:                        │
│                                                             │
│    dxfExportFromOperationGraph.ts                          │
│         ↓                                                   │
│    validateDxfSemantic() → G10.2                           │
│         ↓                                                   │
│    operationGraphToDxf()                                   │
│         ↓                                                   │
│    assertDxfSafety() → G10.1                               │
│         ↓                                                   │
│    SafeDxf (output)                                        │
└─────────────────────────────────────────────────────────────┘
```

### Forbidden Patterns (CI Scan)

| Pattern | Reason | Scan Regex |
|---------|--------|------------|
| Direct `operationGraphToDxf()` call | Bypasses G10 gates | `operationGraphToDxf\(` outside `dxfExportFromOperationGraph.ts` |
| Raw string as DXF output | No provenance | `\.dxf.*=.*string` without `SafeDxf` |
| `as SafeDxf` cast | Bypass brand type | `as SafeDxf` |
| Skip G10.2 validation | Safety bypass | `skipRules.*DRILL_INSIDE` |

### Invariant Assertions

```typescript
// MUST be true for any DXF export:
assert(output instanceof SafeDxf);           // G10.1 branded
assert(semanticResult.blocked === false);    // G10.2 passed
assert(provenance.source === 'OPERATION_GRAPH'); // Not from mesh
```

---

## Severity Policy

### BLOCK vs WARN Behavior

| Severity | Export Allowed? | UI Behavior | Manifest |
|----------|-----------------|-------------|----------|
| **BLOCK** | NO | Red badge, disable download | `blocked: true` |
| **WARN** | YES | Yellow badge, show warnings | `warnCount: N` |

### strictMode

```typescript
// strictMode = true: Treat ALL warnings as blocks
validateDxfSemantic(graph, { strictMode: true });
// → Any WARN issue will set blocked = true
// → Use for: Production releases, Factory mode
```

### Release Behavior Matrix

| Mode | BLOCK Issues | WARN Issues | Action |
|------|--------------|-------------|--------|
| DESIGNER | Show error | Show warning | Allow preview only |
| FACTORY | **HALT** | Log to manifest | Allow if no BLOCK |
| FACTORY + strictMode | **HALT** | **HALT** | Zero tolerance |

---

## Tolerance Rationale

```
┌─────────────────────────────────────────────────────────────┐
│  0.01mm = DETERMINISTIC OUTPUT (G10.1)                     │
│  ─────────────────────────────────────────                  │
│  Purpose: Byte-for-byte reproducibility                    │
│  Scope: Normalization, floating-point rounding             │
│  Rationale: CNC resolution is 0.01mm (10 microns)          │
├─────────────────────────────────────────────────────────────┤
│  0.1–0.5mm = MANUFACTURING SAFETY (G10.2)                  │
│  ─────────────────────────────────────────                  │
│  Purpose: Catch geometry errors before cutting             │
│  Scope: Bounds check, collision, hardware spec             │
│  Rationale: Real-world machining tolerance                 │
└─────────────────────────────────────────────────────────────┘
```

**Why different?**
- 0.01mm catches *computation drift* (same input = same output)
- 0.1mm catches *design errors* (drill outside panel)
- Using 0.01mm for safety would cause false positives

---

## G10.1: DXF Deterministic Gate

### Philosophy

- Same input (OperationGraph) = Same output (DXF)
- Insensitive to: newline style, floating-point noise, timestamp
- Sensitive to: geometry, drill count, layers, distances

### Precision

| Context | Precision | Rationale |
|---------|-----------|-----------|
| CNC Resolution | 0.01mm (10 microns) | Woodworking CNC standard |
| Normalization | 2 decimal places | Match CNC resolution |
| -0 Handling | Convert to 0 | JavaScript quirk |

### Normalization Rules

```
1. Newlines: LF only, trimEnd each line, final newline = yes
2. Numeric precision: 0.01mm (2 decimal places)
3. Entity ordering: layer → type → x → y → z
4. Layer canonicalization: CUT → DRILL order
5. Strip unstable tokens: timestamps, UUIDs, comments
```

### Files

| File | Purpose |
|------|---------|
| `src/core/export/dxf/dxfNormalize.ts` | Normalization functions |
| `src/core/gate/gate10DxfSafety.ts` | SafeDxf brand type, assertions |
| `src/core/gate/__tests__/gate10_1DxfGolden.test.ts` | 40 golden comparison tests |

### Golden Fixtures

| Fixture | Tests |
|---------|-------|
| `fixture.drill-baseline.json` | 3 drills, layer naming DRILL_{dia}_D{depth} |
| `fixture.minifix-pair.json` | Cam/Bolt pair, Distance B = 24mm |
| `fixture.small-cabinet.json` | Complete cabinet assembly |

### SafeDxf Brand Type

```typescript
declare const SafeDxfBrand: unique symbol;
export type SafeDxf = string & { readonly [SafeDxfBrand]: true };

// Only assertDxfSafety can create SafeDxf
export function assertDxfSafety(
  content: string,
  provenance: DxfProvenance
): G10Result;
```

---

## G10.2: DXF Semantic Gate

### Philosophy

- G10.1 ensures DXF is reproducible
- G10.2 ensures DXF is **safe for manufacturing**
- Catches logic errors that pass deterministic checks

### Tolerances

| Rule | Tolerance | Severity | Rationale |
|------|-----------|----------|-----------|
| `DRILL_INSIDE_OUTLINE` | 0.1mm | BLOCK | Drill outside panel = air cut |
| `NO_ORPHAN_DRILL` | N/A | BLOCK | No workpiece context = unknown target |
| `DRILL_DEPTH_SAFE` | 0.5mm | BLOCK | Through-hole in blind context |
| `MINIFIX_DISTANCE_B` | ±0.1mm | BLOCK | Distance B = 24mm (Häfele spec) |
| `MINIFIX_PAIR_MUTUAL` | N/A | BLOCK | Cam/Bolt must reference each other |
| `NO_OVERLAPPING_DRILLS` | 0.5mm | WARN | Collision detection |
| `TOOL_RADIUS_VALID` | N/A | WARN | Invalid or extreme diameter |

### Minifix S200 Specifications (Häfele)

```typescript
const MINIFIX_SPEC = {
  DISTANCE_B: 24,      // mm - edge to bolt center
  CAM_DIAMETER: 15,    // mm - Ø15
  BOLT_DIAMETER: 10,   // mm - Ø10
  FIRST_HOLE_Z: 37,    // mm - System 32 first hole
};
```

### Files

| File | Purpose |
|------|---------|
| `src/core/gate/gate10_2DxfSemantic.ts` | Validation rules |
| `src/core/gate/__tests__/gate10_2DxfSemantic.test.ts` | 43 tests |
| `src/core/export/dxfExportFromOperationGraph.ts` | Pipeline integration |

### Validation Result

```typescript
interface SemanticValidationResult {
  valid: boolean;      // No issues at all
  blocked: boolean;    // Has BLOCK-severity issues
  issues: SemanticIssue[];
  summary: {
    totalChecks: number;
    blockCount: number;
    warnCount: number;
  };
}
```

### Options

```typescript
interface SemanticValidationOptions {
  panel?: PanelContext;     // Required for bounds/depth checks
  skipRules?: SemanticRule[]; // Skip specific rules
  strictMode?: boolean;     // Treat WARN as BLOCK
}
```

---

## Manifest Contract (Stable Schema)

> **CONTRACT**: This schema is stable. Changes require version bump.

### Required Fields

```typescript
interface DxfZipManifest {
  // Header
  generatedAt: string;        // ISO 8601
  machineId: string;          // e.g., "KDT-6000"
  totalOperations: number;
  source: "OperationGraph (AGENT-T008)";  // MUST be this value

  // Per-panel
  panels: Array<{
    panelId: string;
    panelName: string;
    filename: string;         // e.g., "SHELF_KDT-6000.dxf"
    operationCount: number;
    g10: {
      ok: boolean;
      source: "OPERATION_GRAPH";
      packetId: string;
    };
    g10_2: {
      valid: boolean;
      blocked: boolean;
      blockCount: number;
      warnCount: number;
    };
  }>;

  // Summary
  gate10: {
    allPassed: boolean;
    verifiedCount: number;
    totalCount: number;
  };
  gate10_2: {
    allValid: boolean;
    noneBlocked: boolean;
    totalBlockIssues: number;
    totalWarnIssues: number;
  };

  warnings: string[];
}
```

### Example: PASS

```json
{
  "generatedAt": "2026-02-02T10:30:00.000Z",
  "machineId": "KDT-6000",
  "totalOperations": 42,
  "source": "OperationGraph (AGENT-T008)",
  "panels": [
    {
      "panelId": "panel-side-001",
      "panelName": "LEFT_SIDE",
      "filename": "LEFT_SIDE_KDT-6000.dxf",
      "operationCount": 12,
      "g10": { "ok": true, "source": "OPERATION_GRAPH", "packetId": "job-123" },
      "g10_2": { "valid": true, "blocked": false, "blockCount": 0, "warnCount": 0 }
    }
  ],
  "gate10": { "allPassed": true, "verifiedCount": 1, "totalCount": 1 },
  "gate10_2": { "allValid": true, "noneBlocked": true, "totalBlockIssues": 0, "totalWarnIssues": 0 },
  "warnings": []
}
```

### Example: BLOCKED

```json
{
  "generatedAt": "2026-02-02T10:30:00.000Z",
  "machineId": "KDT-6000",
  "totalOperations": 42,
  "source": "OperationGraph (AGENT-T008)",
  "panels": [
    {
      "panelId": "panel-bad-001",
      "panelName": "BAD_PANEL",
      "filename": "BAD_PANEL_KDT-6000.dxf",
      "operationCount": 5,
      "g10": { "ok": true, "source": "OPERATION_GRAPH", "packetId": "job-456" },
      "g10_2": { "valid": false, "blocked": true, "blockCount": 2, "warnCount": 1 }
    }
  ],
  "gate10": { "allPassed": false, "verifiedCount": 0, "totalCount": 1 },
  "gate10_2": { "allValid": false, "noneBlocked": false, "totalBlockIssues": 2, "totalWarnIssues": 1 },
  "warnings": [
    "[G10.2 BLOCK] panel-bad-001: Drill drill-001 at (-5.00, 200.00) exceeds panel bounds [600x800]",
    "[G10.2 BLOCK] panel-bad-001: Drill drill-002 depth 25.00mm exceeds safe limit 18.50mm",
    "[G10.2 WARN] panel-bad-001: Drills drill-003 and drill-004 overlap (distance: 8.00mm, min: 10.50mm)"
  ]
}
```

---

## Factory Acceptance Checklist

> **For**: QC staff, Planners, Sales engineers
> **When**: Spot-check before production run

### Quick Visual Check (CAD Viewer)

- [ ] Open DXF in viewer (AutoCAD/LibreCAD/DraftSight)
- [ ] Verify units: 100mm line measures 100mm
- [ ] Verify layers exist: `OUTLINE`, `DRILL_*`, `BORE_*`
- [ ] All holes visually inside panel outline

### Minifix Hardware Check

- [ ] Cam housing: Ø15 circle on `BORE_15D*` layer
- [ ] Bolt sleeve: Ø10 circle on `DRILL_10_D*` layer
- [ ] Distance B measurement: **24mm ± 0.1mm** from edge to bolt center
- [ ] Cam/Bolt pairs are aligned (same X coordinate)

### Dimension Spot-Check

| Measurement | Expected | Tolerance |
|-------------|----------|-----------|
| Panel width | Per spec | ±0.1mm |
| Panel height | Per spec | ±0.1mm |
| Drill position X | Per design | ±0.1mm |
| Drill position Y | Per design | ±0.1mm |
| Distance B | 24mm | ±0.1mm |

### Manifest Verification

- [ ] Open `_manifest.json` in ZIP
- [ ] Check `gate10.allPassed === true`
- [ ] Check `gate10_2.noneBlocked === true`
- [ ] Check `warnings` array is empty (or acceptable)

---

## CI Gate Commands

### Run All G10 Tests

```bash
# Full gate test suite (117 tests)
npm run test:run -- src/core/gate

# Expected output:
# ✓ gate10DxfSafety.test.ts (34 tests)
# ✓ gate10_1DxfGolden.test.ts (40 tests)
# ✓ gate10_2DxfSemantic.test.ts (43 tests)
# Test Files: 3 passed
# Tests: 117 passed
```

### Run Individual Suites

```bash
# G10.1: Deterministic + Golden
npm run test:run -- gate10_1DxfGolden.test.ts
# Expected: 40 passed

# G10.2: Semantic validation
npm run test:run -- gate10_2DxfSemantic.test.ts
# Expected: 43 passed

# G10: Core safety (brand types, provenance)
npm run test:run -- gate10DxfSafety.test.ts
# Expected: 34 passed
```

### Static Scan (Bypass Detection)

```bash
# Check for forbidden patterns
grep -r "operationGraphToDxf(" src/ --include="*.ts" \
  | grep -v "dxfExportFromOperationGraph.ts" \
  | grep -v "test"
# Expected: No output (no direct calls)

grep -r "as SafeDxf" src/ --include="*.ts"
# Expected: No output (no unsafe casts)
```

### Pre-commit Hook

```bash
# Add to .husky/pre-commit or CI
npm run test:run -- src/core/gate && echo "G10 PASSED"
```

---

## Known Limitations

> **Scope Boundaries**: What G10 does NOT cover

| Non-Goal | Reason | Future Gate? |
|----------|--------|--------------|
| Toolpath collision | Requires simulation | G11 (planned) |
| Feed rate validation | Machine-specific | G-code gate |
| Material compatibility | Business logic | Spec gate |
| CAD viewer rendering | Vendor-specific | Out of scope |

### Outline Containment Definition

- "Inside outline" = within LWPOLYLINE on `OUTLINE` layer
- Tolerance applied to drill **circle edge**, not center
- Non-rectangular outlines not yet supported

### Minifix Detection Heuristic

- Bolt sleeve = Ø10 + horizontal direction
- May false-positive on other Ø10 horizontal holes
- Future: Use `purpose` metadata for explicit tagging

---

## Test Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| `gate10DxfSafety.test.ts` | 34 | ✅ |
| `gate10_1DxfGolden.test.ts` | 40 | ✅ |
| `gate10_2DxfSemantic.test.ts` | 43 | ✅ |
| **Total** | **117** | ✅ |

---

## Usage Examples

### Quick Semantic Check

```typescript
import { isDxfSemanticValid } from '@/core/gate/gate10_2DxfSemantic';

const valid = isDxfSemanticValid(graph, {
  panel: { panelId: 'p1', width: 800, height: 400, thickness: 18 }
});
```

### Full Validation with Report

```typescript
import {
  validateDxfSemantic,
  formatSemanticReport
} from '@/core/gate/gate10_2DxfSemantic';

const result = validateDxfSemantic(graph, { panel });
console.log(formatSemanticReport(result));
```

### Export with G10 Verification

```typescript
import { exportDxfFromPacket } from '@/core/export/dxfExportFromOperationGraph';

const result = await exportDxfFromPacket(packet, { machineId: 'KDT-6000' });

if (result.ok && result.g10Status.allPassed) {
  // All panels passed G10.1 + G10.2
  for (const panel of result.panels) {
    console.log(`${panel.panelId}: SafeDxf ready`);
  }
}
```

---

## Architecture Decisions

### Why OperationGraph Source of Truth?

```
AGENT-T008: DXF export MUST come from OperationGraph (manufacturing intent)
            NOT from 3D mesh or Cabinet geometry
            This ensures DXF exactly matches G-code output
```

### Why Branded Types?

```typescript
// Compile-time safety: can't pass raw string where SafeDxf is expected
function sendToMachine(dxf: SafeDxf): void { ... }

sendToMachine(rawString);  // ❌ TypeScript error
sendToMachine(safeDxf);    // ✅ Only after G10 verification
```

### Why Separate G10.1 and G10.2?

| Concern | G10.1 | G10.2 |
|---------|-------|-------|
| Focus | Reproducibility | Safety |
| Precision | 0.01mm | 0.1-0.5mm |
| Failure mode | Non-determinism | Logic error |
| Examples | Floating-point drift | Drill outside panel |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-02 | Initial G10.1 + G10.2 implementation |
| 1.1.0 | 2026-02-02 | Add bypass-proof policy, manifest contract, factory checklist |

---

## References

- [Häfele Minifix S200 Spec](https://www.hafele.com)
- [DXF R12 Reference](https://images.autodesk.com/adsk/files/autocad_2012_pdf_dxf-reference_enu.pdf)
- AGENT-T008: OperationGraph Source of Truth
