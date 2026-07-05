# Requirements Document

## Introduction

เอกสารนี้กำหนด requirements ของฟีเจอร์ **Curved Panel System** — ทำให้ MONOLITH รองรับ**งานโค้งแบบ parametric** ในตู้เฟอร์นิเจอร์แผ่น: มุมโค้งรัศมี R (rounded corner), ส่วนโค้งวงกลม (circular arc), S-curve (สองโค้งต่อเนื่องแบบ tangent) และ side panel โค้ง — ผลิตด้วยเทคนิค **kerf bending** (ซอยร่องด้านในของแผ่นตามแนวโค้ง แล้วดัด + ปิดผิวด้วย skin) ตามชิ้นงานจริงของ DAPH และตัวอย่างอุตสาหกรรม (Circular Arc System / S圆弧)

**ขอบเขต v1 (สำคัญ):** โค้งแกนเดียว (single-axis bend) บนแผ่น panel เท่านั้น — ไม่รวม compound curve 3 มิติ / freeform solid modeling (ยังคงเป็น Non-Goal N-1 ของ PRD เพราะต้องใช้ geometry kernel คนละชุด)

**เอกสารวิศวกรรมหลัก (authoritative):** `specs/manufacturing/kerf-bending-algorithms.md` (v1.0, 2026-01-10) — สูตรครบ: `θ_allow = C_mat × atan(k/t_web)`, `p(s) = θ_allow/κ(s)` (variable curvature), spring-back `κ' = κ×(1+γ)`, กฎ `t_web ≥ 15%T`, `p_min ≥ 1.8k`, `edge_margin ≥ 8mm`, ตารางพารามิเตอร์ plywood/MDF, calibration k_eff/γ, toolpath strategy, KPI (คลาดรัศมี ≤5%, FTY ≥95%) — **requirement ทุกข้อในเอกสารนี้ต้องสอดคล้องกับเอกสารนั้น ห้ามกำหนดสูตรใหม่**

**Reuse-not-fork (ข้อบังคับ):**
- **Kerf engine** = `src/core/catalog/KerfBending.ts` (bendRadius, bendAngle, arcLength in/out, kerfCount, kerfSpacing, `getMinimumBendRadius(material, thickness)`) — **task แรกต้อง reconcile engine นี้กับ kerf-bending-algorithms.md** ว่า implement สูตรครบหรือยัง (variable curvature + spring-back อาจยังไม่มี)
- **Arc toolpath** = G-code IR `ARC_CW/ARC_CCW` + planOps + dialect Biesse/HOMAG (G2/G3, I/J) + entry/exit arc leads + toolpath verifier + simulator (`src/core/manufacturing/gcode/`, `toolpath/`)
- **SLOT operation** = ประเภท operation ที่มีอยู่ใน CNC ops สำหรับร่อง kerf
- **Gate framework** = โครง G11 (`src/gate/rules/`) — เพิ่ม G12 ไม่แก้ G เดิม
- **Material Stack** = `PanelMaterialSystem` + `materialThickness.ts` (single source of thickness — skill: thickness-compliance)
- **Determinism** = stable JSON + golden fixtures + fast-check PBT (skill: export-determinism)
- **Truth Derivation** = UI 3D และไฟล์ผลิตต้อง derive จาก model เดียวกัน (skill: truth-derivation)

## Glossary

- **Panel_Profile**: รูปทรงระนาบของแผ่นแบบ parametric — `RECT` (ค่าเริ่มต้น) | `ROUNDED_CORNER` (มุมโค้งรัศมี R ต่อมุม) | `ARC` (โค้งวงกลมส่วนเดียว) | `S_CURVE` (สองโค้ง tangent ทิศสลับ)
- **Kerf_Zone**: บริเวณบนแผ่นที่ต้องซอยร่อง kerf เพื่อดัดโค้ง = ส่วนโค้งของ profile + ระยะเผื่อเข้า/ออก
- **Kerf_Pattern**: ชุดร่อง kerf ที่ generate จาก Kerf engine (จำนวน N, ระยะห่าง S, ความลึก, ทิศตั้งฉากกับแนวสัมผัสโค้ง)
- **Skin_Panel**: แผ่นบางปิดหน้าร่อง kerf หลังดัด (optional) — เป็นชิ้นงานแยกใน BOM
- **Developed_Length**: ความยาวคลี่แบน (arc length ด้านนอก) ที่ใช้ตัดจริง — ไม่ใช่ bounding box
- **Min_Bend_Radius**: รัศมีดัดต่ำสุดต่อ (วัสดุ, ความหนา) จาก `getMinimumBendRadius`
- **Kerf_Margin**: ระยะกันชนรอบ Kerf_Zone ที่ห้ามมี fitting/รูเจาะ
- **Kerf_Tool_Profile**: เครื่องมือที่ใช้ซอย kerf — `ROUTER` (end mill, ร่องกว้าง = Ø ดอก) | `SAW` (ใบเลื่อย, ร่องกว้าง = kerf ใบ) เลือกได้ต่องาน (มติ grilling: โรงงานใช้ทั้งสองแบบ)
- **Mating_Slot_Pattern**: ร่อง slot ซี่ ๆ บนขอบชิ้นโค้ง + ร่องรับบนแผ่นประกบ สำหรับต่อชิ้นโค้งเข้ากับแผ่นข้างเคียง (ตามชิ้นงานจริง) — ต้องจับคู่กันแบบ deterministic
- **G12**: Safety Gate ใหม่ — Curve Manufacturability validation

> **มติ grilling spec (2026-07-04):** (1) รองรับ kerf tool 2 แบบเลือกต่องาน (2) ข้อมูล Min_Bend_Radius ต้องครบทุกวัสดุใน catalog ตั้งแต่ v1 เพราะงานจริงใช้วัสดุหลากหลาย (3) Skin มี 2 โหมด: แผ่นแยก HDF/MDF 3–4mm และวีเนียร์/laminate ใน material stack (4) Mating Slot ต้องอยู่ใน v1

## Requirements

### Requirement 1: Parametric Panel Profile Model

**User Story:** As a Designer, I want กำหนดแผ่นให้มีมุมโค้ง R / โค้งวงกลม / S-curve ด้วยพารามิเตอร์ (รัศมี, มุม, ตำแหน่ง), so that ฉันออกแบบงานโค้งได้ในโปรแกรมเดียวโดยไม่ต้องวาด freeform

#### Acceptance Criteria

1. THE Cabinet model SHALL ขยาย `CabinetPanel` ด้วย `profile: Panel_Profile` (ค่าเริ่มต้น `RECT` — backward compatible: โปรเจกต์เดิม load ได้โดยพฤติกรรมไม่เปลี่ยน)
2. WHEN Designer กำหนด `ROUNDED_CORNER` THE ระบบ SHALL รับรัศมี R ต่อมุม (0 = เหลี่ยม) และ validate R ≤ min(กว้าง, สูง)/2
3. WHEN Designer กำหนด `ARC` หรือ `S_CURVE` THE ระบบ SHALL รับพารามิเตอร์ {รัศมี, มุมกวาด, จุดเริ่ม} และสำหรับ S_CURVE SHALL บังคับความต่อเนื่องแบบ tangent ระหว่างสองโค้ง (G1 continuity)
4. THE Panel_Profile SHALL เป็น deterministic: พารามิเตอร์เดิม → geometry เดิมทุก byte (ผ่าน stable serialization)
5. IF พารามิเตอร์ทำให้ geometry ขัดแย้ง (โค้งตัดกันเอง/เกินขอบแผ่น), THEN THE ระบบ SHALL ปฏิเสธที่ชั้น input พร้อมเหตุผล — ไม่สร้าง geometry เสีย

### Requirement 2: Kerf Pattern Generation (จาก engine เดิม)

**User Story:** As a Factory Operator, I want ให้ระบบ generate ร่อง kerf อัตโนมัติจากพารามิเตอร์โค้ง, so that ฉันไม่ต้องคำนวณจำนวน/ระยะร่องเองหน้างาน

#### Acceptance Criteria

1. WHEN panel มี Kerf_Zone THE ระบบ SHALL เรียก `calculateKerfBending` (engine เดิม) ด้วย {วัสดุ, ความหนา, รัศมี, มุม} → ได้ kerfCount N + kerfSpacing S
2. THE Kerf_Pattern SHALL วางร่องตั้งฉากกับแนวสัมผัสโค้ง กระจายตาม arc length ด้านนอก (คลี่แบน) — ตำแหน่งเป็น deterministic
3. THE ความลึกร่อง SHALL เหลือเนื้อวัสดุ (t_web) ≥ **max( 15% ของความหนาแผ่น, ความหนา skin ขั้นต่ำ + 0.5mm )** — รวมเกณฑ์จาก kerf-bending-algorithms.md §2.3 (web ≥15%T) กับ thickness safety margin ของระบบเจาะเป็นเกณฑ์เดียว (มติ review patch 2026-07-05)
4. IF วัสดุไม่มีข้อมูลใน `getMinimumBendRadius`, THEN THE ระบบ SHALL fail-safe block (ไม่เดาค่า) พร้อมข้อความให้เพิ่มข้อมูลวัสดุ
5. WHEN ผู้ใช้แก้รัศมี/วัสดุ/ความหนา THE Kerf_Pattern SHALL regenerate อัตโนมัติ (ไม่มี stale state — skill: zustand-reactivity)
6. THE ผู้ใช้ SHALL เลือก Kerf_Tool_Profile (`ROUTER` | `SAW`) ต่อ panel ได้ และความกว้างร่อง/ระยะห่างขั้นต่ำ SHALL คิดจาก tool ที่เลือก (มติ grilling #1)
7. THE v1 SHALL มีตาราง Min_Bend_Radius ครบทุกวัสดุ×ความหนาใน `PanelMaterialSystem` catalog (MDF/PB/plywood) ก่อนปล่อยใช้ — เพราะงานจริงใช้วัสดุหลากหลาย (มติ grilling #2)

### Requirement 3: Gate G12 — Curve Manufacturability

**User Story:** As a Technician, I want ด่านตรวจที่ block งานโค้งที่ผลิตไม่ได้ก่อน export, so that ไม่มีชิ้นงานโค้งพังในโรงงาน

#### Acceptance Criteria

1. THE G12 SHALL BLOCK เมื่อ รัศมี < Min_Bend_Radius(วัสดุ, ความหนา)
2. THE G12 SHALL BLOCK เมื่อ kerfSpacing < ขีดจำกัดเครื่องมือ (kerf blade width + เนื้อไม้ขั้นต่ำระหว่างร่อง)
3. THE G12 SHALL BLOCK เมื่อ ความลึกร่องละเมิดเกณฑ์ Req 2.3
4. THE G12 SHALL BLOCK เมื่อ มี drill point / fitting อยู่ภายใน Kerf_Zone + Kerf_Margin (ค่าเริ่มต้น 8mm — ค่าเดียวกับ minMarginToEdgeMm)
5. THE G12 SHALL WARNING (waive ได้) เมื่อ S_CURVE มีช่วงเปลี่ยนทิศสั้นกว่าค่าแนะนำ หรือ grain direction ขนานแนวดัด (เสี่ยงหัก)
6. THE G12 SHALL ใช้ severity/waive/audit semantics เดียวกับ gate เดิมทุกประการ และต้องมี error code ลง `docs/SAFETY_GATE.md` (Golden Rule 6)

### Requirement 4: DrillMap และ System 32 หลบเขตโค้ง

**User Story:** As a Designer, I want ให้ Minifix/เดือย/shelf pin หลบเขตโค้งอัตโนมัติ, so that ข้อต่อไม่ตกในบริเวณที่ดัด

#### Acceptance Criteria

1. WHEN generate DrillMap บน panel ที่มี Kerf_Zone THE ระบบ SHALL กรองจุดเจาะทุกชนิดออกจาก Kerf_Zone + Kerf_Margin (pattern เดียวกับ edge margin filtering เดิมใน `generateDrillMap.ts`)
2. THE System 32 pattern SHALL ข้ามช่วงโค้งแล้วต่อ pitch ใหม่หลังพ้นเขต โดยตำแหน่งยัง deterministic
3. IF การกรองทำให้ connector คู่ใดขาดคู่ (CAM ไม่มี BOLT), THEN THE G11 เดิม SHALL ตรวจพบ (ไม่ต้องเพิ่มกฎใหม่ — reuse pairing validator)

### Requirement 5: 3D Visualization (Truth Derivation)

**User Story:** As a Designer, I want เห็นแผ่นโค้งและร่อง kerf ใน 3D/X-Ray ตรงกับที่โรงงานจะได้, so that ฉันตรวจงานได้ก่อนส่งจริง

#### Acceptance Criteria

1. THE Cabinet3D SHALL render Panel_Profile โค้งจาก model เดียวกับที่ใช้สร้างไฟล์ผลิต (ห้าม fork geometry — skill: truth-derivation)
2. WHEN X-Ray mode เปิด THE ระบบ SHALL แสดง Kerf_Pattern overlay บนหน้าที่ถูกซอย
3. THE การ render SHALL ไม่ทำให้ FPS ตกอย่างมีนัยจากแผ่นเหลี่ยม (ใช้ arc tessellation คงที่ + memo)

### Requirement 6: Export — DXF / CNC / Cut List

**User Story:** As a Factory Operator, I want ไฟล์ DXF/G-code ที่มีขอบโค้งและร่อง kerf ครบ พร้อมความยาวคลี่แบนใน cut list, so that ตัดและซอยได้จากไฟล์ตรง ๆ

#### Acceptance Criteria

1. THE OperationGraph SHALL แทนร่อง kerf เป็น SLOT operations และขอบโค้งเป็น arc segments (ผ่าน IR `ARC_CW/ARC_CCW` เดิม)
2. THE DXF export SHALL ปล่อยขอบโค้ง (ARC entity หรือ POLYLINE + bulge ตาม R12) และผ่าน G10.1/10.2/10.3 ครบ
3. THE Cut List SHALL แสดง Developed_Length (คลี่แบน) เป็นขนาดตัด และระบุ kerfCount ต่อชิ้น
4. WHEN panel มี skin โหมดแผ่นแยก (HDF/MDF 3–4mm) THE BOM SHALL มี skin เป็นชิ้นแยก (วัสดุ/ความหนา/ขนาดคลี่); WHEN ใช้โหมดวีเนียร์/laminate THE ระบบ SHALL บันทึกใน material stack ของแผ่นโค้ง (surface layer) โดยไม่สร้างชิ้นแยก (มติ grilling #3)
5. THE export ทั้งหมด SHALL deterministic (hash เดิมต่อ input เดิม) และเข้า Factory Packet + signed receipt ตามปกติ
6. THE Nesting (v1) SHALL ใช้ bounding box ของชิ้นโค้ง และ manifest SHALL ระบุว่าเป็น approximate (no silent caps)

### Requirement 7: Persistence และ Backward Compatibility

**User Story:** As a Designer, I want โปรเจกต์เก่าเปิดได้เหมือนเดิมและโปรเจกต์ใหม่เก็บพารามิเตอร์โค้งครบ, so that ไม่มีงานเดิมพัง

#### Acceptance Criteria

1. THE project serialization SHALL เก็บ Panel_Profile + Kerf/Skin config และ load กลับได้ครบ (round-trip)
2. WHEN load โปรเจกต์ที่ไม่มี field profile THE ระบบ SHALL default เป็น RECT โดยไม่มี migration error
3. THE golden fixtures SHALL ครอบคลุมอย่างน้อย: rounded corner R เดียว, ARC 90°, S_CURVE — เทียบ DrillMap/Packet hash

### Requirement 8: Mating Slot Joint (ร่องประกบชิ้นโค้ง) — v1 บังคับ (มติ grilling #4)

**User Story:** As a Factory Operator, I want ร่อง slot บนขอบชิ้นโค้งและร่องรับบนแผ่นประกบที่ generate อัตโนมัติและจับคู่กันพอดี, so that ประกอบชิ้นโค้งเข้ากับโครงตู้ได้แม่นเหมือนชิ้นงานอ้างอิง

#### Acceptance Criteria

1. WHEN ขอบของ curved panel ประกบกับแผ่นข้างเคียง THE ระบบ SHALL generate Mating_Slot_Pattern คู่กัน: ซี่ slot บนขอบชิ้นโค้ง + ร่องรับ (dado/slot) บนแผ่นรับ — จำนวน/ระยะ/ความลึกเป็น deterministic จากพารามิเตอร์
2. THE slot คู่ SHALL ผูกกันด้วย pair key แบบเดียวกับระบบ CAM↔BOLT (content-addressed) เพื่อ traceability และ override ได้ต่อคู่
3. THE ความลึก slot SHALL เคารพ thickness safety margin 0.5mm ของแผ่นรับ และร่อง slot SHALL ไม่ทับ Kerf_Zone/รูเจาะ (ตรวจใน G12)
4. IF ระยะขอบของแผ่นรับไม่พอสำหรับร่องรับ, THEN THE G12 SHALL BLOCK (`G12_SLOT_EDGE_INSUFFICIENT`)
5. THE slot ทั้งสองฝั่ง SHALL ออกเป็น SLOT/DADO operations ใน OperationGraph และปรากฏใน DXF ครบทั้งชิ้นโค้งและแผ่นรับ

### Requirement 9: Spring-back, Calibration และ Toolpath Strategy (จาก kerf-bending-algorithms.md)

**User Story:** As a Factory Operator, I want ระบบชดเชย spring-back และรองรับค่า calibrate จริงของเครื่อง/วัสดุ, so that รัศมีหลังดัดคลาดไม่เกิน 5% ตาม KPI

#### Acceptance Criteria

1. THE Kerf_Pattern SHALL ชดเชย spring-back: `κ' = κ × (1 + γ)` โดย γ มาจากตารางวัสดุ (plywood 0.10–0.12, MDF 0.12–0.15) หรือค่าที่ calibrate จริง
2. THE MachineSpec SHALL เก็บ `k_eff` (kerf width วัดจริงจาก coupon test) แยกจาก Ø เครื่องมือ — การคำนวณใช้ k_eff เสมอ
3. THE spacing SHALL คิดตาม variable curvature `p(s) = clamp(θ_allow/κ(s), p_min, p_max)` โดย `θ_allow = C_mat × atan(k/t_web)` — S_CURVE จึงมีร่องถี่ตรงโค้งแคบและห่างตรงโค้งกว้างโดยอัตโนมัติ
4. THE toolpath SHALL เรียงลำดับ: เจาะรู → kerf slots → profile cut-out สุดท้าย (กันชิ้นงานขยับ), ใช้ serpentine (ลด air move) และ depth ramping ตาม stepdown ต่อวัสดุ
5. THE ปลายร่อง SHALL ทำโค้งรัศมี k/2 (ลด stress concentration)
6. THE ระบบ SHALL รองรับ calibration workflow: generate coupon test (k_eff) และ spring-back test (γ) ตาม §6.1–6.2 ของเอกสารหลัก

## Correctness Properties (PBT — fast-check)

1. **Determinism**: พารามิเตอร์โค้งเดิม → Kerf_Pattern + Packet hash เดิมเสมอ
2. **Exclusion invariant**: ∀ drill point: ไม่อยู่ใน Kerf_Zone + Kerf_Margin
3. **Radius monotonicity**: รัศมีลดลง → kerfCount ไม่ลดลง (ที่วัสดุ/มุมคงที่)
4. **Depth safety**: ∀ kerf: ความหนาคงเหลือ ≥ skin ขั้นต่ำ + 0.5mm
5. **Tangency**: S_CURVE สองโค้งต่อกันด้วยความชันเท่ากันที่จุดต่อเสมอ
6. **Round-trip**: profile serialize → parse → serialize เท่าเดิม
7. **Backward compat**: panel ไม่มี profile ≡ RECT ทุก pipeline (DrillMap/DXF/CutList เท่าเดิม byte-identical)
8. **Slot pairing**: ∀ mating joint: จำนวนซี่ฝั่งชิ้นโค้ง = จำนวนร่องฝั่งแผ่นรับ และตำแหน่ง world-space ตรงกัน ≤ 0.1mm (ค่าเดียวกับ MATING_TOLERANCE ของ G11)
9. **Tool invariance**: เปลี่ยน Kerf_Tool_Profile → kerfCount/ตำแหน่งเปลี่ยนได้ แต่ geometry โค้งปลายทาง (developed length, มุม) ต้องเท่าเดิม
