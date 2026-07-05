# แผน Clone OneClickCabinet V4.1 → เวอร์ชัน Local (ไม่พึ่ง SketchUp)
### Deep Research Report — Function Inventory + Build Plan
*จัดทำเพื่อโปรเจกต์ MONOLITH (furniture CAD/CAM) · 5 ก.ค. 2026*

---

## 0. บทสรุปผู้บริหาร (Executive Summary)

**OneClickCabinet (OCC)** เป็น SketchUp extension จากเวียดนาม (ทีม OneClick Vina, `oneclickcabinet.net`) สำหรับ **ผลิตเฟอร์นิเจอร์ไม้อุตสาหกรรม (industrial wood furniture)** แบบครบวงจร — ตั้งแต่ออกแบบตู้ด้วยปุ่มเดียว → ใส่ hardware/connector อัตโนมัติ → ทำ BOM → nesting → export **gcode ตรงเข้าเครื่อง CNC โดยไม่ต้องผ่าน middleware** → จัดการแพ็กเกจ (One Packing) → สรุปวัสดุเป็น Excel รุ่นในสายปัจจุบันคือ 4.x (มี tutorial ถึง 4.2/4.3 แล้ว ดังนั้น **V4.1 = รุ่นในสายเดียวกัน core เหมือนกัน**)

**ข่าวดีสำหรับคุณ:** OCC ไม่ได้มี "เวทมนตร์" อะไรที่ทำ local ไม่ได้ ทุกฟังก์ชันคือ *geometry + rules + optimization + file export* ซึ่ง reimplement เองได้ทั้งหมด และ **MONOLITH ที่คุณมีอยู่แล้วครอบคลุมฐานสถาปัตยกรรมไปแล้วราว 55–65%** (React + TS + Three.js/R3F + Zustand, drill maps, Minifix, System 32, grain direction, groove settings, DXF export)

**Gap หลัก 6 ตัวที่ OCC มี แต่ MONOLITH ยังไม่มี/ยังไม่ครบ:**

| # | Gap | ความยาก | เหตุผลที่ยาก |
|---|-----|---------|--------------|
| G1 | **One-click parametric cabinet generator** (สร้างทั้งตู้จากพารามิเตอร์ + แบ่ง frame/cell) | กลาง | ต้องมี library ประเภทตู้ + rules การแบ่งช่อง |
| G2 | **Nesting engine** (จัดชิ้นลงแผ่น + offcuts + grain + anti-skew) | สูง | อัลกอริทึม + คุณภาพผลลัพธ์ |
| G3 | **CAM → G-code postprocessor** (toolpath + drill optimization + dialect ต่อเครื่อง) | **สูงสุด** | ผูกกับความปลอดภัยเครื่องจักร ต่างเครื่องต่าง dialect |
| G4 | **BOM / material statistics → Excel** (แผ่น, edge banding, บานพับ, connector) | ต่ำ–กลาง | ตรงไปตรงมา แต่ต้องผูกกับ hardware model |
| G5 | **Packaging management (One Packing)** | กลาง | ระบบจัดกล่อง/ป้าย/tracking แยกต่างหาก |
| G6 | **Label / report printing** (ป้ายติดชิ้นงาน + barcode, Basic/Advance) | ต่ำ | template + print pipeline |
| G7 | **Cloud storage (Basic/Plus)** — *เพิ่งเห็นจากเมนูจริง* | กลาง | SaaS backbone, multi-tenant, โควตาต่อ tier |
| G8 | **Tier structure (Basic/Plus/Advance)** — *เพิ่งเห็นจากเมนูจริง* | กลาง | freemium ladder = โมเดลหารายได้ (ผูกกับ licensing/entitlement) |

> ⚠️ **ขอบเขต IP (สำคัญ):** รายงานนี้เน้น **วิธีการทำงาน (functionality)** เพื่อให้คุณ *สร้างระบบขึ้นใหม่เอง* — ซึ่ง functionality/แนวคิดนั้นทำซ้ำได้ถูกกฎหมาย (ฟังก์ชันไม่มีลิขสิทธิ์ มีแต่ตัวโค้ด/asset ที่มีลิขสิทธิ์) **ห้าม**: decompile/คัดลอกซอร์สโค้ด OCC, ดึง component library/hardware asset/icon ของเขามาใช้ซ้ำ, หรือ crack license สิ่งที่ทำได้: ศึกษา behavior แล้วเขียนใหม่ทั้งหมดด้วย geometry/rules/asset ของตัวเอง

---

## 1. OneClickCabinet V4.1 ทำงานยังไง — Function Inventory ครบทุกฟังก์ชัน

OCC ทำงานเป็น **pipeline 6 ชั้น** ภายใน SketchUp โดยแต่ละชั้นส่งข้อมูลต่อกัน:

```
[1] DESIGN ──► [2] HARDWARE/JOINERY ──► [3] BOM ──► [4] NESTING ──► [5] CAM/G-CODE ──► [6] PACKAGING/REPORTS
  (3D model)     (connector/drill)      (วัสดุ)     (จัดแผ่น)      (toolpath→เครื่อง)   (แพ็ก/ป้าย/Excel)
```

### 1.1 ชั้น Design — One-Click Cabinet Generation

จุดขายหลักของ OCC คือ "สร้างตู้ซับซ้อนด้วยปุ่มเดียว" แล้วปรับได้ยืดหยุ่น

| ฟังก์ชัน | ทำอะไร | Input | Output |
|---------|--------|-------|--------|
| One-Click cabinet | สร้าง carcass ตู้ (base / wall / tall / มุม) ทั้งใบจากพารามิเตอร์ | ประเภทตู้ + W×H×D + ความหนาแผ่น | SketchUp group/component ตู้ 3D |
| Divide frame / divide cell | แบ่งช่องภายในตู้ (shelf, vertical divider) แบบ intuitive | จำนวน/ตำแหน่งช่อง | แผ่นชั้น + แผ่นแบ่งกลาง |
| Door / drawer builder | สร้างบานเปิด + ลิ้นชัก (แผ่นประกอบลิ้นชักครบ) | ชนิดบาน/ลิ้นชัก + ขนาด | บาน + กล่องลิ้นชัก |
| Customization tools | ย้าย/ลบ/แก้ไขชิ้น + apply พารามิเตอร์ (สี, ขนาด, มือจับ, ชนิดบาน) ทั้งชุด | selection | model อัปเดต |
| Component library | คลังชิ้นส่วน/ตู้สำเร็จรูป | เลือกจาก library | วางลง scene |

**หัวใจทางเทคนิค:** เป็น **parametric geometry generator** — ตู้ = ฟังก์ชันของพารามิเตอร์ (มิติ, ความหนา, ชนิด joinery, clearance) ระบบคำนวณตำแหน่ง/ขนาดแต่ละแผ่นให้อัตโนมัติ

### 1.2 ชั้น Hardware / Joinery — Connectors อัตโนมัติ

| ฟังก์ชัน | ทำอะไร |
|---------|--------|
| Auto-connector | สร้าง connector (minifix/cam-lock, dowel, ตัวยึด) อัตโนมัติตามจุดต่อแผ่น |
| Drill/boring | กำหนดรูเจาะ hardware + รูชั้น (line boring มาตรฐาน System 32) |
| Hinge / slide | บานพับ + รางลิ้นชัก ตามชนิดที่เลือก |
| ปรับ connector | ย้าย/ลบ/เปลี่ยน connector รายจุดได้ |

**หัวใจทางเทคนิค:** เป็น **rules engine** — "เมื่อแผ่น A ชนแผ่น B แบบตั้งฉาก → วาง minifix N ตัว ระยะ X, เจาะรู Ø15 ลึก Y บนแผ่นหนึ่ง + รู Ø8 บนอีกแผ่น" ทุกอย่างเป็นกฎที่เขียนเป็นโค้ดได้

### 1.3 ชั้น BOM — Material Statistics

OCC สรุปวัสดุที่ใช้ทั้งโปรเจกต์ออกเป็น **Excel** ได้แก่ แผ่นที่ใช้ (used sheets), edge banding (ขอบปิด), บานพับ (hinges), และ connector — ระดับ project

**หัวใจทางเทคนิค:** เดิน model tree → รวบรวมทุกชิ้น → จัดกลุ่มตามวัสดุ/ความหนา → คำนวณพื้นที่ + ความยาวขอบปิด + นับ hardware → export

### 1.4 ชั้น Nesting & Offcuts

| ฟังก์ชัน | ทำอะไร |
|---------|--------|
| Direct nesting | จัดชิ้นทั้งหมด (รวมบาน) ลงแผ่นในแบตช์ผลิตเดียวกัน |
| Offcuts | จัดการเศษ/ชิ้นเหลือใช้ต่อ |
| Anti-skew | จัดวางลด "การบิดเบี้ยว" เมื่อ **เครื่องดูดสุญญากาศแรงดูดอ่อน** (จัดชิ้นให้ยึดแน่นระหว่างตัด) |

**หัวใจทางเทคนิค:** irregular/rectangular bin-packing สำหรับตู้เกือบทั้งหมดชิ้นเป็นสี่เหลี่ยม → ใช้ rectangular nesting (guillotine/maxrects) ได้ผลดีและเร็ว; ต้องรองรับ **grain direction constraint** (ชิ้นที่ต้องเรียงลายไม้ทางเดียวกัน) และ **anti-skew** (จัด layout ให้ vacuum ยึดได้)

### 1.5 ชั้น CAM → G-code (จุดขาย "No Middleware")

นี่คือส่วนที่ทำให้ OCC ต่างจาก cutlist ทั่วไป — **export gcode ตรงเข้าเครื่องได้เลย**

| ฟังก์ชัน | ทำอะไร |
|---------|--------|
| Direct G-code export | สร้างไฟล์ gcode ตรง ไม่ต้องผ่านโปรแกรมกลาง (เช่นไม่ต้องส่งเข้า CAM แยก) |
| Simple post-processor | ติดตั้ง post-processor ง่าย รองรับเครื่อง CNC งานไม้ในตลาดปัจจุบันได้ทั้งหมด |
| Stroke optimization | ลดระยะเดินหัวจับ — เจาะรูกลุ่ม (drill group) ในตำแหน่งต่อเนื่องกันโดยไม่วิ่งกลับไปกลับมาเกินจำเป็น |

**หัวใจทางเทคนิค — pipeline มาตรฐานอุตสาหกรรม:**
```
geometry ชิ้น ──► assign operations ──► nesting ──► toolpath ──► POST-PROCESSOR ──► .nc/.gcode
 (outline+รู+ร่อง)   (profile/pocket/     (จัดแผ่น)   (ลำดับ+ระยะ    (แปลงเป็น dialect
                      drill/groove)                   +optimize)     ต่อ controller)
```
- **Operations**: profile (ตัดขอบ + tab กันชิ้นดีด), pocket, drilling (canned cycle G81/G82), groove/เซาะร่อง, engrave
- **Post-processor = ตัวแปลภาษา**: G-code เป็น "dialect ไม่ใช่มาตรฐานเดียว" — operation เดียวกัน output ต่างกันระหว่าง Fanuc / Mach3 / GRBL / LinuxCNC / Syntec / Biesse ฯลฯ (เช่น GRBL ไม่รองรับ canned cycle G81 หรือ cutter comp G41/G42 ต้อง expand เอง) → ต้องมี post-processor แยกต่อ controller

### 1.6 ชั้น Packaging (One Packing) & Reports

| ฟังก์ชัน | ทำอะไร |
|---------|--------|
| One Packing | ซอฟต์แวร์จัดการแพ็กเกจสินค้า (มาพร้อมชุด) — จัดกล่อง/ชุดประกอบ/ติดตาม |
| Excel statistics | สถิติวัสดุโปรเจกต์เป็นไฟล์ Excel (ตาม 1.3) |
| Labels | ป้ายติดชิ้นงาน (โดยนัยจาก workflow nesting→ผลิต) |

### 1.7 Authoritative Tool Menu (เมนูจริงจาก Model Tool) + Tier Structure

> เมนูจริงจากตัวโปรแกรม เผยสองสิ่งที่ §1.1–1.6 ตกไป: (1) tool ที่ไม่ได้ตั้งชื่อในหน้าเว็บ และ (2) **โครงสร้าง tier Basic/Plus/Advance** ซึ่งคือ *โมเดลหารายได้ (freemium/paid)* ของ OCC — มีค่ามากต่อการวาง SaaS ของ MONOLITH

| # | Tool (เมนูจริง) | ทำอะไร | ชั้น pipeline | Tier |
|---|----------------|--------|--------------|------|
| 1 | **Create new component** | สร้าง component/ชิ้นส่วน parametric ใหม่เอง (นอกเหนือ library) | Design (1.1) | free |
| 2 | **Cloud storage — Basic** | เก็บโปรเจกต์บน cloud (โควตาจำกัด) | Platform/SaaS | free/entry |
| 3 | **Cloud storage — Plus** | cloud storage โควตาสูง/ฟีเจอร์เพิ่ม | Platform/SaaS | **paid** |
| 4 | **Manual Fitting** | วาง hardware/connector เอง รายจุด | Hardware (1.2) | free |
| 5 | **Auto Fitting** | วาง hardware/connector อัตโนมัติตามกฎ joint | Hardware (1.2) | free/paid |
| 6 | **Dog Bone** | เติม dogbone/T-bone fillet ที่มุมใน เพื่อให้ดอกกัดกลมทำมุมที่ชิ้นเหลี่ยมสวมพอดี | CAM geometry (1.5) | free/paid |
| 7 | **รางลิ้นชัก (Drawer slide)** | สร้าง/กำหนดรางลิ้นชัก + รูเจาะราง | Hardware (1.2) | free |
| 8 | **Edge Banding — Manual** | ทาขอบปิด (edge banding) รายขอบเอง | Detailing (1.3) | free |
| 9 | **Edge Banding — Auto** | ทาขอบปิดอัตโนมัติตามกฎ | Detailing (1.3) | free/paid |
| 10 | **Basic B.O.M** | สรุปวัสดุพื้นฐาน (แผ่น/ขอบ/hardware นับรวม) | BOM (1.3) | free |
| 11 | **Advance B.O.M** | BOM ละเอียด (ต้นทุน/แยกหมวด/รายงานลึก) | BOM (1.3) | **paid** |
| 12 | **Label — Basic** | ป้ายชิ้นงานพื้นฐาน | Reports (1.6) | free |
| 13 | **Label — Advance** | ป้ายละเอียด (barcode/QR/layout กำหนดเอง) | Reports (1.6) | **paid** |
| 14 | **Nesting — Basic** | จัดแผ่นแบบพื้นฐาน (rectangular) | Nesting (1.4) | free |
| 15 | **CNC 21 Tool Export** | export ไฟล์เครื่อง CNC (⚠️ ยืนยันนิยาม: หัวเปลี่ยนดอก 21 ตำแหน่ง / post ชื่อ "CNC21" / 21 operations) | CAM (1.5) | free/paid |
| 16 | **Nesting — Advance** | nesting ขั้นสูง (true-shape/NFP, offcut, grain, ตัวเลือกเพิ่ม) | Nesting (1.4) | **paid** |
| 17 | **Machine Origin Setting** | ตั้งจุด origin/datum ของเครื่อง (มุม/กลาง, ทิศแกน) | CAM (1.5) | free/paid |
| 18 | **Advance Machine** | ตั้งค่าเครื่องขั้นสูง (tool table, post-processor params, feeds/speeds, safe height) | CAM (1.5) | **paid** |

**สิ่งที่เมนูนี้สอนเรา 3 ข้อ:**
1. **Tier = โมเดลธุรกิจ:** ฟีเจอร์เดียวกันแยก Basic (ฟรี ล่อให้ใช้) vs Plus/Advance (จ่ายเงิน) — นี่คือ *freemium ladder* ที่ MONOLITH ใช้เป็น blueprint SaaS ได้เลย (Basic ให้ครบพอทำงานได้ → Advance ปลดล็อกกำลังการผลิต/ต้นทุน/เครื่องหลายตัว)
2. **Cloud storage คือแกน SaaS:** OCC ผูก recurring revenue ไว้กับ cloud storage tier — MONOLITH ต้องออกแบบ persistence layer (Supabase) ให้รองรับ multi-tier ตั้งแต่ต้น
3. **CAM แตกเป็นหลาย tool ย่อย:** Dog Bone, Machine Origin, Advance Machine, CNC Export = ชั้น CAM ไม่ใช่ก้อนเดียว ต้องแยกเป็น sub-modules (ดู §3.5 ปรับปรุง)

### 1.8 Machine Compatibility & Export Formats — *ประเด็นที่เอกสารเดิมตกไป*

> **สมมติฐานที่เอกสารเดิมผิด:** เดิมมองว่า "ทุกเครื่อง = post-processor → gcode" **แต่ความจริงคือฟอร์แมต export ขึ้นกับ *ประเภทเครื่อง* ไม่ใช่แค่ยี่ห้อ** — เครื่องยุโรปหลายตัว *ไม่กิน gcode ดิบ* และเลื่อยแผ่นก็ไม่ใช้ gcode เลย นี่เปลี่ยนการออกแบบ CAM module (G3) อย่างมีนัยสำคัญ

**สิ่งที่ OCC รองรับ (ตามข้อมูลผู้ใช้ + วิธีที่เครื่องแต่ละคลาสทำงานจริง):**

| ประเภทเครื่อง | ทำอะไร | รับข้อมูลแบบไหน | ยี่ห้อ/ตัวอย่าง |
|--------------|--------|----------------|----------------|
| **Nesting CNC Router** (flat table) | ตัด+เจาะ+เซาะร่อง ชิ้นที่ nest บนแผ่น | **G-code** (บางที HPGL/plt) | **Mastrox** (เครื่องหลัก), Syntec, Fanuc, Mach3, Anderson, GRBL |
| **Point-to-Point (P2P)** ยุโรป | เจาะ/กัด/เซาะ ทีละจุดบนโต๊ะ | **ฟอร์แมต native** (เครื่องแปลงเป็น gcode เอง) | **Biesse, Homag** |
| **Six-Side Drilling** (เจาะหกด้าน) | เจาะครบ 6 หน้าในรอบเดียว (through-feed) | drilling data / native | เครื่องเจาะ 6 ด้าน |
| **Computer Panel Saw** (เลื่อยแผ่น) | เลื่อยตัดแผ่นตาม pattern (ไม่เจาะ) | **Parts list / cutting pattern** (ไม่ใช่ gcode!) | beam saw + CutRite ฯลฯ |

**⚠️ กุญแจสำคัญ — เครื่องยุโรปกินฟอร์แมต native ไม่ใช่ gcode:**
P2P จากยุโรปมีซอฟต์แวร์ในตัวเครื่อง (onboard NC-generator) ที่แปลง "machining program" เป็น gcode เอง การยัด gcode ดิบเข้า Homag/Weeke ตรง ๆ *ทำได้ยากมาก* — ต้องส่งเป็นฟอร์แมต native แทน:

| แบรนด์ | ซอฟต์แวร์เครื่อง | ฟอร์แมตไฟล์ที่ต้อง export |
|--------|------------------|---------------------------|
| Homag / Weeke | WoodWOP | **.MPR / .MPRX** |
| Biesse | BiesseWorks / bSolid | **.BPP / .CIX / .CID** |
| Holzher | NC-HOPS | **.HOP** |
| SCM / Morbidelli | Xilog / Maestro | **.XXL** → pgm/iso |
| Felder / Format4 | — | **.F4G** |
| TPA Albatros / Vitap | TpaCAD | **.TCN** |
| เครื่อง gcode ตรง | (ไม่มี) | **G-code** (.nc/.tap/.pgm) |

**ข้อจำกัด "อายุเกิน 20 ปี":** เครื่องเก่ามาก ๆ มักไม่มี controller ที่ import ไฟล์มาตรฐานได้ (ใช้ transfer แบบ serial/proprietary หรือรับแค่ ISO เก่า) จึงไม่รองรับ — สอดคล้องกับที่ OCC ระบุ

**นัยต่อสถาปัตยกรรม MONOLITH (ปรับ G3 ใหม่ทั้งก้อน):**
ชั้น export **ไม่ใช่** "post-processor เดียว → gcode" แต่ต้องเป็น **pluggable export backend หลายตระกูล**:
1. **G-code family** — Mastrox/Syntec/Fanuc/Mach3/GRBL/Anderson *(← ทำก่อนสำหรับ MVP เพราะคือเครื่องหลักของคุณ)*
2. **Native P2P family** — สร้าง *machining program* (MPR/BPP/CIX/HOP/TCN/XXL) แล้วให้เครื่องแปลง gcode เอง *(แต่ละฟอร์แมต = sub-project แยก งานหนัก)*
3. **Cutting-list family** — panel saw: export cutting pattern/parts list (CSV/CutRite-style, ไม่มี toolpath)
4. **Drilling-data family** — six-side drill: ตำแหน่งรูครบ 6 หน้า

> **คำแนะนำ MVP:** เลือก **1 เครื่องจริง (Mastrox/gcode)** ทำ backend เดียวให้แม่นก่อน — อย่าพยายามรองรับทุกตระกูลรวดเดียว P2P native formats เก็บไว้ Phase หลัง (แต่ **ออกแบบ export layer เป็น plugin ตั้งแต่วันแรก** เพื่อเสียบ backend ใหม่ได้โดยไม่รื้อ core)

---

## 2. Architecture ของ Local Clone (ตัด SketchUp ออก)

### 2.1 SketchUp ให้อะไร OCC บ้าง → ต้องแทนด้วยอะไร

| SketchUp ให้ | หน้าที่ | Local แทนด้วย |
|--------------|--------|----------------|
| 3D modeling kernel + viewport | สร้าง/แสดง geometry | **Three.js / React-Three-Fiber** (MONOLITH มีแล้ว) |
| Component/Group + attributes | โครงสร้างข้อมูลชิ้น + metadata | **โมเดลข้อมูลของเราเอง** (Zustand store — MONOLITH มีแล้ว) |
| Ruby API + UI (HtmlDialog) | ปลั๊กอิน + panel | **React app + panels** (MONOLITH มีแล้ว) |
| Materials | วัสดุ/สี | **material system ของเรา** (grain direction — MONOLITH มีแล้ว) |
| .skp persistence | เซฟงาน | **JSON / Supabase** |

**สรุป:** SketchUp เป็นแค่ "host" — เมื่อทำ standalone เราได้ **ควบคุม data model เองทั้งหมด** ซึ่งดีกว่าเดิม (data-driven → nesting/CAM ทำได้สะอาดกว่า)

### 2.2 Layered architecture ที่แนะนำ (data-driven core)

```
┌─────────────────────────────────────────────────────────────┐
│  UI LAYER (React + R3F viewport + panels)                    │  ← MONOLITH มีแล้ว
├─────────────────────────────────────────────────────────────┤
│  DOMAIN MODEL (single source of truth)                        │
│  Project → Cabinets[] → Panels[] → {Holes, Grooves, Edges,   │  ← หัวใจ ต้องออกแบบให้ดี
│  Hardware, Material, GrainDir}                                 │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│ PARAMETRIC   │ JOINERY/HW   │ BOM/COST     │ EXPORT           │
│ GENERATOR    │ RULES ENGINE │ ENGINE       │ (DXF/PDF/XLSX)   │
├──────────────┴──────────────┴──────────────┴─────────────────┤
│  NESTING ENGINE (parts → sheets + offcuts + grain)            │  ← Gap G2
├─────────────────────────────────────────────────────────────┤
│  CAM ENGINE → TOOLPATH → POST-PROCESSOR → G-CODE             │  ← Gap G3 (ยากสุด)
└─────────────────────────────────────────────────────────────┘
```

**หลักการสำคัญ:** ให้ **Domain Model เป็น single source of truth** — 3D view, nesting, CAM, BOM ทุกตัว *อ่านจากโมเดลเดียวกัน* ไม่ใช่แปลงไปมา นี่คือข้อได้เปรียบใหญ่ของ standalone เทียบกับการยัดทุกอย่างลง SketchUp geometry

### 2.3 Tech Stack แนะนำ (ต่อยอด MONOLITH โดยตรง)

- **Frontend/3D:** React + TypeScript + Three.js/R3F + Zustand *(MONOLITH เดิม)*
- **Geometry 2D:** `clipper-lib`/`polygon-clipping` (boolean, offset/kerf), `Maker.js` (2D path → DXF/SVG)
- **DXF:** `@tarikjabiri/dxf` หรือ `dxf-writer` (เขียน), MONOLITH มี `cabinetToDxf` อยู่แล้ว
- **Nesting:** SVGNest core / Deepnest engine (NFP) *หรือ* rectangular packer เขียนเอง (ดู §3.4)
- **XLSX:** SheetJS *(มีในสภาพแวดล้อม artifact อยู่แล้ว)*
- **G-code post:** เขียนเป็น **template/plugin ต่อ controller** (สถาปัตยกรรมแบบ FreeCAD Path — 1 dialect = 1 module)
- **Persistence:** Supabase *(สอดคล้อง TCCK stack ที่คุณใช้)* หรือ local JSON
- **Packaging (ถ้าจะทำ):** โมดูลแยกในแอปเดียวกัน

---

## 3. Module-by-Module: ต้องสร้างอะไรบ้าง

### 3.1 Parametric Cabinet Engine *(Gap G1)*
สร้างตู้ทั้งใบจากพารามิเตอร์ + แบ่ง frame/cell

- **สิ่งที่ต้องมี:** cabinet type library (base/wall/tall/corner) เป็นฟังก์ชัน `generate(params) → Panel[]`; ระบบ constraint (ความหนาแผ่น, overlay/inset, clearance บานพับ/ราง); divide-cell logic (แบ่งช่อง → คำนวณ shelf/divider)
- **อ้างอิงเปิด:** แนวคิดจาก **Oob Cabinets** (ปลั๊กอินฟรีสร้างตู้ปุ่มเดียว) และ cabinet families ของ Cabinet Vision/Microvellum เป็น reference behavior
- **MONOLITH มีแล้ว?** มี panel/cabinet model + 3D viewer + panel config → **ต้องเพิ่ม generator layer ด้านบน**

### 3.2 Joinery / Hardware Rules Engine *(ต่อยอด Minifix เดิม)*
- **สิ่งที่ต้องมี:** rules "แผ่นชน → hardware อะไร กี่ตัว ระยะเท่าไร รูเจาะแบบไหน"; hardware catalog (minifix, dowel, บานพับ, ราง) พร้อมพารามิเตอร์เจาะ; **System 32 line boring** (MONOLITH มีแล้ว)
- **MONOLITH มีแล้ว?** Minifix, drill maps, System 32, HardwareSmartDimensions → **มีฐานแข็งแล้ว ต้องเพิ่ม auto-placement rules ให้ครอบคลุมทุก joint**

### 3.3 BOM / Cost Engine *(Gap G4 — ง่ายสุด)*
- **สิ่งที่ต้องมี:** เดิน domain model → aggregate ตามวัสดุ/ความหนา → พื้นที่แผ่น, ความยาว edge banding (ต่อขอบที่ปิด), นับ hardware → **export XLSX** (SheetJS)
- **อ้างอิงเปิด:** **OpenCutList** ทำ parts list + cost/weight report + labels (MIT-style open source) — ศึกษา *วิธีจัดหมวดวัสดุ* (sheet goods vs solid wood, ตีความ length/width/thickness) ได้เลย
- **ความยาก:** ต่ำ ถ้า domain model ดี

### 3.4 Nesting Engine *(Gap G2)*
เลือกได้ 2 ทาง:

| แนวทาง | เหมาะกับ | ข้อดี | ข้อเสีย |
|--------|---------|------|--------|
| **A. Rectangular packing** (guillotine / maxrects เขียนเอง) | ตู้ทั่วไป (ชิ้นสี่เหลี่ยม 95%+) | เร็วมาก, คุมง่าย, รองรับ grain + kerf + trim ง่าย | ไม่รองรับชิ้นโค้ง/แปลก |
| **B. True-shape NFP** (SVGNest / Deepnest engine) | มีชิ้นโค้ง/ไม่สี่เหลี่ยม | ใช้วัสดุคุ้มสุด, part-in-part, line-merge | ช้ากว่า (genetic algo), integrate ยากกว่า |

- **คำแนะนำ:** เริ่มด้วย **A (rectangular)** ให้ครอบคลุม 95% ของงานตู้ก่อน แล้วค่อยเสริม B สำหรับชิ้นพิเศษ
- **ต้องรองรับ:** grain-direction lock (ชิ้นเรียงลายไม้เดียวกัน), kerf/spacing, offcut reuse, **anti-skew** (จัด layout ให้ vacuum ยึดชิ้นได้ — เช่นไม่วางชิ้นเล็กติดขอบตัด)
- **อ้างอิงเปิด:** SVGNest (NFP + genetic), Deepnest (C-core NFP, line-merge, part-in-part), `rectpack`/maxrects สำหรับกล่องสี่เหลี่ยม

### 3.5 CAM Engine → Toolpath → G-code Post-Processor *(Gap G3 — ยาก/เสี่ยงสุด)*

**นี่คือส่วนที่ควรลงแรงและระวังมากที่สุด** เพราะผูกกับความปลอดภัยเครื่องจักรจริง

**Pipeline:**
1. **Assign operations** ต่อชิ้น: profile (ตัดขอบ + auto-tab), drilling (รู hardware/ชั้น → canned cycle), groove/เซาะร่อง, pocket
2. **Toolpath generation:** ลำดับ operation (เจาะก่อน/ตัดทีหลังเพื่อคุมความนิ่งชิ้น), lead-in/out, tab placement, **drill-group ordering** (เรียงรูให้หัวเดินต่อเนื่อง — คือ stroke optimization ของ OCC = ปัญหา TSP ย่อ ๆ)
3. **Post-processor:** แปลง internal toolpath → dialect ของ controller เป้าหมาย

- **สถาปัตยกรรม post-processor แนะนำ (เลียนแบบ FreeCAD Path):** internal toolpath representation กลาง 1 ชุด + **post module ต่อ dialect** (แต่ละ module คุม: canned cycle รองรับไหม, รูปแบบ G0/G1, spindle M3+S, หน่วย, safe/clearance height, program header/footer) เริ่มจาก **GRBL** (เครื่อง hobby/เล็กส่วนใหญ่) หรือ **Mach3/Syntec** (เครื่องงานไม้จีนที่พบบ่อยในไทย) แล้วขยาย
- **ความปลอดภัย:** ต้องมี **simulator/verify** ก่อนส่งเครื่องเสมอ (เทียบ CAMotics/แสดง toolpath preview) — ผิด post = เครื่อง alarm หรือพังชิ้น/หัวจับ
- **คำเตือน:** อย่ารีบทำให้ครอบทุกเครื่อง — เลือก **1 เครื่องเป้าหมายจริง** ที่คุณจะใช้ แล้ว tune post ให้แม่นก่อน

### 3.6 Export: DXF / Label / Report *(Gap G6)*
- **DXF ต่อชิ้น** (สำหรับเครื่องที่กิน DXF ไม่ใช่ gcode): MONOLITH มี `cabinetToDxf` — ต่อยอดให้ครบ (รู, ร่อง, layer แยก tool)
- **Label:** template ป้ายชิ้น (ชื่อชิ้น, ขนาด, วัสดุ, edge, ตำแหน่งใน nest, barcode/QR) → print/PDF
- **Report:** สรุป nest (yield %, จำนวนแผ่น), BOM, cost

### 3.7 Data & Persistence
- Domain model → JSON serialize → **Supabase** (สอดคล้อง stack เดิม) หรือไฟล์ local
- รองรับ versioning โปรเจกต์ + offcut inventory ข้ามงาน

---

## 4. Gap Analysis: MONOLITH ที่มีอยู่ vs OCC

| ความสามารถ | OCC | MONOLITH ปัจจุบัน | สถานะ |
|-----------|-----|-------------------|-------|
| 3D viewport + model | ✅ (SketchUp) | ✅ Three.js/R3F | ✅ **มีแล้ว** |
| Panel/cabinet data model | ✅ | ✅ Zustand store | ✅ **มีแล้ว** |
| Minifix / connector | ✅ | ✅ Minifix Transform | ✅ **มีแล้ว** |
| Drill map / boring | ✅ | ✅ drill maps + System 32 | ✅ **มีแล้ว** |
| Grain direction | ✅ | ✅ | ✅ **มีแล้ว** |
| Groove / เซาะร่อง | ✅ | ✅ Groove Settings | ✅ **มีแล้ว** |
| DXF export | ✅ | ✅ cabinetToDxf | 🟡 **มีบางส่วน** |
| Panel config UI | ✅ | ✅ Panel Config modal | ✅ **มีแล้ว** |
| One-click cabinet generator | ✅ | ❌ | 🔴 **G1 ต้องสร้าง** |
| Divide frame/cell | ✅ | ❌ | 🔴 **G1 ต้องสร้าง** |
| Door/drawer auto-builder | ✅ | ❓ ตรวจ codebase | 🟡 **ตรวจสอบ** |
| Nesting + offcuts + anti-skew | ✅ | ❌ | 🔴 **G2 ต้องสร้าง** |
| CAM → G-code + post-processor | ✅ | ❌ | 🔴 **G3 ต้องสร้าง (ยากสุด)** |
| ├ G-code family (Mastrox/Syntec/router) | ✅ | ❌ | 🔴 **G3a — ทำก่อน MVP** |
| ├ P2P native (Biesse BPP/CIX, Homag MPR) | ✅ | ❌ | 🔴 **G3b — Phase หลัง/ตัวยาก** |
| ├ Panel saw cutting-list | ✅ | ❌ | 🔴 **G3c — คนละ pipeline** |
| └ Six-side drilling data | ✅ | ❌ | 🔴 **G3d** |
| BOM → Excel | ✅ | ❌ | 🔴 **G4 ต้องสร้าง (ง่าย)** |
| Packaging (One Packing) | ✅ | ❌ | 🔴 **G5 optional** |
| Label / barcode (Basic/Advance) | ✅ | ❓ | 🔴 **G6 ต้องสร้าง** |
| Create new component | ✅ | 🟡 (มี model) | 🟡 **เพิ่ม tool** |
| Manual/Auto Fitting | ✅ | 🟡 (มี Minifix) | 🟡 **เพิ่ม auto-rules** |
| **Dog Bone (มุมใน CAM)** | ✅ | ❌ | 🔴 **G3 ต้องสร้าง** |
| Edge Banding Manual/Auto (tool) | ✅ | ❓ | 🔴 **ต้องสร้าง (ง่าย)** |
| **Cloud storage (Basic/Plus)** | ✅ | ❌ | 🔴 **G7 ใหม่ — SaaS backbone** |
| CNC 21 Tool Export | ✅ | ❌ | 🔴 **G3 (ยืนยันนิยาม)** |
| Machine Origin / Advance Machine | ✅ | ❌ | 🔴 **G3 sub-module** |
| **Tier structure (Basic/Plus/Advance)** | ✅ | ❌ | 🔴 **G8 ใหม่ — monetization** |

**สรุป (ปรับปรุงตามเมนูจริง):** ฐาน CAD (design/geometry/hardware/DXF) คุณมีแล้ว สิ่งที่ขาดคือ (ก) **manufacturing pipeline** — generator, nesting, CAM/post (รวม Dog Bone, Machine Origin, Advance Machine), BOM, edge banding; และ (ข) **สองแกน SaaS ที่เพิ่งเห็นชัด** — **G7 Cloud storage** (backbone) และ **G8 Tier structure** (freemium ladder = โมเดลหารายได้)

---

## 5. Roadmap แนะนำ (Phased — ลด risk, ได้ของใช้เร็ว)

> หมายเหตุ governance: นี่เป็น **planning input** สำหรับ MONOLITH lane — ยังไม่ใช่ implementation authorization ควรผ่าน flow ปกติ (Operator decide → plan → propose → review) ก่อนลงมือ

**Phase 0 — Spike / พิสูจน์จุดเสี่ยง (1–2 สัปดาห์)**
- ทำ **G-code post-processor prototype** สำหรับ **เครื่องเป้าหมายจริง 1 เครื่อง** จากชิ้น mock (ตัด + เจาะ 4 รู) → รันจริง/simulate ให้ผ่าน *← พิสูจน์ Gap ที่ยากสุดก่อน ลด risk*
- ทำ **rectangular nesting prototype** จาก part list mock

**Phase 1 — Manufacturing core (MVP local)**
- Parametric generator ตู้ base/wall (G1 บางส่วน)
- BOM → XLSX (G4)
- Rectangular nesting + grain + offcuts (G2 ทางเลือก A)
- DXF export ครบ (รู/ร่อง/layer) (G6 บางส่วน)
- **หมุด MVP:** ออกแบบตู้ → BOM → nest → DXF/gcode 1 เครื่อง = ครบ loop โรงงานได้จริง

**Phase 2 — ขยาย**
- Cabinet types เพิ่ม (tall/corner/drawer builder), divide-cell เต็ม (G1 เต็ม)
- Post-processor เครื่องที่ 2–3
- Label/barcode + report (G6 เต็ม)
- Drill-group stroke optimization (TSP)

**Phase 3 — Nice-to-have**
- True-shape NFP nesting (G2 ทางเลือก B) สำหรับชิ้นพิเศษ
- Packaging module (G5)
- Offcut inventory ข้ามงาน + คลังวัสดุ

---

## 6. ความเสี่ยง / ข้อควรระวัง

1. **IP — สำคัญสุด:** reimplement *behavior* เท่านั้น ห้ามคัดลอกโค้ด/asset/component library/icon/hardware model ของ OCC สร้าง catalog + geometry ของตัวเองใหม่ทั้งหมด (ดู §0)
2. **G-code = ความปลอดภัยเครื่องจักร:** post-processor ผิด → เครื่องพัง/ชิ้นดีด/หัวจับหัก **ต้องมี simulator/preview + ทดสอบ dry-run เสมอ** และเริ่มทีละเครื่อง
3. **Nesting คุณภาพ:** yield ต่ำ = เปลืองวัสดุจริง เริ่ม rectangular ให้เสถียรก่อน วัด yield% เทียบ OCC
4. **Hardware library เวียดนาม:** OCC ผูกกับ hardware/มาตรฐานที่นิยมในเวียดนาม — คุณต้อง map เป็น hardware ที่หาได้จริงในไทย (ตรงกับ furniture-research ที่คุณทำอยู่)
5. **Scope creep:** OCC คือผลงานทีมหลายปี อย่าพยายาม clone 100% รวดเดียว — โฟกัส loop โรงงานที่ *คุณใช้จริง* ก่อน (Ikigai note: โฟกัสสิ่งที่ใกล้ recurring revenue)
6. **Domain model คือรากฐาน:** ถ้าออกแบบ data model (Panel + Holes + Grooves + Hardware + Grain) ไม่ดีตั้งแต่ต้น nesting/CAM/BOM จะพังตามหมด — ลงแรงออกแบบส่วนนี้ให้มากที่สุด

---

## 7. อ้างอิง (แหล่งเปิดที่ศึกษาต่อได้)

- **OneClickCabinet** — `oneclickcabinet.net`, SketchUp Extension Warehouse, YouTube (OneClick Cabinet channel, tutorials "From SketchUp to CNC - OneClick 4.2")
- **OpenCutList** (open source, GitHub `lairdubois/lairdubois-opencutlist-sketchup-extension`, docs.opencutlist.org) — reference สำหรับ parts list, cutting diagram, labels, cost/weight, DXF export, การจัดหมวดวัสดุ/grain
- **Nesting:** SVGNest (`svgnest.com`), Deepnest (`deepnest.io`, GitHub `deepnest-next/deepnest` — NFP + genetic + line-merge), maxrects/guillotine bin-packing
- **CAM / Post-processor:** FreeCAD Path workbench (สถาปัตยกรรม post = Python script ต่อ controller), CamBam, แนวคิด post-processor (dialect: Fanuc/Mach3/GRBL/LinuxCNC/Syntec/Biesse)
- **Reference CAM ตู้ระดับอุตสาหกรรม:** Cabinet Vision, Microvellum, Alphacam, XCab, EasyPlan (ศึกษา behavior/workflow)
- **DXF/2D JS:** Maker.js, `@tarikjabiri/dxf`, dxf-writer; `clipper-lib`/`polygon-clipping` (offset/kerf/boolean)

---

*รายงานฉบับนี้เป็น deep research + build plan สำหรับตัดสินใจเชิงสถาปัตยกรรม — ไม่ใช่ authorization ให้ implement โปรดผ่าน MONOLITH governance flow ก่อนลงมือ*
