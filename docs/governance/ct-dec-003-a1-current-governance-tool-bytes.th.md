# CT-DEC-003-A1 — Tooling Bytes ปัจจุบันและการจัดชั้น Governance Tool

วันที่มีผล: 2026-07-15  
สถานะ: **RECORDED — คำสั่งติดตามจาก Tech Lead ที่เป็นมนุษย์**  
Record ก่อนหน้า: `CT-DEC-003 — S17 Tooling, Ownership และ Append-Only Record Discipline` (2026-07-11)  
ขอบเขตที่ supersede: **เฉพาะ hashes และ tooling classification ใน CT-DEC-003 §4.2**  
อำนาจมติ: Tech Lead (Dave) ตามคำสั่งใน review session วันที่ 2026-07-15  
ผู้จัดทำเอกสารและ independent advisory source review: Codex โดยไม่ลงชื่อและไม่มีอำนาจอนุมัติ  
Technical baseline ที่ตรวจ: `077452a7cbe8714ed5ac3ed388420565bc19f252` รวม control pack S17 v0.4.1 ที่ยังไม่ commit

> Addendum นี้ทำ append-only classification ของ governance-tool bytes ชุดที่ใช้กับ review artifacts v0.4.1 ให้ครบ โดยไม่อนุมัติ CT-DEC-002, ไม่เซ็นบทบาท S17 ใด, ไม่ปลด Track B, ไม่ปิด P0 blocker, ไม่อนุญาต production deployment และไม่อนุญาตตัดจริง

## 1. เหตุผลที่ต้องมี addendum

CT-DEC-003 บันทึก candidate hashes จาก governance revision ก่อนหน้า Renderer ยังตรง byte กับ candidate ที่บันทึกไว้ แต่ writer, verifier และ test harness เปลี่ยนระหว่าง remediation รอบต่อมา ห้าม rewrite decision record เดิมแบบเงียบ Addendum นี้จึงบันทึก bytes ปัจจุบัน, review evidence, classification และ boundary ที่ไม่เปลี่ยน

Document manifest เดิมของ CT-DEC-003 ยัง valid โดยมี SHA-256:

```text
a586d2414006581af8323d7173af3066ccf803ac4ae37ef9ee7b06de832fb81b  docs/governance/ct-dec-003-s17-tooling-and-record-discipline.sha256
```

## 2. Tool bytes ที่ตรวจแล้วแบบ exact

```text
d7e05ddc8ef3b7e5e56c7b68a07adf5555f0366bb9e2c7a6f00796b7487c198a  scripts/render-standalone-markdown.mjs
3cd69ca33cfc1fec7657fd0a242668f24706f38ba52b27be7021579d8e58a584  scripts/write-sha256-manifest.mjs
9fbbf53519a2d45e3298a5d7d7e7b0df6481396b40a440cd707206b359ea2cb8  scripts/verify-sha256-manifest.mjs
cef610700abc1e17258373b99cd0243c757407cfd75f92e6ddbf1e0b07fe8093  scripts/governance-tooling.test.mjs
```

ไฟล์ `monolith-ct-dec-003-a1-review-input.sha256` ที่ repository root pin bytes เหล่านี้ร่วมกับ addendum โดย anchor ไม่ list ตัวเอง

`monolith-s17-v041-review-input.sha256` ยังคงเป็น historical anchor ที่สร้างเมื่อ 2026-07-15 19:20 +07:00 หลังจากนั้น CT-DEC-002 checklist bytes ถูก update และมี current four-file manifest ของตัวเองที่ valid จึงห้ามอ้าง historical v0.4.1 aggregate ว่าเป็น aggregate ของ working tree รุ่นหลัง Addendum นี้ไม่ rewrite anchor เดิม โดย A1 anchor ใหม่ทำหน้าที่เป็น consolidated current-byte anchor

## 3. Independent advisory source review

Source review ยืนยัน controls ต่อไปนี้สำหรับขอบเขต governance document แบบจำกัด:

1. writer รับเฉพาะ regular non-symlink file ที่อยู่ใน manifest directory
2. writer output ห้ามเป็น symlink, ห้าม resolve ออกนอก directory และห้าม list ตัวเอง
3. canonical path ต้องเป็น NFC, relative, slash-separated, Windows-safe, ไม่มี control character และ reject empty/dot/dot-dot segment
4. reject duplicate และ case-fold-colliding entry
5. sort entry ตาม unsigned UTF-8 byte order
6. verifier reject BOM, CR/CRLF, blank line, malformed entry, digest ที่ไม่ใช่ lowercase 64-hex, non-canonical path, duplicate, unsorted entry, symlink, traversal, self-reference และ digest mismatch
7. renderer escape HTML, reject unsafe link หรือ link ที่มี control character, อนุญาตเฉพาะ HTTP(S)/mailto, รักษา literal legacy token และ reject unclosed fence

Residual limits ระบุชัด: tools เหล่านี้ไม่ให้ signer authenticity, ไม่ป้องกัน hostile process ที่เปลี่ยนไฟล์ระหว่าง local read race, ไม่ parse packet schema หรือ ZIP container และไม่ทำ KMS signature verification

## 4. Evidence ที่ reproduce แล้ว

วันที่ 2026-07-15 dedicated Node test command ให้ผล:

```text
tests 5
pass 5
fail 0
```

Suite ที่ reproduce ครอบคลุม canonical nested path และ negative cases ของ outside-root input, duplicate, traversal, blank line, CRLF, Windows-invalid path, unsorted entry, symlink input/output/manifest alias, unsafe link, control-character link, token collision และ unclosed fence

ก่อนสร้าง addendum นี้ document manifest เดิมสี่ไฟล์ของ CT-DEC-003 verify ผ่าน 4/4 ด้วย

Recursive verification พบ legacy manifests สามชุดที่ digest ถูกต้องแต่ entry order เกิดก่อนกฎ unsigned-UTF-8 ordering ปัจจุบัน ได้แก่ CT-DEC-001, complete PRD และ PRD v5 review จึง re-emit เฉพาะ manifest ordering แบบ mechanical โดยไม่เปลี่ยน listed document bytes หรือ normative text ใด A1 consolidated anchor pin canonical current manifests ส่วน historical v0.4.1 anchor ยังคงไม่ถูกแก้

## 5. Official classification แบบจำกัด

| Tool | Classification จาก addendum นี้ | Boundary ที่อนุญาต |
|---|---|---|
| `render-standalone-markdown.mjs` | **OFFICIAL — GOVERNANCE DOCUMENT TOOLING** | trusted repository Markdown ไป standalone HTML เท่านั้น |
| `write-sha256-manifest.mjs` | **OFFICIAL — GOVERNANCE DOCUMENT TOOLING** | SHA-256 manifest สำหรับ repository governance/review artifacts เท่านั้น |
| `verify-sha256-manifest.mjs` | **OFFICIAL — GOVERNANCE DOCUMENT TOOLING** | ตรวจ byte integrity ของ manifest ข้างต้นเท่านั้น |
| `governance-tooling.test.mjs` | **OFFICIAL — GOVERNANCE TOOLING TEST HARNESS** | regression evidence ของสาม scripts เท่านั้น |

Classification นี้ผูกกับ exact hashes ใน §2 เท่านั้น ถ้า byte ใดเปลี่ยน tool ที่เปลี่ยนจะกลับเป็น **CANDIDATE — NOT OFFICIAL** จนมี append-only review record รอบถัดไป pin และ classify ใหม่

## 6. สิ่งที่ห้ามถือว่าเทียบเท่า

`verify-sha256-manifest.mjs` ไม่ใช่ S17-5 factory packet verifier โดยเฉพาะอย่างยิ่ง มันไม่ทำ:

- packet schema-bundle validation
- NFP precedence หรือ stable packet result-code evaluation
- authoritative registry lookup หรือ revocation check
- ECDSA P-256 raw `r||s` validation หรือ low-S rejection
- AWS KMS public-key trust evaluation
- verifier-order enforcement ของ factory packet
- operational disposition หรือ machine admission

ผลจาก governance tools เหล่านี้ห้าม emit หรือสื่อความหมายเป็น bare `PKT_OK`, `CUT`, production readiness หรือ approval authority

## 7. Authority boundaries ที่ไม่เปลี่ยน

- CT-DEC-002 ยัง DRAFT และ approval roles ทั้งสามยัง PENDING
- Track B ยัง LOCKED
- shadow mode ยังคง `PKT_OK_SHADOW_ONLY / VERIFIED_SHADOW_ONLY / NO_CUT`
- ไม่มี P0 blocker ใดถูกปิด
- ADR-064 และทุกเงื่อนไขของ real-cut gate ยังต้องครบ
- S17 v0.4.1 ยังเป็น review artifact ไม่ใช่ implementation authority
- dogfood จริงยัง `AUTHORIZED/PREPARED — NOT STARTED` จน project จริง emit immutable evidence event แรก

## 8. ผลต่อ finding ใน full-system scrutiny

Addendum นี้ remediate `FS-B1-06` สำหรับ exact current governance-tool bytes ด้วย append-only classification และ evidence anchor ที่ขาดอยู่ แต่ไม่ remediate `FS-B1-02`: ยังต้องแก้การแยก root Vitest/Node-test runner และ CI workflow wiring

Record นี้ไม่มี cryptographic human signature โดยเก็บ human follow-up direction และ exact reviewed bytes ส่วน approval signature ใดที่ CT-DEC-002 ต้องการยังเป็น deliberate act แยกต่างหาก
