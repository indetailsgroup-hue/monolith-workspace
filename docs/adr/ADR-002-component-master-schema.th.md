# ADR-002 — โครงสร้าง Component Master สองชั้น

- **สถานะ:** Proposed
- **วันที่:** 2026-07-19
- **อำนาจตัดสินใจ:** MONOLITH Platform Owner, Architecture Authority และ Component Master Governance
- **Pilot ที่ให้คำปรึกษา:** Daph ให้หลักฐานด้าน workflow แต่ไม่มีอำนาจ ratify ระดับแพลตฟอร์มหรือเขียน canonical kernel
- **Bounded context:** Component Master
- **เกี่ยวข้อง:** ADR-001 Tenant Boundary; ADR-003 Finish Library IP; ADR-005 Boring Standard
- **เก็บต้นฉบับหลักฐานไว้ที่:** `All aboute kitchen/adr-002-component-master-schema.md`

## บริบท

การออกแบบครัวและตู้ต้องมีเจตนาเชิงหน้าที่ที่คงที่ ขณะที่งานจัดซื้อต้องใช้อะไหล่ผู้ผลิตจริง จำนวนบรรจุ สต็อก สัญญา และรุ่นแค็ตตาล็อกตามภูมิภาค หากรวมข้อมูลที่เปลี่ยนคนละจังหวะไว้ในรหัสเดียว การเปลี่ยน SKU ของ supplier ทุกครั้งจะกลายเป็นการเปลี่ยนแบบ การใช้ชื่อแบรนด์เป็นหมวด generic ยังลดความสามารถในการทำงานข้ามผู้ผลิตและเสี่ยงต่อการใช้เครื่องหมายการค้าไม่เหมาะสม

ADR-001 กำหนดนโยบาย tenant แล้ว ได้แก่ shared kernel ที่ MONOLITH เป็นเจ้าของ membership และ overlay ที่จำกัดตาม tenant, tenant context ที่มาจากการยืนยันตัวตน และการแยกทุก storage/execution plane ส่วน ADR-003 กำกับ identity ของ finish และทรัพย์สินทางปัญญาของ supplier และ ADR-005 กำกับ geometry การเจาะรวมถึง variant ของ supplier/เครื่องจักร

## มติ

MONOLITH ใช้ Component Master แบบสองชั้น

### ชั้นที่ 1 — Component Specification

ชั้นที่ 1 เก็บเจตนาการออกแบบ canonical ของ MONOLITH เป็นข้อมูล tenant-agnostic มี version, tenant อ่านได้แต่เขียนไม่ได้ และแก้ไขได้ผ่าน MONOLITH governance เท่านั้น

ทุก specification ต้องมี:

| Field | ความหมายที่บังคับ |
| --- | --- |
| `spec_id` | รหัสหน้าที่ที่ไม่เปลี่ยนและใช้คำ generic |
| `spec_version` | Semantic version ซึ่ง project ต้อง pin |
| `category` | หมวดควบคุมของ Component Master |
| `function_i18n` | คำอธิบายหน้าที่ ไม่ใช่ข้อความการตลาดของ supplier |
| `parameters` | ข้อจำกัดด้านแบบ การประกอบ โหลด วัสดุ และ interface ที่มี type |
| `boring_profile_refs` | อ้างอิง core/variant ของ `MON-BS-001` แบบมี version เมื่อมีงาน machining |
| `assembly_sequence` | ขั้นตอนเรียงลำดับพร้อมเครื่องมือ ความปลอดภัย และแหล่งหลักฐาน |
| `symbols` | รหัสสัญลักษณ์ที่กำกับแล้ว ไม่ฝัง artwork ที่ไม่มีสิทธิ์ |
| `substitutability_class` | ชั้นของตัวเลือกทดแทน ไม่ใช่หลักฐานว่าแทนกันได้อัตโนมัติ |
| `provenance` | แหล่ง รุ่น/วันที่ ตำแหน่งอ้างอิง สิทธิ์ และ evidence class |
| `governance_status` | `Proposed`, `Ratified`, `Deprecated` หรือ `Withdrawn` |

ชื่อ generic เป็น canonical ส่วนเครื่องหมายการค้าและชื่อสายผลิตภัณฑ์ของ supplier เป็น alias บน supplier record เท่านั้น ไม่เป็น canonical category

### ชั้นที่ 2 — Supplier SKU Instance

ชั้นที่ 2 เก็บสินค้าจริงเชิงพาณิชย์ของ specification ชั้นที่ 1 หนึ่งรายการ

| Field | ความหมายที่บังคับ |
| --- | --- |
| `sku_id` | รหัส supplier instance ที่ไม่เปลี่ยน |
| `spec_id` / `spec_version_range` | Foreign key และช่วง version ที่ประกาศว่าเข้ากันได้ |
| `supplier_id` | อ้างอิง Supplier Master |
| `manufacturer_part_no` | เลขอะไหล่ native ที่เก็บครบไม่สูญหาย |
| `supplier_finish_ref` | finish native ของ supplier ที่ map ตาม ADR-003 |
| `dimensions` / `tolerances` | ข้อมูลกายภาพที่มีแหล่งอ้างอิง |
| `pack_qty` / `order_unit` | ข้อเท็จจริงด้านบรรจุภัณฑ์และหน่วยสั่งซื้อ |
| `availability` | ความพร้อมจำหน่ายตามภูมิภาคและช่วงวันที่ |
| `provenance` | รุ่นเอกสาร ตำแหน่ง วันที่สืบค้น และสิทธิ์ |
| `lifecycle` | วันที่เริ่มใช้ เลิกผลิต ตัวทดแทน และวันที่ตรวจสอบล่าสุด |

ข้อเท็จจริงจาก public catalog ที่ได้รับอนุญาตอาจอยู่ใน shared catalog ที่กำกับแล้ว ส่วนราคาตามสัญญา MOQ ที่เจรจา supplier ที่ต้องการ การอนุมัติ และการเลือกระดับ project เป็น tenant overlay ตาม ADR-001 การลบ tenant จะลบ overlay ของ tenant แต่ไม่ลบ canonical specification หรือข้อเท็จจริง shared catalog ที่จัดเก็บได้โดยชอบ

## การ resolve และการทดแทน

1. งานออกแบบเลือกและ pin `spec_id` พร้อม version
2. Tenant policy สร้างรายการ SKU ที่ tenant นั้นมองเห็นและได้รับอนุญาต
3. Rules engine ตรวจมิติ boring วัสดุ โหลด finish กฎระเบียบ ภูมิภาค lifecycle เครื่องจักร และข้อจำกัด project
4. ต้องมีมนุษย์อนุมัติเมื่อ evidence class, tolerance, finish, ผลต่อความปลอดภัย หรือนโยบาย tenant กำหนด
5. BOM และเอกสารจัดซื้อ pin SKU กับ commercial snapshot ส่วน CAM pin boring/profile variant ที่แน่นอน ไม่อนุมานจาก specification generic

การมี `spec_id` เดียวกันหมายถึง “เป็นผู้สมัครให้ประเมินการทดแทน” ไม่ได้หมายถึง “เปลี่ยนแทนได้โดยไม่ตรวจ” ความต่างด้านรูเจาะ tolerance เครื่องจักร finish evidence โหลด หรือกฎระเบียบต้องขวาง silent substitution การเปลี่ยนข้าม `spec_id` เป็น design revision

## ความเป็นเจ้าของและขอบเขต tenant

- MONOLITH governance เท่านั้นที่สร้าง แก้ไข ratify deprecate หรือ withdraw canonical specification
- Supplier และ tenant ส่งหลักฐานหรือ mapping proposal ได้ แต่แก้ shared kernel โดยตรงไม่ได้
- Global identity ระบุตัวบุคคล ส่วน membership และ role ของ tenant อนุญาตการกระทำแต่ละครั้ง
- Customer profile, contract, ราคา preference, approval และ project selection เป็นข้อมูล tenant-local
- Daph เป็น pilot tenant ที่ให้คำปรึกษาหนึ่งราย ไม่มีสิทธิ์พิเศษระดับแพลตฟอร์ม
- การเข้าถึงของ support ใช้ break-glass-only ตาม ADR-001

## Version และ lifecycle

- การเปลี่ยนหน้าที่ การประกอบ geometry ความปลอดภัย หรือความหมายแบบ breaking ต้องเป็น major version ใหม่ หรือ `spec_id` ใหม่เมื่อ identity เปลี่ยน
- Metadata แบบ additive ใช้ minor version ได้ต่อเมื่อ interpretation และ output เดิมไม่เปลี่ยน
- การแก้คำผิดที่ไม่เปลี่ยนความหมายหรือ output ใช้ patch version พร้อมเหตุผลใน audit
- Project เดิมคง version ที่ pin ไว้ การ upgrade ต้องวิเคราะห์ผล สร้าง output ใหม่ และอนุมัติ
- Record ที่ Deprecated ยังอ่านและ reproduce ได้ แต่ค่าเริ่มต้นห้ามเลือกในงานใหม่

## Security, provenance และ IP

ทุก write ต้องบันทึก actor, authority, tenant context เมื่อเกี่ยวข้อง เหตุผล before/after hash หลักฐาน และเวลา ข้อความ รหัส เครื่องหมายการค้า รูป CAD texture และ layout แค็ตตาล็อกของ supplier ต้องเก็บ source identity กับข้อมูลสิทธิ์ การมี citation พิสูจน์ที่มาแต่ไม่ได้แปลว่ามีสิทธิ์เผยแพร่ซ้ำ ข้อมูล finish ใช้ ADR-003 และ geometry ใช้ ADR-005

## การย้ายข้อมูล

1. Copy source module และเอกสารเดิมเข้าสู่ package Component Master โดยไม่แก้ทับต้นฉบับหลักฐาน
2. Import record เป็น `Proposed` พร้อม evidence class; ค่าที่ไม่ทราบต้องคงเป็น unknown
3. Seed connector 15 specification ที่ Book 11 ระบุครบ และเพิ่ม hinge 2 กับ drawer runner 2 เป็น expansion record อย่างชัดเจน รวม 19 รายการ
4. Import supplier part เป็นชั้นที่ 2 เฉพาะเมื่อเก็บ native identity และ source anchor ครบ
5. Map ชื่อ model เดิมไปยัง candidate specification; ชื่อกำกวมเข้าคิว review
6. Pin version ใน sample project และเปรียบเทียบ BOM, CNC/CAM, การติดตั้ง และการจัดซื้อก่อน cutover

## Rollback

Rollback ต้องคืน catalog/version pin และ resolution policy เดิม ห้ามลบ audit history หรือ supplier-native record และ materialized project snapshot ต้อง reproduce ได้ การยุบสองชั้นหรือเปลี่ยน canonical ownership ต้องมี ADR ใหม่และ export ที่พิสูจน์ว่า specification, SKU, provenance, tenant overlay และ project pin ไม่สูญหาย

## ทางเลือกที่พิจารณา

### ใช้ Manufacturer SKU เป็น canonical identity — ปฏิเสธ

ทำให้ design intent ผูกกับการเปลี่ยนแค็ตตาล็อก supplier และไม่สามารถประเมินข้าม supplier อย่างมี governance

### Record เดียวพร้อม supplier alias — ปฏิเสธ

รวมข้อจำกัดเชิงหน้าที่ที่คงที่กับข้อมูลพาณิชย์ที่เปลี่ยนเร็ว และทำให้ผู้มีอำนาจด้าน version ไม่ชัด

### ใช้ชื่อ model เท่านั้น — ปฏิเสธ

ไม่เพียงพอสำหรับ validation, BOM, procurement, machining, substitution และ field service ที่ตรวจสอบย้อนกลับได้

## Gate การยอมรับและ ratification

ADR นี้คงสถานะ Proposed จนมีหลักฐานตรวจสอบย้อนหลังได้ครบ:

1. Schema และ validator ปฏิเสธ ID ผิดรูป version ไม่ถูก SKU กำพร้า มิติไม่มี type provenance ไม่ครบ และ substitution ที่ไม่ปลอดภัย
2. Seed 19 specification แรกกับ SKU ผ่าน test ด้านจำนวน ความไม่ซ้ำ foreign key provenance และ round-trip
3. ขยายเป็นอย่างน้อย 50 specification ครอบคลุม 8 หมวด และ 300 SKU จาก supplier อิสระอย่างน้อย 5 ราย; seed 19 รายการเพียงอย่างเดียวยังไม่ใช่หลักฐาน ratification
4. สาธิต substitution ข้าม supplier อย่างน้อยหนึ่งกรณีที่ผ่านและหนึ่งกรณีที่ถูกขวาง พร้อมหลักฐาน BOM/CAM ที่ควรคงเดิมหรือเปลี่ยนตามกรณี
5. Test isolation ตาม ADR-001 พิสูจน์ว่า tenant อ่านหรือแก้ overlay ของ tenant อื่นและ canonical kernel ไม่ได้
6. Finish mapping และ boring variant ผ่าน gate ของ ADR-003 และ ADR-005
7. Reviewer จาก procurement, design, manufacturing, installation, service, security/privacy และ legal/IP บันทึกผลกับความเสี่ยงคงค้าง
8. MONOLITH Platform Owner, Architecture Authority และ Component Master Governance เป็นผู้ ratify; การยอมรับของ pilot เป็นหลักฐานประกอบเท่านั้น

## การแทนที่ ADR

- **Supersedes:** ส่วนอำนาจตัดสินใจและ tenant policy ที่ยังไม่มี governing ADR ใน draft ต้นฉบับ โดยคงต้นฉบับไว้เป็นหลักฐานประวัติศาสตร์
- **Superseded by:** ไม่มี
- การเปลี่ยน schema, ownership หรือการยุบ layer ต้องมี ADR ใหม่พร้อม migration, rollback และการวิเคราะห์ผลต่อหลักฐาน

## สถานะหลักฐาน

| Claim | สถานะ ณ 2026-07-19 |
| --- | --- |
| มติสองชั้นและ governance | Owner อนุมัติมติและบันทึกเป็น Proposed |
| Dependency ADR-001/003/005 | Governing decision สถานะ Proposed |
| 19 specification แรก | Planned จนกว่าจะมี machine-readable data และ test |
| Production database, tenant enforcement และ hosted deployment | ไม่มีหลักฐาน / ยังไม่ implement |
| Daph workflow validation | ยังไม่มีบันทึก consultative evidence และไม่ใช่อำนาจ ratification |
