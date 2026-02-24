# Connector OS v1.1 - Gate G11: Manufacturing Audit

## Overview

Gate G11 is the final quality check before exporting drill files (DXF/G-Code) to CNC machines. It validates the **actual geometry** of all operations grouped by joint.

---

## 1. Audit Logic

```typescript
function auditG11(allOps: Operation[], profile: ConnectorPlacementProfile) {
  // 1. Group by Joint for real spacing verification
  const opsByJoint = _.groupBy(allOps, o =>
    o.meta.pairId.split('_').slice(0, 2).join('_')
  );

  Object.entries(opsByJoint).forEach(([jointId, ops]) => {
    const sortedV = _.uniq(_.map(ops, 'params.v')).sort((a, b) => a - b);

    // Spacing Check
    for (let i = 0; i < sortedV.length - 1; i++) {
      const actualGap = sortedV[i + 1] - sortedV[i];
      if (actualGap > profile.constraints.maxSpacingMm) {
        throw new Error(
          `G11 Violation: Joint ${jointId} spacing ${actualGap}mm exceeds max!`
        );
      }
    }

    // Pairing Check
    const opsByPair = _.groupBy(ops, 'meta.pairId');
    Object.values(opsByPair).forEach(pairOps => {
      if (pairOps.length < 2) {
        throw new Error(
          `G11 Violation: Missing counterpart in ${pairOps[0].meta.pairId}`
        );
      }
    });
  });
}
```

---

## 2. Audit Checks

### 2.1 Pairing Check

Validates that every bore has its counterpart via `pairId`.

| Condition | Result |
|-----------|--------|
| Cam bore exists, Bolt bore exists for same pairId | PASS |
| Cam bore exists, no Bolt bore for same pairId | **FAIL - Block export** |

### 2.2 Spacing Check

Measures actual gap between connectors on each joint. Compares against profile max.

| Load Class | Max Spacing | Violation Action |
|------------|-------------|------------------|
| LIGHT | 128mm | Block export |
| STANDARD | 128mm | Block export |
| HEAVY | 96mm | Block export |

### 2.3 RefFrame Check (N-Center)

Verifies all STRUCTURAL bores use CORE reference frame.

| Condition | Result |
|-----------|--------|
| Structural bore at N = coreThk/2 | PASS |
| Structural bore at N = finishedThk/2 | **FAIL - Frame violation** |

---

## 3. Unit Test Cases (v1.1 - Mode-Aware)

### Test 1: N-Axis Centering (Structural Rule)

**Objective:** Verify structural bores always center on CORE, even on finished panels.

- **Input:** Stack `{ core: 18.0, finished: 19.6, pvc: 1.0 }`, Mode: `DRILL_ON_FINISHED`
- **Expected:** `N = 9.0` (core 18.0 / 2)
- **FAIL condition:** If N = 9.8 (finished center) → structural integrity compromised

### Test 2: V-Axis in DRILL_ON_FINISHED Mode

**Objective:** Verify NO PVC compensation when CNC drills after edge banding.

- **Input:** S=37.0, Mode: `DRILL_ON_FINISHED`
- **Expected:** `V = 37.0` (no subtraction)
- **Rationale:** Machine touches PVC edge directly, measures 37.0mm from finished surface

### Test 3: V-Axis in DRILL_ON_CORE Mode

**Objective:** Verify PVC compensation when CNC drills before edge banding.

- **Input:** S=37.0, PVC=1.0mm, Mode: `DRILL_ON_CORE`
- **Expected:** `V = 36.0` (37.0 - 1.0)
- **Rationale:** Must compensate so result is 37.0mm after PVC applied

### Test 4: Target J10 Transform (B = A - 25)

**Objective:** Verify COORD_TRANSFORM formula.

- **Input:** A = 34.5mm
- **Expected:** `U = 9.5` (34.5 - 25)
- **Assertion:** System must recalculate B whenever A changes

### Test 5: Mode Mismatch Detection (G11 Safety)

**Objective:** Prevent scrap from wrong mode/coordinate combination.

- **Input:** Mode: `DRILL_ON_FINISHED`, but V = 36.0 emitted
- **Expected:** G11 **TERMINATE** - coordinate doesn't match declared mode
- **Rationale:** 36.0mm on finished board = 1mm short of target, producing scrap

### Test 6: Load Class Spacing (Policy Rule) - from v1.0

**Objective:** Verify connector distribution by load class.

- **Input:** Joint 600mm, Load: HEAVY
- **Profile:** KITCHEN_PREMIUM (Max Spacing 96mm)
- **Expected:** Minimum 7 connectors
- **FAIL condition:** If spacing > 96mm, G11 blocks

### Test 7: Missing Pair (Security Check) - from v1.0

**Objective:** Prevent export of incomplete drill files.

- **Input:** Cam bore (Ø15) exists, no Bolt bore (Ø8) for same pairId
- **Expected:** `"G11 ERROR: Pairing Violation"`
- **Assertion:** System must not allow DXF/G-Code export

---

## 4. User Stories & Acceptance Criteria

### Software Development Team

**User Story:** "As a developer, I need a compiler that separates Core from Finished references so CNC drill coordinates are industrially accurate."

**Acceptance Criteria:**
- [ ] Deterministic geometry: System calculates U, V, N referencing `RefFrame: CORE` by default
- [ ] Manufacturing mode: System supports `DRILL_ON_CORE` (V compensated) and `DRILL_ON_FINISHED` (V direct)
- [ ] N-Center centerline: System locks structural N at `coreThk / 2` in BOTH modes
- [ ] G11 audit logic: System runs pairing + spacing + mode-consistency checks before file export
- [ ] Mode mismatch detection: G11 terminates if V-coordinate doesn't match declared mode

### Engineering Team

**User Story:** "As a product engineer, I need to register Minifix 15 and Target J10 specs in Gems Catalog for accurate drill computation."

**Acceptance Criteria:**
- [ ] Gems Catalog setup: `ConnectorSpec` for Minifix 15 and Target J10 with full bore specs
- [ ] Transform mapping: Target J10 has `B = A - 25` as typed transform
- [ ] Policy profiles: KITCHEN_PREMIUM with max spacing 128mm and HEAVY 96mm

### Production / CNC Team

**User Story:** "As a CNC technician, I need drill coordinates referenced from raw board (Core) so I can set machine zero point correctly and achieve flush assembly after surface finishing."

**Acceptance Criteria:**
- [ ] Zero point alignment: CNC machine config matches DXF/G-Code reference (raw board 18mm)
- [ ] Tooling verification: All drill bits (Ø5, Ø8, Ø10, Ø15) have correct offset/length
- [ ] Banding accuracy: After PVC 1mm application, bore is at 37mm from finished front (verify with caliper)

---

## 5. Pilot Test Protocol (19.6mm Stack)

### Materials
- HMR 18mm board
- HPL 0.8mm laminate (both sides)
- PVC 1.0mm edge banding

### Hardware
- Hafele Minifix 15 (B=24)
- Italiana Ferramenta Target J10 (B=9.5)

### Verification Steps

1. **Edge bore center:** Must be at 9.0mm from raw board face (N = coreThk/2)
2. **First hole position:** Must be at 36.0mm from raw board edge (V = 37 - PVC)
3. **Assembly check:** Panels must be flush at joint with no visible gap
4. **Cross-panel alignment:** Cam and Bolt bores must align perfectly between mating panels
