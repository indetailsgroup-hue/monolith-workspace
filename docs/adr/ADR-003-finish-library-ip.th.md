# ADR-003 — Canonical Finish Library และ Supplier-Native IP

- **สถานะ:** Proposed
- **วันที่:** 2026-07-19
- **อำนาจตัดสินใจ:** MONOLITH Platform Governance
- **เกี่ยวข้อง:** ADR-002 Component Master; ADR-001 Tenant Boundary

## บริบท

รหัส finish ของ supplier ไม่เป็นมาตรฐานกลางและทดแทนกันอย่างปลอดภัยไม่ได้ รหัสหนึ่งอาจหมายถึง coating, colour, substrate, texture, sheen หรือภาษาการตลาด ภาพ digital เปลี่ยนตามกล้อง profile จอ แสง และ compression จึงพิสูจน์ physical equivalence ไม่ได้ MONOLITH ต้องค้นและ configure ข้าม supplier ได้โดยไม่ลบอัตลักษณ์ supplier หรือคัดลอก artwork ที่มีสิทธิ์คุ้มครอง

## การตัดสินใจ

MONOLITH เป็นเจ้าของ **canonical finish taxonomy** และ map supplier-native finish โดยไม่แก้หรือลบรหัสดั้งเดิม

- Canonical record แสดง semantics ของวัสดุและ appearance
- Supplier record เก็บ supplier, collection, ชื่อ, code, SKU applicability, source, rights และ effective dates ตามทางการ
- Tenant overlay เก็บชื่อภายใน ราคา availability approval และ substitution เฉพาะ project
- Tenant/supplier เสนอ evidence ได้แต่แก้ canonical record โดยตรงไม่ได้

## Canonical appearance contract

Canonical finish อาจเก็บ:

- substrate/material family และ composition
- coating chemistry, layer build, cure และ repair class เมื่อทราบ
- CIELAB/LCh พร้อม illuminant, observer, instrument geometry, วันที่วัด และ sample ID
- colour-difference method และ tolerance ที่ประกาศชัด; ไม่รับค่า “Delta E” ที่ไม่บอกวิธี
- gloss value/geometry ตาม ISO 2813 เมื่อใช้ได้ โดย ISO 2813 ครอบคลุม coating ผิวเรียบ ทึบ และไม่ textured จึงแทนผิว textured ทุกชนิดไม่ได้ ([ISO 2813:2014](https://www.iso.org/standard/56807.html))
- texture/tactile descriptors และวิธีวัด
- wood species, cut, veneer match, grain direction, stain, batch/lot และ natural-variation class
- physical master-sample identity, custody, location, condition, calibration linkage และ revalidation
- digital asset colour profile, capture conditions, licence, checksum และ permitted use
- version, status, provenance, reviewer และ effective period

การคำนวณ CIELAB ต้องผูกกับบันทึก colourimetry ที่ใช้ รวม [ISO/CIE 11664-4:2019](https://www.iso.org/standard/74166.html) ค่า coordinate ที่ไม่มี measurement conditions เป็นหลักฐานไม่ครบ

## กติกา Mapping และ Substitution

1. Supplier finish map ไป canonical concepts ผ่าน mapping ที่มี version, confidence และ evidence class
2. Mapping ไม่ได้แปลว่าทดแทนทางกายภาพได้
3. Physical substitution ต้องผ่าน substrate, coating/performance envelope, colour tolerance ภายใต้เงื่อนไขที่ประกาศ, gloss/texture/grain, application constraints, sample approval และ tenant/project approval
4. ชื่อคล้าย RGB/HEX ภาพ render หรือ marketing category อย่างเดียวไม่พอ
5. วัสดุธรรมชาติหรือ batch-sensitive อาจเป็น finish family เดียวกันแต่ยังต้องคุม lot ต่อ project

## IP และ Rights

Supplier codes, trademarks, collection names, photos, scans, textures และ catalog layouts ยังเป็น supplier-native assets MONOLITH เก็บ identifier และ factual mapping/provenance แต่ไม่อ้าง ownership ของ supplier IP Asset record ต้องระบุ licence, permitted channel, expiry, territory และ attribution ส่วน taxonomy, measurement record, mapping logic และ original icon ของ MONOLITH อยู่ภายใต้ governance แยก

## Versioning

- Canonical finish ID เปลี่ยนไม่ได้
- Semantic/acceptance change ที่ breaking เพิ่ม major version
- Measurement/provenance ที่ไม่เปลี่ยนความหมายเพิ่ม minor version
- Correction เป็น patch เฉพาะเมื่อผล project ไม่เปลี่ยน
- Project pin taxonomy, mapping, supplier record, physical sample และ batch/lot version

## Migration และ Rollback

นำ supplier code เดิมเข้าเป็น native record ก่อน แล้ว map เมื่อมี evidence เท่านั้น Record ที่ยัง map ไม่ได้ใช้สถานะ `supplier_native_unmapped` และห้ามเดา Rollback ยกเลิกหรือ supersede mapping โดยรักษา supplier record และ project pin

## Ratification Gate

ADR นี้ยังเป็น Proposed จนกว่า:

1. Schema/validator ปฏิเสธ equivalence จากชื่อหรือภาพอย่างเดียว
2. Map อย่างน้อยสาม supplier โดยเก็บ native code และ rights metadata ครบ
3. สาธิต physical sample workflow, custody, measurement, tolerance และ revalidation
4. ทดสอบ metamerism/lighting review และ batch/lot exception กับตัวอย่างจริง
5. Legal review ยืนยันสิทธิ์เก็บและแสดง supplier assets
6. MONOLITH governance ratify; pilot tenant อนุมัติอย่างเดียวไม่พอ
