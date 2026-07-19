# ADR-005 — `MON-BS-001` Internal Boring and Drilling Profile

- **สถานะ:** Proposed
- **วันที่:** 2026-07-19
- **อำนาจตัดสินใจ:** MONOLITH Platform Governance พร้อม Manufacturing/Safety review
- **เกี่ยวข้อง:** ADR-002 Component Master; ADR-003 Finish Library

## บริบท

ระบบทำตู้ 32 mm เป็น de facto geometry convention ไม่ใช่มาตรฐาน geometry ของ ISO/EN/DIN ที่หลักฐานปัจจุบันพบ มาตรฐาน performance ของ furniture/hardware ตอบเรื่อง strength, durability, stability และ safety ไม่ได้กำหนด hole coordinates สากล การรอมาตรฐาน CEN/ISO ในอนาคตจะปล่อย CAD/CAM output ปัจจุบันโดยไม่มี governance

Primary-source corrections ปัจจุบัน ได้แก่:

- [ISO 4769:2022](https://www.iso.org/standard/80333.html) — vertical-axis furniture hinges, published
- [ISO 12808:2024](https://www.iso.org/standard/84112.html) — furniture extension elements/components, published
- [ISO 25131:2025](https://www.iso.org/standard/89083.html) — horizontal-axis hinges/stays, published
- [ISO 7170:2021](https://www.iso.org/standard/76864.html) — test methods สำหรับ strength, durability และ stability ของ storage unit ที่ประกอบแล้ว, published
- ISO 7171:2019 ถูกถอนและ revised by ISO 7170:2021 ห้ามแสดงเป็นมาตรฐานปัจจุบัน

## การตัดสินใจ

MONOLITH ประกาศ **`MON-BS-001`** เป็น internal interoperability profile ที่มี version ทันที และห้ามเรียกว่าเป็นมาตรฐาน ISO, EN, DIN, CEN, Blum, Hettich, Grass หรือ Häfele

## โครงสร้าง Profile

1. **Core reference system:** coordinate origin, panel faces, orientation, units, 32 mm pitch semantics, reference-line semantics และ hole-operation representation
2. **Generic profile:** nominal values ที่ reference engine ใช้ พร้อม provenance/tolerance ชัด ไม่อ้างว่า universal
3. **Supplier/series variants:** cup, plate, runner, connector, setback, depth, pitch และ tolerance ตาม technical source/revision ที่ระบุชื่อ
4. **Machine profiles:** tools, spindle/aggregate faces, datum, transforms, post-processor identity และ calibration evidence
5. **Project pin:** ทุก project pin profile ID/version, supplier series, machine profile และ post-processor version

## การแยก Safety และ Standards

Geometry conformance พิสูจน์เพียงว่า model/output ตรง profile ที่เลือก ไม่ได้พิสูจน์ hardware strength, cabinet stability, installation safety, machine safety หรือ ISO/EN performance compliance สิ่งเหล่านี้ต้องมี test evidence แยก Supplier technical instruction มีอำนาจเหนือ generic default สำหรับ series นั้น และ conflict ต้อง block manufacturing ห้าม reconcile เงียบ

## Versioning และ Change

- Major: coordinate, datum, face, tolerance หรือ transform เปลี่ยนจน machining เปลี่ยนได้
- Minor: เพิ่ม variant/tool metadata โดย output เดิมไม่เปลี่ยน
- Patch: แก้ provenance/ข้อความที่ไม่เปลี่ยน behavior
- Pinned project ห้าม auto-upgrade
- Deprecated profile ต้องยังอ่าน/reproduce ได้ การผลิตใหม่ต้อง explicit migration หรือ approved legacy exception

## Conformance Tests

Automated tests ขั้นต่ำต้องตรวจ origin, unit, pitch, sequence, diameter/depth, panel breakthrough, edge distance, profile/version identity, supplier-series compatibility, machine/tool availability, coordinate transforms และ deterministic checksum การ qualify โรงงานเพิ่ม calibrated coupon, first-article inspection และ sampled production checks

## Migration และ Rollback

กติกาเดิม `32mm-generic`, Blum, Hettich, Grass, Häfele และ machine-specific ต้องนำเข้าเป็น Proposed variants แยกพร้อม source revision ค่าที่ไม่ทราบคงเป็น unknown Rollback คืน profile/post-processor pin เดิมและสร้าง checksum ใหม่ ชิ้นที่เจาะแล้วต้อง quarantine เพื่อตรวจ ไม่ถือว่าย้อนกลับได้

## Ratification Gate

`MON-BS-001` ยังเป็น Proposed จนกว่า:

1. Machine-readable profile/schema validate
2. Seed 19 specs ที่ต้อง machining อ้าง compatible profile หรือประกาศ `any`/proprietary geometry ชัด
3. Golden coordinate/checksum tests ครอบคลุม connector, hinge, runner, shelf row และ proprietary-machine cases
4. Calibrated physical coupon และ first article อย่างน้อยหนึ่งชุดตรง tolerance ที่เลือก
5. Manufacturing/Safety authorities อนุมัติ; เอกสารหรือ software tests อย่างเดียว ratify production machining ไม่ได้
