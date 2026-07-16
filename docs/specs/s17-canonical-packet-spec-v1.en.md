# CT-DEC-002 / S17-3 — Canonical Factory Packet Specification

Document version: 0.4.1
Drafted: 2026-07-11  
Revised: 2026-07-15 for the v0.4.1 low-S threshold correction after round-4 re-review
Supersedes: v0.3 at `bf25b10f2c72707097acdb03a8161e8cec8cd36b`
Status: **DRAFT — NOT APPROVED — NOT FOR IMPLEMENTATION AUTHORITY**  
Inspected baseline: `9ac7cff39d02d9430879275645e377728bc0abc5`  
Drafted by: Codex in an advisory/non-authoritative capacity  
Governing inputs: PRD v5.1, Review v3.2, CT-DEC-001, CT-DEC-003, ADR-065, ADR-068

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
5. each JSON payload binds a versioned content schema and canonical array/quantity rules
6. the verifier performs fail-closed verification of signature, release state, machine profile, and the tamper corpus
7. the shadow-mode `NOT_FOR_PRODUCTION.txt` marker and `NFP-...` ZIP name remain mandatory until the real-cut gate passes

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

### 4.2 Gate evidence belongs to the content plane

`gate-result.json` is deterministic content evidence and therefore participates in `manifest.files` and `packetContentId`. It MUST use `monolith.factory.gate-result@2.0` and MUST NOT contain `runAt`, `issuedAt`, `jobRunId`, actor identity, free-form/localized human messages, or other wall-clock/run fields. A finding contains only a stable code, severity, canonically ordered entity IDs, and schema-defined canonical parameters. Finding arrays sort by severity rank, code, entity-ID byte order, then JCS parameter bytes.

Execution time, operator context, and localized display text belong only in the run-specific attestation/audit record. The verifier MUST parse `gate-result.json`, require `PASS`, and prove that result, policy version, schema, file digest, and the duplicated attestation `gate` fields agree. Any disagreement returns `PKT_GATE_EVIDENCE_MISMATCH`.

The packet form of `gate-result.json` has exactly this top-level shape; every field is required and additional properties are forbidden:

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
      "parameters": [
        {
          "key": "measuredUm",
          "type": "INTEGER",
          "value": 18000
        }
      ]
    }
  ]
}
```

## 5. Trust boundary and ownership

| Component/actor | Trusted for | Prohibited/required behavior |
| --- | --- | --- |
| Browser/client | submitting intent and displaying results | untrusted input; must not own actor, role, release state, `jobRunId`, key ID, or machine authorization |
| Track A authenticated-server contract | actor subject, authorization context, revision state | derive from verified session/JWT and server data; never trust `x-actor-role` or localStorage; Track A does not allocate `jobRunId` |
| S17-4 export service | content build, idempotency fingerprint, transactional run allocation | call the Track A contract first; bind one server-owned `jobRunId` to exactly one `packetContentId` |
| Deterministic builder | canonical payload/manifest construction | consume normalized authoritative input only; never hold the raw private key |
| AWS KMS | ECDSA P-256 signing | `ECC_NIST_P256` private key is non-exportable; KMS `Sign` uses `ECDSA_SHA_256`; key lifecycle belongs to S17-6 |
| Full verifier | byte, identity, signature, and authoritative-state checks | independent from the builder under CT-DEC-001; fail closed when data is missing or unknown |
| Factory operator | acting on verifier status | never substitute filename/UI labels for verifier result; an NFP marker always means no real cutting |

## 6. Delivery layout

The v2 ZIP contains only these root entries:

```text
manifest.json
connector-ops.json
connectors.minifix.json
cutlist.json
drillmap.json
gate-result.json
NOT_FOR_PRODUCTION.txt    # REQUIRED in shadow mode
attestation.json
```

The payload set may be extended in a schema minor version after approval-matrix review, but every payload file must appear in `manifest.files`. `manifest.json` and `attestation.json` are control files and are excluded from `manifest.files` to avoid self-hash recursion.

The ZIP MUST use the following v2 byte profile:

1. contain no folder prefix or directory entries
2. order `manifest.json` first, then payloads in canonical path order, then `attestation.json`
3. use ZIP method 0 (`STORE`) for every entry; DEFLATE and every other compression method are forbidden in v2
4. set DOS date bits to `0x0021` (1980-01-01) and DOS time bits to `0x0000`; timezone conversion is forbidden
5. set general-purpose flags to `0x0800` (UTF-8 names only), version-needed to `2.0`, creator OS to UNIX, version-made-by to `3.0`, external attributes to regular file mode `0644` (`0x81a40000`), and internal attributes to zero
6. contain no encryption, data descriptors, ZIP64, extra fields, archive/file comments, directory entries, symlinks, duplicate entries, local/central-name disagreement, path traversal, absolute paths, backslashes, or case-fold collisions
7. use CRC-32 and size fields that agree in local and central records; central-directory order MUST equal local-entry order
8. enforce the controlled-pilot policy: at most 32 entries, 16 MiB per entry, 64 MiB total uncompressed bytes, 128 UTF-8 bytes per path, and no multi-disk archive

Method `STORE` deliberately trades compression for a small, auditable deterministic profile during the one-month pilot. Any future compression profile is a normative schema change requiring a version increment, golden ZIP fixtures, and the full approval matrix.

Shadow-mode filename:

```text
NFP-factory-packet-<jobRunId>-<packetContentHex-first12>.zip
```

`packetContentHex-first12` means the first 12 lowercase hexadecimal characters **after** the literal `sha256:` prefix; the colon is never part of the filename. The exact shadow-mode regular expression is:

```text
^NFP-factory-packet-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[0-9a-f]{12}\.zip$
```

The source filename is a required verifier input while shadow mode is active, but remains a UX/policy warning rather than a hashing or signature input. A verifier that did not receive the source filename MUST fail closed with `PKT_FILENAME_INVALID`.

## 7. Canonical byte rules

1. Every JSON file MUST be UTF-8 without BOM and serialized using RFC 8785 JSON Canonicalization Scheme (JCS)
2. Every v2 JSON schema MUST set `additionalProperties: false`; parsers MUST reject duplicate keys before object construction and reject `NaN`, infinities, negative zero, unsafe integers, and unknown fields
3. Canonical manufacturing dimensions use signed integer micrometres in fields suffixed `Um`. Source decimal millimetres MUST be parsed as decimal text with at most three fractional digits and converted exactly (`1.234 mm` → `1234 Um`); extra precision, exponent notation, binary-floating rounding, and silent truncation are rejected
4. Text files MUST be UTF-8, LF (`0x0a`) only, without BOM or CR (`0x0d`)
5. Binary files are hashed over raw bytes
6. SHA-256 hex is 64 lowercase characters; identity fields use `sha256:<64-lowercase-hex>`
7. `sizeBytes` is the actual raw-byte count, not character count
8. Canonical paths use `/`, Unicode NFC, case sensitivity, and unsigned UTF-8 byte lexicographic order; `.`, `..`, empty segments, leading `/`, backslashes, control characters, duplicates, and case-fold collisions are forbidden
9. Every array has an approved schema-level `x-monolith-orderBy` rule. The builder MUST sort by that rule before JCS; a missing ordering rule is `PKT_SCHEMA_UNSUPPORTED`. Set-like arrays reject duplicate canonical keys
10. Canonical RFC 3339 timestamps use exactly `YYYY-MM-DDTHH:mm:ss.sssZ`; UUIDs use lowercase RFC 4122 canonical text; semantic versions use SemVer 2.0.0 without a leading `v`

The v2 schema registry is closed and allowlisted. At minimum it contains the following IDs; replacing or silently mutating a schema under an existing ID is forbidden:

| File/object | Schema ID | Canonical array policy owner |
| --- | --- | --- |
| `manifest.json` | `monolith.factory.packet@2.0` | Tech Lead |
| `attestation.json` | `monolith.factory.packet-attestation@1.0` | Tech Lead + Security Owner |
| `connector-ops.json` | `monolith.factory.connector-ops@2.0` | Tech Lead + Factory Owner |
| `connectors.minifix.json` | `monolith.factory.connectors-minifix@2.0` | Factory Owner |
| `cutlist.json` | `monolith.factory.cutlist@2.0` | Factory Owner |
| `drillmap.json` | `monolith.factory.drillmap@2.0` | Factory Owner |
| `gate-result.json` | `monolith.factory.gate-result@2.0` | Tech Lead |
| `NOT_FOR_PRODUCTION.txt` | `monolith.factory.nfp-marker@1.0` | Tech Lead + Factory Owner |
| machine-profile descriptor | `monolith.machine-profile@1.0` | Factory Owner + Security Owner |

The candidate normative schema bundle submitted for approval is committed under `docs/specs/schemas/`. It contains ten Draft 2020-12 schemas: shared closed definitions, both control-file schemas, five JSON payload schemas, the machine-profile descriptor, and the NFP marker byte contract. `schema-bundle.sha256` lists every schema in unsigned UTF-8 byte path order. `schema-bundle.aggregate.sha256` binds the exact bytes of that list; its current v0.4 aggregate is `sha256:aed32029309278053aec251b5eaef1468d1921f42f81ee6755cd76a4e8d62f55`.

After the approval matrix is signed, that exact aggregate becomes a verifier-policy input. Any schema change requires a new bundle aggregate and normative specification version; replacing or silently mutating a schema under an existing ID is forbidden. If any required payload schema or `x-monolith-orderBy` rule is absent, S17-3 cannot be approved and S17-4 must not guess it.

`x-monolith-orderBy` is normative. Keys are compared as unsigned UTF-8 bytes unless an explicit enum rank is named. Nested keys are applied left-to-right; `$value` means the scalar item. Duplicate canonical keys are rejected. Gate parameters use a sorted array of closed typed `{key,type,value}` records rather than an open object, so parameter ownership and ordering remain schema-defined.

The machine-profile digest input has this closed top-level shape; `parameters` is a closed, version-specific object approved by the Factory Owner:

```json
{
  "schema": "monolith.machine-profile@1.0",
  "id": "kdt_mvp_v1",
  "version": "1.0.0",
  "units": "um",
  "parameters": {
    "bedWidthUm": 1220000,
    "bedLengthUm": 2440000,
    "maxPanelThicknessUm": 50000,
    "minBoreDiameterUm": 3000,
    "maxBoreDiameterUm": 35000,
    "supportedFaces": ["A", "B", "TOP", "BOTTOM", "LEFT", "RIGHT"]
  }
}
```

## 8. Per-file manifest format

`manifest.json` uses schema identifier `monolith.factory.packet@2.0` and has exactly this top-level shape. Every shown field is required, every nested object is closed, and additional properties are forbidden:

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

Requirements:

- `releasedRevision.state` is the literal `RELEASED`; no other state may produce a packet
- `machineProfile.version` is separate from `id` even when the ID includes “v1”; its digest is `SHA256(UTF8("MONOLITH_MACHINE_PROFILE_V1\n") || UTF8(JCS(profileDescriptor)))`, where `profileDescriptor` is the full `monolith.machine-profile@1.0` object without any digest field
- `exporter.buildCommit` binds source revision and `artifactSha256` binds the exact deployed exporter artifact; version alone is insufficient
- `contentSchema` is REQUIRED for every JSON payload; `NOT_FOR_PRODUCTION.txt` uses `monolith.factory.nfp-marker@1.0`
- `files` is in canonical path order with no duplicate path and exactly covers every ZIP payload except the two control files
- `createdAt`, `jobRunId`, actor, signature, and wall-clock fields are forbidden in the manifest because they break content determinism

### 8.1 Normative ownership and validation registry

| Field/bytes | Authoritative source | Validation rule |
| --- | --- | --- |
| `releasedRevision.projectId/revisionId/state` | Track A authenticated-server contract | server lookup; exact project; literal `RELEASED`; fail closed when unavailable |
| `machineProfile.id/version` | Factory Owner approved registry | exact allowlisted pair |
| `machineProfile.sha256` | canonical profile descriptor | domain-separated digest above; registry digest must match |
| `exporter.id/version/buildCommit/artifactSha256` | trusted build pipeline + S17-4 service | exact allowlisted build and artifact digest |
| `files[].path/mediaType/contentSchema/sizeBytes/sha256` | deterministic S17-4 builder | canonical path/schema, raw byte count, raw-byte SHA-256 |
| `packetContentId` | deterministic S17-4 builder | recompute from the full descriptor with only this field omitted |
| `actorSubjectId/authorizationContextId` | Track A authenticated-server contract | opaque server-derived IDs; client values rejected |
| `jobRunId/idempotencyFingerprint` | S17-4 transactional run service | UUID v4 and one-to-one run/content binding |
| `issuedAt` | S17-4 trusted server clock | exact millisecond UTC format; within verifier-policy skew |
| signature protected header/key state | Security Owner trusted registry | protected preimage, approved AWS KMS ECDSA P-256 key, canonical raw `r‖s` plus low-S rules, and lifecycle rules in §10.2 |

### 8.2 Calculating `packetContentId`

1. Parse and validate a manifest draft with no `packetContentId` field
2. Sort and validate `files` and all identity fields against the schema
3. Set `contentDescriptor` to the full manifest object with **only `packetContentId` omitted**
4. Set `descriptorBytes = UTF8(JCS(contentDescriptor))`
5. Set `packetContentId = "sha256:" + lowercaseHex(SHA256(descriptorBytes))`
6. Restore the field and serialize `manifest.json` with JCS

Path, size, and hash are part of the preimage. This prevents file-renaming attacks that v1's hash-of-sorted-hashes `contentHash` cannot detect.

## 9. Server-owned `jobRunId`

Ownership is fixed by CT-DEC-003: Track A owns `actorSubjectId`, authorization context, and the RELEASED-only contract; **S17-4 owns transactional `jobRunId` allocation**.

1. S17-4 MUST first call the Track A contract and require authentication/authorization, RELEASED state, and machine-profile authorization
2. S17-4 builds and validates the canonical content descriptor, computes `packetContentId`, and computes `idempotencyFingerprint = "sha256:" + SHA256(UTF8("MONOLITH_EXPORT_REQUEST_V1\n") || UTF8(JCS(canonicalAuthorizedRequest)))`
3. In one durable transaction, S17-4 allocates `jobRunId`, binds it to `packetContentId`, the idempotency key/fingerprint, actor, revision, profile, and run state, then proceeds to attestation
4. The ID format is a lowercase RFC 4122 UUID v4 canonical string
5. A client-supplied `jobRunId`, actor, authorization context, or fingerprint MUST be rejected, never trusted
6. One accepted export attempt has one `jobRunId`; an explicit rebuild receives a new ID even if `packetContentId` is unchanged
7. A retry with the same idempotency key and fingerprint returns the same accepted record and `jobRunId`; reuse of the key with a different fingerprint fails `PKT_IDEMPOTENCY_CONFLICT`
8. Persistent storage MUST NOT bind one `jobRunId` to more than one `packetContentId`; transaction failure cannot release an ID for reuse

## 10. Signed attestation and identity

`attestation.json` is a run-specific control file with exactly this top-level shape. Every shown field is required, every nested object is closed, and additional properties are forbidden:

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
      "algorithm": "ECDSA_P256_SHA256",
      "keyId": "<trusted-registry-key-id>",
      "registryVersion": "<trusted-registry-version>"
    },
    "valueBase64": "<canonical-base64-signature>"
  }
}
```

Signed identity binds at minimum `jobRunId`, `packetContentId`, exact manifest digest, released revision, machine-profile ID+version+digest, exporter ID+version+build commit+artifact digest, packet schema, gate result/policy/evidence digest, issued time, server-derived actor/authorization context, idempotency fingerprint, and the protected signature header.

### 10.1 Signature preimage

1. Create `unsignedAttestation` by retaining `signature.protected` and omitting **only** `signature.valueBase64`
2. Set `message = UTF8("MONOLITH_FACTORY_PACKET_ATTESTATION_V1\n") || UTF8(JCS(unsignedAttestation))`
3. Compute `messageDigest = SHA256(message)` and call AWS KMS `Sign` with `KeySpec = ECC_NIST_P256`, `SigningAlgorithm = ECDSA_SHA_256`, and `MessageType = DIGEST`. The digest passed to KMS is exactly the 32-byte `messageDigest`; it MUST NOT be hashed a second time by the caller.
4. AWS KMS returns a variable-length ASN.1 DER ECDSA signature. The signer adapter MUST strictly parse that DER into positive integers `r` and `s`, require `1 <= r < n` and `1 <= s < n`, and normalize `s` to `min(s, n-s)` before packet serialization, where the P-256 order is `n = FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551`.
5. `valueBase64` MUST encode the canonical IEEE P1363 raw form `r‖s`: unsigned big-endian `r` left-padded to exactly 32 bytes followed by unsigned big-endian `s` left-padded to exactly 32 bytes. The result is exactly 64 bytes and is encoded as padded RFC 4648 standard Base64: exactly 88 characters ending `==`, with no whitespace. A verifier MUST use strict decoding and require that re-encoding the 64 decoded bytes produces the exact original string, thereby rejecting non-zero padding bits. DER, variable-length integers, Base64url, and alternate encodings are forbidden in the packet.
6. Low-S is mandatory. The serialized `s` MUST satisfy `1 <= s <= n/2`, with `floor(n/2) = 7FFFFFFF800000007FFFFFFFFFFFFFFFDE737D56D38BCF4279DCE5617E3192A8`. A verifier MUST reject a high-S twin, even when the mathematical ECDSA equation succeeds, with `PKT_SIGNATURE_INVALID`; it MUST NOT normalize attacker-controlled packet bytes before deciding validity.
7. `keyId` and `registryVersion` select a record from the verifier's trusted registry; a packet-embedded key or registry must never establish its own trust.

ECDSA signing is intentionally non-deterministic because each signing operation may use a different nonce `k`. Therefore `signature.valueBase64` is run-specific and belongs to the §4.1 run allowlist; it is not an input to `packetContentId`. Two accepted runs over identical canonical content MUST retain identical payload bytes, `manifest.json`, and `packetContentId`, while their signatures MAY differ. The verifier verifies the supplied canonical low-S signature over the preimage; it MUST NOT recompute or compare against a newly generated signature.

Changing the algorithm, key ID, registry version, or any identity field after signing MUST invalidate the signature.

### 10.2 Trusted-key lifecycle and revocation

Each trusted-registry record contains canonical `keyId`; `algorithm = ECDSA_P256_SHA256`; the AWS KMS key ARN and key spec `ECC_NIST_P256`; the public key as padded RFC 4648 Base64 of the exact DER SubjectPublicKeyInfo returned by KMS `GetPublicKey`; `notBefore`; `notAfter`; state (`ACTIVE`, `RETIRED`, or `REVOKED`); optional `retiredAt/revokedAt`; reason; and a monotonically increasing signed registry version. The SPKI MUST use `id-ecPublicKey` with `prime256v1`/`secp256r1`, and its BIT STRING MUST contain exactly the 65-byte uncompressed point `0x04‖X‖Y` with 32-byte unsigned big-endian coordinates. Compressed points, bare points as the registry storage form, PEM text, non-canonical DER, and other curves are forbidden. Verifier policy pins the minimum accepted registry version/digest; packet content cannot roll it back.

- `issuedAt` MUST satisfy `notBefore <= issuedAt < notAfter`
- `ACTIVE` is accepted only under an approved current registry
- `RETIRED` is accepted only when `issuedAt < retiredAt` and verifier policy explicitly permits historical verification
- `REVOKED` always fails `PKT_KEY_REVOKED`, including signatures predating `revokedAt`
- unknown, not-yet-valid, and expired keys return their dedicated stable codes
- registry/revision/profile/gate authoritative lookup failure returns `PKT_AUTHORITY_UNAVAILABLE`; stale or packet-supplied trust data cannot produce PASS

S17-6 owns custody, provisioning, rotation ceremony, and evidence. These lifecycle semantics are already normative for S17-5 and cannot be deferred to implementation guesswork.

## 11. Shadow mode / NOT-FOR-PRODUCTION contract

Until all four real-cut gate conditions pass:

1. `NOT_FOR_PRODUCTION.txt` MUST exist and appear in `manifest.files`
2. its bytes MUST match the exporter-version constant from `src/core/config/shadowMode.ts`: 824 UTF-8 bytes, LF only, no trailing LF, SHA-256 `40a4d63fccde43c92e2f9ca3a0284db61254cd5b03d5eac072f33b2dc507d68a`
3. the ZIP filename MUST start with `NFP-`
4. the verifier may return `integrityStatus = VERIFIED`, but MUST return `operationalDisposition = NO_CUT` and code `PKT_OK_SHADOW_ONLY`
5. the marker is a manifest-listed payload, not a control file: a missing marker fails at verifier check 3 with `PKT_FILE_MISSING`; a present marker with wrong bytes fails at check 4 with `PKT_SIZE_MISMATCH` or `PKT_HASH_MISMATCH`; a missing/invalid `NFP-` source filename fails before packet parsing with `PKT_FILENAME_INVALID`; `PKT_NFP_POLICY_MISMATCH` is reserved for check 11 when a complete marker+prefix conflicts with the authoritative governance mode
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
2. **Strict parse**: UTF-8/JCS/schema-bundle digest, duplicate-key rejection before object construction, exact supported versions
3. **Exact file set**: every manifest-listed payload, including `NOT_FOR_PRODUCTION.txt` in shadow mode, exists exactly once; no missing/extra files are permitted beyond the two specified control files `manifest.json` and `attestation.json`; a missing marker therefore returns `PKT_FILE_MISSING` here
4. **Byte integrity**: per-file `sizeBytes` and SHA-256
5. **Content identity**: recompute `packetContentId` from the descriptor
6. **Manifest binding**: recompute exact `manifestSha256`
7. **Identity consistency**: revision/profile/exporter/schema/packet ID, authorization context, and gate fields match across attestation, manifest, and gate evidence
8. **Signature**: protected `ECDSA_P256_SHA256` algorithm/key/registry lookup, SPKI P-256 validation, exact raw `r‖s` decoding, scalar-range and low-S rejection, lifecycle state, then ECDSA verification over the SHA-256 digest; never recompute a signature
9. **Authoritative checks**: revision remains RELEASED, project matches, profile/version/digest is authorized, exporter build+artifact is allowlisted, registry is current, and gate evidence is PASS under a supported policy
10. **Run/replay checks**: `jobRunId` does not collide with other content and idempotency/replay policy passes
11. **Shadow policy**: marker+prefix agree with governance state; NFP always produces NO_CUT
12. **Audit result**: append verifier version, policy versions, checked hashes, result code, time, and human/operator context without overwriting prior evidence

The verifier MUST NOT “warn and pass” when schema/key/state is unknown, a required state lookup fails, or evidence is missing.

The primary result code is the first failed check in the numbered order. The audit record MAY include later diagnostic findings, but they cannot replace or downgrade the primary stable code. A successful result has three separate fields:

```json
{
  "integrityStatus": "VERIFIED",
  "operationalDisposition": "NO_CUT",
  "code": "PKT_OK_SHADOW_ONLY"
}
```

During shadow mode this is the highest possible result. `PKT_OK` is reserved and MUST NOT be emitted until a later governance-controlled production profile passes the full four-condition real-cut gate and a normative version update.

## 13. Minimum stable result codes

| Code | Meaning | `integrityStatus` | `operationalDisposition` |
| --- | --- | --- | --- |
| `PKT_OK_SHADOW_ONLY` | integrity/signature pass while NFP remains mandatory | `VERIFIED` | `NO_CUT` |
| `PKT_OK` | reserved; forbidden during shadow mode | NOT EMITTABLE IN v0.4 PILOT | NOT EMITTABLE IN v0.4 PILOT |
| `PKT_LIMIT_EXCEEDED` | container exceeds policy | `FAILED` | `NO_CUT` |
| all other failure codes below | retain their stable code-specific meaning | `FAILED` | `NO_CUT` |

Failure-code meanings:

| Code | Meaning |
| --- | --- |
| `PKT_ZIP_PROFILE_INVALID` | ZIP header/metadata/profile differs from §6 |
| `PKT_PATH_INVALID` | path traversal/duplicate/collision |
| `PKT_FILENAME_INVALID` | required shadow source filename is missing or malformed |
| `PKT_SCHEMA_UNSUPPORTED` | unsupported schema/version/bundle digest |
| `PKT_JSON_NON_CANONICAL` | JSON violates canonical rules |
| `PKT_ATTESTATION_INVALID` | attestation shape/time/Base64 is malformed |
| `PKT_FILE_MISSING` / `PKT_FILE_EXTRA` | manifest-listed payload set mismatch, including a missing NFP marker |
| `PKT_SIZE_MISMATCH` / `PKT_HASH_MISMATCH` | payload bytes mismatch manifest, including modified NFP marker bytes |
| `PKT_CONTENT_ID_MISMATCH` | recomputed content ID differs |
| `PKT_MANIFEST_BINDING_MISMATCH` | attestation does not bind exact manifest |
| `PKT_IDENTITY_MISMATCH` | duplicated identity fields disagree |
| `PKT_SIGNATURE_MISSING` / `PKT_SIGNATURE_INVALID` | signature absent/invalid |
| `PKT_KEY_UNKNOWN` / `PKT_KEY_REVOKED` | trust key unusable |
| `PKT_KEY_NOT_YET_VALID` / `PKT_KEY_EXPIRED` | key lifecycle window rejects `issuedAt` |
| `PKT_AUTHORITY_UNAVAILABLE` | required registry/revision/profile/gate lookup unavailable |
| `PKT_REVISION_NOT_RELEASED` | revision is not RELEASED |
| `PKT_MACHINE_PROFILE_MISMATCH` | profile/version/digest unauthorized |
| `PKT_EXPORTER_UNTRUSTED` | exporter build not allowlisted |
| `PKT_GATE_FAILED` | gate evidence not PASS/unsupported |
| `PKT_GATE_EVIDENCE_MISMATCH` | gate file and signed gate fields disagree |
| `PKT_JOB_RUN_CONFLICT` | run ID bound to other content or replay violates policy |
| `PKT_IDEMPOTENCY_CONFLICT` | one idempotency key is reused with a different fingerprint |
| `PKT_NFP_POLICY_MISMATCH` | complete marker+prefix conflicts with authoritative governance mode at check 11 |

UI messages may be localized, but stable codes and severity must not change by locale.

## 14. Minimum tamper corpus

S17-5 requires at least these negative fixtures:

1. mutate one payload byte
2. swap two filenames while preserving the old hash set
3. missing file, extra file, duplicate ZIP entry, and case-fold collision
4. path traversal, absolute path, backslash, symlink, ZIP bomb, local/central-name disagreement, data descriptor, ZIP64, extra field/comment, timestamp, flags, permissions, and compression-method mutation
5. incorrect size/hash/packetContentId/manifest digest, one field at a time
6. duplicate JSON key, non-canonical number/encoding/BOM/CRLF, excess millimetre precision, negative zero, unsafe integer, missing array-order rule, and randomized array order
7. mutate revision, profile ID/version/digest, exporter version/build commit/artifact digest, schema, actor, authorization context, or idempotency fingerprint after signing
8. missing signature, bit-flipped signature, changed protected algorithm/key ID/registry version, DER-in-packet encoding, short/long raw encoding, zero/out-of-range `r` or `s`, high-S twin, wrong curve/SPKI/point format, wrong key, unknown key, revoked/retired/expired/not-yet-valid key, registry rollback, and empty placeholder key
9. client-provided `jobRunId`, actor, or authorization context; malformed UUID; reuse with another packetContentId; transaction rollback/reuse; and idempotency conflict
10. DRAFT/FROZEN revision, gate FAIL, signed/file gate mismatch, unsupported gate policy, and unavailable authoritative lookup
11. remove/modify `NOT_FOR_PRODUCTION.txt`, remove `NFP-`, omit the source filename, include the literal `sha256:` colon in a filename, or attempt production use of an NFP packet
12. randomize order/timezone/locale for identical canonical inputs; payload+manifest+packetContentId remain identical
13. run the same content in two accepted runs; packetContentId remains equal, jobRunId differs, and only the run-specific allowlist differs

Each fixture identifies an expected stable code and proves that no failing case produces VERIFIED status.

## 15. As-built gap at the baseline

| Target contract | As-built at `9ac7cff3` | Status |
| --- | --- | --- |
| server-owned `jobRunId` | client builds `job-${Date.now()}-${random}` | GAP — S17-4, consuming Track A contract |
| path-aware `packetContentId` | `contentHash` hashes sorted file hashes only, not paths | GAP — rename ambiguity |
| deterministic manifest | contains `createdAt: new Date().toISOString()` | GAP — S17-4 |
| explicit machine profile/version/digest + released revision | absent from manifest v1 | GAP |
| exporter ID/version/build commit | only `toolVersion` exists | GAP |
| mandatory signed attestation | signature is optional and full trust path is unenforced | GAP — S17-5/S17-6 |
| full verifier | client checks some file/hash/contentHash/gate properties; prior server evidence is shallow | GAP — S17-5 |
| NFP marker/file prefix | `NOT_FOR_PRODUCTION.txt` + `NFP-` exist | PRESENT — preserve |
| deterministic ZIP | browser JSZip uses runtime metadata and timestamped filename | GAP — S17-4 |
| deterministic gate evidence | `gate-result.json` includes `runAt` and human `message` | GAP — S17-4; separate content/run planes |
| canonical byte ordering | builder/gate sorting uses `localeCompare()` | GAP — S17-4; replace with unsigned UTF-8 byte ordering |
| exact quantity normalization | serializer uses floating-point `Math.round()` | GAP — S17-4; replace with exact decimal-to-`Um` conversion |

This table is a code-review finding, not P0 closure.

## 16. S17-3 acceptance criteria

S17-3 may close only when:

1. aligned TH/EN Markdown and HTML editions plus SHA-256 manifest are in the repository
2. Tech Lead, Factory Owner, and Security Owner separately record APPROVED
3. every normative field has an owner, source, and validation rule and the approved schema bundle/digest exists
4. packetContentId/jobRunId/signed identity have no circular hash or run/content ambiguity
5. per-file format, canonical bytes, ZIP byte profile, NFP policy, verifier order/result codes, and tamper corpus are approved
6. an implementation mapping exists for S17-4 and an independent-verifier assignment exists for S17-5, with no builder self-approval
7. any normative change after approval increments a version and repeats the approval matrix

Until all seven are satisfied, status remains DRAFT and Track B implementation remains locked.

## 17. Open approval questions

1. Does the Factory Owner approve the required payload set, schema registry/order keys, controlled-pilot ZIP limits, and the `kdt_mvp_v1` ID/version/profile-digest contract?
2. Does the Tech Lead approve JCS + exact integer-micrometre normalization, method-0 ZIP profile, UUID v4/idempotency transaction semantics, and S17-4 run ownership?
3. Does the Security Owner approve the protected `ECDSA_P256_SHA256` header, AWS KMS `ECDSA_SHA_256` digest-mode call, canonical raw `r‖s` low-S contract, SPKI P-256 registry format, minimum registry version/digest, fail-closed lookup, and revocation behavior?
4. Do all three roles accept the determinism boundary: canonical payload is deterministic, while run-specific attestation may make outer ZIPs differ across runs?
5. Do all three roles approve reserving `PKT_OK` and limiting the shadow pilot to `PKT_OK_SHADOW_ONLY / NO_CUT`?

These questions must be resolved during approval review and must not be implemented by guesswork.

## 18. v0.2 independent-review remediation map

| Review blocker | v0.2 remediation |
| --- | --- |
| 1. algorithm/key ID were outside the signature | §10.1 retains `signature.protected` and omits only `valueBase64`; §14 adds protected-header tampering |
| 2. gate evidence mixed content/run planes | §4.2 defines deterministic gate evidence and moves time/operator/localized text to attestation/audit |
| 3. schemas/quantization/order were under-specified | §7 adds closed schema registry, exact decimal-to-integer-`Um`, array-order rules; §8.1 adds owner/source/validation registry |
| 4. filename/ZIP profile were ambiguous | §6 removes the `sha256:` colon ambiguity and freezes the method-0 ZIP byte profile and pilot limits |
| 5. key lifecycle/revocation were unresolved | §10.2 defines registry anti-rollback, validity, retirement, revocation, and unavailable-authority behavior |
| 6. fail-closed codes/operational status were incomplete | §§12–14 add precedence, missing codes, expanded tamper fixtures, and shadow-only maximum status |

This remediation map is a diff summary for re-review, not an approval or closure claim.

## 19. v0.3 adversarial re-review remediation map

| Re-review finding | v0.3 remediation |
| --- | --- |
| B1-01 — referenced schema bundle was absent | §7 now binds the ten-file closed schema bundle, per-file manifest, aggregate digest, typed gate parameters, and explicit array-order extensions under `docs/specs/schemas/` |
| B1-02 — missing NFP marker had contradictory primary codes | §§11–13 now define the marker as a manifest-listed payload: missing = `PKT_FILE_MISSING` at check 3; modified = size/hash failure at check 4; filename failure = `PKT_FILENAME_INVALID`; governance-mode conflict = `PKT_NFP_POLICY_MISMATCH` at check 11 |
| B2-01 — combined display vocabulary conflicted with result fields | §13 now separates exact `integrityStatus` and `operationalDisposition` field values from stable code meanings |
| B2-02 — symlink/output-alias/order negative tests were absent | `governance-tooling.test.mjs` now covers input symlink, output alias, manifest alias, and unsorted manifest rejection |
| B2-03 — manifest verifier accepted noncanonical order | `verify-sha256-manifest.mjs` now rejects entries not sorted by unsigned UTF-8 path bytes; the focused test suite reproduces the rejection |

This v0.3 map records advisory remediation only. CT-DEC-002 remains DRAFT, every approval field remains PENDING, Track B remains locked, and no real-cut authority is created.

## 20. v0.4 ADR-068 signature-layer amendment

v0.4 supersedes v0.3 at `bf25b10f2c72707097acdb03a8161e8cec8cd36b` solely for the signature layer. All v0.3 schema-bundle membership, NFP precedence, stable result codes, verifier order, tamper corpus, deterministic content rules, and tooling controls remain in force except where the ECDSA-specific additions above are stricter.

| ADR-068 decision | v0.4 binding amendment |
| --- | --- |
| AWS KMS cannot sign Ed25519 | algorithm is `ECDSA_P256_SHA256`; KMS key spec is `ECC_NIST_P256`; `Sign` uses `ECDSA_SHA_256` with the exact SHA-256 digest |
| DER output is variable length | packet encoding is fixed 64-byte IEEE P1363 raw `r‖s`, padded standard Base64 |
| ECDSA malleability | signer emits low-S; verifier rejects high-S with `PKT_SIGNATURE_INVALID` |
| randomized nonce `k` | signature is run-specific, excluded from `packetContentId`; verifier verifies and never recomputes |
| KMS public-key custody | trusted registry stores canonical DER SPKI whose BIT STRING is uncompressed `0x04‖X‖Y` on P-256 |

CT-DEC-002 remains **DRAFT**; Tech Lead, Factory Owner, and Security Owner remain **PENDING**; Track B remains **LOCKED**; shadow mode remains **NO_CUT**; and this amendment creates no implementation or production authority.
