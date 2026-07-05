> ⚠️ **SUPERSEDED (2026-07-05):** ร่าง patch ภายนอกฉบับนี้ถูก review แล้วพบคลาดจาก spec หลายจุด (G12 หาย WARNING 2 ตัว, properties ตรง 2/9, phases คนละโครง, base commit ตกรุ่น) — เนื้อหาที่ถูกต้องถูก merge เข้า `specs/manufacturing/kerf-bending-algorithms.md` v1.1 + spec แล้ว (commit 7d03f3f) — เก็บไฟล์นี้ไว้เป็น provenance ของการ review เท่านั้น ห้ามใช้อ้างอิง

# Kerf Bending Algorithms — v1.1 PATCH
# แพตช์ back-port 4 มติจาก grilling เข้าเอกสาร Kerf Bending

**Patch Version:** 1.0 → **1.1**
**Date:** 2026-07-05
**Base doc:** `Kerf Bending Algorithms for CNC Manufacturing` v1.0 (2026-01-10)
**Source of change:** grilling session → spec commit `ba3d5b4` (มติ 4 ข้อ)
**Status:** review-then-merge patch — ยังไม่ merge เข้า v1.0

---

## ⚠️ Provenance legend (ที่มาของแต่ละส่วน)

เพื่อ traceability ที่ซื่อตรง ทุกบล็อกในแพตช์นี้ทำเครื่องหมายที่มา:

- **✅ SOURCED** — มาจากมติ grilling โดยตรง (แน่นอน)
- **📄 FROM v1.0** — มีอยู่ในเอกสาร v1.0 แล้ว (ยกมา/ต่อยอด)
- **🔶 PROPOSED** — ผมเติมให้ครบตามจำนวนที่ spec ระบุ (เช่น "G12 = 10 codes") **แต่ยังไม่ยืนยันกับ spec ba3d5b4 — ต้อง reconcile ก่อน freeze**

> ผมไม่มีไฟล์ spec `ba3d5b4` ตัวจริง จำนวนรวม (10 error codes / 9 properties / 8 phases) จึงยึดตามที่คุณแจ้ง แต่ *รายการย่อย* ที่ไม่ได้ระบุตรง ๆ ในมติ = 🔶 PROPOSED

---

## 0. Traceability Sheet — มติ ↔ spec ↔ ที่อยู่ใหม่ในเอกสาร

| มติ | สาระ | ผลใน spec (ba3d5b4) | ที่อยู่ใหม่ใน Kerf doc v1.1 | สถานะ |
|-----|------|----------------------|------------------------------|-------|
| **1** | ซอย kerf ด้วย router + ใบเลื่อย แล้วแต่งาน | `KerfToolProfile` (ROUTER Ø / SAW kerf) เลือกต่อ panel · G12 คิด spacing จาก tool ที่เลือก · Property 9 tool invariance | **PATCH A** (§1.3, §2.2, §4.2, §Properties) | ✅ back-port |
| **2** | วัสดุงานโค้งหลากหลาย | Req 2.7 ตาราง min bend radius ครบทุกวัสดุ×ความหนา · task 4.3 (มี source ต่อค่า) · ไม่มีข้อมูล = block | **PATCH B** (§2.7 ใหม่, §6.3+) | ✅ back-port |
| **3** | ปิดผิว kerf ด้วยแผ่นบาง + วีเนียร์/laminate | `SkinConfig` 2 โหมด: `SKIN_PANEL` / `SURFACE_FINISH` | **PATCH C** (§9 ใหม่) | ✅ back-port |
| **4** | ร่อง slot ประกบอยู่ v1 | **Requirement 8**: `matingSlotGenerator` + `pairKeyV2` · tol 0.1mm (=G11) · G12 +3 codes · Phase 2.5 | **PATCH D** (§10 ใหม่), **PATCH E** (G12), **PATCH G** (tasks) | ✅ back-port |
| รวม | — | G12 = **10 codes** · Correctness Properties = **9** · tasks = **8 phases** | PATCH E / F / G | 🔶 ยอดรวมยืนยัน, รายการย่อยบางส่วน proposed |

---

## PATCH A — Kerf Tool Profile (มติ 1)  ✅

### แทรกที่ §1.3 (ใหม่) — Tool model: Router และ Saw

เดิม v1.0 สมมติ **router อย่างเดียว** (`M03 S18000`, spindle plunge) v1.1 รองรับ 2 ชนิดเครื่องมือ เลือกได้ **ต่อ panel**:

| Tool type | นิยามด้วย | k_eff มาจาก | Toolpath | เหมาะกับ |
|-----------|-----------|-------------|----------|----------|
| **ROUTER** | เส้นผ่านศูนย์กลางดอก Ø (`bit_diameter_mm`) | Ø + runout (calibrate §6.1) | plunge + traverse (serpentine, depth ramp) | ร่องปลายโค้ง, งานละเอียด, ปลายไม่ทะลุขอบ |
| **SAW** | ความหนาใบ (`blade_kerf_mm`) | ความหนาใบ + set + runout | pass ตรงตามแนวใบ (ไม่ plunge เป็นจุด) | ร่องตรงยาว, throughput สูง, kerf กว้างคงที่ |

**G12 spacing คิดจาก tool ที่เลือก** (มติ 1) — สูตร §2.2 เดิมใช้ `k` ตัวเดียว → v1.1 ใช้ `k_eff(tool)`:

```
p(s) = clamp( θ_allow / max(κ,ε), p_min, p_max )
θ_allow = C_mat × atan( k_eff(tool) / t_web )      ← k_eff ขึ้นกับ tool ที่เลือก
p_min   ≥ 1.8 × k_eff(tool)
```

### แทรกที่ §4.2 (ต่อจาก MachineSpec) — data structure  ✅

```typescript
type KerfToolKind = 'ROUTER' | 'SAW';

interface KerfToolProfile {
  id: string;
  kind: KerfToolKind;
  // ROUTER: ใช้ bitDiameterMm ; SAW: ใช้ bladeKerfMm
  bitDiameterMm?: number;      // ROUTER only
  bladeKerfMm?: number;        // SAW only
  kEffMm: number;              // ค่าที่ calibrate จริง (§6.1) — ทั้งสองชนิดต้องมี
  maxDepthMm?: number;         // SAW: ความลึกสูงสุดที่ตัดได้ (blade projection)
}

// ต่อ panel เลือก tool ได้
interface PanelKerfAssignment {
  panelId: string;
  toolProfileId: string;       // อ้าง KerfToolProfile.id
}
```

### Property 9 — Tool Invariance (มติ 1)  ✅  → ดู PATCH F

> **นิยาม:** เปลี่ยน `KerfToolProfile` (ROUTER↔SAW หรือเปลี่ยน Ø/ใบ) แล้ว **รูปโค้งปลายทางต้องเท่าเดิม** (R เป้าหมาย + arc length + มุมรวม θ ไม่เปลี่ยน) — สิ่งที่ปรับตามได้คือ *จำนวนร่อง N, spacing p, ความลึก d* เท่านั้น ผลลัพธ์การดัดต้อง invariant ต่อ tool

**เหตุผลทางวิศวกรรม:** N·k_eff ≈ ΔL (§1.2) เป็น invariant — tool กว้างขึ้น → N น้อยลง แต่ ΔL ที่ถูกลบออกรวมเท่าเดิม → โค้งเท่าเดิม เทสต้อง assert: `abs(R_out(toolA) − R_out(toolB)) ≤ tol_R`

---

## PATCH B — Min Bend Radius Catalog + Block Rule (มติ 2)  ✅

### แทรกที่ §2.7 (ใหม่) — Requirement 2.7  ✅

> **Req 2.7:** ก่อนปล่อย **v1** ต้องเติมตาราง **min bend radius (R_min) ครบทุก (วัสดุ × ความหนา) ที่มีใน catalog** โดยแต่ละค่า **ต้องมี source อ้างอิง** (→ **task 4.3**) วัสดุ×ความหนาใดที่ **ไม่มีข้อมูล = block** (ห้าม plan งานโค้งจนกว่าจะเติม)

### R_min Catalog (skeleton — ห้าม fabricate ค่า)  🔶/✅

โครงสร้าง gate — ค่ายังต้องเติมจริงใน task 4.3 (ไม่ใส่ตัวเลขลอย ๆ เพื่อไม่ให้เข้าใจผิดว่า verified):

| Material | Thickness | R_min (mm) | Source | Status |
|----------|-----------|-----------|--------|--------|
| Plywood | 6 mm | — | (task 4.3) | ⛔ REQUIRED before v1 |
| Plywood | 9 mm | — | (task 4.3) | ⛔ REQUIRED before v1 |
| Plywood | 12 mm | — | (task 4.3) | ⛔ REQUIRED before v1 |
| Plywood | 18 mm | — | (task 4.3) | ⛔ REQUIRED before v1 |
| MDF | 6 mm | — | (task 4.3) | ⛔ REQUIRED before v1 |
| MDF | 9 mm | — | (task 4.3) | ⛔ REQUIRED before v1 |
| MDF | 12 mm | — | (task 4.3) | ⛔ REQUIRED before v1 |
| *(ทุกวัสดุ×ความหนาอื่นใน catalog)* | … | — | (task 4.3) | ⛔ REQUIRED |

> 📄 หมายเหตุ: §6.3 v1.0 มี `t_web / p_min / p_max / feed / γ` ต่อวัสดุ×ความหนาแล้ว — เอาไว้เป็น *input การออกแบบร่อง* แต่ **R_min เป็นคนละค่า** (ขีดจำกัดต่ำสุดที่ปลอดภัย) ต้องหา source เอง อย่า derive จาก p/t_web โดยไม่ทดสอบ

### Validation gate (มติ 2)  ✅

```
IF material×thickness ∉ R_min catalog  → G12: MATERIAL_NO_BEND_DATA  (block)
IF requested R_min_job  <  catalog R_min → G12: BEND_RADIUS_BELOW_MIN (block)
```

---

## PATCH C — SkinConfig: ปิดผิว kerf (มติ 3)  ✅

### แทรกเป็น §9 (ใหม่) — Surface treatment ของด้าน concave

v1.0 รับรู้ปัญหา ("ด้าน concave มีร่องเห็น ไม่เรียบ") แต่ไม่มีทางแก้ v1.1 เพิ่ม `SkinConfig` **2 โหมด**:

| โหมด | คืออะไร | ผลใน BOM / material stack |
|------|---------|----------------------------|
| **`SKIN_PANEL`** | แผ่นบางปิดทับ (HDF/MDF บาง) เป็น **ชิ้นแยก** | โผล่เป็น **line item แยกใน BOM** (มี nesting/ตัดของตัวเอง) |
| **`SURFACE_FINISH`** | วีเนียร์/laminate ปิดผิว | อยู่ใน **material stack** ของ panel (คิดใน composite thickness ไม่แยกชิ้น) |

```typescript
type SkinMode = 'SKIN_PANEL' | 'SURFACE_FINISH';

interface SkinConfig {
  mode: SkinMode;
  materialId: string;          // HDF/MDF (SKIN_PANEL) หรือ veneer/laminate (SURFACE_FINISH)
  thicknessMm: number;
  side: 'CONCAVE' | 'CONVEX' | 'BOTH';
  // SKIN_PANEL → generator สร้างชิ้นแยก + ส่งเข้า BOM/nesting
  // SURFACE_FINISH → รวมใน calculateCompositeThickness() (material stack)
}
```

> เชื่อมกับ material physics เดิม: `SURFACE_FINISH` เข้า `calculateCompositeThickness()` (T_total += skin + glue); `SKIN_PANEL` ไม่กระทบ composite แต่ +1 ชิ้นใน BOM

---

## PATCH D — Requirement 8: Mating Slot Generator (มติ 4)  ✅

### แทรกเป็น §10 (ใหม่) — Requirement 8 (v1 scope)

> **Requirement 8:** ระบบต้องมี `matingSlotGenerator` ที่สร้าง **ซี่ (fingers) ฝั่งโค้ง** + **ร่องรับ (receiving grooves) ฝั่งแผ่นประกบ** เป็น **คู่** ผูกกันด้วย **`pairKeyV2`** (รูปแบบเดียวกับ Minifix pairing) — tolerance **0.1 mm เท่ากับ G11**

**พฤติกรรม generator:**
1. รับขอบโค้ง (curved edge) + แผ่นประกบ (mating panel)
2. สร้างซี่บนชิ้นโค้ง ระยะ/จำนวนคุมด้วยพารามิเตอร์ + ต้องไม่ทับ kerf slot
3. สร้างร่องรับบนแผ่นประกบให้ตรงคู่ ผูก `pairKeyV2` เดียวกัน
4. ตรวจ tolerance 0.1mm (ซี่ vs ร่อง) — เกิน → G12 error

```typescript
interface MatingSlotPair {
  pairKeyV2: string;           // คีย์จับคู่ (แบบเดียวกับ Minifix pairKey)
  fingerPanelId: string;       // ฝั่งโค้ง (ซี่)
  slotPanelId: string;         // ฝั่งประกบ (ร่องรับ)
  toleranceMm: number;         // = 0.1 (เท่า G11)
  fingers: { s_at_mm: number; widthMm: number; depthMm: number }[];
  grooves: { s_at_mm: number; widthMm: number; depthMm: number }[];
}
```

**ลำดับใน priority logic (§5.2):** mating slot จัดอยู่กลุ่ม routing ก่อน profile cut-out และต้องเช็คไม่ทับ kerf slot (→ `SLOT_OVERLAPS_KERF`)

---

## PATCH E — G12 Error Codes (10)  🔶 + ✅

ขยาย `validateSlotPlan` (§6.4 v1.0, มี 4 rules) → **ระบบ G12 error code 10 ตัว** ตามที่ spec ระบุ:

| # | Code | Trigger | ที่มา |
|---|------|---------|-------|
| 1 | `WEB_TOO_THIN` | t_web < 15% ของความหนา | 📄 v1.0 Rule 1 |
| 2 | `SPACING_TOO_SMALL` | p_min < 1.8 × k_eff | 📄 v1.0 Rule 2 |
| 3 | `EDGE_MARGIN_TOO_SMALL` | edge_margin < 8mm | 📄 v1.0 Rule 3 |
| 4 | `SLOT_HARDWARE_COLLISION` | ร่องชนรู hardware | 📄 v1.0 Rule 4 |
| 5 | `MATERIAL_NO_BEND_DATA` | วัสดุ×ความหนาไม่มีใน R_min catalog | ✅ มติ 2 |
| 6 | `BEND_RADIUS_BELOW_MIN` | R ที่ขอ < catalog R_min | ✅ มติ 2 |
| 7 | `KERF_TOOL_INVALID` | tool profile ไม่ถูก/ไม่ครบ (ไม่มี k_eff ฯลฯ) | 🔶 PROPOSED (มติ 1) |
| 8 | `SLOT_EDGE_INSUFFICIENT` | ขอบเหลือไม่พอทำซี่/ร่อง | ✅ มติ 4 |
| 9 | `SLOT_PAIR_MISMATCH` | ซี่–ร่องคู่ไม่ตรง / pairKeyV2 ไม่ครบคู่ | ✅ มติ 4 |
| 10 | `SLOT_OVERLAPS_KERF` | mating slot ทับ kerf slot | ✅ มติ 4 |

> 🔶 **ต้อง reconcile:** โค้ด #1–4 มาจาก v1.0 doc, #5,6,8,9,10 มาจากมติ แต่ **spec เดิม (ก่อนมติ 4) มี 7 codes** ผมจึงใส่ #7 (`KERF_TOOL_INVALID`) เป็นตัวเติมให้ครบ 7 ก่อน +3 = 10 — **โปรดตรวจกับ spec ba3d5b4 ว่า 7 ตัวเดิมคือชุดนี้จริงไหม** ถ้าไม่ตรงให้แก้ #5–7 ตาม spec

```typescript
// โครง validate ที่คืน G12 code
type G12Code =
  | 'WEB_TOO_THIN' | 'SPACING_TOO_SMALL' | 'EDGE_MARGIN_TOO_SMALL'
  | 'SLOT_HARDWARE_COLLISION' | 'MATERIAL_NO_BEND_DATA' | 'BEND_RADIUS_BELOW_MIN'
  | 'KERF_TOOL_INVALID' | 'SLOT_EDGE_INSUFFICIENT' | 'SLOT_PAIR_MISMATCH'
  | 'SLOT_OVERLAPS_KERF';

interface G12Issue { code: G12Code; message: string; panelId?: string; slotIndex?: number; }
```

---

## PATCH F — Correctness Properties (9)  🔶 + ✅

v1.0 ไม่มีหมวดนี้ v1.1 เพิ่ม **9 properties** (ตาม spec) — **Property 9 = tool invariance มาจากมติ**, ที่เหลือ derive จาก invariant วิศวกรรมใน v1.0 (🔶 proposed):

| # | Property | ยืนยันอะไร | ที่มา |
|---|----------|-----------|-------|
| P1 | Arc-length conservation | Σ(ΔL ที่ลบ) = (θ/360)·2π·T (§1.2) | 🔶 จาก §1.2 |
| P2 | Web-thickness safety | ทุกร่อง d = T − t_web, t_web ≥ 15%T | 🔶 จาก §2.3 |
| P3 | Spacing bounds | p ∈ [1.8·k_eff, p_max] เสมอ | 🔶 จาก §2.2 |
| P4 | Spring-back applied | R_design = 1/(κ(1+γ)) ก่อน gen | 🔶 จาก §2.6 |
| P5 | No slot collision | ร่านไม่ทับกัน/ไม่ทับ hardware | 🔶 จาก §6.4 |
| P6 | Edge integrity | ทุกร่านเว้น edge_margin ≥ 8mm | 🔶 จาก §2.5 |
| P7 | Cut-order safety | เจาะ→kerf→cut-out (§5.2) | 🔶 จาก §5.2 |
| P8 | Pair symmetry | ทุก mating pair มี finger+groove ครบคู่ (pairKeyV2) | ✅ มติ 4 |
| **P9** | **Tool invariance** | เปลี่ยน tool → รูปโค้งปลายทางเท่าเดิม | ✅ **มติ 1** |

> 🔶 P1–P7 เป็นการ formalize invariant ที่มีอยู่แล้วใน v1.0 ให้เป็น property — **ต้องเทียบว่า spec ระบุ 9 ข้อนี้ตรงกันไหม** (โดยเฉพาะถ้อยคำ) P8, P9 มั่นใจจากมติ

---

## PATCH G — Tasks / 8 Phases (+ Phase 2.5, task 4.3)  🔶 + ✅

| Phase | งาน | ที่มา |
|-------|-----|-------|
| 1 | Curve parse + curvature sampler (§3) | 🔶 จาก v1.0 |
| 2 | Kerf planner + G-code gen (single tool, §3.1/§5) | 🔶 จาก v1.0 |
| **2.5** | **Mating slot generator + pairKeyV2 (Requirement 8)** | ✅ **มติ 4** |
| 3 | Multi-tool (KerfToolProfile ROUTER/SAW, §PATCH A) | ✅ มติ 1 |
| 4 | Material catalog · **task 4.3 = เติม R_min ครบ + source** | ✅ มติ 2 |
| 5 | SkinConfig (SKIN_PANEL/SURFACE_FINISH) → BOM/stack | ✅ มติ 3 |
| 6 | G12 validation (10 codes) + Correctness Properties (9) tests | ✅/🔶 |
| 7 | Calibration (k_eff, γ) ต่อ tool (§6.1/§6.2) | 📄 v1.0 |
| 8 | Simulator/backplot + QA checklist (§8) | 📄 v1.0 |

> 🔶 การจับ Phase (ลำดับ/ขอบเขต) เป็นข้อเสนอ — **ต้องเทียบกับ 8 phases จริงใน spec ba3d5b4** ว่าตรงกันไหม ตัวที่มั่นใจคือ **Phase 2.5** (mating slot) และ **task 4.3** (R_min)

---

## Reconciliation checklist — ก่อน freeze v1.1 (เทียบกับ spec ba3d5b4)

- [ ] G12: ตรวจ 7 codes เดิม (#1–7) ตรงกับ spec ไหม — โดยเฉพาะ #7 `KERF_TOOL_INVALID` (🔶)
- [ ] Correctness Properties: P1–P7 ถ้อยคำตรงกับ spec 9 ข้อไหม (🔶)
- [ ] Tasks: 8 phases + ลำดับ ตรงกับ spec ไหม (🔶)
- [ ] R_min catalog: task 4.3 เติมค่า + source ครบทุกวัสดุ×ความหนา (⛔ ก่อนปล่อย v1)
- [ ] `pairKeyV2` / tolerance 0.1mm: ยืนยันว่าใช้กลไกเดียวกับ Minifix pair (=G11) จริง
- [ ] version bump v1.0 → v1.1 + changelog อ้าง commit `ba3d5b4` ในตัวเอกสารแม่

---

*แพตช์นี้เป็น back-port ของ 4 มติเข้าเอกสาร reference — review + reconcile รายการ 🔶 กับ spec ก่อน merge เป็น Kerf Bending v1.1 authoritative*
