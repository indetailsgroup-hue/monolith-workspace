# CT-DEC-002 / S17-3 — Human Role Sign-Off Checklist

**Spec**: Canonical Factory Packet Specification v0.3
**Commit ที่เซ็น**: `bf25b10f2c72707097acdb03a8161e8cec8cd36b` (branch `governance/s17-control-pack`)
**Aggregate schema digest**: `sha256:9d83834a115ce2d0b3f56537a1ee4baab5c689bc62bbbd99ec53717fc80868eb`
**Independent re-review verdict**: READY FOR HUMAN ROLE REVIEW (advisory, non-authoritative)

> การเซ็น = การรับผิดชอบของมนุษย์ว่าได้ review เองแล้ว ไม่ใช่การรับ AI verdict มาแปะ · AI ไม่ลงชื่อแทน · เมื่อครบสามลายเซ็น CT-DEC-002 = APPROVED และปลด Track B (S17-4/5)
> คงบังคับจนกว่าจะครบสาม: DRAFT · Track B LOCKED · NO_CUT · ไม่มี P0 closure · ไม่มี bare PKT_OK ใน shadow mode

## 0. Pre-Sign (ทุกบทบาททำก่อน)

- [ ] ยืนยันกำลัง review commit `bf25b10f` (ไม่ใช่ working tree หรือ commit อื่น)
- [ ] verify aggregate schema digest ตรง `9d83834a...` ด้วยเครื่องมืออิสระ (ไม่เชื่อเพราะ manifest มี)
- [ ] อ่าน independent re-review ครบ + เข้าใจว่า READY != approval

## 1. Tech Lead — Contract Correctness & Implementability

- [ ] Schema bundle ครบ: 10 schemas, ทุก array มี `x-monolith-orderBy`, ทุก object `additionalProperties:false`, aggregate digest bound
- [ ] Identity model: `packetContentId` (hash canonical content) / `jobRunId` (server-owned, ไม่อยู่ใน content hash) / signed identity รวม released revision + machine-profile ver + exporter ver + schema ver — ไม่ collide
- [ ] Determinism implementable โดยไม่เดา: JCS, integer micrometre, UTF-8 byte ordering, ZIP byte profile กำหนดครบ (S17-4 build ได้โดยไม่ต้องตีความ)
- [ ] Verifier check order (S12) + result codes (S13) deterministic (NFP-missing -> `PKT_FILE_MISSING` ชัด, first-fail-wins)
- [ ] ยืนยัน S17-4/S17-5 มี contract พอเริ่ม implement (หลังเซ็นครบ)

## 2. Factory Owner — Factory Operability & Safety

- [ ] NFP/NO_CUT บังคับ: shadow mode ตัดจริงไม่ได้ · ผลสูงสุด `PKT_OK_SHADOW_ONLY / VERIFIED_SHADOW_ONLY / NO_CUT` · `PKT_OK` เปล่า emit ไม่ได้
- [ ] Machine profile binding: id + version + digest (profile ปลอมไม่ผ่าน -> `PKT_MACHINE_PROFILE_MISMATCH`)
- [ ] Verifier fail-closed: packet เสีย/lookup ล่ม -> ไม่ถึงเครื่อง (`PKT_AUTHORITY_UNAVAILABLE` -> FAIL/NO_CUT, ไม่ "warn and pass")
- [ ] Exporter allowlist + gate evidence binding (gate ไม่ PASS -> `PKT_GATE_FAILED`)
- [ ] machine profile `kdt_mvp_v1` ตรงเครื่อง+controller จริง (ยืนยันจากโรงงาน)

## 3. Security Owner — Signature / Trust / Key

> **BLOCKING ก่อนเซ็น (ADR-067, 14 ก.ค.)**: spec บังคับ **Ed25519** signing แต่ **AWS KMS (custody ที่เลือก) ไม่รองรับ Ed25519** (รองรับแค่ RSA / ECC_NIST_P256/384/521 / secp256k1) — **เข้ากันไม่ได้** ต้องเคาะก่อนเซ็น: (ก) เปลี่ยน spec เป็น ECDSA P-256 · (ข) ใช้ HSM/KMS อื่นที่รองรับ Ed25519 · (ค) KMS ปกป้อง key + sign Ed25519 ใน enclave · **ห้ามเซ็นจนกว่า signature algorithm sign บน custody จริงได้**

- [ ] **Ed25519-vs-KMS reconciled**: signature algorithm ใน spec sign ได้จริงบน custody ที่เลือก (ดู BLOCKING ข้างบน) — ถ้าเปลี่ยนเป็น ECDSA P-256 ต้อง amend spec + regenerate manifests ก่อน
- [ ] Ed25519 signature: protected header (algorithm+keyId+registry) ถูก sign, omit เฉพาะ `valueBase64`, เปลี่ยน field ใด -> signature invalid
- [ ] Key lifecycle (S10.2): ACTIVE/RETIRED/REVOKED, `notBefore/notAfter`, anti-rollback, registry-unavailable = fail-closed
- [ ] Trusted-key registry: public key ใน packet ห้าม establish trust ตัวเอง (`PKT_KEY_UNKNOWN/REVOKED/EXPIRED`)
- [ ] Server-owned actor ผูกกับ S17-1 (JWT-derived ไม่ใช่ client header) — attestation ใช้ identity ที่ปลอมไม่ได้
- [ ] Tamper corpus (S14) ครอบพอ + custody model ตรง ADR-064/มติ custody (KMS/HSM non-exportable)

## 4. Signature Block

| บทบาท | ชื่อ | Commit ที่เซ็น | วันที่ | สถานะ |
| --- | --- | --- | --- | --- |
| Tech Lead | (คุณเดฟ) | `bf25b10f` | — | PENDING |
| Factory Owner | — | `bf25b10f` | — | PENDING |
| Security Owner | — | `bf25b10f` | — | PENDING |

## 5. Effect เมื่อครบสาม

- CT-DEC-002 = APPROVED
- ปลด Track B: S17-4 determinism + S17-5 verifier
- S17-5 ต้อง implement/review โดยผู้อิสระจาก S17-3/4 builder (SoD, ADR-065)
- คง NFP/NO_CUT จนกว่า real-cut gate สี่เงื่อนไขผ่าน (S17x5 + ADR-064 ครบ + dogfood >=1 + machine profile calibrated)

## 6. ข้อควรระวัง (advisory)

1. ถ้าผู้ถือหลายบทบาท (เช่น 2-of-2 pilot ceremony) ต้องลงชื่อแยกแต่ละบทบาทโดยเจตนา ไม่เซ็นรวบ
2. Security Owner ควรเซ็นทีหลังสุด: signature/key ผูกกับ S17-1 server-owned actor ที่ยัง staging-only (deploy prod จริงตอน pilot)
3. sign-off นี้ไม่ปิด P0, ไม่อนุญาต merge/prod-apply, ไม่อนุญาตตัดจริง — ปลดเฉพาะ Track B implementation

---

*Advisory checklist — human approval required. เอกสารนี้เป็น living document (signature block อัปเดตได้) จึงไม่มี frozen manifest; ตัว spec v0.3 ที่ถูกเซ็น = git-pinned ที่ `bf25b10f`.*
