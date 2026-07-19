# แผนดำเนินการตั้งต้น MONOLITH Kitchen Knowledge Kernel

> **สำหรับผู้ปฏิบัติงานแบบ agentic:** ใช้ `subagent-driven-development` เฉพาะเมื่อเจ้าของอนุญาต subagent อย่างชัดเจน มิฉะนั้นให้ใช้ `executing-plans` ทีละงาน และติดตามด้วย checkbox

**เป้าหมาย:** ตั้งต้น MONOLITH monorepo ที่มี governance, บันทึก ADR-001/003/005 และ ADR-002 ฉบับแก้ไข, สร้าง seed Component Master 19 specs ที่ตรวจสอบได้ และส่งมอบ gap report สองภาษาระดับผู้บริหารโดยไม่อ้างความพร้อมเกินหลักฐาน

**จำนวนงานโดยประมาณ:** 8 | **เวลาโดยประมาณ:** ~240–360 นาที | **พื้นที่ที่แตะ:** Git / เอกสาร governance / Python package / JSONL data / tests / research evidence

## ปัญหาและสภาพปัจจุบัน

Workspace ยังไม่เป็น Git repository ข้อมูลครัวอยู่เป็นไฟล์ HTML, Markdown และ Python กระจัดกระจายใน `All aboute kitchen/` ADR-002 ยังเป็น Proposed และเรียก `tenant_policy` ทั้งที่ ADR-001 ยังไม่มี อีกทั้งให้ Daph ซึ่งเป็น pilot tenant มีอำนาจตัดสินใจระดับแพลตฟอร์ม Tests ปัจจุบันต้องใช้ `data/specs.jsonl` และ `data/skus.jsonl` แต่ไม่มีทั้งสองไฟล์ ผลรันสดจึงผ่าน 3 และล้ม 7 จาก 10 tests Book 11 กำหนด connector 15 specs อย่างชัดเจนและแยก hinge/drawer runner ออก ส่วนหัว Encyclopedia เขียนว่า 12 bounded contexts แต่ตารางมี 14 และ ADR-002 ต้องมี Component Master แยกต่างหาก

เนื้อหาครอบคลุมกว้าง แต่ยังขาดรายละเอียดที่มีนัยสำคัญด้าน tenancy, การวัด appearance ของ finish, มาตรฐาน ISO ปัจจุบัน, data governance, field commissioning, traceability, interoperability และหลักฐานปฏิบัติการ ผลจาก Perplexity ใช้เพื่อค้นหาเบาะแส ไม่ใช่อำนาจอ้างอิง; ข้อเท็จจริงสำคัญต้องตรวจซ้ำกับแหล่งปฐมภูมิ

## แนวทางที่เสนอ

สร้าง monorepo ขั้นต่ำที่มีโฟลเดอร์ bounded context และ Component Master package โดยรักษาไฟล์ต้นฉบับไว้เป็นหลักฐานและใช้วิธีคัดลอกแทนการแก้เงียบ บันทึก owner decisions ของ tenant, finish และ boring เป็น ADR ภาษาไทย/อังกฤษพร้อม HTML สร้าง seed connector 15 specs ตาม Book 11 บวก hinge 2 และ drawer runner 2 รวม 19 พร้อม supplier SKUs, provenance, boring profiles และ tests ประกาศ `MON-BS-001` เป็น internal interoperability profile ที่มี version โดยไม่กล่าวอ้างว่าเป็น ISO/EN และสร้าง gap report ที่แยก verified facts, owner decisions, proposals, unknowns และ contradictions

## เปรียบเทียบก่อนและหลัง

| สถานการณ์ | ก่อน | หลัง |
| --- | --- | --- |
| อำนาจของ repository | ไฟล์กระจัดกระจาย ไม่มี revision ของ Git | Git repository พร้อม context map, ADR, packages, tests และ revision trace |
| Tenant policy | dictionary ที่ยังไม่มี governance | ADR-001 แบบ Bridge และ tenant contract ที่ MONOLITH governance เป็นเจ้าของ |
| Finish identity | supplier codes โดยไม่มี canonical appearance model | canonical taxonomy ของ MONOLITH พร้อม mapping supplier-native แบบไม่สูญข้อมูล |
| Boring geometry | constants แบบ de facto โดยไม่มี profile กำกับ | `MON-BS-001` core และ supplier/machine variants ที่มี version |
| Component seed | ไม่มี JSONL และ 7/10 tests ล้ม | 19 specs ที่ valid, SKU FK ถูกต้อง และ tests ผ่าน |
| มาตรฐาน | เน้น EN และบางส่วนล้าสมัย | บันทึก ISO ปัจจุบัน รวม ISO 4769:2022, ISO 12808:2024, ISO 25131:2025 และ ISO 7171:2019 ที่ถูกถอน |
| Readiness claim | เอกสารอาจถูกเข้าใจผิดว่าเป็น runtime | มี evidence class ชัดและไม่อ้าง production/ratification หาก gate ยังไม่ผ่าน |

## สมมติฐานและความเสี่ยง

- **สมมติ:** ไฟล์ Encyclopedia ใน workspace และ Downloads เหมือนกัน; ตรวจ SHA-256 แล้วเป็น `561C0F6E7D5A0486913F476B46587A3F1A92B9F677C8E9201F36681A23719728`
- **สมมติ:** การตัดสินใจ ADR-001 จาก grill เป็น owner decisions แต่ยังไม่ใช่ runtime facts
- **สมมติ:** Context map มาตรฐานใช้ 14 contexts ที่ตารางระบุจริง บวก Component Master เป็น context ที่ 15 ตาม ADR-002
- **สมมติ:** Release นี้เป็น reference kernel ยังไม่สร้าง production database, IdP, KMS, billing หรือ hosted deployment
- **เสี่ยง:** เอกสาร supplier อาจเปลี่ยนหรือจำกัดสิทธิ์ใช้ ต้องรักษารหัส/URL เดิมแต่ไม่คัดลอก artwork หรือกล่าวอ้างสิทธิ์
- **เสี่ยง:** ค่า finish แบบ digital พิสูจน์การทดแทนทางกายภาพไม่ได้ ต้องมี physical master sample และ tolerance ที่วัดจริง
- **เสี่ยง:** System 32 variants อาจ pitch เท่ากันแต่ fixing geometry ต่าง ห้ามรวมเป็น universal pattern ที่ไม่จริง
- **เสี่ยง:** การ `git init` ทำให้ไฟล์เดิมของผู้ใช้ปรากฏเป็น untracked จึงห้าม stage/commit หากยังไม่ได้รับคำสั่ง

## ผลกระทบ

- แยกอำนาจแพลตฟอร์มออกจาก Daph และ tenant อื่นอย่างชัดเจน
- เปลี่ยนข้อความใน Book 11/12 ให้เป็น data contracts ที่ทดสอบได้
- สร้างฐานปลอดภัยสำหรับ database, CAD/CAM, procurement และ field service ในอนาคต
- ให้ผู้บริหารเห็นลำดับลงทุนตามความรุนแรงและหลักฐาน

---

## ภาพรวมงาน

> **สำหรับ implementation tasks:** ต้องใช้ `test-driven-development` ก่อนแก้ production code และทำ RED → GREEN → REFACTOR
> **ออกแบบแบบ parallel-first:** ระบุ lane ที่แยกกันได้ แต่ session นี้ทำตามลำดับจนกว่าเจ้าของจะอนุญาต subagents ห้ามทำ ADR, fixtures, generated HTML หรือ Git initialization พร้อมกัน

1. **ตั้งต้น repository และ context** — Lane A | ทำพร้อมกัน: ไม่มี | รอ: ไม่มี | TDD slice: ตรวจ docs/config → สร้าง Git/context skeleton → ตรวจ inventory
2. **ชุด Governance ADR** — Lane B | ทำพร้อมกัน: Task 7 หลัง Task 1 | รอ: Task 1 | TDD slice: decision checklist ที่ยังขาด → ADR สองภาษา → ตรวจ HTML/parity
3. **ฐาน Component Master package** — Lane C | ทำพร้อมกัน: ไม่มี | รอ: Task 1 | TDD slice: import/path tests ล้ม → package ที่คัดลอก → targeted tests
4. **Seed 19 specs และ supplier SKUs** — Lane C | ทำพร้อมกัน: ไม่มี | รอ: Task 3 | TDD slice: count/FK tests ล้ม → JSONL seed → catalog tests
5. **Finish taxonomy และ `MON-BS-001`** — Lane C | ทำพร้อมกัน: Task 7 | รอ: Tasks 2, 4 | TDD slice: behavior ยังไม่มี → schemas/validators → conformance tests
6. **Tenant-boundary executable contracts** — Lane D | ทำพร้อมกัน: Task 7 | รอ: Tasks 1, 2 | TDD slice: contract tests ล้ม → machine-readable fixtures → isolation matrix
7. **Multidimensional gap report ระดับผู้บริหาร** — Lane B | ทำพร้อมกัน: Tasks 3 หรือ 6 | รอ: Task 1 | TDD slice: evidence ledger → รายงาน TH/EN → citation/render checks
8. **Integrated verification และ implementation report** — ตามลำดับ | ทำพร้อมกัน: ไม่มี | รอ: Tasks 2–7 | TDD slice: evidence inventory → แก้เฉพาะ failure → verification report

---

### Task 1: ตั้งต้น Repository และ Context

**ไฟล์:** สร้าง `.gitignore`, `pyproject.toml`, `CONTEXT.md`, `CONTEXT-MAP.md`, `apps/.gitkeep`, bounded-context folders 15 ชุดโดยใช้ `.gitkeep` สำหรับ placeholder และให้ `CONTEXT-MAP.md` เป็นทะเบียนกลางจนกว่า context จะมี contract จริง รวมทั้งโฟลเดอร์ `docs/adr`, `docs/research`, `docs/reports`, `tests`, `data/component-master`

**การทำงานร่วมกัน:** ทำพร้อมงานอื่นไม่ได้; มี race risk ที่ Git initialization และ root paths

- [x] **Step 0:** เป็นงาน docs/config-only; ตรวจ path และยืนยันว่าไม่มี `.git`
- [x] **Step 1:** เก็บ inventory ก่อน bootstrap ด้วย `rg --files` และรักษา source artifacts
- [x] **Step 2:** `git init` และสร้าง 15 contexts: identity-tenancy, product-configuration, component-master, cad-parametric-design, geometry-kernel, bom-costing, manufacturing, workflow, procurement, quality-field-service, finance, customer-partner, ai-governance, platform-api, security-observability
- [x] **Step 3:** ตรวจ `git status --short --branch`, ให้ทุก context ปรากฏครั้งเดียวใน `CONTEXT-MAP.md` และไม่ commit/push

### Task 2: ชุด Governance ADR

**ไฟล์:** สร้าง ADR-001, ADR-002, ADR-003 และ ADR-005 เป็น `.en.md`, `.th.md`, `.en.html`, `.th.html` ใน `docs/adr/` และรักษา `All aboute kitchen/adr-002-component-master-schema.md` เป็น evidence source

**การทำงานร่วมกัน:** ทำร่วม Task 7 ได้หลัง evidence ledger คงที่; ต้องรอ Task 1; ระวัง cross-reference และชื่อ HTML

- [x] **Step 0:** docs-only exception; ตรวจด้วยโครงสร้างและหลักฐาน
- [x] **Step 1:** สร้าง decision checklist ที่ต้องพบว่า ADR ปัจจุบันยังขาด Bridge, membership, tenant-local profile, break-glass, 7/30/90, RPO/RTO, RLS role red lines, keys, home region และ separation of duties
- [x] **Step 2:** เขียน TH/EN ให้ aligned, สถานะ Proposed, แยก owner decision จาก implementation evidence และถอด Daph ออกจาก ratification authority
- [x] **Step 3:** Render HTML standalone และตรวจ title/lang/headings/tables/links
- [x] **Step 4:** ใช้ `rg` ตรวจ decisions ทุกข้อ ให้ Daph เป็น consulted pilot เท่านั้น และมีครบ 4 ไฟล์ต่อ ADR

### Task 3: ฐาน Component Master Package

**ไฟล์:** สร้าง package ที่ `packages/component-master/` พร้อม `catalog.py`, `boring.py`, `validators.py`, `__init__.py`, package config และ `tests/component_master/test_catalog_baseline.py`; คัดลอกจาก reference files โดยไม่แก้ต้นฉบับ

**การทำงานร่วมกัน:** ต้องรอ Task 1 และไม่ทำพร้อม seed fixtures

- [x] **Step 0:** ใช้ `test-driven-development`
- [x] **Step 1:** เขียน failing import/data-path tests ให้ path ไม่ขึ้นกับ working directory
- [x] **Step 2:** รันด้วย bundled Python + `unittest`; ต้องล้มเพราะ behavior ขาด ไม่ใช่ dependency
- [x] **Step 3:** คัดลอกและปรับเฉพาะ imports/path handling ที่จำเป็น ไม่สร้าง database abstraction
- [x] **Step 4:** รัน targeted tests และ compile modules ให้ผ่าน
- [x] **Step 5:** refactor หลัง green เท่านั้น และรักษา evidence files เดิม

### Task 4: Seed 19 Specs และ Supplier SKUs

**ไฟล์:** สร้าง `data/component-master/specs.jsonl`, `skus.jsonl`, `boring-profiles.jsonl`, `tests/component_master/test_seed_integrity.py` และปรับ catalog เฉพาะที่จำเป็น

**การทำงานร่วมกัน:** ต้องรอ Task 3; JSONL และ counts เป็น shared state

- [x] **Step 0:** ใช้ `test-driven-development`
- [x] **Step 1:** เขียน tests ให้ต้องมี 19 unique specs: connector 15 ตาม Book 11, hinge 2, drawer runner 2 พร้อม category count, semver, provenance, unique SKU และ valid FK
- [x] **Step 2:** รันให้ RED เพราะไฟล์ยังไม่มี/จำนวนไม่ครบ
- [x] **Step 3:** สร้าง seed ขั้นต่ำ ใช้ functional generic IDs เก็บ trademark ใน SKU/model เท่านั้น ทุก record เป็น Proposed และ evidence เป็น Verified/Reported/Unknown ตามจริง
- [x] **Step 4:** รัน integrity, resolution, substitution rejection และ boring lookup ให้ GREEN
- [x] **Step 5:** ลดความซ้ำเฉพาะเมื่อ tests ยังผ่านและ JSONL ยัง review ได้ทีละบรรทัด

### Task 5: Finish Taxonomy และ `MON-BS-001`

**ไฟล์:** สร้าง `finishes.py`, `finish-taxonomy.jsonl`, `finish-mappings.jsonl`, `boring-standards/MON-BS-001.json` และ tests ของ finish/boring

**การทำงานร่วมกัน:** ทำร่วม Task 7 ได้; ต้องรอ Tasks 2 และ 4; ระวัง Component Master schema/ADR IDs

- [x] **Step 0:** ใช้ `test-driven-development`
- [x] **Step 1:** เขียน safety tests ที่ปฏิเสธ finish equivalence จากชื่อ/ภาพอย่างเดียว และปฏิเสธ profile/version mismatch
- [x] **Step 2:** รัน RED เพราะ validators/profile ยังไม่มี
- [x] **Step 3:** เก็บ CIELAB/LCh, illuminant/observer, ΔE method/tolerance, ISO 2813 geometry, texture/grain/batch, rights/provenance และสร้าง MON-BS-001 core + named variants พร้อม non-safety disclaimer
- [x] **Step 4:** รันให้ valid mapping ผ่าน, unsafe substitution ล้ม, pitch 32 mm ถูกต้อง และ project pin ป้องกัน silent upgrade
- [x] **Step 5:** รักษา supplier-native mapping โดยไม่ normalize จนข้อมูลสูญหาย

### Task 6: Tenant-Boundary Executable Contracts

**สถานะ:** เสร็จด้วยหลักฐานจาก contract fixtures โดยไม่กล่าวอ้างว่ามีการบังคับใช้ใน runtime แล้ว

**ไฟล์:** สร้าง `tenant-boundary.schema.json`, `isolation-test-matrix.json`, README ของ identity-tenancy และ `tests/identity_tenancy/test_contracts.py`

**การทำงานร่วมกัน:** ทำร่วม Task 7 ได้; ต้องรอ Tasks 1 และ 2; ระวังคำศัพท์ใน ADR

- [x] **Step 0:** ใช้ `test-driven-development`; ทดสอบ contract โดยไม่สร้าง database ปลอม
- [x] **Step 1:** เขียน tests ที่บังคับ Bridge, active tenant เดียว, authenticated membership, tenant scope ใน storage/cache/job/event/webhook, break-glass metadata, home region, key identity, deadlines, RPO/RTO และ ratification roles
- [x] **Step 2:** รัน RED เพราะ fixtures ยังไม่มี
- [x] **Step 3:** เพิ่ม machine-readable contracts และ negative matrix สำหรับ tenant A พยายามอ่าน/เขียน/file/job ของ tenant B
- [x] **Step 4:** รัน schema parsing และ decision checklist ให้ครอบคลุม 100%
- [x] **Step 5:** ระบุชัดว่า runtime RLS/KMS/restore เป็นงานอนาคต ไม่อ้างว่ามีจริง

### Task 7: Multidimensional Gap Report ระดับผู้บริหาร

**สถานะ:** เสร็จแล้ว — รายงานไทย/อังกฤษสอดคล้องกัน Render แล้ว และผ่านการตรวจโครงสร้าง

**ไฟล์:** สร้าง `docs/research/2026-07-19-kitchen-master-gap-analysis.en.md`, `.th.md`, `.en.html`, `.th.html`

**การทำงานร่วมกัน:** ทำร่วม Task 3 หรือ 6 ได้; ต้องรอ Task 1; ระวัง citations/terminology ร่วม ADR

- [x] **Step 0:** docs-only exception; ตรวจ evidence classification, parity, citations และ render
- [x] **Step 1:** สร้าง ledger ด้วย VERIFIED FACT, OWNER DECISION, INFERENCE, PROPOSAL, UNKNOWN, CONTRADICTED พร้อม local line และ primary source; Perplexity เป็น discovery จนกว่าจะ verify
- [x] **Step 2:** ครอบคลุม products/modules, sizes/heights, hardware, finishes, boring, manufacturing, installation, MEP, safety, accessibility, procurement, quality, traceability, sustainability, BIM/PIM, service design, ethical retention, AI, tenancy, economics, organization และ ecosystem
- [x] **Step 3:** เรียง B0/B1/B2/B3 พร้อม decision, owner, dependency, evidence gap และ acceptance criteria; เปลี่ยนเป้าหมาย “หยุดใช้ไม่ได้” เป็น trustworthy indispensability, portability และ excellent service
- [x] **Step 4:** Render HTML และตรวจ heading topology/decision tables/citations/risk labels ให้ TH/EN ตรงกัน

### Task 8: Integrated Verification และ Implementation Report

**สถานะ:** เสร็จแล้ว — ซ่อม findings จาก outsider review และเผยแพร่หลักฐานกับ handoff สองภาษาครบ

**ไฟล์:** สร้าง implementation report TH/EN Markdown+HTML ใน `docs/reports/` และ `artifacts/verification/kitchen-kernel-bootstrap-summary.json`

**การทำงานร่วมกัน:** ต้องรอ Tasks 2–7 และทำตามลำดับ

- [x] **Step 0:** ใช้ `verification-before-completion`
- [x] **Step 1:** รัน `unittest`, compile, JSON/JSONL parsing, exact counts, ADR checks, bilingual pairs, standalone HTML, git status และ secret scan
- [x] **Step 2:** แก้เฉพาะ failure ที่พิสูจน์ได้และรันคำสั่งเดิมซ้ำ
- [x] **Step 3:** บันทึก command, timestamp, exit code, totals, paths และ limitations เป็น JSON
- [x] **Step 4:** เขียน report สองภาษา แยกสิ่งที่สร้างจริง/เสนอ/ยังไม่ implement และไม่อ้าง production/ratification
- [x] **Step 5:** ตรวจ output ครบไม่ถูกตัด และแยก `git init` ออกจาก commit/push อย่างชัดเจน
