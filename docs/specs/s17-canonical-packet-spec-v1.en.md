# CT-DEC-002 / S17-3 — Canonical Factory Packet Specification

Document version: 0.1  
Drafted: 2026-07-11  
Status: **DRAFT — NOT APPROVED — NOT FOR IMPLEMENTATION AUTHORITY**  
Inspected baseline: `9ac7cff39d02d9430879275645e377728bc0abc5`  
Drafted by: Codex in an advisory/non-authoritative capacity  
Governing inputs: PRD v5.1, Review v3.2, CT-DEC-001, ADR-065  

> This document is a target-state contract submitted for approval. It does not prove current implementation, close S17-3, or unlock S17-4/S17-5 until all three approval roles have signed.

## 1. Approval matrix

| Role | Required review scope | Status | Signer/date |
| --- | --- | --- | --- |
| Tech Lead | schema, canonicalization, determinism, feasibility | **PENDING** | — |
| Factory Owner | file contract, machine binding, verifier flow, factory fit | **PENDING** | — |
| Security Owner | signature, trust boundary, key semantics, fail-closed | **PENDING** | — |

Status may change to APPROVED only when all three fields are APPROVED. If one person holds both Tech Lead and Security Owner roles, each role must be approved separately.

## 2. Purpose and scope

This specification defines the minimum Factory Packet v2 contract needed to close the gaps among content identity, execution identity, and manufacturing trust:

1. `packetContentId` identifies canonical manufacturing content
2. `jobRunId` identifies each export/attestation run and is server-owned
3. signed identity binds the released revision, machine-profile version, exporter version, packet schema, and content/run identity
4. the manifest identifies every payload file by path, media type, byte size, and SHA-256
5. the verifier performs fail-closed verification of signature, release state, machine profile, and the tamper corpus
6. the shadow-mode `NOT_FOR_PRODUCTION.txt` marker and `NFP-...` ZIP name remain mandatory until the real-cut gate passes

Outside S17-3 scope: generator/verifier implementation (S17-4/S17-5), key ceremony and production-key provisioning (S17-6), cloud-provider selection, and authorization to cut real workpieces.

## 3. Normative language

The terms **MUST, MUST NOT, REQUIRED, SHOULD, and MAY** are normative in the RFC 2119 sense. The Thai edition uses equivalent terms. If the TH and EN editions conflict, approval must stop and both editions must be corrected; an implementer must not choose one interpretation unilaterally.

## 4. Two-identity separation principle

Factory Packet v2 separates two layers explicitly:

| Layer | Identifier | Property |
| --- | --- | --- |
| Canonical content plane | `packetContentId` | deterministic; the same payload+manifest under the same revision/profile/exporter/schema produces the same value |
| Execution/attestation plane | `jobRunId` | server-owned; unique per accepted export run; may differ for identical content |

Rationale: one revision can be exported more than once and target multiple profiles/exporters. Reusing one identifier for content and run causes collisions and prevents reliable replay auditing.

### 4.1 Permitted determinism claim

Given identical authoritative input, released revision, machine profile+version+digest, exporter build, and schema:

- every payload file, `manifest.json`, and `packetContentId` **MUST be byte-for-byte identical**
- ZIP entry order/metadata/compression under the same exporter build **MUST be deterministic**
- `attestation.json`, the filename, and the complete ZIP **MAY differ** only in intentionally run-specific fields: `jobRunId`, `issuedAt`, actor, and the signature covering those fields
- any difference outside that allowlist is an S17-4 failure

The outer ZIP from different runs must not be claimed as byte-for-byte identical because that would contradict the requirement for a unique `jobRunId`.

## 5. Trust boundary and ownership

| Component/actor | Trusted for | Prohibited/required behavior |
| --- | --- | --- |
| Browser/client | submitting intent and displaying results | untrusted input; must not own actor, role, release state, `jobRunId`, key ID, or machine authorization |
| Authenticated server | actor subject, authorization, revision state, run allocation | derive from verified session/JWT and server data; never trust `x-actor-role` or localStorage |
| Deterministic builder | canonical payload/manifest construction | consume normalized authoritative input only; never hold the raw private key |
| Managed KMS/HSM | Ed25519 signing | private key is non-exportable; key lifecycle belongs to S17-6 |
| Full verifier | byte, identity, signature, and authoritative-state checks | independent from the builder under CT-DEC-001; fail closed when data is missing or unknown |
| Factory operator | acting on verifier status | never substitute filename/UI labels for verifier result; an NFP marker always means no real cutting |

## 6. Delivery layout

The v2 ZIP contains only these root entries:

```text
manifest.json
attestation.json
connector-ops.json
connectors.minifix.json
cutlist.json
drillmap.json
gate-result.json
NOT_FOR_PRODUCTION.txt    # REQUIRED in shadow mode
```

The payload set may be extended in a schema minor version after approval-matrix review, but every payload file must appear in `manifest.files`. `manifest.json` and `attestation.json` are control files and are excluded from `manifest.files` to avoid self-hash recursion.

The ZIP MUST:

1. contain no folder prefix or directory entries
2. order `manifest.json` first, then payloads in canonical path order, then `attestation.json`
3. use fixed entry timestamp `1980-01-01T00:00:00Z`, fixed permissions/platform flags, and a compression algorithm/level pinned by exporter version
4. reject encrypted ZIPs, unsupported data descriptors, duplicate entries, path traversal, absolute paths, symlinks, and case-fold collisions
5. enforce versioned verifier-policy limits for compressed/uncompressed size, entry count, and compression ratio

Shadow-mode filename:

```text
NFP-factory-packet-<jobRunId>-<packetContentId-first12>.zip
```

The filename is a UX warning only. It is not an input to hashing/signing and is never used as evidence of validity.

## 7. Canonical byte rules

1. Every JSON file MUST be UTF-8 without BOM and serialized using RFC 8785 JSON Canonicalization Scheme (JCS)
2. JSON MUST reject duplicate keys, `NaN`, `Infinity`, `-Infinity`, and unknown fields where the schema states `additionalProperties: false`
3. Manufacturing dimensions MUST be quantized by their domain schema before JCS; v2 permits precision up to 0.001 mm, and a generic serializer must not silently round values
4. Text files MUST be UTF-8, LF (`0x0a`) only, without BOM or CR (`0x0d`)
5. Binary files are hashed over raw bytes
6. SHA-256 hex is 64 lowercase characters; identity fields use `sha256:<64-lowercase-hex>`
7. `sizeBytes` is the actual raw-byte count, not character count
8. Canonical paths use `/`, Unicode NFC, case sensitivity, and unsigned UTF-8 byte lexicographic order; `.`, `..`, empty segments, leading `/`, backslashes, control characters, duplicates, and case-fold collisions are forbidden

## 8. Per-file manifest format

`manifest.json` uses schema identifier `monolith.factory.packet@2.0` and has at least this shape:

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

Requirements:

- `releasedRevision.state` is the literal `RELEASED`; no other state may produce a packet
- `machineProfile.version` is separate from `id` even when the ID includes “v1”; `sha256` binds canonical profile bytes so a label cannot be changed silently
- `exporter.buildCommit` binds the artifact to exporter source revision; version alone is insufficient
- `files` is in canonical path order with no duplicate path and exactly covers every ZIP payload except the two control files
- `createdAt`, `jobRunId`, actor, signature, and wall-clock fields are forbidden in the manifest because they break content determinism

### 8.1 Calculating `packetContentId`

1. Parse and validate a manifest draft with no `packetContentId` field
2. Sort and validate `files` and all identity fields against the schema
3. Set `contentDescriptor` to the full manifest object with **only `packetContentId` omitted**
4. Set `descriptorBytes = UTF8(JCS(contentDescriptor))`
5. Set `packetContentId = "sha256:" + lowercaseHex(SHA256(descriptorBytes))`
6. Restore the field and serialize `manifest.json` with JCS

Path, size, and hash are part of the preimage. This prevents file-renaming attacks that v1's hash-of-sorted-hashes `contentHash` cannot detect.

## 9. Server-owned `jobRunId`

1. The server MUST allocate it only after authentication/authorization, RELEASED check, and machine-profile authorization succeed
2. The v1 format is a lowercase RFC 4122 UUID v4 canonical string
3. A client-supplied `jobRunId` MUST be ignored or rejected, never trusted
4. One accepted export attempt has one `jobRunId`; an explicit rebuild receives a new ID even if `packetContentId` is unchanged
5. A retry with the same idempotency key returns the same accepted record and `jobRunId`; reuse of the key with different payload fails with conflict
6. Persistent storage MUST NOT bind one `jobRunId` to more than one `packetContentId`

## 10. Signed attestation and identity

`attestation.json` is a run-specific control file with at least this shape:

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

Signed identity binds at minimum `jobRunId`, `packetContentId`, exact manifest digest, released revision, machine-profile ID+version+digest, exporter ID+version+build commit, packet schema, gate result/policy/evidence digest, issued time, and server-derived actor.

### 10.1 Signature preimage

1. Create `unsignedAttestation` by omitting only the top-level `signature`
2. Set `message = UTF8("MONOLITH_FACTORY_PACKET_ATTESTATION_V1\n") || UTF8(JCS(unsignedAttestation))`
3. Have the KMS/HSM sign `message` with Ed25519
4. `valueBase64` uses padded RFC 4648 standard Base64 with no whitespace
5. `keyId` looks up a key in the trusted public-key registry; a public key embedded in the packet must never establish its own trust

Changing any identity field after signing MUST invalidate the signature.

## 11. Shadow mode / NOT-FOR-PRODUCTION contract

Until all four real-cut gate conditions pass:

1. `NOT_FOR_PRODUCTION.txt` MUST exist and appear in `manifest.files`
2. its bytes MUST match the exporter-version constant from `src/core/config/shadowMode.ts` (UTF-8, LF, no trailing LF at this baseline)
3. the ZIP filename MUST start with `NFP-`
4. the verifier may return integrity PASS, but operational status MUST be `VERIFIED_SHADOW_ONLY / NO_CUT`
5. a missing marker or prefix does not promote the packet; it fails with `PKT_NFP_POLICY_MISMATCH`
6. the marker may be disabled only by governance-controlled configuration after S17-1..5 close, ADR-064 has all four roles, at least one dogfood job completes the full chain, and one machine profile is calibrated

Current marker text:

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

## 12. Full verifier contract (input to S17-5)

The verifier MUST execute these checks in order and stop fail-closed:

1. **Container safety**: size/count/ratio limits, safe paths, no duplicates/case collisions/symlinks/encryption
2. **Strict parse**: UTF-8/JCS/schema, duplicate-key rejection, exact supported versions
3. **Exact file set**: every payload matches the manifest; no missing/extra files beyond specified control files
4. **Byte integrity**: per-file `sizeBytes` and SHA-256
5. **Content identity**: recompute `packetContentId` from the descriptor
6. **Manifest binding**: recompute exact `manifestSha256`
7. **Identity consistency**: revision/profile/exporter/schema/packet ID match across attestation and manifest
8. **Signature**: trusted-registry key lookup, algorithm/key state, Ed25519 verification
9. **Authoritative checks**: revision remains RELEASED, project matches, profile/version/digest is authorized, exporter build is allowlisted, and gate evidence is PASS under a supported policy
10. **Run/replay checks**: `jobRunId` does not collide with other content and idempotency/replay policy passes
11. **Shadow policy**: marker+prefix agree with governance state; NFP always produces NO_CUT
12. **Audit result**: append verifier version, policy versions, checked hashes, result code, time, and human/operator context without overwriting prior evidence

The verifier MUST NOT “warn and pass” when schema/key/state is unknown, a required state lookup fails, or evidence is missing.

## 13. Minimum stable result codes

| Code | Meaning | Result |
| --- | --- | --- |
| `PKT_OK` | all checks pass and governance permits production | VERIFIED (still subject to the external real-cut gate) |
| `PKT_OK_SHADOW_ONLY` | integrity/signature pass while NFP remains mandatory | VERIFIED_SHADOW_ONLY / NO_CUT |
| `PKT_LIMIT_EXCEEDED` | container exceeds policy | FAIL |
| `PKT_PATH_INVALID` | path traversal/duplicate/collision | FAIL |
| `PKT_SCHEMA_UNSUPPORTED` | unsupported schema/version | FAIL |
| `PKT_JSON_NON_CANONICAL` | JSON violates canonical rules | FAIL |
| `PKT_FILE_MISSING` / `PKT_FILE_EXTRA` | file set mismatch | FAIL |
| `PKT_SIZE_MISMATCH` / `PKT_HASH_MISMATCH` | bytes mismatch manifest | FAIL |
| `PKT_CONTENT_ID_MISMATCH` | recomputed content ID differs | FAIL |
| `PKT_MANIFEST_BINDING_MISMATCH` | attestation does not bind exact manifest | FAIL |
| `PKT_IDENTITY_MISMATCH` | duplicated identity fields disagree | FAIL |
| `PKT_SIGNATURE_MISSING` / `PKT_SIGNATURE_INVALID` | signature absent/invalid | FAIL |
| `PKT_KEY_UNKNOWN` / `PKT_KEY_REVOKED` | trust key unusable | FAIL |
| `PKT_REVISION_NOT_RELEASED` | revision is not RELEASED | FAIL |
| `PKT_MACHINE_PROFILE_MISMATCH` | profile/version/digest unauthorized | FAIL |
| `PKT_EXPORTER_UNTRUSTED` | exporter build not allowlisted | FAIL |
| `PKT_GATE_FAILED` | gate evidence not PASS/unsupported | FAIL |
| `PKT_JOB_RUN_CONFLICT` | run ID bound to other content or replay violates policy | FAIL |
| `PKT_NFP_POLICY_MISMATCH` | marker/prefix conflicts with governance state | FAIL / NO_CUT |

UI messages may be localized, but stable codes and severity must not change by locale.

## 14. Minimum tamper corpus

S17-5 requires at least these negative fixtures:

1. mutate one payload byte
2. swap two filenames while preserving the old hash set
3. missing file, extra file, duplicate ZIP entry, and case-fold collision
4. path traversal, absolute path, backslash, symlink, and ZIP-bomb policy
5. incorrect size/hash/packetContentId/manifest digest, one field at a time
6. duplicate JSON key, non-canonical number/encoding/BOM/CRLF
7. mutate revision, profile ID/version/digest, exporter version/build commit, or schema after signing
8. missing signature, bit-flipped signature, wrong key, unknown key, revoked key, and empty placeholder key
9. client-provided `jobRunId`, malformed UUID, reuse with another packetContentId, and idempotency conflict
10. DRAFT/FROZEN revision, gate FAIL, unsupported gate policy, and unavailable authoritative lookup
11. remove/modify `NOT_FOR_PRODUCTION.txt`, remove `NFP-`, or attempt production use of an NFP packet
12. randomize order/timezone/locale for identical canonical inputs; payload+manifest+packetContentId remain identical
13. run the same content in two accepted runs; packetContentId remains equal, jobRunId differs, and only the run-specific allowlist differs

Each fixture identifies an expected stable code and proves that no failing case produces VERIFIED status.

## 15. As-built gap at the baseline

| Target contract | As-built at `9ac7cff3` | Status |
| --- | --- | --- |
| server-owned `jobRunId` | client builds `job-${Date.now()}-${random}` | GAP — S17-1/S17-4 |
| path-aware `packetContentId` | `contentHash` hashes sorted file hashes only, not paths | GAP — rename ambiguity |
| deterministic manifest | contains `createdAt: new Date().toISOString()` | GAP — S17-4 |
| explicit machine profile/version/digest + released revision | absent from manifest v1 | GAP |
| exporter ID/version/build commit | only `toolVersion` exists | GAP |
| mandatory signed attestation | signature is optional and full trust path is unenforced | GAP — S17-5/S17-6 |
| full verifier | client checks some file/hash/contentHash/gate properties; prior server evidence is shallow | GAP — S17-5 |
| NFP marker/file prefix | `NOT_FOR_PRODUCTION.txt` + `NFP-` exist | PRESENT — preserve |
| deterministic ZIP | browser JSZip uses runtime metadata and timestamped filename | GAP — S17-4 |

This table is a code-review finding, not P0 closure.

## 16. S17-3 acceptance criteria

S17-3 may close only when:

1. aligned TH/EN Markdown and HTML editions plus SHA-256 manifest are in the repository
2. Tech Lead, Factory Owner, and Security Owner separately record APPROVED
3. every normative field has an owner, source, and validation rule
4. packetContentId/jobRunId/signed identity have no circular hash or run/content ambiguity
5. per-file format, canonical bytes, ZIP rules, NFP policy, verifier order/result codes, and tamper corpus are approved
6. an implementation mapping exists for S17-4 and an independent-verifier assignment exists for S17-5, with no builder self-approval
7. any normative change after approval increments a version and repeats the approval matrix

Until all seven are satisfied, status remains DRAFT and Track B implementation remains locked.

## 17. Open approval questions

1. Does the Factory Owner approve the required payload set and the `kdt_mvp_v1` ID/version/profile-digest contract?
2. Does the Tech Lead approve JCS + 0.001 mm domain quantization and UUID v4/idempotency semantics?
3. Does the Security Owner approve Ed25519 domain separation, the trusted key registry, and revocation behavior?
4. Do all three roles accept the determinism boundary: canonical payload is deterministic, while run-specific attestation may make outer ZIPs differ across runs?
5. What exact verifier-policy limits (max entries/bytes/ratio) will be frozen before the pilot?

These questions must be resolved during approval review and must not be implemented by guesswork.
