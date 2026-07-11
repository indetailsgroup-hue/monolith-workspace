# CT-DEC-002 / S17-3 — Canonical Factory Packet Specification

ฉบับเอกสาร: 0.2
วันที่ร่าง: 2026-07-11  
วันที่แก้ไข: 2026-07-11 หลัง independent review และ Tech Lead ส่งกลับแก้ไข
สถานะ: **DRAFT — NOT APPROVED — NOT FOR IMPLEMENTATION AUTHORITY**  
Baseline ที่ตรวจ: `9ac7cff39d02d9430879275645e377728bc0abc5`  
ผู้ร่าง: Codex ในฐานะ advisory/non-authoritative  
เอกสารแม่: PRD v5.1, Review v3.2, CT-DEC-001, CT-DEC-003, ADR-065

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
5. JSON payload ทุกไฟล์ผูก versioned content schema และ canonical array/quantity rules
6. verifier ตรวจครบแบบ fail-closed รวม signature, release state, machine profile และ tamper corpus
7. shadow-mode marker `NOT_FOR_PRODUCTION.txt` และชื่อ ZIP `NFP-...` ยังคงบังคับจน real-cut gate ผ่าน

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

### 4.2 Gate evidence อยู่ใน content plane

`gate-result.json` เป็น deterministic content evidence จึงอยู่ใน `manifest.files` และ `packetContentId` ต้องใช้ schema `monolith.factory.gate-result@2.0` และห้ามมี `runAt`, `issuedAt`, `jobRunId`, actor identity, free-form/localized human message หรือ wall-clock/run field อื่น Finding มีได้เฉพาะ stable code, severity, entity IDs ที่เรียง canonical และ canonical parameters ที่ schema กำหนด โดยเรียง findings ตาม severity rank, code, entity-ID byte order แล้วตาม JCS parameter bytes

Execution time, operator context และ localized display text อยู่ได้เฉพาะ run-specific attestation/audit record Verifier ต้อง parse `gate-result.json`, บังคับผล `PASS` และพิสูจน์ว่า result, policy version, schema, file digest และ field `gate` ที่ซ้ำใน attestation ตรงกัน หากไม่ตรงต้องคืน `PKT_GATE_EVIDENCE_MISMATCH`

รูปแบบ `gate-result.json` ใน packet มี exact top-level shape ต่อไปนี้ ทุก field บังคับและห้าม additional properties:

```json
{
  "schema": "monolith.factory.gate-result@2.0",
  "policyVersion": "<semver>",
  "result": "PASS",
  "findings": [
    {
      "code": "<stable-code>",
      "severity": "WARNING",
      "entityIds": ["<canonical-id>"],
      "parameters": {}
    }
  ]
}
```

## 5. Trust boundary และ ownership

| Component/actor | เชื่อถือได้เรื่องใด | ห้ามเชื่อ/ข้อบังคับ |
| --- | --- | --- |
| Browser/client | ส่ง intent และแสดงผล | เป็น untrusted input; ห้ามเป็นเจ้าของ actor, role, release state, `jobRunId`, key ID หรือ machine authorization |
| Track A authenticated-server contract | actor subject, authorization context, revision state | ต้อง derive จาก verified session/JWT และ server data; ห้ามเชื่อ `x-actor-role` หรือ localStorage; Track A ไม่ allocate `jobRunId` |
| S17-4 export service | content build, idempotency fingerprint, transactional run allocation | ต้องเรียก Track A contract ก่อน และผูก server-owned `jobRunId` หนึ่งค่ากับ `packetContentId` หนึ่งค่าเท่านั้น |
| Deterministic builder | สร้าง canonical payload/manifest | รับเฉพาะ normalized authoritative input; ห้ามถือ raw private key |
| Managed KMS/HSM | ลงลายเซ็น Ed25519 | private key non-exportable; key lifecycle อยู่ S17-6 |
| Full verifier | ตรวจ bytes, identity, signature และ authoritative state | ต้องอิสระจาก builder ตาม CT-DEC-001; fail closed เมื่อข้อมูลขาด/ไม่รู้จัก |
| Factory operator | ตัดสินใจตามสถานะที่ verifier แสดง | ห้ามใช้ชื่อไฟล์/ป้าย UI แทนผล verifier; marker NFP หมายถึงห้ามตัดจริงเสมอ |

## 6. Delivery layout

ZIP v2 มีเฉพาะ root entries ต่อไปนี้:

```text
manifest.json
connector-ops.json
connectors.minifix.json
cutlist.json
drillmap.json
gate-result.json
NOT_FOR_PRODUCTION.txt    # REQUIRED ขณะ shadow mode
attestation.json
```

Payload set อาจเพิ่มใน schema minor version เมื่อ approval matrix อนุมัติ แต่ทุก payload file ต้องอยู่ใน `manifest.files` ส่วน `manifest.json` และ `attestation.json` เป็น control files จึงไม่อยู่ใน `manifest.files` เพื่อเลี่ยง self-hash recursion

ZIP ต้องใช้ v2 byte profile ต่อไปนี้:

1. ไม่มี folder prefix และไม่มี directory entries
2. เรียง `manifest.json` ก่อน จากนั้น payload ตาม canonical path order แล้ว `attestation.json` ท้ายสุด
3. ใช้ ZIP method 0 (`STORE`) ทุก entry; v2 ห้าม DEFLATE และ compression method อื่นทั้งหมด
4. ตั้ง DOS date bits เป็น `0x0021` (1980-01-01) และ DOS time bits เป็น `0x0000`; ห้ามแปลง timezone
5. ตั้ง general-purpose flags เป็น `0x0800` (ชื่อ UTF-8 เท่านั้น), version-needed เป็น `2.0`, creator OS เป็น UNIX, version-made-by เป็น `3.0`, external attributes เป็น regular file mode `0644` (`0x81a40000`) และ internal attributes เป็นศูนย์
6. ห้าม encryption, data descriptor, ZIP64, extra field, archive/file comment, directory entry, symlink, duplicate entry, ชื่อ local/central ไม่ตรงกัน, path traversal, absolute path, backslash และ case-fold collision
7. CRC-32 และ size fields ใน local/central records ต้องตรงกัน; central-directory order ต้องตรง local-entry order
8. บังคับ controlled-pilot policy: ไม่เกิน 32 entries, 16 MiB ต่อ entry, uncompressed รวมไม่เกิน 64 MiB, path ไม่เกิน 128 UTF-8 bytes และห้าม multi-disk archive

การใช้ method `STORE` ตั้งใจแลก compression กับ byte profile ที่เล็กและ audit ได้ใน pilot หนึ่งเดือน Compression profile ในอนาคตเป็น normative schema change ซึ่งต้องเพิ่ม version, มี golden ZIP fixtures และผ่าน approval matrix ใหม่ครบ

ชื่อไฟล์ขณะ shadow mode:

```text
NFP-factory-packet-<jobRunId>-<packetContentHex-first12>.zip
```

`packetContentHex-first12` หมายถึง 12 lowercase hexadecimal characters แรก **หลัง** literal `sha256:` เท่านั้น ห้ามนำ colon เข้า filename โดย regex ขณะ shadow mode คือ:

```text
^NFP-factory-packet-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[0-9a-f]{12}\.zip$
```

Source filename เป็น verifier input ที่บังคับขณะ shadow mode แต่ยังเป็น UX/policy warning ไม่ใช่ hash/signature input หาก verifier ไม่ได้รับ source filename ต้อง fail closed ด้วย `PKT_FILENAME_INVALID`

## 7. Canonical byte rules

1. JSON ทุกไฟล์ต้องเป็น UTF-8 ไม่มี BOM และ serialize ตาม RFC 8785 JSON Canonicalization Scheme (JCS)
2. v2 JSON schema ทุกตัวต้องตั้ง `additionalProperties: false`; parser ต้อง reject duplicate keys ก่อนสร้าง object รวมทั้ง `NaN`, infinity, negative zero, unsafe integer และ unknown fields
3. Canonical manufacturing dimensions ใช้ signed integer micrometres ใน field ที่ลงท้าย `Um` Source decimal millimetres ต้อง parse จาก decimal text ที่มีทศนิยมไม่เกินสามหลักแล้วแปลงแบบ exact (`1.234 mm` → `1234 Um`); ต้อง reject precision เกิน, exponent notation, binary-floating rounding และ silent truncation
4. Text files ต้อง UTF-8, LF (`0x0a`) เท่านั้น, ไม่มี BOM และไม่มี CR (`0x0d`)
5. Binary files hash จาก raw bytes
6. SHA-256 hex ต้องเป็น lowercase 64 ตัว; field identity ใช้รูป `sha256:<64-lowercase-hex>`
7. `sizeBytes` คือจำนวน raw bytes จริง ไม่ใช่จำนวนอักขระ
8. Canonical path ใช้ `/`, Unicode NFC, case-sensitive และ sort แบบ unsigned UTF-8 byte lexicographic; ห้าม `.`/`..`, empty segment, leading `/`, backslash, control character, duplicate หรือ case-fold collision
9. Array ทุก field ต้องมี schema-level `x-monolith-orderBy` ที่อนุมัติแล้ว Builder ต้อง sort ตามกฎก่อน JCS; หากไม่มีกฎให้คืน `PKT_SCHEMA_UNSUPPORTED` และ set-like array ต้อง reject duplicate canonical keys
10. Canonical RFC 3339 timestamp ใช้รูป `YYYY-MM-DDTHH:mm:ss.sssZ` เท่านั้น; UUID ใช้ lowercase RFC 4122 canonical text; semantic version ใช้ SemVer 2.0.0 โดยไม่มี `v` นำหน้า

v2 schema registry เป็น closed allowlist อย่างน้อยต้องมี ID ต่อไปนี้ และห้ามแทนที่หรือแก้ schema เงียบภายใต้ ID เดิม:

| File/object | Schema ID | เจ้าของ canonical array policy |
| --- | --- | --- |
| `manifest.json` | `monolith.factory.packet@2.0` | Tech Lead |
| `attestation.json` | `monolith.factory.packet-attestation@1.0` | Tech Lead + Security Owner |
| `connector-ops.json` | `monolith.factory.connector-ops@2.0` | Tech Lead + Factory Owner |
| `connectors.minifix.json` | `monolith.factory.connectors-minifix@2.0` | Factory Owner |
| `cutlist.json` | `monolith.factory.cutlist@2.0` | Factory Owner |
| `drillmap.json` | `monolith.factory.drillmap@2.0` | Factory Owner |
| `gate-result.json` | `monolith.factory.gate-result@2.0` | Tech Lead |
| machine-profile descriptor | `monolith.machine-profile@1.0` | Factory Owner + Security Owner |

Approved schema bundle และ aggregate SHA-256 เป็น verifier-policy input หาก payload schema หรือ `x-monolith-orderBy` ใดไม่มีใน bundle นี้ ห้ามอนุมัติ S17-3 และ S17-4 ห้ามเดา

Machine-profile digest input มี closed top-level shape ต่อไปนี้ โดย `parameters` เป็น closed version-specific object ที่ Factory Owner อนุมัติ:

```json
{
  "schema": "monolith.machine-profile@1.0",
  "id": "kdt_mvp_v1",
  "version": "1.0.0",
  "units": "um",
  "parameters": {}
}
```

## 8. Per-file manifest format

`manifest.json` ใช้ schema identifier `monolith.factory.packet@2.0` และมี exact top-level shape ต่อไปนี้ ทุก field ที่แสดงบังคับ nested object ทุกตัวเป็น closed object และห้าม additional properties:

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
    "buildCommit": "<40-lowercase-hex>",
    "artifactSha256": "sha256:<exporter-artifact-digest>"
  },
  "files": [
    {
      "path": "cutlist.json",
      "mediaType": "application/json",
      "contentSchema": "monolith.factory.cutlist@2.0",
      "sizeBytes": 123,
      "sha256": "<64-lowercase-hex>"
    }
  ]
}
```

ข้อบังคับ:

- `releasedRevision.state` ต้องเป็น literal `RELEASED`; ค่าอื่นสร้าง packet ไม่ได้
- `machineProfile.version` ต้องแยกจาก `id` แม้ ID มีคำว่า v1 โดย digest คือ `SHA256(UTF8("MONOLITH_MACHINE_PROFILE_V1\n") || UTF8(JCS(profileDescriptor)))` และ `profileDescriptor` คือ object `monolith.machine-profile@1.0` ทั้งหมดที่ไม่มี digest field
- `exporter.buildCommit` ผูก source revision และ `artifactSha256` ผูก exact deployed exporter artifact; version อย่างเดียวไม่พอ
- `contentSchema` บังคับสำหรับ JSON payload ทุกไฟล์; `NOT_FOR_PRODUCTION.txt` ใช้ `monolith.factory.nfp-marker@1.0`
- `files` เรียง canonical path, path ไม่ซ้ำ และต้องครบทุกรายการจริงใน ZIP ยกเว้น control files สองตัว
- `createdAt`, `jobRunId`, actor, signature และ wall-clock fields ห้ามอยู่ใน manifest เพราะทำลาย content determinism

### 8.1 Normative ownership และ validation registry

| Field/bytes | Authoritative source | Validation rule |
| --- | --- | --- |
| `releasedRevision.projectId/revisionId/state` | Track A authenticated-server contract | server lookup, project ตรง, literal `RELEASED`; lookup ไม่ได้ต้อง fail closed |
| `machineProfile.id/version` | Factory Owner approved registry | exact allowlisted pair |
| `machineProfile.sha256` | canonical profile descriptor | domain-separated digest ตามข้างต้นและต้องตรง registry |
| `exporter.id/version/buildCommit/artifactSha256` | trusted build pipeline + S17-4 service | exact allowlisted build และ artifact digest |
| `files[].path/mediaType/contentSchema/sizeBytes/sha256` | deterministic S17-4 builder | canonical path/schema, raw byte count และ raw-byte SHA-256 |
| `packetContentId` | deterministic S17-4 builder | recompute จาก descriptor ทั้งหมดโดย omit เฉพาะ field นี้ |
| `actorSubjectId/authorizationContextId` | Track A authenticated-server contract | opaque server-derived IDs; reject ค่าจาก client |
| `jobRunId/idempotencyFingerprint` | S17-4 transactional run service | UUID v4 และ one-to-one run/content binding |
| `issuedAt` | S17-4 trusted server clock | exact millisecond UTC format และอยู่ใน verifier-policy skew |
| signature protected header/key state | Security Owner trusted registry | protected preimage, approved Ed25519 key และ lifecycle rules ใน §10.2 |

### 8.2 การคำนวณ `packetContentId`

1. Parse และ validate manifest draft โดยยังไม่มี field `packetContentId`
2. เรียง/validate `files` และทุก identity field ตาม schema
3. สร้าง `contentDescriptor` = manifest object ทั้งหมดโดย **omit เฉพาะ `packetContentId`**
4. `descriptorBytes = UTF8(JCS(contentDescriptor))`
5. `packetContentId = "sha256:" + lowercaseHex(SHA256(descriptorBytes))`
6. ใส่ field กลับแล้ว serialize `manifest.json` ด้วย JCS

Path, size และ hash อยู่ใน preimage จึงป้องกันการสลับชื่อไฟล์ที่มี hash ชุดเดิม ซึ่ง `contentHash` v1 ที่ hash เฉพาะ sorted hashes ป้องกันไม่ได้

## 9. Server-owned `jobRunId`

CT-DEC-003 ตรึง ownership ว่า Track A เป็นเจ้าของ `actorSubjectId`, authorization context และ RELEASED-only contract ส่วน **S17-4 เป็นเจ้าของ transactional `jobRunId` allocation**

1. S17-4 ต้องเรียก Track A contract ก่อน และบังคับ authentication/authorization, RELEASED state และ machine-profile authorization
2. S17-4 สร้าง/validate canonical content descriptor, คำนวณ `packetContentId` และคำนวณ `idempotencyFingerprint = "sha256:" + SHA256(UTF8("MONOLITH_EXPORT_REQUEST_V1\n") || UTF8(JCS(canonicalAuthorizedRequest)))`
3. S17-4 allocate `jobRunId` ใน durable transaction เดียว แล้วผูกกับ `packetContentId`, idempotency key/fingerprint, actor, revision, profile และ run state ก่อนทำ attestation
4. รูปแบบ ID คือ lowercase RFC 4122 UUID v4 canonical string
5. ต้อง reject `jobRunId`, actor, authorization context หรือ fingerprint ที่ client ส่งมา ห้าม trust
6. หนึ่ง accepted export attempt มีหนึ่ง `jobRunId`; explicit rebuild ต้องได้ ID ใหม่แม้ `packetContentId` เดิม
7. Retry ด้วย idempotency key และ fingerprint เดิมต้องคืน accepted record และ `jobRunId` เดิม; key เดิมกับ fingerprint ต่างต้อง fail `PKT_IDEMPOTENCY_CONFLICT`
8. Persistent storage ห้ามผูก `jobRunId` เดียวกับหลาย `packetContentId`; transaction ที่ fail ห้ามปล่อย ID ให้ reuse

## 10. Signed attestation และ identity

`attestation.json` เป็น run-specific control file และมี exact top-level shape ต่อไปนี้ ทุก field ที่แสดงบังคับ nested object ทุกตัวเป็น closed object และห้าม additional properties:

```json
{
  "schema": "monolith.factory.packet-attestation@1.0",
  "jobRunId": "<server-owned-uuid-v4>",
  "packetContentId": "sha256:<64-lowercase-hex>",
  "manifestSha256": "sha256:<sha256-of-exact-manifest-bytes>",
  "issuedAt": "<RFC3339-UTC>",
  "actorSubjectId": "<server-derived-opaque-subject>",
  "authorizationContextId": "<server-derived-opaque-context>",
  "idempotencyFingerprint": "sha256:<authorized-request-digest>",
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
    "buildCommit": "<same-as-manifest>",
    "artifactSha256": "<same-as-manifest>"
  },
  "packetSchema": "monolith.factory.packet@2.0",
  "gate": {
    "result": "PASS",
    "policyVersion": "<version>",
    "evidenceFile": "gate-result.json",
    "evidenceSha256": "sha256:<same-file-digest-as-manifest>"
  },
  "signature": {
    "protected": {
      "algorithm": "Ed25519",
      "keyId": "<trusted-registry-key-id>",
      "registryVersion": "<trusted-registry-version>"
    },
    "valueBase64": "<canonical-base64-signature>"
  }
}
```

Signed identity ต้องผูกอย่างน้อย `jobRunId`, `packetContentId`, exact manifest digest, released revision, machine profile ID+version+digest, exporter ID+version+build commit+artifact digest, packet schema, gate result/policy/evidence digest, issued time, server-derived actor/authorization context, idempotency fingerprint และ protected signature header

### 10.1 Signature preimage

1. สร้าง `unsignedAttestation` โดยคง `signature.protected` และ omit **เฉพาะ** `signature.valueBase64`
2. `message = UTF8("MONOLITH_FACTORY_PACKET_ATTESTATION_V1\n") || UTF8(JCS(unsignedAttestation))`
3. KMS/HSM ลงลายเซ็น Ed25519 บน `message`
4. `valueBase64` encode signature 64 bytes พอดีเป็น RFC 4648 standard Base64 แบบ padded (88 characters ลงท้าย `==`) ห้าม whitespace หรือ alternate encoding
5. `keyId` และ `registryVersion` เลือก record จาก trusted registry ของ verifier; packet-embedded key/registry ห้ามสร้าง trust ให้ตัวเอง

การเปลี่ยน algorithm, key ID, registry version หรือ identity field ใด ๆ หลัง sign ต้องทำให้ signature fail

### 10.2 Trusted-key lifecycle และ revocation

Trusted-registry record ทุกตัวประกอบด้วย canonical `keyId`, Ed25519 public-key bytes, `notBefore`, `notAfter`, state (`ACTIVE`, `RETIRED` หรือ `REVOKED`), optional `retiredAt/revokedAt`, reason และ signed registry version ที่เพิ่มขึ้นเสมอ Verifier policy ต้อง pin minimum accepted registry version/digest และ packet ห้าม rollback ค่าเหล่านี้

- `issuedAt` ต้องผ่าน `notBefore <= issuedAt < notAfter`
- `ACTIVE` รับได้เฉพาะภายใต้ approved current registry
- `RETIRED` รับได้เฉพาะเมื่อ `issuedAt < retiredAt` และ verifier policy อนุญาต historical verification ชัดเจน
- `REVOKED` ต้อง fail `PKT_KEY_REVOKED` เสมอ รวม signature ที่ออกก่อน `revokedAt`
- unknown, not-yet-valid และ expired key ต้องคืน stable code เฉพาะ
- registry/revision/profile/gate authoritative lookup ล้มเหลวต้องคืน `PKT_AUTHORITY_UNAVAILABLE`; stale หรือ packet-supplied trust data ห้ามสร้าง PASS

S17-6 เป็นเจ้าของ custody, provisioning, rotation ceremony และ evidence แต่ lifecycle semantics เหล่านี้เป็น normative สำหรับ S17-5 แล้ว ห้ามเลื่อนไปเดาใน implementation

## 11. Shadow mode / NOT-FOR-PRODUCTION contract

ขณะที่ real-cut gate ยังไม่ผ่านครบสี่เงื่อนไข:

1. `NOT_FOR_PRODUCTION.txt` ต้องมีอยู่และอยู่ใน `manifest.files`
2. bytes ต้องตรงค่าที่ exporter version กำหนดจาก `src/core/config/shadowMode.ts`: 824 UTF-8 bytes, LF เท่านั้น, ไม่มี trailing LF, SHA-256 `40a4d63fccde43c92e2f9ca3a0284db61254cd5b03d5eac072f33b2dc507d68a`
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
2. **Strict parse**: UTF-8/JCS/schema-bundle digest, reject duplicate key ก่อนสร้าง object และ exact supported versions
3. **Exact file set**: payload ทุกไฟล์ตรง manifest; ไม่มี missing/extra นอกจาก control files ที่กำหนด
4. **Byte integrity**: `sizeBytes` และ SHA-256 ต่อไฟล์
5. **Content identity**: recompute `packetContentId` จาก descriptor
6. **Manifest binding**: recompute exact `manifestSha256`
7. **Identity consistency**: revision/profile/exporter/schema/packet ID, authorization context และ gate fields ตรงกันใน attestation, manifest และ gate evidence
8. **Signature**: protected algorithm/key/registry lookup, lifecycle state และ Ed25519 verify
9. **Authoritative checks**: revision ยังเป็น RELEASED, project ตรง, machine profile/version/digest ได้รับอนุญาต, exporter build+artifact อยู่ allowlist, registry current และ gate evidence PASS ตาม policy ที่รองรับ
10. **Run/replay checks**: `jobRunId` ไม่ชน content อื่น, idempotency/replay policy ผ่าน
11. **Shadow policy**: marker+prefix สอดคล้อง governance state; NFP แสดง NO_CUT เสมอ
12. **Audit result**: เก็บ verifier version, policy versions, checked hashes, result code, time และ human/operator context โดยไม่เขียนทับ evidence เดิม

Verifier ห้าม “warn แล้วผ่าน” เมื่อ schema/key/state ไม่รู้จัก, network/state lookup ที่จำเป็นล้มเหลว หรือ evidence ขาด

Primary result code คือ check แรกที่ fail ตามลำดับหมายเลข Audit record อาจบันทึก later diagnostic findings ได้ แต่ห้ามแทนหรือ downgrade primary stable code ผลสำเร็จต้องแยกสาม field:

```json
{
  "integrityStatus": "VERIFIED",
  "operationalDisposition": "NO_CUT",
  "code": "PKT_OK_SHADOW_ONLY"
}
```

ขณะ shadow mode นี่คือผลสูงสุดที่ออกได้ `PKT_OK` เป็น reserved code และห้าม emit จนกว่า governance-controlled production profile รุ่นถัดไปจะผ่าน real-cut gate ครบสี่เงื่อนไขและเพิ่ม normative version

## 13. Stable result codes ขั้นต่ำ

| Code | ความหมาย | ผล |
| --- | --- | --- |
| `PKT_OK_SHADOW_ONLY` | integrity/signature ผ่านแต่ NFP ยังบังคับ | VERIFIED_SHADOW_ONLY / NO_CUT |
| `PKT_OK` | reserved; ห้ามใช้ขณะ shadow mode | NOT EMITTABLE IN v0.2 PILOT |
| `PKT_LIMIT_EXCEEDED` | container เกิน policy | FAIL |
| `PKT_ZIP_PROFILE_INVALID` | ZIP header/metadata/profile ไม่ตรง §6 | FAIL |
| `PKT_PATH_INVALID` | path traversal/duplicate/collision | FAIL |
| `PKT_FILENAME_INVALID` | source filename ขณะ shadow ขาดหรือผิดรูป | FAIL / NO_CUT |
| `PKT_SCHEMA_UNSUPPORTED` | schema/version ไม่รองรับ | FAIL |
| `PKT_JSON_NON_CANONICAL` | JSON ไม่ตรง canonical rules | FAIL |
| `PKT_ATTESTATION_INVALID` | attestation shape/time/Base64 ผิดรูป | FAIL |
| `PKT_FILE_MISSING` / `PKT_FILE_EXTRA` | file set ไม่ตรง | FAIL |
| `PKT_SIZE_MISMATCH` / `PKT_HASH_MISMATCH` | bytes ไม่ตรง manifest | FAIL |
| `PKT_CONTENT_ID_MISMATCH` | packetContentId คำนวณใหม่ไม่ตรง | FAIL |
| `PKT_MANIFEST_BINDING_MISMATCH` | attestation ไม่ผูก exact manifest | FAIL |
| `PKT_IDENTITY_MISMATCH` | identity ซ้ำสองชั้นไม่ตรงกัน | FAIL |
| `PKT_SIGNATURE_MISSING` / `PKT_SIGNATURE_INVALID` | signature ขาด/ผิด | FAIL |
| `PKT_KEY_UNKNOWN` / `PKT_KEY_REVOKED` | trust key ใช้ไม่ได้ | FAIL |
| `PKT_KEY_NOT_YET_VALID` / `PKT_KEY_EXPIRED` | key lifecycle window ปฏิเสธ `issuedAt` | FAIL |
| `PKT_AUTHORITY_UNAVAILABLE` | registry/revision/profile/gate lookup ที่บังคับใช้ไม่ได้ | FAIL / NO_CUT |
| `PKT_REVISION_NOT_RELEASED` | revision ไม่ใช่ RELEASED | FAIL |
| `PKT_MACHINE_PROFILE_MISMATCH` | profile/version/digest ไม่อนุญาต | FAIL |
| `PKT_EXPORTER_UNTRUSTED` | exporter build ไม่อยู่ allowlist | FAIL |
| `PKT_GATE_FAILED` | gate evidence ไม่ PASS/ไม่รองรับ | FAIL |
| `PKT_GATE_EVIDENCE_MISMATCH` | gate file กับ signed gate fields ไม่ตรงกัน | FAIL |
| `PKT_JOB_RUN_CONFLICT` | run ID ผูก content อื่นหรือ replay ผิด policy | FAIL |
| `PKT_IDEMPOTENCY_CONFLICT` | idempotency key เดียวถูกใช้กับ fingerprint ต่าง | FAIL |
| `PKT_NFP_POLICY_MISMATCH` | marker/prefix ไม่ตรง governance state | FAIL / NO_CUT |

ข้อความ UI อาจแปลภาษา แต่ stable code และ severity ห้ามเปลี่ยนตาม locale

## 14. Tamper corpus ขั้นต่ำ

S17-5 ต้องมี negative fixtures อย่างน้อย:

1. เปลี่ยน payload 1 byte
2. สลับชื่อสองไฟล์แต่ใช้ hash set เดิม
3. missing file, extra file, duplicate ZIP entry และ case-fold collision
4. path traversal, absolute path, backslash, symlink, ZIP bomb, local/central name ไม่ตรง, data descriptor, ZIP64, extra field/comment, timestamp, flags, permissions และ compression-method mutation
5. size/hash/packetContentId/manifest digest ผิดทีละ field
6. duplicate JSON key, non-canonical number/encoding/BOM/CRLF, millimetre precision เกิน, negative zero, unsafe integer, array-order rule ขาด และ randomized array order
7. แก้ revision, profile ID/version/digest, exporter version/build commit/artifact digest, schema, actor, authorization context หรือ idempotency fingerprint หลัง sign
8. signature ขาด, bit-flip, protected algorithm/key ID/registry version ถูกเปลี่ยน, wrong key, unknown key, revoked/retired/expired/not-yet-valid key, registry rollback และ placeholder key ว่าง
9. `jobRunId`, actor หรือ authorization context จาก client; malformed UUID; reuse กับ packetContentId อื่น; transaction rollback/reuse และ idempotency conflict
10. revision DRAFT/FROZEN, gate FAIL, signed/file gate mismatch, unsupported gate policy และ authoritative lookup unavailable
11. ลบ/แก้ `NOT_FOR_PRODUCTION.txt`, ลบ `NFP-`, ไม่มี source filename, ใส่ colon จาก literal `sha256:` ใน filename หรือพยายามใช้ NFP packet เป็น production
12. same canonical inputs randomized order/timezone/locale แล้ว payload+manifest+packetContentId ต้องเหมือนเดิม
13. same content สอง accepted runs ต้อง packetContentId เดิมแต่ jobRunId ต่าง และต่างเฉพาะ run-specific allowlist

ทุก fixture ต้องระบุ expected stable code และพิสูจน์ว่า verifier ไม่สร้างสถานะ VERIFIED เมื่อ FAIL

## 15. As-built gap ณ baseline

| Target contract | As-built `9ac7cff3` | สถานะ |
| --- | --- | --- |
| server-owned `jobRunId` | client สร้าง `job-${Date.now()}-${random}` | GAP — S17-4 โดยใช้ Track A contract |
| path-aware `packetContentId` | `contentHash` hash เฉพาะ sorted file hashes ไม่รวม path | GAP — rename ambiguity |
| deterministic manifest | มี `createdAt: new Date().toISOString()` | GAP — S17-4 |
| explicit machine profile/version/digest + released revision | manifest v1 ไม่มี | GAP |
| exporter ID/version/build commit | มีเพียง `toolVersion` | GAP |
| mandatory signed attestation | signature optional และ full trust path ยังไม่บังคับ | GAP — S17-5/S17-6 |
| full verifier | client verifier ตรวจ file/hash/contentHash/gate บางส่วน; server evidence เดิมตื้น | GAP — S17-5 |
| NFP marker/file prefix | `NOT_FOR_PRODUCTION.txt` + `NFP-` มีจริง | PRESENT — ต้อง preserve |
| deterministic ZIP | browser JSZip ใช้ runtime metadata/filename timestamp | GAP — S17-4 |
| deterministic gate evidence | `gate-result.json` มี `runAt` และ human `message` | GAP — S17-4; แยก content/run plane |
| canonical byte ordering | builder/gate sorting ใช้ `localeCompare()` | GAP — S17-4; เปลี่ยนเป็น unsigned UTF-8 byte ordering |
| exact quantity normalization | serializer ใช้ floating-point `Math.round()` | GAP — S17-4; เปลี่ยนเป็น exact decimal-to-`Um` conversion |

ตารางนี้เป็น code-review finding ไม่ใช่ P0 closure

## 16. S17-3 acceptance criteria

S17-3 ปิดได้เมื่อ:

1. ฉบับ TH/EN และ HTML ตรงกัน พร้อม SHA-256 manifest ใน repo
2. Tech Lead, Factory Owner และ Security Owner ลง APPROVED แยกบทบาทครบ
3. ทุก normative field มี owner, source และ validation rule พร้อม approved schema bundle/digest
4. packetContentId/jobRunId/signed identity ไม่มี circular hash หรือ run/content ambiguity
5. per-file format, canonical bytes, ZIP byte profile, NFP policy, verifier order/result codes และ tamper corpus ถูกอนุมัติ
6. มี implementation mapping สำหรับ S17-4 และ independent verifier assignment สำหรับ S17-5 โดย builder ไม่ approve งานตัวเอง
7. การเปลี่ยน normative contract หลังอนุมัติต้องเพิ่ม version และผ่าน approval matrix ใหม่

ก่อนครบเจ็ดข้อ สถานะคือ DRAFT และ Track B implementation ยังคงล็อก

## 17. Open approval questions

1. Factory Owner ยืนยัน required payload set, schema registry/order keys, controlled-pilot ZIP limits และ `kdt_mvp_v1` ID/version/profile digest contract หรือไม่
2. Tech Lead ยืนยัน JCS + exact integer-micrometre normalization, method-0 ZIP profile, UUID v4/idempotency transaction semantics และ S17-4 run ownership หรือไม่
3. Security Owner ยืนยัน protected Ed25519 header, trusted-registry minimum version/digest, fail-closed lookup และ revocation behavior หรือไม่
4. ทั้งสามบทบาทยอมรับ determinism boundary ว่า canonical payload deterministic แต่ run-specific attestation ทำให้ outer ZIP ต่างข้าม run ได้หรือไม่
5. ทั้งสามบทบาทยืนยันการ reserve `PKT_OK` และจำกัด shadow pilot ไว้ที่ `PKT_OK_SHADOW_ONLY / NO_CUT` หรือไม่

คำถามเหล่านี้ต้องปิดใน approval review ห้าม implement ด้วยการเดา

## 18. แผนที่แก้ independent review ใน v0.2

| Review blocker | การแก้ใน v0.2 |
| --- | --- |
| 1. algorithm/key ID อยู่นอก signature | §10.1 คง `signature.protected` และ omit เฉพาะ `valueBase64`; §14 เพิ่ม protected-header tampering |
| 2. gate evidence ปน content/run planes | §4.2 นิยาม deterministic gate evidence และย้ายเวลา/operator/localized text ไป attestation/audit |
| 3. schema/quantization/order ยังไม่ precise | §7 เพิ่ม closed schema registry, exact decimal-to-integer-`Um`, array-order rules; §8.1 เพิ่ม owner/source/validation registry |
| 4. filename/ZIP profile กำกวม | §6 ตัดปัญหา colon จาก `sha256:` และ freeze method-0 ZIP byte profile กับ pilot limits |
| 5. key lifecycle/revocation ยังไม่ปิด | §10.2 นิยาม registry anti-rollback, validity, retirement, revocation และ unavailable-authority behavior |
| 6. fail-closed codes/operational status ไม่ครบ | §§12–14 เพิ่ม precedence, missing codes, tamper fixtures และ shadow-only maximum status |

Remediation map นี้เป็น diff summary สำหรับ re-review ไม่ใช่ approval หรือ closure claim
