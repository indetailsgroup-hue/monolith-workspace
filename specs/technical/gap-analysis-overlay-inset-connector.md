# Gap Analysis: Overlay↔Inset Connector Specification vs Existing Implementation

**Date**: 2026-01-22
**Spec**: Master Prompt - Overlay↔Inset Connector Generator
**Codebase**: IIMOS Minifix/Connector System

---

## Executive Summary

| Category | Spec Coverage | Implementation Status |
|----------|--------------|----------------------|
| Input Parameters | 10 params | **8/10 covered** |
| Connector Selection Algorithm | 4 steps | **Partial (2/4)** |
| CNC Drilling | Complete | **Fully implemented** |
| Assembly Sequence | 6 steps | **UI-only, no docs** |
| Installation Rules | 4 rules | **Not implemented** |
| Validation | 7 checks | **3/7 implemented** |
| Optional Variants | 4 variants | **None implemented** |

---

## 1. INPUT PARAMETERS - Gap Analysis

### Spec Requirements
```json
{
  "joint_type": "overlay_to_inset",
  "panel_material": "engineered_wood | plywood | MDF",
  "panel_thickness_mm": 18,
  "overlay_thickness_mm": 18,
  "inset_offset_mm": 2,
  "load_type": "static | dynamic",
  "disassembly_required": true,
  "visible_fastener": false,
  "cnc_capable": true,
  "production_volume": "custom | batch | mass"
}
```

### Current Implementation

| Parameter | Implemented | Location | Notes |
|-----------|-------------|----------|-------|
| `joint_type` | **Partial** | generateDrillMap.ts | Supports INSET/OVERLAY but no explicit joint_type input |
| `panel_material` | **No** | - | Material not considered in connector selection |
| `panel_thickness_mm` | **Yes** | MinifixConfigPanel.tsx:106-117 | Maps to CAM_SPECS_BY_WOOD_THICKNESS |
| `overlay_thickness_mm` | **Yes** | Derived from panel thickness | Same as panel_thickness |
| `inset_offset_mm` | **No** | - | Fixed gap, no configurable inset offset |
| `load_type` | **No** | - | No load analysis for connector selection |
| `disassembly_required` | **Implicit** | - | Minifix assumed = knock-down (always true) |
| `visible_fastener` | **Implicit** | - | Minifix = always hidden |
| `cnc_capable` | **Yes** | - | System is CNC-first design |
| `production_volume` | **No** | - | No batch optimization logic |

### Gaps Identified
1. **Material-based selection** - No hardwood vs MDF consideration for connector choice
2. **Inset offset** - Fixed geometry, cannot specify custom gap
3. **Load type** - No structural analysis input
4. **Production volume** - No batch/nesting optimization

---

## 2. ALGORITHM - Connector Selection Logic

### Spec Algorithm (4 Steps)

**Step A - Structural Requirement**:
- If disassembly_required → cam-lock connector
- If hidden joint → embedded connector

**Step B - Thickness Rule**:
- panel ≥ 12mm → Minifix-class valid
- panel ≥ 19mm & high load → Maxifix-class

**Step C - Overlay↔Inset Geometry**:
- Shear + pull-in force compensation
- Drilling tolerance ±0.5-1mm
- Z-offset prevention

**Step D - Connector Sizing**:
- (Implied) Select Ø12 or Ø15 housing

### Current Implementation

| Step | Implemented | Location | Notes |
|------|-------------|----------|-------|
| Step A | **Partial** | Implicit | Always uses Minifix (no alternative connector types) |
| Step B | **Yes** | MinifixConfigPanel.tsx:114-145 | CAM_SPECS_BY_WOOD_THICKNESS handles 12-29mm |
| Step C | **Yes** | generateDrillMap.ts:819-850 | Position calc for INSET vs OVERLAY |
| Step D | **Partial** | MinifixConfigPanel.tsx:57-99 | Supports Minifix 12/15, but no auto-selection |

### Gaps Identified
1. **No automatic connector type selection** - User must manually choose Minifix 12 vs 15
2. **No Maxifix support** - Only Minifix class implemented
3. **No load-based escalation** - Cannot auto-upgrade to stronger connector
4. **No alternative connector types** - Only eccentric cam, no confirmat/dowel-only options auto-selected

---

## 3. CNC DRILLING ALGORITHM

### Spec Requirements
```pseudo
FOR each connector_position:
  drill housing_hole Ø15 depth = panel_thickness - 3mm
  drill bolt_hole Ø5 depth = inset_panel_thickness - 2mm
  ensure bolt_axis aligns with housing_center
  orientation_arrow → points toward bolt
END

Tolerance: ±0.5mm drilling error
Compensation: cam rotation 0-195°
```

### Current Implementation

| Feature | Implemented | Location | Notes |
|---------|-------------|----------|-------|
| Housing hole Ø15 | **Yes** | generateDrillMap.ts:878-913 | Correct diameter |
| Housing depth formula | **Different** | Uses CAM_SPECS table | Not panel_thickness-3mm, uses Häfele catalog |
| Bolt hole Ø5 | **Partial** | Uses Ø10 (sleeve dia) | Spec says Ø5, impl uses sleeve diameter |
| Bolt depth | **Yes** | generateDrillMap.ts:1023-1041 | 17.5mm default |
| Axis alignment | **Yes** | validateDrillMapMinifix() | Coaxial validation |
| Orientation arrow | **No** | - | No arrow indicator in drill map |
| Tolerance ±0.5mm | **Yes** | useMinifixValidation.ts:115-148 | COAXIAL_RADIAL_MM constant |
| Cam rotation compensation | **Implicit** | - | No explicit rotation range output |

### Gaps Identified
1. **Bolt hole diameter mismatch** - Spec says Ø5 (shaft), impl uses Ø10 (sleeve)
2. **No orientation indicator** - Arrow direction not in drill map output
3. **Cam rotation range** - Not explicitly output for operator guidance
4. **Depth formula** - Uses lookup table vs formula (acceptable, but different approach)

---

## 4. GENERATED CONNECTOR SYSTEM - Output Comparison

### Spec Output
```json
{
  "connector_type": "eccentric_cam_connector",
  "housing_diameter_mm": 15,
  "bolt_type": "centric_cam_bolt",
  "bolt_hole_mm": 5,
  "tightening_angle_deg": 165,
  "pull_distance_mm": 5.5,
  "material": "zinc_alloy + steel"
}
```

### Current Output (MinifixFullConfig)
```typescript
{
  type: 'minifix15' | 'minifix12',
  drillingDistanceB: 24 | 34,
  woodThickness: number,
  ballHead: { diameter, offset },
  neckShaft: { diameter, length, offset },
  sleeve: { diameter, length, offset },
  threadedShaft: { diameter, length, offset },
  cam: { diameter, depth, dimA, rimDiameter, rimHeight },
  includeDowel: boolean,
  dowel: { diameter, length, offset }
}
```

### Comparison

| Spec Field | Current Field | Match |
|------------|---------------|-------|
| connector_type | type | **Yes** (different naming) |
| housing_diameter_mm | cam.diameter | **Yes** |
| bolt_type | - | **No** (not explicit) |
| bolt_hole_mm | sleeve.diameter | **Mismatch** (10 vs 5) |
| tightening_angle_deg | - | **No** |
| pull_distance_mm | - | **No** |
| material | - | **No** (only in 3D render PBR) |

### Gaps Identified
1. **No tightening angle output** - Critical for assembly instructions
2. **No pull distance spec** - Important for alignment verification
3. **Material not in data model** - Only visual property

---

## 5. ASSEMBLY SEQUENCE

### Spec Sequence (6 Steps)
1. CNC drill all housing + bolt holes
2. Insert cam housing into overlay panel
3. Insert bolt into inset panel / connector plate
4. Align panels
5. Rotate cam to ~165° (optimal lock zone)
6. Verify: flush surface, no offset, no visible hardware

### Current Implementation

| Step | Implemented | Notes |
|------|-------------|-------|
| Step 1 | **Yes** | Drill map generation |
| Step 2-4 | **Preview only** | Hardware3D shows assembled state, no sequence |
| Step 5 | **No** | No rotation angle guidance |
| Step 6 | **Partial** | Validation checks alignment, not flush/visible |

### Gaps Identified
1. **No assembly instruction generator** - No step-by-step output
2. **No operator guidance** - Tightening angle not communicated
3. **No verification checklist** - Post-assembly checks not generated

---

## 6. INSTALLATION RULES

### Spec Rules
1. Arrow on cam must face bolt
2. Do NOT overtighten beyond 195°
3. If misalignment: use retightening zone (165-195°)
4. For repeated assembly: maintain housing integrity

### Current Implementation

**None of these rules are implemented or documented in code.**

### Gaps Identified
1. **No arrow orientation check** - Critical for correct assembly
2. **No torque/rotation limits** - Risk of overtightening damage
3. **No retightening guidance** - Important for field service
4. **No cycle count tracking** - D6.1 has tool wear, not connector wear

---

## 7. VALIDATION CHECK

### Spec Validation Output
```json
{
  "shear_capacity_ok": true,
  "pull_out_resistance_ok": true,
  "flush_alignment_ok": true,
  "cnc_feasible": true,
  "disassembly_cycles": ">=20",
  "manufacturing_risk": "low"
}
```

### Current Implementation (MinifixValidationResult)
```typescript
{
  status: 'PASS' | 'FAIL' | 'NO_PAIRS',
  pairCount: number,
  errorCount: number,
  warningCount: number,
  pairs: [{
    radialOffset: number,
    yOffset: number,
    pass: boolean
  }]
}
```

### Comparison

| Spec Check | Implemented | Notes |
|------------|-------------|-------|
| shear_capacity_ok | **No** | No load calculation |
| pull_out_resistance_ok | **No** | No pull-out analysis |
| flush_alignment_ok | **Partial** | Coaxial check, not flush surface |
| cnc_feasible | **Implicit** | Always assumed feasible |
| disassembly_cycles | **No** | No cycle rating |
| manufacturing_risk | **No** | No risk assessment |

### Gaps Identified
1. **No structural validation** - Shear/pull-out not calculated
2. **No surface flush check** - Only internal alignment
3. **No risk assessment** - No manufacturing complexity scoring
4. **No lifecycle analysis** - Disassembly cycles not tracked

---

## 8. OPTIONAL VARIANTS

### Spec Variants
1. Replace wooden plate with aluminum rail
2. Add dual connector for tall panels
3. Switch to edge-to-edge bolt if inset offset = 0
4. Auto-upgrade to Maxifix if load > threshold

### Current Implementation

**None implemented.**

### Gaps Identified
1. **No aluminum rail option** - Wood only
2. **No auto dual-connector** - Manual count only
3. **No edge-to-edge variant** - Fixed bolt type
4. **No Maxifix auto-upgrade** - Manual selection only

---

## 9. WOODEN INTERFACE PLATE (Spacer/Rail)

### Spec
```json
{
  "component": "wooden_connector_plate",
  "thickness_mm": 12,
  "width_mm": 60,
  "function": ["load_distribution", "offset_alignment", "cnc_drilling_reference"],
  "grain_direction": "parallel_to_load"
}
```

### Current Implementation

**Not implemented.** No spacer/rail component exists in the system.

### Gap
- Missing intermediate connector plate for complex joints
- No grain direction consideration

---

## 10. BOM-READY DATA

### Spec Requirement
Output must be BOM-ready (connector + wood parts)

### Current Implementation
- **Connector BOM**: Not implemented (config exists but no BOM export)
- **Wood parts BOM**: Not in drill map output

### Gap
- No BOM generation from drill map
- No quantity rollup
- No purchasing/ERP integration

---

## Summary: Priority Gaps

### HIGH PRIORITY (Structural/Safety)
1. **Load-based connector selection** - No structural analysis
2. **Tightening angle guidance** - Risk of damage
3. **Arrow orientation check** - Assembly error prevention

### MEDIUM PRIORITY (Manufacturing Quality)
4. **Material consideration** - MDF vs plywood affects holding strength
5. **Validation expansion** - Add shear/pull-out checks
6. **BOM generation** - Production workflow gap

### LOW PRIORITY (Enhancement)
7. **Maxifix support** - Heavy-duty option
8. **Aluminum rail variant** - Premium option
9. **Assembly instruction generator** - Operator documentation
10. **Inset offset configuration** - Custom gap support

---

## Recommendations

1. **Phase 1**: Add installation rules as metadata to DrillMapPoint
   - Arrow orientation indicator
   - Tightening angle range
   - Rotation limits

2. **Phase 2**: Expand validation to include structural checks
   - Material factor in calculations
   - Load type classification
   - Risk scoring

3. **Phase 3**: Connector selection algorithm
   - Auto-select Minifix 12/15 based on thickness + load
   - Future Maxifix integration

4. **Phase 4**: BOM and documentation generation
   - Export connector list
   - Assembly instructions PDF
   - Operator guidance sheets

---

*Document generated by gap analysis review*
