# CT-DEC-002 / S17-3 — Canonical Factory Packet Specification

ฉบับเอกสาร: 0.1  
วันที่ร่าง: 2026-07-11  
สถานะ: **DRAFT — NOT APPROVED — NOT FOR IMPLEMENTATION AUTHORITY**  
Baseline ที่ตรวจ: `9ac7cff39d02d9430879275645e377728bc0abc5`  
ผู้ร่าง: Codex ในฐานะ advisory/non-authoritative  
เอกสารแม่: PRD v5.1, Review v3.2, CT-DEC-001, ADR-065  

> เอกสารนี้เป็น target-state contract สำหรับขออนุมัติ ไม่ได้พิสูจน์ว่าโค้ดปัจจุบัน implement แล้ว ไม่ปิด S17-3 และไม่ปลด S17-4/S17-5 จนกว่าผู้อนุมัติสามบทบาทลงชื่อครบ

## 1. Approval matrix

| บทบาท | ขอบเขตที่ต้องตรวจ | สถานะ | ผู้ลงนาม/วันที่ |
| --- | --- | --- | --- |
| Tech Lead | schema, canonicalization, determinism, feasibility | **PENDING** | — |
| Factory Owner | file contract, machine binding, verifier flow, factory fit | **PENDING** | — |
| Security Owner | signature, trust boundary, key semantics, fail-closed | **PENDING** | — |

สถานะเปลี่ยนเป็น APPROVED ได้เมื่อทั้งสามช่องเป็น APPROVED เท่านั้น หากคนเดียวถือ Tech Lead และ Security Owner ต้องลงมติแยกสองบทบาท

## 2. วัตถุประสงค์และขอบเขต

Spec นี้นิยาม contract ขั้นต่ำของ Factory Packet v2 เพื่อปิดช่องว่างระหว่าง content identity, execution identity และ manufacturing trust:

1. `packetContentId` ระบุ canonical manufacturing content
2. `jobRunId` ระบุการ export/attestation แต่ละครั้งและต้อง server-owned
3. signed identity ผูก released revision, machine-profile version, exporter version, packet schema และ content/run identity
4. manifest ระบุทุก payload file ด้วย path, media type, byte size และ SHA-256
5. verifier ตรวจครบแบบ fail-closed รวม signature, release state, machine profile และ tamper corpus
6. shadow-mode marker `NOT_FOR_PRODUCTION.txt` และชื่อ ZIP `NFP-...` ยังคงบังคับจน real-cut gate ผ่าน

นอกขอบเขตของ S17-3: การ implement generator/verifier (S17-4/S17-5), key ceremony และ production key provisioning (S17-6), การเลือก cloud provider และการอนุมัติตัดจริง

## 3. Normative language

คำว่า **MUST / MUST NOT / REQUIRED / SHOULD / MAY** เป็นข้อบังคับตามความหมาย RFC 2119-style ในฉบับอังกฤษ ส่วนภาษาไทยใช้ **ต้อง / ห้าม / ควร / อาจ** ให้ความหมายเดียวกัน หากฉบับ TH/EN ขัดกันให้หยุดอนุมัติและแก้ทั้งคู่ ห้ามเลือกตีความข้างใดข้างหนึ่งเอง

## 4. หลักการแยกสอง identity

Factory Packet v2 แยกสองชั้นอย่างชัดเจน:

| ชั้น | ตัวระบุ | คุณสมบัติ |
| --- | --- | --- |
| Canonical content plane | `packetContentId` | deterministic; payload+manifest เดิมภายใต้ revision/profile/exporter/schema เดิมต้องได้ค่าเดิม |
| Execution/attestation plane | `jobRunId` | server-owned; unique ต่อ accepted export run; อาจต่างกันแม้ content เดิม |

เหตุผล: revision เดียวอาจ export หลายครั้งและไปหลาย profile/exporter ได้ การใช้ ID เดียวแทนทั้ง content และ run ทำให้ชนกันหรือทำ audit replay แยกไม่ได้

### 4.1 Determinism claim ที่อนุญาต

เมื่อ authoritative input, released revision, machine profile+version+digest, exporter build และ schema เดิมเหมือนกัน:

- payload files ทุกไฟล์, `manifest.json` และ `packetContentId` **ต้องเหมือน byte-for-byte**
- ZIP entry order/metadata/compression ภายใต้ exporter build เดิม **ต้อง deterministic**
- `attestation.json`, filename และ ZIP ทั้งก้อน **อาจต่าง** เฉพาะ field ที่ตั้งใจเป็น run-specific ได้แก่ `jobRunId`, `issuedAt`, actor และ signature ที่ครอบ field เหล่านั้น
- ความต่างนอก allowlist นี้ถือเป็น S17-4 failure

ห้าม claim ว่า outer ZIP จากคนละ run ต้องเหมือน byte-for-byte เพราะจะขัดกับ requirement ที่ `jobRunId` ต้อง unique

## 5. Trust boundary และ ownership

| Component/actor | เชื่อถือได้เรื่องใด | ห้ามเชื่อ/ข้อบังคับ |
| --- | --- | --- |
| Browser/client | ส่ง intent และแสดงผล | เป็น untrusted input; ห้ามเป็นเจ้าของ actor, role, release state, `jobRunId`, key ID หรือ machine authorization |
| Authenticated server | actor subject, authorization, revision state, run allocation | ต้อง derive จาก verified session/JWT และ server data; ห้ามเชื่อ `x-actor-role` หรือ localStorage |
| Deterministic builder | สร้าง canonical payload/manifest | รับเฉพาะ normalized authoritative input; ห้ามถือ raw private key |
| Managed KMS/HSM | ลงลายเซ็น Ed25519 | private key non-exportable; key lifecycle อยู่ S17-6 |
| Full verifier | ตรวจ bytes, identity, signature และ authoritative state | ต้องอิสระจาก builder ตาม CT-DEC-001; fail closed เมื่อข้อมูลขาด/ไม่รู้จัก |
| Factory operator | ตัดสินใจตามสถานะที่ verifier แสดง | ห้ามใช้ชื่อไฟล์/ป้าย UI แทนผล verifier; marker NFP หมายถึงห้ามตัดจริงเสมอ |

## 6. Delivery layout

ZIP v2 มีเฉพาะ root entries ต่อไปนี้:

```text
manifest.json
attestation.json
connector-ops.json
connectors.minifix.json
cutlist.json
drillmap.json
gate-result.json
NOT_FOR_PRODUCTION.txt    # REQUIRED ขณะ shadow mode
```

Payload set อาจเพิ่มใน schema minor version เมื่อ approval matrix อนุมัติ แต่ทุก payload file ต้องอยู่ใน `manifest.files` ส่วน `manifest.json` และ `attestation.json` เป็น control files จึงไม่อยู่ใน `manifest.files` เพื่อเลี่ยง self-hash recursion

ZIP ต้อง:

1. ไม่มี folder prefix และไม่มี directory entries
2. เรียง `manifest.json` ก่อน จากนั้น payload ตาม canonical path order แล้ว `attestation.json` ท้ายสุด
3. ตั้ง entry timestamp คงที่ `1980-01-01T00:00:00Z`, permissions/platform flags คงที่ และ compression algorithm/level ถูก pin โดย exporter version
4. ปฏิเสธ encrypted ZIP, data descriptor ที่ parser policy ไม่รองรับ, duplicate entry, path traversal, absolute path, symlink และ case-fold collision
5. จำกัดขนาด compressed/uncompressed, จำนวน entry และ compression ratio ตาม verifier policy ที่ versioned

ชื่อไฟล์ขณะ shadow mode:

```text
NFP-factory-packet-<jobRunId>-<packetContentId-first12>.zip
```

ชื่อไฟล์เป็น UX warning เท่านั้น ไม่เป็น input ของ hash/signature และไม่ใช้ตัดสินความถูกต้อง

## 7. Canonical byte rules

1. JSON ทุกไฟล์ต้องเป็น UTF-8 ไม่มี BOM และ serialize ตาม RFC 8785 JSON Canonicalization Scheme (JCS)
2. JSON ห้าม duplicate keys, `NaN`, `Infinity`, `-Infinity` และค่าที่ schema ไม่รู้จักเมื่อ schema กำหนด `additionalProperties: false`
3. ค่ามิติ manufacturing ต้อง quantize ตาม schema ก่อน JCS; v2 ใช้ millimetre precision สูงสุด 0.001 mm ห้ามให้ generic serializer แอบ round ค่า
4. Text files ต้อง UTF-8, LF (`0x0a`) เท่านั้น, ไม่มี BOM และไม่มี CR (`0x0d`)
5. Binary files hash จาก raw bytes
6. SHA-256 hex ต้องเป็น lowercase 64 ตัว; field identity ใช้รูป `sha256:<64-lowercase-hex>`
7. `sizeBytes` คือจำนวน raw bytes จริง ไม่ใช่จำนวนอักขระ
8. Canonical path ใช้ `/`, Unicode NFC, case-sensitive และ sort แบบ unsigned UTF-8 byte lexicographic; ห้าม `.`/`..`, empty segment, leading `/`, backslash, control character, duplicate หรือ case-fold collision

## 8. Per-file manifest format

`manifest.json` schema identifier คือ `monolith.factory.packet@2.0` และมีโครงสร้างขั้นต่ำ:

```json
{
  "schema": "monolith.factory.packet@2.0",
  "manifestVersion": "2.0.0",
  "packetContentId": "sha256:<64-lowercase-hex>",
  "releasedRevision": {
    "projectId": "<server-owned-project-id>",
    "revisionId": "<server-owned-released-revision-id>",
    "state": "RELEASED"
  },
  "machineProfile": {
    "id": "kdt_mvp_v1",
    "version": "1.0.0",
    "sha256": "sha256:<canonical-profile-digest>"
  },
  "exporter": {
    "id": "monolith.factory-exporter",
    "version": "<semver>",
    "buildCommit": "<40-lowercase-hex>"
  },
  "files": [
    {
      "path": "cutlist.json",
      "mediaType": "application/json",
      "sizeBytes": 123,
      "sha256": "<64-lowercase-hex>"
    }
  ]
}
```

ข้อบังคับ:

- `releasedRevision.state` ต้องเป็น literal `RELEASED`; ค่าอื่นสร้าง packet ไม่ได้
- `machineProfile.version` ต้องแยกจาก `id` แม้ ID มีคำว่า v1 และ `sha256` ต้องผูก canonical profile bytes เพื่อกัน profile label ถูกแก้เงียบ
- `exporter.buildCommit` ผูก artifact กับ source revision ของ exporter; version อย่างเดียวไม่พอ
- `files` เรียง canonical path, path ไม่ซ้ำ และต้องครบทุกรายการจริงใน ZIP ยกเว้น control files สองตัว
- `createdAt`, `jobRunId`, actor, signature และ wall-clock fields ห้ามอยู่ใน manifest เพราะทำลาย content determinism

### 8.1 การคำนวณ `packetContentId`

1. Parse และ validate manifest draft โดยยังไม่มี field `packetContentId`
2. เรียง/validate `files` และทุก identity field ตาม schema
3. สร้าง `contentDescriptor` = manifest object ทั้งหมดโดย **omit เฉพาะ `packetContentId`**
4. `descriptorBytes = UTF8(JCS(contentDescriptor))`
5. `packetContentId = "sha256:" + lowercaseHex(SHA256(descriptorBytes))`
6. ใส่ field กลับแล้ว serialize `manifest.json` ด้วย JCS

Path, size และ hash อยู่ใน preimage จึงป้องกันการสลับชื่อไฟล์ที่มี hash ชุดเดิม ซึ่ง `contentHash` v1 ที่ hash เฉพาะ sorted hashes ป้องกันไม่ได้

## 9. Server-owned `jobRunId`

1. Server ต้อง allocate หลัง authentication/authorization, RELEASED check และ machine-profile authorization ผ่าน
2. รูปแบบ v1 คือ lowercase RFC 4122 UUID v4 canonical string
3. Client-supplied `jobRunId` ต้องถูก ignore หรือ reject ห้าม trust
4. หนึ่ง accepted export attempt มีหนึ่ง `jobRunId`; explicit rebuild ต้องได้ ID ใหม่แม้ `packetContentId` เดิม
5. Retry ด้วย idempotency key เดิมต้องคืน accepted record เดิมและ `jobRunId` เดิม; idempotency key เดิมที่ payload ต่างต้อง fail conflict
6. ฐานข้อมูลห้ามยอมให้ `jobRunId` เดียวผูกมากกว่าหนึ่ง `packetContentId`

## 10. Signed attestation และ identity

`attestation.json` เป็น run-specific control file และมีโครงสร้างขั้นต่ำ:

```json
{
  "schema": "monolith.factory.packet-attestation@1.0",
  "jobRunId": "<server-owned-uuid-v4>",
  "packetContentId": "sha256:<64-lowercase-hex>",
  "manifestSha256": "sha256:<sha256-of-exact-manifest-bytes>",
  "issuedAt": "<RFC3339-UTC>",
  "actorSubjectId": "<server-derived-opaque-subject>",
  "releasedRevision": {
    "projectId": "<same-as-manifest>",
    "revisionId": "<same-as-manifest>",
    "state": "RELEASED"
  },
  "machineProfile": {
    "id": "<same-as-manifest>",
    "version": "<same-as-manifest>",
    "sha256": "<same-as-manifest>"
  },
  "exporter": {
    "id": "<same-as-manifest>",
    "version": "<same-as-manifest>",
    "buildCommit": "<same-as-manifest>"
  },
  "packetSchema": "monolith.factory.packet@2.0",
  "gate": {
    "result": "PASS",
    "policyVersion": "<version>",
    "evidenceFile": "gate-result.json",
    "evidenceSha256": "sha256:<same-file-digest-as-manifest>"
  },
  "signature": {
    "algorithm": "Ed25519",
    "keyId": "<trusted-registry-key-id>",
    "valueBase64": "<canonical-base64-signature>"
  }
}
```

Signed identity ต้องผูกอย่างน้อย `jobRunId`, `packetContentId`, exact manifest digest, released revision, machine profile ID+version+digest, exporter ID+version+build commit, packet schema, gate result/policy/evidence digest, issued time และ server-derived actor

### 10.1 Signature preimage

1. สร้าง `unsignedAttestation` โดย omit เฉพาะ top-level `signature`
2. `message = UTF8("MONOLITH_FACTORY_PACKET_ATTESTATION_V1\n") || UTF8(JCS(unsignedAttestation))`
3. KMS/HSM ลงลายเซ็น Ed25519 บน `message`
4. `valueBase64` ใช้ RFC 4648 standard Base64 พร้อม padding ห้าม whitespace
5. `keyId` เป็น lookup key ของ trusted public-key registry; ห้ามฝัง public key แล้วเชื่อ key จาก packet เอง

การเปลี่ยน identity field ใด ๆ หลัง sign ต้องทำให้ signature fail

## 11. Shadow mode / NOT-FOR-PRODUCTION contract

ขณะที่ real-cut gate ยังไม่ผ่านครบสี่เงื่อนไข:

1. `NOT_FOR_PRODUCTION.txt` ต้องมีอยู่และอยู่ใน `manifest.files`
2. bytes ต้องตรงค่าที่ exporter version กำหนดจาก `src/core/config/shadowMode.ts` (UTF-8, LF, ไม่มี trailing LF ใน baseline นี้)
3. ZIP filename ต้องขึ้นต้น `NFP-`
4. verifier อาจให้ผล integrity ว่า PASS แต่สถานะ operational ต้องเป็น `VERIFIED_SHADOW_ONLY / NO_CUT`
5. การหายไปของ marker หรือ prefix ไม่ยกระดับเป็น production; ต้อง fail `PKT_NFP_POLICY_MISMATCH`
6. การปิด marker ต้องมาจาก governance-controlled configuration หลัง S17-1..5 ปิด, ADR-064 ครบสี่บทบาท, dogfood เต็มสายอย่างน้อยหนึ่งงาน และ machine profile calibrate แล้วเท่านั้น

ข้อความ marker ปัจจุบัน:

```text
*** NOT FOR PRODUCTION — ห้ามใช้ตัดชิ้นงานจริง ***

packet นี้ออกในโหมด shadow ระหว่างช่วง dogfood (ADR-065 Q3)
ห้ามนำไปตัดชิ้นงานจริงจนกว่า S17 production blockers จะปิดครบ
และ gate "ตัดจริง" ผ่านทั้งสี่เงื่อนไข (ดู ADR-065)

This packet was produced in shadow mode during the dogfood phase.
Do NOT cut real workpieces from it until all S17 production
blockers are closed and the four-condition real-cut gate passes.

ใช้ได้เฉพาะ: เทียบกับใบสั่งผลิตเดิมของโรงงานเพื่อเก็บ evidence ป้อน S17
```

## 12. Full verifier contract (S17-5 input)

Verifier ต้องตรวจตามลำดับและหยุดแบบ fail-closed:

1. **Container safety**: size/count/ratio limits, safe paths, no duplicates/case collisions/symlinks/encryption
2. **Strict parse**: UTF-8/JCS/schema, duplicate-key rejection, exact supported versions
3. **Exact file set**: payload ทุกไฟล์ตรง manifest; ไม่มี missing/extra นอกจาก control files ที่กำหนด
4. **Byte integrity**: `sizeBytes` และ SHA-256 ต่อไฟล์
5. **Content identity**: recompute `packetContentId` จาก descriptor
6. **Manifest binding**: recompute exact `manifestSha256`
7. **Identity consistency**: revision/profile/exporter/schema/packet ID ใน attestation ตรง manifestทุก field
8. **Signature**: key lookup จาก trusted registry, algorithm/key state, Ed25519 verify
9. **Authoritative checks**: revision ยังเป็น RELEASED, project ตรง, machine profile/version/digest ได้รับอนุญาต, exporter build อยู่ allowlist, gate evidence PASS ตาม policy ที่รองรับ
10. **Run/replay checks**: `jobRunId` ไม่ชน content อื่น, idempotency/replay policy ผ่าน
11. **Shadow policy**: marker+prefix สอดคล้อง governance state; NFP แสดง NO_CUT เสมอ
12. **Audit result**: เก็บ verifier version, policy versions, checked hashes, result code, time และ human/operator context โดยไม่เขียนทับ evidence เดิม

Verifier ห้าม “warn แล้วผ่าน” เมื่อ schema/key/state ไม่รู้จัก, network/state lookup ที่จำเป็นล้มเหลว หรือ evidence ขาด

## 13. Stable result codes ขั้นต่ำ

| Code | ความหมาย | ผล |
| --- | --- | --- |
| `PKT_OK` | ผ่านทุกข้อและ governance อนุญาต production | VERIFIED (ยังต้องผ่าน external real-cut gate) |
| `PKT_OK_SHADOW_ONLY` | integrity/signature ผ่านแต่ NFP ยังบังคับ | VERIFIED_SHADOW_ONLY / NO_CUT |
| `PKT_LIMIT_EXCEEDED` | container เกิน policy | FAIL |
| `PKT_PATH_INVALID` | path traversal/duplicate/collision | FAIL |
| `PKT_SCHEMA_UNSUPPORTED` | schema/version ไม่รองรับ | FAIL |
| `PKT_JSON_NON_CANONICAL` | JSON ไม่ตรง canonical rules | FAIL |
| `PKT_FILE_MISSING` / `PKT_FILE_EXTRA` | file set ไม่ตรง | FAIL |
| `PKT_SIZE_MISMATCH` / `PKT_HASH_MISMATCH` | bytes ไม่ตรง manifest | FAIL |
| `PKT_CONTENT_ID_MISMATCH` | packetContentId คำนวณใหม่ไม่ตรง | FAIL |
| `PKT_MANIFEST_BINDING_MISMATCH` | attestation ไม่ผูก exact manifest | FAIL |
| `PKT_IDENTITY_MISMATCH` | identity ซ้ำสองชั้นไม่ตรงกัน | FAIL |
| `PKT_SIGNATURE_MISSING` / `PKT_SIGNATURE_INVALID` | signature ขาด/ผิด | FAIL |
| `PKT_KEY_UNKNOWN` / `PKT_KEY_REVOKED` | trust key ใช้ไม่ได้ | FAIL |
| `PKT_REVISION_NOT_RELEASED` | revision ไม่ใช่ RELEASED | FAIL |
| `PKT_MACHINE_PROFILE_MISMATCH` | profile/version/digest ไม่อนุญาต | FAIL |
| `PKT_EXPORTER_UNTRUSTED` | exporter build ไม่อยู่ allowlist | FAIL |
| `PKT_GATE_FAILED` | gate evidence ไม่ PASS/ไม่รองรับ | FAIL |
| `PKT_JOB_RUN_CONFLICT` | run ID ผูก content อื่นหรือ replay ผิด policy | FAIL |
| `PKT_NFP_POLICY_MISMATCH` | marker/prefix ไม่ตรง governance state | FAIL / NO_CUT |

ข้อความ UI อาจแปลภาษา แต่ stable code และ severity ห้ามเปลี่ยนตาม locale

## 14. Tamper corpus ขั้นต่ำ

S17-5 ต้องมี negative fixtures อย่างน้อย:

1. เปลี่ยน payload 1 byte
2. สลับชื่อสองไฟล์แต่ใช้ hash set เดิม
3. missing file, extra file, duplicate ZIP entry และ case-fold collision
4. path traversal, absolute path, backslash, symlink และ ZIP bomb policy
5. size/hash/packetContentId/manifest digest ผิดทีละ field
6. duplicate JSON key, non-canonical number/encoding/BOM/CRLF
7. แก้ revision, profile ID, profile version, profile digest, exporter version/build commit หรือ schema หลัง sign
8. signature ขาด, bit-flip, wrong key, unknown key, revoked key และ placeholder key ว่าง
9. `jobRunId` จาก client, malformed UUID, reuse กับ packetContentId อื่น และ idempotency conflict
10. revision DRAFT/FROZEN, gate FAIL, unsupported gate policy และ authoritative lookup unavailable
11. ลบ/แก้ `NOT_FOR_PRODUCTION.txt`, ลบ `NFP-`, หรือพยายามใช้ NFP packet เป็น production
12. same canonical inputs randomized order/timezone/locale แล้ว payload+manifest+packetContentId ต้องเหมือนเดิม
13. same content สอง accepted runs ต้อง packetContentId เดิมแต่ jobRunId ต่าง และต่างเฉพาะ run-specific allowlist

ทุก fixture ต้องระบุ expected stable code และพิสูจน์ว่า verifier ไม่สร้างสถานะ VERIFIED เมื่อ FAIL

## 15. As-built gap ณ baseline

| Target contract | As-built `9ac7cff3` | สถานะ |
| --- | --- | --- |
| server-owned `jobRunId` | client สร้าง `job-${Date.now()}-${random}` | GAP — S17-1/S17-4 |
| path-aware `packetContentId` | `contentHash` hash เฉพาะ sorted file hashes ไม่รวม path | GAP — rename ambiguity |
| deterministic manifest | มี `createdAt: new Date().toISOString()` | GAP — S17-4 |
| explicit machine profile/version/digest + released revision | manifest v1 ไม่มี | GAP |
| exporter ID/version/build commit | มีเพียง `toolVersion` | GAP |
| mandatory signed attestation | signature optional และ full trust path ยังไม่บังคับ | GAP — S17-5/S17-6 |
| full verifier | client verifier ตรวจ file/hash/contentHash/gate บางส่วน; server evidence เดิมตื้น | GAP — S17-5 |
| NFP marker/file prefix | `NOT_FOR_PRODUCTION.txt` + `NFP-` มีจริง | PRESENT — ต้อง preserve |
| deterministic ZIP | browser JSZip ใช้ runtime metadata/filename timestamp | GAP — S17-4 |

ตารางนี้เป็น code-review finding ไม่ใช่ P0 closure

## 16. S17-3 acceptance criteria

S17-3 ปิดได้เมื่อ:

1. ฉบับ TH/EN และ HTML ตรงกัน พร้อม SHA-256 manifest ใน repo
2. Tech Lead, Factory Owner และ Security Owner ลง APPROVED แยกบทบาทครบ
3. ทุก normative field มี owner, source และ validation rule
4. packetContentId/jobRunId/signed identity ไม่มี circular hash หรือ run/content ambiguity
5. per-file format, canonical bytes, ZIP rules, NFP policy, verifier order/result codes และ tamper corpus ถูกอนุมัติ
6. มี implementation mapping สำหรับ S17-4 และ independent verifier assignment สำหรับ S17-5 โดย builder ไม่ approve งานตัวเอง
7. การเปลี่ยน normative contract หลังอนุมัติต้องเพิ่ม version และผ่าน approval matrix ใหม่

ก่อนครบเจ็ดข้อ สถานะคือ DRAFT และ Track B implementation ยังคงล็อก

## 17. Open approval questions

1. Factory Owner ยืนยัน required payload set และ `kdt_mvp_v1` ID/version/profile digest contract หรือไม่
2. Tech Lead ยืนยัน JCS + 0.001 mm domain quantization และ UUID v4/idempotency semantics หรือไม่
3. Security Owner ยืนยัน Ed25519 domain separation, trusted key registry และ revocation behavior หรือไม่
4. ทั้งสามบทบาทยอมรับ determinism boundary ว่า canonical payload deterministic แต่ run-specific attestation ทำให้ outer ZIP ต่างข้าม run ได้หรือไม่
5. Verifier policy limits (max entries/bytes/ratio) จะตรึงค่าเท่าใดก่อน pilot

คำถามเหล่านี้ต้องปิดใน approval review ห้าม implement ด้วยการเดา
