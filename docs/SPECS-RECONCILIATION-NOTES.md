# Notes: อ่าน specs/ ทั้งชุด เทียบ PRD (2026-07-05)

## [อ่านแล้ว-เต็ม] main/spec.md (702) — MONOLITH Designer Workspace v2.0, doc v1.1 (2026-01-11), status DRAFT
PRD ต้องเพิ่ม/แก้:
- Core Philosophy อย่างเป็นทางการ: **"Design is Free — Manufacturing is Deterministic"** (PRD ใช้ "โรงงานก่อน ความสวยทีหลัง" — ควรใส่ของจริงด้วย)
- ประเภทตู้: BASE, WALL, TALL, **DRAWER, CORNER** (PRD บอกแค่ 3!)
- ช่วงมิติ: W 200–1200 / H 300–2400 / D 300–1000 / toe-kick 0–150 (warn เกิน ไม่ block)
- โครงสร้าง: shelf 0–8 (warn >5), divider 0–3, back inset default 20mm
- ค่าคงที่: glue 0.1–0.2, premill 0.5–1.0/ด้าน, groove 8–10, back void 19–20, safety gap 1–2, shelf setback หน้า 20
- FR5.1 กำหนด **6 views** (Persp/Front/Left/Install/Factory/CNC) — โค้ดปัจจุบันมี 7 (เพิ่ม Top) = spec เก่ากว่าโค้ด (drift เชิง version ไม่ใช่ผิด)
- เครื่อง: Homag CENTATEQ, Biesse Rover A, KDT-1320
- **US9–US11 (v2.5)**: right-click compartment → add shelf/divider (+จำนวน 1–10, กระจายเท่ากัน, sub-compartment เลือกแยกได้), คลิก dimension label ใน viewport แก้ขนาด compartment (label น้ำเงิน=W/H, ส้ม=partial divider), Position Overrides ต่อ panel (front/back setback 0–100mm, gap height, reset to auto) — PRD ไม่มีเรื่อง compartment system เลย!
- FR7: Cost THB/m² + CO2 kg CO2/m² + area/edge length รวมและต่อแผ่น — PRD แทบไม่พูดถึง cost/CO2
- FR8: hardware safety ranking SAFE/WARN/UNSAFE + compatibility matrix
- FR6.3: canFreeze (no FAIL), canRelease (FROZEN+no FAIL), canExport (RELEASED only)
- Edge cases EC1–EC10 (มีค่า: negative cut size → FAIL + suggest, texture fail → fallback ไม่ block, storage full → export JSON prompt)
- Success metrics ทางการ (v2.0): ลดเวลาออกแบบ 50%, revision <5%, export success >95%, satisfaction >80%, cost accuracy ±10% — PRD §9 ควรอ้างเป็น "เป้าเดิมจาก spec v2.0" ประกอบ baseline-first
- Constraints: THB เท่านั้น, TIS standards, local-only (no cloud v2.0), WebGL 2.0, ≥1280×720, ≥10MB localStorage
- Out of scope v2.0: cloud sync, collab, cut optimization(!), multi-room, quotes, mobile, AR/VR — หมายเหตุ: FFDH nesting ถูก implement ภายหลัง = superseded บางข้อ

## [อ่านแล้ว-เต็ม] reference/formula-reference.md (428) — v1.1.0 (2026-01-12), "Single Source of Truth"
- **ชี้ขาดสูตร Cut Size: `cutSize = finishSize − (edge1+edge2)` — premill ไม่บวก!** (premill 0.5–1.0 เป็น machine op ระหว่างติด edge, เก็บเป็น reference เท่านั้น) → **ขัดกับ main/spec.md FR4.2 ที่เขียน `+ PreMill` (spec.md เก่ากว่า, formula-ref ชนะ)** → PRD ต้องระวังการเขียนสูตรนี้ + agent เคยรายงานผิด
- Drawer width ชี้ขาด: MOVENTO/TANDEM = LW−42 (runner 12.5×2 + clearance 8.5×2); Standard/Undermount = opening−26; LEGRABOX bottom = LW−35, back = LW−38, height codes N63/M84/K116/C167/F218, autoSelect ตาม frontHeight
- Kerf ชี้ขาด: thin kerf blade 3.0–3.5 (ดัดโค้ง), panel saw 3–4 (ตัดแผ่น), CNC router 6–10 (contour) → สอดคล้องมติ #1 ของ curved spec (SAW/ROUTER)
- Shelf setback ต่อประเภทตู้: standard 20–25/10, LED 20 rear, appliance 30/50–100, open shelf 0/10, glass door 5/10; S_front = hinge protrusion 20 + clearance 3–5
- Door: Full overlay 18 → W_open+36; Half 9; Inset −gap2 (tolerance ±0.5 critical) + ตาราง quick ref
- Hinge: Y top/bottom 80 (80–100), spacing 300–500, ตารางจำนวนบานพับตามสูง×น้ำหนัก (≤800→2..≤2400×≤16kg→6), boring X = T/2+12.5 (=21.5 @18mm)
- Minifix: **sleeveHeight = B−10** (B24→14, B34→24); joint count: ยาว ≤400 → 2 จุด, >400 → 3 จุด; dowel offset ±32
- Cost: สูตร + ราคาอ้างอิง (PB18 450, MDF18 550, Ply18 900 THB/m²; PVC0.5 8, PVC1.0 12, ABS2.0 25, Acrylic3 80 THB/m)
- Tolerance matrix: ตัด ±0.5, boring hinge/dowel/minifix ±0.2, edge ±0.3, inset gap ±0.5, overlay ±1.0, drawer ±0.5
- Naming conventions W_/H_/D_/T_/S_/X_/Y_ + _min/_max/_internal

## [อ่านแล้ว-เต็ม] reference/master-hardware-database.md (586) — v1.0.0 (2026-01-10), SSOT hardware; กติกา: ทุกเอกสาร import จากที่นี่ ห้ามซ้ำ
- Blum MOVENTO 40kg(760H)/60kg(766H) 270–600 + locking T51.7601; TANDEM full(560H)/partial(550H) 30kg + T51.1700; LEGRABOX 40kg(750.S)/70kg(753.S) + side codes N66.5/M90.5/K128.5/C177/F241 (backHeight 63/84/116/167/218, min-max frontHeight) + front fixing EXPANDO ZF7N70E2 (adj ±2 XYZ)
- Blum Clip Top: 110° FULL 71T3550 (overlay 18), HALF 71T3650 (9), INSET 71T3750 (−3), 155° 71T6550/6650 — boring 35Ø×11.5 screw spacing 45; mounting plates 0/3/6/9mm
- Häfele Minifix 15: CAM 262.26.034 **depth 12.7** ⚠️ **ขัดกับโค้ด/docs/SKILL.md ที่ใช้ 13.5mm (Häfele FF 3.10, commit ก.พ.26)** → DB นี้เก่ากว่าโค้ด = drift ต้อง reconcile
- S200 bolt B24 (262.27.670, sleeveH 14) / B34 (262.28.670, sleeveH 24); sleeve 10×14 / 10×24 (in 7Ø)
- Dowels Häfele 8×30/35/40 fluted + preglued + plastic; Metalla 510 (Häfele hinge เทียบ Blum ได้ boring เดียวกัน); equivalence table Blum↔Häfele (runner ไม่ interchangeable — Quadro คนละระบบ)
- DRILLING_SPECS: hinge cup 35×11.5 @21.5 tol0.5; minifix cam 15×12.7 tol0.2; bolt pilot 5×12 tol0.3; sleeve 10×14; dowel8 8×16 (ครึ่ง30+1) dowel10 10×21; **shelf pin 5×10, spacing 32, edgeMargin 37** (37 = ระยะแถวรูจากขอบหน้า/หลัง — โค้ด PRD ใช้ firstHole 50 = ตำแหน่งแรกตามแนวสูง คนละแกน ไม่ขัดแต่ควรระบุให้ชัด); runner mount 5×13
- แหล่ง: Blum Catalog 2025 + Häfele Selection 12–17

## [อ่านแล้ว-เต็ม] reference/cross-reference-index.md (277) — v1.0.0 แผนที่นำทาง + กติกาชี้ขาด
- **Conflict resolution protocol**: (1) formula-reference ก่อน (2) master-hardware-database สำหรับ hardware (3) reference/ folder ชนะเสมอ (4) รายงาน conflict เพื่ออัปเดต SSOT → PRD ควรบันทึก protocol นี้
- Workflow ทางการ: parametric-calc → hardware DB → door/drawer → cut-opt → drilling → dxf-export; **Curved flow ทางการ: parametric-calc (radius/arc) → kerf-bending → cut-opt (รวม kerf waste) → drilling (kerf cuts)** → curved spec ควร align
- ชี้เป้า collision-clearance-system.md: OBB SAT, spatial hash cell 500mm + padding 150, SpatialHashV3 (AABB cache), quaternion transform, **door swing envelope 110° 8 samples + drawer pull envelope 6 samples**, gate ERROR/WARNING policy — PRD ไม่มีเรื่อง swing/pull envelope เลย
- "Architecture v2.5–v14" ในเอกสาร = เวอร์ชันของ subsystem (v12 LEGRABOX Kinetics, v14 Blum Wooden Drawer, v11 MOVENTO, v2.5–3.5 Minifix) ไม่ใช่เวอร์ชันเอกสาร
- หมายเหตุ: index อ้าง specs/export/dxf-export-specs.md แต่ไฟล์จริงอยู่ specs/manufacturing/ (drift เล็ก)

## [อ่านแล้ว-เต็ม] reference/api-documentation.md (1188) — v1.0 (2026-01-10) API reference ยุค v2.0
- โครง API: components (Cabinet3D/MaterialSelector/DesignerIntentPanel/ViewportController/Panel3D props), store actions, engines (DimensionEngine/CostEngine/EnvironmentalEngine), export JSON/DXF, hooks, error classes, mock generators
- CostBreakdown เต็ม (materials/operations/hardware/labor/overhead, THB) + EnvironmentalImpact (co2 breakdown + **treesEquivalent**)
- CAMERA_PRESETS 7 ตัว (มี top!) — สอดคล้องโค้ดปัจจุบัน มากกว่า spec.md ที่บอก 6
- ⚠️ Drift ภายใน: `CabinetType = 'UPPER'|'BASE'|'TALL'|'WALL'|'CUSTOM'` (ไม่ตรง spec.md ที่ BASE/WALL/TALL/DRAWER/CORNER และไม่ตรงโค้ด); MANUFACTURING_CONSTRAINTS.MIN_WIDTH=300 ขัด spec.md FR1.2 (200); MAX_DEPTH=600 ขัด spec.md (1000) — เอกสารนี้ควรติดป้าย "historical, ตรวจกับโค้ดก่อนใช้"
- undo/redo API ระบุไว้ (Ctrl+Z/Shift+Z) — PRD ระบุ undo/redo "implied" → ตรวจโค้ดจริงว่า implement หรือยังก่อน claim

## [อ่านแล้ว-เต็ม] manufacturing/cut-optimization-algorithms.md (1329) — v1.0
- Constraints defaults: edgeMargin 10 (ช่วง 10–15), sawKerf 4 (saw 3–4, router 6–10), rotation [0,90] (default allowRotation=false!), guillotineOnly=true, maxCutDepth 3 ระดับ, groupBy material/thickness/edgeBanding
- โครงสร้าง: StockSheet (grainDirection length/width/none), CutPart (grainRequired + priority + edgeBanding ต่อด้าน), GuillotineTree (binary, kerf-aware), GuillotinePacker (Decreasing Area First Fit + Best Fit leaf + เลือก split ทิศ waste น้อยสุด + grain check ตอนหมุน)
- FFDBinPacker: จัดกลุ่ม material|thickness → expand quantity → วนทีละแผ่น
- **Advanced (ยังเป็น design, โค้ดจริงมีแค่ FFDH ใน src/nesting!): Simulated Annealing (T1000, cool .995) + Genetic (pop50, gen100, OX crossover, tournament 5) + auto-select: <20 ชิ้น FFD, <100 SA, ≥100 GA**
- Cut sequence: rip/crosscut + optimize order; G-code router config (rapid 10000, cut 4000, plunge 1000, safeZ 10, depth/pass 8, Ø6, 18000RPM, multi-pass)
- SVG layout export + CutListReport (summary/sheets/parts + edge banding T+B+L+R format)
- Production targets: efficiency ≥80%, waste ≤20%, ≤50 แผ่น/batch, optimize ≤10s; benchmark FFD 75-80% → GA 88-92%
- PRD note: §6.2.5 ของ PRD ตรง (FFDH) แต่ควรระบุว่า SA/GA เป็น design roadmap ยังไม่ implement

## [อ่านแล้ว-เต็ม] manufacturing/door-drawer-complete-guide.md (1987) — v1.0; Architecture v12 (LEGRABOX), v14 (Wood Drawer)
- Door: Full overlay (18, reveal 3, รองรับหลายบาน: W=(open+2×ov−reveal×(n−1))/n), Half (9, crank 9), Inset (gap 2, crank −4, tol ±0.5); เปรียบเทียบ tol ±1.5/±1.0/±0.5
- Hinge positions: top/bottom offset 80 (80–100), spacing 300–500, เพิ่มกลางเมื่อ available > 500 (สูตร ceil); hinge count จาก "น้ำหนักจริง" (density mdf750/pb650/ply600/solid700/mel680 → kg) + height matrix
- ⚠️ Clip Top pattern ที่นี่: cup 35×**13** + mounting Ø8×11.5 @45.5 + edge 3–5mm — ขัด master-db (35×11.5 + screwSpacing 45) → conflict ภายใน specs ต้องชี้ขาด (formula-ref ไม่ครอบ)
- Drawer: 5 types (standard/inner/file/pot/internal 13mm), SLIDE_SPECS (side 12.5+0.5, under clearance13, heavy 13+1, lengths), box calc: bottom ลงร่อง +10mm/ข้าง, depth=slide len (เลือกยาวสุด ≤ depth−20), front calc (bank แบ่งเท่า/กำหนดเอง, topGap2 bottomGap2 reveal3)
- Front fixing Blum: box side Ø8×11.5 @35 from bottom/37 from front; front Ø6 pilot @37/35; adjuster ±2mm
- Slide load guide (side 25–35 → full-ext heavy 60–80kg); slide length = depth−50 (30หลัง+20หน้า)
- Soft close: Blumotion integrated/add-on/Tip-On; **Servo-Drive ไฟฟ้า 24V touch, เปิด 10mm @300mm/s** (PRD ไม่มีเลย)
- DXF layers เฉพาะ door/drawer: DRILL_Z_35_13, DRILL_Z_8_11.5, DRILL_X_5_13 (Sys32), DRILL_Y_5_12, DRILL_Z_4_10, DRILL_Y_8_11.5, DRILL_X_6_15, MILL_DADO_6_10, EDGE_2MM/EDGE_0.4MM
- Validation: door W 200err/600warn, H 300err/2400err, ratio>5 warn บิด, weight>16kg warn; drawer: width ≤ open−25, slide ≤ depth−30, bottom ≥6mm
- **§9 Wood Drawer Architect Engine (v14)**: Internal-Width-First LW−42; SKW=internal+2×T (16/18/19); SKL=NL−10; MOVENTO 40/60 เลือกตาม load>40; min depth NL+3; drilling: cabinet Sys32 x=37/261/293 (Ø5×13), rear hook Ø6 @7,11, lock pilot Ø2.5 @10,10
- **§10 LEGRABOX Kinetics Engine (v12)**: autoSelectHeightCode(front) N<120/M<160/K<220/C<280/F; runner load>40→70kg, NL สูงสุด ≤ depth−3; bottom LW−35×NL−10, back LW−38×codeH; EXPANDO front fix x=15.5; cabinet drill x=37/261/389 @drawerY+37
- ⚠️ ต้อง verify: engines อ้าง path `src/services/engineering/woodDrawerEngine.ts`, `legraboxKineticsEngine.ts`, `src/services/cam/generators/*` — โครง src ปัจจุบันไม่มี services/ → เช็คว่า implement แล้วที่ไหน (อาจอยู่ repo เก่า) ก่อน claim ใน PRD

## [อ่านแล้ว-เต็ม] manufacturing/dxf-export-specs.md (1084) — v1.0
- ⚠️ **Target DXF = AC1032 (R2018, UTF-8 รองรับไทย) — โค้ดจริงใช้ R12 (AC1009) + server HOMAG ใช้ DXF2000** → spec-code drift ใหญ่ ต้องตัดสิน (R12 = โค้ดปัจจุบัน, spec R2018 = เป้าที่เอกสารตั้ง)
- Target machines: SCM Accord (router), Homag BMG, Holzher/Altendorf (panel saw, OUTLINE only), Homag KAL/IMA (edge bander, EDGE layer), Gannomat/Morbidelli (drilling, Sys32)
- Layers มาตรฐาน: OUTLINE(7)/DRILL(1)/GROOVE(2)/EDGE_TOP..RIGHT(4)/TEXT(3)/DIMENSIONS(6) + custom HINGE_35MM, SHELF_PIN_5MM, CONFIRMAT_7MM, DOWEL_8MM, PANEL_{ID}
- กติกา entity: LWPOLYLINE ปิด + CW + ไม่ตัดตัวเอง (ตรง G10.2), origin BL มุมซ้ายล่าง พิกัดบวกทั้งหมด (ตรง G10.1), units mm
- Nesting: sheet 2440×1220, gap 10mm (kerf+margin), algorithms FIRST_FIT/BEST_FIT/GUILLOTINE; rotation 0/90
- Hinge pattern มาตรฐาน: 37mm จากขอบบน/ล่าง + Ø35 depth 12 (อีกค่า! 12 vs 13 vs 11.5 — สามเอกสารสามค่า)
- Shelf pin: grid 32, offset 37 จากขอบหน้า
- Groove op: back panel กว้าง 3–5 ลึก 10–12 offset 10; XDATA edge banding (1001 MONOLITH)
- Machine profiles JSON: SCM Accord 25FX (3200×1600, kerf 4.5, tol 0.1, edge 10, spacing 5), Homag BMG 512 (5200×1600, kerf 5.0, tol 0.15, edge 15, spacing 10, ไม่มี angled drilling)
- Validation checklist: panel size ERR, edge distance WARN ≥10, spacing WARN ≥5, through hole INFO, drill depth ≤ thickness ERR
- Future (phase 3): G-code direct, 3D DXF (Z-depth), toolpath optimize, GA nesting, MES integration, angled drilling, pocket milling

## [อ่านแล้ว-โครง+เจาะส่วนสำคัญ] manufacturing/hardware-drilling-specifications.md (12,400 บรรทัด!)
**= สารานุกรม hardware engineering 23 ตอน (Architecture v2.5–v14.0)** — ใหญ่เกินอ่านหมดในรอบเดียว อ่านโครงหัวข้อครบ + เจาะ §17.11, §23
- §1–7 พื้นฐาน: System 32 (grid/first hole/นับรู + TS impl), drilling types 5 ชนิด, hardware catalog (hinges/slides/lifts/shelf), compatibility matrix (ความหนา/door size/drawer width), DXF layer naming + สี, validation (edge distance/collision/compat), G-code cycles G81/G83 (peck)/G85 (boring), DB schema, Appendix quick ref
- §8 Blum complete v14: **AVENTOS HS/HL/HK top/HK-S lifts + MERIVOBOX/TANDEMBOX/METABOX box systems + MODUL hinge** + lift/box engines + cross stabilizer rod formula
- §9 v11: Hinge & HK-XS linked (overlay formula, HK-XS drilling formula, power factor, CLIP top selection matrix, mounting plate distances, pattern 45/9.5)
- §10 v10: AVENTOS lift intelligence (power factor calc, HKi milling spec, HF top)
- §11 v9: Häfele Metalla 510 + mounting plates (plate selection matrix, aluminium frame hinge overlay)
- §12 v8: Specialty hinges (drilling depth per type, screw patterns)
- §13 v7: Hinge kinematics + **thin door safety system**
- §14 v6: Dovetail linear engine | §15 v5.5: **Lamello P-System (T-slot milling + CNC tool req)** | §16 v5: Ixconnect & Tofix
- §17 v4.5: Master joinery — **§17.11 Distance A vs B: distA=กึ่งกลางความหนา (ใช้เลือกรุ่น CAM ไม่ใช่ตำแหน่งเจาะ!), distB=ระยะเจาะจากขอบ (ตำแหน่ง Y จริง); common mistake: ใช้ distA เป็นตำแหน่ง**; validation: bolt distB ≥20, spacing ≥100, margin ≥20
- §18 v4: Wood dowels (dynamic drill depth ตามความยาวเดือย) | §19–22: Minifix evolution v4.0→v2.5 (universal system, layout engine, joint system, smart panel pattern calc + operation manual)
- **§23 Minifix 3D Errata** (ตรงกับงานโค้ดปัจจุบันมาก): ERR-001 dowel rotationX ต้อง 0 ไม่ใช่ 90 (HIGH), ERR-002 dowel offsetX ต้อง 32 ไม่ใช่ 0 กัน z-fighting (MED), ERR-003 origin ควรอยู่ขอบไม้ (DESIGN), ERR-004 cam rotation ล็อกตายตัว (LOW — สอดคล้องกับที่โค้ดปัจจุบันทำ V-Flip ได้แล้ว = แก้ไปแล้ว)
- **สถานะเทียบโค้ด: โค้ดปัจจุบัน implement เฉพาะสาย Minifix (drill map + G11); lifts/box/Lamello/dovetail/Ixconnect/hinge engines = documented-not-implemented (design library สำหรับฟีเจอร์อนาคต)** → PRD ควรมี inventory นี้เป็น P2 backlog

## [อ่านแล้ว-โครง+ส่วนสำคัญ] technical/parametric-cabinet-calculations.md (1,240)
- ไม่มี section งานโค้งแยก — มีแค่ cross-ref ไป kerf-bending (index กล่าวเกิน)
- โครง: material anatomy (core/surface/edge + premill ต่อชนิด), carcass algorithms (side/deck dowel-vs-dado/back systems + ผลต่อความลึกภายใน), **Shelf Setback ⭐: D_shelf = (D_side − I_back − T_back) − S_front − S_rear** + ตาราง S_front (บานพับ 20–25, กระจก 15, เปิดโล่ง 10) / S_rear (ทั่วไป 10, LED 20, เครื่องใช้ไฟฟ้า 50–100, wardrobe 0) + เหตุผลวิศวกรรม (แผ่นหลังโก่ง/airflow/ฝุ่นในร่อง)
- **ภาคผนวก A ค่าคงที่**: BUMPER_GAP 1.5, SHELF_GAP 1.0, FRONT_SETBACK 20, REAR_SETBACK 10, BACK_INSET 20, DOOR_GAP_SIDE 2.0, DOOR_GAP_VERTICAL 2.0, DRAWER_GAP 3.0, RUNNER_CLEARANCE 12.7
- Troubleshooting guide 3 อาการ + cost calc + edge banding 3D visualization + z-fighting prevention notes

## [อ่านแล้ว] technical/trust-chain-export-pipeline.md (431) — v1.0 (2025-01-14)
- ExportRecord/ArtifactRef/BundleProof; profiles DEFAULT/KDT(;, dxf/)/HOMAG(DXF2000)/BIESSE; determinism rules table (sort orders, no random/timestamps ใน content)
- **CutListRow SPEC-08 v8.2: cutW = FinishW − EdgeL − EdgeR + PremillL + PremillR (บวก premill ต่อด้าน!)** — ✅ ตรงกับโค้ดจริง (monolithExportContext.ts:67) → **ขัดกับ formula-reference §3 (บอกไม่บวก)** = นิยาม "Cut Size" สองความหมาย: UI-level (หลัง premill) vs saw-level (รวม premill) — docs ต้อง reconcile คำศัพท์
- DXF sheet layers: SHEET/TEXT/PARTS/LABELS (AC1009 R12); preflight canReExport = gateOk && !blocking && state≠RELEASED; TrustChainService API ครบ; file structure ตรง src ปัจจุบัน (implemented ✅)

## [อ่านแล้ว-ส่วนสำคัญ] technical/verifier-golden-strings.md (360)
- **สัญญา output verifier แบบ strict**: header `MONOLITH_VERIFY_V1` + KV lines (VERDICT/CODE/EXIT_CODE/TOOL/TOOL_VERSION + PACKET_SHA256/MANIFEST_HASH/MERKLE_ROOT ฯลฯ) + **`SUMMARY_TH=` ข้อความไทยสำหรับ operator** + `---LOG---` marker; CODE stable ตลอดกาล (OK, W_AUDIT_UNKNOWN/PENDING exit 80, ...)

## [อ่านแล้ว-summary] technical/gap-analysis-overlay-inset-connector.md (300)
- Priority gaps 10 ข้อ: HIGH = load-based connector selection / tightening angle guidance / arrow orientation check; MED = material holding strength (MDF vs ply), shear/pull-out validation, BOM gen; LOW = Maxifix, aluminum rail, assembly instruction gen, inset offset config
- แผน 4 phase: (1) installation metadata ใน DrillMapPoint (2) structural validation (3) auto-select Minifix 12/15 ตาม thickness+load (4) BOM + assembly PDF → **นี่คือ backlog ต่อยอด G11/drill map ที่ PRD ควรอ้าง**

## [อ่านแล้ว-โครง] ที่เหลือ
- collision-clearance-system.md (820): spatial hash 500mm + padding 150, OBB SAT, door swing envelope 110°/8 samples + drawer pull 6 samples, gate ERROR/WARNING, deterministic replay, V3 optimizations (AABB cache/reverse index/quaternion), **telemetry & auto-tuning + apply-from-report runtime tuning**
- r3f-architecture.md (752): component patterns, perf, memory management, pitfalls — dev reference
- parametric-configurator-architecture.md (534): งานวิจัย Parametric vs Static GLTF (variant explosion, distortion), instancing/draw calls, triplanar, bevels — ADR-level rationale
- cabinet-3d-optimization-guide.md (497): asset pipeline (Draco, ETC1S/UASTC basis), VRAM, lighting strategy, delivery checklist
- webgpu-roadmap.md (532): migration strategy + fallback + success metrics (อนาคต)
- web-first-r3f-strategy.md (318): เหตุผลธุรกิจ web-first (CAC −80-90%, conversion +94% Shopify), R3F vs game engines vs no-code
- test-specifications.md (920): strategy + CI workflow + unit/integration/component/e2e/3D/perf/a11y + fixtures — เป้า coverage ตรงกับ spec.md NFR4.2
- templates/operational-intelligence-*: **design system สำหรับ dashboard/report ภายใน** (component library + template.html + css)
- main/plan.md (908): architecture/stack/data model/engines/gate design ยุค v2.0
- **main/tasks.md: 25/36 done (T001-T023 ยกเว้น T004), ค้าง T004 + T024–T035 (Phase 7–10: docs, v2.1 prep, config, advanced)** — ตัวเลขนี้คือสถานะของ "Designer Workspace v2.0 spec" ไม่ใช่ทั้ง repo

## รายการ Drift ทั้งหมดที่พบ (สำหรับ PRD §11)
1. formula-reference §3 (ไม่บวก premill) vs SPEC-08 v8.2 + โค้ด export (บวก premill ต่อด้าน) — นิยาม "cut size" คนละความหมาย
2. dxf-export-specs เป้า AC1032/R2018 vs โค้ด R12 (+HOMAG DXF2000)
3. Hinge cup depth: master-db 11.5 / dxf-export 12 / door-drawer 13 — สามค่า
4. Minifix CAM depth: master-db 12.7 vs โค้ด 13.5 (Häfele FF 3.10)
5. spec.md 6 views vs โค้ด/api-doc 7 (มี Top)
6. api-documentation: CabinetType UPPER/CUSTOM + MIN_WIDTH 300/MAX_DEPTH 600 ขัด spec.md (200/1000)
7. spec.md FR4.2 (+PreMill รวม) vs formula-ref (ไม่บวก) — spec.md เก่ากว่า
8. cross-ref index อ้าง specs/export/ ที่ไม่มีจริง (อยู่ manufacturing/)
9. door-drawer §9/§10 engines อ้าง src/services/* — ไม่มีในโค้ดปัจจุบัน (documented-not-implemented)
10. **[ตัดสินแล้ว S16, 10 ก.ค. 2026] Minifix bolt bore — Häfele มีสองระบบจริง**: sleeve system รู Ø10×17.5 (master-db SLEEVE_10X14 outer Ø10 + boltBoreDepth 17.5 มีเทสต์) vs S200 direct thread รู Ø7.5×B; manufacturing/hardware-drilling บอก Ø8 THRU (B34 legacy อีก variant) — **มติ: โรงงาน DAPH ใช้ sleeve → ความจริงเดียว = Ø10×17.5** (generator เจาะแบบนี้ทุกตู้ที่ส่งมอบ); Connector OS catalog เดิมยึด 7.5/24 ฝ่ายเดียวด้วยทฤษฎี "Two Domains" ซึ่งขัดกายภาพ (รูเดียวเจาะสองขนาดไม่ได้) → แก้ default = Ø10×17.5, เก็บ variant เจาะตรงไว้ที่ `HAFELE_MINIFIX_15_B24_DIRECT` (Ø7.5×24); หมายเหตุ: 24 = Distance B (ระยะขอบ→ศูนย์ cam) เคยถูกสับสนเป็นความลึกรูใน UI/เทสต์ — แก้แล้ว (MinifixConfigPanel CNC_BOLT_BORE_DEPTH, HardwareLibrary label)
11. Minifix CAM depth สามค่า (ต่อยอดข้อ 4): manufacturing 12.5 / master-db DRILLING_SPECS 12.7 / โค้ด+drill map จริง 13.5 (Häfele FF 3.10 สำหรับไม้ 18mm) — โค้ดมีเทสต์+ผลิตจริง = ความจริงล่าสุด; docs สองไฟล์ยังไม่อัปเดต (ค้างฝั่งเอกสาร ไม่กระทบการผลิต)
- [ ] reference: formula-reference, master-hardware-database, cross-reference-index, api-documentation
- [ ] manufacturing: hardware-drilling (10.7k!), door-drawer, cut-optimization, dxf-export-specs
- [ ] technical: 10 ไฟล์
- [ ] main/plan.md, main/tasks.md
- [ ] strategy, testing, templates
