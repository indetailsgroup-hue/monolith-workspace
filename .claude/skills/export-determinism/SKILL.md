# Export Determinism Skill — MONOLITH

## Purpose
Guarantee same inputs always produce the same factory outputs (DXF/CSV/JSON/manifest), independent of render state.

## Core Rule
Export and Gate must consume Truth Layer ONLY:
- useCabinetStore state (cabinets, panels, structure)
- Manufacturing calculators
- OperationGraph / DrillMap builder

Never from:
- R3F meshes
- BoxGeometry / visual bounding boxes
- textures/thumbnails
- UI-only computed values

## Deterministic Contract
Given:
- Cabinet + Panel models (IDs stable)
- Material registry (versioned)
- Machine profile (versioned)
- Policy constants (versioned)

Then:
- DXF sheets
- CSV cut list
- JSON report
- manifest hash

must be identical across runs.

## Mandatory Practices
- **Stable ordering:**
  - sort cabinets by id
  - sort panels by role + id
  - sort edges consistently (top,bottom,left,right)
- **Stable numeric formatting:**
  - fixed precision or stable serializer
- **Version stamps:**
  - include catalog version/policy version in manifest

## Forbidden Patterns (Hard Fail)
❌ Using Date.now() / random() in export payload
❌ Iterating over object keys without ordering
❌ Depending on rendering-derived values

## Required Regression Tests
- Snapshot tests for export JSON (stable)
- Hash tests for manifest determinism
- Cross-check:
  - manufacturing dims used in DXF == those used in CSV

## Gate Coupling
Gate validation should run on the same derived values export will use:
- if Gate PASS then Export should not diverge
- if Export uses a different formula, that's a critical bug

## Definition of Done
- Export outputs are repeatable byte-for-byte for identical inputs
- Visual layer changes cannot affect factory outputs
