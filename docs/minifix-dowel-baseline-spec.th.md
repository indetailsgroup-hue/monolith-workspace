# สเปกอ้างอิง Minifix + Dowel (ฉบับภาษาไทยสำหรับทีมงาน)

## วัตถุประสงค์
เอกสารนี้ใช้เป็น “มาตรฐานอ้างอิง” ของงาน Minifix + Dowel เพื่อให้ทุกทีม (ออกแบบ / เขียนโค้ด / ตรวจงาน) เข้าใจตรงกัน และกันอาการพังซ้ำเมื่อมีการแก้โค้ดหรือ sync ข้าม worktree

## ขอบเขต
ครอบคลุมเรื่อง:
- การ generate รูเจาะ (DrillMap)
- การแสดงผลรู (CAD / CSG / Overlay)
- การวาง Hardware (CAM / BOLT / THREAD / DOWEL)
- พฤติกรรมปุ่ม Transform (Flip / Rotate / Move)
- กฎ pattern ตามความยาวด้าน A/B (มากกว่า/น้อยกว่า 400 มม.)
- สเปก Dowel (`Ø8 x 30`)

## หลักการสำคัญ (ต้องตรงกัน 3 ชั้น)

ระบบจะถือว่า “ถูกต้อง” ก็ต่อเมื่อ 3 ส่วนนี้ตรงกันทั้งหมด:

1. ความจริงทางการผลิต (Manufacturing Truth / DrillMap)
- ตำแหน่งรู
- ทิศเจาะ (normal)
- ความลึก
- ประเภทรู (purpose)

2. ชั้นแสดงผลรู (Visualization)
- วง `Ø15`
- กากบาท `X`
- ป้าย `Ø10`, `Ø5`, `Ø8`
- กล่อง/solid ใน X-Ray

3. ชั้นแสดงผล Hardware (Hardware Render)
- ตัว CAM / BOLT / THREAD / DOWEL ต้องอยู่แกนเดียวกับรู
- กด Flip/Rotate/Move แล้วรูและฮาร์ดแวร์ต้องไปพร้อมกัน

ถ้าส่วนใดส่วนหนึ่งใช้ logic คนละชุด จะเกิดอาการ:
- รูขยับ แต่ฮาร์ดแวร์ไม่ขยับ
- ฮาร์ดแวร์ขยับ แต่ overlay ไม่ขยับ
- หน้าปัด CAM กลับ แต่ด้านเปิดรู `Ø15` ไม่กลับ

## Worktree / URL ที่ใช้งาน
- `determined-williams` -> `localhost:5173` (ตัวหลัก / baseline)
- `dreamy-beaver` -> `localhost:5174`
- `keen-jepsen` -> `localhost:5175`
- `peaceful-villani` -> `localhost:5176`
- `vigorous-cori` -> `localhost:5177`
- `wonderful-leakey` -> `localhost:5178`

### หมายเหตุสำคัญ
- `localhost` กับ `127.0.0.1` ใช้ `localStorage` คนละชุด
- ถ้าเปิดคนละ URL แม้โค้ดคล้ายกัน อาจเห็นค่า default / override ไม่เหมือนกัน
- ต้องเช็กว่าแก้ “worktree ที่รันจริง” เท่านั้น

## Timeline สรุปงานที่แก้จนถูก

### 1) รวม logic ให้ “รูถูก + hardware ถูก”
สถานะตั้งต้น:
- บาง worktree รูถูก แต่ hardware ผิด
- บาง worktree hardware ถูก แต่รูผิด

สิ่งที่ทำ:
- รวม logic ที่ถูกของทั้งสองฝั่งให้ใช้แกน/จุดอ้างอิงเดียวกัน

ผล:
- รูเจาะและ hardware เริ่มตรงกัน

### 2) เพิ่ม X-Ray filter แยกรูทีละชนิด
เหตุผล:
- รูหลายชนิดซ้อนกันจนตาดูผิด

สิ่งที่เพิ่ม:
- ปุ่ม filter เช่น `ALL`, `CAM`, `BOLT`, `Ø5`
- ใช้กับทั้ง `CADDrillIndicators` และ `CSGDrillOverlay`

ผล:
- เช็กได้ชัดว่า “รูผิดจริง” หรือ “แค่ภาพซ้อนกัน”

### 3) รวม `Ø7.5` เข้ากับ BOLT (แสดงรูใหญ่สุดรูเดียว)
Requirement:
- ไม่ต้องแสดง `Ø7.5` แยก
- ใช้รูหลักเป็น BOLT (`Ø10`) ความลึก `24mm`
- BOLT ต้องอยู่ฝั่ง Bolt (ไม่ใช่ฝั่งเกลียว)

ผล:
- ภาพอ่านง่ายขึ้น
- ลดความสับสนเวลา debug

### 4) แก้ความหมาย Vertical Flip ให้ถูก
ความหมายที่ถูกต้อง:
- `Vertical Flip` = สลับหน้า CAM / สลับด้านเปิดรู `Ø15`
- ไม่ใช่แค่กลับลายหน้าปัด (clockface)

สิ่งสำคัญ:
- Flip ต้องแยก state ออกจาก rotation
- ห้ามใช้ `rotX` มาเดา flip

### 5) ให้ `Ø15` + วงเหลือง + X flip ไปอีกหน้าไม้พร้อม hardware
Requirement:
- กด Vertical Flip แล้ว:
  - CAM ไปอีกหน้าไม้
  - วง `Ø15` และ `X` ไปอีกหน้าไม้

ผล:
- รูและฮาร์ดแวร์สอดคล้องกันจริง

### 6) แกน `Ø10` และ `Ø5` ต้องอยู่กึ่งกลางความหนาไม้ (Top/Bottom)
Requirement:
- แกน BOLT/THREAD ต้องอยู่กลาง thickness ของ Top/Bottom ทุกมุม

สิ่งที่ทำ:
- คำนวณแกนจาก midpoint ของความหนาแผ่น
- บังคับ `Ø10` และ `Ø5` ใช้แกนเดียวกัน

ผล:
- ตรงแบบผลิตจริง
- ลด mismatch hardware/holes

### 7) จุด Flip ของ hardware ต้องอิงแกนกลาง (`targetPocketCenter`)
สิ่งที่ทำ:
- ใช้ `targetPocketCenter` เป็นแกนกลางสำหรับ flip
- hardware ต้อง map กับรู CAM ตัวเดียวกับที่ DrillMap ใช้จริง

ผล:
- Flip แล้ว hardware กับรูยังตรงกัน

### 8) ปุ่ม Transform อื่น ๆ ไม่ทำงาน (regen ทับ state)
อาการ:
- Horizontal Flip / Rot X/Y/Z / Move กดแล้วเหมือนไม่ทำงาน

สาเหตุ:
- regenerate DrillMap มาทับ override ทันที

สิ่งที่แก้:
- จำกัดเงื่อนไข regenerate
- restore state ให้คืน rotation ด้วย

### 9) ปัญหา Main Shelf 1 ไม่แนบ Side Panel
สาเหตุ:
- หัก clearance เกิน
- หัก edge thickness ซ้ำ

สิ่งที่แก้:
- ปรับสูตร width/depth shelf ให้ถูก

หมายเหตุ:
- ต้องแก้ใน worktree ที่รันจริง
- ต้องบังคับ recalc state หลังแก้

## กฎ Pattern ตาม CAD (A/B >/< 400) [สำคัญ]

นี่คือกฎที่ต้องมีใน generator ไม่ใช่แค่ UI:

### จากแบบ CAD
- ตัวอย่างขนาดแผ่น: `600 x 395`
- pattern ตามแนวยาว (สมมาตรจากขอบ):
  - `37 / 32 / 199 / 32 / 199 / 32 / 37`
- มีทั้ง Minifix และ Dowel ร่วมกัน

### กฎตามความยาวด้าน
- `A > 400mm` -> ใช้ pattern แบบยาว (มีตำแหน่งกลางเพิ่ม)
- `B < 400mm` -> ใช้ pattern แบบสั้น (จำนวนจุดน้อยกว่า)

### กฎ generator (baseline)
- `sideLen <= 400` -> `CORNER + CORNER`
- `sideLen > 400` -> `CORNER + MIDDLE + CORNER`

### ความสัมพันธ์ Minifix + Dowel
- ระยะ c-c หลัก `32`
- Dowel วางสัมพันธ์กับ Minifix ตามแบบ
- ด้านยาวมีชุดกลางเพิ่ม

## สเปก Dowel (อัปเดตแล้ว)
- แบบเก่าในรูปบางภาพแสดง `Ø6 x 30`
- สเปกที่ตกลงใช้ในระบบ: **`Ø8 x 30`**

## อาการ Regression ที่ต้องจับตา (เช็กเร็ว)

ถ้าเจออาการต่อไปนี้ ให้สงสัยว่าโค้ดหลุด baseline / ไฟล์ถูกเขียนทับ:

1. BOLT label กลับไปเป็น `Ø7.5`
2. Dowel/geometry preview โผล่ผิดตำแหน่งใน scene จริง
3. Vertical Flip กลับแต่หน้าปัด CAM แต่ไม่สลับด้านเปิด `Ø15`
4. รู flip แต่ hardware ไม่ flip ตาม
5. ปุ่ม Transform กดแล้วไม่เกิดผล (เพราะ regen ทับ)
6. แกน `Ø10` / `Ø5` ไม่อยู่กลาง thickness ของ Top/Bottom

## เงื่อนไข “ถือว่าถูกต้อง” (Acceptance)

งาน Minifix + Dowel จะถือว่า “ผ่าน” เมื่อครบทุกข้อ:

1. รู CAM `Ø15`
- วงและ `X` อยู่หน้าไม้ถูกด้าน
- Vertical Flip แล้วข้ามไปอีกหน้าไม้จริง

2. Clockface CAM
- อยู่ด้านเดียวกับด้านเปิดรู `Ø15`
- ค่าเริ่มต้นตรงตามแบบที่ตกลง

3. แกน `Ø10` และ `Ø5`
- อยู่กึ่งกลางความหนาไม้ของ Top/Bottom ทุกมุม

4. รู + Hardware ผูกกัน
- Flip/Rotate/Move แล้วไปด้วยกันทุกครั้ง

5. ปุ่ม Transform
- Vertical Flip / Horizontal Flip / Rot / Move ทำงานจริง ไม่โดน regen ทับทันที

6. Pattern A/B
- จำนวนจุดและ spacing ตรง CAD
- Dowel เป็น `Ø8 x 30`

## วิธีใช้งานเอกสารนี้
- ใช้เป็น checklist ตรวจงานหลังแก้โค้ด
- ใช้เทียบอาการ regression ก่อนแก้
- ใช้เป็น baseline คุยร่วมกันระหว่าง dev / QA / ทีมหน้างาน


## ภาคเสริม (เพิ่มให้ครบ): กติกา Pattern แบบแยกด้าน A/B + Worked Example 600x395

ส่วนนี้เป็นข้อกำหนดที่ต้องถือเป็น baseline เพิ่มเติม (ไม่ใช่แค่เชิงอธิบาย)

### 1) ต้องแยก "ด้าน A" และ "ด้าน B" ใน generator ให้ชัด
- ด้าน A (ด้านยาว) และด้าน B (ด้านสั้น) ต้องถูกระบุใน context ของการ generate
- ห้ามตรวจเฉพาะ `sideLen >/< 400` แล้วสรุปแค่ "จำนวนจุด" เพราะอาจผ่าน count แต่ผิด composition/pattern slot

### 2) กติกาตามความยาวด้าน (Threshold Rule)
- `sideLen <= 400` -> `CORNER + CORNER`
- `sideLen > 400` -> `CORNER + MIDDLE + CORNER`

แต่ rule นี้ "ยังไม่พอ" ถ้า implementation ไม่กำหนดว่า `MIDDLE` คือชุดอะไร (Minifix-only หรือ Minifix+Dowel pair/set)

### 3) Worked Example (ต้องใช้เป็นตัวเทียบ regression)
สำหรับแผ่นอ้างอิง CAD `600 x 395`:
- `A = 600` -> `A > 400` -> ใช้ long-side pattern (`CORNER + MIDDLE + CORNER`)
- `B = 395` -> `B < 400` -> ใช้ short-side pattern (`CORNER + CORNER`)

เคสนี้สำคัญเพราะทดสอบทั้งสอง branch (ยาว/สั้น) ในชิ้นงานเดียวกัน

### 4) Pattern ต้องยึด "ลำดับระยะจากขอบ" (Edge Sequence) ไม่ใช่แค่จำนวนจุด
ตัวอย่าง long-side CAD intent:
- `37 / 32 / 199 / 32 / 199 / 32 / 37`

ระบบจะคำนวณเป็น coordinates รูปแบบใดก็ได้ แต่ผลลัพธ์ต้องเทียบเท่าลำดับนี้ และสมมาตรจากขอบทั้งสองด้าน

### 5) ความสัมพันธ์ Minifix + Dowel (Composition Rule)
- Dowel ไม่ใช่ของตกแต่งอิสระ ต้องเป็นส่วนหนึ่งของ pattern logic
- ต้องตรวจทั้ง:
  - จำนวนจุด (count)
  - ประเภทจุดในแต่ละ slot (Minifix / Dowel / pair)
  - ลำดับ slot ตาม CAD intent
- ระยะ c-c หลักที่ใช้ซ้ำคือ `32`

### 6) มิติอ้างอิงจากรูปตัด (Section Reference) ที่ต้องผูกกับการตีความ pattern
- มิติอ้างอิง Minifix: `24`
- ระยะอ้างอิง Minifix-Dowel: `32`
- แบบ CAD เก่าบางภาพอาจแสดง Dowel `Ø6 x 30`
- แต่ baseline ระบบที่ตกลงใช้คือ **`Ø8 x 30`**

### 7) อาการ regression ที่เกี่ยวกับกติกา A/B pattern โดยตรง
- จำนวนจุดต่อด้านถูก แต่ลำดับ/องค์ประกอบผิด (count pass แต่ pattern fail)
- ด้าน B (<400) ถูก generate เหมือนด้าน A (>400)
- Dowel โผล่ผิดจำนวน หรือผิด slot แม้ spacing หลักดูใกล้เคียง
