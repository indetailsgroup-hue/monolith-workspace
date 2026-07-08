# Prompt: Box & Runner Systems Extraction (Brand-centric)

> ใช้สกัด **ระบบลิ้นชัก/รางเลื่อน (Box & Runner Systems)** ของทุกแบรนด์ แยกตามแบรนด์
> ⚠️ scope ล็อกเฉพาะ drawer systems — กันไม่ให้ AI วนกลับไปสรุปบานพับซ้ำ

---

**Role:** Expert Furniture Hardware Specifier & Technical Data Analyst

**Task:** ถอดและสรุปข้อมูล **ระบบลิ้นชักและรางเลื่อน (Box & Runner / Drawer Systems)** จากแคตตาล็อก
ให้พร้อมทำสเปก โดยยึด **"แบรนด์ (Brand)" เป็นมิติหลัก** ข้อมูลมาจากไฟล์แยกตามแบรนด์
(Häfele, Salice, Blum, Grass, Accuride ฯลฯ) แต่ละแบรนด์มีระบบรหัส/ระบบยึด/ค่าสเปกของตัวเอง

## 🔒 SCOPE LOCK (สำคัญที่สุด)
- รอบนี้ทำ **เฉพาะหมวด Box & Runner Systems เท่านั้น**
- **ห้ามสรุปบานพับ (Hinges), เพลทรอง, AVENTOS, lift** ในรอบนี้เด็ดขาด — ถ้าพบให้ข้าม
- ถ้าไฟล์ไม่มีข้อมูลราง/ลิ้นชักของแบรนด์ใด → ระบุ "ไม่ระบุในเอกสาร" สำหรับแบรนด์นั้น (ห้ามเอาบานพับมาแทน)

## ลำดับชั้น (Hierarchy)
แบรนด์ → ประเภทอุปกรณ์ (Category) → รุ่น/รายการ — ทำซ้ำครบทุกแบรนด์ แล้วปิดท้ายด้วย Cross-Brand Reference

## Brand Header (ทุกแบรนด์ เท่าที่มี)
ชื่อแบรนด์/ผู้ผลิต · ชื่อ-ปีแคตตาล็อก · ไฟล์ต้นทาง+เลขหน้า · ระบบยึด/เจาะ (เช่น System 32, ระยะรู runner) · รูปแบบรหัสสินค้า (Part No. pattern)

## หมวดตามลำดับประกอบจริงของลิ้นชัก (ใช้แทนลำดับบานพับ)
1. **รางเลื่อน (Runners/Slides)** — ball-bearing / roller / under-mount / side-mount / center-mount
2. **กล่องลิ้นชักสำเร็จ (Drawer Box Systems)** — เช่น LEGRABOX/TANDEMBOX/MERIVOBOX/Nova Pro (ถ้ามี)
3. **ตัวเชื่อม/ฉากยึด (Couplings / Brackets / Locking devices / Face-frame brackets)**
4. **ระบบปิดนุ่ม/กดเปิด (Soft-close / Easy-close / Touch Release / Push-to-open / Detent-out)**
5. **อุปกรณ์เสริม & สกรู (Accessories & Fasteners)** — ห้ามตกชิ้นเล็ก

## Output
1. ภาษาไทย + คำทับศัพท์อังกฤษในศัพท์เทคนิค
2. ตาราง Order Information (Markdown) คอลัมน์แรกต้องเป็น "แบรนด์":
   **แบรนด์ | ประเภท/การใช้งาน | การดึงออก (Extension) | การยึด/ติดตั้ง (Mounting) | รุ่น/ประเภท | วัสดุ/สีผิว | รหัสสินค้า (มีรหัสผู้ผลิตในวงเล็บ) | แหล่งอ้างอิง (ไฟล์+หน้า)**
3. **Planning & Calculation ต่อหมวด (เท่าที่มี) — เฉพาะค่าของราง/ลิ้นชัก:**
   - การรับน้ำหนัก (Load rating, คงหน่วยเดิม lbs/kg) + class (light/standard/heavy duty)
   - ประเภทการดึงออก (Extension: 3/4 · full · over-travel) + % ระยะดึง
   - ความยาวราง (Nominal Length NL, mm/inch — list ทุกความยาว)
   - ระยะข้าง/ช่องว่างที่ต้องเผื่อ (Side clearance ต่อข้าง, มัก 12.5/13mm) + ความกว้างลิ้นชักขั้นต่ำ
   - รูปแบบติดตั้ง: side-mount / under-mount / center; ระยะรูเจาะ runner (System 32 ถ้าอ้างอิง: pitch 32, รู Ø5)
   - คุณสมบัติพิเศษ: soft-close / push-to-open / detent-out (ล็อกค้างเปิด) / lock-in-lock-out / disconnect lever
   - Handed (ระบุซ้าย-ขวา) หรือไม่ + บรรจุภัณฑ์ (เช่น 10 คู่/ถุง พร้อมสกรู)
4. Legend ตัวย่อสี/วัสดุที่หัวแต่ละหมวด (เช่น NI=นิกเกิล, ZN=ซิงก์, ●/○ ตามที่เอกสารใช้)
5. **ครบ 100% ห้ามตกชิ้นเล็ก:** locking device, rear socket/bracket, tilt/front adjustment, สกรูทุกไซส์
   (pan/truss/euro/chipboard), จิ๊กเจาะราง, face-frame bracket, depth gauge → หมวด Accessories & Fasteners

## Cross-Brand Reference (เมื่อมี ≥ 2 แบรนด์)
จับคู่เมื่อเอกสารระบุชัดว่าใช้แทนกันได้หรือสเปกตรง พร้อมสถานะ:
"ระบุว่าใช้แทนกันได้" / "เทียบจากสเปก ต้องตรวจสอบจริง" / "ข้อมูลไม่พอ — ห้ามสรุป"
+ หมายเหตุความต่างที่กระทบการประกอบ (เช่น side clearance, ระยะรูเจาะ, NL ไม่ตรงกัน)

## Data Integrity
- ห้ามปนข้ามแบรนด์ ทุกค่า/รหัสผูกกับแบรนด์+ไฟล์ต้นทางจริง
- ห้ามเดา/แต่งตัวเลข-รหัส ไม่พบให้ระบุ "ไม่ระบุในเอกสาร"
- ห้ามยกสเปกแบรนด์หนึ่งไปใช้อีกแบรนด์ เว้นแต่เอกสารระบุชัด
- คงหน่วยเดิม + กำกับหน่วยทุกค่า · แบบแปลนเจาะที่เป็นข้อความไม่ได้ ให้หมายเหตุแทนการเดา
- ระบุไฟล์+เลขหน้าทุกหมวด; เอกสารไม่ครบทำเท่าที่มี ห้ามเติมจากแบรนด์อื่น

## 🔁 Conflict Detection กับ MONOLITH (drillMap-critical)
ค่ากลุ่มต่อไปนี้ของลิ้นชัก/รางเป็น input ตรงของ drillMap/ประกอบจริง — ถ้าสกัดได้ **ให้ flag เป็น conflict candidate ทันที** (อย่าตัดสินเองว่าฝั่งไหนถูก):
- **Side clearance ต่อข้าง** (มัก 12.5 / 13 mm), **ความกว้างลิ้นชักขั้นต่ำ**
- **Nominal Length (NL)** ของราง + ระยะรูเจาะยึด runner (pitch, ระยะจากขอบ)
- **ความลึก/ระยะเจาะร่องกล่อง**, ตำแหน่งสกรูยึดหน้าลิ้นชัก (front fixing)
- **Load rating + class** (light/standard/heavy)

วิธีแจ้ง: ในแต่ละโน้ต (รูปแบบ atomic note) ให้ใส่ field `conflicts` + `needs_verify` ตาม schema ของ `HARDWARE_PROMPT_ATOMIC_NOTES.md`:
```yaml
needs_verify: [side_clearance_mm, runner_NL_mm]   # field ที่ยังไม่ verify
conflicts:
  - field: side_clearance_mm
    note_value: 13
    note_value_evidence: "<ไฟล์>:p.xx '...'"
    monolith_value: null      # ไม่รู้ค่าฝั่งโค้ดให้ null — ผมจะ cross-check ตอน ingest
    monolith_ref: null
    status: unresolved
```
ถ้าไม่แน่ใจว่าชนหรือไม่ → ใส่ลง `needs_verify` ไว้ก่อน ดีกว่าปล่อยผ่าน

**Instruction:** วิเคราะห์เฉพาะข้อมูล **Box & Runner Systems** จากไฟล์ที่แนบ ตามโครงสร้างข้างต้น
แยกผลลัพธ์ทีละแบรนด์ แล้วปิดท้ายด้วย Cross-Brand Reference
