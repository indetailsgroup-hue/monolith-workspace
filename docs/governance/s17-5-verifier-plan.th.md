# S17-5 Full Verifier — Implementation Plan (Claude, independent track)

**วันที่:** 17 ก.ค. 2026 · **Authority:** CT-DEC-002 v0.4.1 APPROVED (3-role sign-off) + กระดานงาน owner
**SoD:** Claude = S17-5 (อิสระจาก builder S17-3/4 = Codex ตาม checklist §5) · **ห้ามแชร์โค้ด/fixtures
กับฝั่ง S17-4** — สื่อสารกันผ่าน spec + schemas ที่ approve แล้วเท่านั้น (มติ owner ใน handoff 17 ก.ค.)
**คุณค่าของการแยก:** ถ้า generator (Codex) กับ verifier (ผม) สร้างจาก spec อย่างอิสระแล้ว
interoperate ได้ = พิสูจน์ว่า spec implementable-without-guessing จริง (TL-3 ที่เซ็นไว้)

## Base & timing

- แตก branch `s17/track-b-verifier` จาก **main หลัง PR #1 merge** (ADR-065: head ณ เวลาเปิด
  worktree) บน clean worktree ใหม่ — implementation เริ่มทันทีที่ owner กด merge
- วันนี้: แผนนี้ + การเตรียม (spec ครบในหัวแล้ว: §4.1, §7, §10, §10.2, §12, §13, §14)

## สถาปัตยกรรม

Pure TypeScript module, **zero dependency บน server/factory/generator code** — input = ZIP bytes
+ injected interfaces (trusted-key registry, authoritative lookups, policy) · output = ผล 3 field
(`integrityStatus` / `operationalDisposition` / `code`) + audit record (append-only)

องค์ประกอบที่ต้อง**เขียนเอง** (lib ทั่วไปผ่อนปรนเกิน spec):
1. **Strict ZIP reader** — §container ห้าม: non-method-0, ZIP64, data descriptor, duplicate/case-fold
   collision, local↔central mismatch, path traversal/absolute/backslash, เกิน size/count/ratio limits
   → ZIP lib ปกติ "ซ่อม" ของพวกนี้ให้เงียบๆ ซึ่งคือสิ่งที่ verifier ต้อง reject
2. **Strict JSON/JCS validator** — reject duplicate key ก่อนสร้าง object, NaN/Inf/-0/unsafe integer,
   non-canonical number/encoding/BOM/CRLF + ตรวจ serialize-roundtrip ตรง RFC 8785
3. **Signature verify (WebCrypto)** — import pinned DER SPKI (ตรวจ id-ecPublicKey+prime256v1+
   uncompressed 65B เอง), strict Base64 decode + re-encode-identical check, ตรวจ 1≤r,s<n +
   **low-S ≤ floor(n/2)** ก่อน ECDSA verify บน SHA-256 digest — **ไม่มี KMS dependency**
   (verify ใช้ public key เท่านั้น → ไม่ block โดย key ceremony S17-6; คีย์ทดสอบ = P-256 ที่สร้าง
   ในเทสต์เอง ไม่ใช่คีย์จริง)

## Check ladder — implement ตรง §12 ทั้ง 12 ขั้น first-fail-wins

| # | Check | Stable codes หลัก (§13) |
|---|---|---|
| 1 | Container safety | PKT_CONTAINER_* / PKT_FILENAME_INVALID (NFP prefix ก่อน parse) |
| 2 | Strict parse (UTF-8/JCS/schema digest/versions) | PKT_SCHEMA_UNSUPPORTED ฯลฯ |
| 3 | Exact file set (รวม NFP marker — หาย = ที่นี่) | PKT_FILE_MISSING / extra |
| 4 | Byte integrity (sizeBytes + SHA-256 ต่อไฟล์) | PKT_SIZE_MISMATCH / PKT_HASH_MISMATCH |
| 5 | Content identity (recompute packetContentId) | PKT_CONTENT_ID_MISMATCH |
| 6 | Manifest binding (recompute manifestSha256) | PKT_MANIFEST_MISMATCH |
| 7 | Identity consistency (attestation↔manifest↔gate) | PKT_IDENTITY_MISMATCH |
| 8 | Signature (SPKI/low-S/lifecycle → ECDSA verify; ห้าม recompute) | PKT_SIGNATURE_INVALID / PKT_KEY_* |
| 9 | Authoritative (RELEASED, profile allowlist, exporter, registry, gate PASS) | PKT_REVISION_NOT_RELEASED / PKT_MACHINE_PROFILE_MISMATCH / PKT_GATE_FAILED / PKT_AUTHORITY_UNAVAILABLE |
| 10 | Run/replay (jobRunId ไม่ชน, idempotency) | PKT_RUN_* |
| 11 | Shadow policy (marker+prefix ↔ governance mode) | PKT_NFP_POLICY_MISMATCH |
| 12 | Audit result (verifier/policy versions, ไม่เขียนทับ) | — |

กติกาเหล็กจาก spec: ห้าม "warn แล้วผ่าน" · lookup ล้ม = `PKT_AUTHORITY_UNAVAILABLE` →
FAIL/NO_CUT · shadow mode ผลสูงสุด = `{VERIFIED, NO_CUT, PKT_OK_SHADOW_ONLY}` ·
**`PKT_OK` เป็น reserved — ไม่มีทาง emit ในเวอร์ชันนี้โดย construction** (ไม่ใช่โดย config)

## Tamper corpus (§14 — 6 กลุ่ม / 22+ families)

ผมสร้าง fixtures **เองทั้งหมดจาก spec** (ห้ามใช้ output ของ S17-4): reference-packet test builder
ภายใน test harness (เป็น test tooling ไม่ใช่ production generator — คนละบทบาทกับ S17-4) แล้ว
mutate ตามทุก family: byte-flip / ZIP structure ครบชุด / JCS violations / identity-field ผิดทีละตัว /
signature (DER-in-place, high-S twin, out-of-range, wrong key) / key states (UNKNOWN, REVOKED,
EXPIRED, NOT_YET_VALID — ปิดช่องที่ผม flag ไว้ใน review pack §D) — ทุก fixture ต้อง fail ด้วย
**code ที่ถูกต้องและขั้นที่ถูกต้อง** (first-fail-wins ทดสอบด้วย multi-defect packets)

## Verification gates (มาตรฐาน no-vacuous ของ repo)

- Vitest suite: positive (shadow-valid packet → PKT_OK_SHADOW_ONLY เป๊ะ) + corpus ทุกตัว
  พร้อม expected code + ladder-order tests + property test (random mutation ≠ PASS)
- CI workflow แยก (SHA-pinned, กัน vacuous: นับ fixtures ขั้นต่ำ + expected-code assert)
- Determinism ของ verifier เอง: ผล verify ซ้ำ = byte-identical audit record (ยกเว้น timestamp field)

## ไม่อยู่ใน scope S17-5

คีย์จริง/KMS (S17-6 human) · การ generate packet จริง (S17-4/Codex) · การปลด NO_CUT
(real-cut gate 4 เงื่อนไข) · prod deployment (ADR-066 human-driven)
