---
note_type: review_worksheet
truth_layer: draft
review_status: awaiting_engineer
review_roles: [hardware_engineer, production]
tags: [validation, review, conflict-register, monolith]
linked_register: "[[CONFLICT-REGISTER]]"
created: 2026-06-22
---

# Engineer Review Worksheet — Conflict #3–#11

> ใช้คู่กับ [[CONFLICT-REGISTER]] · วิศวกรกรอกการตัดสินต่อรายการ แล้วอัปเดต `status` ใน register
> **กฎ:** ห้ามแก้/ลบโค้ด MONOLITH จนกว่าช่อง "การตัดสิน" จะถูกกรอก + เซ็นชื่อ

## วิธีใช้
1. อ่านรายการใน register ตามลำดับ P1→P7
2. กรอกตาราง "การตัดสิน" ด้านล่าง: เลือก decision + เหตุผล + ผู้ตัดสิน + วันที่
3. ถ้า decision = `FIX` → ระบุไฟล์/บรรทัด/ค่าใหม่ แล้วให้ทีม dev แก้ + รันเทสต์ (`npm run test:gate`)
4. อัปเดต `conflicts[].status` ในโน้ต atomic ที่เกี่ยวข้อง + แถวใน register เป็น `resolved`/`wontfix`
5. decision codes: **FIX** (แก้ MONOLITH) · **KEEP** (โค้ดถูก/catalog เก่า) · **NEED-DATA** (หาข้อมูลเพิ่ม) · **DEFER** (เลื่อน)

---

## ตารางการตัดสิน (กรอกโดยวิศวกร)

| # | รายการ | P | ค่าที่เสนอ (catalog) | decision (FIX/KEEP/NEED-DATA/DEFER) | เหตุผล | ผู้ตัดสิน | วันที่ |
|---|---|---|---|---|---|---|---|
| 7 | TANDEM drawer box width (semantic boxWidth) | P1 | กล่องนอก = LW−10 (ข้าง16) | **FIX** | boxWidth ตั้งใจเป็น "นอก" (generateDrawerPanels วางที่ ±boxWidth/2) แต่คำนวณเป็น "ใน" (LW−41) → double-deduction แคบ 31–32mm · ไฟล์ production จริง = `src/core/manufacturing/drawer/drawerCalculations.ts` + `src/core/designer/rules/drawerRules.ts` (Others/ เป็น draft) | Engineer | 2026-06-22 |
| 3 | LEGRABOX backHeight M/K/C | P2 | 63 / 101 / 148 | **FIX** | ค่าปัจจุบัน 84/116/167 = TANDEMBOX · ใช้คำนวณ cut-list จริง (`calculateLegraboxCutlist` / `HEIGHT_SPECS[].backHeight`) → แผ่นหลังสูงเกินประกอบไม่ได้ | Engineer | 2026-06-22 |
| 8 | Minifix cam boring depth | P3 | 12.5 (16mm) / 13.5 (18mm) | **FIX** | 12.7 ค่าเดียวอันตราย: ไม้ 12mm เจาะทะลุ · ไม้ 18mm เสื้อแคมโผล่ → ต้องแยกตามความหนาไม้ตาม specs config/hardwareCatalog | Engineer | 2026-06-22 |
| 4 | LEGRABOX backHeight N/F | P4 | 39 / 212 | **FIX** | รวมกับ #3 — ชุดเต็มที่ถูกคือ N39/M63/K101/C148/F212 | Engineer | 2026-06-22 |
| 5 | LEGRABOX 70kg runner (753) NL | P5 | NL 450–650 | NEED-DATA | ยังไม่ตัดสิน — รอยืนยันช่วง NL ที่ Blum ผลิตจริง | — | — |
| 9 | Minifix S200 bolt SKU | P6 | .949/.047 · .946/.044 | **KEEP** | `.670` มีจริงในแคตตาล็อก (S200 connecting bolt ขันลงชิปบอร์ดตรง) — โค้ดถูก | Engineer | 2026-06-22 |
| 10 | Minifix sleeve SKU | P6 | 039.00.xxx | **FIX** | `262.29.014/024` ผิด — เป็น Furniture Glides/Base Fitting (Ø24) ไม่ใช่ M6 spreading sleeve · ตัวจริง = ซีรีส์ `039.00.xxx` (เช่น 039.00.061) · low risk (BOM เท่านั้น) | Engineer | 2026-06-22 |
| 11 | Fluted dowel SKU | P6 | 267.82.xxx | **KEEP** | `267.83.230` มีจริง (Wood Dowel 8x30 Fluted) · 267.82 = สินค้าเดียวกันต่าง pack/region — โค้ดถูก | Engineer | 2026-06-22 |
| 6 | runtime cupDepth ไม่ตรงกัน | P7 | รวมเป็นค่าเดียว | DEFER | code hygiene — ยังไม่ตัดสินรอบนี้ | — | — |
| 12 | frontend↔server P11 endpoint | P8 | (ไม่ใช่บั๊ก) | **KEEP code / FIX test** | endpoint มีจริงใน `server/src/state/stateRoute.ts` (โหลดผ่าน `src/index.ts` = `dev:all`, รับทั้ง /api และ non-/api) · Kiro รัน `dev:api` ผิด entrypoint จึง 404 · skip จริงเพราะ `playwright.config.ts` webServer สตาร์ทแค่ frontend ไม่สตาร์ท factory-server | Engineer | 2026-06-22 |

---

## คำถามชี้ขาดต่อรายการ (ช่วยตัดสินเร็ว)

### #7 (P1) — drawer box width
- [ ] ไฟล์ `Furniture_Hardware_Specs/Others/drawerCalculations.ts` + `drawerRules.ts` **ถูก import เข้า production จริงไหม** หรือเป็น draft นอก `src/`?
- [ ] `boxWidth` ตั้งใจให้เป็น "ความกว้างนอก" หรือ "ความกว้างใน/แผ่นพื้น"? (ชื่อบอกว่านอก แต่ค่า LW−41 = ใน)
- [ ] ถ้าเป็นนอกจริง → ต้องเปลี่ยนสูตรให้คำนวณจาก `sideThickness` (เช่น นอก = LW − 2×side_clearance) ไม่ใช่ค่าคงที่ 41

### #3 (P2) — LEGRABOX backHeight
- [ ] `backHeight` ใน MONOLITH หมายถึง "ความสูงตัดแผ่นหลังไม้ชิปบอร์ด" ใช่ไหม?
- [ ] ถ้าใช่ → 84/116/167 ผิด (= ค่า TANDEMBOX) ควรเป็น 63/101/148 ตาม catalog LEGRABOX
- [ ] ตรวจว่าค่านี้ถูกใช้คำนวณ cut-list จริงหรือเป็น metadata เฉยๆ

### #8 (P3) — Minifix cam depth
- [ ] ควรให้ `master-hardware-database.md` ใช้ค่าแยกตามความหนาไม้ (12.5/13.5) เหมือน `hardware-drilling-specifications.md` แทน 12.7 ค่าเดียวไหม?

### #9/#10/#11 (P6) — part numbers
- [ ] ตรวจรหัส MONOLITH (.670 / 262.29 / 267.83) กับ Häfele官方 eShop/catalog ปีปัจจุบัน → มีจริงไหม / เป็นรุ่นอะไร
- [ ] ถ้าไม่มีจริง → อัปเดต SKU (low risk, ไม่กระทบเรขาคณิต/drillMap)

### #12 (P8) — frontend↔server P11 endpoint mismatch
- [ ] ยืนยันว่า factory-server build ปัจจุบันควรมี P11 state endpoints (freeze/state/release/can-export) ไหม หรือเป็น feature ที่ยังไม่ปล่อย
- [ ] ตัดสิน: implement endpoint ใน server ให้ตรง `stateApi.ts` หรือปรับ frontend ให้ตรง server (ทางใดทางหนึ่ง)
- [ ] จัดแนว prefix `/api` ระหว่าง client (`/api/factory/...`) ↔ server (`/factory/...`) ↔ proxy (dev vite + production reverse-proxy)
- [ ] หลังแก้ → E2E DXF export 8 ตัวจะรันแทน skip (ยืนยันด้วย `npm run e2e`)

---

## บันทึกหลังตัดสิน (Audit Log)
<!-- วันที่ · # · decision · ไฟล์ที่แก้ · ผลเทสต์ · ผู้ดำเนินการ -->
- 2026-06-22 · #1, #2 · FIX · hardware-drilling-specifications.md (×2 copy) 11.5→13.5 · test:gate 279 + test:minifix 126 PASS · (ดำเนินการแล้ว)
- 2026-06-22 · Engineer review #3–#12 เสร็จ:
  - **FIX (รอ dev):** #7 drawer boxWidth (นอก, แก้ใน `src/core/manufacturing/drawer/drawerCalculations.ts` + `src/core/designer/rules/drawerRules.ts`) · #3+#4 LEGRABOX backHeight → N39/M63/K101/C148/F212 · #8 Minifix cam depth แยกตามไม้ · #10 sleeve SKU 262.29→039.00.xxx
  - **KEEP (โค้ดถูก):** #9 (.670 bolts), #11 (267.83 dowels)
  - **DEFER:** #6 runtime cupDepth · **NEED-DATA:** #5 70kg NL
  - **#12 ไม่ใช่บั๊กโค้ด:** endpoint P11 มีจริงใน `server/src/state/stateRoute.ts` (โหลดผ่าน `src/index.ts`=`dev:all`) · E2E skip เพราะ `playwright.config.ts` webServer สตาร์ทแค่ frontend → FIX = เพิ่ม factory-server (dev:all) + Redis ใน webServer config

## บันทึกการแก้โค้ด (Implementation Log) — 2026-06-22
ไล่ตามลำดับ P พร้อม verify แต่ละตัว:
- **#7 (code+test):** `src/core/types/Production.ts` `UNDERMOUNT.SIDE_GAP 20.5→5` (นอก=LW−10) · กลับด้าน 3 เทสต์ที่ encode สมมติฐานเก่า (undermount กว้างกว่า side-mount) · **drawer 54/54 + gate 279/279 PASS**
- **#3+#4 (docs):** `master-hardware-database.md` + `door-drawer-complete-guide.md` backHeight LEGRABOX → N39/M63/K101/C148/F212 (แก้ ~7 จุดให้ตรงกันทั้งไฟล์) — reference docs ไม่ wired runtime
- **#8 (docs):** `master-hardware-database.md` MINIFIX_15_CAM `depth:12.7` → `boringByThickness {16:12.5,18:13.5,19:14.0}`
- **#10 (docs/BOM):** sleeve `262.29.014/024` → `039.00.267/039.00.061` (M6 spreading, Ø8) + needsVerify length variant
- **#12 (test config):** `playwright.config.ts` webServer เป็น array เพิ่ม backend `npm run dev:all` (cwd ./server, รอ :3001/health) — verify ใน clean CI (เครื่องนี้พอร์ต 3001/6379 ถูก stack อื่นยึด)
- **Verify เต็ม:** `test:run` → MONOLITH-proper **ไม่มี file-fail** (gate 279, drawer 54 เขียว) · 187 ไฟล์/101 เทสต์ที่ fail เป็นโปรเจกต์ฝัง `cp06-clean-cowork` (ต้องใช้ Supabase) ไม่เกี่ยวกับ MONOLITH — แยกเป็น tech-debt: vitest ควร exclude โฟลเดอร์ backup นี้

---

## 🔍 รายการค่า Drawing-derived ที่ต้องให้วิศวกรเซ็นรับรอง (Pending Engineering Sign-off)

ใช้สำหรับให้ฮาร์ดแวร์วิศวกร/ทีมผลิต ทำการทวนสอบมิติตัวเลขทางกายภาพจากหน้างานจริงหรือแคตตาล็อกที่เป็นรูปวาด (Drawing-derived) ก่อนที่จะนำค่านี้ไปเลื่อนระดับเป็น `truth_layer: verified` และปลด `needs_verify` ในโน้ตอะตอมแต่ละตัว

| โน้ตอะตอม (Note Link) | พารามิเตอร์ (Parameter) | ค่าปัจจุบัน (Current Value) | แหล่งอ้างอิงแคตตาล็อก (Source Reference) | สถานะความเชื่อมั่น (Confidence Status) | ผู้ตัดสิน (Approved By) | วันที่อนุมัติ (Date) |
|---|---|---|---|---|---|---|
| [[blum-hinge-110-standard]] | `cup_depth_mm` | 13.0 mm | Blum 2024/2025:p.77 (PDF p.81) | 🟡 drawing-derived (medium confidence) | | |
| [[blum-hinge-170]] | `cup_depth_mm` | 11.0 mm | Blum 2024/2025:p.89 (PDF p.93) | 🟡 drawing-derived (medium confidence) | | |
| [[hafele-wardrobe-dresscode]] | `width_formula` | $B = \text{Cabinet Width} - 2\times\text{side\_thickness} - 42\text{ mm}$ | hafele-catalog-2021:p.1192 / p.1196 | 🟡 drawing-derived (medium confidence) | | |
| [[hafele-wardrobe-lifts]] | `horizontal_row_spacing` | 450 mm หรือ 480 mm | hafele-catalog-2021:p.1232 / p.1233 | 🟡 drawing-derived (medium confidence) | | |
| [[hafele-wardrobe-rails]] | `mounting_hole_spacing` | 32 mm vertical / 32 mm double dowels | hafele-catalog-2021:p.1239 / p.1244 | 🟡 drawing-derived (medium confidence) | | |
| [[hafele-lock-symo-cases]] | `cylinder_boring_dia_mm` / `backset_D_mm` | Ø18 mm · backset 15/20/22/24.5/25/40 และ 15–40 (ปรับได้) ตามประเภทตลับ | hafele-catalog-2021:p.661–670 (รายค่าในตาราง body) | 🟠 catalog-derived (drillMap-critical) | | |
| [[hafele-lock-symo-cores]] | `cylinder_boring_dia_mm` / `rosette_dia_mm` | Ø18 mm (rosette Ø18; รุ่น Rondell Ø19) | hafele-catalog-2021:p.684 / p.700 / p.702 | 🟠 catalog-derived (drillMap-critical) | | |
| [[hafele-lock-fixed-cylinder]] | `cylinder_boring_dia_mm` / `backset_D_mm` / `boring_depth_mm` | Ø18 หรือ Ø22 mm · backset 14/20/22/24.5/25/40, 15–40 (ปรับได้) · depth 21–25 mm | hafele-catalog-2021:p.700–714 (รายค่าในตาราง body) | 🟠 catalog-derived (drillMap-critical) | | |
| [[hafele-locks-moc]] | glass door — ความหนากระจก | 4–10 mm (MOC) ขัดกับ 5–7 mm (โน้ต fixed §6) | hafele-catalog-2021:p.710 | 🔴 conflict ในเอกสาร — รอยืนยันหน้า p.710 | | |
| [[italiana-ferramenta-leveller-integrato]] | `boring_dia_mm` / `boring_depth_mm` / `backset_mm` | Ø31 mm · depth 23 (adj 12) / 35 (adj 20) · backset ≥20 · access Ø6/Ø8 | Integrato_Tech.pdf:p.3–8 | 🟠 catalog-derived (drillMap-critical) | | |
| [[italiana-ferramenta-connector-cams-dowels]] | `boring_dia_mm` / `boring_depth_mm` / `backset_mm` | cam Ø15 (depth 12.4/13.4) / Ø25 (11.7) · dowel bore Ø8/Ø5 · backset 24/30 | Cams_and_dowels.pdf:p.3–8 | 🟠 catalog-derived (drillMap-critical) | | |
| [[italiana-ferramenta-connector-cross-dowels]] | `boring_dia_mm` / bolt-entry | barrel Ø10(M6)/Ø14(M8)/Ø16(M10) · bolt entry Ø8/Ø10–11 | Cross_dowels.pdf:p.3–9 | 🟠 catalog-derived (drillMap-critical) | | |
| [[italiana-ferramenta-connector-insert-nuts]] | `boring_dia_mm` (pilot) | M4→Ø5 · M6→Ø8 · M8→Ø10 (มี exception Ø8/Ø10 ตามซีรีส์) | Insert_Nuts.pdf:p.2–5 | 🟠 catalog-derived (drillMap-critical) | | |
| [[italiana-ferramenta-shelf-support-entry-level]] | `boring_dia_mm` / `boring_depth_mm` | Ø5 mm · depth 9–10.5 (System 32) | Entry_Level_Shelf_Supports.pdf:p.2–5 | 🟠 catalog-derived (drillMap-critical) | | |

---

## 🔧 Conflict #7 refinement — side clearance ขึ้นกับความหนาไม้ (Kiro review 2026-06-22)
หลักฐานจาก `BIun 412-535 Runner systems.pdf` (โน้ต runner เดิมก่อน refactor) ชี้ว่า side clearance ของ Blum undermount **ไม่ใช่ค่าเดียว** แต่ขึ้นกับความหนาแผ่นข้าง — ข้อมูลนี้ละเอียดกว่าที่บันทึกใน register #7:

| รุ่น/ไม้ข้าง | สูตร catalog | distance ถึง internal side | outer gap/ข้าง (ไม้ตามรุ่น) | หมายเหตุ |
|---|---|---|---|---|
| MOVENTO / TANDEM 16mm | SKW = LW − 42 | 21 mm/ข้าง | 16mm → 5.0 mm · 15mm → 6.0 mm | ตรงกับ #7 fix (SIDE_GAP=5, box=LW−10) เมื่อไม้ 16mm |
| TANDEM 19mm (560F/550F/561F/551F) | SKW = LW − 49 | 24.5 mm/ข้าง | 19mm → 5.5 mm · 18mm → 6.5 mm | ⚠️ **SIDE_GAP=5 ค่าเดียวไม่ครอบเคส 19mm (ควร 5.5)** |

- **ต้องตัดสิน:** #7 fix (`SIDE_GAP 20.5→5` ใน Production.ts) ครอบเฉพาะไม้ 16mm — เคสไม้ 18/19mm ต้องใช้ค่าต่างกัน หรือคำนวณจาก panel thickness แทน constant
- **discrepancy ที่ต้อง flag:** โน้ตเดิม `blum-tandem-500-undermount` (จาก `hardware-drilling-specifications.md`) ระบุ side clearance **10–15 mm/ข้าง** ซึ่งขัดกับค่า catalog 21/24.5 mm (ถึง internal side) — ต้องยืนยันว่านิยามต่างกัน (outer gap vs to-internal-side) หรือค่าใดผิด
- **0.5mm gap:** side_clearance 21 (catalog) vs 20.5 (monolith) — ส่วนต่าง 0.5mm/ข้าง ยังค้าง unresolved ใน conflicts ของโน้ต runner

> ⚠️ **PRE-DELETE SAFEGUARD:** ถ้า refactor โน้ต runner เป็นชุดใหม่ 18 ไฟล์ → ต้อง**ย้าย `conflicts` (side_clearance 21/24.5) ไปโน้ตใหม่** + อัปเดตลิงก์ `[[blum-tandem-500-undermount]]` ใน hardware-home ก่อนลบ มิฉะนั้น provenance #7 จะหาย
