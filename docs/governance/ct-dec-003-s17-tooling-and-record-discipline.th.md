# CT-DEC-003 — S17 Tooling, Ownership และ Append-Only Record Discipline

วันที่มีผล: 2026-07-11
สถานะ: **RECORDED — human Tech Lead decision**
ขอบเขต: MONOLITH S17 governance, การส่ง CT-DEC-002 กลับแก้ และ governance tooling
Technical baseline: `9ac7cff39d02d9430879275645e377728bc0abc5`
Governance input ที่ตรวจ: `7aa63fd085e71c0bcd62f8d9fbee9d1b363ec416`
อำนาจมติ: Tech Lead
ผู้จัดทำเอกสาร: Codex ในฐานะ advisory/non-authoritative

> Record นี้เก็บมติมนุษย์โดยไม่เปลี่ยน advisory review ให้เป็น approval authority ไม่ปิด P0 ไม่อนุมัติ CT-DEC-002 และไม่ปลด Track B implementation

## 1. Decision register

| มติ | อำนาจ | ผลที่มีผล |
| --- | --- | --- |
| ส่ง CT-DEC-002 กลับทำ v0.2 | Tech Lead | ต้องแก้ blocker ทั้งหกจาก independent review; ไม่มี approval signature ในรอบนี้ |
| ผลสูงสุดระหว่าง shadow | Tech Lead | `PKT_OK_SHADOW_ONLY / NO_CUT` คือผลสูงสุดขณะ shadow mode; ห้าม bare `PKT_OK` |
| เพิ่ม as-built gap สามช่อง | Tech Lead | gate evidence run fields, locale sorting และ floating quantization เป็น input ของ S17-4 |
| ตรึง owner ของ `jobRunId` | Tech Lead | Track A ให้ actor/auth/release contract; S17-4 เป็นเจ้าของ transactional allocation |
| จัดชั้นและ harden governance tooling | Tech Lead | อนุญาตการใช้ย้อนหลังแบบจำกัด; official status ต้องผ่าน independent re-review |
| ทำ historical decision quotes เป็น append-only | Tech Lead | การแก้ใช้ addendum/supersession note ห้าม rewrite เงียบ |

## 2. มติส่ง CT-DEC-002 กลับ

CT-DEC-002 คง **DRAFT — NOT APPROVED — NOT FOR IMPLEMENTATION AUTHORITY** โดย v0.2 ต้องแก้:

1. protected signature algorithm/key/registry fields
2. แยก gate evidence ระหว่าง content plane กับ run plane
3. schema, quantity normalization, canonical array ordering และ field ownership
4. การ slice content ID สำหรับชื่อไฟล์ที่ใช้ได้บน Windows และ exact ZIP byte profile
5. trusted-key lifecycle, revocation และ unavailable-authority semantics
6. stable fail-closed result codes และ operational disposition ที่แยกชัด

Approval roles ทั้งสามยังเป็น PENDING Track B implementation สำหรับ S17-4/S17-5 ยังคงล็อกจน approval matrix ของ S17-3 ลงชื่อครบ

ขณะ shadow mode ผลสำเร็จสูงสุดของ verifier คือ:

```text
PKT_OK_SHADOW_ONLY / VERIFIED_SHADOW_ONLY / NO_CUT
```

`PKT_OK` เป็น reserved code และห้าม emit ระหว่าง controlled pilot

## 3. Append-only ownership supersession — `jobRunId`

ถ้อยคำใน v0.1 เดิมเชื่อม server-owned `jobRunId` กับ “S17-1/S17-4” ข้อความเดิมยังต้องย้อนตรวจได้ใน Git history และห้าม rewrite เหมือนไม่เคยมี มติส่วนนี้ supersede เฉพาะการตีความ owner:

- **Track A / S17-1–2 เป็นเจ้าของ** `actorSubjectId`, authenticated authorization context และ server-enforced RELEASED-only invariant
- **Track A ไม่ allocate `jobRunId`**
- **S17-4 เป็นเจ้าของ** canonical export-request fingerprinting และ durable transactional `jobRunId` allocation หลังเรียก Track A contract
- `jobRunId` หนึ่งค่าผูก `packetContentId` หนึ่งค่า; idempotency conflict ต้อง fail closed

การแก้ขอบเขตนี้ไม่ทำให้ Track A ช้า และไม่ปลด S17-4 implementation ก่อน CT-DEC-002 อนุมัติ

## 4. Durable governance-tooling classification

### 4.1 Historical versions ที่อนุญาตย้อนหลัง

Version ต่อไปนี้ ณ `7aa63fd0` ได้รับอนุญาตย้อนหลังเฉพาะฐานะ **governance tooling**:

```text
7976e417cbffc5779aa7b53608ae179324981b6d63b65c59a013013f2f852b6c  render-standalone-markdown.mjs
b42a168489ecf776adf25c8d866444b2badb81da474224d9985e91673d99c62e  write-sha256-manifest.mjs
cc34ad45d4e185065771306e275e3198332bedcae1557106d4f0fa6bd677c05a  verify-sha256-manifest.mjs
```

การอนุญาตนี้ไม่ทำให้สคริปต์เป็น Track implementation, production control, release gate หรือ S17-5 evidence

### 4.2 Hardened candidate versions ใน governance revision นี้

```text
d7e05ddc8ef3b7e5e56c7b68a07adf5555f0366bb9e2c7a6f00796b7487c198a  render-standalone-markdown.mjs
d27a6120483569e044f2eb77ee4158d3dfc1bbc4a9b1e157dd750a9e8743ec3c  write-sha256-manifest.mjs
1c67197766ade318f1287b0b88a3001c79a2a1dfd30398d63d679d28a8215672  verify-sha256-manifest.mjs
00c33bd04d722fab8d96424af0c80b0e5db13d7f19612083f08d1ea39c299fa4  governance-tooling.test.mjs
```

Candidate writer/verifier ต้อง reject path escape, symlink ที่ออกนอก manifest root, duplicate/case-fold-colliding entry, manifest ที่เป็น CRLF/BOM/มี blank line, non-canonical path และ manifest self-reference Writer บันทึก canonical relative path แทน basename-only entry Focused built-in Node test suite ครอบคลุม valid nested path รวม negative ของ traversal, duplicate, blank line, CRLF, unsafe link, token collision และ unclosed fence

สถานะยังคง:

| Tool | สถานะปัจจุบัน | ขอบเขต |
| --- | --- | --- |
| `render-standalone-markdown.mjs` | **YELLOW** | trusted repository governance input เท่านั้น |
| `write-sha256-manifest.mjs` | **CANDIDATE — NOT OFFICIAL** | governance manifests เท่านั้น; ต้อง independent re-review |
| `verify-sha256-manifest.mjs` | **CANDIDATE — NOT OFFICIAL** | manifest-integrity utility เท่านั้น; ต้อง independent re-review |

`verify-sha256-manifest.mjs` ไม่ใช่และห้ามอ้างว่าเป็น S17-5 full packet verifier การให้ official status ทำได้ด้วยมติมนุษย์รอบถัดไปหลัง independent source review และ reproduce negative tests แล้วเท่านั้น

## 5. Append-only historical decision-record rule

1. Verbatim human-decision quote blocks และ signed/approved fields เป็น append-only หลังบันทึก
2. การแก้ข้อเท็จจริง, owner หรือ policy ต้องเพิ่ม dated addendum หรือ `CT-DEC-xxx` supersession note ใหม่
3. Note ใหม่ต้องระบุ prior record, exact scope ที่ supersede, authority/role, เหตุผล และ effective date
4. ข้อความเดิมส่วนที่ไม่ถูกกระทบยังมีอำนาจในขอบเขตเดิม
5. Rendering, translation, typo หรือ formatting correction ห้ามเปลี่ยน normative meaning เงียบ; normative change ต้องใช้ supersession discipline เดียวกัน
6. Git history เป็น tamper-evident provenance แต่ห้ามเรียก unsigned commit ว่า immutable

## 6. สถานะ Track A ที่วัดได้ ณ เวลาบันทึก

การตรวจ Git แบบ read-only เมื่อ 2026-07-11 พบ:

- main implementation worktree ณ `9ac7cff3` บน `fix/drillmap-bolt-and-brun-dowels`
- governance worktree ณ `7aa63fd0` บน `governance/s17-control-pack`
- ไม่มี local หรือ remote Track A/S17-1 branch
- ไม่มี dedicated clean Track A worktree

ดังนั้น **สถานะ S17-1 implementation = NOT STARTED / NO REPOSITORY EVIDENCE** ณ เวลาบันทึก นี่เป็น measured fact ไม่ใช่ claim ต่องานนอก Git เนื่องจาก deadline implementation ยังประมาณ 2026-07-25 การสร้าง exact-baseline clean Track A worktree และเริ่ม server-owned actor identity คือ execution action ที่เร่งที่สุด

## 7. ขอบเขตที่ไม่เปลี่ยน

- CT-DEC-002 ยัง DRAFT และไม่มี approval signature
- Track B implementation ยังล็อก
- ไม่มี P0 blocker ใดปิด
- ไม่มี production-ready หรือ deployment-ready claim
- ADR-064 ยังต้องครบสี่บทบาทมนุษย์
- ห้ามตัดชิ้นงานจริงจาก packet จน S17 ปิดและ real-cut gate ผ่านครบสี่เงื่อนไข

## 8. Controlled actions ถัดไป

1. ส่ง CT-DEC-002 v0.2 พร้อม hash-anchored diff summary เข้า independent review รอบสอง
2. independent re-review hardened writer/verifier ก่อนมติ official tooling ใด ๆ
3. เริ่ม Track A จาก exact baseline `9ac7cff3` บน clean worktree แยก โดยไม่รอ CT-DEC-002 approval
