# Design Document — Curved Panel System

## Overview

เพิ่มความสามารถงานโค้ง parametric (rounded corner / circular arc / S-curve / curved side panel ผลิตด้วย kerf bending) โดย **ต่อยอดของที่มีอยู่ทุกชั้น** — จุดที่ต้องสร้างใหม่จริงมีชั้นเดียวคือ *ชั้น model + generator* ที่เชื่อม Panel_Profile → Kerf_Pattern → pipeline เดิม

```
Panel_Profile (ใหม่: ใน Cabinet.ts)
   │ curveProfile.ts (ใหม่): profile → arc segments + Kerf_Zone
   ▼
Kerf_Pattern generator (ใหม่: เรียก KerfBending.ts เดิม)
   │
   ├─→ Cabinet3D (extrude arc profile + kerf overlay ใน X-Ray)   [truth-derivation]
   ├─→ generateDrillMap (กรองจุดใน Kerf_Zone — pattern เดิมของ edge margin)
   ├─→ Gate G12 (ใหม่: กฎ manufacturability ตามโครง G11)
   └─→ OperationGraph: SLOT ops (kerf) + arc segments (ขอบโค้ง)
          └─→ DXF R12 (ARC/bulge) + G-code (G2/G3 เดิม) + Cut List (developed length)
```

## Architecture Decisions

| # | การตัดสินใจ | เหตุผล |
|---|-------------|--------|
| D-1 | v1 = single-axis bend บนแผ่นเท่านั้น; ไม่ทำ compound curve 3D | freeform ต้องใช้ geometry kernel/tolerance healing คนละชุด (PRD Non-Goal N-1) — kerf bending ครอบคลุมชิ้นงานจริงของ DAPH ทั้ง 3 แบบในรูปอ้างอิง |
| D-2 | Kerf คำนวณผ่าน `KerfBending.ts` เดิมเท่านั้น | สูตร (arc length delta, min radius per material) proven แล้ว — reuse-not-fork |
| D-3 | Profile เก็บเป็นพารามิเตอร์ ไม่เก็บ tessellated mesh | determinism + ไฟล์เล็ก + แก้ค่าแล้ว regenerate ได้ (pattern เดียวกับ drill map) |
| D-4 | ขอบโค้งใน DXF ใช้ POLYLINE + bulge (R12-compatible) และ ARC entity เมื่อ dialect รองรับ | อยู่ในขีด R12 เดิม; dxfNormalize รู้จัก ARC แล้ว |
| D-5 | Kerf = SLOT operations ใน OperationGraph (ไม่สร้าง operation type ใหม่) | SLOT มีอยู่แล้ว (endPosition/width/depth) — ผ่าน G9/G10/T008 อัตโนมัติ |
| D-6 | Gate ใหม่เป็น **G12** แยกไฟล์ ไม่แตะ G1–G11 | Golden Rule 3: ไม่แก้ gate เดิม; G11 pairing validator ใช้ตรวจ connector ขาดคู่ได้อยู่แล้ว |
| D-7 | Nesting v1 ใช้ bounding box + ระบุ approximate ใน manifest | FFDH เป็น rect-based; true-shape nesting = future (P2) |
| D-8 | Skin_Panel เป็นชิ้นแยกใน BOM ผูกกับ parent panel ด้วย ref | ตรงกับการผลิตจริง (ตัด skin แยกแล้วประกบ) และ costing ถูกต้อง |

## Components

### ใหม่ (สร้าง)
| ไฟล์ | หน้าที่ |
|------|--------|
| `src/core/manufacturing/curve/curveProfile.ts` | Panel_Profile types + validation (tangency, bounds) + arc segment generation + Kerf_Zone computation |
| `src/core/manufacturing/curve/kerfPatternGenerator.ts` | Profile + material → เรียก `calculateKerfBending` → Kerf_Pattern (ตำแหน่ง/ความลึก/ทิศต่อร่อง) |
| `src/core/manufacturing/curve/__tests__/` | unit + PBT (7 correctness properties) + golden fixtures 3 ชุด |
| `src/gate/rules/gateG12_curveManufacturability.ts` (+ types + tests) | กฎ BLOCK/WARNING ตาม Req 3 |
| `src/components/canvas/KerfPatternOverlay.tsx` | X-Ray overlay ของร่อง kerf |

### แก้ไข (ต่อยอด)
| ไฟล์ | การเปลี่ยนแปลง |
|------|----------------|
| `src/core/types/Cabinet.ts` | เพิ่ม `profile?: PanelProfile` + `skin?: SkinConfig` (optional — backward compatible) |
| `src/core/store/useCabinetStore.ts` | actions: `updatePanelProfile`, regenerate hook (pattern เดียวกับ grain direction) |
| `src/components/ui/PanelOverrideModal.tsx` | section "Curve / Kerf" (โครง GrooveNumberInput เดิม, purple accent ตาม manufacturing params) |
| `src/components/canvas/Cabinet3D.tsx` | Panel3DComponent: extrude จาก arc profile (tessellation คงที่ + useMemo) |
| `src/core/manufacturing/drillMap/generateDrillMap.ts` | filter จุดใน Kerf_Zone + margin (ต่อจาก edge margin filter เดิม) |
| `src/cnc/mapping/*` / `buildOperationGraph` | map Kerf_Pattern → SLOT ops; ขอบโค้ง → arc path segments |
| `src/core/export/cabinetToDxf.ts` + `operationGraphToDxf.ts` | POLYLINE bulge / ARC สำหรับขอบโค้ง + kerf slots |
| `buildCutList` | Developed_Length + kerfCount + Skin_Panel row |
| `docs/SAFETY_GATE.md` | error codes G12.x |

## Data Model

```typescript
type PanelProfile =
  | { kind: 'RECT' }                                            // default — พฤติกรรมเดิม
  | { kind: 'ROUNDED_CORNER'; corners: { TL?: number; TR?: number; BL?: number; BR?: number } } // รัศมี mm ต่อมุม
  | { kind: 'ARC'; edge: PanelEdge; radius: number; sweepDeg: number }
  | { kind: 'S_CURVE'; edge: PanelEdge; r1: number; r2: number; sweepDeg1: number; sweepDeg2: number }; // tangent ต่อเนื่อง

interface KerfPattern {           // ผลจาก generator — deterministic
  zone: { start: number; end: number };   // ระยะตามขอบ (คลี่แบน)
  cuts: Array<{ position: number; depth: number; angleDeg: number }>;
  spacing: number; count: number;
  source: KerfBendingResult;               // traceability กลับ engine
}

interface SkinConfig { materialId: string; thickness: number; }
```

## Error Codes (G12)

| Code | Severity | เงื่อนไข |
|------|----------|---------|
| G12_RADIUS_BELOW_MIN | BLOCKER | radius < getMinimumBendRadius(material, thickness) |
| G12_KERF_SPACING_TOO_TIGHT | BLOCKER | spacing < bladeWidth + minWeb |
| G12_KERF_DEPTH_UNSAFE | BLOCKER | เนื้อคงเหลือ < skinMin + 0.5mm |
| G12_FITTING_IN_KERF_ZONE | BLOCKER | drill point ใน zone + margin |
| G12_SCURVE_TRANSITION_SHORT | WARNING | ช่วงเปลี่ยนทิศ < ค่าแนะนำ |
| G12_GRAIN_PARALLEL_TO_BEND | WARNING | grain ขนานแนวดัด |
| G12_MATERIAL_DATA_MISSING | BLOCKER | ไม่มีข้อมูล min bend radius (fail-safe) |

## Test Strategy (ตาม CONTRIBUTING 4 ระดับ)

1. **Unit**: curveProfile validation, kerf generator ต่อ material ทุกตัวใน catalog
2. **Snapshot/Golden**: 3 fixtures (rounded R, ARC 90°, S_CURVE) — DrillMap + Packet + DXF hash
3. **Property-based**: 7 properties จาก requirements (fast-check)
4. **Multi-pair**: panel โค้ง + connector รอบเขต (ยืนยัน exclusion + G11 pairing ยังผ่าน)
5. **e2e @smoke**: สร้างตู้มุมโค้ง → X-Ray เห็น kerf → export DXF ไม่มี error
