# MONOLITH Skills Index

Skills that enforce architectural invariants and prevent common bugs.

## Available Skills

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| [truth-derivation](truth-derivation/SKILL.md) | Stop UI≠Truth drift | Panel/material/geometry changes |
| [zustand-reactivity](zustand-reactivity/SKILL.md) | Fix store→3D reactivity | Store mutations affecting 3D |
| [geometry-invariants](geometry-invariants/SKILL.md) | Enforce OD/no-overlap invariants | Back panel, carcass geometry |
| [material-stack](material-stack/SKILL.md) | Central thickness/cut math | Material system changes |
| [export-determinism](export-determinism/SKILL.md) | Stable outputs + manifest | DXF/CSV/JSON export |
| [thickness-compliance](thickness-compliance/SKILL.md) | Single source of truth for thickness | Panel creation, material changes |
| [minifix-drillmap](minifix-drillmap/SKILL.md) | Minifix S200 + drill map + G11 validation | Hardware, drill map, 3D render, Gate G11 |

## Usage

Before implementing any task touching panels/materials/geometry/export:
1. Read the relevant skill(s)
2. Follow the Required Patterns
3. Avoid the Forbidden Patterns
4. Add regression tests as specified

## Quick Reference

### Common Bug → Skill Mapping

| Symptom | Likely Skill |
|---------|--------------|
| UI shows new value, 3D unchanged | zustand-reactivity |
| Thickness changed, depth unchanged | truth-derivation, thickness-compliance |
| Back panel overlaps carcass | geometry-invariants |
| Cut size wrong after edge change | material-stack |
| Export differs between runs | export-determinism |
| Back material changed, carcass unchanged | thickness-compliance |
| Inline thickness formula found | thickness-compliance |
| Distance B wrong (34 not 24) | minifix-drillmap |
| CAM on wrong panel type | minifix-drillmap |
| Drill points outside panel | minifix-drillmap |
| CAM depth wrong for wood thickness | minifix-drillmap |
| Dowel split depth reversed | minifix-drillmap |
| Hardware 3D render at wrong position | minifix-drillmap |
| Gate G11 validation fails | minifix-drillmap |

## Definition of Done (All Skills)

- [ ] Central calculators used (no inline formulas)
- [ ] Fallback chains respected
- [ ] Regression tests added
- [ ] Invariants maintained
