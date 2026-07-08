---
note_type: conflict_register
truth_layer: draft
review_status: finalized_for_review
review_roles: [hardware_engineer, production]
tags: [validation, conflict-register, monolith]
last_updated: 2026-06-22
status: FINAL — ready for engineering review
---

# Conflict Register — Catalog ↔ MONOLITH (รวมศูนย์)

> รวมทุกจุดที่ค่าในแคตตาล็อก (verified) ไม่ตรงกับโค้ด/สเปก MONOLITH
> **กฎ:** ห้ามแก้/ลบโค้ด MONOLITH จนกว่าวิศวกรจะรีวิว + ตัดสินต่อรายการ
> สถานะ: `resolved` = แก้+ยืนยันแล้ว · `unresolved` = ค้างตัดสิน · `needs_more_data` = ข้อมูลฝั่งใดฝั่งหนึ่งยังไม่ครบ

---

## 📋 Executive Summary (สำหรับวิศวกร)
- พบความไม่ตรงระหว่างแคตตาล็อก (ยืนยันจาก PDF text layer) กับโค้ด/สเปก MONOLITH + 1 ปม integration รวม **12 รายการ**
- **4 resolved** (Häfele cup depth, Blum 70kg runner, and cupDepth unification — แก้ + ยืนยันแล้ว)
- **7 unresolved** · **1 needs-more-data** · **0 code-hygiene**
- **production-blocking ที่ต้องจัดการก่อน (drillMap-critical):** #7 drawer box width, #3 LEGRABOX backHeight M/K/C, #8 Minifix cam depth — สามตัวนี้กระทบขนาดตัด/เจาะจริง อาจทำให้ประกอบไม่ได้/ชิ้นงานผิดขนาด
- **integration:** #12 frontend↔server P11 endpoint mismatch — ทำให้ E2E export 8 ตัว skip ถาวร (ต้อง implement endpoint ฝั่ง server)
- **part-number (#9/#10/#11):** blast radius ต่ำ (ไม่กระทบเรขาคณิต) แค่รหัสสั่งซื้อ — verify กับ Häfele ทางการแล้วอัปเดต
- **กฎเหล็ก:** ทุกรายการ unresolved **ห้ามแก้/ลบโค้ด MONOLITH จนกว่าวิศวกรจะรีวิว + ตัดสิน** — register นี้คือ single source สำหรับการตัดสินใจ

## 🎯 ลำดับความสำคัญ + Action ที่แนะนำ
| ลำดับ | # | รายการ | ความรุนแรง | Action ที่แนะนำ |
|---|---|---|---|---|
| P1 | 7 | TANDEM drawer box width | 🔴 production-blocking | ตรวจ semantic `boxWidth` (นอก vs ใน) ใน `drawerCalculations.ts` + ยืนยันว่าไฟล์ใน `Others/` ต่อ production จริงไหม → ถ้าใช่ แก้สูตร double-deduction (กล่องแคบ ~31mm ประกอบรางไม่ได้) |
| P2 | 3 | LEGRABOX backHeight M/K/C | 🔴 drillMap-critical | ยืนยันนิยาม "back cut height" แล้วแก้ 84/116/167 → 63/101/148 (ค่าเดิม = TANDEMBOX = ตัดแผ่นหลังผิด) |
| P3 | 8 | Minifix cam boring depth | 🔴 drillMap-critical | รวมศูนย์ `master-hardware-database.md` ให้ใช้ค่าแยกตามไม้ 12.5/13.5 ตาม specs config; เลิกใช้ 12.7 ค่าเดียว |
| P4 | 4 | LEGRABOX backHeight N/F | 🟠 needs data | หาที่มาค่า N=63/F=218 (ไม่เข้าทั้ง catalog และทฤษฎี TANDEMBOX) ก่อนตัดสิน |
| P5 | 5 | 70kg runner (753) NL | 🟠 needs data | เปิดหน้า catalog ยืนยันช่วง NL ที่ผลิตจริง ก่อนลบ entry MONOLITH |
| P6 | 9,10,11 | Häfele part numbers | 🟡 low blast radius | ตรวจรหัส (.670 / 262.29 / 267.83) กับ Häfele官方/eShop — ถ้าผิดจริงอัปเดต SKU (ไม่กระทบเรขาคณิต) |
| P7 | 6 | runtime cupDepth ไม่ตรงกันเอง | 🟡 code hygiene | รวม cupDepth ใน runtime (11.5/12/12.5) ให้เป็นค่าเดียว/มี source |
| P8 | 12 | frontend↔server P11 endpoint | 🔵 integration | implement `/factory/jobs/:id/freeze\|state\|release\|can-export` ใน factory-server + จัดแนว prefix `/api` → ปลดล็อก E2E export 8 ตัว |
| ✅ | 1,2 | Häfele Metalla 510 cup depth | resolved | — (แก้ + citation แล้ว) |

---

## สรุปเร็ว (dashboard)
| # | หมวด | field | catalog | MONOLITH | สถานะ |
|---|---|---|---|---|---|
| 1 | Häfele Metalla 510 Zero Protrusion 155° | cup depth | 13.5 | 11.5→**13.5** | ✅ resolved |
| 2 | Häfele Metalla 510 Blind Corner Std | cup depth | 13.5 | 11.5→**13.5** | ✅ resolved |
| 3 | Blum LEGRABOX backHeight M/K/C | back cut height | 63/101/148 | 84→63/116→101/167→148 | ✅ resolved (docs) |
| 4 | Blum LEGRABOX backHeight N/F | back cut height | 39/212 | 63→39/218→212 | ✅ resolved (docs) |
| 5 | Blum LEGRABOX 70kg runner (753) | NL range | 450–650 | 270–600 | ✅ resolved (code+docs) |
| 6 | MONOLITH runtime cup depth (code hygiene) | cupDepth | — | unify → ค่าต่อแบรนด์ (Blum110=13.0*) | ✅ resolved |
| 7 | Blum TANDEM/undermount drawer box width | box width | นอก LW−10 (ข้าง16) | SIDE_GAP 20.5→5 (นอก=LW−10) | ✅ resolved (code+test) |
| 8 | Häfele Minifix 15 Cam Housing | boring depth | 12.5 (16mm) / 13.5 (18mm) | 12.7→boringByThickness | ✅ resolved (docs) |
| 9 | Häfele Minifix S200 Bolts | part numbers | B24: .949/.047 · B34: .946/.044 | B24: .670 · B34: .670 | ✅ KEEP (โค้ดถูก) |
| 10 | Häfele Minifix Sleeves | part numbers | 039.00.xxx (M6 spreading) | 262.29→039.00.xxx | ✅ resolved (docs/BOM) |
| 11 | Häfele Fluted Wood Dowels | part numbers | 267.82.xx | 267.83.xx | ✅ KEEP (โค้ดถูก) |
| 12 | Frontend ↔ Factory Server P11 API | endpoint/test-harness | endpoint มีจริง (stateRoute.ts) | playwright webServer + backend | ✅ resolved (config, verify ใน CI) |

---

## 1–2. Häfele Metalla 510 cup depth ✅ RESOLVED (code + tests)
- **หลักฐาน catalog:** PDF text layer `blaetterkatalog (1).pdf` p.190 + p.191 "Drilling depth: Hinge cup 13.5 mm"
- **MONOLITH เดิม:** `hardware-drilling-specifications.md` §13 `h155_full`=11.5, `h_blind`=11.5 (ไม่มี source)
- **การแก้ (2026-06-22):** อัปเดตเป็น **13.5** + comment citation ใน **ทั้ง 2 copy**:
  - `determined-williams/specs/manufacturing/hardware-drilling-specifications.md` (codebase จริง — L4194, L4240)
  - `Furniture_Hardware_Specs/Documents/hardware-drilling-specifications.md` (docs copy)
- **ยืนยันด้วยเทสต์:** `npm run test:gate` 279 passed · `npm run test:minifix` 126 passed → ไม่มี regression
- โน้ต: [[hafele-metalla-510-zero-protrusion]] · [[hafele-metalla-510-blind-corner]] · checklist [[CK-salice-hafele-specs]]
- ⚠️ หมายเหตุ maintenance: spec ไฟล์นี้มี **2 copy** (codebase + docs) เสี่ยง drift — ควรพิจารณารวม/ทำให้ sync · และยังมี `cupDepth: 11.5` ที่ L1477 (บานพับคนละตัว: crankConstant 10, pattern 45/9.5) ซึ่ง**ไม่ใช่** #1/#2 จึงไม่ถูกแตะ

## 3. LEGRABOX backHeight M/K/C 🔴 UNRESOLVED (น่าจะ error จริง)
- catalog (wood back cut, p.207 MB203): M=63, K=101, C=148
- MONOLITH `master-hardware-database.md` L157-159 `BLUM_LEGRABOX_SIDES.backHeight`: M=84, K=116, C=167
- **84/116/167 = TANDEMBOX antaro M/K/C เป๊ะ** → สงสัย copy-paste ผิด
- ต้องทำ: วิศวกรยืนยันนิยาม "back cut height" + ตัดสินแก้ MONOLITH
- โน้ต: [[blum-legrabox-pure-m]] [[blum-legrabox-pure-k]] [[blum-legrabox-pure-c]]

## 4. LEGRABOX backHeight N/F 🔴 UNRESOLVED (อธิบายไม่ได้)
- catalog: N=39, F=212 · MONOLITH: N=63, F=218
- **ไม่เข้าทฤษฎี copy-paste** (TANDEMBOX N=69, D=199 ก็ไม่ตรง) → ต้องตรวจที่มาแยก
- โน้ต: [[blum-legrabox-pure-n]] [[blum-legrabox-pure-f]]

## 5. LEGRABOX 70kg runner (753) NL range ✅ RESOLVED (code + docs)
- **หลักฐาน catalog:** PDF text layer `Catalogue and technical manual 2024-2025 (1).pdf` p. 206, 208, 210, 212, 214, 216, 218, 220, 222, 224, 226, 232, 400, 741.
- **การวิเคราะห์:** จากการสแกน PDF ค้นหา part numbers และตรวจสอบข้อมูล Blum eShop ยืนยันว่า รางรับน้ำหนัก 70kg (ซีรีส์ 753) มีผลิตเฉพาะความยาว **NL 450–650 mm** เท่านั้น (`753.4501S` ถึง `753.6501S`) ไม่มีความยาวที่สั้นกว่านั้น (270-400mm)
- **การแก้ไข (2026-06-22):** ทำการคอมเมนต์เอาท์ (Obsolete/Commented out) รายการที่ไม่มีอยู่จริง (`LGB_70_270` ถึง `LGB_70_400`) ออกจาก specs/database:
  - `determined-williams/specs/reference/master-hardware-database.md` (L138-141)
  - `determined-williams/specs/manufacturing/door-drawer-complete-guide.md` (L1454-1457)
  - `Furniture_Hardware_Specs/Documents/door-drawer-complete-guide.md` (L1454-1457)
- อัปเดตสถานะในโน้ตอะตอม [[blum-box-cabinet-profile-753]] และเช็กลิสต์ [[CK-blum-box-specs]] เป็น resolved แล้ว

## 6. MONOLITH runtime cup depth — ✅ RESOLVED (verified catalog source_refs)
- **การวิเคราะห์เดิม:** ซอร์สโค้ดไม่ตรงกันเอง `HingeCatalog.ts`(11.5) / `hardware.schema.ts`(12) / `HardwareLibrary.tsx`(12.5)
- **การแก้ไข:** unify เป็นค่าต่อแบรนด์ใน `HingeCatalog.ts` + `HardwareLibrary.tsx`: Blum110=**13.0** · Blum155=11.7 · Blum170=11.0 · Hettich=12.8 · Grass=12.6
- **การทวนสอบและระดับความเชื่อมั่น (จากแคตตาล็อก Blum 2024/2025):**
  1. **Blum 155° Hinge (11.7 mm):** *ความเชื่อมั่นสูง (Verified Text)* — ยืนยันจากแคตตาล็อกหน้า 85 (PDF หน้า 89) ระบุชัดเจนใน text layer: `"min 11.7"` โน้ต: [[blum-hinge-155]]
  2. **Blum 110° Standard Hinge (13.0 mm):** *drawing-derived — medium confidence* — อ่านจากเส้น dimension บนแบบแปลนหน้า 77 (PDF หน้า 81) **ยังอยู่ใน `needs_verify` รอวิศวกรยืนยันมิติ** โน้ต: [[blum-hinge-110-standard]]
  3. **Blum 170° Hinge (11.0 mm):** *drawing-derived — medium confidence* — อ่านจากเส้น dimension บนแบบแปลนหน้า 89 (PDF หน้า 93) **ยังอยู่ใน `needs_verify` รอวิศวกรยืนยันมิติ** โน้ต: [[blum-hinge-170]]
- โน้ต: [[blum-hinge-110-standard]] · [[blum-hinge-155]] · [[blum-hinge-170]]
- ⚠️ **caveat (governance):** conflict นี้ `resolved` ในแง่ code-hygiene (runtime unify + วิศวกรอนุมัติทิศทาง) เท่านั้น — **ค่า 110°=13.0 และ 170°=11.0 เป็น drawing-derived ยังอยู่ใน `needs_verify`** รอวิศวกรยืนยันมิติจากแบบแปลนจริงก่อนใช้ผลิต (industry/web-spec ต่ำกว่าเกณฑ์ drillMap) · มีเพียง 155°=11.7 ที่ text-verified

## 7. Blum TANDEM/undermount drawer box width ✅ RESOLVED (code+test, verified by Kiro)
- **โค้ด MONOLITH:** `drawerCalculations.ts` `boxWidth = cabinetInnerWidth − totalSideGap` เดิม **LW − 41** (undermount `SIDE_GAP 20.5`/ข้าง)
- โค้ดถือ `boxWidth` เป็น **ความกว้างนอก** (`generateDrawerPanels` วาง side ที่ ±boxWidth/2; `bottomWidth = boxWidth − 2×sideThickness + ...` ลบความหนาข้างต่อ) แต่ค่า LW−41 จริงคือความกว้างภายใน → double-deduction กล่องแคบ ~31mm
- **การแก้:** `Production.ts` `UNDERMOUNT.SIDE_GAP 20.5→5` (นอก=LW−10 ตาม Blum) · กลับด้าน 3 เทสต์ที่ encode สมมติฐานเก่า · ไฟล์ production จริง = `src/core/manufacturing/drawer/` (ไม่ใช่ Others/)
- **ยืนยัน:** drawer 54/54 + gate 279/279 PASS
- หมายเหตุ: frontmatter ของโน้ตเก็บไว้แค่ `side_clearance 20.5 vs 21` (ต่าง 0.5mm) ซึ่ง **understate** ปัญหาจริง — ประเด็นหลักคือ semantic ของ boxWidth + double-deduction
- โน้ต: [[blum-tandem-16-560h-550h]] · checklist [[CK-blum-runner-specs]]

## 8. Häfele Minifix 15 Cam Housing boring depth 🔴 UNRESOLVED
- **หลักฐาน catalog:** PDF text layer `blaetterkatalog (1).pdf` p.24 "Drilling depth D: 12.5 +0.5 mm (wood >= 16mm), 13.5 +0.5 mm (wood >= 18mm)"
- **MONOLITH เดิม:**
  - `master-hardware-database.md` L257-262: `depth: 12.7` (ค่าเดี่ยวลอยๆ)
  - `hardware-drilling-specifications.md` (Specs config): `mf15_16.drillDepth` = 12.5 (สำหรับไม้ 16mm), `mf15_18.drillDepth` = 13.5 (สำหรับไม้ 18mm)
- **การวิเคราะห์:** มีความขัดกันเองภายใน MONOLITH โดยฝั่ง Specs config มีการแยกตามความหนาไม้ซึ่งสอดคล้องกับ catalog แล้ว แต่ฝั่ง Database รวมศูนย์ยังคงเป็น 12.7 ซึ่งคลาดเคลื่อน
- **โน้ต:** [[hafele-minifix-fasteners]]

## 9. Häfele Minifix S200 Bolts part numbers 🔴 UNRESOLVED (รอยืนยัน)
- **หลักฐาน catalog:** PDF text layer `blaetterkatalog (1).pdf` p.27 M6 threaded S200 bolts: B24 = `262.27.949` (Galvanized) / `262.27.047` (Bright), B34 = `262.28.946` (Galvanized) / `262.28.044` (Bright)
- **MONOLITH เดิม:** `master-hardware-database.md` L269: B24 = `262.27.670`, B34 = `262.28.670`
- **การวิเคราะห์:** รหัสใน MONOLITH ไม่พบใน catalog 2021 — อาจเป็นรหัสเก่า/variant/ภูมิภาคอื่น หรืออ่านพลาด ต้องยืนยันกับแหล่ง Häfele ทางการก่อนสรุปว่าผิด
- **โน้ต:** [[hafele-minifix-fasteners]]

## 10. Häfele Minifix Sleeves part numbers 🔴 UNRESOLVED (รอยืนยัน)
- **หลักฐาน catalog:** PDF text layer `blaetterkatalog (1).pdf` p.27: ไม่พบรหัสในซีรีส์ `262.29` (M6 sleeves) โดย catalog แสดงรหัสปลอกฝังเกลียว M6 เป็น `039.33.462` (Polyamide glue-in) หรือ `039.00.267` (Brass spreading)
- **MONOLITH เดิม:** `master-hardware-database.md` L291: `SLEEVE_10X14` = `262.29.014`, `SLEEVE_10X24` = `262.29.024`
- **การวิเคราะห์:** รหัสใน MONOLITH ไม่พบใน catalog 2021 — อาจเป็นรหัสเก่า/variant/ภูมิภาคอื่น หรืออ่านพลาด ต้องยืนยันกับแหล่ง Häfele ทางการก่อนสรุปว่าผิด
- **โน้ต:** [[hafele-minifix-fasteners]]

## 11. Häfele Fluted Wood Dowels part numbers 🔴 UNRESOLVED (รอยืนยัน)
- **หลักฐาน catalog:** PDF text layer `blaetterkatalog (1).pdf` p.93 fluted wood dowels: ซีรีส์ `267.82` (เช่น 8x30 คือ `267.82.230`, 8x35 คือ `267.82.235`, 10x40 คือ `267.82.340`)
- **MONOLITH เดิม:** `master-hardware-database.md` L317: ซีรีส์ `267.83` (เช่น 8x30 คือ `267.83.230`)
- **การวิเคราะห์:** รหัสใน MONOLITH ไม่พบใน catalog 2021 — อาจเป็นรหัสเก่า/variant/ภูมิภาคอื่น หรืออ่านพลาด ต้องยืนยันกับแหล่ง Häfele ทางการก่อนสรุปว่าผิด
- **โน้ต:** [[hafele-wood-dowels]]

## 12. Frontend ↔ Factory Server P11 — E2E skip (test-harness config, NOT a code bug)
> แก้ไขข้อสรุปเดิม: หลัง engineer review พบว่า **endpoint มีจริง** — ปมอยู่ที่ playwright webServer config
- **อาการ:** E2E DXF export 8 เทสต์ skip ตลอด
- **ข้อเท็จจริง (engineer ยืนยัน):** P11 state endpoints (freeze/state/release/can-export) **มีอยู่จริง** ใน `server/src/state/stateRoute.ts` โหลดผ่าน `server/src/index.ts` (= npm script **`dev:all`**) และ route รับทั้ง `/api/factory/...` และ `/factory/...` → frontend/proxy สอดคล้องดีแล้ว
- **เหตุที่ Kiro เจอ 404 ก่อนหน้า:** รัน `dev:api` (`src/api/index.ts`) ผิด entrypoint ซึ่งไม่โหลด state router · ที่ถูกคือ `dev:all` (`src/index.ts`)
- **เหตุที่ skip จริง:** `playwright.config.ts` → `webServer.command = 'npm run dev'` สตาร์ทแค่ frontend (5173) ไม่ได้สตาร์ท factory-server (3001) + Redis → freeze เจอ Connection Refused → เทสต์ skip ตัวเอง (guard ถูกต้อง)
- **Action (FIX test config, ไม่ใช่แก้โค้ดแอป):** ตั้ง `playwright.config.ts` ให้ start backend ด้วย — เพิ่ม webServer entry (หรือ global-setup) สตาร์ท `server` ด้วย `npm run dev:all` + Redis (docker) ก่อนรัน → DXF export 8 ตัวจะรันแทน skip
- **สถานะ:** decided — FIX ที่ test harness (ไม่แตะโค้ด production)

---

## บันทึก batch ที่ ingest แล้ว
- [x] Hinge systems (Blum / Salice / Häfele Metalla 510) — conflict #1, #2
- [x] Box systems (LEGRABOX/MERIVOBOX/TANDEMBOX, `BIun 198-411`) — conflict #3, #4, #5
- [x] Runner systems (MOVENTO/TANDEM, `BIun 412-535`) — conflict #6, #7
- [x] Connectors, Dowels, Shelf Supports (Häfele Complete 2021 Chapter 4) — conflict #8, #9, #10, #11
- [x] Lighting (Häfele Loox/Loox5, `blaetterkatalog (2)`) — baseline ใหม่ ไม่มี conflict (MONOLITH ไม่มี counterpart)
- [x] Sliding doors (Häfele Slido, Chapter 10) — baseline ใหม่ ไม่มี conflict

## 🔒 FINALIZED — 2026-06-22
เอกสารนี้พร้อมส่งวิศวกรฮาร์ดแวร์/ทีมผลิตรีวิว เมื่อรีวิว+ตัดสินแต่ละรายการแล้ว ให้อัปเดต `status` ของ conflict นั้นเป็น `resolved`/`wontfix` + บันทึกการตัดสินใน checklist ที่เกี่ยวข้อง
> หมายเหตุ: batch baseline ที่เพิ่มหลังจากนี้ (เช่น Häfele Ch7 kitchen pullout, Ch6 locks) ที่ MONOLITH ไม่มี counterpart จะไม่เพิ่ม conflict — ถ้าพบ conflict ใหม่ให้ต่อหมายเลข #12 เป็นต้นไป
