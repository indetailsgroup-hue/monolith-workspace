# ADR-070 — Machine Onboarding: documented-profile first, bench verification ก่อนทำงานจริง

วันที่: 17 ก.ค. 2026
สถานะ: **ACCEPTED — OWNER DECISION**
ขอบเขต: Machine evidence catalog และ shadow implementation ของ MONOLITH
ไม่อยู่ในขอบเขต: การรับรองเครื่องจริง, production release หรือ real-cut authority

## บริบท

DAPH ต้องนำเครื่องหลายตัวเข้าระบบ การเก็บ nameplate, controller/HMI version, tool table, origin และ delivery channel จากหน้าเครื่องทุกตัวพร้อมกันไม่สามารถทำได้ในช่วงเริ่มพัฒนา Owner จึงส่งมอบ assessment และ owner-answered profile ของ KDT KN-2409LP ซึ่งประกาศสถานะ `NOT_ASSESSED`, `MANUFACTURING RELEASE: PROHIBITED` และ `machine_verification_pending` ไว้ในตัวเอกสารเอง

Source evidence ถูกเก็บแบบ exact bytes บน governance branch ที่ commit `765c326c2ea289d10688a4704a46335e60d6a152`:

- `docs/evidence/machines/kdt-kn-2409lp/assessment.html`
- `docs/evidence/machines/kdt-kn-2409lp/machine-profile.html`
- bilingual intake record และ SHA-256 manifest ในโฟลเดอร์เดียวกัน

## มติ

1. **Documented-profile first:** เครื่องเข้า evidence catalog ได้จากข้อมูลเอกสาร โดยทุกค่าต้องติด provenance ว่า confirmed, documented, verify-at-machine หรือ unknown ห้ามแทนค่าที่ไม่รู้ด้วย default
2. **Shadow implementation เดินต่อได้:** candidate profile ใช้พัฒนา generator, simulator, verifier และ operational workflow ได้ภายใต้ NFP/NO_CUT เท่านั้น
3. **Per-machine activation เป็นคนละ gate:** ก่อนทำงานจริง วิศวกรต้องอยู่หน้าเครื่องและยืนยัน machine identity/nameplate, controller/HMI และ version, postprocessor/import path, delivery channel, tool table, WCS/origin/axis mapping และ working envelope
4. **ต้องพิสูจน์ผล:** activation ต้องมี known-good job, simulation, dry-run/air-cut, first article และ human acceptance พร้อม evidence ที่ผูกกับ machine instance และ profile version/digest
5. **Fail closed:** จน activation ผ่านครบให้คง `manufacturing_release: PROHIBITED`, `automatic_machine_release: false`, `NO_CUT` และห้ามออก bare `PKT_OK`

## ผลต่อ CT-DEC-002

- Factory Owner อาจอนุมัติ `kdt_mvp_v1` contract สำหรับ **shadow implementation** โดยไม่อ้างว่าเครื่องจริง calibrate แล้ว
- FO-5 physical activation ยังคง **CONDITIONAL/PENDING** จนวิศวกรผ่าน gate หน้าเครื่อง
- ADR-070 ลำพังไม่อนุมัติ CT-DEC-002 และไม่ปลด Track B; Track B ปลดได้เมื่อ approval matrix S17-3 ครบตาม canonical spec
- แม้ Track B ปลดแล้ว การตัดจริงยังถูกบล็อกด้วย CT-DEC-002 §11.6 จน S17-1..5 ปิด, ADR-064 ครบ, dogfood เต็มสายอย่างน้อยหนึ่งงาน และมี calibrated machine profile

## Pattern สำหรับเครื่องถัดไป

ใช้ `docs/evidence/machines/<machine-id>/` โดยมีอย่างน้อย:

- source assessment และ source profile ที่เก็บ exact bytes
- bilingual intake record (TH/EN Markdown + HTML)
- SHA-256 manifest ที่ไม่ self-list
- activation record ภายหลัง ซึ่งระบุ engineer, timestamp, machine instance, profile version/digest, ผลแต่ละ gate และ evidence links

## Acceptance condition สำหรับ real-machine activation

สถานะเปลี่ยนจาก `PROHIBITED` ได้ต่อเมื่อ gate หน้าเครื่องผ่านทุกข้อและผู้มีอำนาจ Factory Owner รับผลของ machine instance นั้นโดยชัดแจ้ง ไม่มีการ inherit activation ข้ามเครื่อง แม้รุ่นเดียวกัน
