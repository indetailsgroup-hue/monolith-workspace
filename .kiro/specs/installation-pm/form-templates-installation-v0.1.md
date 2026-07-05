# Form Templates — Installation Checklists v0.1 (draft)

> **ที่มา:** `New folder/Installation.xlsx` (2020-10-03) sheet "Installation" + ยืนยันซ้ำใน `สำหรับคุณชุ.xlsx` (2025-07-03 — เนื้อหาเดียวกันเกือบคำต่อคำ = SOP นิ่ง ใช้จริง 5 ปี)
> **Correction จาก owner (5 ก.ค. 2026):** **P1/P2/P3 = ช่างคนที่ 1/2/3** (เลนงานขนานต่อคน) — ไม่ใช่เฟสตามลำดับ; sheet ตารางรายวัน (time-box 15 นาที) คือเลนของช่างแต่ละคนในวันเดียวกัน
> **สถานะ:** draft รอ review กับหัวหน้าทีม Installation ก่อน seed เป็น `form_templates` จริง (tasks Phase 1.1/1.6) — โดยเฉพาะรายการที่ mark ⚠ (ข้อมูลสองไฟล์ไม่ตรงกันเล็กน้อย)

## โมเดล (owner ยืนยัน 5 ก.ค. 2026)

- **Staffing:** ห้องละ **3 ช่าง** — คนละ 1 เลน (ช่าง 1/2/3 ตาม checklist) ทุกห้องทำ**ขนานกัน** + **หัวหน้างาน 1 คนต่อบ้าน** คุมทุกห้อง
  ตัวอย่างจริง: บ้าน 5 ห้อง = 5×3 ช่าง + หัวหน้า 1 = **16 คน**
- Template = **ต่อประเภทห้อง × เลนช่าง** — เปิดห้องหนึ่ง = สร้าง subtask 3 เลน มอบ assignee ช่างจริงคนละเลน
- **บทบาทหัวหน้างาน:** ติ๊ก T0 site-readiness + เป็น approver start/finish ของ work item (= "หัวหน้าทีม Installation" ใน workflow spec) + รับ escalation จากทุกห้อง
- **กติกาความคืบหน้า:** ห้องเสร็จ = ทุกเลนของห้องนั้นติ๊กครบ + ถ่ายรูป **Wrapping** เข้า capture `installation_proof` (ทุกเลนจบด้วย ทำความสะอาด → Wrapping = จุดถ่ายรูปธรรมชาติ); บ้านเสร็จ = ทุกห้องเสร็จ → เข้าสถานะ customer_review (ลูกค้าอนุมัติผ่าน LINE)
- เลนของห้องครัวเป็นชุดเต็ม (มี Top, ประปา, เช็คหน้าบาน) — ห้องอื่นใช้ชุดเดียวกันตัดรายการครัวออก
- ทุก template: org-scoped, versioned, immutable หลัง publish (requirements Req 5)

## T0 — Site Readiness (ก่อนเริ่มติดตั้ง — ผูกกับ work item start)

จาก "รับเอกสารข้อมูล Production plan" — ใช้เป็น checklist ที่**หัวหน้าทีม Installation ต้องยืนยันก่อน approve เริ่มงาน** (workflow Req: Installation start → approver หัวหน้าทีม):

```json
{ "key": "inst_site_readiness", "version": 1, "items": [
  "Check all area 3D final จาก Production Planning",
  "Floor checking", "Defect checking", "Electricity checking",
  "Water supply system", "Wall checking", "Door checking", "Ceiling checking"
] }
```

## T1 — ครัว (applies_to: master_kitchen, kitchen)

```json
{ "key": "inst_kitchen_tech1", "applies_to": ["master_kitchen","kitchen"], "lane": "ช่างคนที่ 1", "version": 1, "items": [
  "เช็คพื้น", "ตรวจสอบ Defect", "ตรวจสอบฝ้า",
  "ประกอบอลูมิเนียม", "ติดตั้งอลูมิเนียม",
  "ตรวจสอบขนาดตู้", "จัดตู้วางตำแหน่งแต่ละจุด", "ติดตั้งผนังระหว่างตู้",
  "ติดตั้งงาน Top", "ติดตั้งอุปกรณ์ภายในตู้", "ระบบไฟฟ้า",
  "เก็บงานซิลิโคน", "ตรวจสอบหน้าบานให้เรียบร้อย",
  "ทำความสะอาด", "Wrapping 📷"
] }
```

```json
{ "key": "inst_kitchen_tech2", "applies_to": ["master_kitchen","kitchen"], "lane": "ช่างคนที่ 2", "version": 1, "items": [
  "ไฟฟ้าผนัง", "ระบบน้ำประปา", "ตรวจสอบผนัง", "ตรวจสอบประตู",
  "ประกอบอลูมิเนียม", "ติดตั้งอลูมิเนียม", "ติดตั้งตู้",
  "จัดตู้วางตำแหน่งแต่ละจุด", "ติดตั้งผนังระหว่างตู้", "ติดตั้งงาน Top",
  "ติดตั้งอุปกรณ์ภายในตู้", "ระบบไฟฟ้าภายในตู้",
  "เก็บงานซิลิโคน", "ตรวจสอบระบบไฟอีกรอบ",
  "ทำความสะอาด", "Wrapping 📷"
] }
```

```json
{ "key": "inst_kitchen_tech3", "applies_to": ["master_kitchen","kitchen"], "lane": "ช่างคนที่ 3", "version": 1, "items": [
  "Check point of measure", "Offset point", "Point of x=0,y=0",
  "ตรวจสอบขนาดอลูมิเนียม", "ประกอบอลูมิเนียม", "ติดตั้งอลูมิเนียม",
  "ติดตั้งตู้", "ปรับประตูตู้", "ติดตั้งงาน Top",
  "ระบบน้ำประปา", "เก็บงานฝ้า", "เก็บงานซิลิโคน TOP",
  "เช็คอุปกรณ์ภายในตู้", "ทำความสะอาด", "Wrapping 📷"
] }
```

## T2 — ห้องทั่วไป (applies_to: living, home_office, office, master_bedroom, bedroom_2, bedroom_3)

```json
{ "key": "inst_room_tech1", "lane": "ช่างคนที่ 1", "version": 1, "items": [
  "เช็คพื้น", "ตรวจสอบ Defect", "ตรวจสอบฝ้า",
  "ประกอบอลูมิเนียม", "ติดตั้งอลูมิเนียม",
  "ตรวจสอบขนาดตู้", "จัดตู้วางตำแหน่งแต่ละจุด", "ติดตั้งผนังระหว่างตู้",
  "ติดตั้งอุปกรณ์ภายในตู้", "ระบบไฟฟ้า",
  "เก็บงานซิลิโคน", "ทำความสะอาด", "Wrapping 📷"
] }
```

```json
{ "key": "inst_room_tech2", "lane": "ช่างคนที่ 2", "version": 1, "items": [
  "ไฟฟ้าผนัง", "ตรวจสอบผนัง", "ตรวจสอบประตู",
  "ประกอบอลูมิเนียม", "ติดตั้งอลูมิเนียม", "ติดตั้งตู้",
  "จัดตู้วางตำแหน่งแต่ละจุด", "ติดตั้งผนังระหว่างตู้",
  "ติดตั้งอุปกรณ์ภายในตู้", "ระบบไฟฟ้าภายในตู้",
  "เก็บงานซิลิโคน", "ทำความสะอาด", "Wrapping 📷"
] }
```
⚠ home_office เลนช่าง 2: ไฟล์ระบุ "ระบบน้ำประปา" เพิ่มด้วย (แถว 156) — ยืนยันกับหัวหน้าทีมว่า home office มีงานประปาจริงไหม (เช่น pantry) แล้วค่อยแตก variant

```json
{ "key": "inst_room_tech3", "lane": "ช่างคนที่ 3", "version": 1, "items": [
  "Check point of measure", "Offset point", "Point of x=0,y=0",
  "ตรวจสอบขนาดอลูมิเนียม", "ประกอบอลูมิเนียม", "ติดตั้งอลูมิเนียม",
  "ติดตั้งตู้", "ปรับประตูตู้", "เก็บงานฝ้า",
  "ตรวจสอบประตูตู้อีกรอบ", "ตรวจสอบระบบไฟอีกรอบ",
  "เช็คอุปกรณ์ภายในตู้", "ทำความสะอาด", "Wrapping 📷"
] }
```

## การใช้ใน MVP (โยงกับ spec)

1. **T0** render ตอน work item ขั้น Installation จะ start — หัวหน้าทีมติ๊กครบ → approve start (workflow flow เดิม)
2. เปิดห้องหนึ่งใน installation project → สร้าง subtask 3 เลนจาก template ตามประเภทห้อง มอบ assignee ช่างจริงต่อเลน (`installation_tasks` — D-11: subtask ครบ ≠ ปิด work item)
3. ทุกเลนจบด้วย Wrapping 📷 → PWA/LINE ถ่ายรูปเข้า capture `installation_proof` → verified → commit ปิด work item (0063)
4. ตาราง time-box 15 นาที (sheet 2) = มุมมอง daily plan — **Phase 3** (MVP แสดงแค่รายการวันนี้ต่อช่าง)
5. รายการเหล่านี้ยังใช้เป็นแหล่ง**ชื่อรูปมาตรฐาน** ได้ (รูปผูก checklist item → ค้นย้อนหลังได้ว่า "รูปติดตั้ง Top ครัว" อยู่ไหน)

## สิ่งที่ต้องยืนยันกับหน้างานก่อน seed จริง

- ⚠ home_office ประปา (ด้านบน) · การสะกด "เพลส/Wraping/เก็นงาน" ในไฟล์ต้นทาง — draft นี้ normalize แล้ว
- ~~ทีม 5 คนแต่ checklist มี 3 เลน~~ → ✅ **ตอบแล้ว (owner):** ห้องละ 3 ช่างคนละเลน ขนานทุกห้อง + หัวหน้างาน 1/บ้าน (บ้าน 5 ห้อง = 16 คน) — เลข "5" ในไฟล์เป็น manpower planning ต่อแผนก ไม่ใช่ crew ต่อห้อง
- Bed Room 2/3 checklist เหมือนกันทุกข้อ — ยุบเป็น bedroom เดียว (ทำแล้วใน T2) โอเคไหม
