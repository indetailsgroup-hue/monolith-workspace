# CT-DEC-003-A1 — การ Ratify โดย Tech Lead

วันที่มีผล: 2026-07-16  
สถานะ: **RATIFIED — exact pinned governance-tool bytes**  
อำนาจมติ: Tech Lead (Dave)  
คำสั่ง ratification: `RATIFY CT-DEC-003-A1 exact pinned bytes`  
ผู้จัดทำ record: Codex ในฐานะ documentary/non-signing  
Sibling record: `CT-DEC-003-A2` ครอบคลุมสถานะ S17 และอยู่นอก ratification นี้

> Record นี้เก็บ deliberate ratification ของ Tech Lead หลัง independent source review โดยไม่เปลี่ยน pinned tool byte ใด และไม่ rewrite CT-DEC-003, CT-DEC-003-A1, independent review หรือ A1 consolidated anchor

## 1. สิ่งที่ ratify

Tech Lead ratify classification แบบจำกัด **OFFICIAL — GOVERNANCE DOCUMENT TOOLING** ใน `CT-DEC-003-A1` สำหรับ exact bytes ต่อไปนี้เท่านั้น:

```text
d7e05ddc8ef3b7e5e56c7b68a07adf5555f0366bb9e2c7a6f00796b7487c198a  scripts/render-standalone-markdown.mjs
3cd69ca33cfc1fec7657fd0a242668f24706f38ba52b27be7021579d8e58a584  scripts/write-sha256-manifest.mjs
9fbbf53519a2d45e3298a5d7d7e7b0df6481396b40a440cd707206b359ea2cb8  scripts/verify-sha256-manifest.mjs
cef610700abc1e17258373b99cd0243c757407cfd75f92e6ddbf1e0b07fe8093  scripts/governance-tooling.test.mjs
```

Consolidated A1 review-input anchor ยังคง byte-identical และไม่ regenerate:

```text
649f4b0c7858c0176f9528224ce3d14f387599b57d9d47b1e174dd103daf812d  monolith-ct-dec-003-a1-review-input.sha256
entries: 58
self-listed: no
```

## 2. Evidence ที่ Tech Lead รับ

Ratification นี้รับ evidence ต่อไปนี้:

1. A1 mechanical integrity: tool hashes ใน §2 ตรง, anchor 58 entry ไม่ self-list, historical v0.4.1 anchor ไม่ถูกแก้ และ legacy manifests สามชุดเปลี่ยนเฉพาะ canonical ordering
2. Codex advisory source review และ dedicated governance-tooling tests: 5/5
3. independent source review โดย Claude ที่ commit `e82ac7600dde69ecf75a26a3df73ff38200e86aa`
4. adversarial control probes แยกเจ็ดข้อ: 7/7
5. independent conclusion: ไม่พบ defect ระดับ high หรือ medium และ classification แบบ OFFICIAL-for-governance-documents defensible สำหรับ pinned bytes
6. separation of duties: independent reviewer ไม่ใช่ Codex ซึ่งเป็นผู้จัดทำ A1

## 3. ผลของ ratification

ตั้งแต่วันที่มีผล tool bytes ทั้งสี่ใน §1 เป็น official ภายใน boundary แบบจำกัดที่ CT-DEC-003-A1 ระบุ:

- render trusted repository Markdown เป็น standalone HTML
- เขียน canonical SHA-256 manifests สำหรับ governance/review artifacts
- verify byte integrity ของ governance manifests เหล่านั้น
- regression test สาม governance scripts ข้างต้น

หาก byte ใดเปลี่ยน tool ที่เปลี่ยนจะกลับเป็น **CANDIDATE — NOT OFFICIAL** ทันที จน append-only review และ Tech Lead ratification รอบถัดไป pin replacement hash

## 4. สิ่งที่ไม่รวม

Ratification นี้ไม่ classify script อื่น รวมถึง supplementary `scripts/governance-tooling-controls.test.mjs` ที่ independent reviewer เพิ่ม ไฟล์นั้นเป็น evidence แยกและตั้งใจไม่รวมอยู่ใน A1 pinned bytes ทั้งสี่

Governance manifest verifier ยังคงไม่เทียบเท่า S17-5 Ratification นี้ไม่ให้ packet-schema validation, ECDSA P-256/low-S verification, AWS KMS trust, registry/revocation check, verifier-order enforcement, machine admission หรือ operational disposition

รับ leading-space path observation เป็น low severity และ defer ไป future test-first tool revision โดยไม่บล็อก exact-byte ratification นี้ การ implement จะเปลี่ยน pinned byte จึงต้องมี hash ใหม่, independent review และ ratification รอบถัดไป

## 5. Governance boundaries ที่ไม่เปลี่ยน

- CT-DEC-002 ยัง DRAFT; approval roles ของ S17 ทั้งสามยัง PENDING
- Track B ยัง LOCKED
- shadow mode ยังคง `PKT_OK_SHADOW_ONLY / VERIFIED_SHADOW_ONLY / NO_CUT`
- ไม่มี P0 blocker ใดถูกปิด
- ไม่อนุญาต production deployment หรือตัดจริง
- dogfood ยัง `AUTHORIZED/PREPARED — NOT STARTED` จน project จริง emit immutable evidence event แรก
- A2 status numbering และ commit `7523c05a` ไม่ได้รับผลกระทบ

นี่เป็น documentary record ของ explicit human instruction ใน review session นี้ ไม่มี cryptographic human signature และไม่แทนที่ signature แยกใดที่ CT-DEC-002 ต้องการ
